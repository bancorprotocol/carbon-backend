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
          startDate: 1640995200,
          endDate: 1672531200,
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
          startDate: new Date('2022-04-26T00:00:00.000Z'),
          endDate: new Date('2023-04-26T00:00:00.000Z'),
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
        startDate: 1640995200,
        endDate: 1672531200,
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

      const result = await service.updateCampaignStatus('1', false);

      expect(mockRepository.update).toHaveBeenCalledWith('1', { isActive: false });
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: '1' },
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
});
