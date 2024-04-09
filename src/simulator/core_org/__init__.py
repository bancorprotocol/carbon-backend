import logging

from pandas import Timestamp
from tabulate import tabulate

from decimal import Decimal
from decimal import getcontext
from decimal import ROUND_HALF_DOWN

getcontext().prec = 100
getcontext().rounding = ROUND_HALF_DOWN

ZERO = Decimal('0')
ONE = Decimal('1')
TWO = Decimal('2')
FOUR = Decimal('4')
INF = Decimal('inf')

global carbon
global logger
global cash_token_symbol
global risk_token_symbol

def calculate_hyperbolic_constant_k(x: Decimal, y: Decimal) -> Decimal:
    return x*y

def calculate_concentrated_liquidity_B_constant(P_b: Decimal) -> Decimal:
    return P_b**(ONE/TWO)

def calculate_concentrated_liquidity_P_constant(P_a: Decimal, P_b: Decimal) -> Decimal:
    return (P_a*P_b)**(ONE/TWO)

def calculate_concentrated_liquidity_Q_constant(P_a: Decimal, P_b: Decimal) -> Decimal:
    return (P_b/P_a)**(ONE/TWO)

def calculate_concentrated_liquidity_R_constant(P_a: Decimal, P_b: Decimal) -> Decimal:
    return (P_a/P_b)**(ONE/FOUR)

def calculate_concentrated_liquidity_S_constant(P_a: Decimal, P_b: Decimal) -> Decimal:
    return P_a**(ONE/TWO) - P_b**(ONE/TWO)

def calculate_concentrated_liquidity_n_constant(P_a: Decimal, P_b: Decimal) -> Decimal:
    return ONE - (P_b/P_a)**(ONE/FOUR)

def get_concentrated_liquidity_scaling_constants(high_price_bound: Decimal, low_price_bound: Decimal) -> list[Decimal]:
    P_a = high_price_bound
    P_b = low_price_bound
    B = calculate_concentrated_liquidity_B_constant(P_b)
    P = calculate_concentrated_liquidity_P_constant(P_a, P_b)
    Q = calculate_concentrated_liquidity_Q_constant(P_a, P_b)
    R = calculate_concentrated_liquidity_R_constant(P_a, P_b)
    S = calculate_concentrated_liquidity_S_constant(P_a, P_b)
    n = calculate_concentrated_liquidity_n_constant(P_a, P_b)
    return(P_a, P_b, B, P, Q, R, S, n)

# $$y_{asym} = \frac{y_{0}\left(n - 1\right)}{n}$$
# $$x_{asym} = \frac{x_{0}\left(n - 1\right)}{n}$$
# Where:
# $y_{asym}$, $x_{asym}$ = the CASH, RISK asymptotes, resepectively; $x_{0}$, $y_{0}$ = the RISK and CASH pivots, respectively; $n$ = $1 - \sqrt[4]{\frac{P_{b}}{P_{a}}}$ = the curve scaling parameter.

def calculate_yint_CASH(y_CASH: Decimal, P_a_CASH: Decimal, P_b_CASH: Decimal, P_bid: Decimal) -> Decimal:
    if y_CASH == 0:
        return y_CASH
    elif P_a_CASH == P_b_CASH:
        return y_CASH
    elif P_bid and y_CASH:
        return y_CASH*(P_bid**(ONE/TWO) + P_b_CASH**(ONE/TWO))*(P_a_CASH**(ONE/TWO) - P_b_CASH**(ONE/TWO))/(P_bid - P_b_CASH)
    else:
        return y_CASH

# $$y_{int} = \frac{y \left( \sqrt{P_{bid}} + \sqrt{P_{b}} \right) \left( \sqrt{P_{a}} - \sqrt{P_{b}} \right)}{P_{bid} - P_{b}}$$
# Where: $y_{int}$ = the CASH intercept; $y$ = the CASH token balance; $P_{bid}$ = the intra-range bid price; $P_{b}$ = the low-bound bidding price; $P_{a}$ = the high-bound bidding price.

def calculate_yint_RISK(y_RISK: Decimal, P_a_RISK: Decimal, P_b_RISK: Decimal, P_ask: Decimal) -> Decimal:
    if y_RISK == 0:
        return y_RISK
    elif P_a_RISK == P_b_RISK:
        return y_RISK
    elif P_ask and y_RISK:
        return y_RISK*((P_ask)**(ONE/TWO) + P_b_RISK**(ONE/TWO))*(P_a_RISK**(ONE/TWO) - P_b_RISK**(ONE/TWO))/(P_ask - P_b_RISK)
    else:
        return y_RISK

def recalculate_yint_if_needed(y_int: Decimal, y_int_OTHER: Decimal, P_a_OTHER: Decimal, P_b_OTHER: Decimal) -> Decimal:
    return y_int if y_int > 0 else y_int_OTHER / (P_a_OTHER*P_b_OTHER)**(ONE/TWO)

# $$y_{int} = \frac{y \left( \sqrt{P_{ask}} + \sqrt{P_{b}} \right) \left( \sqrt{P_{a}} - \sqrt{P_{b}} \right)}{P_{ask} - P_{b}}$$
# Where: $y_{int}$ = the RISK intercept; $y$ = the RISK token balance; $P_{ask}$ = the intra-range ask price; $P_{b}$ = the high-bound asking price; $P_{a}$ = the low-bound asking price.

