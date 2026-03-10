/**
 * Minimal ABI for GradientController contract.
 * The GradientController shares the same pairs()/strategiesByPair()/strategiesByPairCount() interface
 * as CarbonController, but with gradient-specific order tuples.
 *
 * Order tuple: (uint128 liquidity, uint64 initialPrice, uint32 tradingStartTime, uint32 expiry, uint32 multiFactor, uint8 gradientType)
 */
export const GradientController: any[] = [
  {
    inputs: [
      { internalType: 'uint128', name: 'startIndex', type: 'uint128' },
      { internalType: 'uint128', name: 'endIndex', type: 'uint128' },
    ],
    name: 'pairs',
    outputs: [
      {
        components: [
          { internalType: 'address', name: 'token0', type: 'address' },
          { internalType: 'address', name: 'token1', type: 'address' },
        ],
        internalType: 'struct Token[2][]',
        name: '',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'token0', type: 'address' },
      { internalType: 'address', name: 'token1', type: 'address' },
    ],
    name: 'strategiesByPairCount',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'token0', type: 'address' },
      { internalType: 'address', name: 'token1', type: 'address' },
      { internalType: 'uint256', name: 'startIndex', type: 'uint256' },
      { internalType: 'uint256', name: 'endIndex', type: 'uint256' },
    ],
    name: 'strategiesByPair',
    outputs: [
      {
        components: [
          { internalType: 'uint256', name: 'id', type: 'uint256' },
          { internalType: 'address', name: 'owner', type: 'address' },
          { internalType: 'address[2]', name: 'tokens', type: 'address[2]' },
          {
            components: [
              { internalType: 'uint128', name: 'liquidity', type: 'uint128' },
              { internalType: 'uint64', name: 'initialPrice', type: 'uint64' },
              { internalType: 'uint32', name: 'tradingStartTime', type: 'uint32' },
              { internalType: 'uint32', name: 'expiry', type: 'uint32' },
              { internalType: 'uint32', name: 'multiFactor', type: 'uint32' },
              { internalType: 'uint8', name: 'gradientType', type: 'uint8' },
            ],
            internalType: 'struct Order[2]',
            name: 'orders',
            type: 'tuple[2]',
          },
        ],
        internalType: 'struct Strategy[]',
        name: '',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: 'uint256', name: 'id', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'owner', type: 'address' },
      { indexed: true, internalType: 'address', name: 'token0', type: 'address' },
      { indexed: true, internalType: 'address', name: 'token1', type: 'address' },
      {
        components: [
          { internalType: 'uint128', name: 'liquidity', type: 'uint128' },
          { internalType: 'uint64', name: 'initialPrice', type: 'uint64' },
          { internalType: 'uint32', name: 'tradingStartTime', type: 'uint32' },
          { internalType: 'uint32', name: 'expiry', type: 'uint32' },
          { internalType: 'uint32', name: 'multiFactor', type: 'uint32' },
          { internalType: 'uint8', name: 'gradientType', type: 'uint8' },
        ],
        indexed: false,
        internalType: 'struct Order',
        name: 'order0',
        type: 'tuple',
      },
      {
        components: [
          { internalType: 'uint128', name: 'liquidity', type: 'uint128' },
          { internalType: 'uint64', name: 'initialPrice', type: 'uint64' },
          { internalType: 'uint32', name: 'tradingStartTime', type: 'uint32' },
          { internalType: 'uint32', name: 'expiry', type: 'uint32' },
          { internalType: 'uint32', name: 'multiFactor', type: 'uint32' },
          { internalType: 'uint8', name: 'gradientType', type: 'uint8' },
        ],
        indexed: false,
        internalType: 'struct Order',
        name: 'order1',
        type: 'tuple',
      },
    ],
    name: 'StrategyCreated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'id', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'token0', type: 'address' },
      { indexed: true, internalType: 'address', name: 'token1', type: 'address' },
      {
        components: [
          { internalType: 'uint128', name: 'liquidity', type: 'uint128' },
          { internalType: 'uint64', name: 'initialPrice', type: 'uint64' },
          { internalType: 'uint32', name: 'tradingStartTime', type: 'uint32' },
          { internalType: 'uint32', name: 'expiry', type: 'uint32' },
          { internalType: 'uint32', name: 'multiFactor', type: 'uint32' },
          { internalType: 'uint8', name: 'gradientType', type: 'uint8' },
        ],
        indexed: false,
        internalType: 'struct Order',
        name: 'order0',
        type: 'tuple',
      },
      {
        components: [
          { internalType: 'uint128', name: 'liquidity', type: 'uint128' },
          { internalType: 'uint64', name: 'initialPrice', type: 'uint64' },
          { internalType: 'uint32', name: 'tradingStartTime', type: 'uint32' },
          { internalType: 'uint32', name: 'expiry', type: 'uint32' },
          { internalType: 'uint32', name: 'multiFactor', type: 'uint32' },
          { internalType: 'uint8', name: 'gradientType', type: 'uint8' },
        ],
        indexed: false,
        internalType: 'struct Order',
        name: 'order1',
        type: 'tuple',
      },
    ],
    name: 'StrategyUpdated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: 'uint256', name: 'id', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'owner', type: 'address' },
      { indexed: true, internalType: 'address', name: 'token0', type: 'address' },
      { indexed: true, internalType: 'address', name: 'token1', type: 'address' },
      {
        components: [
          { internalType: 'uint128', name: 'liquidity', type: 'uint128' },
          { internalType: 'uint64', name: 'initialPrice', type: 'uint64' },
          { internalType: 'uint32', name: 'tradingStartTime', type: 'uint32' },
          { internalType: 'uint32', name: 'expiry', type: 'uint32' },
          { internalType: 'uint32', name: 'multiFactor', type: 'uint32' },
          { internalType: 'uint8', name: 'gradientType', type: 'uint8' },
        ],
        indexed: false,
        internalType: 'struct Order',
        name: 'order0',
        type: 'tuple',
      },
      {
        components: [
          { internalType: 'uint128', name: 'liquidity', type: 'uint128' },
          { internalType: 'uint64', name: 'initialPrice', type: 'uint64' },
          { internalType: 'uint32', name: 'tradingStartTime', type: 'uint32' },
          { internalType: 'uint32', name: 'expiry', type: 'uint32' },
          { internalType: 'uint32', name: 'multiFactor', type: 'uint32' },
          { internalType: 'uint8', name: 'gradientType', type: 'uint8' },
        ],
        indexed: false,
        internalType: 'struct Order',
        name: 'order1',
        type: 'tuple',
      },
    ],
    name: 'StrategyDeleted',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'trader', type: 'address' },
      { indexed: true, internalType: 'address', name: 'sourceToken', type: 'address' },
      { indexed: true, internalType: 'address', name: 'targetToken', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'sourceAmount', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'targetAmount', type: 'uint256' },
      { indexed: false, internalType: 'uint128', name: 'tradingFeeAmount', type: 'uint128' },
      { indexed: false, internalType: 'bool', name: 'byTargetAmount', type: 'bool' },
    ],
    name: 'TokensTraded',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint128', name: 'pairId', type: 'uint128' },
      { indexed: true, internalType: 'address', name: 'token0', type: 'address' },
      { indexed: true, internalType: 'address', name: 'token1', type: 'address' },
    ],
    name: 'PairCreated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'id', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'token0', type: 'address' },
      { indexed: true, internalType: 'address', name: 'token1', type: 'address' },
      { indexed: false, internalType: 'uint128', name: 'liquidity0', type: 'uint128' },
      { indexed: false, internalType: 'uint128', name: 'liquidity1', type: 'uint128' },
    ],
    name: 'StrategyLiquidityUpdated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: 'uint32', name: 'prevFeePPM', type: 'uint32' },
      { indexed: false, internalType: 'uint32', name: 'newFeePPM', type: 'uint32' },
    ],
    name: 'TradingFeePPMUpdated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'token0', type: 'address' },
      { indexed: true, internalType: 'address', name: 'token1', type: 'address' },
      { indexed: false, internalType: 'uint32', name: 'prevFeePPM', type: 'uint32' },
      { indexed: false, internalType: 'uint32', name: 'newFeePPM', type: 'uint32' },
    ],
    name: 'PairTradingFeePPMUpdated',
    type: 'event',
  },
];
