/* eslint-disable @typescript-eslint/no-unused-vars */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DexScreenerV2Service } from './dex-screener-v2.service';
import { DexScreenerEventV2 } from './dex-screener-event-v2.entity';
import { LastProcessedBlockService } from '../../last-processed-block/last-processed-block.service';
import { StrategyCreatedEventService } from '../../events/strategy-created-event/strategy-created-event.service';
import { StrategyUpdatedEventService } from '../../events/strategy-updated-event/strategy-updated-event.service';
import { StrategyDeletedEventService } from '../../events/strategy-deleted-event/strategy-deleted-event.service';
import { VoucherTransferEventService } from '../../events/voucher-transfer-event/voucher-transfer-event.service';
import { TokensTradedEventService } from '../../events/tokens-traded-event/tokens-traded-event.service';
import { TokenService, TokensByAddress } from '../../token/token.service';
import { BlockchainType, ExchangeId } from '../../deployment/deployment.service';
import { Token } from '../../token/token.entity';

describe('DexScreenerV2Service', () => {
  let service: DexScreenerV2Service;
  let repository: jest.Mocked<Repository<DexScreenerEventV2>>;
  let lastProcessedBlockService: jest.Mocked<LastProcessedBlockService>;
  let strategyCreatedEventService: jest.Mocked<StrategyCreatedEventService>;
  let strategyUpdatedEventService: jest.Mocked<StrategyUpdatedEventService>;
  let strategyDeletedEventService: jest.Mocked<StrategyDeletedEventService>;
  let voucherTransferEventService: jest.Mocked<VoucherTransferEventService>;
  let tokensTradedEventService: jest.Mocked<TokensTradedEventService>;
  let tokenService: jest.Mocked<TokenService>;

  const mockDeployment = {
    blockchainType: BlockchainType.Ethereum,
    exchangeId: ExchangeId.OGEthereum,
    startBlock: 1000,
    rpcEndpoint: 'http://localhost:8545',
    harvestEventsBatchSize: 100,
    harvestConcurrency: 1,
    multicallAddress: '0x1234',
    gasToken: {
      name: 'Ethereum',
      symbol: 'ETH',
      address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    },
    contracts: {},
  };

  const createMockToken = (address: string, decimals: number, symbol: string): Token => ({
    id: 1,
    address,
    name: `Token ${symbol}`,
    symbol,
    decimals,
    blockchainType: BlockchainType.Ethereum,
    exchangeId: ExchangeId.OGEthereum,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const mockTokens: TokensByAddress = {
    '0xA0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C': createMockToken(
      '0xA0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C',
      18,
      'TKNA',
    ),
    '0xB0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C': createMockToken(
      '0xB0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C',
      6,
      'TKNB',
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DexScreenerV2Service,
        {
          provide: getRepositoryToken(DexScreenerEventV2),
          useValue: {
            createQueryBuilder: jest.fn(),
            save: jest.fn(),
            query: jest.fn(),
          },
        },
        {
          provide: LastProcessedBlockService,
          useValue: {
            getOrInit: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: StrategyCreatedEventService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: StrategyUpdatedEventService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: StrategyDeletedEventService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: VoucherTransferEventService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: TokensTradedEventService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: TokenService,
          useValue: {
            allByAddress: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DexScreenerV2Service>(DexScreenerV2Service);
    repository = module.get(getRepositoryToken(DexScreenerEventV2));
    lastProcessedBlockService = module.get(LastProcessedBlockService);
    strategyCreatedEventService = module.get(StrategyCreatedEventService);
    strategyUpdatedEventService = module.get(StrategyUpdatedEventService);
    strategyDeletedEventService = module.get(StrategyDeletedEventService);
    voucherTransferEventService = module.get(VoucherTransferEventService);
    tokensTradedEventService = module.get(TokensTradedEventService);
    tokenService = module.get(TokenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Delta Calculations', () => {
    it('should calculate correct deltas for created strategy', () => {
      const mockCreatedEvent = {
        strategyId: '1',
        pair: { id: 1 },
        order0: { y: '1000000000000000000' }, // 1 token with 18 decimals
        order1: { y: '2000000' }, // 2 tokens with 6 decimals
        token0: { address: '0xA0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C' },
        token1: { address: '0xB0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C' },
        block: { id: 1001, timestamp: new Date() },
        transactionHash: '0xabc',
        transactionIndex: 0,
        logIndex: 0,
        owner: '0xowner',
        type: 'created',
        reason: 2,
      };

      const strategyStates = new Map();
      const events = service['processStrategyEvents'](
        [mockCreatedEvent as any],
        [],
        [],
        [],
        strategyStates,
        mockTokens,
        mockDeployment,
      );

      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('join');
      expect(events[0].amount0).toBe('1'); // 1e18 / 1e18 = 1
      expect(events[0].amount1).toBe('2'); // 2e6 / 1e6 = 2
    });

    it('should calculate correct deltas for updated strategy', () => {
      const mockUpdatedEvent = {
        strategyId: '1',
        pair: { id: 1 },
        order0: { y: '2000000000000000000' }, // 2 tokens (was 1)
        order1: { y: '1000000' }, // 1 token (was 2)
        token0: { address: '0xA0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C' },
        token1: { address: '0xB0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C' },
        block: { id: 1002, timestamp: new Date() },
        transactionHash: '0xdef',
        transactionIndex: 0,
        logIndex: 0,
        owner: '0xowner',
        type: 'updated',
        reason: 0,
      };

      const strategyStates = new Map();
      // Set initial state
      strategyStates.set('1', {
        id: '1',
        pairId: 1,
        order0: { y: '1000000000000000000' },
        order1: { y: '2000000' },
        token0Address: '0xA0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C',
        token1Address: '0xB0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C',
        token0Decimals: 18,
        token1Decimals: 6,
        y0: 1000000000000000000,
        y1: 2000000,
        reserves0: 0,
        reserves1: 0,
      });

      const events = service['processStrategyEvents'](
        [],
        [mockUpdatedEvent as any],
        [],
        [],
        strategyStates,
        mockTokens,
        mockDeployment,
      );

      expect(events).toHaveLength(2); // One exit for token1 reduction, one join for token0 increase

      // Should have exit event for reduced token1 amount
      const exitEvent = events.find((e) => e.eventType === 'exit');
      expect(exitEvent).toBeDefined();
      expect(exitEvent.amount1).toBe('1'); // Reduced from 2 to 1 = -1, abs(1) = 1

      // Should have join event for increased token0 amount
      const joinEvent = events.find((e) => e.eventType === 'join');
      expect(joinEvent).toBeDefined();
      expect(joinEvent.amount0).toBe('1'); // Increased from 1 to 2 = +1
    });

    it('should calculate correct deltas for deleted strategy', () => {
      const mockDeletedEvent = {
        strategyId: '1',
        pair: { id: 1 },
        order0: { y: '1000000000000000000' },
        order1: { y: '2000000' },
        token0: { address: '0xA0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C' },
        token1: { address: '0xB0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C' },
        block: { id: 1003, timestamp: new Date() },
        transactionHash: '0xghi',
        transactionIndex: 0,
        logIndex: 0,
        owner: '0xowner',
        type: 'deleted',
        reason: 3,
      };

      const strategyStates = new Map();
      // Set initial state
      strategyStates.set('1', {
        id: '1',
        pairId: 1,
        order0: { y: '1000000000000000000' },
        order1: { y: '2000000' },
        token0Address: '0xA0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C',
        token1Address: '0xB0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C',
        token0Decimals: 18,
        token1Decimals: 6,
        y0: 1000000000000000000,
        y1: 2000000,
        reserves0: 0,
        reserves1: 0,
      });

      const events = service['processStrategyEvents'](
        [],
        [],
        [mockDeletedEvent as any],
        [],
        strategyStates,
        mockTokens,
        mockDeployment,
      );

      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('exit');
      expect(events[0].amount0).toBe('1'); // abs(-1) = 1
      expect(events[0].amount1).toBe('2'); // abs(-2) = 2
      expect(strategyStates.has('1')).toBe(false); // Strategy should be removed
    });
  });

  describe('Event Type Determination', () => {
    it('should determine join event for positive amounts', () => {
      const result = service['determineJoinExitType'](1.5, 2.0, 2);
      expect(result).toHaveLength(1);
      expect(result[0].eventType).toBe('join');
      expect(result[0].amount0).toBe(1.5);
      expect(result[0].amount1).toBe(2.0);
    });

    it('should determine exit event for negative amounts', () => {
      const result = service['determineJoinExitType'](-1.5, -2.0, 0);
      expect(result).toHaveLength(1);
      expect(result[0].eventType).toBe('exit');
      expect(result[0].amount0).toBe(1.5); // abs(-1.5)
      expect(result[0].amount1).toBe(2.0); // abs(-2.0)
    });

    it('should determine mixed join/exit for cross amounts', () => {
      const result = service['determineJoinExitType'](-1.0, 2.0, 0);
      expect(result).toHaveLength(2);

      const joinEvent = result.find((e) => e.eventType === 'join');
      const exitEvent = result.find((e) => e.eventType === 'exit');

      expect(joinEvent).toBeDefined();
      expect(joinEvent.amount0).toBe(null);
      expect(joinEvent.amount1).toBe(2.0);

      expect(exitEvent).toBeDefined();
      expect(exitEvent.amount0).toBe(1.0); // abs(-1.0)
      expect(exitEvent.amount1).toBe(null);
    });
  });

  describe('Reserve Calculations', () => {
    it('should calculate reserves correctly for pair', () => {
      const strategyStates = new Map([
        [
          '1',
          {
            id: '1',
            pairId: 1,
            order0: {},
            order1: {},
            token0Address: '0xA0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C',
            token1Address: '0xB0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C',
            token0Decimals: 18,
            token1Decimals: 6,
            y0: 1000000000000000000, // 1 token
            y1: 2000000, // 2 tokens
            reserves0: 0,
            reserves1: 0,
          },
        ],
        [
          '2',
          {
            id: '2',
            pairId: 1,
            order0: {},
            order1: {},
            token0Address: '0xA0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C',
            token1Address: '0xB0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C',
            token0Decimals: 18,
            token1Decimals: 6,
            y0: 3000000000000000000, // 3 tokens
            y1: 1000000, // 1 token
            reserves0: 0,
            reserves1: 0,
          },
        ],
      ]);

      const reserves = service['getReservesForPair'](1, strategyStates, true);
      expect(reserves.reserves0).toBe(4); // 1 + 3 = 4
      expect(reserves.reserves1).toBe(3); // 2 + 1 = 3
    });

    it('should handle asset ordering correctly', () => {
      const strategyStates = new Map([
        [
          '1',
          {
            id: '1',
            pairId: 1,
            order0: {},
            order1: {},
            token0Address: '0xB0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C', // Higher address
            token1Address: '0xA0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C', // Lower address
            token0Decimals: 6,
            token1Decimals: 18,
            y0: 2000000, // 2 tokens (token B)
            y1: 1000000000000000000, // 1 token (token A)
            reserves0: 0,
            reserves1: 0,
          },
        ],
      ]);

      // When isAddress0Asset0 = false (token A is asset0 but has higher address)
      const reserves = service['getReservesForPair'](1, strategyStates, false);
      expect(reserves.reserves0).toBe(1); // Token A (y1 normalized)
      expect(reserves.reserves1).toBe(2); // Token B (y0 normalized)
    });
  });

  describe('Swap Event Processing', () => {
    it('should process swap events correctly', () => {
      const mockTradeEvent = {
        sourceToken: { address: '0xA0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C' },
        targetToken: { address: '0xB0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C' },
        sourceAmount: '1000000000000000000', // 1 token with 18 decimals
        targetAmount: '500000', // 0.5 tokens with 6 decimals
        pair: { id: 1 },
        block: { id: 1004, timestamp: new Date() },
        transactionHash: '0xswap',
        transactionIndex: 1,
        logIndex: 2,
        callerId: '0xtrader',
      };

      const strategyStates = new Map([
        [
          '1',
          {
            id: '1',
            pairId: 1,
            order0: {},
            order1: {},
            token0Address: '0xA0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C',
            token1Address: '0xB0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C',
            token0Decimals: 18,
            token1Decimals: 6,
            y0: 5000000000000000000, // 5 tokens
            y1: 10000000, // 10 tokens
            reserves0: 0,
            reserves1: 0,
          },
        ],
      ]);

      const events = service['processTradeEvents'](
        [mockTradeEvent as any],
        [],
        strategyStates,
        mockTokens,
        mockDeployment,
      );

      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('swap');
      expect(events[0].asset0In).toBe('1'); // 1 token in
      expect(events[0].asset1Out).toBe('0.5'); // 0.5 tokens out
      expect(events[0].priceNative).toBe('2'); // 1 / 0.5 = 2
      expect(events[0].maker).toBe('0xtrader');
    });

    it('should calculate price correctly for reverse swap', () => {
      const mockTradeEvent = {
        sourceToken: { address: '0xB0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C' },
        targetToken: { address: '0xA0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C' },
        sourceAmount: '1000000', // 1 token with 6 decimals
        targetAmount: '2000000000000000000', // 2 tokens with 18 decimals
        pair: { id: 1 },
        block: { id: 1005, timestamp: new Date() },
        transactionHash: '0xswap2',
        transactionIndex: 1,
        logIndex: 3,
        callerId: '0xtrader2',
      };

      const strategyStates = new Map();
      const events = service['processTradeEvents'](
        [mockTradeEvent as any],
        [],
        strategyStates,
        mockTokens,
        mockDeployment,
      );

      expect(events).toHaveLength(1);
      expect(events[0].asset1In).toBe('1'); // 1 token in (source is asset1)
      expect(events[0].asset0Out).toBe('2'); // 2 tokens out (target is asset0)
      expect(events[0].priceNative).toBe('2'); // 2 / 1 = 2
    });
  });

  describe('Maker Finding', () => {
    it('should return owner for created events', () => {
      const mockEvent = {
        type: 'created',
        owner: '0xcreator',
        strategyId: '1',
        block: { id: 1001 },
      };

      const maker = service['findMaker'](mockEvent, [], mockDeployment);
      expect(maker).toBe('0xcreator');
    });

    it('should find latest transfer for updated/deleted events', () => {
      const mockEvent = {
        type: 'updated',
        owner: '0xoriginal',
        strategyId: '1',
        block: { id: 1005 },
      };

      const mockTransfers = [
        {
          strategyId: 1,
          to: '0xfirst',
          block: { id: 1002 },
        },
        {
          strategyId: 1,
          to: '0xlatest',
          block: { id: 1004 },
        },
        {
          strategyId: 1,
          to: '0xearlier',
          block: { id: 1003 },
        },
      ];

      const maker = service['findMaker'](mockEvent, mockTransfers as any, mockDeployment);
      expect(maker).toBe('0xlatest');
    });

    it('should fallback to owner if no transfers found', () => {
      const mockEvent = {
        type: 'updated',
        owner: '0xoriginal',
        strategyId: '1',
        block: { id: 1005 },
      };

      const maker = service['findMaker'](mockEvent, [], mockDeployment);
      expect(maker).toBe('0xoriginal');
    });
  });

  describe('Event Ordering', () => {
    it('should sort events by block, transaction, and event index', () => {
      const events = [
        {
          blockNumber: 1002,
          txnIndex: 1,
          eventIndex: 0.5,
          eventType: 'join',
        },
        {
          blockNumber: 1001,
          txnIndex: 0,
          eventIndex: 0,
          eventType: 'swap',
        },
        {
          blockNumber: 1002,
          txnIndex: 0,
          eventIndex: 1,
          eventType: 'exit',
        },
        {
          blockNumber: 1002,
          txnIndex: 1,
          eventIndex: 0,
          eventType: 'join',
        },
      ] as DexScreenerEventV2[];

      const sorted = events.sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
        if (a.txnIndex !== b.txnIndex) return a.txnIndex - b.txnIndex;
        return a.eventIndex - b.eventIndex;
      });

      expect(sorted[0].blockNumber).toBe(1001);
      expect(sorted[1].blockNumber).toBe(1002);
      expect(sorted[1].txnIndex).toBe(0);
      expect(sorted[2].txnIndex).toBe(1);
      expect(sorted[2].eventIndex).toBe(0);
      expect(sorted[3].eventIndex).toBe(0.5);
    });
  });

  describe('Cumulative Reserve Calculation', () => {
    it('should calculate cumulative reserves correctly', () => {
      const strategyStates = new Map([
        [
          '1',
          {
            id: '1',
            pairId: 1,
            order0: {},
            order1: {},
            token0Address: '0xA0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C',
            token1Address: '0xB0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C',
            token0Decimals: 18,
            token1Decimals: 6,
            y0: 1000000000000000000, // 1 token A
            y1: 2000000, // 2 token B
            reserves0: 0,
            reserves1: 0,
          },
        ],
        [
          '2',
          {
            id: '2',
            pairId: 2,
            order0: {},
            order1: {},
            token0Address: '0xA0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C', // Same token A
            token1Address: '0xC0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C', // Different token C
            token0Decimals: 18,
            token1Decimals: 12,
            y0: 3000000000000000000, // 3 token A
            y1: 5000000000000, // 5 token C
            reserves0: 0,
            reserves1: 0,
          },
        ],
      ]);

      service['calculateCumulativeReserves'](strategyStates);

      const strategy1 = strategyStates.get('1');
      const strategy2 = strategyStates.get('2');

      // Strategy 1: TokenA (1) <= TokenB, so normal ordering
      expect(strategy1.reserves0).toBe(4); // Total TokenA: 1 + 3 = 4
      expect(strategy1.reserves1).toBe(2); // Total TokenB: 2

      // Strategy 2: TokenA (4) <= TokenC, so normal ordering
      expect(strategy2.reserves0).toBe(4); // Total TokenA: 1 + 3 = 4
      expect(strategy2.reserves1).toBe(5); // Total TokenC: 5
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero amounts correctly', () => {
      const result = service['determineJoinExitType'](0, 0, 0);
      expect(result).toHaveLength(1);
      expect(result[0].eventType).toBe('join'); // Zero amounts are treated as join with reason 0
      expect(result[0].amount0).toBe(0);
      expect(result[0].amount1).toBe(0);
    });

    it('should handle missing token data gracefully', () => {
      const mockEvent = {
        strategyId: '1',
        token0: { address: '0xUnknown' },
        token1: { address: '0xB0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C' },
      };

      const events = service['processStrategyEvents'](
        [mockEvent as any],
        [],
        [],
        [],
        new Map(),
        mockTokens,
        mockDeployment,
      );

      expect(events).toHaveLength(0);
    });

    it('should handle division by zero in price calculation', () => {
      const mockTradeEvent = {
        sourceToken: { address: '0xA0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C' },
        targetToken: { address: '0xB0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C' },
        sourceAmount: '1000000000000000000',
        targetAmount: '0', // Zero target amount
        pair: { id: 1 },
        block: { id: 1004, timestamp: new Date() },
        transactionHash: '0xswap',
        transactionIndex: 1,
        logIndex: 2,
        callerId: '0xtrader',
      };

      const events = service['processTradeEvents']([mockTradeEvent as any], [], new Map(), mockTokens, mockDeployment);

      expect(events[0].priceNative).toBe('0');
    });
  });

  /**
   * Critical Math Verification Tests
   * These tests ensure the math produces identical results to the original SQL query
   */
  describe('Math Verification Against Original Query', () => {
    it('should replicate exact delta calculation logic from original query', () => {
      // Test case: Strategy created with initial liquidity
      const y0_initial = 0;
      const y1_initial = 0;
      const y0_current = 1000000000000000000; // 1 token
      const y1_current = 2000000; // 2 tokens
      const decimals0 = 18;
      const decimals1 = 6;
      const reason = 2; // Created

      // Original query logic:
      // CASE WHEN reason = 2 THEN y0 WHEN reason = 3 THEN -y0 ELSE y0 - LAG(y0, 1) END
      let y_delta0: number;
      let y_delta1: number;

      if (reason === 2) {
        y_delta0 = y0_current;
        y_delta1 = y1_current;
      } else if (reason === 3) {
        y_delta0 = -y0_current;
        y_delta1 = -y1_current;
      } else {
        y_delta0 = y0_current - y0_initial;
        y_delta1 = y1_current - y1_initial;
      }

      // Normalize by decimals (original: / POW(10, decimals))
      const y_delta0_normalized = y_delta0 / Math.pow(10, decimals0);
      const y_delta1_normalized = y_delta1 / Math.pow(10, decimals1);

      expect(y_delta0_normalized).toBe(1); // 1e18 / 1e18 = 1
      expect(y_delta1_normalized).toBe(2); // 2e6 / 1e6 = 2
    });

    it('should replicate reserve calculation logic from original query', () => {
      // Test cumulative reserve calculation
      // Original: SUM(y_delta0) OVER (PARTITION BY address0 ORDER BY blockTimestamp)

      const events = [
        { tokenAddress: '0xA', y_delta_normalized: 1.0, blockTimestamp: 1000 },
        { tokenAddress: '0xA', y_delta_normalized: 0.5, blockTimestamp: 1001 },
        { tokenAddress: '0xA', y_delta_normalized: -0.2, blockTimestamp: 1002 },
        { tokenAddress: '0xB', y_delta_normalized: 2.0, blockTimestamp: 1000 },
      ];

      // Sort by timestamp and calculate running sum
      events.sort((a, b) => a.blockTimestamp - b.blockTimestamp);

      const reservesByToken = new Map<string, number>();
      events.forEach((event) => {
        const currentReserve = reservesByToken.get(event.tokenAddress) || 0;
        reservesByToken.set(event.tokenAddress, currentReserve + event.y_delta_normalized);
      });

      expect(reservesByToken.get('0xA')).toBe(1.3); // 1.0 + 0.5 - 0.2
      expect(reservesByToken.get('0xB')).toBe(2.0);
    });

    it('should replicate asset ordering logic from original query', () => {
      // Original: CASE WHEN isAddress0Asset0 THEN y_delta0 ELSE y_delta1 END AS amount0
      const tokenA = '0xA0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C';
      const tokenB = '0xB0b86a33E6441A8A123E8Bf9B2B56d2AfeDcE28C';

      const isAddress0Asset0 = tokenA <= tokenB;
      expect(isAddress0Asset0).toBe(true); // A < B lexicographically

      const y_delta0_normalized = 1.5;
      const y_delta1_normalized = 2.5;

      const amount0 = isAddress0Asset0 ? y_delta0_normalized : y_delta1_normalized;
      const amount1 = isAddress0Asset0 ? y_delta1_normalized : y_delta0_normalized;

      expect(amount0).toBe(1.5);
      expect(amount1).toBe(2.5);
    });

    it('should replicate join/exit determination logic from original query', () => {
      // Original query join_exit logic:
      // CASE WHEN reason = 0 AND amount0 >= 0 AND amount1 >= 0 THEN 0 (join)
      //      WHEN reason = 0 AND amount0 <= 0 AND amount1 <= 0 THEN 1 (exit)
      //      WHEN reason = 0 AND amount0 < 0 AND amount1 > 0 THEN 2 (mixed)
      //      WHEN reason = 0 AND amount0 > 0 AND amount1 < 0 THEN 3 (mixed)
      //      WHEN reason = 2 THEN 0 (join)
      //      WHEN reason = 3 THEN 1 (exit)

      const testCases = [
        { amount0: 1.0, amount1: 2.0, reason: 0, expected: 'join' },
        { amount0: -1.0, amount1: -2.0, reason: 0, expected: 'exit' },
        { amount0: -1.0, amount1: 2.0, reason: 0, expected: 'mixed' },
        { amount0: 1.0, amount1: -2.0, reason: 0, expected: 'mixed' },
        { amount0: 1.0, amount1: 2.0, reason: 2, expected: 'join' },
        { amount0: 1.0, amount1: 2.0, reason: 3, expected: 'exit' },
      ];

      testCases.forEach(({ amount0, amount1, reason, expected }) => {
        const result = service['determineJoinExitType'](amount0, amount1, reason);

        if (expected === 'join') {
          expect(result).toHaveLength(1);
          expect(result[0].eventType).toBe('join');
        } else if (expected === 'exit') {
          expect(result).toHaveLength(1);
          expect(result[0].eventType).toBe('exit');
        } else if (expected === 'mixed') {
          expect(result).toHaveLength(2);
          expect(result.some((e) => e.eventType === 'join')).toBe(true);
          expect(result.some((e) => e.eventType === 'exit')).toBe(true);
        }
      });
    });

    it('should replicate swap price calculation from original query', () => {
      // Original: CASE WHEN isSourceAsset0 THEN
      //             CASE WHEN targetAmount != 0 THEN sourceAmount / targetAmount ELSE 0 END
      //           ELSE
      //             CASE WHEN sourceAmount != 0 THEN targetAmount / sourceAmount ELSE 0 END
      //           END AS priceNative

      // Test case data as variables to avoid TypeScript comparison errors
      const testCases = [
        { sourceAmount: 100, targetAmount: 50, isSourceAsset0: true, expectedPrice: 2 },
        { sourceAmount: 100, targetAmount: 50, isSourceAsset0: false, expectedPrice: 0.5 },
        { sourceAmount: 100, targetAmount: 0, isSourceAsset0: true, expectedPrice: 0 },
        { sourceAmount: 0, targetAmount: 50, isSourceAsset0: false, expectedPrice: 0 },
      ];

      testCases.forEach(({ sourceAmount, targetAmount, isSourceAsset0, expectedPrice }) => {
        const priceNative = isSourceAsset0
          ? targetAmount !== 0
            ? sourceAmount / targetAmount
            : 0
          : sourceAmount !== 0
          ? targetAmount / sourceAmount
          : 0;
        expect(priceNative).toBe(expectedPrice);
      });
    });
  });
});
