import { GradientRealtimeWithOwner } from '../gradient-realtime.service';
import { BlockchainType, ExchangeId, Deployment } from '../../deployment/deployment.service';

export const MOCK_TOKEN0_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC
export const MOCK_TOKEN1_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'; // WETH

export const MOCK_GRADIENT_STRATEGY_LINEAR_INCREASE: GradientRealtimeWithOwner = {
  strategyId: '115792089237316195423570985008687907853269984665640564039457584007913129639937',
  owner: '0x1234567890123456789012345678901234567890',
  token0Address: MOCK_TOKEN0_ADDRESS,
  token1Address: MOCK_TOKEN1_ADDRESS,
  order0Liquidity: '1000000000', // 1000 USDC (6 decimals)
  order0InitialPrice: '3377704960',
  order0TradingStartTime: 1700000000,
  order0Expiry: 1700086400,
  order0MultiFactor: '16777728',
  order0GradientType: '0', // LINEAR_INCREASE
  order1Liquidity: '500000000000000000', // 0.5 WETH (18 decimals)
  order1InitialPrice: '3377704960',
  order1TradingStartTime: 1700000000,
  order1Expiry: 1700086400,
  order1MultiFactor: '16777728',
  order1GradientType: '1', // LINEAR_DECREASE
};

export const MOCK_GRADIENT_STRATEGY_EXPONENTIAL: GradientRealtimeWithOwner = {
  strategyId: '115792089237316195423570985008687907853269984665640564039457584007913129639938',
  owner: '0xABCDABCDABCDABCDABCDABCDABCDABCDABCDABCD',
  token0Address: MOCK_TOKEN0_ADDRESS,
  token1Address: MOCK_TOKEN1_ADDRESS,
  order0Liquidity: '2000000000',
  order0InitialPrice: '3377704960',
  order0TradingStartTime: 1700000000,
  order0Expiry: 1700172800,
  order0MultiFactor: '16777728',
  order0GradientType: '4', // EXPONENTIAL_INCREASE
  order1Liquidity: '1000000000000000000',
  order1InitialPrice: '3377704960',
  order1TradingStartTime: 1700000000,
  order1Expiry: 1700172800,
  order1MultiFactor: '16777728',
  order1GradientType: '5', // EXPONENTIAL_DECREASE
};

export const MOCK_GRADIENT_STRATEGIES: GradientRealtimeWithOwner[] = [
  MOCK_GRADIENT_STRATEGY_LINEAR_INCREASE,
  MOCK_GRADIENT_STRATEGY_EXPONENTIAL,
];

export const MOCK_DEPLOYMENT: Deployment = {
  exchangeId: ExchangeId.OGEthereum,
  blockchainType: BlockchainType.Ethereum,
  rpcEndpoint: 'http://localhost:8545',
  harvestEventsBatchSize: 1000,
  harvestConcurrency: 1,
  multicallAddress: '0x5Eb3fa2DFECdDe21C950813C665E9364fa609bD2',
  startBlock: 17087000,
  gradientTimestampOffset: 60,
  gasToken: {
    name: 'Ethereum',
    symbol: 'ETH',
    address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  },
  contracts: {
    CarbonController: { address: '0xC537e898CD774e2dCBa3B14Ea6f34C93d5eA45e1' },
    GradientController: { address: '0x0000000000000000000000000000000000000001' },
  },
};

export function createMockGradientRealtimeService() {
  return {
    getStrategiesWithOwners: jest.fn().mockResolvedValue({
      strategies: MOCK_GRADIENT_STRATEGIES,
      blockNumber: 17500000,
    }),
  };
}

export function createMockDeploymentService() {
  return {
    getDeploymentByExchangeId: jest.fn().mockReturnValue(MOCK_DEPLOYMENT),
    getDeployments: jest.fn().mockReturnValue([MOCK_DEPLOYMENT]),
    hasGradientSupport: jest.fn().mockReturnValue(true),
  };
}
