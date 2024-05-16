from .logger import create_logger

from decimal import Decimal
from decimal import getcontext
from decimal import ROUND_HALF_DOWN

getcontext().prec = 100
getcontext().rounding = ROUND_HALF_DOWN

ZERO = Decimal('0')
ONE = Decimal('1')
TWO = Decimal('2')

def calculate_parameters(y: Decimal, pa: Decimal, pb: Decimal, pm: Decimal, n: Decimal) -> (Decimal, Decimal, Decimal, Decimal):
    H = pa.sqrt() ** n
    L = pb.sqrt() ** n
    M = pm.sqrt() ** n
    A = H - L
    B = L
    z = y * (H - L) / (M - L) if M > L else y
    w = z / (H * L)
    return A, B, z, w

def calculate_hodl_value(carbon: dict, market_price: Decimal) -> Decimal:
    CASH = carbon['simulation_recorder']['CASH']['balance'][0]
    RISK = carbon['simulation_recorder']['RISK']['balance'][0] * market_price
    return CASH + RISK

def calculate_portfolio(carbon: dict, market_price: Decimal) -> (Decimal, Decimal, Decimal):
    CASH = carbon['simulation_recorder']['CASH']['balance'][-1]
    RISK = carbon['simulation_recorder']['RISK']['balance'][-1] * market_price
    return CASH, RISK, CASH + RISK

def calculate_portfolio_over_hodl(hodl_value: Decimal, portfolio_value: Decimal) -> Decimal:
    return 100 * (portfolio_value - hodl_value) / hodl_value

def get_trade_parameters(carbon: dict, order: str) -> (Decimal, Decimal, Decimal, Decimal):
    y = carbon['simulation_recorder'][order]['balance'][-1]
    z = carbon['curve_parameters'][order]['z']
    A = carbon['curve_parameters'][order]['A']
    B = carbon['curve_parameters'][order]['B']
    return y, z, A, B

def calculate_quote(carbon: dict, order: str, inverse_fee: Decimal) -> (Decimal, Decimal):
    y, z, A, B = get_trade_parameters(carbon, order)
    return inverse_fee * (A * y + B * z) ** TWO, z ** TWO

def calculate_quotes(carbon: dict) -> (Decimal, Decimal):
    inverse_fee = carbon['curve_parameters']['inverse_fee']
    bid_n, bid_d = calculate_quote(carbon, 'CASH', inverse_fee)
    ask_d, ask_n = calculate_quote(carbon, 'RISK', inverse_fee)
    return bid_n / bid_d, ask_n / ask_d

def calculate_dy(market_price: Decimal, unit_price: Decimal, inverse_fee: Decimal, y: Decimal, z: Decimal, A: Decimal, B: Decimal) -> Decimal:
    return z * ((market_price * inverse_fee).sqrt() - B * unit_price * inverse_fee) / (A * unit_price * inverse_fee) - y if A > ZERO else -y

def calculate_dx(dy: Decimal, y: Decimal, z: Decimal, A: Decimal, B: Decimal) -> Decimal:
    return -dy * z ** TWO / (A * dy * (A * y + B * z) + (A * y + B * z) ** TWO)

def apply_trade(carbon: dict, order_x: str, order_y: str, action: str, market_price: Decimal, unit_price: Decimal) -> dict:
    inverse_fee = carbon['curve_parameters']['inverse_fee']
    y, z, A, B = get_trade_parameters(carbon, order_y)
    dy = calculate_dy(market_price, unit_price, inverse_fee, y, z, A, B)
    out_of_range = {'before': dy < -y, 'after': y == ZERO}
    if dy < -y:
        dy = -y
    dx = calculate_dx(dy, y, z, A, B)
    carbon['simulation_recorder'][order_x]['balance'][-1] += dx
    carbon['simulation_recorder'][order_y]['balance'][-1] += dy
    carbon['simulation_recorder'][order_y]['fee'][-1] -= dy * (ONE - inverse_fee)
    if carbon['curve_parameters'][order_x]['z'] < carbon['simulation_recorder'][order_x]['balance'][-1]:
        carbon['curve_parameters'][order_x]['z'] = carbon['simulation_recorder'][order_x]['balance'][-1]
    return {'out_of_range': out_of_range, 'action': action, order_x: dx, order_y: -dy * inverse_fee}

def replicate_last_balance_and_fee(carbon: dict) -> None:
    for order, parameter in [(order, parameter) for order in ['CASH', 'RISK'] for parameter in ['balance', 'fee']]:
        carbon['simulation_recorder'][order][parameter].append(carbon['simulation_recorder'][order][parameter][-1])

def remove_first_balance_and_fee(carbon: dict) -> None:
    for order, parameter in [(order, parameter) for order in ['CASH', 'RISK'] for parameter in ['balance', 'fee']]:
        carbon['simulation_recorder'][order][parameter].pop(0)

def equilibrate_protocol(carbon: dict, market_price: Decimal, bid: Decimal, ask: Decimal) -> dict:
    if market_price > ask:
        return apply_trade(carbon, 'CASH', 'RISK', 'bought', market_price, market_price)
    if market_price < bid:
        return apply_trade(carbon, 'RISK', 'CASH', 'sold', market_price, ONE)
    return {}

