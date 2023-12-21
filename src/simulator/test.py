from json import loads, dumps
from core import run_simulation, Decimal
from importlib import import_module, reload

fileDesc = open('legacy_config.json', 'r')
legacy_config = loads(fileDesc.read())
fileDesc.close()

fileDesc = open('example_config.json', 'r')
example_config = loads(fileDesc.read())
fileDesc.close()

INCREMENTS = [0, 14, 27]

PARAMETERS = [
    'portfolio_cash_value',
    'portfolio_risk_value',
    'low_range_low_price',
    'low_range_high_price',
    'low_range_start_price',
    'high_range_low_price',
    'high_range_high_price',
    'high_range_start_price',
    'network_fee'
]

def increment(param, percent):
    return str(Decimal(example_config[param]) * (percent + 100) / 100)

def legal(config):
    return \
        Decimal(config['low_range_low_price']) <= \
        Decimal(config['low_range_start_price']) <= \
        Decimal(config['low_range_high_price']) <= \
        Decimal(config['high_range_low_price']) <= \
        Decimal(config['high_range_start_price']) <= \
        Decimal(config['high_range_high_price'])

def display(title, count, values):
    info = ', '.join(f'{value}%' for value in values)
    print(f'{title} configuration {count} ({info})')

legacy_config['base filename'] = []
core_org = import_module('core_org')

for n in range(len(INCREMENTS) ** len(PARAMETERS)):
    percents = [INCREMENTS[n // len(INCREMENTS) ** i % len(INCREMENTS)] for i in range(len(PARAMETERS))]
    new_config = {param: increment(param, percents[index]) for index, param in enumerate(PARAMETERS)}
    if legal(new_config):
        display('legal', n, percents)
        new_config['prices'] = example_config['prices']
        legacy_config['starting portfolio valuation'][0] = new_config['portfolio_cash_value']
        legacy_config['starting portfolio valuation'][1] = new_config['portfolio_risk_value']
        legacy_config['carbon order boundaries'][0] = new_config['high_range_high_price']
        legacy_config['carbon order boundaries'][1] = new_config['high_range_low_price']
        legacy_config['carbon order boundaries'][2] = new_config['low_range_high_price']
        legacy_config['carbon order boundaries'][3] = new_config['low_range_low_price']
        legacy_config['carbon starting prices'][0] = new_config['high_range_start_price']
        legacy_config['carbon starting prices'][1] = new_config['low_range_start_price']
        legacy_config['protocol fees'][0] = new_config['network_fee']
        old_output = reload(core_org).run_simulation(legacy_config)
        new_output = run_simulation(new_config)
        assert dumps(old_output) == dumps(new_output)
    else:
        display('illegal', n, percents)
