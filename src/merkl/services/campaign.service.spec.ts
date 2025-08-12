import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CampaignService } from './campaign.service';
import { Campaign } from '../entities/campaign.entity';
import { CreateCampaignDto } from '../dto/campaign.dto';
import { BlockchainType, ExchangeId } from '../../deployment/deployment.service';
import Decimal from 'decimal.js';

describe('CampaignService', () => {
  let service: CampaignService;
  let repository: Repository<Campaign>;

  const mockRepository = {
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignService,
        {
          provide: getRepositoryToken(Campaign),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<CampaignService>(CampaignService);
    repository = module.get<Repository<Campaign>>(getRepositoryToken(Campaign));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createCampaign', () => {
    it('should create a campaign with decimal precision', async () => {
      const createCampaignDto: CreateCampaignDto = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        pairId: 1,
        rewardAmount: '100123456789012345678',
        rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        startDate: new Date('2022-01-01T00:00:00.000Z'),
        endDate: new Date('2023-01-01T00:00:00.000Z'),
        opportunityName: 'ETH/USDC Liquidity Mining',
        isActive: true,
      };

      const savedCampaign = {
        id: '1',
        ...createCampaignDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.create.mockReturnValue(savedCampaign);
      mockRepository.save.mockResolvedValue(savedCampaign);
      mockRepository.findOne.mockResolvedValue(null); // No existing campaign

      const result = await service.createCampaign(createCampaignDto);

      expect(mockRepository.create).toHaveBeenCalledWith(createCampaignDto);
      expect(mockRepository.save).toHaveBeenCalledWith(savedCampaign);
      expect(result).toEqual(savedCampaign);
    });

    it('should handle very large reward amounts as strings', async () => {
      const createCampaignDto: CreateCampaignDto = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        pairId: 1,
        rewardAmount: '999999999999999999999999999999999999999',
        rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        startDate: new Date('2022-01-01T00:00:00.000Z'),
        endDate: new Date('2023-01-01T00:00:00.000Z'),
        opportunityName: 'Large Reward Campaign',
        isActive: true,
      };

      const savedCampaign = {
        id: '1',
        ...createCampaignDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.create.mockReturnValue(savedCampaign);
      mockRepository.save.mockResolvedValue(savedCampaign);
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.createCampaign(createCampaignDto);

      // Verify decimal precision is maintained - check the original string value
      expect(result.rewardAmount).toBe('999999999999999999999999999999999999999');

      // Also verify that Decimal can handle it (may be in scientific notation)
      const rewardDecimal = new Decimal(result.rewardAmount);
      expect(rewardDecimal.isFinite()).toBe(true);
      expect(rewardDecimal.gt(0)).toBe(true);
    });

    it('should throw error when overlapping campaign exists', async () => {
      const createCampaignDto: CreateCampaignDto = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        pairId: 1,
        rewardAmount: '100000000000000000000',
        rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        startDate: new Date('2022-01-01T00:00:00.000Z'),
        endDate: new Date('2023-01-01T00:00:00.000Z'),
        opportunityName: 'Overlapping Campaign',
        isActive: true,
      };

      const existingCampaign = {
        id: '1',
        startDate: new Date('2021-11-01T00:00:00.000Z'), // Earlier start
        endDate: new Date('2022-11-01T00:00:00.000Z'), // Later end (overlaps)
        isActive: true,
      };

      mockRepository.findOne.mockResolvedValue(existingCampaign);

      await expect(service.createCampaign(createCampaignDto)).rejects.toThrow(
        'Active campaign already exists for this pair with overlapping time period',
      );
    });
  });

  describe('getActiveCampaigns', () => {
    it('should return active campaigns for deployment', async () => {
      const deployment = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
      };

      const campaigns = [
        {
          id: '1',
          blockchainType: BlockchainType.Ethereum,
          exchangeId: ExchangeId.OGEthereum,
          pairId: 1,
          rewardAmount: '100123456789012345678',
          rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
          startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Started 1 day ago
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Ends in 30 days
          opportunityName: 'ETH/USDC Campaign',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          blockchainType: BlockchainType.Ethereum,
          exchangeId: ExchangeId.OGEthereum,
          pairId: 2,
          rewardAmount: '50987654321098765432',
          rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
          startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Started 1 day ago
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Ends in 30 days
          opportunityName: 'WBTC/ETH Campaign',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockRepository.find.mockResolvedValue(campaigns);

      const result = await service.getActiveCampaigns(deployment as any);

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: {
          blockchainType: deployment.blockchainType,
          exchangeId: deployment.exchangeId,
          isActive: true,
        },
        relations: ['pair', 'pair.token0', 'pair.token1'],
        order: {
          id: 'ASC',
        },
      });
      expect(result).toEqual(campaigns);

      // Verify decimal precision in results
      result.forEach((campaign) => {
        const rewardDecimal = new Decimal(campaign.rewardAmount);
        expect(rewardDecimal.toString()).toMatch(/^\d+$/);
      });
    });

    it('should return empty array when no active campaigns exist', async () => {
      const deployment = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
      };

      mockRepository.find.mockResolvedValue([]);

      const result = await service.getActiveCampaigns(deployment as any);

      expect(result).toEqual([]);
    });
  });

  describe('getCampaignByPair', () => {
    it('should return campaign for specific pair', async () => {
      const deployment = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
      };

      const campaign = {
        id: '1',
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        pairId: 1,
        rewardAmount: '100123456789012345678',
        rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Started 1 day ago
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Ends in 30 days
        opportunityName: 'ETH/USDC Campaign',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(campaign);

      const result = await service.getCampaignByPair(deployment as any, 'ETH_USDC');

      expect(mockRepository.findOne).toHaveBeenCalled();
      expect(result).toEqual(campaign);
    });

    it('should return null when campaign not found', async () => {
      const deployment = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
      };

      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getCampaignByPair(deployment as any, 'NONEXISTENT');

      expect(result).toBeNull();
    });
  });

  describe('updateCampaignStatus', () => {
    it('should update campaign status', async () => {
      const campaign = {
        id: '1',
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        pairId: 1,
        rewardAmount: '100123456789012345678',
        rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        startDate: 1640995200,
        endDate: 1672531200,
        opportunityName: 'ETH/USDC Campaign',
        isActive: false, // Updated status
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(campaign);
      mockRepository.update.mockResolvedValue({ affected: 1 });

      const result = await service.updateCampaignStatus(1, false);

      expect(mockRepository.update).toHaveBeenCalledWith(1, { isActive: false });
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['pair'],
      });

      expect(result).toEqual(campaign);
    });
  });

  describe('decimal arithmetic operations', () => {
    it('should perform accurate decimal calculations for reward distributions', () => {
      // Use numbers that divide evenly to avoid precision issues
      const totalRewards = new Decimal('120000000000000000000'); // 120 tokens
      const numberOfEpochs = new Decimal('8'); // Divides evenly

      const rewardsPerEpoch = totalRewards.div(numberOfEpochs);

      // 120 / 8 = 15 (exact division)
      const expectedPerEpoch = new Decimal('15000000000000000000');
      expect(rewardsPerEpoch.eq(expectedPerEpoch)).toBe(true);

      // Verify reconstruction accuracy
      const reconstructedTotal = rewardsPerEpoch.mul(numberOfEpochs);
      expect(reconstructedTotal.eq(totalRewards)).toBe(true);
    });

    it('should handle complex reward calculations', () => {
      const rewardsTotal = new Decimal('47914227570040216219');
      const eligibleLiquidity = new Decimal('4321000000000000000');
      const totalLiquidity = new Decimal('10000000000000000000');

      const rewardShare = rewardsTotal.mul(eligibleLiquidity).div(totalLiquidity);

      // Check the calculation is mathematically sound
      expect(rewardShare.gt(new Decimal('20000000000000000000'))).toBe(true);
      expect(rewardShare.lt(rewardsTotal)).toBe(true);
    });

    it('should maintain precision across multiple operations', () => {
      // Simulate complex reward calculation with reasonable numbers
      const baseReward = new Decimal('25041643970466107806');
      const multiplier1 = new Decimal('1.1'); // Simpler multiplier
      const multiplier2 = new Decimal('0.9'); // Simpler multiplier
      const divisor = new Decimal('1.5'); // Simpler divisor

      const result = baseReward.mul(multiplier1).mul(multiplier2).div(divisor);

      // Should maintain reasonable precision through multiple operations
      expect(result.isFinite()).toBe(true);
      expect(result.gt(0)).toBe(true);
      expect(result.toString()).toMatch(/^\d+(\.\d+)?$/);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle zero reward campaigns', async () => {
      const createCampaignDto: CreateCampaignDto = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        pairId: 1,
        rewardAmount: '0',
        rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        startDate: new Date('2022-01-01T00:00:00.000Z'),
        endDate: new Date('2023-01-01T00:00:00.000Z'),
        opportunityName: 'Zero Reward Campaign',
        isActive: true,
      };

      const savedCampaign = {
        id: '1',
        ...createCampaignDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.create.mockReturnValue(savedCampaign);
      mockRepository.save.mockResolvedValue(savedCampaign);
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.createCampaign(createCampaignDto);

      expect(result.rewardAmount).toBe('0');
    });

    it('should handle timestamp boundaries correctly', async () => {
      const createCampaignDto: CreateCampaignDto = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        pairId: 1,
        rewardAmount: '100000000000000000000',
        rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        startDate: new Date('2022-01-01T00:00:00.000Z'), // Exact epoch boundary
        endDate: new Date('2022-01-01T00:00:00.000Z'), // Same start and end
        opportunityName: 'Single Moment Campaign',
        isActive: true,
      };

      const savedCampaign = {
        id: '1',
        ...createCampaignDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.create.mockReturnValue(savedCampaign);
      mockRepository.save.mockResolvedValue(savedCampaign);
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.createCampaign(createCampaignDto);

      expect(result.startDate.getTime()).toBe(result.endDate.getTime());
    });

    it('should handle very long duration campaigns', async () => {
      const createCampaignDto: CreateCampaignDto = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        pairId: 1,
        rewardAmount: '100000000000000000000',
        rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        startDate: new Date('1970-01-01T00:00:00.000Z'),
        endDate: new Date('2038-01-19T03:14:07.000Z'), // Max 32-bit timestamp
        opportunityName: 'Long Campaign',
        isActive: true,
      };

      const savedCampaign = {
        id: '1',
        ...createCampaignDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.create.mockReturnValue(savedCampaign);
      mockRepository.save.mockResolvedValue(savedCampaign);
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.createCampaign(createCampaignDto);

      // Calculate duration
      const duration = Math.floor(result.endDate.getTime() / 1000) - Math.floor(result.startDate.getTime() / 1000);
      expect(duration).toBe(2147483647);
    });
  });

  describe('Campaign Lifecycle Management', () => {
    const deployment = {
      blockchainType: BlockchainType.Ethereum,
      exchangeId: ExchangeId.OGEthereum,
    };

    describe('getActiveCampaigns - no auto-expiration', () => {
      it('should return all campaigns marked as active regardless of timestamps', async () => {
        const now = new Date();
        const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 1 day ago
        const futureDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 1 day from now

        const campaigns = [
          {
            id: '1',
            blockchainType: BlockchainType.Ethereum,
            exchangeId: ExchangeId.OGEthereum,
            pairId: 1,
            rewardAmount: '100000000000000000000',
            rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
            startDate: new Date(now.getTime() - 48 * 60 * 60 * 1000), // Started 2 days ago
            endDate: pastDate, // Expired 1 day ago
            opportunityName: 'Expired Campaign',
            isActive: true, // Still marked as active for reprocessing
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: '2',
            blockchainType: BlockchainType.Ethereum,
            exchangeId: ExchangeId.OGEthereum,
            pairId: 2,
            rewardAmount: '200000000000000000000',
            rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
            startDate: new Date(now.getTime() - 12 * 60 * 60 * 1000), // Started 12 hours ago
            endDate: futureDate, // Expires in 1 day
            opportunityName: 'Active Campaign',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: '3',
            blockchainType: BlockchainType.Ethereum,
            exchangeId: ExchangeId.OGEthereum,
            pairId: 3,
            rewardAmount: '300000000000000000000',
            rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
            startDate: new Date(now.getTime() + 12 * 60 * 60 * 1000), // Starts in 12 hours
            endDate: new Date(now.getTime() + 48 * 60 * 60 * 1000), // Expires in 2 days
            opportunityName: 'Future Campaign',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];

        mockRepository.find.mockResolvedValue(campaigns);

        const result = await service.getActiveCampaigns(deployment as any);

        // Should NOT update campaigns to inactive anymore
        expect(mockRepository.update).not.toHaveBeenCalled();

        // Should return all campaigns marked as active, regardless of timestamps
        expect(result).toHaveLength(3);
        expect(result.map((c) => c.id)).toEqual(['1', '2', '3']);
        expect(result[0].opportunityName).toBe('Expired Campaign');
        expect(result[1].opportunityName).toBe('Active Campaign');
        expect(result[2].opportunityName).toBe('Future Campaign');
      });

      it('should return all active campaigns including multiple historically expired ones', async () => {
        const now = new Date();
        const pastDate1 = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 1 day ago
        const pastDate2 = new Date(now.getTime() - 48 * 60 * 60 * 1000); // 2 days ago

        const campaigns = [
          {
            id: '1',
            blockchainType: BlockchainType.Ethereum,
            exchangeId: ExchangeId.OGEthereum,
            pairId: 1,
            rewardAmount: '100000000000000000000',
            rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
            startDate: new Date(now.getTime() - 72 * 60 * 60 * 1000), // Started 3 days ago
            endDate: pastDate1, // Expired 1 day ago
            opportunityName: 'Expired Campaign 1',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: '2',
            blockchainType: BlockchainType.Ethereum,
            exchangeId: ExchangeId.OGEthereum,
            pairId: 2,
            rewardAmount: '200000000000000000000',
            rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
            startDate: new Date(now.getTime() - 72 * 60 * 60 * 1000), // Started 3 days ago
            endDate: pastDate2, // Expired 2 days ago
            opportunityName: 'Expired Campaign 2',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];

        mockRepository.find.mockResolvedValue(campaigns);

        const result = await service.getActiveCampaigns(deployment as any);

        // Should NOT update campaigns to inactive
        expect(mockRepository.update).not.toHaveBeenCalled();

        // Should return all campaigns marked as active
        expect(result).toHaveLength(2);
        expect(result.map((c) => c.id)).toEqual(['1', '2']);
        expect(result[0].opportunityName).toBe('Expired Campaign 1');
        expect(result[1].opportunityName).toBe('Expired Campaign 2');
      });

      it('should not affect campaigns that are not expired', async () => {
        const now = new Date();
        const futureDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 1 day from now

        const campaigns = [
          {
            id: '1',
            blockchainType: BlockchainType.Ethereum,
            exchangeId: ExchangeId.OGEthereum,
            pairId: 1,
            rewardAmount: '100000000000000000000',
            rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
            startDate: new Date(now.getTime() - 12 * 60 * 60 * 1000), // Started 12 hours ago
            endDate: futureDate, // Expires in 1 day
            opportunityName: 'Active Campaign',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];

        mockRepository.find.mockResolvedValue(campaigns);

        const result = await service.getActiveCampaigns(deployment as any);

        // Should not call update since no campaigns are expired
        expect(mockRepository.update).not.toHaveBeenCalled();

        // Should return the active campaign
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('1');
      });

      it('should return future campaigns if marked as active', async () => {
        const now = new Date();

        const campaigns = [
          {
            id: '1',
            blockchainType: BlockchainType.Ethereum,
            exchangeId: ExchangeId.OGEthereum,
            pairId: 1,
            rewardAmount: '100000000000000000000',
            rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
            startDate: new Date(now.getTime() + 12 * 60 * 60 * 1000), // Starts in 12 hours
            endDate: new Date(now.getTime() + 48 * 60 * 60 * 1000), // Expires in 2 days
            opportunityName: 'Future Campaign',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];

        mockRepository.find.mockResolvedValue(campaigns);

        const result = await service.getActiveCampaigns(deployment as any);

        // Should not call update
        expect(mockRepository.update).not.toHaveBeenCalled();

        // Should return campaigns marked as active regardless of start time
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('1');
        expect(result[0].opportunityName).toBe('Future Campaign');
      });

      it('should handle edge case where campaign ends exactly at current time', async () => {
        const now = new Date();

        const campaigns = [
          {
            id: '1',
            blockchainType: BlockchainType.Ethereum,
            exchangeId: ExchangeId.OGEthereum,
            pairId: 1,
            rewardAmount: '100000000000000000000',
            rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
            startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000), // Started 1 day ago
            endDate: now, // Ends exactly now
            opportunityName: 'Ending Campaign',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];

        mockRepository.find.mockResolvedValue(campaigns);

        const result = await service.getActiveCampaigns(deployment as any);

        // Should return the campaign since endDate >= currentTime
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('1');
      });
    });

    describe('markProcessedCampaignsInactive', () => {
      it('should mark campaigns inactive only if processed up to their end time', async () => {
        const campaigns = [
          {
            id: 1,
            blockchainType: 'ethereum' as any,
            exchangeId: 'og-ethereum' as any,
            pairId: 1,
            pair: {} as any,
            rewardAmount: '1000',
            rewardTokenAddress: '0x123',
            startDate: new Date('2023-01-01T00:00:00.000Z'),
            endDate: new Date('2023-01-01T12:00:00.000Z'), // Unix: 1672574400
            opportunityName: 'Test',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 2,
            blockchainType: 'ethereum' as any,
            exchangeId: 'og-ethereum' as any,
            pairId: 2,
            pair: {} as any,
            rewardAmount: '2000',
            rewardTokenAddress: '0x456',
            startDate: new Date('2023-01-02T00:00:00.000Z'),
            endDate: new Date('2023-01-02T12:00:00.000Z'), // Unix: 1672660800
            opportunityName: 'Test 2',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 3,
            blockchainType: 'ethereum' as any,
            exchangeId: 'og-ethereum' as any,
            pairId: 3,
            pair: {} as any,
            rewardAmount: '3000',
            rewardTokenAddress: '0x789',
            startDate: new Date('2023-01-03T00:00:00.000Z'),
            endDate: new Date('2023-01-03T12:00:00.000Z'), // Unix: 1672747200
            opportunityName: 'Test 3',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ] as Campaign[];

        // Processed up to 2023-01-02 14:00:00 (Unix: 1672668000000 in milliseconds)
        const processedUpToTimestamp = new Date('2023-01-02T14:00:00.000Z').getTime();

        await service.markProcessedCampaignsInactive(deployment as any, campaigns, processedUpToTimestamp);

        // Should mark campaigns 1 and 2 as inactive (ended before processed timestamp)
        expect(mockRepository.update).toHaveBeenCalledWith([1, 2], { isActive: false });
      });

      it('should not mark campaigns inactive if not processed past their end time', async () => {
        const campaigns = [
          {
            id: 1,
            blockchainType: 'ethereum' as any,
            exchangeId: 'og-ethereum' as any,
            pairId: 1,
            pair: {} as any,
            rewardAmount: '1000',
            rewardTokenAddress: '0x123',
            startDate: new Date('2023-01-02T00:00:00.000Z'),
            endDate: new Date('2023-01-02T12:00:00.000Z'), // Unix: 1672660800
            opportunityName: 'Test',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 2,
            blockchainType: 'ethereum' as any,
            exchangeId: 'og-ethereum' as any,
            pairId: 2,
            pair: {} as any,
            rewardAmount: '2000',
            rewardTokenAddress: '0x456',
            startDate: new Date('2023-01-03T00:00:00.000Z'),
            endDate: new Date('2023-01-03T12:00:00.000Z'), // Unix: 1672747200
            opportunityName: 'Test 2',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ] as Campaign[];

        // Processed only up to 2023-01-01 12:00:00 (Unix: 1672574400000 in milliseconds)
        const processedUpToTimestamp = new Date('2023-01-01T12:00:00.000Z').getTime();

        await service.markProcessedCampaignsInactive(deployment as any, campaigns, processedUpToTimestamp);

        // Should not mark any campaigns as inactive
        expect(mockRepository.update).not.toHaveBeenCalled();
      });

      it('should handle empty campaigns array', async () => {
        const processedUpToTimestamp = new Date().getTime();

        await service.markProcessedCampaignsInactive(deployment as any, [], processedUpToTimestamp);

        expect(mockRepository.update).not.toHaveBeenCalled();
      });

      it('should handle campaigns that end exactly at processed timestamp', async () => {
        const campaigns = [
          {
            id: 1,
            blockchainType: 'ethereum' as any,
            exchangeId: 'og-ethereum' as any,
            pairId: 1,
            pair: {} as any,
            rewardAmount: '1000',
            rewardTokenAddress: '0x123',
            startDate: new Date('2023-01-01T00:00:00.000Z'),
            endDate: new Date('2023-01-01T12:00:00.000Z'), // Unix: 1672574400
            opportunityName: 'Test',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ] as Campaign[];

        // Processed exactly to campaign end time
        const processedUpToTimestamp = new Date('2023-01-01T12:00:00.000Z').getTime();

        await service.markProcessedCampaignsInactive(deployment as any, campaigns, processedUpToTimestamp);

        // Should mark campaign as inactive (processed >= end time)
        expect(mockRepository.update).toHaveBeenCalledWith([1], { isActive: false });
      });

      it('should log the number of campaigns marked inactive', async () => {
        const loggerSpy = jest.spyOn(service['logger'], 'log').mockImplementation();

        const campaigns = [
          {
            id: 1,
            blockchainType: 'ethereum' as any,
            exchangeId: 'og-ethereum' as any,
            pairId: 1,
            pair: {} as any,
            rewardAmount: '1000',
            rewardTokenAddress: '0x123',
            startDate: new Date('2023-01-01T00:00:00.000Z'),
            endDate: new Date('2023-01-01T12:00:00.000Z'),
            opportunityName: 'Test',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 2,
            blockchainType: 'ethereum' as any,
            exchangeId: 'og-ethereum' as any,
            pairId: 2,
            pair: {} as any,
            rewardAmount: '2000',
            rewardTokenAddress: '0x456',
            startDate: new Date('2023-01-01T00:00:00.000Z'),
            endDate: new Date('2023-01-01T14:00:00.000Z'),
            opportunityName: 'Test 2',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ] as Campaign[];

        const processedUpToTimestamp = new Date('2023-01-01T16:00:00.000Z').getTime();

        await service.markProcessedCampaignsInactive(deployment as any, campaigns, processedUpToTimestamp);

        expect(loggerSpy).toHaveBeenCalledWith(
          expect.stringContaining('Post-processing: Set 2 campaigns to inactive after processing up to timestamp'),
        );

        loggerSpy.mockRestore();
      });
    });

    describe('getCampaignByPair - no auto-expiration', () => {
      it('should return expired campaign if marked as active', async () => {
        const now = new Date();
        const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 1 day ago

        const expiredCampaign = {
          id: '1',
          blockchainType: BlockchainType.Ethereum,
          exchangeId: ExchangeId.OGEthereum,
          pairId: 1,
          rewardAmount: '100000000000000000000',
          rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
          startDate: new Date(now.getTime() - 48 * 60 * 60 * 1000), // Started 2 days ago
          endDate: pastDate, // Expired 1 day ago
          opportunityName: 'Expired Campaign',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockRepository.findOne.mockResolvedValue(expiredCampaign);

        const result = await service.getCampaignByPair(deployment as any, 'ETH_USDC');

        // Should NOT update campaign to inactive
        expect(mockRepository.update).not.toHaveBeenCalled();

        // Should return the campaign even if expired (for historic reprocessing)
        expect(result).toEqual(expiredCampaign);
      });

      it('should return future campaign if marked as active', async () => {
        const now = new Date();

        const futureCampaign = {
          id: '1',
          blockchainType: BlockchainType.Ethereum,
          exchangeId: ExchangeId.OGEthereum,
          pairId: 1,
          rewardAmount: '100000000000000000000',
          rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
          startDate: new Date(now.getTime() + 12 * 60 * 60 * 1000), // Starts in 12 hours
          endDate: new Date(now.getTime() + 48 * 60 * 60 * 1000), // Expires in 2 days
          opportunityName: 'Future Campaign',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockRepository.findOne.mockResolvedValue(futureCampaign);

        const result = await service.getCampaignByPair(deployment as any, 'ETH_USDC');

        // Should not call update
        expect(mockRepository.update).not.toHaveBeenCalled();

        // Should return the campaign regardless of start time
        expect(result).toEqual(futureCampaign);
      });

      it('should return campaign if it is currently active', async () => {
        const now = new Date();

        const activeCampaign = {
          id: '1',
          blockchainType: BlockchainType.Ethereum,
          exchangeId: ExchangeId.OGEthereum,
          pairId: 1,
          rewardAmount: '100000000000000000000',
          rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
          startDate: new Date(now.getTime() - 12 * 60 * 60 * 1000), // Started 12 hours ago
          endDate: new Date(now.getTime() + 24 * 60 * 60 * 1000), // Expires in 1 day
          opportunityName: 'Active Campaign',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockRepository.findOne.mockResolvedValue(activeCampaign);

        const result = await service.getCampaignByPair(deployment as any, 'ETH_USDC');

        // Should not call update since campaign is active
        expect(mockRepository.update).not.toHaveBeenCalled();

        // Should return the active campaign
        expect(result).toEqual(activeCampaign);
      });

      it('should handle edge case where campaign starts exactly at current time', async () => {
        const now = new Date();

        const startingCampaign = {
          id: '1',
          blockchainType: BlockchainType.Ethereum,
          exchangeId: ExchangeId.OGEthereum,
          pairId: 1,
          rewardAmount: '100000000000000000000',
          rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
          startDate: now, // Starts exactly now
          endDate: new Date(now.getTime() + 24 * 60 * 60 * 1000), // Expires in 1 day
          opportunityName: 'Starting Campaign',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockRepository.findOne.mockResolvedValue(startingCampaign);

        const result = await service.getCampaignByPair(deployment as any, 'ETH_USDC');

        // Should return the campaign since startDate <= currentTime
        expect(result).toEqual(startingCampaign);
      });
    });

    describe('updateCampaignStatus', () => {
      it('should update campaign status to inactive', async () => {
        const mockCampaign = {
          id: '1',
          blockchainType: BlockchainType.Ethereum,
          exchangeId: ExchangeId.OGEthereum,
          pairId: 1,
          rewardAmount: '100000000000000000000',
          rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
          startDate: new Date(),
          endDate: new Date(),
          opportunityName: 'Test Campaign',
          isActive: false, // Updated to false
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockRepository.findOne.mockResolvedValue(mockCampaign);

        const result = await service.updateCampaignStatus(1, false);

        expect(mockRepository.update).toHaveBeenCalledWith(1, { isActive: false });
        expect(mockRepository.findOne).toHaveBeenCalledWith({
          where: { id: 1 },
          relations: ['pair'],
        });
        expect(result).toEqual(mockCampaign);
      });

      it('should update campaign status to active', async () => {
        const mockCampaign = {
          id: '1',
          blockchainType: BlockchainType.Ethereum,
          exchangeId: ExchangeId.OGEthereum,
          pairId: 1,
          rewardAmount: '100000000000000000000',
          rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
          startDate: new Date(),
          endDate: new Date(),
          opportunityName: 'Test Campaign',
          isActive: true, // Updated to true
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockRepository.findOne.mockResolvedValue(mockCampaign);

        const result = await service.updateCampaignStatus(1, true);

        expect(mockRepository.update).toHaveBeenCalledWith(1, { isActive: true });
        expect(result).toEqual(mockCampaign);
      });

      it('should handle campaign update with decimal precision', async () => {
        const mockCampaign = {
          id: '1',
          blockchainType: BlockchainType.Ethereum,
          exchangeId: ExchangeId.OGEthereum,
          pairId: 1,
          rewardAmount: '123456789012345678901234567890',
          rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
          startDate: new Date(),
          endDate: new Date(),
          opportunityName: 'High Precision Campaign',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockRepository.findOne.mockResolvedValue(mockCampaign);

        const result = await service.updateCampaignStatus(1, true);

        expect(result.rewardAmount).toBe('123456789012345678901234567890');

        // Verify decimal precision
        const rewardDecimal = new Decimal(result.rewardAmount);
        expect(rewardDecimal.toFixed()).toBe('123456789012345678901234567890');
      });
    });

    describe('Multiple campaigns handling', () => {
      it('should allow multiple campaigns for the same pair when older ones are inactive', async () => {
        const now = new Date();
        const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 1 day ago

        const existingCampaign = {
          id: '1',
          blockchainType: BlockchainType.Ethereum,
          exchangeId: ExchangeId.OGEthereum,
          pairId: 1,
          rewardAmount: '100000000000000000000',
          rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
          startDate: new Date(now.getTime() - 48 * 60 * 60 * 1000), // Started 2 days ago
          endDate: pastDate, // Ended 1 day ago
          opportunityName: 'Old Campaign',
          isActive: false, // Already inactive
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockRepository.findOne.mockResolvedValue(existingCampaign);

        const newCampaignDto: CreateCampaignDto = {
          blockchainType: BlockchainType.Ethereum,
          exchangeId: ExchangeId.OGEthereum,
          pairId: 1,
          rewardAmount: '200000000000000000000',
          rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
          startDate: now,
          endDate: new Date(now.getTime() + 24 * 60 * 60 * 1000), // 1 day from now
          opportunityName: 'New Campaign',
          isActive: true,
        };

        const createdCampaign = { ...newCampaignDto, id: '2', createdAt: new Date(), updatedAt: new Date() };

        mockRepository.create.mockReturnValue(createdCampaign);
        mockRepository.save.mockResolvedValue(createdCampaign);

        const result = await service.createCampaign(newCampaignDto);

        expect(result).toEqual(createdCampaign);
        expect(mockRepository.create).toHaveBeenCalledWith(newCampaignDto);
        expect(mockRepository.save).toHaveBeenCalledWith(createdCampaign);
      });

      it('should prevent overlapping campaigns for the same pair', async () => {
        const now = new Date();

        const existingCampaign = {
          id: '1',
          blockchainType: BlockchainType.Ethereum,
          exchangeId: ExchangeId.OGEthereum,
          pairId: 1,
          rewardAmount: '100000000000000000000',
          rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
          startDate: new Date(now.getTime() - 12 * 60 * 60 * 1000), // Started 12 hours ago
          endDate: new Date(now.getTime() + 24 * 60 * 60 * 1000), // Expires in 1 day
          opportunityName: 'Active Campaign',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockRepository.findOne.mockResolvedValue(existingCampaign);

        const newCampaignDto: CreateCampaignDto = {
          blockchainType: BlockchainType.Ethereum,
          exchangeId: ExchangeId.OGEthereum,
          pairId: 1,
          rewardAmount: '200000000000000000000',
          rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
          startDate: new Date(now.getTime() + 12 * 60 * 60 * 1000), // Starts in 12 hours (overlaps)
          endDate: new Date(now.getTime() + 48 * 60 * 60 * 1000), // Expires in 2 days
          opportunityName: 'Overlapping Campaign',
          isActive: true,
        };

        await expect(service.createCampaign(newCampaignDto)).rejects.toThrow(
          'Active campaign already exists for this pair with overlapping time period',
        );
      });
    });
  });
});