def calculate_x_int_from_P_a_P_b_y_int(P_a: Decimal, P_b: Decimal, y_int: Decimal) -> Decimal:
    return y_int/(P_a*P_b)**(ONE/TWO)

# $$x_{int} = \frac{y_{int}}{\sqrt{P_{a} P_{b}}}$$
# Where:
# $x_{int}$, $y_{int}$ = CASH or RISK intercept; $P_{b}$, $P_{a}$ = the high- or low-bound asking/bidding price.

def calculate_x_0_from_P_a_P_b_y_int(P_a: Decimal, P_b: Decimal, y_int: Decimal) -> Decimal:
    if P_a == P_b:
        return y_int/(TWO*P_a) # == y_int/(TWO*P_b) == y_int/(TWO*(P_a*P_b)**(ONE/TWO)) == y_int/(TWO*P)
    else:
        return y_int*((P_a*P_b)**(ONE/FOUR) - P_b**(ONE/TWO))/((P_a*P_b)**(ONE/TWO)*(P_a**(ONE/TWO) - P_b**(ONE/TWO)))

# $$
# x_{0} = \frac{y_{int} \left( \sqrt[4]{P_{a} P_{b}} - \sqrt{P_{b}}\right)}{\sqrt{P_{a} P_{b}} \left( \sqrt{P_{a}} - \sqrt{P_{b}}\right)} \\[10pt]
# \lim_{P_{a} \rightarrow P_{b}} x_0 = \frac{y_{int}}{2 P_{a}} \\[10pt]
# \\
# \therefore x_{0} = \left\{
# \begin{array}{ll}
# \frac{y_{int} \left( \sqrt[4]{P_{a} P_{b}} - \sqrt{P_{b}}\right)}{\sqrt{P_{a} P_{b}} \left( \sqrt{P_{a}} - \sqrt{P_{b}}\right)} & \quad P_{a} \neq P_{b} \\[10pt]
# \frac{y_{int}}{2 P_{a}}  & \quad P_{a} = P_{b} \\[10pt]
# \end{array}
# \right.
# $$
# Where:
# $x_{0}$ = CASH or RISK pivot; $y_{int}$ = CASH or RISK intercept; $P_{b}$, $P_{a}$ = the high- or low-bound asking/bidding price.

def calculate_x_asym_from_P_a_P_b_y_int(P_a: Decimal, P_b: Decimal, y_int: Decimal) -> Decimal:
    if P_a == P_b:
        return INF
    else:
        return P_b**(ONE/TWO)*y_int/((P_a*P_b)**(ONE/TWO)*(P_b**(ONE/TWO) - P_a**(ONE/TWO)))

# $$
# x_{asym} = \frac{y_{int} \sqrt{P_{b}}}{\sqrt{P_{a} P_{b}} \left(\sqrt{P_{b}} - \sqrt{P_{a}}\right)}
# $$
# Where:
# $x_{asym}$ = CASH or RISK asymptote; $y_{int}$ = CASH or RISK intercept; $P_{b}$, $P_{a}$ = the high- or low-bound asking/bidding price.

def calculate_y_0_from_P_a_P_b_y_int(P_a: Decimal, P_b: Decimal, y_int: Decimal) -> Decimal:
    if P_a == P_b:
        return y_int/TWO
    else:
        return y_int*((P_a*P_b)**(ONE/FOUR) - P_b**(ONE/TWO))/(P_a**(ONE/TWO) - P_b**(ONE/TWO))

# $$
# y_{0} = \frac{y_{int} \left( \sqrt[4]{P_{a} P_{b}} - \sqrt{P_{b}}\right)}{\sqrt{P_{a}} - \sqrt{P_{b}}} \\[10pt]
# \lim_{P_{a} \rightarrow P_{b}} y_0 = \frac{y_{int}}{2} \\[10pt]
# \\
# \therefore y_{0} = \left\{
# \begin{array}{ll}
# \frac{y_{int} \left( \sqrt[4]{P_{a} P_{b}} - \sqrt{P_{b}}\right)}{\sqrt{P_{a}} - \sqrt{P_{b}}} & \quad P_{a} \neq P_{b} \\[10pt]
# \frac{y_{int}}{2}  & \quad P_{a} = P_{b} \\[10pt]
# \end{array}
# \right.
# $$
# Where:
# $y_{0}$ = CASH or RISK pivot; $y_{int}$ = CASH or RISK intercept; $P_{b}$, $P_{a}$ = the high- or low-bound asking/bidding price.

def calculate_y_asym_from_P_a_P_b_y_int(P_a: Decimal, P_b: Decimal, y_int: Decimal) -> Decimal:
    if P_a == P_b:
        return INF
    else:
        return P_b**(ONE/TWO)*y_int/(P_b**(ONE/TWO) - P_a**(ONE/TWO))

# $$
# y_{asym} = \frac{y_{int} \sqrt{P_{b}}}{\sqrt{P_{b}} - \sqrt{P_{a}}}
# $$
# Where:
# $y_{asym}$ = CASH or RISK asymptote; $y_{int}$ = CASH or RISK intercept; $P_{b}$, $P_{a}$ = the high- or low-bound asking/bidding price.

