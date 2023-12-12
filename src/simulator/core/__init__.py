from .logger import create_logger

from decimal import Decimal
from decimal import getcontext
from decimal import ROUND_HALF_DOWN

getcontext().prec = 100
getcontext().rounding = ROUND_HALF_DOWN

NEG_INF = Decimal('-Infinity')
EPSILON = Decimal('1e-48')
ZERO = Decimal('0')
ONE = Decimal('1')
TWO = Decimal('2')

def get_weights(market_price: Decimal, high_range_high_price_CASH: Decimal, low_range_low_price_CASH: Decimal, CASH_proportion: Decimal, RISK_proportion: Decimal) -> (Decimal, Decimal):
    if market_price < low_range_low_price_CASH:
        return ZERO, RISK_proportion
    if market_price > high_range_high_price_CASH:
        return CASH_proportion, ZERO
    return CASH_proportion, RISK_proportion

def get_starting_balances(market_price: Decimal, starting_portfolio_value: Decimal, CASH_weight: Decimal, RISK_weight: Decimal) -> (Decimal, Decimal):
    y_CASH = CASH_weight * starting_portfolio_value / (RISK_weight + CASH_weight)
    y_RISK = RISK_weight * starting_portfolio_value / (market_price * (RISK_weight + CASH_weight))
    return y_CASH, y_RISK

def get_concentrated_liquidity_scaling_constants(pa: Decimal, pb: Decimal) -> (Decimal, Decimal, Decimal, Decimal):
    pa_sqrt = pa.sqrt()
    pb_sqrt = pb.sqrt()
    A = pa_sqrt - pb_sqrt
    B = pb_sqrt
    return pa, pb, A, B

def calculate_y_int_info(y_info: Decimal, pa_info: Decimal, pb_info: Decimal, p_action: Decimal) -> Decimal:
    if y_info == ZERO:
        return EPSILON
    if pa_info == pb_info:
        return y_info
    if p_action > pb_info:
        return y_info * (p_action.sqrt() + pb_info.sqrt()) * (pa_info.sqrt() - pb_info.sqrt()) / (p_action - pb_info)
    raise Exception(f'y_info = {y_info}, pa_info = {pa_info}, pb_info = {pb_info}, p_action = {p_action}')

def get_pivots_asymptotes_and_x_intercepts(pa: Decimal, pb: Decimal, y_int: Decimal) -> (Decimal, Decimal, Decimal, Decimal, Decimal):
    if pa == pb:
        x_int = y_int / pa
        x_0 = x_int / TWO
        x_asym = NEG_INF
        y_0 = y_int / TWO
        y_asym = NEG_INF
    else:
        pa_sqrt = pa.sqrt()
        pb_sqrt = pb.sqrt()
        prod = pa_sqrt * pb_sqrt
        diff = pa_sqrt - pb_sqrt
        prod_times_diff = prod * diff
        y_int_times_pb_sqrt_neg = -y_int * pb_sqrt
        y_int_times_prod_sqrt_minus_pb_sqrt = y_int * (prod.sqrt() - pb_sqrt)
        x_int = y_int / prod
        x_0 = y_int_times_prod_sqrt_minus_pb_sqrt / prod_times_diff
        x_asym = y_int_times_pb_sqrt_neg / prod_times_diff
        y_0 = y_int_times_prod_sqrt_minus_pb_sqrt / diff
        y_asym = y_int_times_pb_sqrt_neg / diff
    return x_int, x_0, x_asym, y_0, y_asym

def calculate_hodl_value(carbon: dict, market_price: Decimal) -> Decimal:
    CASH = carbon['simulation_recorder']['CASH']['balance'][0]
    RISK = carbon['simulation_recorder']['RISK']['balance'][0]
    return RISK * market_price + CASH

def calculate_portfolio_values(carbon: dict, market_price: Decimal) -> (Decimal, Decimal, Decimal):
    CASH = carbon['simulation_recorder']['CASH']['balance'][-1]
    RISK = carbon['simulation_recorder']['RISK']['balance'][-1]
    return RISK * market_price + CASH, CASH, RISK * market_price

def measure_portfolio_over_hodl_quotient(hodl_value: Decimal, portfolio_value: Decimal) -> Decimal:
    return 100 * (portfolio_value - hodl_value) / hodl_value

def get_curve_parameters(carbon: dict, order: str) -> (Decimal, Decimal, Decimal, Decimal):
    y = carbon['simulation_recorder'][order]['balance'][-1]
    y_int = carbon['curve_parameters'][order]['y_int'][-1]
    A = carbon['curve_parameters'][order]['A'][-1]
    B = carbon['curve_parameters'][order]['B'][-1]
    return y, y_int, A, B

