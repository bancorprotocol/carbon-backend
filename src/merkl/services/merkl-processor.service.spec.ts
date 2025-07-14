import { Test, TestingModule } from '@nestjs/testing';
import { MerklProcessorService } from './merkl-processor.service';
import { CampaignService } from './campaign.service';
import { LastProcessedBlockService } from '../../last-processed-block/last-processed-block.service';
import { HistoricQuoteService } from '../../historic-quote/historic-quote.service';
import { StrategyCreatedEventService } from '../../events/strategy-created-event/strategy-created-event.service';
import { StrategyUpdatedEventService } from '../../events/strategy-updated-event/strategy-updated-event.service';
import { StrategyDeletedEventService } from '../../events/strategy-deleted-event/strategy-deleted-event.service';
import { VoucherTransferEventService } from '../../events/voucher-transfer-event/voucher-transfer-event.service';
import { BlockService } from '../../block/block.service';
import { DeploymentService } from '../../deployment/deployment.service';
import { TokenService } from '../../token/token.service';
import { PairService } from '../../pair/pair.service';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EpochReward } from '../entities/epoch-reward.entity';
import { Campaign } from '../entities/campaign.entity';
import Decimal from 'decimal.js';

describe('MerklProcessorService', () => {
  let service: MerklProcessorService;
  let campaignService: CampaignService;
  let epochRewardRepository: Repository<EpochReward>;

  const mockCampaignService = {
    findByPairId: jest.fn(),
  };

  const mockLastProcessedBlockService = {
    getOrInit: jest.fn(),
    save: jest.fn(),
  };

  const mockHistoricQuoteService = {
    findByTokensAndTimestamp: jest.fn(),
  };

  const mockStrategyCreatedEventService = {
    get: jest.fn(),
  };

  const mockStrategyUpdatedEventService = {
    get: jest.fn(),
  };

  const mockStrategyDeletedEventService = {
    get: jest.fn(),
  };

  const mockVoucherTransferEventService = {
    get: jest.fn(),
  };

  const mockBlockService = {
    getLastBlock: jest.fn(),
  };

  const mockDeploymentService = {
    getDeployment: jest.fn(),
  };

  const mockTokenService = {
    findByAddress: jest.fn(),
  };

  const mockPairService = {
    findById: jest.fn(),
  };

  const mockCampaignRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockEpochRewardRepository = {
    save: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    manager: {
      transaction: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerklProcessorService,
        {
          provide: CampaignService,
          useValue: mockCampaignService,
        },
        {
          provide: LastProcessedBlockService,
          useValue: mockLastProcessedBlockService,
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
          provide: BlockService,
          useValue: mockBlockService,
        },
        {
          provide: DeploymentService,
          useValue: mockDeploymentService,
        },
        {
          provide: TokenService,
          useValue: mockTokenService,
        },
        {
          provide: PairService,
          useValue: mockPairService,
        },
        {
          provide: getRepositoryToken(Campaign),
          useValue: mockCampaignRepository,
        },
        {
          provide: getRepositoryToken(EpochReward),
          useValue: mockEpochRewardRepository,
        },
      ],
    }).compile();

    service = module.get<MerklProcessorService>(MerklProcessorService);
    campaignService = module.get<CampaignService>(CampaignService);
    epochRewardRepository = module.get<Repository<EpochReward>>(getRepositoryToken(EpochReward));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Service initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have update method', () => {
      expect(typeof service.update).toBe('function');
    });
  });

  describe('decompressRateParameter', () => {
    it('should decompress rate parameters correctly', () => {
      const testCases = [
        { compressed: '0', expected: '0' },
        { compressed: '1485805197', expected: '1485805197' },
        { compressed: '12587943637', expected: '12587943637' },
      ];

      testCases.forEach(({ compressed, expected }) => {
        const result = service['decompressRateParameter'](compressed);
        expect(result.toString()).toBe(expected);
      });
    });

    it('should handle edge cases', () => {
      const result = service['decompressRateParameter']('0');
      expect(result.toString()).toBe('0');

      const largeResult = service['decompressRateParameter']('999999999999999');
      expect(largeResult.isFinite()).toBe(true);
      expect(largeResult.gte(0)).toBe(true);
    });
  });

  describe('calculateEligibleLiquidity', () => {
    it('should calculate eligible liquidity correctly', () => {
      const y = new Decimal('1000000000000000000');
      const z = new Decimal('2000000000000000000');
      const A = new Decimal('100000000000000000');
      const B = new Decimal('200000000000000000');
      const targetSqrtPriceScaled = new Decimal('1000000000000000000');
      const toleranceFactor = new Decimal('0.02');

      const result = service['calculateEligibleLiquidity'](y, z, A, B, targetSqrtPriceScaled, toleranceFactor);

      expect(result).toBeInstanceOf(Decimal);
      expect(result.gte(0)).toBe(true);
    });

    it('should handle edge cases', () => {
      const y = new Decimal('0');
      const z = new Decimal('0');
      const A = new Decimal('0');
      const B = new Decimal('0');
      const targetSqrtPriceScaled = new Decimal('1000000000000000000');
      const toleranceFactor = new Decimal('0.02');

      const result = service['calculateEligibleLiquidity'](y, z, A, B, targetSqrtPriceScaled, toleranceFactor);

      expect(result).toBeInstanceOf(Decimal);
      expect(result.gte(0)).toBe(true);
    });
  });

  describe('calculateTargetSqrtPriceScaled', () => {
    it('should calculate target sqrt price scaled correctly', () => {
      const targetPrice = new Decimal('2600'); // ETH price
      const result = service['calculateTargetSqrtPriceScaled'](targetPrice);

      expect(result).toBeInstanceOf(Decimal);
      expect(result.gt(0)).toBe(true);
    });
  });

  describe('calculateInvTargetSqrtPriceScaled', () => {
    it('should calculate inverse target sqrt price scaled correctly', () => {
      const targetPrice = new Decimal('2600'); // ETH price
      const result = service['calculateInvTargetSqrtPriceScaled'](targetPrice);

      expect(result).toBeInstanceOf(Decimal);
      expect(result.gt(0)).toBe(true);
    });
  });

  describe('integration tests', () => {
    it('should have all required dependencies injected', () => {
      expect(service).toBeDefined();
      expect(campaignService).toBeDefined();
      expect(epochRewardRepository).toBeDefined();
    });

    it('should handle complex mathematical operations', () => {
      // Test precision with large numbers
      const largeNumber = new Decimal('999999999999999999999999');
      const smallNumber = new Decimal('0.000000000000000001');

      const result = largeNumber.mul(smallNumber);
      expect(result.isFinite()).toBe(true);
      expect(result.gt(0)).toBe(true);
    });
  });

  describe('Reward Distribution Protections', () => {
    const mockCampaign = {
      id: '1',
      blockchainType: 'ethereum',
      exchangeId: 'ethereum',
      pairId: 1,
      rewardAmount: '1000',
      rewardTokenAddress: '0x1234567890123456789012345678901234567890',
      startDate: new Date('2022-01-01T00:00:00.000Z'),
      endDate: new Date('2022-01-02T00:00:00.000Z'), // 1 day = 86400 seconds
      opportunityName: 'Test Campaign',
      isActive: true,
      pair: { id: 1 },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;

    const mockEpoch = {
      epochNumber: 1,
      startTimestamp: new Date(1640995200 * 1000),
      endTimestamp: new Date(1640995500 * 1000), // 300 seconds
      totalRewards: new Decimal('60'), // 300 seconds worth of rewards
    };

    describe('validateTotalRewardsNotExceeded', () => {
      it('should return true when total rewards are within campaign amount', async () => {
        const mockQueryBuilder = {
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getRawOne: jest.fn().mockResolvedValue({ total: '800' }),
        };

        mockEpochRewardRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

        const result = await service['validateTotalRewardsNotExceeded'](mockCampaign);
        expect(result).toBe(true);
      });

      it('should return false when total rewards exceed campaign amount', async () => {
        const mockQueryBuilder = {
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getRawOne: jest.fn().mockResolvedValue({ total: '1200' }),
        };

        mockEpochRewardRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

        const result = await service['validateTotalRewardsNotExceeded'](mockCampaign);
        expect(result).toBe(false);
      });

      it('should handle null total gracefully', async () => {
        const mockQueryBuilder = {
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getRawOne: jest.fn().mockResolvedValue({ total: null }),
        };

        mockEpochRewardRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

        const result = await service['validateTotalRewardsNotExceeded'](mockCampaign);
        expect(result).toBe(true);
      });

      it('should return false on database error', async () => {
        const mockQueryBuilder = {
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getRawOne: jest.fn().mockRejectedValue(new Error('Database error')),
        };

        mockEpochRewardRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

        const result = await service['validateTotalRewardsNotExceeded'](mockCampaign);
        expect(result).toBe(false);
      });
    });

    describe('validateEpochIntegrity', () => {
      it('should return true for valid epoch sequence', () => {
        const epochs = [
          {
            epochNumber: 1,
            startTimestamp: new Date(1640995200 * 1000),
            endTimestamp: new Date(1640995500 * 1000),
            totalRewards: new Decimal('60'),
          },
          {
            epochNumber: 2,
            startTimestamp: new Date(1640995500 * 1000),
            endTimestamp: new Date(1640995800 * 1000),
            totalRewards: new Decimal('60'),
          },
          {
            epochNumber: 3,
            startTimestamp: new Date(1640995800 * 1000),
            endTimestamp: new Date(1641081600 * 1000),
            totalRewards: new Decimal('880'),
          },
        ];

        const result = service['validateEpochIntegrity'](mockCampaign, epochs);
        expect(result).toBe(true);
      });

      it('should return false for epoch gap', () => {
        const epochs = [
          {
            epochNumber: 1,
            startTimestamp: new Date(1640995200 * 1000),
            endTimestamp: new Date(1640995500 * 1000),
            totalRewards: new Decimal('60'),
          },
          {
            epochNumber: 2,
            startTimestamp: new Date(1640995600 * 1000),
            endTimestamp: new Date(1640995800 * 1000),
            totalRewards: new Decimal('40'),
          }, // Gap of 100 seconds
        ];

        const result = service['validateEpochIntegrity'](mockCampaign, epochs);
        expect(result).toBe(false);
      });

      it('should return false for epoch overlap', () => {
        const epochs = [
          {
            epochNumber: 1,
            startTimestamp: new Date(1640995200 * 1000),
            endTimestamp: new Date(1640995500 * 1000),
            totalRewards: new Decimal('60'),
          },
          {
            epochNumber: 2,
            startTimestamp: new Date(1640995400 * 1000),
            endTimestamp: new Date(1640995800 * 1000),
            totalRewards: new Decimal('80'),
          }, // Overlap of 100 seconds
        ];

        const result = service['validateEpochIntegrity'](mockCampaign, epochs);
        expect(result).toBe(false);
      });

      it('should return true for single epoch (no gaps/overlaps to check)', () => {
        const epochs = [
          {
            epochNumber: 1,
            startTimestamp: new Date(1640995200 * 1000),
            endTimestamp: new Date(1640995500 * 1000),
            totalRewards: new Decimal('60'),
          },
        ];

        const result = service['validateEpochIntegrity'](mockCampaign, epochs);
        expect(result).toBe(true);
      });

      it('should return true for empty epochs array', () => {
        const epochs = [];

        const result = service['validateEpochIntegrity'](mockCampaign, epochs);
        expect(result).toBe(true);
      });

      it('should return false for epoch with zero duration', () => {
        const epochs = [
          {
            epochNumber: 1,
            startTimestamp: new Date(1640995200 * 1000),
            endTimestamp: new Date(1640995200 * 1000), // Same start and end time
            totalRewards: new Decimal('60'),
          },
        ];

        const result = service['validateEpochIntegrity'](mockCampaign, epochs);
        expect(result).toBe(false);
      });

      it('should return false for epoch with negative duration', () => {
        const epochs = [
          {
            epochNumber: 1,
            startTimestamp: new Date(1640995500 * 1000),
            endTimestamp: new Date(1640995200 * 1000), // End before start
            totalRewards: new Decimal('60'),
          },
        ];

        const result = service['validateEpochIntegrity'](mockCampaign, epochs);
        expect(result).toBe(false);
      });

      it('should return false on validation error', () => {
        // Create an epoch with invalid date objects to trigger error handling
        const invalidEpoch = {
          ...mockEpoch,
          startTimestamp: null as any, // This will cause getTime() to fail
        };
        const epochs = [invalidEpoch];

        const result = service['validateEpochIntegrity'](mockCampaign, epochs);
        expect(result).toBe(false);
      });
    });

    describe('validateEpochRewardsWontExceedTotal', () => {
      it('should return true when epoch rewards are within limits', async () => {
        const mockQueryBuilder = {
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getRawOne: jest.fn().mockResolvedValue({ total: '800' }),
        };

        mockEpochRewardRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

        const newRewards = new Map([
          ['strategy1', { owner: 'owner1', totalReward: new Decimal('100') }],
          ['strategy2', { owner: 'owner2', totalReward: new Decimal('90') }],
        ]);

        const result = await service['validateEpochRewardsWontExceedTotal'](mockCampaign, mockEpoch, newRewards);
        expect(result).toBe(true);
      });

      it('should return false when epoch rewards would exceed total', async () => {
        const mockQueryBuilder = {
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getRawOne: jest.fn().mockResolvedValue({ total: '900' }),
        };

        mockEpochRewardRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

        const newRewards = new Map([['strategy1', { owner: 'owner1', totalReward: new Decimal('150') }]]);

        const result = await service['validateEpochRewardsWontExceedTotal'](mockCampaign, mockEpoch, newRewards);
        expect(result).toBe(false);
      });

      it('should handle empty rewards map', async () => {
        const mockQueryBuilder = {
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getRawOne: jest.fn().mockResolvedValue({ total: '800' }),
        };

        mockEpochRewardRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

        const newRewards = new Map();

        const result = await service['validateEpochRewardsWontExceedTotal'](mockCampaign, mockEpoch, newRewards);
        expect(result).toBe(true);
      });

      it('should return false on database error', async () => {
        const mockQueryBuilder = {
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getRawOne: jest.fn().mockRejectedValue(new Error('Database error')),
        };

        mockEpochRewardRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

        const newRewards = new Map([['strategy1', { owner: 'owner1', totalReward: new Decimal('100') }]]);

        const result = await service['validateEpochRewardsWontExceedTotal'](mockCampaign, mockEpoch, newRewards);
        expect(result).toBe(false);
      });
    });

    describe('Transaction Safety', () => {
      it('should use transaction when processing epochs', async () => {
        const mockTransactionManager = {
          delete: jest.fn(),
          create: jest.fn(),
          save: jest.fn(),
        };

        const mockTransaction = jest.fn().mockImplementation(async (callback) => {
          return callback(mockTransactionManager);
        });

        mockEpochRewardRepository.manager = {
          transaction: mockTransaction,
        };

        // Mock the validation methods
        jest.spyOn(service as any, 'validateEpochRewardsWontExceedTotal').mockResolvedValue(true);
        jest.spyOn(service as any, 'validateTotalRewardsNotExceeded').mockResolvedValue(true);
        jest.spyOn(service as any, 'calculateEpochRewards').mockReturnValue(new Map());

        const mockStrategyStates = new Map();
        const mockPriceCache = { rates: new Map(), timestamp: Date.now() };

        await service['processEpoch'](mockCampaign, mockEpoch, mockStrategyStates, mockPriceCache);

        expect(mockTransaction).toHaveBeenCalled();
        expect(mockTransactionManager.delete).toHaveBeenCalled();
      });

      it('should skip epoch processing when validation fails', async () => {
        const mockTransactionManager = {
          delete: jest.fn(),
          create: jest.fn(),
          save: jest.fn(),
        };

        const mockTransaction = jest.fn().mockImplementation(async (callback) => {
          return callback(mockTransactionManager);
        });

        mockEpochRewardRepository.manager = {
          transaction: mockTransaction,
        };

        // Mock validation to fail
        jest.spyOn(service as any, 'validateEpochRewardsWontExceedTotal').mockResolvedValue(false);
        jest.spyOn(service as any, 'validateTotalRewardsNotExceeded').mockResolvedValue(true);
        jest.spyOn(service as any, 'calculateEpochRewards').mockReturnValue(new Map());

        const mockStrategyStates = new Map();
        const mockPriceCache = { rates: new Map(), timestamp: Date.now() };

        await service['processEpoch'](mockCampaign, mockEpoch, mockStrategyStates, mockPriceCache);

        expect(mockTransaction).toHaveBeenCalled();
        expect(mockTransactionManager.delete).toHaveBeenCalled();
        expect(mockTransactionManager.save).not.toHaveBeenCalled();
      });
    });

    describe('Error Handling and Logging', () => {
      it('should log errors without throwing when validation fails', async () => {
        const loggerSpy = jest.spyOn(service['logger'], 'error').mockImplementation();

        const mockQueryBuilder = {
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getRawOne: jest.fn().mockResolvedValue({ total: '1200' }),
        };

        mockEpochRewardRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

        const result = await service['validateTotalRewardsNotExceeded'](mockCampaign);

        expect(result).toBe(false);
        // The error should be logged but not thrown
        expect(loggerSpy).toHaveBeenCalled();

        loggerSpy.mockRestore();
      });

      it('should handle processEpochsInTimeRange validation failure gracefully', async () => {
        const loggerSpy = jest.spyOn(service['logger'], 'error').mockImplementation();

        // Mock epoch integrity validation to fail
        jest.spyOn(service as any, 'validateEpochIntegrity').mockReturnValue(false);

        const mockStrategyStates = new Map();
        const mockPriceCache = { rates: new Map(), timestamp: Date.now() };

        // Should not throw error, but should log and skip processing
        await expect(
          service['processEpochsInTimeRange'](mockCampaign, 1640995200, 1641081600, mockStrategyStates, mockPriceCache),
        ).resolves.not.toThrow();

        expect(loggerSpy).toHaveBeenCalled();

        loggerSpy.mockRestore();
      });
    });
  });

  describe('update method', () => {
    it('should handle timestamp conversion correctly in cleanup query', async () => {
      const mockDeployment = {
        blockchainType: 'ethereum',
        exchangeId: 'ethereum',
        startBlock: 1000,
      };

      const mockCampaigns = [
        {
          id: '1',
          blockchainType: 'ethereum',
          exchangeId: 'ethereum',
          pairId: 1,
          rewardAmount: '1000',
          startDate: new Date('2023-01-01'),
          endDate: new Date('2023-01-02'),
          isActive: true,
          pair: { id: 1, token0: { address: '0x1' }, token1: { address: '0x2' } },
        },
      ];

      const mockLastProcessedBlock = 17087000;
      const mockTimestamp = 1681985039; // Unix timestamp
      const expectedDateParam = new Date(mockTimestamp * 1000);

      // Mock all the required services
      const mockCampaignService = {
        getActiveCampaigns: jest.fn().mockResolvedValue(mockCampaigns),
      };
      const mockLastProcessedBlockService = {
        getOrInit: jest.fn().mockResolvedValue(mockLastProcessedBlock),
        update: jest.fn().mockResolvedValue(undefined),
      };
      const mockBlockService = {
        getBlock: jest.fn().mockResolvedValue({ timestamp: new Date(mockTimestamp * 1000) }),
      };

      const mockDeleteQueryBuilder = {
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      };

      mockEpochRewardRepository.createQueryBuilder.mockReturnValue(mockDeleteQueryBuilder);

      // Replace the actual services with mocks
      Object.defineProperty(service, 'campaignService', {
        value: mockCampaignService,
        writable: true,
      });
      Object.defineProperty(service, 'lastProcessedBlockService', {
        value: mockLastProcessedBlockService,
        writable: true,
      });
      Object.defineProperty(service, 'blockService', {
        value: mockBlockService,
        writable: true,
      });

      // Mock the private methods
      jest.spyOn(service as any, 'initializeStrategyStates').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'processBatchForAllCampaigns').mockResolvedValue(undefined);

      // Execute the update method
      await service.update(22919485, mockDeployment as any);

      // Verify that the cleanup query was called with the correct Date object
      expect(mockDeleteQueryBuilder.where).toHaveBeenCalledWith('epochStartTimestamp >= :startTimestamp', {
        startTimestamp: expectedDateParam,
      });

      // Verify the conversion was done correctly
      expect(mockDeleteQueryBuilder.execute).toHaveBeenCalled();
    });

    it('should handle multiple campaigns during update', async () => {
      const mockDeployment = {
        blockchainType: 'ethereum',
        exchangeId: 'ethereum',
        startBlock: 1000,
      };

      const mockCampaigns = [
        {
          id: '1',
          blockchainType: 'ethereum',
          exchangeId: 'ethereum',
          pairId: 1,
          rewardAmount: '1000',
          startDate: new Date('2023-01-01'),
          endDate: new Date('2023-01-02'),
          isActive: true,
          pair: { id: 1, token0: { address: '0x1' }, token1: { address: '0x2' } },
        },
        {
          id: '2',
          blockchainType: 'ethereum',
          exchangeId: 'ethereum',
          pairId: 2,
          rewardAmount: '2000',
          startDate: new Date('2023-01-01'),
          endDate: new Date('2023-01-02'),
          isActive: true,
          pair: { id: 2, token0: { address: '0x3' }, token1: { address: '0x4' } },
        },
      ];

      const mockLastProcessedBlock = 17087000;
      const mockTimestamp = 1681985039;

      // Mock all the required services
      const mockCampaignService = {
        getActiveCampaigns: jest.fn().mockResolvedValue(mockCampaigns),
      };
      const mockLastProcessedBlockService = {
        getOrInit: jest.fn().mockResolvedValue(mockLastProcessedBlock),
        update: jest.fn().mockResolvedValue(undefined),
      };
      const mockBlockService = {
        getBlock: jest.fn().mockResolvedValue({ timestamp: new Date(mockTimestamp * 1000) }),
      };

      const mockDeleteQueryBuilder = {
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      };

      mockEpochRewardRepository.createQueryBuilder.mockReturnValue(mockDeleteQueryBuilder);

      // Replace the actual services with mocks
      Object.defineProperty(service, 'campaignService', {
        value: mockCampaignService,
        writable: true,
      });
      Object.defineProperty(service, 'lastProcessedBlockService', {
        value: mockLastProcessedBlockService,
        writable: true,
      });
      Object.defineProperty(service, 'blockService', {
        value: mockBlockService,
        writable: true,
      });

      // Mock the private methods
      jest.spyOn(service as any, 'initializeStrategyStates').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'processBatchForAllCampaigns').mockResolvedValue(undefined);

      // Execute the update method
      await service.update(22919485, mockDeployment as any);

      // Verify that both campaigns were processed
      expect(mockCampaignService.getActiveCampaigns).toHaveBeenCalledWith(mockDeployment);
      expect(service['initializeStrategyStates']).toHaveBeenCalledTimes(2);
    });

    it('should handle no active campaigns scenario', async () => {
      const mockDeployment = {
        blockchainType: 'ethereum',
        exchangeId: 'ethereum',
        startBlock: 1000,
      };

      const mockCampaignService = {
        getActiveCampaigns: jest.fn().mockResolvedValue([]),
      };

      // Replace the actual service with mock
      Object.defineProperty(service, 'campaignService', {
        value: mockCampaignService,
        writable: true,
      });

      const loggerSpy = jest.spyOn(service['logger'], 'log').mockImplementation();

      // Execute the update method
      await service.update(22919485, mockDeployment as any);

      // Verify that appropriate log message was shown
      expect(loggerSpy).toHaveBeenCalledWith('No active campaigns found for ethereum-ethereum');
      expect(mockCampaignService.getActiveCampaigns).toHaveBeenCalledWith(mockDeployment);

      loggerSpy.mockRestore();
    });
  });

  describe('calculateEpochsInRange', () => {
    it('should create epochs that intersect with the given time range', () => {
      const mockCampaign = {
        id: '1',
        startDate: new Date('2023-01-01T00:00:00.000Z'), // Unix: 1672531200
        endDate: new Date('2023-01-02T00:00:00.000Z'), // Unix: 1672617600 (24 hours later)
        rewardAmount: '86400', // 86400 seconds = 24 hours, so 1 reward per second
      } as any;

      // Test with time range that covers the entire campaign
      const startTimestamp = 1672531200; // Campaign start
      const endTimestamp = 1672617600; // Campaign end

      const epochs = service['calculateEpochsInRange'](mockCampaign, startTimestamp, endTimestamp);

      // Should create 6 epochs (24 hours / 4 hours per epoch)
      expect(epochs).toHaveLength(6);

      // Check first epoch
      expect(epochs[0].epochNumber).toBe(1);
      expect(epochs[0].startTimestamp).toEqual(new Date(1672531200 * 1000));
      expect(epochs[0].endTimestamp).toEqual(new Date(1672545600 * 1000)); // +4 hours

      // Check last epoch
      expect(epochs[5].epochNumber).toBe(6);
      expect(epochs[5].startTimestamp).toEqual(new Date(1672603200 * 1000));
      expect(epochs[5].endTimestamp).toEqual(new Date(1672617600 * 1000)); // Campaign end

      // Check that all epochs have valid durations
      epochs.forEach((epoch) => {
        const duration =
          Math.floor(epoch.endTimestamp.getTime() / 1000) - Math.floor(epoch.startTimestamp.getTime() / 1000);
        expect(duration).toBeGreaterThan(0);
        expect(duration).toBeLessThanOrEqual(4 * 60 * 60); // Max 4 hours
      });
    });

    it('should return empty array when time range does not intersect campaign', () => {
      const mockCampaign = {
        id: '1',
        startDate: new Date('2023-01-01T00:00:00.000Z'), // Unix: 1672531200
        endDate: new Date('2023-01-02T00:00:00.000Z'), // Unix: 1672617600
        rewardAmount: '86400',
      } as any;

      // Time range before campaign starts
      const startTimestamp = 1672444800; // Day before campaign
      const endTimestamp = 1672531199; // Just before campaign starts

      const epochs = service['calculateEpochsInRange'](mockCampaign, startTimestamp, endTimestamp);

      expect(epochs).toHaveLength(0);
    });

    it('should return partial epochs when time range partially intersects campaign', () => {
      const mockCampaign = {
        id: '1',
        startDate: new Date('2023-01-01T00:00:00.000Z'), // Unix: 1672531200
        endDate: new Date('2023-01-02T00:00:00.000Z'), // Unix: 1672617600
        rewardAmount: '86400',
      } as any;

      // Time range covers only first 8 hours of campaign
      const startTimestamp = 1672531200; // Campaign start
      const endTimestamp = 1672560000; // +8 hours

      const epochs = service['calculateEpochsInRange'](mockCampaign, startTimestamp, endTimestamp);

      // Should create 2 epochs (8 hours / 4 hours per epoch)
      expect(epochs).toHaveLength(2);

      // Check first epoch
      expect(epochs[0].epochNumber).toBe(1);
      expect(epochs[0].startTimestamp).toEqual(new Date(1672531200 * 1000));
      expect(epochs[0].endTimestamp).toEqual(new Date(1672545600 * 1000)); // +4 hours

      // Check second epoch
      expect(epochs[1].epochNumber).toBe(2);
      expect(epochs[1].startTimestamp).toEqual(new Date(1672545600 * 1000));
      expect(epochs[1].endTimestamp).toEqual(new Date(1672560000 * 1000)); // +4 hours
    });

    it('should handle campaigns shorter than epoch duration', () => {
      const mockCampaign = {
        id: '1',
        startDate: new Date('2023-01-01T00:00:00.000Z'), // Unix: 1672531200
        endDate: new Date('2023-01-01T02:00:00.000Z'), // Unix: 1672538400 (2 hours later)
        rewardAmount: '7200', // 2 hours in seconds
      } as any;

      const startTimestamp = 1672531200; // Campaign start
      const endTimestamp = 1672538400; // Campaign end

      const epochs = service['calculateEpochsInRange'](mockCampaign, startTimestamp, endTimestamp);

      // Should create 1 epoch (2 hours < 4 hours epoch duration)
      expect(epochs).toHaveLength(1);

      expect(epochs[0].epochNumber).toBe(1);
      expect(epochs[0].startTimestamp).toEqual(new Date(1672531200 * 1000));
      expect(epochs[0].endTimestamp).toEqual(new Date(1672538400 * 1000)); // Campaign end

      // Check reward calculation for short campaign
      const epochDuration =
        Math.floor(epochs[0].endTimestamp.getTime() / 1000) - Math.floor(epochs[0].startTimestamp.getTime() / 1000);
      expect(epochDuration).toBe(7200); // 2 hours
    });

    it('should correctly calculate rewards per epoch', () => {
      const mockCampaign = {
        id: '1',
        startDate: new Date('2023-01-01T00:00:00.000Z'), // Unix: 1672531200
        endDate: new Date('2023-01-01T08:00:00.000Z'), // Unix: 1672560000 (8 hours later)
        rewardAmount: '1000', // Total rewards
      } as any;

      const startTimestamp = 1672531200; // Campaign start
      const endTimestamp = 1672560000; // Campaign end

      const epochs = service['calculateEpochsInRange'](mockCampaign, startTimestamp, endTimestamp);

      // Should create 2 epochs (8 hours / 4 hours per epoch)
      expect(epochs).toHaveLength(2);

      // Total campaign duration: 8 hours = 28800 seconds
      // Rewards per second: 1000 / 28800 = 0.034722...
      // Each epoch: 4 hours = 14400 seconds
      // Rewards per epoch: 0.034722... * 14400 = 500

      epochs.forEach((epoch) => {
        expect(epoch.totalRewards.toString()).toBe('500');
      });

      // Verify total rewards add up
      const totalRewards = epochs.reduce((sum, epoch) => sum.add(epoch.totalRewards), new Decimal(0));
      expect(totalRewards.toString()).toBe('1000');
    });

    it("should handle batch time ranges that don't align with epoch boundaries", () => {
      const mockCampaign = {
        id: '1',
        startDate: new Date('2023-01-01T00:00:00.000Z'), // Unix: 1672531200
        endDate: new Date('2023-01-02T00:00:00.000Z'), // Unix: 1672617600
        rewardAmount: '86400',
      } as any;

      // Time range starts 2 hours into campaign, ends 6 hours in
      const startTimestamp = 1672538400; // +2 hours from campaign start
      const endTimestamp = 1672552800; // +6 hours from campaign start

      const epochs = service['calculateEpochsInRange'](mockCampaign, startTimestamp, endTimestamp);

      // Should create 2 epochs (first epoch 0-4 hours and second epoch 4-8 hours both intersect with 2-6 hours)
      expect(epochs).toHaveLength(2);

      expect(epochs[0].epochNumber).toBe(1);
      expect(epochs[0].startTimestamp).toEqual(new Date(1672531200 * 1000)); // Campaign start
      expect(epochs[0].endTimestamp).toEqual(new Date(1672545600 * 1000)); // +4 hours from campaign start

      expect(epochs[1].epochNumber).toBe(2);
      expect(epochs[1].startTimestamp).toEqual(new Date(1672545600 * 1000)); // +4 hours from campaign start
      expect(epochs[1].endTimestamp).toEqual(new Date(1672560000 * 1000)); // +8 hours from campaign start
    });
  });
});