def get_carbon_pivots_asymptotes_and_x_intercepts(P_a: Decimal, P_b: Decimal, y_int: Decimal) -> Decimal:
    x_int = calculate_x_int_from_P_a_P_b_y_int(P_a, P_b, y_int)
    x_0 = calculate_x_0_from_P_a_P_b_y_int(P_a, P_b, y_int)
    x_asym = calculate_x_asym_from_P_a_P_b_y_int(P_a, P_b, y_int)
    y_0 = calculate_y_0_from_P_a_P_b_y_int(P_a, P_b, y_int)
    y_asym = calculate_y_asym_from_P_a_P_b_y_int(P_a, P_b, y_int)
    return(x_int, x_0, x_asym, y_0, y_asym)

def make_carbon(start_information: dict) -> None:
    fee = start_information['network_fee']
    y_CASH = start_information['portfolio_cash_value']
    y_RISK = start_information['portfolio_risk_value']
    P_a_RISK, P_b_RISK, B_RISK, P_RISK, Q_RISK, R_RISK, S_RISK, n_RISK = get_concentrated_liquidity_scaling_constants(ONE/start_information['high_range_low_price'], ONE/start_information['high_range_high_price'])
    P_a_CASH, P_b_CASH, B_CASH, P_CASH, Q_CASH, R_CASH, S_CASH, n_CASH = get_concentrated_liquidity_scaling_constants(start_information['low_range_high_price']/ONE, start_information['low_range_low_price']/ONE)
    y_int_RISK = calculate_yint_RISK(y_RISK, P_a_RISK, P_b_RISK, ONE/start_information['high_range_start_price'])
    y_int_CASH = calculate_yint_CASH(y_CASH, P_a_CASH, P_b_CASH, start_information['low_range_start_price'])
    y_int_RISK = recalculate_yint_if_needed(y_int_RISK, y_int_CASH, P_a_CASH, P_b_CASH)
    y_int_CASH = recalculate_yint_if_needed(y_int_CASH, y_int_RISK, P_a_RISK, P_b_RISK)
    x_int_RISK, x_0_RISK, x_asym_RISK, y_0_RISK, y_asym_RISK = get_carbon_pivots_asymptotes_and_x_intercepts(P_a_RISK, P_b_RISK, y_int_RISK)
    x_int_CASH, x_0_CASH, x_asym_CASH, y_0_CASH, y_asym_CASH = get_carbon_pivots_asymptotes_and_x_intercepts(P_a_CASH, P_b_CASH, y_int_CASH)
    k_RISK = calculate_hyperbolic_constant_k(x_0_RISK, y_0_RISK)
    k_CASH = calculate_hyperbolic_constant_k(x_0_CASH, y_0_CASH)
    return {
        'curve parameters': {
            'CASH': {
                'y_0' : [y_0_CASH],
                'y_int' : [y_int_CASH],
                'y_asym' : [y_asym_CASH],
                'x_0' : [x_0_CASH],
                'x_int' : [x_int_CASH],
                'x_asym' : [x_asym_CASH],
                'P_a' : [P_a_CASH],
                'P_b' : [P_b_CASH],
                'B' : [B_CASH],
                'P' : [P_CASH],
                'Q' : [Q_CASH],
                'R' : [R_CASH],
                'S' : [S_CASH],
                'n' : [n_CASH],
                'k' : [k_CASH],
                'fee' : [fee]
            },
            'RISK': {
                'y_0' : [y_0_RISK],
                'y_int' : [y_int_RISK],
                'y_asym' : [y_asym_RISK],
                'x_0' : [x_0_RISK],
                'x_int' : [x_int_RISK],
                'x_asym' : [x_asym_RISK],
                'P_a' : [P_a_RISK],
                'P_b' : [P_b_RISK],
                'B' : [B_RISK],
                'P' : [P_RISK],
                'Q' : [Q_RISK],
                'R' : [R_RISK],
                'S' : [S_RISK],
                'n' : [n_RISK],
                'k' : [k_RISK],
                'fee' : [fee]
            }
        },
        'simulation recorder': {
            'simulation step' : [],
            'date' : [],
            'RISK price' : [],
            'CASH balance' : [y_CASH],
            'RISK balance' : [y_RISK],
            'ask' : [],
            'max ask' : [],
            'ask lower bound' : [],
            'bid': [],
            'min bid' : [],
            'bid upper bound' : [],
            'CASH portion' : [],
            'RISK portion' : [],
            'hodl value' : [],
            'RISK fees' : [ZERO],
            'CASH fees' : [ZERO],
            'portfolio value' : [],
            'portfolio over hodl quotient' : []
        }
    }

# # Summary Reporters for Logs

def get_simulation_timer_for_log_table(simulation_timedelta: Timestamp) -> str:
    years, remainder = divmod(simulation_timedelta.days, 365)
    months, remainder = divmod(remainder, 30)
    weeks, remainder = divmod(remainder, 7)
    days = remainder
    hours, remainder = divmod(simulation_timedelta.seconds, 3600)
    minutes = remainder // 60
    components = [
        (years, "year"),
        (months, "month"),
        (weeks, "week"),
        (days, "day"),
        (hours, "hour"),
        (minutes, "minute")
    ]
    simulation_timer = ", ".join(f"{value} {unit}s" if value > 1 else f"{value} {unit}" for value, unit in components if value > 0)
    return simulation_timer if simulation_timer else "none"

def make_categories_list_for_report_log() -> list[str]:
    return [
        f'{risk_token_symbol} balance',
        f'{cash_token_symbol} balance',
        f'{risk_token_symbol} protocol-owned fees',
        f'{cash_token_symbol} protocol-owned fees',
        f'{risk_token_symbol} market price',
        f'{cash_token_symbol} portfolio value',
        f'{cash_token_symbol} hodl value',
        'portfolio versus hodl'
    ]

