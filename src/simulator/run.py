from json import loads, dumps
from core import run_simulation
from argparse import ArgumentParser

parser = ArgumentParser()
parser.add_argument('-c', '--config-file-name', default='example_config.json')
parser.add_argument('-o', '--output-file-name', default='example_output.json')

args = parser.parse_args()
config_file_name = args.config_file_name
output_file_name = args.output_file_name

fileDesc = open(config_file_name, 'r')
config = loads(fileDesc.read())
fileDesc.close()

output = run_simulation(config)

fileDesc = open(output_file_name, 'w')
fileDesc.write(dumps(output, indent=4))
fileDesc.close()
