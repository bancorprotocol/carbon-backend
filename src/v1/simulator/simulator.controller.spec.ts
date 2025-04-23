import { Test, TestingModule } from '@nestjs/testing';
import { SimulatorController } from './simulator.controller';
import { SimulatorService } from './simulator.service';
import { HistoricQuoteService } from '../../historic-quote/historic-quote.service';
import { BlockchainType, DeploymentService, ExchangeId, NATIVE_TOKEN } from '../../deployment/deployment.service';
import { BadRequestException } from '@nestjs/common';
import Decimal from 'decimal.js';

describe('SimulatorController', () => {
  let controller: SimulatorController;

  const mockHistoricQuoteService = {
    getUsdBuckets: jest.fn(),
  };

  const mockSimulatorService = {
    generateSimulation: jest.fn(),
  };

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SimulatorController],
      providers: [
        {
          provide: SimulatorService,
          useValue: mockSimulatorService,
        },
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

    controller = module.get<SimulatorController>(SimulatorController);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('simulator', () => {
    const validParams = {
      start: 1672531200, // 2023-01-01 00:00:00
      end: 1672617600, // 2023-01-02 00:00:00
      baseToken: '0xBaseToken',
      quoteToken: '0xQuoteToken',
      sellBudget: 100,
      buyBudget: 100,
      sellMax: 120,
      sellMin: 110,
      buyMax: 90,
      buyMin: 80,
    };

    const mockUsdPrices = [
      {
        timestamp: 1672531200,
        low: new Decimal('85'),
        high: new Decimal('115'),
        open: new Decimal('100'),
        close: new Decimal('105'),
        provider: 'test',
      },
    ];

    const mockSimulationResult = {
      dates: [1672531200],
      prices: ['100.0'],
      ask: [115],
      bid: [85],
      RISK: { balance: [50] },
      CASH: { balance: [50] },
      portfolio_risk: [0.5],
      portfolio_cash: [0.5],
      portfolio_value: [100],
      hodl_value: [90],
      portfolio_over_hodl: [10],
      max_ask: 120,
      min_ask: 110,
      max_bid: 90,
      min_bid: 80,
      curve_parameters: {},
    };

    it('should throw BadRequestException when end date is before start date', async () => {
      const params = {
        ...validParams,
        start: 1672617600, // 2023-01-02 00:00:00
        end: 1672531200, // 2023-01-01 00:00:00
      };

      await expect(controller.simulator(ExchangeId.OGEthereum, params)).rejects.toThrow(BadRequestException);
    });

    it('should use normal token addresses when no Ethereum mappings exist', async () => {
      // Setup deployment without mappings
      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue({
        exchangeId: ExchangeId.OGSei,
        blockchainType: BlockchainType.Sei,
        // No mapEthereumTokens
      });

      // Mock service responses
      mockHistoricQuoteService.getUsdBuckets.mockResolvedValue(mockUsdPrices);
      mockSimulatorService.generateSimulation.mockResolvedValue(mockSimulationResult);

      // Call the controller
      await controller.simulator(ExchangeId.OGSei, validParams);

      // Verify the services were called with correct parameters
      expect(mockHistoricQuoteService.getUsdBuckets).toHaveBeenCalledWith(
        BlockchainType.Sei,
        BlockchainType.Sei,
        validParams.baseToken.toLowerCase(),
        validParams.quoteToken.toLowerCase(),
        validParams.start,
        validParams.end,
      );

      expect(mockSimulatorService.generateSimulation).toHaveBeenCalledWith(
        expect.objectContaining({
          baseToken: validParams.baseToken.toLowerCase(),
          quoteToken: validParams.quoteToken.toLowerCase(),
        }),
        mockUsdPrices,
        expect.objectContaining({
          blockchainType: BlockchainType.Sei,
        }),
        expect.objectContaining({
          blockchainType: BlockchainType.Sei,
        }),
        expect.objectContaining({
          blockchainType: BlockchainType.Sei,
        }),
      );
    });

    it('should use Ethereum mappings when they exist for base token', async () => {
      const baseEthAddress = '0xethbasetoken';

      // Setup deployment with mapping for base token only
      const seiDeployment = {
        exchangeId: ExchangeId.OGSei,
        blockchainType: BlockchainType.Sei,
        mapEthereumTokens: {
          [validParams.baseToken.toLowerCase()]: baseEthAddress,
        },
      };

      const ethereumDeployment = {
        exchangeId: ExchangeId.OGEthereum,
        blockchainType: BlockchainType.Ethereum,
      };

      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue(seiDeployment);
      mockDeploymentService.getDeploymentByBlockchainType.mockReturnValue(ethereumDeployment);

      // Mock service responses
      mockHistoricQuoteService.getUsdBuckets.mockResolvedValue(mockUsdPrices);
      mockSimulatorService.generateSimulation.mockResolvedValue(mockSimulationResult);

      // Call the controller
      await controller.simulator(ExchangeId.OGSei, validParams);

      // Verify the services were called with correct parameters
      expect(mockHistoricQuoteService.getUsdBuckets).toHaveBeenCalledWith(
        BlockchainType.Ethereum,
        BlockchainType.Sei,
        baseEthAddress.toLowerCase(),
        validParams.quoteToken.toLowerCase(),
        validParams.start,
        validParams.end,
      );

      // Verify the simulatorService was called with the sei deployment
      // When only one token is mapped to Ethereum, we should use the original deployment
      expect(mockSimulatorService.generateSimulation).toHaveBeenCalledWith(
        expect.objectContaining({
          baseToken: baseEthAddress.toLowerCase(),
          quoteToken: validParams.quoteToken.toLowerCase(),
        }),
        mockUsdPrices,
        ethereumDeployment,
        seiDeployment,
        seiDeployment,
      );
    });

    it('should use Ethereum mappings when they exist for both tokens', async () => {
      const baseEthAddress = '0xEthBaseToken';
      const quoteEthAddress = '0xEthQuoteToken';

      // Setup deployment with mappings for both tokens
      const seiDeployment = {
        exchangeId: ExchangeId.OGSei,
        blockchainType: BlockchainType.Sei,
        mapEthereumTokens: {
          [validParams.baseToken.toLowerCase()]: baseEthAddress,
          [validParams.quoteToken.toLowerCase()]: quoteEthAddress,
        },
      };

      const ethereumDeployment = {
        exchangeId: ExchangeId.OGEthereum,
        blockchainType: BlockchainType.Ethereum,
      };

      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue(seiDeployment);
      mockDeploymentService.getDeploymentByBlockchainType.mockReturnValue(ethereumDeployment);

      // Mock service responses
      mockHistoricQuoteService.getUsdBuckets.mockResolvedValue(mockUsdPrices);
      mockSimulatorService.generateSimulation.mockResolvedValue(mockSimulationResult);

      // Call the controller
      await controller.simulator(ExchangeId.OGSei, validParams);

      // Verify the services were called with correct parameters
      expect(mockHistoricQuoteService.getUsdBuckets).toHaveBeenCalledWith(
        BlockchainType.Ethereum,
        BlockchainType.Ethereum,
        baseEthAddress.toLowerCase(),
        quoteEthAddress.toLowerCase(),
        validParams.start,
        validParams.end,
      );

      // Verify the simulatorService was called with the ethereum deployment
      expect(mockSimulatorService.generateSimulation).toHaveBeenCalledWith(
        expect.objectContaining({
          baseToken: baseEthAddress.toLowerCase(),
          quoteToken: quoteEthAddress.toLowerCase(),
        }),
        mockUsdPrices,
        ethereumDeployment,
        ethereumDeployment,
        seiDeployment,
      );
    });

    it('should use Ethereum mapping only for quote token when base token has no mapping', async () => {
      const quoteEthAddress = '0xethquotetoken';

      // Setup deployment with mapping for quote token only
      const seiDeployment = {
        exchangeId: ExchangeId.OGSei,
        blockchainType: BlockchainType.Sei,
        mapEthereumTokens: {
          [validParams.quoteToken.toLowerCase()]: quoteEthAddress,
        },
      };

      const ethereumDeployment = {
        exchangeId: ExchangeId.OGEthereum,
        blockchainType: BlockchainType.Ethereum,
      };

      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue(seiDeployment);
      mockDeploymentService.getDeploymentByBlockchainType.mockReturnValue(ethereumDeployment);

      // Mock service responses
      mockHistoricQuoteService.getUsdBuckets.mockResolvedValue(mockUsdPrices);
      mockSimulatorService.generateSimulation.mockResolvedValue(mockSimulationResult);

      // Call the controller
      await controller.simulator(ExchangeId.OGSei, validParams);

      // Verify the services were called with correct parameters
      expect(mockHistoricQuoteService.getUsdBuckets).toHaveBeenCalledWith(
        BlockchainType.Sei,
        BlockchainType.Ethereum,
        validParams.baseToken.toLowerCase(),
        quoteEthAddress,
        validParams.start,
        validParams.end,
      );

      // Verify the simulatorService was called with the sei deployment
      // When only one token is mapped to Ethereum, we should use the original deployment
      expect(mockSimulatorService.generateSimulation).toHaveBeenCalledWith(
        expect.objectContaining({
          baseToken: validParams.baseToken.toLowerCase(),
          quoteToken: quoteEthAddress,
        }),
        mockUsdPrices,
        seiDeployment,
        ethereumDeployment,
        seiDeployment,
      );
    });

    it('should handle native token aliases', async () => {
      const nativeTokenAlias = '0xNativeTokenAlias';

      // Setup deployment with native token alias
      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue({
        exchangeId: ExchangeId.OGSei,
        blockchainType: BlockchainType.Sei,
        nativeTokenAlias: nativeTokenAlias,
      });

      // Use native token as base token
      const paramsWithNativeBase = {
        ...validParams,
        baseToken: NATIVE_TOKEN,
      };

      // Mock service responses
      mockHistoricQuoteService.getUsdBuckets.mockResolvedValue(mockUsdPrices);
      mockSimulatorService.generateSimulation.mockResolvedValue(mockSimulationResult);

      // Call the controller
      await controller.simulator(ExchangeId.OGSei, paramsWithNativeBase);

      // Verify the services were called with correct parameters
      expect(mockHistoricQuoteService.getUsdBuckets).toHaveBeenCalledWith(
        BlockchainType.Sei,
        BlockchainType.Sei,
        nativeTokenAlias.toLowerCase(),
        validParams.quoteToken.toLowerCase(),
        validParams.start,
        validParams.end,
      );

      expect(mockSimulatorService.generateSimulation).toHaveBeenCalledWith(
        expect.objectContaining({
          baseToken: nativeTokenAlias.toLowerCase(),
          quoteToken: validParams.quoteToken.toLowerCase(),
        }),
        mockUsdPrices,
        expect.objectContaining({
          blockchainType: BlockchainType.Sei,
        }),
        expect.objectContaining({
          blockchainType: BlockchainType.Sei,
        }),
        expect.objectContaining({
          blockchainType: BlockchainType.Sei,
        }),
      );
    });

    it('should handle both native token alias and Ethereum token mapping', async () => {
      const nativeTokenAlias = '0xNativeTokenAlias';
      const mappedNativeAlias = '0xMappedNativeAlias';

      // Setup deployment with both native token alias and ethereum mapping
      const seiDeployment = {
        exchangeId: ExchangeId.OGSei,
        blockchainType: BlockchainType.Sei,
        nativeTokenAlias: nativeTokenAlias,
        mapEthereumTokens: {
          [nativeTokenAlias.toLowerCase()]: mappedNativeAlias,
        },
      };

      const ethereumDeployment = {
        exchangeId: ExchangeId.OGEthereum,
        blockchainType: BlockchainType.Ethereum,
      };

      mockDeploymentService.getDeploymentByExchangeId.mockResolvedValue(seiDeployment);
      mockDeploymentService.getDeploymentByBlockchainType.mockReturnValue(ethereumDeployment);

      // Use native token as base token
      const paramsWithNativeBase = {
        ...validParams,
        baseToken: NATIVE_TOKEN,
      };

      // Mock service responses
      mockHistoricQuoteService.getUsdBuckets.mockResolvedValue(mockUsdPrices);
      mockSimulatorService.generateSimulation.mockResolvedValue(mockSimulationResult);

      // Call the controller
      await controller.simulator(ExchangeId.OGSei, paramsWithNativeBase);

      // Verify the native token was first replaced with its alias and then mapped to ethereum
      expect(mockHistoricQuoteService.getUsdBuckets).toHaveBeenCalledWith(
        BlockchainType.Ethereum,
        BlockchainType.Sei,
        mappedNativeAlias.toLowerCase(),
        validParams.quoteToken.toLowerCase(),
        validParams.start,
        validParams.end,
      );

      // Verify the simulatorService was called with the sei deployment
      // When only one token is mapped to Ethereum, we should use the original deployment
      expect(mockSimulatorService.generateSimulation).toHaveBeenCalledWith(
        expect.objectContaining({
          baseToken: mappedNativeAlias.toLowerCase(),
          quoteToken: validParams.quoteToken.toLowerCase(),
        }),
        mockUsdPrices,
        ethereumDeployment,
        seiDeployment,
        seiDeployment,
      );
    });
  });
});
