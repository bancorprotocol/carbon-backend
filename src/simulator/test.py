from json import dumps
from core import run_simulation as run_simulation_new
from core_org import run_simulation as run_simulation_old

config = {
    'prices': [
        '12.57',
        '12.74',
        '12.52',
        '12.67',
        '12.67',
        '12.67',
        '12.31',
        '12.35',
        '12.35',
        '12.43',
        '12.28',
        '12.34',
        '12.34',
        '12.39',
        '12.06',
        '12.11',
        '12.11',
        '12.45',
        '12.11',
        '12.28',
        '12.28',
        '12.87',
        '12.27',
        '12.64',
        '12.64',
        '13.24',
        '12.63',
        '13.0',
    ]
}

base_price = float(config['prices'][0])

for portfolio_cash_value in [0, 1000, 2000, 3000]:
    for portfolio_risk_value in [0, 1000, 2000, 3000]:
        if portfolio_cash_value + portfolio_risk_value == 0:
            continue
        for low_range_low_price in [base_price / 2, base_price, base_price * 2]:
            for low_range_high_price in [low_range_low_price, low_range_low_price * 2]:
                for low_range_start_price in set([low_range_low_price, (low_range_low_price + low_range_high_price) / 2, low_range_high_price]):
                    if portfolio_cash_value * (low_range_high_price - low_range_low_price) > 0 and low_range_start_price == low_range_low_price:
                        continue
                    for high_range_low_price in [low_range_high_price, low_range_high_price * 2]:
                        for high_range_high_price in [high_range_low_price, high_range_low_price * 2]:
                            for high_range_start_price in set([high_range_low_price, (high_range_low_price + high_range_high_price) / 2, high_range_high_price]):
                                if portfolio_risk_value * (high_range_high_price - high_range_low_price) > 0 and high_range_start_price == high_range_high_price:
                                    continue
                                for network_fee in [0, 1000, 2000]:
                                    config['portfolio_cash_value'  ] = str(portfolio_cash_value  )
                                    config['portfolio_risk_value'  ] = str(portfolio_risk_value  )
                                    config['low_range_low_price'   ] = str(low_range_low_price   )
                                    config['low_range_high_price'  ] = str(low_range_high_price  )
                                    config['low_range_start_price' ] = str(low_range_start_price )
                                    config['high_range_low_price'  ] = str(high_range_low_price  )
                                    config['high_range_high_price' ] = str(high_range_high_price )
                                    config['high_range_start_price'] = str(high_range_start_price)
                                    config['network_fee'           ] = str(network_fee / 1000000 )
                                    print(dumps({key: val for key, val in config.items() if type(val) is str}, indent=4))
                                    new_output = dumps(run_simulation_new(config), indent=4)
                                    old_output = dumps(run_simulation_old(config), indent=4)
                                    assert new_output == old_output, f'\nnew_output = {new_output}\nold_output = {old_output}'
