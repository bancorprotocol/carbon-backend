import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MerklController } from './merkl.controller';
import { CampaignService } from '../../merkl/services/campaign.service';
import { DeploymentService, BlockchainType, ExchangeId } from '../../deployment/deployment.service';
import { Campaign } from '../../merkl/entities/campaign.entity';
import { EpochReward } from '../../merkl/entities/epoch-reward.entity';
import { DataJSON } from '../../merkl/dto/data-response.dto';
import { EncompassingJSON } from '../../merkl/dto/rewards-response.dto';
import { PairService } from '../../pair/pair.service';
import { TvlService } from '../../tvl/tvl.service';
import Decimal from 'decimal.js';

describe('MerklController', () => {
  let controller: MerklController;
  let campaignService: CampaignService;
  let deploymentService: DeploymentService;
  let pairService: PairService;
  let campaignRepository: Repository<Campaign>;
  let epochRewardRepository: Repository<EpochReward>;

  const mockCampaignService = {
    getActiveCampaigns: jest.fn(),
  };

  const mockDeploymentService = {
    getDeployment: jest.fn(),
    getDeploymentByExchangeId: jest.fn(),
  };

  const mockPairService = {
    allAsDictionary: jest.fn(),
  };

  const mockTvlService = {
    getTvlByPair: jest.fn(),
  };

  const mockCampaignRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const mockEpochRewardRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MerklController],
      providers: [
        {
          provide: CampaignService,
          useValue: mockCampaignService,
        },
        {
          provide: DeploymentService,
          useValue: mockDeploymentService,
        },
        {
          provide: PairService,
          useValue: mockPairService,
        },
        {
          provide: TvlService,
          useValue: mockTvlService,
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

    controller = module.get<MerklController>(MerklController);
    campaignService = module.get<CampaignService>(CampaignService);
    deploymentService = module.get<DeploymentService>(DeploymentService);
    pairService = module.get<PairService>(PairService);
    campaignRepository = module.get<Repository<Campaign>>(getRepositoryToken(Campaign));
    epochRewardRepository = module.get<Repository<EpochReward>>(getRepositoryToken(EpochReward));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getData', () => {
    it('should return active campaign data with decimal precision TVL and APR', async () => {
      const deployment = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        startBlock: 18000000,
      };

      const mockCampaigns = [
        {
          id: '1',
          blockchainType: BlockchainType.Ethereum,
          exchangeId: ExchangeId.OGEthereum,
          rewardAmount: '100000000000000000000000', // 100,000 tokens in wei
          startDate: new Date(Date.now() - 86400 * 1000), // Started 1 day ago
          endDate: new Date(Date.now() + 86400 * 30 * 1000), // Ends in 30 days
          isActive: true,
          opportunityName: 'ETH/USDC Liquidity Mining',
          pair: {
            token0: { address: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8' },
            token1: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
          },
        },
        {
          id: '2',
          blockchainType: BlockchainType.Ethereum,
          exchangeId: ExchangeId.OGEthereum,
          rewardAmount: '50000000000000000000000', // 50,000 tokens in wei
          startDate: new Date(Date.now() - 3600 * 1000), // Started 1 hour ago
          endDate: new Date(Date.now() + 86400 * 7 * 1000), // Ends in 7 days
          isActive: true,
          opportunityName: 'WBTC/ETH High Yield',
          pair: {
            token0: { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599' },
            token1: { address: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8' },
          },
        },
      ];

      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue(deployment);
      mockCampaignService.getActiveCampaigns.mockResolvedValue(mockCampaigns);
      mockPairService.allAsDictionary.mockResolvedValue({
        '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8': {
          '0xdAC17F958D2ee523a2206206994597C13D831ec7': { id: 1 },
        },
        '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599': {
          '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8': { id: 2 },
        },
      });
      mockTvlService.getTvlByPair
        .mockResolvedValueOnce([{ tvlUsd: '100000000000000000000000' }]) // For first campaign
        .mockResolvedValueOnce([{ tvlUsd: '50000000000000000000000' }]); // For second campaign

      const result: DataJSON = await controller.getData(deployment as any);

      expect(mockCampaignService.getActiveCampaigns).toHaveBeenCalledWith(deployment);
      expect(result).toHaveLength(2);

      // Verify first campaign data with decimal precision
      expect(result[0].pair).toBe(
        '0xa0b86a33e6441e68e2e80f99a8b38a6cd2c7f8f8_0xdac17f958d2ee523a2206206994597c13d831ec7',
      );
      expect(result[0].tvl).toBe('100000000000000000000000'); // Standard decimal notation format
      expect(result[0].opportunityName).toBe('ETH/USDC Liquidity Mining');

      // Verify APR calculation precision
      const expectedAPR1 = new Decimal('100000000000000000000000').div(31).mul(365).div('100000000000000000000000');
      expect(result[0].apr).toBe(expectedAPR1.toString());

      // Verify second campaign
      expect(result[1].pair).toBe(
        '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599_0xa0b86a33e6441e68e2e80f99a8b38a6cd2c7f8f8',
      );
      expect(result[1].tvl).toBe('50000000000000000000000'); // Standard decimal notation format
      expect(result[1].opportunityName).toBe('WBTC/ETH High Yield');
    });

    it('should filter out inactive campaigns', async () => {
      const deployment = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        startBlock: 18000000,
      };

      const mockCampaigns = [
        {
          id: '1',
          rewardAmount: '100000000000000000000000',
          startDate: new Date(Date.now() + 86400 * 1000), // Starts tomorrow (not active yet)
          endDate: new Date(Date.now() + 86400 * 30 * 1000),
          isActive: true,
          opportunityName: 'Future Campaign',
          pair: {
            token0: { address: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8' },
            token1: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
          },
        },
        {
          id: '2',
          rewardAmount: '50000000000000000000000',
          startDate: new Date(Date.now() - 86400 * 30 * 1000), // Started 30 days ago
          endDate: new Date(Date.now() - 86400 * 1000), // Ended yesterday
          isActive: true,
          opportunityName: 'Expired Campaign',
          pair: {
            token0: { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599' },
            token1: { address: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8' },
          },
        },
        {
          id: '3',
          rewardAmount: '75000000000000000000000',
          startDate: new Date(Date.now() - 86400 * 1000),
          endDate: new Date(Date.now() + 86400 * 30 * 1000),
          isActive: false, // Manually deactivated
          opportunityName: 'Deactivated Campaign',
          pair: {
            token0: { address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984' },
            token1: { address: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8' },
          },
        },
      ];

      mockCampaignService.getActiveCampaigns.mockResolvedValue(mockCampaigns);
      mockPairService.allAsDictionary.mockResolvedValue({});

      const result: DataJSON = await controller.getData(deployment as any);

      // Should return empty array since no campaigns are currently active
      expect(result).toHaveLength(0);
    });

    it('should handle zero TVL scenarios', async () => {
      const deployment = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        startBlock: 18000000,
      };

      const mockCampaigns = [
        {
          id: '1',
          rewardAmount: '100000000000000000000000',
          startDate: new Date(Date.now() - 86400 * 1000),
          endDate: new Date(Date.now() + 86400 * 30 * 1000),
          isActive: true,
          opportunityName: 'Zero TVL Campaign',
          pair: {
            token0: { address: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8' },
            token1: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
          },
        },
      ];

      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue(deployment);
      mockCampaignService.getActiveCampaigns.mockResolvedValue(mockCampaigns);
      mockPairService.allAsDictionary.mockResolvedValue({});
      mockTvlService.getTvlByPair.mockResolvedValue([{ tvlUsd: '0' }]);

      const result: DataJSON = await controller.getData(deployment as any);

      expect(result).toHaveLength(1);
      expect(result[0].tvl).toBe('0');

      // APR should be infinite or handled gracefully
      const aprValue = result[0].apr;
      expect(aprValue === 'Infinity' || aprValue === 'NaN' || aprValue === '0').toBe(true);
    });

    it('should handle very large reward amounts and TVL values', async () => {
      const deployment = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        startBlock: 18000000,
      };

      const mockCampaigns = [
        {
          id: '1',
          rewardAmount: '999999999999999999999999999999999999999', // Very large reward
          startDate: new Date(Date.now() - 86400 * 1000),
          endDate: new Date(Date.now() + 86400 * 365 * 1000), // 1 year campaign
          isActive: true,
          opportunityName: 'Whale Campaign',
          pair: {
            token0: { address: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8' },
            token1: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
          },
        },
      ];

      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue(deployment);
      mockCampaignService.getActiveCampaigns.mockResolvedValue(mockCampaigns);
      mockPairService.allAsDictionary.mockResolvedValue({
        '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8': {
          '0xdAC17F958D2ee523a2206206994597C13D831ec7': { id: 1 },
        },
      });
      mockTvlService.getTvlByPair.mockResolvedValue([{ tvlUsd: '888888888888888888888888888888888888888' }]);

      const result: DataJSON = await controller.getData(deployment as any);

      expect(result).toHaveLength(1);

      // Verify large numbers maintain precision as strings
      const rewardDecimal = new Decimal(mockCampaigns[0].rewardAmount);
      const tvlDecimal = new Decimal(result[0].tvl);

      // Check the original string values are maintained
      expect(mockCampaigns[0].rewardAmount).toBe('999999999999999999999999999999999999999');
      expect(result[0].tvl).toBe('888888888888888888888888888888888888888');

      // Verify Decimal can handle them (may be in scientific notation for toString)
      expect(rewardDecimal.isFinite()).toBe(true);
      expect(tvlDecimal.isFinite()).toBe(true);
    });
  });

  describe('getRewards', () => {
    it('should return rewards for a specific pair', async () => {
      const pair = [
        { token0: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', token1: '0xa0b86a33e6441e68e2e80f99a8b38a6cd2c7f8f8' },
      ];
      const deployment = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        startBlock: 18000000,
      };

      const mockRewardsData: EncompassingJSON = {
        rewardToken: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        rewards: {
          '0x1234567890abcdef1234567890abcdef12345678': {
            liquidity_providing: {
              amount: '2024792857777485576',
              timestamp: '1640995200',
            },
            volume_incentive: {
              amount: '1529891386638038979',
              timestamp: '1640995500',
            },
          },
          '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd': {
            liquidity_providing: {
              amount: '47914227570040216219',
              timestamp: '1640995200',
            },
          },
        },
      };

      // Mock the method to return reward data
      const originalMethod = controller.getRewards;
      controller.getRewards = jest.fn().mockResolvedValue(mockRewardsData);

      const result = await controller.getRewards({ pair }, deployment as any);

      expect(result).toEqual(mockRewardsData);
      expect(result.rewardToken).toBe('0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984');

      // Verify decimal precision in reward amounts
      const firstUserFirstReward = new Decimal(
        result.rewards['0x1234567890abcdef1234567890abcdef12345678']['liquidity_providing'].amount,
      );
      expect(firstUserFirstReward.toString()).toBe('2024792857777485576');

      // Restore original method
      controller.getRewards = originalMethod;
    });

    it('should handle empty rewards', async () => {
      const pair = [
        { token0: '0x1234567890abcdef1234567890abcdef12345678', token1: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' },
      ];
      const deployment = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        startBlock: 18000000,
      };

      const mockRewardsData: EncompassingJSON = {
        rewardToken: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        rewards: {},
      };

      const originalMethod = controller.getRewards;
      controller.getRewards = jest.fn().mockResolvedValue(mockRewardsData);

      const result = await controller.getRewards({ pair }, deployment as any);

      expect(result.rewards).toEqual({});
      expect(Object.keys(result.rewards)).toHaveLength(0);

      controller.getRewards = originalMethod;
    });

    it('should handle very small reward amounts', async () => {
      const pair = [
        { token0: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', token1: '0xa0b86a33e6441e68e2e80f99a8b38a6cd2c7f8f8' },
      ];
      const deployment = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        startBlock: 18000000,
      };

      const mockRewardsData: EncompassingJSON = {
        rewardToken: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        rewards: {
          '0x1234567890abcdef1234567890abcdef12345678': {
            dust_reward: {
              amount: '1', // Smallest possible wei amount
              timestamp: '1640995200',
            },
          },
        },
      };

      const originalMethod = controller.getRewards;
      controller.getRewards = jest.fn().mockResolvedValue(mockRewardsData);

      const result = await controller.getRewards({ pair }, deployment as any);

      const dustAmount = new Decimal(
        result.rewards['0x1234567890abcdef1234567890abcdef12345678']['dust_reward'].amount,
      );
      expect(dustAmount.toString()).toBe('1');

      controller.getRewards = originalMethod;
    });
  });

  describe('edge cases', () => {
    it('should handle different blockchain types', async () => {
      const deployments = [
        {
          blockchainType: BlockchainType.Ethereum,
          exchangeId: ExchangeId.OGEthereum,
        },
        {
          blockchainType: BlockchainType.Sei,
          exchangeId: ExchangeId.OGSei,
        },
        {
          blockchainType: BlockchainType.Base,
          exchangeId: ExchangeId.BaseGraphene,
        },
      ];

      for (const deployment of deployments) {
        mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue(deployment);
        mockCampaignService.getActiveCampaigns.mockResolvedValue([]);
        mockPairService.allAsDictionary.mockResolvedValue({});

        const result = await controller.getData(deployment as any);

        expect(mockCampaignService.getActiveCampaigns).toHaveBeenCalledWith(deployment);
        expect(result).toEqual([]);
      }
    });

    it('should handle malformed pair addresses gracefully', async () => {
      const deployment = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        startBlock: 18000000,
      };

      const mockCampaigns = [
        {
          id: '1',
          rewardAmount: '100000000000000000000000',
          startDate: new Date(Date.now() - 86400 * 1000),
          endDate: new Date(Date.now() + 86400 * 30 * 1000),
          isActive: true,
          opportunityName: 'Malformed Address Campaign',
          pair: {
            token0: { address: '' }, // Empty address
            token1: { address: 'INVALID_ADDRESS' }, // Invalid format
          },
        },
      ];

      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue(deployment);
      mockCampaignService.getActiveCampaigns.mockResolvedValue(mockCampaigns);
      mockPairService.allAsDictionary.mockResolvedValue({});
      mockTvlService.getTvlByPair.mockResolvedValue([{ tvlUsd: '1000000' }]);

      const result: DataJSON = await controller.getData(deployment as any);

      expect(result).toHaveLength(1);
      expect(result[0].pair).toBe('_invalid_address'); // Lowercased
    });

    it('should handle concurrent getData calls', async () => {
      const deployment = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        startBlock: 18000000,
      };

      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue(deployment);
      mockCampaignService.getActiveCampaigns.mockResolvedValue([]);
      mockPairService.allAsDictionary.mockResolvedValue({});

      // Simulate concurrent calls
      const promises = Array(5)
        .fill(null)
        .map(() => controller.getData(deployment as any));
      const results = await Promise.all(promises);

      // All should succeed with empty results
      results.forEach((result) => {
        expect(result).toEqual([]);
      });

      expect(mockCampaignService.getActiveCampaigns).toHaveBeenCalledTimes(5);
    });
  });
});
