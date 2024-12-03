export const CarbonPOL: any[] = [
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'address',
        name: 'previousAdmin',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'address',
        name: 'newAdmin',
        type: 'address',
      },
    ],
    name: 'AdminChanged',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'beacon',
        type: 'address',
      },
    ],
    name: 'BeaconUpgraded',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'implementation',
        type: 'address',
      },
    ],
    name: 'Upgraded',
    type: 'event',
  },
  {
    stateMutability: 'payable',
    type: 'fallback',
  },
  {
    inputs: [],
    name: 'admin',
    outputs: [
      {
        internalType: 'address',
        name: 'admin_',
        type: 'address',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'implementation',
    outputs: [
      {
        internalType: 'address',
        name: 'implementation_',
        type: 'address',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'newImplementation',
        type: 'address',
      },
    ],
    name: 'upgradeTo',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'newImplementation',
        type: 'address',
      },
      {
        internalType: 'bytes',
        name: 'data',
        type: 'bytes',
      },
    ],
    name: 'upgradeToAndCall',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    stateMutability: 'payable',
    type: 'receive',
  },
  {
    inputs: [],
    name: 'AccessDenied',
    type: 'error',
  },
  {
    inputs: [],
    name: 'AlreadyInitialized',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InsufficientAmountForTrading',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InsufficientNativeTokenSent',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidAddress',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidPrice',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidToken',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidTrade',
    type: 'error',
  },
  {
    inputs: [],
    name: 'Overflow',
    type: 'error',
  },
  {
    inputs: [],
    name: 'TradingDisabled',
    type: 'error',
  },
  {
    inputs: [],
    name: 'ZeroValue',
    type: 'error',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'uint128',
        name: 'prevEthSaleAmount',
        type: 'uint128',
      },
      {
        indexed: false,
        internalType: 'uint128',
        name: 'newEthSaleAmount',
        type: 'uint128',
      },
    ],
    name: 'EthSaleAmountUpdated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'uint8',
        name: 'version',
        type: 'uint8',
      },
    ],
    name: 'Initialized',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'uint32',
        name: 'prevMarketPriceMultiply',
        type: 'uint32',
      },
      {
        indexed: false,
        internalType: 'uint32',
        name: 'newMarketPriceMultiply',
        type: 'uint32',
      },
    ],
    name: 'MarketPriceMultiplyUpdated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'uint128',
        name: 'prevMinEthSaleAmount',
        type: 'uint128',
      },
      {
        indexed: false,
        internalType: 'uint128',
        name: 'newMinEthSaleAmount',
        type: 'uint128',
      },
    ],
    name: 'MinEthSaleAmountUpdated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'uint32',
        name: 'prevPriceDecayHalfLife',
        type: 'uint32',
      },
      {
        indexed: false,
        internalType: 'uint32',
        name: 'newPriceDecayHalfLife',
        type: 'uint32',
      },
    ],
    name: 'PriceDecayHalfLifeUpdated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'Token',
        name: 'token',
        type: 'address',
      },
      {
        components: [
          {
            internalType: 'uint128',
            name: 'sourceAmount',
            type: 'uint128',
          },
          {
            internalType: 'uint128',
            name: 'targetAmount',
            type: 'uint128',
          },
        ],
        indexed: false,
        internalType: 'struct ICarbonPOL.Price',
        name: 'price',
        type: 'tuple',
      },
    ],
    name: 'PriceUpdated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'role',
        type: 'bytes32',
      },
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'previousAdminRole',
        type: 'bytes32',
      },
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'newAdminRole',
        type: 'bytes32',
      },
    ],
    name: 'RoleAdminChanged',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'role',
        type: 'bytes32',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'sender',
        type: 'address',
      },
    ],
    name: 'RoleGranted',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'role',
        type: 'bytes32',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'sender',
        type: 'address',
      },
    ],
    name: 'RoleRevoked',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'caller',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'Token',
        name: 'token',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint128',
        name: 'sourceAmount',
        type: 'uint128',
      },
      {
        indexed: false,
        internalType: 'uint128',
        name: 'targetAmount',
        type: 'uint128',
      },
    ],
    name: 'TokenTraded',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'Token',
        name: 'token',
        type: 'address',
      },
      {
        components: [
          {
            internalType: 'uint128',
            name: 'sourceAmount',
            type: 'uint128',
          },
          {
            internalType: 'uint128',
            name: 'targetAmount',
            type: 'uint128',
          },
        ],
        indexed: false,
        internalType: 'struct ICarbonPOL.Price',
        name: 'price',
        type: 'tuple',
      },
    ],
    name: 'TradingEnabled',
    type: 'event',
  },
  {
    inputs: [],
    name: 'DEFAULT_ADMIN_ROLE',
    outputs: [
      {
        internalType: 'bytes32',
        name: '',
        type: 'bytes32',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'Token',
        name: 'token',
        type: 'address',
      },
    ],
    name: 'amountAvailableForTrading',
    outputs: [
      {
        internalType: 'uint128',
        name: '',
        type: 'uint128',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'Token',
        name: 'token',
        type: 'address',
      },
      {
        components: [
          {
            internalType: 'uint128',
            name: 'sourceAmount',
            type: 'uint128',
          },
          {
            internalType: 'uint128',
            name: 'targetAmount',
            type: 'uint128',
          },
        ],
        internalType: 'struct ICarbonPOL.Price',
        name: 'price',
        type: 'tuple',
      },
    ],
    name: 'enableTrading',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: 'uint128',
            name: 'sourceAmount',
            type: 'uint128',
          },
          {
            internalType: 'uint128',
            name: 'targetAmount',
            type: 'uint128',
          },
        ],
        internalType: 'struct ICarbonPOL.Price',
        name: 'price',
        type: 'tuple',
      },
    ],
    name: 'enableTradingETH',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'ethSaleAmount',
    outputs: [
      {
        components: [
          {
            internalType: 'uint128',
            name: 'initial',
            type: 'uint128',
          },
          {
            internalType: 'uint128',
            name: 'current',
            type: 'uint128',
          },
        ],
        internalType: 'struct ICarbonPOL.EthSaleAmount',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'Token',
        name: 'token',
        type: 'address',
      },
      {
        internalType: 'uint128',
        name: 'targetAmount',
        type: 'uint128',
      },
    ],
    name: 'expectedTradeInput',
    outputs: [
      {
        internalType: 'uint128',
        name: '',
        type: 'uint128',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'Token',
        name: 'token',
        type: 'address',
      },
      {
        internalType: 'uint128',
        name: 'sourceAmount',
        type: 'uint128',
      },
    ],
    name: 'expectedTradeReturn',
    outputs: [
      {
        internalType: 'uint128',
        name: '',
        type: 'uint128',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'role',
        type: 'bytes32',
      },
    ],
    name: 'getRoleAdmin',
    outputs: [
      {
        internalType: 'bytes32',
        name: '',
        type: 'bytes32',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'role',
        type: 'bytes32',
      },
      {
        internalType: 'uint256',
        name: 'index',
        type: 'uint256',
      },
    ],
    name: 'getRoleMember',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'role',
        type: 'bytes32',
      },
    ],
    name: 'getRoleMemberCount',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'role',
        type: 'bytes32',
      },
      {
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
    ],
    name: 'grantRole',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'role',
        type: 'bytes32',
      },
      {
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
    ],
    name: 'hasRole',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'initialize',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'marketPriceMultiply',
    outputs: [
      {
        internalType: 'uint32',
        name: '',
        type: 'uint32',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'minEthSaleAmount',
    outputs: [
      {
        internalType: 'uint128',
        name: '',
        type: 'uint128',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes',
        name: 'data',
        type: 'bytes',
      },
    ],
    name: 'postUpgrade',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'priceDecayHalfLife',
    outputs: [
      {
        internalType: 'uint32',
        name: '',
        type: 'uint32',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'role',
        type: 'bytes32',
      },
      {
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
    ],
    name: 'renounceRole',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'role',
        type: 'bytes32',
      },
      {
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
    ],
    name: 'revokeRole',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'roleAdmin',
    outputs: [
      {
        internalType: 'bytes32',
        name: '',
        type: 'bytes32',
      },
    ],
    stateMutability: 'pure',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint128',
        name: 'newEthSaleAmount',
        type: 'uint128',
      },
    ],
    name: 'setEthSaleAmount',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint32',
        name: 'newMarketPriceMultiply',
        type: 'uint32',
      },
    ],
    name: 'setMarketPriceMultiply',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint128',
        name: 'newMinEthSaleAmount',
        type: 'uint128',
      },
    ],
    name: 'setMinEthSaleAmount',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint32',
        name: 'newPriceDecayHalfLife',
        type: 'uint32',
      },
    ],
    name: 'setPriceDecayHalfLife',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes4',
        name: 'interfaceId',
        type: 'bytes4',
      },
    ],
    name: 'supportsInterface',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'Token',
        name: 'token',
        type: 'address',
      },
    ],
    name: 'tokenPrice',
    outputs: [
      {
        components: [
          {
            internalType: 'uint128',
            name: 'sourceAmount',
            type: 'uint128',
          },
          {
            internalType: 'uint128',
            name: 'targetAmount',
            type: 'uint128',
          },
        ],
        internalType: 'struct ICarbonPOL.Price',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'Token',
        name: 'token',
        type: 'address',
      },
      {
        internalType: 'uint128',
        name: 'targetAmount',
        type: 'uint128',
      },
    ],
    name: 'trade',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'Token',
        name: 'token',
        type: 'address',
      },
    ],
    name: 'tradingEnabled',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'version',
    outputs: [
      {
        internalType: 'uint16',
        name: '',
        type: 'uint16',
      },
    ],
    stateMutability: 'pure',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_logic',
        type: 'address',
      },
      {
        internalType: 'address',
        name: 'admin_',
        type: 'address',
      },
      {
        internalType: 'bytes',
        name: '_data',
        type: 'bytes',
      },
    ],
    stateMutability: 'payable',
    type: 'constructor',
  },
];
