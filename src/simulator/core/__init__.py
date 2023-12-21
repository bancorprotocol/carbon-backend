from .logger import create_logger

from decimal import Decimal
from decimal import getcontext
from decimal import ROUND_HALF_DOWN

getcontext().prec = 100
getcontext().rounding = ROUND_HALF_DOWN

EPSILON = Decimal('1e-48')
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
    if y == ZERO:
        return EPSILON
    if A == ZERO:
        return y
    if rate > B ** TWO:
        return y * A * (rate.sqrt() + B) / (rate - B ** TWO)
    raise Exception(f'y = {y}, A = {A}, B = {B}, rate = {rate}')

def calculate_hodl_value(carbon: dict, market_price: Decimal) -> Decimal:
    CASH = carbon['simulation_recorder']['CASH']['balance'][0]
    RISK = carbon['simulation_recorder']['RISK']['balance'][0]
    return CASH + RISK * market_price

def calculate_portfolio_values(carbon: dict, market_price: Decimal) -> (Decimal, Decimal, Decimal):
    CASH = carbon['simulation_recorder']['CASH']['balance'][-1]
    RISK = carbon['simulation_recorder']['RISK']['balance'][-1]
    return CASH + RISK * market_price, CASH, RISK * market_price

def measure_portfolio_over_hodl_quotient(hodl_value: Decimal, portfolio_value: Decimal) -> Decimal:
    return 100 * (portfolio_value - hodl_value) / hodl_value

def get_trade_parameters(carbon: dict, order: str) -> (Decimal, Decimal, Decimal, Decimal):
    y = carbon['simulation_recorder'][order]['balance'][-1]
    z = carbon['curve_parameters'][order]['z'][-1]
    A = carbon['curve_parameters'][order]['A']
    B = carbon['curve_parameters'][order]['B']
    return y, z, A, B

def get_quote(carbon: dict) -> (Decimal, Decimal):
    network_fee = carbon['curve_parameters']['network_fee']
    y_CASH, z_CASH, A_CASH, B_CASH = get_trade_parameters(carbon, 'CASH')
    y_RISK, z_RISK, A_RISK, B_RISK = get_trade_parameters(carbon, 'RISK')
    bid = (ONE - network_fee) * (A_CASH * y_CASH + B_CASH * z_CASH) ** TWO / z_CASH ** TWO
    ask = z_RISK ** TWO / ((ONE - network_fee) * (A_RISK * y_RISK + B_RISK * z_RISK) ** TWO)
    return bid, ask

def calculate_dx(dy: Decimal, y: Decimal, z: Decimal, A: Decimal, B: Decimal) -> Decimal:
    return -dy * z ** TWO / (A * dy * (A * y + B * z) + (A * y + B * z) ** TWO)

def get_arb_buy(market_price: Decimal, network_fee: Decimal, y: Decimal, z: Decimal, A: Decimal, B: Decimal) -> (Decimal, Decimal):
    if A == ZERO:
        dy = -y
    else:
        temp = market_price * (ONE - network_fee)
        dy = z * (temp.sqrt() - B * temp) / (A * temp) - y
    dx = calculate_dx(dy, y, z, A, B)
    return dx, dy

def get_arb_sell(market_price: Decimal, network_fee: Decimal, y: Decimal, z: Decimal, A: Decimal, B: Decimal) -> (Decimal, Decimal):
    if A == ZERO:
        dy = -y
    else:
        temp = ONE - network_fee
        dy = z * ((market_price * temp).sqrt() - B * temp) / (A * temp) - y 
    dx = calculate_dx(dy, y, z, A, B)
    return dx, dy

def apply_trade(carbon: dict, order_x: str, order_y: str, action: str, market_price: Decimal, get_arb: any) -> dict:
    network_fee = carbon['curve_parameters']['network_fee']
    x = carbon['simulation_recorder'][order_x]['balance'][-1]
    y, z, A, B = get_trade_parameters(carbon, order_y)
    dx, dy = get_arb(market_price, network_fee, y, z, A, B)
    if x + dx < 0 or y + dy < 0:
        dy = -y
        dx = calculate_dx(dy, y, z, A, B)
        if dx == 0 and dy == 0:
            out_of_range = {'before': True, 'after': True}
        else:
            out_of_range = {'before': True, 'after': False}
    else:
        out_of_range = {'before': False}
    carbon['simulation_recorder'][order_x]['balance'].append(x + dx)
    carbon['simulation_recorder'][order_y]['balance'].append(y + dy)
    carbon['simulation_recorder'][order_x]['fee'].append(carbon['simulation_recorder'][order_x]['fee'][-1])
    carbon['simulation_recorder'][order_y]['fee'].append(carbon['simulation_recorder'][order_y]['fee'][-1] - dy * network_fee)
    for order in [order_x, order_y]:
        y = carbon['simulation_recorder'][order]['balance'][-1]
        z = carbon['curve_parameters'][order]['z'][-1]
        carbon['curve_parameters'][order]['z'].append(max(y, z))
    return {'out_of_range': out_of_range, 'action': action, order_x: dx, order_y: -dy * (ONE - network_fee)}

