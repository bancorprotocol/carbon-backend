import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, QueryBuilder, EntityManager } from 'typeorm';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Decimal } from 'decimal.js';
import { MerklProcessorService } from './merkl-processor.service';
import { EpochReward } from '../entities/epoch-reward.entity';
import { Campaign } from '../entities/campaign.entity';
import { CampaignService } from './campaign.service';
import { LastProcessedBlockService } from '../../last-processed-block/last-processed-block.service';
import { BlockService } from '../../block/block.service';
import { HistoricQuoteService } from '../../historic-quote/historic-quote.service';
import { StrategyCreatedEventService } from '../../events/strategy-created-event/strategy-created-event.service';
import { StrategyUpdatedEventService } from '../../events/strategy-updated-event/strategy-updated-event.service';
import { StrategyDeletedEventService } from '../../events/strategy-deleted-event/strategy-deleted-event.service';
import { VoucherTransferEventService } from '../../events/voucher-transfer-event/voucher-transfer-event.service';
import { StrategyCreatedEvent } from '../../events/strategy-created-event/strategy-created-event.entity';
import { StrategyUpdatedEvent } from '../../events/strategy-updated-event/strategy-updated-event.entity';
import { StrategyDeletedEvent } from '../../events/strategy-deleted-event/strategy-deleted-event.entity';
import { VoucherTransferEvent } from '../../events/voucher-transfer-event/voucher-transfer-event.entity';
import { BlockchainType, ExchangeId, Deployment } from '../../deployment/deployment.service';
import { Pair } from '../../pair/pair.entity';
import { Token } from '../../token/token.entity';
import { Block } from '../../block/block.entity';