def make_values_list_for_report_log() -> list[str]:
    simulation_recorder = carbon['simulation recorder']
    portfolio_over_hodl_quotient = simulation_recorder['portfolio over hodl quotient'][-1]
    sign = '+' if portfolio_over_hodl_quotient > 0 else '-' if portfolio_over_hodl_quotient < 0 else ' '
    return [
        f"{simulation_recorder['RISK balance'][-1]:.18f}",
        f"{simulation_recorder['CASH balance'][-1]:.18f}",
        f"{simulation_recorder['RISK fees'][-1]:.18f}",
        f"{simulation_recorder['CASH fees'][-1]:.18f}",
        f"{simulation_recorder['RISK price'][-1]:.18f}",
        f"{simulation_recorder['portfolio value'][-1]:.18f}",
        f"{simulation_recorder['hodl value'][-1]:.18f}",
        f"{sign}{portfolio_over_hodl_quotient:.17f}%"
    ]

def make_notes_list_for_report_log() -> list[str]:
    return [
        f'The liquidity of {risk_token_symbol}',
        f'The liquidity of {cash_token_symbol}',
        'Not part of the user portfolio performance calculation',
        'Not part of the user portfolio performance calculation',
        f'The market price of {risk_token_symbol} in {cash_token_symbol} units at the current step of the simulation',
        f'`user-owned {cash_token_symbol}` + `user-owned {risk_token_symbol}` * `market price of {risk_token_symbol}`',
        f'The user portfolio value in {cash_token_symbol} units if they did not create this strategy',
        '(`portfolio value` - `hodl value`) / `hodl value` * 100'
    ]

def get_summary_for_report_log() -> str:
    headers = ['Attribute', 'Value', 'Note']
    categories = make_categories_list_for_report_log()
    values = make_values_list_for_report_log()
    notes = make_notes_list_for_report_log()
    data = list(zip(categories, values, notes))
    return tabulate(data, headers, tablefmt="outline", colalign=('left', 'right', 'left'))

# # Shared Functions

# #### Performance trackers (Shared)

def calculate_current_hodl_value(market_price: Decimal) -> Decimal:
    hodl_composition = {k: carbon['simulation recorder'][f'{k} balance'][0] for k in ('RISK', 'CASH')}
    hodl_value = hodl_composition['RISK']*market_price + hodl_composition['CASH']
    return(hodl_value)

def calculate_current_portfolio_value(market_price: Decimal) -> Decimal:
    portfolio_composition = {k: carbon['simulation recorder'][f'{k} balance'][-1] for k in ('RISK', 'CASH')}
    RISK_value = portfolio_composition['RISK']*market_price
    total_value = RISK_value + portfolio_composition['CASH']
    CASH_value = portfolio_composition['CASH']
    return(total_value, CASH_value, RISK_value)

def measure_portfolio_over_hodl_quotient(
    current_hodl_value: Decimal,
    current_portfolio_value: Decimal
) -> Decimal:
    return 100*(current_portfolio_value - current_hodl_value)/current_hodl_value

def record_protocol_performance(
    simulation_step: int,
    simulation_date: Timestamp,
    market_price: Decimal,
    final_ask: Decimal,
    final_bid: Decimal,
    min_bid: Decimal,
    max_ask: Decimal
) -> None:
    current_hodl_value = calculate_current_hodl_value(market_price)
    current_portfolio_value, current_portfolio_CASH_portion, current_portfolio_RISK_portion = calculate_current_portfolio_value(market_price)
    portfolio_over_hodl_quotient = measure_portfolio_over_hodl_quotient(current_hodl_value, current_portfolio_value)
    carbon['simulation recorder']['simulation step'].append(simulation_step)
    carbon['simulation recorder']['date'].append(simulation_date)
    carbon['simulation recorder']['RISK price'].append(market_price)
    carbon['simulation recorder']['ask'].append(final_ask)
    carbon['simulation recorder']['max ask'].append(max_ask)
    carbon['simulation recorder']['bid'].append(final_bid)
    carbon['simulation recorder']['min bid'].append(min_bid)
    carbon['simulation recorder']['CASH portion'].append(current_portfolio_CASH_portion)
    carbon['simulation recorder']['RISK portion'].append(current_portfolio_RISK_portion)
    carbon['simulation recorder']['hodl value'].append(current_hodl_value)
    carbon['simulation recorder']['portfolio value'].append(current_portfolio_value)
    carbon['simulation recorder']['portfolio over hodl quotient'].append(portfolio_over_hodl_quotient)

# #### Protocol Arbitarge (Shared)

def get_arb_direction(
    market_price: Decimal,
    ask: Decimal,
    bid: Decimal,
) -> str:
    logger.info(f'The market price of {risk_token_symbol} is {market_price:.6f} {cash_token_symbol} per unit.')
    if bid <= market_price <= ask:
        logger.info(f'Since this price is within the spread, the arbitrageur will not attempt to trade {risk_token_symbol}.')
        return ''
    elif ask < market_price:
        direction = f'buy'
    elif bid > market_price:
        direction = f'sell'
    logger.info(f'Since this price is not within the spread, the arbitrageur will attempt to {direction} {risk_token_symbol}.')
    return(direction)

