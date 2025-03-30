import { Test, TestingModule } from '@nestjs/testing';
import { MarketRateController } from './market-rate.controller';
import { DeploymentService, ExchangeId } from '../../deployment/deployment.service';
import { CodexService } from '../../codex/codex.service';
import { CoinGeckoService } from '../../quote/coingecko.service';
import { QuoteService } from '../../quote/quote.service';
import { BadRequestException } from '@nestjs/common';

const MockBlockchainType = {
  Ethereum: 'ethereum',
  Sei: 'sei-network',
  Other: 'other-chain',
};

enum MockExchangeId {
  Ethereum = 'mock-ethereum',
  Sei = 'mock-sei',
  Other = 'mock-other',
}

describe('MarketRateController', () => {
  let controller: MarketRateController;

  const mockDeploymentService = {
    getDeploymentByExchangeId: jest.fn(),
    getDeploymentByBlockchainType: jest.fn(),
    getLowercaseTokenMap: jest.fn((deployment) => {
      if (!deployment.mapEthereumTokens) {
        return {};
      }

      return Object.entries(deployment.mapEthereumTokens).reduce((acc, [key, value]) => {
        acc[key.toLowerCase()] = (value as string).toLowerCase();
        return acc;
      }, {});
    }),
  };

  const mockCodexService = {
    getLatestPrices: jest.fn(),
  };

  const mockCoinGeckoService = {
    fetchLatestPrice: jest.fn(),
  };

  const mockQuoteService = {
    getRecentQuotesForAddress: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MarketRateController],
      providers: [
        {
          provide: DeploymentService,
          useValue: mockDeploymentService,
        },
        {
          provide: CodexService,
          useValue: mockCodexService,
        },
        {
          provide: CoinGeckoService,
          useValue: mockCoinGeckoService,
        },
        {
          provide: QuoteService,
          useValue: mockQuoteService,
        },
      ],
    }).compile();

    controller = module.get<MarketRateController>(MarketRateController);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('marketRate', () => {
    const validParams = {
      address: '0xTokenAddress',
      convert: 'usd',
    };

    it('should return existing quote if available and only USD conversion is requested', async () => {
      // Setup deployment
      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue({
        blockchainType: MockBlockchainType.Ethereum,
      });

      // Mock existing quote
      const existingQuote = {
        usd: '1234.56',
        provider: 'existing-provider',
      };
      mockQuoteService.getRecentQuotesForAddress.mockResolvedValue(existingQuote);

      const result = await controller.marketRate(MockExchangeId.Ethereum as unknown as ExchangeId, validParams);

      // Verify quoteService was called
      expect(mockQuoteService.getRecentQuotesForAddress).toHaveBeenCalledWith(
        MockBlockchainType.Ethereum,
        validParams.address.toLowerCase(),
      );

      // Verify result format
      expect(result).toEqual({
        data: { USD: 1234.56 },
        provider: 'existing-provider',
      });

      // Verify other services were not called
      expect(mockCodexService.getLatestPrices).not.toHaveBeenCalled();
      expect(mockCoinGeckoService.fetchLatestPrice).not.toHaveBeenCalled();
    });

    it('should use normal token address when no Ethereum mappings exist', async () => {
      // Setup deployment without mappings
      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue({
        blockchainType: MockBlockchainType.Sei,
        // No mapEthereumTokens
      });

      // Mock no existing quote
      mockQuoteService.getRecentQuotesForAddress.mockResolvedValue(null);

      // Mock codex service response
      const codexResponse = {
        [validParams.address.toLowerCase()]: {
          usd: 123.45,
          provider: 'codex',
        },
      };
      mockCodexService.getLatestPrices.mockResolvedValue(codexResponse);

      // Call the controller
      const result = await controller.marketRate(MockExchangeId.Sei as unknown as ExchangeId, validParams);

      // Verify codexService was called with correct parameters
      expect(mockCodexService.getLatestPrices).toHaveBeenCalledWith(
        expect.objectContaining({ blockchainType: MockBlockchainType.Sei }),
        [validParams.address.toLowerCase()],
      );

      // Verify result format
      expect(result).toEqual({
        data: { USD: 123.45 },
        provider: 'codex',
      });
    });

    it('should use Ethereum mappings when they exist', async () => {
      const originalAddress = '0xOriginalToken';
      const ethereumAddress = '0xEthereumToken';

      // Setup sei deployment with ethereum mapping
      const seiDeployment = {
        blockchainType: MockBlockchainType.Sei,
        mapEthereumTokens: {
          [originalAddress.toLowerCase()]: ethereumAddress,
        },
      };

      // Setup ethereum deployment
      const ethereumDeployment = {
        blockchainType: MockBlockchainType.Ethereum,
      };

      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue(seiDeployment);
      mockDeploymentService.getDeploymentByBlockchainType.mockReturnValue(ethereumDeployment);

      // Mock no existing quote
      mockQuoteService.getRecentQuotesForAddress.mockResolvedValue(null);

      // Mock service responses
      const params = {
        ...validParams,
        address: originalAddress,
      };

      // Mock coingecko service response (first in the ethereum providers list)
      const coingeckoResponse = {
        [ethereumAddress.toLowerCase()]: {
          usd: 456.78,
          eur: 400.0,
          provider: 'coingecko',
        },
      };
      mockCoinGeckoService.fetchLatestPrice.mockResolvedValue(coingeckoResponse);

      // Call the controller with multiple currencies
      const multiCurrencyParams = {
        ...params,
        convert: 'usd,eur',
      };
      const result = await controller.marketRate(MockExchangeId.Sei as unknown as ExchangeId, multiCurrencyParams);

      // Verify coinGeckoService was called with correct parameters
      expect(mockCoinGeckoService.fetchLatestPrice).toHaveBeenCalledWith(
        ethereumDeployment,
        ethereumAddress.toLowerCase(),
        ['usd', 'eur'],
      );

      // Verify result format
      expect(result).toEqual({
        data: {
          USD: 456.78,
          EUR: 400.0,
        },
        provider: 'coingecko',
      });
    });

    it('should try multiple providers and return first successful result', async () => {
      // Setup deployment
      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue({
        blockchainType: MockBlockchainType.Ethereum,
      });

      // Mock no existing quote
      mockQuoteService.getRecentQuotesForAddress.mockResolvedValue(null);

      // Mock coingecko service failure
      mockCoinGeckoService.fetchLatestPrice.mockRejectedValue(new Error('Service unavailable'));

      // Mock codex service success
      const codexResponse = {
        [validParams.address.toLowerCase()]: {
          usd: 789.01,
          provider: 'codex',
        },
      };
      mockCodexService.getLatestPrices.mockResolvedValue(codexResponse);

      // Call the controller
      const result = await controller.marketRate(MockExchangeId.Ethereum as unknown as ExchangeId, validParams);

      // Verify both services were called
      expect(mockCoinGeckoService.fetchLatestPrice).toHaveBeenCalled();
      expect(mockCodexService.getLatestPrices).toHaveBeenCalled();

      // Verify result format
      expect(result).toEqual({
        data: { USD: 789.01 },
        provider: 'codex',
      });
    });

    it('should throw BadRequestException when no price data is available', async () => {
      // Setup deployment
      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue({
        blockchainType: MockBlockchainType.Ethereum,
      });

      // Mock no existing quote
      mockQuoteService.getRecentQuotesForAddress.mockResolvedValue(null);

      // Mock service failures or empty responses
      mockCoinGeckoService.fetchLatestPrice.mockRejectedValue(new Error('Service unavailable'));
      mockCodexService.getLatestPrices.mockResolvedValue({});

      // Call the controller and expect exception
      await expect(
        controller.marketRate(MockExchangeId.Ethereum as unknown as ExchangeId, validParams),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle case-insensitive token address mapping', async () => {
      const originalAddressMixedCase = '0xOricgiNALtokEN';
      const ethereumAddressMixedCase = '0xEthEReumToKEN';

      // Setup sei deployment with ethereum mapping in mixed case
      const seiDeployment = {
        blockchainType: MockBlockchainType.Sei,
        mapEthereumTokens: {
          [originalAddressMixedCase]: ethereumAddressMixedCase,
        },
      };

      // Setup ethereum deployment
      const ethereumDeployment = {
        blockchainType: MockBlockchainType.Ethereum,
      };

      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue(seiDeployment);
      mockDeploymentService.getDeploymentByBlockchainType.mockReturnValue(ethereumDeployment);

      // Mock no existing quote
      mockQuoteService.getRecentQuotesForAddress.mockResolvedValue(null);

      // Use lowercase in params to test case-insensitivity
      const params = {
        ...validParams,
        address: originalAddressMixedCase.toLowerCase(),
      };

      // Mock coingecko service response
      const coingeckoResponse = {
        [ethereumAddressMixedCase.toLowerCase()]: {
          usd: 555.55,
          provider: 'coingecko',
        },
      };
      mockCoinGeckoService.fetchLatestPrice.mockResolvedValue(coingeckoResponse);

      // Call the controller
      const result = await controller.marketRate(MockExchangeId.Sei as unknown as ExchangeId, params);

      // Verify coinGeckoService was called with correct parameters (lowercase ethereum address)
      expect(mockCoinGeckoService.fetchLatestPrice).toHaveBeenCalledWith(
        ethereumDeployment,
        ethereumAddressMixedCase.toLowerCase(),
        ['usd'],
      );

      // Verify result format
      expect(result).toEqual({
        data: { USD: 555.55 },
        provider: 'coingecko',
      });
    });
  });
});
