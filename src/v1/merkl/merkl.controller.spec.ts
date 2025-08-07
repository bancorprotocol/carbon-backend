import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MerklController } from './merkl.controller';
import { CampaignService } from '../../merkl/services/campaign.service';
import { DeploymentService, BlockchainType, ExchangeId } from '../../deployment/deployment.service';
import { Campaign } from '../../merkl/entities/campaign.entity';
import { SubEpochService } from '../../merkl/services/sub-epoch.service';
import { DataJSON, DataResponseDto } from '../../merkl/dto/data-response.dto';
import { EncompassingJSON } from '../../merkl/dto/rewards-response.dto';
import { PairService } from '../../pair/pair.service';
import { TvlService } from '../../tvl/tvl.service';
import { TokenService } from '../../token/token.service';
import { HistoricQuoteService } from '../../historic-quote/historic-quote.service';
import Decimal from 'decimal.js';
import { BadRequestException } from '@nestjs/common';
import { MerklDataQueryDto } from './data.dto';
import { toChecksumAddress } from 'web3-utils';

describe('MerklController', () => {
  let controller: MerklController;
  let campaignService: CampaignService;
  let deploymentService: DeploymentService;
  let pairService: PairService;
  let tokenService: TokenService;
  let historicQuoteService: HistoricQuoteService;
  let campaignRepository: Repository<Campaign>;
  let subEpochService: SubEpochService;

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

  const mockTokenService = {
    allByAddress: jest.fn(),
  };

  const mockHistoricQuoteService = {
    getUsdRates: jest.fn(),
  };

  const mockCampaignRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const mockSubEpochService = {
    getEpochRewards: jest.fn(),
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
          provide: TokenService,
          useValue: mockTokenService,
        },
        {
          provide: HistoricQuoteService,
          useValue: mockHistoricQuoteService,
        },
        {
          provide: getRepositoryToken(Campaign),
          useValue: mockCampaignRepository,
        },
        {
          provide: SubEpochService,
          useValue: mockSubEpochService,
        },
      ],
    }).compile();

    controller = module.get<MerklController>(MerklController);
    campaignService = module.get<CampaignService>(CampaignService);
    deploymentService = module.get<DeploymentService>(DeploymentService);
    pairService = module.get<PairService>(PairService);
    tokenService = module.get<TokenService>(TokenService);
    historicQuoteService = module.get<HistoricQuoteService>(HistoricQuoteService);
    campaignRepository = module.get<Repository<Campaign>>(getRepositoryToken(Campaign));
    subEpochService = module.get<SubEpochService>(SubEpochService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getData', () => {
    it('should return campaign data for a specific pair with USD converted APR', async () => {
      const deployment = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        startBlock: 18000000,
      };

      const mockCampaign = {
        id: '1',
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        rewardAmount: '100000000000000000000000', // 100,000 tokens in wei
        rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        startDate: new Date(Date.now() - 86400 * 1000), // Started 1 day ago
        endDate: new Date(Date.now() + 86400 * 30 * 1000), // Ends in 30 days
        isActive: true,
        opportunityName: 'ETH/USDC Liquidity Mining',
        pair: {
          token0: { address: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8' },
          token1: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
        },
      };

      const query = {
        pair: {
          token0: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8',
          token1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        },
      };

      // Mock USD rate for reward token (e.g., $0.013 per token)
      const mockUsdRates = [
        {
          day: Math.floor(Date.now() / 1000),
          address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
          usd: 0.013,
          provider: 'coingecko',
        },
      ];

      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue(deployment);
      mockPairService.allAsDictionary.mockResolvedValue({
        [toChecksumAddress('0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8')]: {
          [toChecksumAddress('0xdAC17F958D2ee523a2206206994597C13D831ec7')]: {
            id: 1,
            token0: { address: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8' },
            token1: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
          },
        },
      });
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockTvlService.getTvlByPair.mockResolvedValue([{ tvlUsd: '1000000' }]); // $1M TVL
      mockHistoricQuoteService.getUsdRates.mockResolvedValue(mockUsdRates);

      const result: DataResponseDto = await controller.getData(query, ExchangeId.OGEthereum);

      expect(mockCampaignRepository.findOne).toHaveBeenCalledWith({
        where: {
          blockchainType: deployment.blockchainType,
          exchangeId: deployment.exchangeId,
          pair: {
            token0: { address: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8' },
            token1: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
          },
        },
        relations: ['pair', 'pair.token0', 'pair.token1'],
        order: { endDate: 'DESC' },
      });

      expect(mockHistoricQuoteService.getUsdRates).toHaveBeenCalledWith(
        deployment,
        ['0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'],
        expect.any(String), // thirtyDaysAgo
        expect.any(String), // nowIso
      );

      // Verify single object is returned (not array)
      expect(result.pair).toBe('0xa0b86a33e6441e68e2e80f99a8b38a6cd2c7f8f8_0xdac17f958d2ee523a2206206994597c13d831ec7');
      expect(result.tvl).toBe('1000000');
      expect(result.opportunityName).toBe('ETH/USDC Liquidity Mining');

      // Verify APR calculation with USD conversion
      // rewardAmountUsd = 100000000000000000000000 * 0.013 = 1300000000000000000000
      // rewardsPerDayUsd = 1300000000000000000000 / 31 = 41935483870967741935.48387096774194
      // aprDecimal = 41935483870967741935.48387096774194 * 365 / 1000000 = 15306451612903225.806451612903226
      const expectedRewardAmountUsd = new Decimal('100000000000000000000000').mul(0.013);
      const expectedRewardsPerDayUsd = expectedRewardAmountUsd.div(31);
      const expectedAPR = expectedRewardsPerDayUsd.mul(365).div('1000000');
      expect(result.apr).toBe(expectedAPR.toString());
    });

    it('should return data for specific pair when pair is provided', async () => {
      const deployment = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        startBlock: 18000000,
      };

      const mockCampaign = {
        id: '1',
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        rewardAmount: '100000000000000000000000',
        rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        startDate: new Date(Date.now() - 86400 * 1000),
        endDate: new Date(Date.now() + 86400 * 30 * 1000),
        isActive: true,
        opportunityName: 'ETH/USDC Liquidity Mining',
        pair: {
          token0: { address: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8' },
          token1: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
        },
      };

      const query = {
        pair: {
          token0: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8',
          token1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        },
      };

      const mockUsdRates = [
        {
          day: Math.floor(Date.now() / 1000),
          address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
          usd: 0.013,
          provider: 'coingecko',
        },
      ];

      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue(deployment);
      mockPairService.allAsDictionary.mockResolvedValue({
        [toChecksumAddress('0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8')]: {
          [toChecksumAddress('0xdAC17F958D2ee523a2206206994597C13D831ec7')]: {
            id: 1,
            token0: { address: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8' },
            token1: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
          },
        },
      });
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockTvlService.getTvlByPair.mockResolvedValue([{ tvlUsd: '100000000000000000000000' }]);
      mockHistoricQuoteService.getUsdRates.mockResolvedValue(mockUsdRates);

      const result: DataResponseDto = await controller.getData(query, ExchangeId.OGEthereum);

      expect(mockCampaignRepository.findOne).toHaveBeenCalledWith({
        where: {
          blockchainType: deployment.blockchainType,
          exchangeId: deployment.exchangeId,
          pair: {
            token0: { address: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8' },
            token1: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
          },
        },
        relations: ['pair', 'pair.token0', 'pair.token1'],
        order: { endDate: 'DESC' },
      });

      expect(result.pair).toBe('0xa0b86a33e6441e68e2e80f99a8b38a6cd2c7f8f8_0xdac17f958d2ee523a2206206994597c13d831ec7');
      expect(result.tvl).toBe('100000000000000000000000');
      expect(result.opportunityName).toBe('ETH/USDC Liquidity Mining');
    });

    it('should throw BadRequestException when requested pair does not exist', async () => {
      const deployment = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        startBlock: 18000000,
      };

      const query = {
        pair: {
          token0: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8',
          token1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        },
      };

      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue(deployment);
      mockPairService.allAsDictionary.mockResolvedValue({});

      await expect(controller.getData(query, ExchangeId.OGEthereum)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when no campaign is found for pair', async () => {
      const deployment = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        startBlock: 18000000,
      };

      const query = {
        pair: {
          token0: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8',
          token1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        },
      };

      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue(deployment);
      mockPairService.allAsDictionary.mockResolvedValue({
        [toChecksumAddress('0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8')]: {
          [toChecksumAddress('0xdAC17F958D2ee523a2206206994597C13D831ec7')]: {
            id: 1,
            token0: { address: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8' },
            token1: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
          },
        },
      });
      mockCampaignRepository.findOne.mockResolvedValue(null); // No campaign found

      await expect(controller.getData(query, ExchangeId.OGEthereum)).rejects.toThrow(BadRequestException);
    });

    it('should handle zero TVL scenarios and return APR as 0', async () => {
      const deployment = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        startBlock: 18000000,
      };

      const mockCampaign = {
        id: '1',
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        rewardAmount: '100000000000000000000000',
        rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        startDate: new Date(Date.now() - 86400 * 1000),
        endDate: new Date(Date.now() + 86400 * 30 * 1000),
        isActive: true,
        opportunityName: 'Zero TVL Campaign',
        pair: {
          token0: { address: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8' },
          token1: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
        },
      };

      const query = {
        pair: {
          token0: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8',
          token1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        },
      };

      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue(deployment);
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockPairService.allAsDictionary.mockResolvedValue({
        [toChecksumAddress('0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8')]: {
          [toChecksumAddress('0xdAC17F958D2ee523a2206206994597C13D831ec7')]: {
            id: 1,
            token0: { address: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8' },
            token1: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
          },
        },
      });
      mockTvlService.getTvlByPair.mockResolvedValue([{ tvlUsd: '0' }]);

      const result: DataResponseDto = await controller.getData(query, ExchangeId.OGEthereum);

      expect(result.tvl).toBe('0');
      expect(result.apr).toBe('0'); // Should now return "0" instead of Infinity
      expect(result.opportunityName).toBe('Zero TVL Campaign');
    });

    it('should handle cases where reward token price is not available', async () => {
      const deployment = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        startBlock: 18000000,
      };

      const mockCampaign = {
        id: '1',
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        rewardAmount: '100000000000000000000000',
        rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        startDate: new Date(Date.now() - 86400 * 1000),
        endDate: new Date(Date.now() + 86400 * 30 * 1000),
        isActive: true,
        opportunityName: 'No Price Campaign',
        pair: {
          token0: { address: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8' },
          token1: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
        },
      };

      const query = {
        pair: {
          token0: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8',
          token1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        },
      };

      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue(deployment);
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockPairService.allAsDictionary.mockResolvedValue({
        [toChecksumAddress('0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8')]: {
          [toChecksumAddress('0xdAC17F958D2ee523a2206206994597C13D831ec7')]: {
            id: 1,
            token0: { address: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8' },
            token1: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
          },
        },
      });
      mockTvlService.getTvlByPair.mockResolvedValue([{ tvlUsd: '1000000' }]);
      mockHistoricQuoteService.getUsdRates.mockResolvedValue([]); // No price data

      const result: DataResponseDto = await controller.getData(query, ExchangeId.OGEthereum);

      expect(result.tvl).toBe('1000000');
      expect(result.apr).toBe('0'); // Should be 0 when no price is available
      expect(result.opportunityName).toBe('No Price Campaign');
    });

    it('should handle NaN TVL values and return APR as 0', async () => {
      const deployment = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        startBlock: 18000000,
      };

      const mockCampaign = {
        id: '1',
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        rewardAmount: '100000000000000000000000',
        rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        startDate: new Date(Date.now() - 86400 * 1000),
        endDate: new Date(Date.now() + 86400 * 30 * 1000),
        isActive: true,
        opportunityName: 'NaN TVL Campaign',
        pair: {
          token0: { address: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8' },
          token1: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
        },
      };

      const query = {
        pair: {
          token0: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8',
          token1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        },
      };

      const mockUsdRates = [
        {
          day: Math.floor(Date.now() / 1000),
          address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
          usd: 0.013,
          provider: 'coingecko',
        },
      ];

      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue(deployment);
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockPairService.allAsDictionary.mockResolvedValue({
        [toChecksumAddress('0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8')]: {
          [toChecksumAddress('0xdAC17F958D2ee523a2206206994597C13D831ec7')]: {
            id: 1,
            token0: { address: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8' },
            token1: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
          },
        },
      });
      mockTvlService.getTvlByPair.mockResolvedValue([
        {
          timestamp: 1753142400,
          pairId: 1930,
          pairName: 'LBTC_TAC',
          tvlUsd: NaN, // This is the key test case
          token0: '0xecac9c5f704e954931349da37f60e39f515c11c1',
          token1: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        },
      ]);
      mockHistoricQuoteService.getUsdRates.mockResolvedValue(mockUsdRates);

      const result: DataResponseDto = await controller.getData(query, ExchangeId.OGEthereum);

      expect(result.tvl).toBe('0'); // Should be 0 when TVL is NaN
      expect(result.apr).toBe('0'); // Should be 0 when TVL is NaN
      expect(result.opportunityName).toBe('NaN TVL Campaign');
    });

    it('should handle very large reward amounts and TVL values', async () => {
      const deployment = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        startBlock: 18000000,
      };

      const mockCampaign = {
        id: '1',
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        rewardAmount: '999999999999999999999999999999999999999', // Very large reward
        rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        startDate: new Date(Date.now() - 86400 * 1000),
        endDate: new Date(Date.now() + 86400 * 365 * 1000), // 1 year campaign
        isActive: true,
        opportunityName: 'Whale Campaign',
        pair: {
          token0: { address: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8' },
          token1: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
        },
      };

      const query = {
        pair: {
          token0: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8',
          token1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        },
      };

      const mockUsdRates = [
        {
          day: Math.floor(Date.now() / 1000),
          address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
          usd: 0.001, // Small price for very large amounts
          provider: 'coingecko',
        },
      ];

      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue(deployment);
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockPairService.allAsDictionary.mockResolvedValue({
        [toChecksumAddress('0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8')]: {
          [toChecksumAddress('0xdAC17F958D2ee523a2206206994597C13D831ec7')]: {
            id: 1,
            token0: { address: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8' },
            token1: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
          },
        },
      });
      mockTvlService.getTvlByPair.mockResolvedValue([{ tvlUsd: '888888888888888888888888888888888888888' }]);
      mockHistoricQuoteService.getUsdRates.mockResolvedValue(mockUsdRates);

      const result: DataResponseDto = await controller.getData(query, ExchangeId.OGEthereum);

      // Verify large numbers maintain precision as strings
      const rewardDecimal = new Decimal(mockCampaign.rewardAmount);
      const tvlDecimal = new Decimal(result.tvl);

      // Check the original string values are maintained
      expect(mockCampaign.rewardAmount).toBe('999999999999999999999999999999999999999');
      expect(result.tvl).toBe('888888888888888888888888888888888888888');

      // Verify Decimal can handle them (may be in scientific notation for toString)
      expect(rewardDecimal.isFinite()).toBe(true);
      expect(tvlDecimal.isFinite()).toBe(true);
    });
  });

  describe('getRewards', () => {
    it('should return rewards for a specific pair with amounts converted to wei', async () => {
      const pair = [
        { token0: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', token1: '0xa0b86a33e6441e68e2e80f99a8b38a6cd2c7f8f8' },
      ];
      const deployment = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        startBlock: 18000000,
      };

      const mockCampaign = {
        id: '1',
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        pair: {
          id: 1,
          token0: { address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' },
          token1: { address: '0xa0b86a33e6441e68e2e80f99a8b38a6cd2c7f8f8' },
        },
        isActive: true,
      };

      const mockEpochRewards = [
        {
          epochNumber: 1,
          owner: '0x1234567890abcdef1234567890abcdef12345678',
          strategyId: '2722258935367507707706996859454145692818',
          totalReward: new Decimal('2.024792857777485576'), // Normalized amount in DB
          epochEnd: new Date('2025-01-25T20:00:00Z'),
        },
        {
          epochNumber: 2,
          owner: '0x1234567890abcdef1234567890abcdef12345678',
          strategyId: '2722258935367507707706996859454145692818',
          totalReward: new Decimal('1.529891386638038979'), // Normalized amount in DB
          epochEnd: new Date('2025-01-26T00:00:00Z'),
        },
        {
          epochNumber: 1,
          owner: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          strategyId: '1234567890123456789012345678901234567890',
          totalReward: new Decimal('47.914227570040216219'), // Normalized amount in DB
          epochEnd: new Date('2025-01-25T20:00:00Z'),
        },
      ];

      const mockTokensByAddress = {
        '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984': {
          // UNI token (checksum address)
          decimals: 18,
          symbol: 'UNI',
          address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        },
      };

      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue(deployment);
      mockPairService.allAsDictionary.mockResolvedValue({
        [toChecksumAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')]: {
          [toChecksumAddress('0xa0b86a33e6441e68e2e80f99a8b38a6cd2c7f8f8')]: {
            id: 1,
            token0: { address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' },
            token1: { address: '0xa0b86a33e6441e68e2e80f99a8b38a6cd2c7f8f8' },
          },
        },
      });
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockTokenService.allByAddress.mockResolvedValue(mockTokensByAddress);
      mockSubEpochService.getEpochRewards.mockResolvedValue(mockEpochRewards);

      const result = await controller.getRewards({ pair }, ExchangeId.OGEthereum);

      expect(result.rewardToken).toBe('0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984');
      expect(result.rewards).toEqual({
        '0x1234567890abcdef1234567890abcdef12345678': {
          'epoch-1-2722258935367507707706996859454145692818': {
            amount: '2024792857777485576', // Converted to wei (18 decimals)
            timestamp: expect.any(String),
          },
          'epoch-2-2722258935367507707706996859454145692818': {
            amount: '1529891386638038979', // Converted to wei (18 decimals)
            timestamp: expect.any(String),
          },
        },
        '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd': {
          'epoch-1-1234567890123456789012345678901234567890': {
            amount: '47914227570040216219', // Converted to wei (18 decimals)
            timestamp: expect.any(String),
          },
        },
      });

      // Verify TokenService was called with correct parameters
      expect(mockTokenService.allByAddress).toHaveBeenCalledWith(deployment);
    });

    it('should handle token with different decimals', async () => {
      const pair = [
        { token0: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', token1: '0xa0b86a33e6441e68e2e80f99a8b38a6cd2c7f8f8' },
      ];
      const deployment = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        startBlock: 18000000,
      };

      const mockCampaign = {
        id: '1',
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        rewardTokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
        pair: {
          id: 1,
          token0: { address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' },
          token1: { address: '0xa0b86a33e6441e68e2e80f99a8b38a6cd2c7f8f8' },
        },
        isActive: true,
      };

      const mockEpochRewards = [
        {
          epochNumber: 1,
          owner: '0x1234567890abcdef1234567890abcdef12345678',
          strategyId: '2722258935367507707706996859454145692818',
          totalReward: new Decimal('100.5'), // Normalized amount in DB
          epochEnd: new Date('2025-01-25T20:00:00Z'),
        },
      ];

      const mockTokensByAddress = {
        '0xdAC17F958D2ee523a2206206994597C13D831ec7': {
          // USDT token (6 decimals)
          decimals: 6,
          symbol: 'USDT',
          address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        },
      };

      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue(deployment);
      mockPairService.allAsDictionary.mockResolvedValue({
        [toChecksumAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')]: {
          [toChecksumAddress('0xa0b86a33e6441e68e2e80f99a8b38a6cd2c7f8f8')]: {
            id: 1,
            token0: { address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' },
            token1: { address: '0xa0b86a33e6441e68e2e80f99a8b38a6cd2c7f8f8' },
          },
        },
      });
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockTokenService.allByAddress.mockResolvedValue(mockTokensByAddress);
      mockSubEpochService.getEpochRewards.mockResolvedValue(mockEpochRewards);

      const result = await controller.getRewards({ pair }, ExchangeId.OGEthereum);

      expect(result.rewards).toEqual({
        '0x1234567890abcdef1234567890abcdef12345678': {
          'epoch-1-2722258935367507707706996859454145692818': {
            amount: '100500000', // Converted to wei (6 decimals: 100.5 * 10^6)
            timestamp: expect.any(String),
          },
        },
      });
    });

    it('should default to 18 decimals when token not found', async () => {
      const pair = [
        { token0: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', token1: '0xa0b86a33e6441e68e2e80f99a8b38a6cd2c7f8f8' },
      ];
      const deployment = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        startBlock: 18000000,
      };

      const mockCampaign = {
        id: '1',
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        rewardTokenAddress: '0xUnknownTokenAddress',
        pair: {
          id: 1,
          token0: { address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' },
          token1: { address: '0xa0b86a33e6441e68e2e80f99a8b38a6cd2c7f8f8' },
        },
        isActive: true,
      };

      const mockEpochRewards = [
        {
          epochNumber: 1,
          owner: '0x1234567890abcdef1234567890abcdef12345678',
          strategyId: '2722258935367507707706996859454145692818',
          totalReward: new Decimal('1.5'), // Normalized amount in DB
          epochEnd: new Date('2025-01-25T20:00:00Z'),
        },
      ];

      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue(deployment);
      mockPairService.allAsDictionary.mockResolvedValue({
        [toChecksumAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')]: {
          [toChecksumAddress('0xa0b86a33e6441e68e2e80f99a8b38a6cd2c7f8f8')]: {
            id: 1,
            token0: { address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' },
            token1: { address: '0xa0b86a33e6441e68e2e80f99a8b38a6cd2c7f8f8' },
          },
        },
      });
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockTokenService.allByAddress.mockResolvedValue({}); // Empty - token not found
      mockSubEpochService.getEpochRewards.mockResolvedValue(mockEpochRewards);

      const result = await controller.getRewards({ pair }, ExchangeId.OGEthereum);

      expect(result.rewards).toEqual({
        '0x1234567890abcdef1234567890abcdef12345678': {
          'epoch-1-2722258935367507707706996859454145692818': {
            amount: '1500000000000000000', // Converted to wei (18 decimals: 1.5 * 10^18)
            timestamp: expect.any(String),
          },
        },
      });
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

      const mockCampaign = {
        id: '1',
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        pair: {
          id: 1,
          token0: { address: '0x1234567890abcdef1234567890abcdef12345678' },
          token1: { address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' },
        },
        isActive: true,
      };

      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue(deployment);
      mockPairService.allAsDictionary.mockResolvedValue({
        [toChecksumAddress('0x1234567890abcdef1234567890abcdef12345678')]: {
          [toChecksumAddress('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd')]: {
            id: 1,
            token0: { address: '0x1234567890abcdef1234567890abcdef12345678' },
            token1: { address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' },
          },
        },
      });
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockTokenService.allByAddress.mockResolvedValue({});
      mockSubEpochService.getEpochRewards.mockResolvedValue([]); // Empty rewards

      const result = await controller.getRewards({ pair }, ExchangeId.OGEthereum);

      expect(result.rewards).toEqual({});
      expect(Object.keys(result.rewards)).toHaveLength(0);
      expect(result.rewardToken).toBe('0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984');
    });

    it('should filter rewards by start timestamp when provided', async () => {
      const pair = [
        { token0: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', token1: '0xa0b86a33e6441e68e2e80f99a8b38a6cd2c7f8f8' },
      ];
      const deployment = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        startBlock: 18000000,
      };

      const mockCampaign = {
        id: '1',
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        pair: {
          id: 1,
          token0: { address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' },
          token1: { address: '0xa0b86a33e6441e68e2e80f99a8b38a6cd2c7f8f8' },
        },
        isActive: true,
      };

      const mockEpochRewards = [
        {
          epochNumber: 2,
          owner: '0x1234567890abcdef1234567890abcdef12345678',
          strategyId: '2722258935367507707706996859454145692818',
          totalReward: new Decimal('1.5'),
          epochEnd: new Date('2025-01-26T00:00:00Z'),
        },
      ];

      const mockTokensByAddress = {
        '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984': {
          decimals: 18,
          symbol: 'UNI',
          address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        },
      };

      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue(deployment);
      mockPairService.allAsDictionary.mockResolvedValue({
        [toChecksumAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')]: {
          [toChecksumAddress('0xa0b86a33e6441e68e2e80f99a8b38a6cd2c7f8f8')]: {
            id: 1,
            token0: { address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' },
            token1: { address: '0xa0b86a33e6441e68e2e80f99a8b38a6cd2c7f8f8' },
          },
        },
      });
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockTokenService.allByAddress.mockResolvedValue(mockTokensByAddress);
      mockSubEpochService.getEpochRewards.mockResolvedValue(mockEpochRewards);

      const startTimestamp = '1737835200'; // 2025-01-25T21:00:00Z
      const result = await controller.getRewards({ pair, start: startTimestamp }, ExchangeId.OGEthereum);

      // Verify that getEpochRewards was called with the start timestamp
      expect(mockSubEpochService.getEpochRewards).toHaveBeenCalledWith('1', undefined, 1737835200);

      expect(result.rewards).toEqual({
        '0x1234567890abcdef1234567890abcdef12345678': {
          'epoch-2-2722258935367507707706996859454145692818': {
            amount: '1500000000000000000', // 1.5 * 10^18
            timestamp: expect.any(String),
          },
        },
      });
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

      const mockCampaign = {
        id: '1',
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        rewardTokenAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        pair: {
          id: 1,
          token0: { address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' },
          token1: { address: '0xa0b86a33e6441e68e2e80f99a8b38a6cd2c7f8f8' },
        },
        isActive: true,
      };

      const mockEpochRewards = [
        {
          epochNumber: 1,
          owner: '0x1234567890abcdef1234567890abcdef12345678',
          strategyId: '2722258935367507707706996859454145692818',
          totalReward: new Decimal('0.000000000000000001'), // Smallest possible normalized amount (1 wei when converted)
          epochEnd: new Date('2025-01-25T20:00:00Z'),
        },
      ];

      const mockTokensByAddress = {
        '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984': {
          decimals: 18,
          symbol: 'UNI',
          address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
        },
      };

      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue(deployment);
      mockPairService.allAsDictionary.mockResolvedValue({
        [toChecksumAddress('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')]: {
          [toChecksumAddress('0xa0b86a33e6441e68e2e80f99a8b38a6cd2c7f8f8')]: {
            id: 1,
            token0: { address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' },
            token1: { address: '0xa0b86a33e6441e68e2e80f99a8b38a6cd2c7f8f8' },
          },
        },
      });
      mockCampaignRepository.findOne.mockResolvedValue(mockCampaign);
      mockTokenService.allByAddress.mockResolvedValue(mockTokensByAddress);
      mockSubEpochService.getEpochRewards.mockResolvedValue(mockEpochRewards);

      const result = await controller.getRewards({ pair }, ExchangeId.OGEthereum);

      expect(result.rewards).toEqual({
        '0x1234567890abcdef1234567890abcdef12345678': {
          'epoch-1-2722258935367507707706996859454145692818': {
            amount: '1', // 1 wei
            timestamp: expect.any(String),
          },
        },
      });
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

      const query = {
        pair: {
          token0: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8',
          token1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        },
      };

      for (const deployment of deployments) {
        mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue(deployment);
        mockCampaignRepository.findOne.mockResolvedValue(null);
        mockPairService.allAsDictionary.mockResolvedValue({
          [toChecksumAddress('0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8')]: {
            [toChecksumAddress('0xdAC17F958D2ee523a2206206994597C13D831ec7')]: {
              id: 1,
              token0: { address: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8' },
              token1: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
            },
          },
        });

        await expect(controller.getData(query, deployment.exchangeId)).rejects.toThrow(BadRequestException);

        expect(mockCampaignRepository.findOne).toHaveBeenCalledWith({
          where: {
            blockchainType: deployment.blockchainType,
            exchangeId: deployment.exchangeId,
            pair: {
              token0: { address: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8' },
              token1: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
            },
          },
          relations: ['pair', 'pair.token0', 'pair.token1'],
          order: { endDate: 'DESC' },
        });
      }
    });

    it('should handle malformed pair addresses gracefully', async () => {
      const deployment = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        startBlock: 18000000,
      };

      const query = {
        pair: {
          token0: '',
          token1: 'INVALID_ADDRESS',
        },
      };

      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue(deployment);
      // Mock that allAsDictionary returns empty since malformed addresses won't be found
      mockPairService.allAsDictionary.mockResolvedValue({});

      // Should throw BadRequestException because no pair is found for malformed addresses
      await expect(controller.getData(query, ExchangeId.OGEthereum)).rejects.toThrow(BadRequestException);
    });

    it('should handle concurrent getData calls', async () => {
      const deployment = {
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        startBlock: 18000000,
      };

      const query = {
        pair: {
          token0: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8',
          token1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        },
      };

      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue(deployment);
      mockCampaignRepository.findOne.mockResolvedValue(null);
      mockPairService.allAsDictionary.mockResolvedValue({
        [toChecksumAddress('0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8')]: {
          [toChecksumAddress('0xdAC17F958D2ee523a2206206994597C13D831ec7')]: {
            id: 1,
            token0: { address: '0xA0b86a33E6441e68e2e80f99a8b38A6cd2C7F8f8' },
            token1: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
          },
        },
      });

      // Simulate concurrent calls
      const promises = Array(5)
        .fill(null)
        .map(() => controller.getData(query, ExchangeId.OGEthereum));

      // All should fail with BadRequestException since no campaign is found
      await Promise.all(promises.map((promise) => expect(promise).rejects.toThrow(BadRequestException)));

      expect(mockCampaignRepository.findOne).toHaveBeenCalledTimes(5);
    });
  });
});
