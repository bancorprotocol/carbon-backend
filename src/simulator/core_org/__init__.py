from __future__ import annotations

import re
import math
import pickle
import hashlib
import logging
import requests
# import operator
import itertools

import numpy as np
import pandas as pd
import mplfinance as mpf
import matplotlib as mpl

import matplotlib.pyplot as plt
import matplotlib.lines as mlines
import matplotlib.dates as mdates
import matplotlib.patheffects as pe
import matplotlib.patches as mpatches
import matplotlib.font_manager as font_manager

from matplotlib.cm import get_cmap
from matplotlib.animation import FuncAnimation
from matplotlib.ticker import ScalarFormatter, PercentFormatter, MaxNLocator, FixedLocator, FixedFormatter, FuncFormatter, LinearLocator

from typing import Tuple, List, Union, Dict, Any, Type, Callable
from datetime import datetime, timedelta
from tabulate import tabulate
from itertools import product

from decimal import *
getcontext().prec = 100
getcontext().rounding = ROUND_HALF_DOWN

import ipywidgets as widgets
from ipywidgets import interact, FloatSlider, Button, VBox, Output, HBox, Checkbox, interactive_output
from IPython.display import display, clear_output

# # Globals

moai = """
                                                                                
                                                                                
                                                                                
                                                                                
                          ,(&@(,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,                  
                   ,%@@@@@@@@@@,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,.                 
              @@@@@@@@@@@@@@@@@&,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,.                
              @@@@@@@@@@@@@@@@@@/,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,                
              @@@@@@@@@@@@@@@@@@@,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,               
              @@@@@@@@@@@@@@@@@@@%,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,              
              @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@.              
              @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@.                
          (((((((((&@@@@@@@@@@@@@@@@@@@@@@@@@@@(,,,,,,,%@@@@@,                  
          (((((((((@@@@@@@@@@@@@@@@@@@@@@@@@@((((,,,,,,,#@@.                    
         ,((((((((#@@@@@@@@@@@/////////////((((((/,,,,,,,,                      
         *((((((((#@@@@@@@@@@@#,,,,,,,,,,,,/((((((/,,,,,,,,                     
         /((((((((#@@@@@@@@@@@@*,,,,,,,,,,,,(((((((*,,,,,,,,                    
         (((((((((%@@@@@@@@@@@@&,,,,,,,,,,,,/(((((((,,,,,,,,,.                  
        .(((((((((&@@@@@@@@@@@@@/,,,,,,,,,,,,((((((((,,,,,,,,,,                 
        *(((((((((@@@@@@@@@@@@@@@,,,,,,,,,,,,*((((((((,,,,,,,,,,                
        /((((((((#@@@@@@@@@@@@@@@@/,,,,,,,,,,,((((((((/,,,,,,,,,,.              
        (((((((((%@@@@@@@@@@@@@@@@@(,,,,,,,,,,*((((((((/,,,,,,,,,,,             
        (((((((((%@@@@@@@@@@@@@@@@@@%,,,,,,,,,,(((((((((*,,,,,,,,,,,            
       ,(((((((((&@@@@@@@@@@@@@@@@@@@&,,,,,,,,,*(((((((((*,,,,,,,,,,,.          
       ((((((((((@@@@@@@@@@@@@@@@@@@@@@*,,,,,,,,((((((((((,,,,,,,,,,,,,         
       ((((((((((@@@@@@@@@@@@@@@@@@@@@@@(,,,,,,,*((((((((((,,,,,,,,,,,,,        
       (((((((((#@@@@@@@@@@@@&#(((((((((/,,,,,,,,/((((((((((,,,,,,,,,,,,,       
       %@@@@@@@@@@@@@@@@@@((((((((((((((/,,,,,,,,*(((((((#&@@@@@@@@@@@@@.       
        &@@@@@@@@@@@@@@@@@@#((((((((((((*,,,,,,,,,/((((%@@@@@@@@@@@@@%          
         &@@@@@@@@@@@@@@@@@@%(((((((((((*,,,,,,,,,*(#@@@@@@@@@@@@@@*            
         /@@@@@@@@@@@@@@@@@@@%((((((((((*,,,,,,,,,,,,,,,,,,,,,,,,,              
         %@@@@@@@@@@@@@@@@@@@@&(((((((((*,,,,,,,,,,,,,,,,,,,,,,,,,,             
         @@@@@@@@@@@@@@@@@@@@@@@((((((((,,,,,,,,,,,,,,,,,,,,,,,,,,,,            
        ,@@@@@@@@@@@@@@@@@@@@@@@@#((((((,,,,,,,,,,,,,,,,,,,,,,,,,,,,,           
        #@@@@@@@@@@@@@@@@@@@@@@@@@#(((((,,,,,,,,,,,,,,,,,,,,,,,,,,,,,.          
        &@@@@@@@@@@@@@@@@@@@@@@@@@@%((((,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,          
        @@@@@@@@@@@@@@@@@@@@@@@@@@@@&(((,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,         
       (@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@((,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,        
       MB@RICHARDSON@BANCOR@(2023)@@@@@/,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,       
"""

GT_America_Mono_Regular = font_manager.FontProperties(fname='fonts/GT-America-Mono-Regular.ttf')
GT_America_Standard_Light = font_manager.FontProperties(fname='fonts/GT-America-Standard-Light.ttf')
GT_America_Extended_Medium = font_manager.FontProperties(fname='fonts/GT-America-Extended-Medium.ttf')

SMALL = Decimal('10')**(Decimal('-48'))
ZERO = Decimal('0')
ONE = Decimal('1')
TWO = Decimal('2')
THREE = Decimal('3')
FOUR = Decimal('4')
FIVE = Decimal('5')
SIX = Decimal('6')
SEVEN = Decimal('7')
EIGHT = Decimal('8')
NINE = Decimal('9')
TEN = Decimal('10')

PRICE_DATA = [] 
DATES = []
TOKEN_PAIR = {
    'RISK' : '',
    'CASH' : ''
}
SIMULATION_LENGTH = 0
SIMULATION_STEP = -1
MARKETPRICE = 0
UNISWAP_V2_ARB_ITERATIONS = 10
# IMAGE_QUALITY = 300

uniswap_v2 = {'curve parameters' : {}, 'simulation recorder' : {}}
uniswap_v3 = {'curve parameters' : {}, 'simulation recorder' : {}}
carbon = {'curve parameters' : {}, 'simulation recorder' : {}}

start_information = {}

PROTOCOLS = {
    'uniswap_v2' : uniswap_v2,
    'uniswap_v3' : uniswap_v3,
    'carbon' : carbon
}

TIME_SUBDIVISIONS = {
    'minute': 60,
    'hour': 3600,
    'day': 86400
    }

COMMON_COINS_DISAMBIGUATION = {'CoinGecko' : {'ETH': 'ethereum', 'BTC': 'bitcoin', 'DAI': 'dai', 'USDC': 'usd-coin', 'BNB': 'binancecoin', 'CAKE': 'pancakeswap', 'SOL': 'solana', 'PEPE' : 'pepe', 
                                              'GEAR' : 'gearbox', 'UNI' : 'uniswap', 'RUNE' : 'thorchain', 'SHIB' : 'shiba-inu', 'USDP' : 'paxos-standard', 'OHM' : 'olympus', 'LUNC' : 'terra-luna', 
                                              'LUSD' : 'liquity-usd', 'ICHI' : 'ichi-farm', 'HEX' : 'hex', 'SNX' : 'havven', 'FTT' : 'ftx-token', 'EDEN' : 'eden', 'DYDX' : 'dydx', 'MANA' : 'decentraland', 
                                              'DAO' : 'dao-maker', 'DSD' : 'dynamic-set-dollar', 'CREAM' : 'cream-2', 'MAGIC' : 'magic', 'COMP' : 'compound-governance-token', 'XRP' : 'ripple', 'DOT' : 'polkadot', 
                                              'LTC' : 'litecoin', 'FIL' : 'filecoin', 'EOS' : 'eos', 'DOGE' : 'dogecoin', 'ADA' : 'cardano', 'BCH' : 'bitcoin-cash', 'ELF' : 'aelf', 'MPH' : '88mph', 
                                              'GRT' : 'the-graph', 'RETH' : 'rocket-pool-eth'},

                           'CoinMarketCap' : {'ETH': 1027, 'BTC': 1, 'DAI': 4943, 'USDC': 3408, 'BNB': 1839, 'CAKE': 7186, 'SOL': 5426, 'PEPE' : 24478, 'GEAR' : 16360, 'UNI' : 7083, 'RUNE' : 4157, 
                                              'SHIB' : 5994, 'USDP' : 3330, 'OHM' : 9067, 'LUNC' : 4172, 'LUSD' : 9566, 'ICHI' : 7726, 'HEX' : 5015, 'SNX' : 2586, 'FTT' : 4195, 'EDEN' : 7750, 'DYDX' : 11156, 
                                              'MANA' : 1966, 'DAO' : 8420, 'DSD' : 8106, 'CREAM' : 6193, 'MAGIC' : 14783, 'COMP' : 5692, 'XRP' : 52, 'DOT' : 6636, 'LTC' : 2, 'FIL' : 2280, 'EOS' : 1765, 
                                              'DOGE' : 74, 'ADA' : 2010, 'BCH' : 1831, 'ELF' : 2299, 'MPH' : 7742, 'GRT' : 6719, 'RETH' : 15060}} 

COINGECKO_API_BASE_URL = "https://api.coingecko.com/api/v3"
COINGECKOPRO_API_BASE_URL = "https://pro-api.coingecko.com/api/v3"
COINMARKETCAP_API_BASE_URL = "https://pro-api.coinmarketcap.com/v1"
CRYPTOCOMPARE_API_BASE_URL = "https://min-api.cryptocompare.com/data/v2/histo"
CRYPTOCOMPARE_API_DATA_LIMIT = 2000

def load_and_print_key(
    file_name: str, 
    service_name: str
    ) -> None:
    """
    Loads the secret key from the specified file and prints its SHA-1 digest.

    ## Parameters:
    | Parameter Name  | Type    | Description                                             |
    |:----------------|:--------|:--------------------------------------------------------|
    | `file_name`     | `str`   | The name of the file containing the secret key.         |
    | `service_name`  | `str`   | The name of the service associated with the secret key. |
    
    ## Returns:
    None

    ## Dependencies:
    | Dependency name | Type      | Description                                                 |
    |:----------------|:----------|:------------------------------------------------------------|
    | `hashlib`       | `module`  | A module providing various hash functions, including SHA-1. |
    | `pickle`        | `module`  | A module for serializing and deserializing Python objects.  |

    ## Example:
    >>> load_and_print_key('secret_CryptoCompare_api_key.pickle', 'CryptoCompare')
    CryptoCompare key digest: <SHA-1 digest>
    """
    with open(file_name, 'rb') as file:
        secret_key = pickle.load(file)
        if secret_key:
            key_digest = hashlib.sha1(secret_key.encode()).hexdigest()
            print(f"{service_name} key digest:", key_digest)
    return(secret_key)

secret_CryptoCompare_api_key = '0x5a5a5a5a5a' # load_and_print_key('secret_CryptoCompare_api_key.pickle', 'CryptoCompare')
secret_CoinMarketCap_api_key = '0x6b6b6b6b6b' # load_and_print_key('secret_CoinMarketCap_api_key.pickle', 'CoinMarketCap')
secret_CoinGecko_api_key = '0x7c7c7c7c7c' # load_and_print_key('secret_CoinGecko_api_key.pickle', 'CoinGecko')

# # Simulation Environment Builders

# ## Making the system

# #### Uniswap v2 maker

def calculate_hyperbolic_constant_k(
    x: Decimal,
    y: Decimal
    ) -> Decimal:
    """
    ### Calculates the hyperbolic constant `k` given `x` and `y` values.

    ## Parameters:
    | Parameter Name | Type      | Description                                                                                                                |
    |:---------------|:----------|:---------------------------------------------------------------------------------------------------------------------------|
    | `x`            | `Decimal` | The `x` value; the true `RISK` balance for `uniswap_v2`, or the `RISK_0` constant for `uniswap_v3`, or `x_0` for `carbon`. |
    | `y`            | `Decimal` | The `y` value; the true `CASH` balance for `uniswap_v2`, or the `CASH_0` constant for `uniswap_v3`, or `y_0` for `carbon`. |

    ## Returns:
    | Return Name | Type      | Description                             |
    |:------------|:----------|:----------------------------------------|
    | `k`         | `Decimal` | The calculated hyperbolic constant 'k'. |
    
    ## Notes:
    - For `uniswap_v2`, `x` and `y` are the literal token balances of the protocol, and the `k` value grows over time due to fee accrual.
    - For `uniswap_v3`, `x` and `y` are the `RISK_0` and `CASH_0` constants, respectively. 
    - As `uniswap_v3` fee accrual occurs outside of the trading liquidity, its `k` value is unchanged throughout the simulation, save for deliberate modifications to the token balances of the trading liquidity of the position.
    - For `carbon` `x` and `y` are the pairs of constants `(x_0_RISK, y_0_RISK)` and `(x_0_CASH, y_0_CASH)`.
    - Due to the asymmetry of `carbon`, bonding curves will grow as strategies evolve (i.e. as `y_int` is updated).
    - Therefore, growth in the `k` value of a `carbon` bonding curve is expected behavior.
    """   
    k = x*y
    return(k)

def get_univ2_start_state(
    starting_portfolio_value: Decimal
    ) -> Tuple[Decimal, Decimal]:
    """
    ### Calculates the starting values of the `CASH` and `RISK` balances, and their hyperbolic consatnt `k`, for the `uniswap_v2` protocol.
    
    ## Parameters:
    | Parameter name                  | Type      | Description                                                |
    |:--------------------------------|:----------|:-----------------------------------------------------------|
    | `starting_portfolio_value`      | `Decimal` | The starting value of the portfolio in `CASH`.             |
    
    ## Returns:
    | Return name | Type                               | Description                                                |
    |:------------|:-----------------------------------|:-----------------------------------------------------------|
    | `CASH`      | `Decimal`                          | The starting `CASH` balance of the `uniswap_v2` protocol.  |
    | `RISK`      | `Decimal`                          | The starting `RISK` balance of the `uniswap_v2` protocol.  |
    | `k`         | `Decimal`                          | The fundamental hyperbolic constant.                       |
    |             | `Tuple[Decimal, Decimal, Decimal]` | A tuple of `CASH` and `RISK` (in that order).              |

    ## Dependencies:
    | Dependency name                   | Type       | Description                                                                                        |
    |:----------------------------------|:-----------|:---------------------------------------------------------------------------------------------------|
    | `MARKETPRICE`                     | `Decimal`  | A `global` variable representing the current market price of `RISK` in units of `CASH` per `RISK`. |
    | `calculate_hyperbolic_constant_k` | `function` | Calculate the hyperbolic constant `k` given `x` and `y` values.                                    |
    """
    global MARKETPRICE
    CASH = starting_portfolio_value/TWO
    RISK = CASH/MARKETPRICE
    k = calculate_hyperbolic_constant_k(RISK, CASH)
    return(CASH, RISK, k)

def get_uniswap_v2_dict(
    CASH: Decimal, 
    RISK: Decimal,
    k: Decimal, 
    fee: Decimal
    ) -> None:
    """
    ### Adds the appropriate information to the `uniswap_v2` protocol in the `PROTOCOLS` dictionary.
    
    ## Parameters:
    | Parameter Name        | Type        | Description                                                         |
    |:----------------------|:------------|:--------------------------------------------------------------------|
    | `CASH`                | `Decimal`   | The starting amount of `CASH` in the portfolio.                     |
    | `RISK`                | `Decimal`   | The starting amount of the `RISK` token in the portfolio.           |
    | `k`                   | `Decimal`   | The fundamental hyperbolic constant.                                |
    | `fee`                 | `Decimal`   | The fee for the trade, represented as a decimal (e.g. 0.05 for 5%). |
    
    ## Returns:
    None
    
    ## Dependencies:
    | Dependency name                   | Type       | Description                                                                                                                           |
    |:----------------------------------|:-----------|:--------------------------------------------------------------------------------------------------------------------------------------|
    | `MARKETPRICE`                     | `Decimal`  | A `global` variable representing the current market price of `RISK` in units of `CASH` per `RISK`.                                    |
    | `PROTOCOLS`                       | `dict`     | A `global` dictionary with each of the protocol name strings as keys, and the appropriate protocol dictionaries themselves as values. |
    | `calculate_hyperbolic_constant_k` | `function` | Calculate the hyperbolic constant `k` given `x` and `y` values.                                                                       |
    """
    global MARKETPRICE
    global PROTOCOLS
    
    PROTOCOLS['uniswap_v2']['curve parameters'] = {
        'date' : [pd.Timestamp('2009-01-03 18:15:05')],
        "k" : [k],
        "fee" : [fee]
        }
    
    PROTOCOLS['uniswap_v2']['simulation recorder'] = {
        'simulation step' : [], 
        'date' : [], 
        'RISK price' : [], 
        'CASH balance' : [CASH],
        'RISK balance' : [RISK],
        'ask' : [],
        'max ask' : [],
        'bid': [],
        'min bid' : [],
        'CASH portion' : [], 
        'RISK portion' :[], 
        'hodl value' : [], 
        'RISK fees' : [ZERO],
        'CASH fees' : [ZERO],
        'portfolio value' : [], 
        'portfolio over hodl quotient' : [] 
        }
    return(None)

def make_uniswap_v2(
    start_information: dict
    ) -> None:
    """
    ### Initializes the `uniswap_v2` protocol in the `PROTOCOLS` dictionary using user-provided starting information.

    ## Parameters:
    | Parameter Name      | Type   | Description                                                             |
    |:--------------------|:-------|:------------------------------------------------------------------------|
    | `start_information` | `dict` | A dictionary containing simulation settings and parameters, as follows: |

    ## Parameters Dictionary:
    | Key                                        | Key Type | Value                                                                                                                                                                                 | Value Type        |
    |:-------------------------------------------|:---------|:--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|:------------------|
    | base filename                              | `str`    | Named for its token pair and date range e.g. ['RISK=USDC_CASH=USDT_startUNIX=1678366800_endUNIX=1678798800']                                                                          | `list[str]`       |
    | token pair                                 | `str`    | A dictionary containing the token tickers e.g. 'CASH' : 'ETH', 'RISK' : 'LINK'                                                                                                        | `Dict[str, str]`  |
    | price chart                                | `str`    | A list of Decimal objects, representing prices in units of CASH per RISK.                                                                                                             | `list[Decimal]`   |
    | price chart dates                          | `str`    | A list of Timestamp objects, representing the dates and times for each of the prices in the 'price chart'                                                                             | `list[Timestamp]` |
    | uniswap range boundaries                   | `str`    | The two (2) price bounds which enclose a single active region for the uniswap v3 strategy.                                                                                            | `list[Decimal]`   |
    | carbon order boundaries                    | `str`    | The four (4) price bounds that enclose two separate liquidity regions, which comprise a carbon strategy.                                                                              | `list[Decimal]`   |
    | carbon starting prices                     | `str`    | The two (2) marginal price values, within their respective bounds, which dictate the first available prices on the carbon strategy.                                                   | `list[Decimal]`   |
    | carbon order weights                       | `str`    | The relative weights of the RISK and CASH components of the carbon strategy, in that order, and in terms of their CASH value.                                                         | `list[Decimal]`   |
    | protocol fees                              | `str`    | The user-selected protocol fee, used on all three protocols (0.00001 <= fee <= 0.01; 1 bps <= fee <= 1000 bps; 0.01% <= fee <= 1%).                                                   | `list[Decimal]`   |
    | starting portfolio valuation               | `str`    | The total CASH valuation of all protocol portfolios at the start of the simulation.                                                                                                   | `list[Decimal]`   |
    | protocol list                              | `str`    | The specific protocols to be included in this simulation.                                                                                                                             | `list[str]`       |
    | depth chart animation boolean              | `str`    | `True` if the simulation should be composed into an animated `.mp4` file depicting the depth chart and saved locally for each protocol in the 'protocol list.                         | `bool`            |
    | invariant curve animation boolean          | `str`    | `True` if the simulation should be composed into an animated `.mp4` file depicting the invariant curve and saved locally for each protocol in the 'protocol list.                     | `bool`            |
    | token balance cash basis animation boolean | `str`    | `True` if the simulation should be composed into an animated `.mp4` file depicting the portfolio composition in CASH basis and saved locally for each protocol in the 'protocol list. | `bool`            |
    | summary boolean                            | `str`    | `True` if a summary plot of the simulation should be composed into a `.png` file and saved locally for each protocol in the 'protocol list'.                                          | `bool`            |
    
    ## Returns:
    None
    
    ## Dependencies:
    | Dependency name         | Type       | Description                                                                                  |
    |:------------------------|:-----------|:---------------------------------------------------------------------------------------------|
    | `get_univ2_start_state` | `function` | Calculates the starting balances of CASH and RISK in the Uniswap V2 portfolio.               |
    | `get_uniswap_v2_dict`   | `function` | Adds the appropriate information to the 'uniswap_v2' protocol in the 'protocols' dictionary. |
    """
    starting_portfolio_value = start_information['starting portfolio valuation'][0]
    fee = start_information['protocol fees'][0]
    CASH, RISK, k = get_univ2_start_state(starting_portfolio_value)
    get_uniswap_v2_dict(CASH, RISK, k, fee)
    return(None)

# #### Concentrated Liquidity Curve Constants

def calculate_concentrated_liquidity_B_constant(
    P_b: Decimal
    ) -> Decimal:
    """
    ### Calculates the `B` value for a concentrated liquidity protocol (i.e `carbon` or `uniswap_v3`).

    ## Parameters:
    | Parameter name | Type      | Description                                  |
    |:---------------|:----------|:---------------------------------------------|
    | `P_b`          | `Decimal` | The low price bound for the position.        |
    
    ## Returns:
    | Return name   | Type           | Description                                                            |
    |:--------------|:---------------|:-----------------------------------------------------------------------|
    | `B`           | `Decimal`      | The calculated `B` value, `√(P_b)`. Refer to the Carbon whitepaper.    |

    ## Example:
    >>> calculate_concentrated_liquidity_B_constant(Decimal('1.23'))
    Decimal('1.109053650640941882342678329')
    
    ## Notes:
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    """
    B = P_b**(ONE/TWO)
    return(B)

def calculate_concentrated_liquidity_P_constant(
    P_a: Decimal,
    P_b: Decimal
    ) -> Decimal:
    """
    ### Calculates the `P` value for a concentrated liquidity protocol (i.e `carbon` or `uniswap_v3`).

    ## Parameters:
    | Parameter name | Type      | Description                                  |
    |:---------------|:----------|:---------------------------------------------|
    | `P_a`          | `Decimal` | The high price bound for the position.       |
    | `P_b`          | `Decimal` | The low price bound for the position.        |

    ## Returns:
    | Return name | Type      | Description                                                                                                     |
    |:------------|:----------|:----------------------------------------------------------------------------------------------------------------|
    | `P`         | `Decimal` | The calculated `P` value, which is the geometric mean of the price bounds `P_a` and `P_b` (i.e., `√(P_a*P_b)`). |

    ## Example:
    >>> calculate_concentrated_liquidity_P_constant(Decimal('2'), Decimal('0.5'))
    Decimal('1')
    
    ## Notes:
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    """
    P = (P_a*P_b)**(ONE/TWO)
    return(P)

def calculate_concentrated_liquidity_Q_constant(
    P_a: Decimal,
    P_b: Decimal
    ) -> Decimal:
    """
    ### Calculates the `Q` value for a concentrated liquidity protocol (i.e `carbon` or `uniswap_v3`).

    ## Parameters:
    | Parameter name | Type      | Description                                  |
    |:---------------|:----------|:---------------------------------------------|
    | `P_a`          | `Decimal` | The high price bound for the position.       |
    | `P_b`          | `Decimal` | The low price bound for the position.        |

    ## Returns:
    | Return name | Type      | Description                                                                                             |
    |:------------|:----------|:--------------------------------------------------------------------------------------------------------|
    | `Q`         | `Decimal` | The calculated `Q` value, which is the square root of the ratio of `P_b` to `P_a` (i.e., `√(P_b/P_a)`). |

    ## Example:
    >>> calculate_concentrated_liquidity_Q_constant(Decimal('2'), Decimal('0.5'))
    Decimal('0.5')
    
    ## Notes:
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    """
    Q = (P_b/P_a)**(ONE/TWO)
    return(Q)

def calculate_concentrated_liquidity_R_constant(
    P_a: Decimal,
    P_b: Decimal
    ) -> Decimal:
    """
    ### Calculates the `R` value for a concentrated liquidity protocol (i.e `carbon` or `uniswap_v3`).

    ## Parameters:
    | Parameter name | Type      | Description                                  |
    |:---------------|:----------|:---------------------------------------------|
    | `P_a`          | `Decimal` | The high price bound for the position.       |
    | `P_b`          | `Decimal` | The low price bound for the position.        |

    ## Returns:
    | Return name | Type      | Description                                                                                                  |
    |:------------|:----------|:-------------------------------------------------------------------------------------------------------------|
    | `R`         | `Decimal` | The calculated `R` value, which is the fourth root of the ratio of `P_a` to `P_b` (i.e., `(P_a/P_b)^(1/4)`). |

    ## Example:
    >>> calculate_concentrated_liquidity_R_constant(Decimal('2'), Decimal('0.5'))
    Decimal('1.414213562373095048801688724209698078569671875376948073176679737990732478462107038850387534327641573')
    
    ## Notes:
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    """
    R = (P_a/P_b)**(ONE/FOUR)
    return(R)

def calculate_concentrated_liquidity_S_constant(
    P_a: Decimal, 
    P_b: Decimal
    ) -> Decimal:
    """
    ### Calculates the `B` value for a concentrated liquidity protocol (i.e `carbon` or `uniswap_v3`).

    ## Parameters:
    | Parameter name | Type      | Description                                  |
    |:---------------|:----------|:---------------------------------------------|
    | `P_a`          | `Decimal` | The high price bound for the position.       |
    | `P_b`          | `Decimal` | The low price bound for the position.        |

    ## Returns:
    | Return name | Type      | Description                                                                        |
    |:------------|:----------|:-----------------------------------------------------------------------------------|
    | `S`         | `Decimal` | The calculated `S` value, `sqrt(P_a) - sqrt(P_b)`. Refer to the Carbon whitepaper. |

    ## Example:
    >>> calculate_S_carbon(Decimal('0.2'), Decimal('0.1'))
    Decimal('0.1942306068966239826491854345')
    
    ## Notes:
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    """
    S = P_a**(ONE/TWO) - P_b**(ONE/TWO)
    return(S)

def calculate_concentrated_liquidity_n_constant(
    P_a: Decimal,
    P_b: Decimal
    ) -> Decimal:
    """
    ### Calculates the `n` value for a concentrated liquidity protocol (i.e `carbon` or `uniswap_v3`).

    ## Parameters:
    | Parameter name | Type      | Description                                  |
    |:---------------|:----------|:---------------------------------------------|
    | `P_a`          | `Decimal` | The high price bound for the position.       |
    | `P_b`          | `Decimal` | The low price bound for the position.        |

    ## Returns:
    | Return name | Type      | Description                                                                                                |
    |:------------|:----------|:-----------------------------------------------------------------------------------------------------------|
    | `n`         | `Decimal` | The calculated `n` value, which is `1 - (P_b/P_a)^(1/4)` Refer to the Carbon whitepaper.                   |

    ## Example:
    >>> calculate_concentrated_liquidity_n_constant(Decimal('2'), Decimal('0.5'))
    Decimal('0.2928932188134524755991556378951509607151640623115259634116601310046337607689464805748062328361792136')
    
    ## Notes:
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    """
    n = ONE - (P_b/P_a)**(ONE/FOUR)
    return(n)

def get_concentrated_liquidity_scaling_constants(
    high_price_bound: Decimal,  # Pa
    low_price_bound: Decimal    # Pb
    ) -> Tuple[Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal]:
    """
    ### Retrieves the curve constants for a concentrated liquidity protocol (i.e `carbon` or `uniswap_v3`).

    ## Parameters:
    | Parameter name    | Type      | Description                              |
    |:------------------|:----------|:-----------------------------------------|
    | `high_price_bound`| `Decimal` | The high price bound for the position.   |
    | `low_price_bound` | `Decimal` | The low price bound for the position.    |

    ## Returns:
    | Return name | Type                                                                            | Description                                                                               |
    |:------------|:--------------------------------------------------------------------------------|:------------------------------------------------------------------------------------------|
    | `P_a`       | `Decimal`                                                                       | The high price bound for the position.                                                    |
    | `P_b`       | `Decimal`                                                                       | The low price bound for the position.                                                     |
    | `B`         | `Decimal`                                                                       | The calculated `B` value, which is the square root of `P_b`.                              | 
    | `P`         | `Decimal`                                                                       | The calculated `P` value, which is the geometric mean of `P_a` and `P_b`.                 |
    | `Q`         | `Decimal`                                                                       | The calculated `Q` value, which is the square root of the ratio of `P_b` to `P_a`.        |
    | `R`         | `Decimal`                                                                       | The calculated `R` value, which is the fourth root of the ratio of `P_a` to `P_b`.        |
    | `S`         | `Decimal`                                                                       | The calculated `S` value, which is the difference of the square roots of `P_a` and `P_b`. |
    | `n`         | `Decimal`                                                                       | The calculated `n` value, which is `1 - (P_b/P_a)^(1/4)`.                                 |
    |             | `Tuple[Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal]` | A tuple of `P_a`, `P_b`, `B`, `P`, `Q`, `R`, `S` and `n` (in that order).                 |
    
    ## Dependencies:
    | Dependency name                               | Type       | Description                                                                                     |
    |:----------------------------------------------|:-----------|:------------------------------------------------------------------------------------------------|
    | `calculate_concentrated_liquidity_B_constant` | `function` | Calculates the `B` value for a concentrated liquidity protocol (i.e `carbon` or `uniswap_v3`).  |
    | `calculate_concentrated_liquidity_P_constant` | `function` | Calculates the `P` value for a concentrated liquidity protocol (i.e `carbon` or `uniswap_v3`).  |
    | `calculate_concentrated_liquidity_Q_constant` | `function` | Calculates the `Q` value for a concentrated liquidity protocol (i.e `carbon` or `uniswap_v3`).  |
    | `calculate_concentrated_liquidity_R_constant` | `function` | Calculates the `R` value for a concentrated liquidity protocol (i.e `carbon` or `uniswap_v3`).  |
    | `calculate_concentrated_liquidity_S_constant` | `function` | Calculates the `S` value for a concentrated liquidity protocol (i.e `carbon` or `uniswap_v3`).  |
    | `calculate_concentrated_liquidity_n_constant` | `function` | Calculates the `n` value for a concentrated liquidity protocol (i.e `carbon` or `uniswap_v3`).  |

    ## Example:
    >>> get_concentrated_liquidity_curve_constants(Decimal('2'), Decimal('0.5'))
    (Decimal('2'),
     Decimal('0.5'),
     Decimal('0.7071067811865475244008443621048490392848359376884740365883398689953662392310535194251937671638207864'),
     Decimal('1.0'),
     Decimal('0.5'),
     Decimal('1.414213562373095048801688724209698078569671875376948073176679737990732478462107038850387534327641573'),
     Decimal('0.7071067811865475244008443621048490392848359376884740365883398689953662392310535194251937671638207866'),
     Decimal('0.2928932188134524755991556378951509607151640623115259634116601310046337607689464805748062328361792136'))
     
    ## Notes:
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    """
    P_a = high_price_bound
    P_b = low_price_bound
    B = calculate_concentrated_liquidity_B_constant(P_b)
    P = calculate_concentrated_liquidity_P_constant(P_a, P_b)
    Q = calculate_concentrated_liquidity_Q_constant(P_a, P_b)
    R = calculate_concentrated_liquidity_R_constant(P_a, P_b)
    S = calculate_concentrated_liquidity_S_constant(P_a, P_b)
    n = calculate_concentrated_liquidity_n_constant(P_a, P_b)
    return(P_a, P_b, B, P, Q, R, S, n)

# #### Uniswap v3 maker

def calculate_in_the_money_pivot_constants_uniswap_v3(
    starting_portfolio_value : Decimal, 
    P_a : Decimal, 
    P : Decimal, 
    ) -> Tuple[Decimal, Decimal]:
    """
    ### Calculates the in-the-money pivot constants for the Uniswap V3 protocol.

    ## Parameters:
    | Parameter name             | Type      | Description                                                               |
    |:---------------------------|:----------|:--------------------------------------------------------------------------|
    | `starting_portfolio_value` | `Decimal` | The starting portfolio value.                                             |
    | `P_a`                      | `Decimal` | The high price bound for the position.                                    |
    | `P`                        | `Decimal` | The calculated `P` value, which is the geometric mean of `P_a` and `P_b`. |

    ## Returns:
    | Return name | Type                        | Description                                                           |
    |:------------|:----------------------------|:----------------------------------------------------------------------|
    | `RISK_0`    | `Decimal`                   | The calculated initial RISK_0 constant for an in-the-money position.  |
    | `CASH_0`    | `Decimal`                   | The calculated initial CASH_0 constant for an in-the-money position.  |
    |             | `Tuple[Decimal, Decimal]`   | A tuple of `RISK_0` and `CASH_0` (in that order).                     |
    
    ## Dependencies:
    | Dependency name   | Type      | Description                                                                                        |
    |:------------------|:----------|:---------------------------------------------------------------------------------------------------|
    | `MARKETPRICE`     | `Decimal` | A `global` variable representing the current market price of `RISK` in units of `CASH` per `RISK`. |

    ## Example:
    >>> MARKETPRICE = Decimal('1.78')
    >>> calculate_in_the_money_pivot_constants_uniswap_v3(Decimal('1000'), Decimal('5.4321'), Decimal('1.2345'))
    (Decimal('242.4133414472461347967349436381649176580036119174610767209722189595080108032500402018969605226862922'),
     Decimal('627.7488752453232871030682440184600903521195970431401784231411852468386019375592193191974093945489701'))
     
    ## Notes:
    - This function calculates the initial `RISK_0` and `CASH_0` constants for an in-the-money position on `uniswap_v3`.
    - These constants are calculated from `P`, `Q`, `R`, and `n`, which are all derived directly from `P_a` and `P_b` (the high and low bounds of the position). 
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.
    - The calculation performed here is not trivial; the following LaTeX expression is provided for reference:
    
    ## LaTeX:
    $$\\frac{x_{0}}{P_{m} x + y} = \\frac{y_{0}}{P \\left(P_{m} x + y \\right)} = \\frac{\\left( \\sqrt{P_{a}} - \\sqrt{P} \\right) \\left( P + P_{m} + 2 \\sqrt{P_{a} P_{m}} \\right) }{\\sqrt{P} \\left( 2 P_{m} \\left( 2 P_{a} - P \\right) - P^{2} - P_{m}^{2} \\right)}$$
    Where: $P_{m} x + y$ = The starting portfolio valuation (CASH basis); $y$, $x$ = CASH and RISK token balances, respectively; $P_{m}$ = marginal price of RISK (in units of CASH per RISK.)
    """
    global MARKETPRICE
    numerator = (P_a**(ONE/TWO) - P**(ONE/TWO))*(P + MARKETPRICE + TWO*(P_a*MARKETPRICE)**(ONE/TWO))
    denominator = (P**(ONE/TWO)*(MARKETPRICE*(FOUR*P_a - TWO*P) - P**TWO - MARKETPRICE**TWO))
    RISK_0 = starting_portfolio_value*(numerator/denominator)
    CASH_0 = P*RISK_0
    return(RISK_0, CASH_0)

# $$\frac{x_{0}}{P_{m} x + y} = \frac{y_{0}}{P \left(P_{m} x + y \right)} = \frac{\left( \sqrt{P_{a}} - \sqrt{P} \right) \left( P + P_{m} + 2 \sqrt{P_{a} P_{m}} \right) }{\sqrt{P} \left( 2 P_{m} \left( 2 P_{a} - P \right) - P^{2} - P_{m}^{2} \right)}$$ 
# Where: $P_{m} x + y$ = The starting portfolio valuation (CASH basis); $y$, $x$ = CASH and RISK token balances, respectively; $P_{m}$ = marginal price of RISK (in units of CASH per RISK.)

def calculate_pivot_from_intercept_and_n(
    intercept: Decimal,
    n: Decimal
    ) -> Decimal:
    pivot = (intercept*(ONE - n)/(TWO - n))
    return(pivot)

def calculate_out_of_the_money_pivot_constants_uniswap_v3(
    CASH: Decimal, 
    RISK: Decimal, 
    n: Decimal, 
    P: Decimal
    ) -> Tuple[Decimal, Decimal]:
    """
    ### Calculates the out-of-the-money pivot constants for the Uniswap V3 protocol.

    ## Parameters:
    | Parameter name | Type      | Description                 |
    |:---------------|:----------|:----------------------------|
    | `CASH`         | `Decimal` | The current CASH balance.   |
    | `RISK`         | `Decimal` | The current RISK balance.   |
    | `n`            | `Decimal` | The calculated `n` value.   |
    | `P`            | `Decimal` | The calculated `P` value.   |

    ## Returns:
    | Return name | Type                        | Description                                                              |
    |:------------|:----------------------------|:-------------------------------------------------------------------------|
    | `RISK_0`    | `Decimal`                   | The calculated initial RISK_0 constant for an out-of-the-money position. |
    | `CASH_0`    | `Decimal`                   | The calculated initial CASH_0 constant for an out-of-the-money position. |
    |             | `Tuple[Decimal, Decimal]`   | A tuple of `RISK_0` and `CASH_0` (in that order).                        |

    ## Example:
    >>> calculate_out_of_the_money_pivot_constants_uniswap_v3(Decimal('1000'), Decimal('0'), Decimal('0.293'), ONE)
        (Decimal('414.1769185705916813122437024018746338605741066198008201523140011716461628588166373755125951962507323'),
         Decimal('414.1769185705916813122437024018746338605741066198008201523140011716461628588166373755125951962507323'))
     
    ## Notes:
    - This function calculates the initial `RISK_0` and `CASH_0` constants for an out-of-the-money position on `uniswap_v3`.
    - These constants are calculated from `P`, and `n`, which are both derived directly from `P_a` and `P_b` (the high and low bounds of the position). 
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    """
    if CASH:
        CASH_0 = calculate_pivot_from_intercept_and_n(CASH, n)
        RISK_0 = CASH_0/P
    elif RISK:
        RISK_0 = calculate_pivot_from_intercept_and_n(RISK, n)
        CASH_0 = RISK_0*P
    return(RISK_0, CASH_0)

def calculate_initial_in_the_money_RISK_balance_uniswap_v3(
    RISK_0: Decimal, 
    CASH_0: Decimal,
    n: Decimal
    ) -> Decimal:
    """
    ### Calculates the initial in-the-money RISK balance for the Uniswap V3 protocol.

    This function calculates the initial RISK balance for an in-the-money position based on the
    provided RISK_0, CASH_0, and n values.

    ## Parameters:
    | Parameter name | Type      | Description                  |
    |:---------------|:----------|:-----------------------------|
    | `RISK_0`       | `Decimal` | The initial RISK_0 constant. |
    | `CASH_0`       | `Decimal` | The initial CASH_0 constant. |
    | `n`            | `Decimal` | The calculated `n` value.    |

    ## Returns:
    | Return name | Type      | Description                                        |
    |:------------|:----------|:---------------------------------------------------|
    | `RISK`      | `Decimal` | The calculated initial in-the-money RISK balance.  |
    
    ## Dependencies:
    | Dependency name   | Type      | Description                                                                                        |
    |:------------------|:----------|:---------------------------------------------------------------------------------------------------|
    | `MARKETPRICE`     | `Decimal` | A `global` variable representing the current market price of `RISK` in units of `CASH` per `RISK`. |

    ## Example:
    >>> MARKETPRICE = Decimal('1.78')
    >>> calculate_initial_in_the_money_RISK_balance_uniswap_v3(Decimal('516.1511'), Decimal('516.151'), Decimal('0.293'))
    Decimal('74.92402929517240631351565620931902402247387659311380089549800539130358502770912438608666565603524274')

    ## Notes:
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    
    ## LaTeX:
    $$x = \\frac{\\sqrt{\\left(P_{m} x_{0} y_{0}\\right)} - P_{m} x_{0} \\left(1 - n \\right)}{P_{m} n}$$
    Where: 
    $x$ = RISK token balance; $P_{m}$ = marginal price of RISK (in units of CASH per RISK.); $x_{0}$, $y_{0}$ = the RISK and CASH pivots, respectively; $n$ = $1 - \\sqrt[4]{\\frac{P_{b}}{P_{a}}}$ = the curve scaling parameter.
    """
    global MARKETPRICE
    RISK = ((MARKETPRICE*RISK_0*CASH_0)**(ONE/TWO) - MARKETPRICE*RISK_0*(ONE - n))/(MARKETPRICE*n)
    return(RISK)

# $$x = \frac{\sqrt{\left(P_{m} x_{0} y_{0}\right)} - P_{m} x_{0} \left(1 - n \right)}{P_{m} n}$$
# Where: $x$ = RISK token balance; $P_{m}$ = marginal price of RISK (in units of CASH per RISK.); $x_{0}$, $y_{0}$ = the RISK and CASH pivots, respectively; $n$ = $1 - \sqrt[4]{\frac{P_{b}}{P_{a}}}$ = the curve scaling parameter.

def calculate_initial_in_the_money_CASH_balance_uniswap_v3(
    RISK_0: Decimal, 
    CASH_0: Decimal,
    n: Decimal
    ) -> Decimal:
    """
    ### Calculates the initial in-the-money CASH balance for the Uniswap V3 protocol.

    This function calculates the initial CASH balance for an in-the-money position based on the
    provided RISK_0, CASH_0, and n values.

    ## Parameters:
    | Parameter name | Type      | Description                   |
    |:---------------|:----------|:------------------------------|
    | `RISK_0`       | `Decimal` | The `RISK_0` constant.        |
    | `CASH_0`       | `Decimal` | The `CASH_0` constant.        | 
    | `n`            | `Decimal` | The calculated `n` value.     |

    ## Returns:
    | Return name | Type      | Description                                         |
    |:------------|:----------|:----------------------------------------------------|
    | `CASH`      | `Decimal` | The calculated initial in-the-money `CASH` balance. |
    
    ## Dependencies:
    | Dependency name   | Type      | Description                                                                                        |
    |:------------------|:----------|:---------------------------------------------------------------------------------------------------|
    | `MARKETPRICE`     | `Decimal` | A `global` variable representing the current market price of `RISK` in units of `CASH` per `RISK`. |

    ## Example:
    >>> MARKETPRICE = Decimal('1.78')
    >>> calculate_initial_in_the_money_CASH_balance_uniswap_v3(Decimal('516.151'), Decimal('516.151'), Decimal('0.293'))
    Decimal('1104.821050635792243015404444195057159215687624282601816968322855527351166574742210948027468492517927')
    
    ## Notes:
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    
    ## LaTeX:
    $$y = \\frac{\\sqrt{\\left(P_{m} x_{0} y_{0}\\right)} - y_{0} \\left(1 - n \\right)}{n}$$
    Where: $y$ = CASH token balance; $P_{m}$ = marginal price of RISK (in units of CASH per RISK.); $x_{0}$, $y_{0}$ = the RISK and CASH pivots, respectively; $n$ = $1 - \\sqrt[4]{\\frac{P_{b}}{P_{a}}}$ = the curve scaling parameter.
    """
    global MARKETPRICE
    CASH = ((MARKETPRICE*RISK_0*CASH_0)**(ONE/TWO) - CASH_0*(ONE - n))/n
    return(CASH)

# $$y = \frac{\sqrt{\left(P_{m} x_{0} y_{0}\right)} - y_{0} \left(1 - n \right)}{n}$$
# Where: $y$ = CASH token balance; $P_{m}$ = marginal price of RISK (in units of CASH per RISK.); $x_{0}$, $y_{0}$ = the RISK and CASH pivots, respectively; $n$ = $1 - \sqrt[4]{\frac{P_{b}}{P_{a}}}$ = the curve scaling parameter.

def get_initial_in_the_money_balances_uniswap_v3(
    RISK_0: Decimal, 
    CASH_0: Decimal,
    n: Decimal
    ) -> Tuple[Decimal, Decimal]:
    """
    ### Retrieves the initial in-the-money `RISK` and `CASH` balances for the `uniswap_v3` protocol.

    ## Parameters:
    | Parameter name | Type      | Description                            |
    |:---------------|:----------|:---------------------------------------|
    | `RISK_0`       | `Decimal` | The initial `RISK_0` "pivot" constant. |
    | `CASH_0`       | `Decimal` | The initial `CASH_0` "pivot" constant. |
    | `n`            | `Decimal` | The calculated `n` value.              |

    ## Returns:
    | Return name | Type                        | Description                                                               |
    |:------------|:----------------------------|:--------------------------------------------------------------------------|
    | `RISK`      | `Decimal`                   | The calculated initial in-the-money `RISK` balance.                       |
    | `CASH`      | `Decimal`                   | The calculated initial in-the-money `CASH` balance.                       |
    |             | `Tuple[Decimal, Decimal]`   | A tuple of `RISK` and `CASH` (in that order).                             |

    ## Dependencies:
    | Dependency name                                           | Type       | Description                                                                                        |
    |:----------------------------------------------------------|:-----------|:---------------------------------------------------------------------------------------------------|
    | `MARKETPRICE`                                             | `Decimal`  | A `global` variable representing the current market price of `RISK` in units of `CASH` per `RISK`. |
    | `calculate_initial_in_the_money_RISK_balance_uniswap_v3`  | `function` | Calculates the initial in-the-money `RISK` balance for the `uniswap_v3` protocol.                  |
    | `calculate_initial_in_the_money_CASH_balance_uniswap_v3`  | `function` | Calculates the initial in-the-money `CASH` balance for the `uniswap_v3` protocol.                  |

    ## Example:
    >>> MARKETPRICE = Decimal('1.78')
    >>> get_initial_in_the_money_balances_uniswap_v3(Decimal('516.151'), Decimal('516.151'), Decimal('0.293'))
    (Decimal('74.92414268567535990243030668625943868197352823331351837197261316392585766460763854694184198394706581'),
     Decimal('1104.821050635792243015404444195057159215687624282601816968322855527351166574742210948027468492517927'))
     
    ## Notes:
    - This function calculates the initial `RISK` and `CASH` balances for an in-the-money position on `uniswap_v3`.   
    - These token balances are calculated from `RISK_0`, and `CASH_0`, which are derived from `P`, `Q`, `R`, and `n` (in addition to the current price of `RISK` in units of `CASH` per `RISK`, and the desired `starting_portfolio_value`).
    - `P`, `Q`, `R`, and `n` are all derived directly from `P_a` and `P_b` (the high and low bounds of the position).  
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    """
    RISK = calculate_initial_in_the_money_RISK_balance_uniswap_v3(RISK_0, CASH_0, n)
    CASH = calculate_initial_in_the_money_CASH_balance_uniswap_v3(RISK_0, CASH_0, n)
    return(RISK, CASH)

def get_initial_out_of_the_money_balances_uniswap_v3(
    starting_portfolio_value: Decimal, 
    P_a: Decimal,
    P_b: Decimal 
    ) -> Tuple[Decimal, Decimal]:
    """
    ### Calculates the initial out-of-the-money `RISK` and `CASH` balances for the `uniswap_v3` protocol.

    ## Parameters:
    | Parameter name            | Type      | Description                                       |
    |:--------------------------|:----------|:--------------------------------------------------|
    | `starting_portfolio_value`| `Decimal` | The starting portfolio value in units of `CASH`.  |
    | `P_a`                     | `Decimal` | The high price bound for the position.            |
    | `P_b`                     | `Decimal` | The low price bound for the position.             |

    ## Returns:
    | Return name | Type                        | Description                                                              |
    |:------------|:----------------------------|:-------------------------------------------------------------------------|
    | `RISK`      | `Decimal`                   | The calculated initial `RISK` balance for an out-of-the-money position.  |
    | `CASH`      | `Decimal`                   | The calculated initial `CASH` balance for an out-of-the-money position.  |
    |             | `Tuple[Decimal, Decimal]`   | A tuple of `RISK` and `CASH` (in that order).                            |

    ## Dependencies:
    | Dependency name   | Type      | Description                                                                                        |
    |:------------------|:----------|:---------------------------------------------------------------------------------------------------|
    | `MARKETPRICE`     | `Decimal` | A `global` variable representing the current market price of `RISK` in units of `CASH` per `RISK`. |

    ## Example:
    >>> MARKETPRICE = Decimal('1.78')
    >>> get_initial_out_of_the_money_balances_uniswap_v3(Decimal('1000'), Decimal('1.0'), Decimal('0.5'))
    (Decimal('0'), Decimal('1000'))
    
    ## Notes:
    - This function calculates the initial `RISK` and `CASH` balances for an out-of-the-money position on `uniswap_v3`.
    - If `P_a` (the high price bound for the position) is less than or equal to the price of `RISK` in untis of `CASH` per `RISK`, the portfolio is forced to be 100% in `CASH`.
    - If `P_b` (the low price bound for the position) is greater than or equal to the price of `RISK` in untis of `CASH` per `RISK`, the portfolio is forced to be 100% in `RISK`.
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    """
    global MARKETPRICE
    if P_a <= MARKETPRICE:
        CASH = starting_portfolio_value 
        RISK = Decimal('0')
    elif P_b >= MARKETPRICE:
        RISK = starting_portfolio_value/MARKETPRICE
        CASH = Decimal('0')
    return(RISK, CASH)

def calculate_intercept_from_pivot_and_n(
    pivot: Decimal,
    n: Decimal
    ) -> Decimal:
    """
    ### Calculates the x-intercept or y-intercept for a `uniswap_v3` curve from the pivot value (either `x_0` or `y_0`) and the `n` parameter.
    
    ## Parameters:
    | Parameter Name | Type      | Description                                                  |
    |:---------------|:----------|:-------------------------------------------------------------|
    | `pivot`        | `Decimal` | The x-pivot or y-pivot of the curve (`x_0` or `y_0`).        |
    | `n`            | `Decimal` | The `n` parameter, which determines curve concavity.         |
    
    ## Returns:
    | Return Name   | Type      | Description                                  |
    |:--------------|:----------|:---------------------------------------------|
    | `intercept`   | `Decimal` | The x-intercept or y-intercept of the curve. |
    
    ## Example:
    >>> calculate_intercept_from_pivot_and_n(Decimal('1947.111156999702762486'), 
                                             Decimal('0.309552224886332667'))
    Decimal('4767.181301594133398861107013574993124103174546532290776753086225856804722396015205210038632967319221')
    
    ## Notes:
    - This function is used to calculate the x- or y-intercept for a `uniswap_v3` curve.
    - The identity of `intercept` (either `CASH` or `RISK`) is the appropriate counterpart of `pivot`. 
    - E.g. if `CASH_0` and `n` are passed as arguments, `CASH_int` is returned.
    - The naming convention indicates which axis of the `uniswap_v3` curve the `intercept` parameter belongs to. 
    - In contrast to `carbon`, the `intercept` value on a `uniswap_v3` represents a true token balance; `uniswap_v3` is described by a single instance of the invariant function which governs both `CASH` and `RISK` balances.
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    
    ## LaTeX:
    $$y_{int} = \\frac{y_{0}\\left( 2 - n\\right)}{1 - n}$$
    $$x_{int} = \\frac{x_{0}\\left( 2 - n\\right)}{1 - n}$$
    Where: 
    $y_{int}$, $x_{int}$ = the CASH, RISK intercepts, resepectively; $x_{0}$, $y_{0}$ = the RISK and CASH pivots, respectively; $n$ = $1 - \\sqrt[4]{\\frac{P_{b}}{P_{a}}}$ = the curve scaling parameter.
    """
    intercept = pivot*(TWO - n)/(ONE - n)
    return(intercept)

# $$y_{int} = \frac{y_{0}\left( 2 - n\right)}{1 - n}$$
# $$x_{int} = \frac{x_{0}\left( 2 - n\right)}{1 - n}$$
# Where: 
# $y_{int}$, $x_{int}$ = the CASH, RISK intercepts, resepectively; $x_{0}$, $y_{0}$ = the RISK and CASH pivots, respectively; $n$ = $1 - \sqrt[4]{\frac{P_{b}}{P_{a}}}$ = the curve scaling parameter.

def calculate_asymptote_from_pivot_and_n(
    pivot: Decimal,
    n: Decimal
    ) -> Decimal:
    """
    ### Calculates the x-asymptote or y-asymptote for a `uniswap_v3` curve from the pivot value (either `x_0` or `y_0`) and the `n` parameter.
    
    ## Parameters:
    | Parameter Name | Type      | Description                                           |
    |:---------------|:----------|:------------------------------------------------------|
    | `pivot`        | `Decimal` | The x-pivot or y-pivot of the curve (`x_0` or `y_0`). |
    | `n`            | `Decimal` | The `n` parameter, which determines curve concavity.  |
    
    ## Returns:
    | Return Name    | Type      | Description                                   |
    |:---------------|:----------|:----------------------------------------------|
    | `asymptote`    | `Decimal` | The x-asymptote or y-asymptote of the curve.  |
    
    ## Example:
    >>> calculate_asymptote_from_pivot_and_n(Decimal('1947.111156999702762486'), 
                                             Decimal('0.309552224886332667'))
    Decimal('-4342.978205836182021386008479596658099385772600633155551243234975564990217611237025374180216295122389')
    
    - This function is used to calculate the x- or y-asymptote for a `uniswap_v3` curve.
    - The identity of `asymptote` (either `CASH_asym` or `RISK_asym`) is the appropriate counterpart of `pivot`.
    - E.g. if `CASH_0` and `n` are passed as arguments, `CASH_asym` is returned.
    - The naming convention indicates which axis of the `uniswap_v3` curve the `asymptote` parameter belongs to. 
    - In contrast to `carbon`, the `asymptote` value on a `uniswap_v3` represents a true token balance; `uniswap_v3` is described by a single instance of the invariant function which governs both `CASH` and `RISK` balances.
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    
    ## LaTeX:
    $$y_{asym} = \\frac{y_{0}\\left(n - 1\\right)}{n}$$
    $$x_{asym} = \\frac{x_{0}\\left(n - 1\\right)}{n}$$
    Where: $y_{asym}$, $x_{asym}$ = the CASH, RISK asymptotes, resepectively; $x_{0}$, $y_{0}$ = the RISK and CASH pivots, respectively; $n$ = $1 - \\sqrt[4]{\\frac{P_{b}}{P_{a}}}$ = the curve scaling parameter.
    """
    asymptote = pivot*(n - ONE)/n
    return(asymptote)

# $$y_{asym} = \frac{y_{0}\left(n - 1\right)}{n}$$
# $$x_{asym} = \frac{x_{0}\left(n - 1\right)}{n}$$
# Where: 
# $y_{asym}$, $x_{asym}$ = the CASH, RISK asymptotes, resepectively; $x_{0}$, $y_{0}$ = the RISK and CASH pivots, respectively; $n$ = $1 - \sqrt[4]{\frac{P_{b}}{P_{a}}}$ = the curve scaling parameter.

def get_uniswap_v3_intercepts_and_asymptotes(
    CASH_0: Decimal, 
    RISK_0: Decimal,
    n: Decimal
    ):
    """
    ### Calculates `CASH_int`, `RISK_int`, `CASH_asym`, and `RISK_asym` from the `CASH_0`, `RISK_0` and `n` curve constants.
    
    ## Parameters:
    | Parameter name | Type      | Description                                            |
    |:---------------|:----------|:-------------------------------------------------------|
    | `RISK_0`       | `Decimal` | The initial `RISK_0` "pivot" constant.                 |
    | `CASH_0`       | `Decimal` | The initial `CASH_0` "pivot" constant.                 |
    | `n`            | `Decimal` | Curve constant that determines the shape of the curve. |
    
    ## Returns:
    | Return name       | Type                                        | Description                                                                     |
    |:------------------|:--------------------------------------------|:--------------------------------------------------------------------------------|
    | `CASH_int`        | `Decimal`                                   | The y-intercept of the `CASH` axis for the concentrated bonding curve.          |
    | `CASH_asym`       | `Decimal`                                   | The y-asymptote of the `CASH` axis for the concentrated bonding curve.          |
    | `RISK_int`        | `Decimal`                                   | The x-intercept of the `RISK` axis for the concentrated bonding curve.          |
    | `RISK_asym`       | `Decimal`                                   | The x-asymptote of the `RISK` axis for the concentrated bonding curve.          |
    |                   | `Tuple[Decimal, Decimal, Decimal, Decimal]` | A tuple of `CASH_int`, `CASH_asym`, `RISK_int`, and `RISK_asym`, in that order. |
    
    ## Dependencies:
    | Dependency name                        | Type       | Description                                                                                                                            |
    |:---------------------------------------|:-----------|:---------------------------------------------------------------------------------------------------------------------------------------|
    | `calculate_intercept_from_pivot_and_n` | `function` |  Calculates the x-intercept or y-intercept for a `uniswap_v3` curve from the pivot value (either `x_0` or `y_0`) and the `n` parameter.|
    | `calculate_asymptote_from_pivot_and_n` | `function` |  Calculates the x-asymptote or y-asymptote for a `uniswap_v3` curve from the pivot value (either `x_0` or `y_0`) and the `n` parameter.|
    
    ## Example:
    >>> get_uniswap_v3_intercepts_and_asymptotes(Decimal('5042.201190276398610655'), 
                                                 Decimal('1947.111156999702762486'), 
                                                 Decimal('0.309552224886332667'))
    (Decimal('12345.00000000000000327031223349417204430334241091714898373777450590649930120814058248693318202038351'),
     Decimal('-11246.49191192272437622539068321246277250570082548270728833726772626156774337876739793646419098033486'),
     Decimal('4767.181301594133398861107013574993124103174546532290776753086225856804722396015205210038632967319221'),
     Decimal('-4342.978205836182021386008479596658099385772600633155551243234975564990217611237025374180216295122389'))
    
    ## Notes:
    - This function calculates the intercepts and asymptotes for `CASH` and `RISK` by utilizing the `calculate_intercept_from_pivot_and_n` and `calculate_asymptote_from_pivot_and_n` functions for both `CASH_0` and `RISK_0` pivot constants.
    - The function returns a tuple containing the intercepts and asymptotes in the order of `CASH_int`, `CASH_asym`, `RISK_int`, and `RISK_asym`.
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    """
    CASH_int, RISK_int = [calculate_intercept_from_pivot_and_n(pivot, n) for pivot in [CASH_0, RISK_0]]
    CASH_asym, RISK_asym = [calculate_asymptote_from_pivot_and_n(pivot, n) for pivot in [CASH_0, RISK_0]]
    return(CASH_int, CASH_asym, RISK_int, RISK_asym)

def get_univ3_start_state(
    starting_portfolio_value: Decimal, 
    high_price_bound: Decimal,  # Pa
    low_price_bound: Decimal    # Pb
    ) -> Tuple[Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal]:
    """
    ### Retrieves the initial state for a `uniswap_v3` position.

    ## Parameters:
    | Parameter name             | Type      | Description                                       |
    |:---------------------------|:----------|:--------------------------------------------------|
    | `starting_portfolio_value` | `Decimal` | The starting portfolio value in units of `CASH`.  |
    | `high_price_bound`         | `Decimal` | The high price bound for the position (`P_a`).    |
    | `low_price_bound`          | `Decimal` | The low price bound for the position (`P_b`).     |

    ## Returns:
    | Return name | Type      | Description                                                                                                                                                 |
    |:------------|:----------|:------------------------------------------------------------------------------------------------------------------------------------------------------------|
    | `CASH`      | `Decimal` | The initial `CASH` balance of the position.                                                                                                                 |
    | `CASH_0`    | `Decimal` | The calculated initial pivot constant `CASH_0`.                                                                                                             |
    | `CASH_int`  | `Decimal` | The calculated `CASH` intercept value.                                                                                                                      |
    | `CASH_asym` | `Decimal` | The calculated `CASH` asymptote value.                                                                                                                      |
    | `RISK`      | `Decimal` | The initial `RISK` balance of the position.                                                                                                                 |
    | `RISK_0`    | `Decimal` | The calculated initial pivot constant `RISK_0`.                                                                                                             |
    | `RISK_int`  | `Decimal` | The calculated `RISK` intercept value.                                                                                                                      |
    | `RISK_asym` | `Decimal` | The calculated `RISK` asymptote value.                                                                                                                      |
    | `P_a`       | `Decimal` | The high price bound for the position (`high_price_bound`) in units of `CASH` per `RISK`.                                                                   |
    | `P_b`       | `Decimal` | The low price bound for the position (`low_price_bound`) in units of `CASH` per `RISK`.                                                                     |
    | `B`         | `Decimal` | The calculated `B` value from the `uniswap_v3` curve constants.                                                                                             |
    | `P`         | `Decimal` | The calculated `P` value from the `uniswap_v3` curve constants.                                                                                             |
    | `Q`         | `Decimal` | The calculated `Q` value from the `uniswap_v3` curve constants.                                                                                             |
    | `R`         | `Decimal` | The calculated `R` value from the `uniswap_v3` curve constants.                                                                                             |
    | `S`         | `Decimal` | The calculated `S` value from the `uniswap_v3` curve constants.                                                                                             |
    | `n`         | `Decimal` | The calculated `n` value from the `uniswap_v3` curve constants.                                                                                             |
    |             | `tuple`   | A tuple of `CASH`, `CASH_0`, `CASH_int`, `CASH_asym`, `RISK`, `RISK_0`, `RISK_int`, `RISK_asym`, `P_a`, `P_b`, `B`, `P`, `Q`, `R`, `S`, `n`, in that order. |

    ## Dependencies:
    | Dependency name                                         | Type       | Description                                                                                                          |
    |:--------------------------------------------------------|:-----------|:---------------------------------------------------------------------------------------------------------------------|
    | `MARKETPRICE`                                           | `Decimal`  | A `global` variable representing the current market price of `RISK` in units of `CASH` per `RISK`.                   |
    | `get_concentrated_liquidity_curve_constants`            | `function` | Retrieves the curve constants for a concentrated liquidity protocol.                                                 |
    | `calculate_in_the_money_pivot_constants_uniswap_v3`     | `function` | Calculates the in-the-money pivot constants for the `uniswap_v3` protocol.                                           |
    | `get_initial_in_the_money_balances_uniswap_v3`          | `function` | Calculates the initial in-the-money `RISK` and `CASH` balances for the `uniswap_v3` protocol.                        |
    | `get_initial_out_of_the_money_balances_uniswap_v3`      | `function` | Calculates the initial out-of-the-money `RISK` and `CASH` balances for `uniswap_v3` protocol.                        |
    | `calculate_out_of_the_money_pivot_constants_uniswap_v3` | `function` | Calculates the out-of-the-money pivot constants for the `uniswap_v3` protocol.                                       |
    | `calculate_uniswap_v3_intercepts_and_asymptotes`        | `function` | Calculates `CASH_int`, `RISK_int`, `CASH_asym`, and `RISK_asym` from the `CASH_0`, `RISK_0` and `n` curve constants. |
    
    ## Examples:
    >>> MARKETPRICE = Decimal('1.78')
    >>> get_univ3_start_state(Decimal('1000'), Decimal('1.0'), Decimal('0.5'))
    (Decimal('1000'),
     Decimal('456.7863831370551039780621988172076268033687418004383614687746586785836996726146006490418186090811734'),
     Decimal('1E+3'),
     Decimal('-2414.213562373095048801688724209698078569671875376948073176679737990732478462107038850387534327641573'),
     Decimal('0'),
     Decimal('645.9934981397761706955621693776835420963408342642557744877768833980503678995317605198231631472188471'),
     Decimal('1414.213562373095048801688724209698078569671875376948073176679737990732478462107038850387534327641573'),
     Decimal('-3414.213562373095048801688724209698078569671875376948073176679737990732478462107038850387534327641573'),
     Decimal('1.0'),
     Decimal('0.5'),
     Decimal('0.7071067811865475244008443621048490392848359376884740365883398689953662392310535194251937671638207864'),
     Decimal('0.7071067811865475244008443621048490392848359376884740365883398689953662392310535194251937671638207864'),
     Decimal('0.7071067811865475244008443621048490392848359376884740365883398689953662392310535194251937671638207864'),
     Decimal('1.189207115002721066717499970560475915292972092463817413019002224719466668226917159870781344538137674'),
     Decimal('0.2928932188134524755991556378951509607151640623115259634116601310046337607689464805748062328361792136'),
     Decimal('0.1591035847462854569688745237667851049599657376432154891867739140250752450460977601856759958007074638'))
     
    >>> MARKETPRICE = Decimal('1.78')
    >>> get_univ3_start_state(Decimal('1000'), Decimal('2.0'), Decimal('1.0'))
    (Decimal('815.6711813776018116959873635425180392915436215215167913228069736304103919764937487928101813201703365'),
     Decimal('461.8381382979216412814226147037333866362179672159881292555503389951398449615411338427796421959706602'),
     Decimal('1011.059338341420739192762728512535604557057067371011990715369346695341890912609455165566890495584249'),
     Decimal('-2440.913166987825768087128193555641904297214062883337173555134284527577263265771977379401544552084629'),
     Decimal('103.5555160799989821932655260997089666901440328530804543130297900952750606873630624759493363369829573'),
     Decimal('326.5688794010309521301155306525472110082309510569194295807936814991357336450345540813272369995830308'),
     Decimal('714.9269143232025144471827325215531498700784977561625914198824689161176861765812611069173270282501895'),
     Decimal('-1725.986252664623253639945461034088754427135565127174582135251815611459577089190716272484217523834439'),
     Decimal('2.0'),
     Decimal('1.0'),
     Decimal('1.0'),
     Decimal('1.414213562373095048801688724209698078569671875376948073176679737990732478462107038850387534327641573'),
     Decimal('0.7071067811865475244008443621048490392848359376884740365883398689953662392310535194251937671638207864'),
     Decimal('1.189207115002721066717499970560475915292972092463817413019002224719466668226917159870781344538137674'),
     Decimal('0.414213562373095048801688724209698078569671875376948073176679737990732478462107038850387534327641573'),
     Decimal('0.1591035847462854569688745237667851049599657376432154891867739140250752450460977601856759958007074638'))
     
    >>> MARKETPRICE = Decimal('1.78')
    >>> get_univ3_start_state(Decimal('1000'), Decimal('4.0'), Decimal('2.0'))
    (Decimal('0'),
     Decimal('725.8353911682878322422046846940264517936413868137705331323335768517419864039682702469923181429425247'),
     Decimal('1589.004002666398931237852499112020312999631320648256261996269368528912897148434875112794982390608508'),
     Decimal('-3836.195013902353987417627780010896717494013343120166374355819930326665706137198920056615207109709633'),
     Decimal('561.7977528089887640449438202247191011235955056179775280898876404494382022471910112359550561797752809'),
     Decimal('256.6215635601433168416079768635997903389712032586732367802104824036987076812441576680010216904950412'),
     Decimal('561.7977528089887640449438202247191011235955056179775280898876404494382022471910112359550561797752808'),
     Decimal('-1356.299754142188229663870069780729257623411165942105659088022324713894650821408448792352547375079536'),
     Decimal('4.0'),
     Decimal('2.0'),
     Decimal('1.414213562373095048801688724209698078569671875376948073176679737990732478462107038850387534327641573'),
     Decimal('2.828427124746190097603377448419396157139343750753896146353359475981464956924214077700775068655283145'),
     Decimal('0.7071067811865475244008443621048490392848359376884740365883398689953662392310535194251937671638207864'),
     Decimal('1.189207115002721066717499970560475915292972092463817413019002224719466668226917159870781344538137674'),
     Decimal('0.585786437626904951198311275790301921430328124623051926823320262009267521537892961149612465672358427'),
     Decimal('0.1591035847462854569688745237667851049599657376432154891867739140250752450460977601856759958007074638'))
    
    ## Notes:
    - The `get_univ3_start_state` function retrieves the initial state for a `uniswap_v3` position, based on the user's range and desired `starting_portfolio_value`.
    - The function makes use of several other functions and a global variable `MARKETPRICE` to compute the initial state.
    - The core of the function is the conditional logic which checks whether the initial `MARKETPRICE` lies between the high price bound (`P_a`) and the low price bound (`P_b`).
    - If the condition is met (i.e., `P_a > MARKETPRICE > P_b`), the position is considered to be "in the money," which means that the position is currently providing liquidity within the specified price range.
    - In this case, the function calculates the in-the-money pivot constants `RISK_0` and `CASH_0`, and the initial in-the-money `RISK` and `CASH` balances using the `calculate_in_the_money_pivot_constants_uniswap_v3` and `get_initial_in_the_money_balances_uniswap_v3` functions, respectively.
    - If the condition is not met, the position is considered to be "out of the money," which means that the position is not currently providing liquidity within the specified price range.
    - In this case, the function calculates the out-of-the-money pivot constants `RISK` and `CASH` balances, and the initial out-of-the-money `RISK_0` and `CASH_0` pivot constants using the `get_initial_out_of_the_money_balances_uniswap_v3` and `calculate_out_of_the_money_pivot_constants_uniswap_v3` functions, respectively.
    - Finally, the pivot constants `RISK_0` and `CASH_0` and the scaling constant `n` are passed to `calculate_uniswap_v3_intercepts_and_asymptotes`, which returns `CASH_int`, `CASH_asym`, `RISK_int`, and `RISK_asym`.
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    """
    global MARKETPRICE
    P_a, P_b, B, P, Q, R, S, n = get_concentrated_liquidity_scaling_constants(high_price_bound, low_price_bound)
    if P_a > MARKETPRICE > P_b:
        RISK_0, CASH_0 = calculate_in_the_money_pivot_constants_uniswap_v3(starting_portfolio_value, P_a, P)
        RISK, CASH = get_initial_in_the_money_balances_uniswap_v3(RISK_0, CASH_0, n)
    else:
        RISK, CASH = get_initial_out_of_the_money_balances_uniswap_v3(starting_portfolio_value, P_a, P_b)
        RISK_0, CASH_0 = calculate_out_of_the_money_pivot_constants_uniswap_v3(CASH, RISK, n, P)
    CASH_int, CASH_asym, RISK_int, RISK_asym = get_uniswap_v3_intercepts_and_asymptotes(CASH_0, RISK_0, n)
    return(CASH, CASH_0, CASH_int, CASH_asym, RISK, RISK_0, RISK_int, RISK_asym, P_a, P_b, B, P, Q, R, S, n)

def get_uniswap_v3_dict(
    CASH: Decimal, 
    CASH_0: Decimal, 
    CASH_int: Decimal, 
    CASH_asym: Decimal, 
    RISK: Decimal, 
    RISK_0: Decimal, 
    RISK_int: Decimal, 
    RISK_asym: Decimal, 
    P_a: Decimal, 
    P_b: Decimal, 
    B: Decimal, 
    P: Decimal, 
    Q: Decimal, 
    R: Decimal, 
    S: Decimal, 
    n: Decimal,
    k: Decimal,
    fee: Decimal
    ) -> None:
    """
    ### Adds appropriate information to the `uniswap_v3` protocol in the `PROTOCOLS` dictionary.

    ## Parameters:
    | Parameter name | Type      | Description                                                                               |
    |:---------------|:----------|:------------------------------------------------------------------------------------------|
    | `CASH`         | `Decimal` | The initial `CASH` balance of the position.                                               |
    | `CASH_0`       | `Decimal` | The calculated initial pivot constant `CASH_0`.                                           |
    | `CASH_int`     | `Decimal` | The calculated `CASH` intercept value.                                                    |
    | `CASH_asym`    | `Decimal` | The calculated `CASH` asymptote value.                                                    |
    | `RISK`         | `Decimal` | The initial `RISK` balance of the position.                                               |
    | `RISK_0`       | `Decimal` | The calculated initial pivot constant `RISK_0`.                                           |
    | `RISK_int`     | `Decimal` | The calculated `RISK` intercept value.                                                    |
    | `RISK_asym`    | `Decimal` | The calculated `RISK` asymptote value.                                                    |
    | `P_a`          | `Decimal` | The high price bound for the position (`high_price_bound`) in units of `CASH` per `RISK`. |
    | `P_b`          | `Decimal` | The low price bound for the position (`low_price_bound`) in units of `CASH` per `RISK`.   |
    | `B`            | `Decimal` | The calculated `B` value from the `uniswap_v3` curve constants.                           |
    | `P`            | `Decimal` | The calculated `P` value from the `uniswap_v3` curve constants.                           |
    | `Q`            | `Decimal` | The calculated `Q` value from the `uniswap_v3` curve constants.                           |
    | `R`            | `Decimal` | The calculated `R` value from the `uniswap_v3` curve constants.                           |
    | `S`            | `Decimal` | The calculated `S` value from the `uniswap_v3` curve constants.                           |
    | `n`            | `Decimal` | The calculated `n` value from the `uniswap_v3` curve constants.                           |
    | `k`            | `Decimal` | The fundamental hyperbolic constant.                                                      |
    | `fee`          | `Decimal` | The swap fee, which results in the implied bid-ask spread.                                |

    ## Returns:
    None
    
    ## Dependencies:
    | Dependency name   | Type      | Description                                                                                                                           |
    |:------------------|:----------|:--------------------------------------------------------------------------------------------------------------------------------------|
    | `MARKETPRICE`     | `Decimal` | A `global` variable representing the current market price of `RISK` in units of `CASH` per `RISK`.                                    |
    | `PROTOCOLS`       | `dict`    | A `global` dictionary with each of the protocol name strings as keys, and the appropriate protocol dictionaries themselves as values. |
    
    ## Notes:
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    """
    global MARKETPRICE
    global PROTOCOLS
    
    PROTOCOLS['uniswap_v3']['curve parameters'] = {
        'date' : [pd.Timestamp('2009-01-03 18:15:05')],
        "CASH_0" : [CASH_0],
        "CASH_int" : [CASH_int],
        "CASH_asym" : [CASH_asym],
        "RISK_0" : [RISK_0],
        "RISK_int" : [RISK_int],
        "RISK_asym" : [RISK_asym],
        "P_a" : [P_a],
        "P_b" : [P_b],
        "B" : [B],
        "P" : [P],
        "Q" : [Q],
        "R" : [R],
        "S" : [S],
        "n" : [n],
        "k" : [k],
        "fee" : [fee]
        }
    
    PROTOCOLS['uniswap_v3']['simulation recorder'] = {
        'simulation step' : [], 
        'date' : [], 
        'RISK price' : [], 
        'CASH balance' : [CASH],
        'RISK balance' : [RISK],
        'ask' : [],
        'max ask' : [],
        'bid': [],
        'min bid' : [],
        'CASH portion' : [], 
        'RISK portion' :[], 
        'hodl value' : [], 
        'RISK fees' : [ZERO],
        'CASH fees' : [ZERO],
        'portfolio value' : [], 
        'portfolio over hodl quotient' : [] 
        }
    return(None) 

def make_uniswap_v3(
    start_information: dict
    ) -> None:
    """
    ### Initializes the `uniswap_v3` protocol in the `PROTOCOLS` dictionary using user-provided starting information.
    
    ## Parameters:
    | Parameter Name      | Type   | Description                                |
    |:--------------------|:-------|:-------------------------------------------|
    | `start_information` | `dict` | The simulation settings, as a dictionary:  |

    ## Parameters Dictionary:
    | Key                                        | Key Type | Value                                                                                                                                                                                 | Value Type        |
    |:-------------------------------------------|:---------|:--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|:------------------|
    | base filename                              | `str`    | Named for its token pair and date range e.g. ['RISK=USDC_CASH=USDT_startUNIX=1678366800_endUNIX=1678798800']                                                                          | `list[str]`       |
    | token pair                                 | `str`    | A dictionary containing the token tickers e.g. 'CASH' : 'ETH', 'RISK' : 'LINK'                                                                                                        | `Dict[str, str]`  |
    | price chart                                | `str`    | A list of Decimal objects, representing prices in units of CASH per RISK.                                                                                                             | `list[Decimal]`   |
    | price chart dates                          | `str`    | A list of Timestamp objects, representing the dates and times for each of the prices in the 'price chart'                                                                             | `list[Timestamp]` |
    | uniswap range boundaries                   | `str`    | The two (2) price bounds which enclose a single active region for the uniswap v3 strategy.                                                                                            | `list[Decimal]`   |
    | carbon order boundaries                    | `str`    | The four (4) price bounds that enclose two separate liquidity regions, which comprise a carbon strategy.                                                                              | `list[Decimal]`   |
    | carbon starting prices                     | `str`    | The two (2) marginal price values, within their respective bounds, which dictate the first available prices on the carbon strategy.                                                   | `list[Decimal]`   |
    | carbon order weights                       | `str`    | The relative weights of the RISK and CASH components of the carbon strategy, in that order, and in terms of their CASH value.                                                         | `list[Decimal]`   |
    | protocol fees                              | `str`    | The user-selected protocol fee, used on all three protocols (0.00001 <= fee <= 0.01; 1 bps <= fee <= 1000 bps; 0.01% <= fee <= 1%).                                                   | `list[Decimal]`   |
    | starting portfolio valuation               | `str`    | The total CASH valuation of all protocol portfolios at the start of the simulation.                                                                                                   | `list[Decimal]`   |
    | protocol list                              | `str`    | The specific protocols to be included in this simulation.                                                                                                                             | `list[str]`       |
    | depth chart animation boolean              | `str`    | `True` if the simulation should be composed into an animated `.mp4` file depicting the depth chart and saved locally for each protocol in the 'protocol list.                         | `bool`            |
    | invariant curve animation boolean          | `str`    | `True` if the simulation should be composed into an animated `.mp4` file depicting the invariant curve and saved locally for each protocol in the 'protocol list.                     | `bool`            |
    | token balance cash basis animation boolean | `str`    | `True` if the simulation should be composed into an animated `.mp4` file depicting the portfolio composition in CASH basis and saved locally for each protocol in the 'protocol list. | `bool`            |
    | summary boolean                            | `str`    | `True` if a summary plot of the simulation should be composed into a `.png` file and saved locally for each protocol in the 'protocol list'.                                          | `bool`            |
                              
    ## Returns:
    None
        
    ## Dependencies:
    | Dependency name                   | Type       | Description                                                                              |
    |:----------------------------------|:-----------|:-----------------------------------------------------------------------------------------|
    | `get_univ3_start_state`           | `function` | Calculates the start state of the `uniswap_v3` protocol.                                 |
    | `get_uniswap_v3_dict`             | `function` | Adds appropriate information to the `uniswap_v3` protocol in the `PROTOCOLS` dictionary. |
    | `calculate_hyperbolic_constant_k` | `function` | Calculate the hyperbolic constant `k` given `x` and `y` values.                          |
    
    ## Notes:
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    """
    starting_portfolio_value = start_information['starting portfolio valuation'][0]
    fee = start_information['protocol fees'][0]
    high_price_bound, low_price_bound = start_information['uniswap range boundaries']
    (CASH, CASH_0, CASH_int, CASH_asym, 
     RISK, RISK_0, RISK_int, RISK_asym, 
     P_a, P_b, B, P, Q, R, S, n) = get_univ3_start_state(starting_portfolio_value, 
                                                         high_price_bound,
                                                         low_price_bound)
    k = calculate_hyperbolic_constant_k(RISK_0, CASH_0)
    get_uniswap_v3_dict(CASH, CASH_0, CASH_int, CASH_asym, RISK, RISK_0, RISK_int, RISK_asym, P_a, P_b, B, P, Q, R, S, n, k, fee)
    return(None)

# #### Carbon maker

def get_carbon_starting_order_balances(
    starting_portfolio_value: Decimal, 
    CASH_proportion: Decimal, 
    RISK_proportion: Decimal
    ) -> Tuple[Decimal, Decimal]:
    """
    ### Calculates the starting order balances for the `carbon` strategy.
    
    ## Parameters:
    | Parameter Name             | Type      | Description                                         |
    |:---------------------------|:----------|:----------------------------------------------------|
    | `starting_portfolio_value` | `Decimal` | The starting value of the portfolio in `CASH`.      |
    | `CASH_proportion`          | `Decimal` | The proportion of the portfolio invested in `CASH`. |
    | `RISK_proportion`          | `Decimal` | The proportion of the portfolio invested in `RISK`. |
    
    ## Returns:
    | Return Name   | Type                      | Description                               |
    |:--------------|:--------------------------|:------------------------------------------|
    | `y_CASH`      | `Decimal`                 | The starting balance of the `CASH` order. |
    | `y_RISK`      | `Decimal`                 | The starting balance of the `RISK` order. |
    |               | `Tuple[Decimal, Decimal]` | A tuple of `y_CASH` and `y_RISK`.         |
    
    ## Dependencies:
    | Dependency name   | Type      | Description                                                                                        |
    |:------------------|:----------|:---------------------------------------------------------------------------------------------------|
    | `MARKETPRICE`     | `Decimal` | A `global` variable representing the current market price of `RISK` in units of `CASH` per `RISK`. |
    """
    global MARKETPRICE
    y_CASH = CASH_proportion*starting_portfolio_value/(RISK_proportion + CASH_proportion)
    y_RISK = RISK_proportion*starting_portfolio_value/(MARKETPRICE*(RISK_proportion + CASH_proportion))
    return(y_CASH, y_RISK)

def calculate_yint_CASH(
    y_CASH: Decimal, 
    P_a_CASH: Decimal, 
    P_b_CASH: Decimal, 
    P_bid: Decimal
    ) -> Decimal:
    """
    ### Calculates the y-intercept of the `CASH` order for its corresponding `carbon` position.
    
    ## Parameters:
    | Parameter Name  | Type      | Description                                                                                              |
    |:----------------|:----------|:---------------------------------------------------------------------------------------------------------|
    | `y_CASH`        | `Decimal` | The `CASH` balance of the order.                                                                         |
    | `P_a_CASH`      | `Decimal` | The slope of the curve at the y-intercept.                                                               |
    | `P_b_CASH`      | `Decimal` | The slope of the curve at the x-intercept.                                                               |
    | `P_bid`         | `Decimal` | (Optional) The starting rate of the order. If not provided, the y-intercept is set to the token balance. |
    
    ## Returns:
    | Return Name     | Type      | Description                          |
    |:----------------|:----------|:-------------------------------------|
    | `y_int_CASH`    | `Decimal` | The y-intercept of the `CASH` order. |
    
    ## Notes:
    - If the order begins with a token balance of zero, the y-intercept is forced to be `10E-18`, rather than zero.
    - If a starting rate is given, it is used to calculate the y-intercept, else the y-intercept is simply set to the token balance.
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    
    ## LaTeX:
    $$y_{int} = \\frac{y \\left( \\sqrt{P_{bid}} + \\sqrt{P_{b}} \\right) \\left( \\sqrt{P_{a}} - \\sqrt{P_{b}} \\right)}{P_{bid} - P_{b}}$$
    Where: $y_{int}$ = the CASH intercept; $y$ = the CASH token balance; $P_{bid}$ = the intra-range bid price; $P_{b}$ = the low-bound bidding price; $P_{a}$ = the high-bound bidding price.
    """
    if y_CASH == 0:
        y_int_CASH = SMALL
    elif P_a_CASH == P_b_CASH:
        y_int_CASH = y_CASH
    elif P_bid and y_CASH:
        y_int_CASH = y_CASH*(P_bid**(ONE/TWO) + P_b_CASH**(ONE/TWO))*(P_a_CASH**(ONE/TWO) - P_b_CASH**(ONE/TWO))/(P_bid - P_b_CASH)
    else:
        y_int_CASH = y_CASH
    return(y_int_CASH)

# $$y_{int} = \frac{y \left( \sqrt{P_{bid}} + \sqrt{P_{b}} \right) \left( \sqrt{P_{a}} - \sqrt{P_{b}} \right)}{P_{bid} - P_{b}}$$
# Where: $y_{int}$ = the CASH intercept; $y$ = the CASH token balance; $P_{bid}$ = the intra-range bid price; $P_{b}$ = the low-bound bidding price; $P_{a}$ = the high-bound bidding price.

def calculate_yint_RISK(
    y_RISK: Decimal, 
    P_a_RISK: Decimal, 
    P_b_RISK: Decimal,
    P_ask: Decimal
    ) -> Decimal:
    """
    ### Calculates the y-intercept of the `RISK` order for its corresponding `carbon` position.
    
    ## Parameters:
    | Parameter Name | Type      | Description                                |
    |:---------------|:----------|:-------------------------------------------|
    | `y_RISK`       | `Decimal` | The `RISK` balance of the order.           |
    | `P_a_RISK`     | `Decimal` | The slope of the curve at the y-intercept. |
    | `P_b_RISK`     | `Decimal` | The slope of the curve at the x-intercept. |
    | `P_ask`        | `Decimal` | The starting rate of the order.            |
    
    ## Returns:
    | Return Name     | Type      | Description                          |
    |:----------------|:----------|:-------------------------------------|
    | `y_int_RISK`    | `Decimal` | The y-intercept of the `RISK` order. |
    
    ## Notes:
    - If the order begins with a token balance of zero, the y-intercept is forced to be `10E-18`, rather than zero.
    - If a starting rate is given, it is used to calculate the y-intercept, else the y-intercept is simply set to the token balance.
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    
    ## LaTeX:
    $$y_{int} = \\frac{y \\left( \\sqrt{P_{ask}} + \\sqrt{P_{b}} \\right) \\left( \\sqrt{P_{a}} - \\sqrt{P_{b}} \\right)}{P_{ask} - P_{b}}$$
    Where: $y_{int}$ = the RISK intercept; $y$ = the RISK token balance; $P_{ask}$ = the intra-range ask price; $P_{b}$ = the high-bound asking price; $P_{a}$ = the low-bound asking price.
    """
    if y_RISK == 0:
        y_int_RISK = SMALL
    elif P_a_RISK == P_b_RISK:
        y_int_RISK = y_RISK
    elif P_ask and y_RISK:
        y_int_RISK = y_RISK*((P_ask)**(ONE/TWO) + P_b_RISK**(ONE/TWO))*(P_a_RISK**(ONE/TWO) - P_b_RISK**(ONE/TWO))/(P_ask - P_b_RISK)
    else:
        y_int_RISK = y_RISK
    return(y_int_RISK)

# $$y_{int} = \frac{y \left( \sqrt{P_{ask}} + \sqrt{P_{b}} \right) \left( \sqrt{P_{a}} - \sqrt{P_{b}} \right)}{P_{ask} - P_{b}}$$
# Where: $y_{int}$ = the RISK intercept; $y$ = the RISK token balance; $P_{ask}$ = the intra-range ask price; $P_{b}$ = the high-bound asking price; $P_{a}$ = the low-bound asking price.

def calculate_x_int_from_P_a_P_b_y_int(
    P_a: Decimal,
    P_b: Decimal,
    y_int: Decimal
    ) -> Decimal:
    """
    ### Calculates the x-intercept `x_int` for a `carbon` curve given `P_a`, `P_b`, and `y_int`.
    
    ## Parameters:
    | Parameter Name | Type      | Description                                 |
    |:---------------|:----------|:--------------------------------------------|
    | `P_a`          | `Decimal` | The slope of the curve at the y-intercept.  |
    | `P_b`          | `Decimal` | The slope of the curve at the x-intercept.  |
    | `y_int`        | `Decimal` | The y-intercept of the curve.               |
    
    ## Returns:
    | Return Name | Type      | Description                      |
    |:------------|:----------|:---------------------------------|
    | `x_int`     | `Decimal` | The x-intercept of the curve.    |
    
    ## Example:
    >>> calculate_x_int_from_P_a_P_b_y_int(Decimal('5.432100000000000000'), 
                                           Decimal('1.234500000000000000'), 
                                           Decimal('12345.000000000000000000'))
    Decimal('4767.181301594133397598421388688078397367744648400041527595377594716036056540324031428912313911218224')
    
    ## Notes:
    - This function is used to calculate the `x_int` value for a `carbon` curve.
    - The identity of `x_int` (either `CASH` or `RISK`) is the appropriate counterpart of `y_int`. 
    - E.g. if `P_a_RISK`, `P_b_RISK` and `y_int_RISK` are passed as arguments, `x_int_RISK` is returned.
    - The naming convention indicates which `carbon` order the `x_int` parameter belongs to. 
    - In contrast to `uniswap_v3`, the `x_int` value on a `carbon` curve does not represent a token balance coordinate; both `CASH` and `RISK` orders have their own unique `x_int_CASH` and `x_int_RISK` parameters.
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    
    ## LaTeX:
    $$x_{int} = \frac{y_{int}}{\sqrt{P_{a} P_{b}}}$$
    Where: $x_{int}$, $y_{int}$ = CASH or RISK intercept; $P_{b}$, $P_{a}$ = the high or low-bound asking price.
    """
    x_int = y_int/(P_a*P_b)**(ONE/TWO)
    return(x_int)

# $$x_{int} = \frac{y_{int}}{\sqrt{P_{a} P_{b}}}$$
# Where: 
# $x_{int}$, $y_{int}$ = CASH or RISK intercept; $P_{b}$, $P_{a}$ = the high- or low-bound asking/bidding price.

def calculate_x_0_from_P_a_P_b_y_int(
    P_a: Decimal,
    P_b: Decimal,
    y_int: Decimal
    ) -> Decimal:
    """
    ### Calculates the x-pivot, `x_0`, for a `carbon` curve given `P_a`, `P_b`, and `y_int`.
    
    ## Parameters:
    | Parameter Name | Type      | Description                                  |
    |:---------------|:----------|:---------------------------------------------|
    | `P_a`          | `Decimal` | The slope of the curve at the y-intercept.   |
    | `P_b`          | `Decimal` | The slope of the curve at the x-intercept.   |
    | `y_int`        | `Decimal` | The y-intercept of the position.             |
    
    ## Returns:
    | Return Name | Type      | Description                                                                                       |
    |:------------|:----------|:--------------------------------------------------------------------------------------------------|
    | `x_0`       | `Decimal` | The x-pivot, which is the x-coordinate at the point where the slope of the curve is equal to `P`. |
    
    ## Example:
    >>> calculate_x_0_from_P_a_P_b_y_int(Decimal('5.432100000000000000'), 
                                        Decimal('1.234500000000000000'), 
                                        Decimal('12345.000000000000000000'))
    Decimal('1947.111156999702762485943105531985450346954164518294952814980372258746420032496193247382543731314623')
    
    ## Notes:
    - This function is used to calculate the `x_0` value for a `carbon` curve.
    - The identity of `x_0` (either `CASH` or `RISK`) is the appropriate counterpart of `y_int`. 
    - E.g. if `P_a_RISK`, `P_b_RISK` and `y_int_RISK` are passed as arguments, `x_0_RISK` is returned.
    - The naming convention indicates which `carbon` order the `x_0` parameter belongs to. 
    - In contrast to `uniswap_v3`, the `x_0` value on a `carbon` curve does not represent a token balance coordinate; both `CASH` and `RISK` orders have their own unique `x_0_CASH` and `x_0_RISK` parameters.
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    
    ## LaTeX:
    $$\\lim_{P_{a} \\rightarrow P_{b}} \\left( \\frac{y_{int} \\left( \\sqrt[4]{P_{a} P_{b}} - \\sqrt{P_{b}}\\right)}{\\sqrt{P_{a} P_{b}} \\left( \\sqrt{P_{a}} - \\sqrt{P_{b}}\\right)}\\right) = \\frac{y_{int}}{2 P_{a}}$$
    Where: $x_{0}$ = CASH or RISK pivot; $y_{int}$ = CASH or RISK intercept; $P_{b}$, $P_{a}$ = the high or low-bound asking price.
    """
    if P_a == P_b:
        x_0 = y_int/(TWO*P_a) # == y_int/(TWO*P_b) == y_int/(TWO*(P_a*P_b)**(ONE/TWO)) == y_int/(TWO*P)
    else:
        x_0 = y_int*((P_a*P_b)**(ONE/FOUR) - P_b**(ONE/TWO))/((P_a*P_b)**(ONE/TWO)*(P_a**(ONE/TWO) - P_b**(ONE/TWO)))
    return(x_0)

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

def calculate_x_asym_from_P_a_P_b_y_int(
    P_a: Decimal,
    P_b: Decimal,
    y_int: Decimal
    ) -> Union[Decimal, None]:
    """
    ### Calculates the x-asymptote, `x_asym`, for a `carbon` curve given `P_a`, `P_b`, and `y_int`.
    
    ## Parameters:
    | Parameter Name | Type      | Description                                 |
    |:---------------|:----------|:--------------------------------------------|
    | `P_a`          | `Decimal` | The slope of the curve at the y-intercept.  |
    | `P_b`          | `Decimal` | The slope of the curve at the x-intercept.  |
    | `y_int`        | `Decimal` | The y-intercept of the curve.               |
    
    ## Returns:
    | Return Name | Type                   | Description                       |
    |:------------|:-----------------------|:----------------------------------|
    | `x_asym`    | `Union[Decimal, None]` | The x-asymptote of the curve.     |
    
    ## Example:
    >>> calculate_x_asym_from_P_a_P_b_y_int(Decimal('5.432100000000000000'), 
                                            Decimal('1.234500000000000000'), 
                                            Decimal('12345.000000000000000000'))
    Decimal('-4342.978205836182027667060035338153416607223358216564528734632561624963434295556988945824340462025661')
    
    ## Notes:
    - This function is used to calculate the x-asymptote, `x_asym`, for a `carbon` curve.
    - The identity of `x_asym` (either `CASH` or `RISK`) is the appropriate counterpart of `y_int`. 
    - E.g. if `P_a_RISK`, `P_b_RISK` and `y_int_RISK` are passed as arguments, `x_asym_RISK` is returned.
    - The naming convention indicates which `carbon` order the `x_asym` parameter belongs to. 
    - In contrast to `uniswap_v3`, the `x_asym` value on a `carbon` curve does not represent a token balance coordinate; both `CASH` and `RISK` orders have their own unique `x_asym_CASH` and `x_asym_RISK` parameters.
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    
    ## LaTeX:
    $$x_{asym} = \\frac{y_{int} \\sqrt{P_{b}}}{\\sqrt{P_{a} P_{b}} \\left(\\sqrt{P_{b}} - \\sqrt{P_{a}}\\right)}$$
    Where: $x_{asym}$ = CASH or RISK asymptote; $y_{int}$ = CASH or RISK intercept; $P_{b}$, $P_{a}$ = the high- or low-bound asking/bidding price.
    """
    if P_a == P_b:
        x_asym = None
    else:
        x_asym = P_b**(ONE/TWO)*y_int/((P_a*P_b)**(ONE/TWO)*(P_b**(ONE/TWO) - P_a**(ONE/TWO)))
    return(x_asym)

# $$
# x_{asym} = \frac{y_{int} \sqrt{P_{b}}}{\sqrt{P_{a} P_{b}} \left(\sqrt{P_{b}} - \sqrt{P_{a}}\right)}
# $$
# Where:
# $x_{asym}$ = CASH or RISK asymptote; $y_{int}$ = CASH or RISK intercept; $P_{b}$, $P_{a}$ = the high- or low-bound asking/bidding price.

def calculate_y_0_from_P_a_P_b_y_int(
    P_a: Decimal,
    P_b: Decimal,
    y_int: Decimal
    ) -> Decimal:
    """
    ### Calculates the y-pivot, `y_0`, for a `carbon` curve given `P_a`, `P_b`, and `y_int`.
    
    ## Parameters:
    | Parameter Name | Type      | Description                                 |
    |:---------------|:----------|:--------------------------------------------|
    | `P_a`          | `Decimal` | The slope of the curve at the y-intercept.  |
    | `P_b`          | `Decimal` | The slope of the curve at the x-intercept.  |
    | `y_int`        | `Decimal` | The y-intercept of the curve.               |
    
    ## Returns:
    | Return Name | Type      | Description                                                                                       |
    |:------------|:----------|:--------------------------------------------------------------------------------------------------|
    | `y_0`       | `Decimal` | The y-pivot, which is the y-coordinate at the point where the slope of the curve is equal to `P`. |
    
    ## Example:
    >>> calculate_y_0_from_P_a_P_b_y_int(Decimal('5.432100000000000000'), 
                                         Decimal('1.234500000000000000'), 
                                         Decimal('12345.000000000000000000'))
    Decimal('5042.201190276398610654654127237303085657750924976601285197383387829605222958288092355648138515752862')
    
    ## Notes:
    - This function is used to calculate the `y_0` value for a `carbon` curve.
    - The identity of `y_0` (either `CASH` or `RISK`) is the appropriate counterpart of `y_int`. 
    - E.g. if `P_a_RISK`, `P_b_RISK` and `y_int_RISK` are passed as arguments, `y_0_RISK` is returned.
    - The naming convention indicates which `carbon` order the `y_0` parameter belongs to. 
    - In contrast to `uniswap_v3`, the `y_0` value on a `carbon` curve does not represent a token balance coordinate; both `CASH` and `RISK` orders have their own unique `y_0_CASH` and `y_0_RISK` parameters.
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    
    ## LaTeX:
    $$\\lim_{P_{a} \\rightarrow P_{b}} \\left( \\frac{y_{int} \\left( \\sqrt[4]{P_{a} P_{b}} - \\sqrt{P_{b}}\\right)}{\\sqrt{P_{a}} - \\sqrt{P_{b}}}\\right) = \\frac{y_{int}}{2}$$
    Where: $x_{0}$ = CASH or RISK pivot; $y_{int}$ = CASH or RISK intercept; $P_{b}$, $P_{a}$ = the high or low-bound asking price.
    """
    if P_a == P_b:
        y_0 = y_int/TWO
    else:
        y_0 = y_int*((P_a*P_b)**(ONE/FOUR) - P_b**(ONE/TWO))/(P_a**(ONE/TWO) - P_b**(ONE/TWO))
    return(y_0)

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

def calculate_y_asym_from_P_a_P_b_y_int(
    P_a: Decimal,
    P_b: Decimal,
    y_int: Decimal
    ) -> Union[Decimal, None]:
    """
    ### Calculates the y-asymptote, `y_asym`, for a `carbon` curve given `P_a`, `P_b`, and `y_int`.
    
    ## Parameters:
    | Parameter Name | Type      | Description                                 |
    |:---------------|:----------|:--------------------------------------------|
    | `P_a`          | `Decimal` | The slope of the curve at the y-intercept.  |
    | `P_b`          | `Decimal` | The slope of the curve at the x-intercept.  |
    | `y_int`        | `Decimal` | The y-intercept of the curve.               |
    
    ## Returns:
    | Return Name | Type                   | Description                          |
    |:------------|:-----------------------|:-------------------------------------|
    | `y_asym`    | `Union[Decimal, None]` | The y-asymptote of the curve.        |
    
    ## Example:
    >>> calculate_y_asym_from_P_a_P_b_y_int(Decimal('5.432100000000000000'), 
                                            Decimal('1.234500000000000000'), 
                                            Decimal('12345.000000000000000000'))
    Decimal('-11246.49191192272439249023681796038317435209800416820017653939753800296387143689511965261239982376958')
    
    ## Notes:
    - This function is used to calculate the `y_asym` value for a `carbon` curve.
    - The identity of `y_asym` (either `CASH` or `RISK`) is the appropriate counterpart of `y_int`. 
    - E.g. if `P_a_RISK`, `P_b_RISK` and `y_int_RISK` are passed as arguments, `y_asym_RISK` is returned.
    - The naming convention indicates which `carbon` order the `y_asym` parameter belongs to. 
    - In contrast to `uniswap_v3`, the `y_asym` value on a `carbon` curve does not represent a token balance coordinate; both `CASH` and `RISK` orders have their own unique `y_asym_CASH` and `y_asym_RISK` parameters.
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    
    ## LaTeX:
    $$y_{asym} = \\frac{y_{int} \\sqrt{P_{b}}}{\\sqrt{P_{b}} - \\sqrt{P_{a}}}$$
    Where: $y_{asym}$ = CASH or RISK asymptote; $y_{int}$ = CASH or RISK intercept; $P_{b}$, $P_{a}$ = the high- or low-bound asking/bidding price.
    """
    if P_a == P_b:
        y_asym = None
    else:
        y_asym = P_b**(ONE/TWO)*y_int/(P_b**(ONE/TWO) - P_a**(ONE/TWO))
    return(y_asym)

# $$
# y_{asym} = \frac{y_{int} \sqrt{P_{b}}}{\sqrt{P_{b}} - \sqrt{P_{a}}}
# $$
# Where:
# $y_{asym}$ = CASH or RISK asymptote; $y_{int}$ = CASH or RISK intercept; $P_{b}$, $P_{a}$ = the high- or low-bound asking/bidding price.

def get_carbon_pivots_asymptotes_and_x_intercepts(
    P_a: Decimal,
    P_b: Decimal,
    y_int: Decimal
    ) -> Decimal:
    """
    ### Retrieves `x_int`, `x_0`, `x_asym`, `y_0`, and `y_asym` from the `P_a`, `P_b`, and `y_int` curve constants.
    
    ## Parameters:
    | Parameter name | Type      | Description                                            |
    |:---------------|:----------|:-------------------------------------------------------|
    | `P_a`          | `Decimal` | The `P_a` curve constant.                              |
    | `P_b`          | `Decimal` | The `P_b` curve constant.                              |
    | `y_int`        | `Decimal` | The `y_int` curve constant (y-intercept).              |
    
    ## Returns:
    | Return name | Type                                                 | Description                                                              |
    |:------------|:-----------------------------------------------------|:-------------------------------------------------------------------------|
    | `x_int`     | `Decimal`                                            | The x-intercept of the `carbon` curve.                                   |
    | `x_0`       | `Decimal`                                            | The x-pivot of the `carbon` curve.                                       |
    | `x_asym`    | `Decimal`                                            | The x-asymptote of the `carbon` curve.                                   |
    | `y_0`       | `Decimal`                                            | The y-pivot of the `carbon` curve.                                       |
    | `y_asym`    | `Decimal`                                            | The y-asymptote of the `carbon` curve.                                   |
    |             | `Tuple[Decimal, Decimal, Decimal, Decimal, Decimal]` | A tuple of `x_int`, `x_0`, `x_asym`, `y_0`, and `y_asym`, in that order. |
    
    ## Dependencies:
    | Dependency name:                         | Type       | Description                                                                                 |
    |:-----------------------------------------|:-----------|:--------------------------------------------------------------------------------------------|
    | `calculate_x_int_from_P_a_P_b_y_int`     | `function` | Calculates the x-intercept `x_int` for a `carbon` curve given `P_a`, `P_b`, and `y_int`.    |
    | `calculate_x_0_from_P_a_P_b_y_int`       | `function` | Calculates the x-pivot, `x_0`, for a `carbon` curve given `P_a`, `P_b`, and `y_int`.        |
    | `calculate_x_asym_from_P_a_P_b_y_int`    | `function` | Calculates the x-asymptote, `x_asym`, for a `carbon` curve given `P_a`, `P_b`, and `y_int`. |
    | `calculate_y_0_from_P_a_P_b_y_int`       | `function` | Calculates the y-pivot, `y_0`, for a `carbon` curve given `P_a`, `P_b`, and `y_int`.        |
    | `calculate_y_asym_from_P_a_P_b_y_int`    | `function` | Calculates the y-asymptote, `y_asym`, for a `carbon` curve given `P_a`, `P_b`, and `y_int`. |
    
    ## Example:
    >>> get_carbon_pivots_asymptotes_and_x_intercepts(Decimal('5.432100000000000000'), 
                                                      Decimal('1.234500000000000000'), 
                                                      Decimal('12345.000000000000000000'))
    (Decimal('4767.181301594133397598421388688078397367744648400041527595377594716036056540324031428912313911218224'),
     Decimal('1947.111156999702762485943105531985450346954164518294952814980372258746420032496193247382543731314623'),
     Decimal('5042.201190276398610654654127237303085657750924976601285197383387829605222958288092355648138515752862'),
     Decimal('-11246.49191192272439249023681796038317435209800416820017653939753800296387143689511965261239982376958'),
     Decimal('-4342.978205836182027667060035338153416607223358216564528734632561624963434295556988945824340462025661'))
     
    ## Notes:
    - This function calculates the `x_int`, `x_0`, `x_asym`, `y_0`, and `y_asym` values for a `carbon` concentrated bonding curve.
    - `x_int` represents the x-intercept, `x_0` and `y_0` are the initial pivot values, and `x_asym` and `y_asym` are the asymptote values for the curve.
    - The function utilizes the provided `P_a`, `P_b`, and `y_int` values to calculate the required curve constants.
    - The curve constants are essential for determining the shape and behavior of the concentrated bonding curve, which governs the relationship between the `CASH` and `RISK` tokens in the Carbon DeFi ecosystem.
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    """
    x_int = calculate_x_int_from_P_a_P_b_y_int(P_a, P_b, y_int)
    x_0 = calculate_x_0_from_P_a_P_b_y_int(P_a, P_b, y_int)
    x_asym = calculate_x_asym_from_P_a_P_b_y_int(P_a, P_b, y_int)
    y_0 = calculate_y_0_from_P_a_P_b_y_int(P_a, P_b, y_int)
    y_asym = calculate_y_asym_from_P_a_P_b_y_int(P_a, P_b, y_int)
    return(x_int, x_0, x_asym, y_0, y_asym)

def get_carbon_start_state(
    starting_portfolio_CASH_value: Decimal, 
    starting_portfolio_RISK_value: Decimal, 
    high_range_high_price_CASH: Decimal, # 1/Pb
    high_range_low_price_CASH: Decimal, # 1/Pa
    low_range_high_price_CASH: Decimal, # Pa
    low_range_low_price_CASH: Decimal, # Pb
    start_rate_high_range: Decimal = None,
    start_rate_low_range: Decimal = None,
    ) -> Tuple[Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal]:
    """
    ### This function calculates the starting state for a `carbon` position.
    
    ## Parameters:
    | Parameter Name                      | Type      | Description                                                                                             |
    |:------------------------------------|:----------|:--------------------------------------------------------------------------------------------------------|
    | `starting_portfolio_value`          | `Decimal` | The starting value of the portfolio.                                                                    |
    | `high_range_high_price_CASH`        | `Decimal` | The high price bound of the high range (i.e. the sell range).                                           |
    | `high_range_low_price_CASH`         | `Decimal` | The low price bound of the high range (i.e. the sell range).                                            |
    | `low_range_high_price_CASH`         | `Decimal` | The high price bound of the low range (i.e. the buy range).                                             |
    | `low_range_low_price_CASH`          | `Decimal` | The low price bound of the low range (i.e. the buy range).                                              |
    | `checked_RISK_proportion`           | `Decimal` | The proportion of the portfolio invested in `RISK`.                                                     |
    | `checked_CASH_proportion`           | `Decimal` | The proportion of the portfolio invested in `CASH`.                                                     |
    | `start_rate_high_range`             | `Decimal` | The user-elected starting price within the high range (i.e. the sell range).                            |
    | `start_rate_low_range`              | `Decimal` | The user-elected starting price within the low range (i.e. the buy range).                              |
    
    ## Returns:
    | Return Name   | Type                                                                                                                                                                                                                                                                                                    | Description                                                                                                                                                                                                                                                                                                                                                                                                       |
    |:--------------|:--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|:------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
    | `y_RISK`      | `Decimal`                                                                                                                                                                                                                                                                                               | The starting balance of the `RISK` order.                                                                                                                                                                                                                                                                                                                                                                         |
    | `y_0_RISK`    | `Decimal`                                                                                                                                                                                                                                                                                               | The y-pivot of the `RISK` order curve.                                                                                                                                                                                                                                                                                                                                                                            |
    | `x_0_RISK`    | `Decimal`                                                                                                                                                                                                                                                                                               | The x-pivot of the `RISK` order curve.                                                                                                                                                                                                                                                                                                                                                                            |
    | `y_int_RISK`  | `Decimal`                                                                                                                                                                                                                                                                                               | The y-intercept of the `RISK` order curve.                                                                                                                                                                                                                                                                                                                                                                        |
    | `x_int_RISK`  | `Decimal`                                                                                                                                                                                                                                                                                               | The x-intercept of the `RISK` order curve.                                                                                                                                                                                                                                                                                                                                                                        |
    | `y_asym_RISK` | `Decimal`                                                                                                                                                                                                                                                                                               | The y-aymptote of the `RISK` order curve.                                                                                                                                                                                                                                                                                                                                                                         |
    | `x_asym_RISK` | `Decimal`                                                                                                                                                                                                                                                                                               | The x-aymptote of the `RISK` order curve.                                                                                                                                                                                                                                                                                                                                                                         |
    | `P_a_RISK`    | `Decimal`                                                                                                                                                                                                                                                                                               | The slope of the `RISK` curve at the y-intercept.                                                                                                                                                                                                                                                                                                                                                                 |
    | `P_b_RISK`    | `Decimal`                                                                                                                                                                                                                                                                                               | The slope of the `RISK` curve at the x-intercept.                                                                                                                                                                                                                                                                                                                                                                 |
    | `B_RISK`      | `Decimal`                                                                                                                                                                                                                                                                                               | The `B` value for the `RISK` order on `carbon`.                                                                                                                                                                                                                                                                                                                                                                   |
    | `P_RISK`      | `Decimal`                                                                                                                                                                                                                                                                                               | The `P` value for the `RISK` order on `carbon`.                                                                                                                                                                                                                                                                                                                                                                   |
    | `Q_RISK`      | `Decimal`                                                                                                                                                                                                                                                                                               | The `Q` value for the `RISK` order on `carbon`.                                                                                                                                                                                                                                                                                                                                                                   |
    | `R_RISK`      | `Decimal`                                                                                                                                                                                                                                                                                               | The `R` value for the `RISK` order on `carbon`.                                                                                                                                                                                                                                                                                                                                                                   |
    | `S_RISK`      | `Decimal`                                                                                                                                                                                                                                                                                               | The `S` value for the `RISK` order on `carbon`.                                                                                                                                                                                                                                                                                                                                                                   |
    | `n_RISK`      | `Decimal`                                                                                                                                                                                                                                                                                               | The `n` value for the `RISK` order on `carbon`.                                                                                                                                                                                                                                                                                                                                                                   |
    | `k_RISK`      | `Decimal`                                                                                                                                                                                                                                                                                               | The fundamental hyperbolic constant `k` for the `RISK` order on `carbon`.                                                                                                                                                                                                                                                                                                                                         |
    | `y_CASH`      | `Decimal`                                                                                                                                                                                                                                                                                               | The starting balance of the `CASH` order.                                                                                                                                                                                                                                                                                                                                                                         |
    | `y_0_CASH`    | `Decimal`                                                                                                                                                                                                                                                                                               | The y-pivot of the `CASH` order curve.                                                                                                                                                                                                                                                                                                                                                                            |
    | `x_0_CASH`    | `Decimal`                                                                                                                                                                                                                                                                                               | The x-pivot of the `CASH` order curve.                                                                                                                                                                                                                                                                                                                                                                            |
    | `y_int_CASH`  | `Decimal`                                                                                                                                                                                                                                                                                               | The y-intercept of the `CASH` order curve.                                                                                                                                                                                                                                                                                                                                                                        |
    | `x_int_CASH`  | `Decimal`                                                                                                                                                                                                                                                                                               | The x-intercept of the `CASH` order curve.                                                                                                                                                                                                                                                                                                                                                                        |
    | `y_asym_CASH` | `Decimal`                                                                                                                                                                                                                                                                                               | The y-aymptote of the `CASH` order curve.                                                                                                                                                                                                                                                                                                                                                                         |
    | `x_asym_CASH` | `Decimal`                                                                                                                                                                                                                                                                                               | The x-aymptote of the `CASH` order curve.                                                                                                                                                                                                                                                                                                                                                                         |
    | `P_a_CASH`    | `Decimal`                                                                                                                                                                                                                                                                                               | The slope of the `CASH` curve at the y-intercept.                                                                                                                                                                                                                                                                                                                                                                 |
    | `P_b_CASH`    | `Decimal`                                                                                                                                                                                                                                                                                               | The slope of the `CASH` curve at the x-intercept.                                                                                                                                                                                                                                                                                                                                                                 |
    | `B_CASH`      | `Decimal`                                                                                                                                                                                                                                                                                               | The `B` value for the `CASH` order on `carbon`.                                                                                                                                                                                                                                                                                                                                                                   |
    | `P_CASH`      | `Decimal`                                                                                                                                                                                                                                                                                               | The `P` value for the `CASH` order on `carbon`.                                                                                                                                                                                                                                                                                                                                                                   |
    | `Q_CASH`      | `Decimal`                                                                                                                                                                                                                                                                                               | The `Q` value for the `CASH` order on `carbon`.                                                                                                                                                                                                                                                                                                                                                                   |
    | `R_CASH`      | `Decimal`                                                                                                                                                                                                                                                                                               | The `R` value for the `CASH` order on `carbon`.                                                                                                                                                                                                                                                                                                                                                                   |
    | `S_CASH`      | `Decimal`                                                                                                                                                                                                                                                                                               | The `S` value for the `CASH` order on `carbon`.                                                                                                                                                                                                                                                                                                                                                                   |
    | `n_CASH`      | `Decimal`                                                                                                                                                                                                                                                                                               | The `n` value for the `CASH` order on `carbon`.                                                                                                                                                                                                                                                                                                                                                                   |   
    | `k_CASH`      | `Decimal`                                                                                                                                                                                                                                                                                               | The fundamental hyperbolic constant `k` for the `CASH` order on `carbon`.                                                                                                                                                                                                                                                                                                                                         |
    |               | `Tuple[Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal]` | A tuple of `y_RISK`, `y_0_RISK`, `x_0_RISK`, `y_int_RISK`, `x_int_RISK`, `y_asym_RISK`, `x_asym_RISK`, `P_a_RISK`, `P_b_RISK`, `B_RISK`, `P_RISK`, `Q_RISK`, `R_RISK`, `S_RISK`, `n_RISK`, `k_RISK`, `y_CASH`, `y_0_CASH`, `x_0_CASH`, `y_int_CASH`, `x_int_CASH`, `y_asym_CASH`, `x_asym_CASH`, `P_a_CASH`, `P_b_CASH`, `B_CASH`, `P_CASH`, `Q_CASH`, `R_CASH`, `S_CASH`, `n_CASH`, and `k_CASH,` in that order. |

    ## Dependencies:
    | Dependency name                                 | Type       | Description                                                                                                  |
    |:------------------------------------------------|:-----------|:-------------------------------------------------------------------------------------------------------------|
    | `get_carbon_starting_order_balances`            | `function` | Calculates the starting order balances for the `carbon` strategy.                                            |
    | `calculate_yint_RISK`                           | `function` | Calculates the y-intercept of the `RISK` `carbon` order.                                                     |
    | `calculate_yint_CASH`                           | `function` | Calculates the y-intercept of the `CASH` `carbon` order.                                                     |
    | `get_concentrated_liquidity_curve_constants`    | `function` | Retrieves the curve constants for a concentrated liquidity protocol.                                         |
    | `get_carbon_pivots_asymptotes_and_x_intercepts` | `function` | Retrieves `x_int`, `x_0`, `x_asym`, `y_0`, and `y_asym` from the `P_a`, `P_b`, and `y_int` curve constants.  |
    | `calculate_hyperbolic_constant_k`               | `function` | Calculate the hyperbolic constant `k` given `x` and `y` values.                                              |
    
    ## Notes:
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    """
    y_CASH, y_RISK = starting_portfolio_CASH_value, starting_portfolio_RISK_value
    P_a_RISK, P_b_RISK, B_RISK, P_RISK, Q_RISK, R_RISK, S_RISK, n_RISK = get_concentrated_liquidity_scaling_constants(ONE/high_range_low_price_CASH, ONE/high_range_high_price_CASH)
    P_a_CASH, P_b_CASH, B_CASH, P_CASH, Q_CASH, R_CASH, S_CASH, n_CASH = get_concentrated_liquidity_scaling_constants(low_range_high_price_CASH, low_range_low_price_CASH)
    y_int_RISK = calculate_yint_RISK(y_RISK, P_a_RISK, P_b_RISK, ONE/start_rate_high_range)
    y_int_CASH = calculate_yint_CASH(y_CASH, P_a_CASH, P_b_CASH, start_rate_low_range)
    x_int_RISK, x_0_RISK, x_asym_RISK, y_0_RISK, y_asym_RISK = get_carbon_pivots_asymptotes_and_x_intercepts(P_a_RISK, P_b_RISK, y_int_RISK)
    x_int_CASH, x_0_CASH, x_asym_CASH, y_0_CASH, y_asym_CASH = get_carbon_pivots_asymptotes_and_x_intercepts(P_a_CASH, P_b_CASH, y_int_CASH)
    k_RISK = calculate_hyperbolic_constant_k(x_0_RISK, y_0_RISK)
    k_CASH = calculate_hyperbolic_constant_k(x_0_CASH, y_0_CASH)
    return(y_RISK, y_0_RISK, x_0_RISK, y_int_RISK, x_int_RISK, y_asym_RISK, x_asym_RISK, P_a_RISK, P_b_RISK, B_RISK, P_RISK, Q_RISK, R_RISK, S_RISK, n_RISK, k_RISK,
           y_CASH, y_0_CASH, x_0_CASH, y_int_CASH, x_int_CASH, y_asym_CASH, x_asym_CASH, P_a_CASH, P_b_CASH, B_CASH, P_CASH, Q_CASH, R_CASH, S_CASH, n_CASH, k_CASH)

def get_carbon_dict(
    y_RISK: Decimal, 
    y_0_RISK: Decimal, 
    x_0_RISK: Decimal, 
    y_int_RISK: Decimal, 
    x_int_RISK: Decimal, 
    y_asym_RISK: Decimal, 
    x_asym_RISK: Decimal, 
    P_a_RISK: Decimal, 
    P_b_RISK: Decimal, 
    B_RISK: Decimal, 
    P_RISK: Decimal, 
    Q_RISK: Decimal, 
    R_RISK: Decimal, 
    S_RISK: Decimal, 
    n_RISK: Decimal,
    k_RISK: Decimal,
    y_CASH: Decimal, 
    y_0_CASH: Decimal, 
    x_0_CASH: Decimal, 
    y_int_CASH: Decimal, 
    x_int_CASH: Decimal, 
    y_asym_CASH: Decimal, 
    x_asym_CASH: Decimal, 
    P_a_CASH: Decimal, 
    P_b_CASH: Decimal, 
    B_CASH: Decimal, 
    P_CASH: Decimal, 
    Q_CASH: Decimal, 
    R_CASH: Decimal, 
    S_CASH: Decimal, 
    n_CASH: Decimal,
    k_CASH: Decimal,
    fee: Decimal
    ) -> None:
    """
    ### Adds appropriate information to the carbon protocol in the `PROTOCOLS` dictionary.

    ## Parameters:
    | Parameter Name   | Type      | Description                                                               |
    |:-----------------|:----------|:--------------------------------------------------------------------------|
    | `y_RISK`         | `Decimal` | The starting balance of the `RISK` order.                                 |
    | `y_0_RISK`       | `Decimal` | The y-pivot of the `RISK` order curve.                                    |
    | `x_0_RISK`       | `Decimal` | The x-pivot of the `RISK` order curve.                                    |
    | `y_int_RISK`     | `Decimal` | The y-intercept of the `RISK` order curve.                                |
    | `x_int_RISK`     | `Decimal` | The x-intercept of the `RISK` order curve.                                |
    | `y_asym_RISK`    | `Decimal` | The y-aymptote of the `RISK` order curve.                                 |
    | `x_asym_RISK`    | `Decimal` | The x-aymptote of the `RISK` order curve.                                 |
    | `P_a_RISK`       | `Decimal` | The slope of the `RISK` curve at the y-intercept.                         |
    | `P_b_RISK`       | `Decimal` | The slope of the `RISK` curve at the x-intercept.                         |
    | `B_RISK`         | `Decimal` | The `B` value for the `RISK` order on `carbon`.                           |
    | `P_RISK`         | `Decimal` | The `P` value for the `RISK` order on `carbon`.                           |
    | `Q_RISK`         | `Decimal` | The `Q` value for the `RISK` order on `carbon`.                           |
    | `R_RISK`         | `Decimal` | The `R` value for the `RISK` order on `carbon`.                           |
    | `S_RISK`         | `Decimal` | The `S` value for the `RISK` order on `carbon`.                           |
    | `n_RISK`         | `Decimal` | The `n` value for the `RISK` order on `carbon`.                           |
    | `k_RISK`         | `Decimal` | The fundamental hyperbolic constant `k` for the `RISK` order on `carbon`. |
    | `y_CASH`         | `Decimal` | The starting balance of the `CASH` order.                                 |
    | `y_0_CASH`       | `Decimal` | The y-pivot of the `CASH` order curve.                                    |
    | `x_0_CASH`       | `Decimal` | The x-pivot of the `CASH` order curve.                                    |
    | `y_int_CASH`     | `Decimal` | The y-intercept of the `CASH` order curve.                                |
    | `x_int_CASH`     | `Decimal` | The x-intercept of the `CASH` order curve.                                |
    | `y_asym_CASH`    | `Decimal` | The y-aymptote of the `CASH` order curve.                                 |
    | `x_asym_CASH`    | `Decimal` | The x-aymptote of the `CASH` order curve.                                 |
    | `P_a_CASH`       | `Decimal` | The slope of the `CASH` curve at the y-intercept.                         |
    | `P_b_CASH`       | `Decimal` | The slope of the `CASH` curve at the x-intercept.                         |
    | `B_CASH`         | `Decimal` | The `B` value for the `CASH` order on `carbon`.                           |
    | `P_CASH`         | `Decimal` | The `P` value for the `CASH` order on `carbon`.                           |
    | `Q_CASH`         | `Decimal` | The `Q` value for the `CASH` order on `carbon`.                           |
    | `R_CASH`         | `Decimal` | The `R` value for the `CASH` order on `carbon`.                           |
    | `S_CASH`         | `Decimal` | The `S` value for the `CASH` order on `carbon`.                           |
    | `n_CASH`         | `Decimal` | The `n` value for the `CASH` order on `carbon`.                           |
    | `k_CASH`         | `Decimal` | The fundamental hyperbolic constant `k` for the `CASH` order on `carbon`. |
    | `fee`            | `Decimal` | The network fee for the `carbon` protocol.                                |

    ## Returns:
    None
    
    ## Dependencies:
    | Dependency name   | Type      | Description                                                                                                                           |
    |:------------------|:----------|:--------------------------------------------------------------------------------------------------------------------------------------|
    | `MARKETPRICE`     | `Decimal` | A `global` variable representing the current market price of `RISK` in units of `CASH` per `RISK`.                                    |
    | `PROTOCOLS`       | `dict`    | A `global` dictionary with each of the protocol name strings as keys, and the appropriate protocol dictionaries themselves as values. |
    
    ## Notes:
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    """
    global MARKETPRICE
    global PROTOCOLS
    
    PROTOCOLS['carbon']['curve parameters']['CASH'] = {
        'date' : [pd.Timestamp('2015-07-30 15:26:13')],
        "y_0" : [y_0_CASH],
        "y_int" : [y_int_CASH],
        "y_asym" : [y_asym_CASH],
        "x_0" : [x_0_CASH],
        "x_int" : [x_int_CASH],
        "x_asym" : [x_asym_CASH],
        "P_a" : [P_a_CASH],
        "P_b" : [P_b_CASH],
        "B" : [B_CASH],
        "P" : [P_CASH],
        "Q" : [Q_CASH],
        "R" : [R_CASH],
        "S" : [S_CASH],
        "n" : [n_CASH],
        "k" : [k_CASH],
        "fee" : [fee]
        }
    
    PROTOCOLS['carbon']['curve parameters']['RISK'] = {
        'date' : [pd.Timestamp('2015-07-30 15:26:13')],
        "y_0" : [y_0_RISK],
        "y_int" : [y_int_RISK],
        "y_asym" : [y_asym_RISK],
        "x_0" : [x_0_RISK],
        "x_int" : [x_int_RISK],
        "x_asym" : [x_asym_RISK],
        "P_a" : [P_a_RISK],
        "P_b" : [P_b_RISK],
        "B" : [B_RISK],
        "P" : [P_RISK],
        "Q" : [Q_RISK],
        "R" : [R_RISK],
        "S" : [S_RISK],
        "n" : [n_RISK],
        "k" : [k_RISK],
        "fee" : [fee]
        }
    
    PROTOCOLS['carbon']['simulation recorder'] = {
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
    return(None)

def check_carbon_order_weights(
    high_range_high_price_CASH: Decimal,
    low_range_low_price_CASH: Decimal,
    proposed_RISK_proportion: Decimal,
    proposed_CASH_proportion: Decimal
    ) -> Tuple[Decimal, Decimal]:
    """
    ### Checks the current market price and modifies the proportion of `RISK` and `CASH` in the carbon order accordingly.

    ## Parameters:
    | Parameter Name                | Type      | Description                                                                                           |
    |:------------------------------|:----------|:------------------------------------------------------------------------------------------------------|
    | `high_range_high_price_CASH`  | `Decimal` | The upper price bound of the high-price liquidity band (`RISK` balance) on the proposed carbon order. |
    | `low_range_low_price_CASH`    | `Decimal` | The lower price bound of the low-price liquidity band (`CASH` balance) on the proposed carbon order.  |
    | `proposed_RISK_proportion`    | `Decimal` | The proposed RISK fraction of the total portfolio valuation.                                          |
    | `proposed_CASH_proportion`    | `Decimal` | The proposed CASH fraction of the total portfolio valuation.                                          |

    ## Returns:
    | Return Name                  | Type                      | Description                                                                                  |
    |:-----------------------------|:--------------------------|:---------------------------------------------------------------------------------------------|
    | `checked_RISK_proportion`    | `Decimal`                 | The vetted `RISK` fraction, which prohibits immediate arbitrage as the simulation commences. |
    | `checked_CASH_proportion`    | `Decimal`                 | The vetted `CASH` fraction, which prohibits immediate arbitrage as the simulation commences. |
    |                              | `Tuple[Decimal, Decimal]` | A tuple of `checked_RISK_proportion` and `checked_CASH_proportion` (in that order).          |
    
    ## Dependencies:
    | Dependency name   | Type      | Description                                                                                        |
    |:------------------|:----------|:---------------------------------------------------------------------------------------------------|
    | `MARKETPRICE`     | `Decimal` | A `global` variable representing the current market price of `RISK` in units of `CASH` per `RISK`. |
    
    ## Notes:
    - This function ensures that accidental `RISK` or `CASH` starting balances that would be immediately arbitraged are strictly forbidden.
    """
    global MARKETPRICE
    if MARKETPRICE < low_range_low_price_CASH:
        checked_RISK_proportion = ONE
        checked_CASH_proportion = ZERO
    elif MARKETPRICE > high_range_high_price_CASH:
        checked_RISK_proportion = ZERO
        checked_CASH_proportion = ONE
    else:
        checked_RISK_proportion = proposed_RISK_proportion
        checked_CASH_proportion = proposed_CASH_proportion
    return(checked_RISK_proportion, checked_CASH_proportion)

def make_carbon(
    start_information: dict
    ) -> None:
    """
    ### Initializes the carbon protocol in the `PROTOCOLS` dictionary using user-provided starting information.
    
    ## Parameters:
    | Parameter Name      | Type   | Description                               |
    |:--------------------|:-------|:------------------------------------------|
    | `start_information` | `dict` | The simulation settings, as a dictionary: |

    ## Parameters Dictionary:
    | Key                                        | Key Type | Value                                                                                                                                                                                 | Value Type        |
    |:-------------------------------------------|:---------|:--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|:------------------|
    | base filename                              | `str`    | Named for its token pair and date range e.g. ['RISK=USDC_CASH=USDT_startUNIX=1678366800_endUNIX=1678798800']                                                                          | `list[str]`       |
    | token pair                                 | `str`    | A dictionary containing the token tickers e.g. 'CASH' : 'ETH', 'RISK' : 'LINK'                                                                                                        | `Dict[str, str]`  |
    | price chart                                | `str`    | A list of Decimal objects, representing prices in units of CASH per RISK.                                                                                                             | `list[Decimal]`   |
    | price chart dates                          | `str`    | A list of Timestamp objects, representing the dates and times for each of the prices in the 'price chart'                                                                             | `list[Timestamp]` |
    | uniswap range boundaries                   | `str`    | The two (2) price bounds which enclose a single active region for the uniswap v3 strategy.                                                                                            | `list[Decimal]`   |
    | carbon order boundaries                    | `str`    | The four (4) price bounds that enclose two separate liquidity regions, which comprise a carbon strategy.                                                                              | `list[Decimal]`   |
    | carbon starting prices                     | `str`    | The two (2) marginal price values, within their respective bounds, which dictate the first available prices on the carbon strategy.                                                   | `list[Decimal]`   |
    | carbon order weights                       | `str`    | The relative weights of the RISK and CASH components of the carbon strategy, in that order, and in terms of their CASH value.                                                         | `list[Decimal]`   |
    | protocol fees                              | `str`    | The user-selected protocol fee, used on all three protocols (0.00001 <= fee <= 0.01; 1 bps <= fee <= 1000 bps; 0.01% <= fee <= 1%).                                                   | `list[Decimal]`   |
    | starting portfolio valuation               | `str`    | The total CASH valuation of all protocol portfolios at the start of the simulation.                                                                                                   | `list[Decimal]`   |
    | protocol list                              | `str`    | The specific protocols to be included in this simulation.                                                                                                                             | `list[str]`       |
    | depth chart animation boolean              | `str`    | `True` if the simulation should be composed into an animated `.mp4` file depicting the depth chart and saved locally for each protocol in the 'protocol list.                         | `bool`            |
    | invariant curve animation boolean          | `str`    | `True` if the simulation should be composed into an animated `.mp4` file depicting the invariant curve and saved locally for each protocol in the 'protocol list.                     | `bool`            |
    | token balance cash basis animation boolean | `str`    | `True` if the simulation should be composed into an animated `.mp4` file depicting the portfolio composition in CASH basis and saved locally for each protocol in the 'protocol list. | `bool`            |
    | summary boolean                            | `str`    | `True` if a summary plot of the simulation should be composed into a `.png` file and saved locally for each protocol in the 'protocol list'.                                          | `bool`            |
                              
    ## Returns:
    None
        
    ## Dependencies:
    | Dependency name              | Type       | Description                                                                                                       |
    |:-----------------------------|:-----------|:------------------------------------------------------------------------------------------------------------------|
    | `check_carbon_order_weights` | `function` | Checks the current market price and modifies the proportion of `RISK` and `CASH` in the carbon order accordingly. |
    | `get_carbon_start_state`     | `function` | This function calculates the starting state for a `carbon` position.                                              |
    | `get_carbon_dict`            | `function` | Adds appropriate information to the `carbon` protocol in the `PROTOCOLS` dictionary                               |
    
    ## Notes:
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `CASH_0`, `RISK_0`, `y_int_CASH`, `y_int_RISK`, `B`, `P`, `Q`, `R`, `S` and `n`.
    """
    starting_portfolio_CASH_value, starting_portfolio_RISK_value = start_information['starting portfolio valuation']
    fee = start_information['protocol fees'][0]
    (high_range_high_price_CASH, 
    high_range_low_price_CASH, 
    low_range_high_price_CASH, 
    low_range_low_price_CASH) = start_information['carbon order boundaries']
    start_rate_high_range, start_rate_low_range = start_information['carbon starting prices']
    (y_RISK, y_0_RISK, x_0_RISK, y_int_RISK, x_int_RISK, y_asym_RISK, x_asym_RISK, 
     P_a_RISK, P_b_RISK, B_RISK, P_RISK, Q_RISK, R_RISK, S_RISK, n_RISK, k_RISK,
     y_CASH, y_0_CASH, x_0_CASH, y_int_CASH, x_int_CASH, y_asym_CASH, x_asym_CASH, 
     P_a_CASH, P_b_CASH, B_CASH, P_CASH, Q_CASH, R_CASH, S_CASH, n_CASH, k_CASH) = get_carbon_start_state(starting_portfolio_CASH_value, 
                                                                                                  starting_portfolio_RISK_value,
                                                                                                  high_range_high_price_CASH, # 1/Pb
                                                                                                  high_range_low_price_CASH, # 1/Pa
                                                                                                  low_range_high_price_CASH, # Pa
                                                                                                  low_range_low_price_CASH, # Pb
                                                                                                  start_rate_high_range,
                                                                                                  start_rate_low_range)
    get_carbon_dict(y_RISK, y_0_RISK, x_0_RISK, y_int_RISK, x_int_RISK, y_asym_RISK, x_asym_RISK, P_a_RISK, P_b_RISK, B_RISK, P_RISK, Q_RISK, R_RISK, S_RISK, n_RISK, k_RISK,
                    y_CASH, y_0_CASH, x_0_CASH, y_int_CASH, x_int_CASH, y_asym_CASH, x_asym_CASH, P_a_CASH, P_b_CASH, B_CASH, P_CASH, Q_CASH, R_CASH, S_CASH, n_CASH, k_CASH, fee)
    return(None)

# #### Initializing the simulation

def initialize_simulation(
    start_information: dict = None
    ) -> None:
    """
    ### Initializes the simulation by loading the price data, setting the global variables and creating the protocols.

    ## Parameters:
    | Parameter Name      | Type   | Description                               |
    |:--------------------|:-------|:------------------------------------------|
    | `start_information` | `dict` | The simulation settings, as a dictionary: |

    ## Parameters Dictionary:
    | Key                                        | Key Type | Value                                                                                                                                                                                 | Value Type        |
    |:-------------------------------------------|:---------|:--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|:------------------|
    | base filename                              | `str`    | Named for its token pair and date range e.g. ['RISK=USDC_CASH=USDT_startUNIX=1678366800_endUNIX=1678798800']                                                                          | `list[str]`       |
    | token pair                                 | `str`    | A dictionary containing the token tickers e.g. 'CASH' : 'ETH', 'RISK' : 'LINK'                                                                                                        | `Dict[str, str]`  |
    | price chart                                | `str`    | A list of Decimal objects, representing prices in units of CASH per RISK.                                                                                                             | `list[Decimal]`   |
    | price chart dates                          | `str`    | A list of Timestamp objects, representing the dates and times for each of the prices in the 'price chart'                                                                             | `list[Timestamp]` |
    | uniswap range boundaries                   | `str`    | The two (2) price bounds which enclose a single active region for the uniswap v3 strategy.                                                                                            | `list[Decimal]`   |
    | carbon order boundaries                    | `str`    | The four (4) price bounds that enclose two separate liquidity regions, which comprise a carbon strategy.                                                                              | `list[Decimal]`   |
    | carbon starting prices                     | `str`    | The two (2) marginal price values, within their respective bounds, which dictate the first available prices on the carbon strategy.                                                   | `list[Decimal]`   |
    | carbon order weights                       | `str`    | The relative weights of the RISK and CASH components of the carbon strategy, in that order, and in terms of their CASH value.                                                         | `list[Decimal]`   |
    | protocol fees                              | `str`    | The user-selected protocol fee, used on all three protocols (0.00001 <= fee <= 0.01; 1 bps <= fee <= 1000 bps; 0.01% <= fee <= 1%).                                                   | `list[Decimal]`   |
    | starting portfolio valuation               | `str`    | The total CASH valuation of all protocol portfolios at the start of the simulation.                                                                                                   | `list[Decimal]`   |
    | protocol list                              | `str`    | The specific protocols to be included in this simulation.                                                                                                                             | `list[str]`       |
    | depth chart animation boolean              | `str`    | `True` if the simulation should be composed into an animated `.mp4` file depicting the depth chart and saved locally for each protocol in the 'protocol list.                         | `bool`            |
    | invariant curve animation boolean          | `str`    | `True` if the simulation should be composed into an animated `.mp4` file depicting the invariant curve and saved locally for each protocol in the 'protocol list.                     | `bool`            |
    | token balance cash basis animation boolean | `str`    | `True` if the simulation should be composed into an animated `.mp4` file depicting the portfolio composition in CASH basis and saved locally for each protocol in the 'protocol list. | `bool`            |
    | summary boolean                            | `str`    | `True` if a summary plot of the simulation should be composed into a `.png` file and saved locally for each protocol in the 'protocol list'.                                          | `bool`            |
                              
    ## Returns:
    None
        
    ## Dependencies:
    | Dependency name     | Type             | Description                                                                                                               |
    |:--------------------|:-----------------|:--------------------------------------------------------------------------------------------------------------------------|
    | `PRICE_DATA`        | `List[Decimal]`  | A `global` list containing the sequence of `RISK` prices in units of `CASH` per `RISK`, for each step of the simulation.  |
    | `DATES`             | `List[datetime]` | A `global` list containing the sequence of timestamps that correspond to each step of the simulation.                     |
    | `SIMULATION_LENGTH` | `int`            | A `global` variable representing to total number of steps in the simulation.                                              |
    | `TOKEN_PAIR`        | `dict`           | A `global` dictionary containing `CASH` and `RISK` strings as keys, and the corresponding token ticker strings as values. |
    | `MARKETPRICE`       | `Decimal`        | A `global` variable representing the current market price of `RISK` in units of `CASH` per `RISK`.                        |
    | `make_uniswap_v2`   | `function`       | Initializes the `uniswap_v2` protocol in the `PROTOCOLS` dictionary using user-provided starting information.             |
    | `make_uniswap_v3`   | `function`       | Initializes the `uniswap_v3` protocol in the `PROTOCOLS` dictionary using user-provided starting information.             |
    | `make_carbon`       | `function`       | Initializes the `carbon` protocol in the `PROTOCOLS` dictionary using user-provided starting information.                 |
    """
    global PRICE_DATA
    global DATES
    global SIMULATION_LENGTH
    global TOKEN_PAIR
    global MARKETPRICE
    PRICE_DATA = start_information['price chart']
    DATES = start_information['price chart dates'] 
    SIMULATION_LENGTH = len(PRICE_DATA)
    TOKEN_PAIR = start_information['token pair']
    MARKETPRICE = PRICE_DATA[0]
    # make_uniswap_v2(start_information)
    # make_uniswap_v3(start_information)
    make_carbon(start_information)
    return(None)

# # Summary Reporters for Logs

def calculate_time_duration_of_simulation(
    simulation_start_date: pd.Timestamp,
    current_simulation_date: pd.Timedelta
    ) -> str:
    """
    ### Calculates the time duration between the current simulation step, and the first one.

    ## Parameters:
    | Parameter Name            | Type           | Description                               |
    |:--------------------------|:---------------|:------------------------------------------|
    | `simulation_start_date`   | `pd.Timestamp` | The simulated start date.                 |
    | `current_simulation_date` | `pd.Timestamp` | The simulated current date.               |

    ## Returns:
    | Return Name            | Type           | Description                                                         |
    |:-----------------------|:---------------|:--------------------------------------------------------------------|
    | `simulation_timedelta` | `pd.Timedelta` | The time duration of the simulation as a pandas `Timedelta` object. |

    """
    simulation_timedelta = abs(current_simulation_date - simulation_start_date)
    return(simulation_timedelta)

def get_simulation_timer_for_log_table(
    simulation_start_date: pd.Timestamp,
    current_simulation_date: pd.Timestamp
    ) -> str:
    """
    ### Returns a human-readable string representing the time duration of a simulation for display in the log table.

    ## Parameters:
    | Parameter Name            | Type           | Description                             |
    |:--------------------------|:---------------|:----------------------------------------|
    | `simulation_start_date`   | `pd.Timestamp` | The start date of the simulation.       |
    | `current_simulation_date` | `pd.Timestamp` | The current date of the simulation.     |

    ## Returns:
    | Return Name          | Type  | Description                                                                                                           |
    |:---------------------|:------|:----------------------------------------------------------------------------------------------------------------------|
    | `simulation_timer`   | `str` | A string representing the time duration of the simulation in the format "years, months, weeks, days, hours, minutes". |
    
    ## Notes:
    - Only non-zero components are included in the output string. 
    """
    simulation_timedelta = calculate_time_duration_of_simulation(simulation_start_date, current_simulation_date)
    years, remainder = divmod(simulation_timedelta.days, 365)
    months, remainder = divmod(remainder, 30)
    weeks, remainder = divmod(remainder, 7)
    days = remainder
    hours, remainder = divmod(simulation_timedelta.seconds, 3600)
    minutes = remainder // 60
    components = [(years, "year"),
                  (months, "month"),
                  (weeks, "week"),
                  (days, "day"),
                  (hours, "hour"),
                  (minutes, "minute")]
    simulation_timer = ", ".join(f"{value} {unit}s" if value > 1 else f"{value} {unit}" for value, unit in components if value > 0)
    return simulation_timer if simulation_timer else "none"

def make_categories_list_for_report_log(
    protocol: str
    ) -> list[str, str, str, str, str, str, str, str, str]:
    """
    ### Creates a list of categories for the report log.

    ## Parameters:
    | Parameter Name | Type   | Description                                                            |
    |:---------------|:-------|:-----------------------------------------------------------------------|
    | `protocol`     | `str`  | The name of the protocol (i.e `carbon`, `uniswap_v2`, or `uniswap_v3`) |

    ## Returns:
    | Return Name   | Type                                                | Description                                                |
    |:--------------|:----------------------------------------------------|:-----------------------------------------------------------|
    | `categories`  | `list[str, str, str, str, str, str, str, str, str]` | A list of category names for the report log summary table. |
    
    ## Dependencies:
    | Dependency name   | Type           | Description                                                                                                               |
    |:------------------|:---------------|:--------------------------------------------------------------------------------------------------------------------------|
    | `TOKEN_PAIR`      | `dict`         | A `global` dictionary containing `CASH` and `RISK` strings as keys, and the corresponding token ticker strings as values. |
    """
    global TOKEN_PAIR
    categories = [
        f'{TOKEN_PAIR["RISK"]} balance', 
        f'{TOKEN_PAIR["CASH"]} balance', 
        f'{TOKEN_PAIR["RISK"]} market price', 
        f'{TOKEN_PAIR["CASH"]} portfolio value', 
        f'{TOKEN_PAIR["CASH"]} hodl value', 
        'portfolio versus hodl'
        ]
    if protocol == 'carbon':
        categories.insert(2, f'{TOKEN_PAIR["RISK"]} protocol-owned fees')
        categories.insert(3, f'{TOKEN_PAIR["CASH"]} protocol-owned fees')
    else: 
        categories.insert(2, f'user-owned {TOKEN_PAIR["RISK"]} fees balance')
        categories.insert(3, f'user-owned {TOKEN_PAIR["CASH"]} fees balance')
    return(categories)

def make_values_list_for_report_log(
    protocol: str
    ) -> list[str, str, str, str, str, str, str, str, str, str]:
    """
    ### Creates a list of values for the report log.
    
    ## Parameters:
    | Parameter Name | Type   | Description                                                            |
    |:---------------|:-------|:-----------------------------------------------------------------------|
    | `protocol`     | `str`  | The name of the protocol (i.e 'carbon', 'uniswap_v2', or 'uniswap_v3') |

    ## Returns:
    | Return name                  | Type                                                     | Description                                                                                                                                                                                               |
    |:-----------------------------|:---------------------------------------------------------|:----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
    | Date                         | `str`                                                    | The date at this step of the simulation.                                                                                                                                                                  |
    | -> time duration ->          | `str`                                                    | A string "-> time duration ->" (the timer itself appears in the notes column, not the values column).                                                                                                     |
    | RISK balance                 | `str`                                                    | The current balance of the `RISK` asset.                                                                                                                                                                  |
    | CASH balance                 | `str`                                                    | The current balance of the `CASH` asset.                                                                                                                                                                  |
    | RISK fees                    | `str`                                                    | The current `RISK` fees balance of the protocol.                                                                                                                                                          |
    | CASH fees                    | `str`                                                    | The current `CASH` fees balance of the protocol.                                                                                                                                                          |
    | Market price                 | `str`                                                    | The current market price of the `RISK` asset in terms of the `CASH` asset (i.e. `CASH` per `RISK`).                                                                                                       |
    | Portfolio value              | `str`                                                    | The current total value of the protocol's portfolio in `CASH` basis.                                                                                                                                      |
    | HODL value                   | `str`                                                    | The current total value of the protocol's portfolio if it was HODLing the entire time in `CASH` basis.                                                                                                    |
    | Portfolio over HODL quotient | `str`                                                    | The quotient of portfolio value divided by HODL value, expressed as a percentage.                                                                                                                         |
    | values                       | `list[str, str, str, str, str, str, str, str, str, str]` | A list of "date", "Simulated time duration ->", "RISK balance", "CASH balance", "RISK fees", "CASH fees", "Market price", "Portfolio value", "HODL value", "Portfolio over HODL quotient", in that order. |
    
    ## Dependencies:
    | Dependency name   | Type           | Description                                                                                                                           |
    |:------------------|:---------------|:--------------------------------------------------------------------------------------------------------------------------------------|
    | `MARKETPRICE`     | `Decimal`      | A `global` variable representing the current market price of `RISK` in units of `CASH` per `RISK`.                                    |
    | `PROTOCOLS`       | `dict`         | A `global` dictionary with each of the protocol name strings as keys, and the appropriate protocol dictionaries themselves as values. |
    | `SIMULATION_STEP` | `int`          | A `global` variable containing the current step of the simulation.                                                                    |
    | `DATES`           | `pd.Timestamp` | A `global` variable containing the date corresponding to the current step of the simulation.                                          |
    """
    global PROTOCOLS
    global MARKETPRICE
    global SIMULATION_STEP
    global DATES
    simulation_recorder = PROTOCOLS[protocol]['simulation recorder']
    portfolio_over_hodl_quotient = simulation_recorder['portfolio over hodl quotient'][-1]
    sign = '+' if portfolio_over_hodl_quotient > 0 else '-' if portfolio_over_hodl_quotient < 0 else ' '
    values = [f"{simulation_recorder['RISK balance'][-1]:.18f}",
              f"{simulation_recorder['CASH balance'][-1]:.18f}",
              f"{simulation_recorder['RISK fees'][-1]:.18f}",
              f"{simulation_recorder['CASH fees'][-1]:.18f}",
              f"{MARKETPRICE:.18f}", 
              f"{simulation_recorder['portfolio value'][-1]:.18f}",
              f"{simulation_recorder['hodl value'][-1]:.18f}",
              f"{sign}{portfolio_over_hodl_quotient:.17f}%"]
    return(values)

def make_notes_list_for_report_log(
    protocol: str
    ) -> list[str, str, str, str, str, str, str, str, str, str]:
    """
    ### Creates a list of notes for the report log.

    ## Parameters:
    | Parameter Name | Type   | Description                                                            |
    |:---------------|:-------|:-----------------------------------------------------------------------|
    | `protocol`     | `str`  | The name of the protocol (i.e 'carbon', 'uniswap_v2', or 'uniswap_v3') |
    
    ## Returns:
    | Return Name   | Type                                                      | Description                                                |
    |:--------------|:----------------------------------------------------------|:-----------------------------------------------------------|
    | `notes`       | `list[str, str, str, str, str, str, str, str, str, str]:` | A list of notes to accompany the report log summary table. |
    
    ## Dependencies:
    | Dependency name   | Type           | Description                                                                                                               |
    |:------------------|:---------------|:--------------------------------------------------------------------------------------------------------------------------|
    | `TOKEN_PAIR`      | `dict`         | A `global` dictionary containing `CASH` and `RISK` strings as keys, and the corresponding token ticker strings as values. |
    | `SIMULATION_STEP` | `int`          | A `global` variable containing the current step of the simulation.                                                        |
    | `DATES`           | `pd.Timestamp` | A `global` variable containing the date corresponding to the current step of the simulation.                              |
    """
    global TOKEN_PAIR
    global SIMULATION_STEP
    global DATES
    notes = [
        f'The liquidity of {TOKEN_PAIR["RISK"]}',
        f'The liquidity of {TOKEN_PAIR["CASH"]}',
        f'The market price of {TOKEN_PAIR["RISK"]} in {TOKEN_PAIR["CASH"]} units at the current step of the simulation',
        f'`user-owned {TOKEN_PAIR["CASH"]}` + `user-owned {TOKEN_PAIR["RISK"]}` * `market price of {TOKEN_PAIR["RISK"]}`',
        f'The user portfolio value in {TOKEN_PAIR["CASH"]} units if they did not create this strategy',
        '(`portfolio value` - `hodl value`) / `hodl value` * 100'
    ]
    if protocol == 'carbon':
        notes.insert(2, f'Not part of the user portfolio performance calculation')
        notes.insert(3, f'Not part of the user portfolio performance calculation')
    elif protocol == 'uniswap_v3':
        notes.insert(2, f'**user-owned** and separate from the liquidity balance of {TOKEN_PAIR["RISK"]} (stored outside the trading liquidity)')
        notes.insert(3, f'**user-owned** and separate from the liquidity balance of {TOKEN_PAIR["CASH"]} (stored outside the trading liquidity)')
    elif protocol == 'uniswap_v2':
        notes.insert(2, f'**user-owned** and included in the liquidity balance of {TOKEN_PAIR["RISK"]}')
        notes.insert(3, f'**user-owned** and included in the liquidity balance of {TOKEN_PAIR["CASH"]}')
    return(notes)

def get_summary_for_report_log(
    protocol: str
    ) -> None:
    """
    ### Generates a summary report table of the performance of a given protocol.
    
    ## Parameters:
    | Parameter Name | Type   | Description                                                            |
    |:---------------|:-------|:-----------------------------------------------------------------------|
    | `protocol`     | `str`  | The name of the protocol (i.e 'carbon', 'uniswap_v2', or 'uniswap_v3') |
    
    ## Returns:
    None: 
    
    ## Dependencies:
    | Dependency name                       | Type       | Description                                                                                                                           |
    |:--------------------------------------|:-----------|:--------------------------------------------------------------------------------------------------------------------------------------|
    | `MARKETPRICE`                         | `Decimal`  | A `global` variable representing the current market price of `RISK` in units of `CASH` per `RISK`.                                    |
    | `PROTOCOLS`                           | `dict`     | A `global` dictionary with each of the protocol name strings as keys, and the appropriate protocol dictionaries themselves as values. |
    | `make_categories_list_for_report_log` | `function` | Creates a list of categories for the report log.                                                                                      |
    | `make_values_list_for_report_log`     | `function` | Creates a list of values for the report log.                                                                                          |
    | `make_notes_list_for_report_log`      | `function` | Creates a list of notes for the report log.                                                                                           |
    
    ## Notes:
    - The function logs the summary report table to the logger.
    
    """
    global MARKETPRICE
    global PROTOCOLS
    headers = ['Attribute', 'Value', 'Note']
    categories = make_categories_list_for_report_log(protocol)
    values = make_values_list_for_report_log(protocol)
    notes = make_notes_list_for_report_log(protocol)        
    data = list(zip(categories, values, notes))
    #logger.info(f'{protocol.upper().replace("_", " ")} SUMMARY')
    logger.info(tabulate(data, headers, tablefmt="outline", colalign=('left', 'right', 'left')))
    logger.info('')
    return(None)

# # Shared Functions

# #### Performance trackers (Shared)

def calculate_current_hodl_value(
    protocol: str
    ) -> Decimal:
    """
    ### Calculates the current value of hodling the assets based on the `CASH` and `RISK` balances at the time the protocol portfolio was created, and the current price of `RISK`.

    ## Parameters:
    | Parameter Name | Type   | Description                                                            |
    |:---------------|:-------|:-----------------------------------------------------------------------|
    | `protocol`     | `str`  | The name of the protocol (i.e 'carbon', 'uniswap_v2', or 'uniswap_v3') |

    ## Returns:
    | Return Name           | Type      | Description                                                  |
    |:----------------------|:----------|:-------------------------------------------------------------|
    | `hodl_value`          | `Decimal` | The current value of hodling the assets in units of `CASH`.  |

    ## Dependencies:
    | Dependency Name    | Type      | Description                                                                                        |
    |:-------------------|:----------|:---------------------------------------------------------------------------------------------------|
    | `MARKETPRICE`      | `Decimal` | A `global` variable representing the current market price of `RISK` in units of `CASH` per `RISK`. |
    | `PROTOCOLS`        | `dict`    | A `global` dictionary containing information on the different protocols.                          |
    """
    global MARKETPRICE
    hodl_composition = {k: PROTOCOLS[protocol]['simulation recorder'][f'{k} balance'][0] for k in ('RISK', 'CASH')}
    hodl_value = hodl_composition['RISK']*MARKETPRICE + hodl_composition['CASH']
    return(hodl_value)

def calculate_current_portfolio_value(
    protocol: str
    ) -> Decimal:
    """
    ### Calculates the current value of the protocol portfolio based on its current balances, and price of `RISK`.

    ## Parameters:
    | Parameter Name | Type   | Description                                                            |
    |:---------------|:-------|:-----------------------------------------------------------------------|
    | `protocol`     | `str`  | The name of the protocol (i.e 'carbon', 'uniswap_v2', or 'uniswap_v3') |

    ## Returns:
    | Return Name   | Type      | Description                                                              |
    |:--------------|:----------|:-------------------------------------------------------------------------|
    | `total_value` | `Decimal` | The current total value of the portfolio in units of `CASH`.             |
    | `CASH_value`  | `Decimal` | The current value of the `CASH` portion in the portfolio.                |
    | `RISK_value`  | `Decimal` | The current value of the `RISK` portion in the portfolio.                |
    |               | `tuple`   | A tuple of `total_value`, `CASH_value`, and `RISK_value`, in that order. |

    ## Dependencies:
    | Dependency Name    | Type      | Description                                                                                        |
    |:-------------------|:----------|:---------------------------------------------------------------------------------------------------|
    | `MARKETPRICE`      | `Decimal` | A `global` variable representing the current market price of `RISK` in units of `CASH` per `RISK`. |
    | `PROTOCOLS`        | `dict`    | A `global` dictionary containing information on the different protocols.                           |
    
    ## Notes:
    - When calculating the portfolio values of `carbon` and `uniswap_v2`, their fee balances are ignored, for essentially the same reason. 
    - In both `carbon` and `uniswap_v2`, the user's token balances are part of the `['simulation recorder']['CASH balance']` and `['RISK balance']`, exclusively. 
    - In contrast, for `uniswap_v3`, the external fee accrual must be accounted for when determining the portfolio value.
    """
    global MARKETPRICE
    portfolio_composition = {k: PROTOCOLS[protocol]['simulation recorder'][f'{k} balance'][-1] +
                            (PROTOCOLS[protocol]['simulation recorder'][f'{k} fees'][-1] if protocol == 'uniswap_v3' else 0)
                            for k in ('RISK', 'CASH')}
    
    RISK_value = portfolio_composition['RISK']*MARKETPRICE
    total_value = RISK_value + portfolio_composition['CASH']
    CASH_value = portfolio_composition['CASH']
    return(total_value, CASH_value, RISK_value)

def measure_portfolio_over_hodl_quotient(
    current_hodl_value: Decimal, 
    current_portfolio_value: Decimal
    ) -> Decimal:
    """
    ### Calculates the percentage difference of the current portfolio value over the current hodl value.

    Parameters:
    | Parameter name                | Type      | Description                                      |
    |:------------------------------|:----------|:-------------------------------------------------|
    | `current_hodl_value`          | `Decimal` | The current value of hodling the assets.         |
    | `current_portfolio_value`     | `Decimal` | The current value of the portfolio.              |
        
    Returns:
    | Return name                    | Type      | Description                                                                                        |
    |:-------------------------------|:----------|:---------------------------------------------------------------------------------------------------|
    | `portfolio_over_hodl_quotient` | `Decimal` | The percentage difference of the current portfolio value over the current hodl value (cash basis). |
    """
    portfolio_over_hodl_quotient = 100*(current_portfolio_value - current_hodl_value)/current_hodl_value
    return(portfolio_over_hodl_quotient)

def get_protocol_performance_data(
    protocol: str
    ) -> Tuple[Decimal, Decimal, Decimal]:
    """
    ### Computes the current hodl value, current portfolio value, and the percentage difference of the current portfolio value over the current hodl value for the given protocol.
    
    ## Parameters:
    | Parameter names | Type   | Parameter Descriptions                                        |
    |:----------------|:-------|:--------------------------------------------------------------|
    | `protocol`      | `str`  | The protocol for which the performance data is to be computed.|

    ## Returns:
    | Return names                       | Type     | Return Descriptions                                                                    |
    |:-----------------------------------|:---------|:---------------------------------------------------------------------------------------|
    | `current_hodl_value`               | `Decimal` | The current hodl value of the protocol.                                               |
    | `current_portfolio_value`          | `Decimal` | The current portfolio value of the protocol.                                          |
    | `portfolio_over_hodl_quotient`     | `Decimal` | The percentage difference of the current portfolio value over the current hodl value. |

    ## Dependencies:
    | Dependency name                        | Type       | Description                                                                                                                                                                       |
    |:---------------------------------------|:-----------|:----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
    | `MARKETPRICE`                          | `Decimal`  | A `global` variable representing the current market price of `RISK` in units of `CASH` per `RISK`.                                                                                |
    | `calculate_current_hodl_value`         | `function` | A function that calculates the current hodl value for the given protocol.                                                                                                         |
    | `calculate_current_portfolio_value`    | `function` | A function that calculates the current portfolio value, current cash value, and current risk value for the given protocol.                                                        |
    | `measure_portfolio_over_hodl_quotient` | `function` | A function that calculates the percentage difference of the current portfolio value over the current hodl value.                                                                  |
    """
    current_hodl_value = calculate_current_hodl_value(protocol)
    current_portfolio_value, current_portfolio_CASH_portion, current_portfolio_RISK_portion = calculate_current_portfolio_value(protocol)
    portfolio_over_hodl_quotient = measure_portfolio_over_hodl_quotient(current_hodl_value, current_portfolio_value)
    return(current_hodl_value, current_portfolio_CASH_portion, current_portfolio_RISK_portion, current_portfolio_value, portfolio_over_hodl_quotient)

def record_protocol_performance(
    simulation_recorder: dict, 
    current_hodl_value: Decimal, 
    current_portfolio_CASH_portion: Decimal,
    current_portfolio_RISK_portion: Decimal,
    current_portfolio_value: Decimal, 
    portfolio_over_hodl_quotient: Decimal,
    final_ask: Decimal, 
    final_bid: Decimal,
    min_bid: Decimal,
    max_ask: Decimal
    ) -> None:
    """
    ### Records the current protocol performance in its own performance tracker dictionary.

    ## Parameters:
    | Parameter name                    | Type      | Description                                                                           |
    |:----------------------------------|:----------|:--------------------------------------------------------------------------------------|
    | `simulation_recorder`             | `dict`    | A dictionary containing the simulation data.                                          |
    | `current_hodl_value`              | `Decimal` | The current hodl value of the protocol.                                               |
    | `current_portfolio_value`         | `Decimal` | The current portfolio value of the protocol.                                          |
    | `portfolio_over_hodl_quotient`    | `Decimal` | The percentage difference of the current portfolio value over the current hodl value. |
    
    ## Parameters Dictionary:
    | Key                          | Key Type   | Value                                                        | Value Type   |
    |:-----------------------------|:-----------|:-------------------------------------------------------------|:-------------|
    | simulation step              | `str`      | The current step of the simulation.                          | `int`        |
    | hodl value                   | `str`      | The hodl value of the portfolio in `CASH` basis.             | `Decimal`    |
    | portfolio value              | `str`      | The portfolio value in `CASH` basis.                         | `Decimal`    |
    | portfolio over hodl quotient | `str`      | The relative `CASH` basis value of the portfolio versus hodl | `Decimal`    |

    ## Returns:
    None
    
    ## Dependencies:
    | Dependency name   | Type      | Description                                                                                        |
    |:------------------|:----------|:---------------------------------------------------------------------------------------------------|
    | `SIMULATION_STEP` | `int`     | A `global` variable representing the current step of the simulation.                               |
    | `MARKETPRICE`     | `Decimal` | A `global` variable representing the current market price of `RISK` in units of `CASH` per `RISK`. |

    ## Notes:
    - This function modifies the input `performance_tracker` dictionary.
    """
    global SIMULATION_STEP
    global MARKETPRICE
    simulation_recorder['simulation step'].append(SIMULATION_STEP)
    simulation_recorder['date'].append(DATES[SIMULATION_STEP])
    simulation_recorder['RISK price'].append(MARKETPRICE)
    simulation_recorder['ask'].append(final_ask)
    simulation_recorder['max ask'].append(max_ask)
    simulation_recorder['bid'].append(final_bid)
    simulation_recorder['min bid'].append(min_bid)
    simulation_recorder['CASH portion'].append(current_portfolio_CASH_portion)
    simulation_recorder['RISK portion'].append(current_portfolio_RISK_portion)
    simulation_recorder['hodl value'].append(current_hodl_value)
    simulation_recorder['portfolio value'].append(current_portfolio_value)
    simulation_recorder['portfolio over hodl quotient'].append(portfolio_over_hodl_quotient)
    return(None)

def evaluate_protocol_performance(
    protocol: str,
    final_ask: Decimal, 
    final_bid: Decimal,
    min_bid: Decimal, 
    max_ask: Decimal
    ) -> None:
    """
    ### Evaluates the current performance of a given protocol and records it in the protocol's performance tracking dictionary.

    ## Parameters:
    | Parameter names | Type   | Parameter Descriptions                                        |
    |:----------------|:-------|:--------------------------------------------------------------|
    | `protocol`      | `str`  | The protocol for which the performance data is to be computed.|

    ## Returns:
    None

    ## Dependencies:
    | Dependency name                 | Type       | Description                                                                                                                                                                |
    |:--------------------------------|:-----------|:---------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
    | `PROTOCOLS`                     | `dict`     | A `global` dictionary with each of the protocol name strings as keys, and the appropriate protocol dictionaries themselves as values.                                      |
    | `get_protocol_performance_data` | `function` | Computes the current hodl value, current portfolio value, and the percentage difference of the current portfolio value over the current hodl value for the given protocol. |
    | `record_protocol_performance`   | `function` | Records the current protocol performance in its own performance tracker dictionary.                                                                                        |
    | `get_summary_for_report_log`    | `function` | Generates a summary of the protocol's performance for logging purposes.                                                                                                    |
    """
    global PROTOCOLS
    (current_hodl_value, 
     current_portfolio_CASH_portion, 
     current_portfolio_RISK_portion, 
     current_portfolio_value, 
     portfolio_over_hodl_quotient) = get_protocol_performance_data(protocol)
    simulation_recorder = PROTOCOLS[protocol]['simulation recorder']
    record_protocol_performance(simulation_recorder, 
                                current_hodl_value, 
                                current_portfolio_CASH_portion, 
                                current_portfolio_RISK_portion, 
                                current_portfolio_value, 
                                portfolio_over_hodl_quotient, 
                                final_ask, 
                                final_bid,
                                min_bid,
                                max_ask)
    get_summary_for_report_log(protocol)
    return(None)

# #### Protocol Arbitarge (Shared)

def get_arb_direction(
    ask: Decimal, 
    bid: Decimal, 
    protocol: str
    ) -> str:
    """
    ### Returns the direction of the arbitrage based on the current bid and asking prices for `RISK`, and the current `MARKETPRICE`.

    ## Parameters:
    | Parameter names | Type     | Parameter Descriptions                                                                       |
    |:----------------|:---------|:---------------------------------------------------------------------------------------------|
    | `ask`           | `Decimal`| The fee-adjusted marginal price of `RISK` in units of `CASH` per `RISK` when buying `RISK`.  |
    | `bid`           | `Decimal`| The fee-adjusted marginal price of `RISK` in units of `CASH` per `RISK` when selling `RISK`. |
    | `protocol`      | `str`    | The protocol being analyzed (either `carbon`, `uniswap_v2`, or `uniswap_v3`).                |

    ## Returns:
    | Return names   | Type   | Return Descriptions                                                                                                 |
    |:---------------|:-------|:--------------------------------------------------------------------------------------------------------------------|
    | `direction`    | `str`  | The direction of the swap, either 'buy RISK' or 'sell RISK'. Returns None if the market price is within the spread. |

    ## Dependencies:
    | Dependency name   | Type      | Description                                                                                                                      |
    |:------------------|:----------|:---------------------------------------------------------------------------------------------------------------------------------|
    | `MARKETPRICE`     | `Decimal` | A `global` variable representing the current market price of `RISK` in units of `CASH` per `RISK`.                               |
    | `TOKEN_PAIR`      | `dict`           | A `global` dictionary containing `CASH` and `RISK` strings as keys, and the corresponding token ticker strings as values. |
    
    ## Notes:
    - The appropriate annotations are added to the logger.
    """
    global MARKETPRICE
    global TOKEN_PAIR
    logger.info(f'The market price of {TOKEN_PAIR["RISK"]} is {MARKETPRICE:.6f} {TOKEN_PAIR["CASH"]} per unit.')
    if bid <= MARKETPRICE <= ask:
        logger.info(f'Since this price is within the spread, the arbitrageur will not attempt to trade {TOKEN_PAIR["RISK"]}.')
        return(None)
    elif ask < MARKETPRICE:
        direction = f'buy'
    elif bid > MARKETPRICE:
        direction = f'sell'
    logger.info(f'Since this price is not within the spread, the arbitrageur will attempt to {direction} {TOKEN_PAIR["RISK"]}.')
    return(direction)

def check_concentrated_liquidity_range_bounds(
    CASH: Decimal, 
    RISK: Decimal, 
    DCASH: Decimal, 
    DRISK: Decimal, 
    protocol: str
    ) -> bool:
    """
    ### Checks if there is enough liquidity to equilibrate the given protocol to the market price. 

    ## Parameters:
    | Parameter names | Type     | Description                                                                                             |
    |:----------------|:---------|:--------------------------------------------------------------------------------------------------------|
    | `CASH`          | `Decimal`| The current amount of `CASH` in the protocol.                                                           |
    | `RISK`          | `Decimal`| The current amount of `RISK` in the protocol.                                                           |
    | `DCASH`         | `Decimal`| The amount of `CASH` that will be added (positive value) or removed (negative value) from the protocol. |
    | `DRISK`         | `Decimal`| The amount of `RISK` that will be added (positive value) or removed (negative value) from the protocol. |
    | `protocol`      | `str`    | The name of the protocol for which the check is being performed.                                        |

    ## Returns:
    | Return names | Type    | Description                                                              |
    |:-------------|:--------|:-------------------------------------------------------------------------|
    | `in_range`   | `bool`  | True if there is enough liquidity to support the trade. False otherwise. |
    
    ## Notes:
    - This function determines if the current `CASH` and `RISK` balances can support the trade amounts `DCASH`, and `DRISK`.
    - It returns True if there is enough liquidity, and False otherwise.
    - The appropriate annotations are added to the logger.
    """
    if RISK + DRISK >= 0 and CASH + DCASH >= 0:
        in_range = True
    else:
        in_range = False
    return(in_range)

def record_quotes_to_logger(
    b_or_a: str, 
    CASH_balance: Decimal, 
    RISK_balance: Decimal,
    bid: Decimal, 
    ask: Decimal
    ) -> None:
    """
    ### Records the marginal price quotes to the logger for a given protocol.

    ## Parameters:
    | Parameter names  | Type       | Description                                                     |
    |:-----------------|:-----------|:----------------------------------------------------------------|
    | `protocol`       | `str`      | The name of the protocol for which the quote is being recorded. |
    | `CASH_balance`   | `Decimal`  | The current amount of `CASH` in the protocol.                   |
    | `RISK_balance`   | `Decimal`  | The current amount of `RISK` in the protocol.                   |
    | `bid`            | `Decimal`  | The marginal price at which `RISK` can be sold for `CASH`.      |
    | `ask`            | `Decimal`  | The marginal price at which `RISK` can be bought for `CASH`.    |

    ## Returns:
    None
    
    ## Dependencies:
    | Dependency name   | Type   | Description                                                                                                               |
    |:------------------|:-------|:--------------------------------------------------------------------------------------------------------------------------|
    | `TOKEN_PAIR`      | `dict` | A `global` dictionary containing `CASH` and `RISK` strings as keys, and the corresponding token ticker strings as values. |
    
    ## Notes:
    - This function logs the current marginal price quotes for the given protocol, as well as any liquidity issues that may exist.
    - The appropriate annotations are added to the logger.
    """
    global TOKEN_PAIR
    logger.info(f'Marginal price quotes {b_or_a} arbitrage:')
    if CASH_balance > 0 and RISK_balance > 0:
        logger.info(f'- {TOKEN_PAIR["RISK"]} can be sold for {bid:.6f} {TOKEN_PAIR["CASH"]} per unit')
        logger.info(f'- {TOKEN_PAIR["RISK"]} can be bought for {ask:.6f} {TOKEN_PAIR["CASH"]} per unit')
    elif CASH_balance == 0:
        logger.info(f'- {TOKEN_PAIR["RISK"]} cannot be sold; strategy has run out of {TOKEN_PAIR["CASH"]}')
        logger.info(f'- {TOKEN_PAIR["RISK"]} can still be bought for {ask:.6f} {TOKEN_PAIR["CASH"]} per unit')
    elif RISK_balance == 0:
        logger.info(f'- {TOKEN_PAIR["RISK"]} cannot be bought; strategy has run out of {TOKEN_PAIR["CASH"]}')
        logger.info(f'- {TOKEN_PAIR["RISK"]} can still be sold for {bid:.6f} {TOKEN_PAIR["CASH"]} per unit')
    if b_or_a == 'before':
        logger.info('')
    return(None)

# # Carbon State Functions

def get_carbon_curve_parameters(
    order: str,
    step: int
    ) -> Tuple[Decimal, Decimal, Decimal, Decimal]:
    """
    ### Returns the curve parameters for the specified `carbon` order.

    ## Parameters:
    | Parameter name | Type     | Description                                                            |
    |:---------------|:---------|:-----------------------------------------------------------------------|
    | `order`        | `str`    | The name of the Carbon order, either 'CASH' or 'RISK'.                 |
    | `step`         | `int`    | The simulation step at which the curve parameters should be retrieved. |

    ## Returns:
    | Return name | Type                                        | Description                                                                        |
    |:------------|:--------------------------------------------|:-----------------------------------------------------------------------------------|
    | `y`         | `Decimal`                                   | The token balance of the order.                                                    |
    | `y_int`     | `Decimal`                                   | Curve parameter, the 'capacity' of the order. Refer to the Carbon whitepaper.      |
    | `B`         | `Decimal`                                   | The calculated `B` value, `sqrt(P_b)`. Refer to the Carbon whitepaper.             |
    | `S`         | `Decimal`                                   | The calculated `S` value, `sqrt(P_a) - sqrt(P_b)`. Refer to the Carbon whitepaper. |
    |             | `Tuple[Decimal, Decimal, Decimal, Decimal]` | A tuple of `y`, `y_int`, `B`, and `S` (in that order).                             |

    ## Dependencies:
    | Dependency name   | Type   | Description                                                                          |
    |:------------------|:-------|:-------------------------------------------------------------------------------------|
    | `carbon`          | `dict` | A `global` dictionary containing the relevent information for the `carbon` protocol. |

    ## Example:
    >>> get_carbon_curve_parameters('CASH order')
    (Decimal('1000000.000000000000000000'), Decimal('1000000.000000000000000000'), Decimal('0.00002413175587325863901489405'), Decimal('0.00002410479686066147896520126'))
    """
    y = carbon['simulation recorder'][f'{order} balance'][step + 1]
    y_int = carbon['curve parameters'][order]['y_int'][step + 1]
    B = carbon['curve parameters'][order]['B'][-1]
    S = carbon['curve parameters'][order]['S'][-1]
    return(y, y_int, B, S)

def get_carbon_strategy_states(
    step: int = -2
    ) -> Tuple[Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal]:
    """
    ### Returns the parameters of the `carbon` curve for both `CASH` and `RISK` orders, and the `network_fee`.

    ## Parameters:
    | Parameter name | Type   | Description                                                                                               |
    |:---------------|:-------|:----------------------------------------------------------------------------------------------------------|
    | `step`         | `int`  | Selects the appropriate index in the target lists (see notes section for details). Default: -2.           |

    ## Returns:
    | Return name      | Type              | Description                                                                                                                          |
    |:-----------------|:------------------|:-------------------------------------------------------------------------------------------------------------------------------------|
    | `y_CASH`         | `Decimal`         | The token balance of the `CASH` order.                                                                                               |
    | `y_int_CASH`     | `Decimal`         | The 'capacity' of the `CASH` order. Refer to the Carbon whitepaper.                                                                  |
    | `B_CASH`         | `Decimal`         | The calculated `B` value for the `CASH` order.                                                                                       |
    | `S_CASH`         | `Decimal`         | The calculated `S` value for the `CASH` order. Refer to the Carbon whitepaper.                                                       |
    | `y_RISK`         | `Decimal`         | The token balance of the `RISK` order.                                                                                               |
    | `y_int_RISK`     | `Decimal`         | The 'capacity' of the `RISK` order. Refer to the Carbon whitepaper.                                                                  |
    | `B_RISK`         | `Decimal`         | The calculated `B` value for the `RISK` order.                                                                                       |
    | `S_RISK`         | `Decimal`         | The calculated `S` value for the `RISK` order. Refer to the Carbon whitepaper.                                                       |
    | `network_fee`    | `Decimal`         | The current network fee for the Carbon exchange.                                                                                     |
    |                  | `Tuple`           | A tuple of `y_CASH`, `y_int_CASH`, `B_CASH`, `S_CASH`, `y_RISK`, `y_int_RISK`, `B_RISK`, `S_RISK` and `network_fee` (in that order). |

    ## Dependencies:
    | Dependency name               | Type       | Description                                                  |
    |:------------------------------|:-----------|:-------------------------------------------------------------|
    | `get_carbon_curve_parameters` | `function` | Returns the curve parameters for the specified Carbon order. |
    
    ## Example:
    >>> get_carbon_strategy_states()
    (Decimal('2.50'), 
     Decimal('2.50'), 
     Decimal('1.580456537650283304369642207'), 
     Decimal('0.05100553914558257962074397002'), 
     Decimal('7.50'), Decimal('7.50'), 
     Decimal('2.203347372106872280668367961'), 
     Decimal('0.03532268187004327171330486841'))
     
    ## Notes:
    - There are three contexts wherein this function, `get_carbon_strategy_states` is called.
    - It is called by `perform_carbon_arbitrage` and `get_carbon_quote` during the initial simulation and population of the `carbon` protocol dictionary and its complement `performance_tracking` dictionary.
    - In the first context, no `step` is passed as an argument; therefore it defaults to `-2`.
    - When the value of `-2` is passed to `get_carbon_curve_parameters`, it is iterated by `+1`, and used to fetch the token `y` balances and `y_int` values by their index. (e.g. y = carbon['simulation recorder']['RISK balance'][step + 1] and y_int = carbon['curve parameters']['CASH order']['y_int'][step + 1]).
    - Therefore, the last item on their respective lists is accessed, which is appropriate as the data accumulates on the leading edge of the list.
    - In the second context, during the preparation of the animated figures, this function is called by `get_carbon_depth_arrays`.
    - In the second context, the data already exists inside the `carbon` protocol dictionary, which is accessed sequentially to prepare the animation.
    - Therefore, `get_carbon_depth_arrays` passes a `step` argument to retrieve the appropriate information.
    - The reason for the `+1` increment is to offset the index by the correct amount, to correct for the fact that the main `carbon['simulation recorder']['CASH balance']` and `['RISK balance']` lists, as well as the `carbon['curve parameters']['CASH']['y_int']` and `['RISK']['y_int']` lists are populated with their initial state before the simulation begins. 
    - Therefore, the `carbon['simulation recorder']['CASH balance']` and `['RISK balance']` lists are longer than the others by exactly `+1`.
    """
    y_CASH, y_int_CASH, B_CASH, S_CASH = get_carbon_curve_parameters('CASH', step)
    y_RISK, y_int_RISK, B_RISK, S_RISK = get_carbon_curve_parameters('RISK', step)
    network_fee = carbon['curve parameters']['CASH']["fee"][-1]
    return(y_CASH, y_int_CASH, B_CASH, S_CASH, y_RISK, y_int_RISK, B_RISK, S_RISK, network_fee)

def measure_current_bid_carbon(
    y_CASH: Decimal, 
    y_int_CASH: Decimal, 
    B_CASH: Decimal, 
    S_CASH: Decimal, 
    network_fee: Decimal
    ) -> Decimal:
    """
    ### Calculates the current sell price of `RISK` on carbon.

    ## Parameters:
    | Parameter name | Type      | Description                                                                          |
    |:---------------|:----------|:-------------------------------------------------------------------------------------|
    | `y_CASH`       | `Decimal` | The token balance of the `CASH` order.                                               |
    | `y_int_CASH`   | `Decimal` | The 'capacity' of the `CASH` order. Refer to the Carbon whitepaper.                  |
    | `B_CASH`       | `Decimal` | A curve parameter, equal to `sqrt(P_b)`. Refer to the Carbon whitepaper.             |
    | `S_CASH`       | `Decimal` | A curve parameter, equal to `sqrt(P_a) - sqrt(P_b)`. Refer to the Carbon whitepaper. |
    | `network_fee`  | `Decimal` | The fee for the trade, represented as a decimal (e.g. 0.05 for 5%).                  |

    ## Returns:
    | Return name   | Type      | Description                                            |
    |:--------------|:----------|:-------------------------------------------------------|
    | `current_bid` | `Decimal` | The current sell price of `RISK` in `CASH` per `RISK`. |

    ## Example:
    >>> measure_current_bid_carbon(Decimal('100'), Decimal('200'), Decimal('0.5'), Decimal('0.25'), Decimal('0.01'))
    Decimal('0.9345466315483024598269719245')
    
    ## LaTeX:
    $$P_{bid} = \\frac{\\left(1 - \\delta \\right)\\left( B y_{int} + S y\\right)^{2}}{y_{int}^{2}}$$
    Where:$P_{bid}$ = the current bidding price; $\\delta$ = the network fee; $B$ = $\\sqrt{P_{b}}$ = The square root of the low-bound bidding price; $S$ = $\\sqrt{P_{a}} - \\sqrt{P_{b}}$ = The range width parameter; $y$ = the CASH balance; $y_{int}$ = the CASH intercept.  
    """
    current_bid = (ONE - network_fee)*(B_CASH*y_int_CASH + S_CASH*y_CASH)**TWO/y_int_CASH**TWO
    return(current_bid)

# $$
# P_{bid} = \frac{\left(1 - \delta \right)\left( B y_{int} + S y\right)^{2}}{y_{int}^{2}}
# $$
# Where:
# $P_{bid}$ = the current bidding price; $\delta$ = the network fee; $B$ = $\sqrt{P_{b}}$ = The square root of the low-bound bidding price; $S$ = $\sqrt{P_{a}} - \sqrt{P_{b}}$ = The range width parameter; $y$ = the CASH balance; $y_{int}$ = the CASH intercept.  

def measure_min_bid_carbon(
    B_CASH: Decimal, 
    network_fee: Decimal
    ) -> Decimal:
    """
    ### Calculates the minimum sell price of `RISK` on carbon.

    ## Parameters:
    | Parameter name | Type      | Description                                        |
    |:---------------|:----------|:---------------------------------------------------|
    | `B_CASH`       | `Decimal` | A curve parameter, equal to `sqrt(P_b)`.           |
    | `network_fee`  | `Decimal` | The fee for the trade, represented as a decimal.   |

    ## Returns:
    | Return name      | Type      | Description                                            |
    |:-----------------|:----------|:-------------------------------------------------------|
    | `min_bid` | `Decimal` | The minimum sell price of `RISK` in `CASH` per `RISK`.        |

    ## Example:
    >>> measure_min_bid_carbon(Decimal('0.5'), Decimal('0.01'))
    Decimal('0.249875')
    
    ## LaTeX:
    $$P_{b}^{*} = B^{2} \\left( 1 - \\delta \\right)$$
    Where: $P_{b}^{*}$ = The fee-adjusted low-bound bidding price; $B$ = $\\sqrt{P_{b}}$ = The square root of the low-bound bidding price; $\\delta$ = the network fee.
    """
    min_bid = B_CASH**TWO*(ONE - network_fee)
    return(min_bid)

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
    """
    ### Calculates the current buy price of `RISK` on carbon.

    ## Parameters:
    | Parameter name | Type      | Description                                                                          |
    |:---------------|:----------|:-------------------------------------------------------------------------------------|
    | `y_RISK`       | `Decimal` | The token balance of the `RISK` order.                                               |
    | `y_int_RISK`   | `Decimal` | The 'capacity' of the `RISK` order. Refer to the Carbon whitepaper.                  |
    | `B_RISK`       | `Decimal` | A curve parameter, equal to `sqrt(P_b)`. Refer to the Carbon whitepaper.             |
    | `S_RISK`       | `Decimal` | A curve parameter, equal to `sqrt(P_a) - sqrt(P_b)`. Refer to the Carbon whitepaper. |
    | `network_fee`  | `Decimal` | The fee for the trade, represented as a decimal (e.g. 0.05 for 5%).                  |

    ## Returns:
    | Return name           | Type      | Description                                           |
    |:----------------------|:----------|:------------------------------------------------------|
    | `current_ask`         | `Decimal` | The current buy price of `RISK` in `CASH` per `RISK`. |

    ## Example:
    >>> measure_current_ask_carbon(Decimal('100'), Decimal('200'), Decimal('0.5'), Decimal('0.25'), Decimal('0.01'))
    Decimal('1.070538646732300983284741257')
    
    ## LaTeX:
    $$P_{ask} = \\frac{y_{int}^{2}}{\\left( 1 - \\delta \\right) \\left( B y_{int} + S y\\right)^{2}}$$
    Where: $P_{ask}$ = the current asking price; $\\delta$ = the network fee; $B$ = $\\sqrt{P_{b}}$ = The square root of the high-bound askin price; $S$ = $\\sqrt{P_{a}} - \\sqrt{P_{b}}$ = The range width parameter; $y$ = the RISK balance; $y_{int}$ = the RISK intercept. 
    """
    current_ask = y_int_RISK**TWO/((ONE - network_fee)*(B_RISK*y_int_RISK + S_RISK*y_RISK)**TWO)
    return(current_ask) 

# $$
# P_{ask} = \frac{y_{int}^{2}}{\left( 1 - \delta \right) \left( B y_{int} + S y\right)^{2}}
# $$
# Where:
# $P_{ask}$ = the current asking price; $\delta$ = the network fee; $B$ = $\sqrt{P_{b}}$ = The square root of the high-bound askin price; $S$ = $\sqrt{P_{a}} - \sqrt{P_{b}}$ = The range width parameter; $y$ = the RISK balance; $y_{int}$ = the RISK intercept.  

def measure_max_ask_carbon(
    B_RISK: Decimal, 
    network_fee: Decimal
    ) -> Decimal:
    """
    ### Calculates the maximum buy price of `RISK` on carbon.

    ## Parameters:
    | Parameter name | Type      | Description                                                               |
    |:---------------|:----------|:--------------------------------------------------------------------------|
    | `B_RISK`       | `Decimal` | A curve parameter, equal to `sqrt(P_b)`. Refer to the Carbon whitepaper.  |
    | `network_fee`  | `Decimal` | The fee for the trade, represented as a decimal (e.g. 0.05 for 5%).       |

    ## Returns:
    | Return name       | Type      | Description                                             |
    |:------------------|:----------|:--------------------------------------------------------|
    | `max_ask`         | `Decimal` | The maximum buy price of `RISK` in `CASH` per `RISK`.   |

    ## Example:
    >>> measure_max_buy_RISK_price_carbon(Decimal('0.5'), Decimal('0.01'))
    Decimal('799.9999999999999999999999958')
    
    ## LaTeX:
    $$P_{b}^{*} = \\frac{1}{B^{2} \\left( 1 - \\delta \\right)}$$
    Where: $P_{b}^{*}$ = The fee-adjusted high-bound asking price; $B$ = $\\sqrt{P_{b}}$ = The square root of the high-bound asking price; $\\delta$ = the network fee.
    """
    max_ask = ONE/(B_RISK**TWO*(ONE - network_fee))
    return(max_ask)

# $$
# P_{b}^{*} = \frac{1}{B^{2} \left( 1 - \delta \right)}
# $$
# Where:
# $P_{b}^{*}$ = The fee-adjusted high-bound asking price; $B$ = $\sqrt{P_{b}}$ = The square root of the high-bound asking price; $\delta$ = the network fee.

# # Uniswap v3 State Functions

def get_uniswap_v3_state(
    step: int = -2
    ) -> Tuple[Decimal, Decimal, Decimal, Decimal, Decimal, Decimal]:
    """
    ### Returns the current state of `uniswap_v3`.

    ## Parameters:
    | Parameter name | Type   | Description                                                                                               |
    |:---------------|:-------|:----------------------------------------------------------------------------------------------------------|
    | `step`         | `int`  | Selects the appropriate index in the target lists (see notes section for details). Default: -2.           |

    ## Returns:
    | Return name | Type                                                            | Description                                                                  |
    |:------------|:----------------------------------------------------------------|:-----------------------------------------------------------------------------|
    | `CASH`      | `Decimal`                                                       | The current `CASH` balance on Uniswap v3.                                    |
    | `RISK`      | `Decimal`                                                       | The current `RISK` balance on Uniswap v3.                                    |
    | `CASH_0`    | `Decimal`                                                       | Curve parameter `x_0`. Refer to the Carbon whitepaper.                       |
    | `RISK_0`    | `Decimal`                                                       | Curve parameter `y_0`. Refer to the Carbon whitepaper.                       |
    | `n`         | `Decimal`                                                       | Curve parameter; `n = 1 - sqrt(sqrt(P_b/P_a)) = 1 - (P_b/P_a)**(1/4)`.       |
    | `fee`       | `Decimal`                                                       | The fee for the trade, represented as a decimal (e.g. 0.05 for 5%).          |
    |             | `Tuple[Decimal, Decimal, Decimal, Decimal, Decimal, Decimal]`   | A tuple of `CASH`, `RISK`, `CASH_0`, `RISK_0`, `n`, `fee` (in that order).   |

    ## Example:
    >>> get_uniswap_v3_state()
    (Decimal('10000'), Decimal('100'), Decimal('10'), Decimal('1000'), Decimal('0.00696419413875685031730601168'), Decimal('0.005'))

    ## Notes:
    - There are three contexts wherein this function, `get_uniswap_v3_state` is called.
    - It is called by `perform_uniswap_v3_arbitrage` and `get_uniswap_v3_quote` during the initial simulation and population of the `uniswap_v3` protocol dictionary.
    - In the first context, no `step` is passed as an argument; therefore it defaults to `-2`.
    - When the value of `-2` is passed to `get_uniswap_v3_state` (this function), it is iterated by `+1`, and used to fetch the token balances by their index. (e.g. CASH = uniswap_v3['simulation recorder']['CASH balance'][step + 1]).
    - Therefore, the last item on their respective lists is accessed, which is appropriate as the data accumulates on the leading edge of the list.
    - In the second context, during the preparation of the animated figures, this function is called by `get_uniswap_v3_depth_arrays`.
    - In the second context, the data already exists inside the `uniswap_v3` protocol dictionary, which is accessed sequentially to prepare the animation.
    - Therefore, `get_uniswap_v3_depth_arrays` passes a `step` argument to retrieve the appropriate information.
    - The reason for the `+1` increment is to offset the index by the correct amount, to correct for the fact that the main `uniswap_v3['simulation recorder']['CASH balance']` and `['RISK balance']` lists are populated with tehir initial state before the simulation begins. 
    - Therefore, the `['CASH balance']` and `['RISK balance']` lists are longer than the other lists inside the `uniswap_v3['simulation recorder']` by exactly `+1`.
    """
    CASH = uniswap_v3['simulation recorder']['CASH balance'][step + 1]
    RISK = uniswap_v3['simulation recorder']['RISK balance'][step + 1]
    CASH_0 = uniswap_v3['curve parameters']['CASH_0'][-1]
    RISK_0 = uniswap_v3['curve parameters']['RISK_0'][-1]
    n = uniswap_v3['curve parameters']['n'][-1]
    fee = uniswap_v3['curve parameters']['fee'][-1]
    return(CASH, RISK, CASH_0, RISK_0, n, fee)

def measure_current_bid_uniswap_v3(
    CASH: Decimal, 
    CASH_0: Decimal, 
    RISK_0: Decimal, 
    n: Decimal, 
    fee: Decimal
    ) -> Decimal:
    """
    ### Calculates the current sell price of RISK on `uniswap_v3`.

    ## Parameters:
    | Parameter name | Type      | Description                                                                                            |
    |:---------------|:----------|:-------------------------------------------------------------------------------------------------------|
    | `CASH`         | `Decimal` | The current `CASH` balance on `uniswap_v3`.                                                            |
    | `CASH_0`       | `Decimal` | The `CASH` balance at the x-intercept on `uniswap_v3`.                                                 |
    | `RISK_0`       | `Decimal` | The `RISK` balance at the x-intercept on `uniswap_v3`.                                                 |
    | `n`            | `Decimal` | Curve parameter; `n = 1 - sqrt(sqrt(P_b/P_a)) = 1 - (P_b/P_a)**(1/4)`. Refer to the Carbon whitepaper. |
    | `fee`          | `Decimal` | The fee for the trade, represented as a decimal (e.g. 0.05 for 5%).                                    |

    ## Returns:
    | Return name            | Type      | Description                                      |
    |:-----------------------|:----------|:-------------------------------------------------|
    | `current_bid`          | `Decimal` | The current sell price of `RISK` in `CASH`.      |

    ## Example:
    >>> measure_current_bid_uniswap_v3(Decimal('100'), Decimal('200'), Decimal('200'), Decimal('0.3'), Decimal('0.01'))
    Decimal('0.3668478260869565217391304348')
    
    ## LaTeX:
    $$P_{bid} = \\frac{\\left( 1 - \\delta \\right) \\left( y n + y_{0} \\left(1 - n \\right)\\right)^{2}}{x_{0} y_{0}}$$
    Where: $P_{bid}$ = the current bidding price; $\\delta$ = the network fee; $y$ = CASH token balance; $n$ = $1 - \\sqrt[4]{\\frac{P_{b}}{P_{a}}}$ = the curve scaling parameter; $y_{0}$, $x_{0}$ = the CASH and RISK pivots, respectively.
    """
    current_bid = (ONE - fee)*(CASH*n + CASH_0*(ONE - n))**TWO/(RISK_0*CASH_0)
    return(current_bid)

# $$P_{bid} = \frac{\left( 1 - \delta \right) \left( y n + y_{0} \left(1 - n \right)\right)^{2}}{x_{0} y_{0}}$$
# Where: $P_{bid}$ = the current bidding price; $\delta$ = the network fee; $y$ = CASH token balance; $n$ = $1 - \sqrt[4]{\frac{P_{b}}{P_{a}}}$ = the curve scaling parameter; $y_{0}$, $x_{0}$ = the CASH and RISK pivots, respectively.

def measure_min_bid_uniswap_v3(
    CASH_0: Decimal, 
    RISK_0: Decimal, 
    n: Decimal, 
    fee: Decimal
    ) -> Decimal:
    """
    ### Calculates the minimum sell price of `RISK` on `uniswap_v3`.

    ## Parameters:
    | Parameter name | Type      | Description                                                                                            |
    |:---------------|:----------|:-------------------------------------------------------------------------------------------------------|
    | `CASH_0`       | `Decimal` | The `CASH` balance at the x-intercept on `uniswap_v3`.                                                 |
    | `RISK_0`       | `Decimal` | The `RISK` balance at the x-intercept on `uniswap_v3`.                                                 |
    | `n`            | `Decimal` | Curve parameter; `n = 1 - sqrt(sqrt(P_b/P_a)) = 1 - (P_b/P_a)**(1/4)`. Refer to the Carbon whitepaper. |
    | `fee`          | `Decimal` | The fee for the trade, represented as a decimal (e.g. 0.05 for 5%).                                    |

    ## Returns:
    | Return name      | Type      | Description                                             |
    |:-----------------|:----------|:--------------------------------------------------------|
    | `min_bid`        | `Decimal` | The minimum sell price of `RISK` in `CASH` per `RISK`.  |

    ## Example:
    >>> measure_min_bid_uniswap_v3(Decimal('100'), Decimal('200'), Decimal('0.25'), Decimal('0.01'))
    Decimal('0.06247500000000000000000000000')
    
    ## LaTeX:
    $$P_{b}^{*} = \\frac{y_{0} \\left( 1 - \\delta \\right) \\left( 1 - n\\right)^{2}}{x_{0}}$$
    Where: $P_{b}^{*}$ = The fee-adjusted low-bound bidding price; $\\delta$ = the network fee; $n$ = $1 - \\sqrt[4]{\\frac{P_{b}}{P_{a}}}$ = the curve scaling parameter; $y_{0}$, $x_{0}$ = the CASH and RISK pivots, respectively.
    """
    min_bid = (CASH_0*(ONE - fee)*(ONE - n)**TWO)/RISK_0
    return(min_bid)

# $$
# P_{b}^{*} = \frac{y_{0} \left( 1 - \delta \right) \left( 1 - n\right)^{2}}{x_{0}}
# $$
# Where:
# $P_{b}^{*}$ = The fee-adjusted low-bound bidding price; $\delta$ = the network fee; $n$ = $1 - \sqrt[4]{\frac{P_{b}}{P_{a}}}$ = the curve scaling parameter; $y_{0}$, $x_{0}$ = the CASH and RISK pivots, respectively.

def measure_current_ask_uniswap_v3(
    CASH: Decimal, 
    CASH_0: Decimal, 
    RISK_0: Decimal, 
    n: Decimal, 
    fee: Decimal
    ) -> Decimal:
    """
    ### Calculates the current buy price of `RISK` on `uniswap_v3`.

    ## Parameters:
    | Parameter name | Type      | Description                                                                                            |
    |:---------------|:----------|:-------------------------------------------------------------------------------------------------------|
    | `CASH`         | `Decimal` | The current `CASH` balance on `uniswap_v3`.                                                            |
    | `CASH_0`       | `Decimal` | The `CASH` balance at the x-intercept on `uniswap_v3`.                                                 |
    | `RISK_0`       | `Decimal` | The `RISK` balance at the x-intercept on `uniswap_v3`.                                                 |
    | `n`            | `Decimal` | Curve parameter; `n = 1 - sqrt(sqrt(P_b/P_a)) = 1 - (P_b/P_a)**(1/4)`. Refer to the Carbon whitepaper. |
    | `fee`          | `Decimal` | The fee for the trade, represented as a decimal (e.g. 0.05 for 5%).                                    |

    ## Returns:
    | Return name          | Type      | Description                                          |
    |:---------------------|:----------|:-----------------------------------------------------|
    | `current_ask`        | `Decimal` | The current buy price of `RISK` in `CASH` per `RISK`.|

    ## Example:
    >>> measure_current_ask_uniswap_v3(Decimal('100'), Decimal('200'), Decimal('300'), Decimal('0.25'), Decimal('0.01'))
    Decimal('0.8335559030497989970326419833')
    ## LaTeX:
    $$P_{ask} = \\frac{\\left(y n + y_{0} \\left( 1 - n\\right)\\right)^{2}}{x_{0} y_{0} \\left( 1 - \\delta \\right)}$$
    Where: $P_{ask}$ = The fee-adjusted high-bound asking price; $\\delta$ = the network fee; $y$ = CASH token balance; $n$ = $1 - \\sqrt[4]{\\frac{P_{b}}{P_{a}}}$ = the curve scaling parameter; $y_{0}$, $x_{0}$ = the CASH and RISK pivots, respectively.
    """
    current_ask = (CASH*n + CASH_0*(1 - n))**TWO/(RISK_0*CASH_0*(ONE - fee))
    return(current_ask) 

# $$
# P_{ask} = \frac{\left(y n + y_{0} \left( 1 - n\right)\right)^{2}}{x_{0} y_{0} \left( 1 - \delta \right)}
# $$
# Where:
# $P_{ask}$ = The fee-adjusted high-bound asking price; $\delta$ = the network fee; $y$ = CASH token balance; $n$ = $1 - \sqrt[4]{\frac{P_{b}}{P_{a}}}$ = the curve scaling parameter; $y_{0}$, $x_{0}$ = the CASH and RISK pivots, respectively.

def measure_max_ask_uniswap_v3(
    CASH_0: Decimal, 
    RISK_0: Decimal, 
    n: Decimal, 
    fee: Decimal
    ) -> Decimal:
    """
    ### Calculates the maximum buy price of `RISK` on `uniswap_v3`.

    ## Parameters:
    | Parameter name | Type      | Description                                                            |
    |:---------------|:----------|:-----------------------------------------------------------------------|
    | `CASH_0`       | `Decimal` | The `CASH` balance at the x-intercept on `uniswap_v3`.                 |
    | `RISK_0`       | `Decimal` | The `RISK` balance at the x-intercept on `uniswap_v3`.                 |
    | `n`            | `Decimal` | Curve parameter; `n = 1 - sqrt(sqrt(P_b/P_a)) = 1 - (P_b/P_a)**(1/4)`. |
    | `fee`          | `Decimal` | The fee for the trade, represented as a decimal (e.g. 0.05 for 5%).    |

    ## Returns:
    | Return name      | Type      | Description                                           |
    |:-----------------|:----------|:------------------------------------------------------|
    | `max_ask`        | `Decimal` | The maximum buy price of `RISK` in `CASH` per `RISK`. |

    ## Example:
    >>> measure_max_ask_uniswap_v3(Decimal('100'), Decimal('200'), Decimal('0.25'), Decimal('0.01'))
    Decimal('0.2008384560198613148148148148')
    ## LaTeX:
    $$P_{a}^{*} = \\frac{y_{0}}{x_{0} \\left( 1 - \\delta \\right) \\left(1 - n\\right)^{2}}$$
    Where: $P_{a}^{*}$ = The fee-adjusted high-bound asking price; $\\delta$ = the network fee; $n$ = $1 - \\sqrt[4]{\\frac{P_{b}}{P_{a}}}$ = the curve scaling parameter; $y_{0}$, $x_{0}$ = the CASH and RISK pivots, respectively.
    """
    max_ask = CASH_0/(RISK_0*(ONE - fee)*(ONE - n)**TWO)
    return(max_ask)

# $$
# P_{a}^{*} = \frac{y_{0}}{x_{0} \left( 1 - \delta \right) \left(1 - n\right)^{2}}
# $$
# Where:
# $P_{a}^{*}$ = The fee-adjusted high-bound asking price; $\delta$ = the network fee; $n$ = $1 - \sqrt[4]{\frac{P_{b}}{P_{a}}}$ = the curve scaling parameter; $y_{0}$, $x_{0}$ = the CASH and RISK pivots, respectively.

# # Uniswap v2 State Functions

def get_uniswap_v2_state(
    step: int = -2
    ) -> Tuple[Decimal, Decimal, Decimal]:
    """
    ### Retrieves the current state of the `uniswap_v2` protocol.

    ## Parameters:
    | Parameter name | Type   | Description                                                                                               |
    |:---------------|:-------|:----------------------------------------------------------------------------------------------------------|
    | `step`         | `int`  | Selects the appropriate index in the target lists (see notes section for details). Default: -2.           |

    ## Returns:
    | Return name | Type      | Description                                                           |
    |:------------|:----------|:----------------------------------------------------------------------|
    | `CASH`      | `Decimal` | The `CASH` balance on `uniswap_v2`.                                   |
    | `RISK`      | `Decimal` | The `RISK` balance on `uniswap_v2`.                                   |
    | `fee`       | `Decimal` | The fee for the trade, represented as a decimal (e.g. 0.05 for 5%).   |
    |             | `Tuple`   | A tuple of `CASH`, `RISK`, and `fee` (in that order).                 |

    ## Example:
    >>> get_univ2_state()
    (Decimal('10'), Decimal('20'), Decimal('0.03'))

    ## Notes:
    - There are three contexts wherein this function, `get_uniswap_v3_state` is called.
    - It is called by `perform_uniswap_v2_arbitrage_series` and `get_uniswap_v2_quote` during the initial simulation and population of the `uniswap_v2` protocol dictionary.
    - In the first context, no `step` is passed as an argument; therefore it defaults to `-2`.
    - When the value of `-2` is passed to `get_uniswap_v2_state` (this function), it is iterated by `+1`, and used to fetch the token balances by their index. (e.g. CASH = uniswap_v2['simulation recorder']['CASH balance'][step + 1]).
    - Therefore, the last item on their respective lists is accessed, which is appropriate as the data accumulates on the leading edge of the list.
    - In the second context, during the preparation of the animated figures, this function is called by `get_uniswap_v2_depth_arrays`.
    - In the second context, the data already exists inside the `uniswap_v2` protocol dictionary, which is accessed sequentially to prepare the animation.
    - Therefore, `get_uniswap_v2_depth_arrays` passes a `step` argument to retrieve the appropriate information.
    - The reason for the `+1` increment is to offset the index by the correct amount, to correct for the fact that the main `uniswap_v2['simulation recorder']['CASH balance']` and `['RISK balance']` lists are populated with tehir initial state before the simulation begins. 
    - Therefore, the `['CASH balance']` and `['RISK balance']` lists are longer than the other lists inside the `uniswap_v3['simulation recorder']` by exactly `+1`.
    """
    CASH = uniswap_v2['simulation recorder']['CASH balance'][step + 1]
    RISK = uniswap_v2['simulation recorder'] ['RISK balance'][step + 1]
    fee = uniswap_v2['curve parameters']['fee'][-1]
    return(CASH, RISK, fee)

def measure_current_bid_uniswap_v2(
    CASH: Decimal, 
    RISK: Decimal, 
    fee: Decimal
    ) -> Decimal:
    """
    ### Calculates the current sell price of `RISK` on `uniswap_v2`.

    ## Parameters:
    | Parameter name | Type      | Description                                                           |
    |:---------------|:----------|:----------------------------------------------------------------------|
    | `CASH`         | `Decimal` | The `CASH` balance on `uniswap_v2`.                                   |
    | `RISK`         | `Decimal` | The `RISK` balance on `uniswap_v2`.                                   |
    | `fee`          | `Decimal` | The fee for the trade, represented as a decimal (e.g. 0.05 for 5%).   |

    ## Returns:
    | Return name            | Type      | Description                                            |
    |:-----------------------|:----------|:-------------------------------------------------------|
    | `current_bid`          | `Decimal` | The current sell price of `RISK` in `CASH` per `RISK`. |

    ## Example:
    >>> measure_current_bid_uniswap_v2(Decimal('100'), Decimal('200'), Decimal('0.01'))
    Decimal('0.495')
    
    ## LaTeX:
    $$P_{bid} = \\frac{y \\left( 1 - \\delta \\right)}{x}$$
    Where: $P_{bid}$ = The current bidding price; $\\delta$ = the network fee; $y$ = the CASH token balance; $x$ = the RISK token balance.
    """
    current_bid = CASH*(ONE - fee)/RISK
    return(current_bid)

# $$
# P_{bid} = \frac{y \left( 1 - \delta \right)}{x}
# $$
# Where:
# $P_{bid}$ = The current bidding price; $\delta$ = the network fee; $y$ = the CASH token balance; $x$ = the RISK token balance.

def measure_pseudo_min_bid_uniswap_v2(
    current_bid: Decimal,
    ) -> Decimal:
    """
    ### Calculates an aimaginary minimum sell price of `RISK` on `uniswap_v2`.

    ## Parameters:
    | Parameter name         | Type      | Description                                            |
    |:-----------------------|:----------|:-------------------------------------------------------|
    | `current_bid`          | `Decimal` | The current sell price of `RISK` in `CASH` per `RISK`. |

    ## Returns:
    | Return name      | Type      | Description                                            |
    |:-----------------|:----------|:-------------------------------------------------------|
    | `min_bid`        | `Decimal` | The minimum sell price of `RISK` in `CASH` per `RISK`. |
    
    ## Dependencies:
    | Dependency name     | Type             | Description                                                                                                               |
    |:--------------------|:-----------------|:--------------------------------------------------------------------------------------------------------------------------|
    | `PRICE_DATA`        | `List[Decimal]`  | A `global` list containing the sequence of `RISK` prices in units of `CASH` per `RISK`, for each step of the simulation.  |
    | `SIMULATION_STEP`   | `int`            | A `global` variable containing the current step of the simulation.                                                        |

    ## Notes:
    - At the digital resolution of this simulation, it is effectively impossible for `uniswap_v2` to run out of liquidity. 
    - Therefore, there is no minimum bid price. 
    - For the benefit of the animation, the minimum bid is arbitrarily set to be half the current bid, or the lowest price in the simulation so far (whichever is lower.)
    """
    global PRICE_DATA
    global SIMULATION_STEP
    min_bid = min(min(PRICE_DATA[:SIMULATION_STEP + 1]), current_bid/TWO)
    return(min_bid)

def measure_current_ask_uniswap_v2(
    CASH: Decimal, 
    RISK: Decimal, 
    fee: Decimal
    ) -> Decimal:
    """
    ### Calculates the current buy price of `RISK` on `uniswap_v2`.

    ## Parameters:
    | Parameter name | Type      | Description                                                         |
    |:---------------|:----------|:--------------------------------------------------------------------|
    | `CASH`         | `Decimal` | The `CASH` balance on `uniswap_v2`.                                 |
    | `RISK`         | `Decimal` | The `RISK` balance on `uniswap_v2`.                                 |
    | `fee`          | `Decimal` | The fee for the trade, represented as a decimal (e.g. 0.05 for 5%). |

    ## Returns:
    | Return name          | Type      | Description                                           |
    |:---------------------|:----------|:------------------------------------------------------|
    | `current_ask`        | `Decimal` | The current buy price of `RISK` in `CASH` per `RISK`. |

    ## Example:
    >>> measure_current_ask_uniswap_v2(Decimal('100'), Decimal('200'), Decimal('0.01'))
    Decimal('0.4975124378109452736318407960')
    
    ## LaTeX:
    $$P_{ask} = \\frac{y}{x \\left( 1 - \\delta \\right)}$$
    Where: $P_{ask}$ = The current asking price; $\\delta$ = the network fee; $y$ = the CASH token balance; $x$ = the RISK token balance.
    """
    current_ask = CASH/(RISK*(ONE - fee))
    return(current_ask) 

# $$
# P_{ask} = \frac{y}{x \left( 1 - \delta \right)}
# $$
# Where:
# $P_{ask}$ = The current asking price; $\delta$ = the network fee; $y$ = the CASH token balance; $x$ = the RISK token balance.

def measure_pseudo_max_ask_uniswap_v2(
    current_ask: Decimal,
    ) -> Decimal:
    """
    ### Calculates an imaginary maximum buy price of `RISK` on `uniswap_v2`.

    ## Parameters:
    | Parameter name         | Type      | Description                                                           |
    |:-----------------------|:----------|:----------------------------------------------------------------------|
    | `current_ask`          | `Decimal` | The current buy price of `RISK` in `CASH` per `RISK`.                 |
    | `fee`                  | `Decimal` | The fee for the trade, represented as a decimal (e.g. 0.05 for 5%).   |

    ## Returns:
    | Return name      | Type      | Description                                           |
    |:-----------------|:----------|:------------------------------------------------------|
    | `max_ask`        | `Decimal` | The maximum buy price of `RISK` in `CASH` per `RISK`. |

    ## Notes:
    - At the digital resolution of this simulation, it is effectively impossible for `uniswap_v2` to run out of liquidity. 
    - Therefore, there is no maximum ask price. 
    - For the benefit of the animation, the maximum ask is arbitrarily set to be twice the current ask, or the hioghest price in the simulation so far (whichever is higher.)
    """
    global PRICE_DATA
    global SIMULATION_STEP
    max_ask = max(max(PRICE_DATA[:SIMULATION_STEP + 1]), current_ask*TWO)
    return(max_ask)

# # Carbon Housekeeping Functions

def get_carbon_order_P_a_P_b_y_int(
    y_int_updated_order: str
    ) -> Tuple[Decimal, Decimal, Decimal]:
    """
    ### Retrieves the latest `P_a`, `P_b`, and `y_int` curve constants for the specified updated order.

    ## Parameters:
    | Parameter name       | Type   | Description                                                   |
    |:---------------------|:-------|:--------------------------------------------------------------|
    | `y_int_updated_order`| `str`  | The identifier for the updated order in the `carbon` dataset. |

    ## Returns:
    | Return name | Type                                | Description                               |
    |:------------|:------------------------------------|:------------------------------------------|
    | `P_a`       | `Decimal`                           | The latest `P_a` curve constant.          |
    | `P_b`       | `Decimal`                           | The latest `P_b` curve constant.          |
    | `y_int`     | `Decimal`                           | The latest `y_int` curve constant.        |
    |             | `Tuple[Decimal, Decimal, Decimal]`  | A tuple of `P_a`, `P_b`, and `y_int`.     |
    
    ## Dependencies:
    | Dependency name: | Type    | Description                                                                                               |
    |:-----------------|:--------|:----------------------------------------------------------------------------------------------------------|
    | `carbon`         | `dict`  | A `global` dictionary containing the curve parameters and simulation recording for the `carbon` protocol. |

    ## Notes:
    - This function is called for a certain order, either `CASH` or `RISK`, if and only if the `y_int` value was updated during a trade.
    - This function retrieves the most recent `P_a`, `P_b`, and `y_int` curve constants from the `carbon` dataset for the same order.
    - The constants are returned, and used by `recalculate_carbon_pivots_asymptotes_and_x_intercept` to recalculate the other curve size constants.
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    """
    global carbon
    P_a, P_b, y_int = [carbon['curve parameters'][y_int_updated_order][i][-1] for i in ['P_a', 'P_b', 'y_int']]
    return(P_a, P_b, y_int)

def update_carbon_pivots_asymptotes_and_x_intercept(
    y_int_updated_order: str,
    x_int: Decimal, 
    x_0: Decimal, 
    x_asym: Decimal, 
    y_0: Decimal, 
    y_asym: Decimal,
    k: Decimal
    ) -> None:
    """
    ### Updates the curve size constants in the `carbon` dataset for the specified updated order.

    ## Parameters:
    | Parameter name       | Type      | Description                                                                                                           |
    |:---------------------|:----------|:----------------------------------------------------------------------------------------------------------------------|
    | `y_int_updated_order`| `str`     | The `carbon` order, either `CASH` or `RISK`, where the `y_int` value was updated during this step of the simulation.  |
    | `x_int`              | `Decimal` | The updated value of the x-intercept.                                                                                 |
    | `x_0`                | `Decimal` | The updated value of the x-coordinate of the pivot point.                                                             |
    | `x_asym`             | `Decimal` | The updated value of the x-coordinate of the x-asymptote.                                                             |
    | `y_0`                | `Decimal` | The updated value of the y-coordinate of the pivot point.                                                             |
    | `y_asym`             | `Decimal` | The updated value of the y-coordinate of the y-asymptote.                                                             |
    | `k`                  | `Decimal` | The updated fundamental hyperbola constant.                                                                           |

    ## Returns:
    None

    ## Dependencies:
    | Dependency name: | Type    | Description                                                                                               |
    |:-----------------|:--------|:----------------------------------------------------------------------------------------------------------|
    | `carbon`         | `dict`  | A `global` dictionary containing the curve parameters and simulation recording for the `carbon` protocol. |

    ## Notes:
    - This function updates the curve size constants in the `carbon` dataset for the specified updated order after the `y_int` value has been updated during a trade.
    - The updated constants are passed as arguments to the function, and they are used to modify the `carbon` dataset.
    - This function does not return any values; it only modifies the `carbon` dataset.
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    """
    global carbon
    for key, value in zip(['x_int', 'x_0', 'x_asym', 'y_0', 'y_asym', 'k'], 
                          [x_int, x_0, x_asym, y_0, y_asym, k]):
        carbon['curve parameters'][y_int_updated_order][key].append(value)
    return(None)

def recalculate_carbon_pivots_asymptotes_and_x_intercept(
    y_int_updated_order: str
    ) -> None:
    """
    ### Recalculates the curve size constants based on the updated `y_int` value for the specified updated order.

    ## Parameters:
    | Parameter name       | Type   | Description                                                                                                           |
    |:---------------------|:-------|:----------------------------------------------------------------------------------------------------------------------|
    | `y_int_updated_order`| `str`  | The `carbon` order, either `CASH` or `RISK`, where the `y_int` value was updated during this step of the simulation.  |

    ## Returns:
    | Return name | Type                                                          | Description                                                                   |
    |:------------|:--------------------------------------------------------------|:------------------------------------------------------------------------------|
    | `x_int`     | `Decimal`                                                     | The recalculated x-intercept.                                                 |
    | `x_0`       | `Decimal`                                                     | The recalculated x-coordinate of the pivot point.                             |
    | `x_asym`    | `Decimal`                                                     | The recalculated x-coordinate of the x-asymptote.                             |
    | `y_0`       | `Decimal`                                                     | The recalculated y-coordinate of the pivot point.                             |
    | `y_asym`    | `Decimal`                                                     | The recalculated y-coordinate of the y-asymptote.                             |
    | `k`         | `Decimal`                                                     | The recalculated fundamental hyperbola constant.                              |
    |             | `Tuple[Decimal, Decimal, Decimal, Decimal, Decimal, Decimal]` | A tuple of `x_int`, `x_0`, `x_asym`, `y_0`, `y_asym`, and `k`, in that order. |

    ## Dependencies:
    | Dependency name:                                | Type       | Description                                                                                                              |
    |:------------------------------------------------|:-----------|:-------------------------------------------------------------------------------------------------------------------------|
    | `get_carbon_order_P_a_P_b_y_int`                | `function` | Retrieves the most recent `P_a`, `P_b`, and `y_int` constants for the specified `carbon` order (either `CASH or `RISK`). |
    | `get_carbon_pivots_asymptotes_and_x_intercepts` | `function` | Calculates the curve size constants based on `P_a`, `P_b`, and `y_int`.                                                  |
    | `calculate_hyperbolic_constant_k`               | `function` | Calculates the fundamental hyperbola constant `k`.                                                                       |

    ## Notes:
    - This function is called to recalculate the curve size constants for the specified updated order after the `y_int` value has been updated during a trade.
    - It retrieves the latest `P_a`, `P_b`, and `y_int` values, then calculates the updated curve size constants and returns them.
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    """
    P_a, P_b, y_int = get_carbon_order_P_a_P_b_y_int(y_int_updated_order)
    x_int, x_0, x_asym, y_0, y_asym = get_carbon_pivots_asymptotes_and_x_intercepts(P_a, P_b, y_int)
    k = calculate_hyperbolic_constant_k(x_0, y_0)
    return(x_int, x_0, x_asym, y_0, y_asym, k)

def copy_carbon_parameters(
    parameters: List[str], 
    order_to_ignore: Union[str, None] = None
    ) -> None:
    """
    ### Copies the latest values of specified parameters for the `CASH` and `RISK` orders in the `carbon` dataset, except for the ignored order.

    ## Parameters:
    | Parameter name    | Type                 | Description                                                                          |
    |:------------------|:---------------------|:-------------------------------------------------------------------------------------|
    | `parameters`      | `List[str]`          | A list of parameter names to be copied in the `carbon` dataset.                      |
    | `order_to_ignore` | `Union[str, None]`   | The `carbon` order, either `CASH` or `RISK`, to be ignored, or `None` (default).     |

    ## Returns:
    None

    ## Dependencies:
    | Dependency name: | Type    | Description                                                                                               |
    |:-----------------|:--------|:----------------------------------------------------------------------------------------------------------|
    | `carbon`         | `dict`  | A `global` dictionary containing the curve parameters and simulation recording for the `carbon` protocol. |

    ## Notes:
    - This function is called to copy the latest values of the specified parameters for both `CASH` and `RISK` orders in the `carbon` dataset.
    - The `order_to_ignore` parameter allows for selectively ignoring one of the orders.
    - If `order_to_ignore` is set to `None`, the latest values of the specified parameters are copied for both orders.
    - This function does not return any values; it only modifies the `carbon` dataset.
    """
    global carbon
    for order, parameter in product(('CASH', 'RISK'), parameters):
        if order != order_to_ignore:
            carbon['curve parameters'][order][parameter].append(carbon['curve parameters'][order][parameter][-1])
    return(None)

def copy_carbon_simulation_recorder_values(
    keys: List[str]
    ) -> None:
    """
    ### Copies the latest values of specified keys in the `carbon` simulation recorder.

    ## Parameters:
    | Parameter name | Type         | Description                                                      |
    |:---------------|:-------------|:-----------------------------------------------------------------|
    | `keys`         | `List[str]`  | A list of keys to be copied in the `carbon` simulation recorder. |
    
    ## Returns:
    None

    ## Dependencies:
    | Dependency name: | Type    | Description                                                                                               |
    |:-----------------|:--------|:----------------------------------------------------------------------------------------------------------|
    | `carbon`         | `dict`  | A `global` dictionary containing the curve parameters and simulation recording for the `carbon` protocol. |

    ## Notes:
    - This function is called to copy the latest values of the specified keys in the `carbon` simulation recorder.
    - The keys represent different attributes or values related to the simulation.
    - This function does not return any values; it only modifies the `carbon` dataset.
    """
    global carbon
    for key in keys:
        carbon['simulation recorder'][key].append(carbon['simulation recorder'][key][-1])
    return(None)

def update_carbon_range_bounds(
    ) -> None:
    """
    ### Updates the lower bound of the ask price, and the upper bound of the bid price, correctly adjusted for the fee. 

    ## Parameters:
    None

    ## Returns:
    None

    ## Dependencies:
    | Dependency name: | Type    | Description                                                                                               |
    |:-----------------|:--------|:----------------------------------------------------------------------------------------------------------|
    | `carbon`         | `dict`  | A `global` dictionary containing the curve parameters and simulation recording for the `carbon` protocol. |

    ## Notes:
    - Updates the 'ask lower bound' and the 'bid upper bound' in the `carbon['simulation recorder']` dictionary.
    - These values represent the edge marginal price bounds of the `CASH` and `RISK` orders, after adjusting for the `fee`.  
    """
    carbon['simulation recorder']['ask lower bound'].append(ONE/(carbon['curve parameters']['RISK']['P_a'][-1]*(ONE - carbon['curve parameters']['RISK']['fee'][-1])))
    carbon['simulation recorder']['bid upper bound'].append(carbon['curve parameters']['CASH']['P_a'][-1]*(ONE - carbon['curve parameters']['CASH']['fee'][-1]))
    return(None)

def carbon_housekeeping(
    updates_occurred: bool, 
    y_int_updated_order: Union[str, None]
    ) -> None:
    """
    ### Performs housekeeping tasks for the `carbon` protocol after a trade.

    ## Parameters:
    | Parameter name       | Type                | Description                                                                                                                                                   |
    |:---------------------|:--------------------|:--------------------------------------------------------------------------------------------------------------------------------------------------------------|
    | `updates_occurred`   | `bool`              | Indicates if any updates occurred during the trade, which determines which rows of the simulation recorder should be copied.                                  |
    | `y_int_updated_order`| `Union[str, None]`  | The `carbon` order, either `CASH` or `RISK`, where the `y_int` value was updated during this step of the simulation, or `None` if no `y_int` update occurred. |
    
    ## Returns:
    None

    ## Dependencies:
    | Dependency name:                                       | Type       | Description                                                                                                           |
    |:-------------------------------------------------------|:-----------|:----------------------------------------------------------------------------------------------------------------------|
    | `copy_carbon_parameters`                               | `function` | Copies the latest values of specified parameters in the `carbon` dataset for each order.                              |
    | `recalculate_carbon_pivots_asymptotes_and_x_intercept` | `function` | Recalculates the curve size constants based on the updated `y_int` value for the specified updated order.             |
    | `update_carbon_pivots_asymptotes_and_x_intercept`      | `function` | Updates the curve size constants in the `carbon` dataset for the specified updated order.                             |
    | `copy_carbon_simulation_recorder_values`               | `function` | Copies the latest values of specified keys in the `carbon` simulation recorder.                                       |

    ## Notes:
    - This function is called after a trade in the `carbon` protocol to perform housekeeping tasks.
    - It copies the latest values of specified parameters and simulation recorder keys.
    - If the `y_int` value was updated during the trade, it recalculates the curve size constants for the specified updated order and updates the `carbon` dataset accordingly.
    - The function does not return any values; it only modifies the `carbon` dataset and simulation recorder.
    - Refer to the [Carbon whitepaper](https://carbondefi.xyz/whitepaper) for a description of the significance of the curve constants `P_a`, `P_b`, `y_0`, `x_0`, `y_int`, `x_int`, `y_asym`, `x_asym`, `B`, `P`, `Q`, `R`, `S` and `n`.    
    """
    copy_carbon_parameters(('P_a', 'P_b', 'B', 'P', 'Q', 'R', 'S', 'n', 'fee'))
    copy_carbon_parameters(('x_int', 'x_0', 'x_asym', 'y_0', 'y_asym', 'k'), order_to_ignore = y_int_updated_order)
    if not updates_occurred:
        copy_carbon_simulation_recorder_values(['RISK balance', 'CASH balance', 'RISK fees', 'CASH fees'])
        copy_carbon_parameters(('y_int',)) # leave this comma where it is!
    if y_int_updated_order is not None:
        x_int, x_0, x_asym, y_0, y_asym, k = recalculate_carbon_pivots_asymptotes_and_x_intercept(y_int_updated_order)
        update_carbon_pivots_asymptotes_and_x_intercept(y_int_updated_order, x_int, x_0, x_asym, y_0, y_asym, k)
    update_carbon_range_bounds()
    return(None)

# # Carbon Arbitrage Functions

def get_carbon_quote(
    b_or_a: str, 
    log_bid_and_ask: bool = True
    ) -> Tuple[Decimal, Decimal]:
    """
    ### Returns the marginal price quotes for buying and selling `RISK` on the `carbon` protocol in units of `CASH` per `RISK`.

    ## Parameters:
    None
    
    ## Returns:
    | Return name   | Type      | Description                                                                                  |
    |:--------------|:----------|:---------------------------------------------------------------------------------------------|
    | `current_ask` | `Decimal` | The fee-adjusted marginal price of `RISK` in units of `CASH` per `RISK` when buying `RISK`.  |
    | `current_bid` | `Decimal` | The fee-adjusted marginal price of `RISK` in units of `CASH` per `RISK` when selling `RISK`. |
    |               | `tuple`   | A tuple of `current_ask`, `current_bid` (in that order).                                     |
    
    ## Dependencies:
    | Dependency name:                         | Type       | Description                                                              |
    |:-----------------------------------------|:-----------|:-------------------------------------------------------------------------|
    | `get_carbon_strategy_states`             | `function` | Returns the parameters of the carbon curve for `CASH` and `RISK` orders. |
    | `get_carbon_network_fee`                 | `function` | Returns the current network fee for the Carbon exchange.                 |
    | `measure_current_bid_carbon`             | `function` | Calculates the current sell price of `RISK` on `carbon`.                 |
    | `measure_current_ask_carbon`             | `function` | Calculates the current buy price of `RISK` on `carbon`.                  |
    | `record_quotes_to_logger`                | `function` | Records the quotes to the logger.                                        |

    ## Example:
    >>> get_carbon_quote()
    (Decimal('1.228251'), Decimal('1.237214'))
    """
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
    """
    ### Calculates `Dx` based on the given values of `Dy`, `y_int`, `S`, `B` and `y`.

    ## Parameters:
    | Parameter name | Type      | Description                                                                        |
    |:---------------|:----------|:-----------------------------------------------------------------------------------|
    | `Dy`           | `Decimal` | The decrease (-) in the `y` balance of the associated Carbon order during a trade. |
    | `y_int`        | `Decimal` | The 'capacity' of the associated Carbon order. Refer to the Carbon whitepaper.     |
    | `S`            | `Decimal` | The curve parameter `sqrt(P_a) - sqrt(P_b)`. Refer to the Carbon whitepaper.       |
    | `B`            | `Decimal` | The curve parameter `sqrt(P_b)`. Refer to the Carbon whitepaper.                   |
    | `y`            | `Decimal` | The token balance of the associated Carbon order.                                  |

    ## Returns:
    | Return name | Type      | Description                                                                       |
    |:------------|:----------|:----------------------------------------------------------------------------------|
    | `Dx`        | `Decimal` | The increase (+) in the `y` balance of the *other* `carbon` order during a trade. |

    ## Example:
    >>> calculate_Dx_carbon(Decimal('100'), Decimal('1000000'), Decimal('10'), Decimal('100'), Decimal('50000'))
    Decimal('-9.950166250832398238242961982E-6')
    """
    Dx = - Dy*y_int**TWO/(S*Dy*(B*y_int + S*y) + (B*y_int + S*y)**TWO)
    return(Dx)

# $$
# \Delta{x} = - \frac{\Delta{y} y_{int}^{2}}{S \Delta{y} \left(B y_{int} + S y \right) + \left( B y_{int} + S y\right)^{2}}
# $$

def buy_RISK_arb_function_carbon(
    network_fee: Decimal,
    y_CASH: Decimal, 
    y_int_CASH: Decimal, 
    B_CASH: Decimal, 
    S_CASH: Decimal, 
    y_RISK: Decimal, 
    y_int_RISK: Decimal, 
    B_RISK: Decimal, 
    S_RISK: Decimal
    ) -> Tuple[Decimal, Decimal, Decimal, Decimal]:
    """
    ### Calculates the change in `RISK` and `CASH` when buying `RISK` on `carbon`, while equilibrating it to the market price.

    ## Parameters:
    | Parameter name | Type      | Description                                                                    |
    |:---------------|:----------|:-------------------------------------------------------------------------------|
    | `network_fee`  | `Decimal` | The fee for the trade, represented as a decimal (e.g. 0.05 for 5%).            |
    | `y_CASH`       | `Decimal` | The token balance of the `CASH` order.                                         |
    | `y_int_CASH`   | `Decimal` | The 'capacity' of the `CASH` order. Refer to the Carbon whitepaper.            |
    | `B_CASH`       | `Decimal` | The calculated `B` value for the `CASH` order.                                 |
    | `S_CASH`       | `Decimal` | The calculated `S` value for the `CASH` order. Refer to the Carbon whitepaper. |
    | `y_RISK`       | `Decimal` | The token balance of the `RISK` order.                                         |
    | `y_int_RISK`   | `Decimal` | The 'capacity' of the `RISK` order. Refer to the Carbon whitepaper.            |
    | `B_RISK`       | `Decimal` | The calculated `B` value for the `RISK` order.                                 |
    | `S_RISK`       | `Decimal` | The calculated `S` value for the `RISK` order. Refer to the Carbon whitepaper. |

    ## Returns:
    | Return name | Type                                        | Description                                                                             |
    |:------------|:--------------------------------------------|:----------------------------------------------------------------------------------------|
    | `y_RISK`    | `Decimal`                                   | The current token balance of the `RISK` order on `carbon`.                              |
    | `DRISK`     | `Decimal`                                   | The calculated decrease (-) in the `RISK` balance at equilibrium with the market price. |
    | `y_CASH`    | `Decimal`                                   | The current token balance of the `CASH` order on `carbon`.                              |
    | `DCASH`     | `Decimal`                                   | The calculated increase (+) in the `CASH` balance at equilibrium with the market price. |
    |             | `Tuple[Decimal, Decimal, Decimal, Decimal]` | A tuple of `y_RISK`, `DRISK`, `y_CASH`, and `DCASH`, in that order.                     |

    ## Dependencies:
    | Dependency name                   | Type       | Description                                                                                        |
    |:----------------------------------|:-----------|:---------------------------------------------------------------------------------------------------|
    | `MARKETPRICE`                     | `Decimal`  | A `global` variable representing the current market price of `RISK` in units of `CASH` per `RISK`. |
    | `calculate_Dx_carbon`             | `function` | Calculates `Dx` based on the given values of `Dy`, `y_int`, `S`, `B` and `y`.                      |

    ## Example:
    >>> buy_RISK_arb_function_carbon(Decimal('0.01'))
    (Decimal('0'), Decimal('0'), Decimal('100'), Decimal('0.1941955790921067'))

    ## Notes:
    - This function calculates the change in `RISK` and `CASH` balances for both orders on `carbon` when buying `RISK` and equilibrating it to the market price.
    - It returns the new incremental increase (+) in `CASH` and the new incremental decrease (-) in `RISK`.
    """
    global MARKETPRICE
    if S_RISK == ZERO:
        DRISK = - y_RISK
    else:
        DRISK = y_int_RISK*((MARKETPRICE*(ONE - network_fee))**(ONE/TWO) - B_RISK*MARKETPRICE*(ONE - network_fee))/(MARKETPRICE*S_RISK*(ONE - network_fee)) - y_RISK
    DCASH = calculate_Dx_carbon(DRISK, y_int_RISK, S_RISK, B_RISK, y_RISK)
    return(DRISK, DCASH)

# $$
# \Delta{y} = \frac{y_{int} \sqrt{P_{m} \left( 1 - \delta\right)} - B P_{m} \left(1 - \delta \right)}{P_{m} S \left( 1 - \delta \right)} - y
# $$

def sell_RISK_arb_function_carbon(
    network_fee: Decimal,
    y_CASH: Decimal, 
    y_int_CASH: Decimal, 
    B_CASH: Decimal, 
    S_CASH: Decimal, 
    y_RISK: Decimal, 
    y_int_RISK: Decimal, 
    B_RISK: Decimal, 
    S_RISK: Decimal
    ) -> Tuple[Decimal, Decimal, Decimal, Decimal]:
    """
    ### Calculates the change in `RISK` and `CASH` when selling `RISK` on Carbon, while equilibrating it to the market price.

    ## Parameters:
    | Parameter name | Type      | Description                                                                    |
    |:---------------|:----------|:-------------------------------------------------------------------------------|
    | `network_fee`  | `Decimal` | The fee for the trade, represented as a decimal (e.g. 0.05 for 5%).            |
    | `y_CASH`       | `Decimal` | The token balance of the `CASH` order.                                         |
    | `y_int_CASH`   | `Decimal` | The 'capacity' of the `CASH` order. Refer to the Carbon whitepaper.            |
    | `B_CASH`       | `Decimal` | The calculated `B` value for the `CASH` order.                                 |
    | `S_CASH`       | `Decimal` | The calculated `S` value for the `CASH` order. Refer to the Carbon whitepaper. |
    | `y_RISK`       | `Decimal` | The token balance of the `RISK` order.                                         |
    | `y_int_RISK`   | `Decimal` | The 'capacity' of the `RISK` order. Refer to the Carbon whitepaper.            |
    | `B_RISK`       | `Decimal` | The calculated `B` value for the `RISK` order.                                 |
    | `S_RISK`       | `Decimal` | The calculated `S` value for the `RISK` order. Refer to the Carbon whitepaper. |

    ## Returns:
    | Return name | Type                                        | Description                                                                             |
    |:------------|:--------------------------------------------|:----------------------------------------------------------------------------------------|
    | `y_RISK`    | `Decimal`                                   | The current token balance of the `RISK` order on `carbon`.                              |
    | `DRISK`     | `Decimal`                                   | The calculated increase (+) in the `RISK` balance at equilibrium with the market price. |
    | `y_CASH`    | `Decimal`                                   | The current token balance of the `CASH` order on `carbon`.                              |
    | `DCASH`     | `Decimal`                                   | The calculated decrease (-) in the `CASH` balance at equilibrium with the market price. |
    |             | `Tuple[Decimal, Decimal, Decimal, Decimal]` | A tuple of `y_RISK`, `DRISK`, `y_CASH`, and `DCASH`, in that order.                     |

    ## Dependencies:
    | Dependency name       | Type       | Description                                                                                        |
    |:----------------------|:-----------|:---------------------------------------------------------------------------------------------------|
    | `MARKETPRICE`         | `Decimal`  | A `global` variable representing the current market price of `RISK` in units of `CASH` per `RISK`. |
    | `calculate_Dx_carbon` | `function` | Calculates `Dx` based on the given values of `Dy`, `y_int`, `S`, `B` and `y`.                      |

    ## Example:
    >>> sell_RISK_arb_function_carbon(Decimal('0.01'))
    (Decimal('0'), Decimal('0'), Decimal('100'), Decimal('-0.1941955790921067'))

    ## Notes:
    - This function calculates the change in `RISK` and `CASH` balances for both orders on `carbon` when selling `RISK` and equilibrating it to the market price.
    - It returns the new incremental decrease (-) in `CASH` and the new incremental increase (+) in `RISK`.
    """
    global MARKETPRICE
    if S_CASH == ZERO:
        DCASH = - y_CASH
    else:
        DCASH = y_int_CASH*((MARKETPRICE*(ONE - network_fee))**(ONE/TWO) - B_CASH*(ONE - network_fee))/(S_CASH*(ONE - network_fee)) - y_CASH 
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
    ) -> Tuple[Decimal, Decimal]:
    """
    ### Calculates the maximum change in `RISK` and `CASH` when swapping on `carbon`.

    ## Parameters:
    | Parameter name | Type      | Description                                                                    |
    |:---------------|:----------|:-------------------------------------------------------------------------------|
    | `direction`    | `str`     | The direction of the swap, either 'buy RISK' or 'sell RISK'.                   |
    | `network_fee`  | `Decimal` | The fee for the trade, represented as a decimal (e.g. 0.05 for 5%).            |
    | `y_CASH`       | `Decimal` | The token balance of the `CASH` order.                                         |
    | `y_int_CASH`   | `Decimal` | The 'capacity' of the `CASH` order. Refer to the Carbon whitepaper.            |
    | `B_CASH`       | `Decimal` | The calculated `B` value for the `CASH` order.                                 |
    | `S_CASH`       | `Decimal` | The calculated `S` value for the `CASH` order. Refer to the Carbon whitepaper. |
    | `y_RISK`       | `Decimal` | The token balance of the `RISK` order.                                         |
    | `y_int_RISK`   | `Decimal` | The 'capacity' of the `RISK` order. Refer to the Carbon whitepaper.            |
    | `B_RISK`       | `Decimal` | The calculated `B` value for the `RISK` order.                                 |
    | `S_RISK`       | `Decimal` | The calculated `S` value for the `RISK` order. Refer to the Carbon whitepaper. |

    ## Returns:
    | Return name | Type                      | Description                                                   |
    |:------------|:--------------------------|:--------------------------------------------------------------|
    | `DRISK`     | `Decimal`                 | The change in `RISK` balance of `carbon` during the swap.     |
    | `DCASH`     | `Decimal`                 | The change in `CASH` balance of `carbon` during the swap.     |
    |             | `Tuple[Decimal, Decimal]` | A tuple of `DRISK` and `DCASH`, in that order.                |

    ## Dependencies:
    | Dependency name       | Type       | Description                                                                   |
    |:----------------------|:-----------|:------------------------------------------------------------------------------|
    | `calculate_Dx_carbon` | `function` | Calculates `Dx` based on the given values of `Dy`, `y_int`, `S`, `B` and `y`. |

    ## Example:
    >>> get_maximum_swap_carbon('buy')
    (Decimal('-30.000000000000000000'), Decimal('0.1160375360278100513294074324'))
    """
    if direction == 'buy':
        DRISK = - y_RISK
        DCASH = calculate_Dx_carbon(DRISK, y_int_RISK, S_RISK, B_RISK, y_RISK)
    elif direction == 'sell':
        DCASH = - y_CASH
        DRISK = calculate_Dx_carbon(DCASH, y_int_CASH, S_CASH, B_CASH, y_CASH)
    return(DRISK, DCASH)

def update_y_int_values_carbon(
    ) -> Tuple[bool, str, Decimal, Decimal]:
    """
    ### Updates the y-intercepts of the orders on `carbon`.

    ## Parameters:
    None

    ## Returns:
    | Return name           | Type                           | Description                                                                                       |
    |:----------------------|:-------------------------------|:--------------------------------------------------------------------------------------------------|
    | `y_int_updated_order` | `str`                          | The name of the Carbon order, either 'CASH order' or 'RISK order', for which `y_int` was updated. |
    | `old_y_int`           | `Decimal`                      | The previous y-intercept of the associated `carbon` order, before the update was applied.         |
    | `new_y_int`           | `Decimal`                      | The new y-intercept of the associated `carbon` order, after the update was applied.               |
    | `y_int_update`        | `Tuple[str, Decimal, Decimal]` | A tuple of `y_int_updated`, `order`, `old_y_int`, and `new_y_int`, in that order.                 |

    ## Example:
    >>> update_y_int_values_carbon()
    ('RISK order', Decimal('100'), Decimal('103'))
    """
    y_int_update = (None, None, None)
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
    """
    ### Updates the `RISK` and `CASH` balances on the `carbon` protocol.

    ## Parameters:
    | Parameter name | Type      | Description                    |
    |:---------------|:----------|:-------------------------------|
    | `y_RISK`       | `Decimal` | The current `RISK` balance.    |
    | `y_CASH`       | `Decimal` | The current `CASH` balance.    |
    | `DRISK`        | `Decimal` | The change in `RISK` balance.  |
    | `DCASH`        | `Decimal` | The change in `CASH` balance.  |

    ## Returns:
    None
    """
    carbon['simulation recorder']['RISK balance'].append(y_RISK + DRISK) 
    carbon['simulation recorder']['CASH balance'].append(y_CASH + DCASH) 
    return(None)

def get_carbon_protocol_fees_state(
    ) -> Tuple[Decimal, Decimal]:
    """
    ### Returns the current protocol fees of `CASH` and `RISK` on the Carbon exchange.
    
    ## Parameters:
    None

    ## Returns:
    | Return name | Type                      | Description                                               |
    |:------------|:--------------------------|:----------------------------------------------------------|
    | `CASH_fees` | `Decimal`                 | The current `CASH` fees balance of the `carbon` protocol. |
    | `RISK_fees` | `Decimal`                 | The current `RISK` fees balance of the `carbon` protocol. |
    |             | `Tuple[Decimal, Decimal]` | A tuple of `CASH_fees` and `RISK_fees`, in that order.    |

    ## Example:
    >>> get_carbon_protocol_fees_state()
    (Decimal('24.233639562729101114'), Decimal('35.184874914166108391'))
    """
    CASH_fees = carbon['simulation recorder']['CASH fees'][-1]
    RISK_fees = carbon['simulation recorder']['RISK fees'][-1]
    return(CASH_fees, RISK_fees)

def process_carbon_network_fee(
    direction: str, 
    DCASH: Decimal, 
    DRISK: Decimal, 
    network_fee: Decimal
    ) -> Tuple[Decimal, Decimal, str, str]:
    """
    ### Processes the network fee for the `carbon` protocol and increments `Dy` to account for the fee when reporting the trade amounts to the logger.

    ## Parameters:
    | Parameter name | Type      | Description                                                             |
    |:---------------|:----------|:------------------------------------------------------------------------|
    | `direction`    | `str`     | The direction of the swap, either 'buy RISK' or 'sell RISK'.            |
    | `DCASH`        | `Decimal` | The change in CASH balance of Carbon during the swap.                   |
    | `DRISK`        | `Decimal` | The change in RISK balance of Carbon during the swap.                   |
    | `network_fee`  | `Decimal` | The fee for the trade, represented as a decimal (e.g. 0.05 for 5%).     |

    ## Returns:
    | Return name | Type                                | Description                                                          |
    |:------------|:------------------------------------|:---------------------------------------------------------------------|
    | `Dx`        | `Decimal`                           | The new incremental increase (+) in `RISK` or `CASH`.                |
    | `Dy`        | `Decimal`                           | The new incremental decrease (-) in `RISK` or `CASH`.                |
    | `x_id`      | `str`                               | The string `"CASH"` or `"RISK"`, as appropriate for assigning `Dx`.  |
    | `y_id`      | `str`                               | The string `"CASH"` or `"RISK"`, as appropriate for assigning `Dy`.  |
    |             | `Tuple[Decimal, Decimal, str, str]` | A tuple of `Dx`, `Dy`, `x_id`, and `y_id`, in that order.            |

    ## Dependencies:
    | Dependency name                  | Type       | Description                                                                    |
    |:---------------------------------|:-----------|:-------------------------------------------------------------------------------|
    | `get_carbon_protocol_fees_state` | `function` | Returns the current protocol fees of `CASH` and `RISK` on the Carbon protocol. |

    """
    CASH_fees, RISK_fees = get_carbon_protocol_fees_state()
    if direction == 'buy':
        carbon['simulation recorder']['RISK fees'].append(RISK_fees - DRISK*network_fee)
        carbon['simulation recorder']['CASH fees'].append(CASH_fees)
        risk_amount = -DRISK*(ONE - network_fee)
        cash_amount = DCASH
        trade_action = 'bought'
    elif direction == 'sell':
        carbon['simulation recorder']['RISK fees'].append(RISK_fees)
        carbon['simulation recorder']['CASH fees'].append(CASH_fees - DCASH*network_fee)
        risk_amount = DRISK
        cash_amount = -DCASH*(ONE - network_fee)
        trade_action = 'sold'
    return risk_amount, cash_amount, trade_action

carbon_arb_functions = {
    'buy' : buy_RISK_arb_function_carbon,
    'sell' : sell_RISK_arb_function_carbon
}

def perform_carbon_arbitrage(
    b_or_a: str, 
    direction: str,
    ) -> Tuple[Decimal, Decimal]:
    """
    ### Performs arbitrage on the `carbon` protocol based on the market price and current state of the orders.

    ## Parameters:
    | Parameter Name  | Type     | Description                                                       |
    |:----------------|:---------|:------------------------------------------------------------------|
    | `direction`     | `str`    | The direction of the trade, either `'buy RISK'` or `'sell RISK'`. |

    ## Returns:
    | Return Name  | Type                      | Description                                                   |
    |:-------------|:--------------------------|:--------------------------------------------------------------|
    | `final_ask`  | `Decimal`                 | The final asking price for the `carbon` protocol.             |
    | `final_bid`  | `Decimal`                 | The final bid price for the `carbon` protocol.                |
    |              | `Tuple[Decimal, Decimal]` | A tuple of `final_ask` and `final_bid` (in that order).       |

    ## Dependencies:
    | Dependency name                             | Type       | Description                                                                                                           |
    |:--------------------------------------------|:-----------|:----------------------------------------------------------------------------------------------------------------------|
    | `MARKETPRICE`                               | `Decimal`  | A `global` variable representing the current market price of `RISK` in units of `CASH` per `RISK`.                    |
    | `get_carbon_strategy_states`                | `function` | Returns the parameters of the carbon curve for both `CASH` and `RISK` orders.                                         | 
    | `carbon_arb_functions`                      | `dict`     | A `global` dictionary containing the `direction` as keys, and the appropriate `carbon` arbitrage functions as values. |
    | `get_carbon_network_fee`                    | `function` | Returns the current network fee for `carbon`.                                                                         |
    | `get_maximum_swap_carbon`                   | `function` | Calculates the maximum change in `RISK` and `CASH` when swapping on `carbon`.                                         |
    | `check_concentrated_liquidity_range_bounds` | `function` | Checks if a trade is within the bounds of the `carbon` curve.                                                         |
    | `process_carbon_network_fee`                | `function` | Processes the network fee for `carbon` and increments `Dy` to account for the fee.                                    |
    | `apply_trades_on_carbon`                    | `function` | Updates the `RISK` and `CASH` balances on the `carbon` protocol.                                                      |
    | `update_y_int_values_carbon`                | `function` | Updates the y-intercepts of the orders on `carbon`.                                                                   |
    | `get_carbon_quote`                          | `function` | Gets the current bid and asking prices for `carbon`.                                                                  |

    ## Notes:
    - This function retrieves the current state of the `carbon` protocol using `get_carbon_network_fee`.
    - The maximum change in `RISK` and `CASH` for swapping on `carbon` is calculated using `get_maximum_swap_carbon`.
    - If the maximum swap is not within the range of the `carbon` curve, `DRISK` and `DCASH` are set to 0 and no trades are performed.
    - If the maximum swap is within the range of the `carbon` curve, `process_carbon_network_fee` is used to process the network fee and `Dx` and `Dy` are calculated.
    - `apply_trades_on_carbon` is used to update the `RISK` and `CASH` balances on the `carbon` protocol.
    - The y-intercepts of the orders on `carbon` are updated using `update_y_int_values_carbon`.
    - The current market price for `carbon` is obtained using `get_carbon_quote`, and the quote is logged.
    - Other appropriate annotations are added to the logger.
    """
    global MARKETPRICE
    y_CASH, y_int_CASH, B_CASH, S_CASH, y_RISK, y_int_RISK, B_RISK, S_RISK, network_fee = get_carbon_strategy_states()
    updates_occurred, y_int_updated_order = True, None
    if direction:
        arb_function = carbon_arb_functions[direction]
        DRISK, DCASH = arb_function(network_fee, y_CASH, y_int_CASH, B_CASH, S_CASH, y_RISK, y_int_RISK, B_RISK, S_RISK)
        in_range = check_concentrated_liquidity_range_bounds(y_CASH, y_RISK, DCASH, DRISK, 'carbon')
        if in_range:
            logger.info(f'There is enough liquidity to equilibrate carbon to the market price.')
        else:
            logger.info(f'The market equilibrium point is outside of the carbon range.')
            DRISK, DCASH = get_maximum_swap_carbon(direction, y_CASH, y_int_CASH, B_CASH, S_CASH, y_RISK, y_int_RISK, B_RISK, S_RISK)
            if DRISK == 0 and DCASH == 0:
                logger.info('Since the market price remains outside of the carbon range, no trade was performed.')
                final_ask, final_bid, min_bid, max_ask = get_carbon_quote(b_or_a, log_bid_and_ask = False)
        risk_amount, cash_amount, trade_action = process_carbon_network_fee(direction, DCASH, DRISK, network_fee)
        apply_trades_on_carbon(y_RISK, y_CASH, DRISK, DCASH)
        logger.info(f'A total of {risk_amount:.6f} {TOKEN_PAIR["RISK"]} was {trade_action} for a total of {cash_amount:.6f} {TOKEN_PAIR["CASH"]}.')        
        y_int_updated_order, old_y_int, new_y_int = update_y_int_values_carbon()
        if y_int_updated_order != None: 
            pass # logger.info(f'The y-intercept on the {y_int_updated_order} order was moved from {old_y_int:.6f} to {new_y_int:.6f}.') # last remaining diff
        logger.info('')
        final_ask, final_bid, min_bid, max_ask = get_carbon_quote(b_or_a, log_bid_and_ask = True)
    else:
        updates_occurred = False
        logger.info('Since carbon is at equilibrium with the market, no trade was performed.')
        final_ask, final_bid, min_bid, max_ask = get_carbon_quote(b_or_a, log_bid_and_ask = False)
    carbon_housekeeping(updates_occurred, y_int_updated_order)
    return(final_ask, final_bid, min_bid, max_ask)

# # Uniswap v2 & v3 Housekeeping Function

def copy_rows_uniswap(
    protocol: str
    ) -> None:
    """
    ### Copies the CASH and RISK balances, and CASH and RISK fees rows for the current step of the simulation.
    
    ## Parameters:
    | Parameter Name  | Type     | Description                          |
    |:----------------|:---------|:-------------------------------------|
    | `protocol`      | `str`    | Either `uniswap_v2` or `uniswap_v3`. |

    ## Returns:
    None

    ## Dependencies:
    | Dependency Name | Type   | Description                                                 |
    |:----------------|:-------|:------------------------------------------------------------|
    | `PROTOCOLS`     | `dict` | A global dictionary with each protocol name string as keys. |

    ## Notes:
    - Called when no trades are made, to preserve the shape of the `simulation recorder`.
    """
    global PROTOCOLS
    uniswap = PROTOCOLS[protocol]
    uniswap['simulation recorder']['RISK balance'].append(uniswap['simulation recorder']['RISK balance'][-1])
    uniswap['simulation recorder']['CASH balance'].append(uniswap['simulation recorder']['CASH balance'][-1])
    uniswap['simulation recorder']['RISK fees'].append(uniswap['simulation recorder']['RISK fees'][-1])
    uniswap['simulation recorder']['CASH fees'].append(uniswap['simulation recorder']['CASH fees'][-1])
    return(None)

# # Uniswap v3 Arbitrage Functions

def get_uniswap_v3_quote(
    log_bid_and_ask: bool = True
    ) -> Tuple[Decimal, Decimal]:
    """
    ### Returns the marginal price quotes for buying and selling `RISK` on the `uniswap_v3` protocol in units of `RISK` per `CASH`.

    ## Parameters:
    None

    ## Returns:
    | Return name       | Type      | Description                                                                                 |
    |:------------------|:----------|:--------------------------------------------------------------------------------------------|
    | `current_ask`     | `Decimal` | The fee-adjusted marginal price of `RISK` in units of `CASH` per `RISK` when buying `RISK`. |
    | `current_bid`     | `Decimal` | The fee-adjusted marginal price of `RISK` in units of `CASH` per `RISK` when selling `RISK`.|

    ## Example:
    >>> get_uniswap_v3_quote()
    (Decimal('0.000001'), Decimal('1000000.000000'))

    ## Dependencies:
    | Dependency Name                           | Type       | Description                                                  |
    |:------------------------------------------|:-----------|:-------------------------------------------------------------|
    | `get_uniswap_v3_state`                    | `function` | Returns the current state of the `uniswap_v3` protocol.      |
    | `measure_current_bid_uniswap_v3`          | `function` | Calculates the current sell price of `RISK` on `uniswap v3`. |
    | `measure_current_current_ask_uniswap_v3`  | `function` | Calculates the current buy price of `RISK` on `uniswap v3`.  |
    | `record_quotes_to_logger`                 | `function` | Records the quotes to the logger.                            |
    """
    CASH, RISK, CASH_0, RISK_0, n, fee = get_uniswap_v3_state()
    current_bid = measure_current_bid_uniswap_v3(CASH, CASH_0, RISK_0, n, fee)
    current_ask = measure_current_ask_uniswap_v3(CASH, CASH_0, RISK_0, n, fee)
    min_bid = measure_min_bid_uniswap_v3(CASH_0, RISK_0, n, fee)
    max_ask = measure_max_ask_uniswap_v3(CASH_0, RISK_0, n, fee)
    if log_bid_and_ask:
        record_quotes_to_logger('Uniswap V3', CASH, RISK, current_bid, current_ask)
    return(current_ask, current_bid, min_bid, max_ask)

def buy_RISK_arb_function_uniswap_v3(
    CASH: Decimal, 
    RISK: Decimal, 
    CASH_0: Decimal, 
    RISK_0: Decimal, 
    n: Decimal, 
    fee: Decimal
    ) -> Tuple[Decimal, Decimal]:
    """
    ### Calculates the change in `RISK` and `CASH` when buying RISK on `uniswap_v3`, while equilibrating it to the market price.

    ## Parameters:
    | Parameter name | Type     | Description                                                                                               |
    |:---------------|:---------|:----------------------------------------------------------------------------------------------------------|
    | `CASH`         | `Decimal`| The current `CASH` balance of `uniswap_v3`.                                                               |
    | `RISK`         | `Decimal`| The current `RISK` balance of `uniswap_v3`.                                                               |
    | `CASH_0`       | `Decimal`| Curve parameter `x_0`, refer to the Carbon whitepaper.                                                    |
    | `RISK_0`       | `Decimal`| Curve parameter `y_0`, refer to the Carbon whitepaper.                                                    |
    | `n`            | `Decimal`| Curve parameter; `n = 1 - sqrt(sqrt(P_b/P_a)); n = 1 - (P_b/P_a)**(1/4)`, refer to the Carbon whitepaper. |
    | `fee`          | `Decimal`| The fee for the trade, represented as a decimal (e.g. 0.05 for 5%).                                       |

    ## Returns:
    | Return name | Type     | Description                                                                          |
    |:------------|:---------|:-------------------------------------------------------------------------------------|
    | `DRISK`     | `Decimal`| The change in `RISK` balance of `uniswap_v3` during the swap (i.e. the swap amount). |
    | `DCASH`     | `Decimal`| The change in `CASH` balance of `uniswap_v3` during the swap (i.e. the swap amount). |
    |             | `tuple`  | A tuple of `DRISK`, `DCASH` (in that order).                                         |

    ## Example:
    >>> buy_RISK_arb_function_uniswap_v3(Decimal('1.2'), Decimal('2.1'), Decimal('1.4'), Decimal('2.3'), Decimal('0.3'), Decimal('0.03'))
    (Decimal('-1.553210787934847109547387482E-19'), Decimal('0.1957846046208282789702741311'))

    ## Notes:
    - This function calculates the change in `RISK` and `CASH` balances for `uniswap_v3` when buying `RISK` and equilibrating it to the market price.
    - It returns the new incremental increase (+) in `CASH` and the new incremental decrease (-) in `RISK`.
    """
    DCASH = ((MARKETPRICE*RISK_0*CASH_0*(ONE - fee))**(ONE/TWO) - CASH_0 + n*(CASH_0 - CASH))/n
    DRISK = - (DCASH*(n*RISK + RISK_0*(ONE - n))**TWO/(n*DCASH*(n*RISK + RISK_0*(ONE - n)) + CASH_0*RISK_0))
    return(DRISK, DCASH)

# $$
# \Delta{y} = \frac{\sqrt{P_{m} x_{0} y_{0} \left( 1 - \delta \right)} - y_{0} + n \left(y_{0} - y \right)}{n}\\[10pt]
# \Delta{x} = - \frac{\Delta{y} \left( n x + x_{0} \left( 1 - n \right) \right)^{2}}{n \Delta{y} \left( n x + x_{0} \left( 1 - n\right)\right) + x_{0} y_{0}}
# $$

def sell_RISK_arb_function_uniswap_v3(
    CASH: Decimal, 
    RISK: Decimal, 
    CASH_0: Decimal, 
    RISK_0: Decimal, 
    n: Decimal, 
    fee: Decimal
    ) -> Tuple[Decimal, Decimal]:
    """
    ### Calculates the change in `RISK` and `CASH` when selling `RISK` on `uniswap_v3` while equilibrating it to the market price.

    ## Parameters:
    | Parameter names | Type     | Description                                                                                               |
    |:----------------|:---------|:----------------------------------------------------------------------------------------------------------|
    | `CASH`          | `Decimal`| The current CASH balance of `uniswap_v3`.                                                                 |
    | `RISK`          | `Decimal`| The current RISK balance of `uniswap_v3`.                                                                 |
    | `CASH_0`        | `Decimal`| Curve parameter `x_0`. Refer to the Carbon whitepaper.                                                    |
    | `RISK_0`        | `Decimal`| Curve parameter `y_0`. Refer to the Carbon whitepaper.                                                    |
    | `n`             | `Decimal`| Curve parameter; `n = 1 - sqrt(sqrt(P_b/P_a)); n = 1 - (P_b/P_a)**(1/4)`. Refer to the Carbon whitepaper. |
    | `fee`           | `Decimal`| The fee for the trade, represented as a decimal (e.g. 0.05 for 5%).                                       |

    ## Returns:
    | Return name | Type                       | Description                                                                           |
    |:------------|:---------------------------|:--------------------------------------------------------------------------------------|
    | `DRISK`     | `Decimal`                  | The change in `RISK` balance of `uniswap_v3` during the swap (i.e., the swap amount). |
    | `DCASH`     | `Decimal`                  | The change in `CASH` balance of `uniswap_v3` during the swap (i.e., the swap amount). |
    |             | `Tuple[Decimal, Decimal]`  | A tuple of `DRISK`, `DCASH` (in that order).                                          |
    
    ## Dependencies
    | Dependency name   | Type       | Description                                                                                         |
    |:------------------|:-----------|:----------------------------------------------------------------------------------------------------|
    | `MARKETPRICE`     | `Decimal`  | A `global` variable representing the current market price of `RISK` in units of `CASH` per `RISK`.  |

    ## Notes:
    - This function calculates the change in `RISK` and `CASH` balances for `uniswap_v3` when selling `RISK` and equilibrating it to the market price.
    - It returns the new incremental decrease (-) in `CASH` and the new incremental increase (+) in `RISK`.
    """
    global MARKETPRICE
    DRISK = ((MARKETPRICE*RISK_0*CASH_0*(ONE - fee))**(ONE/TWO) - MARKETPRICE*(RISK_0 + n*(RISK - RISK_0)))/(MARKETPRICE*n)
    DCASH = - (DRISK*(n*CASH + CASH_0*(ONE - n))**TWO/(n*DRISK*(n*CASH + CASH_0*(ONE - n)) + RISK_0*CASH_0))
    return(DRISK, DCASH)

def get_maximum_swap_uniswap_v3(
    direction: str, 
    CASH: Decimal, 
    RISK: Decimal, 
    CASH_0: Decimal, 
    RISK_0: Decimal, 
    n: Decimal
    ) -> Tuple[Decimal, Decimal]:
    """
    ### Calculates the maximum change in `RISK` and `CASH` when swapping on `uniswap_v3`.

    ## Parameters:
    | Parameter names | Type      | Description                                                                                               |
    |:----------------|:----------|:----------------------------------------------------------------------------------------------------------|
    | `direction`     | `str`     | The direction of the swap, either 'buy RISK' or 'sell RISK'.                                              |
    | `CASH`          | `Decimal` | The current CASH balance of `uniswap_v3`.                                                                 |
    | `RISK`          | `Decimal` | The current RISK balance of `uniswap_v3`.                                                                 |
    | `CASH_0`        | `Decimal` | Curve parameter `x_0`. Refer to the Carbon whitepaper.                                                    |
    | `RISK_0`        | `Decimal` | Curve parameter `y_0`. Refer to the Carbon whitepaper.                                                    |
    | `n`             | `Decimal` | Curve parameter; `n = 1 - sqrt(sqrt(P_b/P_a)); n = 1 - (P_b/P_a)**(1/4)`. Refer to the Carbon whitepaper. |

    ## Returns:
    | Return name | Type      | Description                                                           |
    |:------------|:----------|:----------------------------------------------------------------------|
    | `DRISK`     | `Decimal` | The maximum change in `RISK` balance of `uniswap_v3` during the swap. |
    | `DCASH`     | `Decimal` | The maximum change in `CASH` balance of `uniswap_v3` during the swap. |
    |             | `tuple`   | A tuple of `DRISK`, `DCASH` (in that order).                          |

    ## Notes:
    - This function calculates the maximum change in `RISK` and `CASH` balances for `uniswap_v3` when swapping in a given direction.
    - It returns the maximum possible change in `RISK` and `CASH` balances during the swap, given the current pool state and the direction of the swap.
    """
    if direction == 'buy':
        DRISK = - uniswap_v3['simulation recorder']['RISK balance'][-1]
        DCASH = - DRISK*CASH_0*RISK_0/((n*(RISK - RISK_0) + RISK_0)*(n*(DRISK + RISK - RISK_0) + RISK_0))
    elif direction == 'sell':
        DCASH = - uniswap_v3['simulation recorder']['CASH balance'][-1]
        DRISK = - DCASH*RISK_0*CASH_0/((n*(CASH - CASH_0) + CASH_0)*(n*(DCASH + CASH - CASH_0) + CASH_0))
    return(DRISK, DCASH)

def get_univ3_fees_state(
    ) -> Tuple[Decimal, Decimal]:
    """
    ### Retrieves the current fees for `CASH` and `RISK` on `uniswap_v3`.
    
    ## Parameters:
    None

    ## Returns:
    | Return name | Type     | Description                                         |
    |:------------|:---------|:----------------------------------------------------|
    | `CASH_fees` | `Decimal`| The `uniswap_v3` fees balance of `CASH`.            |
    | `RISK_fees` | `Decimal`| The `uniswap_v3` fees balance of `RISK`.            |
    |             | `tuple`  | A tuple of `CASH_fees`, `RISK_fees` (in that order).|

    """
    CASH_fees = uniswap_v3['simulation recorder']['CASH fees'][-1]
    RISK_fees = uniswap_v3['simulation recorder']['RISK fees'][-1]
    return(CASH_fees, RISK_fees)

def process_uniswap_v3_fee(
    direction: str, 
    DCASH: Decimal, 
    DRISK: Decimal, 
    fee: Decimal
    ) -> Tuple[Decimal, Decimal, str, str]:
    """
    ### Processes the fee for a swap on `uniswap_v3` and updates the fees for `CASH` and `RISK`.

    ## Parameters:
    | Parameter names | Type     | Description                                                         |
    |:----------------|:---------|:--------------------------------------------------------------------|
    | `direction`     | `str`    | The direction of the swap, either 'buy RISK' or 'sell RISK'.        |
    | `DCASH`         | `Decimal`| The change in `CASH` for the swap.                                  |
    | `DRISK`         | `Decimal`| The change in `RISK` for the swap.                                  |
    | `fee`           | `Decimal`| The fee for the trade, represented as a decimal (e.g. 0.05 for 5%). |

    ## Returns:
    | Return name | Type     | Description                                                          |
    |:------------|:---------|:---------------------------------------------------------------------|
    | `Dx`        | `Decimal`| The new incremental increase (+) in `RISK` or `CASH`.                |
    | `Dy`        | `Decimal`| The new incremental decrease (-) in `RISK` or `CASH`.                |
    | `x_id`      | `str`    | The string `CASH` or `RISK`, as appropriate for assigning `Dx`.      |
    | `y_id`      | `str`    | The string `CASH` or `RISK`, as appropriate for assigning `Dy`.      |
    |             | `tuple`  | A tuple of `Dx`, `Dy`, `x_id`, `y_id` (in that order).               |

    ## Notes:
    - This function processes the fee for a swap on `uniswap_v3` and updates the fees for `CASH` and `RISK`.
    - It returns the new incremental increase in `RISK` or `CASH`, the new incremental decrease in `RISK` or `CASH`, and two string indicators for the asset.
    """
    CASH_fees, RISK_fees = get_univ3_fees_state()
    if direction == 'buy':
        uniswap_v3['simulation recorder']['RISK fees'].append(RISK_fees - DRISK*fee)
        uniswap_v3['simulation recorder']['CASH fees'].append(CASH_fees)
        Dx = DCASH
        Dy = DRISK*(ONE - fee)
        x_id = 'CASH'
        y_id = 'RISK'
    elif direction == 'sell':
        uniswap_v3['simulation recorder']['RISK fees'].append(RISK_fees)
        uniswap_v3['simulation recorder']['CASH fees'].append(CASH_fees - DCASH*fee)
        Dx = DRISK
        Dy = DCASH*(ONE - fee)
        x_id = 'RISK'
        y_id = 'CASH'
    return(Dx, Dy, x_id, y_id)

def apply_trades_on_uniswap_v3(
    RISK: Decimal, 
    CASH: Decimal, 
    DRISK: Decimal, 
    DCASH: Decimal
    ) -> None:
    """
    ### Applies the trade changes to `uniswap_v3`.

    ## Parameters:
    | Parameter names | Type      | Description                                         |
    |:----------------|:----------|:----------------------------------------------------|
    | `RISK`          | `Decimal` | The current `RISK` balance of `uniswap_v3`.         |
    | `CASH`          | `Decimal` | The current `CASH` balance of `uniswap_v3`.         |
    | `DRISK`         | `Decimal` | The change in the `RISK` balance during the trade.  |
    | `DCASH`         | `Decimal` | The change in the `CASH` balance during the trade.  |

    ## Returns:
    None

    ## Notes:
    - This function updates the `uniswap_v3` state with the trade changes applied.
    """
    uniswap_v3['simulation recorder']['RISK balance'].append(RISK + DRISK)
    uniswap_v3['simulation recorder']['CASH balance'].append(CASH + DCASH)
    return(None)

univ3_arb_functions = {
    'buy' : buy_RISK_arb_function_uniswap_v3,
    'sell' : sell_RISK_arb_function_uniswap_v3
}

def perform_uniswap_v3_arbitrage(
    direction: str,
    ) -> None:
    """
    ### Performs arbitrage on the `uniswap_v3` protocol, based on the current market price and state of the protocol.

    ## Parameters:
    | Parameter Name  | Type      | Description                                                         |
    |:----------------|:----------|:--------------------------------------------------------------------|
    | `direction`     | `str`     | The direction of the trade, either `'buy RISK'` or `'sell RISK'`.   |

    ## Returns:
    | Return Name  | Type                      | Description                                                   |
    |:-------------|:--------------------------|:--------------------------------------------------------------|
    | `final_ask`  | `Decimal`                 | The final asking price for the `uniswap_v3` protocol.         |
    | `final_bid`  | `Decimal`                 | The final bid price for the `uniswap_v3` protocol.            |
    |              | `Tuple[Decimal, Decimal]` | A tuple of `final_ask` and `final_bid` (in that order).       |

    ## Dependencies:
    | Dependency name                             | Type       | Description                                                                                                                                                        |
    |:--------------------------------------------|:-----------|:-------------------------------------------------------------------------------------------------------------------------------------------------------------------|
    | `MARKETPRICE`                               | `Decimal`  | The global variable representing the current market price.                                                                                                         |
    | `get_uniswap_v3_state`                      | `function` | Returns the current state of the `uniswap_v3` protocol.                                                                                                            |
    | `univ3_arb_functions`                       | `dict`     | A dictionary of functions that calculate the amount of `CASH` and `RISK` to trade in one arbitrage iteration on `uniswap_v3`, based on the direction of the trade. |
    | `check_concentrated_liquidity_range_bounds` | `function` | Checks if a trade is within the bounds of the `uniswap_v3` curve.                                                                                                  |
    | `get_maximum_swap_uniswap_v3`               | `function` | Calculates the maximum change in `RISK` and `CASH` when swapping on `uniswap_v3`.                                                                                  |
    | `process_uniswap_v3_fee`                    | `function` | Processes the fee for a swap on `uniswap_v3` and updates the fees for `CASH` and `RISK`.                                                                           |
    | `apply_trades_on_uniswap_v3`                | `function` | Updates the `RISK` and `CASH` balances on `uniswap_v3` after a swap.                                                                                               |
    | `get_uniswap_v3_quote`                      | `function` | Returns the marginal price quotes for buying and selling `RISK` on the `uniswap_v3` protocol in units of `CASH` per `RISK`. The quotes are logged.                 |

    ## Notes:
    - This function retrieves the current state of the `uniswap_v3` protocol using `get_uniswap_v3_state`.
    - A trade is executed on `uniswap_v3` based on the direction of the trade using the functions in `univ3_arb_functions`.
    - If the trade is not within the bounds of the `uniswap_v3` curve, the maximum allowable trade is executed.
    - The fee for the swap is processed using `process_uniswap_v3_fee`, and the resulting values are appended to the `protocol fees` dictionary.
    - The `RISK` and `CASH` balances on `uniswap_v3` are updated using `apply_trades_on_uniswap_v3`.
    - The current market price for `uniswap_v3` is obtained using `get_uniswap_v3_quote`, and the quote is logged.
    - Other appropriate annotations are added to the logger.
    """
    global MARKETPRICE
    if direction:
        CASH, RISK, CASH_0, RISK_0, n, fee = get_uniswap_v3_state()
        DRISK, DCASH = univ3_arb_functions[direction](CASH, RISK, CASH_0, RISK_0, n, fee)
        in_range = check_concentrated_liquidity_range_bounds(CASH, RISK, DCASH, DRISK, 'uniswap v3')
        if in_range:
            logger.info(f'There is enough liquidity to equilibrate uniswap v3 to the market price.')
        else:
            logger.info(f'The market equilibrium point is outside of the uniswap v3 range.')
            DRISK, DCASH = get_maximum_swap_uniswap_v3(direction, CASH, RISK, CASH_0, RISK_0, n)
            if DRISK == 0 and DCASH == 0 and CASH > 0 and RISK > 0:
                logger.info('Since the market price remains outside of the uniswap v3 range, no trade was performed.')
                logger.info('')
                final_ask, final_bid, min_bid, max_ask = get_uniswap_v3_quote(log_bid_and_ask = False)
        Dx, Dy, x_id, y_id = process_uniswap_v3_fee(direction, DCASH, DRISK, fee)
        apply_trades_on_uniswap_v3(RISK, CASH, DRISK, DCASH)
        logger.info(f'A total of {Dx:.6f} {TOKEN_PAIR[x_id]} was sold for a total of {- Dy:.6f} {TOKEN_PAIR[y_id]}.')        
        logger.info('')
        final_ask, final_bid, min_bid, max_ask= get_uniswap_v3_quote(log_bid_and_ask = True)
    else:
        logger.info('Since uniswap v3 is at equilibrium with the market, no trade was performed.')
        logger.info('')
        final_ask, final_bid, min_bid, max_ask = get_uniswap_v3_quote(log_bid_and_ask = False)
        copy_rows_uniswap('uniswap_v3')
    return(final_ask, final_bid, min_bid, max_ask)

# # Uniswap v2 Arbitrage Functions

def get_uniswap_v2_quote(
    log_bid_and_ask: bool = True
    ) -> Tuple[Decimal, Decimal]:
    """
    ### Returns the marginal price quotes for buying and selling `RISK` on the `uniswap_v2` protocol in units of `CASH` per `RISK`.

    ## Parameters:
    None

    ## Returns:
    | Return name       | Type      | Description                                                                                 |
    |:------------------|:----------|:--------------------------------------------------------------------------------------------|
    | `current_ask`     | `Decimal` | The fee-adjusted marginal price of `RISK` in units of `CASH` per `RISK` when buying `RISK`. |
    | `current_bid`     | `Decimal` | The fee-adjusted marginal price of `RISK` in units of `CASH` per `RISK` when selling `RISK`.|

    ## Example:
    >>> get_uniswap_v2_quote()
    (Decimal('1000000.000000'), Decimal('0.000001'))

    ## Dependencies:
    | Dependency name                   | Type       | Description                                                 |
    |:----------------------------------|:-----------|:------------------------------------------------------------|
    | `get_uniswap_v2_state`            | `function` | Returns the current state of the `uniswap_v2` protocol.     |
    | `measure_current_bid_uniswap_v2`  | `function` | Calculates the current sell price of `RISK` on `uniswap_v2`.|
    | `measure_current_ask_uniswap_v2`  | `function` | Calculates the current buy price of `RISK` on `uniswap_v2`. |
    | `record_quotes_to_logger`         | `function` | Records the quotes to the logger.                           |
    """
    CASH, RISK, fee = get_uniswap_v2_state()
    current_bid = measure_current_bid_uniswap_v2(CASH, RISK, fee)
    current_ask = measure_current_ask_uniswap_v2(CASH, RISK, fee)
    min_bid = measure_pseudo_min_bid_uniswap_v2(current_bid)
    max_ask = measure_pseudo_max_ask_uniswap_v2(current_bid)
    if log_bid_and_ask:
        record_quotes_to_logger('Uniswap V2', CASH, RISK, current_bid, current_ask)
    return(current_ask, current_bid, min_bid, max_ask)

def buy_RISK_arb_function_uniswap_v2(
    x: Decimal, 
    total_Dx: Decimal, 
    y: Decimal, 
    total_Dy: Decimal, 
    fee: Decimal
    ) -> Tuple[Decimal, Decimal]:
    """
    ### Calculates the change in `RISK` and `CASH` when buying `RISK` on `uniswap_v2`, while equilibrating it to the market price.

    ## Parameters:
    | Parameter name | Type      | Description                                                         |
    |:---------------|:----------|:--------------------------------------------------------------------|
    | `x`            | `Decimal` | The current `CASH` balance of `uniswap_v2`.                         |
    | `total_Dx`     | `Decimal` | The cumulative increase (+) in `CASH` during repeated arbitrage.    |
    | `y`            | `Decimal` | The current `RISK` balance of `uniswap_v2`.                         |
    | `total_Dy`     | `Decimal` | The cumulative decrease (-) in `RISK` during repeated arbitrage.    |
    | `fee`          | `Decimal` | The fee for the trade, represented as a decimal (e.g. 0.05 for 5%). |

    ## Returns:
    | Return name | Type      | Description                                  |
    |:------------|:----------|:---------------------------------------------|
    | `Dx`        | `Decimal` | The new incremental increase (+) in `CASH`.  |
    | `Dy`        | `Decimal` | The new incremental decrease (-) in `RISK`.  |
    |             | `tuple`   | A tuple of `Dx`, `Dy` (in that order).       |

    ## Example:
    >>> buy_RISK_arb_function_uniswap_v2(Decimal('1.2'), Decimal('2.3'), Decimal('2.1'), Decimal('3.4'), Decimal('0.03'))
    (Decimal('0.001717246215886879147434324919'), Decimal('-0.003451320046427037136214752265'))
    
    ## Notes:
    - This function calculates the change in `RISK` and `CASH` balances for `uniswap_v2` when buying `RISK` and equilibrating it to the market price.
    - It returns the new incremental increase (+) in `CASH` and the new incremental decrease (-) in `RISK`.
    """
    global MARKETPRICE
    x = x + total_Dx
    y = y + total_Dy
    Dx = (MARKETPRICE*x*y*(ONE - fee))**(ONE/TWO) - x
    Dy = - Dx*y*(ONE - fee)/(x + Dx)
    return(Dx, Dy)

# $$
# \Delta{x} = \sqrt{P_{m} x y \left(1 - \delta \right)} - x \\[10pt]
# \Delta{y} = - \frac{\Delta{x} y \left( 1 - \delta\right)}{x + \Delta{x}}
# $$

def sell_RISK_arb_function_uniswap_v2(
    x: Decimal, 
    total_Dx: Decimal, 
    y: Decimal, 
    total_Dy: Decimal, 
    fee: Decimal
    ) -> Tuple[Decimal, Decimal]:
    """
    ### Calculates the change in `RISK` and `CASH` when selling `RISK` on `uniswap_v2`, while equilibrating it to the market price.

    ## Parameters:
    | Parameter name | Type      | Description                                                         |
    |:---------------|:----------|:--------------------------------------------------------------------|
    | `x`            | `Decimal` | The current `CASH` balance of `uniswap_v2`.                         |
    | `total_Dx`     | `Decimal` | The cumulative increase (+) in `RISK` during repeated arbitrage.    |
    | `y`            | `Decimal` | The current `RISK` balance of `uniswap_v2`.                         |
    | `total_Dy`     | `Decimal` | The cumulative decrease (-) in `CASH` during repeated arbitrage.    |
    | `fee`          | `Decimal` | The fee for the trade, represented as a decimal (e.g. 0.05 for 5%). |

    ## Returns:
    | Return name | Type      | Description                                  |
    |:------------|:----------|:---------------------------------------------|
    | `Dx`        | `Decimal` | The new incremental increase (+) in `RISK`.  |
    | `Dy`        | `Decimal` | The new incremental decrease (-) in `CASH`.  |
    |             | `tuple`   | A tuple of `Dx`, `Dy` (in that order).       |
    
    ## Dependencies:
    | Dependency name    | Type       | Description                                                                                        |
    |:-------------------|:-----------|:---------------------------------------------------------------------------------------------------|
    | `MARKETPRICE`      | `Decimal`  | A `global` variable representing the current market price of `RISK` in units of `CASH` per `RISK`. |

    ## Example:
    >>> sell_RISK_arb_function_uniswap_v2(Decimal('1.2'), Decimal('2.3'), Decimal('2.1'), Decimal('3.4'), Decimal('0.03'))
    (Decimal('-0.001197275870782025267206396596'), Decimal('0.002399829052938190856748053824'))
    
    ## Notes:
    - This function calculates the change in `RISK` and `CASH` balances for `uniswap_v2` when selling `RISK` and equilibrating it to the market price.
    - It returns the new incremental increase (+) in `RISK` and the new incremental decrease (-) in `CASH`.
    """
    global MARKETPRICE
    x += total_Dx
    y += total_Dy
    Dx = ((MARKETPRICE*x*y*(ONE - fee))**(ONE/TWO) - MARKETPRICE*x)/MARKETPRICE
    Dy = -Dx*y*(ONE - fee)/(x + Dx)
    return(Dx, Dy)

# $$
# \Delta{x} = \frac{\sqrt{P_{m} x y \left(1 - \delta \right)} - P_{m} x}{P_{m}} \\[10pt]
# \Delta{y} = - \frac{\Delta{x} y \left( 1 - \delta\right)}{x + \Delta{x}}
# $$

univ2_arb_functions = {
    'buy' : buy_RISK_arb_function_uniswap_v2,
    'sell' : sell_RISK_arb_function_uniswap_v2
}

def process_direction(
    direction: str, 
    CASH: Decimal, 
    RISK: Decimal
    ) -> Tuple[Decimal, Decimal, str, str]:
    """
    ### Assigns the `CASH` and `RISK` balances to either `x` or `y`, based on the `direction`.

    ## Parameters:
    | Parameter name | Type     | Description                                                              |
    |:---------------|:---------|:-------------------------------------------------------------------------|
    | `direction`    | `str`    | The direction of the swap, either 'buy RISK' or 'sell RISK'.             |
    | `CASH`         | `Decimal`| The current `CASH` balance of `uniswap_v2`.                              |
    | `RISK`         | `Decimal`| The current `RISK` balance of `uniswap_v2`.                              |

    ## Returns:
    | Return name | Type      | Description                                                                         |
    |:------------|:----------|:------------------------------------------------------------------------------------|
    | `x`         | `Decimal` | The current balance of `CASH` or `RISK` on `uniswap_v2`, based on the `direction`.  |
    | `y`         | `Decimal` | The current balance of `CASH` or `RISK` on `uniswap_v2`, based on the `direction`.  |
    | `x_id`      | `str`     | The string "CASH" or "RISK", as appropriate for assigning `x`.                      |
    | `y_id`      | `str`     | The string "CASH" or "RISK", as appropriate for assigning `y`.                      |
    |             | `tuple`   | A tuple of `x`, `y`, `x_id` and `y_id` (in that order).                             |
    """
    if direction == 'buy':
        x = CASH
        x_id = 'CASH'
        y = RISK
        y_id = 'RISK'
    elif direction == 'sell':
        x = RISK
        x_id = 'RISK'
        y = CASH
        y_id = 'CASH'
    return(x, y, x_id, y_id)

def apply_trades_on_uniswap_v2(
    x: Decimal, 
    total_Dx: Decimal, 
    y: Decimal, 
    total_Dy: Decimal, 
    x_id: str, 
    y_id: str
    ) -> None:
    """
    ### Updates the `uniswap_v2` state after simulating repeated arbitrage and equilibration to the current market rate.

    ## Parameters:
    | Parameter names | Type      | Description                                                   |
    |:----------------|:----------|:--------------------------------------------------------------|
    | `x`             | `Decimal` | The current amount of `x` balance on `uniswap_v2`.            |
    | `total_Dx`      | `Decimal` | The cumulative increase (+) in `x` during repeated arbitrage. |
    | `y`             | `Decimal` | The current `y` balance of `uniswap_v2`.                      |
    | `total_Dy`      | `Decimal` | The cumulative decrease (-) in `y` during repeated arbitrage. |
    | `x_id`          | `str`     | The string "CASH" or "RISK", as appropriate for assigning `x`.|
    | `y_id`          | `str`     | The string "CASH" or "RISK", as appropriate for assigning `y`.|

    ## Returns:
    None
    """
    uniswap_v2['simulation recorder'][f'{x_id} balance'].append(x + total_Dx)
    uniswap_v2['simulation recorder'][f'{y_id} balance'].append(y + total_Dy)
    return(None)

def calculate_RISK_fee_growth_uniswap_v2(
    CASH: Decimal, 
    RISK: Decimal, 
    CASH_0: Decimal, 
    RISK_0: Decimal
    ) -> Tuple[Decimal, Decimal]:
    """
    ### Calculates the fee growth for `CASH` and `RISK` on `uniswap_v2`.

    ## Parameters:
    | Parameter name | Type      | Description                   |
    |:---------------|:----------|:------------------------------|
    | `CASH`         | `Decimal` | The current `CASH` balance.   |
    | `RISK`         | `Decimal` | The current `RISK` balance.   |
    | `CASH_0`       | `Decimal` | The initial `CASH` balance.   |
    | `RISK_0`       | `Decimal` | The initial `RISK` balance.   |

    ## Returns:
    | Return name       | Type     | Description                                          |
    |:------------------|:---------|:-----------------------------------------------------|
    | `fee_growth_CASH` | `Decimal`| The fee growth in `CASH`.                            |
    | `fee_growth_RISK` | `Decimal`| The fee growth in `RISK`.                            |
    |                   | `tuple`  | A tuple of `fee_growth_CASH` and `fee_growth_RISK`.  |

    """
    fee_growth_CASH = CASH*((RISK*CASH)**(ONE/TWO) - (RISK_0*CASH_0)**(ONE/TWO))/(RISK*CASH)**(ONE/TWO)
    fee_growth_RISK = RISK*((RISK*CASH)**(ONE/TWO) - (RISK_0*CASH_0)**(ONE/TWO))/(RISK*CASH)**(ONE/TWO) 
    return(fee_growth_CASH, fee_growth_RISK)

# $$
# y^{\delta} = \frac{y \left(\sqrt{xy} - \sqrt{x_{0} y_{0}}\right)}{\sqrt{x y}} \\[10pt]
# x^{\delta} = \frac{x \left(\sqrt{xy} - \sqrt{x_{0} y_{0}}\right)}{\sqrt{x y}} \\[10pt]
# $$

def process_uniswap_v2_fee() -> None:
    """
    ### Processes the fee growth for `uniswap_v2`.

    ## Parameters:
    None

    ## Returns:
    None

    ## Dependencies:
    | Dependency name                         | Type       | Description                                                    |
    |:----------------------------------------|:-----------|:---------------------------------------------------------------|
    | `calculate_RISK_fee_growth_uniswap_v2`  | `function` | Calculates the `CASH` and `RISK` fee growths for `uniswap_v2`. |

    ## Notes:
    - This function retrieves the current and initial `RISK` and `CASH` balances from `uniswap_v2`, and then calls the `calculate_RISK_fee_growth_uniswap_v2` function to calculate the fee growth.
    - The resulting `CASH` and `RISK` fee growth values are appended to the `protocol fees` dictionary.
    """
    RISK = uniswap_v2['simulation recorder']['RISK balance'][-1]
    CASH = uniswap_v2['simulation recorder']['CASH balance'][-1]
    RISK_initial = uniswap_v2['simulation recorder']['RISK balance'][0]
    CASH_initial = uniswap_v2['simulation recorder']['CASH balance'][0]
    fee_growth_CASH, fee_growth_RISK = calculate_RISK_fee_growth_uniswap_v2(CASH, RISK, CASH_initial, RISK_initial)
    uniswap_v2['simulation recorder']['CASH fees'].append(fee_growth_CASH)
    uniswap_v2['simulation recorder']['RISK fees'].append(fee_growth_RISK)
    return(None)

def perform_uniswap_v2_arbitrage_series(
    direction: str,
    ) -> None:
    """
    ### Performs a series of arbitrage trades on the `uniswap_v2` protocol, based on the input `direction`.

    ## Parameters:
    | Parameter Name  | Type      | Description                                                       |
    |:----------------|:----------|:------------------------------------------------------------------|
    | `direction`     | `str`     | The direction of the trade, either `'buy RISK'` or `'sell RISK'`. |
    | `initial_ask`   | `Decimal` | The initial asking price for the `uniswap_v2` protocol.           |
    | `initial_bid`   | `Decimal` | The initial bid price for the `uniswap_v2` protocol.              |

    ## Returns:
    | Return Name  | Type                      | Description                                                   |
    |:-------------|:--------------------------|:--------------------------------------------------------------|
    | `final_ask`  | `Decimal`                 | The final asking price for the `uniswap_v2` protocol.         |
    | `final_bid`  | `Decimal`                 | The final bid price for the `uniswap_v2` protocol.            |
    |              | `Tuple[Decimal, Decimal]` | A tuple of `final_ask` and `final_bid` (in that order).       |

    ## Dependencies:
    | Dependency name                | Type       | Description                                                                                                                                                                 |
    |:-------------------------------|:-----------|:----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
    | `MARKETPRICE`                  | `Decimal`  | The `global` variable representing the current market price of `RISK` in units of `CASH` per `RISK`.                                                                        |
    | `UNISWAP_V2_ARB_ITERATIONS`    | `int`      | The `global` variable representing the number of iterations for arbitrage trades on the `uniswap_v2` protocol.                                                              |
    | `get_uniswap_v2_state`         | `function` | Returns the current state of the `uniswap_v2` protocol.                                                                                                                     |
    | `process_direction`            | `function` | Assigns the current `CASH` and `RISK` balances to either `x` or `y`, based on the direction of the trade.                                                                   |
    | `univ2_arb_functions`          | `dict`     | A `global` dictionary of functions that calculate the amount of `CASH` and `RISK` to trade in one arbitrage iteration on `uniswap_v2`, based on the direction of the trade. |
    | `apply_trades_on_uniswap_v2`   | `function` | Updates the `uniswap_v2` state with the new `CASH` and `RISK` balances after an arbitrage trade.                                                                            |
    | `process_uniswap_v2_fee`       | `function` | Processes the fee growth for `uniswap_v2`. The resulting `CASH` and `RISK` fee growth values are appended to the `protocol fees` dictionary.                                |
    | `get_uniswap_v2_quote`         | `function` | Returns the marginal price quotes for buying and selling `RISK` on the `uniswap_v2` protocol in units of `CASH` per `RISK`. The quotes are logged.                          |


    ## Notes:
    - This function retrieves the current state of the `uniswap_v2` protocol using `get_uniswap_v2_state`.
    - It assigns the current `CASH` and `RISK` balances to either `x` or `y` using `process_direction`, based on the direction of the trade.
    - A series of arbitrage trades is then performed using the `univ2_arb_functions` dictionary.
    - After the trades are complete, the `uniswap_v2` state is updated using `apply_trades_on_uniswap_v2`.
    - The fee growth for `uniswap_v2` is processed using `process_uniswap_v2_fee`, and the resulting values are appended to the `protocol fees` dictionary.
    - The current market price for `uniswap_v2` is obtained using `get_uniswap_v2_quote`, and the quote is logged.
    - Other appropriate annotations are added to the logger.
    """
    global MARKETPRICE
    global UNISWAP_V2_ARB_ITERATIONS
    total_Dx = 0
    total_Dy = 0
    if direction:
        CASH, RISK, fee = get_uniswap_v2_state()
        x, y, x_id, y_id = process_direction(direction, CASH, RISK)
        remaining_iterations = UNISWAP_V2_ARB_ITERATIONS
        while remaining_iterations > 0:
            Dx, Dy = univ2_arb_functions[direction](x, total_Dx, y, total_Dy, fee)
            total_Dx += Dx
            total_Dy += Dy
            remaining_iterations -= 1
        apply_trades_on_uniswap_v2(x, total_Dx, y, total_Dy, x_id, y_id)
        process_uniswap_v2_fee()
        logger.info(f'After {UNISWAP_V2_ARB_ITERATIONS} iterations, a total of {total_Dx:.6f} {TOKEN_PAIR[x_id]} was sold for a total of {-total_Dy:.6f} {TOKEN_PAIR[y_id]}.')
        logger.info('')
        final_ask, final_bid, min_bid, max_ask = get_uniswap_v2_quote(log_bid_and_ask = True)
    else:
        logger.info('Since uniswap v2 is at equilibrium with the market, no trade was performed.')
        logger.info('')
        final_ask, final_bid, min_bid, max_ask = get_uniswap_v2_quote(log_bid_and_ask = False)
        copy_rows_uniswap('uniswap_v2')
    return(final_ask, final_bid, min_bid, max_ask)

protocol_quote_and_arbitrage_functions = {
    'carbon' : (get_carbon_quote, perform_carbon_arbitrage),
    'uniswap_v3' : (get_uniswap_v3_quote, perform_uniswap_v3_arbitrage),
    'uniswap_v2' : (get_uniswap_v2_quote, perform_uniswap_v2_arbitrage_series)
}

def equilibrate_protocol(
    protocol: str
    ) -> None:
    """
    ### Analyzes the market conditions of the specified protocol and performs arbitrage if necessary.

    ## Parameters:
    | Parameter name | Type   | Description                                                           |
    |:---------------|:-------|:----------------------------------------------------------------------|
    | `protocol`     | `str`  | The protocol to analyze and perform arbitrage on, e.g., `'carbon'`.   |

    ## Returns:
    | Return Name  | Type                      | Description                                                   |
    |:-------------|:--------------------------|:--------------------------------------------------------------|
    | `final_ask`  | `Decimal`                 | The final asking price for the `uniswap_v2` protocol.         |
    | `final_bid`  | `Decimal`                 | The final bid price for the `uniswap_v2` protocol.            |
    |              | `Tuple[Decimal, Decimal]` | A tuple of `final_ask` and `final_bid` (in that order).       |

    ## Dependencies:
    | Dependency name                          | Type       | Description                                                                                                                             |
    |:-----------------------------------------|:-----------|:----------------------------------------------------------------------------------------------------------------------------------------|
    | `protocol_quote_and_arbitrage_functions` | `dict`     | A `global` dictionary containing the names of each protocol as keys, and the appropriate price quote and arbitrage functions as values. |
    | `get_arb_direction`                      | `function` | Returns the direction of the arbitrage based on the current bid and asking prices for `RISK`, and the current `MARKETPRICE`.            |

    ## Notes:
    - This function analyzes the market conditions of the specified protocol using the corresponding `get_<protocol>_quote` function.
    - It determines the direction of the arbitrage, either `'buy RISK'` or `'sell RISK'`, using the `get_arb_direction` function based on the marginal price quotes returned by the quote function.
    - It then performs arbitrage on the specified protocol using the corresponding `perform_<protocol>_arbitrage` function.
    - If the market conditions are already in equilibrium with the protocol, no arbitrage trades are performed.
    - The appropriate annotations are added to the logger.
    """
    #logger.info('---------------------------------')
    #logger.info(f'Analysing {protocol.replace("_", " ").title()}...')
    #logger.info('')
    quote_function, arbitrage_function = protocol_quote_and_arbitrage_functions[protocol]
    current_ask, current_bid, min_bid, max_ask = quote_function('before')
    direction = get_arb_direction(current_ask, current_bid, protocol)
    final_ask, final_bid, min_bid, max_ask = arbitrage_function('after', direction)
    #logger.info(f'Completed analysis of {protocol.replace("_", " ").title()}!')
    #logger.info('---------------------------------')
    logger.info('')
    return(final_ask, final_bid, min_bid, max_ask)

# # Carbon Depth Functions

def measure_bid_depth_at_price_carbon(
    bid_price_array: np.ndarray, 
    y_CASH: Decimal, 
    y_int_CASH: Decimal, 
    B_CASH: Decimal, 
    S_CASH: Decimal, 
    network_fee: Decimal,
    ) -> np.ndarray:
    """
    ### Calculates the liquidity depth for selling `RISK` on the `CASH` order on `carbon` (units of `CASH` equivalents).

    ## Parameters:
    | Parameter Name           | Type         | Description                                                                    |
    |:-------------------------|:-------------|:-------------------------------------------------------------------------------|
    | `bid_price_array`        | `np.ndarray` | An array of 100 evenly spaced sell prices between `min_bid` and `current_bid`. |
    | `y_CASH`                 | `Decimal`    | The balance of the `CASH` carbon order.                                        |
    | `y_int_CASH`             | `Decimal`    | The 'capacity' of the `CASH` Carbon order.                                     |
    | `B_CASH`                 | `Decimal`    | The curve parameter `sqrt(P_b)` of the `CASH` order on `carbon`.               |
    | `S_CASH`                 | `Decimal`    | The curve parameter `sqrt(P_a) - sqrt(P_b)` of the `CASH` order on `carbon`.   |
    | `network_fee`            | `Decimal`    | The fee for the trade, represented as a decimal (e.g. 0.05 for 5%).            |

    ## Returns:
    | Return Name         | Return Type  | Description                                                                                                             |
    |:--------------------|:-------------|:------------------------------------------------------------------------------------------------------------------------|
    | `bid_depth_array`   | `np.ndarray` | An array of the total depth, measured in units of `CASH`, up to an including the prices listed in `bid_price_array`.    |
    
    ## Notes
    - All input parameters are converted to `float` to allow for use with numpy's `linspace` function. 
    """
    y_CASH, y_int_CASH, B_CASH, S_CASH, network_fee = [float(arg) for arg in (y_CASH, y_int_CASH, B_CASH, S_CASH, network_fee)]
    if S_CASH == 0:
        (bid_depth_array := np.full_like(bid_price_array, fill_value = y_CASH, dtype = np.float64))[0] = 0
    else:
        bid_depth_array = (S_CASH*y_CASH*(1 - network_fee) - y_int_CASH*(np.sqrt(bid_price_array*(1 - network_fee)) - B_CASH*(1 - network_fee)))/(S_CASH*(1 - network_fee))
    return(bid_depth_array)

def measure_ask_depth_at_price_carbon(
    ask_price_array: np.ndarray, 
    y_RISK: Decimal, 
    y_int_RISK: Decimal, 
    B_RISK: Decimal, 
    S_RISK: Decimal, 
    network_fee: Decimal,
    RISK_price: Decimal
    ) -> np.ndarray:
    """
    ### Calculates the liquidity depth for buying `RISK` on the `RISK` order on `carbon` (units of `CASH` equivalents).

    ## Parameters:
    | Parameter name     | Type         | Description                                                                                                   |
    |:-------------------|:-------------|:--------------------------------------------------------------------------------------------------------------|
    | `ask_price_array`  | `np.ndarray` | An array of 100 evenly spaced buy prices between `current_ask` and `max_ask`.                                 |
    | `y_RISK`           | `Decimal`    | The token balance of the `RISK` order on `carbon`.                                                            |
    | `y_int_RISK`       | `Decimal`    | The 'capacity' of the `RISK` order on `carbon`. Refer to the Carbon whitepaper.                               |
    | `B_RISK`           | `Decimal`    | The curve parameter `sqrt(P_b)` of the `RISK` order on `carbon`. Refer to the Carbon whitepaper.              |
    | `S_RISK`           | `Decimal`    | The curve parameter `sqrt(P_a) - sqrt(P_b)` of the `RISK` order on `carbon`. Refer to the Carbon whitepaper.  |
    | `network_fee`      | `Decimal`    | The fee for the trade, represented as a decimal (e.g. 0.05 for 5%).                                           |

    ## Returns:
    | Return name       | Return Type  | Description                                                                                                           |
    |:------------------|:-------------|:----------------------------------------------------------------------------------------------------------------------|
    | `ask_depth_array` | `np.ndarray` | An array of the total depth, measured in units of `CASH`, up to and including the prices listed in `ask_price_array`. |

    ## Notes:
    - All input parameters are converted to `float` to allow for use with numpy's `linspace` function.
    """
    y_RISK, y_int_RISK, B_RISK, S_RISK, network_fee, RISK_price = [float(arg) for arg in (y_RISK, y_int_RISK, B_RISK, S_RISK, network_fee, RISK_price)]
    if S_RISK == 0:
        (ask_depth_array := np.full_like(ask_price_array, fill_value = RISK_price*y_RISK, dtype = np.float64))[0] = 0
    else:
        ask_depth_array = RISK_price*(ask_price_array*S_RISK*y_RISK*(1 - network_fee) - y_int_RISK*(np.sqrt(ask_price_array*(1 - network_fee)) - B_RISK*ask_price_array*(1 - network_fee)))/(ask_price_array*S_RISK*(1 - network_fee))
    return(ask_depth_array)

def get_carbon_depth_arrays(
    bid_price_array: np.ndarray, 
    ask_price_array: np.ndarray,
    RISK_price: Decimal,
    step: int
    ) -> Tuple[np.ndarray,np.ndarray]:
    """
    ### Calculates the liquidity depths for buying and selling `RISK` on the carbon `RISK`, and `CASH` orders, respectively (units of `CASH` equivalents).

    ## Parameters:
    | Parameter Name      | Type         | Description                                                                    |
    |:--------------------|:-------------|:-------------------------------------------------------------------------------|
    | `bid_price_array`   | `np.ndarray` | An array of 100 evenly spaced sell prices between `min_bid` and `current_bid`. |
    | `ask_price_array`   | `np.ndarray` | An array of 100 evenly spaced buy prices between `current_ask` and `max_ask`.  |

    ## Returns:
    | Return Name       | Return Type                     | Description                                                                                                          |
    |:------------------|:--------------------------------|:---------------------------------------------------------------------------------------------------------------------|
    | `bid_depth_array` | `np.ndarray`                    | An array of the total depth, measured in units of `CASH`, up to an including the prices listed in `bid_price_array`. |
    | `ask_depth_array` | `np.ndarray`                    | An array of the total depth, measured in units of `CASH`, up to an including the prices listed in `ask_price_array`. |
    |                   | `Tuple[np.ndarray, np.ndarray]` | A tuple of `bid_price_array` and `ask_price_array` (in that order).                                                  |

    ## Dependencies:
    | Dependency Name                     | Type       | Description                                                                                                                                                        |
    |:------------------------------------|:-----------|:-------------------------------------------------------------------------------------------------------------------------------------------------------------------|
    | `get_carbon_network_fee`            | `function` | Returns the network fee for trading on the `carbon` protocol.                                                                                                      |
    | `get_carbon_strategy_states`        | `function` | Returns a tuple containing strategy information for the `carbon` order book, including token balances, order capacities, and curve parameters.                     |
    | `measure_bid_depth_at_price_carbon` | `function` | Calculates the liquidity depth for selling `RISK` on the `CASH` `carbon` order (units of `CASH` equivalents). Used to generate the `bid_depth_array` output.       |
    | `measure_ask_depth_at_price_carbon` | `function` | Calculates the liquidity depth for buying `RISK` on the `RISK` `carbon` order (units of `CASH` equivalents). Used to generate the `ask_depth_array` output.        |

    ## Notes:
    - This function calculates the liquidity depths for buying and selling `RISK` on the carbon `RISK`, and `CASH` orders, respectively, in units of `CASH` equivalents.
    - The `get_carbon_network_fee` function is called to obtain the network fee for the `carbon` protocol.
    - The `get_carbon_strategy_states` function is called with the argument `'all'` to obtain the necessary strategy information for both the `CASH` and `RISK` orders.
    - The `measure_bid_depth_at_price_carbon` function is called to calculate the `bid_depth_array`, which is an array of the total depth, measured in units of `CASH`, up to and including the prices listed in the `bid_price_array`.
    - The `measure_ask_depth_at_price_carbon` function is called to calculate the `ask_depth_array`, which is an array of the total depth, measured in units of `CASH`, up to and including the prices listed in the `ask_price_array`.
    - The resulting `bid_depth_array` and `ask_depth_array` are returned as a tuple along with the `bid_price_array` and `ask_price_array`, respectively.
    """
    y_CASH, y_int_CASH, B_CASH, S_CASH, y_RISK, y_int_RISK, B_RISK, S_RISK, network_fee = get_carbon_strategy_states(step)
    bid_depth_array = measure_bid_depth_at_price_carbon(bid_price_array, y_CASH, y_int_CASH, B_CASH, S_CASH, network_fee)
    ask_depth_array = measure_ask_depth_at_price_carbon(ask_price_array, y_RISK, y_int_RISK, B_RISK, S_RISK, network_fee, RISK_price)
    return(bid_depth_array, ask_depth_array)

# # Uniswap v3 Depth Functions

def measure_bid_depth_at_price_uniswap_v3(
    bid_price_array: np.ndarray, 
    CASH: Decimal, 
    CASH_0: Decimal, 
    RISK_0: Decimal, 
    n: Decimal, 
    fee: Decimal
    ) -> np.ndarray:
    """
    ### Calculates the liquidity depth for selling `RISK` on `uniswap_v3` (units of `CASH` equivalents).

    Parameters:
    | Parameter Name          | Type         | Description                                                                                                    |
    |:------------------------|:-------------|:---------------------------------------------------------------------------------------------------------------|
    | `bid_price_array`       | `np.ndarray` | An array of 100 evenly spaced sell prices between `min_bid` and `current_bid`.                                 |
    | `CASH`                  | `Decimal`    | The current `CASH` balance of `uniswap_v3`.                                                                    |
    | `CASH_0`                | `Decimal`    | Curve parameter `x_0`. Refer to the Carbon whitepaper.                                                         |
    | `RISK_0`                | `Decimal`    | Curve parameter `y_0`. Refer to the Carbon whitepaper.                                                         |
    | `n`                     | `Decimal`    | Curve parameter `n = 1 - sqrt(sqrt(P_b/P_a))`; `n = 1 - (P_b/P_a)**(1/4)`. Refer to the Carbon whitepaper.     |
    | `fee`                   | `Decimal`    | The fee for the trade, represented as a decimal (e.g. 0.05 for 5%).                                            |

    Returns:
    | Return Name       | Return Type  | Description                                                                                                           |
    |:------------------|:-------------|:----------------------------------------------------------------------------------------------------------------------|
    | `bid_depth_array` | `np.ndarray` | An array of the total depth, measured in units of `CASH`, up to an including the prices listed in `bid_price_array`.  |
    
    Notes:
    - All input parameters are converted to `float` to allow for use with numpy's `linspace` function. 
    """
    CASH, CASH_0, RISK_0, n, fee = [float(arg) for arg in (CASH, CASH_0, RISK_0, n, fee)]
    bid_depth_array = ((CASH_0 + n*(CASH - CASH_0))*(1 - fee) - np.sqrt(bid_price_array*RISK_0*CASH_0*(1 - fee)))/(n*(1 - fee))
    return(bid_depth_array)

def measure_ask_depth_at_price_uniswap_v3(
    ask_price_array: np.ndarray, 
    RISK: Decimal, 
    CASH_0: Decimal, 
    RISK_0: Decimal, 
    n: Decimal, 
    fee: Decimal,
    RISK_price: Decimal
    ) -> np.ndarray:
    """
    ### Calculates the liquidity depth for buying `RISK` on `uniswap_v3` (units of `CASH` equivalents).

    ## Parameters:
    | Parameter Name    | Type         | Description                                                                                                   |
    |:------------------|:-------------|:--------------------------------------------------------------------------------------------------------------|
    | `ask_price_array` | `np.ndarray` | An array of 100 evenly spaced buy prices between `current_buy_price` and `max_buy_price`.                     |
    | `RISK`            | `Decimal`    | The current `RISK` balance of `uniswap_v3`.                                                                   |
    | `CASH_0`          | `Decimal`    | Curve parameter `x_0`. Refer to the Carbon whitepaper.                                                        |
    | `RISK_0`          | `Decimal`    | Curve parameter `y_0`. Refer to the Carbon whitepaper.                                                        |
    | `n`               | `Decimal`    | Curve parameter `n = 1 - sqrt(sqrt(P_b/P_a))`; `n = 1 - (P_b/P_a)**(1/4)`. Refer to the Carbon whitepaper.    |
    | `fee`             | `Decimal`    | The fee for the trade, represented as a decimal (e.g. 0.05 for 5%).                                           |

    ## Returns:
    | Return Name        | Return Type  | Description                                                                                                            |
    |:-------------------|:-------------|:-----------------------------------------------------------------------------------------------------------------------|
    | `ask_depth_array`  | `np.ndarray` | An array of the total depth, measured in units of `CASH`, up to and including the prices listed in `ask_price_array`.  |
    
    ## Dependencies:
    | Dependency name  | Type       | Description                                                                                        |
    |:-----------------|:-----------|:---------------------------------------------------------------------------------------------------|
    | `MARKETPRICE`    | `Decimal`  | A `global` variable representing the current market price of `RISK` in units of `CASH` per `RISK`. |
    
    ## Notes:
    - All input parameters are converted to `float` to allow for use with numpy's `linspace` function. 
    """
    marketprice = float(RISK_price)
    RISK, CASH_0, RISK_0, n, fee = [float(arg) for arg in (RISK, CASH_0, RISK_0, n, fee)]
    ask_depth_array = marketprice*(np.sqrt(ask_price_array*RISK_0*CASH_0*(1 - fee))*(RISK_0 + n*(RISK - RISK_0)) - RISK_0*CASH_0)/(np.sqrt(ask_price_array*RISK_0*CASH_0*(1 - fee))*n)
    return(ask_depth_array)

def get_uniswap_v3_depth_arrays(
    bid_price_array: np.ndarray, 
    ask_price_array: np.ndarray,
    RISK_price: Decimal,
    step: int
    ) -> Tuple[np.ndarray, np.ndarray]:
    """
    ### Calculates the liquidity depths for buying and selling `RISK` on the carbon `RISK`, and `CASH` orders, respectively (units of `CASH` equivalents).
    
    ## Parameters:
    | Parameter               | Type         | Description                                                                    |
    |:------------------------|:-------------|:-------------------------------------------------------------------------------|
    | `bid_price_array`       | `np.ndarray` | An array of 100 evenly spaced sell prices between `min_bid` and `current_bid`. |
    | `ask_price_array`       | `np.ndarray` | An array of 100 evenly spaced buy prices between `current_ask` and `max_ask`.  |

    ## Returns:
    | Return Name        | Return Type                     | Description                                                                                                           |
    |:-------------------|:--------------------------------|:----------------------------------------------------------------------------------------------------------------------|
    | `bid_depth_array`  | `np.ndarray`                    | An array of the total depth, measured in units of `CASH`, up to an including the prices listed in `bid_price_array`.  |
    | `ask_depth_array`  | `np.ndarray`                    | An array of the total depth, measured in units of `CASH`, up to an including the prices listed in `ask_price_array`.  |
    |                    | `Tuple[np.ndarray, np.ndarray]` | Tuple of `bid_price_array` and `ask_price_array` (in that order).                                                     |

    ## Dependencies:
    | Dependency Name                         | Type       | Description                                                                                                    |
    |:----------------------------------------|:-----------|:---------------------------------------------------------------------------------------------------------------|
    | `get_uniswap_v3_state`                  | `function` | Returns `uniswap_v3` pool state, including reserves and fee.                                                   |
    | `measure_bid_depth_at_price_uniswap_v3` | `function` | Calculates the total depth of `RISK` available for sale at specified prices on the `uniswap_v3` protocol.      |
    | `measure_ask_depth_at_price_uniswap_v3` | `function` | Calculates the total depth of `RISK` available for purchase at specified prices on the `uniswap_v3` protocol.  |

    ## Notes:
    - This function calculates liquidity depths for buying and selling `RISK` on the `uniswap_v3` protocol.
    - It calls the `get_uniswap_v3_state` function to obtain the current state of the `uniswap_v3` protocol.
    - It then calls the `measure_bid_depth_at_price_uniswap_v3` function to calculate the total depth of `RISK` available for sale at the specified prices.
    - It also calls the `measure_ask_depth_at_price_uniswap_v3` function to calculate the total depth of `RISK` available for purchase at the specified prices.
    - The sell and buy `RISK` depth arrays are returned as a tuple.
    """
    CASH, RISK, CASH_0, RISK_0, n, fee = get_uniswap_v3_state(step)
    bid_depth_array = measure_bid_depth_at_price_uniswap_v3(bid_price_array, CASH, CASH_0, RISK_0, n, fee)
    ask_depth_array = measure_ask_depth_at_price_uniswap_v3(ask_price_array, RISK, CASH_0, RISK_0, n, fee, RISK_price)
    return(bid_depth_array, ask_depth_array)

# # Uniswap v2 Depth Functions

def measure_bid_depth_at_price_uniswap_v2(
    bid_price_array: np.ndarray, 
    CASH: Decimal, 
    RISK: Decimal, 
    fee: Decimal
    ) -> np.ndarray:
    """
    ### Calculates the liquidity depth for selling `RISK` on `uniswap_v2` (units of `CASH` equivalents).

    ## Parameters:
    | Parameter Name    | Parameter Type | Description                                                                       |
    |:------------------|:---------------|:----------------------------------------------------------------------------------|
    | `bid_price_array` | `np.ndarray`   | An array of 100 evenly spaced sell prices between `min_bid` and `current_bid`.    |
    | `CASH`            | `Decimal`      | The current `CASH` balance of `uniswap_v2`.                                       |
    | `RISK`            | `Decimal`      | The current `RISK` balance of `uniswap_v2`.                                       |
    | `fee`             | `Decimal`      | The fee for the trade, represented as a decimal (e.g. 0.05 for 5%).               |

    ## Returns:
    | Return Name       | Return Type  | Description                                                                                                                 |
    |:------------------|:-------------|:----------------------------------------------------------------------------------------------------------------------------|
    | `bid_depth_array` | `np.ndarray` | An array of the total depth, measured in units of `CASH`, up to and including the prices listed in `bid_price_array`.       |
    
    ## Note:
    - All input parameters are converted to `float` to allow for use with numpy's linspace function. 
    """
    CASH, RISK, fee = [float(arg) for arg in (CASH, RISK, fee)]
    bid_depth_array = (CASH * (1 - fee) - bid_price_array*RISK)/(1 - fee)
    return(bid_depth_array)

def measure_ask_depth_at_price_uniswap_v2(
    ask_price_array: np.ndarray, 
    CASH: Decimal, 
    RISK: Decimal, 
    fee: Decimal,
    RISK_price: Decimal
    ) -> np.ndarray:
    """
    ### Calculates the liquidity depth for buying `RISK` on `uniswap_v2` (units of `CASH` equivalents).

    ## Parameters:
    | Parameter Name     | Parameter Type | Description                                                                  |
    |:-------------------|:---------------|:-----------------------------------------------------------------------------|
    | `ask_price_array`  | `np.ndarray`   | An array of 100 evenly spaced buy prices between `current_ask` and `max_ask`.|
    | `CASH`             | `Decimal`      | The current `CASH` balance of `uniswap_v2`.                                  |
    | `RISK`             | `Decimal`      | The current `RISK` balance of `uniswap_v2`.                                  |
    | `fee`              | `Decimal`      | The fee for the trade, represented as a decimal (e.g. 0.05 for 5%).          |

    ## Returns:
    | Return Name        | Return Type  | Description                                                                                                             |
    |:-------------------|:-------------|:------------------------------------------------------------------------------------------------------------------------|
    | `ask_depth_array`  | `np.ndarray` | An array of the total depth, measured in units of `CASH`, up to and including the prices listed in `ask_price_array`.   |
    
    ## Dependencies:
    | Dependency name  | Type       | Description                                                                                         |
    |:-----------------|:-----------|:----------------------------------------------------------------------------------------------------|
    | `MARKETPRICE`    | `Decimal`  | A `global` variable representing the current market price of `RISK` in units of `CASH` per `RISK`.  |

    ## Notes:
    - All input parameters are converted to `float` to allow for use with numpy's linspace function. 
    """
    marketprice = float(RISK_price)
    CASH, RISK, fee = [float(arg) for arg in (CASH, RISK, fee)]
    ask_depth_array = marketprice*(ask_price_array*RISK*(1 - fee) - CASH)/(ask_price_array*(1 - fee))
    return(ask_depth_array)

def get_uniswap_v2_depth_arrays(
    bid_price_array: np.ndarray, 
    ask_price_array: np.ndarray,
    RISK_price: Decimal,
    step: int
    ) -> Tuple[np.ndarray, np.ndarray]:
    """
    ### Calculates the liquidity depths for buying and selling `RISK` on the `carbon RISK`, and `CASH` orders, respectively (units of `CASH` equivalents).
    
    ## Parameters:
    | Parameter         | Type         | Description                                                                    |
    |:------------------|:-------------|:-------------------------------------------------------------------------------|
    | `bid_price_array` | `np.ndarray` | An array of 100 evenly spaced sell prices between `min_bid` and `current_bid`. |
    | `ask_price_array` | `np.ndarray` | An array of 100 evenly spaced buy prices between `current_ask` and `max_ask`.  |

    ## Returns:
    | Return Name        | Return Type                     | Description                                                                                                            |
    |:-------------------|:--------------------------------|:-----------------------------------------------------------------------------------------------------------------------|
    | `bid_depth_array`  | `np.ndarray`                    | An array of the total depth, measured in units of `CASH`, up to an including the prices listed in `bid_price_array`.   |
    | `ask_depth_array`  | `np.ndarray`                    | An array of the total depth, measured in units of `CASH`, up to an including the prices listed in `ask_price_array`.   |
    |                    | `Tuple[np.ndarray, np.ndarray]` | Tuple of `bid_price_array` and `ask_price_array` (in that order).                                                      |

    ## Dependencies:
    | Dependency name                         | Type       | Description                                                                                                    |
    |:----------------------------------------|:-----------|:---------------------------------------------------------------------------------------------------------------|
    | `get_uniswap_v2_state`                  | `function` | Returns `uniswap_v2` pool state, including reserves and fee.                                                   |
    | `measure_bid_depth_at_price_uniswap_v2` | `function` | Calculates the total depth of `RISK` available for sale at specified prices on the `uniswap_v2` protocol.      |
    | `measure_ask_depth_at_price_uniswap_v2` | `function` | Calculates the total depth of `RISK` available for purchase at specified prices on the `uniswap_v2` protocol.  |

    ## Notes:
    - This function calculates liquidity depths for buying and selling `RISK` on the `uniswap_v2` protocol.
    - It calls the `get_uniswap_v2_state` function to obtain the current state of the `uniswap_v2` protocol.
    - It then calls the `measure_bid_depth_at_price_uniswap_v2` function to calculate the total depth of `RISK` available for sale at the specified prices.
    - It also calls the `measure_ask_depth_at_price_uniswap_v2` function to calculate the total depth of `RISK` available for purchase at the specified prices.
    - The sell and buy `RISK` depth arrays are returned as a tuple.
    """
    CASH, RISK, fee = get_uniswap_v2_state(step)
    bid_depth_array = measure_bid_depth_at_price_uniswap_v2(bid_price_array, CASH, RISK, fee)
    ask_depth_array = measure_ask_depth_at_price_uniswap_v2(ask_price_array, CASH, RISK, fee, RISK_price)
    return(bid_depth_array, ask_depth_array)

# # Plotting and Data Recording Functions

plot_titles = {
    'carbon' : 'Carbon: Asymmetric Concentrated Liquidity',
    'uniswap_v3' : 'Uniswap V3: Symmetric Concentrated Liquidity',
    'uniswap_v2' : 'Uniswap V2: Constant Product'
}

def add_watermark_to_fig(
    fig, 
    watermark_text: str = moai, 
    font_color: str = '#042f35ff', 
    font_properties: object = GT_America_Mono_Regular, 
    alpha: float = 1
    ) -> object:
    """
    ### Adds a watermark text to a `matplotlib` figure. 

    ## Parameters:
    | Parameter          | Type        | Description                                                                                  |
    |:-------------------|:------------|:---------------------------------------------------------------------------------------------|
    | `fig`              | `object`    | A `matplotlib` figure object.                                                                |
    | `watermark_text`   | `str`       | Text to be used as the watermark.                                                            |
    | `font_color`       | `str`       | The color of the text. The default value is `#161617ff`.                                     |
    | `font_properties`  | `object`    | The font properties to be used for the text. The default value is `GT_America_Mono_Regular`. |
    | `alpha`            | `float`     | The transparency of the watermark text. The default value is `1`.                            |

    ## Returns:
    | Return Type | Description                                                                       |
    |:------------|:----------------------------------------------------------------------------------|
    | `object`    | The original figure object with the added watermark text in the background layer. |

    ## Dependencies:
    | Dependency name | Type        | Description                   |
    |:----------------|:------------|:------------------------------|
    | `matplotlib`    | `module`    | A Python 2D plotting library. |

    ## Notes:
    - The watermark text is centered in the figure and its color and font can be customized.
    - The function adds the watermark to the background layer of the figure.
    """
    watermark_ax = fig.add_axes([0, 0, 1, 1], zorder = -1)
    watermark_ax.text(0.5, 
                      0.5, 
                      watermark_text, 
                      color = font_color, 
                      fontproperties = font_properties,
                      horizontalalignment = 'center', 
                      verticalalignment = 'center',
                      transform = watermark_ax.transAxes, 
                      alpha = alpha)
    watermark_ax.set_axis_off()
    return(fig)

def add_icon_to_fig(
    fig: plt.Figure, 
    icon_filename: str = "icon/icon.png", 
    icon_width: float = 0.025, 
    icon_offset: float = 0.025
    ) -> plt.Figure:
    """
    ### Adds an icon to a Matplotlib Figure object, maintaining equal distance between the icon's edges and the figure's edges.

    ## Parameters:
    | Parameter        | Type         | Description                                                                                                                 |
    |:-----------------|:-------------|:----------------------------------------------------------------------------------------------------------------------------|
    | `fig`            | `plt.Figure` | The figure object to which the icon will be added.                                                                          |
    | `icon_filename`  | `str`        | The path and filename of the icon image file.                                                                               |
    | `icon_width`     | `float`      | The width of the icon, as a fraction of the figure width.                                                                   |
    | `icon_offset`    | `float`      | The offset of the icon from the left and top edges of the plot, as a fraction of the figure width and height, respectively. |

    ## Returns:
    | Return Name | Return Type  | Description                                                                          |
    |:------------|:-------------|:-------------------------------------------------------------------------------------|
    | `fig`       | `plt.Figure` | The modified Matplotlib figure object with the icon added in the specified position. |

    ## Notes:
    - This function creates a new axes object within the specified figure object and adds the icon image as an image plot.
    - The `icon_width` parameter specifies the width of the icon image as a fraction of the total figure width.
    - The `icon_offset` parameter specifies the offset of the icon from the left and top edges of the plot, as a fraction of the figure width and height, respectively. 
    - The icon's height and vertical offset are adjusted based on the figure's aspect ratio to maintain equal distance from the edges.
    - The `icon_filename` parameter specifies the path and filename of the icon image file to be added.
    """
    fig_width, fig_height = fig.get_size_inches()
    icon_height = icon_width*(fig_width/fig_height)
    icon_offset_height = icon_offset*(fig_width/fig_height)
    icon_ax = fig.add_axes([icon_offset, 1 - icon_height - icon_offset_height, icon_width, icon_height])
    icon_ax.imshow(plt.imread(icon_filename))
    icon_ax.axis('off')
    return(fig)

class CustomFormatter(FuncFormatter):
    """
    ### A custom tick-label formatter for `matplotlib` that allows plots to swith dynamically between scientific, and fixed-point notation as needed.
    
    ## Parameters:
    | Parameter Name   | Type      | Description                                                                                                                                                         |
    |:-----------------|:----------|:--------------------------------------------------------------------------------------------------------------------------------------------------------------------|
    | `low_threshold`  | `Decimal` | The lower threshold for using fixed-point notation. Numbers below this threshold will be displayed using scientific notation. (default: Decimal('0.001'))           |
    | `high_threshold` | `Decimal` | The upper threshold for using fixed-point notation. Numbers equal to or above this threshold will be displayed using scientific notation. (default: Decimal('1e7')) |
    | `total_digits`   | `int`     | The total number of digits to display for numbers in fixed-point notation, including the decimal point. (default: 7)                                                |

    ## Methods:
    | Method Name         | Description                                                                                                                                                                                                                                                                                                                                      |
    |:--------------------|:-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
    | `format_tick_label` | The tick-label formatting function that is called by `matplotlib` when formatting tick labels. Takes two arguments: the tick value (`x`) and the tick position (`pos`, optional). Returns a formatted string representing the tick value in either fixed-point or scientific notation, depending on the thresholds. If `x` is 0, it returns "0". |


    ## Notes:
    - The formatter uses fixed-point notation for numbers within a specified range and scientific notation for numbers outside that range.
    - Inherits from `matplotlib.ticker.FuncFormatter`.
    """
    def __init__(
        self, 
        low_threshold: Decimal = Decimal('0.001'), 
        high_threshold: Decimal = Decimal('1e7'), 
        total_digits: Decimal = 7
        ):
        self.low_threshold = low_threshold
        self.high_threshold = high_threshold
        self.total_digits = total_digits
        super().__init__(self.format_tick_label)
        
    def format_tick_label(
        self, 
        x: float, 
        pos: Union[int, None] = None
        ) -> str:
        if 0 < x < self.low_threshold or x >= self.high_threshold:
            exponent = Decimal(np.floor(np.log10(abs(x))))
            mantissa = Decimal(x) / (Decimal('10')**exponent)
            tick_label = f"{mantissa:.2f}×10$^{{{exponent}}}$"
        else:
            integer_digits = len(str(int(x)))
            decimal_places = max(0, self.total_digits - integer_digits - 1)
            format_string = f"{{:.{decimal_places}f}}"
            tick_label = format_string.format(x)
        return(tick_label)

def get_date_labels_for_animation(date_information):
    """
    ### Given a list of `datetime` objects, returns a list of date labels formatted as strings for use in annotating the x-axis of the animation plots.

    ## Parameters:
    | Parameter Name    | Type              | Description                                  |
    |:------------------|:------------------|:---------------------------------------------|
    | `date_information`| `List[datetime]`  | List of `datetime` objects to be formatted.  |

    ## Returns:
    | Return Name     | Type             | Description                                            |
    |:----------------|:-----------------|:-------------------------------------------------------|
    | `date_labels`   | `List[str]`      | List of formatted date labels for use in the animation.|

    ## Notes:
    - The format for the date labels is `'%Y-%m-%d\n%H:%M:%S'`.
    - The returned list of labels will be of the same length as `date_information`.
    """
    date_array = [datetime.strptime(date_obj.strftime('%Y-%m-%d %H:%M:%S'), '%Y-%m-%d %H:%M:%S') for date_obj in date_information]
    date_labels = [date_obj.strftime('%Y-%m-%d\n%H:%M:%S') for date_obj in date_array]
    return(date_labels)

def calculate_y_ticks_for_animated_price_chart_ax(
    price_array: List[Decimal], 
    min_bid: Decimal, 
    max_ask: Decimal
    ) -> Tuple[int, int]:
    """
    ### Returns the minimum and maximum y-tick values for a price chart.

    ## Parameters:
    | Parameter name    | Type              | Description                                                      |
    |:------------------|:------------------|:-----------------------------------------------------------------|
    | `price_array`     | `List[Decimal]`   | A list of price values to determine y-tick limits for.           |
    | `min_bid`         | `Decimal`         | The minimum sell price to determine y-tick limits for.           |
    | `max_ask`         | `Decimal`         | The maximum buy price to determine y-tick limits for.            |

    ## Returns:
    | Return name                 | Type              | Description                                                                      |
    |:----------------------------|:------------------|:---------------------------------------------------------------------------------|
    | `min_y_tick_price_chart`    | `int`             | The minimum y-tick value for the price chart.                                    |
    | `max_y_tick_price_chart`    | `int`             | The maximum y-tick value for the price chart.                                    |
    |                             | `Tuple[int, int]` | A tuple of `min_y_tick_price_chart` and `max_y_tick_price_chart`, in that order. |

    ## Example:
    >>> get_y_tick_limits_for_animated_price_chart_ax([Decimal('1.5'), Decimal('1.0'), Decimal('0.5')], Decimal('0.5'), Decimal('1.5'))
    (0, 2)
    """
    min_y_tick = (min(min(price_array), min_bid))*Decimal('0.90')
    max_y_tick = (max(max(price_array), max_ask))*Decimal('1.10')
    return(min_y_tick, max_y_tick)

def calculate_y_ticks_for_animated_performance_vs_hodl_ax(
    performance_array: List[Decimal]
    ) -> Tuple[int, int]:
    """
    ### Returns the minimum and maximum y-tick values for a performance chart.

    ## Parameters:
    | Parameter name  | Type             | Description                                                  |
    |:----------------|:-----------------|:-------------------------------------------------------------|
    | `performance`   | `List[Decimal]`  | A list of performance values to determine y-tick limits for. |

    ## Returns:
    | Return name     | Type              | Description                                              |
    |:----------------|:------------------|:---------------------------------------------------------|
    | `min_y_tick`    | `int`             | The minimum y-tick value for the performance chart.      |
    | `max_y_tick`    | `int`             | The maximum y-tick value for the performance chart.      |
    |                 | `Tuple[int, int]` | A tuple of `min_y_tick` and `max_y_tick`, in that order. |

    ## Example:
    >>> get_y_tick_limits_for_chart([Decimal('0.5'), Decimal('1.0'), Decimal('1.5')])
    (-1, 2)
    """
    min_y_tick = min(min(np.floor(performance_array)), -1)
    max_y_tick = max(max(np.ceil(performance_array)), 1)
    return(min_y_tick, max_y_tick)

def calculate_x_ticks_for_liquidity_depth_ax(
    min_bid: Decimal, 
    max_ask: Decimal,
    RISK_price: Decimal,
    number_of_ticks: int = 5
    ) -> List[Decimal]:
    """
    ### Generates x-axis ticks for a liquidity chart with a customizable number of ticks.

    ## Parameters:
    | Parameter names      | Type      | Parameter Descriptions                                          |
    |:---------------------|:----------|:----------------------------------------------------------------|
    | `min_bid`            | `Decimal` | The minimum bid price for `RISK` in untis of `CASH` per `RISK`. |
    | `max_ask`            | `Decimal` | The maximum ask price for `RISK` in untis of `CASH` per `RISK`. |
    | `RISK_price`         | `Decimal` | The current market price of `RISK`                              |
    | `number_of_ticks`    | `int`     | The number of ticks to generate (default: 5).                   |

    ## Returns:
    | Return names                     | Type            | Return Descriptions                                                                                                                                  |
    |:---------------------------------|:----------------|:-----------------------------------------------------------------------------------------------------------------------------------------------------|
    | `x_ticks_for_liquidity_chart`    | `list[Decimal]` | A list containing the minimum bid and maximum ask prices, and evenly spaced points (in log space) between them as per the specified number of ticks. |

    ## Example:
    >>> get_x_ticks_for_liquidity_chart(Decimal('1'), Decimal('100'), Decimal('50'))
    [Decimal('1'),
     Decimal('3.162277660168379331998893544432718533719555139325216826857504852792594438639238221344248108379300295'),
     Decimal('10'),
     Decimal('31.62277660168379331998893544432718533719555139325216826857504852792594438639238221344248108379300295'),
     Decimal('100')]

    >>> get_x_ticks_for_liquidity_chart(Decimal('1'), Decimal('100'), Decimal('50'), number_of_ticks = 7)
    [Decimal('1'),
     Decimal('2.154434690031883721759293566519350495259344942192108582489235506346411106648340800185441503543243276'),
     Decimal('4.641588833612778892410076350919446576551349125011243637650692858684777869692844826189959070897571379'),
     Decimal('10.00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'),
     Decimal('21.54434690031883721759293566519350495259344942192108582489235506346411106648340800185441503543243276'),
     Decimal('46.41588833612778892410076350919446576551349125011243637650692858684777869692844826189959070897571379'),
     Decimal('100')]
    """
    x_ticks = [min(min_bid, RISK_price)*(max(max_ask, RISK_price)/min(min_bid, RISK_price))**(Decimal(i)/Decimal(number_of_ticks - ONE)) 
               for i in range(number_of_ticks)]
    return(x_ticks)

def get_market_price_line_for_liquidity_chart_ax(
    bid_depth_array: np.ndarray, 
    ask_depth_array: np.ndarray,
    RISK_price: Decimal
    ) -> Tuple[List[Decimal], List[float]]:
    """
    ### Calculates the required height of market price line for the plot.

    ## Parameters:
    | Parameter names           | Type         | Parameter Descriptions                                                                    |
    |:--------------------------|:-------------|:------------------------------------------------------------------------------------------|
    | `bid_depth_array`         | `np.ndarray` | An array of 100 evenly spaced sell prices between the minimum and current sell price.     |
    | `ask_depth_array`         | `np.ndarray` | An array of 100 evenly spaced buy prices between `current_buy_price` and `max_buy_price`. |

    ## Returns:
    | Return names                     | Type                                | Return Descriptions                                                                                                                                                        |
    |:---------------------------------|:------------------------------------|:---------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
    | `market_price_line_x`            | `List[float]`                       | The x-coordinates of the market price line on the liquidity chart, which is a list of two elements representing the market price.                                          |
    | `market_price_line_y`            | `List[float]`                       | The y-coordinates of the market price line on the liquidity chart, which is a list of two elements representing the minimum and maximum depths of the bid and ask arrays.  |
    |                                  | `Tuple[List[Decimal], List[float]]` | A tuple of `market_price_line_x` and `market_price_line_y`.                                                                                                                |
    
    ## Dependencies:
    | Dependency name   | Type      | Description                                                                                        |
    |:------------------|:----------|:---------------------------------------------------------------------------------------------------|
    | `MARKETPRICE`     | `Decimal` | A `global` variable representing the current market price of `RISK` in units of `CASH` per `RISK`. |
    """
    market_price_line_x = [RISK_price, RISK_price]
    market_price_line_y = [0, max(max(bid_depth_array), max(ask_depth_array))]
    return(market_price_line_x, market_price_line_y)

def get_price_arrays_for_animated_liquidity_depth_chart_ax(
    current_bid: Decimal, 
    min_bid: Decimal, 
    current_ask: Decimal, 
    max_ask: Decimal
    ) -> Tuple[np.ndarray, np.ndarray]:
    """
    ### Generates price arrays for selling and buying `RISK`.

    ## Parameters:
    | Parameter names       | Type     | Parameter Descriptions               |
    |:----------------------|:---------|:-------------------------------------|
    | `current_bid`         | `Decimal`| The current sell price of the token. |
    | `min_bid`             | `Decimal`| The minimum sell price of the token. |
    | `current_ask`         | `Decimal`| The current buy price of the token.  |
    | `max_ask`             | `Decimal`| The maximum buy price of the token.  |

    ## Returns:
    | Return names              | Type                            | Return Descriptions                                                            |
    |:--------------------------|:--------------------------------|:-------------------------------------------------------------------------------|
    | `bid_price_array`         | `np.ndarray`                    | An array of 100 evenly spaced sell prices between `min_bid` and `current_bid`. |
    | `ask_price_array`         | `np.ndarray`                    | An array of 100 evenly spaced buy prices between `current_ask` and `max_ask`.  |
    |                           | `Tuple[np.ndarray, np.ndarray]` | A tuple of `bid_price_array` and `ask_price_array`.                            |
    """
    bid_price_array = np.linspace(float(min_bid), float(current_bid), 100) # need to float min_bid and current_bid to use np.linspace
    ask_price_array = np.linspace(float(current_ask), float(max_ask), 100) # need to float current_ask and max_ask to use np.linspace
    return(bid_price_array, ask_price_array)

def get_bid_and_ask_data_for_protocol_at_step(
    protocol: str, 
    step: int
    ) -> Tuple[Decimal, Decimal, Decimal, Decimal]:
    """
    ### Returns the `max_ask`, `current_ask`, `current_bid`, and `min_bid` values for the specified `protocol` at the given `step` of the simulation.

    ## Parameters:
    | Parameter Name | Type   | Description                                                                             |
    |:---------------|:-------|:----------------------------------------------------------------------------------------|
    | `protocol`     | `str`  | The name of the protocol to get the data for (`carbon`, `uniswap_v2`, or `uniswap_v3`). |
    | `step`         | `int`  | The step number of the simulation.                                                      |
    
    ## Returns:
    | Return Name   | Type      | Description                                                                                   |
    |:--------------|:----------|:----------------------------------------------------------------------------------------------|
    | `max_ask`     | `Decimal` | The maximum ask price for the specified `protocol` and `step` in units of `CASH` per `RISK`.  |
    | `current_ask` | `Decimal` | The current ask price for the specified `protocol` and `step` in units of `CASH` per `RISK`.  |
    | `current_bid` | `Decimal` | The current bid price for the specified `protocol` and `step` in units of `CASH` per `RISK`.  |
    | `min_bid`     | `Decimal` | The minimum bid price for the specified `protocol` and `step` in units of `CASH` per `RISK`.  |
    |               | `tuple`   | A tuple of `max_ask`, `current_ask`, `current_bid`, and `min_bid`, in that order.             |

    ## Dependencies:
    | Dependency Name | Type    | Description                                                  |
    |:----------------|:--------|:-------------------------------------------------------------|
    | `PROTOCOLS`     | `dict`  | A global dictionary with each protocol name string as keys.  |
    """
    max_ask_array = PROTOCOLS[protocol]['simulation recorder']['max ask'][:step + 1]
    current_ask_array = PROTOCOLS[protocol]['simulation recorder']['ask'][:step + 1]
    current_bid_array = PROTOCOLS[protocol]['simulation recorder']['bid'][:step + 1]
    min_bid_array = PROTOCOLS[protocol]['simulation recorder']['min bid'][:step + 1]
    return(max_ask_array, current_ask_array, current_bid_array, min_bid_array)

def get_information_for_animated_price_chart_ax(
    protocol: str, 
    step: int
    ) -> Tuple[List[int], List[datetime], List[Decimal], Decimal, Decimal, Decimal, Decimal, Decimal, Decimal]:
    """
    ### Returns the data required for generating an animated price chart for the specified `protocol` at the given `step` of the simulation.

    ## Parameters:
    | Parameter Name | Type   | Description                                                                             |
    |:---------------|:-------|:----------------------------------------------------------------------------------------|
    | `protocol`     | `str`  | The name of the protocol to get the data for (`carbon`, `uniswap_v2`, or `uniswap_v3`). |
    | `step`         | `int`  | The step number of the simulation.                                                      |
    
    ## Returns:
    | Return Name       | Type                                                                                                    | Description                                                                                                                                              |
    |:------------------|:--------------------------------------------------------------------------------------------------------|:---------------------------------------------------------------------------------------------------------------------------------------------------------|
    | `step_array`      | `List[int]`                                                                                             | A list enumerating the steps in the simulation up to the specified `step`.                                                                               |
    | `date_array`      | `List[datetime]`                                                                                        | A list of `datetime` objects, corresponding to each step of the simulation up to the specified `step`.                                                   |
    | `price_array`     | `List[Decimal]`                                                                                         | A list of `Decimal` objects, representing the `RISK` price in units of `CASH` for each step of the simulation up to the specified `step`.                |
    | `max_ask`         | `Decimal`                                                                                               | The maximum ask price for the specified `protocol` and `step` in units of `CASH` per `RISK`.                                                             |
    | `current_ask`     | `Decimal`                                                                                               | The current ask price for the specified `protocol` and `step` in units of `CASH` per `RISK`.                                                             |
    | `current_bid`     | `Decimal`                                                                                               | The current bid price for the specified `protocol` and `step` in units of `CASH` per `RISK`.                                                             |
    | `min_bid`         | `Decimal`                                                                                               | The minimum bid price for the specified `protocol` and `step` in units of `CASH` per `RISK`.                                                             |
    | `min_y_tick`      | `Decimal`                                                                                               | The minimum y-tick value to use for plotting the price chart.                                                                                            |
    | `max_y_tick`      | `Decimal`                                                                                               | The maximum y-tick value to use for plotting the price chart.                                                                                            |
    |                   | `Tuple[List[int], List[datetime], List[Decimal], Decimal, Decimal, Decimal, Decimal, Decimal, Decimal]` | A tuple of `step_array`, `date_array`, `price_array`, `max_ask`, `current_ask`, `current_bid`, `min_bid`, `min_y_tick`, and `max_y_tick`, in that order. |
    
    ## Dependencies:
    | Dependency Name                                       | Type       | Description                                                                                                        |
    |:------------------------------------------------------|:-----------|:-------------------------------------------------------------------------------------------------------------------|
    | `PROTOCOLS`                                           | `dict`     | A global dictionary with each protocol name string as keys.                                                        |
    | `get_bid_and_ask_data_for_protocol_at_step`           | `function` | Returns the `max_ask`, `current_ask`, `current_bid`, and `min_bid` values for the specified `protocol` and `step`. |
    | `calculate_y_tick_limits_for_animated_price_chart_ax` | `function` | Computes the minimum and maximum y-tick limits for the price chart.                                                |
    """
    step_array = PROTOCOLS[protocol]['simulation recorder']['simulation step'][:step + 1]
    date_array = PROTOCOLS[protocol]['simulation recorder']['date'][:step + 1]
    price_array = PROTOCOLS[protocol]['simulation recorder']['RISK price'][:step + 1]
    max_ask_array, current_ask_array, current_bid_array, min_bid_array = get_bid_and_ask_data_for_protocol_at_step(protocol, step)
    min_y_tick, max_y_tick = calculate_y_ticks_for_animated_price_chart_ax(price_array, min_bid_array[-1], max_ask_array[-1])
    return(step_array, date_array, price_array, max_ask_array, current_ask_array, current_bid_array, min_bid_array, min_y_tick, max_y_tick)

def get_information_for_animated_performance_vs_hodl_ax(
    protocol: str, 
    step: int
    ) -> Tuple[List[int], List[datetime], List[Decimal], int, int]:
    """
    ### Returns the data required for generating an animated performance vs hodl chart for the specified `protocol` at the given `step` of the simulation.

    ## Parameters:
    | Parameter Name | Type   | Description                                                                             |
    |:---------------|:-------|:----------------------------------------------------------------------------------------|
    | `protocol`     | `str`  | The name of the protocol to get the data for (`carbon`, `uniswap_v2`, or `uniswap_v3`). |
    | `step`         | `int`  | The step number of the simulation.                                                      |
    
    ## Returns:
    | Return Name          | Type                                                        | Description                                                                                                              |
    |:---------------------|:------------------------------------------------------------|:-------------------------------------------------------------------------------------------------------------------------|
    | `step_array`         | `List[int]`                                                 | A list enumerating the steps in the simulation up to the specified `step`.                                               |
    | `date_array`         | `List[datetime]`                                            | A list of dates, corresponding to each step of the simulation up to the specified `step`.                                |
    | `performance_array`  | `List[Decimal]`                                             | A list of the portfolio over hodl quotient values, calculated at each step of the simulation up to the specified `step`. |
    | `min_y_tick`         | `int`                                                       | The minimum y-tick value for the portfolio performance chart up to the specified `step`.                                 |
    | `max_y_tick`         | `int`                                                       | The maximum y-tick value for the portfolio performance chart up to the specified `step`.                                 |
    |                      | `Tuple[List[int], List[datetime], List[Decimal], int, int]` | A tuple of `step_array`, `date_array`, `performance_array`, `min_y_tick`, and `max_y_tick`, in that order.               |
    
    ## Dependencies:
    | Dependency Name                                         | Type       | Description                                                            |
    |:--------------------------------------------------------|:-----------|:-----------------------------------------------------------------------|
    | `PROTOCOLS`                                             | `dict`     | A global dictionary with each protocol name string as keys.            |
    | `calculate_y_ticks_for_animated_performance_vs_hodl_ax` | `function` | Returns the minimum and maximum y-tick values for a performance chart. |
    
    """
    step_array = [i for i in range(step + 1)]
    date_array = PROTOCOLS[protocol]['simulation recorder']['date'][:step + 1]
    performance_array = PROTOCOLS[protocol]['simulation recorder']['portfolio over hodl quotient'][:step + 1]
    min_y_tick, max_y_tick = calculate_y_ticks_for_animated_performance_vs_hodl_ax(performance_array)
    return(step_array, date_array, performance_array, min_y_tick, max_y_tick)

protocol_depth_array_functions = {
    'carbon' : get_carbon_depth_arrays,
    'uniswap_v2' : get_uniswap_v2_depth_arrays,
    'uniswap_v3' : get_uniswap_v3_depth_arrays
}

def get_information_for_animated_liquidity_depth_chart_ax(
    protocol: str, 
    step: int
    ) -> Tuple[List[Decimal], List[Decimal], List[Decimal], List[Decimal], List[Decimal], List[Decimal], List[Decimal]]:
    """
    ## Returns the data required for generating an animated liquidity depth chart for the specified `protocol` at the given `step` of the simulation.

    ## Parameters:
    | Parameter Name | Type   | Description                                                                             |
    |:---------------|:-------|:----------------------------------------------------------------------------------------|
    | `protocol`     | `str`  | The name of the protocol to get the data for (`carbon`, `uniswap_v2`, or `uniswap_v3`). |
    | `step`         | `int`  | The step number of the simulation.                                                      |
    
    ## Returns:
    | Return Name            | Type                                                                                                             | Description                                                                                                                                                        |
    |:-----------------------|:-----------------------------------------------------------------------------------------------------------------|:-------------------------------------------------------------------------------------------------------------------------------------------------------------------|
    | `x_ticks`              | `List[Decimal]`                                                                                                  | A list of x-axis tick values to be used in the liquidity depth chart.                                                                                              |
    | `market_price_line_x`  | `List[Decimal]`                                                                                                  | A list of x-axis values for the market price line in the liquidity depth chart.                                                                                    |
    | `market_price_line_y`  | `List[Decimal]`                                                                                                  | A list of y-axis values for the market price line in the liquidity depth chart.                                                                                    |
    | `bid_price_array`      | `List[Decimal]`                                                                                                  | A list of bid prices to be used in the liquidity depth chart.                                                                                                      |
    | `bid_depth_array`      | `List[Decimal]`                                                                                                  | A list of bid depths to be used in the liquidity depth chart.                                                                                                      |
    | `ask_price_array`      | `List[Decimal]`                                                                                                  | A list of ask prices to be used in the liquidity depth chart.                                                                                                      |
    | `ask_depth_array`      | `List[Decimal]`                                                                                                  | A list of ask depths to be used in the liquidity depth chart.                                                                                                      |
    |                        | `Tuple[List[Decimal], List[Decimal], List[Decimal], List[Decimal], List[Decimal], List[Decimal], List[Decimal]]` | A tuple of `x_ticks`, `market_price_line_x`, `market_price_line_y`, `bid_price_array`, `bid_depth_array`, `ask_price_array`, and `ask_depth_array`, in that order. |
    
    ## Dependencies:
    | Dependency Name                                           | Type       | Description                                                                                                                              |
    |:----------------------------------------------------------|:-----------|:-----------------------------------------------------------------------------------------------------------------------------------------|
    | `PROTOCOLS`                                               | `dict`     | A `global` dictionary with each protocol name string as keys.                                                                            |
    | `protocol_depth_array_functions`                          | `dict`     | A `global` dictionary with protocol name string as keys and value as a function that returns the corresponding bid and ask depth arrays. |
    | `get_bid_and_ask_data_for_protocol_at_step`               | `function` | Returns the maximum ask price, current ask price, current bid price, and minimum bid price for a given protocol and simulation `step`.   |
    | `calculate_x_ticks_for_liquidity_depth_ax`                | `function` | Returns a list of x-axis tick values for the liquidity depth chart.                                                                      |
    | `get_price_arrays_for_animated_liquidity_depth_chart_ax`  | `function  | Generates price arrays for selling and buying `RISK`.                                                                                    |
    """
    depth_array_function = protocol_depth_array_functions[protocol]
    RISK_price = PROTOCOLS[protocol]['simulation recorder']['RISK price'][step]
    max_ask_array, current_ask_array, current_bid_array, min_bid_array = get_bid_and_ask_data_for_protocol_at_step(protocol, step)
    x_ticks = calculate_x_ticks_for_liquidity_depth_ax(min_bid_array[-1], max_ask_array[-1], RISK_price, number_of_ticks = 5)
    bid_price_array, ask_price_array = get_price_arrays_for_animated_liquidity_depth_chart_ax(current_bid_array[-1], min_bid_array[-1], current_ask_array[-1], max_ask_array[-1])
    bid_depth_array, ask_depth_array = depth_array_function(bid_price_array, ask_price_array, RISK_price, step)
    market_price_line_x, market_price_line_y = get_market_price_line_for_liquidity_chart_ax(bid_depth_array, ask_depth_array, RISK_price)
    return(x_ticks, market_price_line_x, market_price_line_y, bid_price_array, bid_depth_array, ask_price_array, ask_depth_array)

def get_information_for_animated_token_balances_ax(
    protocol: str, 
    step: int
    ) -> Tuple[List[Decimal], List[str]]:
    """
    ### Returns the data required for generating an animated token balances chart for the specified `protocol` at the given `step` of the simulation.

    ## Parameters:
    | Parameter Name | Type   | Description                                                                             |
    |:---------------|:-------|:----------------------------------------------------------------------------------------|
    | `protocol`     | `str`  | The name of the protocol to get the data for (`carbon`, `uniswap_v2`, or `uniswap_v3`). |
    | `step`         | `int`  | The step number of the simulation.                                                      |

    ## Returns:
    | Return Name                  | Type                              | Description                                                                           |
    |:-----------------------------|:----------------------------------|:--------------------------------------------------------------------------------------|
    | `token_balances_CASH_basis`  | `List[Decimal]`                   | A list of the total token balances, in `CASH` and `RISK` denominations, respectively. |
    | `token_denomination`         | `List[str]`                       | A list of the corresponding token denominations (`CASH` and `RISK`, respectively).    |
    |                              | `Tuple[List[Decimal], List[str]]` | A tuple of `token_balances_CASH_basis` and `token_denomination`, in that order.       |

    ## Dependencies:
    | Dependency Name | Type   | Description                                                    |
    |:----------------|:-------|:---------------------------------------------------------------|
    | `PROTOCOLS`     | `dict` | A global dictionary with each protocol name string as keys.    |
    | `TOKEN_PAIR`    | `dict` | A global dictionary with `CASH` and `RISK` token pair details. |
    
    ## Example:
    >>> get_information_for_animated_token_balances_ax('carbon', 5)
    ([Decimal('156.72300000'), Decimal('897.45623110')], ['USDC', 'ETH'])
    """
    global PROTOCOLS
    global TOKEN_PAIR
    rec = PROTOCOLS[protocol]['simulation recorder']
    token_balances_CASH_basis = [CASH_balance := rec['CASH balance'][step + 1], rec['portfolio value'][step] - CASH_balance]
    token_denomination = [TOKEN_PAIR['CASH'], TOKEN_PAIR['RISK']]
    return(token_balances_CASH_basis, token_denomination)

def get_information_for_animated_fee_earnings_ax(
    protocol: str, 
    step: int
    ) -> Tuple[List[Decimal], List[str]]:
    """
    ### Returns the data required for generating an animated fee earnings chart for the specified `protocol` at the given `step` of the simulation.

    ## Parameters:
    | Parameter Name | Type   | Description                                                                             |
    |:---------------|:-------|:----------------------------------------------------------------------------------------|
    | `protocol`     | `str`  | The name of the protocol to get the data for (`carbon`, `uniswap_v2`, or `uniswap_v3`). |
    | `step`         | `int`  | The step number of the simulation.                                                      |

    ## Returns:
    | Return Name        | Type                              | Description                                                                          |
    |:-------------------|:----------------------------------|:-------------------------------------------------------------------------------------|
    | `fee_earnings`     | `List[Decimal]`                   | A list of the total fee earnings, in `CASH` and `RISK` denominations, respectively.  |
    | `fee_denomination` | `List[str]`                       | A list of the corresponding fee denominations (`CASH` and `RISK`, respectively).     |
    |                    | `Tuple[List[Decimal], List[str]]` | A tuple of `fee_earnings` and `fee_denomination`, in that order.                     |

    ## Dependencies:
    | Dependency Name | Type   | Description                                                    |
    |:----------------|:-------|:---------------------------------------------------------------|
    | `PROTOCOLS`     | `dict` | A global dictionary with each protocol name string as keys.    |
    | `TOKEN_PAIR`    | `dict` | A global dictionary with `CASH` and `RISK` token pair details. |
    
    ## Example:
    >>> get_protocol_fee_earnings('carbon')
    ([Decimal('68.26570000'), Decimal('308.45029432')], ['USDC', 'ETH'])
    """
    global PROTOCOLS
    global TOKEN_PAIR
    RISK_price = PROTOCOLS[protocol]['simulation recorder']['RISK price'][step]
    CASH_fees = PROTOCOLS[protocol]['simulation recorder']['CASH fees'][step + 1]
    RISK_fees = PROTOCOLS[protocol]['simulation recorder']['RISK fees'][step + 1]*RISK_price
    fee_earnings = [CASH_fees, RISK_fees]
    fee_denomination = [TOKEN_PAIR['CASH'], TOKEN_PAIR['RISK']]
    return(fee_earnings, fee_denomination)

def get_information_for_bar_chart(
    protocol: str, 
    step: int, 
    type: str
    ) -> Tuple[List[Decimal, Decimal], List[str, str], str, str]:
    """
    ### Returns the data required for generating an animated bar chart based on the `type` specified.
    
    ## Parameters:
    | Parameter Name | Type                | Description                                                                             |
    |:---------------|:--------------------|:----------------------------------------------------------------------------------------|
    | `protocol`     | `str`               | The name of the protocol to get the data for (`carbon`, `uniswap_v2`, or `uniswap_v3`). |
    | `step`         | `int`               | The step number of the simulation.                                                      |
    | `type`         | `str`               | The type of data to fetch ('fees' or 'token_balances').                                 |
    
    ## Returns:
    | Return Name   | Type                                                      | Description                                                              |
    |:--------------|:----------------------------------------------------------|:-------------------------------------------------------------------------|
    | `data`        | `List[Decimal, Decimal]`                                  | The data required for generating the chart.                              |
    | `denomination`| `List[str, str]`                                          | The denominations corresponding to the data.                             |
    | `title`       | `str`                                                     | The title for the chart.                                                 |
    | `ylabel`      | `str`                                                     | The label for the y-axis of the chart.                                   |
    |               | `Tuple[List[Decimal, Decimal], List[str, str], str, str]` | A tuple of `data`, `denomination`, `title`, and `ylabel`, in that order. |
    
    ## Dependencies:
    | Dependency Name                                  | Type       | Description                                                                                                               |
    |:-------------------------------------------------|:-----------|:--------------------------------------------------------------------------------------------------------------------------|
    | `TOKEN_PAIR`                                     | `dict`     | A `global` dictionary containing `CASH` and `RISK` strings as keys, and the corresponding token ticker strings as values. |
    | `get_information_for_animated_fee_earnings_ax`   | `function` | Returns the data required for generating an animated cumulative fee earnings chart.                                       |
    | `get_information_for_animated_token_balances_ax` | `function` | Returns the data required for generating an animated token balances chart.                                                |
    """
    global TOKEN_PAIR
    if type == 'fees':
        data, denomination = get_information_for_animated_fee_earnings_ax(protocol, step)
        title = 'Fee Earnings'
        ylabel = f'Cumulative Fee Value ({TOKEN_PAIR["CASH"]} equiv.)'
    elif type == 'token_balances':
        data, denomination = get_information_for_animated_token_balances_ax(protocol, step)
        title = 'Token Portfolio'
        ylabel = f'Portfolio Composition ({TOKEN_PAIR["CASH"]} equiv.)'
    else:
        raise ValueError("Invalid type. Expected 'fees' or 'token_balances'.")
    return(data, denomination, title, ylabel)

def get_concentrated_curve_constants_x_int_y_int_Q(
    protocol: str,
    step: int
    ) -> Tuple[Decimal, Decimal, Decimal, Decimal, Decimal, Decimal]:
    """
    ### Retrieves concentrated curve constants for the specified protocol and step.

    ## Parameters:
    | Parameter Name | Type  | Description                                                                        |
    |:---------------|:------|:-----------------------------------------------------------------------------------|
    | `protocol`     | `str` | The name of the concentrated liquidity protocol (either `carbon` or `uniswap_v3`). |
    | `step`         | `int` | The step for which to retrieve the curve constants.                                |

    ## Returns:
    | Return Name       | Type                                                          | Description                                                                                               |
    |:------------------|:--------------------------------------------------------------|:----------------------------------------------------------------------------------------------------------|
    | `x_int_CASH`      | `Decimal`                                                     | The x-intercept for the `CASH` side of the concentrated liquidity curve.                                  |
    | `y_int_CASH`      | `Decimal`                                                     | The y-intercept for the `CASH` side of the concentrated liquidity curve.                                  |
    | `Q_CASH`          | `Decimal`                                                     | The constant `Q` for the `CASH` side of the concentrated liquidity curve.                                 |
    | `x_int_RISK`      | `Decimal`                                                     | The x-intercept for the `RISK` side of the concentrated liquidity curve.                                  |
    | `y_int_RISK`      | `Decimal`                                                     | The y-intercept for the `RISK` side of the concentrated liquidity curve.                                  |
    | `Q_RISK`          | `Decimal`                                                     | The constant `Q` for the `RISK` side of the concentrated liquidity curve.                                 |
    |                   | `Tuple[Decimal, Decimal, Decimal, Decimal, Decimal, Decimal]` | A tuple of `x_int_CASH`, `y_int_CASH`, `Q_CASH`, `x_int_RISK`, `y_int_RISK`, and `Q_RISK`, in that order. |

    ## Raises:
    | Exception          | Description                                                   |
    |:-------------------|:--------------------------------------------------------------|
    | `ValueError`       | The input `protocol` must be either `carbon` or `uniswap_v3`. |
    
    ## Dependencies:
    | Dependency name   | Type      | Description                                                                                                                           |
    |:------------------|:----------|:--------------------------------------------------------------------------------------------------------------------------------------|
    | `PROTOCOLS`       | `dict`    | A `global` dictionary with each of the protocol name strings as keys, and the appropriate protocol dictionaries themselves as values. |

    ## Notes:
    - This function retrieves concentrated curve constants for the specified protocol and step from the global `PROTOCOLS` variable.
    """
    global PROTOCOLS
    if protocol == 'carbon':
        x_int_CASH, y_int_CASH, Q_CASH = [carbon['curve parameters']['CASH'][i][step + 1] for i in ['x_int', 'y_int', 'Q']]
        x_int_RISK, y_int_RISK, Q_RISK = [carbon['curve parameters']['RISK'][i][step + 1] for i in ['x_int', 'y_int', 'Q']]
    elif protocol == 'uniswap_v3':
        x_int_CASH, y_int_CASH, Q_CASH = [uniswap_v3['curve parameters'][i][-1] for i in ['RISK_int', 'CASH_int', 'Q']]
        x_int_RISK, y_int_RISK, Q_RISK = y_int_CASH, x_int_CASH, Q_CASH
    else:
        raise ValueError("Invalid protocol specified. Allowed values are 'uniswap_v3' and 'carbon'.")
    return(x_int_CASH, y_int_CASH, Q_CASH, x_int_RISK, y_int_RISK, Q_RISK)

def get_x_arrays_for_concentrated_liquidity_plot(
    x_int_CASH: Decimal, 
    x_int_RISK: Decimal
    )-> Tuple[np.ndarray, np.ndarray]:
    """
    ### Generates x arrays for the concentrated liquidity plot based on the given x-intercepts.

    ## Parameters:
    | Parameter Name | Type      | Description                                                                    |
    |:---------------|:----------|:-------------------------------------------------------------------------------|
    | `x_int_CASH`   | `Decimal` | The x-intercept for the `CASH` side of the concentrated liquidity curve.       |
    | `x_int_RISK`   | `Decimal` | The x-intercept for the `RISK` side of the concentrated liquidity curve.       |

    ## Returns:
    | Return Name      | Type                            | Description                                                                                                                     |
    |:-----------------|:--------------------------------|:--------------------------------------------------------------------------------------------------------------------------------|
    | `x_array_CASH`   | `np.ndarray`                    | An array of 200 equally spaced values between 0 and `x_int_CASH`, representing the x values for the `CASH` side of the curve.   |
    | `x_array_RISK`   | `np.ndarray`                    | An array of 200 equally spaced values between 0 and `x_int_RISK`, representing the x values for the `RISK` side of the curve.   |
    |                  | `Tuple[np.ndarray, np.ndarray]` | A tuple of `x_array_CASH` and `x_array_RISK`, in that order.                                                                    |

    ## Notes:
    - This function creates two x arrays with 200 equally spaced values each, for the `CASH` and `RISK` sides of the concentrated liquidity curve.
    """
    x_array_CASH, x_array_RISK = [np.linspace(0, float(i), 200) for i in (x_int_CASH, x_int_RISK)]
    return(x_array_CASH, x_array_RISK)

def calculate_y_arrays_for_concentrated_liquidity_plot(
    x_array_CASH: np.ndarray,
    x_int_CASH: Decimal, 
    y_int_CASH: Decimal, 
    Q_CASH: Decimal,
    x_array_RISK: np.ndarray,
    x_int_RISK: Decimal, 
    y_int_RISK: Decimal, 
    Q_RISK: Decimal,
    ) -> Tuple[np.ndarray, np.ndarray]:
    """
    ### Calculates y arrays for the concentrated liquidity plot based on the provided x arrays and curve parameters.

    ## Parameters:
    | Parameter Name | Type         | Description                                                                    |
    |:---------------|:-------------|:-------------------------------------------------------------------------------|
    | `x_array_CASH` | `np.ndarray` | An array of x values for the `CASH` side of the concentrated liquidity curve.  |
    | `x_int_CASH`   | `Decimal`    | The x-intercept for the `CASH` side of the concentrated liquidity curve.       |
    | `y_int_CASH`   | `Decimal`    | The y-intercept for the `CASH` side of the concentrated liquidity curve.       |
    | `Q_CASH`       | `Decimal`    | The constant `Q` for the `CASH` side of the concentrated liquidity curve.      |
    | `x_array_RISK` | `np.ndarray` | An array of x values for the `RISK` side of the concentrated liquidity curve.  |
    | `x_int_RISK`   | `Decimal`    | The x-intercept for the `RISK` side of the concentrated liquidity curve.       |
    | `y_int_RISK`   | `Decimal`    | The y-intercept for the `RISK` side of the concentrated liquidity curve.       |
    | `Q_RISK`       | `Decimal`    | The constant `Q` for the `RISK` side of the concentrated liquidity curve.      |

    ## Returns:
    | Return Name      | Type                            | Description                                                                                                                    |
    |:-----------------|:--------------------------------|:-------------------------------------------------------------------------------------------------------------------------------|
    | `y_array_CASH`   | `np.ndarray`                    | An array of y values for the `CASH` side of the concentrated liquidity curve, calculated using the provided curve parameters.  |
    | `y_array_RISK`   | `np.ndarray`                    | An array of y values for the `RISK` side of the concentrated liquidity curve, calculated using the provided curve parameters.  |
    |                  | `Tuple[np.ndarray, np.ndarray]` | A tuple of `y_array_CASH` and `y_array_RISK`, in that order.                                                                   |

    ## Notes:
    - This function calculates the y arrays for the `CASH` and `RISK` sides of the concentrated liquidity curve using the provided x arrays and curve parameters.
    """
    input_parameters = ((x_array_CASH, float(x_int_CASH), float(y_int_CASH), float(Q_CASH)),
                        (x_array_RISK, float(x_int_RISK), float(y_int_RISK), float(Q_RISK)))
    y_array_CASH, y_array_RISK = [y_int*Q*(x_int - x_array)/(x_array + Q*(x_int - x_array))
                                  for x_array, x_int, y_int, Q in input_parameters]
    return(y_array_CASH, y_array_RISK)

def get_concentrated_curve_y_coordinates(
    protocol: str,
    step: int
    ) -> Tuple[Decimal, Decimal] :
    """
    ### Retrieves y coordinates of the concentrated liquidity curve for the specified protocol and step.

    ## Parameters:
    | Parameter Name | Type  | Description                                                                        |
    |:---------------|:------|:-----------------------------------------------------------------------------------|
    | `protocol`     | `str` | The name of the concentrated liquidity protocol (either `carbon` or `uniswap_v3`). |
    | `step`         | `int` | The step for which to retrieve the y coordinates.                                  |

    ## Returns:
    | Return Name   | Type                  | Description                                                                                  |
    |:--------------|:----------------------|:---------------------------------------------------------------------------------------------|
    | `y_CASH`      | `Decimal`             | The y coordinate for the `CASH` side of the concentrated liquidity curve at the given step.  |
    | `y_RISK`      | `Decimal`             | The y coordinate for the `RISK` side of the concentrated liquidity curve at the given step.  |
    |               | `Tuple[float, float]` | A tuple of `y_CASH` and `y_RISK`, in that order.                                             |

    ## Dependencies:
    | Dependency name   | Type      | Description                                                                                                                           |
    |:------------------|:----------|:--------------------------------------------------------------------------------------------------------------------------------------|
    | `PROTOCOLS`       | `dict`    | A `global` dictionary with each of the protocol name strings as keys, and the appropriate protocol dictionaries themselves as values. |

    ## Notes:
    - This function retrieves y coordinates of the concentrated liquidity curve for the specified protocol and step from the global `PROTOCOLS` variable.
    """
    global PROTOCOLS
    y_CASH, y_RISK = [PROTOCOLS[protocol]['simulation recorder'][f'{i} balance'][step + 1] for i in ('CASH', 'RISK')]
    return(y_CASH, y_RISK)

def get_concentrated_curve_x_coordinates(
    y_CASH: Decimal,
    x_int_CASH: Decimal, 
    y_int_CASH: Decimal, 
    Q_CASH: Decimal,
    y_RISK: Decimal,
    x_int_RISK: Decimal, 
    y_int_RISK: Decimal, 
    Q_RISK: Decimal,
    )  -> Tuple[Decimal, Decimal]:
    """
    ### Calculates x coordinates of the concentrated liquidity curve for the given parameters.

    ## Parameters:
    | Parameter Name | Type      | Description                                                                |
    |:---------------|:----------|:---------------------------------------------------------------------------|
    | `y_CASH`       | `Decimal` | The y coordinate for the `CASH` side of the concentrated liquidity curve.  |
    | `x_int_CASH`   | `Decimal` | The x-intercept for the `CASH` side of the concentrated liquidity curve.   |
    | `y_int_CASH`   | `Decimal` | The y-intercept for the `CASH` side of the concentrated liquidity curve.   |
    | `Q_CASH`       | `Decimal` | The constant `Q` for the `CASH` side of the concentrated liquidity curve.  |
    | `y_RISK`       | `Decimal` | The y coordinate for the `RISK` side of the concentrated liquidity curve.  |
    | `x_int_RISK`   | `Decimal` | The x-intercept for the `RISK` side of the concentrated liquidity curve.   |
    | `y_int_RISK`   | `Decimal` | The y-intercept for the `RISK` side of the concentrated liquidity curve.   |
    | `Q_RISK`       | `Decimal` | The constant `Q` for the `RISK` side of the concentrated liquidity curve.  |

    ## Returns:
    | Return Name   | Type                      | Description                                                                |
    |:--------------|:--------------------------|:---------------------------------------------------------------------------|
    | `x_CASH`      | `Decimal`                 | The x coordinate for the `CASH` side of the concentrated liquidity curve.  |
    | `x_RISK`      | `Decimal`                 | The x coordinate for the `RISK` side of the concentrated liquidity curve.  |
    |               | `Tuple[Decimal, Decimal]` | A tuple of `x_CASH` and `x_RISK`, in that order.                           |

    ## Notes:
    - This function calculates the x coordinates of the concentrated liquidity curve for the given parameters using the provided formulas.
    """
    input_parameters = ((y_CASH, x_int_CASH, y_int_CASH, Q_CASH),
                        (y_RISK, x_int_RISK, y_int_RISK, Q_RISK))
    x_CASH, x_RISK = [x_int*Q*(y_int - y)/(y + Q*(y_int - y))
                      for y, x_int, y_int, Q in input_parameters]
    return(x_CASH, x_RISK)

def get_information_for_animated_concentrated_liquidity_curves(
    protocol: str,
    step: int
    ) -> Tuple[np.ndarray, np.ndarray, Decimal, Decimal, np.ndarray, np.ndarray, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal]:
    """
    ### Retrieves all necessary information for creating animated concentrated liquidity curves.

    ## Parameters:
    | Parameter Name | Type  | Description                                                                        |
    |:---------------|:------|:-----------------------------------------------------------------------------------|
    | `protocol`     | `str` | The name of the concentrated liquidity protocol (either `carbon` or `uniswap_v3`). |
    | `step`         | `int` | The step for which to retrieve the curve information.                              |

    ## Returns:
    | Return Name       | Type                                                                                                                            | Description                                                                                                                                                                                   |
    |:------------------|:--------------------------------------------------------------------------------------------------------------------------------|:----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
    | `x_array_CASH`    | `np.ndarray`                                                                                                                    | The x values for the `CASH` side of the concentrated liquidity curve plot.                                                                                                                    |
    | `y_array_CASH`    | `np.ndarray`                                                                                                                    | The y values for the `CASH` side of the concentrated liquidity curve plot.                                                                                                                    |
    | `x_CASH`          | `Decimal`                                                                                                                       | The x coordinate for the `CASH` side of the concentrated liquidity curve.                                                                                                                     |
    | `y_CASH`          | `Decimal`                                                                                                                       | The y coordinate for the `CASH` side of the concentrated liquidity curve.                                                                                                                     |
    | `x_array_RISK`    | `np.ndarray`                                                                                                                    | The x values for the `RISK` side of the concentrated liquidity curve plot.                                                                                                                    |
    | `y_array_RISK`    | `np.ndarray`                                                                                                                    | The y values for the `RISK` side of the concentrated liquidity curve plot.                                                                                                                    |
    | `x_RISK`          | `Decimal`                                                                                                                       | The x coordinate for the `RISK` side of the concentrated liquidity curve.                                                                                                                     |
    | `y_RISK`          | `Decimal`                                                                                                                       | The y coordinate for the `RISK` side of the concentrated liquidity curve.                                                                                                                     |
    | `x_int_CASH`      | `Decimal`                                                                                                                       | The x-intercept for the `CASH` side of the concentrated liquidity curve.                                                                                                                      |
    | `y_int_CASH`      | `Decimal`                                                                                                                       | The y-intercept for the `CASH` side of the concentrated liquidity curve.                                                                                                                      |
    | `x_int_RISK`      | `Decimal`                                                                                                                       | The x-intercept for the `RISK` side of the concentrated liquidity curve.                                                                                                                      |
    | `y_int_RISK`      | `Decimal`                                                                                                                       | The y-intercept for the `RISK` side of the concentrated liquidity curve.                                                                                                                      |
    |                   | `Tuple[np.ndarray, np.ndarray, Decimal, Decimal, np.ndarray, np.ndarray, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal]` | A tuple of `x_array_CASH`, `y_array_CASH`, `x_CASH`, `y_CASH`, `x_array_RISK`, `y_array_RISK`, `x_RISK`, `y_RISK`, `x_int_CASH`, `y_int_CASH`, `x_int_RISK`, and `y_int_RISK`, in that order. |

    ## Dependencies:
    | Dependency name                                      | Type       | Description                                                                                                  |
    |:-----------------------------------------------------|:-----------|:-------------------------------------------------------------------------------------------------------------|
    | `get_concentrated_curve_constants_x_int_y_int_Q`     | `function` | Retrieves concentrated curve constants for the specified protocol and step.                                  |
    | `get_concentrated_curve_y_coordinates`               | `function` | Retrieves y coordinates of the concentrated liquidity curve for the specified protocol and step.             |
    | `get_concentrated_curve_x_coordinates`               | `function` | Calculates x coordinates of the concentrated liquidity curve for the given parameters.                       |
    | `get_x_arrays_for_concentrated_liquidity_plot`       | `function` | Generates x arrays for the concentrated liquidity plot based on the given x-intercepts.                      |
    | `calculate_y_arrays_for_concentrated_liquidity_plot` | `function` | Calculates y arrays for the concentrated liquidity plot based on the provided x arrays and curve parameters. |

    ## Notes:
    - This function calls multiple other functions to retrieve all the necessary information for creating the animated concentrated liquidity curves for the specified protocol and step.
    """
    x_int_CASH, y_int_CASH, Q_CASH, x_int_RISK, y_int_RISK, Q_RISK = get_concentrated_curve_constants_x_int_y_int_Q(protocol, step)
    y_CASH, y_RISK = get_concentrated_curve_y_coordinates(protocol, step)
    x_CASH, x_RISK = get_concentrated_curve_x_coordinates(y_CASH, x_int_CASH, y_int_CASH, Q_CASH, y_RISK, x_int_RISK, y_int_RISK, Q_RISK)
    x_array_CASH, x_array_RISK = get_x_arrays_for_concentrated_liquidity_plot(x_int_CASH, x_int_RISK)
    y_array_CASH, y_array_RISK = calculate_y_arrays_for_concentrated_liquidity_plot(x_array_CASH, x_int_CASH, y_int_CASH, Q_CASH, x_array_RISK, x_int_RISK, y_int_RISK, Q_RISK)
    return(x_array_CASH, y_array_CASH, x_CASH, y_CASH, x_array_RISK, y_array_RISK, x_RISK, y_RISK, x_int_CASH, y_int_CASH, x_int_RISK, y_int_RISK)

def get_animated_liquidity_curve_fill_colors(
    protocol: str
    ) -> Tuple[str, str, str, str]:
    """
    ### Returns the fill colors for the animated concentrated liquidity curve.

    ## Parameters:
    | Parameter Name | Type  | Description                                                                        |
    |:---------------|:------|:-----------------------------------------------------------------------------------|
    | `protocol`     | `str` | The name of the concentrated liquidity protocol (either `carbon` or `uniswap_v3`). |

    ## Returns:
    | Return Name                  | Type                        | Description                                                                                                               |
    |:-----------------------------|:----------------------------|:--------------------------------------------------------------------------------------------------------------------------|
    | `ax1_CASH_fill_color`        | `str`                       | The fill color hex code to be used on the `CASH` area of `ax1` of the concentrated liquidity curve animation.             | 
    | `ax1_RISK_fill_color`        | `str`                       | The fill color hex code to be used on the `RISK` area of `ax1` of the concentrated liquidity curve animation.             | 
    | `ax2_CASH_fill_color`        | `str`                       | The fill color hex code to be used on the `CASH` area of `ax2` of the concentrated liquidity curve animation.             | 
    | `ax2_RISK_fill_color`        | `str`                       | The fill color hex code to be used on the `RISK` area of `ax2` of the concentrated liquidity curve animation.             | 
    |                              | `Tuple[str, str, str, str]` | A tuple of `ax1_CASH_fill_color`, `ax1_RISK_fill_color`, `ax2_CASH_fill_color`, and `ax2_RISK_fill_color`, in that order. |
    
    ## Notes:
    - The function returns different fill colors, based on whether the protocol is symmetric (i.e. `uniswap_v3`), or asymmetric (i.e. `carbon`).
    """
    ax1_CASH_fill_color = '#00b578ff' 
    ax2_RISK_fill_color = '#d86371ff' 
    if protocol == 'carbon':
        ax1_RISK_fill_color = '#ffffffff' 
        ax2_CASH_fill_color = '#ffffffff' 
    else:
        ax1_RISK_fill_color = '#d86371ff' 
        ax2_CASH_fill_color = '#00b578ff' 
    return(ax1_CASH_fill_color, ax1_RISK_fill_color, ax2_CASH_fill_color, ax2_RISK_fill_color)

def add_fill_color_to_animated_liquidity_curve_ax(
    ax: mpl.AxesSubplot, 
    x_array: np.ndarray, 
    y_array: np.ndarray, 
    x: Decimal,
    y: Decimal, 
    RISK_fill_color: str, 
    CASH_fill_color: str
    ) -> None:
    """
    ### Adds fill colors to the concentrated liquidity curve axes.

    ## Parameters:
    | Parameter Name   | Type              | Description                                                            |
    |:-----------------|:------------------|:-----------------------------------------------------------------------|
    | `ax`             | `mpl.AxesSubplot` | The axis to add fill colors to.                                        |
    | `x_array`        | `np.ndarray`      | The x values array for the curve.                                      |
    | `y_array`        | `np.ndarray`      | The y values array for the curve.                                      |
    | `x`              | `Decimal`         | The x value of the intersection point (i.e. the current `x` balance).  |
    | `y`              | `Decimal`         | The y value of the intersection point (i.e. the current `y` balance).  |
    | `RISK_fill_color`| `str`             | The fill color for the risk area.                                      |
    | `CASH_fill_color`| `str`             | The fill color for the cash area.                                      |

    ## Returns:
    None

    ## Notes:
    - This function adds fill colors to the concentrated liquidity curve axes.
    """
    y_fill_upper = np.linspace(float(y), np.max(y_array), 100)
    x_fill_upper = np.interp(y_fill_upper, y_array[::-1], x_array[::-1])
    ax.fill_betweenx(y_fill_upper, 0, x_fill_upper, color = RISK_fill_color, alpha = 0.25)
    y_fill_lower = np.linspace(0, float(y), 100)
    x_fill_lower = np.interp(y_fill_lower, y_array[::-1], x_array[::-1])
    ax.fill_betweenx(y_fill_lower, x_fill_lower, float(x), color = CASH_fill_color, alpha = 0.25)
    return(None)

def get_animated_concentrated_liquidity_curve_axis_labels(
    protocol: str
    ) -> Tuple[str, str, str, str]:
    """
    ### Retrieves axis labels for the animated concentrated liquidity curve plots.

    ## Parameters:
    | Parameter Name | Type  | Description                                                                        |
    |:---------------|:------|:-----------------------------------------------------------------------------------|
    | `protocol`     | `str` | The name of the concentrated liquidity protocol (either `carbon` or `uniswap_v3`). |

    ## Returns:
    | Return Name    | Type                        | Description                                                                               |
    |:---------------|:----------------------------|:------------------------------------------------------------------------------------------|
    | `ax1_y_label`  | `str`                       | The y-axis label for the `CASH` side of the animated liquidity curve plot.                |
    | `ax2_y_label`  | `str`                       | The y-axis label for the `RISK` side of the animated liquidity curve plot.                |
    | `ax1_x_label`  | `str`                       | The x-axis label for the `CASH` side of the animated liquidity curve plot.                |
    | `ax2_x_label`  | `str`                       | The x-axis label for the `RISK` side of the animated liquidity curve plot.                |
    |                | `Tuple[str, str, str, str]` | A tuple of `ax1_y_label`, `ax2_y_label`, `ax1_x_label`, and `ax2_x_label`, in that order. |

    ## Dependencies:
    | Dependency name   | Type           | Description                                                                                                               |
    |:------------------|:---------------|:--------------------------------------------------------------------------------------------------------------------------|
    | `TOKEN_PAIR`      | `dict`         | A `global` dictionary containing `CASH` and `RISK` strings as keys, and the corresponding token ticker strings as values. |

    ## Notes:
    - This function generates axis labels for the animated concentrated liquidity curve plots based on the input `protocol`.
    - For the `carbon` protocol, the x-axis labels are set to "fictional x-coordinate".
    """
    global TOKEN_PAIR  
    ax1_y_label, ax1_x_label, ax2_x_label, ax2_y_label = [f"{token} balance" for token in itertools.chain.from_iterable(itertools.repeat(TOKEN_PAIR.values(), 2))]
    if protocol == 'carbon':
        ax1_x_label = ax2_x_label = "fictional x-coordinate"
    return(ax1_y_label, ax2_y_label, ax1_x_label, ax2_x_label)

def add_lines_to_animated_liquidity_curve_ax(
    ax: mpl.AxesSubplot, 
    x: Decimal, 
    y: Decimal,
    span_full: bool = True
    ) -> None:
    """
    ### Adds dashed lines to a concentrated liquidity curve subplot.

    ## Parameters:
    | Parameter Name | Type              | Description                                                                              |
    |:---------------|:------------------|:-----------------------------------------------------------------------------------------|
    | `ax`           | `mpl.AxesSubplot` | The `matplotlib.AxesSubplot` object for the concentrated liquidity curve subplot.        |
    | `x`            | `Decimal`         | The x value of the intersection point (i.e. the current `x` balance).                    |
    | `y`            | `Decimal`         | The y value of the intersection point (i.e. the current `y` balance).                    |
    | `span_full`    | `bool`            | If True, the horizontal and vertical lines will span the entire plot area.               |

    ## Returns:
    None

    ## Notes:
    - This function adds vertical and horizontal dashed lines to the input AxesSubplot object (`ax`) that intersect at the given (x, y) point.
    - The lines are styled with a white color and dashed linestyle.
    """
    start_x = ax.get_xlim()[0] if span_full else 0
    end_x = ax.get_xlim()[1] if span_full else x
    start_y = ax.get_ylim()[0] if span_full else 0
    end_y = ax.get_ylim()[1] if span_full else y
    vertical_line = mlines.Line2D([x, x], [start_y, end_y], color='white', linestyle='--')
    horizontal_line = mlines.Line2D([start_x, end_x], [y, y], color='white', linestyle='--')
    ax.add_line(vertical_line)
    ax.add_line(horizontal_line)
    return(None)

def add_text_labels_to_animated_liquidity_curve_ax(
    ax: mpl.AxesSubplot, 
    x: Decimal, 
    y: Decimal, 
    custom_formatter: CustomFormatter,
    span_full: bool = True
    ) -> None:
    """
    ### Adds text labels to a concentrated liquidity curve subplot at specified coordinates.

    ## Parameters:
    | Parameter Name     | Type              | Description                                                                         |
    |:-------------------|:------------------|:------------------------------------------------------------------------------------|
    | `ax`               | `mpl.AxesSubplot` | The `matplotlib.AxesSubplot` object for the concentrated liquidity curve subplot.   |
    | `x`                | `Decimal`         | The x value of the intersection point (i.e. the current `x` balance).               |
    | `y`                | `Decimal`         | The y value of the intersection point (i.e. the current `y` balance).               |
    | `custom_formatter` | `CustomFormatter` | A custom formatter object to format the tick labels for the text labels.            |
    | `span_full`        | `bool`            | If True, adjusts the text labels to the center of the full span of the lines.       |

    ## Returns:
    None

    ## Notes:
    - This function adds text labels to the input AxesSubplot object (`ax`) at the specified (x, y) coordinates.
    - The text labels display the formatted x and y values using the provided `custom_formatter`.
    - The labels are styled with the GT America Mono Regular font, white color, and black stroke.
    """
    x_label_position = ((ax.get_xlim()[1] + float(x))/2) if span_full else (x/TWO)
    y_label_position = ((ax.get_ylim()[1] + float(y))/2) if span_full else (y/TWO)

    ax.text(x, y_label_position, custom_formatter.format_tick_label(x),
              fontproperties = GT_America_Mono_Regular,
              fontsize = 8,
              color = '#ffffffff',
              ha = "center",
              va = "center").set_path_effects([pe.withStroke(linewidth = 3, foreground = "black")])
    ax.text(x_label_position, y, custom_formatter.format_tick_label(y),
              fontproperties = GT_America_Mono_Regular,
              fontsize = 8,
              color = '#ffffffff',
              ha = "center",
              va = "center").set_path_effects([pe.withStroke(linewidth = 3, foreground = "black")])
    return(None)

def get_animated_constant_product_liquidity_min_bid_max_ask():
    """
    ### Retrieves the maximum ask and minimum bid values for the `uniswap_v2` constant product liquidity pool simulation.

    ## Returns:
    | Return Name | Type                      | Description                                                                                         |
    |:------------|:--------------------------|:----------------------------------------------------------------------------------------------------|
    | `max_ask`   | `Decimal`                 | The maximum ask value recorded during the `uniswap_v2` constant product liquidity pool simulation.  |
    | `min_bid`   | `Decimal`                 | The minimum bid value recorded during the `uniswap_v2` constant product liquidity pool simulation.  |
    |             | `Tuple[Decimal, Decimal]` | A tuple of `max_ask` and `min_bid`, in that order.                                                  |

    ## Dependencies:
    | Dependency name          | Type      | Description                                                                                        |
    |:-------------------------|:----------|:---------------------------------------------------------------------------------------------------|
    | `uniswap_v2`             | `dict`    | A global dictionary containing the `uniswap_v2` constant product liquidity pool simulation data.   |

    ## Notes:
    - This function retrieves the maximum ask and minimum bid values for the Uniswap v2 constant product liquidity pool simulation from the `uniswap_v2` global variable.
    """
    max_ask = max(uniswap_v2['simulation recorder']['max ask'])
    min_bid = min(uniswap_v2['simulation recorder']['min bid'])
    return(max_ask, min_bid)

def get_animated_constant_product_liquidity_plot_boundaries(
    CASH: Decimal,
    RISK: Decimal,
    max_ask: Decimal, 
    min_bid: Decimal,
    ) -> Tuple[Decimal, Decimal, Decimal, Decimal]:
    """
    ### Calculates the boundaries for the `uniswap_v2` constant product liquidity pool simulation plot.

    ## Parameters:
    | Parameter Name | Type      | Description                                                                              |
    |:---------------|:----------|:-----------------------------------------------------------------------------------------|
    | `CASH`         | `Decimal` | The `CASH` balance of the `uniswap_v2` position.                                         |
    | `RISK`         | `Decimal` | The `RISK` balance of the `uniswap_v2` position.                                         |
    | `max_ask`      | `Decimal` | The pseudo-maximum ask price for `RISK` at any point during the `uniswap_v2` simulation. |
    | `min_bid`      | `Decimal` | The pseudo-maximum ask price for `RISK` at any point during the `uniswap_v2` simulation. |

    ## Returns:
    | Return Name      | Type                                        | Description                                                                                                               |
    |:-----------------|:--------------------------------------------|:--------------------------------------------------------------------------------------------------------------------------|
    | `RISK_at_max_ask`| `Decimal`                                   | The simualated `RISK` balance at the pseudo-maximum ask price for `RISK` at any point during the `uniswap_v2` simulation. |
    | `CASH_at_max_ask`| `Decimal`                                   | The simualated `CASH` balance at the pseudo-maximum ask price for `RISK` at any point during the `uniswap_v2` simulation. |
    | `RISK_at_min_bid`| `Decimal`                                   | The simualated `RISK` balance at the pseudo-minimum bid price for `RISK` at any point during the `uniswap_v2` simulation. |
    | `CASH_at_min_bid`| `Decimal`                                   | The simualated `CASH` balance at the pseudo-minimum bid price for `RISK` at any point during the `uniswap_v2` simulation. |
    |                  | `Tuple[Decimal, Decimal, Decimal, Decimal]` | A tuple of `RISK_at_max_ask`, `CASH_at_max_ask`, `RISK_at_min_bid`, and `CASH_at_min_bid`, in that order.                 |

    ## Notes:
    - This function calculates the plot boundaries for the `uniswap_v2` constant product liquidity pool simulation based on the input parameters.
    """
    CASH_at_max_ask, CASH_at_min_bid = [(CASH*RISK*price)**(ONE/TWO) for price in (max_ask, min_bid)]
    RISK_at_max_ask, RISK_at_min_bid = [CASH*RISK/CASH_at_price for CASH_at_price in (CASH_at_max_ask, CASH_at_min_bid)]
    return(RISK_at_max_ask, CASH_at_max_ask, RISK_at_min_bid, CASH_at_min_bid)

def get_x_arrays_for_constant_product_liquidity_plot(
    RISK_at_max_ask: Decimal, 
    CASH_at_max_ask: Decimal, 
    RISK_at_min_bid: Decimal, 
    CASH_at_min_bid: Decimal 
    ) -> Tuple[np.ndarray, np.ndarray]:
    """
    ### Generates arrays of x-axis values for the constant product liquidity plot.

    ## Parameters:
    | Parameter Name  | Type      | Description                                                                                            |
    |:----------------|:----------|:-------------------------------------------------------------------------------------------------------|
    | `RISK_at_max_ask` | `Decimal` | The simulated `RISK` balance at the pseudo-maximum ask price during the `uniswap_v2` simulation.     |
    | `CASH_at_max_ask` | `Decimal` | The simulated `CASH` balance at the pseudo-maximum ask price during the `uniswap_v2` simulation.     |
    | `RISK_at_min_bid` | `Decimal` | The simulated `RISK` balance at the pseudo-minimum bid price during the `uniswap_v2` simulation.     |
    | `CASH_at_min_bid` | `Decimal` | The simulated `CASH` balance at the pseudo-minimum bid price during the `uniswap_v2` simulation.     |

    ## Returns:
    | Return Name    | Type                            | Description                                                                                                                             |
    |:---------------|:--------------------------------|:----------------------------------------------------------------------------------------------------------------------------------------|
    | `x_array_CASH` | `np.ndarray`                    | An array of x-axis values for the `CASH` balance of the `uniswap_v2` position, ranging between `RISK_at_max_ask` and `RISK_at_min_bid`. |
    | `x_array_RISK` | `np.ndarray`                    | An array of x-axis values for the `RISK` balance of the `uniswap_v2` position, ranging between `CASH_at_min_bid` and `CASH_at_max_ask`. |
    |                | `Tuple[np.ndarray, np.ndarray]` | A tuple of `x_array_CASH` and `x_array_RISK`, in that order.                                                                            |

    ## Notes:
    - This function generates arrays of x-axis values for the constant product liquidity plot based on the input parameters.
    """
    x_array_CASH, x_array_RISK = [np.linspace(float(start), float(end), 200) 
                                  for start, end in ((RISK_at_max_ask, RISK_at_min_bid), (CASH_at_min_bid, CASH_at_max_ask))]
    return(x_array_CASH, x_array_RISK)

def calculate_y_arrays_for_constant_product_liquidity_plot(
    CASH: Decimal, 
    RISK: Decimal,
    x_array_CASH: np.ndarray, 
    x_array_RISK: np.ndarray
    )-> Tuple[np.ndarray, np.ndarray]:
    """
    ### Calculates the y-axis values for the constant product liquidity plot.

    ## Parameters:
    | Parameter Name | Type         | Description                                                                     |
    |:---------------|:-------------|:--------------------------------------------------------------------------------|
    | `CASH`         | `Decimal`    | The `CASH` balance of the `uniswap_v2` position.                                |
    | `RISK`         | `Decimal`    | The `RISK` balance of the `uniswap_v2` position.                                |
    | `x_array_CASH` | `np.ndarray` | An array of x-axis values for the `CASH` balance of the `uniswap_v2` position.  |
    | `x_array_RISK` | `np.ndarray` | An array of x-axis values for the `RISK` balance of the `uniswap_v2` position.  |

    ## Returns:
    | Return Name    | Type                            | Description                                                                                                          |
    |:---------------|:--------------------------------|:---------------------------------------------------------------------------------------------------------------------|
    | `y_array_CASH` | `np.ndarray`                    | An array of y-axis values for the `CASH` balance of the `uniswap_v2` position based on the constant product formula. |
    | `y_array_RISK` | `np.ndarray`                    | An array of y-axis values for the `RISK` balance of the `uniswap_v2` position based on the constant product formula. |
    |                | `Tuple[np.ndarray, np.ndarray]` | A tuple of `y_array_CASH` and `y_array_RISK`, in that order.                                                         |

    ## Notes:
    - This function calculates the y-axis values for the constant product liquidity plot using the input parameters and the constant product formula: `CASH * RISK = invariant`.
    """
    y_array_CASH, y_array_RISK = [float(CASH)*float(RISK)/x_array for x_array in (x_array_CASH, x_array_RISK)]
    return(y_array_CASH, y_array_RISK)

def get_information_for_animated_constant_product_liquidity_curves(
    step: int
    ) -> Tuple[Decimal, Decimal, np.ndarray, np.ndarray, np.ndarray, np.ndarray, Decimal, Decimal]:
    """
    ### Retrieves the necessary information for animating constant product liquidity curves.

    ## Parameters:
    | Parameter Name | Type  | Description                                                                           |
    |:---------------|:------|:--------------------------------------------------------------------------------------|
    | `step`         | `int` | The step of the `uniswap_v2` constant product liquidity pool simulation to visualize. |

    ## Returns:
    | Return Name      | Type                                                                                        | Description                                                                                                                                         |
    |:-----------------|:--------------------------------------------------------------------------------------------|:----------------------------------------------------------------------------------------------------------------------------------------------------|
    | `CASH`           | `Decimal`                                                                                   | The `CASH` balance of the `uniswap_v2` position at the specified simulation step.                                                                   |
    | `RISK`           | `Decimal`                                                                                   | The `RISK` balance of the `uniswap_v2` position at the specified simulation step.                                                                   |
    | `x_array_CASH`   | `np.ndarray`                                                                                | An array of x-axis values for the `CASH` balance of the `uniswap_v2` position.                                                                      |
    | `y_array_CASH`   | `np.ndarray`                                                                                | An array of y-axis values for the `CASH` balance of the `uniswap_v2` position based on the constant product formula.                                |
    | `x_array_RISK`   | `np.ndarray`                                                                                | An array of x-axis values for the `RISK` balance of the `uniswap_v2` position.                                                                      |
    | `y_array_RISK`   | `np.ndarray`                                                                                | An array of y-axis values for the `RISK` balance of the `uniswap_v2` position based on the constant product formula.                                |
    | `RISK_at_min_bid`| `Decimal`                                                                                   | The simualated `RISK` balance at the pseudo-minimum bid price for `RISK` at any point during the `uniswap_v2` simulation.                           |
    | `CASH_at_max_ask`| `Decimal`                                                                                   | The simualated `CASH` balance at the pseudo-maximum ask price for `RISK` at any point during the `uniswap_v2` simulation.                           |
    |                  | `Tuple[Decimal, Decimal, np.ndarray, np.ndarray, np.ndarray, np.ndarray, Decimal, Decimal]` | A tuple of `CASH`, `RISK`, `x_array_CASH`, `y_array_CASH`, `x_array_RISK`, `y_array_RISK`, `RISK_at_min_bid`, and `CASH_at_max_ask`, in that order. |

    ## Notes:
    - This function retrieves the necessary information for animating constant product liquidity curves at the specified simulation step.
    - It calls other helper functions to calculate x and y arrays, as well as to get the `uniswap_v2` position balances.
    """
    CASH, RISK = [uniswap_v2['simulation recorder'][f'{i} balance'][step + 1] for i in ('CASH', 'RISK')]
    max_ask, min_bid = get_animated_constant_product_liquidity_min_bid_max_ask()
    RISK_at_max_ask, CASH_at_max_ask, RISK_at_min_bid, CASH_at_min_bid = get_animated_constant_product_liquidity_plot_boundaries(CASH, RISK, max_ask, min_bid)
    x_array_CASH, x_array_RISK = get_x_arrays_for_constant_product_liquidity_plot(RISK_at_max_ask, CASH_at_max_ask, RISK_at_min_bid, CASH_at_min_bid)
    y_array_CASH, y_array_RISK = calculate_y_arrays_for_constant_product_liquidity_plot(CASH, RISK, x_array_CASH,x_array_RISK)
    return(CASH, RISK, x_array_CASH, y_array_CASH, x_array_RISK, y_array_RISK, RISK_at_min_bid, CASH_at_max_ask)

# # Animation Ax Plotters

def add_carbon_fill_and_bounds(
    ax: plt.Axes,
    x_array: Union[List[datetime], List[int]],
    current_ask_array: List[Decimal],
    current_bid_array: List[Decimal],
    step: Union[int, None] = None
    ) -> None:
    """
    ### Adds carbon bid and ask price bounds, and fill colors to the provided Axes object.

    ## Parameters:
    | Parameter Name          | Type                              | Description                                                                                |
    |:------------------------|:----------------------------------|:-------------------------------------------------------------------------------------------|
    | `ax`                    | `plt.Axes`                        | The Axes object on which the carbon risk bounds and fill colors will be added.             |
    | `x_array`               | `Union[List[datetime], List[int]]`| A list of either datetime or integer values corresponding to each step of the simulation.  |
    | `current_ask_array`     | `List[Decimal]`                   | A list of current ask prices at each step of the simulation.                               |
    | `current_bid_array`     | `List[Decimal]`                   | A list of current bid prices at each step of the simulation.                               |
    | `step`                  | `Union[int, None]`                | The step number up to which data is displayed, None if displaying the full data.           |

    ## Returns:
    None

    ## Dependencies:
    | Dependency name: | Type    | Description                                                                                               |
    |:-----------------|:--------|:----------------------------------------------------------------------------------------------------------|
    | `carbon`         | `dict`  | A `global` dictionary containing the curve parameters and simulation recording for the `carbon` protocol. |

    ## Notes:
    - This function adds dashed lines for the carbon risk lower and upper bounds, as well as the fill colors between current ask prices and risk lower bounds, and current bid prices and risk upper bounds.
    - The risk lower bounds are represented by a dashed red line, and the fill color between the current ask prices and the risk lower bounds is semi-transparent white.
    - The risk upper bounds are represented by a dashed green line, and the fill color between the current bid prices and the risk upper bounds is semi-transparent white.
    - The function can be used for both static visualizations and animations by providing the `step` parameter.
    """
    global carbon
    RISK_range_lower_bound_array = carbon['simulation recorder']['ask lower bound']
    CASH_range_upper_bound_array = carbon['simulation recorder']['bid upper bound']
    if step is not None:
        RISK_range_lower_bound_array = RISK_range_lower_bound_array[:step + 1]
        CASH_range_upper_bound_array = CASH_range_upper_bound_array[:step + 1]
        x_array = x_array[:step + 1]
    else:
        x_array = x_array
    ax.plot(x_array, RISK_range_lower_bound_array, color='#d86371ff', linestyle='--', linewidth=0.5)
    ax.fill_between(x_array, current_ask_array, RISK_range_lower_bound_array, color='#ffffffff', alpha=0.25)
    ax.plot(x_array, CASH_range_upper_bound_array, color='#00b578ff', linestyle='--', linewidth=0.5)
    ax.fill_between(x_array, current_bid_array, CASH_range_upper_bound_array, color='#ffffffff', alpha=0.25)
    return(None)

def add_fill_color_to_ax(
    ax: plt.Axes,
    protocol: str,
    x_array: List[datetime],
    current_ask_array: List[Decimal],
    current_bid_array: List[Decimal],
    max_ask_array: List[Decimal],
    min_bid_array: List[Decimal]
    ) -> None:
    """
    ### Adds fill colors to the visualization summary, based on the protocol used.

    ## Parameters:
    | Parameter Name      | Type             | Description                                                            |
    |:--------------------|:-----------------|:-----------------------------------------------------------------------|
    | `ax`                | `plt.Axes`       | The first subplot on which the fill colors will be added.              |
    | `protocol`          | `str`            | The protocol used in the simulation, either 'uniswap_v2' or other.     |
    | `x_array`           | `List[datetime]` | A list of dates corresponding to each step of the simulation.          |
    | `current_ask_array` | `List[Decimal]`  | A list of current ask prices at each step of the simulation.           |
    | `current_bid_array` | `List[Decimal]`  | A list of current bid prices at each step of the simulation.           |
    | `max_ask_array`     | `List[Decimal]`  | A list of maximum ask prices at each step of the simulation.           |
    | `min_bid_array`     | `List[Decimal]`  | A list of minimum bid prices at each step of the simulation.           |

    ## Returns:
    None

    ## Notes:
    - This function adds fill colors to the visualization summary, depending on the protocol used.
    - For the `uniswap_v2` protocol, the region between the current ask prices and the y-axis maximum is filled with a red color, and the region between the current bid prices and the y-axis minimum is filled with a green color.
    - For `carbon` and `uniswap_v3` protocols, the region between the current ask prices and the maximum ask prices is filled with a red color, and the region between the current bid prices and the minimum bid prices is filled with a green color.
    - The fill colors have an alpha value of 0.25 for transparency.
    """
    if protocol == 'uniswap_v2':
        ax.fill_between(x_array, current_ask_array, ax.get_ylim()[1], color = '#d86371ff', alpha = 0.25)
        ax.fill_between(x_array, current_bid_array, ax.get_ylim()[0], color = '#00b578ff', alpha = 0.25)
    else:
        ax.fill_between(x_array, current_ask_array, max_ask_array, color = '#d86371ff', alpha = 0.25)
        ax.fill_between(x_array, current_bid_array, min_bid_array, color = '#00b578ff', alpha = 0.25)
    return(None)

def plot_animated_price_chart_ax(
    ax: mpl.AxesSubplot, 
    protocol: str,
    step: int, 
    custom_formatter
    ) -> mpl.AxesSubplot:
    """
    ### Plots an animated price chart on a given `ax` for the specified `protocol` and `step` in the simulation.

    ## Parameters:
    | Parameter Name     | Type                      | Description                                                                                 |
    |:-------------------|:--------------------------|:--------------------------------------------------------------------------------------------|
    | `ax`               | `mpl.AxesSubplot`         | The subplot to plot the chart on.                                                           |
    | `protocol`         | `str`                     | The name of the protocol to plot the chart for (`carbon`, `uniswap_v2`, or `uniswap_v3`).   |
    | `step`             | `int`                     | The step number of the simulation to plot the chart for.                                    |
    | `custom_formatter` | `mpl.ticker.Formatter`    | The custom formatter to use for y-axis tick labels.                                         |

    ## Returns:
    | Return Name  | Type                | Description                                             |
    |:-------------|:--------------------|:--------------------------------------------------------|
    | `ax`         | `mpl.AxesSubplot`   | The subplot with the animated price chart plot on it.   |

    ## Dependencies:
    | Dependency Name                               | Type       | Description                                                                        |
    |:----------------------------------------------|:-----------|:-----------------------------------------------------------------------------------|
    | `get_information_for_animated_price_chart_ax` | `function` | Returns the data required for generating an animated price chart.                  |
    | `get_date_labels_for_animation`               | `function` | Returns a list of formatted dates for the x-axis labels of an animated chart.      |
    | `add_carbon_fill_and_bounds`                  | `function` | Adds carbon bid and ask price bounds, and fill colors to the provided Axes object. |
    | `add_fill_color_to_ax`                        | `function` | Adds fill colors to the visualization summary, based on the protocol used.         |
    """
    (step_array, date_array, price_array, max_ask_array, current_ask_array, 
     current_bid_array, min_bid_array, min_y_tick, max_y_tick) = get_information_for_animated_price_chart_ax(protocol, step)
    date_labels = get_date_labels_for_animation(date_array)
    ax.set_title('Price Chart', fontproperties = GT_America_Standard_Light, fontsize = 12)
    ax.set_ylabel(f'price of {TOKEN_PAIR["RISK"]} ({TOKEN_PAIR["CASH"]} per {TOKEN_PAIR["RISK"]})', fontproperties = GT_America_Standard_Light, fontsize = 10)
    ax.set_xticks(step_array)
    ax.set_xticklabels(date_labels, rotation = 0, ha = 'center')
    ax.xaxis.set_major_locator(MaxNLocator(6))
    ax.set_ylim(min_y_tick, max_y_tick)
    ax.plot(step_array, price_array, color = '#ffffffff')
    ax.yaxis.set_major_formatter(custom_formatter)
    ax.plot(step_array, current_bid_array, color = '#00b578ff')
    ax.plot(step_array, current_ask_array, color = '#d86371ff')
    if protocol != 'uniswap_v2':
        ax.plot(step_array, min_bid_array, color = '#00b578ff')
        ax.plot(step_array, max_ask_array, color = '#d86371ff')
    if protocol == 'carbon':
        add_carbon_fill_and_bounds(ax, step_array, current_ask_array, current_bid_array, step)
    add_fill_color_to_ax(ax, protocol, step_array, current_ask_array, current_bid_array, max_ask_array, min_bid_array) 
    return(ax)

def plot_animated_performance_vs_hodl_ax(
    ax: mpl.AxesSubplot, 
    protocol: str,
    step: int, 
    ) -> mpl.AxesSubplot:
    """
    Plots an animated performance vs HODL chart on the specified `ax` object for the given `protocol` and `step` of the simulation.

    ## Parameters:
    | Parameter Name | Type                 | Description                                                                                              |
    |:---------------|:---------------------|:---------------------------------------------------------------------------------------------------------|
    | `ax`           | `mpl.AxesSubplot`    | The AxesSubplot object on which the performance vs HODL chart is to be plotted.                          |
    | `protocol`     | `str`                | The name of the protocol for which the chart is to be plotted (`carbon`, `uniswap_v2`, or `uniswap_v3`). |
    | `step`         | `int`                | The step number of the simulation for which the chart is to be plotted.                                  |

    ## Returns:
    | Return Name   | Type                 | Description                                                   |
    |:--------------|:---------------------|:--------------------------------------------------------------|
    | `ax`          | `mpl.AxesSubplot`    | The AxesSubplot object on which the chart has been plotted.    |

    ## Dependencies:
    | Dependency Name                                       | Type       | Description                                                                     |
    |:------------------------------------------------------|:-----------|:--------------------------------------------------------------------------------|
    | `get_information_for_animated_performance_vs_hodl_ax` | `function` | Returns the data required for generating an animated performance vs hodl chart. |

    """
    step_array, date_array, performance_array, min_y_tick, max_y_tick = get_information_for_animated_performance_vs_hodl_ax(protocol, step)
    date_labels = get_date_labels_for_animation(date_array)
    ax.set_title('Performance vs HODL', fontproperties = GT_America_Standard_Light, fontsize = 12)
    ax.set_ylabel(f'Portfolio value vs HODL', fontproperties = GT_America_Standard_Light, fontsize = 10)
    ax.set_xticks(step_array)
    ax.set_xticklabels(date_labels, rotation = 0, ha = 'center')
    ax.xaxis.set_major_locator(MaxNLocator(6))
    ax.set_ylim(min_y_tick, max_y_tick)
    ax.yaxis.set_major_formatter(PercentFormatter(xmax = 100, decimals = 1, symbol = '%'))
    ax.plot(step_array, performance_array, color = '#ffffffff')
    return(ax)

def plot_animated_liquidity_depth_chart_ax(
    ax: mpl.AxesSubplot, 
    protocol: str,
    step: int, 
    custom_formatter
    ) -> mpl.AxesSubplot:
    """
    Plots an animated liquidity depth chart for the specified `protocol` at the given `step` of the simulation.

    ## Parameters:
    | Parameter Name     | Type                | Description                                                                               |
    |:-------------------|:--------------------|:------------------------------------------------------------------------------------------|
    | `ax`               | `mpl.AxesSubplot`   | The matplotlib axis to plot the liquidity depth chart on.                                 |
    | `protocol`         | `str`               | The name of the protocol to plot the chart for (`carbon`, `uniswap_v2`, or `uniswap_v3`). |
    | `step`             | `int`               | The step number of the simulation to plot the chart for.                                  |
    | `custom_formatter` | `ScalarFormatter`   | A formatter object for the x-axis labels.                                                 |
    
    ## Returns:
    | Return Name | Type               | Description                                                           |
    |:------------|:-------------------|:----------------------------------------------------------------------|
    | `ax`        | `mpl.AxesSubplot`  | The matplotlib axis containing the plotted liquidity depth chart.     |

    ## Dependencies:
    | Dependency Name                                         | Type        | Description                                                                                              |
    |:--------------------------------------------------------|:------------|:---------------------------------------------------------------------------------------------------------|
    | `PROTOCOLS`                                             | `dict`      | A `global` dictionary with each protocol name string as keys.                                            |
    | `get_information_for_animated_liquidity_depth_chart_ax` | `function`  | Returns the data required for generating an animated liquidity depth chart for the specified `protocol`. |
    """
    (x_ticks, 
     market_price_line_x, market_price_line_y, 
     bid_price_array, bid_depth_array, 
     ask_price_array, ask_depth_array) = get_information_for_animated_liquidity_depth_chart_ax(protocol, step)   
    ax.set_title('Liquidity Depth Chart', fontproperties = GT_America_Standard_Light, fontsize = 12)
    ax.set_xlabel(f'Price of {TOKEN_PAIR["RISK"]} ({TOKEN_PAIR["CASH"]} per {TOKEN_PAIR["RISK"]}, $\log_2$ scale)', fontproperties = GT_America_Standard_Light, fontsize = 10)
    ax.set_ylabel(f'liquidity depth ({TOKEN_PAIR["CASH"]} equiv.)', fontproperties = GT_America_Standard_Light, fontsize = 10)
    ax.set_xscale('log', base = 2)
    ax.xaxis.set_major_formatter(ScalarFormatter())
    ax.set_xticks(x_ticks)
    ax.plot(market_price_line_x, market_price_line_y, color = '#ffffffff')
    ax.plot(bid_price_array, bid_depth_array, color = '#00b578ff')
    ax.fill_between(bid_price_array, bid_depth_array, color = '#00b578ff', alpha = 0.25)
    ax.plot(ask_price_array, ask_depth_array, color = '#d86371ff')
    ax.fill_between(ask_price_array, ask_depth_array, color = '#d86371ff', alpha = 0.25)
    ax.xaxis.set_major_formatter(custom_formatter)
    ax.text(market_price_line_x[-1],
            market_price_line_y[-1],
            custom_formatter.format_tick_label(market_price_line_x[-1]),
            fontproperties = GT_America_Mono_Regular,
            fontsize = 8,
            color = '#ffffffff',
            ha = "center",
            va = "center").set_path_effects([pe.withStroke(linewidth = 3, foreground = "black")])
    return(ax)

def plot_individual_concentrated_liquidity_curve_ax(
    ax: mpl.AxesSubplot, 
    x_array: np.ndarray, 
    y_array: np.ndarray, 
    x_label: str, 
    y_label: str, 
    x_int: float, 
    y_int: float,
    custom_formatter: CustomFormatter
    ) -> mpl.AxesSubplot:
    """
    ### Plots an individual concentrated liquidity curve subplot.

    ## Parameters:
    | Parameter Name    | Type                 | Description                                                                         |
    |:------------------|:---------------------|:------------------------------------------------------------------------------------|
    | `ax`              | `mpl.AxesSubplot`    | The matplotlib AxesSubplot object for the concentrated liquidity curve subplot.     |
    | `x_array`         | `np.ndarray`         | The array of x values for the concentrated liquidity curve.                         |
    | `y_array`         | `np.ndarray`         | The array of y values for the concentrated liquidity curve.                         |
    | `x_label`         | `str`                | The x-axis label for the concentrated liquidity curve subplot.                      |
    | `y_label`         | `str`                | The y-axis label for the concentrated liquidity curve subplot.                      |
    | `x_int`           | `float`              | The x-intercept for the concentrated liquidity curve.                               |
    | `y_int`           | `float`              | The y-intercept for the concentrated liquidity curve.                               |
    | `custom_formatter`| `CustomFormatter`    | The custom formatter object to be used for formatting the x and y axis tick labels. |

    ## Returns:
    | Return Name       | Type                 | Description                                                                                                        |
    |:------------------|:---------------------|:-------------------------------------------------------------------------------------------------------------------|
    | `ax`              | `mpl.AxesSubplot`    | The updated matplotlib AxesSubplot object with the plotted concentrated liquidity curve and formatting applied.    |

    ## Notes:
    - This function plots the provided x and y arrays onto the input AxesSubplot object (`ax`), applying the specified labels, axis limits, and custom formatter.
    - The plot's grid lines and tick labels are styled according to the specified font properties and settings.
    """
    ax.plot(x_array, y_array, color = 'white')
    ax.set_xlabel(x_label, fontproperties = GT_America_Standard_Light, fontsize = 10)
    ax.set_ylabel(y_label, fontproperties = GT_America_Standard_Light, fontsize = 10)
    ax.set_xlim(0, x_int*SIX/FIVE)
    ax.set_ylim(0, y_int*SIX/FIVE)
    ax.grid(True, linestyle = '--', color = 'white', linewidth = 0.5)
    ax.xaxis.set_major_formatter(custom_formatter)
    ax.yaxis.set_major_formatter(custom_formatter)
    for axis_label in [ax.xaxis, ax.yaxis]:
        for label in axis_label.get_ticklabels():
            label.set_fontproperties(GT_America_Mono_Regular)
            label.set_fontsize(10)
    return(ax)

def plot_animated_concentrated_liquidity_curve_axs(
    ax1: mpl.AxesSubplot,
    ax2: mpl.AxesSubplot,
    protocol: str,
    step: int
    ) -> Tuple[mpl.AxesSubplot, mpl.AxesSubplot]:
    """
    ### Plots animated concentrated liquidity curve subplots for the given protocol and step.

    ## Parameters:
    | Parameter Name | Type              | Description                                                                          |
    |:---------------|:------------------|:-------------------------------------------------------------------------------------|
    | `ax1`          | `mpl.AxesSubplot` | The first `matplotlib.AxesSubplot` object to plot the concentrated liquidity curve.  |
    | `ax2`          | `mpl.AxesSubplot` | The second `matplotlib.AxesSubplot` object to plot the concentrated liquidity curve. |
    | `protocol`     | `str`             | The protocol for which to plot the curves (e.g., 'Uniswap', 'Sushiswap').            |
    | `step`         | `int`             | The step of the simulation corresponding to this frame of the animation.             |

    ## Returns:
    | Return Name | Type                                      | Description                                                                                                 |
    |:------------|:------------------------------------------|:------------------------------------------------------------------------------------------------------------|
    | `ax1`       | `mpl.AxesSubplot`                         | The modified first `matplotlib.AxesSubplot` object with the plotted curve.                                  |
    | `ax2`       | `mpl.AxesSubplot`                         | The modified second `matplotlib.AxesSubplot` object with the plotted curve.                                 |
    |             | `Tuple[mpl.AxesSubplot, mpl.AxesSubplot]` | A tuple of the modified `matplotlib.AxesSubplot` objects (`ax1`, `ax2`, in that order) with plotted curves. |

    ## Dependencies:
    | Function                                                     | Type       | Description                                                                                                                                   |
    |:-------------------------------------------------------------|:-----------|:----------------------------------------------------------------------------------------------------------------------------------------------|
    | `get_information_for_animated_concentrated_liquidity_curves` | `function` | Retrieves the data needed to plot the curves.                                                                                                 |
    | `get_animated_concentrated_liquidity_curve_fill_colors`      | `function` | Retrieves the fill colors for the curve regions.                                                                                              |
    | `get_animated_concentrated_liquidity_curve_axis_labels`      | `function` | Retrieves the axis labels for the subplots.                                                                                                   |
    | `plot_individual_concentrated_liquidity_curve_ax`            | `function` | Plots an individual concentrated liquidity curve on an AxesSubplot object.                                                                    |
    | `add_lines_to_animated_liquidity_curve_ax`                   | `function` | Adds dashed lines to the concentrated liquidity curve subplot at the specified (x, y) point.                                                  |
    | `add_text_labels_to_animated_liquidity_curve_ax`             | `function` | Adds text labels to the concentrated liquidity curve subplot at the specified (x, y) point.                                                   |
    | `add_fill_color_to_animated_liquidity_curve_ax`              | `function` | Adds fill color to the regions of the concentrated liquidity curve subplot.                                                                   |
    | `CustomFormatter`                                            | `class`    | A custom tick-label formatter for `matplotlib` that allows plots to swith dynamically between scientific, and fixed-point notation as needed. |

    ## Notes:
    - This function is responsible for plotting the animated concentrated liquidity curve subplots for a given protocol and simulation step.
    - The function calls several other helper functions to retrieve the data needed to configure and plot the curves.
    - The output of this function is two modified `matplotlib.AxesSubplot` objects with the plotted curves and styles.
    - The `mpl.AxesSubplot` objects are passed as arguments to the function, along with the protocol name and the step of the simulation corresponding to this frame of the animation.
    - The function retrieves the necessary information for plotting the curves by calling the `get_information_for_animated_concentrated_liquidity_curves` helper function.
    - The fill colors for the curve regions are retrieved using the `get_animated_concentrated_liquidity_curve_fill_colors` helper function.
    - The axis labels for the subplots are retrieved using the `get_animated_concentrated_liquidity_curve_axis_labels` helper function.
    - The subplots are then plotted using the `plot_individual_concentrated_liquidity_curve_ax` helper function, which is called twice (one for each subplot).
    - The function then adds lines and text labels to the subplots using the `add_lines_to_concentrated_liquidity_curve_ax` and `add_text_labels_to_concentrated_liquidity_curve_ax` helper functions.
    - Finally, the function adds fill color to the regions of the concentrated liquidity curve subplots using the `add_fill_color_to_concentrated_liquidity_curve_ax` helper function.
    - The `CustomFormatter` class is used to provide a custom tick-label formatter for `matplotlib`, which allows plots to switch dynamically between scientific and fixed-point notation as needed.
    """
    x_array_CASH, y_array_CASH, x_CASH, y_CASH, x_array_RISK, y_array_RISK, x_RISK, y_RISK, x_int_CASH, y_int_CASH, x_int_RISK, y_int_RISK = get_information_for_animated_concentrated_liquidity_curves(protocol, step)
    ax1_CASH_fill_color, ax1_RISK_fill_color, ax2_CASH_fill_color, ax2_RISK_fill_color = get_animated_liquidity_curve_fill_colors(protocol)
    ax1_y_label, ax2_y_label, ax1_x_label, ax2_x_label = get_animated_concentrated_liquidity_curve_axis_labels(protocol)
    custom_formatter = CustomFormatter()
    axis_args = [(ax1, x_array_CASH, y_array_CASH, ax1_x_label, ax1_y_label, x_int_CASH, y_int_CASH, custom_formatter),
                 (ax2, x_array_RISK, y_array_RISK, ax2_x_label, ax2_y_label, x_int_RISK, y_int_RISK, custom_formatter)]
    ax1, ax2 = [plot_individual_concentrated_liquidity_curve_ax(*args) for args in axis_args]
    for axis, x, y in [(ax1, x_CASH, y_CASH), (ax2, x_RISK, y_RISK)]:
        add_lines_to_animated_liquidity_curve_ax(axis, x, y, span_full = True)
        add_text_labels_to_animated_liquidity_curve_ax(axis, x, y, custom_formatter, span_full = True)
    add_fill_color_to_animated_liquidity_curve_ax(ax1, x_array_CASH, y_array_CASH, x_CASH, y_CASH, ax1_RISK_fill_color, ax1_CASH_fill_color)
    add_fill_color_to_animated_liquidity_curve_ax(ax2, x_array_RISK, y_array_RISK, x_RISK, y_RISK, ax2_CASH_fill_color, ax2_RISK_fill_color)
    return(ax1, ax2)

def plot_individual_constant_product_liquidity_curve_ax(
    ax: mpl.AxesSubplot, 
    x_array: np.ndarray, 
    y_array: np.ndarray, 
    x_label: str, 
    y_label: str, 
    x_at_price: float, 
    y_at_price: float,
    custom_formatter: CustomFormatter
    ) -> mpl.AxesSubplot:
    """
    ### Plots an individual constant product liquidity curve.

    ## Parameters:
    | Parameter Name     | Type                    | Description                                                          |
    |:-------------------|:------------------------|:---------------------------------------------------------------------|
    | `ax`               | `mpl.AxesSubplot`       | The matplotlib axes to plot on.                                      |
    | `x_array`          | `np.ndarray`            | An array of x-axis values for the liquidity curve.                   |
    | `y_array`          | `np.ndarray`            | An array of y-axis values for the liquidity curve.                   |
    | `x_label`          | `str`                   | The label for the x-axis.                                            |
    | `y_label`          | `str`                   | The label for the y-axis.                                            |
    | `x_at_price`       | `Decimal`               | The maximum x-axis value to display.                                 |
    | `y_at_price`       | `Decimal`               | The maximum y-axis value to display.                                 |
    | `custom_formatter` | `CustomFormatter`       | The custom formatter to use for the x- and y-axis tick labels.       |    
    
    ## Returns:
    | Return Name | Type              | Description                                                            |
    |:------------|:------------------|:-----------------------------------------------------------------------|
    | `ax`        | `mpl.AxesSubplot` | The matplotlib axes with the plotted constant product liquidity curve. |

    ## Notes:
    - This function plots an individual constant product liquidity curve using the input x- and y-axis values.
    """
    ax.plot(x_array, y_array, color = 'white')
    ax.set_xlabel(x_label, fontproperties = GT_America_Standard_Light, fontsize = 10)
    ax.set_ylabel(y_label, fontproperties = GT_America_Standard_Light, fontsize = 10)
    ax.set_xlim(0, x_at_price)
    ax.set_ylim(0, y_at_price)
    ax.grid(True, linestyle = '--', color = 'white', linewidth = 0.5)
    ax.xaxis.set_major_formatter(custom_formatter)
    ax.yaxis.set_major_formatter(custom_formatter)
    for axis_label in [ax.xaxis, ax.yaxis]:
        for label in axis_label.get_ticklabels():
            label.set_fontproperties(GT_America_Mono_Regular)
            label.set_fontsize(10)
    return(ax)

def plot_animated_constant_product_liquidity_curve_axs(
    ax1: mpl.AxesSubplot,
    ax2: mpl.AxesSubplot,
    protocol: str,
    step: int
    ) -> Tuple[mpl.AxesSubplot, mpl.AxesSubplot]:
    
    """
    ### Plots animated constant product liquidity curve subplots for the given protocol and step.

    ## Parameters:
    | Parameter Name | Type              | Description                                                                              |
    |:---------------|:------------------|:-----------------------------------------------------------------------------------------|
    | `ax1`          | `mpl.AxesSubplot` | The first `matplotlib.AxesSubplot` object to plot the constant product liquidity curve.  |
    | `ax2`          | `mpl.AxesSubplot` | The second `matplotlib.AxesSubplot` object to plot the constant product liquidity curve. |
    | `protocol`     | `str`             | The protocol for which to plot the curves (e.g., 'Uniswap', 'Sushiswap').                |
    | `step`         | `int`             | The step of the simulation corresponding to this frame of the animation.                 |

    ## Returns:
    | Return Name | Type                                      | Description                                                                                                 |
    |:------------|:------------------------------------------|:------------------------------------------------------------------------------------------------------------|
    | `ax1`       | `mpl.AxesSubplot`                         | The modified first `matplotlib.AxesSubplot` object with the plotted curve.                                  |
    | `ax2`       | `mpl.AxesSubplot`                         | The modified second `matplotlib.AxesSubplot` object with the plotted curve.                                 |
    |             | `Tuple[mpl.AxesSubplot, mpl.AxesSubplot]` | A tuple of the modified `matplotlib.AxesSubplot` objects (`ax1`, `ax2`, in that order) with plotted curves. |

    ## Dependencies:
    | Function                                                             | Type       | Description                                                                                                                                    |
    |:---------------------------------------------------------------------|:-----------|:-----------------------------------------------------------------------------------------------------------------------------------------------|
    | `get_information_for_animated_constant_product_liquidity_curves`     | `function` | Retrieves the data needed to plot the curves.                                                                                                  |
    | `get_animated_liquidity_curve_fill_colors`                           | `function` | Returns the fill colors for the animated concentrated liquidity curve.                                                                         |
    | `get_animated_concentrated_liquidity_curve_axis_labels`              | `function` | Retrieves the axis labels for the subplots.                                                                                                    |
    | `plot_individual_constant_product_liquidity_curve_ax`                | `function` | Plots an individual constant product liquidity curve on an `AxesSubplot` object.                                                               |
    | `add_lines_to_animated_liquidity_curve_ax`                           | `function` | Adds dashed lines to the constant product liquidity curve subplot at the specified (x, y) point.                                               |
    | `add_text_labels_to_animated_liquidity_curve_ax`                     | `function` | Adds text labels to the constant product liquidity curve subplot at the specified (x, y) point.                                                |
    | `add_fill_color_to_animated_liquidity_curve_ax`                      | `function` | Adds fill color to the regions of the constant product liquidity curve subplot.                                                                |
    | `CustomFormatter`                                                    | `class`    | A custom tick-label formatter for `matplotlib` that allows plots to switch dynamically between scientific, and fixed-point notation as needed. |
    
    ## Notes:
    - This function is responsible for plotting the animated constant product liquidity curve subplots for a given protocol and simulation step.
    - The function calls several other helper functions to retrieve the data needed to configure and plot the curves.
    - The output of this function is two modified `matplotlib.AxesSubplot` objects with the plotted curves and styles.
    - The `mpl.AxesSubplot` objects are passed as arguments to the function, along with the protocol name and the step of the simulation corresponding to this frame of the animation.
    - The function retrieves the necessary information for plotting the curves by calling the get_information_for_animated_constant_product_liquidity_curves helper function.
    - The fill colors for the curve regions are retrieved using the `get_animated_liquidity_curve_fill_colors` helper function.
    - The axis labels for the subplots are retrieved using the `get_animated_concentrated_liquidity_curve_axis_labels` helper function.
    - The subplots are then plotted using the `plot_individual_constant_product_liquidity_curve_ax` helper function, which is called twice (one for each each subplot).
    - The function then adds lines and text labels to the subplots using the `add_lines_to_concentrated_liquidity_curve_ax` and `add_text_labels_to_concentrated_liquidity_curve_ax` helper functions.
    - Finally, the function adds fill color to the regions of the concentrated liquidity curve subplots using the `add_fill_color_to_animated_liquidity_curve_ax` helper function.
    """
    CASH, RISK, x_array_CASH, y_array_CASH, x_array_RISK, y_array_RISK, RISK_at_min_bid, CASH_at_max_ask = get_information_for_animated_constant_product_liquidity_curves(step)
    ax1_CASH_fill_color, ax1_RISK_fill_color, ax2_CASH_fill_color, ax2_RISK_fill_color = get_animated_liquidity_curve_fill_colors(protocol)
    ax1_y_label, ax2_y_label, ax1_x_label, ax2_x_label = get_animated_concentrated_liquidity_curve_axis_labels(protocol)
    custom_formatter = CustomFormatter()
    axis_args = [(ax1, x_array_CASH, y_array_CASH, ax1_x_label, ax1_y_label, RISK_at_min_bid, CASH_at_max_ask, custom_formatter),
                 (ax2, x_array_RISK, y_array_RISK, ax2_x_label, ax2_y_label, CASH_at_max_ask, RISK_at_min_bid, custom_formatter)]
    ax1, ax2 = [plot_individual_constant_product_liquidity_curve_ax(*args) for args in axis_args]
    for axis, x, y in [(ax1, RISK, CASH), (ax2, CASH, RISK)]:
        add_lines_to_animated_liquidity_curve_ax(axis, x, y, span_full = True)
        add_text_labels_to_animated_liquidity_curve_ax(axis, x, y, custom_formatter, span_full = True)
    add_fill_color_to_animated_liquidity_curve_ax(ax1, x_array_CASH, y_array_CASH, RISK, CASH, ax1_RISK_fill_color, ax1_CASH_fill_color)
    add_fill_color_to_animated_liquidity_curve_ax(ax2, x_array_RISK, y_array_RISK, CASH, RISK, ax2_CASH_fill_color, ax2_RISK_fill_color)
    return(ax1, ax2)

def plot_bar_chart_ax(
    ax: mpl.AxesSubplot, 
    protocol: str,
    step: int, 
    type: str
    )-> mpl.AxesSubplot:
    """
    ### Plots an animated bar chart for the specified `protocol` at the given `step` of the simulation.
    
    ## Parameters:
    | Parameter Name | Type                | Description                                                                             |
    |:---------------|:--------------------|:----------------------------------------------------------------------------------------|
    | `ax`           | `mpl.AxesSubplot`   | The matplotlib AxesSubplot to plot the chart on.                                        |
    | `protocol`     | `str`               | The name of the protocol to get the data for (`carbon`, `uniswap_v2`, or `uniswap_v3`). |
    | `step`         | `int`               | The step number of the simulation.                                                      |
    | `type`         | `str`               | The type of data to plot (`fees` or `token_balances`).                                  |
    
    ## Returns:
    | Return Name | Type                | Description                                                           |
    |:------------|:--------------------|:----------------------------------------------------------------------|
    | `ax`        | `mpl.AxesSubplot`   | The matplotlib AxesSubplot with the animated bar chart plotted on it. |
    
    ## Dependencies:
    | Dependency Name                       | Type       | Description                                                                                                                 |
    |:--------------------------------------|:-----------|:----------------------------------------------------------------------------------------------------------------------------|
    | `TOKEN_PAIR`                          | `dict`     | A `global` dictionary containing `CASH` and `RISK` strings as keys, and the corresponding token ticker strings as values.   |
    | `get_information_for_bar_chart`       | `function` | Returns the data required for generating an animated bar chart.                                                             |
    
    ## Notes:
    - This function is a general-purpose function to generate either an animated token balances chart or an animated cumulative fee earnings chart for a given protocol, based on the `type` parameter.
    - It provides a flexible interface for creating such plots and reduces code redundancy by combining similar functionalities from the earlier functions `plot_animated_fee_earnings_ax` and `plot_token_balances_ax` into a single function.
    - It takes a string `type` parameter which determines what type of plot will be generated.
    - The function uses a helper function, `get_information_for_bar_chart`, to get the required data for plotting. This function must be defined in the same scope as this function.
    - The `type` parameter must be one of `fees` or `token_balances`, otherwise, a ValueError will be raised.
    """
    global TOKEN_PAIR
    data, denomination, title, ylabel = get_information_for_bar_chart(protocol, step, type)
    ax.set_title(title, fontproperties = GT_America_Standard_Light, fontsize = 12)
    ax.set_xlabel('Token Denomination', fontproperties = GT_America_Standard_Light, fontsize = 10)
    ax.set_ylabel(ylabel, fontproperties = GT_America_Standard_Light, fontsize = 10)
    ax.bar(range(len(data)), data, 
           color = [(0.0, 0.7098039215686275, 0.47058823529411764, 0.25), 
                    (0.8470588235294118, 0.38823529411764707, 0.44313725490196076, 0.25)], 
           edgecolor = ['#00b578ff', '#d86371ff'])
    ax.set_xticks(range(len(data)))
    ax.set_xticklabels(denomination)
    return(ax)

# # Main Animation Functions

def get_animation_frame(
    animation_type: str,
    protocol: str,
    step: int,
    ax: np.ndarray
    ) -> np.ndarray:
    """
    ### Returns a matplotlib figure with a frame at the specified `step` of the simulation for the specified `protocol`.

    ## Parameters:
    | Parameter Name   | Type            | Description                                                                                                   |
    |:-----------------|:----------------|:--------------------------------------------------------------------------------------------------------------|
    | `animation_type` | `str`           | The type of animation being requested (either 'liquidity_depth_animation' or 'invariant_function_animation'). |
    | `protocol`       | `str`           | The name of the `protocol` to generate the frame for.                                                         |
    | `step`           | `int`           | The `step` number of the simulation.                                                                          |
    | `ax`             | `numpy.ndarray` | The array of axes for the figure. The axes must be organized as a 2x2 grid.                                   |

    ## Returns:
    | Return Name   | Type            | Description                                                               |
    |:--------------|:----------------|:--------------------------------------------------------------------------|
    | `ax`          | `numpy.ndarray` | The matplotlib figure axes, representing a single frame in the animation. |

    ## Dependencies:
    | Dependency Name                  | Type                          | Description                                                                                                                                   |
    |:---------------------------------|:------------------------------|:----------------------------------------------------------------------------------------------------------------------------------------------|
    | `TOKEN_PAIR`                     | `dict`                        | A `global` dictionary containing `CASH` and `RISK` strings as keys, and the corresponding token ticker strings as values.                     |
    | `GT_America_Mono_Regular`        | `font_manager.FontProperties` | Font for the x-axis and y-axis tick labels. Created as a global variable from the appropriate TrueType font file (`.ttf`).                    |
    | `GT_America_Standard_Light`      | `font_manager.FontProperties` | Font for the x-axis and y-axis labels. Created as a global variable from the appropriate TrueType font file (`.ttf`).                         |
    | `GT_America_Extended_Medium`     | `font_manager.FontProperties` | Font for the figure title. Created as a global variable from the appropriate TrueType font file (`.ttf`).                                     |
    | `get_animation_plot_information` | `function`                    | A function to retrieve data for the animation.                                                                                                |
    | `get_date_labels_for_animation`  | `function`                    | Returns a list of date labels formatted as strings for use in annotating the x-axis of the animation plots.                                   |
    | `CustomFormatter`                | `class`                       | A custom tick-label formatter for `matplotlib` that allows plots to swith dynamically between scientific, and fixed-point notation as needed. |
    | `calculate_performance_vs_hodl`  | `function`                    | Calculates the protocol's performance against holding the asset over time.                                                                    |
    | `calculate_liquidity_depth`      | `function`                    | Calculates the liquidity depth chart for the protocol at the given step.                                                                      |
    | `calculate_fee_earnings`         | `function`                    | Calculates the protocol's fee earnings at the given step.                                                                                     |
    | `get_liquidity_range`            | `function`                    | Gets the range of liquidity values for the liquidity depth chart.                                                                             |

    ## Notes:
    - This function uses global variables `TOKEN_PAIR` and `PROTOCOLS` to retrieve data for the animation.
    - The generated animation includes four subplots to show the price chart, performance vs HODL, liquidity depth chart, and fee earnings of the protocol over time.
    - The animation is saved as an MP4 file.
    """
    global TOKEN_PAIR
    custom_formatter = CustomFormatter()
    plt.style.use("dark_background")
    for axis in ax.flat:
        axis.clear()
        axis.patch.set_alpha(0)  # Set the background to transparent
        axis.grid(True, linestyle = '--', color = 'white', linewidth = 0.5)
    plot_animated_price_chart_ax(ax[0,0], protocol, step, custom_formatter)
    plot_animated_performance_vs_hodl_ax(ax[0,1], protocol, step)
    if animation_type == 'liquidity_depth_animation':
        plot_animated_liquidity_depth_chart_ax(ax[1,0], protocol, step, custom_formatter)
        plot_bar_chart_ax(ax[1,1], protocol, step, 'fees')
    elif animation_type == 'token_balance_cash_basis':
        plot_bar_chart_ax(ax[1,0], protocol, step, 'token_balances')
        plot_bar_chart_ax(ax[1,1], protocol, step, 'fees')
    elif animation_type == 'invariant_function_animation':
        if protocol == 'uniswap_v2':
            plot_animated_constant_product_liquidity_curve_axs(ax[1,0], ax[1,1], protocol, step)
        else:
            plot_animated_concentrated_liquidity_curve_axs(ax[1,0], ax[1,1], protocol, step)
    else:
        raise ValueError("Invalid animation type. Allowed values are 'liquidity_depth_animation' and 'invariant_function_animation'.")  
    axes_list = [ax[i, j] for i in range(2) for j in range(2)]
    for current_ax in axes_list:
        for label in [label for axis in [current_ax.xaxis, current_ax.yaxis] for label in axis.get_ticklabels()]:
            label.set_fontproperties(GT_America_Mono_Regular)
            label.set_fontsize(10)
    return(ax)

def draw_progress_bar(
    fig: plt.Figure, 
    frame_number: int, 
    num_frames: int
    ):
    """
    ### Draws a progress bar on the animated figures.

    ## Parameters:
    | Parameter Name   | Type         | Description                                                       |
    |:-----------------|:-------------|:------------------------------------------------------------------|
    | `fig`            | `matplotlib.figure.Figure` | The figure on which to draw the progress bar.       |
    | `frame_number`   | `int`        | The current frame number.                                         |
    | `num_frames`     | `int`        | The total number of frames in the animation.                      |

    ## Returns:
    None

    ## Notes:
    - This function adds a progress bar to the bottom of the specified `mpl.figure.Figure` object, `fig`. 
    - The progress bar updates based on the `frame_number` parameter, which should range from 0 to `num_frames`. 
    - At each call, the function first checks for and removes any preexisting progress bar, before drawing a new one. 
    - The progress bar consists of a white filled rectangle (representing the completed progress) inside a white outline rectangle (representing the total duration of the animation). The progress bar does not have an axis.
    """
    if 'progress_bar_ax' in fig.axes:
        for ax in fig.axes:
            if ax.get_label() == 'progress_bar_ax':
                fig.delaxes(ax)
                break
    progress_bar_ax = fig.add_axes([0.1, 0.02, 0.8, 0.01], label = 'progress_bar_ax')
    progress_bar_ax.set_xlim(0, num_frames)
    progress_bar_ax.get_yaxis().set_visible(False)
    progress_outline = mpl.patches.Rectangle((0, 0), num_frames, 1, fill = False, edgecolor = 'white', linewidth = 2)
    progress_bar_ax.add_patch(progress_outline)
    progress_bar = mpl.patches.Rectangle((0, 0), frame_number + 1, 1, color = 'white')
    progress_bar_ax.add_patch(progress_bar)
    progress_bar_ax.set_aspect('auto')
    progress_bar_ax.axis('off')
    return(None)

def create_animated_plots(
    protocol: str, 
    num_frames: int, 
    animation_type: str = 'liquidity_depth_animation',
    output_filename: str = 'animation.mp4',
    add_icon = True,
    add_watermark = False
    ) -> None :
    """
    ### Create an animated plot for a given protocol, with a specified number of frames.

    ## Parameters:
    | Parameter Name   | Type   | Description                                                                                                   |
    |:-----------------|:-------|:--------------------------------------------------------------------------------------------------------------|
    | `protocol`       | `str`  | The name of the protocol to plot.                                                                             |
    | `num_frames`     | `int`  | The number of frames in the animation.                                                                        |
    | `animation_type` | `str`  | The type of animation being requested (either 'liquidity_depth_animation' or 'invariant_function_animation'). |
    | `output_filename`| `str`  | The filename to save the animation as. Defaults to 'animation.mp4'.                                           |

    ## Dependencies:
    | Dependency Name              | Type                          | Description                                                                                                               |
    |:-----------------------------|:------------------------------|:--------------------------------------------------------------------------------------------------------------------------|
    | `GT_America_Mono_Regular`    | `font_manager.FontProperties` | Font for the x-axis and y-axis tick labels. Created as a global variable from the appropriate TrueType font file (`.ttf`) |
    | `GT_America_Extended_Medium` | `font_manager.FontProperties` | Font for the figure title. Created as a global variable from the appropriate TrueType font file (`.ttf`)                  |
    | `GT_America_Standard_Light`  | `font_manager.FontProperties` | Font for the x-axis and y-axis labels. Created as a global variable from the appropriate TrueType font file (`.ttf`)      |
    | `plot_titles`                | `dict`                        | A `global` dictionary containing plot titles for each protocol.                                                           |
    | `get_animation_frame`        | `function`                    | Returns a plot of the specified `protocol` at the given `frame_number`.                                                   |
    
    ## Notes:
    - The plot consists of four subplots for the price and liquidity of a protocol, and updates to reflect the changes in the protocol over time.
    """
    def update_animation_frame(frame_number):
        """
        ### Update the animation for the specified frame.

        ## Parameters:
        | Parameter Name   | Type   | Description                               |
        |:-----------------|:-------|:------------------------------------------|
        | `frame_number`   | `int`  | The frame number to update the plot for.  |
        
        ## Dependencies:
        | Dependency Name       | Type                       | Description                                                                                                                     |
        |:----------------------|:---------------------------|:--------------------------------------------------------------------------------------------------------------------------------|
        | `protocol`            | `str`                      | The name of the protocol to generate the frame for.                                                                             |
        | `num_frames`          | `int`                      | The total number of frames in the animation.                                                                                    |
        | `fig`                 | `matplotlib.figure.Figure` | The figure on which to draw the progress bar.                                                                                   |
        | `ax`                  | `np.ndarray`               | The array of axes for the figure. The axes must be organized as a 2x2 grid.                                                     |
        | `get_animation_frame` | `function`                 | A function to retrieve a matplotlib figure with a frame at the specified `step` of the simulation for the specified `protocol`. |
        | `draw_progress_bar`   | `function`                 | A function to draw a progress bar on the specified figure at the given frame number.                                            |

        ## Notes:
        - This function updates the plot for the given protocol to reflect the state of the protocol at the specified frame number.
        """
        nonlocal protocol, num_frames, fig, ax
        get_animation_frame(animation_type, protocol, frame_number, ax)
        draw_progress_bar(fig, frame_number, num_frames)
        return(ax.flatten())
    
    plt.style.use('dark_background')
    fig, ax = plt.subplots(2, 2, figsize=(16, 9))
    plt.style.use("dark_background")
    fig.suptitle(plot_titles[protocol], fontproperties = GT_America_Extended_Medium, fontsize = 16)
    if add_icon:
        add_icon_to_fig(fig)
    if add_watermark:
        add_watermark_to_fig(fig)
    for subplot_ax in ax.flatten():
        subplot_ax.patch.set_alpha(0)
    animation = FuncAnimation(fig, update_animation_frame, frames = range(num_frames), interval = 100, blit = False)
    animation.save(output_filename, writer = 'ffmpeg', dpi = 300, bitrate = 180000)
    plt.close(fig)
    return(None)

# # Summary Plotters

def get_arrays_for_data_visualization_summary(
    protocol: str
    ) -> Tuple[List[datetime], List[Decimal], List[Decimal], List[Decimal], List[Decimal], List[Decimal], List[Decimal], List[Decimal], List[Decimal]]:
    """
    Returns arrays of data for generating visualizations summarizing the simulation data for a given `protocol`.

    ## Parameters:
    | Parameter Name | Type   | Description                                                                             |
    |:---------------|:-------|:----------------------------------------------------------------------------------------|
    | `protocol`     | `str`  | The name of the protocol to get the data for (`carbon`, `uniswap_v2`, or `uniswap_v3`). |
    
    ## Returns:
    | Return Name             | Type                                                                                                                                            | Description                                                                                                                                                                                               |
    |:------------------------|:------------------------------------------------------------------------------------------------------------------------------------------------|:----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
    | `date_array`            | `List[datetime]`                                                                                                                                | A list of dates corresponding to each step of the simulation.                                                                                                                                             |
    | `price_array`           | `List[Decimal]`                                                                                                                                 | A list of RISK token prices at each step of the simulation.                                                                                                                                               |
    | `current_ask_array`     | `List[Decimal]`                                                                                                                                 | A list of current ask prices at each step of the simulation.                                                                                                                                              |
    | `max_ask_array`         | `List[Decimal]`                                                                                                                                 | A list of maximum ask prices at each step of the simulation.                                                                                                                                              |
    | `current_bid_array`     | `List[Decimal]`                                                                                                                                 | A list of current bid prices at each step of the simulation.                                                                                                                                              |
    | `min_bid_array`         | `List[Decimal]`                                                                                                                                 | A list of minimum bid prices at each step of the simulation.                                                                                                                                              |
    | `portfolio_value_array` | `List[Decimal]`                                                                                                                                 | A list of portfolio values at each step of the simulation.                                                                                                                                                |
    | `cash_portion_array`    | `List[Decimal]`                                                                                                                                 | A list of the portion of the portfolio held in CASH at each step of the simulation.                                                                                                                       |
    | `hodl_value_array`      | `List[Decimal]`                                                                                                                                 | A list of the value of holding the initial portfolio allocation without trading at each step of the simulation.                                                                                           |
    |                         | `Tuple[List[datetime], List[Decimal], List[Decimal], List[Decimal], List[Decimal], List[Decimal], List[Decimal], List[Decimal], List[Decimal]]` | A tuple of `date_array`, `price_array`, `current_ask_array`, `max_ask_array`, `current_bid_array`, `min_bid_array`, `portfolio_value_array`, `cash_portion_array`, and `hodl_value_array`, in that order. |
    
    ## Dependencies:
    | Dependency Name | Type   | Description                                                 |
    |:----------------|:-------|:------------------------------------------------------------|
    | `PROTOCOLS`     | `dict` | A global dictionary with each protocol name string as keys. |
    """
    global PROTOCOLS
    date_array = PROTOCOLS[protocol]['simulation recorder']['date']
    price_array = PROTOCOLS[protocol]['simulation recorder']['RISK price']
    current_ask_array = PROTOCOLS[protocol]['simulation recorder']['ask']
    max_ask_array = PROTOCOLS[protocol]['simulation recorder']['max ask']
    current_bid_array = PROTOCOLS[protocol]['simulation recorder']['bid']
    min_bid_array = PROTOCOLS[protocol]['simulation recorder']['min bid']
    portfolio_value_array = PROTOCOLS[protocol]['simulation recorder']['portfolio value']
    cash_portion_array = PROTOCOLS[protocol]['simulation recorder']['CASH portion']
    hodl_value_array = PROTOCOLS[protocol]['simulation recorder']['hodl value']
    return(date_array, price_array, current_ask_array, max_ask_array, current_bid_array, 
           min_bid_array, portfolio_value_array, cash_portion_array, hodl_value_array)

def sync_twinx_yaxis_ticks(
    ax1: plt.Axes, 
    ax2: plt.Axes, 
    num_ticks: int = 5
    ) -> None:
    """
    ### Synchronizes the y-axis ticks of two subplots sharing the same x-axis.

    ## Parameters:
    | Parameter Name | Type     | Description                                          |
    |:---------------|:---------|:-----------------------------------------------------|
    | `ax1`          | `Axes`   | The first subplot.                                   |
    | `ax2`          | `Axes`   | The second subplot.                                  |
    | `num_ticks`    | `int`    | The number of y-axis ticks to display. Default is 5. |
    
    ## Returns:
    None
    
    ## Notes:
    - The function synchronizes the y-axis ticks of two subplots sharing the same x-axis, such that the horizontal gridlines are at the same positions on both axes.
    - The number of ticks displayed on both subplots is equal to `num_ticks`, and the range of the y-axis limits is the same for both subplots.
    - The function first calculates the tick spacing for both subplots based on their respective y-axis limits and the desired number of ticks. 
    - Then, it computes the tick positions for both subplots using the tick spacing.
    - To align the tick positions for the second subplot (`ax2`) with those of the first subplot (`ax1`), a linear transformation is applied. 
    - This transformation is based on the slope and intercept of the line connecting the tick values of both subplots. 
    - The slope (`m`) and intercept (`b`) are computed from the tick values.
    - After setting the y-axis tick positions and limits for both subplots, the function updates the y-axis ticks of `ax1` using the linear transformation (slope and intercept). 
    - The y-axis ticks of `ax2` are set back to their original values to ensure that both subplots display the same number of y-axis ticks.
    - This function can be particularly useful when visualizing data on two separate y-axes that share the same x-axis, as it ensures that the y-axis tick values of both subplots are displayed in a visually consistent manner.
    """
    original_ax2_ticks = ax2.get_yticks()  # Get the original ticks of the second y-axis (ax2).
    ax1_min, ax1_max = ax1.get_ylim()  # Get the minimum and maximum values of the first y-axis (ax1).
    ax2_min, ax2_max = ax2.get_ylim()  # Get the minimum and maximum values of the second y-axis (ax2).
    ax1_tick_spacing = (ax1_max - ax1_min)/(num_ticks - 1)  # Calculate the spacing between ticks for ax1.
    ax2_tick_spacing = (ax2_max - ax2_min)/(num_ticks - 1)  # Calculate the spacing between ticks for ax2.
    ax1_ticks = np.arange(ax1_min, ax1_max + ax1_tick_spacing, ax1_tick_spacing)  # Create an array of ticks for ax1.
    ax2_ticks = np.arange(ax2_min, ax2_max + ax2_tick_spacing, ax2_tick_spacing)  # Create an array of ticks for ax2.
    m = (ax2_ticks[0] - ax2_ticks[-1])/(ax1_ticks[0] - ax1_ticks[-1])  # Calculate the slope (m) between ax1 and ax2 ticks.
    b = ax2_ticks[0] - m*ax1_ticks[0]  # Calculate the y-intercept (b) using the slope (m).
    ax1.set_yticks(ax1_ticks)  # Set the ticks for the first y-axis (ax1) using the calculated ax1_ticks array.
    ax2.set_yticks(ax2_ticks)  # Set the ticks for the second y-axis (ax2) using the calculated ax2_ticks array.
    ax1.set_ylim(ax1.get_ylim())  # Set the limits of the first y-axis (ax1) to maintain the original limits.
    ax1.set_yticks((original_ax2_ticks[1:] - b)/m)  # Set the ticks for ax1 using the original ticks of ax2 adjusted by the linear transformation.
    ax2.set_yticks(original_ax2_ticks[1:])  # Set the ticks for the second y-axis (ax2) using the original ticks (excluding the first tick).
    return(None)

def plot_visualization_summary_left_hand_side(
    ax1: plt.Axes, 
    date_array: List[datetime],
    price_array: List[Decimal], 
    current_ask_array: List[Decimal], 
    current_bid_array: List[Decimal], 
    min_bid_array: List[Decimal], 
    custom_formatter: mpl.ticker.Formatter
    ) -> None:
    """
    ### Plots the left-hand side of the visualization summary, showing price and trade data.

    ## Parameters:
    | Parameter Name     | Type                    | Description                                                           |
    |:-------------------|:------------------------|:----------------------------------------------------------------------|
    | `ax1`              | `plt.Axes`              | The first subplot on which the price and trade data will be plotted.  |
    | `date_array`       | `List[datetime]`        | A list of dates corresponding to each step of the simulation.         |
    | `price_array`      | `List[Decimal]`         | A list of RISK token prices at each step of the simulation.           |
    | `current_ask_array`| `List[Decimal]`         | A list of current ask prices at each step of the simulation.          |
    | `current_bid_array`| `List[Decimal]`         | A list of current bid prices at each step of the simulation.          |
    | `min_bid_array`    | `List[Decimal]`         | A list of minimum bid prices at each step of the simulation.          |
    | `custom_formatter` | `mpl.ticker.Formatter` | A custom formatter for formatting the y-axis tick labels.              |

    ## Dependencies:
    | Dependency name   | Type           | Description                                                                                                               |
    |:------------------|:---------------|:--------------------------------------------------------------------------------------------------------------------------|
    | `TOKEN_PAIR`      | `dict`         | A `global` dictionary containing `CASH` and `RISK` strings as keys, and the corresponding token ticker strings as values. |
    
    ## Returns:
    None

    ## Notes:
    - This function plots the left-hand side of the visualization summary, which shows the price and trade data, including the `RISK` token price, `ask`, and `bid` prices, as a time series on the provided axes.
    - The background is set to transparent, and the grid is displayed with white dashed lines and a linewidth of 0.5.
    - The y-axis label shows the price in `CASH` per `RISK`, and the x-axis label shows the date.
    - The `RISK` token price is plotted as a solid white line, ask prices as a dotted red line, and bid prices as a dotted green line.
    - The y-axis limits are set to start from 90% of the minimum price value, up to the maximum price value, for better visualization.
    - The y-axis tick labels are formatted using the provided `custom_formatter`.
    """
    global TOKEN_PAIR
    ax1.clear()
    ax1.patch.set_alpha(0)
    ax1.grid(True, linestyle = '--', color = 'white', linewidth = 0.5)
    ax1.set_ylabel(f'price ({TOKEN_PAIR["CASH"]} per {TOKEN_PAIR["RISK"]})', fontproperties = GT_America_Standard_Light, fontsize = 12)
    ax1.yaxis.tick_left()
    ax1.yaxis.set_label_position("left")
    ax1.plot(date_array, price_array, label = f'price ({TOKEN_PAIR["CASH"]} per {TOKEN_PAIR["RISK"]}) (lhs)', color = '#ffffffff')
    ax1.set_xlabel('date', fontproperties = GT_America_Standard_Light, fontsize = 12)
    ax1.plot(date_array, current_ask_array, label = 'ask (lhs)', color = '#d86371ff')
    ax1.plot(date_array, current_bid_array, label = 'bid (lhs)', color = '#00b578ff')
    ax1.set_ylim(min(min(price_array), min(min_bid_array))*NINE/TEN, None)
    ax1.yaxis.set_major_formatter(custom_formatter)
    return(None)

def plot_visualization_summary_right_hand_side(
    ax2: plt.Axes,
    date_array: List[datetime],
    portfolio_value_array: List[Decimal],
    cash_portion_array: List[Decimal],
    hodl_value_array: List[Decimal],
    custom_formatter: mpl.ticker.Formatter
    ) -> None:
    """
    ### Plots the right-hand side of the visualization summary, showing portfolio data.

    ## Parameters:
    | Parameter Name          | Type                    | Description                                                                |
    |:------------------------|:------------------------|:---------------------------------------------------------------------------|
    | `ax2`                   | `plt.Axes`              | The second subplot on which the portfolio data will be plotted.            |
    | `date_array`            | `List[datetime]`        | A list of dates corresponding to each step of the simulation.              |
    | `portfolio_value_array` | `List[Decimal]`         | A list of portfolio values at each step of the simulation.                 |
    | `cash_portion_array`    | `List[Decimal]`         | A list of cash portion values at each step of the simulation.              |
    | `hodl_value_array`      | `List[Decimal]`         | A list of HODL (buy-and-hold) values at each step of the simulation.       |
    | `custom_formatter`      | `mpl.ticker.Formatter`  | A custom formatter for formatting the y-axis tick labels.                  |

    ## Dependencies:
    | Dependency name   | Type           | Description                                                                                                               |
    |:------------------|:---------------|:--------------------------------------------------------------------------------------------------------------------------|
    | `TOKEN_PAIR`      | `dict`         | A `global` dictionary containing `CASH` and `RISK` strings as keys, and the corresponding token ticker strings as values. |

    ## Returns:
    None

    ## Notes:
    - This function plots the right-hand side of the visualization summary, which shows the portfolio data, including the portfolio value, `CASH` portion, and HODL value as a time series on the provided axes.
    - The background is set to transparent, and the grid is displayed with white dashed lines and a linewidth of 0.5.
    - The y-axis label shows the portfolio value in `CASH`.
    - The portfolio value is plotted as a solid blue line, the cash portion as a dashed orange line, and the HODL value as a solid yellow line.
    - The y-axis tick labels are formatted using the provided `custom_formatter`.
    """
    global TOKEN_PAIR
    ax2.clear()
    ax2.patch.set_alpha(0)
    ax2.grid(True, linestyle = '--', color = 'white', linewidth = 0.5)
    ax2.set_ylabel(f'portfolio value ({TOKEN_PAIR["CASH"]})', fontproperties = GT_America_Standard_Light, fontsize = 12)
    ax2.yaxis.tick_right()
    ax2.yaxis.set_label_position("right")
    ax2.plot(date_array, portfolio_value_array, label = 'portfolio value (rhs)', color = '#10bbd5ff')
    ax2.plot(date_array, cash_portion_array, label = f'{TOKEN_PAIR["CASH"]} portion (rhs)', color = '#d68c35ff', linestyle = '--')
    ax2.plot(date_array, hodl_value_array, label = 'hodl value (rhs)', color = '#d5db27ff')
    ax2.yaxis.set_major_formatter(custom_formatter)
    return(None)

def create_visualization_summary_legend(
    ax1: plt.Axes,
    ax2: plt.Axes
    ) -> None:
    """
    ### Creates a unified legend for the visualization summary using the two axes.

    ## Parameters:
    | Parameter Name | Type       | Description                                                          |
    |:---------------|:-----------|:---------------------------------------------------------------------|
    | `ax1`          | `plt.Axes` | The first subplot, which contains the price data and volume bars.    |
    | `ax2`          | `plt.Axes` | The second subplot, which contains the portfolio data.               |

    ## Returns:
    None

    ## Notes:
    - This function creates a unified legend for the visualization summary using the two axes.
    - The legend items from `ax1` and `ax2` are combined into a single legend displayed on `ax2`.
    - The legend is positioned in the upper left corner of the `ax2` subplot.
    """
    lines1, labels1 = ax1.get_legend_handles_labels()
    lines2, labels2 = ax2.get_legend_handles_labels()
    ax2.legend(lines1 + lines2, labels1 + labels2, loc='upper left')
    return(None)

def generate_data_visualization_summary(
    protocol: str,
    output_filename: str = 'summary.png',
    add_icon = True, 
    add_watermark = False
    ):
    """
    ### Generates a summary visualization of the performance data for the specified `protocol`.

    ## Parameters:
    | Parameter Name   | Type   | Description                                                                                          |
    |:-----------------|:-------|:-----------------------------------------------------------------------------------------------------|
    | `protocol`       | `str`  | The name of the protocol to generate the summary for.                                                |
    | `output_filename`| `str`  | The filename to save the summary chart as. If no filename is provided, the default is 'summary.png'. |
    | `add_icon`       | `bool` | Whether to add the protocol icon to the figure. Defaults to True.                                    |
    | `add_watermark`  | `bool` | Whether to add a watermark to the figure. Defaults to False.                                         |

    ## Returns:
    None

    ## Dependencies:
    | Dependency Name                              | Type                          | Description                                                                                                                                    |
    |:---------------------------------------------|:------------------------------|:-----------------------------------------------------------------------------------------------------------------------------------------------|
    | `TOKEN_PAIR`                                 | `dict`                        | A `global` dictionary containing `CASH` and `RISK` strings as keys, and the corresponding token ticker strings as values.                      |
    | `GT_America_Mono_Regular`                    | `font_manager.FontProperties` | Font for the x-axis and y-axis tick labels. Created as a global variable from the appropriate TrueType font file (`.ttf`)                      |
    | `GT_America_Extended_Medium`                 | `font_manager.FontProperties` | Font for the figure title. Created as a global variable from the appropriate TrueType font file (`.ttf`)                                       |
    | `GT_America_Standard_Light`                  | `font_manager.FontProperties` | Font for the x-axis and y-axis labels. Created as a global variable from the appropriate TrueType font file (`.ttf`)                           |
    | `plot_titles`                                | `dict`                        | A dictionary that maps each protocol to its respective plot title.                                                                             |
    | `CustomFormatter`                            | `class`                       | A custom tick-label formatter for `matplotlib` that allows plots to switch dynamically between scientific and fixed-point notation as needed.  |
    | `sync_twinx_yaxis_ticks`                     | `function`                    | Synchronizes the y-axis ticks of two subplots sharing the same x-axis.                                                                         |
    | `plot_visualization_summary_left_hand_side`  | `function`                    | Plots the left-hand side of the visualization summary, showing price and volume data.                                                          |
    | `plot_visualization_summary_right_hand_side` | `function`                    | Plots the right-hand side of the visualization summary, showing portfolio data.                                                                |
    | `add_fill_color_to_visualization_summary`    | `function`                    | Adds fill colors to the visualization summary, based on the protocol used.                                                                     |
    | `create_visualization_summary_legend`        | `function`                    | Creates a unified legend for the visualization summary using the two axes.                                                                     |
    | `add_icon_to_fig`                            | `function`                    | Adds the protocol icon to the figure.                                                                                                          |
    | `add_watermark_to_fig`                       | `function`                    | Adds a watermark to the figure.                                                                                                                |
    | `add_carbon_fill_and_bounds`                 | `function`                    | Adds carbon bid and ask price bounds, and fill colors to the provided Axes object.                                                             |

    ## Notes:
    - This function uses global variables `TOKEN_PAIR` and `PROTOCOLS` to retrieve data for the summary plot.
    - The generated plot includes multiple subplots to show the price, ask, bid, portfolio value, cash portion, and hodl value of the protocol over time.
    - The function allows adding an icon and watermark to the figure based on the input parameters `add_icon` and `add_watermark`.
    """
    global TOKEN_PAIR
    custom_formatter = CustomFormatter()
    (date_array, price_array, current_ask_array, max_ask_array, current_bid_array, 
     min_bid_array, portfolio_value_array, cash_portion_array, hodl_value_array) = get_arrays_for_data_visualization_summary(protocol)
    plt.style.use('dark_background')
    fig, ax1 = plt.subplots(figsize = (16,9))
    ax2 = ax1.twinx()
    fig.suptitle(plot_titles[protocol], fontproperties = GT_America_Extended_Medium, fontsize = 16)  
    plot_visualization_summary_left_hand_side(ax1, date_array, price_array, current_ask_array, current_bid_array, min_bid_array, custom_formatter)
    plot_visualization_summary_right_hand_side(ax2, date_array, portfolio_value_array, cash_portion_array, hodl_value_array, custom_formatter)
    sync_twinx_yaxis_ticks(ax1, ax2)
    add_fill_color_to_ax(ax1, protocol, date_array, current_ask_array, current_bid_array, max_ask_array, min_bid_array)
    create_visualization_summary_legend(ax1, ax2)
    if protocol == 'carbon':
        add_carbon_fill_and_bounds(ax1, date_array, current_ask_array, current_bid_array)
    for ax in [ax1, ax2]:
        for label in ax.xaxis.get_ticklabels() + ax.yaxis.get_ticklabels():
            label.set_fontproperties(GT_America_Mono_Regular)
    if add_icon:
        add_icon_to_fig(fig)
    if add_watermark:
        add_watermark_to_fig(fig)
    plt.savefig(output_filename, dpi = 300)
    plt.show()

# # Simulation Functions

# #### Simulation Time and Price Updaters

def update_step() -> None:
    """
    ### Updates the global variable SIMULATION_STEP to the next simulation step.

    ## Parameters:
    None

    ## Returns:
    None

    ## Dependencies:
    | Name              | Type          | Description                                                                                  |
    |:------------------|:--------------|:---------------------------------------------------------------------------------------------|
    | `SIMULATION_STEP` | `int`         | A `global` variable containing the current step of the simulation.                           |
    | `DATES`           | `pd.Timestamp | A `global` variable containing the date corresponding to the current step of the simulation. |

    ## Notes:
    - This function updates the global variable `SIMULATION_STEP` to the next simulation step.
    - It prints the last simulation step and the new simulation step, then the corresponding date.
    """
    global SIMULATION_STEP
    global DATES
    SIMULATION_STEP += 1
    logger.info(f'Step: {SIMULATION_STEP}')
    logger.info(f'Date: {DATES[SIMULATION_STEP]}')
    logger.info(f'Duration: {get_simulation_timer_for_log_table(DATES[0], DATES[SIMULATION_STEP])}')
    return(None)

def update_market_price() -> None:
    """
    ### Updates the global variable MARKETPRICE with the new market price.

    ## Parameters:
    None

    ## Returns:
    None

    ## Dependencies:
    | Name              | Type      | Description                                                        |
    |:------------------|:----------|:-------------------------------------------------------------------|
    | `SIMULATION_STEP` | `int`     | A `global` variable containing the current step of the simulation. |
    | `MARKETPRICE`     | `Decimal` | A `global` variable containing the current market price.           |

    ## Notes:
    - This function updates the global variable `MARKETPRICE` with the new market price.
    - It prints the last market price and the new market price.
    """
    global SIMULATION_STEP
    global MARKETPRICE
    new_market_price = PRICE_DATA[SIMULATION_STEP]
    # logger.info(f'Last market price: {MARKETPRICE:.6f}')
    # logger.info(f'New market price: {new_market_price:.6f}')
    MARKETPRICE = new_market_price
    return(None)

# #### Simulation Methods

def get_start_information_from_binary_file(
    start_information_filename: str
    ) -> dict:
    """
    ### Reads a previosuly created binary (.pickle) file, contraining the user's simulation settings.

    ## Parameters:
    | Parameter Name               | Type   | Description                                                                 |
    |:-----------------------------|:-------|:----------------------------------------------------------------------------|
    | `start_information_filename` | `str`  | The filename of the binary file, containing the user's simulation settings. |

    ## Returns:
    | Return name         | Type   | Description                               |
    |:--------------------|:-------|:------------------------------------------|
    | `start_information` | `dict` | The simulation settings, as a dictionary: |
    
    ## Return dictionary:
    | Key                                        | Key Type | Value                                                                                                                                                                                 | Value Type        |
    |:-------------------------------------------|:---------|:--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|:------------------|
    | base filename                              | `str`    | Named for its token pair and date range e.g. ['RISK=USDC_CASH=USDT_startUNIX=1678366800_endUNIX=1678798800']                                                                          | `list[str]`       |
    | token pair                                 | `str`    | A dictionary containing the token tickers e.g. 'CASH' : 'ETH', 'RISK' : 'LINK'                                                                                                        | `Dict[str, str]`  |
    | price chart                                | `str`    | A list of Decimal objects, representing prices in units of CASH per RISK.                                                                                                             | `list[Decimal]`   |
    | price chart dates                          | `str`    | A list of Timestamp objects, representing the dates and times for each of the prices in the 'price chart'                                                                             | `list[Timestamp]` |
    | uniswap range boundaries                   | `str`    | The two (2) price bounds which enclose a single active region for the uniswap v3 strategy.                                                                                            | `list[Decimal]`   |
    | carbon order boundaries                    | `str`    | The four (4) price bounds that enclose two separate liquidity regions, which comprise a carbon strategy.                                                                              | `list[Decimal]`   |
    | carbon starting prices                     | `str`    | The two (2) marginal price values, within their respective bounds, which dictate the first available prices on the carbon strategy.                                                   | `list[Decimal]`   |
    | carbon order weights                       | `str`    | The relative weights of the RISK and CASH components of the carbon strategy, in that order, and in terms of their CASH value.                                                         | `list[Decimal]`   |
    | protocol fees                              | `str`    | The user-selected protocol fee, used on all three protocols (0.00001 <= fee <= 0.01; 1 bps <= fee <= 1000 bps; 0.01% <= fee <= 1%).                                                   | `list[Decimal]`   |
    | starting portfolio valuation               | `str`    | The total CASH valuation of all protocol portfolios at the start of the simulation.                                                                                                   | `list[Decimal]`   |
    | protocol list                              | `str`    | The specific protocols to be included in this simulation.                                                                                                                             | `list[str]`       |
    | depth chart animation boolean              | `str`    | `True` if the simulation should be composed into an animated `.mp4` file depicting the depth chart and saved locally for each protocol in the 'protocol list.                         | `bool`            |
    | invariant curve animation boolean          | `str`    | `True` if the simulation should be composed into an animated `.mp4` file depicting the invariant curve and saved locally for each protocol in the 'protocol list.                     | `bool`            |
    | token balance cash basis animation boolean | `str`    | `True` if the simulation should be composed into an animated `.mp4` file depicting the portfolio composition in CASH basis and saved locally for each protocol in the 'protocol list. | `bool`            |
    | summary boolean                            | `str`    | `True` if a summary plot of the simulation should be composed into a `.png` file and saved locally for each protocol in the 'protocol list'.                                          | `bool`            |
    
    ## Notes:
    - The data in the binary file is assigned to a dictionary, `start_information`, and returned.
    """
    return {
        "starting portfolio valuation": [Decimal(x) for x in start_information_filename["starting portfolio valuation"]],
        "base filename": [str(x) for x in start_information_filename["base filename"]],
        "price chart": [Decimal(x) for x in start_information_filename["price chart"]],
        "price chart dates": [pd.Timestamp(x) for x in start_information_filename["price chart dates"]],
        "token pair": start_information_filename["token pair"],
        "carbon order boundaries": [Decimal(x) for x in start_information_filename["carbon order boundaries"]],
        "carbon starting prices": [Decimal(x) for x in start_information_filename["carbon starting prices"]],
        "protocol fees": [Decimal(x) for x in start_information_filename["protocol fees"]],
        "protocol list": start_information_filename["protocol list"],
        "depth chart animation boolean": start_information_filename["depth chart animation boolean"],
        "invariant curve animation boolean": start_information_filename["invariant curve animation boolean"],
        "token balance cash basis animation boolean": start_information_filename["token balance cash basis animation boolean"],
        "summary boolean": start_information_filename["summary boolean"]
    }

def start_simulation_logger(
    ):
    """
    ### Sets up the logfile, which records every event in the simulation in understandable language.

    ## Parameters:
    | Parameter Name               | Type   | Description                                                                                 |
    |:-----------------------------|:-------|:--------------------------------------------------------------------------------------------|
    | `start_information_filename` | `str`  | The filename of the binary file (.pickle), containing the user's simulation settings.       |

    ## Returns:
    None

    ## Notes:
    - This function sets up a logfile to record every event in the simulation in understandable language.
    - The logfile will be saved to a file with the same base filename as the user's simulation settings, but with '_LOG.txt' appended to the end.
    """
    if start_information["base filename"]:
        log_file = start_information["base filename"][0]
        logger = logging.getLogger(__name__)
        logger.setLevel(logging.INFO)
        handler = logging.FileHandler(log_file, 'w')
        handler.setLevel(logging.INFO)
        formatter = logging.Formatter('%(message)s')
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    return(None)

def the_simulation(
    start_information_filename: Union[str, None] = None
    ):
    """
    ### Reads the simulation parameters from start_information_filename and calls the main simulation functions.

    ## Parameters:
    | Parameter Name               | Type   | Description                                                                                 |
    |:-----------------------------|:-------|:--------------------------------------------------------------------------------------------|
    | `start_information_filename` | `str`  | The filename of the binary file (.pickle), containing the user's simulation settings.       |

    ## Returns:
    None

    ## Dependencies:
    | Dependency name                          | Type       | Description                                                                                                             |
    |:-----------------------------------------|:-----------|:------------------------------------------------------------------------------------------------------------------------|
    | `SIMULATION_LENGTH`                      | `int`      | A `global` variable that represents the total number of steps in the simulation.                                        |
    | `start_information`                      | `dict`     | A `global` dictionary containing the intial state instructions for the simulation:                                      |
    | `get_start_information_from_binary_file` | `function` | Reads a previosuly created binary `.pickle` file, intial state instructions for the simulation:                         |
    | `initialize_simulation`                  | `function` | Initializes the simulation by loading the price data, setting the global variables and creating the protocols.          |
    | `start_simulation_recorder`              | `function` | Sets up the logfile, which records every event in the simulation in understandable language.                            |
    | `update_step`                            | `function` | Updates the global variable `SIMULATION_STEP` to the next simulation step.                                              |
    | `update_market_price`                    | `function` | Updates the global variable `MARKETPRICE` with the new price of the RISK asset in units of CASH per RISK.               |
    | `equilibrate_protocol`                   | `function` | Analyzes the market conditions of the specified protocol and performs arbitrage if necessary.                           |
    | `evaluate_protocol_performance`          | `function` | Evaluates the current performance of a given protocol and records it in the protocol's performance tracking dictionary. |
    | `create_animated_plots`                  | `function` | Composes the simulation into an animated `.mp4` file and saves it locally for each protocol in the 'protocol list.      |
    | `generate_data_visualization_summary`    | `function` | Composes the simulation into a summary plot `.png` file and saves it locally for each protocol in the 'protocol list.   |
    
    ## Dependent Dictionary (`start_information`):
    | Key                                        | Key Type | Value                                                                                                                                                                                 | Value Type        |
    |:-------------------------------------------|:---------|:--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|:------------------|
    | base filename                              | `str`    | Named for its token pair and date range e.g. ['RISK=USDC_CASH=USDT_startUNIX=1678366800_endUNIX=1678798800']                                                                          | `list[str]`       |
    | token pair                                 | `str`    | A dictionary containing the token tickers e.g. 'CASH' : 'ETH', 'RISK' : 'LINK'                                                                                                        | `Dict[str, str]`  |
    | price chart                                | `str`    | A list of Decimal objects, representing prices in units of CASH per RISK.                                                                                                             | `list[Decimal]`   |
    | price chart dates                          | `str`    | A list of Timestamp objects, representing the dates and times for each of the prices in the 'price chart'                                                                             | `list[Timestamp]` |
    | uniswap range boundaries                   | `str`    | The two (2) price bounds which enclose a single active region for the uniswap v3 strategy.                                                                                            | `list[Decimal]`   |
    | carbon order boundaries                    | `str`    | The four (4) price bounds that enclose two separate liquidity regions, which comprise a carbon strategy.                                                                              | `list[Decimal]`   |
    | carbon starting prices                     | `str`    | The two (2) marginal price values, within their respective bounds, which dictate the first available prices on the carbon strategy.                                                   | `list[Decimal]`   |
    | carbon order weights                       | `str`    | The relative weights of the RISK and CASH components of the carbon strategy, in that order, and in terms of their CASH value.                                                         | `list[Decimal]`   |
    | protocol fees                              | `str`    | The user-selected protocol fee, used on all three protocols (0.00001 <= fee <= 0.01; 1 bps <= fee <= 1000 bps; 0.01% <= fee <= 1%).                                                   | `list[Decimal]`   |
    | starting portfolio valuation               | `str`    | The total CASH valuation of all protocol portfolios at the start of the simulation.                                                                                                   | `list[Decimal]`   |
    | protocol list                              | `str`    | The specific protocols to be included in this simulation.                                                                                                                             | `list[str]`       |
    | depth chart animation boolean              | `str`    | `True` if the simulation should be composed into an animated `.mp4` file depicting the depth chart and saved locally for each protocol in the 'protocol list.                         | `bool`            |
    | invariant curve animation boolean          | `str`    | `True` if the simulation should be composed into an animated `.mp4` file depicting the invariant curve and saved locally for each protocol in the 'protocol list.                     | `bool`            |
    | token balance cash basis animation boolean | `str`    | `True` if the simulation should be composed into an animated `.mp4` file depicting the portfolio composition in CASH basis and saved locally for each protocol in the 'protocol list. | `bool`            |
    | summary boolean                            | `str`    | `True` if a summary plot of the simulation should be composed into a `.png` file and saved locally for each protocol in the 'protocol list'.                                          | `bool`            |

    ## Notes:
    - If the filename for the `start_information` binary `.pickle` file is provided, the simulation will start with that instructions set. 
    - If no `.pickle` file is provided, this function assumes is has already been created and is available as a `global` object.
    - Then, `update_step`, `update_market_price`, `equilibrate_protocol`, and `evaluate_protocol_performance` are called in a loop until the end of the simulation.
    - If requested, `create_animated_plots` is called, which produces an animated `.mp4` file for each protocol included in the simulation.
    - If requested,  `generate_data_visualization_summary` is called, which produces a summary `.png` file for each protocol included in the simulation.
    """
    global SIMULATION_LENGTH
    global logger
    global start_information
    logger = logging.getLogger(__name__)
    if start_information_filename:
        start_information = get_start_information_from_binary_file(start_information_filename)
    initialize_simulation(start_information)
    start_simulation_logger()
    protocol_list = start_information['protocol list']
    base_filename = start_information['base filename']
    for i in range(SIMULATION_LENGTH):        
        update_step()
        update_market_price()
        logger.info('')
        for protocol in protocol_list:
            final_ask, final_bid, min_bid, max_ask = equilibrate_protocol(protocol)
            evaluate_protocol_performance(protocol, final_ask, final_bid, min_bid, max_ask)
    # logger.info(moai)
    animation_dict = {'depth chart animation boolean': {'animation_type': 'liquidity_depth_animation', 'file_string': 'DEPTH_ANIMATION'},
                      'invariant curve animation boolean': {'animation_type': 'invariant_function_animation', 'file_string': 'INVARIANT_ANIMATION'},
                      'token balance cash basis animation boolean': {'animation_type': 'token_balance_cash_basis', 'file_string': 'TOKEN_BALANCES_ANIMATION'}}
    for animation_boolean, info_dict in animation_dict.items():
        if start_information[animation_boolean]:
            for protocol in protocol_list:
                create_animated_plots(protocol, SIMULATION_LENGTH, 
                                      animation_type = info_dict['animation_type'],
                                      output_filename = f'{protocol}_{info_dict["file_string"]}_{base_filename}.mp4')
    if start_information['summary boolean']:
        for protocol in protocol_list:
            generate_data_visualization_summary(protocol, output_filename = f'{protocol}_SUMMARY_{base_filename}.png')
    return(PROTOCOLS['carbon'])

# # API Call Error Handling

class CoinNotFoundError(Exception):
    """
    ### Custom Exception: CoinNotFoundError

    ## Description:
    This exception is raised when no coin with the provided symbol is found in the CoinMarketCap API.

    ## Attributes:
    | Attribute Name | Type  | Description                         |
    |:---------------|:------|:------------------------------------|
    | `symbol`       | `str` | The coin symbol that was not found. |
    """

    def __init__(self, symbol: str):
        """
        ### Initializes a new instance of the CoinMarketCapCoinNotFoundError class.

        ## Parameters:
        | Parameter Name | Type  | Description                                |
        |:---------------|:------|:-------------------------------------------|
        | `symbol`       | `str` | The coin symbol (e.g., 'BTC' for Bitcoin). |
        """
        self.symbol = symbol

    def __str__(self) -> str:
        """
        Returns the string representation of this instance.

        ## Returns:
        | Return Name | Type  | Description                                         |
        |:------------|:------|:----------------------------------------------------|
        | `str`       | `str` | The string representation of this instance.         |
        """
        return(f"No coin found with symbol '{self.symbol}'.")

class CoinGeckoAmbiguousCoinError(Exception):
    """
    ### Custom Exception: AmbiguousCoinError

    ## Description:
    This exception is raised when more than one coin with the provided symbol is found in the CoinGecko API and cannot be disambiguated using the `COMMON_COINS_DISAMBIGUATION` dictionary.

    ## Attributes:
    | Attribute Name | Type         | Description                                                    |
    |:---------------|:-------------|:---------------------------------------------------------------|
    | `symbol`       | `str`        | The ambiguous coin symbol.                                     |
    | `options`      | `List[str]`  | A list of CoinGecko IDs corresponding to the ambiguous symbol. |

    ## Notes:
    - The exception message includes a list of CoinGecko IDs corresponding to the ambiguous symbol.
    - Users are advised to re-run the query using the exact ID name (e.g., '{self.options[0]}').
    """
    def __init__(self, symbol, options):
        """
        Initializes a new instance of the CoinGeckoAmbiguousCoinError class.

        Parameters:
            | Parameter Name | Type        | Description                                                    |
            |:---------------|:------------|:---------------------------------------------------------------|
            | `symbol`       | `str`       | The ambiguous coin symbol.                                     |
            | `options`      | `List[str]` | A list of CoinGecko IDs corresponding to the ambiguous symbol. |

        Returns:
            None
        """
        self.symbol = symbol
        self.options = options

    def __str__(self):
        """
        ### Returns the error message when the exception is raised.

        ## Returns:
        | Return Name     | Type   | Description                                               |
        |:----------------|:-------|:----------------------------------------------------------|
        | `error_message` | `str`  | The error message with the list of possible CoinGecko IDs |

        """
        option_list = ", ".join(self.options)
        return(f"More than one coin found with the symbol '{self.symbol}': {option_list}. " \
               f"Please re-run the query using the exact id name (e.g., '{self.options[0]}').")

class CoinMarketCapAmbiguousCoinError(Exception):
    """
    ### Custom Exception: AmbiguousCoinError

    ## Description:
    This exception is raised when more than one coin with the provided symbol is found in the CoinMarketCap API and cannot be disambiguated.

    ## Attributes:
    | Attribute Name | Type           | Description                                                        |
    |:---------------|:---------------|:-------------------------------------------------------------------|
    | `api_key`      | `str`          | The CoinMarketCap API key.                                         |
    | `symbol`       | `str`          | The ambiguous coin symbol.                                         |
    | `options`      | `List[str]`    | A list of CoinMarketCap IDs corresponding to the ambiguous symbol. |
    | `error_message`| `str`          | The error message created by the `create_error_message` method.    |

    ## Dependencies:
    | Dependency name                  | Type             | Description                             |
    |:---------------------------------|:-----------------|:----------------------------------------|
    | `COINMARKETCAP_API_BASE_URL`     | `str`            | The base URL for the CoinMarketCap API. |
    
    ## Notes:
    - This exception is raised when more than one coin with the provided symbol is found in the CoinMarketCap API and cannot be disambiguated.
    - The `create_error_message` method is used to generate the error message that lists the details of each ambiguous coin.
    - Users are advised to re-run the query using the exact ID name (e.g., '{self.options[0]}').
    """
    def __init__(self, api_key, symbol, options):
        """
        ### Initializes a new instance of the CoinMarketCapAmbiguousCoinError class.

        ## Description:
        This exception is raised when more than one coin with the provided symbol is found in the CoinMarketCap API and cannot be disambiguated.

        ## Parameters:
        | Parameter Name | Type         | Description                                                        |
        |:---------------|:-------------|:-------------------------------------------------------------------|
        | `api_key`      | `str`        | Your CoinMarketCap API key.                                        |
        | `symbol`       | `str`        | The ambiguous coin symbol.                                         |
        | `options`      | `List[str]`  | A list of CoinMarketCap IDs corresponding to the ambiguous symbol. |

        ## Notes:
        - The exception message includes a table with information about the coins that correspond to the ambiguous symbol.
        - Users are advised to re-run the query using the exact ID name (e.g., '{self.options[0]}').
        """
        self.api_key = api_key
        self.symbol = symbol
        self.options = options
        self.error_message = self.create_error_message()

    def get_coin_details(self, coin_id):
        """
        ### Retrieves details about a cryptocurrency from the CoinMarketCap API.

        ## Parameters:
        | Parameter Name | Type  | Description                                 |
        |:---------------|:------|:--------------------------------------------|
        | `coin_id`      | `str` | The CoinMarketCap ID of the cryptocurrency. |

        ## Returns:
        | Return Name   | Type          | Description                                       |
        |:--------------|:--------------|:--------------------------------------------------|
        | `details`     | `Dict`, `None`| A dictionary of details about the cryptocurrency. |

        ## Dependencies:
        | Dependency name              | Type     | Description                             |
        |:-----------------------------|:---------|:----------------------------------------|
        | `COINMARKETCAP_API_BASE_URL` | `str`    | The base URL for the CoinMarketCap API. |
        """
        headers = {"X-CMC_PRO_API_KEY": self.api_key}
        url = f"{COINMARKETCAP_API_BASE_URL}/cryptocurrency/info"
        params = {"id": coin_id}
        response = requests.get(url, headers=headers, params=params)
        if response.status_code == 200:
            return(response.json())
        else:
            print(f"Error: Unable to fetch coin details. Status code: {response.status_code}")
            return(None)

    def create_error_message(self):
        """
        ### Creates an error message for ambiguous coin symbols.

        ## Returns:
        | Return Name      | Type   | Description                                                                              |
        |:-----------------|:-------|:-----------------------------------------------------------------------------------------|
        | `error_message`  | `str`  | The error message string to be raised with the `CoinMarketCapAmbiguousCoinError` object. |

        ## Dependencies:
        | Dependency name              | Type        | Description                             |
        |:-----------------------------|:------------|:----------------------------------------|
        | `COINMARKETCAP_API_BASE_URL` | `str`       | The base URL for the CoinMarketCap API. |

        ## Notes:
        - This method creates an error message for the `CoinMarketCapAmbiguousCoinError` exception when multiple coins with the same symbol are found in the CoinMarketCap API.
        - This method retrieves details of each ambiguous coin by making a GET request to the CoinMarketCap API.
        - If no details are retrieved for a coin ID, the relevant fields in the table will be left blank.
        - The resulting error message includes a table with details of each ambiguous coin.
        - Users are advised to re-run the query using the exact ID name (e.g., '{self.options[0]}').
        """
        option_list = ", ".join(str(option) for option in self.options)
        details = [self.get_coin_details(option) for option in self.options]
        table_data = [{'coin id': detail['data'][str(self.options[idx])]['id'],
                       'symbol': detail['data'][str(self.options[idx])]['symbol'],
                       'website': detail['data'][str(self.options[idx])]['urls']['website'][0] if detail['data'][str(self.options[idx])]['urls']['website'] else '',
                       'twitter': detail['data'][str(self.options[idx])]['urls']['twitter'][0] if detail['data'][str(self.options[idx])]['urls']['twitter'] else '',
                       'explorer': detail['data'][str(self.options[idx])]['urls']['explorer'][0] if detail['data'][str(self.options[idx])]['urls']['explorer'] else ''}
                       for idx, detail in enumerate(details)]
        table = tabulate(table_data, headers="keys", tablefmt="pipe")
        return (f"More than one coin found with the symbol '{self.symbol}': {option_list}.\n"
                f"Please re-run the query using the exact id name (e.g., '{self.options[0]}').\n\n{table}")

    def __str__(self):
        """
        Returns the error message created by the `create_error_message` method when a `CoinMarketCapAmbiguousCoinError` is raised.

        ## Returns:
        | Return Name      | Type   | Description                                                                              |
        |:-----------------|:-------|:-----------------------------------------------------------------------------------------|
        | `error_message`  | `str`  | The error message string to be raised with the `CoinMarketCapAmbiguousCoinError` object. |
        """
        return(self.error_message)

# # CoinGecko API Call

def get_CoinGecko_coin_id_from_symbol(
    symbol: str
    ) -> Union[str, None]:
    """
    ### Retrieves the CoinGecko coin ID for a given coin symbol.

    ## Parameters:
    | Parameter Name | Type  | Description                                |
    |:---------------|:------|:-------------------------------------------|
    | `symbol`       | `str` | The coin symbol (e.g., 'BTC' for Bitcoin). |

    ## Returns:
    | Return Name    | Type               | Description                                   |
    |:---------------|:-------------------|:----------------------------------------------|
    | `coin_id`      | `Union[str, None]` | The CoinGecko coin ID or `None` if not found. |
    
    ## Raises:
    | Exception Name                    | Description                                                                    |
    |:----------------------------------|:-------------------------------------------------------------------------------|
    | `CoinNotFoundError`               | Raised when no match is found for the provided cryptocurrency symbol.          |
    | `CoinGeckoAmbiguousCoinError`     | Raised when multiple matches are found for the provided cryptocurrency symbol. |

    ## Dependencies:
    | Dependency name                  | Type             | Description                                                 |
    |:---------------------------------|:-----------------|:------------------------------------------------------------|
    | `COINGECKO_API_BASE_URL`         | `str`            | The base URL for the CoinGecko API.                         |
    | `COMMON_COINS_DISAMBIGUATION['CoinGecko']`    | `Dict[str, str]` | A dictionary to disambiguate common coins by their symbols. |
    
    ## Examples:
    >>> get_CoinGecko_coin_id_from_symbol('ETH')
    "More than one coin found with the symbol 'ETH': ethereum, ethereum-wormhole. Please re-run the query using the exact id name (e.g., 'ethereum')."
    "Using default coin id 'ethereum' for symbol 'ETH'"
    'ethereum'
    
    >>> get_CoinGecko_coin_id_from_symbol('GEAR')
    "More than one coin found with the symbol 'GEAR': bitgear, gear, gearbox, metagear, starbots-gear. Please re-run the query using the exact id name (e.g., 'bitgear')."
    "Using default coin id 'gearbox' for symbol 'GEAR'"
    'gearbox'
    
    >>> get_CoinGecko_coin_id_from_symbol('BTC')
    'bitcoin'
    
    >>> get_CoinGecko_coin_id_from_symbol('BNT')
    'bancor'
    
    >>> get_CoinGecko_coin_id_from_symbol('OMG')
    'omisego'
    
    ## Notes:
    - This function searches the CoinGecko API to find a matching coin ID for the provided symbol.
    - If multiple coins with the same symbol are found, it will try to disambiguate the symbol using the `COMMON_COINS_DISAMBIGUATION['CoinGecko']` dictionary.
    - If no match is found, a `CoinNotFoundError` is raised.
    - If multiple matches are found and cannot be disambiguated, an `AmbiguousCoinError` is raised.
    """
    global COINGECKO_API_BASE_URL
    try:
        response = requests.get(COINGECKO_API_BASE_URL + "/coins/list")
        coin_list = response.json()
        matching_coins = []
        for coin in coin_list:
            if coin['symbol'].lower() == symbol.lower():
                matching_coins.append(coin['id'])
        if not matching_coins:
            raise CoinNotFoundError(symbol)
        if len(matching_coins) > 1:
            options = matching_coins
            raise CoinGeckoAmbiguousCoinError(symbol, options)
        return(matching_coins[0])
    except CoinGeckoAmbiguousCoinError as e:
        print(e)
        if symbol.upper() in COMMON_COINS_DISAMBIGUATION['CoinGecko']:
            print(f"Using default coin id '{COMMON_COINS_DISAMBIGUATION['CoinGecko'][symbol.upper()]}' for symbol '{symbol}'")
            return(COMMON_COINS_DISAMBIGUATION['CoinGecko'][symbol.upper()])
    except CoinNotFoundError as e:
        print(e)
    return(None)

def get_CoinGecko_symbol_from_coin_id(
    coin_id: str
    ) -> Union[str, None]:
    """
    ### Retrieves the cryptocurrency symbol corresponding to a CoinGecko coin ID.

    ## Parameters:
    | Parameter Name | Type  | Description            |
    |:---------------|:------|:-----------------------|
    | `coin_id`      | `str` | The CoinGecko coin ID. |

    ## Returns:
    | Return Name | Type               | Description                                                                                                       |
    |:------------|:-------------------|:------------------------------------------------------------------------------------------------------------------|
    | `symbol`    | `Union[str, None]` | The cryptocurrency symbol corresponding to the provided CoinGecko coin ID. If no match is found, returns `None`.  |

    ## Raises:
    | Exception Name | Description                                                      |
    |:---------------|:-----------------------------------------------------------------|
    | `Exception`    | Raised when an error occurs during the request or processing.    |

    ## Dependencies:
    | Dependency name          | Type  | Description                             |
    |:-------------------------|:------|:----------------------------------------|
    | `COINGECKO_API_BASE_URL` | `str` | The base URL for the CoinGecko API.     |
    
    ## Examples:
    >>> get_CoinGecko_symbol_from_coin_id("ethereum")
    "ETH"
    
    >>> get_CoinGecko_symbol_from_coin_id("bitcoin")
    "BTC"

    ## Notes:
    - This function retrieves coin information from the CoinGecko API using the provided coin ID.
    - The function then extracts and returns the corresponding symbol.
    - If no match is found or an error occurs during the request, an `Exception` is raised.
    """
    try:
        response = requests.get(COINGECKO_API_BASE_URL + f"/coins/{coin_id}")
        response.raise_for_status()
        coin_data = response.json()
        symbol = coin_data['symbol'].upper()
        return(symbol)
    except Exception as e:
        print(f"Error retrieving coin symbol for coin ID '{coin_id}': {e}")
        return(None)

def build_CoinGecko_url_and_request_parameters(
    coin_input: str,
    frequency: str,  
    start_time: pd.Timestamp, 
    stop_time: pd.Timestamp, 
    api_key: Union[str, None]
    ) -> Tuple[str, Dict[str, str]]:
    """
    ### Builds the CoinGecko API URL and request parameters.

    ## Parameters:
    | Parameter Name | Type               | Description                                             |
    |:---------------|:-------------------|:--------------------------------------------------------|
    | `coin_input`   | `str`              | The CoinGecko coin ID or symbol.                        |
    | `frequency`    | `str`              | The frequency of data points (e.g., "daily", "hourly"). |
    | `start_time`   | `pd.Timestamp`     | The start time for the historical data range.           |
    | `stop_time`    | `pd.Timestamp`     | The end time for the historical data range.             |
    | `api_key`      | `Union[str, None]` | The CoinGecko API key, if available.                    |

    ## Returns:
    | Return Name          | Type                         | Description                                                |
    |:---------------------|:-----------------------------|:-----------------------------------------------------------|
    | `url`                | `str`                        | The CoinGecko API URL.                                     |
    | `request_parameters` | `Dict[str, str]`             | The request parameters for the API call.                   |
    |                      | `Tuple[str, Dict[str, str]]` | A tuple of `url` and `request_parameters` (in that order). |

    ## Dependencies:
    | Dependency name             | Type  | Description                             |
    |:----------------------------|:------|:----------------------------------------|
    | `COINGECKO_API_BASE_URL`    | `str` | The base URL for the CoinGecko API.     |
    | `COINGECKOPRO_API_BASE_URL` | `str` | The base URL for the CoinGecko Pro API. |
    
    ## Examples:
    >>> coin_input = 'bitcoin'
    >>> frequency = 'hour'
    >>> start_time = pd.Timestamp('2022-01-01 01:23')
    >>> stop_time = pd.Timestamp('2022-02-01 04:56')
    >>> api_key = 'secret_CoinGecko_api_key'
    >>> build_CoinGecko_url_and_request_parameters(coin_input, frequency, start_time, stop_time, api_key)
    https://pro-api.coingecko.com/api/v3/coins/bitcoin/market_chart/range
    {'vs_currency': 'usd', 'from': 1641000180, 'to': 1643691360, 'interval': 'hour', 'x_cg_pro_api_key': 'secret_CoinGecko_api_key'}
    
    
    >>> coin_input = 'bitcoin'
    >>> frequency = 'hour'
    >>> start_time = pd.Timestamp('2022-01-01 01:23')
    >>> stop_time = pd.Timestamp('2022-02-01 04:56')
    >>> api_key = None
    >>> build_CoinGecko_url_and_request_parameters(coin_input, frequency, start_time, stop_time, api_key)
    https://api.coingecko.com/api/v3/coins/bitcoin/market_chart/range
    {'vs_currency': 'usd', 'from': 1641000180, 'to': 1643691360, 'interval': 'hour'}
    
    ## Notes:
    - This function constructs the CoinGecko API URL and request parameters based on the provided inputs.
    """
    global COINGECKO_API_BASE_URL
    global COINGECKOPRO_API_BASE_URL
    
    url = f"{COINGECKO_API_BASE_URL if api_key is None else COINGECKOPRO_API_BASE_URL}/coins/{coin_input}/market_chart/range"
    request_parameters = {"vs_currency": "usd",
                          "from": int(pd.Timestamp(start_time).timestamp()),
                          "to": int(pd.Timestamp(stop_time).timestamp()),
                          "interval": frequency,
                          **({"x_cg_pro_api_key": api_key} if api_key else {})}
    return(url, request_parameters)

def make_CoinGecko_api_request(
    url: str, 
    request_parameters: Dict[str, str],
    ) -> requests.models.Response:
    """
    ### Makes a CoinGecko API request.

    ## Parameters:
    | Parameter Name       | Type             | Description                               |
    |:---------------------|:-----------------|:------------------------------------------|
    | `url`                | `str`            | The CoinGecko API URL.                    |
    | `request_parameters` | `Dict[str, str]` | The request parameters for the API call.  |

    ## Returns:
    | Return Name      | Type                      | Description                               |
    |:-----------------|:--------------------------|:------------------------------------------|
    | `api_response`   | `requests.models.Response` | The API response from the CoinGecko API. |

    ## Raises:
    | Exception Name         | Description                       |
    |:-----------------------|:----------------------------------|
    | `HTTPError`            | Raised when an HTTP error occurs. |
    
    ## Example:
    >>> coin_input = 'bitcoin'
    >>> frequency = 'hour'
    >>> start_time = pd.Timestamp('2022-01-01 01:23')
    >>> stop_time = pd.Timestamp('2022-02-01 04:56')
    >>> api_key = secret_CoinGecko_api_key
    >>> url, request_parameters = build_CoinGecko_url_and_request_parameters(coin_input, frequency, start_time, stop_time, api_key)
    >>> make_CoinGecko_api_request(url, request_parameters)
    <Response [200]>
    
    ## Notes:
    - This function makes a `GET` request to the provided CoinGecko API URL with the specified request parameters.
    - If an HTTP error occurs, the function raises an `HTTPError`.
    """
    api_response = requests.get(url, request_parameters)
    api_response.raise_for_status()
    return(api_response)

def process_CoinGecko_api_response(
    api_response: requests.models.Response
    ) -> pd.DataFrame:
    """
    ### Processes the CoinGecko API response and creates a DataFrame.

    ## Parameters:
    | Parameter Name | Type                       | Description                              |
    |:---------------|:---------------------------|:-----------------------------------------|
    | `api_response` | `requests.models.Response` | The API response from the CoinGecko API. |

    ## Returns:
    | Return Name                       | Type           | Description                                                         |
    |:----------------------------------|:---------------|:--------------------------------------------------------------------|
    | `partial_CoinGecko_api_dataframe` | `pd.DataFrame` | A DataFrame containing historical price data from the API response. |
    
    ## Example:
    >>> coin_input = 'bitcoin'
    >>> frequency = 'hour'
    >>> start_time = pd.Timestamp('2022-01-01 01:23')
    >>> stop_time = pd.Timestamp('2022-02-01 04:56')
    >>> api_key = secret_CoinGecko_api_key
    >>> url, request_parameters = build_CoinGecko_url_and_request_parameters(coin_input, frequency, start_time, stop_time, api_key)
    >>> api_response = make_CoinGecko_api_request(url, request_parameters)
    >>> process_CoinGecko_api_response(api_response)
    
    |     | time                       |   price |
    |----:|:---------------------------|--------:|
    |   0 | 2022-01-01 02:04:12.511000 | 46811   |
    |   1 | 2022-01-01 03:06:02.956000 | 46880.3 |
    |   2 | 2022-01-01 04:07:54.279000 | 46907.5 |
    |   3 | 2022-01-01 05:05:12.694000 | 46874.7 |
    |   4 | 2022-01-01 06:02:28.259000 | 47372.2 |
    |   5 | 2022-01-01 07:02:34.453000 | 47128.8 |
    |   6 | 2022-01-01 08:07:24.418000 | 47292.8 |
    |   7 | 2022-01-01 09:17:39.948000 | 47251.9 |
    |   8 | 2022-01-01 10:06:34.501000 | 47223.1 |
    |   9 | 2022-01-01 11:03:31.717000 | 46983.1 |
    |  10 | 2022-01-01 12:03:51.867000 | 46910.8 |
    |  11 | 2022-01-01 13:10:46.920000 | 47197.9 |
    |  12 | 2022-01-01 14:04:55.812000 | 47061   |
    |  13 | 2022-01-01 15:07:06.547000 | 46990.9 |
    |  14 | 2022-01-01 16:00:17.098000 | 47415.4 |
    |  15 | 2022-01-01 17:03:09.028000 | 47349.3 |
    |  16 | 2022-01-01 18:06:31.580000 | 48033.2 |
    |  17 | 2022-01-01 19:03:26.923000 | 47648.7 |
    |  18 | 2022-01-01 20:06:48.314000 | 47369.4 |
    |  19 | 2022-01-01 21:06:07.074000 | 47490.1 |
    |  20 | 2022-01-01 22:03:43.890000 | 47340.5 |
    |  21 | 2022-01-01 23:04:22.034000 | 47506.8 |
    |  22 | 2022-01-02 00:01:18.106000 | 47816.1 |
    ...
    | 742 | 2022-02-01 01:00:20.568000 | 38374.5 |
    | 743 | 2022-02-01 02:00:14.525000 | 38316.5 |
    | 744 | 2022-02-01 03:01:26.928000 | 38491.7 |
    | 745 | 2022-02-01 04:01:57.624000 | 38652.8 |

    ## Notes:
    - This function processes the API response and creates a DataFrame with the extracted price data.
    - The 'time' column is converted to a human-readable format.
    """
    data = api_response.json()
    partial_CoinGecko_api_dataframe = pd.DataFrame(data['prices'], columns = ["time", "price"])
    partial_CoinGecko_api_dataframe['time'] = pd.to_datetime(partial_CoinGecko_api_dataframe['time'], unit = 'ms', utc = True).dt.strftime("%Y-%m-%d %H:%M:%S.%f")
    return(partial_CoinGecko_api_dataframe)

def get_parital_CoinGecko_price_dataframe(
    coin_input: str,
    frequency: str,  
    start_time: pd.Timestamp, 
    stop_time: pd.Timestamp, 
    api_key: Union[str, None]
    ) -> pd.DataFrame:
    """
    ### Fetches a partial historical price DataFrame for a cryptocurrency from the CoinGecko API.

    ## Parameters:
    | Parameter Name | Type               | Description                                             |
    |:---------------|:-------------------|:--------------------------------------------------------|
    | `coin_input`   | `str`              | The CoinGecko coin ID or symbol.                        |
    | `frequency`    | `str`              | The frequency of data points (e.g., "daily", "hourly"). |
    | `start_time`   | `pd.Timestamp`     | The start time for the historical data range.           |
    | `stop_time`    | `pd.Timestamp`     | The end time for the historical data range.             |
    | `api_key`      | `Union[str, None]` | The CoinGecko API key, if available.                    |

    ## Returns:
    | Return Name                       | Type           | Description                                                                                       |
    |:----------------------------------|:---------------|:--------------------------------------------------------------------------------------------------|
    | `partial_CoinGecko_api_dataframe` | `pd.DataFrame` | A `DataFrame` containing a portion of the historical price data for the specified cryptocurrency. |
    
    ## Dependencies:
    | Dependency name                              | Type       | Description                                                       |
    |:---------------------------------------------|:-----------|:------------------------------------------------------------------|
    | `build_CoinGecko_url_and_request_parameters` | `function` | Builds the CoinGecko API URL and request parameters.              |
    | `make_CoinGecko_api_request`                 | `function` | Makes a CoinGecko API request.                                    |
    | `process_CoinGecko_api_response`             | `function` | Processes the CoinGecko API `response` and creates a `DataFrame`. |
    
    Example:
    >>> coin_input = 'bitcoin'
    >>> frequency = 'hour'
    >>> start_time = pd.Timestamp('2022-01-01 01:23')
    >>> stop_time = pd.Timestamp('2022-02-01 04:56')
    >>> api_key = secret_CoinGecko_api_key
    >>> get_parital_CoinGecko_price_dataframe(coin_input, frequency, start_time, stop_time, api_key)
    
    |     | time                       |   price |
    |----:|:---------------------------|--------:|
    |   0 | 2022-01-01 02:04:12.511000 | 46811   |
    |   1 | 2022-01-01 03:06:02.956000 | 46880.3 |
    |   2 | 2022-01-01 04:07:54.279000 | 46907.5 |
    |   3 | 2022-01-01 05:05:12.694000 | 46874.7 |
    |   4 | 2022-01-01 06:02:28.259000 | 47372.2 |
    |   5 | 2022-01-01 07:02:34.453000 | 47128.8 |
    |   6 | 2022-01-01 08:07:24.418000 | 47292.8 |
    |   7 | 2022-01-01 09:17:39.948000 | 47251.9 |
    |   8 | 2022-01-01 10:06:34.501000 | 47223.1 |
    |   9 | 2022-01-01 11:03:31.717000 | 46983.1 |
    |  10 | 2022-01-01 12:03:51.867000 | 46910.8 |
    |  11 | 2022-01-01 13:10:46.920000 | 47197.9 |
    |  12 | 2022-01-01 14:04:55.812000 | 47061   |
    |  13 | 2022-01-01 15:07:06.547000 | 46990.9 |
    |  14 | 2022-01-01 16:00:17.098000 | 47415.4 |
    |  15 | 2022-01-01 17:03:09.028000 | 47349.3 |
    |  16 | 2022-01-01 18:06:31.580000 | 48033.2 |
    |  17 | 2022-01-01 19:03:26.923000 | 47648.7 |
    |  18 | 2022-01-01 20:06:48.314000 | 47369.4 |
    |  19 | 2022-01-01 21:06:07.074000 | 47490.1 |
    |  20 | 2022-01-01 22:03:43.890000 | 47340.5 |
    |  21 | 2022-01-01 23:04:22.034000 | 47506.8 |
    |  22 | 2022-01-02 00:01:18.106000 | 47816.1 |
    ...
    | 742 | 2022-02-01 01:00:20.568000 | 38374.5 |
    | 743 | 2022-02-01 02:00:14.525000 | 38316.5 |
    | 744 | 2022-02-01 03:01:26.928000 | 38491.7 |
    | 745 | 2022-02-01 04:01:57.624000 | 38652.8 |

    ## Notes:
    - This function fetches a partial historical price DataFrame for a cryptocurrency from the CoinGecko API.
    - The function is used to handle requests for data ranges that exceed the API's maximum limit.
    - The 'time' column in the returned DataFrame is converted to a human-readable format.
    """
    url, request_parameters = build_CoinGecko_url_and_request_parameters(coin_input, frequency, start_time, stop_time, api_key)
    api_response = make_CoinGecko_api_request(url, request_parameters)
    partial_CoinGecko_api_dataframe = process_CoinGecko_api_response(api_response)
    return(partial_CoinGecko_api_dataframe)

def get_CoinGecko_price_dataframe(
    coin_input: str, 
    frequency: str,
    start_date: str, 
    end_date: str, 
    api_key: Union[str, None]
    ) -> pd.DataFrame:
    """
    ### Fetches a complete historical price DataFrame for a cryptocurrency from the CoinGecko API.

    ## Parameters:
    | Parameter Name | Type               | Description                                             |
    |:---------------|:-------------------|:--------------------------------------------------------|
    | `coin_input`   | `str`              | The CoinGecko coin ID or symbol.                        |
    | `frequency`    | `str`              | The frequency of data points (e.g., "daily", "hourly"). |
    | `start_date`   | `str`              | The start date for the historical data range.           |
    | `end_date`     | `str`              | The end date for the historical data range.             |
    | `api_key`      | `Union[str, None]` | The CoinGecko API key, if available.                    |

    ## Returns:
    | Return Name                 | Type           | Description                                                                                 |
    |:----------------------------|:---------------|:--------------------------------------------------------------------------------------------|
    | `CoinGecko_price_dataframe` | `pd.DataFrame` | A DataFrame containing the complete historical price data for the specified cryptocurrency. |
    
    ## Dependencies:
    | Dependency name                         | Type       | Description                                                                               |
    |:----------------------------------------|:-----------|:------------------------------------------------------------------------------------------|
    | `get_parital_CoinGecko_price_dataframe` | `function` | Fetches a partial historical price DataFrame for a cryptocurrency from the CoinGecko API. |
    
    ## Examples:
    >>> coin_input = 'bitcoin'
    >>> frequency = 'hour'
    >>> start_date = '2018-05-23 00:01'
    >>> end_date = '2020-05-23 00:01'
    >>> api_key = secret_CoinGecko_api_key
    >>> get_CoinGecko_price_dataframe(coin_input, frequency, start_date, end_date, api_key)
    
    |       | time                       |    price |
    |------:|:---------------------------|---------:|
    |     0 | 2018-05-23 00:49:47.150000 |  7995.49 |
    |     1 | 2018-05-23 01:49:47.361000 |  7912.87 |
    |     2 | 2018-05-23 02:49:48.408000 |  7929.19 |
    |     3 | 2018-05-23 02:57:45.342000 |  7934.01 |
    |     4 | 2018-05-23 03:57:23.252000 |  7973.66 |
    |     5 | 2018-05-23 04:57:22.952000 |  7925.76 |
    |     6 | 2018-05-23 05:57:25.296000 |  7944.27 |
    |     7 | 2018-05-23 06:57:23.817000 |  7972.79 |
    |     8 | 2018-05-23 07:57:21.658000 |  7899.11 |
    |     9 | 2018-05-23 08:04:21.369000 |  7905.49 |
    |    10 | 2018-05-23 09:04:06.823000 |  7900.67 |
    |    11 | 2018-05-23 10:04:07.654000 |  7887.98 |
    |    12 | 2018-05-23 11:04:08.731000 |  7896.68 |
    |    13 | 2018-05-23 12:04:09.517000 |  7887.61 |
    |    14 | 2018-05-23 13:04:09.295000 |  7929.53 |
    |    15 | 2018-05-23 14:04:07.403000 |  7925.12 |
    |    16 | 2018-05-23 15:04:08.466000 |  7910.04 |
    |    17 | 2018-05-23 16:04:08.483000 |  7753.01 |
    |    18 | 2018-05-23 17:04:07.525000 |  7675.36 |
    |    19 | 2018-05-23 18:04:09.108000 |  7572.47 |
    |    20 | 2018-05-23 19:04:06.933000 |  7541.95 |
    |    21 | 2018-05-23 20:04:07.728000 |  7638.63 |
    |    22 | 2018-05-23 21:04:06.681000 |  7606.59 |
    ...
    | 17674 | 2020-05-22 20:09:51.689000 |  9161.75 |
    | 17675 | 2020-05-22 21:07:20.227000 |  9179.57 |
    | 17676 | 2020-05-22 22:04:18.880000 |  9189.17 |
    | 17677 | 2020-05-22 23:04:35.406000 |  9189.53 |
    
    >>> coin_input = 'bitcoin'
    >>> frequency = 'hour'
    >>> start_date = '2018-05-23 00:00'
    >>> end_date = '2020-05-23 00:00'
    >>> api_key = secret_CoinGecko_api_key
    >>> get_CoinGecko_price_dataframe(coin_input, frequency, start_date, end_date, api_key)
    
    |       | time                       |    price |
    |------:|:---------------------------|---------:|
    |     0 | 2018-05-23 00:00:00.000000 |  8009.3  |
    |     1 | 2018-05-24 00:00:00.000000 |  7556.32 |
    |     2 | 2018-05-25 00:00:00.000000 |  7563.44 |
    |     3 | 2018-05-26 00:00:00.000000 |  7472.02 |
    |     4 | 2018-05-27 00:00:00.000000 |  7328.87 |
    |     5 | 2018-05-28 00:00:00.000000 |  7326.64 |
    |     6 | 2018-05-29 00:00:00.000000 |  7111.07 |
    |     7 | 2018-05-30 00:00:00.000000 |  7451.23 |
    |     8 | 2018-05-31 00:00:00.000000 |  7380.85 |
    |     9 | 2018-06-01 00:00:00.000000 |  7460.17 |
    |    10 | 2018-06-02 00:00:00.000000 |  7487.08 |
    |    11 | 2018-06-03 00:00:00.000000 |  7567.51 |
    |    12 | 2018-06-04 00:00:00.000000 |  7639.88 |
    |    13 | 2018-06-05 00:00:00.000000 |  7463.65 |
    |    14 | 2018-06-06 00:00:00.000000 |  7569.01 |
    |    15 | 2018-06-07 00:00:00.000000 |  7605.58 |
    |    16 | 2018-06-08 00:00:00.000000 |  7613.78 |
    |    17 | 2018-06-09 00:00:00.000000 |  7561.17 |
    |    18 | 2018-06-10 00:00:00.000000 |  7415    |
    |    19 | 2018-06-11 00:00:00.000000 |  6767.5  |
    |    20 | 2018-06-12 00:00:00.000000 |  6880.13 |
    |    21 | 2018-06-13 00:00:00.000000 |  6581.83 |
    |    22 | 2018-06-14 00:00:00.000000 |  6334.1  |
    ...
    | 15520 | 2020-05-22 20:09:51.689000 |  9161.75 |
    | 15521 | 2020-05-22 21:07:20.227000 |  9179.57 |
    | 15522 | 2020-05-22 22:04:18.880000 |  9189.17 |
    | 15523 | 2020-05-22 23:04:35.406000 |  9189.53 |

    ## Notes:
    - This function fetches a complete historical price `DataFrame` for a cryptocurrency from the CoinGecko API by concatenating partial DataFrames from separate API calls.
    - The granularity of the data is sensitive to the start and end dates. The data is available at hourly granularity for the last four years only, and the granularity defaults to daily for data older than four years.
    - The provided examples illustrate how the choice of start and end dates affects data granularity:
        - When using start_date = '2018-05-23 00:01' and end_date = '2020-05-23 00:01', the first partial DataFrame has 1-hour granularity.
        - When using start_date = '2018-05-23 00:00' and end_date = '2020-05-23 00:00', the first partial DataFrame has 24-hour granularity.
        - Therefore, if the API call crosses the hourly date threshold, all data is returned with daily granularity. 
    - Users should be aware of the sensitivity to start and end dates to ensure the desired granularity is obtained in the resulting DataFrame.
    - This function handles requests for data ranges that exceed the API's maximum limit by concatenating partial DataFrames.
    - The 'time' column in the returned DataFrame is converted to a human-readable format.

    """
    CoinGecko_price_dataframe = pd.concat([get_parital_CoinGecko_price_dataframe(coin_input, frequency, i, j, api_key)
                                           for i, j in ((i, min(i + timedelta(days = 90), pd.Timestamp(end_date))) 
                                           for i in pd.date_range(pd.Timestamp(start_date), pd.Timestamp(end_date), freq = '90D'))],
                                           ignore_index = True)
    return(CoinGecko_price_dataframe)

def get_CoinGecko_historical_price_data(
    coin_input: str,
    frequency : str, 
    start_date: str, 
    end_date: str, 
    api_key: str = None
    ) -> pd.DataFrame:
    """
    ### Retrieves historical price data for a given coin from CoinGecko.

    ## Parameters:
    | Parameter Name | Type               | Description                                                      |
    |:---------------|:-------------------|:-----------------------------------------------------------------|
    | `coin_input`   | `str`              | The coin symbol or CoinGecko coin ID.                            |
    | `frequency`    | `str`              | The frequency of the historical data (e.g. 'daily', 'hourly').   |
    | `start_date`   | `str`              | The start date of the historical data range (YYYY-MM-DD HH:MM).  |
    | `end_date`     | `str`              | The end date of the historical data range (YYYY-MM-DD HH:MM).    |
    | `api_key`      | `Union[str, None]` | The CoinGecko API key, if available.                             |

    ## Returns:
    | Return Name                 | Type                       | Description                                                                                                                           |
    |:----------------------------|:---------------------------|:--------------------------------------------------------------------------------------------------------------------------------------|
    | `coin_symbol`               | `str`                      | A string containing the appropriate cryptocurrency ticker symbol for the associated CoinGecko coin ID (e.g. 'ETH' for ID 'ethereum'). |
    | `CoinGecko_price_dataframe` | `pd.DataFrame`             | A pandas `DataFrame` with historical price data (columns 'time' and 'price') for the given `coin_input` in USD.                       |
    |                             | `Tuple[str, pd.DataFrame]` | A `tuple` of `coin_symbol` and `CoinGecko_price_dataframe`, in that order. If no data is found, returns `None`.                       |

    ## Dependencies:
    | Dependency name                     | Type       | Description                                                                                |
    |:------------------------------------|:-----------|:-------------------------------------------------------------------------------------------|
    | `get_CoinGecko_price_dataframe`     | `function` | Fetches a complete historical price DataFrame for a cryptocurrency from the CoinGecko API. |
    | `get_CoinGecko_coin_id_from_symbol` | `function` | Converts a coin symbol to its CoinGecko coin ID, if necessary.                             |
    | `get_CoinGecko_symbol_from_coin_id` | `function` | Converts a CoinGecko coin ID to its coin symbol, if necessary.                             |
    
    ## Examples:
    >>> coin_input = 'ETH'
    >>> frequency = 'hour'
    >>> start_date = '2020-01-01 00:00'
    >>> end_date = '2022-02-01 00:00'
    >>> api_key = secret_CoinGecko_api_key
    >>> get_CoinGecko_historical_price_data(coin_input, frequency, start_date, end_date, api_key)
    
    "More than one coin found with the symbol 'ETH': ethereum, ethereum-wormhole. Please re-run the query using the exact id name (e.g., 'ethereum')."
    "Using default coin id 'ethereum' for symbol 'ETH'"
    
    "ETH"
    
    |       | time                       |    price |
    |------:|:---------------------------|---------:|
    |     0 | 2020-01-01 00:05:39.816000 |  128.812 |
    |     1 | 2020-01-01 01:09:25.936000 |  128.859 |
    |     2 | 2020-01-01 02:02:25.645000 |  130.177 |
    |     3 | 2020-01-01 03:08:43.594000 |  130.647 |
    |     4 | 2020-01-01 04:07:16.829000 |  130.106 |
    |     5 | 2020-01-01 05:05:17.843000 |  130.069 |
    |     6 | 2020-01-01 06:10:01.414000 |  130.236 |
    |     7 | 2020-01-01 07:02:46.849000 |  130.325 |
    |     8 | 2020-01-01 08:07:48.198000 |  130.172 |
    |     9 | 2020-01-01 09:02:50.016000 |  130.085 |
    |    10 | 2020-01-01 10:04:17.702000 |  130.182 |
    |    11 | 2020-01-01 11:02:59.271000 |  130.623 |
    |    12 | 2020-01-01 12:09:41.763000 |  130.804 |
    |    13 | 2020-01-01 13:05:49.201000 |  131.184 |
    |    14 | 2020-01-01 14:07:34.501000 |  131.104 |
    |    15 | 2020-01-01 15:00:46.660000 |  131.888 |
    |    16 | 2020-01-01 16:09:53.844000 |  131.773 |
    |    17 | 2020-01-01 17:00:41.602000 |  132.122 |
    |    18 | 2020-01-01 18:04:58.762000 |  132.339 |
    |    19 | 2020-01-01 19:09:02.986000 |  131.834 |
    ...
    | 18282 | 2022-01-31 20:01:59.343000 | 2677.35  |
    | 18283 | 2022-01-31 21:00:43.420000 | 2691.35  |
    | 18284 | 2022-01-31 22:01:10.939000 | 2684.81  |
    | 18285 | 2022-01-31 23:02:05.538000 | 2683.85  |
    
    >>> coin_input = 'MPH'
    >>> frequency = 'hour'
    >>> start_date = '2021-01-01 00:00'
    >>> end_date = '2023-02-01 00:00'
    >>> api_key = secret_CoinGecko_api_key
    >>> get_CoinGecko_historical_price_data(coin_input, frequency, start_date, end_date, api_key)
    
    "More than one coin found with the symbol 'MPH': 88mph, morpher. Please re-run the query using the exact id name (e.g., '88mph')."
    "Using default coin id '88mph' for symbol 'MPH'"
    
    "MPH"
    
    |       | time                       |      price |
    |------:|:---------------------------|-----------:|
    |     0 | 2021-01-01 00:29:16.963000 |  28.7646   |
    |     1 | 2021-01-01 01:27:47.051000 |  30.3488   |
    |     2 | 2021-01-01 02:28:25.943000 |  35.5704   |
    |     3 | 2021-01-01 03:28:06.024000 |  36.1877   |
    |     4 | 2021-01-01 04:27:46.166000 |  36.422    |
    |     5 | 2021-01-01 05:28:21.337000 |  35.9336   |
    |     6 | 2021-01-01 06:28:45.372000 |  35.4946   |
    |     7 | 2021-01-01 07:28:51.130000 |  34.9953   |
    |     8 | 2021-01-01 08:27:56.329000 |  34.3601   |
    |     9 | 2021-01-01 09:22:41.464000 |  34.1241   |
    |    10 | 2021-01-01 10:08:58.968000 |  34.2833   |
    |    11 | 2021-01-01 11:24:38.028000 |  34.3887   |
    |    12 | 2021-01-01 12:28:05.493000 |  34.0112   |
    |    13 | 2021-01-01 13:27:05.507000 |  34.5777   |
    |    14 | 2021-01-01 14:26:54.033000 |  34.582    |
    |    15 | 2021-01-01 15:15:19.363000 |  34.8067   |
    |    16 | 2021-01-01 16:16:25.278000 |  34.1745   |
    |    17 | 2021-01-01 17:01:50.740000 |  34.9115   |
    |    18 | 2021-01-01 18:01:59.656000 |  34.9673   |
    |    19 | 2021-01-01 19:29:37.476000 |  38.4593   |
    ...
    | 18245 | 2023-01-31 20:00:30.546000 |   1.21398  |
    | 18246 | 2023-01-31 21:00:07.183000 |   1.18625  |
    | 18247 | 2023-01-31 22:00:01.723000 |   1.17937  |
    | 18248 | 2023-01-31 23:00:06.055000 |   1.19718  |

    ## Notes:
    - The function first attempts to get the data using the provided `coin_input` string.
    - If that fails, it tries to get the CoinGecko coin ID using `get_CoinGecko_coin_id_from_symbol` and fetch the data with the obtained ID.
    - If `get_CoinGecko_coin_id_from_symbol` raises a `ValueError`, the function prints the error message and returns `None`.
    - If the request still fails, the function prints an error message and returns `None`.
    - The resulting `DataFrame` has two columns: 'time' and 'price'.
    - The 'time' column contains datetime objects, and the 'price' column contains the historical price data.
    """
    try:
        CoinGecko_price_dataframe = get_CoinGecko_price_dataframe(coin_input, frequency, start_date, end_date, api_key)
        coin_symbol = get_CoinGecko_symbol_from_coin_id(coin_input)
    except requests.exceptions.HTTPError:
        try:
            coin_id = get_CoinGecko_coin_id_from_symbol(coin_input)
            CoinGecko_price_dataframe = get_CoinGecko_price_dataframe(coin_id, frequency, start_date, end_date, api_key)
            coin_symbol = coin_input.upper()
        except ValueError as e:
            print(e)
            return(None)
        except requests.exceptions.HTTPError:
            print(f"Unable to fetch data for the provided input '{coin_input}'")
            return(None)
    CoinGecko_price_dataframe['time'] = pd.to_datetime(CoinGecko_price_dataframe['time'])
    return(coin_symbol, CoinGecko_price_dataframe)

# # CoinMarketCap API Call

def get_CoinMarketCap_coin_id_from_symbol(
    symbol: str,
    api_key: str 
    ) -> Union[str, None]:
    """
    ### Retrieves the CoinMarketCap ID corresponding to a cryptocurrency symbol.

    ## Parameters:
    | Parameter Name | Type    | Description                 |
    |:---------------|:--------|:----------------------------|
    | `symbol`       | `str`   | The cryptocurrency symbol.  |
    | `api_key`      | `str`   | The CoinMarketCap API key.  |

    ## Returns:
    | Return Name | Type               | Description                                                                                                     |
    |:------------|:-------------------|:----------------------------------------------------------------------------------------------------------------|
    | `id`        | `Union[str, None]` | The CoinMarketCap ID corresponding to the provided cryptocurrency symbol. If no match is found, returns `None`. |

    ## Raises:
    | Exception Name                    | Description                                                                    |
    |:----------------------------------|:-------------------------------------------------------------------------------|
    | `CoinNotFoundError`               | Raised when no match is found for the provided cryptocurrency symbol.          |
    | `CoinMarketCapAmbiguousCoinError` | Raised when multiple matches are found for the provided cryptocurrency symbol. |
    
    ## Dependencies:
    | Dependency name                  | Type                        | Description                                                                                  |
    |:---------------------------------|:----------------------------|:---------------------------------------------------------------------------------------------|
    | `COINMARKETCAP_API_BASE_URL`     | `str`                       | The base URL for the CoinMarketCap API.                                                      |
    | `COMMON_COINS_DISAMBIGUATION`    | `Dict[str, Dict[str, str]]` | A dictionary mapping common cryptocurrency symbols to their corresponding CoinMarketCap IDs. |
    
    ## Examples:
    >>> get_CoinMarketCap_coin_id_from_symbol('MPH', secret_CoinMarketCap_API_key)
    "More than one coin found with the symbol 'MPH': 7217, 7742."
    "Please re-run the query using the exact id name (e.g., '7217')."

    |   coin id | symbol   | website                  | twitter                        | explorer                                                              |
    |----------:|:---------|:-------------------------|:-------------------------------|:----------------------------------------------------------------------|
    |      7217 | MPH      | https://www.morpher.com/ | https://twitter.com/morpher_io | https://etherscan.io/token/0x6369c3dadfc00054a42ba8b2c09c48131dd4aa38 |
    |      7742 | MPH      | https://88mph.app/       | https://twitter.com/88mphapp   | https://etherscan.io/token/0x8888801af4d980682e47f1a9036e589479e835c5 |
    
    "Using default coin id '7742' for symbol 'MPH'"
    
    7742
    
    >>> get_CoinMarketCap_coin_id_from_symbol('DAI', secret_CoinMarketCap_API_key)
    "More than one coin found with the symbol 'DAI': 4943, 23859."
    "Please re-run the query using the exact id name (e.g., '4943')."

    |   coin id | symbol   | website                  | twitter                         | explorer                                                              |
    |----------:|:---------|:-------------------------|:--------------------------------|:----------------------------------------------------------------------|
    |      4943 | DAI      | http://www.makerdao.com/ |                                 | https://etherscan.io/token/0x6b175474e89094c44da98b954eedeac495271d0f |
    |     23859 | DAI      | https://dogezillaai.com  | https://twitter.com/dogezillaai | https://bscscan.com/token/0x43bee29430a2dda4bc053dd5669a56efd6e0556a  |
    
    "Using default coin id '4943' for symbol 'DAI'"
    
    4943

    ## Notes:
    - This function retrieves a list of all cryptocurrencies and their corresponding CoinMarketCap IDs from the CoinMarketCap API.
    - The function then checks whether the provided symbol matches any of the available cryptocurrencies.
    - If the symbol matches exactly one cryptocurrency, the corresponding CoinMarketCap ID is returned.
    - If the symbol matches multiple cryptocurrencies, a `CoinMarketCapAmbiguousCoinError` is raised.
    - If no match is found for the provided symbol, a `CoinNotFoundError` is raised.
    - If the symbol is a commonly traded cryptocurrency (e.g., BTC, ETH), the function uses the corresponding CoinMarketCap ID in `COMMON_COINS_DISAMBIGUATION`.
    """
    headers = {"X-CMC_PRO_API_KEY": api_key}
    try:
        response = requests.get(COINMARKETCAP_API_BASE_URL + "/cryptocurrency/map", headers = headers)
        coin_list = response.json()['data']
        matching_coins = []
        for coin in coin_list:
            if coin['symbol'].lower() == symbol.lower():
                matching_coins.append(coin['id'])
        if not matching_coins:
            raise CoinNotFoundError(symbol)
        if len(matching_coins) > 1:
            options = matching_coins
            raise CoinMarketCapAmbiguousCoinError(api_key, symbol, options)
        return(matching_coins[0])
    except CoinMarketCapAmbiguousCoinError as e:
        print(e)
        if symbol.upper() in COMMON_COINS_DISAMBIGUATION['CoinMarketCap']:
            print(f"Using default coin id '{COMMON_COINS_DISAMBIGUATION['CoinMarketCap'][symbol.upper()]}' for symbol '{symbol}'")
            return(COMMON_COINS_DISAMBIGUATION['CoinMarketCap'][symbol.upper()])
    except CoinNotFoundError as e:
        print(e)
    return(None)

def get_CoinMarketCap_symbol_from_coin_id(
    coin_id: Union[str, int],
    api_key: str
    ) -> Union[str, None]:
    """
    ### Retrieves the cryptocurrency symbol corresponding to a CoinMarketCap ID.

    ## Parameters:
    | Parameter Name | Type             | Description                 |
    |:---------------|:-----------------|:----------------------------|
    | `coin_id`      | `Union[str, int]`| The CoinMarketCap ID.       |
    | `api_key`      | `str`            | The CoinMarketCap API key.  |

    ## Returns:
    | Return Name | Type               | Description                                                                                                     |
    |:------------|:-------------------|:----------------------------------------------------------------------------------------------------------------|
    | `symbol`    | `Union[str, None]` | The cryptocurrency symbol corresponding to the provided CoinMarketCap ID. If no match is found, returns `None`. |

    ## Raises:
    | Exception Name   | Description                                                      |
    |:-----------------|:-----------------------------------------------------------------|
    | `ValueError`     | Raised when no match is found for the provided CoinMarketCap ID. |

    ## Dependencies:
    | Dependency name                  | Type  | Description                             |
    |:---------------------------------|:-----|:-----------------------------------------|
    | `COINMARKETCAP_API_BASE_URL`     | `str` | The base URL for the CoinMarketCap API. |
    
    ## Examples:
    >>> get_CoinMarketCap_symbol_from_id(7742, secret_CoinMarketCap_API_key)
    "MPH"
    
    >>> get_CoinMarketCap_symbol_from_id(4943, secret_CoinMarketCap_API_key)
    "DAI"

    ## Notes:
    - This function retrieves a list of all cryptocurrencies and their corresponding CoinMarketCap IDs from the CoinMarketCap API.
    - The function then checks whether the provided ID matches any of the available cryptocurrencies.
    - If the ID matches a cryptocurrency, the corresponding symbol is returned.
    - If no match is found for the provided ID, a `ValueError` is raised.
    """
    headers = {"X-CMC_PRO_API_KEY": api_key}
    try:
        response = requests.get(COINMARKETCAP_API_BASE_URL + "/cryptocurrency/map", headers = headers)
        coin_list = response.json()['data']
        coin_id_to_symbol = {str(coin['id']): coin['symbol'] for coin in coin_list}
        symbol = coin_id_to_symbol.get(str(coin_id))
        if symbol is None:
            raise ValueError(f"No symbol found for ID '{coin_id}'.")
        return(symbol)
    except Exception as e:
        print(f"Error fetching symbol for ID '{coin_id}': {e}")
    return(None)

def get_CoinMarketCap_historical_price_data(
    coin_input: Union[str, int], 
    start_date: str, 
    end_date: str, 
    api_key: str
    ) -> Tuple[str, pd.DataFrame]:
    """
    ### Retrieves historical price data for a given cryptocurrency from CoinMarketCap.

    ## Parameters:
    | Parameter Name                 | Type              | Description                                                         |
    |:-------------------------------|:------------------|:--------------------------------------------------------------------|
    | `coin_input`                   | `Union[str, int]` | The input representing the cryptocurrency (e.g., symbol or ID).     |
    | `start_date`                   | `str`             | The start date of the requested historical data (YYYY-MM-DD).       |
    | `start_date`                   | `str`             | The start date of the requested historical data (YYYY-MM-DD HH:MM). |
    | `end_date`                     | `str`             | The end date of the requested historical data (YYYY-MM-DD HH:MM).   |
    | `secret_CoinMarketCap_API_key` | `str`             | The CoinMarketCap API key.                                          |

    ## Returns:
    | Return Name                     | Type                       | Description                                                                                                                         |
    |:--------------------------------|:---------------------------|:------------------------------------------------------------------------------------------------------------------------------------|
    | `coin_symbol`                   | `str`                      | A string containing the appropriate cryptocurrency ticker symbol for the associated CoinMarketCap coin ID (e.g. 'MPH' for ID 7742). |
    | `CoinMarketCap_price_data`      | `pd.DataFrame`             | A pandas `DataFrame` with historical price data (columns 'time' and 'price').                                                       |
    |                                 | `Tuple[str, pd.DataFrame]` | A `tuple` of `coin_symbol` and `CoinMarketCap_price_data`, in that order. If no data is found, returns `None`.                      |

    ## Raises:
    | Exception Name                  | Description                                                             |
    |:--------------------------------|:------------------------------------------------------------------------|
    | `requests.exceptions.HTTPError` | Raised when there is an issue fetching data from the CoinMarketCap API. |

    ## Dependencies:
    | Dependency Name                         | Type       | Description                                                              |
    |:----------------------------------------|:-----------|:-------------------------------------------------------------------------|
    | `COINMARKETCAP_API_BASE_URL`            | `str`      | The base URL for the CoinMarketCap API.                                  |
    | `get_CoinMarketCap_coin_id_from_symbol` | `function` | Retrieves the CoinMarketCap ID corresponding to a cryptocurrency symbol. |
    | `get_CoinMarketCap_symbol_from_coin_id` | `function` | Retrieves the cryptocurrency symbol corresponding to a CoinMarketCap ID. |
    
    ## Examples:
    >>> get_CoinMarketCap_historical_price_data('MPH', '2022-01-01 00:00', '2023-01-01 00:00', secret_CoinMarketCap_API_key) 
    "More than one coin found with the symbol 'MPH': 7217, 7742."
    "Please re-run the query using the exact id name (e.g., '7217')."

    |   coin id | symbol   | website                  | twitter                        | explorer                                                              |
    |----------:|:---------|:-------------------------|:-------------------------------|:----------------------------------------------------------------------|
    |      7217 | MPH      | https://www.morpher.com/ | https://twitter.com/morpher_io | https://etherscan.io/token/0x6369c3dadfc00054a42ba8b2c09c48131dd4aa38 |
    |      7742 | MPH      | https://88mph.app/       | https://twitter.com/88mphapp   | https://etherscan.io/token/0x8888801af4d980682e47f1a9036e589479e835c5 |
    
    "Using default coin id '7742' for symbol 'MPH'"
    
    "MPH"
    
    |      | time                       |     price |
    |-----:|:---------------------------|----------:|
    |    0 | 2022-01-02 00:00:00.000000 | 27.118925 |
    |    1 | 2022-01-02 13:28:00.000000 | 29.754249 |
    |    2 | 2022-01-02 23:59:59.999000 | 28.249939 |
    |    3 | 2022-01-03 00:00:00.000000 | 28.249939 |
    |    4 | 2022-01-03 23:54:00.000000 | 33.795769 |
    |    5 | 2022-01-03 16:40:00.000000 | 27.640823 |
    |    6 | 2022-01-03 23:59:59.999000 | 33.733954 |
    |    7 | 2022-01-04 00:00:00.000000 | 33.733810 |
    |    8 | 2022-01-04 00:06:00.000000 | 36.016047 |
    |    9 | 2022-01-04 10:24:00.000000 | 32.191144 |
    |   10 | 2022-01-04 23:59:59.999000 | 34.178715 |
    |   11 | 2022-01-05 00:00:00.000000 | 34.179048 |
    |   12 | 2022-01-05 03:58:00.000000 | 34.759000 |
    |   13 | 2022-01-05 23:13:00.000000 | 28.424517 |
    |   14 | 2022-01-05 23:59:59.999000 | 28.584419 |
    |   15 | 2022-01-06 00:00:00.000000 | 28.678500 |
    |   16 | 2022-01-06 20:00:00.000000 | 36.138259 |
    |   17 | 2022-01-06 00:49:00.000000 | 26.701192 |
    |   18 | 2022-01-06 23:59:59.999000 | 34.385431 |
    |   19 | 2022-01-07 00:00:00.000000 | 34.385536 |
    |   20 | 2022-01-07 01:00:00.000000 | 35.457794 |
    |   21 | 2022-01-07 11:45:00.000000 | 31.245705 |
    |   22 | 2022-01-07 23:59:59.999000 | 32.821329 |
    ...
    | 1439 | 2023-01-01 00:00:00.000000 |  1.242638 |
    | 1440 | 2023-01-01 06:13:00.000000 |  1.250356 |
    | 1441 | 2023-01-01 00:48:00.000000 |  1.173472 |
    | 1442 | 2023-01-01 23:59:59.999000 |  1.207643 |
    
    >>> get_CoinMarketCap_historical_price_data(7742, '2022-01-01 00:00', '2023-01-01 00:00', secret_CoinMarketCap_API_key) 
    
    "MPH"
    
    |      | time                       |     price |
    |-----:|:---------------------------|----------:|
    |    0 | 2022-01-02 00:00:00.000000 | 27.118925 |
    |    1 | 2022-01-02 13:28:00.000000 | 29.754249 |
    |    2 | 2022-01-02 23:59:59.999000 | 28.249939 |
    |    3 | 2022-01-03 00:00:00.000000 | 28.249939 |
    |    4 | 2022-01-03 23:54:00.000000 | 33.795769 |
    |    5 | 2022-01-03 16:40:00.000000 | 27.640823 |
    |    6 | 2022-01-03 23:59:59.999000 | 33.733954 |
    |    7 | 2022-01-04 00:00:00.000000 | 33.733810 |
    |    8 | 2022-01-04 00:06:00.000000 | 36.016047 |
    |    9 | 2022-01-04 10:24:00.000000 | 32.191144 |
    |   10 | 2022-01-04 23:59:59.999000 | 34.178715 |
    |   11 | 2022-01-05 00:00:00.000000 | 34.179048 |
    |   12 | 2022-01-05 03:58:00.000000 | 34.759000 |
    |   13 | 2022-01-05 23:13:00.000000 | 28.424517 |
    |   14 | 2022-01-05 23:59:59.999000 | 28.584419 |
    |   15 | 2022-01-06 00:00:00.000000 | 28.678500 |
    |   16 | 2022-01-06 20:00:00.000000 | 36.138259 |
    |   17 | 2022-01-06 00:49:00.000000 | 26.701192 |
    |   18 | 2022-01-06 23:59:59.999000 | 34.385431 |
    |   19 | 2022-01-07 00:00:00.000000 | 34.385536 |
    |   20 | 2022-01-07 01:00:00.000000 | 35.457794 |
    |   21 | 2022-01-07 11:45:00.000000 | 31.245705 |
    |   22 | 2022-01-07 23:59:59.999000 | 32.821329 |
    ...
    | 1439 | 2023-01-01 00:00:00.000000 |  1.242638 |
    | 1440 | 2023-01-01 06:13:00.000000 |  1.250356 |
    | 1441 | 2023-01-01 00:48:00.000000 |  1.173472 |
    | 1442 | 2023-01-01 23:59:59.999000 |  1.207643 |
    
    ## Notes:
    - This function fetches historical price data for the provided cryptocurrency input between the specified start and end dates.
    - The function first retrieves the CoinMarketCap ID of the cryptocurrency using `get_CoinMarketCap_coin_id_from_symbol`.
    - It then sends a request to the CoinMarketCap API to fetch the historical price data for the cryptocurrency with the obtained ID.
    - The historical price data is returned as a DataFrame with columns 'time' and 'price'.
    - Duplicates based on the 'time' column are removed, and the index is reset.
    """
    global COINMARKETCAP_API_BASE_URL
    
    if isinstance(coin_input, int) or coin_input.isdigit():
        coin_id = str(coin_input)
        coin_symbol = get_CoinMarketCap_symbol_from_coin_id(coin_id, api_key)
    else:
        coin_id = get_CoinMarketCap_coin_id_from_symbol(coin_input, api_key)
        coin_symbol = coin_input
        
    if not coin_id:
        print(f"Unable to fetch CoinMarketCap ID for the provided input '{coin_input}'")
        return(None)

    headers = {
        "Accepts": "application/json",
        "X-CMC_PRO_API_KEY": api_key,
    }

    try:
        response = requests.get(
            COINMARKETCAP_API_BASE_URL + f"/cryptocurrency/ohlcv/historical",
            headers = headers,
            params = {
                "id": coin_id,
                "time_start": start_date,
                "time_end": end_date,
                "convert": "USD",
            },
        )
        response.raise_for_status()
    except requests.exceptions.HTTPError:
        print(f"Unable to fetch data for the provided input '{coin_input}'")
        return(None)

    data = response.json()
    if 'quotes' not in data['data'] or len(data['data']['quotes']) == 0:
        print(f"No historical price data found for '{coin_input}'")
        return(None)

    price_data = [[pd.to_datetime(quote[time_key], utc=True).strftime("%Y-%m-%d %H:%M:%S.%f"),
                   quote['quote']['USD'][price_key]]
                   for quote in data['data']['quotes']
                   for time_key, price_key in (('time_open', 'open'),
                                               ('time_high', 'high'),
                                               ('time_low', 'low'),
                                               ('time_close', 'close'))]

    CoinMarketCap_price_dataframe = pd.DataFrame(price_data, columns = ['time', 'price'])
    CoinMarketCap_price_dataframe = CoinMarketCap_price_dataframe.drop_duplicates(subset = 'time').reset_index(drop = True)
    CoinMarketCap_price_dataframe['time'] = pd.to_datetime(CoinMarketCap_price_dataframe['time'])
    return(coin_symbol, CoinMarketCap_price_dataframe)

# # CSV handling

def open_csv_datafile(
    csv_filename: str
    ) -> pd.DataFrame:
    """
    ### Retrieves price data from a csv file and returns it in a DataFrame.

    ## Parameters:
    | Parameter Name   | Type  | Description                              |
    |:-----------------|:------|:-----------------------------------------|
    | `csv_filename`   | `str` | The name of the `csv` file to be opened. |

    ## Returns:
    | Return Name     | Type           | Description                                          |
    |:----------------|:---------------|:-----------------------------------------------------|
    | `csv_dataframe` | `pd.DataFrame` | The price data from the `csv` file as a `DataFrame`. |

    ## Raises:
    | Exception               | Description                                                 |
    |:------------------------|:------------------------------------------------------------|
    | `FileNotFoundError`     | If the `csv` file specified by `csv_filename` is not found. |
    
    ## Examples:
    
    #### CoinGecko CSV
    
    >>> open_csv_datafile('eth-usd-max.csv')
    
    |      | snapped_at              |       price |    market_cap |     total_volume |
    |-----:|:------------------------|------------:|--------------:|-----------------:|
    |    0 | 2015-08-07 00:00:00 UTC |    2.83162  |   0           |  90622           |
    |    1 | 2015-08-08 00:00:00 UTC |    1.33075  |   8.03395e+07 | 368070           |
    |    2 | 2015-08-10 00:00:00 UTC |    0.687586 |   4.15563e+07 | 400464           |
    |    3 | 2015-08-11 00:00:00 UTC |    1.06738  |   6.4539e+07  |      1.519e+06   |
    |    4 | 2015-08-12 00:00:00 UTC |    1.25661  |   7.60133e+07 |      2.07389e+06 |
    |    5 | 2015-08-13 00:00:00 UTC |    1.8254   |   1.10469e+08 |      4.38014e+06 |
    |    6 | 2015-08-14 00:00:00 UTC |    1.82597  |   1.10555e+08 |      4.35562e+06 |
    |    7 | 2015-08-15 00:00:00 UTC |    1.67095  |   1.01215e+08 |      2.51963e+06 |
    |    8 | 2015-08-16 00:00:00 UTC |    1.47661  |   8.94809e+07 |      3.03266e+06 |
    |    9 | 2015-08-17 00:00:00 UTC |    1.20387  |   8.73134e+07 |      1.88009e+06 |
    |   10 | 2015-08-18 00:00:00 UTC |    1.28139  |   9.29579e+07 |      1.69601e+06 |
    |   11 | 2015-08-19 00:00:00 UTC |    1.25274  |   9.09207e+07 |      1.5372e+06  |
    |   12 | 2015-08-20 00:00:00 UTC |    1.4842   |   1.07749e+08 |      2.96773e+06 |
    |   13 | 2015-08-21 00:00:00 UTC |    1.40631  |   1.02131e+08 |      1.74288e+06 |
    |   14 | 2015-08-22 00:00:00 UTC |    1.38072  |   1.00309e+08 | 914589           |
    |   15 | 2015-08-23 00:00:00 UTC |    1.35518  |   9.8488e+07  |      1.6107e+06  |
    |   16 | 2015-08-24 00:00:00 UTC |    1.24657  |   9.06259e+07 | 696477           |
    |   17 | 2015-08-25 00:00:00 UTC |    1.16083  |   8.44231e+07 |      1.05317e+06 |
    |   18 | 2015-08-26 00:00:00 UTC |    1.11964  |   8.14549e+07 |      1.1517e+06  |
    |   19 | 2015-08-27 00:00:00 UTC |    1.13369  |   8.2504e+07  | 681460           |
    |   20 | 2015-08-28 00:00:00 UTC |    1.1889   |   8.65495e+07 | 715179           |
    |   21 | 2015-08-29 00:00:00 UTC |    1.17434  |   8.55156e+07 | 607201           |
    |   22 | 2015-08-30 00:00:00 UTC |    1.32235  |   9.6321e+07  |      1.04559e+06 |
    ...
    | 2839 | 2023-05-17 00:00:00 UTC | 1823.66     |   2.19562e+11 |      6.28343e+09 |
    | 2840 | 2023-05-18 00:00:00 UTC | 1821.05     |   2.19124e+11 |      6.64795e+09 |
    | 2841 | 2023-05-19 00:00:00 UTC | 1802.39     |   2.17079e+11 |      6.17021e+09 |
    | 2842 | 2023-05-20 00:00:00 UTC | 1812.13     |   2.18084e+11 |      5.09267e+09 |
    
    
    #### Generic example
    
    >>> open_csv_datafile('BTC-ETH-example-OHLC.csv')
    
    |     |   Unnamed: 0 | time                          |    open |    high |     low |   close |
    |----:|-------------:|:------------------------------|--------:|--------:|--------:|--------:|
    |   0 |            0 | 2022-01-02 17:59:15.646815232 | 12.6498 | 12.819  | 12.4816 | 12.4816 |
    |   1 |            1 | 2022-01-03 11:58:31.293630464 | 12.4816 | 12.4816 | 12.225  | 12.3956 |
    |   2 |            2 | 2022-01-04 05:57:46.940445696 | 12.3956 | 12.5625 | 12.1666 | 12.5625 |
    |   3 |            3 | 2022-01-04 23:57:02.587260672 | 12.5625 | 12.5625 | 11.972  | 11.972  |
    |   4 |            4 | 2022-01-05 17:56:18.234075904 | 11.972  | 12.2146 | 11.972  | 12.2146 |
    |   5 |            5 | 2022-01-06 11:55:33.880891136 | 12.2146 | 12.8631 | 11.7275 | 12.8631 |
    |   6 |            6 | 2022-01-07 05:54:49.527706368 | 12.8631 | 12.8631 | 12.3128 | 12.3128 |
    |   7 |            7 | 2022-01-07 23:54:05.174521600 | 12.3128 | 13.1769 | 12.3128 | 13.1769 |
    |   8 |            8 | 2022-01-08 17:53:20.821336832 | 13.1769 | 13.1769 | 12.6892 | 12.6892 |
    |   9 |            9 | 2022-01-09 11:52:36.468152064 | 12.6892 | 13.8164 | 12.6892 | 13.5038 |
    |  10 |           10 | 2022-01-10 05:51:52.114967040 | 13.5038 | 13.7797 | 13.1869 | 13.7797 |
    |  11 |           11 | 2022-01-10 23:51:07.761782272 | 13.7797 | 13.7797 | 13.501  | 13.501  |
    |  12 |           12 | 2022-01-11 17:50:23.408597504 | 13.501  | 13.5942 | 12.9959 | 12.9959 |
    |  13 |           13 | 2022-01-12 11:49:39.055412736 | 12.9959 | 13.4709 | 12.9959 | 13.4709 |
    |  14 |           14 | 2022-01-13 05:48:54.702227968 | 13.4709 | 13.4709 | 12.9763 | 13.0324 |
    |  15 |           15 | 2022-01-13 23:48:10.349043200 | 13.0324 | 13.069  | 13.0324 | 13.069  |
    |  16 |           16 | 2022-01-14 17:47:25.995858432 | 13.069  | 13.1128 | 13.069  | 13.1039 |
    |  17 |           17 | 2022-01-15 11:46:41.642673408 | 13.1039 | 13.1039 | 13.014  | 13.0141 |
    |  18 |           18 | 2022-01-16 05:45:57.289488640 | 13.0141 | 13.0618 | 12.8389 | 12.9631 |
    |  19 |           19 | 2022-01-16 23:45:12.936303872 | 12.9631 | 12.9698 | 12.8648 | 12.8648 |
    |  20 |           20 | 2022-01-17 17:44:28.583119104 | 12.8648 | 12.8674 | 12.8648 | 12.867  |
    |  21 |           21 | 2022-01-18 11:43:44.229934336 | 12.867  | 13.2919 | 12.799  | 12.9237 |
    |  22 |           22 | 2022-01-19 05:42:59.876749568 | 12.9237 | 13.5889 | 12.9237 | 13.184  |
    ...
    | 483 |          483 | 2022-12-30 18:02:13.058554368 | 13.8497 | 13.8497 | 13.8181 | 13.8181 |
    | 484 |          484 | 2022-12-31 12:01:28.705369600 | 13.8181 | 13.9142 | 13.8181 | 13.9142 |
    | 485 |          485 | 2023-01-01 06:00:44.352184832 | 13.9142 | 13.9142 | 13.7539 | 13.861  |
    | 486 |          486 | 2023-01-01 23:59:59.999000064 | 13.861  | 13.861  | 13.7733 | 13.8431 |
    """
    try:
        csv_dataframe = pd.read_csv(csv_filename)
        return(csv_dataframe)
    except FileNotFoundError:
        print(f"File '{csv_filename}' not found.")
    except Exception as e:
        print(f"An error occurred while opening the file: {e}")

def identify_csv_column_names(
    csv_dataframe: pd.DataFrame
    ) -> dict:
    """
    ### Identifies and returns the column names for 'time' and 'price' in a DataFrame.

    ## Parameters:
    | Parameter Name | Type          | Description                                         |
    |:---------------|:--------------|:----------------------------------------------------|
    | `csv_dataframe` | `pd.DataFrame` | The DataFrame for which to identify column names. |

    ## Returns:
    | Return Name | Type   | Description                                                                                                                                |
    |:------------|:-------|:-------------------------------------------------------------------------------------------------------------------------------------------|
    | `columns`   | `dict` | A dictionary with keys for 'time', 'price', 'open', 'high', 'low', 'close', and corresponding column names from the `DataFrame` as values. |
    
    ## Examples:
    
    #### CoinGecko CSV
    >>> csv_dataframe = open_csv_datafile('btc-usd-max.csv')
    >>> identify_csv_column_names(csv_dataframe)
    {'time': 'snapped_at', 'price': 'price'} 
    
    #### Generic example
    >>> csv_dataframe = open_csv_datafile('BTC-ETH-example-OHLC.csv')
    >>> identify_csv_column_names(csv_dataframe)
    {'time': 'time', 'price': None, 'open': 'open', 'high': 'high', 'low': 'low', 'close': 'close'}

    ## Notes:
    - This function uses a regular expression to match date-like strings in the `DataFrame` to identify the 'time' column.
        - If no appropriate column is found, the value for the key will be `None`. 
    - It identifies the 'price' column by checking for the presence of 'price', 'value', or 'rate' in the column name (case insensitive).
    - 'open', 'high', 'low', 'close' columns are also identified by matching their names (case insensitive).
    """
    columns = {"time": None, "price": None}
    date_pattern = re.compile(r"(\b(19|20)\d{2}[- /](0[1-9]|1[0-2])[- /](0[1-9]|[12][0-9]|3[01])\b)|(\b(0[1-9]|1[0-2])[- /](0[1-9]|[12][0-9]|3[01])[- /](19|20)\d{2}\b)|(\b(0[1-9]|[12][0-9]|3[01])[- /](0[1-9]|1[0-2])[- /](19|20)\d{2}\b)")
    for col in csv_dataframe.columns:
        if csv_dataframe[col].astype(str).str.match(date_pattern).any():
            columns["time"] = col
        elif "price" in col.lower() or "value" in col.lower() or "rate" in col.lower():
            columns["price"] = col
        elif col.lower() in ["open", "high", "low", "close"]:
            columns[col.lower()] = col
    return(columns)

def convert_csv_ohlc_to_timestamps(
    csv_dataframe: pd.DataFrame, 
    columns: dict
    ) -> pd.DataFrame:
    """
    ### Converts the OHLC (Open, High, Low, Close) data in a DataFrame into timestamps.

    ## Parameters:
    | Parameter Name   | Type           | Description                                              |
    |:-----------------|:---------------|:---------------------------------------------------------|
    | `csv_dataframe`  | `pd.DataFrame` | The DataFrame with OHLC data.                            |
    | `columns`        | `dict`         | A dictionary mapping column types to their column names. |

    ## Returns:
    | Return Name               | Type           | Description                                                                                         |
    |:--------------------------|:---------------|:----------------------------------------------------------------------------------------------------|
    | `converted_csv_dataframe` | `pd.DataFrame` | A `DataFrame` with time-series data, with timestamps as 'time' and corresponding prices as 'price'. |
    
    ## Example:
    
    >>> csv_dataframe = open_csv_datafile('BTC-ETH-example-OHLC.csv')
    >>> columns = identify_csv_column_names(csv_dataframe)
    >>> convert_csv_ohlc_to_timestamps(csv_dataframe, columns)
    
    |      | time                          |   price |
    |-----:|:------------------------------|--------:|
    |    0 | 2022-01-02 04:29:48.911703808 | 12.6498 |
    |    1 | 2022-01-02 08:59:37.823407616 | 12.819  |
    |    2 | 2022-01-02 13:29:26.735111424 | 12.4816 |
    |    3 | 2022-01-02 17:59:15.646815232 | 12.4816 |
    |    4 | 2022-01-02 22:29:04.558519040 | 12.4816 |
    |    5 | 2022-01-03 02:58:53.470222848 | 12.4816 |
    |    6 | 2022-01-03 07:28:42.381926656 | 12.225  |
    |    7 | 2022-01-03 11:58:31.293630464 | 12.3956 |
    |    8 | 2022-01-03 16:28:20.205334272 | 12.3956 |
    |    9 | 2022-01-03 20:58:09.117038080 | 12.5625 |
    |   10 | 2022-01-04 01:27:58.028741888 | 12.1666 |
    |   11 | 2022-01-04 05:57:46.940445696 | 12.5625 |
    |   12 | 2022-01-04 10:27:35.852149248 | 12.5625 |
    |   13 | 2022-01-04 14:57:24.763853056 | 12.5625 |
    |   14 | 2022-01-04 19:27:13.675556864 | 11.972  |
    |   15 | 2022-01-04 23:57:02.587260672 | 11.972  |
    |   16 | 2022-01-05 04:26:51.498964480 | 11.972  |
    |   17 | 2022-01-05 08:56:40.410668288 | 12.2146 |
    |   18 | 2022-01-05 13:26:29.322372096 | 11.972  |
    |   19 | 2022-01-05 17:56:18.234075904 | 12.2146 |
    |   20 | 2022-01-05 22:26:07.145779712 | 12.2146 |
    |   21 | 2022-01-06 02:55:56.057483520 | 12.8631 |
    |   22 | 2022-01-06 07:25:44.969187328 | 11.7275 |
    ...
    | 1944 | 2023-01-01 10:30:33.263888640 | 13.861  |
    | 1945 | 2023-01-01 15:00:22.175592448 | 13.861  |
    | 1946 | 2023-01-01 19:30:11.087296256 | 13.7733 |
    | 1947 | 2023-01-01 23:59:59.999000064 | 13.8431 |
    
    ## Notes:
    - The function calculates the time interval between OHLC data points and evenly distributes them in time.
    - This function is used to convert OHLC data into a format suitable for time-series analysis.
    - The input `DataFrame` must contain 'time', 'open', 'high', 'low', and 'close' columns.
    - The `columns` dictionary must contain keys for 'time', 'open', 'high', 'low', and 'close'.
    """
    data_reshaped = []
    csv_dataframe[columns['time']] = pd.to_datetime(csv_dataframe[columns['time']])
    time_delta = (csv_dataframe[columns['time']].iloc[1] - csv_dataframe[columns['time']].iloc[0])/4
    for index, row in csv_dataframe.iterrows():
        current_time = row[columns['time']]
        data_reshaped.append((current_time - 3 * time_delta, row[columns['open']]))
        data_reshaped.append((current_time - 2 * time_delta, row[columns['high']]))
        data_reshaped.append((current_time - time_delta, row[columns['low']]))
        data_reshaped.append((current_time, row[columns['close']]))
    converted_csv_dataframe = pd.DataFrame(data_reshaped, columns = ['time', 'price'])
    return(converted_csv_dataframe)

def get_csv_price_data(
    csv_filename: str
    ) -> pd.DataFrame:
    """
    ### Reads price data from a CSV file, identifies relevant columns, and converts the data into a standardized format.

    ## Parameters:
    | Parameter Name | Type  | Description                                         |
    |:---------------|:------|:----------------------------------------------------|
    | `csv_filename` | `str` | The name of the CSV file containing the price data. |

    ## Returns:
    | Return Name               | Type           | Description                                                                      |
    |:--------------------------|:---------------|:---------------------------------------------------------------------------------|
    | `converted_csv_dataframe` | `pd.DataFrame` | A DataFrame containing the converted price data with 'time' and 'price' columns. |

    ## Dependencies:
    | Dependency Name               | Type       | Description                                                                        |
    |:------------------------------|:-----------|:-----------------------------------------------------------------------------------|
    | `open_csv_datafile`           | `function` | Opens a CSV data file and returns a DataFrame.                                     |
    | `identify_csv_column_names`   | `function` | Identifies and returns the column names for 'time' and 'price' in a DataFrame.     |
    | `convert_csv_ohlc_to_timestamps` | `function` | Converts the OHLC (Open, High, Low, Close) data in a DataFrame into timestamps. |
    
    #### CoinGecko CSV
    
    >>> get_csv_price_data('eth-usd-max.csv')
    
    |      | time                |       price |
    |-----:|:--------------------|------------:|
    |    0 | 2015-08-07 00:00:00 |    2.83162  |
    |    1 | 2015-08-08 00:00:00 |    1.33075  |
    |    2 | 2015-08-10 00:00:00 |    0.687586 |
    |    3 | 2015-08-11 00:00:00 |    1.06738  |
    |    4 | 2015-08-12 00:00:00 |    1.25661  |
    |    5 | 2015-08-13 00:00:00 |    1.8254   |
    |    6 | 2015-08-14 00:00:00 |    1.82597  |
    |    7 | 2015-08-15 00:00:00 |    1.67095  |
    |    8 | 2015-08-16 00:00:00 |    1.47661  |
    |    9 | 2015-08-17 00:00:00 |    1.20387  |
    |   10 | 2015-08-18 00:00:00 |    1.28139  |
    |   11 | 2015-08-19 00:00:00 |    1.25274  |
    |   12 | 2015-08-20 00:00:00 |    1.4842   |
    |   13 | 2015-08-21 00:00:00 |    1.40631  |
    |   14 | 2015-08-22 00:00:00 |    1.38072  |
    |   15 | 2015-08-23 00:00:00 |    1.35518  |
    |   16 | 2015-08-24 00:00:00 |    1.24657  |
    |   17 | 2015-08-25 00:00:00 |    1.16083  |
    |   18 | 2015-08-26 00:00:00 |    1.11964  |
    |   19 | 2015-08-27 00:00:00 |    1.13369  |
    |   20 | 2015-08-28 00:00:00 |    1.1889   |
    |   21 | 2015-08-29 00:00:00 |    1.17434  |
    |   22 | 2015-08-30 00:00:00 |    1.32235  |
    ...
    | 2839 | 2023-05-17 00:00:00 | 1823.66     |
    | 2840 | 2023-05-18 00:00:00 | 1821.05     |
    | 2841 | 2023-05-19 00:00:00 | 1802.39     |
    | 2842 | 2023-05-20 00:00:00 | 1812.13     |
    
    #### Generic example
    
    >>> get_csv_price_data('BTC-ETH-example-OHLC.csv')
    
    |      | time                          |   price |
    |-----:|:------------------------------|--------:|
    |    0 | 2022-01-02 04:29:48.911703808 | 12.6498 |
    |    1 | 2022-01-02 08:59:37.823407616 | 12.819  |
    |    2 | 2022-01-02 13:29:26.735111424 | 12.4816 |
    |    3 | 2022-01-02 17:59:15.646815232 | 12.4816 |
    |    4 | 2022-01-02 22:29:04.558519040 | 12.4816 |
    |    5 | 2022-01-03 02:58:53.470222848 | 12.4816 |
    |    6 | 2022-01-03 07:28:42.381926656 | 12.225  |
    |    7 | 2022-01-03 11:58:31.293630464 | 12.3956 |
    |    8 | 2022-01-03 16:28:20.205334272 | 12.3956 |
    |    9 | 2022-01-03 20:58:09.117038080 | 12.5625 |
    |   10 | 2022-01-04 01:27:58.028741888 | 12.1666 |
    |   11 | 2022-01-04 05:57:46.940445696 | 12.5625 |
    |   12 | 2022-01-04 10:27:35.852149248 | 12.5625 |
    |   13 | 2022-01-04 14:57:24.763853056 | 12.5625 |
    |   14 | 2022-01-04 19:27:13.675556864 | 11.972  |
    |   15 | 2022-01-04 23:57:02.587260672 | 11.972  |
    |   16 | 2022-01-05 04:26:51.498964480 | 11.972  |
    |   17 | 2022-01-05 08:56:40.410668288 | 12.2146 |
    |   18 | 2022-01-05 13:26:29.322372096 | 11.972  |
    |   19 | 2022-01-05 17:56:18.234075904 | 12.2146 |
    |   20 | 2022-01-05 22:26:07.145779712 | 12.2146 |
    |   21 | 2022-01-06 02:55:56.057483520 | 12.8631 |
    |   22 | 2022-01-06 07:25:44.969187328 | 11.7275 |
    ...
    | 1944 | 2023-01-01 10:30:33.263888640 | 13.861  |
    | 1945 | 2023-01-01 15:00:22.175592448 | 13.861  |
    | 1946 | 2023-01-01 19:30:11.087296256 | 13.7733 |
    | 1947 | 2023-01-01 23:59:59.999000064 | 13.8431 |

    ## Notes:
    - This function reads price data from a CSV file and converts it into a DataFrame.
    - It identifies the 'time' and 'price' columns in the DataFrame, and if 'open', 'high', 'low', and 'close' columns exist, converts these into timestamps.
    - The 'time' column is converted to a datetime format.
    """
    csv_dataframe = open_csv_datafile(csv_filename)
    columns = identify_csv_column_names(csv_dataframe)
    if set(["open", "high", "low", "close"]).issubset(set(columns.keys())):
        converted_csv_dataframe = convert_csv_ohlc_to_timestamps(csv_dataframe, columns)
    else:
        converted_csv_dataframe = csv_dataframe[[columns["time"], columns["price"]]].rename(columns = {columns["time"]: "time", columns["price"]: "price"})
    converted_csv_dataframe['time'] = pd.to_datetime(converted_csv_dataframe['time']).dt.tz_localize(None)
    return(converted_csv_dataframe)

# # CoinGecko and CoinMarketCap API Data Processing

def merge_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_timestamps(
    CASH_USD_dataframe: pd.DataFrame, 
    RISK_USD_dataframe: pd.DataFrame
    ) -> pd.Series:
    """
    ### Merges the timestamps from two CoinGecko dataframes into a single dataframe.

    ## Parameters:
    | Parameter Name        | Type          | Description                                                                  |
    |:----------------------|:--------------|:-----------------------------------------------------------------------------|
    | `CASH_USD_dataframe`  | `pd.DataFrame`| A pandas `DataFrame` with CoinGecko historical price data for `CASH` in USD. |
    | `RISK_USD_dataframe`  | `pd.DataFrame`| A pandas `DataFrame` with CoinGecko historical price data for `RISK` in USD. |

    ## Returns:
    | Return Name                  | Type        | Description                                                                          |
    |:-----------------------------|:------------|:-------------------------------------------------------------------------------------|
    | `merged_timestamps_dataframe`| `pd.Series` | A pandas `Series` object containing the merged timestamps from the input dataframes. |
    
    ## Examples:
    
    #### CoinGecko Hourly Charts
    
    >>> CASH_input = 'ETH'
    >>> RISK_input = 'MPH'
    >>> frequency = 'hour'
    >>> start_date = '2023-02-01 00:00'
    >>> end_date = '2023-05-01 00:00'
    >>> api_key = secret_CoinGecko_api_key
    >>> CASH_symbol, CASH_USD_dataframe = get_CoinGecko_historical_price_data(CASH_input, frequency, start_date, end_date, secret_CoinGecko_api_key)
    >>> RISK_symbol, RISK_USD_dataframe = get_CoinGecko_historical_price_data(RISK_input, frequency, start_date, end_date, secret_CoinGecko_api_key)
    >>> merge_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_timestamps(CASH_USD_dataframe, RISK_USD_dataframe)
    
    More than one coin found with the symbol 'ETH': ethereum, ethereum-wormhole. Please re-run the query using the exact id name (e.g., 'ethereum').
    Using default coin id 'ethereum' for symbol 'ETH'   

    More than one coin found with the symbol 'MPH': 88mph, morpher. Please re-run the query using the exact id name (e.g., '88mph').
    Using default coin id '88mph' for symbol 'MPH'  

    |      | time                |
    |-----:|:--------------------|
    |    0 | 2023-02-01 00:00:02 |
    |    1 | 2023-02-01 00:01:10 |
    |    2 | 2023-02-01 01:00:03 |
    |    3 | 2023-02-01 01:01:06 |
    |    4 | 2023-02-01 02:00:12 |
    |    5 | 2023-02-01 02:01:53 |
    |    6 | 2023-02-01 03:00:11 |
    |    7 | 2023-02-01 03:01:07 |
    |    8 | 2023-02-01 04:00:04 |
    |    9 | 2023-02-01 04:03:03 |
    |   10 | 2023-02-01 05:00:08 |
    |   11 | 2023-02-01 05:02:59 |
    |   12 | 2023-02-01 06:00:07 |
    |   13 | 2023-02-01 06:00:10 |
    |   14 | 2023-02-01 07:00:04 |
    |   15 | 2023-02-01 07:00:13 |
    |   16 | 2023-02-01 08:00:10 |
    |   17 | 2023-02-01 08:01:55 |
    |   18 | 2023-02-01 09:00:09 |
    ...
    | 4275 | 2023-04-30 22:00:54 |
    | 4276 | 2023-04-30 22:01:56 |
    | 4277 | 2023-04-30 23:00:47 |
    | 4278 | 2023-04-30 23:01:45 |
    
    #### CoinGecko Daily Charts

    >>> CASH_input = 'ETH'
    >>> RISK_input = 'MPH'
    >>> frequency = 'daily'
    >>> start_date = '2023-02-01 00:00'
    >>> end_date = '2023-05-01 00:00'
    >>> api_key = secret_CoinGecko_api_key
    >>> CASH_symbol, CASH_USD_dataframe = get_CoinGecko_historical_price_data(CASH_input, frequency, start_date, end_date, secret_CoinGecko_api_key)
    >>> RISK_symbol, RISK_USD_dataframe = get_CoinGecko_historical_price_data(RISK_input, frequency, start_date, end_date, secret_CoinGecko_api_key)
    >>> merge_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_timestamps(CASH_USD_dataframe, RISK_USD_dataframe)
    
    More than one coin found with the symbol 'ETH': ethereum, ethereum-wormhole. Please re-run the query using the exact id name (e.g., 'ethereum').
    Using default coin id 'ethereum' for symbol 'ETH'
    
    More than one coin found with the symbol 'MPH': 88mph, morpher. Please re-run the query using the exact id name (e.g., '88mph').
    Using default coin id '88mph' for symbol 'MPH'
    
    |    | time                |
    |---:|:--------------------|
    |  0 | 2023-02-01 00:00:00 |
    |  1 | 2023-02-02 00:00:00 |
    |  2 | 2023-02-03 00:00:00 |
    |  3 | 2023-02-04 00:00:00 |
    |  4 | 2023-02-05 00:00:00 |
    |  5 | 2023-02-06 00:00:00 |
    |  6 | 2023-02-07 00:00:00 |
    |  7 | 2023-02-08 00:00:00 |
    |  8 | 2023-02-09 00:00:00 |
    |  9 | 2023-02-10 00:00:00 |
    | 10 | 2023-02-11 00:00:00 |
    | 11 | 2023-02-12 00:00:00 |
    | 12 | 2023-02-13 00:00:00 |
    | 13 | 2023-02-14 00:00:00 |
    | 14 | 2023-02-15 00:00:00 |
    | 15 | 2023-02-16 00:00:00 |
    | 16 | 2023-02-17 00:00:00 |
    | 17 | 2023-02-18 00:00:00 |
    | 18 | 2023-02-19 00:00:00 |
    ...
    | 86 | 2023-04-28 00:00:00 |
    | 87 | 2023-04-29 00:00:00 |
    | 88 | 2023-04-30 00:00:00 |
    | 89 | 2023-05-01 00:00:00 |
    
    #### CoinMarketCap
    
    >>> CASH_input = 'ETH'
    >>> RISK_input = 'MPH'
    >>> start_date = '2023-02-01 00:00'
    >>> end_date = '2023-05-01 00:00'
    >>> api_key = secret_CoinMarketCap_api_key
    >>> CASH_symbol, CASH_USD_dataframe = get_CoinMarketCap_historical_price_data(CASH_input, start_date, end_date, secret_CoinMarketCap_api_key)
    >>> RISK_symbol, RISK_USD_dataframe = get_CoinMarketCap_historical_price_data(RISK_input, start_date, end_date, secret_CoinMarketCap_api_key)
    >>> merge_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_timestamps(CASH_USD_dataframe, RISK_USD_dataframe)
    
    More than one coin found with the symbol 'MPH': 7217, 7742.
    Please re-run the query using the exact id name (e.g., '7217'). 

    |   coin id | symbol   | website                  | twitter                        | explorer                                                              |
    |----------:|:---------|:-------------------------|:-------------------------------|:----------------------------------------------------------------------|
    |      7217 | MPH      | https://www.morpher.com/ | https://twitter.com/morpher_io | https://etherscan.io/token/0x6369c3dadfc00054a42ba8b2c09c48131dd4aa38 |
    |      7742 | MPH      | https://88mph.app/       | https://twitter.com/88mphapp   | https://etherscan.io/token/0x8888801af4d980682e47f1a9036e589479e835c5 |
    
    Using default coin id '7742' for symbol 'MPH'
    
    |     | time                |
    |----:|:--------------------|
    |   0 | 2023-02-02 00:00:00 |
    |   1 | 2023-02-02 00:13:00 |
    |   2 | 2023-02-02 07:34:00 |
    |   3 | 2023-02-02 18:46:00 |
    |   4 | 2023-02-02 23:59:59 |
    |   5 | 2023-02-03 00:00:00 |
    |   6 | 2023-02-03 02:44:00 |
    |   7 | 2023-02-03 03:19:00 |
    |   8 | 2023-02-03 15:27:00 |
    |   9 | 2023-02-03 16:37:00 |
    |  10 | 2023-02-03 23:59:59 |
    |  11 | 2023-02-04 00:00:00 |
    |  12 | 2023-02-04 05:29:00 |
    |  13 | 2023-02-04 13:25:00 |
    |  14 | 2023-02-04 15:01:00 |
    ...
    | 505 | 2023-05-01 01:05:00 |
    | 506 | 2023-05-01 20:59:00 |
    | 507 | 2023-05-01 21:00:00 |
    | 508 | 2023-05-01 23:59:59 |
    
    ## Notes:
    - This function takes two `DataFrame` objects, each containing historical price data from CoinGecko.
    - It merges the 'time' columns from both dataframes into a single `Series` object, removing duplicates and sorting the values.
    - The resulting `Series` object contains a single column with all unique UNIX timestamps (milisecond resolution) from the input dataframes.
    """
    merged_timestamps_series = pd.concat([CASH_USD_dataframe['time'], RISK_USD_dataframe['time']]).drop_duplicates().sort_values().reset_index(drop = True)
    return(merged_timestamps_series)

def combine_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_dataframes(
    merged_timestamps_dataframe: pd.Series,
    CASH_USD_dataframe: pd.DataFrame,
    RISK_USD_dataframe: pd.DataFrame
    ) -> pd.DataFrame:
    """
    ### Combines two CoinGecko historical price dataframes into a single dataframe.

    ## Parameters:
    | Parameter Name               | Type           | Description                                                                          |
    |:-----------------------------|:---------------|:-------------------------------------------------------------------------------------|
    | `merged_timestamps_dataframe`| `pd.Series`    | A pandas `Series` object containing the merged timestamps from the input dataframes. |
    | `CASH_USD_dataframe`         | `pd.DataFrame` | A pandas `DataFrame` with CoinGecko historical price data for `CASH` in USD.         |
    | `RISK_USD_dataframe`         | `pd.DataFrame` | A pandas `DataFrame` with CoinGecko historical price data for `RISK` in USD.         |

    ## Returns:
    | Return Name                                 | Type           | Description                                                                                  |
    |:--------------------------------------------|:---------------|:---------------------------------------------------------------------------------------------|
    | `combined_CASH_USD_and_RISK_USD_dataframes` | `pd.DataFrame` | A pandas `DataFrame` containing combined historical price data for `CASH` and `RISK` in USD. |
    
    ## Examples:
    
    #### CoinGecko Hourly Charts
    
    >>> CASH_input = 'ETH'
    >>> RISK_input = 'MPH'
    >>> frequency = 'hour'
    >>> start_date = '2023-02-01 00:00'
    >>> end_date = '2023-05-01 00:00'
    >>> api_key = secret_CoinGecko_api_key
    >>> CASH_symbol, CASH_USD_dataframe = get_CoinGecko_historical_price_data(CASH_input, frequency, start_date, end_date, secret_CoinGecko_api_key)
    >>> RISK_symbol, RISK_USD_dataframe = get_CoinGecko_historical_price_data(RISK_input, frequency, start_date, end_date, secret_CoinGecko_api_key)
    >>> merged_timestamps_series = merge_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_timestamps(CASH_USD_dataframe, RISK_USD_dataframe)
    >>> combine_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_dataframes(merged_timestamps_series, CASH_USD_dataframe, RISK_USD_dataframe)
    
    More than one coin found with the symbol 'ETH': ethereum, ethereum-wormhole. Please re-run the query using the exact id name (e.g., 'ethereum').
    Using default coin id 'ethereum' for symbol 'ETH'
    
    More than one coin found with the symbol 'MPH': 88mph, morpher. Please re-run the query using the exact id name (e.g., '88mph').
    Using default coin id '88mph' for symbol 'MPH'
    
    |      | time                       |   price_CASH |   price_RISK |
    |-----:|:---------------------------|-------------:|-------------:|
    |    0 | 2023-02-01 00:00:02.473000 |       nan    |      1.20302 |
    |    1 | 2023-02-01 00:01:10.439000 |      1586.15 |    nan       |
    |    2 | 2023-02-01 01:00:03.845000 |       nan    |      1.18991 |
    |    3 | 2023-02-01 01:01:06.389000 |      1584.58 |    nan       |
    |    4 | 2023-02-01 02:00:12.047000 |       nan    |      1.19055 |
    |    5 | 2023-02-01 02:01:53.331000 |      1589.31 |    nan       |
    |    6 | 2023-02-01 03:00:11.736000 |       nan    |      1.18942 |
    |    7 | 2023-02-01 03:01:07.726000 |      1586.07 |    nan       |
    |    8 | 2023-02-01 04:00:04.401000 |       nan    |      1.16905 |
    |    9 | 2023-02-01 04:03:03.619000 |      1585.26 |    nan       |
    |   10 | 2023-02-01 05:00:08.480000 |       nan    |      1.17078 |
    |   11 | 2023-02-01 05:02:59.455000 |      1584.51 |    nan       |
    |   12 | 2023-02-01 06:00:07.948000 |      1583.32 |    nan       |
    |   13 | 2023-02-01 06:00:10.856000 |       nan    |      1.20859 |
    |   14 | 2023-02-01 07:00:04.152000 |      1577.54 |    nan       |
    |   15 | 2023-02-01 07:00:13.306000 |       nan    |      1.20685 |
    |   16 | 2023-02-01 08:00:10.860000 |       nan    |      1.18411 |
    |   17 | 2023-02-01 08:01:55.165000 |      1576.29 |    nan       |
    |   18 | 2023-02-01 09:00:09.793000 |       nan    |      1.18542 |
    ...
    | 4275 | 2023-04-30 22:00:54.975000 |       nan    |      2.27376 |
    | 4276 | 2023-04-30 22:01:56.909000 |      1896.02 |    nan       |
    | 4277 | 2023-04-30 23:00:47.149000 |       nan    |      2.27053 |
    | 4278 | 2023-04-30 23:01:45.921000 |      1894.34 |    nan       |
    
    #### CoinGecko Daily Charts
    
    >>> CASH_input = 'ETH'
    >>> RISK_input = 'MPH'
    >>> frequency = 'daily'
    >>> start_date = '2023-02-01 00:00'
    >>> end_date = '2023-05-01 00:00'
    >>> api_key = secret_CoinGecko_api_key
    >>> CASH_symbol, CASH_USD_dataframe = get_CoinGecko_historical_price_data(CASH_input, frequency, start_date, end_date, secret_CoinGecko_api_key)
    >>> RISK_symbol, RISK_USD_dataframe = get_CoinGecko_historical_price_data(RISK_input, frequency, start_date, end_date, secret_CoinGecko_api_key)
    >>> merged_timestamps_series = merge_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_timestamps(CASH_USD_dataframe, RISK_USD_dataframe)
    >>> combine_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_dataframes(merged_timestamps_series, CASH_USD_dataframe, RISK_USD_dataframe)
    
    More than one coin found with the symbol 'ETH': ethereum, ethereum-wormhole. Please re-run the query using the exact id name (e.g., 'ethereum').
    Using default coin id 'ethereum' for symbol 'ETH'
    
    More than one coin found with the symbol 'MPH': 88mph, morpher. Please re-run the query using the exact id name (e.g., '88mph').
    Using default coin id '88mph' for symbol 'MPH'
    
    |    | time                |   price_CASH |   price_RISK |
    |---:|:--------------------|-------------:|-------------:|
    |  0 | 2023-02-01 00:00:00 |      1586.54 |      1.20651 |
    |  1 | 2023-02-02 00:00:00 |      1642.86 |      1.17352 |
    |  2 | 2023-02-03 00:00:00 |      1648.68 |      1.56579 |
    |  3 | 2023-02-04 00:00:00 |      1665.43 |      1.55605 |
    |  4 | 2023-02-05 00:00:00 |      1667.27 |      1.45926 |
    |  5 | 2023-02-06 00:00:00 |      1631.37 |      1.37171 |
    |  6 | 2023-02-07 00:00:00 |      1617.14 |      1.32084 |
    |  7 | 2023-02-08 00:00:00 |      1672.82 |      1.42331 |
    |  8 | 2023-02-09 00:00:00 |      1651.41 |      1.44437 |
    |  9 | 2023-02-10 00:00:00 |      1546.38 |      1.39662 |
    | 10 | 2023-02-11 00:00:00 |      1515.53 |      1.46612 |
    | 11 | 2023-02-12 00:00:00 |      1541.97 |      1.51271 |
    | 12 | 2023-02-13 00:00:00 |      1515.33 |      1.69412 |
    | 13 | 2023-02-14 00:00:00 |      1506.92 |      1.65262 |
    | 14 | 2023-02-15 00:00:00 |      1556.96 |      1.71968 |
    | 15 | 2023-02-16 00:00:00 |      1674.86 |      2.17269 |
    | 16 | 2023-02-17 00:00:00 |      1646.14 |      2.12035 |
    | 17 | 2023-02-18 00:00:00 |      1697.08 |      2.08955 |
    | 18 | 2023-02-19 00:00:00 |      1692.52 |      2.14416 |
    ...
    | 86 | 2023-04-28 00:00:00 |      1910.46 |      2.33849 |
    | 87 | 2023-04-29 00:00:00 |      1894.43 |      2.26494 |
    | 88 | 2023-04-30 00:00:00 |      1905.27 |      2.36768 |
    | 89 | 2023-05-01 00:00:00 |      1885.39 |      2.18761 |
    
    #### CoinMarketCap
    
    >>> CASH_input = 'ETH'
    >>> RISK_input = 'MPH'
    >>> start_date = '2023-02-01 00:00'
    >>> end_date = '2023-05-01 00:00'
    >>> api_key = secret_CoinMarketCap_api_key
    >>> CASH_symbol, CASH_USD_dataframe = get_CoinMarketCap_historical_price_data(CASH_input, start_date, end_date, secret_CoinMarketCap_api_key)
    >>> RISK_symbol, RISK_USD_dataframe = get_CoinMarketCap_historical_price_data(RISK_input, start_date, end_date, secret_CoinMarketCap_api_key)
    >>> merged_timestamps_series = merge_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_timestamps(CASH_USD_dataframe, RISK_USD_dataframe)
    >>> combine_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_dataframes(merged_timestamps_series, CASH_USD_dataframe, RISK_USD_dataframe)
    
    More than one coin found with the symbol 'MPH': 7217, 7742.
    Please re-run the query using the exact id name (e.g., '7217'). 

    |   coin id | symbol   | website                  | twitter                        | explorer                                                              |
    |----------:|:---------|:-------------------------|:-------------------------------|:----------------------------------------------------------------------|
    |      7217 | MPH      | https://www.morpher.com/ | https://twitter.com/morpher_io | https://etherscan.io/token/0x6369c3dadfc00054a42ba8b2c09c48131dd4aa38 |
    |      7742 | MPH      | https://88mph.app/       | https://twitter.com/88mphapp   | https://etherscan.io/token/0x8888801af4d980682e47f1a9036e589479e835c5 |
    
    Using default coin id '7742' for symbol 'MPH'
    
    |     | time                       |   price_CASH |   price_RISK |
    |----:|:---------------------------|-------------:|-------------:|
    |   0 | 2023-02-02 00:00:00        |      1641.37 |      1.11806 |
    |   1 | 2023-02-02 00:13:00        |      1641.32 |    nan       |
    |   2 | 2023-02-02 07:34:00        |       nan    |      1.64643 |
    |   3 | 2023-02-02 18:46:00        |      1704.46 |    nan       |
    |   4 | 2023-02-02 23:59:59.999000 |      1643.24 |      1.54832 |
    |   5 | 2023-02-03 00:00:00        |      1642.9  |      1.54891 |
    |   6 | 2023-02-03 02:44:00        |       nan    |      1.53382 |
    |   7 | 2023-02-03 03:19:00        |      1634.22 |    nan       |
    |   8 | 2023-02-03 15:27:00        |       nan    |      1.58823 |
    |   9 | 2023-02-03 16:37:00        |      1670.7  |    nan       |
    |  10 | 2023-02-03 23:59:59.999000 |      1664.75 |      1.58009 |
    |  11 | 2023-02-04 00:00:00        |      1664.47 |      1.58019 |
    |  12 | 2023-02-04 05:29:00        |      1648.19 |    nan       |
    |  13 | 2023-02-04 13:25:00        |      1690.1  |    nan       |
    |  14 | 2023-02-04 15:01:00        |       nan    |      1.62593 |
    ...
    | 505 | 2023-05-01 01:05:00        |      1886.21 |    nan       |
    | 506 | 2023-05-01 20:59:00        |       nan    |      2.19444 |
    | 507 | 2023-05-01 21:00:00        |      1809.19 |    nan       |
    | 508 | 2023-05-01 23:59:59.999000 |      1831.95 |      2.22852 |
    
    ## Notes:
    - This function takes three `DataFrame` objects: `merged_timestamps_dataframe`, `CASH_USD_dataframe`, and `RISK_USD_dataframe`.
    - It creates a new dataframe `combined_CASH_USD_and_RISK_USD_dataframes` using the `merged_timestamps_dataframe`.
    - The `CASH_USD_dataframe` and `RISK_USD_dataframe` are merged into the new dataframe using a left join on the 'time' column.
    - The resulting dataframe contains historical price data for both `CASH` and `RISK`, with '_CASH' and '_RISK' suffixes for respective columns.
    """
    combined_CASH_USD_and_RISK_USD_dataframes = pd.DataFrame({'time': merged_timestamps_dataframe})
    combined_CASH_USD_and_RISK_USD_dataframes = combined_CASH_USD_and_RISK_USD_dataframes.merge(CASH_USD_dataframe, on = 'time', how = 'left').merge(RISK_USD_dataframe, on = 'time', how = 'left', suffixes = ('_CASH', '_RISK'))
    return(combined_CASH_USD_and_RISK_USD_dataframes)

def preprocess_combined_dataframes(
    combined_CASH_USD_and_RISK_USD_dataframes: pd.DataFrame
    ) -> pd.DataFrame:
    """
    ### Preprocesses the merged CASH and RISK price data to remove contiguous NaN sequences from the front of each column.
    
    ## Parameters:
    | Parameter Name                              | Type           | Description                                                                                  |
    |:--------------------------------------------|:---------------|:---------------------------------------------------------------------------------------------|
    | `combined_CASH_USD_and_RISK_USD_dataframes` | `pd.DataFrame` | A pandas `DataFrame` containing combined historical price data for `CASH` and `RISK` in USD. |

    ## Returns:
    | Return Name                                | Type           | Description                                                               |
    |:-------------------------------------------|:---------------|:--------------------------------------------------------------------------|
    | `preprocessed_dataframe`                   | `pd.DataFrame` | A truncated pandas `DataFrame` with leading, contiguous NaN rows removed. |
    
    ## Example:
    
    #### Input
        
    |      | time                |   price_CASH |   price_RISK |
    |-----:|:--------------------|-------------:|-------------:|
    |    0 | 2013-04-28 00:00:00 |   nan        |     135.3    |
    |    1 | 2013-04-29 00:00:00 |   nan        |     141.96   |
    |    2 | 2013-04-30 00:00:00 |   nan        |     135.3    |
    |    3 | 2013-05-01 00:00:00 |   nan        |     117      |
    |    4 | 2013-05-02 00:00:00 |   nan        |     103.43   |
    |    5 | 2013-05-03 00:00:00 |   nan        |      91.01   |
    |    6 | 2013-05-04 00:00:00 |   nan        |     111.25   |
    |    7 | 2013-05-05 00:00:00 |   nan        |     116.79   |
    |    8 | 2013-05-06 00:00:00 |   nan        |     118.33   |
    |    9 | 2013-05-07 00:00:00 |   nan        |     106.4    |
    |   10 | 2013-05-08 00:00:00 |   nan        |     112.64   |
    |   11 | 2013-05-09 00:00:00 |   nan        |     113      |
    |   12 | 2013-05-10 00:00:00 |   nan        |     118.78   |
    |   13 | 2013-05-11 00:00:00 |   nan        |     113.01   |
    |   14 | 2013-05-12 00:00:00 |   nan        |     114.713  |
    |   15 | 2013-05-13 00:00:00 |   nan        |     117.18   |
    |   16 | 2013-05-14 00:00:00 |   nan        |     114.5    |
    |   17 | 2013-05-15 00:00:00 |   nan        |     114.156  |
    |   18 | 2013-05-16 00:00:00 |   nan        |     115.5    |
    |   19 | 2013-05-17 00:00:00 |   nan        |     123.1    |
    |   20 | 2013-05-18 00:00:00 |   nan        |     123.88   |
    |   21 | 2013-05-19 00:00:00 |   nan        |     120.501  |
    |   22 | 2013-05-20 00:00:00 |   nan        |     122.58   |
    ...
    | 3673 | 2023-05-17 00:00:00 |  1823.66     |   27022.7    |
    | 3674 | 2023-05-18 00:00:00 |  1821.05     |   27390      |
    | 3675 | 2023-05-19 00:00:00 |  1802.39     |   26843      |
    | 3676 | 2023-05-20 00:00:00 |  1812.13     |   26884.4    |

    #### Output
        
    |      | time                |   price_CASH |   price_RISK |
    |-----:|:--------------------|-------------:|-------------:|
    |    0 | 2015-08-06 00:00:00 |   nan        |      278.013 |
    |    1 | 2015-08-07 00:00:00 |     2.83162  |      278.509 |
    |    2 | 2015-08-08 00:00:00 |     1.33075  |      259.801 |
    |    3 | 2015-08-09 00:00:00 |   nan        |      264.338 |
    |    4 | 2015-08-10 00:00:00 |     0.687586 |      263.578 |
    |    5 | 2015-08-11 00:00:00 |     1.06738  |      269.867 |
    |    6 | 2015-08-12 00:00:00 |     1.25661  |      267.713 |
    |    7 | 2015-08-13 00:00:00 |     1.8254   |      263.656 |
    |    8 | 2015-08-14 00:00:00 |     1.82597  |      265.128 |
    |    9 | 2015-08-15 00:00:00 |     1.67095  |      260.476 |
    |   10 | 2015-08-16 00:00:00 |     1.47661  |      257.816 |
    |   11 | 2015-08-17 00:00:00 |     1.20387  |      257.063 |
    |   12 | 2015-08-18 00:00:00 |     1.28139  |      253.077 |
    |   13 | 2015-08-19 00:00:00 |     1.25274  |      225.96  |
    |   14 | 2015-08-20 00:00:00 |     1.4842   |      234.638 |
    |   15 | 2015-08-21 00:00:00 |     1.40631  |      232.332 |
    |   16 | 2015-08-22 00:00:00 |     1.38072  |      229.149 |
    |   17 | 2015-08-23 00:00:00 |     1.35518  |      227.245 |
    |   18 | 2015-08-24 00:00:00 |     1.24657  |      210.094 |
    |   19 | 2015-08-25 00:00:00 |     1.16083  |      221.328 |
    |   20 | 2015-08-26 00:00:00 |     1.11964  |      225.267 |
    |   21 | 2015-08-27 00:00:00 |     1.13369  |      222.97  |
    |   22 | 2015-08-28 00:00:00 |     1.1889   |      231.658 |
    ...
    | 2845 | 2023-05-17 00:00:00 |  1823.66     |    27022.7   |
    | 2846 | 2023-05-18 00:00:00 |  1821.05     |    27390     |
    | 2847 | 2023-05-19 00:00:00 |  1802.39     |    26843     |
    | 2848 | 2023-05-20 00:00:00 |  1812.13     |    26884.4   |

    ## Notes:
    - This function processes two columns in a dataframe, applying the rules to manage NaN sequences at the start of the columns.
        - For either column, the longest contiguous sequence of NaN at the start of the column is limited to 1.
        - After reducing the contiguous NaN sequence at the start of either column to 1, the other column must have a data point at in the first row.
    - It returns a preprocessed dataframe ready for substitution of the other NaN values by interpolation or back-filling.
    """
    for col in combined_CASH_USD_and_RISK_USD_dataframes.columns:
        notna_idx = combined_CASH_USD_and_RISK_USD_dataframes[col].notna().idxmax()  
        if combined_CASH_USD_and_RISK_USD_dataframes[col].iloc[0:notna_idx].shape[0] > 1:  
            combined_CASH_USD_and_RISK_USD_dataframes = combined_CASH_USD_and_RISK_USD_dataframes.loc[notna_idx - 1:]
    if combined_CASH_USD_and_RISK_USD_dataframes.iloc[0].isna().all():
        combined_CASH_USD_and_RISK_USD_dataframes = combined_CASH_USD_and_RISK_USD_dataframes.iloc[1:]
    preprocessed_dataframe = combined_CASH_USD_and_RISK_USD_dataframes.reset_index(drop = True)
    return(preprocessed_dataframe)

def interpolate_CoinGecko_or_CoinMarketCap_historical_data(
    combined_CASH_USD_and_RISK_USD_dataframes: pd.DataFrame
    ) -> pd.DataFrame:
    """
    ### Interpolates missing values in the historical price data of two CoinGecko assets.

    ## Parameters:
    | Parameter Name                              | Type           | Description                                                                                  |
    |:--------------------------------------------|:---------------|:---------------------------------------------------------------------------------------------|
    | `combined_CASH_USD_and_RISK_USD_dataframes` | `pd.DataFrame` | A pandas `DataFrame` containing combined historical price data for `CASH` and `RISK` in USD. |

    ## Returns:
    | Return Name                                     | Type           | Description                                                                                          |
    |:------------------------------------------------|:---------------|:-----------------------------------------------------------------------------------------------------|
    | `interpolated_CASH_USD_and_RISK_USD_dataframes` | `pd.DataFrame` | A pandas `DataFrame` containing the interpolated historical price data for `CASH` and `RISK` in USD. |
    
    ## Dependencies:
    | Dependency name                 | Type       | Description                                                                                                        |
    |:--------------------------------|:-----------|:-------------------------------------------------------------------------------------------------------------------|
    | `preprocess_combined_dataframes`| `function` | Preprocesses the merged CASH and RISK price data to remove contiguous NaN sequences from the front of each column. |
    
    ## Examples:
    
    #### CoinGecko Hourly Charts
    
    >>> CASH_input = 'ETH'
    >>> RISK_input = 'MPH'
    >>> frequency = 'hour'
    >>> start_date = '2023-02-01 00:00'
    >>> end_date = '2023-05-01 00:00'
    >>> api_key = secret_CoinGecko_api_key
    >>> CASH_symbol, CASH_USD_dataframe = get_CoinGecko_historical_price_data(CASH_input, frequency, start_date, end_date, secret_CoinGecko_api_key)
    >>> RISK_symbol, RISK_USD_dataframe = get_CoinGecko_historical_price_data(RISK_input, frequency, start_date, end_date, secret_CoinGecko_api_key)
    >>> merged_timestamps_series = merge_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_timestamps(CASH_USD_dataframe, RISK_USD_dataframe)
    >>> combined_CASH_USD_and_RISK_USD_dataframes = combine_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_dataframes(merged_timestamps_series, CASH_USD_dataframe, RISK_USD_dataframe)
    >>> interpolate_CoinGecko_or_CoinMarketCap_historical_data(combined_CASH_USD_and_RISK_USD_dataframes)
    
    More than one coin found with the symbol 'ETH': ethereum, ethereum-wormhole. Please re-run the query using the exact id name (e.g., 'ethereum').
    Using default coin id 'ethereum' for symbol 'ETH'
    
    More than one coin found with the symbol 'MPH': 88mph, morpher. Please re-run the query using the exact id name (e.g., '88mph').
    Using default coin id '88mph' for symbol 'MPH'
    
    |      | time                       |   price_CASH |   price_RISK |
    |-----:|:---------------------------|-------------:|-------------:|
    |    0 | 2023-02-01 00:00:02.473000 |      1586.15 |      1.20302 |
    |    1 | 2023-02-01 00:01:10.439000 |      1586.15 |      1.19646 |
    |    2 | 2023-02-01 01:00:03.845000 |      1585.37 |      1.18991 |
    |    3 | 2023-02-01 01:01:06.389000 |      1584.58 |      1.19023 |
    |    4 | 2023-02-01 02:00:12.047000 |      1586.94 |      1.19055 |
    |    5 | 2023-02-01 02:01:53.331000 |      1589.31 |      1.18999 |
    |    6 | 2023-02-01 03:00:11.736000 |      1587.69 |      1.18942 |
    |    7 | 2023-02-01 03:01:07.726000 |      1586.07 |      1.17924 |
    |    8 | 2023-02-01 04:00:04.401000 |      1585.66 |      1.16905 |
    |    9 | 2023-02-01 04:03:03.619000 |      1585.26 |      1.16992 |
    |   10 | 2023-02-01 05:00:08.480000 |      1584.89 |      1.17078 |
    |   11 | 2023-02-01 05:02:59.455000 |      1584.51 |      1.18339 |
    |   12 | 2023-02-01 06:00:07.948000 |      1583.32 |      1.19599 |
    |   13 | 2023-02-01 06:00:10.856000 |      1580.43 |      1.20859 |
    |   14 | 2023-02-01 07:00:04.152000 |      1577.54 |      1.20772 |
    |   15 | 2023-02-01 07:00:13.306000 |      1577.13 |      1.20685 |
    |   16 | 2023-02-01 08:00:10.860000 |      1576.71 |      1.18411 |
    |   17 | 2023-02-01 08:01:55.165000 |      1576.29 |      1.18477 |
    |   18 | 2023-02-01 09:00:09.793000 |      1573.54 |      1.18542 |
    ...
    | 4275 | 2023-04-30 22:00:54.975000 |      1895.18 |      2.27376 |
    | 4276 | 2023-04-30 22:01:56.909000 |      1896.02 |      2.27214 |
    | 4277 | 2023-04-30 23:00:47.149000 |      1895.18 |      2.27053 |
    | 4278 | 2023-04-30 23:01:45.921000 |      1894.34 |      2.27053 |
    
    #### CoinGecko Daily Charts
    
    >>> CASH_input = 'ETH'
    >>> RISK_input = 'MPH'
    >>> frequency = 'daily'
    >>> start_date = '2023-02-01 00:00'
    >>> end_date = '2023-05-01 00:00'
    >>> api_key = secret_CoinGecko_api_key
    >>> CASH_symbol, CASH_USD_dataframe = get_CoinGecko_historical_price_data(CASH_input, frequency, start_date, end_date, secret_CoinGecko_api_key)
    >>> RISK_symbol, RISK_USD_dataframe = get_CoinGecko_historical_price_data(RISK_input, frequency, start_date, end_date, secret_CoinGecko_api_key)
    >>> merged_timestamps_series = merge_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_timestamps(CASH_USD_dataframe, RISK_USD_dataframe)
    >>> combined_CASH_USD_and_RISK_USD_dataframes = combine_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_dataframes(merged_timestamps_series, CASH_USD_dataframe, RISK_USD_dataframe)
    >>> interpolate_CoinGecko_or_CoinMarketCap_historical_data(combined_CASH_USD_and_RISK_USD_dataframes)
    
    More than one coin found with the symbol 'ETH': ethereum, ethereum-wormhole. Please re-run the query using the exact id name (e.g., 'ethereum').
    Using default coin id 'ethereum' for symbol 'ETH'
    
    More than one coin found with the symbol 'MPH': 88mph, morpher. Please re-run the query using the exact id name (e.g., '88mph').
    Using default coin id '88mph' for symbol 'MPH'
    
    |    | time                |   price_CASH |   price_RISK |
    |---:|:--------------------|-------------:|-------------:|
    |  0 | 2023-02-01 00:00:00 |      1586.54 |      1.20651 |
    |  1 | 2023-02-02 00:00:00 |      1642.86 |      1.17352 |
    |  2 | 2023-02-03 00:00:00 |      1648.68 |      1.56579 |
    |  3 | 2023-02-04 00:00:00 |      1665.43 |      1.55605 |
    |  4 | 2023-02-05 00:00:00 |      1667.27 |      1.45926 |
    |  5 | 2023-02-06 00:00:00 |      1631.37 |      1.37171 |
    |  6 | 2023-02-07 00:00:00 |      1617.14 |      1.32084 |
    |  7 | 2023-02-08 00:00:00 |      1672.82 |      1.42331 |
    |  8 | 2023-02-09 00:00:00 |      1651.41 |      1.44437 |
    |  9 | 2023-02-10 00:00:00 |      1546.38 |      1.39662 |
    | 10 | 2023-02-11 00:00:00 |      1515.53 |      1.46612 |
    | 11 | 2023-02-12 00:00:00 |      1541.97 |      1.51271 |
    | 12 | 2023-02-13 00:00:00 |      1515.33 |      1.69412 |
    | 13 | 2023-02-14 00:00:00 |      1506.92 |      1.65262 |
    | 14 | 2023-02-15 00:00:00 |      1556.96 |      1.71968 |
    | 15 | 2023-02-16 00:00:00 |      1674.86 |      2.17269 |
    | 16 | 2023-02-17 00:00:00 |      1646.14 |      2.12035 |
    | 17 | 2023-02-18 00:00:00 |      1697.08 |      2.08955 |
    | 18 | 2023-02-19 00:00:00 |      1692.52 |      2.14416 |
    ...
    | 86 | 2023-04-28 00:00:00 |      1910.46 |      2.33849 |
    | 87 | 2023-04-29 00:00:00 |      1894.43 |      2.26494 |
    | 88 | 2023-04-30 00:00:00 |      1905.27 |      2.36768 |
    | 89 | 2023-05-01 00:00:00 |      1885.39 |      2.18761 |
    
    #### CoinMarketCap
    
    >>> CASH_input = 'ETH'
    >>> RISK_input = 'MPH'
    >>> start_date = '2023-02-01 00:00'
    >>> end_date = '2023-05-01 00:00'
    >>> api_key = secret_CoinMarketCap_api_key
    >>> CASH_symbol, CASH_USD_dataframe = get_CoinMarketCap_historical_price_data(CASH_input, start_date, end_date, secret_CoinMarketCap_api_key)
    >>> RISK_symbol, RISK_USD_dataframe = get_CoinMarketCap_historical_price_data(RISK_input, start_date, end_date, secret_CoinMarketCap_api_key)
    >>> merged_timestamps_series = merge_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_timestamps(CASH_USD_dataframe, RISK_USD_dataframe)
    >>> combined_CASH_USD_and_RISK_USD_dataframes = combine_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_dataframes(merged_timestamps_series, CASH_USD_dataframe, RISK_USD_dataframe)
    >>> interpolate_CoinGecko_or_CoinMarketCap_historical_data(combined_CASH_USD_and_RISK_USD_dataframes)
    
    More than one coin found with the symbol 'MPH': 7217, 7742.
    Please re-run the query using the exact id name (e.g., '7217'). 

    |   coin id | symbol   | website                  | twitter                        | explorer                                                              |
    |----------:|:---------|:-------------------------|:-------------------------------|:----------------------------------------------------------------------|
    |      7217 | MPH      | https://www.morpher.com/ | https://twitter.com/morpher_io | https://etherscan.io/token/0x6369c3dadfc00054a42ba8b2c09c48131dd4aa38 |
    |      7742 | MPH      | https://88mph.app/       | https://twitter.com/88mphapp   | https://etherscan.io/token/0x8888801af4d980682e47f1a9036e589479e835c5 |
    
    Using default coin id '7742' for symbol 'MPH'
    
    |     | time                       |   price_CASH |   price_RISK |
    |----:|:---------------------------|-------------:|-------------:|
    |   0 | 2023-02-02 00:00:00        |      1641.37 |      1.11806 |
    |   1 | 2023-02-02 00:13:00        |      1641.32 |      1.38225 |
    |   2 | 2023-02-02 07:34:00        |      1672.89 |      1.64643 |
    |   3 | 2023-02-02 18:46:00        |      1704.46 |      1.59738 |
    |   4 | 2023-02-02 23:59:59.999000 |      1643.24 |      1.54832 |
    |   5 | 2023-02-03 00:00:00        |      1642.9  |      1.54891 |
    |   6 | 2023-02-03 02:44:00        |      1638.56 |      1.53382 |
    |   7 | 2023-02-03 03:19:00        |      1634.22 |      1.56103 |
    |   8 | 2023-02-03 15:27:00        |      1652.46 |      1.58823 |
    |   9 | 2023-02-03 16:37:00        |      1670.7  |      1.58416 |
    |  10 | 2023-02-03 23:59:59.999000 |      1664.75 |      1.58009 |
    |  11 | 2023-02-04 00:00:00        |      1664.47 |      1.58019 |
    |  12 | 2023-02-04 05:29:00        |      1648.19 |      1.59544 |
    |  13 | 2023-02-04 13:25:00        |      1690.1  |      1.61068 |
    |  14 | 2023-02-04 15:01:00        |      1682.42 |      1.62593 |
    ...
    | 505 | 2023-05-01 01:05:00        |      1886.21 |      2.23691 |
    | 506 | 2023-05-01 20:59:00        |      1847.7  |      2.19444 |
    | 507 | 2023-05-01 21:00:00        |      1809.19 |      2.21148 |
    | 508 | 2023-05-01 23:59:59.999000 |      1831.95 |      2.22852 |

    ## Notes:
    - This function takes a `DataFrame` containing combined historical price data for `CASH` and `RISK` assets.
    - It interpolates missing values for both assets' price columns using linear interpolation.
    - Any remaining missing values at the beginning of the columns are filled using the 'bfill' (backward fill) method.
    """
    interpolated_CASH_USD_and_RISK_USD_dataframes = preprocess_combined_dataframes(combined_CASH_USD_and_RISK_USD_dataframes)
    interpolated_CASH_USD_and_RISK_USD_dataframes['price_CASH'] = interpolated_CASH_USD_and_RISK_USD_dataframes['price_CASH'].interpolate().fillna(method = 'bfill')
    interpolated_CASH_USD_and_RISK_USD_dataframes['price_RISK'] = interpolated_CASH_USD_and_RISK_USD_dataframes['price_RISK'].interpolate().fillna(method = 'bfill')
    return(interpolated_CASH_USD_and_RISK_USD_dataframes)

def process_CoinGecko_or_CoinMarketCap_USD_dataframes(
    interpolated_CASH_USD_and_RISK_USD_dataframes: pd.DataFrame
    ) -> pd.DataFrame:
    """
    ### Processes CoinGecko USD dataframes to create a smooth price dataframe.

    ## Parameters:
    | Parameter Name                                  | Type          | Description                                                                                   |
    |:------------------------------------------------|:--------------|:----------------------------------------------------------------------------------------------|
    | `interpolated_CASH_USD_and_RISK_USD_dataframes` | `pd.DataFrame`| A pandas `DataFrame` containing the interpolated historical price data for `CASH` and `RISK`. |

    ## Returns:
    | Return Name              | Type           | Description                                                                   |
    |:-------------------------|:---------------|:------------------------------------------------------------------------------|
    | `smooth_price_dataframe` | `pd.DataFrame` | A pandas `DataFrame` containing the price data for `RISK` in units of `CASH`. |
    
    ## Examples:
    
    #### CoinGecko Hourly Charts
    
    >>> CASH_input = 'ETH'
    >>> RISK_input = 'MPH'
    >>> frequency = 'hour'
    >>> start_date = '2023-02-01 00:00'
    >>> end_date = '2023-05-01 00:00'
    >>> api_key = secret_CoinGecko_api_key
    >>> CASH_symbol, CASH_USD_dataframe = get_CoinGecko_historical_price_data(CASH_input, frequency, start_date, end_date, secret_CoinGecko_api_key)
    >>> RISK_symbol, RISK_USD_dataframe = get_CoinGecko_historical_price_data(RISK_input, frequency, start_date, end_date, secret_CoinGecko_api_key)
    >>> merged_timestamps_series = merge_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_timestamps(CASH_USD_dataframe, RISK_USD_dataframe)
    >>> combined_CASH_USD_and_RISK_USD_dataframes = combine_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_dataframes(merged_timestamps_series, CASH_USD_dataframe, RISK_USD_dataframe)
    >>> interpolated_CASH_USD_and_RISK_USD_dataframes = interpolate_CoinGecko_or_CoinMarketCap_historical_data(combined_CASH_USD_and_RISK_USD_dataframes)
    >>> process_CoinGecko_or_CoinMarketCap_USD_dataframes(interpolated_CASH_USD_and_RISK_USD_dataframes)
    
    More than one coin found with the symbol 'ETH': ethereum, ethereum-wormhole. Please re-run the query using the exact id name (e.g., 'ethereum').
    Using default coin id 'ethereum' for symbol 'ETH'   

    More than one coin found with the symbol 'MPH': 88mph, morpher. Please re-run the query using the exact id name (e.g., '88mph').
    Using default coin id '88mph' for symbol 'MPH'  

    |      | time                       |       price |
    |-----:|:---------------------------|------------:|
    |    0 | 2023-02-01 00:00:02.473000 | 0.000758451 |
    |    1 | 2023-02-01 00:01:10.439000 | 0.000754318 |
    |    2 | 2023-02-01 01:00:03.845000 | 0.000750558 |
    |    3 | 2023-02-01 01:01:06.389000 | 0.00075113  |
    |    4 | 2023-02-01 02:00:12.047000 | 0.000750213 |
    |    5 | 2023-02-01 02:01:53.331000 | 0.000748746 |
    |    6 | 2023-02-01 03:00:11.736000 | 0.000749155 |
    |    7 | 2023-02-01 03:01:07.726000 | 0.000743495 |
    |    8 | 2023-02-01 04:00:04.401000 | 0.00073726  |
    |    9 | 2023-02-01 04:03:03.619000 | 0.000737997 |
    |   10 | 2023-02-01 05:00:08.480000 | 0.000738719 |
    |   11 | 2023-02-01 05:02:59.455000 | 0.000746847 |
    |   12 | 2023-02-01 06:00:07.948000 | 0.000755371 |
    |   13 | 2023-02-01 06:00:10.856000 | 0.000764725 |
    |   14 | 2023-02-01 07:00:04.152000 | 0.000765572 |
    |   15 | 2023-02-01 07:00:13.306000 | 0.000765223 |
    |   16 | 2023-02-01 08:00:10.860000 | 0.000751004 |
    |   17 | 2023-02-01 08:01:55.165000 | 0.000751619 |
    |   18 | 2023-02-01 09:00:09.793000 | 0.000753349 |
    ...
    | 4275 | 2023-04-30 22:00:54.975000 | 0.00119976  |
    | 4276 | 2023-04-30 22:01:56.909000 | 0.00119838  |
    | 4277 | 2023-04-30 23:00:47.149000 | 0.00119806  |
    | 4278 | 2023-04-30 23:01:45.921000 | 0.00119859  |
    
    #### CoinGecko Daily Charts
    
    >>> CASH_input = 'ETH'
    >>> RISK_input = 'MPH'
    >>> frequency = 'daily'
    >>> start_date = '2023-02-01 00:00'
    >>> end_date = '2023-05-01 00:00'
    >>> api_key = secret_CoinGecko_api_key
    >>> CASH_symbol, CASH_USD_dataframe = get_CoinGecko_historical_price_data(CASH_input, frequency, start_date, end_date, secret_CoinGecko_api_key)
    >>> RISK_symbol, RISK_USD_dataframe = get_CoinGecko_historical_price_data(RISK_input, frequency, start_date, end_date, secret_CoinGecko_api_key)
    >>> merged_timestamps_series = merge_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_timestamps(CASH_USD_dataframe, RISK_USD_dataframe)
    >>> combined_CASH_USD_and_RISK_USD_dataframes = combine_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_dataframes(merged_timestamps_series, CASH_USD_dataframe, RISK_USD_dataframe)
    >>> interpolated_CASH_USD_and_RISK_USD_dataframes = interpolate_CoinGecko_or_CoinMarketCap_historical_data(combined_CASH_USD_and_RISK_USD_dataframes)
    >>> process_CoinGecko_or_CoinMarketCap_USD_dataframes(interpolated_CASH_USD_and_RISK_USD_dataframes)
    
    More than one coin found with the symbol 'ETH': ethereum, ethereum-wormhole. Please re-run the query using the exact id name (e.g., 'ethereum').
    Using default coin id 'ethereum' for symbol 'ETH'
    
    More than one coin found with the symbol 'MPH': 88mph, morpher. Please re-run the query using the exact id name (e.g., '88mph').
    Using default coin id '88mph' for symbol 'MPH'
    
    |    | time                |       price |
    |---:|:--------------------|------------:|
    |  0 | 2023-02-01 00:00:00 | 0.000760465 |
    |  1 | 2023-02-02 00:00:00 | 0.000714319 |
    |  2 | 2023-02-03 00:00:00 | 0.000949723 |
    |  3 | 2023-02-04 00:00:00 | 0.000934324 |
    |  4 | 2023-02-05 00:00:00 | 0.000875238 |
    |  5 | 2023-02-06 00:00:00 | 0.000840831 |
    |  6 | 2023-02-07 00:00:00 | 0.000816775 |
    |  7 | 2023-02-08 00:00:00 | 0.000850844 |
    |  8 | 2023-02-09 00:00:00 | 0.000874628 |
    |  9 | 2023-02-10 00:00:00 | 0.000903153 |
    | 10 | 2023-02-11 00:00:00 | 0.000967395 |
    | 11 | 2023-02-12 00:00:00 | 0.000981023 |
    | 12 | 2023-02-13 00:00:00 | 0.00111798  |
    | 13 | 2023-02-14 00:00:00 | 0.00109669  |
    | 14 | 2023-02-15 00:00:00 | 0.00110451  |
    | 15 | 2023-02-16 00:00:00 | 0.00129724  |
    | 16 | 2023-02-17 00:00:00 | 0.00128807  |
    | 17 | 2023-02-18 00:00:00 | 0.00123126  |
    | 18 | 2023-02-19 00:00:00 | 0.00126685  |
    ...
    | 86 | 2023-04-28 00:00:00 | 0.00122405  |
    | 87 | 2023-04-29 00:00:00 | 0.00119558  |
    | 88 | 2023-04-30 00:00:00 | 0.0012427   |
    | 89 | 2023-05-01 00:00:00 | 0.00116029  |

    #### CoinMarketCap
    
    >>> CASH_input = 'ETH'
    >>> RISK_input = 'MPH'
    >>> start_date = '2023-02-01 00:00'
    >>> end_date = '2023-05-01 00:00'
    >>> api_key = secret_CoinMarketCap_api_key
    >>> CASH_symbol, CASH_USD_dataframe = get_CoinMarketCap_historical_price_data(CASH_input, start_date, end_date, secret_CoinMarketCap_api_key)
    >>> RISK_symbol, RISK_USD_dataframe = get_CoinMarketCap_historical_price_data(RISK_input, start_date, end_date, secret_CoinMarketCap_api_key)
    >>> merged_timestamps_series = merge_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_timestamps(CASH_USD_dataframe, RISK_USD_dataframe)
    >>> combined_CASH_USD_and_RISK_USD_dataframes = combine_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_dataframes(merged_timestamps_series, CASH_USD_dataframe, RISK_USD_dataframe)
    >>> interpolated_CASH_USD_and_RISK_USD_dataframes = interpolate_CoinGecko_or_CoinMarketCap_historical_data(combined_CASH_USD_and_RISK_USD_dataframes)
    >>> process_CoinGecko_or_CoinMarketCap_USD_dataframes(interpolated_CASH_USD_and_RISK_USD_dataframes)
    
    More than one coin found with the symbol 'MPH': 7217, 7742.
    Please re-run the query using the exact id name (e.g., '7217'). 

    |   coin id | symbol   | website                  | twitter                        | explorer                                                              |
    |----------:|:---------|:-------------------------|:-------------------------------|:----------------------------------------------------------------------|
    |      7217 | MPH      | https://www.morpher.com/ | https://twitter.com/morpher_io | https://etherscan.io/token/0x6369c3dadfc00054a42ba8b2c09c48131dd4aa38 |
    |      7742 | MPH      | https://88mph.app/       | https://twitter.com/88mphapp   | https://etherscan.io/token/0x8888801af4d980682e47f1a9036e589479e835c5 |
    
    Using default coin id '7742' for symbol 'MPH'
    
    |     | time                       |       price |
    |----:|:---------------------------|------------:|
    |   0 | 2023-02-02 00:00:00        | 0.000681177 |
    |   1 | 2023-02-02 00:13:00        | 0.000842155 |
    |   2 | 2023-02-02 07:34:00        | 0.000984186 |
    |   3 | 2023-02-02 18:46:00        | 0.000937177 |
    |   4 | 2023-02-02 23:59:59.999000 | 0.000942237 |
    |   5 | 2023-02-03 00:00:00        | 0.000942785 |
    |   6 | 2023-02-03 02:44:00        | 0.000936077 |
    |   7 | 2023-02-03 03:19:00        | 0.000955211 |
    |   8 | 2023-02-03 15:27:00        | 0.000961133 |
    |   9 | 2023-02-03 16:37:00        | 0.000948204 |
    |  10 | 2023-02-03 23:59:59.999000 | 0.000949148 |
    |  11 | 2023-02-04 00:00:00        | 0.000949364 |
    |  12 | 2023-02-04 05:29:00        | 0.000967993 |
    |  13 | 2023-02-04 13:25:00        | 0.000953011 |
    |  14 | 2023-02-04 15:01:00        | 0.000966423 |
    ...
    | 505 | 2023-05-01 01:05:00        | 0.00118593  |
    | 506 | 2023-05-01 20:59:00        | 0.00118766  |
    | 507 | 2023-05-01 21:00:00        | 0.00122236  |
    | 508 | 2023-05-01 23:59:59.999000 | 0.00121647  |

    ## Notes:
    - This function takes a dataframe containing interpolated historical price data for `CASH` and `RISK` assets.
    - It creates a copy of the input dataframe and calculates the smooth price as the ratio of `RISK` price to `CASH` price.
    - The original 'price_CASH' and 'price_RISK' columns are dropped, leaving only the 'time' and calculated 'price' columns in the resulting `DataFrame`.
    """
    smooth_price_dataframe = interpolated_CASH_USD_and_RISK_USD_dataframes.copy()
    smooth_price_dataframe["price"] = smooth_price_dataframe["price_RISK"]/smooth_price_dataframe["price_CASH"]
    smooth_price_dataframe.drop(["price_CASH", "price_RISK"], axis=1, inplace=True)
    return(smooth_price_dataframe)

def create_CoinGecko_or_CoinMarketCap_OHLC_dataframe(
    smooth_price_dataframe: pd.DataFrame,
    num_rows: int = 4
    ) -> pd.DataFrame:
    """
    ### Creates an Open-High-Low-Close (OHLC) dataframe from the CoinGecko or CoinMarketCap data.

    ## Parameters:
    | Parameter Name           | Type          | Description                                        |
    |:-------------------------|:--------------|:---------------------------------------------------|
    | `smooth_price_dataframe` | `pd.DataFrame`| The dataframe containing the price data.           |
    | `num_rows`               | `int`         | The number of rows to consider for each data bin.  |

    ## Returns:
    | Return Name      | Type          | Description                                                   |
    |:-----------------|:--------------|:--------------------------------------------------------------|
    | `OHLC_dataframe` | `pd.DataFrame`| A dataframe containing OHLC data for the provided price data. |
    
    ## Examples:
    
    #### CoinGecko Hourly Charts

    >>> CASH_input = 'ETH'
    >>> RISK_input = 'MPH'
    >>> frequency = 'hour'
    >>> start_date = '2023-02-01 00:00'
    >>> end_date = '2023-05-01 00:00'
    >>> api_key = secret_CoinGecko_api_key
    >>> CASH_symbol, CASH_USD_dataframe = get_CoinGecko_historical_price_data(CASH_input, frequency, start_date, end_date, secret_CoinGecko_api_key)
    >>> RISK_symbol, RISK_USD_dataframe = get_CoinGecko_historical_price_data(RISK_input, frequency, start_date, end_date, secret_CoinGecko_api_key)
    >>> merged_timestamps_series = merge_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_timestamps(CASH_USD_dataframe, RISK_USD_dataframe)
    >>> combined_CASH_USD_and_RISK_USD_dataframes = combine_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_dataframes(merged_timestamps_series, CASH_USD_dataframe, RISK_USD_dataframe)
    >>> interpolated_CASH_USD_and_RISK_USD_dataframes = interpolate_CoinGecko_or_CoinMarketCap_historical_data(combined_CASH_USD_and_RISK_USD_dataframes)
    >>> smooth_price_dataframe = process_CoinGecko_or_CoinMarketCap_USD_dataframes(interpolated_CASH_USD_and_RISK_USD_dataframes)
    >>> create_CoinGecko_or_CoinMarketCap_OHLC_dataframe(smooth_price_dataframe)
    
    More than one coin found with the symbol 'ETH': ethereum, ethereum-wormhole. Please re-run the query using the exact id name (e.g., 'ethereum').
    Using default coin id 'ethereum' for symbol 'ETH'
    
    More than one coin found with the symbol 'MPH': 88mph, morpher. Please re-run the query using the exact id name (e.g., '88mph').
    Using default coin id '88mph' for symbol 'MPH'
    
    |      | time                          |        open |        high |         low |       close |
    |-----:|:------------------------------|------------:|------------:|------------:|------------:|
    |    0 | 2023-02-01 01:59:52.466870784 | 0.000758451 | 0.000758451 | 0.000750558 | 0.00075113  |
    |    1 | 2023-02-01 03:59:42.460741632 | 0.00075113  | 0.00075113  | 0.000743495 | 0.000743495 |
    |    2 | 2023-02-01 05:59:32.454612736 | 0.000743495 | 0.000746847 | 0.00073726  | 0.000746847 |
    |    3 | 2023-02-01 07:59:22.448483584 | 0.000746847 | 0.000765572 | 0.000746847 | 0.000765223 |
    |    4 | 2023-02-01 09:59:12.442354432 | 0.000765223 | 0.000765223 | 0.000744937 | 0.000744937 |
    |    5 | 2023-02-01 11:59:02.436225280 | 0.000744937 | 0.000753824 | 0.000731569 | 0.000753824 |
    |    6 | 2023-02-01 13:58:52.430096384 | 0.000753824 | 0.000781231 | 0.000753824 | 0.000768873 |
    |    7 | 2023-02-01 15:58:42.423967232 | 0.000768873 | 0.000768873 | 0.000756467 | 0.000763893 |
    |    8 | 2023-02-01 17:58:32.417838080 | 0.000763893 | 0.000786287 | 0.000763893 | 0.000778901 |
    |    9 | 2023-02-01 19:58:22.411708928 | 0.000778901 | 0.000778901 | 0.00076236  | 0.00076236  |
    |   10 | 2023-02-01 21:58:12.405580032 | 0.00076236  | 0.00076236  | 0.000756415 | 0.000757851 |
    |   11 | 2023-02-01 23:58:02.399450880 | 0.000757851 | 0.000785919 | 0.000751208 | 0.000751208 |
    |   12 | 2023-02-02 01:57:52.393321728 | 0.000751208 | 0.000751208 | 0.000711065 | 0.000720285 |
    |   13 | 2023-02-02 03:57:42.387192576 | 0.000720285 | 0.000720285 | 0.00070179  | 0.00070179  |
    |   14 | 2023-02-02 05:57:32.381063424 | 0.00070179  | 0.00070179  | 0.000689444 | 0.000695872 |
    |   15 | 2023-02-02 07:57:22.374934528 | 0.000695872 | 0.000985884 | 0.000695872 | 0.000975815 |
    |   16 | 2023-02-02 09:57:12.368805376 | 0.000975815 | 0.000975815 | 0.000955813 | 0.000957645 |
    |   17 | 2023-02-02 11:57:02.362676224 | 0.000957645 | 0.000966105 | 0.000957645 | 0.000965008 |
    |   18 | 2023-02-02 13:56:52.356547072 | 0.000965008 | 0.000965008 | 0.000961428 | 0.000964199 |
    ...
    | 1065 | 2023-04-30 17:02:15.939387136 | 0.00115267  | 0.00117158  | 0.00115267  | 0.00116708  |
    | 1066 | 2023-04-30 19:02:05.933258240 | 0.00116708  | 0.00116832  | 0.00115974  | 0.00116832  |
    | 1067 | 2023-04-30 21:01:55.927129088 | 0.00116832  | 0.00119444  | 0.00116832  | 0.00119444  |
    | 1068 | 2023-04-30 23:01:45.920999936 | 0.00119444  | 0.00119976  | 0.00119444  | 0.00119859  |
    
    #### CoinGecko Daily Charts
    
    >>> CASH_input = 'ETH'
    >>> RISK_input = 'MPH'
    >>> frequency = 'daily'
    >>> start_date = '2023-02-01 00:00'
    >>> end_date = '2023-05-01 00:00'
    >>> api_key = secret_CoinGecko_api_key
    >>> CASH_symbol, CASH_USD_dataframe = get_CoinGecko_historical_price_data(CASH_input, frequency, start_date, end_date, secret_CoinGecko_api_key)
    >>> RISK_symbol, RISK_USD_dataframe = get_CoinGecko_historical_price_data(RISK_input, frequency, start_date, end_date, secret_CoinGecko_api_key)
    >>> merged_timestamps_series = merge_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_timestamps(CASH_USD_dataframe, RISK_USD_dataframe)
    >>> combined_CASH_USD_and_RISK_USD_dataframes = combine_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_dataframes(merged_timestamps_series, CASH_USD_dataframe, RISK_USD_dataframe)
    >>> interpolated_CASH_USD_and_RISK_USD_dataframes = interpolate_CoinGecko_or_CoinMarketCap_historical_data(combined_CASH_USD_and_RISK_USD_dataframes)
    >>> smooth_price_dataframe = process_CoinGecko_or_CoinMarketCap_USD_dataframes(interpolated_CASH_USD_and_RISK_USD_dataframes)
    >>> create_CoinGecko_or_CoinMarketCap_OHLC_dataframe(smooth_price_dataframe)
    
    More than one coin found with the symbol 'ETH': ethereum, ethereum-wormhole. Please re-run the query using the exact id name (e.g., 'ethereum').
    Using default coin id 'ethereum' for symbol 'ETH'
    
    More than one coin found with the symbol 'MPH': 88mph, morpher. Please re-run the query using the exact id name (e.g., '88mph').
    Using default coin id '88mph' for symbol 'MPH'
    
    |    | time                          |        open |        high |         low |       close |
    |---:|:------------------------------|------------:|------------:|------------:|------------:|
    |  0 | 2023-02-05 01:05:27.272727296 | 0.000760465 | 0.000949723 | 0.000714319 | 0.000875238 |
    |  1 | 2023-02-09 02:10:54.545454592 | 0.000875238 | 0.000875238 | 0.000816775 | 0.000874628 |
    |  2 | 2023-02-13 03:16:21.818181888 | 0.000874628 | 0.00111798  | 0.000874628 | 0.00111798  |
    |  3 | 2023-02-17 04:21:49.090909184 | 0.00111798  | 0.00129724  | 0.00109669  | 0.00128807  |
    |  4 | 2023-02-21 05:27:16.363636480 | 0.00128807  | 0.00141486  | 0.00115628  | 0.00141486  |
    |  5 | 2023-02-25 06:32:43.636363520 | 0.00141486  | 0.00148187  | 0.0013881   | 0.0013881   |
    |  6 | 2023-03-01 07:38:10.909090816 | 0.0013881   | 0.00162363  | 0.0013881   | 0.00161505  |
    |  7 | 2023-03-05 08:43:38.181818112 | 0.00161505  | 0.00161505  | 0.00142112  | 0.00142112  |
    |  8 | 2023-03-09 09:49:05.454545408 | 0.00142112  | 0.00152124  | 0.00142112  | 0.00145902  |
    |  9 | 2023-03-13 10:54:32.727272704 | 0.00145902  | 0.00163706  | 0.00145902  | 0.00149074  |
    | 10 | 2023-03-17 12:00:00           | 0.00149074  | 0.00152971  | 0.00143841  | 0.00152971  |
    | 11 | 2023-03-21 13:05:27.272727296 | 0.00152971  | 0.00152971  | 0.00143649  | 0.00150257  |
    | 12 | 2023-03-25 14:10:54.545454592 | 0.00150257  | 0.00150257  | 0.00136431  | 0.00136431  |
    | 13 | 2023-03-29 15:16:21.818181888 | 0.00136431  | 0.00139441  | 0.0013527   | 0.0013818   |
    | 14 | 2023-04-02 16:21:49.090909184 | 0.0013818   | 0.0013818   | 0.00131334  | 0.00133237  |
    | 15 | 2023-04-06 17:27:16.363636480 | 0.00133237  | 0.00135669  | 0.00132011  | 0.00135669  |
    | 16 | 2023-04-10 18:32:43.636363520 | 0.00135669  | 0.00135906  | 0.00128892  | 0.00128892  |
    | 17 | 2023-04-14 19:38:10.909090816 | 0.00128892  | 0.001311    | 0.00124922  | 0.00124922  |
    | 18 | 2023-04-18 20:43:38.181818112 | 0.00124922  | 0.00124922  | 0.00114577  | 0.00114577  |
    | 19 | 2023-04-22 21:49:05.454545408 | 0.00114577  | 0.00121678  | 0.00114051  | 0.00114051  |
    | 20 | 2023-04-26 22:54:32.727272704 | 0.00114051  | 0.00122952  | 0.00114051  | 0.00122952  |
    | 21 | 2023-05-01 00:00:00           | 0.00122952  | 0.00124863  | 0.00116029  | 0.00116029  |
    
    #### CoinMarketCap
    
    >>> CASH_input = 'ETH'
    >>> RISK_input = 'MPH'
    >>> start_date = '2023-02-01 00:00'
    >>> end_date = '2023-05-01 00:00'
    >>> api_key = secret_CoinMarketCap_api_key
    >>> CASH_symbol, CASH_USD_dataframe = get_CoinMarketCap_historical_price_data(CASH_input, start_date, end_date, secret_CoinMarketCap_api_key)
    >>> RISK_symbol, RISK_USD_dataframe = get_CoinMarketCap_historical_price_data(RISK_input, start_date, end_date, secret_CoinMarketCap_api_key)
    >>> merged_timestamps_series = merge_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_timestamps(CASH_USD_dataframe, RISK_USD_dataframe)
    >>> combined_CASH_USD_and_RISK_USD_dataframes = combine_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_dataframes(merged_timestamps_series, CASH_USD_dataframe, RISK_USD_dataframe)
    >>> interpolated_CASH_USD_and_RISK_USD_dataframes = interpolate_CoinGecko_or_CoinMarketCap_historical_data(combined_CASH_USD_and_RISK_USD_dataframes)
    >>> smooth_price_dataframe = process_CoinGecko_or_CoinMarketCap_USD_dataframes(interpolated_CASH_USD_and_RISK_USD_dataframes)
    >>> create_CoinGecko_or_CoinMarketCap_OHLC_dataframe(smooth_price_dataframe)
    
    More than one coin found with the symbol 'MPH': 7217, 7742.
    Please re-run the query using the exact id name (e.g., '7217'). 

    |   coin id | symbol   | website                  | twitter                        | explorer                                                              |
    |----------:|:---------|:-------------------------|:-------------------------------|:----------------------------------------------------------------------|
    |      7217 | MPH      | https://www.morpher.com/ | https://twitter.com/morpher_io | https://etherscan.io/token/0x6369c3dadfc00054a42ba8b2c09c48131dd4aa38 |
    |      7742 | MPH      | https://88mph.app/       | https://twitter.com/88mphapp   | https://etherscan.io/token/0x8888801af4d980682e47f1a9036e589479e835c5 |
    
    Using default coin id '7742' for symbol 'MPH'
    
    |     | time                          |        open |        high |         low |       close |
    |----:|:------------------------------|------------:|------------:|------------:|------------:|
    |   0 | 2023-02-02 16:49:08.031488256 | 0.000681177 | 0.000984186 | 0.000681177 | 0.000984186 |
    |   1 | 2023-02-03 09:38:16.062976256 | 0.000984186 | 0.000984186 | 0.000936077 | 0.000955211 |
    |   2 | 2023-02-04 02:27:24.094464512 | 0.000955211 | 0.000961133 | 0.000948204 | 0.000949364 |
    |   3 | 2023-02-04 19:16:32.125952768 | 0.000949364 | 0.000967993 | 0.000949364 | 0.000966423 |
    |   4 | 2023-02-05 12:05:40.157441024 | 0.000966423 | 0.000966423 | 0.000832639 | 0.000842485 |
    |   5 | 2023-02-06 04:54:48.188929024 | 0.000842485 | 0.000877268 | 0.000842485 | 0.00086374  |
    |   6 | 2023-02-06 21:43:56.220417280 | 0.00086374  | 0.000881246 | 0.000841766 | 0.000841766 |
    |   7 | 2023-02-07 14:33:04.251905536 | 0.000841766 | 0.000841766 | 0.000818661 | 0.000830497 |
    |   8 | 2023-02-08 07:22:12.283393792 | 0.000830497 | 0.000852535 | 0.000817874 | 0.000843448 |
    |   9 | 2023-02-09 00:11:20.314881792 | 0.000843448 | 0.000894739 | 0.000843448 | 0.000880199 |
    |  10 | 2023-02-09 17:00:28.346370048 | 0.000880199 | 0.000972693 | 0.000880199 | 0.000972693 |
    |  11 | 2023-02-10 09:49:36.377858304 | 0.000972693 | 0.000972693 | 0.00084662  | 0.000937196 |
    |  12 | 2023-02-11 02:38:44.409346560 | 0.000937196 | 0.00100207  | 0.000937196 | 0.000973427 |
    |  13 | 2023-02-11 19:27:52.440834560 | 0.000973427 | 0.000973427 | 0.000973427 | 0.000973427 |
    |  14 | 2023-02-12 12:17:00.472322816 | 0.000973427 | 0.00101661  | 0.000973427 | 0.0010082   |
    ...
    | 123 | 2023-04-29 21:32:35.904535552 | 0.00116183  | 0.00118971  | 0.00116183  | 0.00118971  |
    | 124 | 2023-04-30 14:21:43.936023808 | 0.00118971  | 0.00124158  | 0.00118971  | 0.00123304  |
    | 125 | 2023-05-01 07:10:51.967511808 | 0.00123304  | 0.00123304  | 0.00118593  | 0.00118593  |
    | 126 | 2023-05-01 23:59:59.999000064 | 0.00118593  | 0.00122236  | 0.00118593  | 0.00121647  |
    
    ## Notes:
    - This function takes a pandas `DataFrame` containing smoothed price data, with a `time` column and a `price` column.
    - The `time` column should be in datetime format.
    - The function creates data bins by dividing the input dataframe into `num_bins` bins based on the length of the dataframe and the `num_rows` parameter.
    - An OHLC dataframe is created with the following attributes for each data bin:
        - 'time' corresponds to the timestamp of the end of the bin.
        - 'open' is the price at the start of the bin or the 'close' price of the previous bin.
        - 'high' is the maximum price within the bin.
        - 'low' is the minimum price within the bin.
        - 'close' is the price at the end of the bin.
    - The function continues until it has processed all rows in the input dataframe.
    - The 'close' price of a bin becomes the 'open' price of the next bin.
    - The first 'open' price is the price of the first row in the input dataframe.
    """
    num_bins = int(len(smooth_price_dataframe)/num_rows)
    smooth_price_dataframe['time_bin'] = pd.cut(smooth_price_dataframe['time'], bins = num_bins)
    bin_groups = smooth_price_dataframe.groupby('time_bin')['price'].apply(list)
    bin_edges = pd.to_datetime([interval.right for interval in bin_groups.index])
    for i in range(1, len(bin_groups)):
        bin_groups.iloc[i].insert(0, bin_groups.iloc[i - 1][-1])
    OHLC_dataframe = pd.DataFrame({'time': bin_edges,
                                   'open': bin_groups.apply(lambda x: x[0]),
                                   'high': bin_groups.apply(max),
                                   'low': bin_groups.apply(min),
                                   'close': bin_groups.apply(lambda x: x[-1])})
    OHLC_dataframe.reset_index(drop = True, inplace = True)
    return(OHLC_dataframe)

def get_CoinGecko_or_CoinMarketCap_OHLC_and_smooth_price_data(
    data_source: str = 'CoinGecko',
    CASH: str = 'ETH', 
    RISK: str = 'BTC',
    frequency: Union[str, None] = None,
    start_date: Union[str, None] = None,
    end_date: Union[str, None] = None,
    api_key: Union[str, None] = None,
    csv_filenames: Union[Tuple[str, str], None] = None
    ) -> Tuple[str, str, pd.DataFrame, pd.DataFrame]:
    """
    ### Retrieves OHLC and smooth price data for two cryptocurrency assets from CoinGecko or CoinMarketCap.
    
    ## Parameters:
    | Parameter Name  | Type                           | Description                                                                                                                                     |
    |:----------------|:-------------------------------|:------------------------------------------------------------------------------------------------------------------------------------------------|
    | `data_source`   | `str`                          | The data source for the cryptocurrency data. Possible values: 'CoinGecko' or 'CoinMarketCap'.                                                   |
    | `CASH`          | `str`                          | The identifier for the first asset in the selected `data_source` (e.g., 'ETH').                                                                 |
    | `RISK`          | `str`                          | The identifier for the second asset in the selected `data_source` (e.g., 'BTC').                                                                |
    | `frequency`     | `Union[str, None]`             | The frequency of the data to be retrieved. This can vary based on data source's API. If `None`, it defaults to the source's standard frequency. |
    | `start_date`    | `Union[str, None]`             | The start date for the data in the format 'YYYY-MM-DD'. If `None`, data is retrieved from the earliest available date.                          |
    | `end_date`      | `Union[str, None]`             | The end date for the data in the format 'YYYY-MM-DD'. If `None`, data is retrieved up to the most recent date.                                  |
    | `api_key`       | `Union[str, None]`             | The API key for the `data_source`. This is required for certain sources or premium data requests. If `None`, public API access is used.         |
    | `csv_filenames` | `Union[Tuple[str, str], None]` | A tuple containing two (2) filenames for the `csv` data with column names 'time' and 'price', for the `CASH` and `RISK` assets, in that order.  |

    ## Returns:
    | Return Name              | Type                                          | Description                                                                                            |
    |:-------------------------|:----------------------------------------------|:-------------------------------------------------------------------------------------------------------|
    | `CASH_symbol`            | `str`                                         | A string containing the appropriate cryptocurrency ticker symbol for the `CASH` asset (e.g. 'ETH').    |
    | `RISK_symbol`            | `str`                                         | A string containing the appropriate cryptocurrency ticker symbol for the `RISK` asset (e.g. 'BTC').    |
    | `OHLC_dataframe`         | `pd.DataFrame`                                | The 'Open, High, Low, Close' historical price data as a pandas `DataFrame`.                            |
    | `smooth_price_dataframe` | `pd.DataFrame`                                | The 'smooth' historical price data as a pandas `DataFrame`.                                            |
    |                          | `Tuple[str, str, pd.DataFrame, pd.DataFrame]` | A tuple of `CASH_symbol`, `RISK_symbol`, `OHLC_dataframe` and `smooth_price_dataframe`, in that order. |

    ## Dependencies:
    | Dependency name                                      | Type       | Description                                                                         |
    |:-----------------------------------------------------|:-----------|:------------------------------------------------------------------------------------|
    | `get_CoinGecko_historical_price_data`                | `function` | Retrieves historical price data for a given coin from CoinGecko.                    |
    | `merge_CoinGecko_CASH_USD_and_RISK_USD_timestamps`   | `function` | Merges the timestamps of two CoinGecko `DataFrame` objects.                         |
    | `combine_CoinGecko_CASH_USD_and_RISK_USD_dataframes` | `function` | Combines two CoinGecko `DataFrame` objects with merged timestamps.                  |
    | `interpolate_CoinGecko_historical_data`              | `function` | Interpolates missing values in the combined CoinGecko `DataFrame` objects.          |
    | `process_CoinGecko_USD_dataframes`                   | `function` | Processes and smooths the price data in the combined CoinGecko `DataFrame` objects. |
    | `create_OHLC_dataframe`                              | `function` | Creates an OHLC `DataFrame` with 4-hour intervals.                                  |
    
    ## Examples:
    
    #### CoinGecko Hourly Charts
    
    >>> data_source = 'CoinGecko'
    >>> CASH_input = 'ETH'
    >>> RISK_input = 'MPH'
    >>> frequency = 'hour'
    >>> start_date = '2023-02-01 00:00'
    >>> end_date = '2023-05-01 00:00'
    >>> api_key = secret_CoinGecko_api_key
    >>> get_CoinGecko_or_CoinMarketCap_OHLC_and_smooth_price_data(data_source, CASH_input, RISK_input, frequency, start_date, end_date, api_key) 
    
    More than one coin found with the symbol 'ETH': ethereum, ethereum-wormhole. Please re-run the query using the exact id name (e.g., 'ethereum').
    Using default coin id 'ethereum' for symbol 'ETH'
    
    More than one coin found with the symbol 'MPH': 88mph, morpher. Please re-run the query using the exact id name (e.g., '88mph').
    Using default coin id '88mph' for symbol 'MPH'
    
    ETH

    MPH
    
    |      | time                          |        open |        high |         low |       close |
    |-----:|:------------------------------|------------:|------------:|------------:|------------:|
    |    0 | 2023-02-01 01:59:52.466870784 | 0.000758451 | 0.000758451 | 0.000750558 | 0.00075113  |
    |    1 | 2023-02-01 03:59:42.460741632 | 0.00075113  | 0.00075113  | 0.000743495 | 0.000743495 |
    |    2 | 2023-02-01 05:59:32.454612736 | 0.000743495 | 0.000746847 | 0.00073726  | 0.000746847 |
    |    3 | 2023-02-01 07:59:22.448483584 | 0.000746847 | 0.000765572 | 0.000746847 | 0.000765223 |
    |    4 | 2023-02-01 09:59:12.442354432 | 0.000765223 | 0.000765223 | 0.000744937 | 0.000744937 |
    |    5 | 2023-02-01 11:59:02.436225280 | 0.000744937 | 0.000753824 | 0.000731569 | 0.000753824 |
    |    6 | 2023-02-01 13:58:52.430096384 | 0.000753824 | 0.000781231 | 0.000753824 | 0.000768873 |
    |    7 | 2023-02-01 15:58:42.423967232 | 0.000768873 | 0.000768873 | 0.000756467 | 0.000763893 |
    |    8 | 2023-02-01 17:58:32.417838080 | 0.000763893 | 0.000786287 | 0.000763893 | 0.000778901 |
    |    9 | 2023-02-01 19:58:22.411708928 | 0.000778901 | 0.000778901 | 0.00076236  | 0.00076236  |
    |   10 | 2023-02-01 21:58:12.405580032 | 0.00076236  | 0.00076236  | 0.000756415 | 0.000757851 |
    |   11 | 2023-02-01 23:58:02.399450880 | 0.000757851 | 0.000785919 | 0.000751208 | 0.000751208 |
    |   12 | 2023-02-02 01:57:52.393321728 | 0.000751208 | 0.000751208 | 0.000711065 | 0.000720285 |
    |   13 | 2023-02-02 03:57:42.387192576 | 0.000720285 | 0.000720285 | 0.00070179  | 0.00070179  |
    |   14 | 2023-02-02 05:57:32.381063424 | 0.00070179  | 0.00070179  | 0.000689444 | 0.000695872 |
    |   15 | 2023-02-02 07:57:22.374934528 | 0.000695872 | 0.000985884 | 0.000695872 | 0.000975815 |
    |   16 | 2023-02-02 09:57:12.368805376 | 0.000975815 | 0.000975815 | 0.000955813 | 0.000957645 |
    |   17 | 2023-02-02 11:57:02.362676224 | 0.000957645 | 0.000966105 | 0.000957645 | 0.000965008 |
    |   18 | 2023-02-02 13:56:52.356547072 | 0.000965008 | 0.000965008 | 0.000961428 | 0.000964199 |
    |   19 | 2023-02-02 15:56:42.350418176 | 0.000964199 | 0.000964199 | 0.00094622  | 0.00094622  |
    |   20 | 2023-02-02 17:56:32.344289024 | 0.00094622  | 0.000949054 | 0.00094442  | 0.000947893 |
    |   21 | 2023-02-02 19:56:22.338159872 | 0.000947893 | 0.000949901 | 0.000940994 | 0.000940994 |
    |   22 | 2023-02-02 21:56:12.332030720 | 0.000940994 | 0.000965696 | 0.000940994 | 0.000965696 |
    ...
    | 1065 | 2023-04-30 17:02:15.939387136 | 0.00115267  | 0.00117158  | 0.00115267  | 0.00116708  |
    | 1066 | 2023-04-30 19:02:05.933258240 | 0.00116708  | 0.00116832  | 0.00115974  | 0.00116832  |
    | 1067 | 2023-04-30 21:01:55.927129088 | 0.00116832  | 0.00119444  | 0.00116832  | 0.00119444  |
    | 1068 | 2023-04-30 23:01:45.920999936 | 0.00119444  | 0.00119976  | 0.00119444  | 0.00119859  |
    
    |      | time                       |       price | time_bin                                                       |
    |-----:|:---------------------------|------------:|:---------------------------------------------------------------|
    |    0 | 2023-02-01 00:00:02.473000 | 0.000758451 | (2023-01-31 21:51:56.369551872, 2023-02-01 01:59:52.466870784] |
    |    1 | 2023-02-01 00:01:10.439000 | 0.000754318 | (2023-01-31 21:51:56.369551872, 2023-02-01 01:59:52.466870784] |
    |    2 | 2023-02-01 01:00:03.845000 | 0.000750558 | (2023-01-31 21:51:56.369551872, 2023-02-01 01:59:52.466870784] |
    |    3 | 2023-02-01 01:01:06.389000 | 0.00075113  | (2023-01-31 21:51:56.369551872, 2023-02-01 01:59:52.466870784] |
    |    4 | 2023-02-01 02:00:12.047000 | 0.000750213 | (2023-02-01 01:59:52.466870784, 2023-02-01 03:59:42.460741632] |
    |    5 | 2023-02-01 02:01:53.331000 | 0.000748746 | (2023-02-01 01:59:52.466870784, 2023-02-01 03:59:42.460741632] |
    |    6 | 2023-02-01 03:00:11.736000 | 0.000749155 | (2023-02-01 01:59:52.466870784, 2023-02-01 03:59:42.460741632] |
    |    7 | 2023-02-01 03:01:07.726000 | 0.000743495 | (2023-02-01 01:59:52.466870784, 2023-02-01 03:59:42.460741632] |
    |    8 | 2023-02-01 04:00:04.401000 | 0.00073726  | (2023-02-01 03:59:42.460741632, 2023-02-01 05:59:32.454612736] |
    |    9 | 2023-02-01 04:03:03.619000 | 0.000737997 | (2023-02-01 03:59:42.460741632, 2023-02-01 05:59:32.454612736] |
    |   10 | 2023-02-01 05:00:08.480000 | 0.000738719 | (2023-02-01 03:59:42.460741632, 2023-02-01 05:59:32.454612736] |
    |   11 | 2023-02-01 05:02:59.455000 | 0.000746847 | (2023-02-01 03:59:42.460741632, 2023-02-01 05:59:32.454612736] |
    |   12 | 2023-02-01 06:00:07.948000 | 0.000755371 | (2023-02-01 05:59:32.454612736, 2023-02-01 07:59:22.448483584] |
    |   13 | 2023-02-01 06:00:10.856000 | 0.000764725 | (2023-02-01 05:59:32.454612736, 2023-02-01 07:59:22.448483584] |
    |   14 | 2023-02-01 07:00:04.152000 | 0.000765572 | (2023-02-01 05:59:32.454612736, 2023-02-01 07:59:22.448483584] |
    |   15 | 2023-02-01 07:00:13.306000 | 0.000765223 | (2023-02-01 05:59:32.454612736, 2023-02-01 07:59:22.448483584] |
    |   16 | 2023-02-01 08:00:10.860000 | 0.000751004 | (2023-02-01 07:59:22.448483584, 2023-02-01 09:59:12.442354432] |
    |   17 | 2023-02-01 08:01:55.165000 | 0.000751619 | (2023-02-01 07:59:22.448483584, 2023-02-01 09:59:12.442354432] |
    |   18 | 2023-02-01 09:00:09.793000 | 0.000753349 | (2023-02-01 07:59:22.448483584, 2023-02-01 09:59:12.442354432] |
    |   19 | 2023-02-01 09:01:29.013000 | 0.000744937 | (2023-02-01 07:59:22.448483584, 2023-02-01 09:59:12.442354432] |
    |   20 | 2023-02-01 10:00:13.964000 | 0.000734716 | (2023-02-01 09:59:12.442354432, 2023-02-01 11:59:02.436225280] |
    |   21 | 2023-02-01 10:02:50.782000 | 0.000733191 | (2023-02-01 09:59:12.442354432, 2023-02-01 11:59:02.436225280] |
    |   22 | 2023-02-01 11:00:07.090000 | 0.000731569 | (2023-02-01 09:59:12.442354432, 2023-02-01 11:59:02.436225280] |
    ...
    | 4275 | 2023-04-30 22:00:54.975000 | 0.00119976  | (2023-04-30 21:01:55.927129088, 2023-04-30 23:01:45.920999936] |
    | 4276 | 2023-04-30 22:01:56.909000 | 0.00119838  | (2023-04-30 21:01:55.927129088, 2023-04-30 23:01:45.920999936] |
    | 4277 | 2023-04-30 23:00:47.149000 | 0.00119806  | (2023-04-30 21:01:55.927129088, 2023-04-30 23:01:45.920999936] |
    | 4278 | 2023-04-30 23:01:45.921000 | 0.00119859  | (2023-04-30 21:01:55.927129088, 2023-04-30 23:01:45.920999936] |
    
    #### CoinGecko Daily Charts
    
    >>> data_source = 'CoinGecko'
    >>> CASH_input = 'ETH'
    >>> RISK_input = 'MPH'
    >>> frequency = 'daily'
    >>> start_date = '2023-02-01 00:00'
    >>> end_date = '2023-05-01 00:00'
    >>> api_key = secret_CoinGecko_api_key
    >>> get_CoinGecko_or_CoinMarketCap_OHLC_and_smooth_price_data(data_source, CASH_input, RISK_input, frequency, start_date, end_date, api_key) 
    
    More than one coin found with the symbol 'ETH': ethereum, ethereum-wormhole. Please re-run the query using the exact id name (e.g., 'ethereum').
    Using default coin id 'ethereum' for symbol 'ETH'
    
    More than one coin found with the symbol 'MPH': 88mph, morpher. Please re-run the query using the exact id name (e.g., '88mph').
    Using default coin id '88mph' for symbol 'MPH'
    
    ETH

    MPH

    |    | time                          |        open |        high |         low |       close |
    |---:|:------------------------------|------------:|------------:|------------:|------------:|
    |  0 | 2023-02-05 01:05:27.272727296 | 0.000760465 | 0.000949723 | 0.000714319 | 0.000875238 |
    |  1 | 2023-02-09 02:10:54.545454592 | 0.000875238 | 0.000875238 | 0.000816775 | 0.000874628 |
    |  2 | 2023-02-13 03:16:21.818181888 | 0.000874628 | 0.00111798  | 0.000874628 | 0.00111798  |
    |  3 | 2023-02-17 04:21:49.090909184 | 0.00111798  | 0.00129724  | 0.00109669  | 0.00128807  |
    |  4 | 2023-02-21 05:27:16.363636480 | 0.00128807  | 0.00141486  | 0.00115628  | 0.00141486  |
    |  5 | 2023-02-25 06:32:43.636363520 | 0.00141486  | 0.00148187  | 0.0013881   | 0.0013881   |
    |  6 | 2023-03-01 07:38:10.909090816 | 0.0013881   | 0.00162363  | 0.0013881   | 0.00161505  |
    |  7 | 2023-03-05 08:43:38.181818112 | 0.00161505  | 0.00161505  | 0.00142112  | 0.00142112  |
    |  8 | 2023-03-09 09:49:05.454545408 | 0.00142112  | 0.00152124  | 0.00142112  | 0.00145902  |
    |  9 | 2023-03-13 10:54:32.727272704 | 0.00145902  | 0.00163706  | 0.00145902  | 0.00149074  |
    | 10 | 2023-03-17 12:00:00           | 0.00149074  | 0.00152971  | 0.00143841  | 0.00152971  |
    | 11 | 2023-03-21 13:05:27.272727296 | 0.00152971  | 0.00152971  | 0.00143649  | 0.00150257  |
    | 12 | 2023-03-25 14:10:54.545454592 | 0.00150257  | 0.00150257  | 0.00136431  | 0.00136431  |
    | 13 | 2023-03-29 15:16:21.818181888 | 0.00136431  | 0.00139441  | 0.0013527   | 0.0013818   |
    | 14 | 2023-04-02 16:21:49.090909184 | 0.0013818   | 0.0013818   | 0.00131334  | 0.00133237  |
    | 15 | 2023-04-06 17:27:16.363636480 | 0.00133237  | 0.00135669  | 0.00132011  | 0.00135669  |
    | 16 | 2023-04-10 18:32:43.636363520 | 0.00135669  | 0.00135906  | 0.00128892  | 0.00128892  |
    | 17 | 2023-04-14 19:38:10.909090816 | 0.00128892  | 0.001311    | 0.00124922  | 0.00124922  |
    | 18 | 2023-04-18 20:43:38.181818112 | 0.00124922  | 0.00124922  | 0.00114577  | 0.00114577  |
    | 19 | 2023-04-22 21:49:05.454545408 | 0.00114577  | 0.00121678  | 0.00114051  | 0.00114051  |
    | 20 | 2023-04-26 22:54:32.727272704 | 0.00114051  | 0.00122952  | 0.00114051  | 0.00122952  |
    | 21 | 2023-05-01 00:00:00           | 0.00122952  | 0.00124863  | 0.00116029  | 0.00116029  |
    
    |    | time                |       price | time_bin                                                       |
    |---:|:--------------------|------------:|:---------------------------------------------------------------|
    |  0 | 2023-02-01 00:00:00 | 0.000760465 | (2023-01-31 21:51:50.400000, 2023-02-05 01:05:27.272727296]    |
    |  1 | 2023-02-02 00:00:00 | 0.000714319 | (2023-01-31 21:51:50.400000, 2023-02-05 01:05:27.272727296]    |
    |  2 | 2023-02-03 00:00:00 | 0.000949723 | (2023-01-31 21:51:50.400000, 2023-02-05 01:05:27.272727296]    |
    |  3 | 2023-02-04 00:00:00 | 0.000934324 | (2023-01-31 21:51:50.400000, 2023-02-05 01:05:27.272727296]    |
    |  4 | 2023-02-05 00:00:00 | 0.000875238 | (2023-01-31 21:51:50.400000, 2023-02-05 01:05:27.272727296]    |
    |  5 | 2023-02-06 00:00:00 | 0.000840831 | (2023-02-05 01:05:27.272727296, 2023-02-09 02:10:54.545454592] |
    |  6 | 2023-02-07 00:00:00 | 0.000816775 | (2023-02-05 01:05:27.272727296, 2023-02-09 02:10:54.545454592] |
    |  7 | 2023-02-08 00:00:00 | 0.000850844 | (2023-02-05 01:05:27.272727296, 2023-02-09 02:10:54.545454592] |
    |  8 | 2023-02-09 00:00:00 | 0.000874628 | (2023-02-05 01:05:27.272727296, 2023-02-09 02:10:54.545454592] |
    |  9 | 2023-02-10 00:00:00 | 0.000903153 | (2023-02-09 02:10:54.545454592, 2023-02-13 03:16:21.818181888] |
    | 10 | 2023-02-11 00:00:00 | 0.000967395 | (2023-02-09 02:10:54.545454592, 2023-02-13 03:16:21.818181888] |
    | 11 | 2023-02-12 00:00:00 | 0.000981023 | (2023-02-09 02:10:54.545454592, 2023-02-13 03:16:21.818181888] |
    | 12 | 2023-02-13 00:00:00 | 0.00111798  | (2023-02-09 02:10:54.545454592, 2023-02-13 03:16:21.818181888] |
    | 13 | 2023-02-14 00:00:00 | 0.00109669  | (2023-02-13 03:16:21.818181888, 2023-02-17 04:21:49.090909184] |
    | 14 | 2023-02-15 00:00:00 | 0.00110451  | (2023-02-13 03:16:21.818181888, 2023-02-17 04:21:49.090909184] |
    | 15 | 2023-02-16 00:00:00 | 0.00129724  | (2023-02-13 03:16:21.818181888, 2023-02-17 04:21:49.090909184] |
    | 16 | 2023-02-17 00:00:00 | 0.00128807  | (2023-02-13 03:16:21.818181888, 2023-02-17 04:21:49.090909184] |
    | 17 | 2023-02-18 00:00:00 | 0.00123126  | (2023-02-17 04:21:49.090909184, 2023-02-21 05:27:16.363636480] |
    | 18 | 2023-02-19 00:00:00 | 0.00126685  | (2023-02-17 04:21:49.090909184, 2023-02-21 05:27:16.363636480] |
    | 19 | 2023-02-20 00:00:00 | 0.00115628  | (2023-02-17 04:21:49.090909184, 2023-02-21 05:27:16.363636480] |
    | 20 | 2023-02-21 00:00:00 | 0.00141486  | (2023-02-17 04:21:49.090909184, 2023-02-21 05:27:16.363636480] |
    | 21 | 2023-02-22 00:00:00 | 0.00146805  | (2023-02-21 05:27:16.363636480, 2023-02-25 06:32:43.636363520] |
    | 22 | 2023-02-23 00:00:00 | 0.00148187  | (2023-02-21 05:27:16.363636480, 2023-02-25 06:32:43.636363520] |
    ...
    | 86 | 2023-04-28 00:00:00 | 0.00122405  | (2023-04-26 22:54:32.727272704, 2023-05-01]                    |
    | 87 | 2023-04-29 00:00:00 | 0.00119558  | (2023-04-26 22:54:32.727272704, 2023-05-01]                    |
    | 88 | 2023-04-30 00:00:00 | 0.0012427   | (2023-04-26 22:54:32.727272704, 2023-05-01]                    |
    | 89 | 2023-05-01 00:00:00 | 0.00116029  | (2023-04-26 22:54:32.727272704, 2023-05-01]                    |

    ### CoinMarketCap
    
    >>> data_source = 'CoinMarketCap'
    >>> CASH_input = 'ETH'
    >>> RISK_input = 'MPH'
    >>> frequency = None
    >>> start_date = '2023-02-01 00:00'
    >>> end_date = '2023-05-01 00:00'
    >>> api_key = secret_CoinMarketCap_api_key
    >>> CASH_symbol, RISK_symbol, OHLC_dataframe, smooth_price_dataframe = get_CoinGecko_or_CoinMarketCap_OHLC_and_smooth_price_data(data_source, CASH_input, RISK_input, frequency, start_date, end_date, api_key)
    
    More than one coin found with the symbol 'MPH': 7217, 7742.
    Please re-run the query using the exact id name (e.g., '7217'). 

    |   coin id | symbol   | website                  | twitter                        | explorer                                                              |
    |----------:|:---------|:-------------------------|:-------------------------------|:----------------------------------------------------------------------|
    |      7217 | MPH      | https://www.morpher.com/ | https://twitter.com/morpher_io | https://etherscan.io/token/0x6369c3dadfc00054a42ba8b2c09c48131dd4aa38 |
    |      7742 | MPH      | https://88mph.app/       | https://twitter.com/88mphapp   | https://etherscan.io/token/0x8888801af4d980682e47f1a9036e589479e835c5 |
    
    Using default coin id '7742' for symbol 'MPH'
    
    ETH
    
    MPH
    
    |     | time                          |        open |        high |         low |       close |
    |----:|:------------------------------|------------:|------------:|------------:|------------:|
    |   0 | 2023-02-02 16:49:08.031488256 | 0.000681177 | 0.000984186 | 0.000681177 | 0.000984186 |
    |   1 | 2023-02-03 09:38:16.062976256 | 0.000984186 | 0.000984186 | 0.000936077 | 0.000955211 |
    |   2 | 2023-02-04 02:27:24.094464512 | 0.000955211 | 0.000961133 | 0.000948204 | 0.000949364 |
    |   3 | 2023-02-04 19:16:32.125952768 | 0.000949364 | 0.000967993 | 0.000949364 | 0.000966423 |
    |   4 | 2023-02-05 12:05:40.157441024 | 0.000966423 | 0.000966423 | 0.000832639 | 0.000842485 |
    |   5 | 2023-02-06 04:54:48.188929024 | 0.000842485 | 0.000877268 | 0.000842485 | 0.00086374  |
    |   6 | 2023-02-06 21:43:56.220417280 | 0.00086374  | 0.000881246 | 0.000841766 | 0.000841766 |
    |   7 | 2023-02-07 14:33:04.251905536 | 0.000841766 | 0.000841766 | 0.000818661 | 0.000830497 |
    |   8 | 2023-02-08 07:22:12.283393792 | 0.000830497 | 0.000852535 | 0.000817874 | 0.000843448 |
    |   9 | 2023-02-09 00:11:20.314881792 | 0.000843448 | 0.000894739 | 0.000843448 | 0.000880199 |
    |  10 | 2023-02-09 17:00:28.346370048 | 0.000880199 | 0.000972693 | 0.000880199 | 0.000972693 |
    |  11 | 2023-02-10 09:49:36.377858304 | 0.000972693 | 0.000972693 | 0.00084662  | 0.000937196 |
    |  12 | 2023-02-11 02:38:44.409346560 | 0.000937196 | 0.00100207  | 0.000937196 | 0.000973427 |
    |  13 | 2023-02-11 19:27:52.440834560 | 0.000973427 | 0.000973427 | 0.000973427 | 0.000973427 |
    |  14 | 2023-02-12 12:17:00.472322816 | 0.000973427 | 0.00101661  | 0.000973427 | 0.0010082   |
    |  15 | 2023-02-13 05:06:08.503811072 | 0.0010082   | 0.00115837  | 0.00100097  | 0.00114114  |
    |  16 | 2023-02-13 21:55:16.535299328 | 0.00114114  | 0.00115501  | 0.00108967  | 0.00113325  |
    |  17 | 2023-02-14 14:44:24.566787328 | 0.00113325  | 0.00113534  | 0.00111573  | 0.00111573  |
    |  18 | 2023-02-15 07:33:32.598275584 | 0.00111573  | 0.00112316  | 0.00107373  | 0.00107373  |
    |  19 | 2023-02-16 00:22:40.629763840 | 0.00107373  | 0.00132111  | 0.00107373  | 0.00132044  |
    |  20 | 2023-02-16 17:11:48.661252096 | 0.00132044  | 0.00132817  | 0.0012522   | 0.0012522   |
    |  21 | 2023-02-17 10:00:56.692740096 | 0.0012522   | 0.00129128  | 0.0012522   | 0.00128735  |
    |  22 | 2023-02-18 02:50:04.724228352 | 0.00128735  | 0.00128735  | 0.00118429  | 0.0012335   |
    ...
    | 123 | 2023-04-29 21:32:35.904535552 | 0.00116183  | 0.00118971  | 0.00116183  | 0.00118971  |
    | 124 | 2023-04-30 14:21:43.936023808 | 0.00118971  | 0.00124158  | 0.00118971  | 0.00123304  |
    | 125 | 2023-05-01 07:10:51.967511808 | 0.00123304  | 0.00123304  | 0.00118593  | 0.00118593  |
    | 126 | 2023-05-01 23:59:59.999000064 | 0.00118593  | 0.00122236  | 0.00118593  | 0.00121647  |
    
    |     | time                       |       price | time_bin                                                       |
    |----:|:---------------------------|------------:|:---------------------------------------------------------------|
    |   0 | 2023-02-02 00:00:00        | 0.000681177 | (2023-02-01 21:51:50.400001024, 2023-02-02 16:49:08.031488256] |
    |   1 | 2023-02-02 00:13:00        | 0.000842155 | (2023-02-01 21:51:50.400001024, 2023-02-02 16:49:08.031488256] |
    |   2 | 2023-02-02 07:34:00        | 0.000984186 | (2023-02-01 21:51:50.400001024, 2023-02-02 16:49:08.031488256] |
    |   3 | 2023-02-02 18:46:00        | 0.000937177 | (2023-02-02 16:49:08.031488256, 2023-02-03 09:38:16.062976256] |
    |   4 | 2023-02-02 23:59:59.999000 | 0.000942237 | (2023-02-02 16:49:08.031488256, 2023-02-03 09:38:16.062976256] |
    |   5 | 2023-02-03 00:00:00        | 0.000942785 | (2023-02-02 16:49:08.031488256, 2023-02-03 09:38:16.062976256] |
    |   6 | 2023-02-03 02:44:00        | 0.000936077 | (2023-02-02 16:49:08.031488256, 2023-02-03 09:38:16.062976256] |
    |   7 | 2023-02-03 03:19:00        | 0.000955211 | (2023-02-02 16:49:08.031488256, 2023-02-03 09:38:16.062976256] |
    |   8 | 2023-02-03 15:27:00        | 0.000961133 | (2023-02-03 09:38:16.062976256, 2023-02-04 02:27:24.094464512] |
    |   9 | 2023-02-03 16:37:00        | 0.000948204 | (2023-02-03 09:38:16.062976256, 2023-02-04 02:27:24.094464512] |
    |  10 | 2023-02-03 23:59:59.999000 | 0.000949148 | (2023-02-03 09:38:16.062976256, 2023-02-04 02:27:24.094464512] |
    |  11 | 2023-02-04 00:00:00        | 0.000949364 | (2023-02-03 09:38:16.062976256, 2023-02-04 02:27:24.094464512] |
    |  12 | 2023-02-04 05:29:00        | 0.000967993 | (2023-02-04 02:27:24.094464512, 2023-02-04 19:16:32.125952768] |
    |  13 | 2023-02-04 13:25:00        | 0.000953011 | (2023-02-04 02:27:24.094464512, 2023-02-04 19:16:32.125952768] |
    |  14 | 2023-02-04 15:01:00        | 0.000966423 | (2023-02-04 02:27:24.094464512, 2023-02-04 19:16:32.125952768] |
    |  15 | 2023-02-04 23:54:00        | 0.000842001 | (2023-02-04 19:16:32.125952768, 2023-02-05 12:05:40.157441024] |
    |  16 | 2023-02-04 23:59:59.999000 | 0.000846748 | (2023-02-04 19:16:32.125952768, 2023-02-05 12:05:40.157441024] |
    |  17 | 2023-02-05 00:00:00        | 0.000847551 | (2023-02-04 19:16:32.125952768, 2023-02-05 12:05:40.157441024] |
    |  18 | 2023-02-05 00:58:00        | 0.000832639 | (2023-02-04 19:16:32.125952768, 2023-02-05 12:05:40.157441024] |
    |  19 | 2023-02-05 09:18:00        | 0.000842485 | (2023-02-04 19:16:32.125952768, 2023-02-05 12:05:40.157441024] |
    |  20 | 2023-02-05 15:06:00        | 0.000867851 | (2023-02-05 12:05:40.157441024, 2023-02-06 04:54:48.188929024] |
    |  21 | 2023-02-05 21:16:00        | 0.000877268 | (2023-02-05 12:05:40.157441024, 2023-02-06 04:54:48.188929024] |
    |  22 | 2023-02-05 23:59:59.999000 | 0.000863668 | (2023-02-05 12:05:40.157441024, 2023-02-06 04:54:48.188929024] |
    ...
    | 505 | 2023-05-01 01:05:00        | 0.00118593  | (2023-04-30 14:21:43.936023808, 2023-05-01 07:10:51.967511808] |
    | 506 | 2023-05-01 20:59:00        | 0.00118766  | (2023-05-01 07:10:51.967511808, 2023-05-01 23:59:59.999000064] |
    | 507 | 2023-05-01 21:00:00        | 0.00122236  | (2023-05-01 07:10:51.967511808, 2023-05-01 23:59:59.999000064] |
    | 508 | 2023-05-01 23:59:59.999000 | 0.00121647  | (2023-05-01 07:10:51.967511808, 2023-05-01 23:59:59.999000064] |
    
    ## Notes:
    - This function retrieves historical price data for two cryptocurrency assets specified by their identifiers from either CoinGecko or CoinMarketCap based on the selected data source.
    - The identifiers can be familiar token ticker symbols (e.g., 'ETH' for Ethereum and 'BTC' for Bitcoin), or API specific IDs (e.g. 'ethereum' or 1027 for CoinGecko, or CoinMarketCap, respectively.)
    - The historical price data is obtained in USD for each asset using the `get_CoinGecko_historical_price_data` function for CoinGecko or `get_CoinMarketCap_historical_price_data` function for CoinMarketCap.
    - The timestamps of both data sets are merged using the `merge_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_timestamps` function.
    - The merged timestamps and historical price data are combined using the `combine_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_dataframes` function.
    - Missing values in the combined price data are interpolated using the `interpolate_CoinGecko_or_CoinMarketCap_historical_data` function.
    - The smoothed price data (RISK over CASH) is obtained using the `process_CoinGecko_or_CoinMarketCap_USD_dataframes` function.
    - The OHLC dataframe with either 4- or 24-hour intervals is created using the `create_CoinGecko_or_CoinMarketCap_OHLC_dataframe` function.
    - The function returns a tuple containing the OHLC dataframe and the smoothed price dataframe.
    """
    if data_source == 'CoinGecko':
        CASH_symbol, CASH_USD_dataframe = get_CoinGecko_historical_price_data(CASH, frequency, start_date, end_date, api_key)
        RISK_symbol, RISK_USD_dataframe = get_CoinGecko_historical_price_data(RISK, frequency, start_date, end_date, api_key)
    elif data_source == 'CoinMarketCap':
        CASH_symbol, CASH_USD_dataframe = get_CoinMarketCap_historical_price_data(CASH, start_date, end_date, api_key)
        RISK_symbol, RISK_USD_dataframe = get_CoinMarketCap_historical_price_data(RISK, start_date, end_date, api_key)
    elif data_source == 'CSV files':
        CASH_symbol, RISK_symbol = CASH, RISK
        CASH_USD_dataframe = get_csv_price_data(csv_filenames[0])
        RISK_USD_dataframe = get_csv_price_data(csv_filenames[1])
    merged_timestamps_series = merge_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_timestamps(CASH_USD_dataframe, RISK_USD_dataframe)
    combined_CASH_USD_and_RISK_USD_dataframes = combine_CoinGecko_or_CoinMarketCap_CASH_USD_and_RISK_USD_dataframes(merged_timestamps_series, CASH_USD_dataframe, RISK_USD_dataframe)
    interpolated_CASH_USD_and_RISK_USD_dataframes = interpolate_CoinGecko_or_CoinMarketCap_historical_data(combined_CASH_USD_and_RISK_USD_dataframes)
    smooth_price_dataframe = process_CoinGecko_or_CoinMarketCap_USD_dataframes(interpolated_CASH_USD_and_RISK_USD_dataframes)
    OHLC_dataframe = create_CoinGecko_or_CoinMarketCap_OHLC_dataframe(smooth_price_dataframe)
    return(CASH_symbol, RISK_symbol, OHLC_dataframe, smooth_price_dataframe)

# # CryptoCompare API call and processing

def build_CryptoCompare_api_url(
    CASH: str,
    RISK: str,
    frequency: str,
    api_key: Union[str, None],
    current_to_timestamp: int
    ) -> str:
    """
    ### Constructs the API URL for CryptoCompare with the given parameters.

    ## Parameters:
    | Parameter Name         | Type               | Description                                       |
    |:-----------------------|:-------------------|:--------------------------------------------------|
    | `CASH`                 | `str`              | The `CASH` asset symbol.                          |
    | `RISK`                 | `str`              | The `RISK` asset symbol.                          |
    | `frequency`            | `str`              | The `frequency` of the data to be requested.      |
    | `api_key`              | `Union[str, None]` | The API key to be used in the request (optional). |
    | `current_to_timestamp` | `int`              | The UNIX timestamp of the last data point.        |

    ## Returns:
    | Return Name       | Type   | Description                                |
    |:------------------|:-------|:-------------------------------------------|
    | `api_url`         | `str`  | The constructed API URL for CryptoCompare. |
    
    ## Dependencies:
    | Dependency Name                | Type   | Description                                              |
    |:-------------------------------|:-------|:---------------------------------------------------------|
    | `CRYPTOCOMPARE_API_BASE_URL`   | `str`  | The base URL for the CryptoCompare API.                  |
    | `CRYPTOCOMPARE_API_DATA_LIMIT` | `int`  | The maximum number of data points that can be requested. |
    """
    global CRYPTOCOMPARE_API_BASE_URL
    global CRYPTOCOMPARE_API_DATA_LIMIT
    api_url = f'{CRYPTOCOMPARE_API_BASE_URL}{frequency}?fsym={RISK}&tsym={CASH}&limit={CRYPTOCOMPARE_API_DATA_LIMIT}&toTs={current_to_timestamp}'
    if api_key:
        api_url += f"&api_key={api_key}"
    return(api_url)

def make_CryptoCompare_api_request(
    api_url: str
    ) -> requests.models.Response:
    """
    ### Sends an API request to the given URL and returns the API response.

    ## Parameters:
    | Parameter Name | Type  | Description                         |
    |:---------------|:------|:------------------------------------|
    | `api_url`      | `str` | The API URL to send the request to. |

    ## Returns:
    | Return Name    | Type                       | Description                                              |
    |:---------------|:---------------------------|:---------------------------------------------------------|
    | `api_response` | `requests.models.Response` | The API response as a `requests.models.Response` object. |

    ## Raises:
    | Exception Name | Condition                               |
    |:---------------|:----------------------------------------|
    | `ValueError`   | If the API response contains an error.  |
    
    ## Notes:
    - This function makes a GET request to the specified API URL. 
    - It checks for errors in the response, and raises a `ValueError` with the error message if an error occurs. 
    - If successful, the response is returned.
    """
    api_response = requests.get(api_url)
    if api_response.json()["Response"] == "Error":
        raise ValueError(api_response.json()["Message"])
    return(api_response)

def process_CryptoCompare_api_data(
    api_response: requests.models.Response
    ) -> Tuple[pd.DataFrame, int]:
    """
    ### Processes the API response data into a formatted pandas `DataFrame` and returns the `DataFrame` and the oldest timestamp.

    ## Parameters:
    | Parameter Name | Type                       | Description       |
    |:---------------|:---------------------------|:------------------|
    | `api_response` | `requests.models.Response` | The API response. |

    ## Returns:
    | Return Name       | Type           | Description                                     |
    |:------------------|:---------------|:------------------------------------------------|
    | `api_dataframe`   | `pd.DataFrame` | The formatted API data as a pandas `DataFrame`. |
    | `oldest_timestamp`| `int`          | The UNIX timestamp of the oldest data point.    |
    
    ## Notes:
    - This function takes an API response from CryptoCompare, and converts the data into a pandas `DataFrame`.
    - It drops unnecessary columns, and sets the index to the `datetime` of each data point. 
    - It also extracts the oldest timestamp from the data.
    """
    oldest_timestamp = api_response.json()["Data"]["Data"][0]["time"]
    api_dataframe = pd.DataFrame(api_response.json()["Data"]["Data"]).drop(columns = ['volumefrom', 'volumeto', 'conversionType', 'conversionSymbol'])
    api_dataframe["time"] = pd.to_datetime(api_dataframe["time"], unit = "s")
    api_dataframe.set_index("time", inplace=True)
    return(api_dataframe, oldest_timestamp)

def get_CryptoCompare_coinlist(
    api_key: Union[str, None] = None
    ) -> list[str]:
    """
    ### Retrieves a list of all coin symbols from CryptoCompare API.

    ## Parameters:
    | Parameter Name | Type               | Description                                          |
    |:---------------|:-------------------|:-----------------------------------------------------|
    | `api_key`      | `Union[str, None]` | The API key to be used in the request (optional).    |

    ## Returns:
    | Return Name    | Type        | Description                             |
    |:---------------|:------------|:----------------------------------------|
    | `coin_symbols` | `list[str]` | The list of all available coin symbols. |

    ## Raises:
    | Exception          | Description                                           |
    |:-------------------|:------------------------------------------------------|
    | `ValueError`       | If the API request fails to fetch the coinlist data.  |
    
    ## Notes:
    - This function fetches a list of all available coin symbols from the CryptoCompare API.
    """
    coinlist_url = "https://min-api.cryptocompare.com/data/all/coinlist"
    if api_key:
        coinlist_url += f"?api_key={api_key}"
    response = requests.get(coinlist_url)
    if response.status_code != 200:
        raise ValueError("Failed to fetch coinlist from CryptoCompare API")
    coin_data = response.json()["Data"]
    coin_symbols = [coin_data[coin]["Symbol"] for coin in coin_data]
    return(coin_symbols)

def validate_CryptoCompare_API_inputs(
    CASH: str,
    RISK: str,
    frequency: str,
    api_key:str
    ) -> None:
    """
    ### Validates the input parameters for CryptoCompare API functions.

    ## Parameters:
    | Parameter Name | Type      | Description                                         |
    |:---------------|:----------|:----------------------------------------------------|
    | `CASH`         | `str`     | The `CASH` asset symbol.                            |
    | `RISK`         | `str`     | The `RISK` asset symbol.                            |
    | `frequency`    | `str`     | The `frequency` of the data to be requested.        |
    | `api_key`      | `str`     | The API key to be used in the request (optional).   |

    ## Returns:
    None
    
    ## Dependencies:
    | Dependency Name              | Type       | Description                                                                                                                                                 |
    |:-----------------------------|:-----------|:------------------------------------------------------------------------------------------------------------------------------------------------------------|
    | `TIME_SUBDIVISIONS`          | `dict`     | A `global` dictionary containing the supported time subdivisions (frequencies) for the function as keys, and the corresponding number of seconds as values. |
    | `get_CryptoCompare_coinlist` | `function` | Retrieves a list of all coin symbols from CryptoCompare API.                                                                                                |

    ## Raises:
    | Exception          | Description                             |
    |:-------------------|:----------------------------------------|
    | `AssertionError`   | If any of the input values are invalid. |
    
    ## Notes:
    - This function checks if the provided CASH, RISK, and frequency values are valid for use with CryptoCompare API functions.
    - It raises an AssertionError if any of the input values are invalid.
    """
    global TIME_SUBDIVISIONS
    coin_symbols = get_CryptoCompare_coinlist(api_key)
    assert frequency in TIME_SUBDIVISIONS, 'ValueError: Invalid frequency. Supported values are "day", "hour", and "minute".'
    assert CASH in coin_symbols, f'Invalid CASH symbol (consider using CoinGecko as the data source). Supported values are {coin_symbols}.'
    assert RISK in coin_symbols, f'Invalid RISK symbol (consider using CoinGecko as the data source). Supported values are {coin_symbols}.'
    return(None)

def get_CryptoCompare_OHLC_price_data(
    CASH: str = "ETH",
    RISK: str = "BTC",
    frequency: str = "day",
    start_date: datetime = datetime.now() - timedelta(days = 100),
    end_date: datetime = datetime.now(),
    api_key: Union[str, None] = None,
    ) -> pd.DataFrame:
    """
    ### Retrieves historical price data from CryptoCompare for the specified cash and risk asset symbols.

    ## Parameters:
    | Parameter Name | Type               | Description                                          |
    |:---------------|:-------------------|:-----------------------------------------------------|
    | `CASH`         | `str`              | The `CASH` asset symbol (default: "ETH").            |
    | `RISK`         | `str`              | The `RISK` asset symbol (default: "BTC").            |
    | `frequency`    | `str`              | The `frequency` of the data (default: "day").        |
    | `start_date`   | `datetime`         | The start date for the data (default: 100 days ago). |
    | `end_date`     | `datetime`         | The end date for the data (default: now).            |
    | `api_key`      | `Union[str, None]` | The API key to be used in the request (optional).    |

    ## Returns:
    | Return Name     | Type           | Description                                                                  |
    |:----------------|:---------------|:-----------------------------------------------------------------------------|
    | `OHLC_dataframe`| `pd.DataFrame` | The 'Open, High, Low, Close' historical price data as a pandas `DataFrame`.  |
    
    ## Dependencies:
    | Dependency Name                     | Type       | Description                                                                                                                      |
    |:------------------------------------|:-----------|:---------------------------------------------------------------------------------------------------------------------------------|
    | `validate_CryptoCompare_API_inputs` | `function` | Validates the input parameters for CryptoCompare API functions; raises an AssertionError if any of the input values are invalid. |
    | `build_CryptoCompare_api_url`       | `function` | Constructs the API URL for CryptoCompare with the given parameters.                                                              |
    | `make_CryptoCompare_api_request`    | `function` | Sends an API request to the given URL and returns the API response.                                                              |
    | `process_CryptoCompare_api_data`    | `function` | Processes the API response data into a formatted pandas `DataFrame` and returns the `DataFrame` and the oldest timestamp.        |

    ## Notes:
    - This function fetches historical price data for the specified cash and risk assets from CryptoCompare's API.
    - The data is filtered based on the given frequency and date range.
    - The function supports only `'day'`, `'hour'`, and `'minute'` frequencies. Providing other values for the frequency parameter will raise a ValueError.
    - CryptoCompare only stores the last 7 days at the `'minute'` resolution.
    - The CryptoCompare API has limits on the number of data points that can be fetched in a single request. 
    - This function handles this by making multiple API requests if needed, to cover the specified date range.
    - The function fetches data for the given date range, including both the start and end dates.
    - If the CryptoCompare API returns an error response, the function will raise a ValueError with the error message provided by the API.
    - The returned DataFrame contains Open, High, Low, and Close (OHLC) price data and is indexed by the timestamp.
    
    ## Examples:
    >>> CASH = "ETH"
    >>> RISK = "BTC"
    >>> frequency = 'minute'
    >>> start_date = convert_input_to_datetime('2023-03-15 00:00')
    >>> end_date = convert_input_to_datetime('2023-03-15 22:00')
    >>> api_key = secret_CryptoCompare_api_key
    >>> get_CryptoCompare_OHLC_price_data(CASH, RISK, frequency, start_date, end_date, api_key)
    
    |      | time                |   high |   low |   open |   close |
    |-----:|:--------------------|-------:|------:|-------:|--------:|
    |    0 | 2023-03-15 00:00:00 |  14.52 | 14.52 |  14.52 |   14.52 |
    |    1 | 2023-03-15 00:01:00 |  14.52 | 14.52 |  14.52 |   14.52 |
    |    2 | 2023-03-15 00:02:00 |  14.52 | 14.52 |  14.52 |   14.52 |
    |    3 | 2023-03-15 00:03:00 |  14.52 | 14.52 |  14.52 |   14.52 |
    |    4 | 2023-03-15 00:04:00 |  14.52 | 14.51 |  14.52 |   14.51 |
    |    5 | 2023-03-15 00:05:00 |  14.51 | 14.51 |  14.51 |   14.51 |
    |    6 | 2023-03-15 00:06:00 |  14.52 | 14.51 |  14.51 |   14.52 |
    |    7 | 2023-03-15 00:07:00 |  14.52 | 14.51 |  14.52 |   14.51 |
    |    8 | 2023-03-15 00:08:00 |  14.51 | 14.51 |  14.51 |   14.51 |
    |    9 | 2023-03-15 00:09:00 |  14.52 | 14.51 |  14.51 |   14.52 |
    |   10 | 2023-03-15 00:10:00 |  14.52 | 14.51 |  14.52 |   14.51 |
    |   11 | 2023-03-15 00:11:00 |  14.51 | 14.51 |  14.51 |   14.51 |
    |   12 | 2023-03-15 00:12:00 |  14.51 | 14.49 |  14.51 |   14.5  |
    |   13 | 2023-03-15 00:13:00 |  14.51 | 14.49 |  14.5  |   14.49 |
    |   14 | 2023-03-15 00:14:00 |  14.49 | 14.48 |  14.49 |   14.49 |
    |   15 | 2023-03-15 00:15:00 |  14.49 | 14.48 |  14.49 |   14.49 |
    |   16 | 2023-03-15 00:16:00 |  14.49 | 14.48 |  14.49 |   14.48 |
    |   17 | 2023-03-15 00:17:00 |  14.48 | 14.48 |  14.48 |   14.48 |
    |   18 | 2023-03-15 00:18:00 |  14.48 | 14.48 |  14.48 |   14.48 |
    |   19 | 2023-03-15 00:19:00 |  14.48 | 14.47 |  14.48 |   14.48 |
    |   20 | 2023-03-15 00:20:00 |  14.48 | 14.47 |  14.48 |   14.48 |
    |   21 | 2023-03-15 00:21:00 |  14.49 | 14.48 |  14.48 |   14.49 |
    |   22 | 2023-03-15 00:22:00 |  14.49 | 14.48 |  14.49 |   14.48 |
    ...
    | 1317 | 2023-03-15 21:57:00 |  14.78 | 14.78 |  14.78 |   14.78 |
    | 1318 | 2023-03-15 21:58:00 |  14.78 | 14.77 |  14.78 |   14.77 |
    | 1319 | 2023-03-15 21:59:00 |  14.77 | 14.77 |  14.77 |   14.77 |
    | 1320 | 2023-03-15 22:00:00 |  14.77 | 14.76 |  14.77 |   14.76 |
    
    >>> CASH = "USDT"
    >>> RISK = "USDC"
    >>> frequency = 'hour'
    >>> start_date = convert_input_to_datetime('2023-03-11 00:00')
    >>> end_date = convert_input_to_datetime('2023-03-11 12:00')
    >>> api_key = secret_CryptoCompare_api_key
    >>> get_CryptoCompare_OHLC_price_data(CASH, RISK, frequency, start_date, end_date, api_key)
    
    |    | time                |   high |    low |   open |   close |
    |---:|:--------------------|-------:|-------:|-------:|--------:|
    |  0 | 2023-03-11 00:00:00 | 0.9962 | 0.9867 | 0.9946 |  0.9886 |
    |  1 | 2023-03-11 01:00:00 | 0.9891 | 0.9785 | 0.9886 |  0.9813 |
    |  2 | 2023-03-11 02:00:00 | 0.9847 | 0.9623 | 0.9813 |  0.9817 |
    |  3 | 2023-03-11 03:00:00 | 0.9821 | 0.93   | 0.9817 |  0.9332 |
    |  4 | 2023-03-11 04:00:00 | 0.9539 | 0.9287 | 0.9332 |  0.946  |
    |  5 | 2023-03-11 05:00:00 | 0.9491 | 0.934  | 0.946  |  0.9345 |
    |  6 | 2023-03-11 06:00:00 | 0.9361 | 0.8876 | 0.9345 |  0.8991 |
    |  7 | 2023-03-11 07:00:00 | 0.9026 | 0.8726 | 0.8991 |  0.8826 |
    |  8 | 2023-03-11 08:00:00 | 0.9265 | 0.8777 | 0.8826 |  0.9229 |
    |  9 | 2023-03-11 09:00:00 | 0.9233 | 0.9022 | 0.9229 |  0.9062 |
    | 10 | 2023-03-11 10:00:00 | 0.9126 | 0.901  | 0.9062 |  0.9022 |
    | 11 | 2023-03-11 11:00:00 | 0.9083 | 0.8981 | 0.9022 |  0.9078 |
    | 12 | 2023-03-11 12:00:00 | 0.9237 | 0.9068 | 0.9078 |  0.9105 |
    """
    validate_CryptoCompare_API_inputs(CASH, RISK, frequency, api_key)
    data_frames = []
    buffer_end_date = end_date + timedelta(hours = 24)
    current_end_date = buffer_end_date
    while current_end_date > start_date:
        current_to_timestamp = int(current_end_date.timestamp())
        current_url = build_CryptoCompare_api_url(CASH, RISK, frequency, api_key, current_to_timestamp)
        api_response = make_CryptoCompare_api_request(current_url)
        api_dataframe, oldest_timestamp = process_CryptoCompare_api_data(api_response)
        data_frames.insert(0, api_dataframe)
        if len(api_response.json()["Data"]["Data"]) == 0:
            break
        current_end_date = datetime.fromtimestamp(oldest_timestamp) - timedelta(seconds=1)
    OHLC_dataframe = pd.concat(data_frames)
    OHLC_dataframe = (OHLC_dataframe[(OHLC_dataframe.index >= start_date) & (OHLC_dataframe.index <= end_date)]).reset_index()
    return(OHLC_dataframe)

def measure_timedelta_for_CryptoCompare_OHLC_dataframe(
    OHLC_dataframe: pd.DataFrame
    ) -> pd.Timedelta:
    """
    ### Measures the time difference between rows of the OHLC `dataframe`. 
    
    ## Parameters:
    | Parameter Name   | Type           | Description                                                                 |
    |:-----------------|:---------------|:----------------------------------------------------------------------------|
    | `OHLC_dataframe` | `pd.DataFrame` | The 'Open, High, Low, Close' historical price data as a pandas `DataFrame`. | 
    
    ## Returns:
    | Return Name   | Type           | Description                                           |
    |:--------------|:---------------|:------------------------------------------------------|
    | `time_delta`  | `pd.Timedelta` | The time difference between rows of `OHLC_dataframe`. |
    """
    time_delta = OHLC_dataframe.iloc[1]['time'] - OHLC_dataframe.iloc[0]['time']
    return(time_delta)

def calculate_offset_for_CryptoCompare_OHLC_dataframe(
    time_delta: pd.Timedelta
    )-> pd.Timedelta:
    """
    ### Measures the time offset for interpolating the OHLC dataframe into discrete time.
    
    ## Parameters:
    | Parameter Name   | Type           | Description                                           |
    |:-----------------|:---------------|:------------------------------------------------------|
    | `time_delta`     | `pd.Timedelta` | The time difference between rows of `OHLC_dataframe`. |
    
    ## Returns:
    | Return Name   | Type           | Description                                                                                                    |
    |:--------------|:---------------|:---------------------------------------------------------------------------------------------------------------|
    | `offset`      | `pd.Timedelta` | The time offset required between each of the open, high, low, and close prices, to distribute the data evenly. |
    """
    offset = time_delta/4
    return(offset)

def process_CryptoCompare_OHLC_dataframe(
    OHLC_dataframe: pd.DataFrame
    ) -> pd.DataFrame:
    """
    ### Reorganises the `OHLC_dataframe` into a single price column.
    
    ## Parameters:
    | Parameter Name   | Type           | Description                                                                 |
    |:-----------------|:---------------|:----------------------------------------------------------------------------|
    | `OHLC_dataframe` | `pd.DataFrame` | The 'Open, High, Low, Close' historical price data as a pandas `DataFrame`. | 
    
    ## Returns:
    | Return Name              | Type           | Description                                                                                                         |
    |:-------------------------|:---------------|:--------------------------------------------------------------------------------------------------------------------|
    | `smooth_price_dataframe` | `pd.DataFrame` | A reorganized version of `OHLC_dataframe`, where all prices are in a single column, and evenly distributed in time. |
    
    ## Dependencies:
    | Dependency name                        | Type       | Description                                                                         |
    |:---------------------------------------|:-----------|:------------------------------------------------------------------------------------|
    | `calculate_offset_for_OHLC_dataframe`  | `function` | Measures the time offset for interpolating the OHLC `DataFrame` into discrete time. |
    | `measure_timedelta_for_OHLC_dataframe` | `function` | Measures the time difference between rows of the OHLC `DataFrame`.                  |
    
    """
    offset = calculate_offset_for_CryptoCompare_OHLC_dataframe(
             measure_timedelta_for_CryptoCompare_OHLC_dataframe(OHLC_dataframe))
    smooth_price_dataframe = pd.DataFrame({
            'time': np.array([timestamp for row in OHLC_dataframe.itertuples(index = False) for timestamp in (row.time + i * offset for i in range(4))]), 
            'price': np.array([price for row in OHLC_dataframe.itertuples(index = False) for price in (row.open, row.high, row.low, row.close)])
            }).set_index('time').reset_index()
    return(smooth_price_dataframe)

def get_CryptoCompare_OHLC_and_smooth_price_data(
    CASH: str = "ETH",
    RISK: str = "BTC",
    frequency: str = "day",
    start_date: datetime = datetime.now() - timedelta(days = 100),
    end_date: datetime = datetime.now(),
    api_key: Union[str, None] = None,
    ) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    ### Retrieves historical price data from CryptoCompare for the specified cash and risk asset symbols, and returns the data in OHLC, and smooth formats.
    
    ## Parameters:
    | Parameter Name | Type               | Description                                          |
    |:---------------|:-------------------|:-----------------------------------------------------|
    | `CASH`         | `str`              | The `CASH` asset symbol (default: "ETH").            |
    | `RISK`         | `str`              | The `RISK` asset symbol (default: "BTC").            |
    | `frequency`    | `str`              | The `frequency` of the data (default: "day").        |
    | `start_date`   | `datetime`         | The start date for the data (default: 100 days ago). |
    | `end_date`     | `datetime`         | The end date for the data (default: now).            |
    | `api_key`      | `Union[str, None]` | The API key to be used in the request (optional).    |
    
    ## Returns:
    | Return Name              | Type                                          | Description                                                                                            |
    |:-------------------------|:----------------------------------------------|:-------------------------------------------------------------------------------------------------------|
    | `CASH_symbol`            | `str`                                         | A string containing the appropriate cryptocurrency ticker symbol for the `CASH` asset (e.g. 'ETH').    |
    | `RISK_symbol`            | `str`                                         | A string containing the appropriate cryptocurrency ticker symbol for the `RISK` asset (e.g. 'BTC').    |
    | `OHLC_dataframe`         | `pd.DataFrame`                                | The 'Open, High, Low, Close' historical price data as a pandas `DataFrame`.                            |
    | `smooth_price_dataframe` | `pd.DataFrame`                                | The 'smooth' historical price data as a pandas `DataFrame`.                                            |
    |                          | `Tuple[str, str, pd.DataFrame, pd.DataFrame]` | A tuple of `CASH_symbol`, `RISK_symbol`, `OHLC_dataframe` and `smooth_price_dataframe`, in that order. |
    
    ## Dependencies:
    | Dependency name                        | Type       | Description                                                                                       |
    |:---------------------------------------|:-----------|:--------------------------------------------------------------------------------------------------|
    | `get_CryptoCompare_OHLC_price_data`    | `function` | Retrieves historical price data from CryptoCompare for the specified cash and risk asset symbols. |
    | `process_CryptoCompare_OHLC_dataframe` | `function` | Reorganises the `OHLC_dataframe` into a single price column.                                      |
    
    ## Notes:
    - The `OHLC_dataframe` contains four (4) prices on a single row, representing the 'open', 'high', 'low', 'close' prices for the timestamp. 
    - The `smooth_price_dataframe` contains the same data as the `OHLC_dataframe`, where each price data point is featured on its own row with a new timestamp. 
    - Therefore, three (3) additional rows are created for each row in `OHLC_dataframe`. 
    - The original 'open' price keeps its original timestamp. 
    - The three (3) new rows are in order of 'high', 'low', 'close'.
    - Each new row receives a new timestamp, such that the time delta between each row is consistent throughout `smooth_price_dataframe`.
    
    ## Example:
    >>> CASH = "USDT"
    >>> RISK = "USDC"
    >>> frequency = 'day'
    >>> start_date = convert_input_to_datetime('2023-03-11 00:00')
    >>> end_date = convert_input_to_datetime('2023-03-12 00:00')
    >>> api_key = secret_api_key
    >>> get_CryptoCompare_OHLC_and_smooth_price_data(CASH, RISK, frequency, start_date, end_date, api_key)
    
    #### CASH_symbol:
    'USDT'
    
    #### RISK_symbol:
    'USDT'
    
    #### OHLC_dataframe:
    
    |    | time                |   high |    low |   open |   close |
    |---:|:--------------------|-------:|-------:|-------:|--------:|
    |  0 | 2023-03-11 00:00:00 | 0.9962 | 0.8726 | 0.9946 |  0.9607 |
    |  1 | 2023-03-12 00:00:00 | 0.9878 | 0.9385 | 0.9607 |  0.985  |
    
    #### smooth_price_dataframe:
    
    |    | time                |   price |
    |---:|:--------------------|--------:|
    |  0 | 2023-03-11 00:00:00 |  0.9946 |
    |  1 | 2023-03-11 06:00:00 |  0.9962 |
    |  2 | 2023-03-11 12:00:00 |  0.8726 |
    |  3 | 2023-03-11 18:00:00 |  0.9607 |
    |  4 | 2023-03-12 00:00:00 |  0.9607 |
    |  5 | 2023-03-12 06:00:00 |  0.9878 |
    |  6 | 2023-03-12 12:00:00 |  0.9385 |
    |  7 | 2023-03-12 18:00:00 |  0.985  |
    """
    CASH_symbol = CASH
    RISK_symbol = RISK
    OHLC_dataframe = get_CryptoCompare_OHLC_price_data(CASH, RISK, frequency, start_date, end_date, api_key)
    smooth_price_dataframe = process_CryptoCompare_OHLC_dataframe(OHLC_dataframe)
    return(CASH_symbol, RISK_symbol, OHLC_dataframe, smooth_price_dataframe)

# # Candlestick Charting Functions

def convert_input_to_datetime(
    input_date: str
    ) -> datetime:
    """
    ### Converts an input date string into a datetime object.

    ## Parameters:
    | Parameter Name | Type   | Description                                                |
    |:---------------|:-------|:-----------------------------------------------------------|
    | `input_date`   | `str`  | The input date string in the format 'YYYY-MM-DD HH:MM'.    |

    ## Returns:
    | Return Name       | Type      | Description                                           |
    |:------------------|:----------|:------------------------------------------------------|
    | `datetime_object` | `datetime`| The input date converted to a `datetime` object.      |
    
    ## Notes:
    - This function takes a date string in the format 'YYYY-MM-DD HH:MM' and converts it into a datetime object.

    """
    date_format = '%Y-%m-%d %H:%M'
    datetime_object = datetime.strptime(input_date, date_format)
    return(datetime_object)

def generate_candlestick_dataframe(
    OHLC_dataframe: pd.DataFrame,  
    target_rows: int = 60
    ) -> pd.DataFrame:
    """
    ### Generates a candlestick dataframe with a target number of rows.

    ## Parameters:
    | Parameter Name   | Type           | Description                                                                   |
    |:-----------------|:---------------|:------------------------------------------------------------------------------|
    | `OHLC_dataframe` | `pd.DataFrame` | The 'Open, High, Low, Close' historical price data as a pandas `DataFrame`.   |
    | `target_rows`    | `int`          | The target number of rows for the output dataframe. (default: 60)             |

    ## Returns:
    | Return Name            | Type           | Description                                                                                                 |
    |:-----------------------|:---------------|:------------------------------------------------------------------------------------------------------------|
    | `candlestick_dataframe`| `pd.DataFrame` | A dataframe with the target number of rows, each row containing the time, high, low, open, and close prices.|

    ## Notes:
    - This function takes an OHLC dataframe and generates a new dataframe with the target number of rows by amalgamating the data.
    - The amalgamation process condenses the rows of the `OHLC_dataframe` into fewer rows in the `candlestick_dataframe`. 
    - It calculates the step size based on the target number of rows and groups the original rows accordingly.
    - For each group, the new row in `candlestick_dataframe` consists of the time from the first row, the highest high, the lowest low, the open from the first row, and the close from the last row.
    - This process effectively reduces the number of rows while preserving the key price data points.
    """
    num_rows = len(OHLC_dataframe)
    if num_rows <= target_rows:
        return(OHLC_dataframe)
    
    step = int(np.ceil(num_rows / target_rows))
    
    candlestick_dataframe = pd.DataFrame([[OHLC_dataframe.iloc[i].time,
                                           OHLC_dataframe.iloc[i:i + step][['high', 'low', 'open', 'close']].max().max(),
                                           OHLC_dataframe.iloc[i:i + step][['high', 'low', 'open', 'close']].min().min(),
                                           OHLC_dataframe.iloc[i].open,
                                           OHLC_dataframe.iloc[min(i + step - 1, num_rows - 1)].close] 
                                        for i in range(0, num_rows, step)], 
                                        columns = ['time', 'high', 'low', 'open', 'close'])
    return(candlestick_dataframe)

def get_candlestick_chart_line_and_fill_configs(
    lines: list[float]
    ) -> List[Dict[str, Union[float, Tuple[int, int], str]]]:
    """
    ### Generates a list of configurations for drawing lines and filling areas on a candlestick chart, appropriate for the specific step of the UI interaction.
    
    ## Parameters:
    | Parameter Name | Type          | Description                                           |
    |:---------------|:--------------|:------------------------------------------------------|
    | `lines`        | `List[float]` | A list of lines to be drawn on the candlestick chart. |
    
    ## Returns:
    | Return Name            | Type                                                  | Description                                                                                                                  |
    |:-----------------------|:------------------------------------------------------|:-----------------------------------------------------------------------------------------------------------------------------|
    | `line_and_fill_configs`| `List[Dict[str, Union[float, Tuple[int, int], str]]]` | A list of dictionaries containing the configurations for drawing and filling lines, such as color, linestyle, and fill area. |
    
    ## Notes:
    - Pink lines and fill for `uniswap_v3` range selection.
    - Blue and orange lines and fill for `carbon` ranges selection.
    - Line style changes from `-` to `--` for the leading edges of the `carbon` ranges during start bid and ask selection. 
    
    ## Example:
    >>> get_candlestick_chart_line_and_fill_configs([100, 110, 120, 130])
    [
        {'line': 100, 'color': '#d68c35ff', 'linestyle': '-', 'fill': (0, 1), 'fill_color': '#35230dff'},
        {'line': 110, 'color': '#d68c35ff', 'linestyle': '-'},
        {'line': 120, 'color': '#10bbd5ff', 'linestyle': '-', 'fill': (2, 3), 'fill_color': '#042f35ff'},
        {'line': 130, 'color': '#10bbd5ff', 'linestyle': '-'}
    ]
    """
    if len(lines) == 2:
        line_and_fill_configs = [
            {'line': lines[0], 'color': '#ff00a7ff', 'linestyle': '-', 'fill': (0, 1), 'fill_color': '#41002aff'},
            {'line': lines[1], 'color': '#ff00a7ff', 'linestyle': '-'}
        ]
    elif len(lines) == 4:
        line_and_fill_configs = [
            {'line': lines[0], 'color': '#d68c35ff', 'linestyle': '-', 'fill': (0, 1), 'fill_color': '#35230dff'},
            {'line': lines[1], 'color': '#d68c35ff', 'linestyle': '-'},
            {'line': lines[2], 'color': '#10bbd5ff', 'linestyle': '-', 'fill': (2, 3), 'fill_color': '#042f35ff'},
            {'line': lines[3], 'color': '#10bbd5ff', 'linestyle': '-'}
        ]
    elif len(lines) == 6:
        line_and_fill_configs = [
            {'line': lines[0], 'color': '#d68c35ff', 'linestyle': '-', 'fill': (0, 1), 'fill_color': '#35230dff'},
            {'line': lines[1], 'color': '#d68c35ff', 'linestyle': '-'},
            {'line': lines[2], 'color': '#d68c35ff', 'linestyle': '--'},
            {'line': lines[3], 'color': '#10bbd5ff', 'linestyle': '--'},
            {'line': lines[4], 'color': '#10bbd5ff', 'linestyle': '-', 'fill': (4, 5), 'fill_color': '#042f35ff'},
            {'line': lines[5], 'color': '#10bbd5ff', 'linestyle': '-'}
        ]
    else:
        raise ValueError("Invalid number of lines.")
    return(line_and_fill_configs)

def get_label_positions(
    lines: List[float], 
    date_range: pd.DatetimeIndex
    ) -> List[float]:
    """
    ### Calculates the horizontal positions for labels based on the order of lines and the given date range.
    
    ## Parameters:
    | Parameter Name | Type                  | Description                                                |
    |:---------------|:----------------------|:-----------------------------------------------------------|
    | `lines`        | `List[float]`         | A list of lines to be drawn on the candlestick chart.      |
    | `date_range`   | `pd.DatetimeIndex`    | The range of dates to be displayed on the x-axis.          |
    
    ## Returns:
    | Return Name          | Type          | Description                                                               |
    |:---------------------|:--------------|:--------------------------------------------------------------------------|
    | `label_positions`    | `List[float]` | A list of calculated horizontal positions for labels based on line order. |
    
    ## Notes:
    - The function calculates label positions in such a way that the labels are staggered to equally distribute the space between them and the edges of the plot area.
    """
    num_labels = len(lines)
    label_positions = []
    for i, line in enumerate(sorted(lines)):
        position = date_range[int(i / (num_labels - 1) * (len(date_range) - 1))]
        label_positions.append(position)
    return(label_positions)

def draw_lines_and_labels_on_candlestick_chart(
    ax: mpl.axes.Axes,
    lines: List[float],
    date_range: pd.DatetimeIndex,
    custom_formatter: CustomFormatter,
    line_and_fill_configs: List[Dict[str, Union[float, Tuple[int, int], str]]]
    ) -> None:
    """
    ### Draws lines, labels, and fills the areas between lines on a candlestick chart based on the provided configurations.
    
    ## Parameters:
    | Parameter Name          | Type                                                  | Description                                                                            |
    |:------------------------|:------------------------------------------------------|:---------------------------------------------------------------------------------------|
    | `ax`                    | `mpl.axes.Axes`                                       | The `matplotlib` axes object representing the candlestick chart.                       |
    | `lines`                 | `List[float]`                                         | A list of lines to be drawn on the candlestick chart.                                  |
    | `date_range`            | `pd.date_range`                                       | The range of dates to be displayed on the x-axis.                                      |
    | `custom_formatter`      | `mpl.ticker.FuncFormatter`                            | The custom formatter to be used for the y-axis tick labels.                            |
    | `line_and_fill_configs` | `List[Dict[str, Union[float, Tuple[int, int], str]]]` | A list of dictionaries containing the configurations for drawing and filling lines.    |
    
    ## Returns:
    None

    ## Dependencies:
    | Dependency Name       | Type       | Description                                                                                         |
    |:----------------------|:-----------|:----------------------------------------------------------------------------------------------------|
    | `get_label_positions` | `function` | Calculates the horizontal positions for labels based on the order of lines and the given date range.|


    ## Notes:
    - The function draws lines, fills areas between lines, and adds labels to the lines based on the provided `line_and_fill_configs`.
    - Labels are added to the lines with their horizontal positions calculated based on the order of lines.
    - The labels are staggered to equally distribute the space between them and the edges of the plot area.
    - The `get_label_positions` function is called internally to calculate the label positions.
    """
    label_positions = get_label_positions(lines, date_range)
    
    for i, config in enumerate(line_and_fill_configs):
        line = config['line']
        color = config['color']
        linestyle = config['linestyle']
        ax.axhline(y = line, linestyle = linestyle, color = color, linewidth = 1)

        if 'fill' in config:
            ax.fill_between(date_range, lines[config['fill'][0]], lines[config['fill'][1]], color = config['fill_color'], alpha = 0.3)

        ax.text(label_positions[i],
                line,
                custom_formatter.format_tick_label(line),
                fontproperties = GT_America_Mono_Regular,
                fontsize = 8,
                color = color,
                ha = "center",
                va = "center").set_path_effects([pe.withStroke(linewidth = 3, foreground = "black")])
    return(None)

def plot_candlestick_chart(
    CASH_symbol: str,
    RISK_symbol: str,
    candlestick_dataframe: pd.DataFrame, 
    title: Union[str, None] = None,
    figsize: Tuple[int, int] = (6, 4),
    dpi: int = 200,
    lines: list[float] = None
    ):
    """
    ### Plots a candlestick chart from the `candlestick_dataframe`.

    ## Parameters:
    | Parameter Name         | Type               | Description                                                                                                  |
    |:-----------------------|:-------------------|:-------------------------------------------------------------------------------------------------------------|
    | `CASH_symbol`          | `str`              | The `CASH` asset symbol.                                                                                     |
    | `RISK_symbol`          | `str`              | The `RISK` asset symbol.                                                                                     |
    | `candlestick_dataframe`| `pd.DataFrame`     | A dataframe with the target number of rows, each row containing the time, high, low, open, and close prices. |
    | `figsize`              | `Tuple[int, int]`  | A tuple of width and height for the figure size. (default: (12, 9))                                          |
    | `dpi`                  | `int`              | The resolution of the figure in dots per inch. (default: 300)                                                |
    
    ## Returns:
    None
    
    ## Dependencies:
    | Dependency Name                               | Type                          | Description                                                                                                                                             |
    |:----------------------------------------------|:------------------------------|:--------------------------------------------------------------------------------------------------------------------------------------------------------|
    | `GT_America_Mono_Regular`                     | `font_manager.FontProperties` | Font for the x-axis and y-axis tick labels. Created as a global variable from the appropriate TrueType font file (`.ttf`)                               |
    | `GT_America_Extended_Medium`                  | `font_manager.FontProperties` | Font for the figure title. Created as a global variable from the appropriate TrueType font file (`.ttf`)                                                |
    | `GT_America_Standard_Light`                   | `font_manager.FontProperties` | Font for the x-axis and y-axis labels. Created as a global variable from the appropriate TrueType font file (`.ttf`)                                    |
    | `CustomFormatter`                             | `class`                       | A custom tick-label formatter for `matplotlib` that allows plots to swith dynamically between scientific, and fixed-point notation as needed.           |
    | `get_candlestick_chart_line_and_fill_configs` | `function`                    | Generates a list of configurations for drawing lines and filling areas on a candlestick chart, appropriate for the specific step of the UI interaction. |
    | `draw_lines_and_labels_on_candlestick_chart`  | `function`                    | Draws lines, labels, and fills the areas between lines on a candlestick chart based on the provided configurations.                                     |
    
    ## Notes:
    - This function generates a candlestick chart using the `mplfinance` library and displays it using `matplotlib`. 
    - The chart shows the time, high, low, open, and close prices of a given asset over a specified time period.
    - The function first sets up the chart styling and the custom tick-label formatter using the `CustomFormatter` class.
    - It then resets the index of the input `candlestick_dataframe` to datetime format, creates a `marketcolors` object using the `make_marketcolors()` function, and sets the style of the chart using the `make_mpf_style()` function.
    - The chart is then created using the `mpf.plot()` function with the input parameters. The figure and axes objects are returned to the function.
    - The function sets the title, x-label, and y-label of the chart using the `suptitle()`, `set_xlabel()`, and `set_ylabel()` functions, respectively. 
    - It also formats the x-axis and y-axis tick labels using the `set_major_formatter()` functions.
    - The function then loops over the x-axis and y-axis tick labels and sets their font properties using the `set_fontproperties()` function.
    - If the `lines` parameter is not `None`, the function generates a list of configurations for drawing lines and filling areas on the chart using the `get_candlestick_chart_line_and_fill_configs()` function. 
    - It then draws lines, labels, and fills the areas between lines on the chart using the `draw_lines_and_labels_on_candlestick_chart()` function.
    - Note that the `get_candlestick_chart_line_and_fill_configs()` and `draw_lines_and_labels_on_candlestick_chart()` functions are custom functions defined in this script to support the specific step of the UI interaction.     
    """
    plt.style.use("dark_background")
    custom_formatter = CustomFormatter()
    candlestick_dataframe = candlestick_dataframe.reset_index(drop = True)
    candlestick_dataframe.index = pd.to_datetime(candlestick_dataframe['time'], format = '%Y-%m-%d %H:%M:%S')

    marketcolors = mpf.make_marketcolors(up = '#00b578ff', 
                                         down = '#d86371ff', 
                                         inherit = True)
    custom_style = mpf.make_mpf_style(base_mpf_style = 'nightclouds', 
                                      marketcolors = marketcolors, 
                                      facecolor = '#000000')
    fig, axes = mpf.plot(candlestick_dataframe, 
                         type = 'candle', 
                         figsize = figsize,
                         xrotation = 45, 
                         show_nontrading = True, # This stops the dates resetting to 1970 (!?)
                         returnfig = True, 
                         style = custom_style)
    ax = axes[0]
    fig.set_dpi(dpi)
    if title is None:
        title = f'{RISK_symbol}/{CASH_symbol} price chart'
    fig.suptitle(title, fontproperties = GT_America_Extended_Medium, fontsize = 16)
    ax.set_ylabel(f'price of {RISK_symbol} ({CASH_symbol} per {RISK_symbol})', fontproperties = GT_America_Standard_Light, fontsize = 12)
    ax.set_xlabel('date', fontproperties = GT_America_Standard_Light, fontsize = 12)
    ax.yaxis.set_major_formatter(custom_formatter)
    ax.xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m-%d'))
    ax.xaxis.set_major_locator(MaxNLocator(integer = True, prune = 'both', nbins = 10))
    
    for label in ax.xaxis.get_ticklabels() + ax.yaxis.get_ticklabels():
        label.set_fontproperties(GT_America_Mono_Regular)
        label.set_fontsize(6)
        
    freq = 'D' if (candlestick_dataframe.index.max() - candlestick_dataframe.index.min()) >= pd.Timedelta(days=14) else 'T'
    date_range = pd.date_range(candlestick_dataframe.index.min(), candlestick_dataframe.index.max(), freq=freq)
        
    if lines is not None:
        line_and_fill_configs = get_candlestick_chart_line_and_fill_configs(lines)
        draw_lines_and_labels_on_candlestick_chart(ax, lines, date_range, custom_formatter, line_and_fill_configs)
    return(fig)

# # User input functions

def make_and_record_filenames(
    CASH: str, 
    RISK: str, 
    start_date: str, 
    end_date: str
    ) -> str:
    """
    ### Constructs and records filenames based on the token pair symbols and date range.

    ## Parameters:
    | Parameter Name | Type    | Description                                         |
    |:---------------|:--------|:----------------------------------------------------|
    | `CASH`         | `str`   | The `CASH` (or 'quote') asset in the trading pair.  |
    | `RISK`         | `str`   | The `RISK` (or 'base') asset in the trading pair.   |
    | `start_date`   | `str`   | The start date for the data retrieval.              |
    | `end_date`     | `str`   | The end date for the data retrieval.                |

    ## Returns:
    | Return Name     | Type    | Description                            |
    |:----------------|:--------|:---------------------------------------|
    | `base_filename` | `str`   | The base filename for storing the data.|

    ## Dependencies:
    | Dependency Name      | Type     | Description                                               |
    |:---------------------|:---------|:----------------------------------------------------------|
    | `start_information`  | `dict`   | A `global` dictionary holding the simulation conditions.  |
    | `datetime.strptime`  | `method` | Parses a string into a `datetime` object.                 |

    ## Notes:
    - This function constructs and records the filenames based on the token pair symbols and date range, and updates the global `start_information` dictionary.
    """
    global start_information
    try:
        start_date_UNIX = int(datetime.strptime(start_date, '%Y-%m-%d %H:%M').timestamp())
        end_date_UNIX = int(datetime.strptime(end_date, '%Y-%m-%d %H:%M').timestamp())
    except ValueError:
        start_date_UNIX = end_date_UNIX = 'from_CSV'
    base_filename = f'RISK={RISK}_CASH={CASH}_startUNIX={start_date_UNIX}_endUNIX={end_date_UNIX}'
    start_information['base filename'] = [base_filename]
    return(base_filename)

def record_token_pair(
    CASH: str, 
    RISK: str
    ) -> None:
    """
    ### Records the token pair symbols.

    ## Parameters:
    | Parameter Name | Type    | Description                                         |
    |:---------------|:--------|:----------------------------------------------------|
    | `CASH`         | `str`   | The `CASH` (or 'quote') asset in the trading pair.  |
    | `RISK`         | `str`   | The `RISK` (or 'base') asset in the trading pair.   |

    ## Returns:
    None

    ## Dependencies:
    | Dependency Name      | Type     | Description                                             |
    |:---------------------|:---------|:--------------------------------------------------------|
    | `start_information`  | `dict`   | A `global` dictionary holding the simulation conditions.|

    ## Notes:
    - This function updates the global `start_information` dictionary with the token pair symbols.
    """
    global start_information
    start_information['token pair'] = {
        'CASH' : CASH,
        'RISK' : RISK
        }
    return(None)

def record_starting_portfolio_valuation(
    starting_portfolio_valuation: str
    ) -> None:
    """
    ### Records the starting portfolio valuation.

    ## Parameters:
    | Parameter Name                 | Type    | Description                         |
    |:-------------------------------|:--------|:------------------------------------|
    | `starting_portfolio_valuation` | `str`   | The starting portfolio valuation.   |

    ## Returns:
    None

    ## Dependencies:
    | Dependency Name      | Type     | Description                                             |
    |:---------------------|:---------|:--------------------------------------------------------|
    | `start_information`  | `dict`   | A `global` dictionary holding the simulation conditions.|

    ## Notes:
    - This function updates the global `start_information` dictionary with the starting portfolio valuation.
    """
    global start_information
    start_information['starting portfolio valuation'] = [Decimal(starting_portfolio_valuation)]
    return(None)

def copy_dates_and_prices_from_smooth_price_dataframe(
    smooth_price_dataframe: pd.DataFrame
    ) -> None:
    """
    ### Copies dates and prices from the smooth price `DataFrame`.

    ## Parameters:
    | Parameter Name          | Type            | Description                   |
    |:------------------------|:----------------|:------------------------------|
    | `smooth_price_dataframe`| `pd.DataFrame`  | The smooth price `DataFrame`. |

    ## Returns:
    None

    ## Dependencies:
    | Dependency Name      | Type     | Description                                           |
    |:---------------------|:---------|:------------------------------------------------------|
    | `start_information`  | `dict`   | A global dictionary holding the simulation conditions.|

    ## Notes:
    - This function updates the global `start_information` dictionary with dates and prices from the smooth price `DataFrame`.
    """
    global start_information
    start_information['price chart'] = [Decimal(str(price)) for price in smooth_price_dataframe['price']]
    start_information['price chart dates'] = smooth_price_dataframe['time'].tolist()
    return(None)

def verify_api_key(
    data_source: str, 
    api_key: Union[str, None]
    ) -> None:
    """
    ### Verifies whether an API key is provided for a given data source.
    
    ## Parameters:
    | Parameter Name      | Type  | Description                                         |
    |:--------------------|:------|:----------------------------------------------------|
    | `data_source`       | `str` | The name of the data source (e.g., 'CryptoCompare').|
    | `api_key`           | `str` | The API key for the specified data source.          |
    
    ## Returns:
    None

    ## Notes:
    - This function verifies if an API key is provided for the given data source. 
    - If the API key is not provided, it will print an error message and the URL to obtain the key.
    - The function handles three data sources: 'CryptoCompare', 'CoinMarketCap', and 'CoinGecko'.
    """
    api_info = {
        'CryptoCompare': "https://min-api.cryptocompare.com/pricing",
        'CoinMarketCap': "https://coinmarketcap.com/api/pricing/",
        'CoinGecko': "https://www.coingecko.com/en/api/pricing",
    }

    if api_key is None and data_source in api_info:
        print(f"This resource will attempt to use the public API key from {data_source}, which may limit data availability.\n"
              f"It is recommended that a paid API key from {data_source} be used.")
        print(f"To view the available pricing plans, please visit {api_info[data_source]}")
        print("\n")
    return(None)

def get_and_record_price_data_from_user_inputs(
    data_source : str = 'CoinGecko',
    CASH_input: str = "ETH",
    RISK_input: str = "BTC",
    frequency: str = "day",
    start_date: Union[datetime, None] = None,
    end_date: Union[datetime, None] = None,
    api_key: Union[str, None] = None,
    csv_filenames: Union[Tuple[str, str], None] = None,
    base_filename: Union[str, None] = None,
    ) -> pd.DataFrame:
    """
    ### Retrieves and records price data based on user inputs.

    ## Parameters:
    | Parameter Name      | Type  | Description                                         |
    |:--------------------|:------|:----------------------------------------------------|
    | `CASH_input`        | `str` | The `CASH` (or 'quote') asset in the trading pair.  |
    | `RISK_input`        | `str` | The `RISK` (or 'base') asset in the trading pair.   |
    | `frequency`         | `str` | The data frequency (e.g., 'daily', 'hourly').       |
    | `start_date`        | `str` | The start date for the data retrieval.              |
    | `end_date`          | `str` | The end date for the data retrieval.                |
    | `api_key`           | `str` | The CryptoCompare API key for accessing the data.   |
    | `data_source`       | `str` | Etiher 'CryptoCompare' or 'CoinGecko'.              |
    | `base_filename`     | `str` | The base filename for storing the data.             |

    ## Returns:
    | Return Name             | Type           | Description                                                                                                         |
    |:------------------------|:---------------|:--------------------------------------------------------------------------------------------------------------------|
    | `CASH_symbol`           | `str`          | A string containing the appropriate cryptocurrency ticker symbol for the `CASH` asset (e.g. 'ETH').                 |
    | `RISK_symbol`           | `str`          | A string containing the appropriate cryptocurrency ticker symbol for the `RISK` asset (e.g. 'BTC').                 |
    | `candlestick_dataframe` | `pd.DataFrame` | A reorganized version of `OHLC_dataframe`, where all prices are in a single column, and evenly distributed in time. |
    
    ## Return Dataframe:
    | Column Name   | Series Description                                                            | Series Type                                |
    |:--------------|:------------------------------------------------------------------------------|:-------------------------------------------|
    | time          | A series of timestamps for each price in the 'price' column.                  | `pandas._libs.tslibs.timestamps.Timestamp` |
    | price         | A series of prices (`numpy.float64`) for each timestamp in the 'time' column. | `numpy.float64`                            |
    
    ## Dependencies:
    | Dependency name                                     | Type       | Description                                                                                                                                             |
    |:----------------------------------------------------|:-----------|:--------------------------------------------------------------------------------------------------------------------------------------------------------|
    | `convert_input_to_datetime`                         | `function` | Converts an input date string into a `datetime` object.                                                                                                 |
    | `get_CryptoCompare_OHLC_and_smooth_price_data`      | `function` | Retrieves historical price data from CryptoCompare for the specified `CASH` and `RISK` asset symbols, and returns the data in OHLC, and smooth formats. |
    | `copy_dates_and_prices_from_smooth_price_dataframe` | `function` | Copies dates and prices from the smooth price `DataFrame`.                                                                                              |
    | `generate_candlestick_dataframe`                    | `function` | Generates a candlestick `DataFrame` with a target number of rows.                                                                                       |
    | `verify_api_key`                                    | `function` | Verifies whether an API key is provided for a given data source.                                                                                        |

    ## Notes:
    - This function retrieves and records the price data based on user inputs and stores the data in pickle files.
    - The `data_source` parameter is used to select between 'CryptoCompare' and 'CoinGecko' as the source for the price data. 
    - Depending on the chosen data source, the function will call the appropriate function (`get_CryptoCompare_OHLC_and_smooth_price_data` or `get_CoinGecko_OHLC_and_smooth_price_data`) to retrieve the historical price data.
    """
    verify_api_key(data_source, api_key)
    if data_source == 'CryptoCompare':
        start_date_datetime = convert_input_to_datetime(start_date)
        end_date_datetime = convert_input_to_datetime(end_date)
        CASH_symbol, RISK_symbol, OHLC_dataframe, smooth_price_dataframe = get_CryptoCompare_OHLC_and_smooth_price_data(CASH_input, RISK_input, frequency, start_date_datetime, end_date_datetime, api_key)
    elif data_source == 'CoinGecko' or data_source == 'CoinMarketCap' or data_source == 'CSV files':
        CASH_symbol, RISK_symbol, OHLC_dataframe, smooth_price_dataframe = get_CoinGecko_or_CoinMarketCap_OHLC_and_smooth_price_data(data_source, CASH_input, RISK_input, frequency, start_date, end_date, api_key, csv_filenames)
    copy_dates_and_prices_from_smooth_price_dataframe(smooth_price_dataframe)
    candlestick_dataframe = generate_candlestick_dataframe(OHLC_dataframe, target_rows = 50)
    for name, dataframe in (('OHLC_dataframe', OHLC_dataframe), 
                            ('smooth_price_dataframe', smooth_price_dataframe), 
                            ('candlestick_dataframe', candlestick_dataframe)):
        pd.to_pickle(dataframe, f'{base_filename}_{name}.pickle')
    return(CASH_symbol, RISK_symbol, candlestick_dataframe)

def record_uniswap_v3_range(
    line_1: float, 
    line_2: float
    ) -> list[float, float]:
    """
    ### Records the Uniswap V3 range boundaries.

    ## Parameters:
    | Parameter Name | Type    | Description                |
    |:---------------|:--------|:---------------------------|
    | `line_1`       | `float` | The first price boundary.  |
    | `line_2`       | `float` | The second price boundary. |

    ## Returns:
    - A list of sorted range boundaries.

    ## Dependencies:
    | Dependency Name      | Type     | Description                                           |
    |:---------------------|:---------|:------------------------------------------------------|
    | `start_information`  | `dict`   | A global dictionary holding the simulation conditions.|

    ## Notes:
    - This function updates the global `start_information` dictionary with the Uniswap V3 range boundaries.
    - The values are arranged in descending order, before updating the `start_information` dictionary.
    - Therefore they appear in the order of: upper price boundary, lower price boundary.
    """
    global start_information
    uniswap_v3_range_boundaries = sorted([line_1, line_2], reverse = True)
    start_information['uniswap range boundaries'] = [Decimal(str(i)) for i in uniswap_v3_range_boundaries]
    return(uniswap_v3_range_boundaries)

def record_carbon_ranges(
    line_1: float, 
    line_2: float,
    line_3: float, 
    line_4: float
    ) -> list[float, float, float, float]:
    """
    ### Records the carbon range boundaries.

    ## Parameters:
    | Parameter Name | Type    | Description                |
    |:---------------|:--------|:---------------------------|
    | `line_1`       | `float` | The first price boundary.  |
    | `line_2`       | `float` | The second price boundary. |
    | `line_3`       | `float` | The third price boundary.  |
    | `line_4`       | `float` | The fourth price boundary. |

    ## Returns:
    - A list of sorted range boundaries.

    ## Dependencies:
    | Dependency Name      | Type     | Description                                             |
    |:---------------------|:---------|:--------------------------------------------------------|
    | `start_information`  | `dict`   | A `global` dictionary holding the simulation conditions.|

    ## Notes:
    - This function updates the global `start_information` dictionary with the carbon range boundaries.
    - The values are arranged in descending order, before updating the `start_information` dictionary.
    - Therefore, they appear in the order of: maximum ask price, minimum ask price, maximum bid price, minimum bid price.
    """
    global start_information
    carbon_range_boundaries = sorted([line_1, line_2, line_3, line_4], reverse = True)
    start_information['carbon order boundaries'] = [Decimal(str(i)) for i in carbon_range_boundaries] 
    return(carbon_range_boundaries)

def record_carbon_start_bid_and_ask(
    line_2: float, 
    line_5: float
    ) -> None:
    """
    ### Records the carbon start bid and ask prices.

    ## Parameters:
    | Parameter Name | Type    | Description                  |
    |:---------------|:--------|:-----------------------------|
    | `line_2`       | `float` | The beginning ask value.     |
    | `line_5`       | `float` | The beginning bid value.     |

    ## Returns:
    None

    ## Dependencies:
    | Dependency Name      | Type     | Description                                             |
    |:---------------------|:---------|:--------------------------------------------------------|
    | `start_information`  | `dict`   | A `global` dictionary holding the simulation conditions.|

    ## Notes:
    - This function updates the global `start_information` dictionary with the carbon start bid and ask prices.
    """
    global start_information
    carbon_start_bid_and_ask = sorted([line_2, line_5], reverse = True)
    start_information['carbon starting prices'] = [Decimal(str(i)) for i in carbon_start_bid_and_ask] 
    return(None)

def record_carbon_order_weights(
    risk_percent: float, 
    cash_percent: float
    ) -> None:
    """
    ### Records the carbon order weights.

    ## Parameters:
    | Parameter Name | Type    | Description                                   |
    |:---------------|:--------|:----------------------------------------------|
    | `risk_percent` | `float` | The percentage of `RISK` in the carbon order. |
    | `cash_percent` | `float` | The percentage of `CASH` in the carbon order. |

    ## Returns:
    None

    ## Dependencies:
    | Dependency Name      | Type     | Description                                             |
    |:---------------------|:---------|:--------------------------------------------------------|
    | `start_information`  | `dict`   | A `global` dictionary holding the simulation conditions.|

    ## Notes:
    - This function updates the global `start_information` dictionary with the carbon order weights.
    """
    global start_information
    carbon_order_weights = [risk_percent, cash_percent]
    start_information['carbon order weights'] = [Decimal(str(i)) for i in carbon_order_weights]
    return(None)

def record_protocol_fees(
    fee_setting: float
    ) -> None:
    """
    ### Records the protocol fees.

    ## Parameters:
    | Parameter Name | Type    | Description          |
    |:---------------|:--------|:---------------------|
    | `fee_setting`  | `float` | The protocol fees.   |

    ## Returns:
    None

    ## Dependencies:
    | Dependency Name      | Type     | Description                                             |
    |:---------------------|:---------|:--------------------------------------------------------|
    | `start_information`  | `dict`   | A `global` dictionary holding the simulation conditions.|

    ## Notes:
    - This function updates the global `start_information` dictionary with the protocol fees.
    """
    global start_information
    start_information['protocol fees'] = [Decimal(str(fee_setting))]
    return(None)

def record_simulations_and_plot_selection(
    simulations_and_plot_selection: list[Union[str, bool]]
    ) -> None:
    """
    ### Records the user-defined simulations and plot selections.

    ## Parameters:
    | Parameter Name                   | Type                     | Description                                                       |
    |:---------------------------------|:-------------------------|:------------------------------------------------------------------|
    | `simulations_and_plot_selection` | `list[Union[str, bool]]` | A list containing the user-selected simulations and plot options. |

    ## Returns:
    None

    ## Dependencies:
    | Dependency Name      | Type     | Description                                             |
    |:---------------------|:---------|:--------------------------------------------------------|
    | `start_information`  | `dict`   | A `global` dictionary holding the simulation conditions.|

    ## Notes:
    - This function updates the global `start_information` dictionary with the user-selected simulations and plot options.
    """
    global start_information
    start_information['protocol list'] = simulations_and_plot_selection[:-4]
    start_information['depth chart animation boolean'] = simulations_and_plot_selection[-4]
    start_information['invariant curve animation boolean'] = simulations_and_plot_selection[-3]
    start_information['token balance cash basis animation boolean'] = simulations_and_plot_selection[-2]
    start_information['summary boolean'] = simulations_and_plot_selection[-1]
    return(None)

def write_simulation_conditions_binary(
    ) -> None:
    """
    ### Writes the simulation conditions to a binary file.
    
    ## Parameters:
    None

    ## Returns:
    None

    ## Dependencies:
    | Dependency Name      | Type     | Description                                            |
    |:---------------------|:---------|:-------------------------------------------------------|
    | `start_information`  | `dict`   | A global dictionary holding the simulation conditions. |

    ## Notes:
    - This function writes the simulation conditions stored in the global `start_information` dictionary to a binary file with a `.pickle` extension.
    """
    global start_information
    base_filename = start_information['base filename'][-1]
    simulation_conditions_filename = f'SIMULATION_CONDITIONS_{base_filename}.pickle'
    with open(simulation_conditions_filename, 'wb') as file:
        pickle.dump(start_information, file)
    return(None)

def choose_simulations_and_plots(
    ) -> None:
    """
    ### Prompts the user to choose the simulations and plots for the trading analysis.
    
    ## Parameters:
    None

    ## Returns:
    None

    ## Notes:
    - This function prompts the user to select the simulations and plots for the trading analysis using a series of checkboxes.
    - The user clicks the "OK" button to proceed with the selected simulations and plots.
    """
    description_style = {'description_width': 'initial', 'font-size': '16px'}
    simulate_carbon = Checkbox(value = False, description = 'Simulate Carbon', style = description_style)
    simulate_uniswap_v2 = Checkbox(value = False, description = 'Simulate Uniswap V2', style = description_style)
    simulate_uniswap_v3 = Checkbox(value = False, description = 'Simulate Uniswap V3', style = description_style)
    save_depth_chart_animations = Checkbox(value = False, description = 'Save Depth Chart Animations', style = description_style)
    save_invariant_curve_animations = Checkbox(value = False, description = 'Save Invariant Curve Animations', style = description_style)
    save_token_balance_cash_basis_animations = Checkbox(value = False, description = 'Save Token Balance (CASH basis) Animations', style = description_style)
    save_summary_plot = Checkbox(value = False, description = 'Save Summary Plot', style = description_style)

    def on_button_click(
        button: widgets.Button
        ) -> None:
        """
        ### Processes the user-defined simulations and plots and proceeds with the trading analysis.

        ## Parameters:
        | Parameter Name | Type             | Description                           |
        |:---------------|:-----------------|:--------------------------------------|
        | `button`       | `widgets.Button` | The "OK" button widget instance.      |

        ## Returns:
        None

        ## Dependencies:
        | Dependency Name                         | Type       | Description                                               |
        |:----------------------------------------|:-----------|:----------------------------------------------------------|
        | `record_simulations_and_plot_selection` | `function` | Records the user-defined simulations and plot selections. |
        | `write_simulation_conditions_binary`    | `function` | Writes the simulation conditions to a binary file.        |
        | `run_simulation`                        | `function` | Runs the trading simulation with the selected conditions. |

        ## Notes:
        - This function is called when the user clicks the "OK" button after selecting the simulations and plots using the checkboxes.
        - It processes the user-defined simulations and plot selections, records them, writes the simulation conditions to a binary file, and calls the `run_simulation` function to run the trading simulation with the selected conditions.
        """

        simulations_and_plot_selection = []
        if simulate_carbon.value:
            simulations_and_plot_selection.append('carbon')
        if simulate_uniswap_v2.value:
            simulations_and_plot_selection.append('uniswap_v2')
        if simulate_uniswap_v3.value:
            simulations_and_plot_selection.append('uniswap_v3')
        simulations_and_plot_selection.append(save_depth_chart_animations.value)
        simulations_and_plot_selection.append(save_invariant_curve_animations.value)
        simulations_and_plot_selection.append(save_token_balance_cash_basis_animations.value)
        simulations_and_plot_selection.append(save_summary_plot.value)
        record_simulations_and_plot_selection(simulations_and_plot_selection)
        write_simulation_conditions_binary()
        print("Thank you. Your simulation is beginning now.")
        the_simulation()
        with output:
            output.clear_output()
        return None

    button = Button(description = 'OK')
    button.on_click(on_button_click)
    checkboxes = VBox([simulate_carbon, simulate_uniswap_v2, simulate_uniswap_v3, save_depth_chart_animations, save_invariant_curve_animations, save_token_balance_cash_basis_animations, save_summary_plot])
    display_controls = VBox([checkboxes, button])
    output = Output()
    with output:
        display(display_controls)
    display(output)
    return(None)

def choose_protocol_fees(
    figsize: Tuple[int, int] = (6, 4),
    dpi: int = 200
    ) -> None:
    """
    ### Prompts the user to choose the protocol fees for the trading simulation.

    ## Parameters:
    | Parameter Name | Type              | Description                                   |
    |:---------------|:------------------|:----------------------------------------------|
    | `figsize`      | `Tuple[int, int]` | Figure size (width, height) in inches.        |
    | `dpi`          | `int`             | The resolution of the plot in dots per inch.  |

    ## Returns:
    None

    ## Notes:
    - This function prompts the user to choose the protocol fees for the trading simulation using an interactive odometer widget.
    - The user clicks the "OK" button to proceed with the selected protocol fees.
    """
    plt.style.use('dark_background')

    def display_odometer(
        log_value: float
        ) -> None:
        """
        ### Displays an interactive odometer widget for the user to choose the protocol fees.

        ## Parameters:
        | Parameter Name | Type   | Description                                           |
        |:---------------|:-------|:------------------------------------------------------|
        | `log_value`    | `float`| The logarithmic value of the protocol fees.           |

        ## Returns:
        None

        ## Notes:
        - This function displays an interactive odometer widget for the user to choose the protocol fees based on the given `log_value`.
        - It updates the displayed odometer widget when the user moves the slider.
        """
        value = 10**log_value
        min_value, max_value = (0.00001, 0.01)
        min_angle, max_angle = (-60, 60)
        angle = min_angle + (math.log10(value/min_value)/math.log10(max_value/min_value))*(max_angle - min_angle)
        needle_length = 1
        cmap = plt.colormaps.get_cmap('Reds')
        geometric_mean = (min_value*max_value)**(1/2)
        distance_from_geometric_mean = abs(math.log10(value/geometric_mean))
        max_distance_from_geometric_mean = max(math.log10(min_value/geometric_mean), math.log10(max_value/geometric_mean))
        normalized_value = distance_from_geometric_mean/max_distance_from_geometric_mean
        needle_color = cmap(normalized_value)
        
        plt.figure(figsize = figsize, dpi = dpi)
        ax = plt.subplot(1, 1, 1, polar = True)
        ax.plot([0, np.deg2rad(angle)], [0, needle_length], color = needle_color, linewidth = 2)
        ax.set_yticklabels([])
        ax.xaxis.set_major_locator(FixedLocator(np.linspace(0, 2 * np.pi, 0, endpoint = False)))
        ax.xaxis.grid(False)
        ax.xaxis.set_major_formatter(FixedFormatter(['', '', '', '', '', '', '', '']))
        ax.set_thetamin(-60) 
        ax.set_thetamax(60)   
        ax.set_rticks([])  
        ax.set_rlabel_position(-90)
        ax.set_title('Choose Protocol Fees', fontproperties = GT_America_Extended_Medium, color = 'white', pad = 20)
        text_basis_points = f"{value*10000:.3f} bps"
        text_deciml = f"{value:.5f}"
        text_percentage = f"{value*100:.3f}%"
        ax.annotate(text_basis_points, xy = (0.05, 0.95), xycoords = 'axes fraction', color = 'white', fontproperties = GT_America_Mono_Regular, verticalalignment = 'top')
        ax.annotate(text_deciml, xy = (0.05, 0.85), xycoords = 'axes fraction', color = 'white', fontproperties = GT_America_Mono_Regular, verticalalignment = 'top')
        ax.annotate(text_percentage, xy = (0.05, 0.75), xycoords = 'axes fraction', color = 'white', fontproperties = GT_America_Mono_Regular, verticalalignment = 'top')
        plt.show()
        return(None)
        
    def on_button_click(
        button: widgets.Button
        ) -> None:
        """
        ### Processes the user-defined protocol fees and proceeds with the trading simulation.

        ## Parameters:
        | Parameter Name | Type             | Description                       |
        |:---------------|:-----------------|:----------------------------------|
        | `button`       | `widgets.Button` | The "OK" button widget instance.  |

        ## Returns:
        None

        ## Dependencies:
        | Dependency Name                | Type       | Description                                                        |
        |:-------------------------------|:-----------|:-------------------------------------------------------------------|
        | `record_protocol_fees`         | `function` | Records the user-defined protocol fees.                            |
        | `choose_simulations_and_plots` | `function` | Prompts the user to choose simulations and plots for the analysis. |

        ## Notes:
        - This function is called when the user clicks the "OK" button after selecting the protocol fees using the interactive odometer widget.
        - It processes the user-defined protocol fees, records them, and calls the `choose_simulations_and_plots` function to prompt the user to choose simulations and plots for the analysis.
        """
        log_value = slider.value
        fee_setting = 10 ** log_value
        slider.close()  
        button.close()  
        record_protocol_fees(fee_setting)
        choose_simulations_and_plots()
        return(None)

    def interactive_odometer(
        ) -> None:
        """
        ### Sets up the interactive odometer widget for the user to choose the protocol fees.
        
        ## Parameters:
        None
        
        ## Returns:
        None

        ## Notes:
        - This function sets up the interactive odometer widget for the user to choose the protocol fees.
        - It defines and displays the slider and "OK" button widgets and sets up their event handlers.
        """
        global slider
        slider = FloatSlider(
            value = -3.524,
            min = -5,
            max = -2,
            step = 0.0001,
            description = 'Log Value:',
            readout_format = '.3f')
        button = Button(description = 'OK')
        button.on_click(on_button_click)
        output = Output()
        display_controls = VBox([button, output])
        interact(display_odometer, log_value = slider)
        display(display_controls)
        return(None)

    interactive_odometer()
    return (None)

def choose_carbon_order_weights(
    CASH: str, 
    RISK: str, 
    force_portfolio: Union[int, None] = None,
    figsize: Tuple[int] = (6, 4), 
    dpi: int = 200
    ) -> None:
    """
    ### Prompts the user to choose the portfolio composition for the carbon ranges.

    ## Parameters:
    | Parameter Name   | Type                  | Description                                               |
    |:-----------------|:----------------------|:----------------------------------------------------------|
    | `CASH`           | `str`                 | The `CASH` (or 'quote') asset in the trading pair.        |
    | `RISK`           | `str`                 | The `RISK` (or 'base') asset in the trading pair.         |
    | `force_portfolio`| `Union[str, None]`    | A predetermined portfolio composition (default: None).    |
    | `figsize`        | `Tuple[int]`          | The size of the plot as a tuple (width, height).          |
    | `dpi`            | `int`                 | The resolution of the plot in dots per inch.              |

    ## Returns:
    None

    ## Notes:
    - This function prompts the user to choose the portfolio composition (percentage allocation of `CASH` and `RISK` assets) for the carbon ranges using a slider.
    - The user clicks the "OK" button to proceed with the selected portfolio composition.
    - If `force_portfolio` is set, the function will disable the slider and use the predetermined composition, either 100% `CASH` or 100% `RISK`.
    """
    plt.style.use('dark_background')
    
    if force_portfolio:
        ymax = ymin = force_portfolio - 1
    else:
        ymin = 0
        ymax = 100

    def create_plot(
        cash_percent : float
        ) -> None:
        """
        ### Creates and displays a bar plot for the user to choose the portfolio composition.

        ## Parameters:
        | Parameter Name | Type   | Description                                               |
        |:---------------|:-------|:----------------------------------------------------------|
        | `cash_percent` | `float`| The percentage of the `CASH` asset in the portfolio.      |

        ## Returns:
        None

        ## Notes:
        - This function creates and displays a bar plot for the user to choose the portfolio composition (percentage allocation of `CASH` and `RISK` assets) using a slider.
        - It calculates the `RISK` asset percentage based on the `cash_percent` value.
        - The function is called when the user moves the slider to adjust the portfolio composition.
        """
        risk_percent = 100 - cash_percent
        x = [f'{RISK} (RISK)', f'{CASH} (CASH)']
        y = [risk_percent, cash_percent]
        fig, ax = plt.subplots(figsize = figsize, dpi = dpi)
        risk_bar = ax.bar(x[0], y[0], edgecolor = '#d68c35ff', color = '#35230dff')
        cash_bar = ax.bar(x[1], y[1], edgecolor = '#10bbd5ff', color = '#042f35ff')
        ax.set_ylim(0, 100)
        ax.set_xlabel("Tokens", fontproperties = GT_America_Standard_Light, fontsize = 12)
        ax.set_ylabel("% Allocation (CASH basis)", fontproperties = GT_America_Standard_Light, fontsize = 12)
        ax.set_title("Choose Carbon Portfolio Composition", fontproperties = GT_America_Extended_Medium, fontsize = 16)
        ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, pos: f'{x:.0f}%'))
        
        for label in ax.xaxis.get_ticklabels():
            label.set_fontproperties(GT_America_Mono_Regular)
            label.set_fontsize(6)
            
        for label in ax.yaxis.get_ticklabels():
            label.set_fontproperties(GT_America_Mono_Regular)
            label.set_fontsize(6)
        
        for i, v in enumerate(y):
            text = "{:.1f}%".format(v)
            color = risk_bar[0].get_edgecolor() if i == 0 else cash_bar[0].get_edgecolor()
            ax.text(i, v + 1, text, ha = 'center', color = color, fontproperties = GT_America_Mono_Regular, fontsize = 10).set_path_effects([pe.withStroke(linewidth = 3, foreground = "black")])
        plt.show()
        return(None)


    slider = FloatSlider(
        value = ymax,
        min = ymin,
        max = ymax,
        step = 0.1,
        description = 'Cash %:',
        readout_format = '.1f',
        disabled = bool(force_portfolio)  # Disable the slider if force_portfolio is set
    )

    def on_ok_button_click(
        button: widgets.Button 
        ) -> None:
        """
        ### Processes the user-defined portfolio composition and proceeds with the trading simulation.

        ## Parameters:
        | Parameter Name | Type             | Description                       |
        |:---------------|:-----------------|:----------------------------------|
        | `button`       | `widgets.Button` | The "OK" button widget instance.  |

        ## Returns:
        None

        ## Dependencies:
        | Dependency Name               | Type       | Description                                                                 |
        |:------------------------------|:-----------|:----------------------------------------------------------------------------|
        | `record_carbon_order_weights` | `function` | Records the user-defined portfolio composition.                             |
        | `choose_protocol_fees`        | `function` | Prompts the user to choose the protocol fees for the trading simulation.    |

        ## Notes:
        - This function is called when the user clicks the "OK" button after selecting the portfolio composition using the slider.
        - It processes the user-defined portfolio composition, records it, and calls the `choose_protocol_fees` function to prompt the user to choose the protocol fees for the trading simulation.
        """
        cash_percent = slider.value
        risk_percent = 100 - cash_percent
        slider.close()
        ok_button.close()
        record_carbon_order_weights(risk_percent, cash_percent)
        choose_protocol_fees()
        return(None)

    interact(create_plot, cash_percent = slider)
    ok_button = Button(description = 'OK')
    display(ok_button)
    ok_button.on_click(on_ok_button_click)
    return(None)

def choose_carbon_start_bid_and_ask(
    CASH_symbol: str,
    RISK_symbol: str,
    candlestick_dataframe: pd.DataFrame,
    carbon_range_boundaries: list[float]
    ) -> None:
    """
    ### Prompts the user to choose the starting bid and ask prices for the carbon ranges.

    ## Parameters:
    | Parameter Name           | Type            | Description                                                                      |
    |:-------------------------|:----------------|:---------------------------------------------------------------------------------|
    | `CASH_symbol`            | `str`           | The `CASH_symbol` (or 'quote') asset in the trading pair.                        |
    | `RISK_symbol`            | `str`           | The `RISK_symbol` (or 'base') asset in the trading pair.                         |
    | `candlestick_dataframe`  | `pd.DataFrame`  | A pandas `DataFrame` containing candlestick data.                                |
    | `carbon_range_boundaries`| `list[float]`   | A list containing four `float` values representing the carbon range boundaries.  |

    ## Returns:
    None

    ## Notes:
    - This function prompts the user to choose the starting bid and ask prices for the carbon ranges using sliders on a candlestick chart.
    - The user clicks the "OK" button to proceed with the selected starting bid and ask prices.
    """
    ymax_ask, ymin_ask = carbon_range_boundaries[:2]
    ymax_bid, ymin_bid = carbon_range_boundaries[2:]
    line_1, line_3, line_4, line_6 = ymax_ask, ymin_ask, ymax_bid, ymin_bid
    open_price = candlestick_dataframe['open'][0]
    
    if open_price < min(carbon_range_boundaries):
        non_arb_min_ask = ymin_ask
        non_arb_max_bid = ymin_bid
        force_portfolio = 1
    elif open_price > max(carbon_range_boundaries):
        non_arb_min_ask = ymax_ask
        non_arb_max_bid = ymax_bid
        force_portfolio = 101
    else:
        non_arb_min_ask = max(ymin_ask, open_price)
        non_arb_max_bid = min(ymax_bid, open_price)
        force_portfolio = None
        
    description_style = {'description_width': 'initial', 'font-size': '16px'}
    
    def plot_candlestick_chart_with_sliders(
        CASH_symbol: str, 
        RISK_symbol: str, 
        candlestick_dataframe: pd.DataFrame
        ) -> None:
        """
        ### Displays a candlestick chart with sliders to choose the starting bid and ask prices for the carbon ranges.

        ## Parameters:
        | Parameter Name           | Type          | Description                                               |
        |:-------------------------|:--------------|:----------------------------------------------------------|
        | `CASH_symbol`            | `str`         | The `CASH_symbol` (or 'quote') asset in the trading pair. |
        | `RISK_symbol`            | `str`         | The `RISK_symbol` (or 'base') asset in the trading pair.  |
        | `candlestick_dataframe`  | `pd.DataFrame`| A pandas DataFrame containing candlestick data.           |

        ## Returns:
        None

        ## Notes:
        - This function displays a candlestick chart with sliders for the user to choose the starting bid and ask prices for the carbon ranges.
        - It also defines the `update_lines` and `on_ok_button_click` nested functions to handle user interactions.
        """
        def update_lines(
            line_2: float, 
            line_5: float
            ) -> None:
            """
            ### Updates the displayed lines on the candlestick chart based on the slider values.

            ## Parameters:
            | Parameter Name | Type   | Description                                   |
            |:---------------|:-------|:----------------------------------------------|
            | `line_2`       | `float`| The value of the 'Starting Ask Price' slider. |
            | `line_5`       | `float`| The value of the 'Starting Bid Price' slider. |

            ## Returns:
            None

            ## Notes:
            - This function is called when the user moves the 'Starting Ask Price' or 'Starting Bid Price' sliders.
            - It updates the displayed lines on the candlestick chart based on the new slider values.
            """
            lines = sorted([line_1, line_2, line_3, line_4, line_5, line_6], reverse = True)
            fig = plot_candlestick_chart(CASH_symbol = CASH_symbol, 
                                         RISK_symbol = RISK_symbol, 
                                         candlestick_dataframe = candlestick_dataframe, 
                                         title = 'Choose Carbon Starting Bid and Ask', 
                                         lines = lines)
            clear_output(wait=True)
            return(None)
        
        slider_1 = widgets.FloatSlider(value = non_arb_min_ask, 
                                       min = non_arb_min_ask, 
                                       max = ymax_ask, 
                                       step = (ymax_ask - non_arb_min_ask)/100, 
                                       description = 'Starting Ask Price:', 
                                       style = description_style)
        slider_2 = widgets.FloatSlider(value = non_arb_max_bid, 
                                       min = ymin_bid, 
                                       max = non_arb_max_bid, 
                                       step = (non_arb_max_bid - ymin_bid)/100, 
                                       description = 'Starting Bid Price:', 
                                       style = description_style)
        controls = widgets.interactive(update_lines, 
                                       line_2 = slider_1, 
                                       line_5 = slider_2)
        display(controls)
        ok_button = widgets.Button(description = 'OK')
        display(ok_button)

        def on_ok_button_click(
            button: widgets.Button
            ) -> None:
            """
            ### Processes the user-defined starting bid and ask prices and calls the `choose_carbon_order_weights` function.

            ## Parameters:
            | Parameter Name | Type             | Description                      |
            |:---------------|:-----------------|:---------------------------------|
            | `button`       | `widgets.Button` | The "OK" button widget instance. |

            ## Returns:
            None

            ## Dependencies:
            | Dependency Name                   | Type       | Description                                                         |
            |:----------------------------------|:-----------|:--------------------------------------------------------------------|
            | `record_carbon_start_bid_and_ask` | `function` | Records the user-defined starting bid and ask prices.               |
            | `choose_carbon_order_weights`     | `function` | Prompts the user to choose the order weights for the carbon ranges. |

            ## Notes:
            - This function is called when the user clicks the "OK" button after selecting the starting bid and ask prices for the carbon ranges.
            - It processes the user-defined starting bid and ask prices, records them, and calls the `choose_carbon_order_weights` function to prompt the user to choose the order weights for the carbon ranges.
            """
            line_2 = slider_1.value
            line_5 = slider_2.value
            slider_1.close()
            slider_2.close()
            ok_button.close()
            record_carbon_start_bid_and_ask(line_2, line_5)
            choose_carbon_order_weights(CASH_symbol, RISK_symbol, force_portfolio)
            return(None)
        
        ok_button.on_click(on_ok_button_click)

    plot_candlestick_chart_with_sliders(CASH_symbol, RISK_symbol, candlestick_dataframe)
    return(None)

def choose_carbon_ranges(
    CASH_symbol: str,
    RISK_symbol: str,
    candlestick_dataframe: pd.DataFrame,
    uniswap_v3_range_boundaries: list[float]
    ) -> None:
    """
    ### Prompts the user to choose carbon range boundaries.

    ## Parameters:
    | Parameter Name                | Type           | Description                                                                         |
    |:------------------------------|:---------------|:------------------------------------------------------------------------------------|
    | `CASH_symbol`                 | `str`          | The `CASH_symbol` (or 'quote') asset in the trading pair.                           |
    | `RISK_symbol`                 | `str`          | The `RISK_symbol` (or 'base') asset in the trading pair.                            |
    | `candlestick_dataframe`       | `pd.DataFrame` | A pandas `DataFrame` containing candlestick data.                                   |
    | `uniswap_v3_range_boundaries` | `list[float]`  | A list containing two `float` values representing the Uniswap V3 range boundaries.  |

    ## Returns:
    None

    ## Notes:
    - This function prompts the user to choose carbon range boundaries using sliders on a candlestick chart.
    - The user clicks the "OK" button to proceed with the selected carbon range boundaries.
    """
    ymin, ymax = candlestick_dataframe[['low', 'high']].min().min(), candlestick_dataframe[['low', 'high']].max().max()
    uni_y_1, uni_y_2 = uniswap_v3_range_boundaries
    uni_mid = (uni_y_1 + uni_y_2)/2
    description_style = {'description_width': 'initial', 'font-size': '16px'}

    def plot_candlestick_chart_with_sliders(
        CASH_symbol: str, 
        RISK_symbol: str, 
        candlestick_dataframe: pd.DataFrame
        ) -> None:
        """
        ### Displays a candlestick chart with sliders to choose carbon range boundaries.

        ## Parameters:
        | Parameter Name           | Type          | Description                                              |
        |:-------------------------|:--------------|:---------------------------------------------------------|
        | `CASH_symbol`            | `str`         | The `CASH_symbol` (or base) asset in the trading pair.   |
        | `RISK_symbol`            | `str`         | The `RISK_symbol` (or quote) asset in the trading pair.  |
        | `candlestick_dataframe`  | `pd.DataFrame`| A pandas `DataFrame` containing candlestick data.        |

        ## Returns:
        None

        ## Notes:
        - This function displays a candlestick chart with sliders for the user to choose carbon range boundaries.
        - It also defines the update_lines and on_ok_button_click nested functions to handle user interactions.
        """
        def update_lines(
            line_1: float, 
            line_2: float, 
            line_3: float, 
            line_4: float
            ) -> None:
            """
            ### Updates the lines on the candlestick chart when the carbon range sliders are adjusted.

            ## Parameters:
            | Parameter Name | Type    | Description                                             |
            |:---------------|:--------|:--------------------------------------------------------|
            | `line_1`       | `float` | The value of the first carbon range boundary slider.    |
            | `line_2`       | `float` | The value of the second carbon range boundary slider.   |
            | `line_3`       | `float` | The value of the third carbon range boundary slider.    |
            | `line_4`       | `float` | The value of the fourth carbon range boundary slider.   |

            ## Returns:
            None

            ## Notes:
            - This function is called when the user adjusts any of the carbon range boundary sliders.
            - It updates the lines on the candlestick chart to visualize the new boundaries.
            """
            lines = sorted([line_1, line_2, line_3, line_4], reverse = True)
            fig = plot_candlestick_chart(CASH_symbol = CASH_symbol, 
                                         RISK_symbol = RISK_symbol, 
                                         candlestick_dataframe = candlestick_dataframe, 
                                         title = 'Choose Carbon Ranges', 
                                         lines = lines)
            clear_output(wait = True)
            return(None)

        slider_1 = widgets.FloatSlider(value = uni_y_1, 
                                       min = ymin, 
                                       max = ymax, 
                                       step = (ymax - ymin)/100, 
                                       description = 'Range Boundary 1:', 
                                       style = description_style)
        slider_2 = widgets.FloatSlider(value = uni_mid, 
                                       min = ymin, 
                                       max = ymax, 
                                       step = (ymax - ymin)/100, 
                                       description = 'Range Boundary 2:', 
                                       style = description_style)
        slider_3 = widgets.FloatSlider(value = uni_mid, 
                                       min = ymin, 
                                       max = ymax, 
                                       step = (ymax - ymin)/100, 
                                       description = 'Range Boundary 3:', 
                                       style = description_style)
        slider_4 = widgets.FloatSlider(value = uni_y_2, 
                                       min = ymin, 
                                       max = ymax, 
                                       step = (ymax - ymin)/100, 
                                       description = 'Range Boundary 4:', 
                                       style = description_style)
        controls = widgets.interactive(update_lines, 
                                       line_1 = slider_1, 
                                       line_2 = slider_2, 
                                       line_3 = slider_3, 
                                       line_4 = slider_4)
        display(controls)
        ok_button = widgets.Button(description = 'OK')
        display(ok_button)

        def on_ok_button_click(
            button: widgets.Button
            ) -> None:
            """
            ### Processes the user-defined carbon range boundaries and calls the choose_carbon_start_bid_and_ask function.

            ## Parameters:
            | Parameter Name | Type             | Description                      |
            |:---------------|:-----------------|:---------------------------------|
            | `button`       | `widgets.Button` | The "OK" button widget instance. |

            ## Returns:
            None

            ## Dependencies:
            | Dependency Name                   | Type       | Description                                                                           |
            |:----------------------------------|:-----------|:--------------------------------------------------------------------------------------|
            | `record_carbon_ranges`            | `function` | Records the user-defined carbon range boundaries.                                     |
            | `choose_carbon_start_bid_and_ask` | `function` | Prompts the user to choose the starting bid and ask prices for the carbon ranges.     |

            ## Notes:
            - This function is called when the user clicks the "OK" button after selecting the carbon range boundaries.
            - It processes the user-defined carbon range boundaries, records them, and calls the choose_carbon_start_bid_and_ask function to prompt the user to choose the starting bid and ask prices for the carbon ranges.
            """
            line_1 = slider_1.value
            line_2 = slider_2.value
            line_3 = slider_3.value
            line_4 = slider_4.value
            slider_1.close()
            slider_2.close()
            slider_3.close()
            slider_4.close()
            ok_button.close()
            carbon_range_boundaries = record_carbon_ranges(line_1, line_2, line_3, line_4)    
            choose_carbon_start_bid_and_ask(CASH_symbol, RISK_symbol, candlestick_dataframe, carbon_range_boundaries)
            return(None)

        ok_button.on_click(on_ok_button_click)
        return(None)

    plot_candlestick_chart_with_sliders(CASH_symbol, RISK_symbol, candlestick_dataframe)
    return(None)

def choose_uniswap_v3_range(
    CASH_symbol: str,
    RISK_symbol: str,
    candlestick_dataframe: pd.DataFrame
    ) -> None:
    """
    ### Allows the user to choose the Uniswap V3 range by adjusting sliders corresponding to the range boundaries.

    ## Parameters:
    | Parameter Name         | Type            | Description                                               |
    |:-----------------------|:----------------|:----------------------------------------------------------|
    | `CASH_symbol`          | `str`           | The `CASH_symbol` (or 'quote') asset in the trading pair. |
    | `RISK_symbol`          | `str`           | The `RISK_symbol` (or 'base') asset in the trading pair.  |
    | `candlestick_dataframe`| `pd.DataFrame`  | The `DataFrame` containing the historical price data.     |

    ## Returns:
    None

    ## Dependencies:
    | Dependency Name                       | Type       | Description                                                                                        |
    |:--------------------------------------|:-----------|:---------------------------------------------------------------------------------------------------|
    | `plot_candlestick_chart_with_sliders` | `function` | Displays the candlestick chart with range sliders and processes the user-defined range boundaries. |

    ## Notes:
    - This function first calculates the minimum and maximum price range from the provided candlestick_dataframe.
    - Then, it calls the plot_candlestick_chart_with_sliders function to display the candlestick chart and the sliders for the user to select the range boundaries.
    - When the user clicks the "OK" button, the chosen range boundaries are recorded, and the choose_carbon_ranges function is called.
    """
    
    ymin, ymax = candlestick_dataframe[['low', 'high']].min().min(), candlestick_dataframe[['low', 'high']].max().max()
    description_style = {'description_width': 'initial', 'font-size': '16px'}

    def plot_candlestick_chart_with_sliders(
        CASH_symbol: str, 
        RISK_symbol: str, 
        candlestick_dataframe: pd.DataFrame
        ) -> None:
        """
        ### Displays the candlestick chart with range sliders and processes the user-defined range boundaries.

        ## Parameters:
        | Parameter Name         | Type            | Description                                                 |
        |:-----------------------|:----------------|:------------------------------------------------------------|
        | `CASH_symbol`          | `str`           | The `CASH_symbol` (or 'quote') asset in the trading pair.   |
        | `RISK_symbol`          | `str`           | The `RISK_symbol` (or 'base') asset in the trading pair.    |
        | `candlestick_dataframe`| `pd.DataFrame`  | The dataframe containing the historical price data.         |

        ## Returns:
        None

        ## Dependencies:
        | Dependency Name       | Type       | Description                                                                                |
        |:----------------------|:-----------|:-------------------------------------------------------------------------------------------|
        | `update_lines`        | `function` | Updates the lines on the candlestick chart when the range sliders are adjusted.            |
        | `on_ok_button_click`  | `function` | Processes the user-defined range boundaries and calls the `choose_carbon_ranges` function. |

        ## Notes:
        - This function creates and displays the range sliders and the "OK" button.
        - The update_lines function updates the lines on the candlestick chart when the sliders are adjusted.
        - When the user clicks the "OK" button, the on_ok_button_click function is executed, processing the user-defined range boundaries and calling the choose_carbon_ranges function.
        """
        def update_lines(
            line_1: float, 
            line_2: float
            ) -> None:
            """
            ### Updates the lines on the candlestick chart when the range sliders are adjusted.

            ## Parameters:
            | Parameter Name | Type    | Description                                    |
            |:---------------|:--------|:-----------------------------------------------|
            | `line_1`       | `float` | The value of the first range boundary slider.  |
            | `line_2`       | `float` | The value of the second range boundary slider. |

            ## Returns:
            None

            ## Notes:
            - This function is called when the user adjusts either of the range boundary sliders.
            - It updates the lines on the candlestick chart to visualize the new boundaries.
            """
            fig = plot_candlestick_chart(CASH_symbol = CASH_symbol, 
                                         RISK_symbol = RISK_symbol, 
                                         candlestick_dataframe = candlestick_dataframe, 
                                         title = 'Choose Uniswap V3 Range', 
                                         lines = (line_1, line_2))
            clear_output(wait=True)
            return(None)

        slider_1 = widgets.FloatSlider(value = ymax, 
                                       min = ymin, 
                                       max = ymax, 
                                       step = (ymax - ymin) / 100, 
                                       description = 'Range Boundary 1:', 
                                       style = description_style)
        slider_2 = widgets.FloatSlider(value = ymin, 
                                       min = ymin, 
                                       max = ymax, 
                                       step = (ymax - ymin) / 100, 
                                       description = 'Range Boundary 2:', 
                                       style = description_style)
        controls = widgets.interactive(update_lines, 
                                       line_1 = slider_1, 
                                       line_2 = slider_2)
        display(controls)
        ok_button = widgets.Button(description = 'OK')
        display(ok_button)

        def on_ok_button_click(
            button: widgets.Button 
            ) -> None:
            """
            ### Processes the user-defined range boundaries and calls the choose_carbon_ranges function.

            ## Parameters:
            | Parameter Name | Type             | Description                      |
            |:---------------|:-----------------|:---------------------------------|
            | `button`       | `widgets.Button` | The "OK" button widget instance. |

            ## Returns:
            None

            ## Dependencies:
            | Dependency Name            | Type       | Description                                                                        |
            |:---------------------------|:-----------|:-----------------------------------------------------------------------------------|
            | `record_uniswap_v3_range`  | `function` | Records the user-defined Uniswap V3 range boundaries.                              |
            | `choose_carbon_ranges`     | `function` | Prompts the user to choose the carbon credit ranges based on the chosen boundaries.|

            ## Notes:
            - This function is called when the user clicks the "OK" button after selecting the range boundaries.
            - It processes the user-defined range boundaries, records them, and calls the `choose_carbon_ranges` function to prompt the user to choose the carbon ranges based on the chosen boundaries.
            """
            line_1 = slider_1.value
            line_2 = slider_2.value
            slider_1.close()
            slider_2.close()
            ok_button.close()
            uniswap_v3_range_boundaries = record_uniswap_v3_range(line_1, line_2)
            choose_carbon_ranges(CASH_symbol, RISK_symbol, candlestick_dataframe, uniswap_v3_range_boundaries)
            return(None)

        ok_button.on_click(on_ok_button_click)
        return(None)

    plot_candlestick_chart_with_sliders(CASH_symbol, RISK_symbol, candlestick_dataframe)
    return(None)

class PriceForecast:
    """
    ### The PriceForecast class is designed for financial price forecasting and visualization for simulation purposes. 
    
    ## Methods:
    | Method Name                                    | Description                                                                          |
    |:-----------------------------------------------|:-------------------------------------------------------------------------------------|
    | `__init__`                                     | Initializes the class with symbols, data, and performs initial calculations.         |
    | `read_smooth_data`                             | Reads the smooth price data from a file.                                             |
    | `initialize_data`                              | Initializes the smooth price data.                                                   |
    | `calculate_rms`                                | Calculates the quadratic mean (RMS) of a list of numbers.                            |
    | `get_rms_time_interval`                        | Calculates the RMS time interval in the smooth price data.                           |
    | `calculate_volatility`                         | Calculates the volatility of the price data.                                         |
    | `perform_calculations`                         | Wrapper for initial calculations like most common interval and volatility.           |
    | `convert_to_OHLC`                              | Converts smooth price data to OHLC format.                                           |
    | `generate_candlestick_dataframe`               | Generates a DataFrame suitable for candlestick plotting.                             |
    | `make_mpf_style`                               | Creates a style for the candlestick plot.                                            |
    | `plot_candlestick`                             | Plots the candlestick chart.                                                         |
    | `set_labels`                                   | Sets labels for the plot.                                                            |
    | `plot_forecast_candlestick_chart`              | Plots the forecasted candlestick chart.                                              |
    | `process_and_plot_data`                        | Processes and plots the initial candlestick chart.                                   |
    | `subdivide_wave`                               | Subdivides a wave into either 3 or 5 subdivisions.                                   |
    | `plot_processed_prediction`                    | Plots the processed prediction data.                                                 |
    | `prediction_to_dataframe`                      | Converts the processed prediction dictionary into a DataFrame.                       |
    | `initialize_processed_prediction`              | Initializes the `processed_prediction` dictionary with the most recent data point.   |
    | `populate_processed_prediction`                | Populates the `processed_prediction` dictionary based on `gross_prediction`.         |
    | `remove_most_recent_from_processed_prediction` | Removes the most recent data point from `processed_prediction`.                      |
    | `process_gross_prediction`                     | Wrapper function for initializing, populating, and plotting processed predictions.   |
    | `label_data_source`                            | Labels the data as either 'historical' or 'projected'.                               |
    | `extend_dataframe_with_prediction`             | Extends the DataFrame with interpolated and projected data.                          |
    | `plot_with_arrows`                             | Adds arrows to the plot to indicate wave patterns.                                   |
    | `update_arrows`                                | Updates the arrows on the plot based on slider inputs.                               |
    | `create_slider`                                | Creates a slider widget for interactive input.                                       |
    | `create_wave_sliders`                          | Creates sliders for wave dates and prices.                                           |
    | `on_ok_button_click`                           | Processes and plots the data when the OK button is clicked.                          |
    | `initialize_interactive_controls`              | Initializes all interactive controls like sliders and buttons.                       |
     
    ## Notes 
    - It reads historical price data, performs statistical calculations like volatility and most common interval, and prepares the data for plotting in OHLC and candlestick formats. 
    - The class also offers methods for subdividing price waves and plotting processed predictions. 
    - It features a high level of interactivity, allowing users to manipulate wave patterns through sliders and see updated forecasts in real-time.
    """
    def __init__(
        self, 
        CASH_symbol: str,
        RISK_symbol: str,
        base_filename: str,
        ):
        """
        ### Initializes the PriceForecast class.

        ## Parameters:
        | Parameter                         | Type  | Description                                                              |
        |:----------------------------------|:------|:-------------------------------------------------------------------------|
        | `CASH_symbol`                     | `str` | The symbol for the cash currency.                                        |
        | `RISK_symbol`                     | `str` | The symbol for the risk asset.                                           |
        | `smooth_price_dataframe_filename` | `str` | The filename for the smooth price DataFrame stored as a pickle file.     |

        ## Attributes:
        Various attributes are initialized, including data frames and calculations for price forecasting.
        """
        self.CASH_symbol = CASH_symbol
        self.RISK_symbol = RISK_symbol
        self.initialize_data(base_filename)
        self.perform_calculations()
        self.gross_prediction = {}
        self.processed_prediction = {}
        self.processed_prediction_df = None
        self.final_df = None
        self.labeled_df = None
        self.final_OHLC_df = None
        self.candlestick_dataframe = None
        self.initialize_interactive_controls()
    
    def read_smooth_data(
        self,
        base_filename: str
        ) -> pd.DataFrame:
        """
        ### Reads the smooth price data from a pickle file.

        ## Parameters:
        | Parameter       | Type  | Description                                                          |
        |:----------------|:------|:---------------------------------------------------------------------|
        | `base_filename` | `str` | The filename for the smooth price DataFrame stored as a pickle file. |

        ## Returns:
        | Return Name                    | Type           | Description                                       |
        |:-------------------------------|:---------------|:--------------------------------------------------|
        | `smooth_price_dataframe`       | `pd.DataFrame` | A DataFrame containing the smooth price data.     |

        ## Notes:
        - The function reads a pickle file and returns a DataFrame after dropping the 'time_bin' column.
        """
        try:
            with open(f'{base_filename}_smooth_price_dataframe.pickle', 'rb') as file:
                smooth_price_dataframe = pickle.load(file)
        except FileNotFoundError:
            raise FileNotFoundError(f"The file {base_filename}_smooth_price_dataframe.pickle was not found.")
        except pickle.UnpicklingError:
            raise ValueError(f"The file {base_filename}_smooth_price_dataframe.pickle is not a valid pickle file.")
        if 'time_bin' in smooth_price_dataframe.columns:
            smooth_price_dataframe.drop(columns=['time_bin'], inplace=True)
        else:
            print("Warning: 'time_bin' column not found in DataFrame. Where did this dataframe come from?")
        return(smooth_price_dataframe)
    
    def initialize_data(
        self, 
        base_filename: str
        ) -> None:
        """
        ### Initializes the smooth price data.

        ## Parameters:
        | Parameter  | Type  | Description                                                                 |
        |:-----------|:------|:----------------------------------------------------------------------------|
        | `filename` | `str` | The filename for the smooth price DataFrame stored as a pickle file.        |

        ## Returns:
        None

        ## Notes:
        - Calls the `read_smooth_data` method to initialize the `smooth_price_dataframe` attribute.
        """
        self.smooth_price_dataframe = self.read_smooth_data(base_filename)
        return(None)
    
    def calculate_rms(
        self,
        numbers: list
        ) -> float:
        """
        ### Calculates the quadratic mean (RMS) of a list of numbers.

        ## Parameters:
        | Parameter Name  | Type  | Description                                        |
        |:----------------|:------|:---------------------------------------------------|
        | `numbers`       | `list`| A list of numbers for which the RMS is calculated. |

        ## Returns:
        | Return Name     | Type  | Description                                             |
        |:----------------|:------|:--------------------------------------------------------|
        | `rms_value`     | `float`| The quadratic mean (RMS) of the given list of numbers. |

        ## Notes:
        - The function calculates the RMS by squaring the numbers, taking the mean, and then taking the square root.
        """
        if not numbers:
            raise ValueError("The input list is empty.")
        rms_value = np.sqrt(np.mean(np.square(numbers)))
        return(rms_value)
    
    def get_rms_time_interval(
        self,
        ) -> pd.Timedelta:
        """
        ### Calculates the RMS time interval in the smooth price data.

        ## Parameters:
        | Parameter Name               | Type           | Description                                   |
        |:-----------------------------|:---------------|:----------------------------------------------|
        | `smooth_price_dataframe`     | `pd.DataFrame` | A DataFrame containing the smooth price data. |

        ## Returns:
        | Return Name                  | Type           | Description                                    |
        |:-----------------------------|:---------------|:-----------------------------------------------|
        | `rms_interval`               | `pd.Timedelta` | The RMS time interval in the smooth price data.|

        ## Notes:
        - The function calculates the RMS time interval by first calculating the time differences and then applying the RMS formula.
        """
        df = self.smooth_price_dataframe
        if df.empty:
            raise ValueError("The smooth_price_dataframe is empty.")
        if 'time' not in df.columns:
            raise KeyError("'time' column not found in smooth_price_dataframe.")
        df['time'] = pd.to_datetime(df['time']).dt.floor('s') # Convert to datetime and round to the nearest second
        time_diffs = df['time'].diff().dropna().dt.total_seconds() # Calculate time differences in seconds
        rms_interval_seconds = self.calculate_rms(time_diffs.tolist()) # Calculate RMS of the time differences
        rms_interval = pd.to_timedelta(rms_interval_seconds, unit='s') # Convert RMS interval back to Timedelta
        return(rms_interval)
    
    def calculate_volatility(
        self,
        ) -> float:
        """
        ### Calculates the volatility of the smooth price data.

        ## Parameters:
        None

        ## Returns:
        | Return Name   | Type         | Description                                         |
        |:--------------|:-------------|:----------------------------------------------------|
        | `volatility`  | `float`      | The calculated volatility of the smooth price data. |

        ## Notes:
        - The function calculates the standard deviation of the percentage change in the smooth price data.
        """
        if self.smooth_price_dataframe.empty:
            raise ValueError("The smooth_price_dataframe is empty.")
        if 'price' not in self.smooth_price_dataframe.columns:
            raise KeyError("'price' column not found in smooth_price_dataframe.")
        pct_change = self.smooth_price_dataframe['price'].pct_change().dropna()
        volatility = np.std(pct_change)
        return(volatility)
    
    def perform_calculations(
        self
        ) -> None:
        """
        ### Performs initial calculations required for price forecasting.

        ## Parameters:
        None

        ## Returns:
        None

        ## Notes:
        - Calls the `get_rms_time_interval` and `calculate_volatility` methods to perform initial calculations.
        """
        try:
            self.rms_time_interval = self.get_rms_time_interval()
            self.volatility = self.calculate_volatility()
        except Exception as e:
            raise RuntimeError(f"An error occurred while performing initial calculations: {e}")
        return(None)

    def convert_to_OHLC(
        self,
        smooth_price_dataframe: pd.DataFrame,
        num_rows: int = 4
        ) -> pd.DataFrame:
        """
        ### Converts smooth price data to OHLC (Open-High-Low-Close) format.

        ## Parameters:
        | Parameter                 | Type           | Description                                                            |
        |:--------------------------|:---------------|:-----------------------------------------------------------------------|
        | `smooth_price_dataframe`  | `pd.DataFrame` | The DataFrame containing smooth price data.                            |
        | `num_rows`                | `int`          | The number of rows to group together to form a single OHLC data point. |

        ## Returns:
        | Return Name               | Return Type    | Description                            |
        |:--------------------------|:---------------|:---------------------------------------|
        | `OHLC_dataframe`          | `pd.DataFrame` | A DataFrame containing the OHLC data.  |

        ## Notes:
        - The function takes a DataFrame containing smoothed price data, with a `time` column and a `price` column.
        - The `time` column should be in datetime format.
        - The function creates data bins by dividing the input DataFrame into `num_bins` bins based on the length of the DataFrame and the `num_rows` parameter.
        - An OHLC DataFrame is created with the following attributes for each data bin:
            - 'time' corresponds to the timestamp of the end of the bin.
            - 'open' is the price at the start of the bin or the 'close' price of the previous bin.
            - 'high' is the maximum price within the bin.
            - 'low' is the minimum price within the bin.
            - 'close' is the price at the end of the bin.
        - The function continues until it has processed all rows in the input DataFrame.
        - The 'close' price of a bin becomes the 'open' price of the next bin.
        - The function also labels each OHLC data point as 'historical' or 'projected' based on the time.
        """
        if smooth_price_dataframe.empty:
            raise ValueError("The input DataFrame is empty.")
        if 'time' not in smooth_price_dataframe.columns or 'price' not in smooth_price_dataframe.columns:
            raise KeyError("The input DataFrame must contain 'time' and 'price' columns.")
        num_bins = int(len(smooth_price_dataframe) / num_rows)
        smooth_price_dataframe = smooth_price_dataframe.assign(time_bin=pd.cut(smooth_price_dataframe['time'], bins=num_bins))

        bin_groups = smooth_price_dataframe.groupby('time_bin')['price'].apply(list)
        bin_edges = pd.to_datetime([interval.right for interval in bin_groups.index])
        for i in range(1, len(bin_groups)):
            bin_groups.iloc[i].insert(0, bin_groups.iloc[i - 1][-1])
        OHLC_dataframe = pd.DataFrame({
            'time': bin_edges,
            'open': bin_groups.apply(lambda x: x[0]),
            'high': bin_groups.apply(max),
            'low': bin_groups.apply(min),
            'close': bin_groups.apply(lambda x: x[-1])})
        OHLC_dataframe.reset_index(drop = True, inplace = True)
        last_historical_time = smooth_price_dataframe[smooth_price_dataframe['source'] == 'historical']['time'].max()
        OHLC_dataframe['source'] = OHLC_dataframe['time'].apply(lambda x: 'historical' if x <= last_historical_time else 'projected')
        return(OHLC_dataframe)
    
    def generate_candlestick_dataframe(
        self,
        OHLC_dataframe: pd.DataFrame,  
        target_rows: int = 60
        ) -> pd.DataFrame:
        """
        ### Generates a candlestick dataframe with a target number of rows and a 'source' column.

        ## Parameters:
        | Parameter Name   | Type           | Description                                                                   |
        |:-----------------|:---------------|:------------------------------------------------------------------------------|
        | `OHLC_dataframe` | `pd.DataFrame` | The 'Open, High, Low, Close' historical price data as a pandas `DataFrame`.   |
        | `target_rows`    | `int`          | The target number of rows for the output dataframe. (default: 60)             |

        ## Returns:
        | Return Name            | Type           | Description                                                                                                                                                       |
        |:-----------------------|:---------------|:------------------------------------------------------------------------------------------------------------------------------------------------------------------|
        | `candlestick_dataframe`| `pd.DataFrame` | A dataframe with the target number of rows, each row containing the time, high, low, open, close prices, and the source of the data ('historical' or 'projected').|

        ## Notes:
        - This function takes an OHLC dataframe and generates a new dataframe with the target number of rows by amalgamating the data.
        - The amalgamation process condenses the rows of the `OHLC_dataframe` into fewer rows in the `candlestick_dataframe`. 
        - It calculates the step size based on the target number of rows and groups the original rows accordingly.
        - For each group, the new row in `candlestick_dataframe` consists of the time from the first row, the highest high, the lowest low, the open from the first row, and the close from the last row.
        - A 'source' column is added to indicate whether the data in each row is 'historical' or 'projected'.
        - If the number of rows in the input `OHLC_dataframe` is less than or equal to the target number of rows, the function returns the input dataframe as is.
        """
        if OHLC_dataframe.empty:
            raise ValueError("The input DataFrame is empty.")
        essential_columns = ['time', 'high', 'low', 'open', 'close', 'source']
        for col in essential_columns:
            if col not in OHLC_dataframe.columns:
                raise KeyError(f"The input DataFrame must contain '{col}' column.")
        num_rows = len(OHLC_dataframe)
        if num_rows <= target_rows:
            return OHLC_dataframe
        step = int(np.ceil(num_rows / target_rows))
        candlestick_data = []
        for i in range(0, num_rows, step):
            time = OHLC_dataframe.iloc[i].time
            high = OHLC_dataframe.iloc[i:i + step][['high', 'low', 'open', 'close']].max().max()
            low = OHLC_dataframe.iloc[i:i + step][['high', 'low', 'open', 'close']].min().min()
            open_price = OHLC_dataframe.iloc[i].open
            close_price = OHLC_dataframe.iloc[min(i + step - 1, num_rows - 1)].close
            source = 'projected' if 'projected' in OHLC_dataframe.iloc[i:i + step]['source'].values else 'historical'
            candlestick_data.append([time, high, low, open_price, close_price, source])
        candlestick_dataframe = pd.DataFrame(candlestick_data, columns = ['time', 'high', 'low', 'open', 'close', 'source'])
        return(candlestick_dataframe)
    
    def make_mpf_style(
        self, 
        up_color: str = '#00b578ff', 
        down_color: str = '#d86371ff',
        edge_up_color: str = '#00b578ff',
        edge_down_color: str = '#d86371ff',
        wick_up_color: str = '#00b578ff',
        wick_down_color: str = '#d86371ff'
        ) -> Dict[str, Union[str, Dict[str, Union[str, bool, float]], List[str], bool, Tuple[str, float]]]:
        """
        ### Creates a Matplotlib Finance (mpf) style dictionary for candlestick charts.

        ## Parameters:
        | Parameter        | Type  | Description                                                                                                 |
        |:-----------------|:------|:------------------------------------------------------------------------------------------------------------|
        | `up_color`       | `str` | The color to use for 'up' candles, which are candles where the close price is higher than the open price.   |
        | `down_color`     | `str` | The color to use for 'down' candles, which are candles where the close price is lower than the open price.  |
        | `edge_up_color`  | `str` | Optional: The color to use for the edges of 'up' candles. Defaults to `up_color` if not provided.           |
        | `edge_down_color`| `str` | Optional: The color to use for the edges of 'down' candles. Defaults to `down_color` if not provided.       |
        | `wick_up_color`  | `str` | Optional: The color to use for the wicks of 'up' candles. Defaults to `up_color` if not provided.           |
        | `wick_down_color`| `str` | Optional: The color to use for the wicks of 'down' candles. Defaults to `down_color` if not provided.       |

        ## Returns:
        | Return Name  | Return Type  | Description                                                                                         |
        |:-------------|:-------------|:----------------------------------------------------------------------------------------------------|
        | `style`      | `Dict`       | A dictionary containing the mpf style settings, including market colors, base style, and facecolor. |
        
        ## Output Dictionary:
        | Key             | Type                                 | Description                                                                        |
        |:----------------|:-------------------------------------|:-----------------------------------------------------------------------------------|
        | `style_name`    | `str`                                | The name of the mpf style.                                                         |
        | `base_mpl_style`| `str`                                | The base Matplotlib style.                                                         |
        | `marketcolors`  | `Dict`                               | A dictionary containing color settings for different elements of the market chart. |
        | `mavcolors`     | `List[str]`                          | A list of colors for the moving average lines.                                     |
        | `y_on_right`    | `bool`                               | Whether the y-axis is on the right side of the plot.                               |
        | `facecolor`     | `str`                                | The background color of the plot.                                                  |
        | `gridcolor`     | `str`                                | The color of the grid lines.                                                       |
        | `gridstyle`     | `str`                                | The style of the grid lines.                                                       |
        | `rc`            | `List[Tuple[str, Union[str, float]]]`| A list of tuples specifying rcParams settings.                                     |
        | `base_mpf_style`| `str`                                | The base mpf style, usually the same as `style_name`.                              |

        ### `marketcolors` Dictionary:
        | Sub-key      | Type    | Description                                                     |
        |:-------------|:--------|:----------------------------------------------------------------|
        | `candle`     | `Dict`  | Colors for the candle bodies.                                   |
        | `edge`       | `Dict`  | Colors for the edge of the candles.                             |
        | `wick`       | `Dict`  | Colors for the wicks of the candles.                            |
        | `ohlc`       | `Dict`  | Colors for OHLC bars.                                           |
        | `volume`     | `Dict`  | Colors for the volume bars.                                     |
        | `vcedge`     | `Dict`  | Colors for the edge of the volume candles.                      |
        | `vcdopcod`   | `bool`  | Whether to use different colors for up and down volume candles. |
        | `alpha`      | `float` | The alpha transparency level for the market colors.             |

        ## Notes:
        - This function uses the `mpf.make_mpf_style` and `mpf.make_marketcolors` methods to create the style dictionary.
        - The `up_color` and `down_color` parameters are used to set the colors of the 'up' and 'down' candles, respectively.
        - The base mpf style used is 'nightclouds', and the facecolor is set to '#000000'.
        - Color Parameters: The colors should be provided as hexadecimal color codes. For example, '#FFFFFF' for white. Invalid color codes will raise a ValueError.
        """
        color_parameters = [up_color, down_color, edge_up_color, edge_down_color, wick_up_color, wick_down_color]
        for color in color_parameters:
            if not re.match(r'^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$', color):
                raise ValueError(f"Invalid color code: {color}")
        marketcolors = {'up': up_color, 
                        'down': down_color,
                        'edge': {'up': edge_up_color if edge_up_color else up_color, 
                                'down': edge_down_color if edge_down_color else down_color},
                        'wick': {'up': wick_up_color if wick_up_color else up_color, 
                                'down': wick_down_color if wick_down_color else down_color}}
        style = mpf.make_mpf_style(base_mpf_style = 'nightclouds',
                                   marketcolors = mpf.make_marketcolors(**marketcolors),
                                   facecolor = '#000000')
        return(style)
    
    def plot_candlestick(
        self, 
        data: pd.DataFrame, 
        ax: plt.Axes, 
        style: Dict
        ) -> None:
        """
        ### Plots a candlestick chart on a given Axes object.

        ## Parameters:
        | Parameter  | Type           | Description                                                 |
        |:-----------|:---------------|:------------------------------------------------------------|
        | `data`     | `pd.DataFrame` | The DataFrame containing the candlestick data.              |
        | `ax`       | `plt.Axes`     | The Axes object on which to plot the candlestick chart.     |
        | `style`    | `Dict`         | The style dictionary for the Matplotlib Finance (mpf) plot. |

        ## Returns:
        None

        ## Notes:
        - This function uses the `mpf.plot` method to create the candlestick chart.
        - The `style` parameter should be a dictionary created using `make_mpf_style`.
        """
        if data.empty:
            raise ValueError("The input DataFrame is empty.")
        essential_columns = ['time', 'high', 'low', 'open', 'close', 'source']
        for col in essential_columns:
            if col not in data.columns:
                raise KeyError(f"The input DataFrame must contain '{col}' column.")
        mpf.plot(data, type = 'candle', ax = ax, xrotation = 45, show_nontrading = True, style = style)
        return(None)

    def set_labels(
        self, 
        ax: plt.Axes
        ) -> None:
        """
        ### Sets the title and axis labels for a given Axes object.

        ## Parameters:
        | Parameter  | Type       | Description                                                 |
        |:-----------|:-----------|:------------------------------------------------------------|
        | `ax`       | `plt.Axes` | The Axes object for which to set the title and axis labels. |

        ## Returns:
        None

        ## Notes:
        - The title and axis labels are set based on the `RISK_symbol` and `CASH_symbol` attributes of the class instance.
        """
        if not hasattr(self, 'RISK_symbol') or not hasattr(self, 'CASH_symbol'):
            raise AttributeError("RISK_symbol and CASH_symbol attributes must be set in the class instance.")
        title = f'Price Forecasting {self.RISK_symbol}/{self.CASH_symbol}'
        ax.set_title(title, fontproperties = GT_America_Extended_Medium, fontsize = 16)
        ax.set_ylabel(f'price of {self.RISK_symbol} ({self.CASH_symbol} per {self.RISK_symbol})', fontproperties=GT_America_Standard_Light, fontsize = 12)
        ax.set_xlabel('date', fontproperties = GT_America_Standard_Light, fontsize = 12)
        return(None)
    
    def plot_forecast_candlestick_chart(
        self,
        candlestick_dataframe: pd.DataFrame,
        is_final: bool = False,
        figsize: Tuple[int, int] = (6, 4),
        dpi: int = 200,
        ) -> Tuple[plt.Figure, np.ndarray]:
        """
        ### Plots a forecasted candlestick chart.

        ## Parameters:
        | Parameter              | Type                  | Description                                                                     |
        |:-----------------------|:----------------------|:--------------------------------------------------------------------------------|
        | `candlestick_dataframe`| `pd.DataFrame`        | The DataFrame containing the candlestick data.                                  |
        | `is_final`             | `bool`                | Whether the chart is the final version. If True, additional styling is applied. |
        | `figsize`              | `Tuple[int, int]`     | The size of the figure for the plot.                                            |
        | `dpi`                  | `int`                 | The DPI setting for the figure.                                                 |

        ## Returns:
        | Return Name | Type                            | Description                                                  |
        |:------------|:--------------------------------|:-------------------------------------------------------------|
        | `fig, ax`   | `Tuple[plt.Figure, np.ndarray]` | A tuple containing the figure and axes objects for the plot. |

        ## Notes:
        - This function uses the `mpf.plot` method from the Matplotlib Finance library to create the candlestick chart.
        - The `style` for the plot is generated using the `make_mpf_style` method.
        - If `is_final` is True, additional styling and labels are applied to indicate the forecasted data.
        - The function sets custom tick labels and formats the x-axis and y-axis for better readability.
        """
        required_columns = ['time', 'high', 'low', 'open', 'close', 'source']
        for col in required_columns:
            if col not in candlestick_dataframe.columns:
                raise KeyError(f"The input DataFrame must contain '{col}' column.")
        if 'time' in candlestick_dataframe.columns:
            candlestick_dataframe['time'] = pd.to_datetime(candlestick_dataframe['time'])
        else:
            raise KeyError("The input DataFrame must contain 'time' column.")
        candlestick_dataframe.index = pd.to_datetime(candlestick_dataframe['time'], format = '%Y-%m-%d')
        historical_style = self.make_mpf_style('#00b578ff', '#d86371ff')
        fig, axes = mpf.plot(candlestick_dataframe, 
                            type = 'candle', 
                            figsize = figsize,
                            xrotation = 45, 
                            show_nontrading = True,
                            returnfig = True, 
                            style = historical_style)
        ax = axes[0]
        fig.set_dpi(dpi)
        self.set_labels(ax)
        if is_final:
            projected_data = candlestick_dataframe[candlestick_dataframe['source'] == 'projected']
            projected_data.index = pd.to_datetime(projected_data['time'], format = '%Y-%m-%d')
            projected_style = self.make_mpf_style('#000000ff', '#000000ff', '#00b578ff', '#d86371ff', '#00b578ff', '#d86371ff')
            self.plot_candlestick(projected_data, ax, projected_style)
            xlim = ax.get_xlim()
            ylim = ax.get_ylim()
            projected_start_x = mdates.date2num(projected_data.index[0])
            projected_end_x = mdates.date2num(projected_data.index[-1])
            ax.fill_betweenx(ylim, projected_start_x, projected_end_x, facecolor = '#161617ff', zorder = 0)
            label_x = projected_start_x - (xlim[1] - xlim[0]) * 0.02
            label_y = (ylim[0] + ylim[1]) / 2
            ax.text(label_x, label_y, 'simulated future', color = 'white', rotation = 'vertical', va = 'center', fontproperties = GT_America_Mono_Regular, fontsize = 6)
        else:
            min_date = candlestick_dataframe.index.min()
            max_date = candlestick_dataframe.index.max()
            extended_max_date = max_date + (max_date - min_date)
            ax.set_xlim([min_date, extended_max_date])
        custom_formatter = CustomFormatter()
        ax.yaxis.set_major_formatter(custom_formatter)
        ax.xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m-%d'))
        ax.xaxis.set_major_locator(MaxNLocator(integer = True, prune = 'both', nbins = 10))
        for label in ax.xaxis.get_ticklabels() + ax.yaxis.get_ticklabels():
            label.set_fontproperties(GT_America_Mono_Regular)
            label.set_fontsize(6)
        return(fig, ax)

    def process_and_plot_data(
        self, 
        figsize: Tuple[int, int] = (6, 4), 
        dpi: int = 200
        ) -> Tuple[plt.Figure, np.ndarray]:
        """
        ### Processes and plots the smoothed price data as a candlestick chart.

        ## Parameters:
        | Parameter  | Type             | Description                                                                                   |
        |:-----------|:-----------------|:----------------------------------------------------------------------------------------------|
        | `figsize`  | `Tuple[int, int]`| The size of the figure for the plot in inches (width, height). Default is (6, 4).             |
        | `dpi`      | `int`            | The DPI (dots per inch) setting for the figure, affecting the resolution. Default is 200.     |

        ## Returns:
        | Return Name | Type                            | Description                                                       |
        |:------------|:--------------------------------|:------------------------------------------------------------------|
        | `fig, ax`   | `Tuple[plt.Figure, np.ndarray]` | A tuple containing the figure and axes objects for the plot.      |

        ## Notes:
        - The function starts by adding a 'source' column to the smoothed price DataFrame, labeling the data as 'historical'.
        - It then converts the smoothed price data to OHLC (Open, High, Low, Close) format using the `convert_to_OHLC` method.
        - A candlestick DataFrame is generated using the `generate_candlestick_dataframe` method, targeting 30 rows.
        - Finally, the function plots the candlestick chart using the `plot_forecast_candlestick_chart` method.
        - The returned figure and axes objects can be further customized or saved as an image file.
        """
        df = self.smooth_price_dataframe
        df['source'] = 'historical'
        ohlc_df = self.convert_to_OHLC(df)
        candlestick_df = self.generate_candlestick_dataframe(ohlc_df, target_rows = 30)
        fig, ax = self.plot_forecast_candlestick_chart(candlestick_df, is_final = False, figsize = figsize, dpi = dpi)
        return(fig, ax)

    def subdivide_wave(
        self,
        start_date: Union[str, datetime], 
        end_date: Union[str, datetime], 
        start_price: float, 
        end_price: float, 
        num_subdivisions: int
        ) -> List[Tuple[datetime, float]]:
        """
        ### Subdivides a price wave into smaller segments.

        ## Parameters:
        | Parameter         | Type                  | Description                                                                                         |
        |:------------------|:----------------------|:----------------------------------------------------------------------------------------------------|
        | `start_date`      | `Union[str, datetime]`| The starting date of the wave. Can be a string in the format '%Y-%m-%d %H:%M' or a datetime object. |
        | `end_date`        | `Union[str, datetime]`| The ending date of the wave. Can be a string in the format '%Y-%m-%d %H:%M' or a datetime object.   |
        | `start_price`     | `float`               | The starting price of the wave.                                                                     |
        | `end_price`       | `float`               | The ending price of the wave.                                                                       |
        | `num_subdivisions`| `int`                 | The number of subdivisions to create within the wave.                                               |

        ## Returns:
        | Return Name      | Type                           | Description                                                                                 |
        |:-----------------|:-------------------------------|:--------------------------------------------------------------------------------------------|
        | `subdivisions`   | `List[Tuple[datetime, float]]` | A list of tuples, each containing a datetime and a price, representing the subdivided wave. |

        ## Notes:
        - This function is designed to subdivide price waves in accordance with Elliott Wave Analysis principles.
        - The number of subdivisions (`num_subdivisions`) should be either 3 or 5, corresponding to the different types of waves in Elliott Wave Analysis.
        - If `num_subdivisions` is 5, the function follows a specific pattern for combining dates and prices to simulate impulse waves.
        - If `num_subdivisions` is 3, a different pattern is followed to simulate corrective waves.
        """
        if isinstance(start_date, str):
            start_date = datetime.strptime(start_date, '%Y-%m-%d %H:%M')
        if isinstance(end_date, str):
            end_date = datetime.strptime(end_date, '%Y-%m-%d %H:%M')
        if start_date >= end_date:
            raise ValueError("Start date must be earlier than end date.")
        if start_price <= 0 or end_price <= 0:
            raise ValueError("Start and end prices must be greater than 0.")
        if num_subdivisions not in [3, 5]:
            raise ValueError("Number of subdivisions must be 3 or 5.")
        time_step = (end_date - start_date) / num_subdivisions
        price_step = (end_price - start_price) / num_subdivisions
        subdivided_dates = [start_date + i * time_step for i in range(num_subdivisions + 1)]
        subdivided_prices = [start_price + i * price_step for i in range(num_subdivisions + 1)]
        if num_subdivisions == 5:
            subdivisions = [(subdivided_dates[i], subdivided_prices[j]) for i, j in [(0, 0), (1, 2), (2, 1), (3, 4), (4, 3), (5, 5)]]
        else:
            subdivisions = [(subdivided_dates[i], subdivided_prices[j]) for i, j in [(0, 0), (1, 2), (2, 1), (3, 3)]]
        return(subdivisions)
    
    def plot_processed_prediction(
        self,
        figsize: Tuple[int, int] = (6, 2),
        dpi: int = 200
        ) -> None:
        """
        ### Plots the processed price prediction data.

        ## Parameters:
        | Parameter  | Type              | Description                                               |
        |:-----------|:------------------|:----------------------------------------------------------|
        | `figsize`  | `Tuple[int, int]` | The size of the figure for the plot. Default is (6, 2).   |
        | `dpi`      | `int`             | The DPI setting for the figure. Default is 200.           |

        ## Returns:
        None

        ## Notes:
        - This function uses Matplotlib to plot the processed prediction data.
        - The x-axis represents the date, and the y-axis represents the price prediction.
        - Custom formatting is applied to both the x-axis and y-axis.
        - The plot includes grid lines for better readability.
        - The data being plotted has been subdivided according to rudimentary Elliott Wave principles. This is to provide a more nuanced view of the price movements.
        """
        if not all(isinstance(dim, (int, float)) for dim in figsize) or len(figsize) != 2 or any(dim <= 0 for dim in figsize):
            raise ValueError("figsize must be a tuple of two positive float or integer values.")
        if not isinstance(dpi, int) or dpi <= 0:
            raise ValueError("dpi must be a positive integer.")
        sorted_dates = sorted([datetime.strptime(date, '%Y-%m-%d %H:%M') for date in self.processed_prediction.keys()])
        sorted_prices = [self.processed_prediction[date.strftime('%Y-%m-%d %H:%M')] for date in sorted_dates]
        plt.figure(figsize = figsize, dpi = dpi)
        plt.plot(sorted_dates, sorted_prices, marker = 'o')
        plt.xlabel('Date', fontproperties = GT_America_Standard_Light, fontsize = 12)
        plt.ylabel('Price Prediction', fontproperties = GT_America_Standard_Light, fontsize = 12)
        plt.title('Processed Prediction', fontproperties = GT_America_Extended_Medium, fontsize = 16)
        plt.grid(True)
        ax = plt.gca()
        custom_formatter = CustomFormatter()
        ax.yaxis.set_major_formatter(custom_formatter)
        ax.xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m-%d'))
        ax.xaxis.set_major_locator(MaxNLocator(integer = True, prune = 'both', nbins = 10))
        plt.xticks(rotation = 45)
        for label in ax.xaxis.get_ticklabels() + ax.yaxis.get_ticklabels():
            label.set_fontproperties(GT_America_Mono_Regular)
            label.set_fontsize(6)
        plt.show()
        return(None)

    def prediction_to_dataframe(
        self
        ) -> None:
        """
        ### Converts the processed prediction data to a pandas DataFrame.

        ## Parameters:
        | Parameter  | Type  | Description                                  |
        |:-----------|:------|:---------------------------------------------|
        | None       | `None`| This function does not take any parameters.  |

        ## Returns:
        | Return Name | Return Type | Description                                                                                        |
        |:------------|:------------|:---------------------------------------------------------------------------------------------------|
        | None        | `None`      | This function does not return any value; it updates the class attribute `processed_prediction_df`. |

        ## Notes:
        - This function takes the `processed_prediction` dictionary and converts it into a pandas DataFrame.
        - The DataFrame is sorted by time in ascending order.
        - The resulting DataFrame is stored in the class attribute `processed_prediction_df`.
        """
        if not isinstance(self.processed_prediction, dict):
            raise TypeError("processed_prediction must be a dictionary.")
        try:
            pred_df = pd.DataFrame(list(self.processed_prediction.items()), columns=['time', 'price'])
            pred_df['time'] = pd.to_datetime(pred_df['time'])
            pred_df.sort_values(by='time', inplace=True)
            self.processed_prediction_df = pred_df
        except Exception as e:
            raise ValueError("Error converting processed_prediction to DataFrame: " + str(e))
        return(None)
    
    def initialize_processed_prediction(
        self
        ) -> None:
        """
        ### Initializes the `processed_prediction` dictionary with the most recent data point.
        
        ## Parameters:
        None
        
        ## Returns:
        None
        
        ## Notes:
        - This function sets the `processed_prediction` dictionary with the most recent date and price from the `smooth_price_dataframe`.
        """
        try:
            df = self.smooth_price_dataframe
            if df.empty:
                raise ValueError("The smooth_price_dataframe is empty. Cannot initialize processed_prediction.")
            most_recent_data_point = df.iloc[-1]['price']
            most_recent_date = pd.Timestamp(df.iloc[-1]['time']).strftime('%Y-%m-%d %H:%M')
            self.processed_prediction = {most_recent_date: most_recent_data_point}
        except Exception as e:
            raise ValueError("Error initializing processed_prediction: " + str(e))
        return(None)
        
    def populate_processed_prediction(
        self
        ) -> None:
        """
        ### Populates the `processed_prediction` dictionary with subdivided wave data.
        
        ## Parameters:
        None
        
        ## Returns:
        None
        
        ## Notes:
        - This function sorts the `gross_prediction` and subdivides each wave according to rudimentary Elliott Wave principles.
        - The number of subdivisions is either 5 or 3, depending on the wave type.
        """
        try:
            if not isinstance(self.gross_prediction, dict):
                raise ValueError("The gross_prediction attribute must be a dictionary.")
            sorted_prediction = {k: self.gross_prediction[k] for k in sorted(self.gross_prediction)}
            if not sorted_prediction:
                raise ValueError("The gross_prediction dictionary is empty. Cannot populate processed_prediction.")
            prev_date, prev_price = list(self.processed_prediction.items())[0]
            is_trending_up = sorted_prediction[list(sorted_prediction.keys())[-1]] >= prev_price
            for date_str, price in sorted_prediction.items():
                try:
                    date = datetime.strptime(date_str, '%Y-%m-%d %H:%M')
                    is_wave_up = price >= prev_price
                    num_subdivisions = 5 if (is_trending_up and is_wave_up) or (not is_trending_up and not is_wave_up) else 3
                    subdivisions = self.subdivide_wave(prev_date, date, prev_price, price, num_subdivisions)
                    for d, p in subdivisions:
                        self.processed_prediction[d.strftime('%Y-%m-%d %H:%M')] = p
                    prev_date, prev_price = date, price
                except Exception as e:
                    raise ValueError("Error processing wave data: " + str(e))
        except Exception as e:
            raise ValueError("Error populating processed_prediction: " + str(e))
        return(None)
            
    def remove_most_recent_from_processed_prediction(
        self
        ) -> None:
        """
        ### Removes the most recent data point from the `processed_prediction` dictionary.
        
        ## Parameters:
        None
        
        ## Returns:
        None
        
        ## Notes:
        - This function removes the most recent date and price from the `processed_prediction` to avoid duplication.
        """
        try:
            if not isinstance(self.processed_prediction, dict):
                raise ValueError("The processed_prediction attribute must be a dictionary.")
            if not self.processed_prediction:
                raise ValueError("The processed_prediction dictionary is empty. Nothing to remove.")
            most_recent_date = list(self.processed_prediction.keys())[0]
            self.processed_prediction.pop(most_recent_date, None)
        except Exception as e:
            raise ValueError("Error removing most recent data point: " + str(e))
        return(None)
    
    def process_gross_prediction(
        self
        ) -> None:
        """
        ### Processes the gross prediction and populates the `processed_prediction` dictionary.
        
        ## Parameters:
        None
        
        ## Returns:
        None
        
        ## Notes:
        - This function is a wrapper that calls `initialize_processed_prediction`, `populate_processed_prediction`, and `remove_most_recent_from_processed_prediction` in sequence.
        - It also converts the processed prediction to a DataFrame and plots it.
        """
        self.initialize_processed_prediction()
        self.populate_processed_prediction()
        self.remove_most_recent_from_processed_prediction()
        self.prediction_to_dataframe()
        self.plot_processed_prediction()
    
    def label_data_source(
        self,
        df: pd.DataFrame, 
        last_row_num: int
        ) -> pd.DataFrame:
        """
        ### Labels the data source in the DataFrame.
        
        ## Parameters:
        | Parameter     | Type          | Description                                          |
        |:--------------|:--------------|:-----------------------------------------------------|
        | `df`          | `pd.DataFrame`| The DataFrame containing price and time data.        |
        | `last_row_num`| `int`         | The row number of the last historical data point.    |
        
        ## Returns:
        | Return Name   | Type          | Description                                          |
        |:--------------|:--------------|:-----------------------------------------------------|
        | `df`          | `pd.DataFrame`| The DataFrame with an added 'source' column.         |
        
        ## Notes:
        - This method adds a 'source' column to the DataFrame.
        - Rows up to `last_row_num` are labeled as 'historical'.
        - Rows after `last_row_num` are labeled as 'projected'.
        """
        if not isinstance(df, pd.DataFrame):
            raise ValueError("Input df must be a pandas DataFrame.")
        if not isinstance(last_row_num, int) or last_row_num < 0 or last_row_num >= df.shape[0]:
            raise ValueError("Invalid value for last_row_num.")
        df['source'] = 'historical'
        df.loc[last_row_num + 1:, 'source'] = 'projected'
        return(df)
    
    def initialize_extended_dataframe(
        self
        ) -> pd.DataFrame:
        """
        ### Initializes an empty DataFrame for storing extended price data.

        ## Parameters:
        | Parameter  | Type  | Description                                  |
        |:-----------|:------|:---------------------------------------------|
        | None       | `None`| This function does not take any parameters.  |

        ## Returns:
        | Return Name | Type           | Description                                         |
        |:------------|:---------------|:----------------------------------------------------|
        | `DataFrame` | `pd.DataFrame` | An empty DataFrame with columns 'time' and 'price'. |

        ## Notes:
        - This method initializes an empty DataFrame that will be used to store the extended price data.
        """
        df = pd.DataFrame(columns=['time', 'price'])
        return(df) 

    def get_last_known_data(
        self, df: pd.DataFrame
        ) -> Tuple[pd.Timestamp, float]:
        """
        ### Retrieves the last known time and price from a DataFrame.

        ## Parameters:
        | Parameter  | Type          | Description                                  |
        |:-----------|:--------------|:---------------------------------------------|
        | `df`       | `pd.DataFrame`| The DataFrame containing the price data.     |

        ## Returns:
        | Return Name | Type                         | Description                                                         |
        |:------------|:-----------------------------|:--------------------------------------------------------------------|
        | `Tuple`     | `Tuple[pd.Timestamp, float]` | A tuple containing the last known time and price from the DataFrame.|

        ## Notes:
        - This method is used to get the last known data points for time and price from a given DataFrame.
        """
        last_time = df['time'].iloc[-1]
        last_price = df['price'].iloc[-1]
        return (last_time, last_price)
    
    def interpolate_prices(
        self, 
        start_time, 
        end_time, 
        start_price, 
        end_price
        ) -> pd.DataFrame:
        """
        ### Interpolates prices between two given times and prices.

        ## Parameters:
        | Parameter    | Type          | Description                            |
        |:-------------|:--------------|:---------------------------------------|
        | `start_time` | `pd.Timestamp`| The starting time for interpolation.   |
        | `end_time`   | `pd.Timestamp`| The ending time for interpolation.     |
        | `start_price`| `float`       | The starting price for interpolation.  |
        | `end_price`  | `float`       | The ending price for interpolation.    |

        ## Returns:
        | Return Name  | Return Type   | Description                                               |
        |:-------------|:--------------|:----------------------------------------------------------|
        | `DataFrame`  | `pd.DataFrame`| A DataFrame containing the interpolated times and prices. |

        ## Notes:
        - This method uses the quadratic mean time interval (`rms_time_interval`) and a volatility measure to interpolate prices.
        - The interpolation introduces some randomness but is adjusted towards the target price.
        """
        time_intervals = pd.date_range(start=start_time, end=end_time, freq=self.rms_time_interval, inclusive='right')
        interpolated_prices = [start_price]
        for _ in range(len(time_intervals) - 1):
            random_factor = np.random.uniform(1, 3)
            random_change = np.random.normal(0, self.volatility/random_factor)
            new_price = interpolated_prices[-1] * (1 + random_change)
            adjustment_factor = (end_price - new_price)/end_price
            new_price += adjustment_factor*self.volatility*new_price
            interpolated_prices.append(new_price)
        df = pd.DataFrame({'time': time_intervals, 'price': interpolated_prices})
        return(df)

    def extend_dataframe_with_prediction(
        self
        ) -> None:
        extended_df = self.initialize_extended_dataframe()
        last_time, last_price = self.get_last_known_data(self.smooth_price_dataframe)
        for index, row in self.processed_prediction_df.iterrows():
            next_time = row['time']
            target_price = row['price']
            interpolated_df = self.interpolate_prices(last_time, next_time, last_price, target_price)
            extended_df = pd.concat([extended_df, interpolated_df], ignore_index = True)
            last_time = next_time
            last_price = target_price
        final_df = pd.concat([self.smooth_price_dataframe, extended_df], ignore_index = True)
        self.labeled_df = self.label_data_source(final_df, self.smooth_price_dataframe.index[-1])
    
    def plot_with_arrows(
        self, 
        wave_dates: List[str], 
        wave_prices: List[float]
        ) -> None:
        """
        ### Plots the price data with additional lines to indicate wave patterns.

        ## Parameters:
        | Parameter     | Type          | Description                                                  |
        |:--------------|:--------------|:-------------------------------------------------------------|
        | `wave_dates`  | `List[str]`   | A list of dates indicating the peaks/troughs of the wave.    |
        | `wave_prices` | `List[float]` | A list of prices corresponding to the wave_dates.            |

        ## Returns:
        None

        ## Notes:
        - This method takes the processed price DataFrame and plots it.
        - It then overlays arrows to indicate wave patterns based on the provided `wave_dates` and `wave_prices`.
        - The arrows are drawn from the previous point to the next point in the wave.
        - The plot is displayed using matplotlib's `plt.show()`.
        """
        if not isinstance(wave_dates, list) or not isinstance(wave_prices, list):
            raise ValueError("wave_dates and wave_prices must be lists.")
        if len(wave_dates) != len(wave_prices):
            raise ValueError("wave_dates and wave_prices must have the same length.")
        fig, ax = self.process_and_plot_data()
        df = self.smooth_price_dataframe
        last_data_point = df.iloc[-1]
        last_date = pd.Timestamp(last_data_point['time'])
        last_price = last_data_point['price']
        prev_date, prev_price = last_date, last_price
        for wave_date, wave_price in zip(wave_dates, wave_prices):
            wave_date = pd.Timestamp(wave_date)
            ax.annotate("",
                        xy = (wave_date, wave_price), 
                        xytext = (prev_date, prev_price),
                        arrowprops = dict(arrowstyle = "->", color = 'white'))
            ylim = ax.get_ylim()
            if wave_price > ylim[1]:
                ax.set_ylim(ylim[0], wave_price * 1.01)
            elif wave_price < ylim[0]:
                        ax.set_ylim(wave_price * 0.99, ylim[1])
            prev_date, prev_price = wave_date, wave_price
        plt.show()
        return(None)

    def update_arrows(
        self, 
        **kwargs: Any
        ) -> None:
        """
        ### Updates the plot with new arrows based on user input.

        ## Parameters:
        | Parameter     | Type   | Description                                         |
        |:--------------|:-------|:----------------------------------------------------|
        | `**kwargs`    | `Any`  | Keyword arguments containing wave dates and prices. |

        ## Returns:
        None

        ## Notes:
        - This method is typically called in response to user interaction with sliders or other widgets.
        - It extracts wave dates and prices from the `kwargs` and calls `plot_with_arrows` to update the plot.
        - The plot is refreshed using `clear_output(wait=True)`.
        """
        try:
            wave_dates = [pd.to_datetime(kwargs[f'wave_{i+1}_estimated_date'], unit='s').strftime('%Y-%m-%d %H:%M:%S') for i in range(5)]
            wave_prices = [kwargs[f'wave_{i+1}_price_target'] for i in range(5)]
        except KeyError as e:
            raise ValueError(f"Missing or invalid key in kwargs: {e}")
        self.plot_with_arrows(wave_dates, wave_prices)  
        clear_output(wait=True)
        return(None)

    def create_slider(
        self, 
        value: float, 
        min_val: float, 
        max_val: float, 
        step: float, 
        description: str, 
        style: Dict[str, str]
        ) -> FloatSlider:
        """
        ### Creates a FloatSlider widget with specified parameters.

        ## Parameters:
        | Parameter     | Type             | Description                                                  |
        |:--------------|:--------------   |:-------------------------------------------------------------|
        | `value`       | `float`          | The initial value of the slider.                             |
        | `min_val`     | `float`          | The minimum value of the slider.                             |
        | `max_val`     | `float`          | The maximum value of the slider.                             |
        | `step`        | `float`          | The step size for the slider.                                |
        | `description` | `str`            | The description to display alongside the slider.             |
        | `style`       | `Dict[str, str]` | A dictionary containing style attributes for the slider.     |

        ## Returns:
        | Return Name   | Type          | Description                                                  |
        |:--------------|:--------------|:-------------------------------------------------------------|
        | `slider`      | `FloatSlider` | The created FloatSlider widget.                              |

        ## Notes:
        - This method creates a FloatSlider widget using the ipywidgets library.
        - The created slider is returned and can be displayed or further customized.
        """
        slider = FloatSlider(value=value, min=min_val, max=max_val, step=step, description=description, style=style)
        return(slider)

    def create_wave_sliders(
        self,
        last_date: pd.Timestamp, 
        step_seconds: int, 
        min_data_point: float, 
        max_data_point: float, 
        description_style: Dict[str, str],
        max_date_on_plot: pd.Timestamp,
        num_time_points: int = 100
        ) -> Tuple[List[FloatSlider], List[FloatSlider]]:
        """
        ### Creates sliders for wave pattern prediction.

        ## Parameters:
        | Parameter          | Type             | Description                                                  |
        |:-------------------|:-----------------|:-------------------------------------------------------------|
        | `last_date`        | `Timestamp`      | The last date in the existing data.                          |
        | `step_seconds`     | `int`            | The step size for the date sliders in seconds.               |
        | `min_data_point`   | `float`          | The minimum value for the price sliders.                     |
        | `max_data_point`   | `float`          | The maximum value for the price sliders.                     |
        | `description_style`| `Dict[str, str]` | A dictionary containing style attributes for the sliders.    |
        | `max_date_on_plot` | `Timestamp`      | The maximum date to be plotted.                              |

        ## Returns:
        | Return Name         | Type                                          | Description                                                                     |
        |:--------------------|:----------------------------------------------|:--------------------------------------------------------------------------------|
        | `wave_date_sliders` | `List[FloatSlider]`                           | A list of sliders for selecting the dates of wave patterns.                     |
        | `wave_price_sliders`| `List[FloatSlider]`                           | A list of sliders for selecting the price targets of wave patterns.             |
        |                     | `Tuple[List[FloatSlider], List[FloatSlider]]` | A tuple containing `wave_date_sliders` and `wave_price_sliders`, in that order. |

        ## Notes:
        - This method creates two sets of sliders: one for wave dates and another for wave prices.
        - The sliders are created using the `create_slider` method.
        - The created sliders are returned as a tuple of two lists.
        """
        total_seconds = (max_date_on_plot - last_date).total_seconds()
        step_seconds = total_seconds / num_time_points
        wave_date_sliders = [self.create_slider(last_date.timestamp() + (i * step_seconds),
                                                last_date.timestamp(),
                                                max_date_on_plot.timestamp(),  
                                                step_seconds,
                                                f'Wave {i+1} Estimated Date:',
                                                description_style) for i in range(5)]

        wave_price_sliders = [self.create_slider((min_data_point * max_data_point)**(1/2),  
                                                min_data_point,
                                                max_data_point,
                                                min_data_point/10000,
                                                f'Wave {i+1} Price Target:',
                                                description_style) for i in range(5)]
        return(wave_date_sliders, wave_price_sliders)
    
    def filter_projected_rows(
        self
        ) -> pd.DataFrame:
        """
        Filters out rows labeled as 'historical' and returns a DataFrame with only 'projected' rows, reindexed from 0.

        Parameters:
        df (pd.DataFrame): The original DataFrame containing both 'historical' and 'projected' rows.

        Returns:
        pd.DataFrame: A new DataFrame containing only 'projected' rows, reindexed from 0.
        """
        filtered_df = self.labeled_df[self.labeled_df['source'] == 'projected']
        filtered_df.reset_index(drop=True, inplace=True)
        return(filtered_df)
    
    def clear_start_information_keys(
        self,
        keys: Tuple[str]
        ) -> None:
        """
        ### Clears specific keys in the global `start_information` dictionary.

        ## Parameters:
        | Parameter Name | Type       | Description                                    |
        |:---------------|:-----------|:-----------------------------------------------|
        | `keys`         | `List[str]`| List of keys to clear in the global dictionary |

        ## Returns:
        None
        """
        global start_information
        for key in keys:
            if key in start_information:
                del start_information[key]
        return(None)

    def on_ok_button_click(
        self, 
        b: Button
        ) -> None:
        """
        ### Handles the 'OK' button click event to finalize wave pattern predictions.

        ## Parameters:
        | Parameter | Type    | Description                                 |
        |:----------|:--------|:--------------------------------------------|
        | `b`       | `Button`| The button object that triggered the event. |

        ## Returns:
        None

        ## Notes:
        - This method is triggered when the 'OK' button is clicked.
        - It reads the values from `wave_date_sliders` and `wave_price_sliders` to populate the `gross_prediction` dictionary.
        - It then calls several other methods to process the prediction, extend the DataFrame, and finally plot the forecast.
        """
        for i in range(5):
            date = pd.to_datetime(self.wave_date_sliders[i].value, unit='s').strftime('%Y-%m-%d %H:%M')
            price = self.wave_price_sliders[i].value
            self.gross_prediction[date] = price
        self.process_gross_prediction()
        self.extend_dataframe_with_prediction()
        self.final_OHLC_df = self.convert_to_OHLC(self.labeled_df)
        self.candlestick_dataframe = self.generate_candlestick_dataframe(self.final_OHLC_df)
        self.plot_forecast_candlestick_chart(self.candlestick_dataframe, is_final = True, figsize = (6, 4), dpi = 200)
        self.simulation_smooth_dataframe = self.filter_projected_rows()
        self.simulation_OHLC = self.convert_to_OHLC(self.simulation_smooth_dataframe)
        self.simulation_candlestick_dataframe = self.generate_candlestick_dataframe(self.simulation_OHLC)
        self.clear_start_information_keys(('price chart', 'price chart dates'))
        copy_dates_and_prices_from_smooth_price_dataframe(self.simulation_smooth_dataframe)
        choose_uniswap_v3_range(self.CASH_symbol, self.RISK_symbol, self.simulation_candlestick_dataframe)
        return(None)

    def initialize_interactive_controls(
        self
        ) -> None:
        """
        ### Initializes and displays interactive controls for wave pattern prediction.

        ## Parameters:
        None

        ## Returns:
        None

        ## Notes:
        - This method sets up the interactive controls for the user to input wave pattern predictions.
        - It calculates the minimum and maximum values for the sliders based on the existing data.
        - It creates sliders for wave dates and prices using the `create_wave_sliders` method.
        - It sets up an 'OK' button that triggers the `on_ok_button_click` method when clicked.
        - Finally, it displays all the controls using IPython's `display` function.
        """
        df = self.smooth_price_dataframe
        min_data_point = df['price'].min() * 0.5
        max_data_point = df['price'].max() * 2.0
        last_date = pd.Timestamp(df['time'].max())
        max_date_on_plot = pd.Timestamp(df['time'].max()) + (pd.Timestamp(df['time'].max()) - pd.Timestamp(df['time'].min()))
        total_seconds = (max_date_on_plot - last_date).total_seconds()
        step_seconds = total_seconds / 6
        description_style = {'description_width': 'initial', 'font-size': '16px'}
        self.wave_date_sliders, self.wave_price_sliders = self.create_wave_sliders(last_date, step_seconds, min_data_point, max_data_point, description_style, max_date_on_plot)
        for i in range(5):
                self.wave_date_sliders[i].value = last_date.timestamp() + ((i + 1) * step_seconds)             
        ok_button = Button(description="OK")
        ok_button.on_click(self.on_ok_button_click)
        controls = interactive_output(self.update_arrows,  
                                    {**{f'wave_{i+1}_estimated_date': self.wave_date_sliders[i] for i in range(5)},
                                    **{f'wave_{i+1}_price_target': self.wave_price_sliders[i] for i in range(5)}})
        price_sliders_row = HBox(self.wave_price_sliders)
        date_sliders_row = HBox(self.wave_date_sliders)
        sliders_box = VBox([price_sliders_row, date_sliders_row, ok_button])
        display(sliders_box)
        display(controls)
        return(None)

def choose_portfolio_and_date_range(
    ) -> None:
    """
    ### Displays a set of input widgets for the user to define the portfolio and date range for the simulation.

    ## Parameters:
    None

    ## Returns:
    None

    ## Dependencies:
    | Dependency Name                              | Type       | Description                                                                                                 |
    |:---------------------------------------------|:-----------|:------------------------------------------------------------------------------------------------------------|
    | `record_token_pair`                          | `function` | Records the user-defined token pair (CASH and RISK assets) into the global `start_information` dictionary.  |
    | `record_starting_portfolio_valuation`        | `function` | Records the user-defined starting portfolio valuation into the global `start_information` dictionary.       |
    | `make_and_record_filenames`                  | `function` | Constructs and records the base filename and `.pickle` filename based on the input values.                  |
    | `get_and_record_price_data_from_user_inputs` | `function` | Retrieves and records the price data based on the user inputs.                                              |
    | `plot_candlestick_chart`                     | `function` | Plots the candlestick chart for the given CASH and RISK assets and the retrieved price data.                |
    | `choose_uniswap_v3_range`                    | `function` | Prompts the user to choose the range for the Uniswap V3 strategy based on the candlestick chart.            |

    ## Notes:
    - This function displays input widgets for the user to define the data source, token pair (CASH and RISK assets), starting portfolio valuation, start and end dates, and price timeframe.
    - The available data sources are 'CryptoCompare', 'CoinGecko', and 'CoinMarketCap'. 
    - The choice of data source affects the available options and limitations for the start and end dates and the price timeframe.
    - For 'CoinGecko', start and end dates are automatically set to the past 90 days, and the price timeframe is set to 'hour'. These fields are disabled and cannot be modified by the user.
    - The 'CoinGecko' implementation uses the free API, and users do not need to provide an API key.
    - For 'CoinMarketCap', the price timeframe is set to 'day', and this field is disabled and cannot be modified by the user.
    - For 'CryptoCompare', all fields are available.
    - The 'CoinMarketCap' and 'CryptoCompare' implementations require the user to provide a paid API key to use.
    - Upon clicking the "OK" button, the `on_ok_button_click` function is executed, processing the user inputs and calling the necessary functions to record the inputs, retrieve and plot the price data, and prompt the user to choose the Uniswap V3 range.
    """
    description_style = {'description_width': 'initial', 'font-size': '16px'}
    
    simulation_type_input = widgets.RadioButtons(options=['Back Test', 'Forecast'],
                                                 description='Simulation Type:',
                                                 style=description_style,
                                                 layout=widgets.Layout(width='1000px'))
    data_source_input = widgets.RadioButtons(options = ['CryptoCompare', 'CoinGecko', 'CoinMarketCap', 'CSV files'],
                                             description = 'Data Source:',
                                             style = description_style,
                                             layout = widgets.Layout(width = '1000px'))
    cash_input = widgets.Text(description = 'CASH (or QUOTE) asset:', 
                              style = description_style, 
                              layout = widgets.Layout(width = '1000px'))
    risk_input = widgets.Text(description = 'RISK (or BASE) asset:', 
                              style = description_style, 
                              layout = widgets.Layout(width = '1000px'))
    starting_portfolio_valuation_input = widgets.Text(description = 'Portfolio Valuation (CASH basis):', 
                                                      style = description_style, 
                                                      layout = widgets.Layout(width = '1000px'))
    start_date_input = widgets.Text(description = 'Start date (YYYY-MM-DD HH:MM):', 
                                    style = description_style, 
                                    layout = widgets.Layout(width = '1000px'))
    end_date_input = widgets.Text(description = 'End date (YYYY-MM-DD HH:MM):', 
                                  style = description_style, 
                                  layout = widgets.Layout(width = '1000px'))
    frequency_input = widgets.Text(description = 'Price timeframe:', 
                                   style = description_style, 
                                   layout = widgets.Layout(width = '1000px'))
    api_key_input = widgets.Text(description = 'API key (required for CrpytoCompare and CoinMarketCap):', 
                                 style = description_style, 
                                 layout = widgets.Layout(width = '1000px'))
    cash_csv_input = widgets.Text(description = 'CASH token CSV filename:', 
                                  style = description_style, 
                                  layout = widgets.Layout(width = '1000px'))
    risk_csv_input = widgets.Text(description = 'RISK token CSV filename:', 
                                  style = description_style, 
                                  layout = widgets.Layout(width = '1000px'))
    ok_button = widgets.Button(description = 'OK')
    label_style = "<style>.widget-label { width: 40% }</style>"
    
    def on_data_source_change(change):
        if change['new'] == 'CoinGecko':
            start_date_input.value = ''
            end_date_input.value = ''
            frequency_input.value = ''
            api_key_input.value = 'secret_CoinGecko_api_key'
            cash_csv_input.value = 'get data from API'
            risk_csv_input.value = 'get data from API'
            start_date_input.disabled = False
            end_date_input.disabled = False
            frequency_input.disabled = False
            api_key_input.disabled = True
            cash_csv_input.disabled = True
            risk_csv_input.disabled = True
        elif change['new'] == 'CoinMarketCap':
            start_date_input.value = ''
            end_date_input.value = ''
            frequency_input.value = 'automatic'
            api_key_input.value = 'secret_CoinMarketCap_api_key'
            cash_csv_input.value = 'get data from API'
            risk_csv_input.value = 'get data from API'
            start_date_input.disabled = False
            end_date_input.disabled = False
            frequency_input.disabled = True
            api_key_input.disabled = True
            cash_csv_input.disabled = True
            risk_csv_input.disabled = True
        elif change['new'] == 'CryptoCompare':
            start_date_input.value = ''
            end_date_input.value = ''
            frequency_input.value = ''
            api_key_input.value = 'secret_CryptoCompare_api_key'
            cash_csv_input.value = 'get data from API'
            risk_csv_input.value = 'get data from API'
            start_date_input.disabled = False
            end_date_input.disabled = False
            frequency_input.disabled = False
            api_key_input.disabled = True
            cash_csv_input.disabled = True
            risk_csv_input.disabled = True
        elif change['new'] == 'CSV files':
            start_date_input.value = 'get data from CSV files'
            end_date_input.value = 'get data from CSV files'
            frequency_input.value = 'get data from CSV files'
            api_key_input.value = 'get data from CSV files'
            cash_csv_input.value = ''
            risk_csv_input.value = ''
            start_date_input.disabled = True
            end_date_input.disabled = True
            frequency_input.disabled = True
            api_key_input.disabled = True
            cash_csv_input.disabled = False
            risk_csv_input.disabled = False
        return(None)
      
    data_source_input.observe(on_data_source_change, names = 'value')
    
    def on_ok_button_click(
        button: widgets.Button
        ) -> None:
        """
        ### Processes the user inputs from the input widgets and calls the necessary functions.

        ## Parameters:
        | Parameter Name | Type             | Description                      |
        |:---------------|:-----------------|:---------------------------------|
        | `button`       | `widgets.Button` | The "OK" button widget instance. |

        ## Returns:
        None

        ## Dependencies:
        | Dependency Name                              | Type       | Description                                                                                                           |
        |:---------------------------------------------|:-----------|:----------------------------------------------------------------------------------------------------------------------|
        | `record_token_pair`                          | `function` | Records the user-defined token pair (`CASH` and `RISK` assets) into the global `start_information` dictionary.        |
        | `record_starting_portfolio_valuation`        | `function` | Records the user-defined starting portfolio valuation into the global `start_information` dictionary.                 |
        | `make_and_record_filenames`                  | `function` | Constructs and records the base filename and `.pickle` filename based on the input values.                            |
        | `get_and_record_price_data_from_user_inputs` | `function` | Retrieves and records the price data based on the user inputs.                                                        |
        | `plot_candlestick_chart`                     | `function` | Plots the candlestick chart for the given `CASH` and `RISK` assets and the retrieved price data.                      |
        | `choose_uniswap_v3_range`                    | `function` | Prompts the user to choose the range for the Uniswap V3 strategy based on the candlestick chart.                      |

        ## Notes:
        - This function is called when the user clicks the "OK" button in the `choose_portfolio_and_date_range` function.
        - It processes the user inputs, records the token pair and starting portfolio valuation, constructs the filenames, retrieves and records the price data, plots the candlestick chart, and calls the `choose_uniswap_v3_range` function to prompt the user to choose the Uniswap V3 range.
        """
        input_widgets.close()
        instructions.close()
        print("Fetching data and calculating the cross-pair prices...")
        print("The candlestick chart corresponding to your RISK/CASH pair will appear here shortly.")
        record_starting_portfolio_valuation(starting_portfolio_valuation_input.value)
        base_filename = make_and_record_filenames(cash_input.value,
                                                  risk_input.value,
                                                  start_date_input.value,
                                                  end_date_input.value)
        if api_key_input.value == 'secret_CoinMarketCap_api_key':
            secret_API_key = secret_CoinMarketCap_api_key
        elif api_key_input.value == 'secret_CryptoCompare_api_key':
            secret_API_key = secret_CryptoCompare_api_key
        elif api_key_input.value == 'secret_CoinGecko_api_key':
            secret_API_key = secret_CoinGecko_api_key
        else:
            secret_API_key = None
        CASH_symbol, RISK_symbol, candlestick_dataframe = get_and_record_price_data_from_user_inputs(data_source_input.value,   
                                                                                                     cash_input.value, 
                                                                                                     risk_input.value, 
                                                                                                     frequency_input.value, 
                                                                                                     start_date_input.value, 
                                                                                                     end_date_input.value, 
                                                                                                     secret_API_key, 
                                                                                                     (cash_csv_input.value, risk_csv_input.value),
                                                                                                     base_filename)
        record_token_pair(CASH_symbol, RISK_symbol)
        plot_candlestick_chart(CASH_symbol, RISK_symbol, candlestick_dataframe)
        if simulation_type_input.value == 'Forecast':
            print('Forecast')
            forecast = PriceForecast(CASH_symbol, RISK_symbol, base_filename)
        elif simulation_type_input.value == 'Back Test':
            print('Back Test')
            choose_uniswap_v3_range(CASH_symbol, RISK_symbol, candlestick_dataframe)
        return(None)
    input_widgets = widgets.VBox([widgets.HTML(label_style),
                                  simulation_type_input,
                                  data_source_input,
                                  cash_input, 
                                  risk_input, 
                                  start_date_input, 
                                  end_date_input,
                                  starting_portfolio_valuation_input, 
                                  frequency_input,
                                  api_key_input,
                                  cash_csv_input,
                                  risk_csv_input,
                                  ok_button])
    instructions = widgets.HTML(
    """
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@150&display=swap');
    </style>
    <p style='font-family: "Roboto", sans-serif; font-size: 14px;'>
    Instructions: <br>
    Use the radio boxes to select the source of the price data to perform the simulation. <br>
    This resource was built and tested with paid subscriptions to the CryptoCompare, CoinGecko and CoinMarketCap APIs, and the free CoinGecko API. <br>
    For access to the full scope of available data, API plans can be purchased at: <br>
    <ul>
    <li> CryptoCompare: "https://min-api.cryptocompare.com/pricing" </li>
    <li> CoinGecko: "https://www.coingecko.com/en/api/pricing" </li>
    <li> CoinMarketCap: "https://coinmarketcap.com/api/pricing/" </li>
    </ul>
    <p style='font-family: "Roboto", sans-serif; font-size: 14px;'>
    The CASH and RISK fields can accept token ticker symbols (e.g. 'ETH' or 'BTC') or API specific IDs (e.g. 'ethereum' or 'bitcoin' for CoinGecko, '1027' or '1' for CoinMarketCap). <br>
    The start and end dates should be given in YYYY-MM-DD HH:MM format, only. <br>
    The portfolio valuation can be literally any number, and will reflect the combined value of both CASH and RISK tokens, in CASH basis, at the start of the simulation. <br>
    When using CryptoCompare or CoinGecko, the granularity of the data can be adjusted with the `Price Timeframe` field. <br>
    <ul>
    <li> CryptoCompare: 'day', 'hour', or 'minute' are valid inputs; minute data is only available for the last 7 days. </li>
    <li> CoinGecko: 'daily' or 'hourly' are valid inputs; hourly data is available for the last 90 days on the free API, and the last 4 years on the paid API. </li>
    <li> CoinMarketCap: The endpoint used in this program causes the API to select the granularity automatically. </li>
    </ul>
    <p style='font-family: "Roboto", sans-serif; font-size: 14px;'>
    The API key field cannot be edited. To use your own API key: <br>
    <ul>
    <li> Environment Variable (recommended): assign the API key as secret_CryptoCompare_api_key, secret_CoinGecko_api_key, or secret_CoinMarketCap_api_key. </li>
    <li> Local Binary File (not recommended): save the API key as a string in a dedicated binary named secret_CryptoCompare_api_key.pickle, secret_CoinGecko_api_key.pickle, or secret_CoinMarketCap_api_key.pickle </li>
    </ul>
    <p style='font-family: "Roboto", sans-serif; font-size: 14px;'>
    Alternatively, price data can be provided via a CSV file; both snapshot and OHLC data types are supported. <br>
    If providing your own CSV files, please make sure the date and price (or open, high, low, close) columns are appropriately labelled. <br>
    Make sure that both the CASH and RISK token prices are quoted in the same numeraire (e.g. USD). <br>
    Provide the filenames as-is (e.g. 'BTCUSD.csv'), and make sure the file is available locally or via PATH. <br>
    </p>
    """
    )
    ok_button.on_click(on_ok_button_click)
    display(input_widgets, instructions)
    on_data_source_change({'new': 'CryptoCompare'})
    return(None)

def start(
    start_information_filename: Union[str, None] = None
    ) -> None:
    """
    ### Starts the simulation with the given start information file or prompts the user to select a portfolio and date range.

    ## Parameters:
    | Parameter Name                  | Type               | Description                                                                                           |
    |:--------------------------------|:-------------------|:------------------------------------------------------------------------------------------------------|
    | `start_information_filename`    | `Union[str, None]` | The name of the start information file (if provided) or `None` if the user should choose a portfolio. |

    ## Returns:
    None

    ## Dependencies:
    | Dependency Name                   | Type       | Description                                                                                       |
    |:----------------------------------|:-----------|:--------------------------------------------------------------------------------------------------|
    | `run_simulation`                  | `function` | Runs the simulation using the start information from the specified file.                          |
    | `choose_portfolio_and_date_range` | `function` | Prompts the user to choose a portfolio and date range if no start information file is provided.   |

    ## Notes:
    - If `start_information_filename` is not `None`, the function will attempt to run the simulation using the start information from the specified file.
    - If `start_information_filename` is `None`, the function will prompt the user to choose a portfolio and date range by calling the `choose_portfolio_and_date_range` function.
    """
    if start_information_filename:
        the_simulation(start_information_filename)
    else:
        choose_portfolio_and_date_range()
    return(None)

###################################################################################################

def format(values: list[Decimal]) -> list[str]:
    return [f'{value:.18f}'.rstrip('0').rstrip('.') for value in values]

def parse(obj: any) -> any:
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
        'price'                 : format(obj['simulation recorder']['RISK price'                  ]),
    }

def run_simulation(config: dict) -> dict:
    return parse(the_simulation(config))
