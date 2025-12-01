import { Test, TestingModule } from '@nestjs/testing';
import { TokensController } from './tokens.controller';
import { DeploymentService, ExchangeId, BlockchainType, Deployment } from '../../deployment/deployment.service';
import { TokenService } from '../../token/token.service';
import { Token } from '../../token/token.entity';
import { QuoteService } from '../../quote/quote.service';
import { StrategyService, StrategyWithOwner } from '../../strategy/strategy.service';
import { BlockService } from '../../block/block.service';
import { Block } from '../../block/block.entity';
import { Quote } from '../../quote/quote.entity';

describe('TokensController', () => {
  let controller: TokensController;
  let deploymentService: jest.Mocked<DeploymentService>;
  let tokenService: jest.Mocked<TokenService>;
  let quoteService: jest.Mocked<QuoteService>;
  let strategyService: jest.Mocked<StrategyService>;
  let blockService: jest.Mocked<BlockService>;

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

  const mockTokens: Token[] = [
    {
      id: 1,
      address: '0xToken1Address',
      symbol: 'TKN1',
      name: 'Token One',
      decimals: 18,
      blockchainType: BlockchainType.Ethereum,
      exchangeId: ExchangeId.OGEthereum,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 2,
      address: '0xToken2Address',
      symbol: 'TKN2',
      name: 'Token Two',
      decimals: 6,
      blockchainType: BlockchainType.Ethereum,
      exchangeId: ExchangeId.OGEthereum,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TokensController],
      providers: [
        {
          provide: DeploymentService,
          useValue: {
            getDeploymentByExchangeId: jest.fn(),
          },
        },
        {
          provide: TokenService,
          useValue: {
            all: jest.fn(),
          },
        },
        {
          provide: QuoteService,
          useValue: {
            allByAddress: jest.fn(),
          },
        },
        {
          provide: StrategyService,
          useValue: {
            getStrategiesWithOwners: jest.fn(),
          },
        },
        {
          provide: BlockService,
          useValue: {
            getLastBlock: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<TokensController>(TokensController);
    deploymentService = module.get(DeploymentService);
    tokenService = module.get(TokenService);
    quoteService = module.get(QuoteService);
    strategyService = module.get(StrategyService);
    blockService = module.get(BlockService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getTokens', () => {
    it('should return all tokens with correct format', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      tokenService.all.mockResolvedValue(mockTokens);

      const result = await controller.getTokens(ExchangeId.OGEthereum);

      expect(result).toEqual([
        {
          address: '0xToken1Address',
          symbol: 'TKN1',
          name: 'Token One',
          decimals: 18,
        },
        {
          address: '0xToken2Address',
          symbol: 'TKN2',
          name: 'Token Two',
          decimals: 6,
        },
      ]);
      expect(deploymentService.getDeploymentByExchangeId).toHaveBeenCalledWith(ExchangeId.OGEthereum);
      expect(tokenService.all).toHaveBeenCalledWith(mockDeployment);
    });

    it('should return empty array when no tokens exist', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      tokenService.all.mockResolvedValue([]);

      const result = await controller.getTokens(ExchangeId.OGEthereum);

      expect(result).toEqual([]);
      expect(deploymentService.getDeploymentByExchangeId).toHaveBeenCalledWith(ExchangeId.OGEthereum);
      expect(tokenService.all).toHaveBeenCalledWith(mockDeployment);
    });

    it('should work with different exchange IDs', async () => {
      const seiDeployment: Deployment = {
        ...mockDeployment,
        blockchainType: BlockchainType.Sei,
        exchangeId: ExchangeId.OGSei,
      };

      const seiTokens: Token[] = [
        {
          id: 3,
          address: '0xSeiTokenAddress',
          symbol: 'SEI',
          name: 'Sei Token',
          decimals: 18,
          blockchainType: BlockchainType.Sei,
          exchangeId: ExchangeId.OGSei,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      deploymentService.getDeploymentByExchangeId.mockReturnValue(seiDeployment);
      tokenService.all.mockResolvedValue(seiTokens);

      const result = await controller.getTokens(ExchangeId.OGSei);

      expect(result).toEqual([
        {
          address: '0xSeiTokenAddress',
          symbol: 'SEI',
          name: 'Sei Token',
          decimals: 18,
        },
      ]);
      expect(deploymentService.getDeploymentByExchangeId).toHaveBeenCalledWith(ExchangeId.OGSei);
    });

    it('should only return required fields', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      tokenService.all.mockResolvedValue(mockTokens);

      const result = await controller.getTokens(ExchangeId.OGEthereum);

      // Verify that only the required fields are present
      result.forEach((token) => {
        expect(Object.keys(token).sort()).toEqual(['address', 'decimals', 'name', 'symbol'].sort());
        expect(token).not.toHaveProperty('id');
        expect(token).not.toHaveProperty('blockchainType');
        expect(token).not.toHaveProperty('exchangeId');
        expect(token).not.toHaveProperty('createdAt');
        expect(token).not.toHaveProperty('updatedAt');
      });
    });
  });

  describe('getTokensPrices', () => {
    const mockBlock: Block = {
      id: 1000,
      timestamp: new Date(),
      blockchainType: BlockchainType.Ethereum,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockStrategies: StrategyWithOwner[] = [
      {
        strategyId: '1',
        owner: '0xOwner1',
        token0Address: '0xToken1Address',
        token1Address: '0xToken2Address',
        order0: 'encoded0',
        order1: 'encoded1',
        liquidity0: '10',
        lowestRate0: '0.000244140625',
        highestRate0: '0.000244140625',
        marginalRate0: '0.000244140625',
        liquidity1: '2000',
        lowestRate1: '4096',
        highestRate1: '4096',
        marginalRate1: '4096',
      },
      {
        strategyId: '2',
        owner: '0xOwner2',
        token0Address: '0xToken2Address',
        token1Address: '0xToken3Address',
        order0: 'encoded0',
        order1: 'encoded1',
        liquidity0: '5000',
        lowestRate0: '4096',
        highestRate0: '4096',
        marginalRate0: '4096',
        liquidity1: '1',
        lowestRate1: '0.000244140625',
        highestRate1: '0.000244140625',
        marginalRate1: '0.000244140625',
      },
    ];

    const mockQuotes = {
      '0xToken1Address': {
        id: 1,
        blockchainType: BlockchainType.Ethereum,
        provider: 'coingecko',
        timestamp: new Date(),
        token: mockTokens[0],
        usd: '1.5',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Quote,
      '0xToken2Address': {
        id: 2,
        blockchainType: BlockchainType.Ethereum,
        provider: 'coingecko',
        timestamp: new Date(),
        token: mockTokens[1],
        usd: '2.75',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Quote,
      '0xToken3Address': {
        id: 3,
        blockchainType: BlockchainType.Ethereum,
        provider: 'coingecko',
        timestamp: new Date(),
        token: { ...mockTokens[0], address: '0xToken3Address' },
        usd: '100.50',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Quote,
      '0xToken4Address': {
        id: 4,
        blockchainType: BlockchainType.Ethereum,
        provider: 'coingecko',
        timestamp: new Date(),
        token: { ...mockTokens[0], address: '0xToken4Address' },
        usd: '50.25',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Quote,
    };

    it('should return prices for tokens used in non-deleted strategies', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      blockService.getLastBlock.mockResolvedValue(mockBlock);
      strategyService.getStrategiesWithOwners.mockResolvedValue(mockStrategies);
      quoteService.allByAddress.mockResolvedValue(mockQuotes);

      const result = await controller.getTokensPrices(ExchangeId.OGEthereum);

      expect(result).toEqual({
        '0xToken1Address': 1.5,
        '0xToken2Address': 2.75,
        '0xToken3Address': 100.5,
      });
      expect(deploymentService.getDeploymentByExchangeId).toHaveBeenCalledWith(ExchangeId.OGEthereum);
      expect(blockService.getLastBlock).toHaveBeenCalledWith(mockDeployment);
      expect(strategyService.getStrategiesWithOwners).toHaveBeenCalledWith(mockDeployment, mockBlock.id);
      expect(quoteService.allByAddress).toHaveBeenCalledWith(mockDeployment);
    });

    it('should exclude tokens not used in any strategy', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      blockService.getLastBlock.mockResolvedValue(mockBlock);
      strategyService.getStrategiesWithOwners.mockResolvedValue(mockStrategies);
      quoteService.allByAddress.mockResolvedValue(mockQuotes);

      const result = await controller.getTokensPrices(ExchangeId.OGEthereum);

      // Token4 is in quotes but not in any strategy, so it should be excluded
      expect(result).not.toHaveProperty('0xToken4Address');
      expect(Object.keys(result)).toHaveLength(3);
    });

    it('should return empty object when no last block exists', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      blockService.getLastBlock.mockResolvedValue(null);

      const result = await controller.getTokensPrices(ExchangeId.OGEthereum);

      expect(result).toEqual({});
      expect(blockService.getLastBlock).toHaveBeenCalledWith(mockDeployment);
      expect(strategyService.getStrategiesWithOwners).not.toHaveBeenCalled();
      expect(quoteService.allByAddress).not.toHaveBeenCalled();
    });

    it('should return empty object when no strategies exist', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      blockService.getLastBlock.mockResolvedValue(mockBlock);
      strategyService.getStrategiesWithOwners.mockResolvedValue([]);
      quoteService.allByAddress.mockResolvedValue(mockQuotes);

      const result = await controller.getTokensPrices(ExchangeId.OGEthereum);

      expect(result).toEqual({});
      expect(strategyService.getStrategiesWithOwners).toHaveBeenCalledWith(mockDeployment, mockBlock.id);
      expect(quoteService.allByAddress).toHaveBeenCalledWith(mockDeployment);
    });

    it('should handle strategies with no matching quotes', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      blockService.getLastBlock.mockResolvedValue(mockBlock);
      strategyService.getStrategiesWithOwners.mockResolvedValue(mockStrategies);
      quoteService.allByAddress.mockResolvedValue({}); // No quotes available

      const result = await controller.getTokensPrices(ExchangeId.OGEthereum);

      expect(result).toEqual({});
    });

    it('should handle case-insensitive token address matching', async () => {
      const mixedCaseStrategies: StrategyWithOwner[] = [
        {
          strategyId: '1',
          owner: '0xOwner1',
          token0Address: '0xTOKEN1ADDRESS', // uppercase
          token1Address: '0xToken2Address', // mixed case
          order0: 'encoded0',
          order1: 'encoded1',
          liquidity0: '10',
          lowestRate0: '0.000244140625',
          highestRate0: '0.000244140625',
          marginalRate0: '0.000244140625',
          liquidity1: '2000',
          lowestRate1: '4096',
          highestRate1: '4096',
          marginalRate1: '4096',
        },
      ];

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      blockService.getLastBlock.mockResolvedValue(mockBlock);
      strategyService.getStrategiesWithOwners.mockResolvedValue(mixedCaseStrategies);
      quoteService.allByAddress.mockResolvedValue(mockQuotes);

      const result = await controller.getTokensPrices(ExchangeId.OGEthereum);

      // Should match despite case differences
      expect(result).toHaveProperty('0xToken1Address');
      expect(result).toHaveProperty('0xToken2Address');
      expect(result['0xToken1Address']).toBe(1.5);
      expect(result['0xToken2Address']).toBe(2.75);
    });

    it('should handle duplicate tokens across multiple strategies', async () => {
      const strategiesWithDuplicates: StrategyWithOwner[] = [
        {
          strategyId: '1',
          owner: '0xOwner1',
          token0Address: '0xToken1Address',
          token1Address: '0xToken2Address',
          order0: 'encoded0',
          order1: 'encoded1',
          liquidity0: '10',
          lowestRate0: '0.000244140625',
          highestRate0: '0.000244140625',
          marginalRate0: '0.000244140625',
          liquidity1: '2000',
          lowestRate1: '4096',
          highestRate1: '4096',
          marginalRate1: '4096',
        },
        {
          strategyId: '2',
          owner: '0xOwner2',
          token0Address: '0xToken1Address', // duplicate
          token1Address: '0xToken2Address', // duplicate
          order0: 'encoded0',
          order1: 'encoded1',
          liquidity0: '10',
          lowestRate0: '0.000244140625',
          highestRate0: '0.000244140625',
          marginalRate0: '0.000244140625',
          liquidity1: '2000',
          lowestRate1: '4096',
          highestRate1: '4096',
          marginalRate1: '4096',
        },
      ];

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      blockService.getLastBlock.mockResolvedValue(mockBlock);
      strategyService.getStrategiesWithOwners.mockResolvedValue(strategiesWithDuplicates);
      quoteService.allByAddress.mockResolvedValue(mockQuotes);

      const result = await controller.getTokensPrices(ExchangeId.OGEthereum);

      // Should include each token only once
      expect(result).toEqual({
        '0xToken1Address': 1.5,
        '0xToken2Address': 2.75,
      });
    });

    it('should work with different exchange IDs', async () => {
      const seiDeployment: Deployment = {
        ...mockDeployment,
        blockchainType: BlockchainType.Sei,
        exchangeId: ExchangeId.OGSei,
      };

      deploymentService.getDeploymentByExchangeId.mockReturnValue(seiDeployment);
      blockService.getLastBlock.mockResolvedValue(mockBlock);
      strategyService.getStrategiesWithOwners.mockResolvedValue(mockStrategies);
      quoteService.allByAddress.mockResolvedValue(mockQuotes);

      const result = await controller.getTokensPrices(ExchangeId.OGSei);

      expect(result).toEqual({
        '0xToken1Address': 1.5,
        '0xToken2Address': 2.75,
        '0xToken3Address': 100.5,
      });
      expect(deploymentService.getDeploymentByExchangeId).toHaveBeenCalledWith(ExchangeId.OGSei);
    });
  });
});