def get_quote(carbon: dict) -> (Decimal, Decimal, Decimal, Decimal):
    network_fee = carbon['curve_parameters']['network_fee']
    y_CASH, y_int_CASH, A_CASH, B_CASH = get_curve_parameters(carbon, 'CASH')
    y_RISK, y_int_RISK, A_RISK, B_RISK = get_curve_parameters(carbon, 'RISK')
    bid = (ONE - network_fee) * (B_CASH * y_int_CASH + A_CASH * y_CASH) ** TWO / y_int_CASH ** TWO
    ask = y_int_RISK ** TWO / ((ONE - network_fee) * (B_RISK * y_int_RISK + A_RISK * y_RISK) ** TWO)
    min_bid = B_CASH ** TWO * (ONE - network_fee)
    max_ask = ONE / (B_RISK ** TWO * (ONE - network_fee))
    return bid, ask, min_bid, max_ask

def calculate_dx(dy: Decimal, y: Decimal, y_int: Decimal, A: Decimal, B: Decimal) -> Decimal:
    return -dy * y_int ** TWO / (A * dy * (B * y_int + A * y) + (B * y_int + A * y) ** TWO)

def get_arb_buy(market_price: Decimal, network_fee: Decimal, y_RISK: Decimal, y_int_RISK: Decimal, A_RISK: Decimal, B_RISK: Decimal) -> (Decimal, Decimal):
    if A_RISK == ZERO:
        dy_RISK = -y_RISK
    else:
        temp = market_price * (ONE - network_fee)
        dy_RISK = y_int_RISK * (temp.sqrt() - B_RISK * temp) / (A_RISK * temp) - y_RISK
    dx_CASH = calculate_dx(dy_RISK, y_RISK, y_int_RISK, A_RISK, B_RISK)
    return dx_CASH, dy_RISK

def get_arb_sell(market_price: Decimal, network_fee: Decimal, y_CASH: Decimal, y_int_CASH: Decimal, A_CASH: Decimal, B_CASH: Decimal) -> (Decimal, Decimal):
    if A_CASH == ZERO:
        dy_CASH = -y_CASH
    else:
        temp = ONE - network_fee
        dy_CASH = y_int_CASH * ((market_price * temp).sqrt() - B_CASH * temp) / (A_CASH * temp) - y_CASH 
    dx_RISK = calculate_dx(dy_CASH, y_CASH, y_int_CASH, A_CASH, B_CASH)
    return dx_RISK, dy_CASH

def apply_trade(carbon: dict, order_x: str, order_y: str, action: str, market_price: Decimal, get_arb: any) -> None:
    network_fee = carbon['curve_parameters']['network_fee']
    x = carbon['simulation_recorder'][order_x]['balance'][-1]
    y, y_int, A, B = get_curve_parameters(carbon, order_y)
    dx, dy = get_arb(market_price, network_fee, y, y_int, A, B)
    if x + dx < 0 or y + dy < 0:
        dy = -y
        dx = calculate_dx(dy, y, y_int, A, B)
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
    return {'out_of_range': out_of_range, 'action': action, order_x: dx, order_y: -dy * (ONE - network_fee)}

def update_y_int_values(carbon: dict) -> str:
    updated_order = ''
    for order in ['CASH', 'RISK']:
        y = carbon['simulation_recorder'][order]['balance'][-1]
        old_y_int = carbon['curve_parameters'][order]['y_int'][-1]
        new_y_int = max(y, old_y_int)
        carbon['curve_parameters'][order]['y_int'].append(new_y_int)
        if new_y_int > old_y_int:
            updated_order = order
    return updated_order

def replicate_last(record: dict, orders: list[str], parameters: list[str]) -> None:
    for order in orders:
        for parameter in parameters:
            record[order][parameter].append(record[order][parameter][-1])

def update_remaining(carbon: dict, updated_order: str, trade_executed: bool) -> None:
    non_updated_orders = [order for order in ['CASH', 'RISK'] if order != updated_order]
    replicate_last(carbon['curve_parameters'], non_updated_orders, ['x_int', 'x_0', 'x_asym', 'y_0', 'y_asym'])
    replicate_last(carbon['curve_parameters'], ['CASH', 'RISK'], ['pa', 'pb', 'A', 'B'])
    if not trade_executed:
        replicate_last(carbon['curve_parameters'], ['CASH', 'RISK'], ['y_int'])
        replicate_last(carbon['simulation_recorder'], ['CASH', 'RISK'], ['balance', 'fee'])
    if updated_order:
        pa, pb, y_int = [carbon['curve_parameters'][updated_order][i][-1] for i in ['pa', 'pb', 'y_int']]
        x_int, x_0, x_asym, y_0, y_asym = get_pivots_asymptotes_and_x_intercepts(pa, pb, y_int)
        for key, value in zip(['x_int', 'x_0', 'x_asym', 'y_0', 'y_asym'], [x_int, x_0, x_asym, y_0, y_asym]):
            carbon['curve_parameters'][updated_order][key].append(value)
    network_fee = carbon['curve_parameters']['network_fee']
    carbon['simulation_recorder']['CASH']['bid_upper_bound'].append(carbon['curve_parameters']['CASH']['pa'][-1] * (ONE - network_fee))
    carbon['simulation_recorder']['RISK']['ask_lower_bound'].append(ONE / (carbon['curve_parameters']['RISK']['pa'][-1] * (ONE - network_fee)))

