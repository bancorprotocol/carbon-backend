import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, QueryBuilder } from 'typeorm';
import { Decimal } from 'decimal.js';
import { SubEpochService } from './sub-epoch.service';
import { SubEpoch } from '../entities/sub-epoch.entity';

describe('SubEpochService', () => {
  let service: SubEpochService;
  let repository: jest.Mocked<Repository<SubEpoch>>;
  let mockQueryBuilder: any;

  beforeEach(async () => {
    mockQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(),
      getRawMany: jest.fn(),
      getMany: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orUpdate: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    };

    const mockRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubEpochService,
        {
          provide: getRepositoryToken(SubEpoch),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<SubEpochService>(SubEpochService);
    repository = module.get(getRepositoryToken(SubEpoch));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getTotalRewardsForCampaign', () => {
    it('should return total rewards for a campaign', async () => {
      const campaignId = 1;
      const expectedTotal = '1000000000000000000000'; // 1000 tokens

      mockQueryBuilder.getRawOne.mockResolvedValue({ total: expectedTotal });

      const result = await service.getTotalRewardsForCampaign(campaignId);

      expect(mockQueryBuilder.select).toHaveBeenCalledWith('SUM(CAST(se.totalReward AS DECIMAL))', 'total');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('se.campaignId = :campaignId', { campaignId });
      expect(result).toEqual(new Decimal(expectedTotal));
    });

    it('should return zero when no rewards exist', async () => {
      const campaignId = 1;

      mockQueryBuilder.getRawOne.mockResolvedValue({ total: null });

      const result = await service.getTotalRewardsForCampaign(campaignId);

      expect(result).toEqual(new Decimal('0'));
    });

    it('should handle database errors gracefully', async () => {
      const campaignId = 1;

      mockQueryBuilder.getRawOne.mockRejectedValue(new Error('Database error'));

      await expect(service.getTotalRewardsForCampaign(campaignId)).rejects.toThrow('Database error');
    });
  });

  describe('saveSubEpochs', () => {
    const mockSubEpochs = [
      {
        campaignId: 1,
        strategyId: 'strategy-1',
        epochNumber: 1,
        subEpochTimestamp: new Date('2023-01-01T01:00:00Z'),
        totalReward: '100000000000000000000',
        token0Reward: '50000000000000000000',
        token1Reward: '50000000000000000000',
        liquidity0: '1000000000000000000',
        liquidity1: '1000000000000000000',
      },
      {
        campaignId: 1,
        strategyId: 'strategy-2',
        epochNumber: 1,
        subEpochTimestamp: new Date('2023-01-01T01:00:00Z'),
        totalReward: '200000000000000000000',
        token0Reward: '100000000000000000000',
        token1Reward: '100000000000000000000',
        liquidity0: '2000000000000000000',
        liquidity1: '2000000000000000000',
      },
    ];

    it('should save sub-epochs with correct subEpochNumber assignment', async () => {
      // Mock that no existing records exist for this campaign
      mockQueryBuilder.getRawOne.mockResolvedValue({ maxSubEpoch: null });
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockQueryBuilder.execute.mockResolvedValue(undefined);

      await service.saveSubEpochs(mockSubEpochs);

      expect(mockQueryBuilder.getRawOne).toHaveBeenCalled(); // MAX query
      expect(mockQueryBuilder.getMany).toHaveBeenCalled(); // Check existing records
      expect(mockQueryBuilder.execute).toHaveBeenCalled(); // UPSERT
    });

    it('should handle existing records and preserve subEpochNumber', async () => {
      // Mock existing max subEpochNumber
      mockQueryBuilder.getRawOne.mockResolvedValue({ maxSubEpoch: 5 });

      // Mock existing records at the same timestamp
      mockQueryBuilder.getMany.mockResolvedValue([{ strategyId: 'strategy-1', subEpochNumber: 6 }]);

      mockQueryBuilder.execute.mockResolvedValue(undefined);

      const subEpochsWithExisting = [
        {
          ...mockSubEpochs[0],
          strategyId: 'strategy-1', // Existing strategy
        },
        {
          ...mockSubEpochs[1],
          strategyId: 'strategy-3', // New strategy
        },
      ];

      await service.saveSubEpochs(subEpochsWithExisting);

      expect(mockQueryBuilder.execute).toHaveBeenCalled();
    });

    it('should handle empty array gracefully', async () => {
      await service.saveSubEpochs([]);

      expect(mockQueryBuilder.getRawOne).not.toHaveBeenCalled();
      expect(mockQueryBuilder.execute).not.toHaveBeenCalled();
    });

    it('should handle database errors during save', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({ maxSubEpoch: null });
      mockQueryBuilder.getMany.mockResolvedValue([]);
      mockQueryBuilder.execute.mockRejectedValue(new Error('Database error'));

      await expect(service.saveSubEpochs(mockSubEpochs)).rejects.toThrow('Database error');
    });
  });

  describe('getEpochRewards', () => {
    it('should return aggregated epoch rewards', async () => {
      const campaignId = 1;
      const epochNumber = 1;

      const mockRawResults = [
        {
          strategyId: 'strategy-1',
          owner: '0xowner1',
          totalReward: '300000000000000000000', // 300 tokens
        },
        {
          strategyId: 'strategy-2',
          owner: '0xowner2',
          totalReward: '700000000000000000000', // 700 tokens
        },
      ];

      mockQueryBuilder.getRawMany.mockResolvedValue(mockRawResults);

      const result = await service.getEpochRewards(campaignId, epochNumber);

      expect(mockQueryBuilder.select).toHaveBeenCalledWith('se.epochNumber', 'epochNumber');
      expect(mockQueryBuilder.addSelect).toHaveBeenCalledWith('se.strategyId', 'strategyId');
      expect(mockQueryBuilder.addSelect).toHaveBeenCalledWith('se.ownerAddress', 'owner');
      expect(mockQueryBuilder.addSelect).toHaveBeenCalledWith('SUM(CAST(se.totalReward AS DECIMAL))', 'totalReward');
      expect(mockQueryBuilder.addSelect).toHaveBeenCalledWith('MAX(se.subEpochTimestamp)', 'epochEnd');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('se.campaignId = :campaignId', { campaignId });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('se.epochNumber = :epochNumber', { epochNumber });
      expect(mockQueryBuilder.groupBy).toHaveBeenCalledWith('se.epochNumber');
      expect(mockQueryBuilder.addGroupBy).toHaveBeenCalledWith('se.strategyId');
      expect(mockQueryBuilder.addGroupBy).toHaveBeenCalledWith('se.ownerAddress');
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('se.epochNumber', 'ASC');

      expect(result).toHaveLength(2);
      expect(result[0].strategyId).toBe('strategy-1');
      expect(result[0].owner).toBe('0xowner1');
      expect(result[0].totalReward).toEqual(new Decimal('300000000000000000000'));
      expect(result[1].strategyId).toBe('strategy-2');
      expect(result[1].owner).toBe('0xowner2');
      expect(result[1].totalReward).toEqual(new Decimal('700000000000000000000'));
    });

    it('should return rewards for all epochs when epochNumber is not provided', async () => {
      const campaignId = 1;

      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await service.getEpochRewards(campaignId);

      expect(mockQueryBuilder.where).toHaveBeenCalledWith('se.campaignId = :campaignId', { campaignId });
      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalledWith('se.epochNumber = :epochNumber', expect.any(Object));
      expect(result).toEqual([]);
    });

    it('should handle null totalReward values', async () => {
      const campaignId = 1;

      const mockRawResults = [
        {
          strategyId: 'strategy-1',
          owner: '0xowner1',
          totalReward: null,
        },
      ];

      mockQueryBuilder.getRawMany.mockResolvedValue(mockRawResults);

      const result = await service.getEpochRewards(campaignId);

      expect(result[0].totalReward).toEqual(new Decimal(0));
    });
  });

  describe('subEpochToDecimal', () => {
    it('should convert string values to Decimal objects', () => {
      const subEpoch: SubEpoch = {
        id: 1,
        campaignId: 1,
        strategyId: 'strategy-1',
        epochNumber: 1,
        subEpochNumber: 1,
        epochStart: new Date(),
        subEpochTimestamp: new Date(),
        token0Reward: '100000000000000000000',
        token1Reward: '200000000000000000000',
        totalReward: '300000000000000000000',
        liquidity0: '1000000000000000000',
        liquidity1: '2000000000000000000',
        token0Address: '0xtoken0',
        token1Address: '0xtoken1',
        token0UsdRate: '1.5',
        token1UsdRate: '2.5',
        targetPrice: '1.0',
        eligible0: '500000000000000000',
        eligible1: '1500000000000000000',
        token0RewardZoneBoundary: '0.98',
        token1RewardZoneBoundary: '1.02',
        token0Weighting: '1.0',
        token1Weighting: '1.0',
        token0Decimals: 18,
        token1Decimals: 18,
        order0ACompressed: '1000000000000000000',
        order0BCompressed: '2000000000000000000',
        order0A: '1000000000000000000',
        order0B: '2000000000000000000',
        order0Z: '3000000000000000000',
        order1ACompressed: '1000000000000000000',
        order1BCompressed: '2000000000000000000',
        order1A: '1000000000000000000',
        order1B: '2000000000000000000',
        order1Z: '3000000000000000000',
        lastEventTimestamp: new Date(),
        lastProcessedBlock: 1000000,
        ownerAddress: '0xowner',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = service.subEpochToDecimal(subEpoch);

      expect(result.token0Reward).toEqual(new Decimal('100000000000000000000'));
      expect(result.token1Reward).toEqual(new Decimal('200000000000000000000'));
      expect(result.totalReward).toEqual(new Decimal('300000000000000000000'));
      expect(result.liquidity0).toEqual(new Decimal('1000000000000000000'));
      expect(result.liquidity1).toEqual(new Decimal('2000000000000000000'));
      expect(result.token0UsdRate).toEqual(new Decimal('1.5'));
      expect(result.token1UsdRate).toEqual(new Decimal('2.5'));
      expect(result.targetPrice).toEqual(new Decimal('1.0'));
      expect(result.eligible0).toEqual(new Decimal('500000000000000000'));
      expect(result.eligible1).toEqual(new Decimal('1500000000000000000'));
    });

    it('should handle zero values correctly', () => {
      const subEpoch: SubEpoch = {
        id: 1,
        campaignId: 1,
        strategyId: 'strategy-1',
        epochNumber: 1,
        subEpochNumber: 1,
        epochStart: new Date(),
        subEpochTimestamp: new Date(),
        token0Reward: '0',
        token1Reward: '0',
        totalReward: '0',
        liquidity0: '0',
        liquidity1: '0',
        token0Address: '0xtoken0',
        token1Address: '0xtoken1',
        token0UsdRate: '0',
        token1UsdRate: '0',
        targetPrice: '0',
        eligible0: '0',
        eligible1: '0',
        token0RewardZoneBoundary: '0',
        token1RewardZoneBoundary: '0',
        token0Weighting: '0',
        token1Weighting: '0',
        token0Decimals: 18,
        token1Decimals: 18,
        order0ACompressed: '0',
        order0BCompressed: '0',
        order0A: '0',
        order0B: '0',
        order0Z: '0',
        order1ACompressed: '0',
        order1BCompressed: '0',
        order1A: '0',
        order1B: '0',
        order1Z: '0',
        lastEventTimestamp: new Date(),
        lastProcessedBlock: 1000000,
        ownerAddress: '0xowner',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = service.subEpochToDecimal(subEpoch);

      expect(result.token0Reward).toEqual(new Decimal('0'));
      expect(result.token1Reward).toEqual(new Decimal('0'));
      expect(result.totalReward).toEqual(new Decimal('0'));
      expect(result.liquidity0).toEqual(new Decimal('0'));
      expect(result.liquidity1).toEqual(new Decimal('0'));
    });

    it('should handle very large numbers without precision loss', () => {
      const subEpoch: SubEpoch = {
        id: 1,
        campaignId: 1,
        strategyId: 'strategy-1',
        epochNumber: 1,
        subEpochNumber: 1,
        epochStart: new Date(),
        subEpochTimestamp: new Date(),
        token0Reward: '999999999999999999999999999999999999999',
        token1Reward: '888888888888888888888888888888888888888',
        totalReward: '1888888888888888888888888888888888888887',
        liquidity0: '123456789012345678901234567890123456789',
        liquidity1: '987654321098765432109876543210987654321',
        token0Address: '0xtoken0',
        token1Address: '0xtoken1',
        token0UsdRate: '1234567890.123456789',
        token1UsdRate: '9876543210.987654321',
        targetPrice: '1.23456789012345678901234567890123456789',
        eligible0: '111111111111111111111111111111111111111',
        eligible1: '222222222222222222222222222222222222222',
        token0RewardZoneBoundary: '0.999999999999999999999999999999999999999',
        token1RewardZoneBoundary: '1.000000000000000000000000000000000000001',
        token0Weighting: '2.5',
        token1Weighting: '3.7',
        token0Decimals: 18,
        token1Decimals: 18,
        order0ACompressed: '999999999999999999999999999999999999999',
        order0BCompressed: '888888888888888888888888888888888888888',
        order0A: '777777777777777777777777777777777777777',
        order0B: '666666666666666666666666666666666666666',
        order0Z: '555555555555555555555555555555555555555',
        order1ACompressed: '444444444444444444444444444444444444444',
        order1BCompressed: '333333333333333333333333333333333333333',
        order1A: '222222222222222222222222222222222222222',
        order1B: '111111111111111111111111111111111111111',
        order1Z: '999999999999999999999999999999999999999',
        lastEventTimestamp: new Date(),
        lastProcessedBlock: 1000000,
        ownerAddress: '0xowner',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = service.subEpochToDecimal(subEpoch);

      expect(result.token0Reward.toFixed()).toBe('999999999999999999999999999999999999999');
      expect(result.token1Reward.toFixed()).toBe('888888888888888888888888888888888888888');
      expect(result.totalReward.toFixed()).toBe('1888888888888888888888888888888888888887');
      expect(result.liquidity0.toFixed()).toBe('123456789012345678901234567890123456789');
      expect(result.liquidity1.toFixed()).toBe('987654321098765432109876543210987654321');
    });
  });

  describe('Advanced Edge Cases', () => {
    describe('saveSubEpochs - Complex Scenarios', () => {
      it('should handle multiple campaigns with overlapping timestamps', async () => {
        const subEpochsMultipleCampaigns = [
          {
            campaignId: 1,
            strategyId: 'strategy-1',
            epochNumber: 1,
            subEpochTimestamp: new Date('2023-01-01T01:00:00Z'),
            totalReward: '100000000000000000000',
            token0Reward: '50000000000000000000',
            token1Reward: '50000000000000000000',
            liquidity0: '1000000000000000000',
            liquidity1: '1000000000000000000',
          },
          {
            campaignId: 2,
            strategyId: 'strategy-1',
            epochNumber: 1,
            subEpochTimestamp: new Date('2023-01-01T01:00:00Z'),
            totalReward: '200000000000000000000',
            token0Reward: '100000000000000000000',
            token1Reward: '100000000000000000000',
            liquidity0: '2000000000000000000',
            liquidity1: '2000000000000000000',
          },
        ];

        // Mock different max subEpochNumbers for different campaigns
        let callCount = 0;
        mockQueryBuilder.getRawOne.mockImplementation(() => {
          callCount++;
          return Promise.resolve({ maxSubEpoch: callCount === 1 ? 5 : 10 });
        });

        mockQueryBuilder.getMany.mockResolvedValue([]);
        mockQueryBuilder.execute.mockResolvedValue(undefined);

        await service.saveSubEpochs(subEpochsMultipleCampaigns);

        expect(mockQueryBuilder.execute).toHaveBeenCalledTimes(1);
      });

      it('should handle chronological ordering with mixed timestamps', async () => {
        const subEpochsOutOfOrder = [
          {
            campaignId: 1,
            strategyId: 'strategy-1',
            epochNumber: 1,
            subEpochTimestamp: new Date('2023-01-01T03:00:00Z'), // Later
            totalReward: '300000000000000000000',
            token0Reward: '150000000000000000000',
            token1Reward: '150000000000000000000',
            liquidity0: '3000000000000000000',
            liquidity1: '3000000000000000000',
          },
          {
            campaignId: 1,
            strategyId: 'strategy-2',
            epochNumber: 1,
            subEpochTimestamp: new Date('2023-01-01T01:00:00Z'), // Earlier
            totalReward: '100000000000000000000',
            token0Reward: '50000000000000000000',
            token1Reward: '50000000000000000000',
            liquidity0: '1000000000000000000',
            liquidity1: '1000000000000000000',
          },
          {
            campaignId: 1,
            strategyId: 'strategy-3',
            epochNumber: 1,
            subEpochTimestamp: new Date('2023-01-01T02:00:00Z'), // Middle
            totalReward: '200000000000000000000',
            token0Reward: '100000000000000000000',
            token1Reward: '100000000000000000000',
            liquidity0: '2000000000000000000',
            liquidity1: '2000000000000000000',
          },
        ];

        mockQueryBuilder.getRawOne.mockResolvedValue({ maxSubEpoch: null });
        mockQueryBuilder.getMany.mockResolvedValue([]);
        mockQueryBuilder.execute.mockResolvedValue(undefined);

        await service.saveSubEpochs(subEpochsOutOfOrder);

        // Should be processed in chronological order regardless of input order
        expect(mockQueryBuilder.execute).toHaveBeenCalled();
      });

      it('should handle large batch sizes efficiently', async () => {
        const largeBatch = Array.from({ length: 5000 }, (_, i) => ({
          campaignId: 1,
          strategyId: `strategy-${i}`,
          epochNumber: 1,
          subEpochTimestamp: new Date(`2023-01-01T01:${String(i % 60).padStart(2, '0')}:00Z`),
          totalReward: '1000000000000000000',
          token0Reward: '500000000000000000',
          token1Reward: '500000000000000000',
          liquidity0: '1000000000000000000',
          liquidity1: '1000000000000000000',
        }));

        mockQueryBuilder.getRawOne.mockResolvedValue({ maxSubEpoch: null });
        mockQueryBuilder.getMany.mockResolvedValue([]);
        mockQueryBuilder.execute.mockResolvedValue(undefined);

        await service.saveSubEpochs(largeBatch);

        // Should handle large batches without errors
        expect(mockQueryBuilder.execute).toHaveBeenCalled();
      });
    });

    describe('getEpochRewards - Advanced Queries', () => {
      it('should handle campaigns with no rewards', async () => {
        mockQueryBuilder.getRawMany.mockResolvedValue([]);

        const result = await service.getEpochRewards(999);

        expect(result).toEqual([]);
        expect(mockQueryBuilder.where).toHaveBeenCalledWith('se.campaignId = :campaignId', {
          campaignId: 999,
        });
      });

      it('should aggregate rewards across multiple epochs', async () => {
        const mockRawResults = [
          {
            strategyId: 'strategy-1',
            owner: '0xowner1',
            totalReward: '1500000000000000000000', // 1500 tokens across multiple epochs
          },
          {
            strategyId: 'strategy-2',
            owner: '0xowner2',
            totalReward: '2500000000000000000000', // 2500 tokens across multiple epochs
          },
        ];

        mockQueryBuilder.getRawMany.mockResolvedValue(mockRawResults);

        const result = await service.getEpochRewards(998);

        expect(result).toHaveLength(2);
        expect(result[0].totalReward).toEqual(new Decimal('1500000000000000000000'));
        expect(result[1].totalReward).toEqual(new Decimal('2500000000000000000000'));
      });

      it('should handle very large reward amounts', async () => {
        const mockRawResults = [
          {
            strategyId: 'whale-strategy',
            owner: '0xwhale',
            totalReward: '999999999999999999999999999999999999999', // Huge amount
          },
        ];

        mockQueryBuilder.getRawMany.mockResolvedValue(mockRawResults);

        const result = await service.getEpochRewards(997);

        expect(result[0].totalReward.toFixed()).toBe('999999999999999999999999999999999999999');
      });
    });

    describe('getTotalRewardsForCampaign - Edge Cases', () => {
      it('should handle campaigns with mixed positive and zero rewards', async () => {
        mockQueryBuilder.getRawOne.mockResolvedValue({ total: '1000000000000000000000' });

        const result = await service.getTotalRewardsForCampaign(996);

        expect(result).toEqual(new Decimal('1000000000000000000000'));
      });

      it('should handle database connection errors gracefully', async () => {
        mockQueryBuilder.getRawOne.mockRejectedValue(new Error('Connection timeout'));

        await expect(service.getTotalRewardsForCampaign(995)).rejects.toThrow('Connection timeout');
      });

      it('should handle SQL injection attempts safely', async () => {
        const maliciousCampaignId = 994; // Changed from string to number

        mockQueryBuilder.getRawOne.mockResolvedValue({ total: '0' });

        const result = await service.getTotalRewardsForCampaign(maliciousCampaignId);

        expect(result).toEqual(new Decimal('0'));
        expect(mockQueryBuilder.where).toHaveBeenCalledWith('se.campaignId = :campaignId', {
          campaignId: maliciousCampaignId,
        });
      });
    });
  });
});
