## Abstract

This module allows simulating the behavior of given a Carbon strategy on a given set of market conditions.

It takes a configuration file as input, and produces a simulation file alongside an optional log file as output.

An example of the input configuration file can be found in [example_config.json](example_config.json).

An example of the output simulation file can be found in [example_output.json](example_output.json).

An example of the output log file can be found in [example_output.log](example_output.log).

You may omit the `logging` attribute in the configuration file in order to skip the log file.

The name of the input configuration file should be provided within the command-line arguments.

The name of the output simulation file should be provided within the command-line arguments.

The name of the output log file can be provided within the input configuration file.

## Execution
```
python run.py
-c <config-file-name> | --config-file-name <config-file-name>
-o <output-file-name> | --output-file-name <output-file-name>
```