def record_quotes_to_logger(
    b_or_a: str,
    CASH_balance: Decimal,
    RISK_balance: Decimal,
    bid: Decimal,
    ask: Decimal
) -> None:
    logger.info(f'Marginal price quotes {b_or_a} arbitrage:')
    if CASH_balance > 0 and RISK_balance > 0:
        logger.info(f'- {risk_token_symbol} can be sold for {bid:.6f} {cash_token_symbol} per unit')
        logger.info(f'- {risk_token_symbol} can be bought for {ask:.6f} {cash_token_symbol} per unit')
    elif CASH_balance == 0:
        logger.info(f'- {risk_token_symbol} cannot be sold; strategy has run out of {cash_token_symbol}')
        logger.info(f'- {risk_token_symbol} can still be bought for {ask:.6f} {cash_token_symbol} per unit')
    elif RISK_balance == 0:
        logger.info(f'- {risk_token_symbol} cannot be bought; strategy has run out of {cash_token_symbol}')
        logger.info(f'- {risk_token_symbol} can still be sold for {bid:.6f} {cash_token_symbol} per unit')
    if b_or_a == 'before':
        logger.info('')

# # Carbon State Functions

def get_carbon_curve_parameters(order: str) -> list[Decimal]:
    y = carbon['simulation recorder'][f'{order} balance'][-1]
    y_int = carbon['curve parameters'][order]['y_int'][-1]
    B = carbon['curve parameters'][order]['B'][-1]
    S = carbon['curve parameters'][order]['S'][-1]
    return(y, y_int, B, S)

def get_carbon_strategy_states() -> list[Decimal]:
    y_CASH, y_int_CASH, B_CASH, S_CASH = get_carbon_curve_parameters('CASH')
    y_RISK, y_int_RISK, B_RISK, S_RISK = get_carbon_curve_parameters('RISK')
    network_fee = carbon['curve parameters']['CASH']["fee"][-1]
    return(y_CASH, y_int_CASH, B_CASH, S_CASH, y_RISK, y_int_RISK, B_RISK, S_RISK, network_fee)

def measure_current_bid_carbon(
    y_CASH: Decimal,
    y_int_CASH: Decimal,
    B_CASH: Decimal,
    S_CASH: Decimal,
    network_fee: Decimal
) -> Decimal:
    return (ONE - network_fee)*(B_CASH*y_int_CASH + S_CASH*y_CASH)**TWO/y_int_CASH**TWO

# $$
# P_{bid} = \frac{\left(1 - \delta \right)\left( B y_{int} + S y\right)^{2}}{y_{int}^{2}}
# $$
# Where:
# $P_{bid}$ = the current bidding price; $\delta$ = the network fee; $B$ = $\sqrt{P_{b}}$ = The square root of the low-bound bidding price; $S$ = $\sqrt{P_{a}} - \sqrt{P_{b}}$ = The range width parameter; $y$ = the CASH balance; $y_{int}$ = the CASH intercept.

def measure_min_bid_carbon(
    B_CASH: Decimal,
    network_fee: Decimal
) -> Decimal:
    return B_CASH**TWO*(ONE - network_fee)

# $$
# P_{b}^{*} = B^{2} \left( 1 - \delta \right)
# $$
# Where:
# $P_{b}^{*}$ = The fee-adjusted low-bound bidding price; $B$ = $\sqrt{P_{b}}$ = The square root of the low-bound bidding price; $\delta$ = the network fee.

def measure_current_ask_carbon(
    y_RISK: Decimal,
    y_int_RISK: Decimal,
    B_RISK: Decimal,
    S_RISK: Decimal,
    network_fee: Decimal
) -> Decimal:
    return y_int_RISK**TWO/((ONE - network_fee)*(B_RISK*y_int_RISK + S_RISK*y_RISK)**TWO)

# $$
# P_{ask} = \frac{y_{int}^{2}}{\left( 1 - \delta \right) \left( B y_{int} + S y\right)^{2}}
# $$
# Where:
# $P_{ask}$ = the current asking price; $\delta$ = the network fee; $B$ = $\sqrt{P_{b}}$ = The square root of the high-bound askin price; $S$ = $\sqrt{P_{a}} - \sqrt{P_{b}}$ = The range width parameter; $y$ = the RISK balance; $y_{int}$ = the RISK intercept.

def measure_max_ask_carbon(
    B_RISK: Decimal,
    network_fee: Decimal
) -> Decimal:
    return ONE/(B_RISK**TWO*(ONE - network_fee))

# $$
# P_{b}^{*} = \frac{1}{B^{2} \left( 1 - \delta \right)}
# $$
# Where:
# $P_{b}^{*}$ = The fee-adjusted high-bound asking price; $B$ = $\sqrt{P_{b}}$ = The square root of the high-bound asking price; $\delta$ = the network fee.

def get_carbon_order_P_a_P_b_y_int(
    y_int_updated_order: str
) -> list[Decimal]:
    return [carbon['curve parameters'][y_int_updated_order][i][-1] for i in ['P_a', 'P_b', 'y_int']]

def update_carbon_pivots_asymptotes_and_x_intercept(
    y_int_updated_order: str,
    x_int: Decimal,
    x_0: Decimal,
    x_asym: Decimal,
    y_0: Decimal,
    y_asym: Decimal,
    k: Decimal
) -> None:
    for key, value in zip(['x_int', 'x_0', 'x_asym', 'y_0', 'y_asym', 'k'], [x_int, x_0, x_asym, y_0, y_asym, k]):
        carbon['curve parameters'][y_int_updated_order][key].append(value)

