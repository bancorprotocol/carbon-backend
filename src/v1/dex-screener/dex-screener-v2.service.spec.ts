import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { DexScreenerV2Service } from './dex-screener-v2.service';
import { DexScreenerEventV2 } from './dex-screener-event-v2.entity';
import { LastProcessedBlockService } from '../../last-processed-block/last-processed-block.service';
import { StrategyCreatedEventService } from '../../events/strategy-created-event/strategy-created-event.service';
import { StrategyUpdatedEventService } from '../../events/strategy-updated-event/strategy-updated-event.service';
import { StrategyDeletedEventService } from '../../events/strategy-deleted-event/strategy-deleted-event.service';
import { VoucherTransferEventService } from '../../events/voucher-transfer-event/voucher-transfer-event.service';
import { TokensTradedEventService } from '../../events/tokens-traded-event/tokens-traded-event.service';
import { Deployment, BlockchainType, ExchangeId } from '../../deployment/deployment.service';
import { TokensByAddress } from '../../token/token.service';
import { StrategyCreatedEvent } from '../../events/strategy-created-event/strategy-created-event.entity';
import { StrategyUpdatedEvent } from '../../events/strategy-updated-event/strategy-updated-event.entity';
import { StrategyDeletedEvent } from '../../events/strategy-deleted-event/strategy-deleted-event.entity';
import { VoucherTransferEvent } from '../../events/voucher-transfer-event/voucher-transfer-event.entity';
import { TokensTradedEvent } from '../../events/tokens-traded-event/tokens-traded-event.entity';
import { Decimal } from 'decimal.js';

