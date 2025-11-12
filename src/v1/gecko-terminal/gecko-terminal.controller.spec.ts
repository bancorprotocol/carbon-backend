import { Test, TestingModule } from '@nestjs/testing';
import { GeckoTerminalController } from './gecko-terminal.controller';
import { DexScreenerV2Service } from '../dex-screener/dex-screener-v2.service';
import { TokenService } from '../../token/token.service';
import { DeploymentService, ExchangeId, BlockchainType, Deployment } from '../../deployment/deployment.service';
import { LastProcessedBlockService } from '../../last-processed-block/last-processed-block.service';

describe('GeckoTerminalController', () => {
  let controller: GeckoTerminalController;
  let dexScreenerV2Service: jest.Mocked<DexScreenerV2Service>;
  let tokenService: jest.Mocked<TokenService>;
  let deploymentService: jest.Mocked<DeploymentService>;
  let lastProcessedBlockService: jest.Mocked<LastProcessedBlockService>;

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
    contracts: {
      CarbonController: {
        address: '0xCarbonControllerAddress',
      },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GeckoTerminalController],
      providers: [
        {
          provide: DexScreenerV2Service,
          useValue: {
            getCachedPairs: jest.fn(),
            getEvents: jest.fn(),
          },
        },
        {
          provide: TokenService,
          useValue: {
            allByAddress: jest.fn(),
          },
        },
        {
          provide: DeploymentService,
          useValue: {
            getDeploymentByExchangeId: jest.fn(),
          },
        },
        {
          provide: LastProcessedBlockService,
          useValue: {
            getState: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<GeckoTerminalController>(GeckoTerminalController);
    dexScreenerV2Service = module.get(DexScreenerV2Service);
    tokenService = module.get(TokenService);
    deploymentService = module.get(DeploymentService);
    lastProcessedBlockService = module.get(LastProcessedBlockService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('latestBlock', () => {
    it('should return latest block info', async () => {
      const mockState = {
        lastBlock: 12345,
        timestamp: new Date('2024-01-01T12:00:00Z'),
      };

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      lastProcessedBlockService.getState.mockResolvedValue(mockState);

      const result = await controller.latestBlock(ExchangeId.OGEthereum);

      expect(result).toEqual({
        block: {
          blockNumber: 12345,
          blockTimestamp: 1704110400,
        },
      });
    });
  });

  describe('asset', () => {
    it('should return asset information', async () => {
      const mockTokens = {
        '0x1234567890123456789012345678901234567890': {
          address: '0x1234567890123456789012345678901234567890',
          name: 'Token One',
          symbol: 'TKN1',
          decimals: 18,
        },
      };

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      tokenService.allByAddress.mockResolvedValue(mockTokens as any);

      const result = await controller.asset(ExchangeId.OGEthereum, {
        id: '0x1234567890123456789012345678901234567890',
      });

      expect(result).toEqual({
        asset: {
          id: '0x1234567890123456789012345678901234567890',
          name: 'Token One',
          symbol: 'TKN1',
          decimals: 18,
        },
      });
    });
  });

  describe('pair', () => {
    it('should return pair information with formatted pairId', async () => {
      const mockPairs = [
        {
          id: 123,
          asset0id: '0xToken0',
          asset1id: '0xToken1',
          createdatblocknumber: 1000,
          createdatblocktimestamp: new Date('2024-01-01T10:00:00Z'),
          createdattxnid: '0xTxHash',
          feebps: 30,
        },
      ];

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      dexScreenerV2Service.getCachedPairs.mockResolvedValue(mockPairs as any);

      const result = await controller.pair(ExchangeId.OGEthereum, {
        id: '0xCarbonControllerAddress-123',
      });

      expect(result).toEqual({
        pair: {
          id: '0xCarbonControllerAddress-123',
          dexKey: 'carbondefi',
          asset0Id: '0xToken0',
          asset1Id: '0xToken1',
          createdAtBlockNumber: 1000,
          createdAtBlockTimestamp: 1704103200,
          createdAtTxnId: '0xTxHash',
          feeBps: 30,
        },
      });
    });
  });

  describe('events', () => {
    it('should return swap events with formatted pairId', async () => {
      const mockEvents = [
        {
          eventType: 'swap',
          blockNumber: 1000,
          blockTimestamp: new Date('2024-01-01T10:00:00Z'),
          txnId: '0xTxHash',
          txnIndex: 1,
          eventIndex: 5.0,
          maker: '0xMaker',
          pairId: 123,
          asset0In: '100',
          asset1In: null,
          asset0Out: null,
          asset1Out: '200',
          priceNative: '2.0',
          reserves0: '1000',
          reserves1: '2000',
        },
      ];

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      dexScreenerV2Service.getEvents.mockResolvedValue(mockEvents as any);

      const result = await controller.events(ExchangeId.OGEthereum, {
        fromBlock: '1000',
        toBlock: '2000',
      });

      expect(result.events).toHaveLength(1);
      expect(result.events[0]).toEqual({
        block: {
          blockNumber: 1000,
          blockTimestamp: 1704103200,
        },
        eventType: 'swap',
        txnId: '0xTxHash',
        txnIndex: 1,
        eventIndex: 5,
        maker: '0xMaker',
        pairId: '0xCarbonControllerAddress-123',
        asset0In: '100',
        asset1In: '0',
        asset0Out: '0',
        asset1Out: '200',
        priceNative: '2.0',
        reserves: {
          asset0: '1000',
          asset1: '2000',
        },
      });
    });

    it('should return join/exit events', async () => {
      const mockEvents = [
        {
          eventType: 'join',
          blockNumber: 1000,
          blockTimestamp: new Date('2024-01-01T10:00:00Z'),
          txnId: '0xTxHash',
          txnIndex: 1,
          eventIndex: 3.0,
          maker: '0xMaker',
          pairId: 456,
          amount0: '500',
          amount1: '1000',
          reserves0: '5000',
          reserves1: '10000',
        },
      ];

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      dexScreenerV2Service.getEvents.mockResolvedValue(mockEvents as any);

      const result = await controller.events(ExchangeId.OGEthereum, {
        fromBlock: '1000',
        toBlock: '2000',
      });

      expect(result.events[0]).toEqual({
        block: {
          blockNumber: 1000,
          blockTimestamp: 1704103200,
        },
        eventType: 'join',
        txnId: '0xTxHash',
        txnIndex: 1,
        eventIndex: 3,
        maker: '0xMaker',
        pairId: '0xCarbonControllerAddress-456',
        amount0: '500',
        amount1: '1000',
        reserves: {
          asset0: '5000',
          asset1: '10000',
        },
      });
    });
  });
});
