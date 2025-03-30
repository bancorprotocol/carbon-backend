import { Test, TestingModule } from '@nestjs/testing';
import { HistoricQuoteController } from './historic-quote.controller';
import { HistoricQuoteService } from './historic-quote.service';
import { DeploymentService, BlockchainType, ExchangeId } from '../deployment/deployment.service';
import { BadRequestException } from '@nestjs/common';
import { Decimal } from 'decimal.js';

describe('HistoricQuoteController', () => {
  let controller: HistoricQuoteController;

  const mockHistoricQuoteService = {
    getUsdBuckets: jest.fn(),
  };

  const mockDeploymentService = {
    getDeploymentByExchangeId: jest.fn(),
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HistoricQuoteController],
      providers: [
        {
          provide: HistoricQuoteService,
          useValue: mockHistoricQuoteService,
        },
        {
          provide: DeploymentService,
          useValue: mockDeploymentService,
        },
      ],
    }).compile();

    controller = module.get<HistoricQuoteController>(HistoricQuoteController);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('prices', () => {
    const validDateParams = {
      start: 1672531200, // 2023-01-01 00:00:00
      end: 1672617600, // 2023-01-02 00:00:00
      baseToken: '0xBaseToken',
      quoteToken: '0xQuoteToken',
    };

    it('should throw BadRequestException when end date is before start date', async () => {
      const params = {
        ...validDateParams,
        start: 1672617600, // 2023-01-02 00:00:00
        end: 1672531200, // 2023-01-01 00:00:00
      };

      await expect(controller.prices(ExchangeId.OGEthereum, params)).rejects.toThrow(BadRequestException);
    });

    it('should use normal token addresses when no Ethereum mappings exist', async () => {
      // Setup deployment without mappings
      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue({
        exchangeId: ExchangeId.OGSei,
        blockchainType: BlockchainType.Sei,
        // No mapEthereumTokens
      });

      // Mock the service response
      mockHistoricQuoteService.getUsdBuckets.mockResolvedValue([
        {
          timestamp: 1672531200,
          low: new Decimal('100'),
          high: new Decimal('110'),
          open: new Decimal('105'),
          close: new Decimal('107'),
          provider: 'codex',
        },
      ]);

      // Call the controller
      const result = await controller.prices(ExchangeId.OGSei, validDateParams);

      // Verify the service was called with correct parameters
      expect(mockHistoricQuoteService.getUsdBuckets).toHaveBeenCalledWith(
        BlockchainType.Sei,
        validDateParams.baseToken.toLowerCase(),
        validDateParams.quoteToken.toLowerCase(),
        validDateParams.start,
        validDateParams.end,
      );

      // Verify result formatting
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        timestamp: 1672531200,
        low: '100',
        high: '110',
        open: '105',
        close: '107',
        provider: 'codex',
      });

      // Verify no mapping info in result
      expect(result[0].mapped_base_token).toBeUndefined();
      expect(result[0].mapped_quote_token).toBeUndefined();
    });

    it('should use Ethereum mappings when they exist for base token', async () => {
      const baseEthAddress = '0xethbasetoken';

      // Setup deployment with mapping for base token only
      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue({
        exchangeId: ExchangeId.OGSei,
        blockchainType: BlockchainType.Sei,
        mapEthereumTokens: {
          [validDateParams.baseToken.toLowerCase()]: baseEthAddress,
        },
      });

      // Mock the service response
      mockHistoricQuoteService.getUsdBuckets.mockResolvedValue([
        {
          timestamp: 1672531200,
          low: new Decimal('100'),
          high: new Decimal('110'),
          open: new Decimal('105'),
          close: new Decimal('107'),
          provider: 'codex',
        },
      ]);

      // Call the controller
      const result = await controller.prices(ExchangeId.OGSei, validDateParams);

      // Verify the service was called with correct parameters
      expect(mockHistoricQuoteService.getUsdBuckets).toHaveBeenCalledWith(
        BlockchainType.Ethereum,
        baseEthAddress,
        validDateParams.quoteToken.toLowerCase(),
        validDateParams.start,
        validDateParams.end,
      );

      // Verify result includes mapping info
      expect(result[0].mappedBaseToken).toBe(baseEthAddress);
      expect(result[0].mappedQuoteToken).toBeUndefined();
    });

    it('should use Ethereum mappings when they exist for both tokens', async () => {
      const baseEthAddress = '0xEthBaseToken';
      const quoteEthAddress = '0xEthQuoteToken';

      // Setup deployment with mappings for both tokens
      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue({
        exchangeId: ExchangeId.OGSei,
        blockchainType: BlockchainType.Sei,
        mapEthereumTokens: {
          [validDateParams.baseToken.toLowerCase()]: baseEthAddress,
          [validDateParams.quoteToken.toLowerCase()]: quoteEthAddress,
        },
      });

      // Mock the service response
      mockHistoricQuoteService.getUsdBuckets.mockResolvedValue([
        {
          timestamp: 1672531200,
          low: new Decimal('100'),
          high: new Decimal('110'),
          open: new Decimal('105'),
          close: new Decimal('107'),
          provider: 'codex/coingecko', // Mixed provider
        },
      ]);

      // Call the controller
      const result = await controller.prices(ExchangeId.OGSei, validDateParams);

      // Verify the service was called with correct parameters
      expect(mockHistoricQuoteService.getUsdBuckets).toHaveBeenCalledWith(
        BlockchainType.Ethereum,
        baseEthAddress.toLowerCase(),
        quoteEthAddress.toLowerCase(),
        validDateParams.start,
        validDateParams.end,
      );

      // Verify result includes mapping info - using correct property names
      expect(result[0].mappedBaseToken).toBe(baseEthAddress.toLowerCase());
      expect(result[0].mappedQuoteToken).toBe(quoteEthAddress.toLowerCase());
    });

    it('should handle empty results from service', async () => {
      // Setup deployment
      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue({
        exchangeId: ExchangeId.OGSei,
        blockchainType: BlockchainType.Sei,
      });

      // Mock empty response
      mockHistoricQuoteService.getUsdBuckets.mockResolvedValue([]);

      // Call the controller
      const result = await controller.prices(ExchangeId.OGSei, validDateParams);

      // Verify result is empty array
      expect(result).toEqual([]);
    });

    it('should handle case-insensitive token address matching with mapEthereumTokens', async () => {
      // Setup deployment with token addresses in mixed case
      const baseTokenMixedCase = '0xaBC123dEF456';
      const quoteTokenMixedCase = '0x789GHI012jkl';
      const baseEthTokenMixedCase = '0xDEF456abc123';
      const quoteEthTokenMixedCase = '0xJKL012ghi789';

      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue({
        exchangeId: ExchangeId.OGSei,
        blockchainType: BlockchainType.Sei,
        mapEthereumTokens: {
          // Mixed case keys and values in the mapEthereumTokens object
          [baseTokenMixedCase]: baseEthTokenMixedCase,
          [quoteTokenMixedCase]: quoteEthTokenMixedCase,
        },
      });

      // Mock the service response
      mockHistoricQuoteService.getUsdBuckets.mockResolvedValue([
        {
          timestamp: 1672531200,
          low: new Decimal('100'),
          high: new Decimal('110'),
          open: new Decimal('105'),
          close: new Decimal('107'),
          provider: 'codex',
        },
      ]);

      // Use lowercase versions in the request params
      const params = {
        ...validDateParams,
        baseToken: baseTokenMixedCase.toLowerCase(),
        quoteToken: quoteTokenMixedCase.toLowerCase(),
      };

      // Call the controller
      const result = await controller.prices(ExchangeId.OGSei, params);

      // Verify the service was called with correct parameters - lowercase ethereum tokens
      expect(mockHistoricQuoteService.getUsdBuckets).toHaveBeenCalledWith(
        BlockchainType.Ethereum,
        baseEthTokenMixedCase.toLowerCase(),
        quoteEthTokenMixedCase.toLowerCase(),
        params.start,
        params.end,
      );

      // Verify the result has the correct mapping information
      expect(result[0].mappedBaseToken).toBe(baseEthTokenMixedCase.toLowerCase());
      expect(result[0].mappedQuoteToken).toBe(quoteEthTokenMixedCase.toLowerCase());
    });

    it('should handle mixed case input addresses and mapEthereumTokens', async () => {
      // Setup deployment with token addresses in mixed case
      const baseTokenUppercase = '0xABCDEF123456';
      const quoteTokenLowercase = '0x789abcdef012';
      const baseEthToken = '0xFEDCBA654321';
      const quoteEthToken = '0x210FEDCBA987';

      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue({
        exchangeId: ExchangeId.OGSei,
        blockchainType: BlockchainType.Sei,
        mapEthereumTokens: {
          // One uppercase, one lowercase in mapEthereumTokens
          [baseTokenUppercase]: baseEthToken,
          [quoteTokenLowercase]: quoteEthToken,
        },
      });

      // Mock the service response
      mockHistoricQuoteService.getUsdBuckets.mockResolvedValue([
        {
          timestamp: 1672531200,
          low: new Decimal('100'),
          high: new Decimal('110'),
          open: new Decimal('105'),
          close: new Decimal('107'),
          provider: 'codex',
        },
      ]);

      // Request with opposite case as stored in mapEthereumTokens
      const params = {
        ...validDateParams,
        baseToken: baseTokenUppercase.toLowerCase(), // Using lowercase
        quoteToken: quoteTokenLowercase.toUpperCase(), // Using uppercase
      };

      // Call the controller
      const result = await controller.prices(ExchangeId.OGSei, params);

      // Verify the service was called with correct parameters
      expect(mockHistoricQuoteService.getUsdBuckets).toHaveBeenCalledWith(
        BlockchainType.Ethereum,
        baseEthToken.toLowerCase(),
        quoteEthToken.toLowerCase(),
        params.start,
        params.end,
      );

      // Verify the result has the correct mapping information
      expect(result[0].mappedBaseToken).toBe(baseEthToken.toLowerCase());
      expect(result[0].mappedQuoteToken).toBe(quoteEthToken.toLowerCase());
    });
  });
});