def is_valid(config: dict) -> bool:
    class C: pass
    c = C()
    c.__dict__.update(config)
    return all([
        ZERO <= c.network_fee <= ONE,
        ZERO <= c.portfolio_cash_value,
        ZERO <= c.portfolio_risk_value,
        ZERO <  c.portfolio_cash_value + c.portfolio_risk_value,
        ZERO <  c.low_range_low_price  <= c.low_range_start_price  <= c.low_range_high_price,
        ZERO <  c.high_range_low_price <= c.high_range_start_price <= c.high_range_high_price,
        ZERO == c.portfolio_cash_value or c.low_range_low_price   == c.low_range_high_price or c.low_range_low_price   != c.low_range_start_price,
        ZERO == c.portfolio_risk_value or c.high_range_high_price == c.high_range_low_price or c.high_range_high_price != c.high_range_start_price,
        all(ZERO < price for price in c.prices)
    ])

def create_carbon(config: dict) -> dict:
    assert is_valid(config), 'invalid configuration'
    inverse_fee = ONE - config['network_fee']
    y_CASH = config['portfolio_cash_value']
    y_RISK = config['portfolio_risk_value']
    l_CASH, h_CASH, s_CASH = [config[f'low_range_{ param}_price'] for param in ['low', 'high', 'start']]
    l_RISK, h_RISK, s_RISK = [config[f'high_range_{param}_price'] for param in ['low', 'high', 'start']]
    A_CASH, B_CASH, z_CASH, w_CASH = calculate_parameters(y_CASH, h_CASH, l_CASH, s_CASH, +ONE)
    A_RISK, B_RISK, z_RISK, w_RISK = calculate_parameters(y_RISK, l_RISK, h_RISK, s_RISK, -ONE)
    if z_CASH == ZERO: z_CASH = w_RISK
    if z_RISK == ZERO: z_RISK = w_CASH
    return {
        'curve_parameters': {
            'CASH': {'A': A_CASH, 'B': B_CASH, 'z': z_CASH},
            'RISK': {'A': A_RISK, 'B': B_RISK, 'z': z_RISK},
            'inverse_fee': inverse_fee
        },
        'simulation_recorder': {
            'CASH': {'balance': [y_CASH], 'fee': [ZERO]},
            'RISK': {'balance': [y_RISK], 'fee': [ZERO]},
            'min_bid': l_CASH * inverse_fee,
            'max_bid': h_CASH * inverse_fee,
            'min_ask': l_RISK / inverse_fee,
            'max_ask': h_RISK / inverse_fee,
            'bid': [],
            'ask': [],
            'hodl_value': [],
            'portfolio_cash': [],
            'portfolio_risk': [],
            'portfolio_value': [],
            'portfolio_over_hodl': []
        }
    }

def execute(config_carbon: dict, config_logger: dict) -> dict:
    logger = create_logger(config_logger)
    carbon = create_carbon(config_carbon)
    bid, ask = calculate_quotes(carbon)
    for step, price in enumerate(config_carbon['prices']):
        logger.update_before(carbon['simulation_recorder'], step, price, bid, ask)
        replicate_last_balance_and_fee(carbon)
        details = equilibrate_protocol(carbon, price, bid, ask)
        bid, ask = calculate_quotes(carbon)
        hodl_value = calculate_hodl_value(carbon, price)
        portfolio_cash, portfolio_risk, portfolio_value = calculate_portfolio(carbon, price)
        portfolio_over_hodl = calculate_portfolio_over_hodl(hodl_value, portfolio_value)
        carbon['simulation_recorder']['bid'].append(bid)
        carbon['simulation_recorder']['ask'].append(ask)
        carbon['simulation_recorder']['hodl_value'].append(hodl_value)
        carbon['simulation_recorder']['portfolio_cash'].append(portfolio_cash)
        carbon['simulation_recorder']['portfolio_risk'].append(portfolio_risk)
        carbon['simulation_recorder']['portfolio_value'].append(portfolio_value)
        carbon['simulation_recorder']['portfolio_over_hodl'].append(portfolio_over_hodl)
        logger.update_after(carbon['simulation_recorder'], details, price, bid, ask)
    logger.close()
    remove_first_balance_and_fee(carbon)
    carbon['simulation_recorder']['curve_parameters'] = carbon['curve_parameters']
    return carbon['simulation_recorder']

def strToDec(obj: any) -> any:
    if type(obj) is str:
        return Decimal(obj)
    if type(obj) is list:
        return [strToDec(val) for val in obj]
    if type(obj) is dict:
        return {key: strToDec(val) for key, val in obj.items()}
    raise Exception(f'illegal type {type(obj).__name__}')

def decToStr(obj: any) -> any:
    if type(obj) is Decimal:
        return f'{obj:.18f}'.rstrip('0').rstrip('.')
    if type(obj) is list:
        return [decToStr(val) for val in obj]
    if type(obj) is dict:
        return {key: decToStr(val) for key, val in obj.items()}
    raise Exception(f'illegal type {type(obj).__name__}')

def run_simulation(config: dict) -> dict:
    config_carbon = {key: val for key, val in config.items() if key != 'logging'}
    config_logger = config['logging'] if 'logging' in config else {}
    return decToStr(execute(strToDec(config_carbon), config_logger))
