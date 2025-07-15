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
import { ExchangeId } from '../../deployment/deployment.service';
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
      pair: {
        id: 1,
        token0: { address: '0xtoken0' },
        token1: { address: '0xtoken1' },
      },
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
          andWhere: jest.fn().mockReturnThis(),
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
          andWhere: jest.fn().mockReturnThis(),
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
          andWhere: jest.fn().mockReturnThis(),
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
          andWhere: jest.fn().mockReturnThis(),
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
          andWhere: jest.fn().mockReturnThis(),
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
        andWhere: jest.fn().mockReturnThis(),
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
        andWhere: jest.fn().mockReturnThis(),
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

  describe('Token Weighting System', () => {
    // Test data with generic weightings
    const TEST_WEIGHTINGS = {
      HIGH_WEIGHT: 2.0,
      MEDIUM_WEIGHT: 1.25,
      NORMAL_WEIGHT: 1.0,
      LOW_WEIGHT: 0.5,
      MINIMAL_WEIGHT: 0.25,
      NO_WEIGHT: 0,
    };

    const mockExchangeId = ExchangeId.OGEthereum;
    const mockCampaign = {
      id: '1',
      blockchainType: 'ethereum',
      exchangeId: mockExchangeId,
      pairId: 1,
      rewardAmount: '1000',
      rewardTokenAddress: '0x1234567890123456789012345678901234567890',
      startDate: new Date('2022-01-01T00:00:00.000Z'),
      endDate: new Date('2022-01-02T00:00:00.000Z'),
      opportunityName: 'Test Campaign',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      pair: {
        token0: { address: '0xtoken0' },
        token1: { address: '0xtoken1' },
      },
    } as any;

    beforeEach(() => {
      // Mock the getTokenWeighting method for testing
      jest
        .spyOn(service as any, 'getTokenWeighting')
        .mockImplementation((tokenAddress: string, exchangeId: ExchangeId) => {
          if (exchangeId !== mockExchangeId) return 0;

          const normalizedAddress = tokenAddress.toLowerCase();
          const weightings = {
            token_high: TEST_WEIGHTINGS.HIGH_WEIGHT,
            token_medium: TEST_WEIGHTINGS.MEDIUM_WEIGHT,
            token_normal: TEST_WEIGHTINGS.NORMAL_WEIGHT,
            token_low: TEST_WEIGHTINGS.LOW_WEIGHT,
            token_minimal: TEST_WEIGHTINGS.MINIMAL_WEIGHT,
            token_zero: TEST_WEIGHTINGS.NO_WEIGHT,
          };

          if (weightings[normalizedAddress] !== undefined) {
            return weightings[normalizedAddress];
          }
          if (normalizedAddress === 'token_whitelisted') {
            return 0.5;
          }
          return 0;
        });
    });

    describe('getTokenWeighting', () => {
      it('should return specific weighting for configured tokens', () => {
        expect(service['getTokenWeighting']('token_high', mockExchangeId)).toBe(TEST_WEIGHTINGS.HIGH_WEIGHT);
        expect(service['getTokenWeighting']('token_medium', mockExchangeId)).toBe(TEST_WEIGHTINGS.MEDIUM_WEIGHT);
        expect(service['getTokenWeighting']('token_normal', mockExchangeId)).toBe(TEST_WEIGHTINGS.NORMAL_WEIGHT);
        expect(service['getTokenWeighting']('token_low', mockExchangeId)).toBe(TEST_WEIGHTINGS.LOW_WEIGHT);
        expect(service['getTokenWeighting']('token_minimal', mockExchangeId)).toBe(TEST_WEIGHTINGS.MINIMAL_WEIGHT);
        expect(service['getTokenWeighting']('token_zero', mockExchangeId)).toBe(TEST_WEIGHTINGS.NO_WEIGHT);
      });

      it('should return 0.5 for whitelisted assets', () => {
        expect(service['getTokenWeighting']('token_whitelisted', mockExchangeId)).toBe(0.5);
      });

      it('should return default weighting for unlisted tokens', () => {
        expect(service['getTokenWeighting']('token_unlisted', mockExchangeId)).toBe(0);
      });

      it('should handle case insensitive addresses', () => {
        expect(service['getTokenWeighting']('TOKEN_HIGH', mockExchangeId)).toBe(TEST_WEIGHTINGS.HIGH_WEIGHT);
        expect(service['getTokenWeighting']('Token_Normal', mockExchangeId)).toBe(TEST_WEIGHTINGS.NORMAL_WEIGHT);
      });

      it('should return 0 for unknown exchangeId', () => {
        expect(service['getTokenWeighting']('token_high', ExchangeId.OGSei)).toBe(0);
      });
    });

    describe('calculateSnapshotRewards with weightings', () => {
      function createMockSnapshot(
        strategies: Array<{
          strategyId: string;
          token0: string;
          token1: string;
          liquidity: string;
          liquidity0?: string;
          liquidity1?: string;
        }>,
      ) {
        const mockStrategies = new Map();

        strategies.forEach(({ strategyId, token0, token1, liquidity, liquidity0, liquidity1 }) => {
          mockStrategies.set(strategyId, {
            strategyId,
            pairId: 1,
            currentOwner: 'owner1',
            liquidity0: new Decimal(liquidity0 || liquidity),
            liquidity1: new Decimal(liquidity1 || liquidity),
            order0_z: new Decimal(liquidity0 || liquidity),
            order0_A: new Decimal(1),
            order0_B: new Decimal(2000),
            order1_z: new Decimal(liquidity1 || liquidity),
            order1_A: new Decimal(1),
            order1_B: new Decimal(2000),
            isDeleted: false,
            token0Address: token0.toLowerCase(),
            token1Address: token1.toLowerCase(),
            token0Decimals: 18,
            token1Decimals: 18,
          });
        });

        return {
          timestamp: Date.now(),
          strategies: mockStrategies,
          targetPrice: new Decimal(1500),
          targetSqrtPriceScaled: new Decimal(1500),
          invTargetSqrtPriceScaled: new Decimal(1500),
        };
      }

      it('should distribute rewards proportionally to weightings', () => {
        const mockSnapshot = createMockSnapshot([
          { strategyId: 'strategy1', token0: 'token_high', token1: 'token_normal', liquidity: '1000' },
          { strategyId: 'strategy2', token0: 'token_low', token1: 'token_normal', liquidity: '1000' },
        ]);

        const rewards = service['calculateSnapshotRewards'](mockSnapshot, new Decimal(100), mockCampaign);

        expect(rewards.has('strategy1')).toBe(true);
        expect(rewards.has('strategy2')).toBe(true);

        // Strategy1 should get more rewards due to higher weighting on token0
        expect(rewards.get('strategy1')?.gt(rewards.get('strategy2') || new Decimal(0))).toBe(true);
      });

      it('should exclude strategies with zero-weighted tokens', () => {
        const mockSnapshot = createMockSnapshot([
          { strategyId: 'strategy1', token0: 'token_normal', token1: 'token_normal', liquidity: '1000' },
          { strategyId: 'strategy2', token0: 'token_zero', token1: 'token_normal', liquidity: '1000' },
        ]);

        const rewards = service['calculateSnapshotRewards'](mockSnapshot, new Decimal(100), mockCampaign);

        expect(rewards.has('strategy1')).toBe(true);
        // Strategy2 should still get rewards for token1 (normal weighting)
        expect(rewards.has('strategy2')).toBe(true);
        // But strategy1 should get more total rewards (both orders vs one order)
        expect(rewards.get('strategy1')?.gt(rewards.get('strategy2') || new Decimal(0))).toBe(true);
      });

      it('should handle mixed weighting pairs correctly', () => {
        const mockSnapshot = createMockSnapshot([
          { strategyId: 'strategy1', token0: 'token_high', token1: 'token_zero', liquidity: '1000' },
        ]);

        const rewards = service['calculateSnapshotRewards'](mockSnapshot, new Decimal(100), mockCampaign);

        // Should get rewards for the high-weighted token order only
        expect(rewards.get('strategy1')?.gt(0)).toBe(true);
        expect(rewards.get('strategy1')?.lte(new Decimal(50))).toBe(true); // At most half pool (since only one side has eligible liquidity)
      });

      it('should return empty rewards when no eligible weighted liquidity', () => {
        const mockSnapshot = createMockSnapshot([
          { strategyId: 'strategy1', token0: 'token_zero', token1: 'token_zero', liquidity: '1000' },
        ]);

        const rewards = service['calculateSnapshotRewards'](mockSnapshot, new Decimal(100), mockCampaign);

        expect(rewards.size).toBe(0);
      });

      it('should handle precision with very small weightings', () => {
        const mockSnapshot = createMockSnapshot([
          {
            strategyId: 'strategy1',
            token0: 'token_minimal',
            token1: 'token_minimal',
            liquidity: '1000000000000000000',
          },
        ]);

        const rewards = service['calculateSnapshotRewards'](mockSnapshot, new Decimal(100), mockCampaign);

        expect(rewards.get('strategy1')?.gt(0)).toBe(true);
        expect(rewards.get('strategy1')?.toString()).toMatch(/^\d+(\.\d+)?$/); // Valid decimal
      });

      it('should distribute rewards correctly with asymmetric weightings', () => {
        const mockSnapshot = createMockSnapshot([
          { strategyId: 'strategy1', token0: 'token_high', token1: 'token_low', liquidity: '1000' },
          { strategyId: 'strategy2', token0: 'token_low', token1: 'token_high', liquidity: '1000' },
        ]);

        const rewards = service['calculateSnapshotRewards'](mockSnapshot, new Decimal(100), mockCampaign);

        // Both strategies should get rewards but distribution depends on which side has more weight
        expect(rewards.get('strategy1')?.gt(0)).toBe(true);
        expect(rewards.get('strategy2')?.gt(0)).toBe(true);
      });

      it('should handle edge case with only one side having eligible liquidity', () => {
        const mockSnapshot = createMockSnapshot([
          {
            strategyId: 'strategy1',
            token0: 'token_high',
            token1: 'token_zero',
            liquidity: '1000',
            liquidity0: '1000',
            liquidity1: '0',
          },
        ]);

        const rewards = service['calculateSnapshotRewards'](mockSnapshot, new Decimal(100), mockCampaign);

        expect(rewards.get('strategy1')?.gt(0)).toBe(true);
        expect(rewards.get('strategy1')?.lte(new Decimal(50))).toBe(true); // Max half of pool
      });

      it('should handle token ordering independence', () => {
        // Test with tokens in different positions
        const scenario1 = createMockSnapshot([
          { strategyId: 'strategy1', token0: 'token_high', token1: 'token_low', liquidity: '1000' },
        ]);

        const scenario2 = createMockSnapshot([
          { strategyId: 'strategy2', token0: 'token_low', token1: 'token_high', liquidity: '1000' },
        ]);

        const rewards1 = service['calculateSnapshotRewards'](scenario1, new Decimal(100), mockCampaign);
        const rewards2 = service['calculateSnapshotRewards'](scenario2, new Decimal(100), mockCampaign);

        // Both scenarios should produce similar total rewards since weightings are applied per order
        expect(rewards1.get('strategy1')?.gt(0)).toBe(true);
        expect(rewards2.get('strategy2')?.gt(0)).toBe(true);
      });

      it('should handle lexicographically unsorted strategy tokens correctly', () => {
        // Update the mock to include the additional tokens
        const originalMock = (service as any).getTokenWeighting;
        (service as any).getTokenWeighting = jest.fn((tokenAddress: string, exchangeId: ExchangeId) => {
          if (exchangeId !== mockExchangeId) return 0;

          const normalizedAddress = tokenAddress.toLowerCase();
          const weightings = {
            token_high: TEST_WEIGHTINGS.HIGH_WEIGHT,
            token_medium: TEST_WEIGHTINGS.MEDIUM_WEIGHT,
            token_normal: TEST_WEIGHTINGS.NORMAL_WEIGHT,
            token_low: TEST_WEIGHTINGS.LOW_WEIGHT,
            token_minimal: TEST_WEIGHTINGS.MINIMAL_WEIGHT,
            token_zero: TEST_WEIGHTINGS.NO_WEIGHT,
            token_z_high: TEST_WEIGHTINGS.HIGH_WEIGHT,
            token_a_low: TEST_WEIGHTINGS.LOW_WEIGHT,
          };

          if (weightings[normalizedAddress] !== undefined) {
            return weightings[normalizedAddress];
          }
          if (normalizedAddress === 'token_whitelisted') {
            return 0.5;
          }
          return 0;
        });

        const mockSnapshot = createMockSnapshot([
          { strategyId: 'strategy1', token0: 'token_z_high', token1: 'token_a_low', liquidity: '1000' },
        ]);

        const rewards = service['calculateSnapshotRewards'](mockSnapshot, new Decimal(100), mockCampaign);
        expect(rewards.get('strategy1')?.gt(0)).toBe(true);
      });

      it('should handle identical tokens in both orders', () => {
        const mockSnapshot = createMockSnapshot([
          { strategyId: 'strategy1', token0: 'token_high', token1: 'token_high', liquidity: '1000' },
        ]);

        const rewards = service['calculateSnapshotRewards'](mockSnapshot, new Decimal(100), mockCampaign);

        // Should get rewards for both orders with same weighting
        expect(rewards.get('strategy1')?.gt(0)).toBe(true);
      });

      it('should handle multiple strategies with different token arrangements', () => {
        const mockSnapshot = createMockSnapshot([
          { strategyId: 'strategy1', token0: 'token_high', token1: 'token_normal', liquidity: '1000' },
          { strategyId: 'strategy2', token0: 'token_normal', token1: 'token_high', liquidity: '1000' },
          { strategyId: 'strategy3', token0: 'token_low', token1: 'token_low', liquidity: '1000' },
        ]);

        const rewards = service['calculateSnapshotRewards'](mockSnapshot, new Decimal(100), mockCampaign);

        // All strategies should get some rewards
        expect(rewards.get('strategy1')?.gt(0)).toBe(true);
        expect(rewards.get('strategy2')?.gt(0)).toBe(true);
        expect(rewards.get('strategy3')?.gt(0)).toBe(true);

        // Strategy3 should get least rewards due to low weightings
        expect(rewards.get('strategy3')?.lt(rewards.get('strategy1') || new Decimal(0))).toBe(true);
        expect(rewards.get('strategy3')?.lt(rewards.get('strategy2') || new Decimal(0))).toBe(true);
      });
    });

    describe('edge cases and error handling', () => {
      it('should handle missing weighting configuration gracefully', () => {
        const unknownExchangeId = ExchangeId.OGSei; // Valid ExchangeId without weighting config
        expect(service['getTokenWeighting']('token_high', unknownExchangeId)).toBe(0);
      });

      it('should return zero weighting for zero-weighted tokens', () => {
        // Restore the original method for this test
        (service as any).getTokenWeighting.mockRestore();

        // Set up the actual token weighting configuration
        (service as any).DEPLOYMENT_TOKEN_WEIGHTINGS = {
          [mockExchangeId]: {
            tokenWeightings: {
              token_zero: 0,
            },
            whitelistedAssets: [],
            defaultWeighting: 0,
          },
        };

        const result = service['getTokenWeighting']('token_zero', mockExchangeId);
        expect(result).toBe(0);
      });

      it('should handle empty strategy map', () => {
        const emptySnapshot = {
          timestamp: Date.now(),
          strategies: new Map(),
          targetPrice: new Decimal(1500),
          targetSqrtPriceScaled: new Decimal(1500),
          invTargetSqrtPriceScaled: new Decimal(1500),
        };

        const rewards = service['calculateSnapshotRewards'](emptySnapshot, new Decimal(100), mockCampaign);
        expect(rewards.size).toBe(0);
      });

      it('should handle deleted strategies', () => {
        const mockSnapshot = {
          timestamp: Date.now(),
          strategies: new Map([
            [
              'strategy1',
              {
                strategyId: 'strategy1',
                isDeleted: true,
                liquidity0: new Decimal(1000),
                liquidity1: new Decimal(1000),
                token0Address: 'token_high',
                token1Address: 'token_normal',
              },
            ],
          ]),
          targetPrice: new Decimal(1500),
          targetSqrtPriceScaled: new Decimal(1500),
          invTargetSqrtPriceScaled: new Decimal(1500),
        };

        const rewards = service['calculateSnapshotRewards'](mockSnapshot as any, new Decimal(100), mockCampaign);
        expect(rewards.size).toBe(0);
      });
    });
  });

  describe('Comprehensive Token Weighting Tests', () => {
    const mockCampaign = {
      id: '1',
      blockchainType: 'ethereum',
      exchangeId: ExchangeId.OGEthereum,
      pairId: 1,
      rewardAmount: '1000',
      rewardTokenAddress: '0x1234567890123456789012345678901234567890',
      startDate: new Date('2022-01-01T00:00:00.000Z'),
      endDate: new Date('2022-01-02T00:00:00.000Z'),
      opportunityName: 'Test Campaign',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      pair: {
        token0: { address: '0xtoken0' },
        token1: { address: '0xtoken1' },
      },
    } as any;

    beforeEach(() => {
      // Set up mock weightings similar to production
      const mockWeightings = {
        [ExchangeId.OGEthereum]: {
          tokenWeightings: {
            // USDT: 2x
            '0xdac17f958d2ee523a2206206994597c13d831ec7': 2.0,
            // WETH: 1.25x
            '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 1.25,
            // WBTC: 1.25x
            '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 1.25,
            // LST tokens: 1.25x
            '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': 1.25, // stETH
            '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0': 1.25, // wstETH
            // TAC tokens: 0.75x (placeholder addresses)
            '0x1111111111111111111111111111111111111111': 0.75,
            '0x2222222222222222222222222222222222222222': 0.75,
            // TON tokens: 0.5x (placeholder addresses)
            '0x3333333333333333333333333333333333333333': 0.5,
            // Zero weight tokens
            '0x0000000000000000000000000000000000000000': 0,
          },
          whitelistedAssets: [
            '0x4444444444444444444444444444444444444444', // Some whitelisted token
          ],
          defaultWeighting: 0, // No incentives for unlisted tokens
        },
      };

      // Mock the private property directly
      (service as any).DEPLOYMENT_TOKEN_WEIGHTINGS = mockWeightings;
    });

    describe('getTokenWeighting', () => {
      it('should return correct weightings for USDT (2x)', () => {
        const usdtAddress = '0xdac17f958d2ee523a2206206994597c13d831ec7';
        expect(service['getTokenWeighting'](usdtAddress, ExchangeId.OGEthereum)).toBe(2.0);
      });

      it('should return correct weightings for WETH (1.25x)', () => {
        const wethAddress = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
        expect(service['getTokenWeighting'](wethAddress, ExchangeId.OGEthereum)).toBe(1.25);
      });

      it('should return correct weightings for WBTC (1.25x)', () => {
        const wbtcAddress = '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599';
        expect(service['getTokenWeighting'](wbtcAddress, ExchangeId.OGEthereum)).toBe(1.25);
      });

      it('should return correct weightings for LST tokens (1.25x)', () => {
        const stethAddress = '0xae7ab96520de3a18e5e111b5eaab095312d7fe84';
        const wstethAddress = '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0';
        expect(service['getTokenWeighting'](stethAddress, ExchangeId.OGEthereum)).toBe(1.25);
        expect(service['getTokenWeighting'](wstethAddress, ExchangeId.OGEthereum)).toBe(1.25);
      });

      it('should return correct weightings for TAC tokens (0.75x)', () => {
        const tacAddress = '0x1111111111111111111111111111111111111111';
        expect(service['getTokenWeighting'](tacAddress, ExchangeId.OGEthereum)).toBe(0.75);
      });

      it('should return correct weightings for TON tokens (0.5x)', () => {
        const tonAddress = '0x3333333333333333333333333333333333333333';
        expect(service['getTokenWeighting'](tonAddress, ExchangeId.OGEthereum)).toBe(0.5);
      });

      it('should return 0.5 for whitelisted assets', () => {
        const whitelistedAddress = '0x4444444444444444444444444444444444444444';
        expect(service['getTokenWeighting'](whitelistedAddress, ExchangeId.OGEthereum)).toBe(0.5);
      });

      it('should return 0 for unlisted tokens (no incentives)', () => {
        const unlistedAddress = '0x9999999999999999999999999999999999999999';
        expect(service['getTokenWeighting'](unlistedAddress, ExchangeId.OGEthereum)).toBe(0);
      });

      it('should return 0 for zero-weight tokens', () => {
        const zeroWeightAddress = '0x0000000000000000000000000000000000000000';
        expect(service['getTokenWeighting'](zeroWeightAddress, ExchangeId.OGEthereum)).toBe(0);
      });

      it('should handle case insensitive addresses', () => {
        const usdtLower = '0xdac17f958d2ee523a2206206994597c13d831ec7';
        const usdtUpper = '0xDAC17F958D2EE523A2206206994597C13D831EC7';
        const usdtMixed = '0xDaC17F958d2eE523a2206206994597c13d831eC7';

        expect(service['getTokenWeighting'](usdtLower, ExchangeId.OGEthereum)).toBe(2.0);
        expect(service['getTokenWeighting'](usdtUpper, ExchangeId.OGEthereum)).toBe(2.0);
        expect(service['getTokenWeighting'](usdtMixed, ExchangeId.OGEthereum)).toBe(2.0);
      });

      it('should return 0 for unknown exchange IDs', () => {
        const usdtAddress = '0xdac17f958d2ee523a2206206994597c13d831ec7';
        expect(service['getTokenWeighting'](usdtAddress, ExchangeId.OGSei)).toBe(0);
      });

      it('should handle all different weighting tiers', () => {
        const weightings = [
          { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', expected: 2.0 }, // USDT
          { address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', expected: 1.25 }, // WETH
          { address: '0x1111111111111111111111111111111111111111', expected: 0.75 }, // TAC
          { address: '0x3333333333333333333333333333333333333333', expected: 0.5 }, // TON
          { address: '0x4444444444444444444444444444444444444444', expected: 0.5 }, // Whitelisted
          { address: '0x0000000000000000000000000000000000000000', expected: 0 }, // Zero weight
          { address: '0x9999999999999999999999999999999999999999', expected: 0 }, // Unlisted
        ];

        weightings.forEach(({ address, expected }) => {
          expect(service['getTokenWeighting'](address, ExchangeId.OGEthereum)).toBe(expected);
        });
      });
    });

    describe('calculateSnapshotRewards with real token weightings', () => {
      function createRealTokenSnapshot(
        strategies: Array<{
          strategyId: string;
          token0Address: string;
          token1Address: string;
          liquidity0: string;
          liquidity1: string;
        }>,
      ) {
        const mockStrategies = new Map();

        strategies.forEach(({ strategyId, token0Address, token1Address, liquidity0, liquidity1 }) => {
          mockStrategies.set(strategyId, {
            strategyId,
            pairId: 1,
            currentOwner: 'owner1',
            liquidity0: new Decimal(liquidity0),
            liquidity1: new Decimal(liquidity1),
            order0_z: new Decimal(liquidity0),
            order0_A: new Decimal(1000),
            order0_B: new Decimal(1000),
            order1_z: new Decimal(liquidity1),
            order1_A: new Decimal(1000),
            order1_B: new Decimal(1000),
            isDeleted: false,
            token0Address: token0Address.toLowerCase(),
            token1Address: token1Address.toLowerCase(),
            token0Decimals: 18,
            token1Decimals: 18,
          });
        });

        return {
          timestamp: Date.now(),
          strategies: mockStrategies,
          targetPrice: new Decimal(1500),
          targetSqrtPriceScaled: new Decimal(1500),
          invTargetSqrtPriceScaled: new Decimal(1500),
        };
      }

      it('should correctly apply different token weightings in real scenarios', () => {
        const mockSnapshot = createRealTokenSnapshot([
          {
            strategyId: 'usdt_weth',
            token0Address: '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT (2x)
            token1Address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH (1.25x)
            liquidity0: '1000',
            liquidity1: '1000',
          },
          {
            strategyId: 'wbtc_weth',
            token0Address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', // WBTC (1.25x)
            token1Address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH (1.25x)
            liquidity0: '1000',
            liquidity1: '1000',
          },
          {
            strategyId: 'tac_ton',
            token0Address: '0x1111111111111111111111111111111111111111', // TAC (0.75x)
            token1Address: '0x3333333333333333333333333333333333333333', // TON (0.5x)
            liquidity0: '1000',
            liquidity1: '1000',
          },
        ]);

        const rewards = service['calculateSnapshotRewards'](mockSnapshot as any, new Decimal(100), mockCampaign);

        expect(rewards.size).toBe(3);
        expect(rewards.has('usdt_weth')).toBe(true);
        expect(rewards.has('wbtc_weth')).toBe(true);
        expect(rewards.has('tac_ton')).toBe(true);

        const usdtWethReward = rewards.get('usdt_weth');
        const wbtcWethReward = rewards.get('wbtc_weth');
        const tacTonReward = rewards.get('tac_ton');

        // USDT_WETH should have highest rewards due to USDT's 2x weighting
        // WBTC_WETH should have moderate rewards (both tokens 1.25x)
        // TAC_TON should have lowest rewards (0.75x and 0.5x tokens)
        expect(usdtWethReward.gt(wbtcWethReward)).toBe(true);
        expect(wbtcWethReward.gt(tacTonReward)).toBe(true);
      });

      it('should exclude strategies with no-incentive tokens', () => {
        const mockSnapshot = createRealTokenSnapshot([
          {
            strategyId: 'usdt_weth',
            token0Address: '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT (2x)
            token1Address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH (1.25x)
            liquidity0: '1000',
            liquidity1: '1000',
          },
          {
            strategyId: 'unlisted_weth',
            token0Address: '0x9999999999999999999999999999999999999999', // Unlisted (0x)
            token1Address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH (1.25x)
            liquidity0: '1000',
            liquidity1: '1000',
          },
          {
            strategyId: 'zero_weight',
            token0Address: '0x0000000000000000000000000000000000000000', // Zero weight
            token1Address: '0x1111111111111111111111111111111111111111', // TAC (0.75x)
            liquidity0: '1000',
            liquidity1: '1000',
          },
        ]);

        const rewards = service['calculateSnapshotRewards'](mockSnapshot as any, new Decimal(100), mockCampaign);

        // All strategies should receive rewards (from the sides with positive weighting)
        expect(rewards.size).toBe(3);
        expect(rewards.has('usdt_weth')).toBe(true);
        expect(rewards.has('unlisted_weth')).toBe(true); // Gets rewards from WETH side
        expect(rewards.has('zero_weight')).toBe(true); // Gets rewards from TAC side

        // USDT_WETH should have highest rewards due to both tokens having positive weighting
        const usdtWethReward = rewards.get('usdt_weth');
        const unlistedWethReward = rewards.get('unlisted_weth');
        const zeroWeightReward = rewards.get('zero_weight');

        expect(usdtWethReward.gt(unlistedWethReward)).toBe(true);
        expect(usdtWethReward.gt(zeroWeightReward)).toBe(true);
      });

      it('should handle whitelisted assets correctly', () => {
        const mockSnapshot = createRealTokenSnapshot([
          {
            strategyId: 'whitelisted_weth',
            token0Address: '0x4444444444444444444444444444444444444444', // Whitelisted (0.5x)
            token1Address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH (1.25x)
            liquidity0: '1000',
            liquidity1: '1000',
          },
          {
            strategyId: 'ton_weth',
            token0Address: '0x3333333333333333333333333333333333333333', // TON (0.5x)
            token1Address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH (1.25x)
            liquidity0: '1000',
            liquidity1: '1000',
          },
        ]);

        const rewards = service['calculateSnapshotRewards'](mockSnapshot as any, new Decimal(100), mockCampaign);

        expect(rewards.size).toBe(2);
        expect(rewards.has('whitelisted_weth')).toBe(true);
        expect(rewards.has('ton_weth')).toBe(true);

        // Both should have similar rewards since both have 0.5x weighting on one token
        const whitelistedReward = rewards.get('whitelisted_weth');
        const tonReward = rewards.get('ton_weth');
        expect(whitelistedReward.toString()).toBe(tonReward.toString());
      });
    });
  });

  describe('Reward Redistribution Tests', () => {
    const mockCampaign = {
      id: '1',
      blockchainType: 'ethereum',
      exchangeId: ExchangeId.OGEthereum,
      pairId: 1,
      rewardAmount: '1000',
      rewardTokenAddress: '0x1234567890123456789012345678901234567890',
      startDate: new Date('2022-01-01T00:00:00.000Z'),
      endDate: new Date('2022-01-02T00:00:00.000Z'),
      opportunityName: 'Test Campaign',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      pair: {
        token0: { address: '0xtoken0' },
        token1: { address: '0xtoken1' },
      },
    } as any;

    beforeEach(() => {
      // Restore the original getTokenWeighting method for these tests
      if ((service as any).getTokenWeighting.mockRestore) {
        (service as any).getTokenWeighting.mockRestore();
      }

      // Set up mock weightings for redistribution tests
      const mockWeightings = {
        [ExchangeId.OGEthereum]: {
          tokenWeightings: {
            '0xtoken_with_weight': 1.0,
            '0xtoken_zero_weight': 0,
          },
          whitelistedAssets: [],
          defaultWeighting: 0,
        },
      };

      // Mock the private property directly
      (service as any).DEPLOYMENT_TOKEN_WEIGHTINGS = mockWeightings;

      // Mock calculateEligibleLiquidity to return predictable values for all tests
      const calculateEligibleLiquiditySpy = jest.spyOn(service as any, 'calculateEligibleLiquidity');
      calculateEligibleLiquiditySpy.mockImplementation(
        (
          liquidity: Decimal,
          order_z: any,
          order_A: any,
          order_B: any,
          targetSqrtPriceScaled: any,
          toleranceFactor: any,
        ) => {
          // Return positive liquidity for strategies with positive liquidity
          if (liquidity.gt(0)) {
            return liquidity; // Return the full liquidity as eligible
          }
          return new Decimal(0);
        },
      );
    });

    function createMockStrategyStates(
      strategies: Array<{
        strategyId: string;
        token0Address: string;
        token1Address: string;
        liquidity0: string;
        liquidity1: string;
        owner: string;
        deleteAtTimestamp?: number;
      }>,
    ) {
      const strategyStates = new Map();

      strategies.forEach(
        ({ strategyId, token0Address, token1Address, liquidity0, liquidity1, owner, deleteAtTimestamp }) => {
          strategyStates.set(strategyId, {
            strategyId,
            pairId: 1,
            token0Address: token0Address.toLowerCase(),
            token1Address: token1Address.toLowerCase(),
            token0Decimals: 18,
            token1Decimals: 18,
            liquidity0: new Decimal(liquidity0),
            liquidity1: new Decimal(liquidity1),
            order0_A: new Decimal(1),
            order0_B: new Decimal(2000),
            order0_z: new Decimal(liquidity0),
            order1_A: new Decimal(1),
            order1_B: new Decimal(2000),
            order1_z: new Decimal(liquidity1),
            currentOwner: owner,
            creationWallet: owner,
            lastProcessedBlock: 100,
            isDeleted: false,
            deleteAtTimestamp: deleteAtTimestamp || Number.MAX_SAFE_INTEGER,
          });
        },
      );

      return strategyStates;
    }

    function createMockPriceCache() {
      return {
        rates: new Map([
          ['0xtoken0', 1500],
          ['0xtoken1', 1],
          ['0xtoken_with_weight', 1],
          ['0xtoken_zero_weight', 1],
        ]),
        timestamp: Date.now(),
      };
    }

    describe('calculateEpochRewards', () => {
      it('should redistribute rewards from no-liquidity snapshots to eligible snapshots', () => {
        // Mock epoch with multiple snapshots
        const mockEpoch = {
          epochNumber: 1,
          startTimestamp: new Date('2022-01-01T00:00:00.000Z'),
          endTimestamp: new Date('2022-01-01T00:15:00.000Z'), // 15 minutes = 3 snapshots
          totalRewards: new Decimal('300'), // 100 per snapshot
        };

        // Strategy states: one will have liquidity, one won't
        const strategyStates = createMockStrategyStates([
          {
            strategyId: 'strategy1',
            token0Address: '0xtoken_with_weight',
            token1Address: '0xtoken_with_weight',
            liquidity0: '1000',
            liquidity1: '1000',
            owner: 'owner1',
          },
          {
            strategyId: 'strategy2',
            token0Address: '0xtoken_zero_weight',
            token1Address: '0xtoken_zero_weight',
            liquidity0: '1000',
            liquidity1: '1000',
            owner: 'owner2',
          },
        ]);

        const priceCache = createMockPriceCache();

        const epochRewards = service['calculateEpochRewards'](mockEpoch, strategyStates, mockCampaign, priceCache);

        // Only strategy1 should receive rewards (strategy2 has zero-weight tokens)
        expect(epochRewards.size).toBe(1);
        expect(epochRewards.has('strategy1')).toBe(true);
        expect(epochRewards.has('strategy2')).toBe(false);

        // strategy1 should receive redistributed rewards from strategy2's excluded snapshots
        const strategy1Reward = epochRewards.get('strategy1');
        expect(strategy1Reward.totalReward.gt(100)).toBe(true); // Should be > 100 due to redistribution
        expect(strategy1Reward.totalReward.lte(300)).toBe(true); // Should be <= total epoch rewards
      });

      it('should handle epoch with all snapshots having no eligible liquidity', () => {
        const mockEpoch = {
          epochNumber: 1,
          startTimestamp: new Date('2022-01-01T00:00:00.000Z'),
          endTimestamp: new Date('2022-01-01T00:10:00.000Z'), // 10 minutes = 2 snapshots
          totalRewards: new Decimal('200'),
        };

        // All strategies have zero-weight tokens
        const strategyStates = createMockStrategyStates([
          {
            strategyId: 'strategy1',
            token0Address: '0xtoken_zero_weight',
            token1Address: '0xtoken_zero_weight',
            liquidity0: '1000',
            liquidity1: '1000',
            owner: 'owner1',
          },
        ]);

        const priceCache = createMockPriceCache();

        const epochRewards = service['calculateEpochRewards'](mockEpoch, strategyStates, mockCampaign, priceCache);

        // No strategies should receive rewards
        expect(epochRewards.size).toBe(0);
      });

      it('should handle mixed scenarios with partial redistribution', () => {
        const mockEpoch = {
          epochNumber: 1,
          startTimestamp: new Date('2022-01-01T00:00:00.000Z'),
          endTimestamp: new Date('2022-01-01T00:20:00.000Z'), // 20 minutes = 4 snapshots
          totalRewards: new Decimal('400'),
        };

        // Strategy with different liquidity amounts
        const strategyStates = createMockStrategyStates([
          {
            strategyId: 'strategy1',
            token0Address: '0xtoken_with_weight',
            token1Address: '0xtoken_with_weight',
            liquidity0: '2000', // Higher liquidity
            liquidity1: '2000',
            owner: 'owner1',
          },
          {
            strategyId: 'strategy2',
            token0Address: '0xtoken_with_weight',
            token1Address: '0xtoken_with_weight',
            liquidity0: '1000', // Lower liquidity
            liquidity1: '1000',
            owner: 'owner2',
          },
        ]);

        const priceCache = createMockPriceCache();

        const epochRewards = service['calculateEpochRewards'](mockEpoch, strategyStates, mockCampaign, priceCache);

        // Both strategies should receive some rewards
        expect(epochRewards.size).toBe(2);
        expect(epochRewards.has('strategy1')).toBe(true);
        expect(epochRewards.has('strategy2')).toBe(true);

        // strategy1 should receive more rewards due to higher liquidity
        const strategy1Reward = epochRewards.get('strategy1');
        const strategy2Reward = epochRewards.get('strategy2');
        expect(strategy1Reward.totalReward.gt(strategy2Reward.totalReward)).toBe(true);
      });

      it('should correctly calculate redistribution with single eligible snapshot', () => {
        const mockEpoch = {
          epochNumber: 1,
          startTimestamp: new Date('2022-01-01T00:00:00.000Z'),
          endTimestamp: new Date('2022-01-01T00:15:00.000Z'), // 15 minutes = 3 snapshots
          totalRewards: new Decimal('300'),
        };

        // Strategy with liquidity only at the end
        const strategyStates = createMockStrategyStates([
          {
            strategyId: 'strategy1',
            token0Address: '0xtoken_with_weight',
            token1Address: '0xtoken_with_weight',
            liquidity0: '0', // No liquidity initially
            liquidity1: '1000',
            owner: 'owner1',
          },
        ]);

        const priceCache = createMockPriceCache();

        const epochRewards = service['calculateEpochRewards'](mockEpoch, strategyStates, mockCampaign, priceCache);

        // Should receive rewards for eligible snapshots
        expect(epochRewards.size).toBe(1);
        expect(epochRewards.has('strategy1')).toBe(true);

        const strategy1Reward = epochRewards.get('strategy1');
        expect(strategy1Reward.totalReward.gt(0)).toBe(true);
      });

      it('should maintain reward conservation during redistribution', () => {
        const mockEpoch = {
          epochNumber: 1,
          startTimestamp: new Date('2022-01-01T00:00:00.000Z'),
          endTimestamp: new Date('2022-01-01T00:10:00.000Z'), // 10 minutes = 2 snapshots
          totalRewards: new Decimal('200'),
        };

        const strategyStates = createMockStrategyStates([
          {
            strategyId: 'strategy1',
            token0Address: '0xtoken_with_weight',
            token1Address: '0xtoken_with_weight',
            liquidity0: '1000',
            liquidity1: '1000',
            owner: 'owner1',
          },
          {
            strategyId: 'strategy2',
            token0Address: '0xtoken_with_weight',
            token1Address: '0xtoken_with_weight',
            liquidity0: '500',
            liquidity1: '500',
            owner: 'owner2',
          },
        ]);

        const priceCache = createMockPriceCache();

        const epochRewards = service['calculateEpochRewards'](mockEpoch, strategyStates, mockCampaign, priceCache);

        // Calculate total distributed rewards
        let totalDistributed = new Decimal(0);
        for (const [, reward] of epochRewards) {
          totalDistributed = totalDistributed.add(reward.totalReward);
        }

        // Total distributed should equal epoch total (within small tolerance for rounding)
        expect(totalDistributed.sub(mockEpoch.totalRewards).abs().lt(0.0001)).toBe(true);
      });

      it('should handle edge case with alternating liquidity patterns', () => {
        const mockEpoch = {
          epochNumber: 1,
          startTimestamp: new Date('2022-01-01T00:00:00.000Z'),
          endTimestamp: new Date('2022-01-01T00:25:00.000Z'), // 25 minutes = 5 snapshots
          totalRewards: new Decimal('500'),
        };

        const strategyStates = createMockStrategyStates([
          {
            strategyId: 'strategy1',
            token0Address: '0xtoken_with_weight',
            token1Address: '0xtoken_with_weight',
            liquidity0: '1000',
            liquidity1: '1000',
            owner: 'owner1',
          },
          {
            strategyId: 'strategy2',
            token0Address: '0xtoken_with_weight',
            token1Address: '0xtoken_with_weight',
            liquidity0: '1000',
            liquidity1: '1000',
            owner: 'owner2',
          },
        ]);

        const priceCache = createMockPriceCache();

        const epochRewards = service['calculateEpochRewards'](mockEpoch, strategyStates, mockCampaign, priceCache);

        // Both strategies should receive rewards
        expect(epochRewards.size).toBe(2);
        expect(epochRewards.has('strategy1')).toBe(true);
        expect(epochRewards.has('strategy2')).toBe(true);

        // Verify total conservation
        let totalDistributed = new Decimal(0);
        for (const [, reward] of epochRewards) {
          totalDistributed = totalDistributed.add(reward.totalReward);
        }
        expect(totalDistributed.sub(mockEpoch.totalRewards).abs().lt(0.0001)).toBe(true);
      });

      it('should handle zero total rewards gracefully', () => {
        const mockEpoch = {
          epochNumber: 1,
          startTimestamp: new Date('2022-01-01T00:00:00.000Z'),
          endTimestamp: new Date('2022-01-01T00:05:00.000Z'), // 5 minutes = 1 snapshot
          totalRewards: new Decimal('0'),
        };

        const strategyStates = createMockStrategyStates([
          {
            strategyId: 'strategy1',
            token0Address: '0xtoken_with_weight',
            token1Address: '0xtoken_with_weight',
            liquidity0: '1000',
            liquidity1: '1000',
            owner: 'owner1',
          },
        ]);

        const priceCache = createMockPriceCache();

        const epochRewards = service['calculateEpochRewards'](mockEpoch, strategyStates, mockCampaign, priceCache);

        // Should handle zero rewards without crashing
        expect(epochRewards.size).toBe(1);
        const strategy1Reward = epochRewards.get('strategy1');
        expect(strategy1Reward.totalReward.eq(0)).toBe(true);
      });
    });
  });
});
