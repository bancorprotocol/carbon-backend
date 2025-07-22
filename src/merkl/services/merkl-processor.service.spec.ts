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
    markProcessedCampaignsInactive: jest.fn().mockResolvedValue(undefined),
  };

  const mockLastProcessedBlockService = {
    getOrInit: jest.fn(),
    save: jest.fn(),
  };

  const mockHistoricQuoteService = {
    findByTokensAndTimestamp: jest.fn(),
    getUsdRates: jest.fn().mockResolvedValue([
      { address: '0xtoken0', day: 1672531200, usd: 1500 },
      { address: '0xtoken1', day: 1672531200, usd: 1 },
    ]),
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
    getBlocksDictionary: jest.fn().mockResolvedValue({}),
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

      describe('Exact Precision Validation (No Tolerance)', () => {
        it('should pass validation with exact campaign amount', async () => {
          // Mock existing rewards that sum to exactly match campaign amount with new rewards
          const mockQueryBuilder = {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getRawOne: jest.fn().mockResolvedValue({ total: '999.999999999999999' }),
          };

          mockEpochRewardRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

          const newRewards = new Map([
            ['strategy1', { owner: 'owner1', totalReward: new Decimal('0.000000000000001') }],
          ]);

          const result = await service['validateEpochRewardsWontExceedTotal'](mockCampaign, mockEpoch, newRewards);
          expect(result).toBe(true);
        });

        it('should reject validation when exceeding by even the smallest amount', async () => {
          // Mock existing rewards that would exceed campaign amount by the tiniest fraction
          const mockQueryBuilder = {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getRawOne: jest.fn().mockResolvedValue({ total: '999.999999999999999' }),
          };

          mockEpochRewardRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

          const newRewards = new Map([
            ['strategy1', { owner: 'owner1', totalReward: new Decimal('0.000000000000002') }], // Exceeds by 1e-15
          ]);

          const result = await service['validateEpochRewardsWontExceedTotal'](mockCampaign, mockEpoch, newRewards);
          expect(result).toBe(false);
        });

        it('should handle final epoch scenario where remaining balance might be irregular', async () => {
          // Simulate final epoch with remaining balance after precision-safe calculation
          const mockQueryBuilder = {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getRawOne: jest.fn().mockResolvedValue({ total: '999.726775956284153157' }), // Sum of first 365 epochs
          };

          mockEpochRewardRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

          // Final epoch gets exactly the remaining balance: 1000 - 999.726775956284153157 = 0.273224043715846843
          const newRewards = new Map([
            ['strategy1', { owner: 'owner1', totalReward: new Decimal('0.273224043715846843') }],
          ]);

          const result = await service['validateEpochRewardsWontExceedTotal'](mockCampaign, mockEpoch, newRewards);
          expect(result).toBe(true);
        });

        it('should reject final epoch if trying to distribute more than remaining balance', async () => {
          const mockQueryBuilder = {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getRawOne: jest.fn().mockResolvedValue({ total: '999' }), // Existing total of 999
          };

          mockEpochRewardRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

          // Try to distribute more than the remaining balance (campaign amount is 1000, so remaining should be 1)
          const newRewards = new Map([
            ['strategy1', { owner: 'owner1', totalReward: new Decimal('1.1') }], // 0.1 too much
          ]);

          const result = await service['validateEpochRewardsWontExceedTotal'](mockCampaign, mockEpoch, newRewards);
          expect(result).toBe(false);
        });

        it('should work with high-precision decimal campaigns', async () => {
          const highPrecisionCampaign = {
            ...mockCampaign,
            rewardAmount: '123.456789012345678901234567890',
          };

          const mockQueryBuilder = {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getRawOne: jest.fn().mockResolvedValue({ total: '123.456789012345678901234567889' }),
          };

          mockEpochRewardRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

          const newRewards = new Map([
            ['strategy1', { owner: 'owner1', totalReward: new Decimal('0.000000000000000000000000001') }],
          ]);

          const result = await service['validateEpochRewardsWontExceedTotal'](
            highPrecisionCampaign,
            mockEpoch,
            newRewards,
          );
          expect(result).toBe(true);
        });

        it('should ensure mathematical certainty in edge cases', async () => {
          // Test scenario where old tolerance-based approach might have failed
          const edgeCaseCampaign = {
            ...mockCampaign,
            rewardAmount: '100000', // Real scenario from user case
          };

          // Simulate accumulated rewards from 365 epochs of 273.224043715846994... tokens each
          const accumulated365Epochs = new Decimal('100000').div(366).mul(365).toString();

          const mockQueryBuilder = {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getRawOne: jest.fn().mockResolvedValue({ total: accumulated365Epochs }),
          };

          mockEpochRewardRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

          // Final epoch should get exactly the remaining amount
          const remainingBalance = new Decimal('100000').minus(accumulated365Epochs);
          const newRewards = new Map([['strategy1', { owner: 'owner1', totalReward: remainingBalance }]]);

          const result = await service['validateEpochRewardsWontExceedTotal'](edgeCaseCampaign, mockEpoch, newRewards);
          expect(result).toBe(true);

          // Verify this would fail if we tried to add a meaningful amount more
          const excessiveRewards = new Map([
            ['strategy1', { owner: 'owner1', totalReward: remainingBalance.add('0.1') }], // 0.1 tokens too much
          ]);

          const excessiveResult = await service['validateEpochRewardsWontExceedTotal'](
            edgeCaseCampaign,
            mockEpoch,
            excessiveRewards,
          );
          expect(excessiveResult).toBe(false);
        });
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
        markProcessedCampaignsInactive: jest.fn().mockResolvedValue(undefined),
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
        markProcessedCampaignsInactive: jest.fn().mockResolvedValue(undefined),
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
        markProcessedCampaignsInactive: jest.fn().mockResolvedValue(undefined),
      };

      const mockLastProcessedBlockService = {
        getOrInit: jest.fn().mockResolvedValue(17087000),
        update: jest.fn().mockResolvedValue(undefined),
      };

      // Replace the actual services with mocks
      Object.defineProperty(service, 'campaignService', {
        value: mockCampaignService,
        writable: true,
      });
      Object.defineProperty(service, 'lastProcessedBlockService', {
        value: mockLastProcessedBlockService,
        writable: true,
      });

      const loggerSpy = jest.spyOn(service['logger'], 'log').mockImplementation();

      const endBlock = 22919485;

      // Execute the update method
      await service.update(endBlock, mockDeployment as any);

      // Verify that appropriate log message was shown
      expect(loggerSpy).toHaveBeenCalledWith('No active campaigns found for ethereum-ethereum');
      expect(mockCampaignService.getActiveCampaigns).toHaveBeenCalledWith(mockDeployment);

      // Verify that lastProcessedBlock is updated even when no campaigns exist
      expect(mockLastProcessedBlockService.getOrInit).toHaveBeenCalledWith(
        'ethereum-ethereum-merkl-global',
        mockDeployment.startBlock,
      );
      expect(mockLastProcessedBlockService.update).toHaveBeenCalledWith('ethereum-ethereum-merkl-global', endBlock);

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

    describe('Mathematical Precision Guarantees', () => {
      it('should ensure total epoch rewards do not exceed campaign amount', () => {
        const mockCampaign = {
          id: '1',
          startDate: new Date('2023-01-01T00:00:00.000Z'), // Unix: 1672531200
          endDate: new Date('2023-01-03T00:00:00.000Z'), // Unix: 1672704000 (48 hours later)
          rewardAmount: '100000', // Amount that doesn't divide evenly by epoch count
        } as any;

        const startTimestamp = 1672531200; // Campaign start
        const endTimestamp = 1672704000; // Campaign end

        const epochs = service['calculateEpochsInRange'](mockCampaign, startTimestamp, endTimestamp);

        // Should create 12 epochs (48 hours / 4 hours per epoch)
        expect(epochs).toHaveLength(12);

        // Calculate total rewards across all epochs
        const totalRewards = epochs.reduce((sum, epoch) => sum.add(epoch.totalRewards), new Decimal(0));

        // Must be less than or equal to campaign amount - precision loss expected with proportional calculation
        expect(totalRewards.lte(new Decimal('100000'))).toBe(true);
        expect(totalRewards.gte(new Decimal('99999'))).toBe(true); // Should be close to campaign amount
      });

      it('should handle non-terminating decimal divisions with exact precision', () => {
        const mockCampaign = {
          id: '1',
          startDate: new Date('2025-05-15T21:13:10.000Z'), // Campaign from real scenario
          endDate: new Date('2025-07-15T21:13:10.000Z'),
          rewardAmount: '100000', // 100000 / 366 epochs creates non-terminating decimal
        } as any;

        const campaignStartTime = Math.floor(mockCampaign.startDate.getTime() / 1000);
        const campaignEndTime = Math.floor(mockCampaign.endDate.getTime() / 1000);

        const epochs = service['calculateEpochsInRange'](mockCampaign, campaignStartTime, campaignEndTime);

        // Should create 366 epochs (61 days * 6 epochs per day)
        expect(epochs).toHaveLength(366);

        // Calculate total rewards
        const totalRewards = epochs.reduce((sum, epoch) => sum.add(epoch.totalRewards), new Decimal(0));

        // Must be exactly 100000 despite non-terminating decimal division
        expect(totalRewards.toString()).toBe('100000');
        expect(totalRewards.equals(new Decimal('100000'))).toBe(true);

        // Verify final epoch gets remaining balance
        const finalEpoch = epochs[epochs.length - 1];
        expect(finalEpoch.epochNumber).toBe(366);

        // Calculate what the final epoch should have received with proportional calculation
        const totalDuration = campaignEndTime - campaignStartTime;
        const finalEpochDuration =
          Math.floor(finalEpoch.endTimestamp.getTime() / 1000) - Math.floor(finalEpoch.startTimestamp.getTime() / 1000);
        const proportionalReward = new Decimal('100000').mul(finalEpochDuration).div(totalDuration);

        // Final epoch should get remaining balance, which will be slightly different from proportional
        const sumOfFirst365 = epochs.slice(0, 365).reduce((sum, epoch) => sum.add(epoch.totalRewards), new Decimal(0));
        const expectedFinalReward = new Decimal('100000').minus(sumOfFirst365);

        expect(finalEpoch.totalRewards.equals(expectedFinalReward)).toBe(true);
      });

      it('should never distribute more than campaign amount regardless of precision issues', () => {
        // Test multiple scenarios that could cause precision accumulation
        const testScenarios = [
          { amount: '100000', days: 61 }, // Real-world scenario
          { amount: '999999.999999', days: 7 }, // High precision amount
          { amount: '1', days: 3 }, // Small amount
          { amount: '123456789.123456789', days: 30 }, // Large amount with decimals
        ];

        testScenarios.forEach(({ amount, days }) => {
          const campaignStart = new Date('2023-01-01T00:00:00.000Z');
          const campaignEnd = new Date(campaignStart.getTime() + days * 24 * 60 * 60 * 1000);

          const mockCampaign = {
            id: '1',
            startDate: campaignStart,
            endDate: campaignEnd,
            rewardAmount: amount,
          } as any;

          const epochs = service['calculateEpochsInRange'](
            mockCampaign,
            Math.floor(campaignStart.getTime() / 1000),
            Math.floor(campaignEnd.getTime() / 1000),
          );

          const totalRewards = epochs.reduce((sum, epoch) => sum.add(epoch.totalRewards), new Decimal(0));
          const campaignAmount = new Decimal(amount);

          // Total must never exceed campaign amount
          expect(totalRewards.lte(campaignAmount)).toBe(true);

          // Total should be exactly equal to campaign amount
          expect(totalRewards.equals(campaignAmount)).toBe(true);
        });
      });

      it('should handle final epoch correctly when it has different duration', () => {
        // Campaign that doesn't end exactly on epoch boundary
        const mockCampaign = {
          id: '1',
          startDate: new Date('2023-01-01T00:00:00.000Z'), // Unix: 1672531200
          endDate: new Date('2023-01-01T06:30:00.000Z'), // Unix: 1672554600 (6.5 hours later)
          rewardAmount: '650', // 6.5 hours worth
        } as any;

        const startTimestamp = 1672531200; // Campaign start
        const endTimestamp = 1672554600; // Campaign end

        const epochs = service['calculateEpochsInRange'](mockCampaign, startTimestamp, endTimestamp);

        // Should create 2 epochs:
        // - Epoch 1: 4 hours (14400 seconds)
        // - Epoch 2: 2.5 hours (9000 seconds)
        expect(epochs).toHaveLength(2);

        // Verify total is exact
        const totalRewards = epochs.reduce((sum, epoch) => sum.add(epoch.totalRewards), new Decimal(0));
        expect(totalRewards.toString()).toBe('650');

        // First epoch should get proportional share: (14400/23400) * 650
        const expectedFirstEpoch = new Decimal('650').mul(14400).div(23400);

        // Second epoch should get remaining balance
        const expectedSecondEpoch = new Decimal('650').minus(expectedFirstEpoch);

        // Verify the final epoch gets exactly the remaining balance
        expect(epochs[1].totalRewards.equals(expectedSecondEpoch)).toBe(true);
      });

      it('should work correctly when filtering epochs by time range', () => {
        const mockCampaign = {
          id: '1',
          startDate: new Date('2023-01-01T00:00:00.000Z'), // Unix: 1672531200
          endDate: new Date('2023-01-03T00:00:00.000Z'), // Unix: 1672704000 (48 hours)
          rewardAmount: '100000',
        } as any;

        // Request only middle portion of campaign
        const startTimestamp = 1672617600; // 24 hours into campaign
        const endTimestamp = 1672689600; // 44 hours into campaign (20 hour window)

        const epochs = service['calculateEpochsInRange'](mockCampaign, startTimestamp, endTimestamp);

        // Should return epochs that intersect with the 24-44 hour window
        // Epochs 7-12 should intersect (epoch 7: 24-28h, ..., epoch 12: 44-48h)
        expect(epochs.length).toBeGreaterThan(0);

        // Each returned epoch should have valid rewards
        epochs.forEach((epoch) => {
          expect(epoch.totalRewards.gt(0)).toBe(true);
          expect(epoch.totalRewards.isFinite()).toBe(true);
        });

        // When we get all epochs for the campaign, total should not exceed campaign amount
        const allEpochs = service['calculateEpochsInRange'](mockCampaign, 1672531200, 1672704000);
        const totalAllRewards = allEpochs.reduce((sum, epoch) => sum.add(epoch.totalRewards), new Decimal(0));
        expect(totalAllRewards.lte(new Decimal('100000'))).toBe(true);
        expect(totalAllRewards.gte(new Decimal('99999'))).toBe(true); // Should be close to campaign amount
      });
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

  describe('Campaign End Date Protection Tests', () => {
    const mockDeployment = {
      blockchainType: 'ethereum',
      exchangeId: 'ethereum',
      startBlock: 1000,
    } as any;

    const mockActiveCampaign = {
      id: '1',
      blockchainType: 'ethereum',
      exchangeId: 'ethereum',
      pairId: 1,
      rewardAmount: '1000',
      rewardTokenAddress: '0x1234567890123456789012345678901234567890',
      startDate: new Date('2023-01-01T00:00:00.000Z'), // Unix: 1672531200
      endDate: new Date('2023-01-01T12:00:00.000Z'), // Unix: 1672574400 (12 hours later)
      opportunityName: 'Test Campaign',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      pair: {
        id: 1,
        token0: { address: '0xtoken0' },
        token1: { address: '0xtoken1' },
      },
    } as any;

    const mockExpiredCampaign = {
      ...mockActiveCampaign,
      id: '2',
      endDate: new Date('2022-12-31T12:00:00.000Z'), // Unix: 1672488000 (ended before campaign 1 starts)
    } as any;

    beforeEach(() => {
      // Mock BlockService.getBlocksDictionary
      const mockGetBlocksDictionary = jest.fn().mockResolvedValue({
        1000: new Date('2023-01-01T06:00:00.000Z'), // Before campaign end
        1001: new Date('2023-01-01T14:00:00.000Z'), // After campaign end
        1002: new Date('2023-01-01T10:00:00.000Z'), // Before campaign end
        1003: new Date('2023-01-01T16:00:00.000Z'), // After campaign end
      });

      Object.defineProperty(service, 'blockService', {
        value: { getBlocksDictionary: mockGetBlocksDictionary },
        writable: true,
      });

      // Mock getTimestampForBlock
      const mockGetTimestampForBlock = jest.fn().mockImplementation((blockId: number) => {
        const timestamps = {
          1000: Math.floor(new Date('2023-01-01T06:00:00.000Z').getTime() / 1000), // 1672552800
          1001: Math.floor(new Date('2023-01-01T14:00:00.000Z').getTime() / 1000), // 1672581600
          1002: Math.floor(new Date('2023-01-01T10:00:00.000Z').getTime() / 1000), // 1672567200
          1003: Math.floor(new Date('2023-01-01T16:00:00.000Z').getTime() / 1000), // 1672588800
        };
        return Promise.resolve(timestamps[blockId] || 1672531200);
      });

      jest.spyOn(service as any, 'getTimestampForBlock').mockImplementation(mockGetTimestampForBlock);

      // Mock createPriceCache to avoid calling the actual implementation
      jest.spyOn(service as any, 'createPriceCache').mockResolvedValue({
        rates: new Map([
          ['0xtoken0', 1500],
          ['0xtoken1', 1],
        ]),
        timestamp: Date.now(),
      });
    });

    describe('processBatchForAllCampaigns', () => {
      it('should skip entire campaign when batch starts after campaign end', async () => {
        const loggerSpy = jest.spyOn(service['logger'], 'warn').mockImplementation();

        const campaignContexts = [{ campaign: mockExpiredCampaign, strategyStates: new Map() }];

        const mockEvents = {
          createdEvents: [],
          updatedEvents: [],
          deletedEvents: [],
          transferEvents: [],
        };

        await service['processBatchForAllCampaigns'](
          campaignContexts,
          mockEvents,
          1001, // Batch starts after expired campaign end
          1003,
          mockDeployment,
        );

        expect(loggerSpy).toHaveBeenCalledWith(
          expect.stringContaining('Skipping campaign 2 - batch starts after campaign end'),
        );

        loggerSpy.mockRestore();
      });

      it('should process campaign when batch starts before campaign end', async () => {
        const loggerSpy = jest.spyOn(service['logger'], 'warn').mockImplementation();
        const updateStrategyStatesSpy = jest.spyOn(service as any, 'updateStrategyStates').mockImplementation();
        const processEpochsSpy = jest.spyOn(service as any, 'processEpochsInTimeRange').mockImplementation();

        const campaignContexts = [{ campaign: mockActiveCampaign, strategyStates: new Map() }];

        const mockEvents = {
          createdEvents: [],
          updatedEvents: [],
          deletedEvents: [],
          transferEvents: [],
        };

        await service['processBatchForAllCampaigns'](
          campaignContexts,
          mockEvents,
          1000, // Batch starts before campaign end
          1002,
          mockDeployment,
        );

        expect(loggerSpy).not.toHaveBeenCalledWith(expect.stringContaining('Skipping campaign'));
        expect(updateStrategyStatesSpy).toHaveBeenCalled();
        expect(processEpochsSpy).toHaveBeenCalled();

        loggerSpy.mockRestore();
        updateStrategyStatesSpy.mockRestore();
        processEpochsSpy.mockRestore();
      });

      it('should filter events by campaign end timestamp', async () => {
        const campaignContexts = [
          {
            campaign: mockActiveCampaign,
            strategyStates: new Map([
              [
                'strategy1',
                {
                  strategyId: 'strategy1',
                  pairId: 1,
                  token0Address: '0xtoken0',
                  token1Address: '0xtoken1',
                  token0Decimals: 18,
                  token1Decimals: 18,
                  liquidity0: new Decimal('1000'),
                  liquidity1: new Decimal('1000'),
                  order0_A: new Decimal('1'),
                  order0_B: new Decimal('2000'),
                  order0_z: new Decimal('1000'),
                  order1_A: new Decimal('1'),
                  order1_B: new Decimal('2000'),
                  order1_z: new Decimal('1000'),
                  currentOwner: 'owner1',
                  creationWallet: 'owner1',
                  lastProcessedBlock: 100,
                  isDeleted: false,
                },
              ],
            ]),
          },
        ];

        const mockEvents = {
          createdEvents: [
            { block: { id: 1000 }, pair: { id: 1 } }, // Before campaign end - should be included
            { block: { id: 1001 }, pair: { id: 1 } }, // After campaign end - should be filtered out
          ] as any[],
          updatedEvents: [
            { block: { id: 1002 }, pair: { id: 1 } }, // Before campaign end - should be included
            { block: { id: 1003 }, pair: { id: 1 } }, // After campaign end - should be filtered out
          ] as any[],
          deletedEvents: [] as any[],
          transferEvents: [
            { block: { id: 1000 }, strategyId: 'strategy1' }, // Before campaign end - should be included
            { block: { id: 1001 }, strategyId: 'strategy1' }, // After campaign end - should be filtered out
          ] as any[],
        };

        const updateStrategyStatesSpy = jest.spyOn(service as any, 'updateStrategyStates').mockImplementation();
        const processEpochsSpy = jest.spyOn(service as any, 'processEpochsInTimeRange').mockImplementation();

        await service['processBatchForAllCampaigns'](campaignContexts, mockEvents as any, 1000, 1003, mockDeployment);

        // Check that updateStrategyStates was called with filtered events
        expect(updateStrategyStatesSpy).toHaveBeenCalledWith(
          [{ block: { id: 1000 }, pair: { id: 1 } }], // Only event before campaign end
          [{ block: { id: 1002 }, pair: { id: 1 } }], // Only event before campaign end
          [], // No deleted events
          [{ block: { id: 1000 }, strategyId: 'strategy1' }], // Only event before campaign end
          expect.any(Map),
        );

        updateStrategyStatesSpy.mockRestore();
        processEpochsSpy.mockRestore();
      });

      it('should handle empty events gracefully', async () => {
        const campaignContexts = [{ campaign: mockActiveCampaign, strategyStates: new Map() }];

        const mockEvents = {
          createdEvents: [],
          updatedEvents: [],
          deletedEvents: [],
          transferEvents: [],
        };

        // Should not call getBlocksDictionary when no events
        const getBlocksDictionarySpy = jest.spyOn(service['blockService'], 'getBlocksDictionary');

        await service['processBatchForAllCampaigns'](campaignContexts, mockEvents as any, 1000, 1002, mockDeployment);

        expect(getBlocksDictionarySpy).not.toHaveBeenCalled();

        getBlocksDictionarySpy.mockRestore();
      });
    });

    describe('processEpochsInTimeRange', () => {
      it('should skip epoch processing when time range starts after campaign end', async () => {
        const loggerSpy = jest.spyOn(service['logger'], 'warn').mockImplementation();
        const calculateEpochsSpy = jest.spyOn(service as any, 'calculateEpochsInRange');

        const campaignEndTime = Math.floor(mockActiveCampaign.endDate.getTime() / 1000); // 1672574400
        const startTimestamp = campaignEndTime + 3600; // 1 hour after campaign end
        const endTimestamp = startTimestamp + 3600; // 2 hours after campaign end

        await service['processEpochsInTimeRange'](mockActiveCampaign, startTimestamp, endTimestamp, new Map(), {
          rates: new Map(),
          timestamp: Date.now(),
        });

        expect(loggerSpy).toHaveBeenCalledWith(
          expect.stringContaining('Skipping epoch processing for campaign 1 - time range starts after campaign end'),
        );
        expect(calculateEpochsSpy).not.toHaveBeenCalled();

        loggerSpy.mockRestore();
        calculateEpochsSpy.mockRestore();
      });

      it('should process epochs when time range starts before campaign end', async () => {
        const loggerSpy = jest.spyOn(service['logger'], 'warn').mockImplementation();
        const calculateEpochsSpy = jest.spyOn(service as any, 'calculateEpochsInRange').mockReturnValue([]);
        const validateIntegritySpy = jest.spyOn(service as any, 'validateEpochIntegrity').mockReturnValue(true);

        const campaignStartTime = Math.floor(mockActiveCampaign.startDate.getTime() / 1000); // 1672531200
        const campaignEndTime = Math.floor(mockActiveCampaign.endDate.getTime() / 1000); // 1672574400
        const startTimestamp = campaignStartTime + 3600; // 1 hour after campaign start
        const endTimestamp = campaignEndTime - 3600; // 1 hour before campaign end

        await service['processEpochsInTimeRange'](mockActiveCampaign, startTimestamp, endTimestamp, new Map(), {
          rates: new Map(),
          timestamp: Date.now(),
        });

        expect(loggerSpy).not.toHaveBeenCalledWith(expect.stringContaining('Skipping epoch processing'));
        expect(calculateEpochsSpy).toHaveBeenCalledWith(mockActiveCampaign, startTimestamp, endTimestamp);

        loggerSpy.mockRestore();
        calculateEpochsSpy.mockRestore();
        validateIntegritySpy.mockRestore();
      });
    });

    describe('generateSnapshotsForEpoch', () => {
      it('should stop generating snapshots when campaign ends', () => {
        const loggerSpy = jest.spyOn(service['logger'], 'debug').mockImplementation();

        // Create an epoch that extends beyond campaign end
        const campaignEndTime = Math.floor(mockActiveCampaign.endDate.getTime() / 1000); // 1672574400
        const mockEpoch = {
          epochNumber: 1,
          startTimestamp: new Date((campaignEndTime - 1800) * 1000), // 30 minutes before campaign end
          endTimestamp: new Date((campaignEndTime + 1800) * 1000), // 30 minutes after campaign end
          totalRewards: new Decimal('100'),
        };

        const snapshots = service['generateSnapshotsForEpoch'](mockEpoch, new Map(), mockActiveCampaign, {
          rates: new Map(),
          timestamp: Date.now(),
        });

        // Should have stopped generating snapshots at campaign end
        expect(loggerSpy).toHaveBeenCalledWith(
          expect.stringContaining(`Stopping snapshots at ${campaignEndTime} - campaign 1 ended at ${campaignEndTime}`),
        );

        // All snapshots should be before campaign end
        snapshots.forEach((snapshot) => {
          expect(snapshot.timestamp).toBeLessThan(campaignEndTime);
        });

        loggerSpy.mockRestore();
      });

      it('should generate all snapshots when epoch ends before campaign', () => {
        const loggerSpy = jest.spyOn(service['logger'], 'debug').mockImplementation();

        // Create an epoch that ends before campaign end
        const campaignEndTime = Math.floor(mockActiveCampaign.endDate.getTime() / 1000);
        const mockEpoch = {
          epochNumber: 1,
          startTimestamp: new Date((campaignEndTime - 3600) * 1000), // 1 hour before campaign end
          endTimestamp: new Date((campaignEndTime - 1800) * 1000), // 30 minutes before campaign end
          totalRewards: new Decimal('100'),
        };

        const snapshots = service['generateSnapshotsForEpoch'](mockEpoch, new Map(), mockActiveCampaign, {
          rates: new Map(),
          timestamp: Date.now(),
        });

        // Should not have logged stopping message
        expect(loggerSpy).not.toHaveBeenCalledWith(expect.stringContaining('Stopping snapshots'));

        loggerSpy.mockRestore();
      });

      it('should handle epoch that starts after campaign end', () => {
        // Create an epoch that starts after campaign end
        const campaignEndTime = Math.floor(mockActiveCampaign.endDate.getTime() / 1000);
        const mockEpoch = {
          epochNumber: 1,
          startTimestamp: new Date((campaignEndTime + 1800) * 1000), // 30 minutes after campaign end
          endTimestamp: new Date((campaignEndTime + 3600) * 1000), // 1 hour after campaign end
          totalRewards: new Decimal('100'),
        };

        const snapshots = service['generateSnapshotsForEpoch'](mockEpoch, new Map(), mockActiveCampaign, {
          rates: new Map(),
          timestamp: Date.now(),
        });

        // Should generate no snapshots
        expect(snapshots).toHaveLength(0);
      });
    });

    describe('Integration Tests', () => {
      it('should handle mixed campaign states in the same batch', async () => {
        const loggerSpy = jest.spyOn(service['logger'], 'warn').mockImplementation();

        const campaignContexts = [
          { campaign: mockActiveCampaign, strategyStates: new Map() }, // Active campaign
          { campaign: mockExpiredCampaign, strategyStates: new Map() }, // Expired campaign
        ];

        const mockEvents = {
          createdEvents: [
            { block: { id: 1000 }, pair: { id: 1 } }, // For active campaign
            { block: { id: 1000 }, pair: { id: 2 } }, // For expired campaign (should be skipped)
          ],
          updatedEvents: [],
          deletedEvents: [],
          transferEvents: [],
        };

        const updateStrategyStatesSpy = jest.spyOn(service as any, 'updateStrategyStates').mockImplementation();
        const processEpochsSpy = jest.spyOn(service as any, 'processEpochsInTimeRange').mockImplementation();

        await service['processBatchForAllCampaigns'](campaignContexts, mockEvents as any, 1000, 1002, mockDeployment);

        // Should skip expired campaign
        expect(loggerSpy).toHaveBeenCalledWith(
          expect.stringContaining('Skipping campaign 2 - batch starts after campaign end'),
        );

        // Should process active campaign only once
        expect(updateStrategyStatesSpy).toHaveBeenCalledTimes(1);
        expect(processEpochsSpy).toHaveBeenCalledTimes(1);

        loggerSpy.mockRestore();
        updateStrategyStatesSpy.mockRestore();
        processEpochsSpy.mockRestore();
      });

      it('should preserve event filtering per campaign', async () => {
        // Create two campaigns with different end times
        const earlyEndCampaign = {
          ...mockActiveCampaign,
          id: '3',
          pairId: 2,
          endDate: new Date('2023-01-01T08:00:00.000Z'), // Unix: 1672560000 (ends earlier)
          pair: { id: 2, token0: { address: '0xtoken2' }, token1: { address: '0xtoken3' } },
        };

        const campaignContexts = [
          { campaign: mockActiveCampaign, strategyStates: new Map() }, // Ends at 12:00
          { campaign: earlyEndCampaign, strategyStates: new Map() }, // Ends at 08:00
        ];

        const mockEvents = {
          createdEvents: [
            { block: { id: 1002 }, pair: { id: 1 } }, // At 10:00 - valid for both campaigns
            { block: { id: 1001 }, pair: { id: 2 } }, // At 14:00 - invalid for both (after both end)
          ],
          updatedEvents: [],
          deletedEvents: [],
          transferEvents: [],
        };

        const updateStrategyStatesSpy = jest.spyOn(service as any, 'updateStrategyStates').mockImplementation();

        await service['processBatchForAllCampaigns'](campaignContexts, mockEvents as any, 1000, 1003, mockDeployment);

        // Check filtering for first campaign (ends at 12:00)
        expect(updateStrategyStatesSpy).toHaveBeenNthCalledWith(
          1,
          [{ block: { id: 1002 }, pair: { id: 1 } }], // Event at 10:00 included
          [],
          [],
          [],
          expect.any(Map),
        );

        // Check filtering for second campaign (ends at 08:00)
        expect(updateStrategyStatesSpy).toHaveBeenNthCalledWith(
          2,
          [], // No events before 08:00 for pair 2
          [],
          [],
          [],
          expect.any(Map),
        );

        updateStrategyStatesSpy.mockRestore();
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

  describe('Reward Distribution Tests (No Redistribution)', () => {
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

      // Set up mock weightings for distribution tests
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

        // strategy1 should receive all rewards since it's the only eligible strategy
        const strategy1Reward = epochRewards.get('strategy1');
        expect(strategy1Reward.totalReward.eq(300)).toBe(true); // Should get all 300 rewards since it's the only eligible one
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

      it('should handle mixed scenarios with different liquidity amounts', () => {
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

      it('should correctly calculate rewards with partial liquidity', () => {
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

      it('should distribute rewards normally when all strategies are eligible', () => {
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

        // Total distributed should equal epoch total since both strategies are eligible (with small tolerance for precision)
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

  describe('Historic Campaign Reprocessing Integration Tests', () => {
    const mockDeployment = {
      blockchainType: 'ethereum',
      exchangeId: 'ethereum',
      startBlock: 1000,
    } as any;

    beforeEach(() => {
      // Mock getTimestampForBlock for integration tests
      const mockGetTimestampForBlock = jest.fn().mockImplementation((blockId: number) => {
        const timestamps = {
          1000: Math.floor(new Date('2023-01-01T06:00:00.000Z').getTime() / 1000), // 1672552800
          2000: Math.floor(new Date('2023-01-01T18:00:00.000Z').getTime() / 1000), // 1672596000
        };
        return Promise.resolve(timestamps[blockId] || 1672531200);
      });

      jest.spyOn(service as any, 'getTimestampForBlock').mockImplementation(mockGetTimestampForBlock);
    });

    it('should call markProcessedCampaignsInactive after processing is complete', async () => {
      const mockActiveCampaign = {
        id: '1',
        blockchainType: 'ethereum',
        exchangeId: 'ethereum',
        pairId: 1,
        rewardAmount: '1000',
        startDate: new Date('2023-01-01T00:00:00.000Z'),
        endDate: new Date('2023-01-01T12:00:00.000Z'),
        isActive: true,
        pair: { id: 1, token0: { address: '0xtoken0' }, token1: { address: '0xtoken1' } },
      } as any;

      const mockCampaignService = {
        getActiveCampaigns: jest.fn().mockResolvedValue([mockActiveCampaign]),
        markProcessedCampaignsInactive: jest.fn().mockResolvedValue(undefined),
      };

      const mockLastProcessedBlockService = {
        getOrInit: jest.fn().mockResolvedValue(1000),
        update: jest.fn().mockResolvedValue(undefined),
      };

      // Replace services with mocks
      Object.defineProperty(service, 'campaignService', { value: mockCampaignService, writable: true });
      Object.defineProperty(service, 'lastProcessedBlockService', {
        value: mockLastProcessedBlockService,
        writable: true,
      });

      // Mock other required methods
      jest.spyOn(service as any, 'initializeStrategyStates').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'processBatchForAllCampaigns').mockResolvedValue(undefined);

      // Mock epoch reward repository cleanup
      const mockDeleteQueryBuilder = {
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      };
      mockEpochRewardRepository.createQueryBuilder.mockReturnValue(mockDeleteQueryBuilder);

      await service.update(2000, mockDeployment);

      // Verify that markProcessedCampaignsInactive was called with correct parameters
      expect(mockCampaignService.markProcessedCampaignsInactive).toHaveBeenCalledWith(
        mockDeployment,
        [mockActiveCampaign],
        Math.floor(new Date('2023-01-01T18:00:00.000Z').getTime() / 1000), // endBlock timestamp
      );
    });

    it('should enable historic campaign reprocessing workflow', async () => {
      // Historic campaign that ended but is manually marked active for reprocessing
      const expiredCampaign = {
        id: '2',
        blockchainType: 'ethereum',
        exchangeId: 'ethereum',
        pairId: 2,
        rewardAmount: '500',
        startDate: new Date('2022-12-01T00:00:00.000Z'), // Ended in past
        endDate: new Date('2022-12-31T23:59:59.000Z'), // Ended in past
        isActive: true, // Manually set to active for reprocessing
        pair: { id: 2, token0: { address: '0xtoken2' }, token1: { address: '0xtoken3' } },
      } as any;

      const mockCampaignService = {
        getActiveCampaigns: jest.fn().mockResolvedValue([expiredCampaign]),
        markProcessedCampaignsInactive: jest.fn().mockResolvedValue(undefined),
      };

      const mockLastProcessedBlockService = {
        getOrInit: jest.fn().mockResolvedValue(1000),
        update: jest.fn().mockResolvedValue(undefined),
      };

      // Replace services
      Object.defineProperty(service, 'campaignService', { value: mockCampaignService, writable: true });
      Object.defineProperty(service, 'lastProcessedBlockService', {
        value: mockLastProcessedBlockService,
        writable: true,
      });

      // Mock methods
      jest.spyOn(service as any, 'initializeStrategyStates').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'processBatchForAllCampaigns').mockResolvedValue(undefined);

      const mockDeleteQueryBuilder = {
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      };
      mockEpochRewardRepository.createQueryBuilder.mockReturnValue(mockDeleteQueryBuilder);

      await service.update(2000, mockDeployment);

      // 1. Campaign should be returned by getActiveCampaigns (not filtered out)
      expect(mockCampaignService.getActiveCampaigns).toHaveBeenCalledWith(mockDeployment);

      // 2. Campaign should be processed (initializeStrategyStates called)
      expect(service['initializeStrategyStates']).toHaveBeenCalledWith(
        1000,
        mockDeployment,
        expiredCampaign,
        expect.any(Map),
      );

      // 3. Post-processing should be called to mark campaign inactive if processed past its end
      expect(mockCampaignService.markProcessedCampaignsInactive).toHaveBeenCalledWith(
        mockDeployment,
        [expiredCampaign],
        expect.any(Number),
      );
    });

    it('should handle mixed active and historic campaigns', async () => {
      const activeCampaign = {
        id: '1',
        startDate: new Date('2023-01-01T00:00:00.000Z'),
        endDate: new Date('2023-01-02T00:00:00.000Z'), // Active
        isActive: true,
        pair: { id: 1 },
      } as any;

      const historicCampaign = {
        id: '2',
        startDate: new Date('2022-12-01T00:00:00.000Z'),
        endDate: new Date('2022-12-31T00:00:00.000Z'), // Ended in past
        isActive: true, // Manually set for reprocessing
        pair: { id: 2 },
      } as any;

      const mockCampaignService = {
        getActiveCampaigns: jest.fn().mockResolvedValue([activeCampaign, historicCampaign]),
        markProcessedCampaignsInactive: jest.fn().mockResolvedValue(undefined),
      };

      const mockLastProcessedBlockService = {
        getOrInit: jest.fn().mockResolvedValue(1000),
        update: jest.fn().mockResolvedValue(undefined),
      };

      Object.defineProperty(service, 'campaignService', { value: mockCampaignService, writable: true });
      Object.defineProperty(service, 'lastProcessedBlockService', {
        value: mockLastProcessedBlockService,
        writable: true,
      });

      jest.spyOn(service as any, 'initializeStrategyStates').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'processBatchForAllCampaigns').mockResolvedValue(undefined);

      const mockDeleteQueryBuilder = {
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      };
      mockEpochRewardRepository.createQueryBuilder.mockReturnValue(mockDeleteQueryBuilder);

      await service.update(2000, mockDeployment);

      // Both campaigns should be processed
      expect(service['initializeStrategyStates']).toHaveBeenCalledTimes(2);
      expect(service['processBatchForAllCampaigns']).toHaveBeenCalled();

      // Post-processing should handle both campaigns
      expect(mockCampaignService.markProcessedCampaignsInactive).toHaveBeenCalledWith(
        mockDeployment,
        [activeCampaign, historicCampaign],
        expect.any(Number),
      );
    });
  });
});
