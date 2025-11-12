import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { HistoricQuoteController } from './historic-quote.controller';
import { HistoricQuoteService } from './historic-quote.service';
import { DeploymentService, ExchangeId, BlockchainType, Deployment } from '../deployment/deployment.service';

describe('HistoricQuoteController', () => {
  let controller: HistoricQuoteController;
  let historicQuoteService: jest.Mocked<HistoricQuoteService>;
  let deploymentService: jest.Mocked<DeploymentService>;

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

  const mockPriceData = [
    {
      timestamp: new Date('2024-01-01'),
      low: 100,
      high: 110,
      open: 105,
      close: 108,
      provider: 'coinmarketcap',
    },
    {
      timestamp: new Date('2024-01-02'),
      low: 108,
      high: 115,
      open: 108,
      close: 112,
      provider: 'codex',
      mappedBaseToken: '0xMappedBase',
      mappedQuoteToken: '0xMappedQuote',
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HistoricQuoteController],
      providers: [
        {
          provide: HistoricQuoteService,
          useValue: {
            getUsdBuckets: jest.fn(),
          },
        },
        {
          provide: DeploymentService,
          useValue: {
            getDeploymentByExchangeId: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<HistoricQuoteController>(HistoricQuoteController);
    historicQuoteService = module.get(HistoricQuoteService);
    deploymentService = module.get(DeploymentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('prices', () => {
    const validParams = {
      baseToken: '0xBaseToken',
      quoteToken: '0xQuoteToken',
      start: 1704067200000, // 2024-01-01
      end: 1706659200000, // 2024-01-31
    };

    it('should return formatted price data', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      historicQuoteService.getUsdBuckets.mockResolvedValue(mockPriceData as any);

      const result = await controller.prices(ExchangeId.OGEthereum, validParams);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        timestamp: mockPriceData[0].timestamp,
        low: '100',
        high: '110',
        open: '105',
        close: '108',
        provider: 'coinmarketcap',
      });
      expect(result[1]).toEqual({
        timestamp: mockPriceData[1].timestamp,
        low: '108',
        high: '115',
        open: '108',
        close: '112',
        provider: 'codex',
        mappedBaseToken: '0xMappedBase',
        mappedQuoteToken: '0xMappedQuote',
      });
    });

    it('should convert token addresses to lowercase', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      historicQuoteService.getUsdBuckets.mockResolvedValue([]);

      await controller.prices(ExchangeId.OGEthereum, {
        ...validParams,
        baseToken: '0xBASETOKEN',
        quoteToken: '0xQUOTETOKEN',
      });

      expect(historicQuoteService.getUsdBuckets).toHaveBeenCalledWith(
        BlockchainType.Ethereum,
        BlockchainType.Ethereum,
        '0xbasetoken',
        '0xquotetoken',
        validParams.start,
        validParams.end,
      );
    });

    it('should throw BadRequestException when end <= start', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);

      await expect(
        controller.prices(ExchangeId.OGEthereum, {
          ...validParams,
          start: 1706659200000, // 2024-01-31
          end: 1704067200000, // 2024-01-01
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.prices(ExchangeId.OGEthereum, {
          ...validParams,
          start: 1705363200000, // 2024-01-15
          end: 1705363200000, // 2024-01-15
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return empty array when no data available', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      historicQuoteService.getUsdBuckets.mockResolvedValue([]);

      const result = await controller.prices(ExchangeId.OGEthereum, validParams);

      expect(result).toEqual([]);
    });

    it('should handle null data', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      historicQuoteService.getUsdBuckets.mockResolvedValue(null as any);

      const result = await controller.prices(ExchangeId.OGEthereum, validParams);

      expect(result).toEqual([]);
    });

    it('should work with different exchange IDs', async () => {
      const seiDeployment: Deployment = {
        ...mockDeployment,
        blockchainType: BlockchainType.Sei,
        exchangeId: ExchangeId.OGSei,
      };

      deploymentService.getDeploymentByExchangeId.mockReturnValue(seiDeployment);
      historicQuoteService.getUsdBuckets.mockResolvedValue(mockPriceData as any);

      const result = await controller.prices(ExchangeId.OGSei, validParams);

      expect(result).toHaveLength(2);
      expect(deploymentService.getDeploymentByExchangeId).toHaveBeenCalledWith(ExchangeId.OGSei);
      expect(historicQuoteService.getUsdBuckets).toHaveBeenCalledWith(
        BlockchainType.Sei,
        BlockchainType.Sei,
        validParams.baseToken.toLowerCase(),
        validParams.quoteToken.toLowerCase(),
        validParams.start,
        validParams.end,
      );
    });
  });
});