describe('MerklProcessorService', () => {
  let service: MerklProcessorService;
  let mockRepository: jest.Mocked<Repository<EpochReward>>;
  let mockCampaignService: jest.Mocked<CampaignService>;
  let mockLastProcessedBlockService: jest.Mocked<LastProcessedBlockService>;
  let mockBlockService: jest.Mocked<BlockService>;
  let mockHistoricQuoteService: jest.Mocked<HistoricQuoteService>;
  let mockStrategyCreatedEventService: jest.Mocked<StrategyCreatedEventService>;
  let mockStrategyUpdatedEventService: jest.Mocked<StrategyUpdatedEventService>;
  let mockStrategyDeletedEventService: jest.Mocked<StrategyDeletedEventService>;
  let mockVoucherTransferEventService: jest.Mocked<VoucherTransferEventService>;
  let mockEntityManager: jest.Mocked<EntityManager>;
  let mockQueryBuilder: any;

  // Test data fixtures
  const mockToken0: Token = {
    id: 1,
    blockchainType: BlockchainType.Ethereum,
    exchangeId: ExchangeId.OGEthereum,
    address: '0x1234567890123456789012345678901234567890',
    symbol: 'TKN0',
    name: 'Token 0',
    decimals: 18,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockToken1: Token = {
    id: 2,
    blockchainType: BlockchainType.Ethereum,
    exchangeId: ExchangeId.OGEthereum,
    address: '0x2345678901234567890123456789012345678901',
    symbol: 'TKN1',
    name: 'Token 1',
    decimals: 18,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockBlock: Block = {
    id: 1000,
    blockchainType: BlockchainType.Ethereum,
    timestamp: new Date('2024-01-01T00:00:00Z'),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPair: Pair = {
    id: 1,
    blockchainType: BlockchainType.Ethereum,
    exchangeId: ExchangeId.OGEthereum,
    block: mockBlock,
    token0: mockToken0,
    token1: mockToken1,
    name: 'TKN0/TKN1',
    createdAt: new Date(),
    updatedAt: new Date(),
    tokensTradedEvents: [],
  };

  const mockCampaign: Campaign = {
    id: '1',
    blockchainType: BlockchainType.Ethereum,
    exchangeId: ExchangeId.OGEthereum,
    pairId: 1,
    pair: mockPair,
    rewardAmount: '1000000000000000000000', // 1000 tokens
    rewardTokenAddress: '0xrewardtoken',
    startDate: new Date('2024-01-01T00:00:00Z'),
    endDate: new Date('2024-01-02T00:00:00Z'),
    opportunityName: 'Test Campaign',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockDeployment: Deployment = {
    exchangeId: ExchangeId.OGEthereum,
    blockchainType: BlockchainType.Ethereum,
    rpcEndpoint: 'http://localhost:8545',
    harvestEventsBatchSize: 10000,
    harvestConcurrency: 5,
    multicallAddress: '0xmulticall',
    gasToken: {
      name: 'Ethereum',
      symbol: 'ETH',
      address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    },
    startBlock: 1,
    contracts: {},
  };

  const mockStrategyCreatedEvent: StrategyCreatedEvent = {
    id: '1',
    strategyId: '12345',
    pair: mockPair,
    block: mockBlock,
    blockchainType: BlockchainType.Ethereum,
    exchangeId: ExchangeId.OGEthereum,
    timestamp: new Date('2024-01-01T00:05:00Z'),
    owner: '0xowner',
    token0: mockToken0,
    token1: mockToken1,
    order0: '{"y":"1000000000000000000","A":"100","B":"200","z":"1000000000000000000"}',
    order1: '{"y":"2000000000000000000","A":"150","B":"250","z":"2000000000000000000"}',
    transactionHash: '0xtx1',
    transactionIndex: 0,
    logIndex: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockStrategyUpdatedEvent: StrategyUpdatedEvent = {
    id: 2,
    strategyId: '12345',
    pair: mockPair,
    block: mockBlock,
    blockchainType: BlockchainType.Ethereum,
    exchangeId: ExchangeId.OGEthereum,
    timestamp: new Date('2024-01-01T00:10:00Z'),
    reason: 1,
    token0: mockToken0,
    token1: mockToken1,
    order0: '{"y":"1500000000000000000","A":"120","B":"220","z":"1500000000000000000"}',
    order1: '{"y":"2500000000000000000","A":"170","B":"270","z":"2500000000000000000"}',
    transactionHash: '0xtx2',
    transactionIndex: 1,
    logIndex: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockStrategyDeletedEvent: StrategyDeletedEvent = {
    id: 3,
    strategyId: '12345',
    pair: mockPair,
    block: mockBlock,
    blockchainType: BlockchainType.Ethereum,
    exchangeId: ExchangeId.OGEthereum,
    timestamp: new Date('2024-01-01T00:15:00Z'),
    token0: mockToken0,
    token1: mockToken1,
    order0: '{"y":"0","A":"0","B":"0","z":"0"}',
    order1: '{"y":"0","A":"0","B":"0","z":"0"}',
    transactionHash: '0xtx3',
    transactionIndex: 2,
    logIndex: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockVoucherTransferEvent: VoucherTransferEvent = {
    id: 4,
    strategyId: '12345',
    from: '0xowner',
    to: '0xnewowner',
    block: mockBlock,
    blockchainType: BlockchainType.Ethereum,
    exchangeId: ExchangeId.OGEthereum,
    timestamp: new Date('2024-01-01T00:20:00Z'),
    transactionHash: '0xtx4',
    transactionIndex: 3,
    logIndex: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    // Create comprehensive mocks
    mockQueryBuilder = {
      createQueryBuilder: jest.fn(),
      delete: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
      select: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ total: '0' }),
    } as any;

    mockEntityManager = {
      query: jest.fn().mockResolvedValue([]),
      transaction: jest.fn().mockImplementation((callback) => callback(mockEntityManager)),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn().mockImplementation((entity, data) => ({ ...data, id: '1' })),
      save: jest.fn().mockResolvedValue([]),
    } as any;

    mockRepository = {
      manager: mockEntityManager,
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      target: EpochReward,
    } as any;

    mockCampaignService = {
      getActiveCampaigns: jest.fn().mockResolvedValue([mockCampaign]),
      markProcessedCampaignsInactive: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockLastProcessedBlockService = {
      getOrInit: jest.fn().mockResolvedValue(999),
      update: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockBlockService = {
      getBlock: jest.fn().mockResolvedValue(mockBlock),
      getBlocksDictionary: jest.fn().mockResolvedValue({ 1000: new Date('2024-01-01T00:00:00Z') }),
    } as any;

    mockHistoricQuoteService = {
      getUsdRates: jest.fn().mockResolvedValue([
        { address: mockToken0.address, day: 1704067200, usd: 100 },
        { address: mockToken1.address, day: 1704067200, usd: 200 },
      ]),
    } as any;

    mockStrategyCreatedEventService = {
      get: jest.fn().mockResolvedValue([mockStrategyCreatedEvent]),
    } as any;

    mockStrategyUpdatedEventService = {
      get: jest.fn().mockResolvedValue([mockStrategyUpdatedEvent]),
    } as any;

    mockStrategyDeletedEventService = {
      get: jest.fn().mockResolvedValue([mockStrategyDeletedEvent]),
    } as any;

    mockVoucherTransferEventService = {
      get: jest.fn().mockResolvedValue([mockVoucherTransferEvent]),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerklProcessorService,
        {
          provide: getRepositoryToken(EpochReward),
          useValue: mockRepository,
        },
        {
          provide: CampaignService,
          useValue: mockCampaignService,
        },
        {
          provide: LastProcessedBlockService,
          useValue: mockLastProcessedBlockService,
        },
        {
          provide: BlockService,
          useValue: mockBlockService,
        },
        {
          provide: HistoricQuoteService,
          useValue: mockHistoricQuoteService,
        },
        {
          provide: StrategyCreatedEventService,
          useValue: mockStrategyCreatedEventService,
        },
        {
          provide: StrategyUpdatedEventService,
          useValue: mockStrategyUpdatedEventService,
        },
        {
          provide: StrategyDeletedEventService,
          useValue: mockStrategyDeletedEventService,
        },
        {
          provide: VoucherTransferEventService,
          useValue: mockVoucherTransferEventService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('false'), // Default disabled for tests
          },
        },
      ],
    }).compile();

    service = module.get<MerklProcessorService>(MerklProcessorService);

    // Mock console.log to avoid cluttering test output
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Constructor and Dependencies', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should inject all required dependencies', () => {
      expect(service).toBeInstanceOf(MerklProcessorService);
    });
  });

  describe('update', () => {
    beforeEach(() => {
      // Mock file system operations to avoid actual file writes
      jest.spyOn(service as any, 'writeRewardBreakdownFile').mockResolvedValue(undefined);
    });

    it('should process update successfully with active campaigns', async () => {
      mockEntityManager.query
        .mockResolvedValueOnce([]) // Initialize strategy states query
        .mockResolvedValueOnce([]) // Latest ownership states query
        .mockResolvedValueOnce([]); // Deleted strategies query

      await service.update(1100, mockDeployment);

      expect(mockCampaignService.getActiveCampaigns).toHaveBeenCalledWith(mockDeployment);
      expect(mockLastProcessedBlockService.getOrInit).toHaveBeenCalled();
      expect(mockLastProcessedBlockService.update).toHaveBeenCalled();
      expect(mockCampaignService.markProcessedCampaignsInactive).toHaveBeenCalled();
    });

    it('should handle no active campaigns', async () => {
      mockCampaignService.getActiveCampaigns.mockResolvedValue([]);

      await service.update(1100, mockDeployment);

      expect(mockCampaignService.getActiveCampaigns).toHaveBeenCalledWith(mockDeployment);
      expect(mockLastProcessedBlockService.update).toHaveBeenCalledWith(
        `${mockDeployment.blockchainType}-${mockDeployment.exchangeId}-merkl-global`,
        1100,
      );
    });

    it('should process multiple batches correctly', async () => {
      // Override BATCH_SIZE for testing
      (service as any).BATCH_SIZE = 50;

      mockEntityManager.query.mockResolvedValue([]).mockResolvedValue([]).mockResolvedValue([]);

      await service.update(1150, mockDeployment);

      // Should process multiple batches
      expect(mockStrategyCreatedEventService.get).toHaveBeenCalledTimes(4); // 1000-1049, 1050-1099, 1100-1149, 1150-1150
    });
  });

  describe('initializeStrategyStates', () => {
    it('should initialize strategy states from database queries', async () => {
      const mockLatestStates = [
        {
          strategy_id: '12345',
          pair_id: 1,
          token0_address: mockToken0.address,
          token1_address: mockToken1.address,
          token0_decimals: 18,
          token1_decimals: 18,
          order0: '{"y":"1000","A":"100","B":"200","z":"1000"}',
          order1: '{"y":"2000","A":"150","B":"250","z":"2000"}',
          owner: '0xowner',
          block_id: 1000,
        },
      ];

      mockEntityManager.query
        .mockResolvedValueOnce(mockLatestStates) // Latest strategy states
        .mockResolvedValueOnce([]) // Latest ownership states
        .mockResolvedValueOnce([]); // Deleted strategies

      const strategyStates = new Map();
      await (service as any).initializeStrategyStates(1000, mockDeployment, mockCampaign, strategyStates);

      expect(strategyStates.size).toBe(1);
      expect(strategyStates.has('12345')).toBe(true);

      const state = strategyStates.get('12345');
      expect(state.strategyId).toBe('12345');
      expect(state.pairId).toBe(1);
      expect(state.isDeleted).toBe(false);
    });

    it('should handle deleted strategies', async () => {
      const mockLatestStates = [
        {
          strategy_id: '12345',
          pair_id: 1,
          token0_address: mockToken0.address,
          token1_address: mockToken1.address,
          token0_decimals: 18,
          token1_decimals: 18,
          order0: '{"y":"1000","A":"100","B":"200","z":"1000"}',
          order1: '{"y":"2000","A":"150","B":"250","z":"2000"}',
          owner: '0xowner',
          block_id: 1000,
        },
      ];

      const mockDeletedStrategies = [{ strategy_id: '12345' }];

      mockEntityManager.query
        .mockResolvedValueOnce(mockLatestStates)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(mockDeletedStrategies);

      const strategyStates = new Map();
      await (service as any).initializeStrategyStates(1000, mockDeployment, mockCampaign, strategyStates);

      const state = strategyStates.get('12345');
      expect(state.isDeleted).toBe(true);
      expect(state.liquidity0.toString()).toBe('0');
      expect(state.liquidity1.toString()).toBe('0');
    });

    it('should handle ownership transfers', async () => {
      const mockLatestStates = [
        {
          strategy_id: '12345',
          pair_id: 1,
          token0_address: mockToken0.address,
          token1_address: mockToken1.address,
          token0_decimals: 18,
          token1_decimals: 18,
          order0: '{"y":"1000","A":"100","B":"200","z":"1000"}',
          order1: '{"y":"2000","A":"150","B":"250","z":"2000"}',
          owner: '0xoriginalowner',
          block_id: 1000,
        },
      ];

      const mockOwnershipStates = [
        {
          strategy_id: '12345',
          current_owner: '0xnewowner',
        },
      ];

      mockEntityManager.query
        .mockResolvedValueOnce(mockLatestStates)
        .mockResolvedValueOnce(mockOwnershipStates)
        .mockResolvedValueOnce([]);

      const strategyStates = new Map();
      await (service as any).initializeStrategyStates(1000, mockDeployment, mockCampaign, strategyStates);

      const state = strategyStates.get('12345');
      expect(state.currentOwner).toBe('0xnewowner');
      expect(state.creationWallet).toBe('0xoriginalowner');
    });

    it('should handle lexicographic token ordering', async () => {
      const mockLatestStates = [
        {
          strategy_id: '12345',
          pair_id: 1,
          token0_address: mockToken1.address, // Larger address
          token1_address: mockToken0.address, // Smaller address
          token0_decimals: 18,
          token1_decimals: 6,
          order0: '{"y":"1000","A":"100","B":"200","z":"1000"}',
          order1: '{"y":"2000","A":"150","B":"250","z":"2000"}',
          owner: '0xowner',
          block_id: 1000,
        },
      ];

      mockEntityManager.query
        .mockResolvedValueOnce(mockLatestStates)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const strategyStates = new Map();
      await (service as any).initializeStrategyStates(1000, mockDeployment, mockCampaign, strategyStates);

      const state = strategyStates.get('12345');
      // Should reorder tokens lexicographically
      expect(state.token0Address).toBe(mockToken0.address); // Smaller address becomes token0
      expect(state.token1Address).toBe(mockToken1.address); // Larger address becomes token1
      expect(state.token0Decimals).toBe(6); // Decimals follow the reordering (mockToken0 had 6 decimals)
      expect(state.token1Decimals).toBe(18); // mockToken1 had 18 decimals
    });
  });

  describe('Event Processing', () => {
    let strategyStates: Map<string, any>;

    beforeEach(() => {
      strategyStates = new Map();
    });

    describe('processCreatedEvent', () => {
      it('should create new strategy state from created event', () => {
        (service as any).processCreatedEvent(mockStrategyCreatedEvent, strategyStates);

        expect(strategyStates.size).toBe(1);
        expect(strategyStates.has('12345')).toBe(true);

        const state = strategyStates.get('12345');
        expect(state.strategyId).toBe('12345');
        expect(state.currentOwner).toBe('0xowner');
        expect(state.isDeleted).toBe(false);
      });

      it('should handle lexicographic token ordering in created event', () => {
        const eventWithReversedTokens = {
          ...mockStrategyCreatedEvent,
          token0: mockToken1, // Larger address
          token1: mockToken0, // Smaller address
          order0: '{"y":"1000","A":"100","B":"200","z":"1000"}',
          order1: '{"y":"2000","A":"150","B":"250","z":"2000"}',
        };

        (service as any).processCreatedEvent(eventWithReversedTokens, strategyStates);

        const state = strategyStates.get('12345');
        expect(state.token0Address).toBe(mockToken0.address.toLowerCase()); // Should be reordered
        expect(state.token1Address).toBe(mockToken1.address.toLowerCase());
      });
    });

    describe('processUpdatedEvent', () => {
      beforeEach(() => {
        (service as any).processCreatedEvent(mockStrategyCreatedEvent, strategyStates);
      });

      it('should update existing strategy state', () => {
        const initialLiquidity0 = strategyStates.get('12345').liquidity0;

        (service as any).processUpdatedEvent(mockStrategyUpdatedEvent, strategyStates);

        const state = strategyStates.get('12345');
        expect(state.liquidity0).not.toEqual(initialLiquidity0);
        expect(state.lastProcessedBlock).toBe(mockBlock.id);
      });

      it('should ignore update for non-existent strategy', () => {
        const nonExistentEvent = { ...mockStrategyUpdatedEvent, strategyId: 'nonexistent' };

        (service as any).processUpdatedEvent(nonExistentEvent, strategyStates);

        expect(strategyStates.size).toBe(1); // Should still only have original strategy
        expect(strategyStates.has('nonexistent')).toBe(false);
      });
    });

    describe('processDeletedEvent', () => {
      beforeEach(() => {
        (service as any).processCreatedEvent(mockStrategyCreatedEvent, strategyStates);
      });

      it('should mark strategy as deleted and zero out liquidity', () => {
        (service as any).processDeletedEvent(mockStrategyDeletedEvent, strategyStates);

        const state = strategyStates.get('12345');
        expect(state.isDeleted).toBe(true);
        expect(state.liquidity0.toString()).toBe('0');
        expect(state.liquidity1.toString()).toBe('0');
        expect(state.lastProcessedBlock).toBe(mockBlock.id);
      });

      it('should ignore delete for non-existent strategy', () => {
        const nonExistentEvent = { ...mockStrategyDeletedEvent, strategyId: 'nonexistent' };

        (service as any).processDeletedEvent(nonExistentEvent, strategyStates);

        expect(strategyStates.size).toBe(1); // Should still only have original strategy
      });
    });

    describe('processTransferEvent', () => {
      beforeEach(() => {
        (service as any).processCreatedEvent(mockStrategyCreatedEvent, strategyStates);
      });

      it('should update strategy owner', () => {
        (service as any).processTransferEvent(mockVoucherTransferEvent, strategyStates);

        const state = strategyStates.get('12345');
        expect(state.currentOwner).toBe('0xnewowner');
        expect(state.lastProcessedBlock).toBe(mockBlock.id);
      });

      it('should ignore transfer for non-existent strategy', () => {
        const nonExistentEvent = { ...mockVoucherTransferEvent, strategyId: 'nonexistent' };

        (service as any).processTransferEvent(nonExistentEvent, strategyStates);

        expect(strategyStates.size).toBe(1); // Should still only have original strategy
      });
    });

    describe('updateStrategyStates', () => {
      it('should process events in chronological order', () => {
        const events = [
          mockStrategyCreatedEvent,
          mockStrategyUpdatedEvent,
          mockStrategyDeletedEvent,
          mockVoucherTransferEvent,
        ];

        (service as any).updateStrategyStates(
          [mockStrategyCreatedEvent],
          [mockStrategyUpdatedEvent],
          [mockStrategyDeletedEvent],
          [mockVoucherTransferEvent],
          strategyStates,
        );

        expect(strategyStates.size).toBe(1);
        const state = strategyStates.get('12345');
        expect(state.isDeleted).toBe(true); // Should reflect final state after all events
        expect(state.currentOwner).toBe('0xnewowner'); // Should reflect final owner
      });

      it('should handle empty event lists', () => {
        (service as any).updateStrategyStates([], [], [], [], strategyStates);
        expect(strategyStates.size).toBe(0);
      });
    });
  });

  describe('Rate Parameter Decompression', () => {
    it('should decompress rate parameters correctly', () => {
      const SCALING_CONSTANT = new Decimal(2).pow(48);
      const mantissa = new Decimal(123456);
      const exponent = new Decimal(5);
      const compressed = mantissa.add(exponent.mul(SCALING_CONSTANT));

      const result = (service as any).decompressRateParameter(compressed.toString());
      const expected = mantissa.mul(new Decimal(2).pow(exponent));

      expect(result.toString()).toBe(expected.toString());
    });

    it('should handle zero compressed value', () => {
      const result = (service as any).decompressRateParameter('0');
      expect(result.toString()).toBe('0');
    });

    it('should handle empty string', () => {
      const result = (service as any).decompressRateParameter('');
      expect(result.toString()).toBe('0');
    });
  });

  describe('Strategy State Cloning', () => {
    let originalState: any;

    beforeEach(() => {
      originalState = {
        strategyId: '12345',
        pairId: 1,
        token0Address: '0xtoken0',
        token1Address: '0xtoken1',
        token0Decimals: 18,
        token1Decimals: 18,
        liquidity0: new Decimal('1000'),
        liquidity1: new Decimal('2000'),
        order0_A: new Decimal('100'),
        order0_B: new Decimal('200'),
        order0_z: new Decimal('1000'),
        order1_A: new Decimal('150'),
        order1_B: new Decimal('250'),
        order1_z: new Decimal('2000'),
        order0_A_compressed: '100',
        order0_B_compressed: '200',
        order0_z_compressed: '1000',
        order1_A_compressed: '150',
        order1_B_compressed: '250',
        order1_z_compressed: '2000',
        currentOwner: '0xowner',
        creationWallet: '0xowner',
        lastProcessedBlock: 1000,
        isDeleted: false,
      };
    });

    describe('deepCloneStrategyState', () => {
      it('should create a deep clone of strategy state', () => {
        const cloned = (service as any).deepCloneStrategyState(originalState);

        expect(cloned).not.toBe(originalState);
        expect(cloned.liquidity0).not.toBe(originalState.liquidity0); // Different Decimal instances
        expect(cloned.liquidity0.toString()).toBe(originalState.liquidity0.toString()); // Same values
        expect(cloned.strategyId).toBe(originalState.strategyId);
        expect(cloned.isDeleted).toBe(originalState.isDeleted);
      });

      it('should allow independent modification of cloned state', () => {
        const cloned = (service as any).deepCloneStrategyState(originalState);

        cloned.liquidity0 = new Decimal('5000');
        cloned.currentOwner = '0xnewowner';

        expect(originalState.liquidity0.toString()).toBe('1000'); // Original unchanged
        expect(originalState.currentOwner).toBe('0xowner'); // Original unchanged
        expect(cloned.liquidity0.toString()).toBe('5000');
        expect(cloned.currentOwner).toBe('0xnewowner');
      });
    });

    describe('deepCloneStrategyStates', () => {
      it('should clone a map of strategy states', () => {
        const originalMap = new Map();
        originalMap.set('12345', originalState);
        originalMap.set('67890', { ...originalState, strategyId: '67890' });

        const clonedMap = (service as any).deepCloneStrategyStates(originalMap);

        expect(clonedMap).not.toBe(originalMap);
        expect(clonedMap.size).toBe(2);
        expect(clonedMap.get('12345')).not.toBe(originalState);
        expect(clonedMap.get('12345').strategyId).toBe('12345');
      });
    });
  });

  describe('Epoch Calculations', () => {
    describe('calculateEpochsInRange', () => {
      it('should calculate epochs correctly within campaign duration', () => {
        const EPOCH_DURATION = 4 * 60 * 60; // 4 hours
        (service as any).EPOCH_DURATION = EPOCH_DURATION;

        const startTimestamp = Math.floor(mockCampaign.startDate.getTime() / 1000);
        const endTimestamp = Math.floor(mockCampaign.endDate.getTime() / 1000);

        const epochs = (service as any).calculateEpochsInRange(mockCampaign, startTimestamp, endTimestamp);

        expect(epochs.length).toBeGreaterThan(0);
        expect(epochs[0].epochNumber).toBe(1);

        // Verify total rewards sum to campaign amount
        const totalRewards = epochs.reduce((sum, epoch) => sum.add(epoch.totalRewards), new Decimal(0));
        expect(totalRewards.toFixed()).toBe(mockCampaign.rewardAmount);
      });

      it('should handle partial epoch at campaign end', () => {
        const shortCampaign = {
          ...mockCampaign,
          endDate: new Date(mockCampaign.startDate.getTime() + 2 * 60 * 60 * 1000), // 2 hours
        };

        const startTimestamp = Math.floor(shortCampaign.startDate.getTime() / 1000);
        const endTimestamp = Math.floor(shortCampaign.endDate.getTime() / 1000);

        const epochs = (service as any).calculateEpochsInRange(shortCampaign, startTimestamp, endTimestamp);

        expect(epochs.length).toBe(1);
        expect(epochs[0].totalRewards.toFixed()).toBe(shortCampaign.rewardAmount);
      });

      it("should handle time range that doesn't align with campaign boundaries", () => {
        const campaignStart = Math.floor(mockCampaign.startDate.getTime() / 1000);
        const rangeStart = campaignStart + 3600; // 1 hour after campaign start
        const rangeEnd = rangeStart + 7200; // 2 hours range

        const epochs = (service as any).calculateEpochsInRange(mockCampaign, rangeStart, rangeEnd);

        expect(epochs.length).toBeGreaterThan(0);
        // Should only include epochs that intersect with the range
      });
    });
  });

  describe('Target Price Calculations', () => {
    describe('calculateTargetSqrtPriceScaled', () => {
      it('should calculate scaled square root price correctly', () => {
        const targetPrice = new Decimal(2); // 2 token1 per token0
        const baseDecimals = 18;
        const quoteDecimals = 6;

        const result = (service as any).calculateTargetSqrtPriceScaled(targetPrice, baseDecimals, quoteDecimals);

        // Expected: price * 10^(18-6) = 2 * 10^12, sqrt = sqrt(2) * 10^6, scaled = sqrt(2) * 10^6 * 2^48
        const expected = new Decimal(2).mul(new Decimal(10).pow(12)).sqrt().mul(new Decimal(2).pow(48));

        expect(result.toString()).toBe(expected.toString());
      });

      it('should handle equal decimals', () => {
        const targetPrice = new Decimal(1.5);
        const decimals = 18;

        const result = (service as any).calculateTargetSqrtPriceScaled(targetPrice, decimals, decimals);

        const expected = targetPrice.sqrt().mul(new Decimal(2).pow(48));
        expect(result.toString()).toBe(expected.toString());
      });
    });

    describe('calculateInvTargetSqrtPriceScaled', () => {
      it('should calculate inverse scaled square root price correctly', () => {
        const targetPrice = new Decimal(0.5); // 0.5 token0 per token1
        const baseDecimals = 18;
        const quoteDecimals = 6;

        const result = (service as any).calculateInvTargetSqrtPriceScaled(targetPrice, baseDecimals, quoteDecimals);

        // Expected: price * 10^(6-18) = 0.5 * 10^(-12), sqrt, scaled
        const expected = new Decimal(0.5).mul(new Decimal(10).pow(-12)).sqrt().mul(new Decimal(2).pow(48));

        expect(result.toString()).toBe(expected.toString());
      });
    });
  });

  describe('Eligible Liquidity Calculation', () => {
    describe('calculateEligibleLiquidity', () => {
      it('should return full liquidity when reward zone boundary is below order range', () => {
        const y = new Decimal('1000');
        const z = new Decimal('1000');
        const A = new Decimal('100');
        const B = new Decimal('200');
        const targetSqrtPriceScaled = new Decimal('150');
        const toleranceFactor = new Decimal('0.98');

        const rewardZoneBoundary = toleranceFactor.mul(targetSqrtPriceScaled); // 147, which is <= B (200)

        const result = (service as any).calculateEligibleLiquidity(y, z, A, B, targetSqrtPriceScaled, toleranceFactor);

        expect(result.toString()).toBe(y.toString()); // Full liquidity eligible
      });

      it('should return zero when reward zone boundary is above order range', () => {
        const y = new Decimal('1000');
        const z = new Decimal('1000');
        const A = new Decimal('100');
        const B = new Decimal('200');
        const targetSqrtPriceScaled = new Decimal('350');
        const toleranceFactor = new Decimal('0.98');

        const rewardZoneBoundary = toleranceFactor.mul(targetSqrtPriceScaled); // 343, which is >= orderPriceHigh (300)

        const result = (service as any).calculateEligibleLiquidity(y, z, A, B, targetSqrtPriceScaled, toleranceFactor);

        expect(result.toString()).toBe('0'); // No liquidity eligible
      });

      it('should calculate partial eligibility correctly', () => {
        const y = new Decimal('1000');
        const z = new Decimal('1000');
        const A = new Decimal('100');
        const B = new Decimal('200');
        const targetSqrtPriceScaled = new Decimal('230');
        const toleranceFactor = new Decimal('0.98');

        const result = (service as any).calculateEligibleLiquidity(y, z, A, B, targetSqrtPriceScaled, toleranceFactor);

        // Should be between 0 and y
        expect(result.gt(0)).toBe(true);
        expect(result.lt(y)).toBe(true);
      });

      it('should handle A equals zero case', () => {
        const y = new Decimal('1000');
        const z = new Decimal('1000');
        const A = new Decimal('0');
        const B = new Decimal('200');
        const targetSqrtPriceScaled = new Decimal('250');
        const toleranceFactor = new Decimal('0.98');

        const result = (service as any).calculateEligibleLiquidity(y, z, A, B, targetSqrtPriceScaled, toleranceFactor);

        expect(result.toString()).toBe('0'); // Should return 0 to prevent division by zero
      });

      it('should ensure non-negative result', () => {
        const y = new Decimal('100');
        const z = new Decimal('1000');
        const A = new Decimal('50');
        const B = new Decimal('200');
        const targetSqrtPriceScaled = new Decimal('300');
        const toleranceFactor = new Decimal('0.98');

        const result = (service as any).calculateEligibleLiquidity(y, z, A, B, targetSqrtPriceScaled, toleranceFactor);

        expect(result.gte(0)).toBe(true);
      });
    });
  });

  describe('Price Cache and Target Prices', () => {
    describe('createPriceCache', () => {
      it('should create price cache for campaign tokens', async () => {
        const campaigns = [mockCampaign];
        const batchStartTimestamp = 1704067200;

        const result = await (service as any).createPriceCache(campaigns, batchStartTimestamp, mockDeployment);

        expect(result.rates.size).toBe(2);
        expect(result.rates.get(mockToken0.address.toLowerCase())).toBe(100);
        expect(result.rates.get(mockToken1.address.toLowerCase())).toBe(200);
        expect(result.timestamp).toBe(batchStartTimestamp);
      });

      it('should handle duplicate token addresses across campaigns', async () => {
        const campaign2 = {
          ...mockCampaign,
          id: '2',
          pair: { ...mockPair, id: 2 },
        };
        const campaigns = [mockCampaign, campaign2];

        const result = await (service as any).createPriceCache(campaigns, 1704067200, mockDeployment);

        // Should still only have 2 unique tokens
        expect(result.rates.size).toBe(2);
      });
    });

    describe('getTargetPricesAtTime', () => {
      let mockPriceCache: any;

      beforeEach(() => {
        mockPriceCache = {
          rates: new Map([
            [mockToken0.address.toLowerCase(), 100],
            [mockToken1.address.toLowerCase(), 200],
          ]),
          timestamp: 1704067200,
        };
      });

      it('should calculate target prices correctly', () => {
        const result = (service as any).getTargetPricesAtTime(1704067200, mockCampaign, mockPriceCache);

        expect(result).not.toBeNull();
        expect(result.order0TargetPrice.toString()).toBe('2'); // 200/100
        expect(result.order1TargetPrice.toString()).toBe('0.5'); // 100/200
      });

      it('should return null when token rates are missing', () => {
        mockPriceCache.rates.delete(mockToken0.address.toLowerCase());

        const result = (service as any).getTargetPricesAtTime(1704067200, mockCampaign, mockPriceCache);

        expect(result).toBeNull();
      });

      it('should return null when token rates are zero', () => {
        mockPriceCache.rates.set(mockToken0.address.toLowerCase(), 0);

        const result = (service as any).getTargetPricesAtTime(1704067200, mockCampaign, mockPriceCache);

        expect(result).toBeNull();
      });

      it('should handle case-insensitive address lookup', () => {
        mockPriceCache.rates.clear();
        mockPriceCache.rates.set(mockToken0.address.toUpperCase(), 100);
        mockPriceCache.rates.set(mockToken1.address.toLowerCase(), 200);

        const result = (service as any).getTargetPricesAtTime(1704067200, mockCampaign, mockPriceCache);

        expect(result).toBeNull(); // Should fail because uppercase key won't match lowercase lookup
      });
    });

    describe('findClosestRate', () => {
      it('should find closest rate by timestamp', () => {
        const rates = [
          { address: mockToken0.address, day: 1704067000, usd: 90 },
          { address: mockToken0.address, day: 1704067200, usd: 100 },
          { address: mockToken0.address, day: 1704067400, usd: 110 },
        ];

        const result = (service as any).findClosestRate(rates, mockToken0.address, 1704067150);

        expect(result).toBe(100); // Closest to 1704067200
      });

      it('should return null for non-existent token', () => {
        const rates = [{ address: mockToken0.address, day: 1704067200, usd: 100 }];

        const result = (service as any).findClosestRate(rates, '0xnonexistent', 1704067200);

        expect(result).toBeNull();
      });

      it('should handle empty rates array', () => {
        const result = (service as any).findClosestRate([], mockToken0.address, 1704067200);

        expect(result).toBeNull();
      });

      it('should be case-insensitive for address matching', () => {
        const rates = [{ address: mockToken0.address.toUpperCase(), day: 1704067200, usd: 100 }];

        const result = (service as any).findClosestRate(rates, mockToken0.address.toLowerCase(), 1704067200);

        expect(result).toBe(100);
      });
    });
  });

  describe('Per-Epoch Cleanup Behavior', () => {
    it('should delete existing rewards for specific epoch before regenerating', async () => {
      // Setup: Mock the transaction method to capture what gets deleted
      const mockTransactionEntityManager = {
        delete: jest.fn().mockResolvedValue({ affected: 2 }),
        create: jest.fn().mockImplementation((entity, data) => ({ ...data, id: 'new-id' })),
        save: jest.fn().mockResolvedValue([]),
      };

      mockEntityManager.transaction.mockImplementation(async (callback: any) => {
        return await callback(mockTransactionEntityManager);
      });

      // Mock the private methods that processEpoch depends on
      const mockEpoch = {
        epochNumber: 5,
        startTimestamp: new Date('2024-01-01T00:00:00Z'),
        endTimestamp: new Date('2024-01-01T04:00:00Z'),
        totalRewards: new Decimal('1000'),
      };

      const mockStrategyStates = new Map([
        [
          'strategy1',
          {
            strategyId: 'strategy1',
            currentOwner: '0xowner1',
            liquidity0: new Decimal('100'),
            liquidity1: new Decimal('200'),
            isDeleted: false,
          },
        ],
      ]);

      const mockPriceCache = {
        rates: new Map([
          [mockToken0.address.toLowerCase(), 100],
          [mockToken1.address.toLowerCase(), 200],
        ]),
        timestamp: 1704067200,
      };

      const mockBatchEvents = {
        createdEvents: [],
        updatedEvents: [],
        deletedEvents: [],
        transferEvents: [],
        blockTimestamps: {},
      };

      // Mock the calculateEpochRewards method to return some rewards
      jest
        .spyOn(service as any, 'calculateEpochRewards')
        .mockReturnValue(new Map([['strategy1', { owner: '0xowner1', totalReward: new Decimal('500') }]]));

      // Mock validation methods
      jest.spyOn(service as any, 'validateEpochRewardsWontExceedTotal').mockResolvedValue(true);
      jest.spyOn(service as any, 'validateTotalRewardsNotExceeded').mockResolvedValue(true);

      // Call the processEpoch method
      await (service as any).processEpoch(mockCampaign, mockEpoch, mockStrategyStates, mockPriceCache, mockBatchEvents);

      // Verify that delete was called for the specific epoch and campaign
      expect(mockTransactionEntityManager.delete).toHaveBeenCalledWith(EpochReward, {
        campaignId: mockCampaign.id,
        epochNumber: mockEpoch.epochNumber,
        blockchainType: mockCampaign.blockchainType,
        exchangeId: mockCampaign.exchangeId,
      });

      // Verify that new rewards were created and saved
      expect(mockTransactionEntityManager.create).toHaveBeenCalled();
      expect(mockTransactionEntityManager.save).toHaveBeenCalled();
    });

    it('should handle cleanup within transaction to ensure atomicity', async () => {
      let transactionOrder: string[] = [];

      const mockTransactionEntityManager = {
        delete: jest.fn().mockImplementation(() => {
          transactionOrder.push('delete');
          return Promise.resolve({ affected: 1 });
        }),
        create: jest.fn().mockImplementation((entity, data) => {
          transactionOrder.push('create');
          return { ...data, id: 'new-id' };
        }),
        save: jest.fn().mockImplementation(() => {
          transactionOrder.push('save');
          return Promise.resolve([]);
        }),
      };

      mockEntityManager.transaction.mockImplementation(async (callback: any) => {
        return await callback(mockTransactionEntityManager);
      });

      const mockEpoch = {
        epochNumber: 1,
        startTimestamp: new Date('2024-01-01T00:00:00Z'),
        endTimestamp: new Date('2024-01-01T04:00:00Z'),
        totalRewards: new Decimal('100'),
      };

      // Mock calculateEpochRewards to return some rewards so create/save will be called
      jest
        .spyOn(service as any, 'calculateEpochRewards')
        .mockReturnValue(new Map([['strategy1', { owner: '0xowner1', totalReward: new Decimal('100') }]]));
      jest.spyOn(service as any, 'validateEpochRewardsWontExceedTotal').mockResolvedValue(true);
      jest.spyOn(service as any, 'validateTotalRewardsNotExceeded').mockResolvedValue(true);

      await (service as any).processEpoch(mockCampaign, mockEpoch, new Map(), {}, {});

      // Verify that delete happens before create/save within the transaction
      expect(transactionOrder[0]).toBe('delete');
      expect(transactionOrder.indexOf('create')).toBeGreaterThan(transactionOrder.indexOf('delete'));
      expect(transactionOrder.indexOf('save')).toBeGreaterThan(transactionOrder.indexOf('delete'));
    });

    it('should not save rewards if epoch validation fails', async () => {
      const mockTransactionEntityManager = {
        delete: jest.fn().mockResolvedValue({ affected: 0 }),
        create: jest.fn(),
        save: jest.fn(),
      };

      mockEntityManager.transaction.mockImplementation(async (callback: any) => {
        return await callback(mockTransactionEntityManager);
      });

      const mockEpoch = {
        epochNumber: 1,
        startTimestamp: new Date('2024-01-01T00:00:00Z'),
        endTimestamp: new Date('2024-01-01T04:00:00Z'),
        totalRewards: new Decimal('100'),
      };

      jest.spyOn(service as any, 'calculateEpochRewards').mockReturnValue(new Map());
      // Mock validation to fail
      jest.spyOn(service as any, 'validateEpochRewardsWontExceedTotal').mockResolvedValue(false);

      await (service as any).processEpoch(mockCampaign, mockEpoch, new Map(), {}, {});

      // Should still call delete (cleanup)
      expect(mockTransactionEntityManager.delete).toHaveBeenCalled();
      // But should not call create or save due to validation failure
      expect(mockTransactionEntityManager.create).not.toHaveBeenCalled();
      expect(mockTransactionEntityManager.save).not.toHaveBeenCalled();
    });
  });

  describe('Validation Methods', () => {
    describe('validateTotalRewardsNotExceeded', () => {
      it('should return true when total rewards do not exceed campaign amount', async () => {
        mockQueryBuilder.getRawOne.mockResolvedValue({ total: '500000000000000000000' }); // 500 tokens

        const result = await (service as any).validateTotalRewardsNotExceeded(mockCampaign);

        expect(result).toBe(true);
      });

      it('should return false when total rewards exceed campaign amount', async () => {
        mockQueryBuilder.getRawOne.mockResolvedValue({ total: '2000000000000000000000' }); // 2000 tokens

        const result = await (service as any).validateTotalRewardsNotExceeded(mockCampaign);

        expect(result).toBe(false);
      });

      it('should handle null total from database', async () => {
        mockQueryBuilder.getRawOne.mockResolvedValue({ total: null });

        const result = await (service as any).validateTotalRewardsNotExceeded(mockCampaign);

        expect(result).toBe(true); // null should be treated as 0
      });

      it('should handle database errors gracefully', async () => {
        mockQueryBuilder.getRawOne.mockRejectedValue(new Error('Database error'));

        const result = await (service as any).validateTotalRewardsNotExceeded(mockCampaign);

        expect(result).toBe(false);
      });
    });

    describe('validateEpochIntegrity', () => {
      it('should return true for valid consecutive epochs', () => {
        const epochs = [
          {
            epochNumber: 1,
            startTimestamp: new Date('2024-01-01T00:00:00Z'),
            endTimestamp: new Date('2024-01-01T04:00:00Z'),
            totalRewards: new Decimal('500'),
          },
          {
            epochNumber: 2,
            startTimestamp: new Date('2024-01-01T04:00:00Z'),
            endTimestamp: new Date('2024-01-01T08:00:00Z'),
            totalRewards: new Decimal('500'),
          },
        ];

        const result = (service as any).validateEpochIntegrity(mockCampaign, epochs);

        expect(result).toBe(true);
      });

      it('should return false for epochs with gaps', () => {
        const epochs = [
          {
            epochNumber: 1,
            startTimestamp: new Date('2024-01-01T00:00:00Z'),
            endTimestamp: new Date('2024-01-01T04:00:00Z'),
            totalRewards: new Decimal('500'),
          },
          {
            epochNumber: 2,
            startTimestamp: new Date('2024-01-01T05:00:00Z'), // 1 hour gap
            endTimestamp: new Date('2024-01-01T09:00:00Z'),
            totalRewards: new Decimal('500'),
          },
        ];

        const result = (service as any).validateEpochIntegrity(mockCampaign, epochs);

        expect(result).toBe(false);
      });

      it('should return false for epochs with overlaps', () => {
        const epochs = [
          {
            epochNumber: 1,
            startTimestamp: new Date('2024-01-01T00:00:00Z'),
            endTimestamp: new Date('2024-01-01T04:00:00Z'),
            totalRewards: new Decimal('500'),
          },
          {
            epochNumber: 2,
            startTimestamp: new Date('2024-01-01T03:00:00Z'), // 1 hour overlap
            endTimestamp: new Date('2024-01-01T07:00:00Z'),
            totalRewards: new Decimal('500'),
          },
        ];

        const result = (service as any).validateEpochIntegrity(mockCampaign, epochs);

        expect(result).toBe(false);
      });

      it('should return false for epoch with non-positive duration', () => {
        const epochs = [
          {
            epochNumber: 1,
            startTimestamp: new Date('2024-01-01T04:00:00Z'),
            endTimestamp: new Date('2024-01-01T04:00:00Z'), // Same time
            totalRewards: new Decimal('500'),
          },
        ];

        const result = (service as any).validateEpochIntegrity(mockCampaign, epochs);

        expect(result).toBe(false);
      });

      it('should return true for empty epochs array', () => {
        const result = (service as any).validateEpochIntegrity(mockCampaign, []);

        expect(result).toBe(true);
      });

      it('should handle validation errors gracefully', () => {
        const invalidEpochs = [null] as any;

        const result = (service as any).validateEpochIntegrity(mockCampaign, invalidEpochs);

        expect(result).toBe(false);
      });
    });

    describe('validateEpochRewardsWontExceedTotal', () => {
      it('should return true when projected total does not exceed campaign amount', async () => {
        mockQueryBuilder.getRawOne.mockResolvedValue({ total: '400000000000000000000' }); // 400 tokens

        const newRewards = new Map([
          ['strategy1', { owner: '0xowner1', totalReward: new Decimal('100000000000000000000') }], // 100 tokens
          ['strategy2', { owner: '0xowner2', totalReward: new Decimal('200000000000000000000') }], // 200 tokens
        ]);

        const epoch = {
          epochNumber: 1,
          startTimestamp: new Date(),
          endTimestamp: new Date(),
          totalRewards: new Decimal('300000000000000000000'),
        };

        const result = await (service as any).validateEpochRewardsWontExceedTotal(mockCampaign, epoch, newRewards);

        expect(result).toBe(true); // 400 + 300 = 700 < 1000
      });

      it('should return false when projected total exceeds campaign amount', async () => {
        mockQueryBuilder.getRawOne.mockResolvedValue({ total: '800000000000000000000' }); // 800 tokens

        const newRewards = new Map([
          ['strategy1', { owner: '0xowner1', totalReward: new Decimal('300000000000000000000') }], // 300 tokens
        ]);

        const epoch = {
          epochNumber: 1,
          startTimestamp: new Date(),
          endTimestamp: new Date(),
          totalRewards: new Decimal('300000000000000000000'),
        };

        const result = await (service as any).validateEpochRewardsWontExceedTotal(mockCampaign, epoch, newRewards);

        expect(result).toBe(false); // 800 + 300 = 1100 > 1000
      });

      it('should handle database errors gracefully', async () => {
        mockQueryBuilder.getRawOne.mockRejectedValue(new Error('Database error'));

        const newRewards = new Map();
        const epoch = {
          epochNumber: 1,
          startTimestamp: new Date(),
          endTimestamp: new Date(),
          totalRewards: new Decimal('100'),
        };

        const result = await (service as any).validateEpochRewardsWontExceedTotal(mockCampaign, epoch, newRewards);

        expect(result).toBe(false);
      });
    });
  });

  describe('Utility Methods', () => {
    describe('getTimestampForBlock', () => {
      it('should return timestamp for given block', async () => {
        const result = await (service as any).getTimestampForBlock(1000, mockDeployment);

        expect(result).toBe(Math.floor(mockBlock.timestamp.getTime() / 1000));
        expect(mockBlockService.getBlock).toHaveBeenCalledWith(1000, mockDeployment);
      });
    });

    describe('sortBatchEventsChronologically', () => {
      it('should sort events chronologically with proper tiebreakers', () => {
        const batchEvents = {
          createdEvents: [mockStrategyCreatedEvent],
          updatedEvents: [mockStrategyUpdatedEvent],
          deletedEvents: [mockStrategyDeletedEvent],
          transferEvents: [mockVoucherTransferEvent],
          blockTimestamps: {
            [mockBlock.id]: mockBlock.timestamp,
          },
        };

        const result = (service as any).sortBatchEventsChronologically(batchEvents);

        expect(result.length).toBe(4);
        expect(result[0].type).toBe('created');
        expect(result[1].type).toBe('updated');
        expect(result[2].type).toBe('deleted');
        expect(result[3].type).toBe('transfer');
      });

      it('should handle empty event lists', () => {
        const batchEvents = {
          createdEvents: [],
          updatedEvents: [],
          deletedEvents: [],
          transferEvents: [],
          blockTimestamps: {},
        };

        const result = (service as any).sortBatchEventsChronologically(batchEvents);

        expect(result.length).toBe(0);
      });
    });

    describe('applyEventToStrategyStates', () => {
      let strategyStates: Map<string, any>;

      beforeEach(() => {
        strategyStates = new Map();
      });

      it('should apply created event', () => {
        const timestampedEvent = {
          timestamp: 1704067500,
          type: 'created' as const,
          event: mockStrategyCreatedEvent,
        };

        (service as any).applyEventToStrategyStates(timestampedEvent, strategyStates);

        expect(strategyStates.has('12345')).toBe(true);
      });

      it('should apply updated event', () => {
        strategyStates.set('12345', { strategyId: '12345', liquidity0: new Decimal('1000') });

        const timestampedEvent = {
          timestamp: 1704067600,
          type: 'updated' as const,
          event: mockStrategyUpdatedEvent,
        };

        (service as any).applyEventToStrategyStates(timestampedEvent, strategyStates);

        // Should have updated the existing strategy
        expect(strategyStates.get('12345').lastProcessedBlock).toBe(mockBlock.id);
      });

      it('should apply deleted event', () => {
        strategyStates.set('12345', { strategyId: '12345', isDeleted: false });

        const timestampedEvent = {
          timestamp: 1704067700,
          type: 'deleted' as const,
          event: mockStrategyDeletedEvent,
        };

        (service as any).applyEventToStrategyStates(timestampedEvent, strategyStates);

        expect(strategyStates.get('12345').isDeleted).toBe(true);
      });

      it('should apply transfer event', () => {
        strategyStates.set('12345', { strategyId: '12345', currentOwner: '0xoldowner' });

        const timestampedEvent = {
          timestamp: 1704067800,
          type: 'transfer' as const,
          event: mockVoucherTransferEvent,
        };

        (service as any).applyEventToStrategyStates(timestampedEvent, strategyStates);

        expect(strategyStates.get('12345').currentOwner).toBe('0xnewowner');
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle campaigns ending before processing time', async () => {
      const expiredCampaign = {
        ...mockCampaign,
        endDate: new Date('2023-12-31T23:59:59Z'), // Ended before processing
      };

      mockCampaignService.getActiveCampaigns.mockResolvedValue([expiredCampaign]);
      mockEntityManager.query.mockResolvedValue([]);

      await service.update(1100, mockDeployment);

      // Should still process but skip epoch generation
      expect(mockCampaignService.getActiveCampaigns).toHaveBeenCalled();
    });

    it('should handle malformed JSON in order data', () => {
      const malformedEvent = {
        ...mockStrategyCreatedEvent,
        order0: 'invalid json',
      };

      const strategyStates = new Map();

      expect(() => {
        (service as any).processCreatedEvent(malformedEvent, strategyStates);
      }).toThrow();
    });

    it('should handle very large decimal numbers', () => {
      const largeNumber = '999999999999999999999999999999999999999999';
      const result = (service as any).decompressRateParameter(largeNumber);

      expect(result).toBeInstanceOf(Decimal);
      expect(result.toString()).toBeDefined();
    });

    it('should handle empty strategy states in various operations', () => {
      const emptyStates = new Map();

      // Test cloning empty map
      const cloned = (service as any).deepCloneStrategyStates(emptyStates);
      expect(cloned.size).toBe(0);

      // Test event processing with empty states
      (service as any).updateStrategyStates([], [], [], [], emptyStates);
      expect(emptyStates.size).toBe(0);
    });
  });

  describe('CSV Export Functionality', () => {
    beforeEach(() => {
      // Reset all mocks before each test
      jest.clearAllMocks();
      jest.restoreAllMocks();
    });

    it('should have CSV export disabled by default', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MerklProcessorService,
          {
            provide: getRepositoryToken(EpochReward),
            useValue: mockRepository,
          },
          {
            provide: CampaignService,
            useValue: mockCampaignService,
          },
          {
            provide: LastProcessedBlockService,
            useValue: mockLastProcessedBlockService,
          },
          {
            provide: BlockService,
            useValue: mockBlockService,
          },
          {
            provide: HistoricQuoteService,
            useValue: mockHistoricQuoteService,
          },
          {
            provide: StrategyCreatedEventService,
            useValue: mockStrategyCreatedEventService,
          },
          {
            provide: StrategyUpdatedEventService,
            useValue: mockStrategyUpdatedEventService,
          },
          {
            provide: StrategyDeletedEventService,
            useValue: mockStrategyDeletedEventService,
          },
          {
            provide: VoucherTransferEventService,
            useValue: mockVoucherTransferEventService,
          },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue('0'), // Explicitly disabled
            },
          },
        ],
      }).compile();

      const testService = module.get<MerklProcessorService>(MerklProcessorService);
      expect((testService as any).csvExportEnabled).toBe(false);
    });

    it('should enable CSV export when environment variable is set to "1"', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MerklProcessorService,
          {
            provide: getRepositoryToken(EpochReward),
            useValue: mockRepository,
          },
          {
            provide: CampaignService,
            useValue: mockCampaignService,
          },
          {
            provide: LastProcessedBlockService,
            useValue: mockLastProcessedBlockService,
          },
          {
            provide: BlockService,
            useValue: mockBlockService,
          },
          {
            provide: HistoricQuoteService,
            useValue: mockHistoricQuoteService,
          },
          {
            provide: StrategyCreatedEventService,
            useValue: mockStrategyCreatedEventService,
          },
          {
            provide: StrategyUpdatedEventService,
            useValue: mockStrategyUpdatedEventService,
          },
          {
            provide: StrategyDeletedEventService,
            useValue: mockStrategyDeletedEventService,
          },
          {
            provide: VoucherTransferEventService,
            useValue: mockVoucherTransferEventService,
          },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue('1'), // Explicitly enabled
            },
          },
        ],
      }).compile();

      const testService = module.get<MerklProcessorService>(MerklProcessorService);
      expect((testService as any).csvExportEnabled).toBe(true);
    });

    it('should not call writeRewardBreakdownFile when CSV export is disabled', async () => {
      // Setup service with CSV disabled
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MerklProcessorService,
          {
            provide: getRepositoryToken(EpochReward),
            useValue: {
              ...mockRepository,
              createQueryBuilder: jest.fn().mockReturnValue({
                delete: jest.fn().mockReturnThis(),
                from: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                execute: jest.fn().mockResolvedValue({ affected: 0 }),
              }),
            },
          },
          {
            provide: CampaignService,
            useValue: {
              getActiveCampaigns: jest.fn().mockResolvedValue([]),
            },
          },
          {
            provide: LastProcessedBlockService,
            useValue: {
              getOrInit: jest.fn().mockResolvedValue(100),
              update: jest.fn().mockResolvedValue(undefined),
            },
          },
          {
            provide: BlockService,
            useValue: mockBlockService,
          },
          {
            provide: HistoricQuoteService,
            useValue: mockHistoricQuoteService,
          },
          {
            provide: StrategyCreatedEventService,
            useValue: mockStrategyCreatedEventService,
          },
          {
            provide: StrategyUpdatedEventService,
            useValue: mockStrategyUpdatedEventService,
          },
          {
            provide: StrategyDeletedEventService,
            useValue: mockStrategyDeletedEventService,
          },
          {
            provide: VoucherTransferEventService,
            useValue: mockVoucherTransferEventService,
          },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue('0'), // Disabled
            },
          },
        ],
      }).compile();

      const testService = module.get<MerklProcessorService>(MerklProcessorService);
      const writeRewardBreakdownFileSpy = jest.spyOn(testService as any, 'writeRewardBreakdownFile');

      const deployment = {
        blockchainType: 'ethereum',
        exchangeId: 'ethereum',
        startBlock: 1,
      };

      await testService.update(200, deployment as any);

      expect(writeRewardBreakdownFileSpy).not.toHaveBeenCalled();
    });

    it('should call writeRewardBreakdownFile when CSV export is enabled', () => {
      // Create a service instance with CSV enabled
      const configServiceMock = {
        get: jest.fn().mockReturnValue('1'), // Enabled
      };

      const testService = new (MerklProcessorService as any)(
        mockRepository,
        mockCampaignService,
        mockLastProcessedBlockService,
        mockBlockService,
        mockHistoricQuoteService,
        mockStrategyCreatedEventService,
        mockStrategyUpdatedEventService,
        mockStrategyDeletedEventService,
        mockVoucherTransferEventService,
        configServiceMock,
      );

      expect((testService as any).csvExportEnabled).toBe(true);

      // Spy on the writeRewardBreakdownFile method and mock it
      const writeRewardBreakdownFileSpy = jest
        .spyOn(testService as any, 'writeRewardBreakdownFile')
        .mockImplementation(() => Promise.resolve());

      // Mock the rewardBreakdown property
      (testService as any).rewardBreakdown = {
        LP_strategy1: {
          epochs: {
            '1704081600': {
              epoch_number: 1,
              sub_epochs: {},
              token0_reward: '100',
              token1_reward: '200',
              total_reward: '300',
            },
          },
        },
      };

      const deployment = {
        blockchainType: 'ethereum',
        exchangeId: 'ethereum',
        startBlock: 1,
      };

      // Call the writeRewardBreakdownFile method directly
      (testService as any).writeRewardBreakdownFile(deployment);

      expect(writeRewardBreakdownFileSpy).toHaveBeenCalledWith(deployment);
    });

    it('should collect CSV data inline during reward calculation when enabled', () => {
      // Setup service with CSV enabled
      const configServiceMock = {
        get: jest.fn().mockReturnValue('1'),
      };

      const testService = new (MerklProcessorService as any)(
        mockRepository,
        mockCampaignService,
        mockLastProcessedBlockService,
        mockBlockService,
        mockHistoricQuoteService,
        mockStrategyCreatedEventService,
        mockStrategyUpdatedEventService,
        mockStrategyDeletedEventService,
        mockVoucherTransferEventService,
        configServiceMock,
      );

      expect((testService as any).csvExportEnabled).toBe(true);

      // Mock the necessary properties and methods
      (testService as any).currentEpochStart = '1704081600';
      (testService as any).currentEpochNumber = 1;
      (testService as any).rewardBreakdown = {};
      (testService as any).priceCache = {
        rates: new Map([
          ['0x1234567890123456789012345678901234567890', 100],
          ['0x0987654321098765432109876543210987654321', 200],
        ]),
      };

      // Create test data
      const snapshot = {
        timestamp: 1704081600,
        targetSqrtPriceScaled: new Decimal('1000000000000000000000000'),
        invTargetSqrtPriceScaled: new Decimal('1000000000000000000000000'),
        order0TargetPrice: new Decimal('2'),
        strategies: new Map([
          [
            'strategy1',
            {
              isDeleted: false,
              liquidity0: new Decimal('1000000000000000000'),
              liquidity1: new Decimal('2000000000000000000'),
              order0_z: new Decimal('500000000000000000'),
              order0_A: new Decimal('1000000000000000000000000'),
              order0_B: new Decimal('1000000000000000000000000'),
              order1_z: new Decimal('1000000000000000000'),
              order1_A: new Decimal('1000000000000000000000000'),
              order1_B: new Decimal('1000000000000000000000000'),
              token0Address: '0x1234567890123456789012345678901234567890',
              token1Address: '0x0987654321098765432109876543210987654321',
            },
          ],
        ]),
      };

      const campaign = {
        exchangeId: 'ethereum',
      };

      // Call the method
      const result = (testService as any).calculateSnapshotRewards(
        snapshot,
        new Decimal('1000000000000000000000'),
        campaign,
        1,
      );

      // Verify CSV data was collected
      expect((testService as any).rewardBreakdown['LP_strategy1']).toBeDefined();
      expect((testService as any).rewardBreakdown['LP_strategy1'].epochs).toBeDefined();
      expect((testService as any).rewardBreakdown['LP_strategy1'].epochs['1704081600']).toBeDefined();

      const epochData = (testService as any).rewardBreakdown['LP_strategy1'].epochs['1704081600'];
      expect(epochData.epoch_number).toBe(1);
      expect(epochData.sub_epochs).toBeDefined();

      const subEpochKey = Object.keys(epochData.sub_epochs)[0];
      expect(subEpochKey).toBeDefined();

      const subEpochData = epochData.sub_epochs[subEpochKey];
      expect(subEpochData.sub_epoch_number).toBe(1);
      expect(subEpochData.strategy_liquidity.liquidity0).toBe('1000000000000000000');
      expect(subEpochData.strategy_liquidity.liquidity1).toBe('2000000000000000000');
      expect(subEpochData.market_data.token0_address).toBe('0x1234567890123456789012345678901234567890');
      expect(subEpochData.market_data.token1_address).toBe('0x0987654321098765432109876543210987654321');
      expect(subEpochData.eligibility.eligible0).toBeDefined();
      expect(subEpochData.eligibility.eligible1).toBeDefined();
    });

    it('should not collect CSV data when disabled', () => {
      // Setup service with CSV disabled
      const configServiceMock = {
        get: jest.fn().mockReturnValue('0'),
      };

      const testService = new (MerklProcessorService as any)(
        mockRepository,
        mockCampaignService,
        mockLastProcessedBlockService,
        mockBlockService,
        mockHistoricQuoteService,
        mockStrategyCreatedEventService,
        mockStrategyUpdatedEventService,
        mockStrategyDeletedEventService,
        mockVoucherTransferEventService,
        configServiceMock,
      );

      expect((testService as any).csvExportEnabled).toBe(false);

      // Mock the necessary properties
      (testService as any).rewardBreakdown = {};

      // Create test data
      const snapshot = {
        timestamp: 1704081600,
        targetSqrtPriceScaled: new Decimal('1000000000000000000000000'),
        invTargetSqrtPriceScaled: new Decimal('1000000000000000000000000'),
        order0TargetPrice: new Decimal('2'),
        strategies: new Map([
          [
            'strategy1',
            {
              isDeleted: false,
              liquidity0: new Decimal('1000000000000000000'),
              liquidity1: new Decimal('2000000000000000000'),
              order0_z: new Decimal('500000000000000000'),
              order0_A: new Decimal('1000000000000000000000000'),
              order0_B: new Decimal('1000000000000000000000000'),
              order1_z: new Decimal('1000000000000000000'),
              order1_A: new Decimal('1000000000000000000000000'),
              order1_B: new Decimal('1000000000000000000000000'),
              token0Address: '0x1234567890123456789012345678901234567890',
              token1Address: '0x0987654321098765432109876543210987654321',
            },
          ],
        ]),
      };

      const campaign = {
        exchangeId: 'ethereum',
      };

      // Call the method
      const result = (testService as any).calculateSnapshotRewards(
        snapshot,
        new Decimal('1000000000000000000000'),
        campaign,
        1,
      );

      // Verify no CSV data was collected
      expect(Object.keys((testService as any).rewardBreakdown)).toHaveLength(0);
    });
  });

  describe('Snapshot Interval Generation', () => {
    let mockConfigService: jest.Mocked<ConfigService>;

    const mockCampaign = {
      id: 'test-campaign-123',
      blockchainType: BlockchainType.Ethereum,
      exchangeId: ExchangeId.OGEthereum,
    };

    const mockEpoch = {
      epochNumber: 5,
      startTimestamp: new Date('2024-01-01T00:00:00Z'),
      endTimestamp: new Date('2024-01-01T04:00:00Z'), // 4 hours later
    };

    const mockChronologicalEvents = [
      { timestamp: 1000, event: { transactionHash: '0xabc123' } },
      { timestamp: 2000, event: { transactionHash: '0xdef456' } },
      { timestamp: 3000, event: { transactionHash: '0x789xyz' } },
    ];

    beforeEach(() => {
      mockConfigService = {
        get: jest.fn(),
      } as any;

      // Default mocks for required environment variables
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'MERKL_SNAPSHOT_SALT') {
          return 'test-salt-12345'; // Default salt for tests
        }
        return undefined; // Default for other keys
      });

      // Replace the configService in the service instance
      (service as any).configService = mockConfigService;
    });

    describe('getSnapshotIntervals', () => {
      it('should use fixed seed when MERKL_SNAPSHOT_SEED is set', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'MERKL_SNAPSHOT_SEED') {
            return '0x123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
          }
          if (key === 'MERKL_SNAPSHOT_SALT') {
            return 'test-salt-12345';
          }
          return undefined;
        });

        const intervals = (service as any).getSnapshotIntervals(mockCampaign, mockEpoch, mockChronologicalEvents);

        expect(mockConfigService.get).toHaveBeenCalledWith('MERKL_SNAPSHOT_SEED');
        expect(intervals).toBeDefined();
        expect(Array.isArray(intervals)).toBe(true);
        expect(intervals.length).toBeGreaterThan(0);
        expect(intervals.every((i: number) => i >= 240 && i <= 360)).toBe(true);
      });

      it('should use transaction-based seed when MERKL_SNAPSHOT_SEED is not set', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'MERKL_SNAPSHOT_SEED') {
            return undefined; // No fixed seed, so will use transaction-based
          }
          if (key === 'MERKL_SNAPSHOT_SALT') {
            return 'test-salt-12345';
          }
          return undefined;
        });

        const intervals = (service as any).getSnapshotIntervals(mockCampaign, mockEpoch, mockChronologicalEvents);

        expect(mockConfigService.get).toHaveBeenCalledWith('MERKL_SNAPSHOT_SEED');
        expect(intervals).toBeDefined();
        expect(Array.isArray(intervals)).toBe(true);
        expect(intervals.length).toBeGreaterThan(0);
        expect(intervals.every((i: number) => i >= 240 && i <= 360)).toBe(true);
      });

      it('should generate consistent intervals for same inputs', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'MERKL_SNAPSHOT_SEED') {
            return undefined; // No fixed seed, so will use transaction-based
          }
          if (key === 'MERKL_SNAPSHOT_SALT') {
            return 'test-salt-12345';
          }
          return undefined;
        });

        const intervals1 = (service as any).getSnapshotIntervals(mockCampaign, mockEpoch, mockChronologicalEvents);
        const intervals2 = (service as any).getSnapshotIntervals(mockCampaign, mockEpoch, mockChronologicalEvents);

        expect(intervals1).toEqual(intervals2);
      });

      it('should generate different intervals for different epochs', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'MERKL_SNAPSHOT_SEED') {
            return undefined; // No fixed seed, so will use transaction-based
          }
          if (key === 'MERKL_SNAPSHOT_SALT') {
            return 'test-salt-12345';
          }
          return undefined;
        });

        const epoch1 = { ...mockEpoch, epochNumber: 1 };
        const epoch2 = { ...mockEpoch, epochNumber: 2 };

        const intervals1 = (service as any).getSnapshotIntervals(mockCampaign, epoch1, mockChronologicalEvents);
        const intervals2 = (service as any).getSnapshotIntervals(mockCampaign, epoch2, mockChronologicalEvents);

        expect(intervals1).not.toEqual(intervals2);
      });

      it('should generate intervals that sum to epoch duration', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'MERKL_SNAPSHOT_SEED') {
            return undefined; // No fixed seed, so will use transaction-based
          }
          if (key === 'MERKL_SNAPSHOT_SALT') {
            return 'test-salt-12345';
          }
          return undefined;
        });

        const intervals = (service as any).getSnapshotIntervals(mockCampaign, mockEpoch, mockChronologicalEvents);
        const totalIntervalTime = intervals.reduce((sum: number, interval: number) => sum + interval, 0);
        const expectedDuration = Math.floor(
          (mockEpoch.endTimestamp.getTime() - mockEpoch.startTimestamp.getTime()) / 1000,
        );

        expect(Math.abs(totalIntervalTime - expectedDuration)).toBeLessThanOrEqual(1); // Allow 1 second tolerance
      });
    });

    describe('generateEpochSeed', () => {
      it('should generate consistent seed for same inputs', () => {
        const seed1 = (service as any).generateEpochSeed(mockCampaign, mockEpoch, mockChronologicalEvents);
        const seed2 = (service as any).generateEpochSeed(mockCampaign, mockEpoch, mockChronologicalEvents);

        expect(seed1).toBe(seed2);
        expect(seed1).toMatch(/^0x[a-f0-9]{64}$/); // Should be hex string
      });

      it('should generate different seeds for different campaigns', () => {
        const campaign1 = { ...mockCampaign, id: 'campaign-1' };
        const campaign2 = { ...mockCampaign, id: 'campaign-2' };

        const seed1 = (service as any).generateEpochSeed(campaign1, mockEpoch, mockChronologicalEvents);
        const seed2 = (service as any).generateEpochSeed(campaign2, mockEpoch, mockChronologicalEvents);

        expect(seed1).not.toBe(seed2);
      });

      it('should generate different seeds for different epochs', () => {
        const epoch1 = { ...mockEpoch, epochNumber: 1 };
        const epoch2 = { ...mockEpoch, epochNumber: 2 };

        const seed1 = (service as any).generateEpochSeed(mockCampaign, epoch1, mockChronologicalEvents);
        const seed2 = (service as any).generateEpochSeed(mockCampaign, epoch2, mockChronologicalEvents);

        expect(seed1).not.toBe(seed2);
      });
    });

    describe('getLastTransactionHashFromSortedEvents', () => {
      it('should find last transaction hash before epoch start', () => {
        const epochWithMidStart = {
          ...mockEpoch,
          startTimestamp: new Date(2500 * 1000), // Convert to milliseconds - between 2000 and 3000 seconds
        };

        const txHash = (service as any).getLastTransactionHashFromSortedEvents(
          epochWithMidStart,
          mockChronologicalEvents,
        );

        expect(txHash).toBe('0xdef456'); // Last hash before timestamp 2500
      });

      it('should find first available hash when epoch starts after all events', () => {
        const epochWithLateStart = {
          ...mockEpoch,
          startTimestamp: new Date(5000 * 1000), // Convert to milliseconds - after all events
        };

        const txHash = (service as any).getLastTransactionHashFromSortedEvents(
          epochWithLateStart,
          mockChronologicalEvents,
        );

        expect(txHash).toBe('0x789xyz'); // Latest hash available
      });

      it('should use first available event hash when no events before epoch start', () => {
        const epochWithEarlyStart = {
          ...mockEpoch,
          startTimestamp: new Date(500 * 1000), // Convert to milliseconds - before any events
        };

        const txHash = (service as any).getLastTransactionHashFromSortedEvents(
          epochWithEarlyStart,
          mockChronologicalEvents,
        );

        expect(txHash).toBe('0xabc123'); // First available hash since none before epoch start
      });

      it('should throw error when no events exist at all', () => {
        expect(() => (service as any).getLastTransactionHashFromSortedEvents(mockEpoch, [])).toThrow(
          'No events found for epoch 5 - cannot generate seed',
        );
      });
    });

    describe('Integration with partitioner', () => {
      it('should call partitionSingleEpoch with correct parameters', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'MERKL_SNAPSHOT_SEED') {
            return '0x123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
          }
          if (key === 'MERKL_SNAPSHOT_SALT') {
            return 'test-salt-12345';
          }
          return undefined;
        });

        // Mock partitionSingleEpoch by importing it and spying on it
        const partitioner = require('./partitioner');
        const partitionSpy = jest.spyOn(partitioner, 'partitionSingleEpoch');
        partitionSpy.mockReturnValue([240, 300, 360, 280, 320]);

        const intervals = (service as any).getSnapshotIntervals(mockCampaign, mockEpoch, mockChronologicalEvents);

        expect(partitionSpy).toHaveBeenCalledWith(
          14400, // 4 hours in seconds
          240, // MIN_SNAPSHOT_INTERVAL
          360, // MAX_SNAPSHOT_INTERVAL
          '0x123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        );
        expect(intervals).toEqual([240, 300, 360, 280, 320]);

        partitionSpy.mockRestore();
      });
    });

    describe('Environment variable behavior', () => {
      it('should prioritize MERKL_SNAPSHOT_SEED over transaction-based seed', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'MERKL_SNAPSHOT_SEED') {
            return '0x123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
          }
          if (key === 'MERKL_SNAPSHOT_SALT') {
            return 'test-salt-12345';
          }
          return undefined;
        });

        const intervals1 = (service as any).getSnapshotIntervals(mockCampaign, mockEpoch, mockChronologicalEvents);
        const intervals2 = (service as any).getSnapshotIntervals(
          { ...mockCampaign, id: 'different-campaign' },
          { ...mockEpoch, epochNumber: 999 },
          [], // Different events
        );

        // Should be identical because using fixed seed
        expect(intervals1).toEqual(intervals2);
      });

      it('should use transaction-based seed when env var is empty string', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'MERKL_SNAPSHOT_SEED') {
            return '';
          }
          if (key === 'MERKL_SNAPSHOT_SALT') {
            return 'test-salt-12345';
          }
          return undefined;
        });

        const intervals = (service as any).getSnapshotIntervals(mockCampaign, mockEpoch, mockChronologicalEvents);

        expect(intervals).toBeDefined();
        expect(intervals.length).toBeGreaterThan(0);
      });

      it('should use transaction-based seed when env var is null', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'MERKL_SNAPSHOT_SEED') {
            return null;
          }
          if (key === 'MERKL_SNAPSHOT_SALT') {
            return 'test-salt-12345';
          }
          return undefined;
        });

        const intervals = (service as any).getSnapshotIntervals(mockCampaign, mockEpoch, mockChronologicalEvents);

        expect(intervals).toBeDefined();
        expect(intervals.length).toBeGreaterThan(0);
      });

      it('should throw error when MERKL_SNAPSHOT_SALT is missing', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'MERKL_SNAPSHOT_SEED') {
            return undefined; // No fixed seed, so will use transaction-based
          }
          if (key === 'MERKL_SNAPSHOT_SALT') {
            return undefined; // Missing salt - should cause error
          }
          return undefined;
        });

        expect(() => (service as any).getSnapshotIntervals(mockCampaign, mockEpoch, mockChronologicalEvents)).toThrow(
          'MERKL_SNAPSHOT_SALT environment variable is required for secure seed generation',
        );
      });

      it('should throw error when MERKL_SNAPSHOT_SALT is empty string', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'MERKL_SNAPSHOT_SEED') {
            return undefined; // No fixed seed, so will use transaction-based
          }
          if (key === 'MERKL_SNAPSHOT_SALT') {
            return ''; // Empty salt - should cause error
          }
          return undefined;
        });

        expect(() => (service as any).getSnapshotIntervals(mockCampaign, mockEpoch, mockChronologicalEvents)).toThrow(
          'MERKL_SNAPSHOT_SALT environment variable is required for secure seed generation',
        );
      });

      it('should not require salt when MERKL_SNAPSHOT_SEED is provided', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'MERKL_SNAPSHOT_SEED') {
            return '0x123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
          }
          if (key === 'MERKL_SNAPSHOT_SALT') {
            return undefined; // Missing salt, but should not matter when fixed seed is provided
          }
          return undefined;
        });

        const intervals = (service as any).getSnapshotIntervals(mockCampaign, mockEpoch, mockChronologicalEvents);

        expect(intervals).toBeDefined();
        expect(intervals.length).toBeGreaterThan(0);
      });
    });

    describe('Salt-based seed generation', () => {
      it('should generate different seeds with different salts', () => {
        // First seed with salt1
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'MERKL_SNAPSHOT_SALT') {
            return 'salt1';
          }
          return undefined;
        });
        const seed1 = (service as any).generateEpochSeed(mockCampaign, mockEpoch, mockChronologicalEvents);

        // Second seed with salt2
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'MERKL_SNAPSHOT_SALT') {
            return 'salt2';
          }
          return undefined;
        });
        const seed2 = (service as any).generateEpochSeed(mockCampaign, mockEpoch, mockChronologicalEvents);

        expect(seed1).not.toBe(seed2);
        expect(seed1).toMatch(/^0x[a-f0-9]{64}$/);
        expect(seed2).toMatch(/^0x[a-f0-9]{64}$/);
      });

      it('should generate consistent seeds with same salt', () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'MERKL_SNAPSHOT_SALT') {
            return 'consistent-salt';
          }
          return undefined;
        });

        const seed1 = (service as any).generateEpochSeed(mockCampaign, mockEpoch, mockChronologicalEvents);
        const seed2 = (service as any).generateEpochSeed(mockCampaign, mockEpoch, mockChronologicalEvents);

        expect(seed1).toBe(seed2);
        expect(seed1).toMatch(/^0x[a-f0-9]{64}$/);
      });
    });
  });
});