def recalculate_carbon_pivots_asymptotes_and_x_intercept(
    y_int_updated_order: str
) -> None:
    P_a, P_b, y_int = get_carbon_order_P_a_P_b_y_int(y_int_updated_order)
    x_int, x_0, x_asym, y_0, y_asym = get_carbon_pivots_asymptotes_and_x_intercepts(P_a, P_b, y_int)
    k = calculate_hyperbolic_constant_k(x_0, y_0)
    return(x_int, x_0, x_asym, y_0, y_asym, k)

def copy_carbon_parameters(
    parameters: list[str],
    order_to_ignore: str = ''
) -> None:
    for order, parameter in [(order, parameter) for order in ['CASH', 'RISK'] for parameter in parameters]:
        if order != order_to_ignore:
            carbon['curve parameters'][order][parameter].append(carbon['curve parameters'][order][parameter][-1])

def copy_carbon_simulation_recorder_values(
    keys: list[str]
) -> None:
    for key in keys:
        carbon['simulation recorder'][key].append(carbon['simulation recorder'][key][-1])

def update_carbon_range_bounds() -> None:
    carbon['simulation recorder']['ask lower bound'].append(ONE/(carbon['curve parameters']['RISK']['P_a'][-1]*(ONE - carbon['curve parameters']['RISK']['fee'][-1])))
    carbon['simulation recorder']['bid upper bound'].append(carbon['curve parameters']['CASH']['P_a'][-1]*(ONE - carbon['curve parameters']['CASH']['fee'][-1]))

def carbon_housekeeping(
    updates_occurred: bool,
    y_int_updated_order: str
) -> None:
    copy_carbon_parameters(('P_a', 'P_b', 'B', 'P', 'Q', 'R', 'S', 'n', 'fee'))
    copy_carbon_parameters(('x_int', 'x_0', 'x_asym', 'y_0', 'y_asym', 'k'), order_to_ignore = y_int_updated_order)
    if not updates_occurred:
        copy_carbon_simulation_recorder_values(['RISK balance', 'CASH balance', 'RISK fees', 'CASH fees'])
        copy_carbon_parameters(('y_int',)) # leave this comma where it is!
    if y_int_updated_order:
        x_int, x_0, x_asym, y_0, y_asym, k = recalculate_carbon_pivots_asymptotes_and_x_intercept(y_int_updated_order)
        update_carbon_pivots_asymptotes_and_x_intercept(y_int_updated_order, x_int, x_0, x_asym, y_0, y_asym, k)
    update_carbon_range_bounds()

# # Carbon Arbitrage Functions

def get_carbon_quote(
    b_or_a: str,
    log_bid_and_ask: bool = True
) -> list[Decimal]:
    y_CASH, y_int_CASH, B_CASH, S_CASH, y_RISK, y_int_RISK, B_RISK, S_RISK, network_fee = get_carbon_strategy_states()
    current_bid = measure_current_bid_carbon(y_CASH, y_int_CASH, B_CASH, S_CASH, network_fee)
    current_ask = measure_current_ask_carbon(y_RISK, y_int_RISK, B_RISK, S_RISK, network_fee)
    min_bid = measure_min_bid_carbon(B_CASH, network_fee)
    max_ask = measure_max_ask_carbon(B_RISK, network_fee)
    if log_bid_and_ask:
        record_quotes_to_logger(b_or_a, y_CASH, y_RISK, current_bid, current_ask)
    return(current_ask, current_bid, min_bid, max_ask)

def calculate_Dx_carbon(
    Dy: Decimal,
    y_int: Decimal,
    S: Decimal,
    B: Decimal,
    y: Decimal
) -> Decimal:
    return - Dy*y_int**TWO/(S*Dy*(B*y_int + S*y) + (B*y_int + S*y)**TWO)

# $$
# \Delta{x} = - \frac{\Delta{y} y_{int}^{2}}{S \Delta{y} \left(B y_{int} + S y \right) + \left( B y_{int} + S y\right)^{2}}
# $$

def buy_RISK_arb_function_carbon(
    market_price: Decimal,
    network_fee: Decimal,
    y_CASH: Decimal,
    y_int_CASH: Decimal,
    B_CASH: Decimal,
    S_CASH: Decimal,
    y_RISK: Decimal,
    y_int_RISK: Decimal,
    B_RISK: Decimal,
    S_RISK: Decimal
) -> list[Decimal]:
    if S_RISK == ZERO:
        DRISK = - y_RISK
    else:
        DRISK = y_int_RISK*((market_price*(ONE - network_fee))**(ONE/TWO) - B_RISK*market_price*(ONE - network_fee))/(market_price*S_RISK*(ONE - network_fee)) - y_RISK
    DCASH = calculate_Dx_carbon(DRISK, y_int_RISK, S_RISK, B_RISK, y_RISK)
    return(DRISK, DCASH)

# $$
# \Delta{y} = \frac{y_{int} \sqrt{P_{m} \left( 1 - \delta\right)} - B P_{m} \left(1 - \delta \right)}{P_{m} S \left( 1 - \delta \right)} - y
# $$

def sell_RISK_arb_function_carbon(
    market_price: Decimal,
    network_fee: Decimal,
    y_CASH: Decimal,
    y_int_CASH: Decimal,
    B_CASH: Decimal,
    S_CASH: Decimal,
    y_RISK: Decimal,
    y_int_RISK: Decimal,
    B_RISK: Decimal,
    S_RISK: Decimal
) -> list[Decimal]:
    if S_CASH == ZERO:
        DCASH = - y_CASH
    else:
        DCASH = y_int_CASH*((market_price*(ONE - network_fee))**(ONE/TWO) - B_CASH*(ONE - network_fee))/(S_CASH*(ONE - network_fee)) - y_CASH
    DRISK = calculate_Dx_carbon(DCASH, y_int_CASH, S_CASH, B_CASH, y_CASH)
    return(DRISK, DCASH)