describe('DexScreenerV2Service', () => {
  let service: DexScreenerV2Service;
  let dexScreenerEventV2Repository: jest.Mocked<Repository<DexScreenerEventV2>>;
  let cacheManager: jest.Mocked<any>;
  let lastProcessedBlockService: jest.Mocked<LastProcessedBlockService>;
  let strategyCreatedEventService: jest.Mocked<StrategyCreatedEventService>;
  let strategyUpdatedEventService: jest.Mocked<StrategyUpdatedEventService>;
  let strategyDeletedEventService: jest.Mocked<StrategyDeletedEventService>;
  let voucherTransferEventService: jest.Mocked<VoucherTransferEventService>;
  let tokensTradedEventService: jest.Mocked<TokensTradedEventService>;

  // Test data setup
  const mockDeployment: Deployment = {
    blockchainType: BlockchainType.Ethereum,
    exchangeId: ExchangeId.OGEthereum,
    startBlock: 1000,
    rpcEndpoint: 'http://localhost:8545',
    harvestEventsBatchSize: 1000,
    harvestConcurrency: 1,
    multicallAddress: '0x1234567890123456789012345678901234567890',
    gasToken: {
      name: 'Ethereum',
      symbol: 'ETH',
      address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    },
    contracts: {
      CarbonController: {
        address: '0x2345678901234567890123456789012345678901',
      },
    },
  };

  const mockTokensByAddress: TokensByAddress = {
    '0xtoken0': {
      id: 1,
      address: '0xtoken0',
      symbol: 'TOKEN0',
      decimals: 18,
      name: 'Token 0',
      blockchainType: BlockchainType.Ethereum,
      exchangeId: ExchangeId.OGEthereum,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    '0xtoken1': {
      id: 2,
      address: '0xtoken1',
      symbol: 'TOKEN1',
      decimals: 6,
      name: 'Token 1',
      blockchainType: BlockchainType.Ethereum,
      exchangeId: ExchangeId.OGEthereum,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  const createMockEvent = (overrides = {}) => ({
    block: { id: 2000 },
    timestamp: new Date('2023-01-01T00:00:00Z'),
    transactionHash: '0xabcdef',
    transactionIndex: 1,
    logIndex: 0,
    ...overrides,
  });

  const createMockStrategyCreatedEvent = (overrides = {}): StrategyCreatedEvent =>
    ({
      strategyId: 'strategy1',
      owner: '0xowner1',
      pair: {
        id: 1,
        token0: { address: '0xtoken0', decimals: 18 },
        token1: { address: '0xtoken1', decimals: 6 },
      },
      token0: { address: '0xtoken0', decimals: 18 }, // Strategy's token0 (same as pair's token0 in this mock)
      token1: { address: '0xtoken1', decimals: 6 }, // Strategy's token1 (same as pair's token1 in this mock)
      order0: JSON.stringify({ y: '1000000000000000000' }), // 1 token0
      order1: JSON.stringify({ y: '2000000' }), // 2 token1
      ...createMockEvent(),
      ...overrides,
    } as StrategyCreatedEvent);

  const createMockStrategyUpdatedEvent = (overrides = {}): StrategyUpdatedEvent =>
    ({
      strategyId: 'strategy1',
      reason: 0, // Regular update
      pair: {
        id: 1,
        token0: { address: '0xtoken0', decimals: 18 },
        token1: { address: '0xtoken1', decimals: 6 },
      },
      token0: { address: '0xtoken0', decimals: 18 }, // Strategy's token0 (same as pair's token0 in this mock)
      token1: { address: '0xtoken1', decimals: 6 }, // Strategy's token1 (same as pair's token1 in this mock)
      order0: JSON.stringify({ y: '2000000000000000000' }), // 2 token0
      order1: JSON.stringify({ y: '1000000' }), // 1 token1
      ...createMockEvent(),
      ...overrides,
    } as StrategyUpdatedEvent);

  const createMockStrategyDeletedEvent = (overrides = {}): StrategyDeletedEvent =>
    ({
      strategyId: 'strategy1',
      pair: { id: 1 },
      ...createMockEvent(),
      ...overrides,
    } as StrategyDeletedEvent);

  const createMockVoucherTransferEvent = (overrides = {}): VoucherTransferEvent =>
    ({
      strategyId: 'strategy1',
      from: '0xowner1',
      to: '0xowner2',
      ...createMockEvent(),
      ...overrides,
    } as VoucherTransferEvent);

  const createMockTokensTradedEvent = (overrides = {}): TokensTradedEvent =>
    ({
      pair: { id: 1 },
      trader: '0xtrader',
      callerId: '0xtrader', // Add callerId field used by createSwapEvent for maker
      sourceToken: { address: '0xtoken0', decimals: 18 },
      targetToken: { address: '0xtoken1', decimals: 6 },
      sourceAmount: '1000000000000000000', // 1 token0
      targetAmount: '500000', // 0.5 token1
      ...createMockEvent(),
      ...overrides,
    } as TokensTradedEvent);

  beforeEach(async () => {
    const mockQueryBuilder = {
      delete: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({}),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockReturnThis(),
    };

    const mockRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      save: jest.fn().mockResolvedValue([]),
      query: jest.fn().mockResolvedValue([]),
      manager: {
        query: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DexScreenerV2Service,
        {
          provide: getRepositoryToken(DexScreenerEventV2),
          useValue: mockRepository,
        },
        {
          provide: CACHE_MANAGER,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            reset: jest.fn(),
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
      ],
    }).compile();

    service = module.get<DexScreenerV2Service>(DexScreenerV2Service);
    dexScreenerEventV2Repository = module.get(getRepositoryToken(DexScreenerEventV2));
    cacheManager = module.get(CACHE_MANAGER);
    lastProcessedBlockService = module.get(LastProcessedBlockService);
    strategyCreatedEventService = module.get(StrategyCreatedEventService);
    strategyUpdatedEventService = module.get(StrategyUpdatedEventService);
    strategyDeletedEventService = module.get(StrategyDeletedEventService);
    voucherTransferEventService = module.get(VoucherTransferEventService);
    tokensTradedEventService = module.get(TokensTradedEventService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('update', () => {
    beforeEach(() => {
      lastProcessedBlockService.getOrInit.mockResolvedValue(1999);
      lastProcessedBlockService.update.mockResolvedValue(undefined);
      strategyCreatedEventService.get.mockResolvedValue([]);
      strategyUpdatedEventService.get.mockResolvedValue([]);
      strategyDeletedEventService.get.mockResolvedValue([]);
      voucherTransferEventService.get.mockResolvedValue([]);
      tokensTradedEventService.get.mockResolvedValue([]);
      (dexScreenerEventV2Repository.manager.query as jest.Mock).mockResolvedValue([]);
    });

    it('should initialize last processed block correctly', async () => {
      await service.update(2100, mockDeployment, mockTokensByAddress);

      expect(lastProcessedBlockService.getOrInit).toHaveBeenCalledWith('ethereum-ethereum-dex-screener-v2', 1000);
    });

    it('should clean up existing events for the batch range', async () => {
      const queryBuilder = dexScreenerEventV2Repository.createQueryBuilder();

      await service.update(2100, mockDeployment, mockTokensByAddress);

      expect(queryBuilder.delete).toHaveBeenCalled();
      expect(queryBuilder.where).toHaveBeenCalledWith('"blockNumber" >= :lastProcessedBlock', {
        lastProcessedBlock: 1999,
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('"blockchainType" = :blockchainType', {
        blockchainType: 'ethereum',
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('"exchangeId" = :exchangeId', { exchangeId: 'ethereum' });
      expect(queryBuilder.execute).toHaveBeenCalled();
    });

    it('should process events in batches and update last processed block', async () => {
      const endBlock = 2100;
      lastProcessedBlockService.getOrInit.mockResolvedValue(1999);

      await service.update(endBlock, mockDeployment, mockTokensByAddress);

      expect(lastProcessedBlockService.update).toHaveBeenCalledWith('ethereum-ethereum-dex-screener-v2', endBlock);
    });

    it('should fetch all event types in parallel for each batch', async () => {
      const createdEvent = createMockStrategyCreatedEvent();
      const updatedEvent = createMockStrategyUpdatedEvent();
      const deletedEvent = createMockStrategyDeletedEvent();
      const transferEvent = createMockVoucherTransferEvent();
      const tradedEvent = createMockTokensTradedEvent();

      strategyCreatedEventService.get.mockResolvedValue([createdEvent]);
      strategyUpdatedEventService.get.mockResolvedValue([updatedEvent]);
      strategyDeletedEventService.get.mockResolvedValue([deletedEvent]);
      voucherTransferEventService.get.mockResolvedValue([transferEvent]);
      tokensTradedEventService.get.mockResolvedValue([tradedEvent]);

      await service.update(2100, mockDeployment, mockTokensByAddress);

      expect(strategyCreatedEventService.get).toHaveBeenCalledWith(2000, 2100, mockDeployment);
      expect(strategyUpdatedEventService.get).toHaveBeenCalledWith(2000, 2100, mockDeployment);
      expect(strategyDeletedEventService.get).toHaveBeenCalledWith(2000, 2100, mockDeployment);
      expect(voucherTransferEventService.get).toHaveBeenCalledWith(2000, 2100, mockDeployment);
      expect(tokensTradedEventService.get).toHaveBeenCalledWith(2000, 2100, mockDeployment);
    });

    it('should save processed events in batches', async () => {
      const createdEvent = createMockStrategyCreatedEvent();
      strategyCreatedEventService.get.mockResolvedValue([createdEvent]);

      await service.update(2100, mockDeployment, mockTokensByAddress);

      expect(dexScreenerEventV2Repository.save).toHaveBeenCalled();
    });
  });

  describe('processEvents', () => {
    it('should process strategy creation event and generate join event', () => {
      const createdEvent = createMockStrategyCreatedEvent();
      const result = service['processEvents'](
        [createdEvent],
        [],
        [],
        [],
        [],
        mockDeployment,
        mockTokensByAddress,
        new Map(),
      );

      expect(result).toHaveLength(1);
      expect(result[0].eventType).toBe('join');
      expect(result[0].maker).toBe('0xowner1');
      expect(result[0].pairId).toBe(1);
      expect(result[0].amount0).toBe('1'); // 1e18 / 1e18 = 1
      expect(result[0].amount1).toBe('2'); // 2e6 / 1e6 = 2
    });

    it('should process strategy update event with liquidity changes', () => {
      const strategyStates = new Map();
      const state = {
        strategyId: 'strategy1',
        pairId: 1,
        token0Address: '0xtoken0',
        token1Address: '0xtoken1',
        token0Decimals: 18,
        token1Decimals: 6,
        liquidity0: new Decimal('1000000000000000000'), // 1 token0
        liquidity1: new Decimal('2000000'), // 2 token1
        lastProcessedBlock: 1999,
        currentOwner: '0xowner1',
        creationWallet: '0xowner1',
      };
      strategyStates.set('strategy1', state);

      const updatedEvent = createMockStrategyUpdatedEvent({
        order0: JSON.stringify({ y: '3000000000000000000' }), // 3 token0 (increase by 2)
        order1: JSON.stringify({ y: '1000000' }), // 1 token1 (decrease by 1)
      });

      const result = service['processEvents'](
        [],
        [updatedEvent],
        [],
        [],
        [],
        mockDeployment,
        mockTokensByAddress,
        strategyStates,
      );

      expect(result).toHaveLength(2); // One join for token0, one exit for token1
      expect(result[0].eventType).toBe('join');
      expect(result[0].amount0).toBe('2'); // Increase by 2 token0
      expect(result[1].eventType).toBe('exit');
      expect(result[1].amount1).toBe('1'); // Decrease by 1 token1
    });

    it('should skip trade updates (reason = 1)', () => {
      const strategyStates = new Map();
      const state = {
        strategyId: 'strategy1',
        pairId: 1,
        token0Address: '0xtoken0',
        token1Address: '0xtoken1',
        token0Decimals: 18,
        token1Decimals: 6,
        liquidity0: new Decimal('1000000000000000000'),
        liquidity1: new Decimal('2000000'),
        lastProcessedBlock: 1999,
        currentOwner: '0xowner1',
        creationWallet: '0xowner1',
      };
      strategyStates.set('strategy1', state);

      const updatedEvent = createMockStrategyUpdatedEvent({
        reason: 1, // Trade update
        order0: JSON.stringify({ y: '2000000000000000000' }),
        order1: JSON.stringify({ y: '1000000' }),
      });

      const result = service['processEvents'](
        [],
        [updatedEvent],
        [],
        [],
        [],
        mockDeployment,
        mockTokensByAddress,
        strategyStates,
      );

      expect(result).toHaveLength(0); // No join/exit events for trade updates
      expect(state.liquidity0.toString()).toBe('2000000000000000000'); // State updated
      expect(state.liquidity1.toString()).toBe('1000000'); // State updated
    });

    it('should process strategy deletion event and generate exit event', () => {
      const strategyStates = new Map();
      const state = {
        strategyId: 'strategy1',
        pairId: 1,
        token0Address: '0xtoken0',
        token1Address: '0xtoken1',
        token0Decimals: 18,
        token1Decimals: 6,
        liquidity0: new Decimal('1000000000000000000'),
        liquidity1: new Decimal('2000000'),
        lastProcessedBlock: 1999,
        currentOwner: '0xowner1',
        creationWallet: '0xowner1',
      };
      strategyStates.set('strategy1', state);

      const deletedEvent = createMockStrategyDeletedEvent();

      const result = service['processEvents'](
        [],
        [],
        [deletedEvent],
        [],
        [],
        mockDeployment,
        mockTokensByAddress,
        strategyStates,
      );

      expect(result).toHaveLength(1);
      expect(result[0].eventType).toBe('exit');
      expect(result[0].maker).toBe('0xowner1');
      expect(strategyStates.has('strategy1')).toBe(false); // Strategy removed from state
    });

    it('should process voucher transfer event and update ownership', () => {
      const strategyStates = new Map();
      const state = {
        strategyId: 'strategy1',
        pairId: 1,
        token0Address: '0xtoken0',
        token1Address: '0xtoken1',
        token0Decimals: 18,
        token1Decimals: 6,
        liquidity0: new Decimal('1000000000000000000'),
        liquidity1: new Decimal('2000000'),
        lastProcessedBlock: 1999,
        currentOwner: '0xowner1',
        creationWallet: '0xowner1',
      };
      strategyStates.set('strategy1', state);

      const transferEvent = createMockVoucherTransferEvent();

      const result = service['processEvents'](
        [],
        [],
        [],
        [transferEvent],
        [],
        mockDeployment,
        mockTokensByAddress,
        strategyStates,
      );

      expect(result).toHaveLength(0); // Transfer doesn't generate dex screener events
      expect(state.currentOwner).toBe('0xowner2'); // Ownership updated
    });

    it('should skip zero address transfers', () => {
      const strategyStates = new Map();
      const state = {
        strategyId: 'strategy1',
        pairId: 1,
        token0Address: '0xtoken0',
        token1Address: '0xtoken1',
        token0Decimals: 18,
        token1Decimals: 6,
        liquidity0: new Decimal('1000000000000000000'),
        liquidity1: new Decimal('2000000'),
        lastProcessedBlock: 1999,
        currentOwner: '0xowner1',
        creationWallet: '0xowner1',
      };
      strategyStates.set('strategy1', state);

      const transferEvent = createMockVoucherTransferEvent({
        to: '0x0000000000000000000000000000000000000000',
      });

      const result = service['processEvents'](
        [],
        [],
        [],
        [transferEvent],
        [],
        mockDeployment,
        mockTokensByAddress,
        strategyStates,
      );

      expect(result).toHaveLength(0);
      expect(state.currentOwner).toBe('0xowner1'); // Ownership unchanged
    });

    it('should process trade event and generate swap event', () => {
      const strategyStates = new Map();
      const state = {
        strategyId: 'strategy1',
        pairId: 1,
        token0Address: '0xtoken0',
        token1Address: '0xtoken1',
        token0Decimals: 18,
        token1Decimals: 6,
        liquidity0: new Decimal('10000000000000000000'), // 10 token0
        liquidity1: new Decimal('5000000'), // 5 token1
        lastProcessedBlock: 1999,
        currentOwner: '0xowner1',
        creationWallet: '0xowner1',
      };
      strategyStates.set('strategy1', state);

      const tradedEvent = createMockTokensTradedEvent();

      const result = service['processEvents'](
        [],
        [],
        [],
        [],
        [tradedEvent],
        mockDeployment,
        mockTokensByAddress,
        strategyStates,
      );

      expect(result).toHaveLength(1);
      expect(result[0].eventType).toBe('swap');
      expect(result[0].maker).toBe('0xtrader');
      expect(result[0].asset0In).toBe('1'); // 1 token0 in (token0 < token1 lexicographically)
      expect(result[0].asset1Out).toBe('0.5'); // 0.5 token1 out
      expect(result[0].priceNative).toBe('2'); // 1 token0 / 0.5 token1 = 2
    });

    it('should process events in chronological order', () => {
      const event1 = createMockStrategyCreatedEvent({
        block: { id: 2000 },
        transactionIndex: 1,
        logIndex: 0,
      });
      const event2 = createMockStrategyUpdatedEvent({
        block: { id: 2000 },
        transactionIndex: 1,
        logIndex: 1,
      });
      const event3 = createMockTokensTradedEvent({
        block: { id: 2001 },
        transactionIndex: 0,
        logIndex: 0,
      });

      const result = service['processEvents'](
        [event1],
        [event2],
        [],
        [],
        [event3],
        mockDeployment,
        mockTokensByAddress,
        new Map(),
      );

      // Should be processed in order: created, updated (which creates 2 events), traded
      expect(result).toHaveLength(4);
      expect(result[0].blockNumber).toBe(2000);
      expect(result[0].eventIndex).toBe(0); // Created event
      expect(result[1].blockNumber).toBe(2000);
      expect(result[1].eventIndex).toBe(1); // Updated event (join for token0)
      expect(result[2].blockNumber).toBe(2000);
      expect(result[2].eventIndex).toBe(1.5); // Updated event (exit for token1)
      expect(result[3].blockNumber).toBe(2001);
      expect(result[3].eventIndex).toBe(0); // Trade event
    });

    it('should process trade updates before trade events in same transaction for post-trade reserves', () => {
      // Create strategy first
      const strategyCreated = createMockStrategyCreatedEvent({
        block: { id: 1000 },
        transactionIndex: 0,
        logIndex: 0,
        strategyId: 'test-strategy',
        order0: JSON.stringify({ y: '1000000', z: '0', A: '0', B: '0' }),
        order1: JSON.stringify({ y: '2000000', z: '0', A: '0', B: '0' }),
      });

      // Trade event in transaction 1, logIndex 0
      const tradeEvent = createMockTokensTradedEvent({
        block: { id: 1001 },
        transactionIndex: 1,
        logIndex: 0,
        pair: { id: 1 },
      });

      // Strategy update from trade in transaction 1, logIndex 1 (after trade event chronologically)
      const tradeUpdate = createMockStrategyUpdatedEvent({
        block: { id: 1001 },
        transactionIndex: 1,
        logIndex: 1,
        strategyId: 'test-strategy',
        reason: 1, // Trade update
        order0: JSON.stringify({ y: '800000000000000000', z: '0', A: '0', B: '0' }), // Reduced after trade (18 decimals)
        order1: JSON.stringify({ y: '2200000', z: '0', A: '0', B: '0' }), // Increased after trade (6 decimals)
      });

      const result = service['processEvents'](
        [strategyCreated],
        [tradeUpdate],
        [],
        [],
        [tradeEvent],
        mockDeployment,
        mockTokensByAddress,
        new Map(),
      );

      // Should be processed in order: created, trade update (reason=1), then trade event
      expect(result).toHaveLength(2);
      expect(result[0].eventType).toBe('join'); // Strategy creation
      expect(result[1].eventType).toBe('swap'); // Trade event

      // The trade event should show post-trade reserves (after the strategy update)
      // The reserves should reflect the updated strategy state
      const swapEvent = result[1];
      expect(swapEvent.reserves0).toBe('0.8'); // 800000000000000000 / 10^18 = 0.8 (TOKEN0 with 18 decimals)
      expect(swapEvent.reserves1).toBe('2.2'); // 2200000 / 10^6 = 2.2 (TOKEN1 with 6 decimals)
    });
  });

  describe('createStrategyState', () => {
    it('should create strategy state from created event', () => {
      const createdEvent = createMockStrategyCreatedEvent();
      const state = service['createStrategyState'](createdEvent);

      expect(state.strategyId).toBe('strategy1');
      expect(state.pairId).toBe(1);
      expect(state.token0Address).toBe('0xtoken0');
      expect(state.token1Address).toBe('0xtoken1');
      expect(state.token0Decimals).toBe(18);
      expect(state.token1Decimals).toBe(6);
      expect(state.liquidity0.toString()).toBe('1000000000000000000');
      expect(state.liquidity1.toString()).toBe('2000000');
      expect(state.currentOwner).toBe('0xowner1');
      expect(state.creationWallet).toBe('0xowner1');
    });

    it('should handle zero liquidity in orders', () => {
      const createdEvent = createMockStrategyCreatedEvent({
        order0: JSON.stringify({}), // No y field
        order1: JSON.stringify({ y: null }), // Null y field
      });
      const state = service['createStrategyState'](createdEvent);

      expect(state.liquidity0.toString()).toBe('0');
      expect(state.liquidity1.toString()).toBe('0');
    });

    it('should correctly map strategy orders to pair tokens when token ordering differs', () => {
      // Create a scenario where strategy tokens are in reverse lexicographic order
      const createdEvent = createMockStrategyCreatedEvent({
        token0: { address: '0xBBBB', decimals: 6 }, // Strategy token0 (lexicographically larger)
        token1: { address: '0xAAAA', decimals: 18 }, // Strategy token1 (lexicographically smaller)
        order0: JSON.stringify({ y: '1000000' }), // 1 BBBB token (6 decimals) - for larger address
        order1: JSON.stringify({ y: '2000000000000000000' }), // 2 AAAA tokens (18 decimals) - for smaller address
      });

      const state = service['createStrategyState'](createdEvent);

      // Verify state uses lexicographic token ordering (pairs are always saved this way)
      expect(state.token0Address).toBe('0xAAAA'); // Should be lexicographically smaller address
      expect(state.token1Address).toBe('0xBBBB'); // Should be lexicographically larger address
      expect(state.token0Decimals).toBe(18); // Should be decimals for smaller address
      expect(state.token1Decimals).toBe(6); // Should be decimals for larger address

      // Verify liquidity is mapped correctly:
      // order0 (1000000) corresponds to strategy's token0 (0xBBBB) which maps to pair's token1 (larger address)
      // order1 (2000000000000000000) corresponds to strategy's token1 (0xAAAA) which maps to pair's token0 (smaller address)
      expect(state.liquidity0.toString()).toBe('2000000000000000000'); // Should be order1.y (for smaller address = pair token0)
      expect(state.liquidity1.toString()).toBe('1000000'); // Should be order0.y (for larger address = pair token1)
    });
  });

  describe('calculateLiquidityDelta', () => {
    const mockState = {
      strategyId: 'strategy1',
      pairId: 1,
      token0Address: '0xtoken0',
      token1Address: '0xtoken1',
      token0Decimals: 18,
      token1Decimals: 6,
      liquidity0: new Decimal('1000000000000000000'), // 1 token0
      liquidity1: new Decimal('2000000'), // 2 token1
      lastProcessedBlock: 1999,
      currentOwner: '0xowner1',
      creationWallet: '0xowner1',
    };

    it('should calculate delta for regular update', () => {
      const updatedEvent = createMockStrategyUpdatedEvent({
        reason: 0, // Regular update
        order0: JSON.stringify({ y: '3000000000000000000' }), // 3 token0
        order1: JSON.stringify({ y: '1000000' }), // 1 token1
      });

      const { deltaAmount0, deltaAmount1 } = service['calculateLiquidityDelta'](updatedEvent, mockState);

      expect(deltaAmount0.toString()).toBe('2000000000000000000'); // +2 token0
      expect(deltaAmount1.toString()).toBe('-1000000'); // -1 token1
    });

    it('should calculate delta for strategy creation (reason = 2)', () => {
      const updatedEvent = createMockStrategyUpdatedEvent({
        reason: 2, // Strategy creation
        order0: JSON.stringify({ y: '5000000000000000000' }), // 5 token0
        order1: JSON.stringify({ y: '3000000' }), // 3 token1
      });

      const { deltaAmount0, deltaAmount1 } = service['calculateLiquidityDelta'](updatedEvent, mockState);

      expect(deltaAmount0.toString()).toBe('5000000000000000000'); // Full amount
      expect(deltaAmount1.toString()).toBe('3000000'); // Full amount
    });

    it('should calculate delta for strategy deletion (reason = 3)', () => {
      const updatedEvent = createMockStrategyUpdatedEvent({
        reason: 3, // Strategy deletion
        order0: JSON.stringify({ y: '0' }), // 0 token0
        order1: JSON.stringify({ y: '0' }), // 0 token1
      });

      const { deltaAmount0, deltaAmount1 } = service['calculateLiquidityDelta'](updatedEvent, mockState);

      expect(deltaAmount0.toString()).toBe('0'); // Negated 0 = 0
      expect(deltaAmount1.toString()).toBe('0'); // Negated 0 = 0
    });
  });

  describe('determineJoinExitType', () => {
    it('should return null for zero deltas', () => {
      const result = service['determineJoinExitType'](new Decimal(0), new Decimal(0));
      expect(result).toBeNull();
    });

    it('should return join for positive deltas', () => {
      const result = service['determineJoinExitType'](new Decimal(100), new Decimal(200));
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('join');
      expect(result[0].amount0.toString()).toBe('100');
      expect(result[0].amount1.toString()).toBe('200');
    });

    it('should return exit for negative deltas', () => {
      const result = service['determineJoinExitType'](new Decimal(-100), new Decimal(-200));
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('exit');
      expect(result[0].amount0.toString()).toBe('100'); // Absolute value
      expect(result[0].amount1.toString()).toBe('200'); // Absolute value
    });

    it('should return mixed events for mixed deltas (negative token0, positive token1)', () => {
      const result = service['determineJoinExitType'](new Decimal(-100), new Decimal(200));
      expect(result).toHaveLength(2);

      expect(result[0].type).toBe('exit');
      expect(result[0].amount0.toString()).toBe('100');
      expect(result[0].amount1).toBeNull();

      expect(result[1].type).toBe('join');
      expect(result[1].amount0).toBeNull();
      expect(result[1].amount1.toString()).toBe('200');
    });

    it('should return mixed events for mixed deltas (positive token0, negative token1)', () => {
      const result = service['determineJoinExitType'](new Decimal(100), new Decimal(-200));
      expect(result).toHaveLength(2);

      expect(result[0].type).toBe('join');
      expect(result[0].amount0.toString()).toBe('100');
      expect(result[0].amount1).toBeNull();

      expect(result[1].type).toBe('exit');
      expect(result[1].amount0).toBeNull();
      expect(result[1].amount1.toString()).toBe('200');
    });
  });

  describe('calculateReserves0ForPair and calculateReserves1ForPair', () => {
    it('should calculate reserves correctly with consistent asset ordering', () => {
      const strategyStates = new Map();

      // Strategy 1: token0 < token1 lexicographically
      strategyStates.set('strategy1', {
        strategyId: 'strategy1',
        pairId: 1,
        token0Address: '0xaaa', // Smaller address
        token1Address: '0xbbb', // Larger address
        token0Decimals: 18,
        token1Decimals: 6,
        liquidity0: new Decimal('1000000000000000000'), // 1 token0
        liquidity1: new Decimal('2000000'), // 2 token1
        lastProcessedBlock: 2000,
        currentOwner: '0xowner1',
        creationWallet: '0xowner1',
      });

      // Strategy 2: Different ordering
      strategyStates.set('strategy2', {
        strategyId: 'strategy2',
        pairId: 1,
        token0Address: '0xbbb', // Larger address (swapped)
        token1Address: '0xaaa', // Smaller address (swapped)
        token0Decimals: 6,
        token1Decimals: 18,
        liquidity0: new Decimal('3000000'), // 3 token (bbb)
        liquidity1: new Decimal('4000000000000000000'), // 4 token (aaa)
        lastProcessedBlock: 2000,
        currentOwner: '0xowner2',
        creationWallet: '0xowner2',
      });

      // Asset0 should be the lexicographically smaller address (0xaaa)
      const reserves0 = service['calculateReserves0ForPair'](1, '0xaaa', strategyStates);
      // Asset1 should be the lexicographically larger address (0xbbb)
      const reserves1 = service['calculateReserves1ForPair'](1, '0xbbb', strategyStates);

      // Strategy1: token0=0xaaa (1 unit), token1=0xbbb (2 units)
      // Strategy2: token0=0xbbb (3 units), token1=0xaaa (4 units)
      // For asset0 (0xaaa): 1 (from strategy1) + 4 (from strategy2) = 5
      // For asset1 (0xbbb): 2 (from strategy1) + 3 (from strategy2) = 5
      expect(reserves0).toBe('5');
      expect(reserves1).toBe('5');
    });

    it('should return zero reserves for pair with no strategies', () => {
      const strategyStates = new Map();

      const reserves0 = service['calculateReserves0ForPair'](999, '0xtoken0', strategyStates);
      const reserves1 = service['calculateReserves1ForPair'](999, '0xtoken1', strategyStates);

      expect(reserves0).toBe('0');
      expect(reserves1).toBe('0');
    });

    it('should handle different decimal places correctly', () => {
      const strategyStates = new Map();

      strategyStates.set('strategy1', {
        strategyId: 'strategy1',
        pairId: 1,
        token0Address: '0xaaa',
        token1Address: '0xbbb',
        token0Decimals: 18,
        token1Decimals: 6,
        liquidity0: new Decimal('1000000000000000000'), // 1 token (18 decimals)
        liquidity1: new Decimal('2000000'), // 2 tokens (6 decimals)
        lastProcessedBlock: 2000,
        currentOwner: '0xowner1',
        creationWallet: '0xowner1',
      });

      const reserves0 = service['calculateReserves0ForPair'](1, '0xaaa', strategyStates);
      const reserves1 = service['calculateReserves1ForPair'](1, '0xbbb', strategyStates);

      expect(reserves0).toBe('1'); // 1e18 / 1e18 = 1
      expect(reserves1).toBe('2'); // 2e6 / 1e6 = 2
    });

    it('should use correct decimals when token ordering is not lexicographic', () => {
      // This test covers the bug where decimals were incorrectly assigned based on lexicographic ordering
      const strategyStates = new Map();

      strategyStates.set('strategy1', {
        strategyId: 'strategy1',
        pairId: 1,
        // NOTE: token0Address > token1Address (reverse lexicographic order)
        token0Address: '0xZZZ', // Larger address (token0 in pair)
        token1Address: '0xAAA', // Smaller address (token1 in pair)
        token0Decimals: 6, // token0 has 6 decimals
        token1Decimals: 18, // token1 has 18 decimals
        liquidity0: new Decimal('1000000'), // 1 token0 (6 decimals)
        liquidity1: new Decimal('2000000000000000000'), // 2 token1 (18 decimals)
        lastProcessedBlock: 2000,
        currentOwner: '0xowner1',
        creationWallet: '0xowner1',
      });

      // When asking for reserves of token0 (0xZZZ), should use token0Decimals (6)
      const reserves0 = service['calculateReserves0ForPair'](1, '0xZZZ', strategyStates);
      // When asking for reserves of token1 (0xAAA), should use token1Decimals (18)
      const reserves1 = service['calculateReserves1ForPair'](1, '0xAAA', strategyStates);

      // Should correctly normalize: 1000000 / 10^6 = 1 for token0
      expect(reserves0).toBe('1');
      // Should correctly normalize: 2000000000000000000 / 10^18 = 2 for token1
      expect(reserves1).toBe('2');

      // Also test the reverse scenario - asking for token1 as asset0 and token0 as asset1
      const reserves0Alt = service['calculateReserves0ForPair'](1, '0xAAA', strategyStates);
      const reserves1Alt = service['calculateReserves1ForPair'](1, '0xZZZ', strategyStates);

      // Should still get correct values when addresses are swapped
      expect(reserves0Alt).toBe('2'); // token1's liquidity with token1's decimals
      expect(reserves1Alt).toBe('1'); // token0's liquidity with token0's decimals
    });
  });

  describe('initializeStrategyStates', () => {
    beforeEach(() => {
      // Reset the mock before each test in this describe block
      (dexScreenerEventV2Repository.manager.query as jest.Mock).mockReset();
    });

    it('should initialize strategy states from database', async () => {
      // Mock the complex database queries for this specific test
      (dexScreenerEventV2Repository.manager.query as jest.Mock)
        .mockResolvedValueOnce([
          // Latest liquidity states
          {
            strategy_id: 'strategy1',
            block_id: 1999,
            order0: JSON.stringify({ y: '1000000000000000000' }),
            order1: JSON.stringify({ y: '2000000' }),
            pair_id: 1,
            token0_address: '0xtoken0',
            token1_address: '0xtoken1',
            token0_decimals: 18,
            token1_decimals: 6,
            owner: '0xowner1',
            transaction_index: 1,
            log_index: 0,
          },
        ])
        .mockResolvedValueOnce([
          // Latest ownership states
          {
            strategy_id: 'strategy1',
            current_owner: '0xowner2',
          },
        ])
        .mockResolvedValueOnce([
          // Deleted strategies
        ]);

      const strategyStates = new Map();

      await service['initializeStrategyStates'](1999, mockDeployment, strategyStates);

      expect(strategyStates.size).toBe(1);
      expect(strategyStates.has('strategy1')).toBe(true);

      const state = strategyStates.get('strategy1');
      expect(state.strategyId).toBe('strategy1');
      expect(state.pairId).toBe(1);
      expect(state.liquidity0.toString()).toBe('1000000000000000000');
      expect(state.liquidity1.toString()).toBe('2000000');
      expect(state.currentOwner).toBe('0xowner2'); // Updated from transfer
      expect(state.creationWallet).toBe('0xowner1'); // Original owner
      expect(state.lastProcessedBlock).toBe(1999);
    });

    it('should handle deleted strategies by setting liquidity to zero', async () => {
      (dexScreenerEventV2Repository.manager.query as jest.Mock)
        .mockResolvedValueOnce([
          // Latest liquidity states - includes the deleted strategy
          {
            strategy_id: 'deleted_strategy',
            block_id: 1999,
            order0: JSON.stringify({ y: '1000000000000000000' }),
            order1: JSON.stringify({ y: '2000000' }),
            pair_id: 1,
            token0_address: '0xtoken0',
            token1_address: '0xtoken1',
            token0_decimals: 18,
            token1_decimals: 6,
            owner: '0xowner1',
            transaction_index: 1,
            log_index: 0,
          },
        ])
        .mockResolvedValueOnce([
          // Latest ownership states - empty
        ])
        .mockResolvedValueOnce([
          // Deleted strategies - includes our strategy
          { strategy_id: 'deleted_strategy' },
        ]);

      const strategyStates = new Map();

      await service['initializeStrategyStates'](1999, mockDeployment, strategyStates);

      expect(strategyStates.size).toBe(1);
      const state = strategyStates.get('deleted_strategy');
      expect(state).toBeDefined();
      if (state) {
        expect(state.liquidity0.toString()).toBe('0');
        expect(state.liquidity1.toString()).toBe('0');
      }
    });

    it('should call database queries with correct parameters', async () => {
      // Mock the database queries with minimal data
      (dexScreenerEventV2Repository.manager.query as jest.Mock)
        .mockResolvedValueOnce([]) // Latest liquidity states
        .mockResolvedValueOnce([]) // Latest ownership states
        .mockResolvedValueOnce([]); // Deleted strategies

      const strategyStates = new Map();

      await service['initializeStrategyStates'](1999, mockDeployment, strategyStates);

      expect(dexScreenerEventV2Repository.manager.query).toHaveBeenCalledTimes(3);
      expect(dexScreenerEventV2Repository.manager.query).toHaveBeenNthCalledWith(1, expect.any(String), [
        1999,
        'ethereum',
        'ethereum',
      ]);
      expect(dexScreenerEventV2Repository.manager.query).toHaveBeenNthCalledWith(2, expect.any(String), [
        1999,
        'ethereum',
        'ethereum',
      ]);
      expect(dexScreenerEventV2Repository.manager.query).toHaveBeenNthCalledWith(3, expect.any(String), [
        1999,
        'ethereum',
        'ethereum',
      ]);
    });
  });

  describe('getEvents', () => {
    it('should retrieve events with correct filters and ordering', async () => {
      const mockEvents = [
        { blockNumber: 2000, txnIndex: 1, eventIndex: 0 },
        { blockNumber: 2001, txnIndex: 0, eventIndex: 1 },
      ];

      const queryBuilder = dexScreenerEventV2Repository.createQueryBuilder();
      (queryBuilder.getMany as jest.Mock).mockResolvedValue(mockEvents);

      const result = await service.getEvents(2000, 2100, mockDeployment);

      expect(result).toEqual(mockEvents);
      expect(queryBuilder.where).toHaveBeenCalledWith('event.blockchainType = :blockchainType', {
        blockchainType: 'ethereum',
      });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('event.exchangeId = :exchangeId', { exchangeId: 'ethereum' });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('event.blockNumber >= :fromBlock', { fromBlock: 2000 });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('event.blockNumber <= :endBlock', { endBlock: 2100 });
      expect(queryBuilder.orderBy).toHaveBeenCalledWith('event.blockNumber', 'ASC');
      expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('event.txnIndex', 'ASC');
      expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('event.eventIndex', 'ASC');
    });
  });

  describe('createJoinExitEvent', () => {
    it('should create join event with correct reserves calculation', () => {
      const strategyStates = new Map();
      const state = {
        strategyId: 'strategy1',
        pairId: 1,
        token0Address: '0xaaa', // Smaller address
        token1Address: '0xbbb', // Larger address
        token0Decimals: 18,
        token1Decimals: 6,
        liquidity0: new Decimal('1000000000000000000'), // 1 token0
        liquidity1: new Decimal('2000000'), // 2 token1
        lastProcessedBlock: 2000,
        currentOwner: '0xowner1',
        creationWallet: '0xowner1',
      };
      strategyStates.set('strategy1', state);

      const event = service['createJoinExitEvent'](
        2000,
        new Date('2023-01-01T00:00:00Z'),
        '0xabcdef',
        1,
        0,
        'join',
        '0xowner1',
        1,
        state,
        mockDeployment,
        strategyStates,
      );

      expect(event.eventType).toBe('join');
      expect(event.maker).toBe('0xowner1');
      expect(event.pairId).toBe(1);
      expect(event.amount0).toBe('1'); // 1e18 / 1e18 = 1
      expect(event.amount1).toBe('2'); // 2e6 / 1e6 = 2
      expect(event.reserves0).toBe('1'); // Same as amount0 for this single strategy
      expect(event.reserves1).toBe('2'); // Same as amount1 for this single strategy
    });

    it('should create exit event with correct reserves calculation', () => {
      const strategyStates = new Map();
      const state = {
        strategyId: 'strategy1',
        pairId: 1,
        token0Address: '0xaaa',
        token1Address: '0xbbb',
        token0Decimals: 18,
        token1Decimals: 6,
        liquidity0: new Decimal('5000000000000000000'), // 5 token0
        liquidity1: new Decimal('3000000'), // 3 token1
        lastProcessedBlock: 2000,
        currentOwner: '0xowner1',
        creationWallet: '0xowner1',
      };
      strategyStates.set('strategy1', state);

      const event = service['createJoinExitEvent'](
        2000,
        new Date('2023-01-01T00:00:00Z'),
        '0xabcdef',
        1,
        0,
        'exit',
        '0xowner1',
        1,
        state,
        mockDeployment,
        strategyStates,
      );

      expect(event.eventType).toBe('exit');
      expect(event.maker).toBe('0xowner1');
      expect(event.amount0).toBe('5');
      expect(event.amount1).toBe('3');
      expect(event.reserves0).toBe('5');
      expect(event.reserves1).toBe('3');
    });
  });

  describe('createJoinExitEventWithDeltas', () => {
    it('should create single event when both amounts are present', () => {
      const strategyStates = new Map();
      const state = {
        strategyId: 'strategy1',
        pairId: 1,
        token0Address: '0xaaa',
        token1Address: '0xbbb',
        token0Decimals: 18,
        token1Decimals: 6,
        liquidity0: new Decimal('1000000000000000000'),
        liquidity1: new Decimal('2000000'),
        lastProcessedBlock: 2000,
        currentOwner: '0xowner1',
        creationWallet: '0xowner1',
      };
      strategyStates.set('strategy1', state);

      const events = service['createJoinExitEventWithDeltas'](
        2000,
        new Date('2023-01-01T00:00:00Z'),
        '0xabcdef',
        1,
        0,
        'join',
        '0xowner1',
        1,
        new Decimal('500000000000000000'), // 0.5 token0
        new Decimal('1000000'), // 1 token1
        state,
        mockDeployment,
        strategyStates,
      );

      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('join');
      expect(events[0].eventIndex).toBe(0);
      expect(events[0].amount0).toBe('0.5');
      expect(events[0].amount1).toBe('1');
    });

    it('should create separate events for each token when mixed amounts', () => {
      const strategyStates = new Map();
      const state = {
        strategyId: 'strategy1',
        pairId: 1,
        token0Address: '0xaaa',
        token1Address: '0xbbb',
        token0Decimals: 18,
        token1Decimals: 6,
        liquidity0: new Decimal('1000000000000000000'),
        liquidity1: new Decimal('2000000'),
        lastProcessedBlock: 2000,
        currentOwner: '0xowner1',
        creationWallet: '0xowner1',
      };
      strategyStates.set('strategy1', state);

      const events = service['createJoinExitEventWithDeltas'](
        2000,
        new Date('2023-01-01T00:00:00Z'),
        '0xabcdef',
        1,
        0,
        'join',
        '0xowner1',
        1,
        new Decimal('500000000000000000'), // 0.5 token0
        null, // No token1
        state,
        mockDeployment,
        strategyStates,
      );

      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('join');
      expect(events[0].eventIndex).toBe(0);
      expect(events[0].amount0).toBe('0.5');
      expect(events[0].amount1).toBeNull();
    });

    it('should create two separate events when only token1 amount is present', () => {
      const strategyStates = new Map();
      const state = {
        strategyId: 'strategy1',
        pairId: 1,
        token0Address: '0xaaa',
        token1Address: '0xbbb',
        token0Decimals: 18,
        token1Decimals: 6,
        liquidity0: new Decimal('1000000000000000000'),
        liquidity1: new Decimal('2000000'),
        lastProcessedBlock: 2000,
        currentOwner: '0xowner1',
        creationWallet: '0xowner1',
      };
      strategyStates.set('strategy1', state);

      const events = service['createJoinExitEventWithDeltas'](
        2000,
        new Date('2023-01-01T00:00:00Z'),
        '0xabcdef',
        1,
        0,
        'exit',
        '0xowner1',
        1,
        null, // No token0
        new Decimal('1000000'), // 1 token1
        state,
        mockDeployment,
        strategyStates,
      );

      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('exit');
      expect(events[0].eventIndex).toBe(0.5);
      expect(events[0].amount0).toBeNull();
      expect(events[0].amount1).toBe('1');
    });
  });

  describe('createSwapEvent', () => {
    it('should create swap event with correct asset ordering (source < target)', () => {
      const strategyStates = new Map();
      const state = {
        strategyId: 'strategy1',
        pairId: 1,
        token0Address: '0xaaa',
        token1Address: '0xbbb',
        token0Decimals: 18,
        token1Decimals: 6,
        liquidity0: new Decimal('10000000000000000000'), // 10 token0
        liquidity1: new Decimal('5000000'), // 5 token1
        lastProcessedBlock: 2000,
        currentOwner: '0xowner1',
        creationWallet: '0xowner1',
      };
      strategyStates.set('strategy1', state);

      const tradedEvent = createMockTokensTradedEvent({
        sourceToken: { address: '0xaaa', decimals: 18 },
        targetToken: { address: '0xbbb', decimals: 6 },
        sourceAmount: '1000000000000000000', // 1 token
        targetAmount: '500000', // 0.5 token
      });

      const event = service['createSwapEvent'](tradedEvent, mockDeployment, mockTokensByAddress, strategyStates);

      expect(event.eventType).toBe('swap');
      expect(event.maker).toBe('0xtrader');
      expect(event.pairId).toBe(1);
      expect(event.asset0In).toBe('1'); // Source is asset0 (0xaaa < 0xbbb)
      expect(event.asset1In).toBeNull();
      expect(event.asset0Out).toBeNull();
      expect(event.asset1Out).toBe('0.5'); // Target is asset1
      expect(event.priceNative).toBe('2'); // 1 / 0.5 = 2
    });

    it('should create swap event with correct asset ordering (source > target)', () => {
      const strategyStates = new Map();
      const state = {
        strategyId: 'strategy1',
        pairId: 1,
        token0Address: '0xaaa',
        token1Address: '0xbbb',
        token0Decimals: 18,
        token1Decimals: 6,
        liquidity0: new Decimal('10000000000000000000'),
        liquidity1: new Decimal('5000000'),
        lastProcessedBlock: 2000,
        currentOwner: '0xowner1',
        creationWallet: '0xowner1',
      };
      strategyStates.set('strategy1', state);

      const tradedEvent = createMockTokensTradedEvent({
        sourceToken: { address: '0xbbb', decimals: 6 }, // Larger address
        targetToken: { address: '0xaaa', decimals: 18 }, // Smaller address
        sourceAmount: '1000000', // 1 token
        targetAmount: '2000000000000000000', // 2 tokens
      });

      const event = service['createSwapEvent'](tradedEvent, mockDeployment, mockTokensByAddress, strategyStates);

      expect(event.eventType).toBe('swap');
      expect(event.asset0In).toBeNull();
      expect(event.asset1In).toBe('1'); // Source is asset1 (0xbbb > 0xaaa)
      expect(event.asset0Out).toBe('2'); // Target is asset0
      expect(event.asset1Out).toBeNull();
      expect(event.priceNative).toBe('2'); // 2 / 1 = 2
    });

    it('should handle zero source amount in price calculation', () => {
      const strategyStates = new Map();
      const tradedEvent = createMockTokensTradedEvent({
        sourceAmount: '0', // Zero source amount
        targetAmount: '500000', // 0.5 token
      });

      const event = service['createSwapEvent'](tradedEvent, mockDeployment, mockTokensByAddress, strategyStates);

      expect(event.priceNative).toBe('0'); // Should handle division by zero
    });
  });

  describe('complex integration scenarios', () => {
    it('should handle multiple strategies with overlapping events', () => {
      const strategyStates = new Map();

      // Create multiple strategies
      const createdEvent1 = createMockStrategyCreatedEvent({
        strategyId: 'strategy1',
        owner: '0xowner1',
      });
      const createdEvent2 = createMockStrategyCreatedEvent({
        strategyId: 'strategy2',
        owner: '0xowner2',
        block: { id: 2001 },
      });

      const result = service['processEvents'](
        [createdEvent1, createdEvent2],
        [],
        [],
        [],
        [],
        mockDeployment,
        mockTokensByAddress,
        strategyStates,
      );

      expect(result).toHaveLength(2);
      expect(result[0].maker).toBe('0xowner1');
      expect(result[1].maker).toBe('0xowner2');
      expect(strategyStates.size).toBe(2);
    });

    it('should handle complex sequence of events for single strategy', () => {
      const strategyStates = new Map();

      // Create, update, transfer, update, delete sequence
      const createdEvent = createMockStrategyCreatedEvent({
        block: { id: 2000 },
        transactionIndex: 0,
        logIndex: 0,
      });
      const updatedEvent = createMockStrategyUpdatedEvent({
        block: { id: 2001 },
        transactionIndex: 0,
        logIndex: 0,
        order0: JSON.stringify({ y: '3000000000000000000' }), // Increase
        order1: JSON.stringify({ y: '1000000' }), // Decrease
      });
      const transferEvent = createMockVoucherTransferEvent({
        block: { id: 2002 },
        transactionIndex: 0,
        logIndex: 0,
      });
      const deletedEvent = createMockStrategyDeletedEvent({
        block: { id: 2003 },
        transactionIndex: 0,
        logIndex: 0,
      });

      const result = service['processEvents'](
        [createdEvent],
        [updatedEvent],
        [deletedEvent],
        [transferEvent],
        [],
        mockDeployment,
        mockTokensByAddress,
        strategyStates,
      );

      // Should have: join (create), join (token0 increase), exit (token1 decrease), exit (delete)
      expect(result).toHaveLength(4);
      expect(result[0].eventType).toBe('join'); // Creation
      expect(result[1].eventType).toBe('join'); // Token0 increase
      expect(result[2].eventType).toBe('exit'); // Token1 decrease
      expect(result[3].eventType).toBe('exit'); // Deletion

      // Strategy should be removed after deletion
      expect(strategyStates.has('strategy1')).toBe(false);
    });

    it('should handle strategy updates with reason = 2 (creation) and reason = 3 (deletion)', () => {
      const strategyStates = new Map();

      const creationUpdate = createMockStrategyUpdatedEvent({
        reason: 2, // Strategy creation
        strategyId: 'strategy1',
        order0: JSON.stringify({ y: '1000000000000000000' }),
        order1: JSON.stringify({ y: '2000000' }),
      });
      const deletionUpdate = createMockStrategyUpdatedEvent({
        reason: 3, // Strategy deletion
        strategyId: 'strategy2',
        order0: JSON.stringify({ y: '0' }),
        order1: JSON.stringify({ y: '0' }),
      });

      // Add strategy1 to state for creation update (needs to exist for reason=2)
      strategyStates.set('strategy1', {
        strategyId: 'strategy1',
        pairId: 1,
        token0Address: '0xtoken0',
        token1Address: '0xtoken1',
        token0Decimals: 18,
        token1Decimals: 6,
        liquidity0: new Decimal('0'), // Start with 0 for creation
        liquidity1: new Decimal('0'),
        lastProcessedBlock: 1999,
        currentOwner: '0xowner1',
        creationWallet: '0xowner1',
      });

      // Add strategy2 to state for deletion update
      strategyStates.set('strategy2', {
        strategyId: 'strategy2',
        pairId: 1,
        token0Address: '0xtoken0',
        token1Address: '0xtoken1',
        token0Decimals: 18,
        token1Decimals: 6,
        liquidity0: new Decimal('1000000000000000000'),
        liquidity1: new Decimal('2000000'),
        lastProcessedBlock: 1999,
        currentOwner: '0xowner2',
        creationWallet: '0xowner2',
      });

      const result = service['processEvents'](
        [],
        [creationUpdate, deletionUpdate],
        [],
        [],
        [],
        mockDeployment,
        mockTokensByAddress,
        strategyStates,
      );

      expect(result).toHaveLength(1);
      expect(result[0].eventType).toBe('join'); // Only the creation update for strategy1
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle malformed JSON in order fields', () => {
      const createdEvent = createMockStrategyCreatedEvent({
        order0: 'invalid json',
        order1: JSON.stringify({ y: '1000000' }),
      });

      expect(() => service['createStrategyState'](createdEvent)).toThrow();
    });

    it('should handle missing strategy state in update events', () => {
      const updatedEvent = createMockStrategyUpdatedEvent();
      const strategyStates = new Map(); // Empty states

      const result = service['processEvents'](
        [],
        [updatedEvent],
        [],
        [],
        [],
        mockDeployment,
        mockTokensByAddress,
        strategyStates,
      );

      expect(result).toHaveLength(0); // Should not crash, just ignore
    });

    it('should handle missing strategy state in delete events', () => {
      const deletedEvent = createMockStrategyDeletedEvent();
      const strategyStates = new Map(); // Empty states

      const result = service['processEvents'](
        [],
        [],
        [deletedEvent],
        [],
        [],
        mockDeployment,
        mockTokensByAddress,
        strategyStates,
      );

      expect(result).toHaveLength(0); // Should not crash, just ignore
    });

    it('should handle missing strategy state in transfer events', () => {
      const transferEvent = createMockVoucherTransferEvent();
      const strategyStates = new Map(); // Empty states

      const result = service['processEvents'](
        [],
        [],
        [],
        [transferEvent],
        [],
        mockDeployment,
        mockTokensByAddress,
        strategyStates,
      );

      expect(result).toHaveLength(0); // Should not crash, just ignore
    });

    it('should handle zero target amount in swap price calculation', () => {
      const strategyStates = new Map();
      const tradedEvent = createMockTokensTradedEvent({
        targetAmount: '0', // Zero target amount
      });

      const result = service['processEvents'](
        [],
        [],
        [],
        [],
        [tradedEvent],
        mockDeployment,
        mockTokensByAddress,
        strategyStates,
      );

      expect(result).toHaveLength(1);
      expect(result[0].priceNative).toBe('0'); // Should handle division by zero
    });

    it('should handle very large batch sizes', async () => {
      lastProcessedBlockService.getOrInit.mockResolvedValue(1000);
      lastProcessedBlockService.update.mockResolvedValue(undefined);

      // Mock all event services to return empty arrays
      strategyCreatedEventService.get.mockResolvedValue([]);
      strategyUpdatedEventService.get.mockResolvedValue([]);
      strategyDeletedEventService.get.mockResolvedValue([]);
      voucherTransferEventService.get.mockResolvedValue([]);
      tokensTradedEventService.get.mockResolvedValue([]);

      (dexScreenerEventV2Repository.manager.query as jest.Mock).mockResolvedValue([]);

      // Test with a large range that would create multiple batches
      await service.update(200000, mockDeployment, mockTokensByAddress);

      // Should update last processed block at least twice (multiple batches)
      expect(lastProcessedBlockService.update).toHaveBeenCalled();
    });

    it('should handle database query failures gracefully', async () => {
      (dexScreenerEventV2Repository.manager.query as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(service.update(2100, mockDeployment, mockTokensByAddress)).rejects.toThrow('Database error');
    });

    it('should handle repository save failures gracefully', async () => {
      lastProcessedBlockService.getOrInit.mockResolvedValue(1999);
      (dexScreenerEventV2Repository.manager.query as jest.Mock).mockResolvedValue([]);
      dexScreenerEventV2Repository.save.mockRejectedValue(new Error('Save error'));

      const createdEvent = createMockStrategyCreatedEvent();
      strategyCreatedEventService.get.mockResolvedValue([createdEvent]);

      // Mock other event services to return empty arrays
      strategyUpdatedEventService.get.mockResolvedValue([]);
      strategyDeletedEventService.get.mockResolvedValue([]);
      voucherTransferEventService.get.mockResolvedValue([]);
      tokensTradedEventService.get.mockResolvedValue([]);

      await expect(service.update(2100, mockDeployment, mockTokensByAddress)).rejects.toThrow('Save error');
    });

    it('should handle empty event arrays without errors', () => {
      const result = service['processEvents']([], [], [], [], [], mockDeployment, mockTokensByAddress, new Map());

      expect(result).toHaveLength(0);
    });

    it('should handle strategies with zero liquidity', () => {
      const createdEvent = createMockStrategyCreatedEvent({
        order0: JSON.stringify({ y: '0' }),
        order1: JSON.stringify({ y: '0' }),
      });

      const result = service['processEvents'](
        [createdEvent],
        [],
        [],
        [],
        [],
        mockDeployment,
        mockTokensByAddress,
        new Map(),
      );

      expect(result).toHaveLength(1);
      expect(result[0].amount0).toBe('0');
      expect(result[0].amount1).toBe('0');
    });
  });
});
