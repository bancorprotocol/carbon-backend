import { Test, TestingModule } from '@nestjs/testing';
import { CarbonPriceService } from './carbon-price.service';
import { TokensTradedEventService } from '../events/tokens-traded-event/tokens-traded-event.service';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { DeploymentService } from '../deployment/deployment.service';
import { HistoricQuoteService } from '../historic-quote/historic-quote.service';
import { BlockchainType, Deployment, ExchangeId, NATIVE_TOKEN } from '../deployment/deployment.service';
import { TokensTradedEvent } from '../events/tokens-traded-event/tokens-traded-event.entity';
import { HistoricQuote } from '../historic-quote/historic-quote.entity';
import { QuoteService } from '../quote/quote.service';
import { Decimal } from 'decimal.js';

describe('CarbonPriceService', () => {
  let service: CarbonPriceService;
  let tokensTradedEventService: jest.Mocked<TokensTradedEventService>;
  let lastProcessedBlockService: jest.Mocked<LastProcessedBlockService>;
  let deploymentService: jest.Mocked<DeploymentService>;
  let historicQuoteService: jest.Mocked<HistoricQuoteService>;
  let quoteService: jest.Mocked<QuoteService>;

  const mockDeployment: Partial<Deployment> = {
    blockchainType: BlockchainType.Coti,
    exchangeId: ExchangeId.OGCoti,
    mapEthereumTokens: {
      '0xCotiToken': '0xEthereumToken',
    },
    nativeTokenAlias: '0xNativeTokenAlias',
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

    quoteService = {
      addOrUpdateQuote: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CarbonPriceService,
        { provide: TokensTradedEventService, useValue: tokensTradedEventService },
        { provide: LastProcessedBlockService, useValue: lastProcessedBlockService },
        { provide: DeploymentService, useValue: deploymentService },
        { provide: HistoricQuoteService, useValue: historicQuoteService },
        { provide: QuoteService, useValue: quoteService },
      ],
    }).compile();

    service = module.get<CarbonPriceService>(CarbonPriceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('identifyTokenPair', () => {
    it('should identify token0 as known token when token1 is not mapped', () => {
      const token0Address = '0xcotitoken';
      const token1Address = '0xunknowntoken';
      const result = service.identifyTokenPair(token0Address, token1Address, mockTokenMap);

      expect(result).toEqual({
        unknownTokenAddress: token1Address,
        mappedTokenAddress: '0xethereumtoken',
        isToken0Known: true,
      });
    });

    it('should identify token1 as known token when token0 is not mapped', () => {
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

    it('should return null if both tokens are in the map', () => {
      // Create a token map with multiple tokens
      const multiTokenMap = {
        '0xcotitoken': '0xethereumtoken1',
        '0xanothertoken': '0xethereumtoken2',
      };

      const token0Address = '0xcotitoken';
      const token1Address = '0xanothertoken';
      const result = service.identifyTokenPair(token0Address, token1Address, multiTokenMap);

      expect(result).toBeNull();
    });
  });

  describe('normalizeTokenAddress', () => {
    it('should return the native token alias when address is native token', () => {
      const nativeTokenAddress = NATIVE_TOKEN.toLowerCase();
      const deployment = { ...mockDeployment, nativeTokenAlias: '0xNativeTokenAlias' } as Deployment;

      const result = service.normalizeTokenAddress(nativeTokenAddress, deployment);
      expect(result).toEqual('0xnativetokenalias');
    });

    it('should return the original address when address is not native token', () => {
      const tokenAddress = '0xsomeothertoken';
      const deployment = { ...mockDeployment, nativeTokenAlias: '0xNativeTokenAlias' } as Deployment;

      const result = service.normalizeTokenAddress(tokenAddress, deployment);
      expect(result).toEqual(tokenAddress);
    });

    it('should return the original address when nativeTokenAlias is not defined', () => {
      const nativeTokenAddress = NATIVE_TOKEN.toLowerCase();
      const deployment = { ...mockDeployment, nativeTokenAlias: undefined } as Deployment;

      const result = service.normalizeTokenAddress(nativeTokenAddress, deployment);
      expect(result).toEqual(nativeTokenAddress);
    });

    it('should return the original address when nativeTokenAlias is an empty string', () => {
      const nativeTokenAddress = NATIVE_TOKEN.toLowerCase();
      const deployment = { ...mockDeployment, nativeTokenAlias: '' } as Deployment;

      const result = service.normalizeTokenAddress(nativeTokenAddress, deployment);
      expect(result).toEqual(nativeTokenAddress);
    });

    it('should handle different casing of native token address', () => {
      const nativeTokenUpperCase = NATIVE_TOKEN.toUpperCase();
      const deployment = { ...mockDeployment, nativeTokenAlias: '0xNativeTokenAlias' } as Deployment;

      const result = service.normalizeTokenAddress(nativeTokenUpperCase, deployment);
      expect(result).toEqual('0xnativetokenalias');
    });
  });

  describe('calculateTokenPrice', () => {
    // Case 1: Source token is known
    it('should calculate correct price when source token is known', () => {
      const mockKnownTokenQuote = {
        tokenAddress: '0xBNT',
        usd: '2',
      } as HistoricQuote;
      const mockEvent = {
        sourceAmount: '100',
        targetAmount: '50',
        sourceToken: { address: '0xBNT', decimals: 2 },
        targetToken: { address: '0xUSDC', decimals: 2 },
      } as TokensTradedEvent;

      const result = service.calculateTokenPrice(mockKnownTokenQuote, mockEvent, mockDeployment as Deployment);
      expect(result.toString()).toEqual('4');
    });

    // Case 2: Target token is known
    it('should calculate correct price when target token is known', () => {
      const mockKnownTokenQuote = {
        tokenAddress: '0xBNT',
        usd: '2',
      } as HistoricQuote;
      const mockEvent = {
        sourceAmount: '50',
        targetAmount: '100',
        sourceToken: { address: '0xUSDC', decimals: 2 },
        targetToken: { address: '0xBNT', decimals: 2 },
      } as TokensTradedEvent;

      const result = service.calculateTokenPrice(mockKnownTokenQuote, mockEvent, mockDeployment as Deployment);
      expect(result.toString()).toEqual('4');
    });

    // Case 3: Other Quote - Source token is known
    it('should calculate correct price when source is known - other quote', () => {
      const mockKnownTokenQuote = {
        tokenAddress: '0xUSDC',
        usd: '1',
      } as HistoricQuote;
      const mockEvent = {
        sourceAmount: '100',
        targetAmount: '50',
        sourceToken: { address: '0xUSDC', decimals: 2 },
        targetToken: { address: '0xBNT', decimals: 2 },
      } as TokensTradedEvent;

      const result = service.calculateTokenPrice(mockKnownTokenQuote, mockEvent, mockDeployment as Deployment);
      expect(result.toString()).toEqual('2');
    });
    // Case 4: Other Quote - Target token is known
    it('should calculate correct price when target is known - other quote', () => {
      const mockKnownTokenQuote = {
        tokenAddress: '0xUSDC',
        usd: '1',
      } as HistoricQuote;
      const mockEvent = {
        sourceAmount: '50',
        targetAmount: '100',
        sourceToken: { address: '0xBNT', decimals: 2 },
        targetToken: { address: '0xUSDC', decimals: 2 },
      } as TokensTradedEvent;

      const result = service.calculateTokenPrice(mockKnownTokenQuote, mockEvent, mockDeployment as Deployment);
      expect(result.toString()).toEqual('2');
    });

    // Test with native token address in source token
    it('should handle native token in source address correctly', () => {
      const mockKnownTokenQuote = {
        tokenAddress: '0xethereumtoken',
        usd: '2',
      } as HistoricQuote;
      const mockEvent = {
        sourceAmount: '100',
        targetAmount: '50',
        sourceToken: { address: NATIVE_TOKEN, decimals: 18 },
        targetToken: { address: '0xUSDC', decimals: 6 },
      } as TokensTradedEvent;

      const deployment = {
        ...mockDeployment,
        nativeTokenAlias: '0xNativeTokenAlias',
        mapEthereumTokens: {
          '0xNativeTokenAlias': '0xethereumtoken',
        },
      } as Deployment;

      // Mock getLowercaseTokenMap to return the proper mapping for native token alias
      deploymentService.getLowercaseTokenMap.mockReturnValue({
        '0xnativetokenalias': '0xethereumtoken',
      });

      const result = service.calculateTokenPrice(mockKnownTokenQuote, mockEvent, deployment);
      expect(result.toString()).not.toEqual('0');
    });

    // Test with native token address in target token
    it('should handle native token in target address correctly', () => {
      const mockKnownTokenQuote = {
        tokenAddress: '0xethereumtoken',
        usd: '2',
      } as HistoricQuote;
      const mockEvent = {
        sourceAmount: '50',
        targetAmount: '100',
        sourceToken: { address: '0xUSDC', decimals: 6 },
        targetToken: { address: NATIVE_TOKEN, decimals: 18 },
      } as TokensTradedEvent;

      const deployment = {
        ...mockDeployment,
        nativeTokenAlias: '0xNativeTokenAlias',
        mapEthereumTokens: {
          '0xNativeTokenAlias': '0xethereumtoken',
        },
      } as Deployment;

      // Mock getLowercaseTokenMap to return the proper mapping for native token alias
      deploymentService.getLowercaseTokenMap.mockReturnValue({
        '0xnativetokenalias': '0xethereumtoken',
      });

      const result = service.calculateTokenPrice(mockKnownTokenQuote, mockEvent, deployment);
      expect(result.toString()).not.toEqual('0');
    });

    // Test token address normalization in tokenPair identification
    it('should properly identify token pairs with native tokens', () => {
      // Setup deployment with native token alias
      const deployment = {
        ...mockDeployment,
        nativeTokenAlias: '0xNativeTokenAlias',
      } as Deployment;

      // Normalize the native token address
      const normalizedAddress = service.normalizeTokenAddress(NATIVE_TOKEN.toLowerCase(), deployment);

      // Verify it returns the alias
      expect(normalizedAddress).toEqual('0xnativetokenalias');

      // Setup token map where the native token alias is mapped
      const tokenMap = {
        '0xnativetokenalias': '0xethereumtoken',
      };

      // Check that identifyTokenPair works with the normalized address
      const pair = service.identifyTokenPair(normalizedAddress, '0xsomeothertoken', tokenMap);

      // Verify the pair is identified correctly
      expect(pair).toEqual({
        unknownTokenAddress: '0xsomeothertoken',
        mappedTokenAddress: '0xethereumtoken',
        isToken0Known: true,
      });
    });

    // Test with different decimals
    it('should handle different token decimals correctly', () => {
      const mockKnownTokenQuote = {
        tokenAddress: '0xBNT',
        usd: '2',
      } as HistoricQuote;
      const mockEvent = {
        sourceAmount: '1000', // 10.00 after normalization
        targetAmount: '5', // 0.05 after normalization
        sourceToken: { address: '0xBNT', decimals: 2 },
        targetToken: { address: '0xUSDC', decimals: 2 },
      } as TokensTradedEvent;

      const result = service.calculateTokenPrice(mockKnownTokenQuote, mockEvent, mockDeployment as Deployment);
      expect(result.toString()).toEqual('400');
    });

    // Edge case: Very large numbers
    it('should handle large numbers correctly', () => {
      const largeQuote = {
        tokenAddress: '0xBNT',
        usd: '1000',
      } as HistoricQuote;

      const mockEvent = {
        sourceAmount: '100000',
        targetAmount: '100',
        sourceToken: { address: '0xBNT', decimals: 3 },
        targetToken: { address: '0xUSDC', decimals: 3 },
      } as TokensTradedEvent;

      const result = service.calculateTokenPrice(largeQuote, mockEvent, mockDeployment as Deployment);
      expect(result.toString()).toEqual('1000000');
    });

    // Edge case: Very small numbers
    it('should handle small numbers correctly', () => {
      const smallQuote = {
        tokenAddress: '0xBNT',
        usd: '0.01',
      } as HistoricQuote;

      const mockEvent = {
        sourceAmount: '10',
        targetAmount: '1000',
        sourceToken: { address: '0xBNT', decimals: 1 },
        targetToken: { address: '0xUSDC', decimals: 1 },
      } as TokensTradedEvent;

      const result = service.calculateTokenPrice(smallQuote, mockEvent, mockDeployment as Deployment);
      expect(result.toString()).toEqual('0.0001');
    });

    // Real cases
    it('should handle eth/usdc quote usdc', () => {
      const quote = {
        tokenAddress: '0xUSDC',
        usd: '1',
      } as HistoricQuote;

      const mockEvent = {
        sourceAmount: '9000000000000000',
        targetAmount: '15464710',
        sourceToken: { address: '0xETH', decimals: 18 },
        targetToken: { address: '0xUSDC', decimals: 6 },
      } as TokensTradedEvent;

      const result = service.calculateTokenPrice(quote, mockEvent, mockDeployment as Deployment);
      expect(result.toString()).toEqual('1718.3011111111111111');
    });

    // Real cases
    it('should handle eth/usdc quote eth', () => {
      const quote = {
        tokenAddress: '0xETH',
        usd: '1718.3011111111111112',
      } as HistoricQuote;

      const mockEvent = {
        type: 'sell',
        sourceAmount: '9000000000000000',
        targetAmount: '15464710',
        sourceToken: { address: '0xETH', decimals: 18 },
        targetToken: { address: '0xUSDC', decimals: 6 },
      } as TokensTradedEvent;

      const result = service.calculateTokenPrice(quote, mockEvent, mockDeployment as Deployment);
      expect(result.toString()).toEqual('1');
    });

    // Real cases
    it('should handle eth/usdc quote usdc flip', () => {
      const quote = {
        tokenAddress: '0xUSDC',
        usd: '1',
      } as HistoricQuote;

      const mockEvent = {
        type: 'sell',
        sourceAmount: '100000000',
        targetAmount: '61881098418604494',
        sourceToken: { address: '0xUSDC', decimals: 6 },
        targetToken: { address: '0xETH', decimals: 18 },
      } as TokensTradedEvent;

      const result = service.calculateTokenPrice(quote, mockEvent, mockDeployment as Deployment);
      expect(result.toString()).toEqual('1616.0023424848433866');
    });

    // Real cases
    it('should handle paxos/usdc quote usdc', () => {
      const quote = {
        tokenAddress: '0xUSDC',
        usd: '1',
      } as HistoricQuote;

      const mockEvent = {
        sourceAmount: '133575144290917245',
        targetAmount: '404598027',
        sourceToken: { address: '0xPAXOS', decimals: 18 },
        targetToken: { address: '0xUSDC', decimals: 6 },
      } as TokensTradedEvent;

      const result = service.calculateTokenPrice(quote, mockEvent, mockDeployment as Deployment);
      expect(result.toString()).toEqual('3028.9918768031725129');
    });
  });

  describe('processTradeEvent', () => {
    const mockEvent = {
      type: 'sell',
      sourceAmount: '20',
      targetAmount: '543',
      sourceToken: { address: '0xCotiToken', decimals: 18 },
      targetToken: { address: '0xUnknownToken', decimals: 6 },
      timestamp: new Date(),
    } as any;

    const mockEventWithBothMapped = {
      type: 'sell',
      sourceAmount: '20',
      targetAmount: '543',
      sourceToken: { address: '0xCotiToken', decimals: 18 },
      targetToken: { address: '0xAnotherMappedToken', decimals: 6 },
      timestamp: new Date(),
    } as any;

    const mockKnownTokenQuote = {
      tokenAddress: '0xethereumtoken',
      usd: '0.53',
    } as HistoricQuote;

    beforeEach(() => {
      historicQuoteService.getLast.mockReset();
      historicQuoteService.addQuote.mockReset();
      quoteService.addOrUpdateQuote.mockReset();
    });

    it('should return false if no token in pair is in token map', async () => {
      const emptyTokenMap = {};
      const result = await service.processTradeEvent(mockEvent, emptyTokenMap, mockDeployment as Deployment);
      expect(result).toBe(false);
      expect(historicQuoteService.getLast).not.toHaveBeenCalled();
    });

    it('should return false if both tokens in the pair are in the token map', async () => {
      // Create a token map with multiple tokens
      const multiTokenMap = {
        '0xcotitoken': '0xethereumtoken1',
        '0xanothermappedtoken': '0xethereumtoken2',
      };

      const result = await service.processTradeEvent(
        mockEventWithBothMapped,
        multiTokenMap,
        mockDeployment as Deployment,
      );
      expect(result).toBe(false);
      expect(historicQuoteService.getLast).not.toHaveBeenCalled();
    });

    it('should skip adding duplicate price for the same token', async () => {
      // The actual calculated price from our debugging
      const actualCalculatedPrice = '1.9521178637200736648e-14';

      // Capture the actual calculated price for debugging
      let calculatedPrice;

      // Override the calculateTokenPrice method to capture the calculated value
      jest.spyOn(service, 'calculateTokenPrice').mockImplementation(() => {
        // Use the exact same calculation as the real service
        const price = new Decimal('0.53')
          .mul(new Decimal('20').div(new Decimal(10).pow(18)))
          .div(new Decimal('543').div(new Decimal(10).pow(6)));

        calculatedPrice = price.toString();
        return price;
      });

      // Setup mocks for the first getLast call (for ethereum token)
      historicQuoteService.getLast.mockImplementation((blockchainType, tokenAddress) => {
        if (blockchainType === BlockchainType.Ethereum && tokenAddress === '0xethereumtoken') {
          return Promise.resolve(mockKnownTokenQuote);
        } else if (blockchainType === mockDeployment.blockchainType && tokenAddress === '0xunknowntoken') {
          // Return a mock quote with the exact same price that will be calculated
          return Promise.resolve({
            tokenAddress: '0xunknowntoken',
            blockchainType: mockDeployment.blockchainType,
            usd: actualCalculatedPrice, // Exact price that our mock calculation will produce
            timestamp: new Date(),
            provider: 'carbon-defi',
          } as HistoricQuote);
        }
        return Promise.resolve(null);
      });

      // Run the method
      const result = await service.processTradeEvent(mockEvent, mockTokenMap, mockDeployment as Deployment);

      // For debugging - should match the expected price format
      expect(calculatedPrice).toEqual(actualCalculatedPrice);

      // It should return false because the price is duplicated
      expect(result).toBe(false);

      // Verify historicQuoteService.getLast was called twice:
      // 1. To get the price of the known token
      // 2. To check if we already have this price for the target token
      expect(historicQuoteService.getLast).toHaveBeenCalledTimes(2);

      // Verify first call was for known Ethereum token
      expect(historicQuoteService.getLast).toHaveBeenNthCalledWith(1, BlockchainType.Ethereum, '0xethereumtoken');

      // Verify second call was for target token
      expect(historicQuoteService.getLast).toHaveBeenNthCalledWith(2, mockDeployment.blockchainType, '0xunknowntoken');

      // Verify that addQuote was NOT called since we detected a duplicate
      expect(historicQuoteService.addQuote).not.toHaveBeenCalled();

      // Verify that addOrUpdateQuote was NOT called since we detected a duplicate
      expect(quoteService.addOrUpdateQuote).not.toHaveBeenCalled();
    });

    it('should skip adding prices that have the same value but different formatting', async () => {
      // For consistent results, we'll use the exact same value on both sides
      const exactPrice = '0.00000000000001952';

      // Mock the logger
      jest.spyOn(service['logger'], 'debug').mockImplementation(jest.fn());
      jest.spyOn(service['logger'], 'log').mockImplementation(jest.fn());

      // Setup mocks for the first getLast call (for ethereum token)
      historicQuoteService.getLast.mockImplementation((blockchainType, tokenAddress) => {
        if (blockchainType === BlockchainType.Ethereum && tokenAddress === '0xethereumtoken') {
          return Promise.resolve(mockKnownTokenQuote);
        } else if (blockchainType === mockDeployment.blockchainType && tokenAddress === '0xunknowntoken') {
          // Return a mock quote with exactly the same value we'll use in calculateTokenPrice
          return Promise.resolve({
            tokenAddress: '0xunknowntoken',
            blockchainType: mockDeployment.blockchainType,
            usd: exactPrice,
            timestamp: new Date(),
            provider: 'carbon-defi',
          } as HistoricQuote);
        }
        return Promise.resolve(null);
      });

      // Override the calculateTokenPrice to return exactly the same value as in the lastQuote
      jest.spyOn(service, 'calculateTokenPrice').mockReturnValue(new Decimal(exactPrice));

      // Run the method
      const result = await service.processTradeEvent(mockEvent, mockTokenMap, mockDeployment as Deployment);

      // It should return false because the prices are equivalent
      expect(result).toBe(false);

      // Verify that addQuote was NOT called
      expect(historicQuoteService.addQuote).not.toHaveBeenCalled();

      // Verify that addOrUpdateQuote was NOT called
      expect(quoteService.addOrUpdateQuote).not.toHaveBeenCalled();
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
      quoteService.addOrUpdateQuote.mockResolvedValue({} as any);

      const result = await service.processTradeEvent(mockEvent, mockTokenMap, mockDeployment as Deployment);

      expect(result).toBe(true);
      expect(historicQuoteService.getLast).toHaveBeenCalledWith(BlockchainType.Ethereum, '0xethereumtoken');
      expect(historicQuoteService.addQuote).toHaveBeenCalledWith(
        expect.objectContaining({
          blockchainType: BlockchainType.Coti,
          tokenAddress: '0xunknowntoken',
          provider: 'carbon-defi',
          usd: expect.any(String),
          timestamp: mockEvent.timestamp,
        }),
      );

      // Verify QuoteService is called
      expect(quoteService.addOrUpdateQuote).toHaveBeenCalledWith(
        expect.objectContaining({
          token: mockEvent.targetToken,
          blockchainType: BlockchainType.Coti,
          usd: expect.any(String),
          timestamp: mockEvent.timestamp,
          provider: 'carbon-defi',
        }),
      );
    });

    it('should propagate errors from QuoteService.addOrUpdateQuote', async () => {
      historicQuoteService.getLast.mockResolvedValue(mockKnownTokenQuote);
      historicQuoteService.addQuote.mockResolvedValue({} as HistoricQuote);

      const testError = new Error('Test error');
      quoteService.addOrUpdateQuote.mockRejectedValue(testError);

      await expect(service.processTradeEvent(mockEvent, mockTokenMap, mockDeployment as Deployment)).rejects.toThrow(
        testError,
      );

      expect(historicQuoteService.addQuote).toHaveBeenCalled();
      expect(quoteService.addOrUpdateQuote).toHaveBeenCalled();
    });

    // Test with native token as the known token in processTradeEvent
    it('should handle processTradeEvent with native token correctly', async () => {
      // Mock an event where one token is the native token
      const mockEvent = {
        id: 1,
        blockchainType: BlockchainType.Coti,
        exchangeId: ExchangeId.OGCoti,
        block: 123456,
        transactionHash: '0xtxhash',
        timestamp: 123456789,
        sourceToken: { address: NATIVE_TOKEN, decimals: 18, name: 'ETH', symbol: 'ETH' },
        targetToken: { address: '0xtoken1', decimals: 6, name: 'Token1', symbol: 'TKN1' },
        sourceAmount: '1000000000000000000', // 1 ETH
        targetAmount: '1000000', // 1 TKN1
        logIndex: 0,
        provider: 'carbon',
        traderId: '0xtrader',
        pairId: '0xpair',
        strategy: 'trading',
      } as unknown as TokensTradedEvent;

      const deployment = {
        ...mockDeployment,
        nativeTokenAlias: '0xNativeTokenAlias',
        mapEthereumTokens: {
          '0xNativeTokenAlias': '0xethereumtoken',
        },
        blockchainType: BlockchainType.Coti,
      } as Deployment;

      // Mock token map to simulate nativeTokenAlias being in the map
      deploymentService.getLowercaseTokenMap.mockReturnValue({
        '0xnativetokenalias': '0xethereumtoken',
      });

      // Reset the mock to control getLast behavior
      historicQuoteService.getLast.mockReset();

      // Setup the mocks to verify duplicate detection logic
      // First call: return ETH price
      // Second call: return null for target token (no existing quote so we should save a new one)
      historicQuoteService.getLast.mockImplementation((blockchainType, tokenAddress) => {
        if (blockchainType === BlockchainType.Ethereum && tokenAddress === '0xethereumtoken') {
          return Promise.resolve({
            tokenAddress: '0xethereumtoken',
            usd: '2000',
            blockchainType: BlockchainType.Ethereum,
            timestamp: new Date(),
            provider: 'codex',
          });
        }
        // For the target token, return null to indicate no price exists yet
        return Promise.resolve(null);
      });

      // Mock addQuote to return a successful result
      historicQuoteService.addQuote.mockResolvedValue({} as HistoricQuote);
      quoteService.addOrUpdateQuote.mockResolvedValue({} as any);

      // Run processTradeEvent
      const result = await service.processTradeEvent(
        mockEvent,
        { '0xnativetokenalias': '0xethereumtoken' },
        deployment,
      );

      // Verify the result is true and quotes were added
      expect(result).toBe(true);
      expect(historicQuoteService.addQuote).toHaveBeenCalled();
      expect(quoteService.addOrUpdateQuote).toHaveBeenCalled();
    });

    it('should handle case where nativeTokenAlias has no mapping in tokenMap', async () => {
      // Mock an event with native token
      const mockEventWithNative = {
        sourceToken: { address: NATIVE_TOKEN, decimals: 18 },
        targetToken: { address: '0xUnknownToken', decimals: 6 },
        sourceAmount: '1000000000000000000',
        targetAmount: '100000',
        timestamp: new Date(),
      } as any;

      // Create a deployment with nativeTokenAlias
      const deployment = {
        ...mockDeployment,
        nativeTokenAlias: '0xNativeTokenAlias',
      } as Deployment;

      // Create a token map that doesn't include the nativeTokenAlias
      const tokenMapWithoutNative = {
        '0xsomeothertoken': '0xethereumtoken',
      };

      // Run processTradeEvent
      const result = await service.processTradeEvent(mockEventWithNative, tokenMapWithoutNative, deployment);

      // Should return false as the token pair wouldn't be identified
      expect(result).toBe(false);
      // Historic quote service shouldn't be called
      expect(historicQuoteService.getLast).not.toHaveBeenCalled();
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
