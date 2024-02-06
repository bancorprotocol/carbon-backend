from pandas import Timestamp
from tabulate import tabulate

def create_logger(config: dict):
    return RealLogger(config) if config else FakeLogger()

class RealLogger:
    def __init__(self, config: dict):
        cash_token_symbol = config['cash_token_symbol']
        risk_token_symbol = config['risk_token_symbol']

        self.messages = {
            'can_be_sold': f'- {risk_token_symbol} can be sold for {{}} {cash_token_symbol} per unit\n',
            'can_be_bought': f'- {risk_token_symbol} can be bought for {{}} {cash_token_symbol} per unit\n',
            'can_still_be_sold': f'- {risk_token_symbol} can still be sold for {{}} {cash_token_symbol} per unit\n',
            'can_still_be_bought': f'- {risk_token_symbol} can still be bought for {{}} {cash_token_symbol} per unit\n',
            'cannot_be_sold': f'- {risk_token_symbol} cannot be sold; strategy has run out of {cash_token_symbol}\n',
            'cannot_be_bought': f'- {risk_token_symbol} cannot be bought; strategy has run out of {cash_token_symbol}\n',
            'total_sold': f'A total of {{}} {risk_token_symbol} was sold for a total of {{}} {cash_token_symbol}.\n',
            'total_bought': f'A total of {{}} {risk_token_symbol} was bought for a total of {{}} {cash_token_symbol}.\n',
            'market_price': f'The market price of {risk_token_symbol} is {{}} {cash_token_symbol} per unit.\n',
            'within_the_spread': f'Since this price is within the spread, the arbitrageur will not attempt to trade {risk_token_symbol}.\n',
            'arbitrageur_attempt': f'Since this price is not within the spread, the arbitrageur will attempt to {{}} {risk_token_symbol}.\n'
        }

        self.attributes = [
            f'{risk_token_symbol} balance',
            f'{cash_token_symbol} balance',
            f'{risk_token_symbol} protocol-owned fees',
            f'{cash_token_symbol} protocol-owned fees',
            f'{risk_token_symbol} market price',
            f'{cash_token_symbol} portfolio value',
            f'{cash_token_symbol} hodl value',
            'portfolio versus hodl'
        ]

        self.notes = [
            f'The liquidity of {risk_token_symbol}',
            f'The liquidity of {cash_token_symbol}',
            f'Not part of the user portfolio performance calculation',
            f'Not part of the user portfolio performance calculation',
            f'The market price of {risk_token_symbol} in {cash_token_symbol} units at the current step of the simulation',
            f'`user-owned {cash_token_symbol}` + `user-owned {risk_token_symbol}` * `market price of {risk_token_symbol}`',
            f'The user portfolio value in {cash_token_symbol} units if they did not create this strategy',
            '(`portfolio value` - `hodl value`) / `hodl value` * 100'
        ]

        self.dates = [Timestamp(date) for date in config['dates']]
        self.output_file = open(config['output_file_name'], 'w')

    def update_before(self, recorder: dict, step: int, price: any, bid: any, ask: any):
        time_delta = self.dates[step] - self.dates[0]
        years, days = divmod(time_delta.days, 365)
        months, days = divmod(days, 30)
        weeks, days = divmod(days, 7)
        hours = time_delta.components.hours
        minutes = time_delta.components.minutes

        components = [
            (years, 'year'),
            (months, 'month'),
            (weeks, 'week'),
            (days, 'day'),
            (hours, 'hour'),
            (minutes, 'minute')
        ]

        duration = ', '.join(f'{value} {unit}s' if value > 1 else f'{value} {unit}' for value, unit in components if value > 0)

        self.output_file.write(f'Step: {step}\n')
        self.output_file.write(f'Date: {self.dates[step]}\n')
        self.output_file.write(f'Duration: {duration if duration else "none"}\n\n')

        self.output_file.write('Marginal price quotes before arbitrage:\n')
        self._update_quotes(recorder, bid, ask)

        self.output_file.write(self.messages['market_price'].format(f'{price:.6f}'))
        if price > ask:
            self.output_file.write(self.messages['arbitrageur_attempt'].format('buy'))
        elif price < bid:
            self.output_file.write(self.messages['arbitrageur_attempt'].format('sell'))
        else:
            self.output_file.write(self.messages['within_the_spread'])

    def update_after(self, recorder: dict, details: dict, price: any, bid: any, ask: any):
        if details:
            if details['out_of_range']['before']:
                self.output_file.write('The market equilibrium point is outside of the carbon range.\n')
                if details['out_of_range']['after']:
                    self.output_file.write('Since the market price remains outside of the carbon range, no trade was performed.\n')
            else:
                self.output_file.write('There is enough liquidity to equilibrate carbon to the market price.\n')
            action, risk, cash = [details[key] for key in ['action', 'RISK', 'CASH']]
            self.output_file.write(self.messages[f'total_{action}'].format(f'{risk:.6f}', f'{cash:.6f}'))
            self.output_file.write('\nMarginal price quotes after arbitrage:\n')
            self._update_quotes(recorder, bid, ask)
        else:
            self.output_file.write('Since carbon is at equilibrium with the market, no trade was performed.\n\n')

        portfolio_over_hodl = recorder['portfolio_over_hodl'][-1]
        sign = '+' if portfolio_over_hodl > 0 else '-' if portfolio_over_hodl < 0 else ' '

        values = [
            f"{recorder['RISK']['balance'][-1]:.18f}",
            f"{recorder['CASH']['balance'][-1]:.18f}",
            f"{recorder['RISK']['fee'][-1]:.18f}",
            f"{recorder['CASH']['fee'][-1]:.18f}",
            f"{price:.18f}",
            f"{recorder['portfolio_value'][-1]:.18f}",
            f"{recorder['hodl_value'][-1]:.18f}",
            f"{sign}{portfolio_over_hodl:.17f}%"
        ]

        summary = tabulate(
            list(zip(self.attributes, values, self.notes)),
            headers=('Attribute', 'Value', 'Note'),
            tablefmt='outline',
            colalign=('left', 'right', 'left')
        )

        self.output_file.write(f'{summary}\n\n')

    def close(self):
        self.output_file.close()

    def _update_quotes(self, recorder: dict, bid: any, ask: any):
        if recorder['CASH']['balance'][-1] == 0:
            self.output_file.write(self.messages['cannot_be_sold'])
            self.output_file.write(self.messages['can_still_be_bought'].format(f'{ask:.6f}'))
        elif recorder['RISK']['balance'][-1] == 0:
            self.output_file.write(self.messages['cannot_be_bought'])
            self.output_file.write(self.messages['can_still_be_sold'].format(f'{bid:.6f}'))
        else:
            self.output_file.write(self.messages['can_be_sold'].format(f'{bid:.6f}'))
            self.output_file.write(self.messages['can_be_bought'].format(f'{ask:.6f}'))
        self.output_file.write('\n')

class FakeLogger:
    def update_before(*_): pass
    def update_after(*_): pass
    def close(*_): pass
