import { Test, TestingModule } from '@nestjs/testing';
import { CmcController } from './cmc.controller';
import { TokensTradedEventService } from '../../events/tokens-traded-event/tokens-traded-event.service';
import { PairService } from '../../pair/pair.service';
import { DeploymentService, ExchangeId, BlockchainType, Deployment } from '../../deployment/deployment.service';

describe('CmcController', () => {
  let controller: CmcController;
  let tokensTradedEventService: jest.Mocked<TokensTradedEventService>;
  let pairService: jest.Mocked<PairService>;
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CmcController],
      providers: [
        {
          provide: TokensTradedEventService,
          useValue: {
            volume24hByPair: jest.fn(),
            lastTradesByPair: jest.fn(),
            getWithQueryParams: jest.fn(),
          },
        },
        {
          provide: PairService,
          useValue: {
            all: jest.fn(),
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

    controller = module.get<CmcController>(CmcController);
    tokensTradedEventService = module.get(TokensTradedEventService);
    pairService = module.get(PairService);
    deploymentService = module.get(DeploymentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('pairs', () => {
    it('should return pairs with volume and price data', async () => {
      const mockPairs = [
        {
          id: 1,
          token0: { address: '0xToken0', symbol: 'TKN0' },
          token1: { address: '0xToken1', symbol: 'TKN1' },
        },
        {
          id: 2,
          token0: { address: '0xToken2', symbol: 'TKN2' },
          token1: { address: '0xToken3', symbol: 'TKN3' },
        },
      ];

      const mockVolume = {
        1: { token0Volume: '1000', token1Volume: '2000' },
      };

      const mockLastTrades = {
        1: '1.5',
      };

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      pairService.all.mockResolvedValue(mockPairs as any);
      tokensTradedEventService.volume24hByPair.mockResolvedValue(mockVolume);
      tokensTradedEventService.lastTradesByPair.mockResolvedValue(mockLastTrades);

      const result = await controller.pairs(ExchangeId.OGEthereum);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        base_id: '0xToken0',
        base_symbol: 'TKN0',
        base_volume: '1000',
        last_price: '1.5',
        pair: '0xToken0_0xToken1',
        quote_id: '0xToken1',
        quote_symbol: 'TKN1',
        quote_volume: '2000',
      });
      expect(result[1]).toEqual({
        base_id: '0xToken2',
        base_symbol: 'TKN2',
        base_volume: '0',
        last_price: null,
        pair: '0xToken2_0xToken3',
        quote_id: '0xToken3',
        quote_symbol: 'TKN3',
        quote_volume: '0',
      });
    });
  });

  describe('historical_trades', () => {
    it('should return formatted historical trades', async () => {
      const mockTrades = [
        {
          sourceAmount: '100',
          targetAmount: '200',
          sourceToken: { decimals: 18, symbol: 'TKN0', address: '0xToken0' },
          targetToken: { decimals: 18, symbol: 'TKN1', address: '0xToken1' },
          transactionHash: '0xTxHash',
          block: { timestamp: new Date('2024-01-01T12:00:00Z') },
        },
      ];

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      tokensTradedEventService.getWithQueryParams.mockResolvedValue(mockTrades as any);

      const result = await controller.historical_trades(ExchangeId.OGEthereum, { limit: 100 });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        fromAmount: '100',
        id: '0xTxHash',
        pair: {
          fromToken: {
            decimals: 18,
            symbol: 'TKN0',
            address: '0xToken0',
          },
          toToken: {
            decimals: 18,
            symbol: 'TKN1',
            address: '0xToken1',
          },
        },
        timestamp: 1704110400,
        toAmount: '200',
      });
    });
  });
});
