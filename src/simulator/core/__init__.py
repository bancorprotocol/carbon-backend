from .logger import create_logger

from decimal import Decimal
from decimal import getcontext
from decimal import ROUND_HALF_DOWN

getcontext().prec = 100
getcontext().rounding = ROUND_HALF_DOWN

ZERO = Decimal('0')
ONE = Decimal('1')
TWO = Decimal('2')

def calculate_constants(pa: Decimal, pb: Decimal) -> (Decimal, Decimal):
    pa_sqrt = pa.sqrt()
    pb_sqrt = pb.sqrt()
    A = pa_sqrt - pb_sqrt
    B = pb_sqrt
    return A, B

def calculate_z(y: Decimal, A: Decimal, B: Decimal, rate: Decimal) -> Decimal:
    if y * A > ZERO:
        return y * A / (rate.sqrt() - B)
    return ONE

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

def get_quote(carbon: dict) -> (Decimal, Decimal):
    inverse_fee = carbon['curve_parameters']['inverse_fee']
    y_CASH, z_CASH, A_CASH, B_CASH = get_trade_parameters(carbon, 'CASH')
    y_RISK, z_RISK, A_RISK, B_RISK = get_trade_parameters(carbon, 'RISK')
    bid = inverse_fee * (A_CASH * y_CASH + B_CASH * z_CASH) ** TWO / z_CASH ** TWO
    ask = z_RISK ** TWO / (inverse_fee * (A_RISK * y_RISK + B_RISK * z_RISK) ** TWO)
    return bid, ask

def get_arb_buy(market_price: Decimal, inverse_fee: Decimal, y: Decimal, z: Decimal, A: Decimal, B: Decimal) -> Decimal:
    temp = market_price * inverse_fee
    return z * (temp.sqrt() - B * temp) / (A * temp) - y

def get_arb_sell(market_price: Decimal, inverse_fee: Decimal, y: Decimal, z: Decimal, A: Decimal, B: Decimal) -> Decimal:
    temp = market_price * inverse_fee
    return z * (temp.sqrt() - B * inverse_fee) / (A * inverse_fee) - y

def calculate_dx(dy: Decimal, y: Decimal, z: Decimal, A: Decimal, B: Decimal) -> Decimal:
    return -dy * z ** TWO / (A * dy * (A * y + B * z) + (A * y + B * z) ** TWO)

def apply_trade(carbon: dict, order_x: str, order_y: str, action: str, market_price: Decimal, get_arb: any) -> dict:
    inverse_fee = carbon['curve_parameters']['inverse_fee']
    y, z, A, B = get_trade_parameters(carbon, order_y)
    dy = get_arb(market_price, inverse_fee, y, z, A, B) if A > ZERO else -y
    out_of_range = {'before': y + dy < 0, 'after': y == 0}
    if out_of_range['before']:
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
        return apply_trade(carbon, 'CASH', 'RISK', 'bought', market_price, get_arb_buy)
    if market_price < bid:
        return apply_trade(carbon, 'RISK', 'CASH', 'sold', market_price, get_arb_sell)
    return {}

def get_initial_state(config: dict) -> dict:
    inverse_fee = ONE - config['network_fee']
    y_CASH = config['portfolio_cash_value']
    y_RISK = config['portfolio_risk_value']
    A_CASH, B_CASH = calculate_constants(config['low_range_high_price'] / ONE, config['low_range_low_price'] / ONE)
    A_RISK, B_RISK = calculate_constants(ONE / config['high_range_low_price'], ONE / config['high_range_high_price'])
    z_CASH = calculate_z(y_CASH, A_CASH, B_CASH, config['low_range_start_price'] / ONE)
    z_RISK = calculate_z(y_RISK, A_RISK, B_RISK, ONE / config['high_range_start_price'])
    return {
        'curve_parameters': {
            'CASH': {
                'A' : A_CASH,
                'B' : B_CASH,
                'z' : z_CASH
            },
            'RISK': {
                'A' : A_RISK,
                'B' : B_RISK,
                'z' : z_RISK
            },
            'inverse_fee' : inverse_fee
        },
        'simulation_recorder': {
            'CASH': {
                'balance' : [y_CASH],
                'fee' : [ZERO]
            },
            'RISK': {
                'balance' : [y_RISK],
                'fee' : [ZERO]
            },
            'min_bid' : config['low_range_low_price'] * inverse_fee,
            'max_bid' : config['low_range_high_price'] * inverse_fee,
            'min_ask' : config['high_range_low_price'] / inverse_fee,
            'max_ask' : config['high_range_high_price'] / inverse_fee,
            'bid' : [],
            'ask' : [],
            'hodl_value' : [],
            'portfolio_cash' : [],
            'portfolio_risk' : [],
            'portfolio_value' : [],
            'portfolio_over_hodl' : [],
            'price' : config['prices']
        }
    }

def execute(config_carbon: dict, config_logger: dict) -> dict:
    logger = create_logger(config_logger)
    carbon = get_initial_state(config_carbon)
    bid, ask = get_quote(carbon)
    for step, price in enumerate(carbon['simulation_recorder']['price']):
        logger.update_before(carbon['simulation_recorder'], step, price, bid, ask)
        replicate_last_balance_and_fee(carbon)
        details = equilibrate_protocol(carbon, price, bid, ask)
        bid, ask = get_quote(carbon)
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
