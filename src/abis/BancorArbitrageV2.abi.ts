export const BancorArbitrageV2: any[] = [
  {
    inputs: [],
    name: 'AccessDenied',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'target',
        type: 'address',
      },
    ],
    name: 'AddressEmptyCode',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'admin',
        type: 'address',
      },
    ],
    name: 'ERC1967InvalidAdmin',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'implementation',
        type: 'address',
      },
    ],
    name: 'ERC1967InvalidImplementation',
    type: 'error',
  },
  {
    inputs: [],
    name: 'ERC1967NonPayable',
    type: 'error',
  },
  {
    inputs: [],
    name: 'FailedCall',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidAddress',
    type: 'error',
  },
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
        name: '',
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
        name: '',
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
    name: 'AccessControlBadConfirmation',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
      {
        internalType: 'bytes32',
        name: 'neededRole',
        type: 'bytes32',
      },
    ],
    name: 'AccessControlUnauthorizedAccount',
    type: 'error',
  },
  {
    inputs: [],
    name: 'AlreadyInitialized',
    type: 'error',
  },
  {
    inputs: [],
    name: 'IR',
    type: 'error',
  },
  {
    inputs: [],
    name: 'IS',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'balance',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'needed',
        type: 'uint256',
      },
    ],
    name: 'InsufficientBalance',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InsufficientMinTargetAmount',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidETHAmountSent',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidFee',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidFlashLoanCaller',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidFlashloanFormat',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidFlashloanPlatformId',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidInitialAndFinalTokens',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidInitialization',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidValue',
    type: 'error',
  },
  {
    inputs: [],
    name: 'NotInitializing',
    type: 'error',
  },
  {
    inputs: [],
    name: 'ReentrancyGuardReentrantCall',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'token',
        type: 'address',
      },
    ],
    name: 'SafeERC20FailedOperation',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'exchange',
        type: 'address',
      },
    ],
    name: 'TradeFailed',
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
        indexed: true,
        internalType: 'address',
        name: 'caller',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'address[]',
        name: 'exchanges',
        type: 'address[]',
      },
      {
        indexed: false,
        internalType: 'address[]',
        name: 'tokenPath',
        type: 'address[]',
      },
      {
        indexed: false,
        internalType: 'address[]',
        name: 'sourceTokens',
        type: 'address[]',
      },
      {
        indexed: false,
        internalType: 'uint256[]',
        name: 'sourceAmounts',
        type: 'uint256[]',
      },
      {
        indexed: false,
        internalType: 'uint256[]',
        name: 'protocolAmounts',
        type: 'uint256[]',
      },
      {
        indexed: false,
        internalType: 'uint256[]',
        name: 'rewardAmounts',
        type: 'uint256[]',
      },
    ],
    name: 'ArbitrageExecuted',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'contract Token',
        name: 'token',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'caller',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'target',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
    ],
    name: 'FundsWithdrawn',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'uint64',
        name: 'version',
        type: 'uint64',
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
        name: 'prevPercentagePPM',
        type: 'uint32',
      },
      {
        indexed: false,
        internalType: 'uint32',
        name: 'newPercentagePPM',
        type: 'uint32',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'prevMaxAmount',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'newMaxAmount',
        type: 'uint256',
      },
    ],
    name: 'RewardsUpdated',
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
        internalType: 'address[]',
        name: '',
        type: 'address[]',
      },
      {
        internalType: 'uint256[]',
        name: '',
        type: 'uint256[]',
      },
      {
        internalType: 'uint256[]',
        name: '',
        type: 'uint256[]',
      },
      {
        internalType: 'address',
        name: 'initiator',
        type: 'address',
      },
      {
        internalType: 'bytes',
        name: 'params',
        type: 'bytes',
      },
    ],
    name: 'executeOperation',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: 'uint16',
            name: 'platformId',
            type: 'uint16',
          },
          {
            internalType: 'address',
            name: 'platformAddress',
            type: 'address',
          },
          {
            internalType: 'contract IERC20[]',
            name: 'sourceTokens',
            type: 'address[]',
          },
          {
            internalType: 'uint256[]',
            name: 'sourceAmounts',
            type: 'uint256[]',
          },
        ],
        internalType: 'struct BancorArbitrage.Flashloan[]',
        name: 'flashloans',
        type: 'tuple[]',
      },
      {
        components: [
          {
            internalType: 'address',
            name: 'exchange',
            type: 'address',
          },
          {
            internalType: 'contract Token',
            name: 'sourceToken',
            type: 'address',
          },
          {
            internalType: 'contract Token',
            name: 'targetToken',
            type: 'address',
          },
          {
            internalType: 'uint96',
            name: 'sourceAmountIndex',
            type: 'uint96',
          },
          {
            internalType: 'uint256',
            name: 'sourceAmount',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'minTargetAmount',
            type: 'uint256',
          },
          {
            internalType: 'bytes',
            name: 'tradeData',
            type: 'bytes',
          },
        ],
        internalType: 'struct BancorArbitrage.TradeRoute[]',
        name: 'routes',
        type: 'tuple[]',
      },
    ],
    name: 'flashloanAndArb',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: 'address',
            name: 'exchange',
            type: 'address',
          },
          {
            internalType: 'contract Token',
            name: 'sourceToken',
            type: 'address',
          },
          {
            internalType: 'contract Token',
            name: 'targetToken',
            type: 'address',
          },
          {
            internalType: 'uint96',
            name: 'sourceAmountIndex',
            type: 'uint96',
          },
          {
            internalType: 'uint256',
            name: 'sourceAmount',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'minTargetAmount',
            type: 'uint256',
          },
          {
            internalType: 'bytes',
            name: 'tradeData',
            type: 'bytes',
          },
        ],
        internalType: 'struct BancorArbitrage.TradeRoute[]',
        name: 'routes',
        type: 'tuple[]',
      },
      {
        internalType: 'contract Token',
        name: 'token',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: 'sourceAmount',
        type: 'uint256',
      },
    ],
    name: 'fundAndArb',
    outputs: [],
    stateMutability: 'payable',
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
    ],
    name: 'getRoleMembers',
    outputs: [
      {
        internalType: 'address[]',
        name: '',
        type: 'address[]',
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
    inputs: [
      {
        internalType: 'address',
        name: 'caller',
        type: 'address',
      },
      {
        internalType: 'contract IERC20',
        name: 'erc20Token',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'feeAmount',
        type: 'uint256',
      },
      {
        internalType: 'bytes',
        name: 'data',
        type: 'bytes',
      },
    ],
    name: 'onFlashLoan',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bool',
        name: 'checkVersion',
        type: 'bool',
      },
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
    inputs: [
      {
        internalType: 'contract IERC20[]',
        name: 'tokens',
        type: 'address[]',
      },
      {
        internalType: 'uint256[]',
        name: 'amounts',
        type: 'uint256[]',
      },
      {
        internalType: 'uint256[]',
        name: 'feeAmounts',
        type: 'uint256[]',
      },
      {
        internalType: 'bytes',
        name: 'userData',
        type: 'bytes',
      },
    ],
    name: 'receiveFlashLoan',
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
        name: 'callerConfirmation',
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
    name: 'rewards',
    outputs: [
      {
        components: [
          {
            internalType: 'uint32',
            name: 'percentagePPM',
            type: 'uint32',
          },
          {
            internalType: 'uint128',
            name: 'maxAmount',
            type: 'uint128',
          },
        ],
        internalType: 'struct BancorArbitrage.Rewards',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
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
    inputs: [],
    name: 'roleAssetManager',
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
    inputs: [],
    name: 'roleExecutor',
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
        internalType: 'address[]',
        name: 'platforms',
        type: 'address[]',
      },
      {
        internalType: 'contract Token[]',
        name: 'tokens',
        type: 'address[]',
      },
    ],
    name: 'setInfiniteAllowance',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'permit2',
        type: 'address',
      },
      {
        internalType: 'address[]',
        name: 'platforms',
        type: 'address[]',
      },
      {
        internalType: 'contract Token[]',
        name: 'tokens',
        type: 'address[]',
      },
    ],
    name: 'setInfinitePermit2Allowance',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: 'uint32',
            name: 'percentagePPM',
            type: 'uint32',
          },
          {
            internalType: 'uint128',
            name: 'maxAmount',
            type: 'uint128',
          },
        ],
        internalType: 'struct BancorArbitrage.Rewards',
        name: 'newRewards',
        type: 'tuple',
      },
    ],
    name: 'setRewards',
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
        internalType: 'contract Token',
        name: 'token',
        type: 'address',
      },
      {
        internalType: 'address payable',
        name: 'target',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
    ],
    name: 'withdrawFunds',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'logic',
        type: 'address',
      },
      {
        internalType: 'address',
        name: 'initAdmin',
        type: 'address',
      },
      {
        internalType: 'bytes',
        name: 'data',
        type: 'bytes',
      },
    ],
    stateMutability: 'payable',
    type: 'constructor',
  },
];
