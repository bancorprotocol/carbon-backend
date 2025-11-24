import { Test, TestingModule } from '@nestjs/testing';
import { CoinGeckoController } from './coingecko.controller';
import { TokensTradedEventService } from '../../events/tokens-traded-event/tokens-traded-event.service';
import { PairService } from '../../pair/pair.service';
import { CoingeckoService } from './coingecko.service';
import { DeploymentService, ExchangeId, BlockchainType, Deployment } from '../../deployment/deployment.service';
import { QuoteService } from '../../quote/quote.service';

describe('CoinGeckoController', () => {
  let controller: CoinGeckoController;
  let tokensTradedEventService: jest.Mocked<TokensTradedEventService>;
  let pairService: jest.Mocked<PairService>;
  let coingeckoService: jest.Mocked<CoingeckoService>;
  let deploymentService: jest.Mocked<DeploymentService>;
  let quoteService: QuoteService;

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
      controllers: [CoinGeckoController],
      providers: [
        {
          provide: TokensTradedEventService,
          useValue: {
            getWithQueryParams: jest.fn(),
          },
        },
        {
          provide: PairService,
          useValue: {
            all: jest.fn(),
            allAsDictionary: jest.fn(),
          },
        },
        {
          provide: CoingeckoService,
          useValue: {
            getCachedTickers: jest.fn(),
          },
        },
        {
          provide: DeploymentService,
          useValue: {
            getDeploymentByExchangeId: jest.fn(),
          },
        },
        {
          provide: QuoteService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<CoinGeckoController>(CoinGeckoController);
    tokensTradedEventService = module.get(TokensTradedEventService);
    pairService = module.get(PairService);
    coingeckoService = module.get(CoingeckoService);
    deploymentService = module.get(DeploymentService);
    quoteService = module.get(QuoteService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('historicalTrades', () => {
    it('should return formatted trade data without ticker filter', async () => {
      const mockTrades = [
        {
          type: 'sell',
          sourceAmount: '100',
          targetAmount: '200',
          pair: {
            token0: { address: '0xToken0' },
            token1: { address: '0xToken1' },
          },
          transactionHash: '0xTxHash',
          timestamp: new Date('2024-01-01T12:00:00Z'),
        },
      ];

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      tokensTradedEventService.getWithQueryParams.mockResolvedValue(mockTrades as any);

      const result = await controller.historicalTrades(ExchangeId.OGEthereum, {
        start_time: 1704067200,
        end_time: 1704153600,
        limit: 100,
        type: 'sell',
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        base_volume: 100,
        target_volume: 200,
        ticker_id: '0xToken0_0xToken1',
        trade_id: '0xTxHash',
        trade_timestamp: 1704110400,
        type: 'sell',
        price: 2,
      });
    });

    it('should filter by ticker_id when provided', async () => {
      const mockPairs = {
        '0xToken0': {
          '0xToken1': { id: 123 },
        },
      };

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      pairService.allAsDictionary.mockResolvedValue(mockPairs as any);
      tokensTradedEventService.getWithQueryParams.mockResolvedValue([]);

      await controller.historicalTrades(ExchangeId.OGEthereum, {
        start_time: 1704067200,
        end_time: 1704153600,
        limit: 100,
        ticker_id: '0xToken0_0xToken1',
      });

      expect(tokensTradedEventService.getWithQueryParams).toHaveBeenCalledWith(
        expect.objectContaining({
          pairId: 123,
        }),
        mockDeployment,
      );
    });

    it('should handle buy trades correctly', async () => {
      const mockTrades = [
        {
          type: 'buy',
          sourceAmount: '100',
          targetAmount: '50',
          pair: {
            token0: { address: '0xToken0' },
            token1: { address: '0xToken1' },
          },
          transactionHash: '0xTxHash',
          timestamp: new Date('2024-01-01T12:00:00Z'),
        },
      ];

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      tokensTradedEventService.getWithQueryParams.mockResolvedValue(mockTrades as any);

      const result = await controller.historicalTrades(ExchangeId.OGEthereum, {
        start_time: 1704067200,
        end_time: 1704153600,
        limit: 100,
      });

      expect(result[0].base_volume).toBe(50);
      expect(result[0].target_volume).toBe(100);
      expect(result[0].price).toBe(2);
    });
  });

  describe('pairs', () => {
    it('should return all pairs', async () => {
      const mockPairs = [
        {
          token0: { address: '0xToken0' },
          token1: { address: '0xToken1' },
        },
        {
          token0: { address: '0xToken2' },
          token1: { address: '0xToken3' },
        },
      ];

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      pairService.all.mockResolvedValue(mockPairs as any);

      const result = await controller.pairs(ExchangeId.OGEthereum);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        base_currency: '0xToken0',
        target_currency: '0xToken1',
        ticker_id: '0xToken0_0xToken1',
      });
    });
  });

  describe('tickers', () => {
    it('should return cached tickers', async () => {
      const mockTickers = {
        tickers: [{ ticker_id: '0xToken0_0xToken1', base_volume: '1000', target_volume: '2000' }],
      };

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      coingeckoService.getCachedTickers.mockResolvedValue(mockTickers);

      const result = await controller.tickers(ExchangeId.OGEthereum);

      expect(result).toEqual(mockTickers);
      expect(coingeckoService.getCachedTickers).toHaveBeenCalledWith(mockDeployment);
    });
  });
});
