import { Decimal } from 'decimal.js';
import { parseOrder, processOrders } from './activity.utils';
import { ProcessedOrders, StrategyStatesMap } from './activity.types';
import { StrategyCreatedEvent } from '../events/strategy-created-event/strategy-created-event.entity';
import { StrategyUpdatedEvent } from '../events/strategy-updated-event/strategy-updated-event.entity';
import { StrategyDeletedEvent } from '../events/strategy-deleted-event/strategy-deleted-event.entity';
import { BlockchainType, Deployment, ExchangeId } from '../deployment/deployment.service';
import { TokensByAddress } from '../token/token.service';
import { createActivityFromEvent } from './activity.utils';
import { StrategyState } from './activity.types';

const mockDeployment: Deployment = {
  blockchainType: BlockchainType.Ethereum,
  exchangeId: ExchangeId.OGEthereum,
  startBlock: 1,
  rpcEndpoint: '',
  harvestEventsBatchSize: 0,
  harvestConcurrency: 0,
  multicallAddress: '',
  gasToken: undefined,
  contracts: {},
};

const mockTokens: TokensByAddress = {
  '0xtoken0': {
    id: 1,
    address: '0xtoken0',
    symbol: 'TKN0',
    decimals: 18,
    blockchainType: mockDeployment.blockchainType,
    exchangeId: mockDeployment.exchangeId,
    name: 'Token 0',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  '0xtoken1': {
    id: 2,
    address: '0xtoken1',
    symbol: 'TKN1',
    decimals: 18,
    blockchainType: mockDeployment.blockchainType,
    exchangeId: mockDeployment.exchangeId,
    name: 'Token 1',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

// Create a mock strategy states map for tests
const mockStrategyStates: StrategyStatesMap = new Map<string, StrategyState>();

describe('ActivityV2 Utilities', () => {
  describe('process orders', () => {
    const testCase1 = {
      sampleOrderJson0: {
        y: '170094842454075153',
        z: '170424481651884481',
        A: '3091437773161920',
        B: '4365290227193173',
      },
      sampleOrderJson1: {
        y: '1216139',
        z: '575996185',
        A: '961648879',
        B: '15922629181',
      },
      decimals0: 18,
      decimals1: 6,
      expectedProcessed: {
        y0: '170094842454075153',
        z0: '170424481651884481',
        y1: '1216139',
        z1: '575996185',
        liquidity0: 0.170095,
        capacity0: 0.170424,
        liquidity1: 1.216139,
        capacity1: 575.996185,
        sellPriceA: 3201.6,
        sellPriceMarg: 3202.305521,
        sellPriceB: 3600.0,
        buyPriceA: 3200.0,
        buyPriceMarg: 3200.816156,
        buyPriceB: 3598.200899,
      },
    };

    const testCase2 = {
      sampleOrderJson0: {
        y: '313867074308629781954050',
        z: '1809224000000000000000000',
        A: '6752374180268429',
        B: '6667651067822137',
      },
      sampleOrderJson1: {
        y: '14809616187',
        z: '22158378151',
        A: '28605233',
        B: '19903286',
      },
      decimals0: 18,
      decimals1: 6,
      expectedProcessed: {
        y0: '313867074308629781954050',
        z0: '1809224000000000000000000',
        y1: '14809616187',
        z1: '22158378151',
        liquidity0: 313867.074309,
        capacity0: 1809224.0,
        liquidity1: 14809.616187,
        capacity1: 22158.378151,
        sellPriceA: 0.00505,
        sellPriceMarg: 0.01922,
        sellPriceB: 0.03,
        buyPriceA: 0.005,
        buyPriceMarg: 0.019219,
        buyPriceB: 0.0297,
      },
    };
    const testCases = [testCase1, testCase2];

    testCases.forEach(({ sampleOrderJson0, sampleOrderJson1, decimals0, decimals1, expectedProcessed }, index) => {
      it(`should compute correct prices for test case ${index + 1}`, () => {
        // If your parseOrder function expects a JSON string, stringify the imported objects.
        const order0 = parseOrder(JSON.stringify(sampleOrderJson0));
        const order1 = parseOrder(JSON.stringify(sampleOrderJson1));
        const decimals0_d = new Decimal(decimals0);
        const decimals1_d = new Decimal(decimals1);

        // Process orders. (Make sure processOrders expects decimals as numbers,
        // or convert if needed. Here, we assume they’re plain numbers as imported.)
        const processed: ProcessedOrders = processOrders(order0, order1, decimals0_d, decimals1_d);

        // Tolerance for floating point comparisons (number of decimal places).
        const tolerance = 6;

        // Compare liquidity/capacity values.
        expect(processed.liquidity0.toNumber()).toBeCloseTo(expectedProcessed.liquidity0, tolerance);
        expect(processed.capacity0.toNumber()).toBeCloseTo(expectedProcessed.capacity0, tolerance);
        expect(processed.liquidity1.toNumber()).toBeCloseTo(expectedProcessed.liquidity1, tolerance);
        expect(processed.capacity1.toNumber()).toBeCloseTo(expectedProcessed.capacity1, tolerance);

        // Compare price values.
        expect(processed.sellPriceA.toNumber()).toBeCloseTo(expectedProcessed.sellPriceA, tolerance);
        expect(processed.sellPriceMarg.toNumber()).toBeCloseTo(expectedProcessed.sellPriceMarg, tolerance);
        expect(processed.sellPriceB.toNumber()).toBeCloseTo(expectedProcessed.sellPriceB, tolerance);
        expect(processed.buyPriceA.toNumber()).toBeCloseTo(expectedProcessed.buyPriceA, tolerance);
        expect(processed.buyPriceMarg.toNumber()).toBeCloseTo(expectedProcessed.buyPriceMarg, tolerance);
        expect(processed.buyPriceB.toNumber()).toBeCloseTo(expectedProcessed.buyPriceB, tolerance);
      });
    });
  });

  describe('determine activity action', () => {
    beforeEach(() => {
      mockStrategyStates.clear();
    });

    it('should create activity with create_strategy action for StrategyCreatedEvent', () => {
      const event = {
        strategyId: '1',
        owner: '0xowner',
        token0: { address: '0xtoken0', symbol: 'TKN0' },
        token1: { address: '0xtoken1', symbol: 'TKN1' },
        order0: JSON.stringify({ y: '100', A: '1', B: '1' }),
        order1: JSON.stringify({ y: '100', A: '1', B: '1' }),
        timestamp: new Date(),
        transactionHash: '0xtx',
        block: { id: 1 },
        transactionIndex: 0,
        logIndex: 0,
      } as StrategyCreatedEvent;

      const activity = createActivityFromEvent(
        event,
        'create_strategy',
        mockDeployment,
        mockTokens,
        mockStrategyStates,
      );

      expect(activity.action).toBe('create_strategy');
    });

    it('should convert edit_price to strategy_paused when all prices are zero', () => {
      const event = {
        strategyId: '1',
        token0: { address: '0xtoken0', symbol: 'TKN0' },
        token1: { address: '0xtoken1', symbol: 'TKN1' },
        order0: JSON.stringify({ y: '100', A: '0', B: '0' }),
        order1: JSON.stringify({ y: '100', A: '0', B: '0' }),
        timestamp: new Date(),
        transactionHash: '0xtx',
        block: { id: 1 },
        transactionIndex: 0,
        logIndex: 0,
        reason: 0,
      } as StrategyUpdatedEvent;

      // Set up mock strategy state
      mockStrategyStates.set('1', {
        currentOwner: '0xowner',
        creationWallet: '0xowner',
        order0: JSON.stringify({ y: '100', A: '1', B: '1' }),
        order1: JSON.stringify({ y: '100', A: '1', B: '1' }),
        token0: mockTokens['0xtoken0'],
        token1: mockTokens['0xtoken1'],
        lastProcessedBlock: 0,
      });

      const activity = createActivityFromEvent(event, 'edit_price', mockDeployment, mockTokens, mockStrategyStates);

      expect(activity.action).toBe('strategy_paused');
    });

    it('should maintain edit_price action when prices are not zero', () => {
      const event = {
        strategyId: '1',
        token0: { address: '0xtoken0', symbol: 'TKN0' },
        token1: { address: '0xtoken1', symbol: 'TKN1' },
        order0: JSON.stringify({ y: '100', A: '1', B: '1' }),
        order1: JSON.stringify({ y: '100', A: '1', B: '1' }),
        timestamp: new Date(),
        transactionHash: '0xtx',
        block: { id: 1 },
        transactionIndex: 0,
        logIndex: 0,
        reason: 0,
      } as StrategyUpdatedEvent;

      // Set up mock strategy state
      mockStrategyStates.set('1', {
        currentOwner: '0xowner',
        creationWallet: '0xowner',
        order0: JSON.stringify({ y: '100', A: '2', B: '2' }),
        order1: JSON.stringify({ y: '100', A: '2', B: '2' }),
        token0: mockTokens['0xtoken0'],
        token1: mockTokens['0xtoken1'],
        lastProcessedBlock: 0,
      });

      const activity = createActivityFromEvent(event, 'edit_price', mockDeployment, mockTokens, mockStrategyStates);

      expect(activity.action).toBe('edit_price');
    });

    it('should set action to deleted for StrategyDeletedEvent', () => {
      const event = {
        strategyId: '1',
        token0: { address: '0xtoken0', symbol: 'TKN0' },
        token1: { address: '0xtoken1', symbol: 'TKN1' },
        order0: JSON.stringify({ y: '0', A: '0', B: '0' }),
        order1: JSON.stringify({ y: '0', A: '0', B: '0' }),
        timestamp: new Date(),
        transactionHash: '0xtx',
        block: { id: 1 },
        transactionIndex: 0,
        logIndex: 0,
      } as StrategyDeletedEvent;

      const activity = createActivityFromEvent(event, 'deleted', mockDeployment, mockTokens, mockStrategyStates);

      expect(activity.action).toBe('deleted');
    });

    it('should set buy_low action for trade events with token1 sold', () => {
      const event = {
        strategyId: '1',
        token0: { address: '0xtoken0', symbol: 'TKN0' },
        token1: { address: '0xtoken1', symbol: 'TKN1' },
        order0: JSON.stringify({ y: '150', A: '1', B: '1' }), // Increased token0
        order1: JSON.stringify({ y: '50', A: '1', B: '1' }), // Decreased token1
        timestamp: new Date(),
        transactionHash: '0xtx',
        block: { id: 1 },
        transactionIndex: 0,
        logIndex: 0,
        reason: 1, // Trade event
      } as StrategyUpdatedEvent;

      // Set up mock strategy state
      mockStrategyStates.set('1', {
        currentOwner: '0xowner',
        creationWallet: '0xowner',
        order0: JSON.stringify({ y: '100', A: '1', B: '1' }),
        order1: JSON.stringify({ y: '100', A: '1', B: '1' }),
        token0: mockTokens['0xtoken0'],
        token1: mockTokens['0xtoken1'],
        lastProcessedBlock: 0,
      });

      const activity = createActivityFromEvent(event, 'edit_price', mockDeployment, mockTokens, mockStrategyStates);

      expect(activity.action).toBe('buy_low');
    });

    it('should set sell_high action for trade events with token0 sold', () => {
      const event = {
        strategyId: '1',
        token0: { address: '0xtoken0', symbol: 'TKN0' },
        token1: { address: '0xtoken1', symbol: 'TKN1' },
        order0: JSON.stringify({ y: '50', A: '1', B: '1' }), // Decreased token0
        order1: JSON.stringify({ y: '150', A: '1', B: '1' }), // Increased token1
        timestamp: new Date(),
        transactionHash: '0xtx',
        block: { id: 1 },
        transactionIndex: 0,
        logIndex: 0,
        reason: 1, // Trade event
      } as StrategyUpdatedEvent;

      // Set up mock strategy state
      mockStrategyStates.set('1', {
        currentOwner: '0xowner',
        creationWallet: '0xowner',
        order0: JSON.stringify({ y: '100', A: '1', B: '1' }),
        order1: JSON.stringify({ y: '100', A: '1', B: '1' }),
        token0: mockTokens['0xtoken0'],
        token1: mockTokens['0xtoken1'],
        lastProcessedBlock: 0,
      });

      const activity = createActivityFromEvent(event, 'edit_price', mockDeployment, mockTokens, mockStrategyStates);

      expect(activity.action).toBe('sell_high');
    });
  });
});