def replicate_last(record: dict, parameters: list[str]) -> None:
    for parameter in parameters:
        record[parameter].append(record[parameter][-1])

def equilibrate_protocol(carbon: dict, market_price: Decimal) -> (Decimal, Decimal, Decimal):
    bid, ask = get_quote(carbon)
    if market_price > ask:
        trade_details = apply_trade(carbon, 'CASH', 'RISK', 'bought', market_price, get_arb_buy)
    elif market_price < bid:
        trade_details = apply_trade(carbon, 'RISK', 'CASH', 'sold', market_price, get_arb_sell)
    else:
        trade_details = {}
    bid, ask = get_quote(carbon)
    if not trade_details:
        for order in ['CASH', 'RISK']:
            replicate_last(carbon['curve_parameters'][order], ['z'])
            replicate_last(carbon['simulation_recorder'][order], ['balance', 'fee'])
    return bid, ask, trade_details

def get_initial_state(config: dict) -> dict:
    starting_portfolio_value = config['starting_portfolio_value']
    high_range_high_price_CASH = config['high_range_high_price_CASH']
    high_range_low_price_CASH = config['high_range_low_price_CASH']
    low_range_high_price_CASH = config['low_range_high_price_CASH']
    low_range_low_price_CASH = config['low_range_low_price_CASH']
    start_rate_high_range = config['start_rate_high_range']
    start_rate_low_range = config['start_rate_low_range']
    CASH_proportion = config['CASH_proportion']
    RISK_proportion = config['RISK_proportion']
    network_fee = config['network_fee']
    prices = config['prices']
    if prices[0] < low_range_low_price_CASH:
        CASH_proportion = ZERO
    elif prices[0] > high_range_high_price_CASH:
        RISK_proportion = ZERO
    y_CASH = starting_portfolio_value * CASH_proportion / (CASH_proportion + RISK_proportion)
    y_RISK = starting_portfolio_value * RISK_proportion / (CASH_proportion + RISK_proportion) / prices[0]
    A_CASH, B_CASH = calculate_constants(low_range_high_price_CASH, low_range_low_price_CASH)
    A_RISK, B_RISK = calculate_constants(ONE / high_range_low_price_CASH, ONE / high_range_high_price_CASH)
    z_CASH = calculate_z(y_CASH, A_CASH, B_CASH, start_rate_low_range)
    z_RISK = calculate_z(y_RISK, A_RISK, B_RISK, ONE / start_rate_high_range)
    return {
        'curve_parameters': {
            'CASH': {
                'A' : A_CASH,
                'B' : B_CASH,
                'z' : [z_CASH]
            },
            'RISK': {
                'A' : A_RISK,
                'B' : B_RISK,
                'z' : [z_RISK]
            },
            'network_fee' : network_fee
        },
        'simulation_recorder': {
            'CASH': {
                'balance' : [y_CASH],
                'portion' : [],
                'fee' : [ZERO],
                'bid' : [],
                'min_bid' : low_range_low_price_CASH * (ONE - network_fee),
                'bid_upper_bound' : low_range_high_price_CASH * (ONE - network_fee),
                'hodl_value' : [],
                'portfolio_value' : []
            },
            'RISK': {
                'balance' : [y_RISK],
                'portion' : [],
                'fee' : [ZERO],
                'ask' : [],
                'max_ask' : high_range_high_price_CASH / (ONE - network_fee),
                'ask_lower_bound' : high_range_low_price_CASH / (ONE - network_fee),
                'price' : prices
            },
            'portfolio_over_hodl_quotient' : []
        }
    }

def execute(config_carbon: dict, config_logger: dict) -> dict:
    logger = create_logger(config_logger)
    carbon = get_initial_state(config_carbon)
    bid, ask = get_quote(carbon)
    for step, price in enumerate(carbon['simulation_recorder']['RISK']['price']):
        logger.update_before(carbon['simulation_recorder'], step, price, bid, ask)
        bid, ask, details = equilibrate_protocol(carbon, price)
        hodl_value = calculate_hodl_value(carbon, price)
        portfolio_value, CASH_portion, RISK_portion = calculate_portfolio_values(carbon, price)
        portfolio_over_hodl_quotient = measure_portfolio_over_hodl_quotient(hodl_value, portfolio_value)
        carbon['simulation_recorder']['CASH']['portion'].append(CASH_portion)
        carbon['simulation_recorder']['CASH']['bid'].append(bid)
        carbon['simulation_recorder']['CASH']['hodl_value'].append(hodl_value)
        carbon['simulation_recorder']['CASH']['portfolio_value'].append(portfolio_value)
        carbon['simulation_recorder']['RISK']['portion'].append(RISK_portion)
        carbon['simulation_recorder']['RISK']['ask'].append(ask)
        carbon['simulation_recorder']['portfolio_over_hodl_quotient'].append(portfolio_over_hodl_quotient)
        logger.update_after(carbon['simulation_recorder'], details, price, bid, ask)
    logger.close()
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
