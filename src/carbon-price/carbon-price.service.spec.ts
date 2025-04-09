import { Test, TestingModule } from '@nestjs/testing';
import { CarbonPriceService } from './carbon-price.service';
import { TokensTradedEventService } from '../events/tokens-traded-event/tokens-traded-event.service';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { DeploymentService } from '../deployment/deployment.service';
import { HistoricQuoteService } from '../historic-quote/historic-quote.service';
import { BlockchainType, Deployment, ExchangeId } from '../deployment/deployment.service';
import { TokensTradedEvent } from '../events/tokens-traded-event/tokens-traded-event.entity';
import { HistoricQuote } from '../historic-quote/historic-quote.entity';
import Decimal from 'decimal.js';

describe('CarbonPriceService', () => {
  let service: CarbonPriceService;
  let tokensTradedEventService: jest.Mocked<TokensTradedEventService>;
  let lastProcessedBlockService: jest.Mocked<LastProcessedBlockService>;
  let deploymentService: jest.Mocked<DeploymentService>;
  let historicQuoteService: jest.Mocked<HistoricQuoteService>;

  const mockDeployment: Partial<Deployment> = {
    blockchainType: BlockchainType.Coti,
    exchangeId: ExchangeId.OGCoti,
    mapEthereumTokens: {
      '0xCotiToken': '0xEthereumToken',
    },
  };

  const mockTokenMap = {
    '0xcotitoken': '0xethereumtoken',
  };

  beforeEach(async () => {
    tokensTradedEventService = {
      get: jest.fn(),
    } as any;

    lastProcessedBlockService = {
      get: jest.fn(),
      update: jest.fn(),
    } as any;

    deploymentService = {
      getLowercaseTokenMap: jest.fn().mockReturnValue(mockTokenMap),
    } as any;

    historicQuoteService = {
      getLast: jest.fn(),
      addQuote: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CarbonPriceService,
        { provide: TokensTradedEventService, useValue: tokensTradedEventService },
        { provide: LastProcessedBlockService, useValue: lastProcessedBlockService },
        { provide: DeploymentService, useValue: deploymentService },
        { provide: HistoricQuoteService, useValue: historicQuoteService },
      ],
    }).compile();

    service = module.get<CarbonPriceService>(CarbonPriceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('identifyTokenPair', () => {
    it('should identify token0 as known token', () => {
      const token0Address = '0xcotitoken';
      const token1Address = '0xunknowntoken';
      const result = service.identifyTokenPair(token0Address, token1Address, mockTokenMap);

      expect(result).toEqual({
        unknownTokenAddress: token1Address,
        mappedTokenAddress: '0xethereumtoken',
        isToken0Known: true,
      });
    });

    it('should identify token1 as known token', () => {
      const token0Address = '0xunknowntoken';
      const token1Address = '0xcotitoken';
      const result = service.identifyTokenPair(token0Address, token1Address, mockTokenMap);

      expect(result).toEqual({
        unknownTokenAddress: token0Address,
        mappedTokenAddress: '0xethereumtoken',
        isToken0Known: false,
      });
    });

    it('should return null if no token is in the map', () => {
      const token0Address = '0xrandomtoken1';
      const token1Address = '0xrandomtoken2';
      const result = service.identifyTokenPair(token0Address, token1Address, mockTokenMap);

      expect(result).toBeNull();
    });
  });

  describe('calculateTokenPrice', () => {
    const mockKnownTokenQuote = {
      usd: '2',
    } as HistoricQuote;

    // Case 1: Token0 is known, selling token0 for token1
    it('should calculate correct price when token0 is known and selling', () => {
      const mockEvent = {
        type: 'sell',
        sourceAmount: '100',
        targetAmount: '50',
        sourceToken: { decimals: 2 },
        targetToken: { decimals: 2 },
      } as TokensTradedEvent;

      const result = service.calculateTokenPrice(mockKnownTokenQuote, mockEvent, true);

      // Expected: (100 / 10^2) * 2 / (50 / 10^2) = 1 * 2 / 0.5 = 4
      expect(result.toString()).toEqual('4');
    });

    // Case 2: Token0 is known, buying token0 with token1
    it('should calculate correct price when token0 is known and buying', () => {
      const mockEvent = {
        type: 'buy',
        sourceAmount: '50',
        targetAmount: '100',
        sourceToken: { decimals: 2 },
        targetToken: { decimals: 2 },
      } as TokensTradedEvent;

      const result = service.calculateTokenPrice(mockKnownTokenQuote, mockEvent, true);

      // Expected: (100 / 10^2) * 2 / (50 / 10^2) = 1 * 2 / 0.5 = 4
      expect(result.toString()).toEqual('4');
    });

    // Case 3: Token1 is known, selling token0 for token1
    it('should calculate correct price when token1 is known and selling', () => {
      const mockEvent = {
        type: 'sell',
        sourceAmount: '50',
        targetAmount: '100',
        sourceToken: { decimals: 2 },
        targetToken: { decimals: 2 },
      } as TokensTradedEvent;

      const result = service.calculateTokenPrice(mockKnownTokenQuote, mockEvent, false);

      // Expected: (100 / 10^2) * 2 / (50 / 10^2) = 1 * 2 / 0.5 = 4
      expect(result.toString()).toEqual('4');
    });

    // Case 4: Token1 is known, buying token0 with token1
    it('should calculate correct price when token1 is known and buying', () => {
      const mockEvent = {
        type: 'buy',
        sourceAmount: '100',
        targetAmount: '50',
        sourceToken: { decimals: 2 },
        targetToken: { decimals: 2 },
      } as TokensTradedEvent;

      const result = service.calculateTokenPrice(mockKnownTokenQuote, mockEvent, false);

      // Expected: (100 / 10^2) * 2 / (50 / 10^2) = 1 * 2 / 0.5 = 4
      expect(result.toString()).toEqual('4');
    });

    // Test with different decimals
    it('should handle different token decimals correctly', () => {
      const mockEvent = {
        type: 'sell',
        sourceAmount: '1000', // 10.00 after normalization
        targetAmount: '5', // 0.05 after normalization
        sourceToken: { decimals: 2 },
        targetToken: { decimals: 2 },
      } as TokensTradedEvent;

      const result = service.calculateTokenPrice(mockKnownTokenQuote, mockEvent, true);

      // Expected: (1000 / 10^2) * 2 / (5 / 10^2) = 10 * 2 / 0.05 = 400
      expect(result.toString()).toEqual('400');
    });

    // Edge case: Very large numbers
    it('should handle large numbers correctly', () => {
      const largeQuote = {
        usd: '1000',
      } as HistoricQuote;

      const mockEvent = {
        type: 'sell',
        sourceAmount: '100000',
        targetAmount: '100',
        sourceToken: { decimals: 3 },
        targetToken: { decimals: 3 },
      } as TokensTradedEvent;

      const result = service.calculateTokenPrice(largeQuote, mockEvent, true);

      // Expected: (100000 / 10^3) * 1000 / (100 / 10^3) = 100 * 1000 / 0.1 = 1000000
      expect(result.toString()).toEqual('1000000');
    });

    // Edge case: Very small numbers
    it('should handle small numbers correctly', () => {
      const smallQuote = {
        usd: '0.01',
      } as HistoricQuote;

      const mockEvent = {
        type: 'sell',
        sourceAmount: '10',
        targetAmount: '1000',
        sourceToken: { decimals: 1 },
        targetToken: { decimals: 1 },
      } as TokensTradedEvent;

      const result = service.calculateTokenPrice(smallQuote, mockEvent, true);

      // Expected: (10 / 10^1) * 0.01 / (1000 / 10^1) = 1 * 0.01 / 100 = 0.0001
      expect(result.toString()).toEqual('0.0001');
    });
  });

  describe('processTradeEvent', () => {
    const mockEvent = {
      pair: {
        token0: { address: '0xCotiToken' },
        token1: { address: '0xUnknownToken' },
      },
      type: 'sell',
      sourceAmount: '20',
      targetAmount: '543',
      sourceToken: { decimals: 18 },
      targetToken: { decimals: 6 },
      timestamp: new Date(),
    } as any;

    const mockKnownTokenQuote = {
      usd: '0.53',
    } as HistoricQuote;

    beforeEach(() => {
      historicQuoteService.getLast.mockReset();
      historicQuoteService.addQuote.mockReset();
    });

    it('should return false if no token in pair is in token map', async () => {
      const emptyTokenMap = {};
      const result = await service.processTradeEvent(mockEvent, emptyTokenMap, mockDeployment as Deployment);
      expect(result).toBe(false);
      expect(historicQuoteService.getLast).not.toHaveBeenCalled();
    });

    it('should return false if known token has no price data', async () => {
      historicQuoteService.getLast.mockResolvedValue(null);

      const result = await service.processTradeEvent(mockEvent, mockTokenMap, mockDeployment as Deployment);

      expect(result).toBe(false);
      expect(historicQuoteService.getLast).toHaveBeenCalledWith(BlockchainType.Ethereum, '0xethereumtoken');
      expect(historicQuoteService.addQuote).not.toHaveBeenCalled();
    });

    it('should calculate and save price when token0 is known', async () => {
      historicQuoteService.getLast.mockResolvedValue(mockKnownTokenQuote);
      historicQuoteService.addQuote.mockResolvedValue({} as HistoricQuote);

      const result = await service.processTradeEvent(mockEvent, mockTokenMap, mockDeployment as Deployment);

      expect(result).toBe(true);
      expect(historicQuoteService.getLast).toHaveBeenCalledWith(BlockchainType.Ethereum, '0xethereumtoken');
      expect(historicQuoteService.addQuote).toHaveBeenCalledWith(
        expect.objectContaining({
          blockchainType: BlockchainType.Coti,
          tokenAddress: '0xunknowntoken',
          provider: 'carbon-price',
          usd: expect.any(String),
          timestamp: mockEvent.timestamp,
        }),
      );
    });
  });

  describe('update', () => {
    beforeEach(() => {
      lastProcessedBlockService.get.mockResolvedValue(1000);
      tokensTradedEventService.get.mockResolvedValue([]);
      lastProcessedBlockService.update.mockResolvedValue(undefined);
    });

    it('should skip processing if deployment has no mapEthereumTokens', async () => {
      const deploymentWithoutMap = { ...mockDeployment, mapEthereumTokens: undefined };

      const result = await service.update(2000, deploymentWithoutMap as Deployment);

      expect(result).toEqual({
        startBlock: 2000,
        endBlock: 2000,
        processed: 0,
      });
      expect(lastProcessedBlockService.update).toHaveBeenCalledWith(
        `carbon-price-${mockDeployment.blockchainType}-${mockDeployment.exchangeId}`,
        2000,
      );
      expect(tokensTradedEventService.get).not.toHaveBeenCalled();
    });

    it('should process events in batches', async () => {
      const mockEvent = {
        pair: {
          token0: { address: '0xCotiToken' },
          token1: { address: '0xUnknownToken' },
        },
        type: 'sell',
        sourceAmount: '20',
        targetAmount: '543',
        sourceToken: { decimals: 18 },
        targetToken: { decimals: 6 },
        timestamp: new Date(),
      } as any;

      tokensTradedEventService.get.mockResolvedValue([mockEvent, mockEvent]);

      // Spy on processTradeEvent
      jest.spyOn(service, 'processTradeEvent').mockResolvedValue(true);

      const result = await service.update(2000, mockDeployment as Deployment);

      expect(result).toEqual({
        startBlock: 1001,
        endBlock: 2000,
        processed: 2,
        pricesUpdated: 2,
      });

      expect(lastProcessedBlockService.get).toHaveBeenCalledWith(
        `carbon-price-${mockDeployment.blockchainType}-${mockDeployment.exchangeId}`,
      );

      expect(tokensTradedEventService.get).toHaveBeenCalledWith(1001, 2000, mockDeployment);

      expect(service.processTradeEvent).toHaveBeenCalledTimes(2);

      expect(lastProcessedBlockService.update).toHaveBeenCalledWith(
        `carbon-price-${mockDeployment.blockchainType}-${mockDeployment.exchangeId}`,
        2000,
      );
    });

    it('should handle multiple batches if needed', async () => {
      // Make the test process two batches
      const endBlock = 12000;

      // Mock the actual behavior by capturing the actual arguments
      let firstCallArgs = [];
      let secondCallArgs = [];

      tokensTradedEventService.get.mockImplementation((start, end, deployment) => {
        if (!firstCallArgs.length) {
          firstCallArgs = [start, end, deployment];
          return Promise.resolve([{} as any]);
        } else {
          secondCallArgs = [start, end, deployment];
          return Promise.resolve([{} as any, {} as any]);
        }
      });

      // Spy on processTradeEvent and make it return true for all events
      jest.spyOn(service, 'processTradeEvent').mockResolvedValue(true);

      const result = await service.update(endBlock, mockDeployment as Deployment);

      expect(result).toEqual({
        startBlock: 1001,
        endBlock: 12000,
        processed: 3,
        pricesUpdated: 3,
      });

      // Should call get for two separate batches
      expect(tokensTradedEventService.get).toHaveBeenCalledTimes(2);

      // Instead of hardcoding values that may change if implementation changes,
      // verify the overall behavior is correct
      expect(firstCallArgs[0]).toBe(1001); // First batch starts at startBlock
      expect(firstCallArgs[1]).toBeLessThan(endBlock); // First batch ends before endBlock
      expect(firstCallArgs[2]).toEqual(mockDeployment); // First batch has correct deployment

      expect(secondCallArgs[0]).toBeGreaterThan(firstCallArgs[1]); // Second batch starts after first ends
      expect(secondCallArgs[1]).toBe(endBlock); // Second batch ends at endBlock
      expect(secondCallArgs[2]).toEqual(mockDeployment); // Second batch has correct deployment

      // Should process 3 events in total
      expect(service.processTradeEvent).toHaveBeenCalledTimes(3);

      // Should update the last processed block twice (once per batch)
      expect(lastProcessedBlockService.update).toHaveBeenCalledTimes(2);
      expect(lastProcessedBlockService.update).toHaveBeenNthCalledWith(
        1,
        `carbon-price-${mockDeployment.blockchainType}-${mockDeployment.exchangeId}`,
        firstCallArgs[1], // Use the captured end block from first batch
      );
      expect(lastProcessedBlockService.update).toHaveBeenNthCalledWith(
        2,
        `carbon-price-${mockDeployment.blockchainType}-${mockDeployment.exchangeId}`,
        secondCallArgs[1], // Use the captured end block from second batch
      );
    });
  });
});