def equilibrate_protocol(carbon: dict, market_price: Decimal) -> (Decimal, Decimal, Decimal, Decimal):
    bid, ask, min_bid, max_ask = get_quote(carbon)
    if market_price > ask:
        trade_details = apply_trade(carbon, 'CASH', 'RISK', 'bought', market_price, get_arb_buy)
        updated_order = update_y_int_values(carbon)
    elif market_price < bid:
        trade_details = apply_trade(carbon, 'RISK', 'CASH', 'sold', market_price, get_arb_sell)
        updated_order = update_y_int_values(carbon)
    else:
        trade_details = {}
        updated_order = ''
    bid, ask, min_bid, max_ask = get_quote(carbon)
    update_remaining(carbon, updated_order, bool(trade_details))
    return bid, ask, min_bid, max_ask, trade_details

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
    CASH_weight, RISK_weight = get_weights(prices[0], high_range_high_price_CASH, low_range_low_price_CASH, CASH_proportion, RISK_proportion)
    y_CASH, y_RISK = get_starting_balances(prices[0], starting_portfolio_value, CASH_weight, RISK_weight)
    pa_CASH, pb_CASH, A_CASH, B_CASH = get_concentrated_liquidity_scaling_constants(low_range_high_price_CASH, low_range_low_price_CASH)
    pa_RISK, pb_RISK, A_RISK, B_RISK = get_concentrated_liquidity_scaling_constants(ONE / high_range_low_price_CASH, ONE / high_range_high_price_CASH)
    y_int_CASH = calculate_y_int_info(y_CASH, pa_CASH, pb_CASH, start_rate_low_range)
    y_int_RISK = calculate_y_int_info(y_RISK, pa_RISK, pb_RISK, ONE / start_rate_high_range)
    x_int_CASH, x_0_CASH, x_asym_CASH, y_0_CASH, y_asym_CASH = get_pivots_asymptotes_and_x_intercepts(pa_CASH, pb_CASH, y_int_CASH)
    x_int_RISK, x_0_RISK, x_asym_RISK, y_0_RISK, y_asym_RISK = get_pivots_asymptotes_and_x_intercepts(pa_RISK, pb_RISK, y_int_RISK)
    return {
        'curve_parameters': {
            'CASH': {
                'y_0' : [y_0_CASH],
                'y_int' : [y_int_CASH],
                'y_asym' : [y_asym_CASH],
                'x_0' : [x_0_CASH],
                'x_int' : [x_int_CASH],
                'x_asym' : [x_asym_CASH],
                'pa' : [pa_CASH],
                'pb' : [pb_CASH],
                'A' : [A_CASH],
                'B' : [B_CASH],
            },
            'RISK': {
                'y_0' : [y_0_RISK],
                'y_int' : [y_int_RISK],
                'y_asym' : [y_asym_RISK],
                'x_0' : [x_0_RISK],
                'x_int' : [x_int_RISK],
                'x_asym' : [x_asym_RISK],
                'pa' : [pa_RISK],
                'pb' : [pb_RISK],
                'A' : [A_RISK],
                'B' : [B_RISK],
            },
            'network_fee' : network_fee
        },
        'simulation_recorder': {
            'CASH': {
                'balance' : [y_CASH],
                'portion' : [],
                'fee' : [ZERO],
                'bid' : [],
                'min_bid' : [],
                'bid_upper_bound' : [],
                'hodl_value' : [],
                'portfolio_value' : [],
            },
            'RISK': {
                'balance' : [y_RISK],
                'portion' : [],
                'fee' : [ZERO],
                'ask' : [],
                'max_ask' : [],
                'ask_lower_bound' : [],
                'price' : prices,
            },
            'portfolio_over_hodl_quotient' : []
        }
    }

def execute(config_carbon: dict, config_logger: dict) -> dict:
    logger = create_logger(config_logger)
    carbon = get_initial_state(config_carbon)
    bid, ask, min_bid, max_ask = get_quote(carbon)
    for step, price in enumerate(carbon['simulation_recorder']['RISK']['price']):
        logger.update_before(carbon['simulation_recorder'], step, price, bid, ask)
        bid, ask, min_bid, max_ask, details = equilibrate_protocol(carbon, price)
        hodl_value = calculate_hodl_value(carbon, price)
        portfolio_value, portfolio_CASH_portion, portfolio_RISK_portion = calculate_portfolio_values(carbon, price)
        portfolio_over_hodl_quotient = measure_portfolio_over_hodl_quotient(hodl_value, portfolio_value)
        carbon['simulation_recorder']['CASH']['portion'].append(portfolio_CASH_portion)
        carbon['simulation_recorder']['CASH']['bid'].append(bid)
        carbon['simulation_recorder']['CASH']['min_bid'].append(min_bid)
        carbon['simulation_recorder']['CASH']['hodl_value'].append(hodl_value)
        carbon['simulation_recorder']['CASH']['portfolio_value'].append(portfolio_value)
        carbon['simulation_recorder']['RISK']['portion'].append(portfolio_RISK_portion)
        carbon['simulation_recorder']['RISK']['ask'].append(ask)
        carbon['simulation_recorder']['RISK']['max_ask'].append(max_ask)
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
