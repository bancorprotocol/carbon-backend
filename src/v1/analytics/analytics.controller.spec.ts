import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { VolumeService } from '../../volume/volume.service';
import { TvlService } from '../../tvl/tvl.service';
import { DeploymentService, ExchangeId, BlockchainType, Deployment } from '../../deployment/deployment.service';
import { PairService } from '../../pair/pair.service';
import { TokenService } from '../../token/token.service';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let analyticsService: jest.Mocked<AnalyticsService>;
  let volumeService: jest.Mocked<VolumeService>;
  let tvlService: jest.Mocked<TvlService>;
  let deploymentService: jest.Mocked<DeploymentService>;
  let pairService: jest.Mocked<PairService>;
  let tokenService: jest.Mocked<TokenService>;

  const mockDeployment: Deployment = {
    blockchainType: BlockchainType.Ethereum,
    exchangeId: ExchangeId.OGEthereum,
    rpcEndpoint: 'https://eth-mainnet.example.com',
    startBlock: 1000,
    harvestConcurrency: 5,
    harvestEventsBatchSize: 1000,
    harvestSleep: 0,
    multicallAddress: '0xMulticallAddress',
    gasToken: {
      name: 'Ethereum',
      symbol: 'ETH',
      address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    },
    contracts: {},
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        {
          provide: AnalyticsService,
          useValue: {
            getCachedGenericMetrics: jest.fn(),
            getCachedTradesCount: jest.fn(),
            getCachedTrending: jest.fn(),
          },
        },
        {
          provide: VolumeService,
          useValue: {
            getVolume: jest.fn(),
          },
        },
        {
          provide: TvlService,
          useValue: {
            getTvlByAddress: jest.fn(),
            getTvlByPair: jest.fn(),
            getTotalTvl: jest.fn(),
          },
        },
        {
          provide: DeploymentService,
          useValue: {
            getDeploymentByExchangeId: jest.fn(),
          },
        },
        {
          provide: PairService,
          useValue: {
            allAsDictionary: jest.fn(),
          },
        },
        {
          provide: TokenService,
          useValue: {
            allByAddress: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
    analyticsService = module.get(AnalyticsService);
    volumeService = module.get(VolumeService);
    tvlService = module.get(TvlService);
    deploymentService = module.get(DeploymentService);
    pairService = module.get(PairService);
    tokenService = module.get(TokenService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('tvlByTokens', () => {
    it('should return TVL by tokens', async () => {
      const mockResult = { '0xToken1': '1000', '0xToken2': '2000' } as any;

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      tvlService.getTvlByAddress.mockResolvedValue(mockResult);

      const result = await controller.tvlByTokens(ExchangeId.OGEthereum, {
        start: 1000,
        end: 2000,
        addresses: ['0xToken1', '0xToken2'],
      });

      expect(result).toEqual(mockResult);
      expect(tvlService.getTvlByAddress).toHaveBeenCalledWith(mockDeployment, {
        start: 1000,
        end: 2000,
        addresses: ['0xToken1', '0xToken2'],
      });
    });
  });

  describe('tvlByPair', () => {
    it('should return TVL by pair', async () => {
      const mockPairs = { '0xToken0': { '0xToken1': { id: 1 } } };
      const mockResult = { 1: '5000' } as any;

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      pairService.allAsDictionary.mockResolvedValue(mockPairs as any);
      tvlService.getTvlByPair.mockResolvedValue(mockResult);

      const result = await controller.tvlByPair(ExchangeId.OGEthereum, {
        start: 1000,
        end: 2000,
        pairs: [{ token0: '0xToken0', token1: '0xToken1' }],
      });

      expect(result).toEqual(mockResult);
      expect(tvlService.getTvlByPair).toHaveBeenCalledWith(
        mockDeployment,
        { start: 1000, end: 2000, pairs: [{ token0: '0xToken0', token1: '0xToken1' }] },
        mockPairs,
      );
    });
  });

  describe('tvl', () => {
    it('should return total TVL', async () => {
      const mockResult = { totalTvl: '10000' } as any;

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      tvlService.getTotalTvl.mockResolvedValue(mockResult);

      const result = await controller.tvl(ExchangeId.OGEthereum, { start: 1000, end: 2000 });

      expect(result).toEqual(mockResult);
      expect(tvlService.getTotalTvl).toHaveBeenCalledWith(mockDeployment, { start: 1000, end: 2000 });
    });
  });

  describe('volumeByTokens', () => {
    it('should return volume by tokens', async () => {
      const mockTokens = { '0xToken1': {}, '0xToken2': {} };
      const mockResult = { '0xToken1': '500', '0xToken2': '750' } as any;

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      tokenService.allByAddress.mockResolvedValue(mockTokens as any);
      volumeService.getVolume.mockResolvedValue(mockResult);

      const result = await controller.volumeByTokens(ExchangeId.OGEthereum, {
        start: 1000,
        end: 2000,
        addresses: ['0xToken1', '0xToken2'],
      });

      expect(result).toEqual(mockResult);
      expect(volumeService.getVolume).toHaveBeenCalledWith(
        mockDeployment,
        { start: 1000, end: 2000, addresses: ['0xToken1', '0xToken2'] },
        mockTokens,
      );
    });
  });

  describe('volumeByPairs', () => {
    it('should return volume by pairs', async () => {
      const mockTokens = { '0xToken1': {}, '0xToken2': {} };
      const mockPairs = { '0xToken0': { '0xToken1': { id: 1 } } };
      const mockResult = { 1: '1250' } as any;

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      tokenService.allByAddress.mockResolvedValue(mockTokens as any);
      pairService.allAsDictionary.mockResolvedValue(mockPairs as any);
      volumeService.getVolume.mockResolvedValue(mockResult);

      const result = await controller.volumeByPairs(ExchangeId.OGEthereum, {
        start: 1000,
        end: 2000,
        pairs: [{ token0: '0xToken0', token1: '0xToken1' }],
      });

      expect(result).toEqual(mockResult);
      expect(volumeService.getVolume).toHaveBeenCalledWith(
        mockDeployment,
        { start: 1000, end: 2000, pairs: [{ token0: '0xToken0', token1: '0xToken1' }] },
        mockTokens,
        mockPairs,
      );
    });
  });

  describe('volumeTotal', () => {
    it('should return total volume', async () => {
      const mockTokens = { '0xToken1': {}, '0xToken2': {} };
      const mockResult = { totalVolume: '2500' } as any;

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      tokenService.allByAddress.mockResolvedValue(mockTokens as any);
      volumeService.getVolume.mockResolvedValue(mockResult);

      const result = await controller.volumeTotal(ExchangeId.OGEthereum, {
        start: 1000,
        end: 2000,
      });

      expect(result).toEqual(mockResult);
      expect(volumeService.getVolume).toHaveBeenCalledWith(mockDeployment, { start: 1000, end: 2000 }, mockTokens);
    });
  });

  describe('generic', () => {
    it('should return cached generic metrics', async () => {
      const mockMetrics = {
        totalValueLocked: '100000',
        volume24h: '50000',
      };

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      analyticsService.getCachedGenericMetrics.mockResolvedValue(mockMetrics);

      const result = await controller.generic(ExchangeId.OGEthereum);

      expect(result).toEqual(mockMetrics);
      expect(analyticsService.getCachedGenericMetrics).toHaveBeenCalledWith(mockDeployment);
    });
  });

  describe('tradeCount', () => {
    it('should return cached trades count', async () => {
      const mockCount = { count: 12345 };

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      analyticsService.getCachedTradesCount.mockResolvedValue(mockCount);

      const result = await controller.tradeCount(ExchangeId.OGEthereum);

      expect(result).toEqual(mockCount);
      expect(analyticsService.getCachedTradesCount).toHaveBeenCalledWith(mockDeployment);
    });
  });

  describe('trending', () => {
    it('should return cached trending data', async () => {
      const mockTrending = {
        trending: [
          { token: '0xToken1', volume: '5000' },
          { token: '0xToken2', volume: '3000' },
        ],
      };

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      analyticsService.getCachedTrending.mockResolvedValue(mockTrending);

      const result = await controller.trending(ExchangeId.OGEthereum);

      expect(result).toEqual(mockTrending);
      expect(analyticsService.getCachedTrending).toHaveBeenCalledWith(mockDeployment);
    });
  });
});