# $$
# \Delta{y} = \frac{y_{int} \sqrt{P_{m} \left( 1 - \delta\right)} - B \left(1 - \delta \right)}{S \left( 1 - \delta \right)} - y
# $$

def get_maximum_swap_carbon(
    direction: str,
    y_CASH: Decimal,
    y_int_CASH: Decimal,
    B_CASH: Decimal,
    S_CASH: Decimal,
    y_RISK: Decimal,
    y_int_RISK: Decimal,
    B_RISK: Decimal,
    S_RISK: Decimal
) -> list[Decimal]:
    if direction == 'buy':
        DRISK = - y_RISK
        DCASH = calculate_Dx_carbon(DRISK, y_int_RISK, S_RISK, B_RISK, y_RISK)
    elif direction == 'sell':
        DCASH = - y_CASH
        DRISK = calculate_Dx_carbon(DCASH, y_int_CASH, S_CASH, B_CASH, y_CASH)
    return(DRISK, DCASH)

def update_y_int_values_carbon() -> (str, Decimal, Decimal):
    y_int_update = ('', None, None)
    for y_int_updated_order in ['CASH', 'RISK']:
        y = carbon['simulation recorder'][f'{y_int_updated_order} balance'][-1]
        old_y_int = carbon['curve parameters'][y_int_updated_order]['y_int'][-1]
        new_y_int = max(y, old_y_int)
        carbon['curve parameters'][y_int_updated_order]['y_int'].append(new_y_int)
        if new_y_int > old_y_int:
            y_int_update = (y_int_updated_order, old_y_int, new_y_int)
    return(y_int_update)

def apply_trades_on_carbon(
    y_RISK: Decimal,
    y_CASH: Decimal,
    DRISK: Decimal,
    DCASH: Decimal
) -> None:
    carbon['simulation recorder']['RISK balance'].append(y_RISK + DRISK)
    carbon['simulation recorder']['CASH balance'].append(y_CASH + DCASH)

def get_carbon_protocol_fees_state() -> list[Decimal]:
    CASH_fees = carbon['simulation recorder']['CASH fees'][-1]
    RISK_fees = carbon['simulation recorder']['RISK fees'][-1]
    return(CASH_fees, RISK_fees)

def process_carbon_network_fee(
    direction: str,
    DCASH: Decimal,
    DRISK: Decimal,
    network_fee: Decimal
) -> list[Decimal]:
    CASH_fees, RISK_fees = get_carbon_protocol_fees_state()
    if direction == 'buy':
        carbon['simulation recorder']['RISK fees'].append(RISK_fees - DRISK*network_fee)
        carbon['simulation recorder']['CASH fees'].append(CASH_fees)
        risk_amount = -DRISK*(ONE - network_fee)
        cash_amount = DCASH
    elif direction == 'sell':
        carbon['simulation recorder']['RISK fees'].append(RISK_fees)
        carbon['simulation recorder']['CASH fees'].append(CASH_fees - DCASH*network_fee)
        risk_amount = DRISK
        cash_amount = -DCASH*(ONE - network_fee)
    return risk_amount, cash_amount

def perform_carbon_arbitrage(market_price: Decimal, direction: str) -> list[Decimal]:
    y_CASH, y_int_CASH, B_CASH, S_CASH, y_RISK, y_int_RISK, B_RISK, S_RISK, network_fee = get_carbon_strategy_states()
    if direction:
        trade_action, arb_function = {
            'buy' : ('bought', buy_RISK_arb_function_carbon),
            'sell' : ('sold', sell_RISK_arb_function_carbon),
        }[direction]
        DRISK, DCASH = arb_function(market_price, network_fee, y_CASH, y_int_CASH, B_CASH, S_CASH, y_RISK, y_int_RISK, B_RISK, S_RISK)
        in_range = y_RISK + DRISK >= 0 and y_CASH + DCASH >= 0
        if in_range:
            logger.info(f'There is enough liquidity to equilibrate carbon to the market price.')
        else:
            logger.info(f'The market equilibrium point is outside of the carbon range.')
            DRISK, DCASH = get_maximum_swap_carbon(direction, y_CASH, y_int_CASH, B_CASH, S_CASH, y_RISK, y_int_RISK, B_RISK, S_RISK)
            if DRISK == 0 and DCASH == 0:
                logger.info('Since the market price remains outside of the carbon range, no trade was performed.')
                final_ask, final_bid, min_bid, max_ask = get_carbon_quote('after', log_bid_and_ask = False)
        risk_amount, cash_amount = process_carbon_network_fee(direction, DCASH, DRISK, network_fee)
        apply_trades_on_carbon(y_RISK, y_CASH, DRISK, DCASH)
        logger.info(f'A total of {risk_amount:.6f} {risk_token_symbol} was {trade_action} for a total of {cash_amount:.6f} {cash_token_symbol}.')
        updates_occurred = True
        y_int_updated_order, old_y_int, new_y_int = update_y_int_values_carbon()
        if y_int_updated_order: # TODO: unmask the line below, and implement it also in the core module
            pass # logger.info(f'The y-intercept on the {y_int_updated_order} order was moved from {old_y_int:.6f} to {new_y_int:.6f}.')
        logger.info('')
        final_ask, final_bid, min_bid, max_ask = get_carbon_quote('after', log_bid_and_ask = True)
    else:
        updates_occurred = False
        y_int_updated_order = ''
        logger.info('Since carbon is at equilibrium with the market, no trade was performed.')
        final_ask, final_bid, min_bid, max_ask = get_carbon_quote('after', log_bid_and_ask = False)
    carbon_housekeeping(updates_occurred, y_int_updated_order)
    return(final_ask, final_bid, min_bid, max_ask)

def equilibrate_protocol(market_price: Decimal) -> list[Decimal]:
    current_ask, current_bid, min_bid, max_ask = get_carbon_quote('before')
    direction = get_arb_direction(market_price, current_ask, current_bid)
    final_ask, final_bid, min_bid, max_ask = perform_carbon_arbitrage(market_price, direction)
    return(final_ask, final_bid, min_bid, max_ask)

# # Simulation Functions

def start_simulation_logger(output_file_name: str) -> None:
    if output_file_name:
        logger.setLevel(logging.INFO)
        handler = logging.FileHandler(output_file_name, 'w')
        handler.setLevel(logging.INFO)
        formatter = logging.Formatter('%(message)s')
        handler.setFormatter(formatter)
        logger.addHandler(handler)

def start_simulation(config: dict) -> dict:
    global carbon
    global logger
    global cash_token_symbol
    global risk_token_symbol
    carbon = make_carbon(config)
    logger = logging.getLogger(__name__)
    cash_token_symbol = config['logging']['cash_token_symbol']
    risk_token_symbol = config['logging']['risk_token_symbol']
    start_date = config['logging']['dates'][0]
    start_simulation_logger(config['logging']['output_file_name'])
    for step, (date, price) in enumerate(zip(config['logging']['dates'], config['prices'])):
        logger.info(f'Step: {step}')
        logger.info(f'Date: {date}')
        logger.info(f'Duration: {get_simulation_timer_for_log_table(date - start_date)}')
        logger.info('')
        final_ask, final_bid, min_bid, max_ask = equilibrate_protocol(price)
        record_protocol_performance(step, date, price, final_ask, final_bid, min_bid, max_ask)
        logger.info('')
        logger.info(get_summary_for_report_log())
        logger.info('')
    return carbon

###################################################################################################

def format(values: list[Decimal]) -> list[str]:
    return [f'{value:.18f}'.rstrip('0').rstrip('.') for value in values]

def toInput(obj: dict) -> dict:
    return {
        'portfolio_cash_value'  : Decimal(obj['portfolio_cash_value'  ]),
        'portfolio_risk_value'  : Decimal(obj['portfolio_risk_value'  ]),
        'low_range_low_price'   : Decimal(obj['low_range_low_price'   ]),
        'low_range_high_price'  : Decimal(obj['low_range_high_price'  ]),
        'low_range_start_price' : Decimal(obj['low_range_start_price' ]),
        'high_range_low_price'  : Decimal(obj['high_range_low_price'  ]),
        'high_range_high_price' : Decimal(obj['high_range_high_price' ]),
        'high_range_start_price': Decimal(obj['high_range_start_price']),
        'network_fee'           : Decimal(obj['network_fee'           ]),
        'prices'                : [Decimal(x) for x in obj['prices']],
        'logging'               : {
            'output_file_name'  : obj['logging']['output_file_name' ],
            'cash_token_symbol' : obj['logging']['cash_token_symbol'],
            'risk_token_symbol' : obj['logging']['risk_token_symbol'],
            'dates'             : [Timestamp(x) for x in obj['logging']['dates']],
        } if 'logging' in obj else {
            'output_file_name'  : '',
            'cash_token_symbol' : '',
            'risk_token_symbol' : '',
            'dates'             : [Timestamp(0) for _ in obj['prices']],
        },
    }

def toOutput(obj: dict) -> dict:
    return {
        'CASH': {
            'balance'   : format(obj['simulation recorder']['CASH balance'][1:]),
            'fee'       : format(obj['simulation recorder']['CASH fees'   ][1:]),
        },
        'RISK': {
            'balance'   : format(obj['simulation recorder']['RISK balance'][1:]),
            'fee'       : format(obj['simulation recorder']['RISK fees'   ][1:]),
        },
        'min_bid'               : format(obj['simulation recorder']['min bid'                     ])[0],
        'max_bid'               : format(obj['simulation recorder']['bid upper bound'             ])[0],
        'min_ask'               : format(obj['simulation recorder']['ask lower bound'             ])[0],
        'max_ask'               : format(obj['simulation recorder']['max ask'                     ])[0],
        'bid'                   : format(obj['simulation recorder']['bid'                         ]),
        'ask'                   : format(obj['simulation recorder']['ask'                         ]),
        'hodl_value'            : format(obj['simulation recorder']['hodl value'                  ]),
        'portfolio_cash'        : format(obj['simulation recorder']['CASH portion'                ]),
        'portfolio_risk'        : format(obj['simulation recorder']['RISK portion'                ]),
        'portfolio_value'       : format(obj['simulation recorder']['portfolio value'             ]),
        'portfolio_over_hodl'   : format(obj['simulation recorder']['portfolio over hodl quotient']),
    }

def run_simulation(config: dict) -> dict:
    return toOutput(start_simulation(toInput(config)))
