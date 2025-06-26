import { Test, TestingModule } from '@nestjs/testing';
import { QuoteService } from './quote.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Quote } from './quote.entity';
import { TokenService } from '../token/token.service';
import { CoinGeckoService } from './coingecko.service';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { DeploymentService, BlockchainType, Deployment, ExchangeId } from '../deployment/deployment.service';
import { CodexService } from '../codex/codex.service';
import { Repository } from 'typeorm';
import { Token } from '../token/token.entity';

describe('QuoteService', () => {
  let service: QuoteService;
  let repository: Repository<Quote>;

  const mockQuoteRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockTokenService = {
    getTokensByBlockchainType: jest.fn(),
  };

  const mockCoinGeckoService = {
    getLatestPrices: jest.fn(),
    getLatestGasTokenPrice: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockSchedulerRegistry = {
    addInterval: jest.fn(),
  };

  const mockDeploymentService = {
    getDeployments: jest.fn(),
    getDeploymentByBlockchainType: jest.fn(),
    getLowercaseTokenMap: jest.fn().mockImplementation((deployment: Deployment) => {
      if (!deployment.mapEthereumTokens) {
        return {};
      }
      return Object.entries(deployment.mapEthereumTokens).reduce<Record<string, string>>((acc, [key, value]) => {
        acc[key.toLowerCase()] = value.toLowerCase();
        return acc;
      }, {});
    }),
  };

  const mockCodexService = {
    getLatestPrices: jest.fn(),
  };

  const mockRedis = {
    set: jest.fn(),
    get: jest.fn(),
  };

  const createMockDeployment = (
    blockchainType: BlockchainType,
    mapEthereumTokens?: Record<string, string>,
  ): Deployment => ({
    exchangeId: ExchangeId.OGSei,
    blockchainType,
    rpcEndpoint: 'http://mock-rpc',
    harvestEventsBatchSize: 1000,
    harvestConcurrency: 1,
    multicallAddress: '0x123',
    startBlock: 1,
    gasToken: {
      name: 'Mock Token',
      symbol: 'MOCK',
      address: '0x123',
    },
    contracts: {},
    mapEthereumTokens,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuoteService,
        {
          provide: getRepositoryToken(Quote),
          useValue: mockQuoteRepository,
        },
        {
          provide: TokenService,
          useValue: mockTokenService,
        },
        {
          provide: CoinGeckoService,
          useValue: mockCoinGeckoService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: SchedulerRegistry,
          useValue: mockSchedulerRegistry,
        },
        {
          provide: DeploymentService,
          useValue: mockDeploymentService,
        },
        {
          provide: CodexService,
          useValue: mockCodexService,
        },
        {
          provide: 'REDIS',
          useValue: mockRedis,
        },
      ],
    }).compile();

    service = module.get<QuoteService>(QuoteService);
    repository = module.get<Repository<Quote>>(getRepositoryToken(Quote));
  });

  describe('addOrUpdateQuote', () => {
    const mockToken = { id: 1, address: '0x123', name: 'Test Token', decimals: 18 } as Token;
    const mockQuote = {
      provider: 'test',
      token: mockToken,
      blockchainType: BlockchainType.Ethereum,
      timestamp: new Date(),
      usd: '100',
    };

    it('should create a new quote if one does not exist', async () => {
      // Setup mocks
      mockQuoteRepository.findOne.mockResolvedValue(null);
      mockQuoteRepository.create.mockImplementation((entity) => entity);
      mockQuoteRepository.save.mockImplementation((entity) => Promise.resolve(entity));

      // Call the method
      const result = await service.addOrUpdateQuote(mockQuote);

      // Verify
      expect(mockQuoteRepository.findOne).toHaveBeenCalledWith({
        where: {
          token: { id: mockToken.id },
          blockchainType: BlockchainType.Ethereum,
        },
        relations: ['token'],
      });
      expect(mockQuoteRepository.save).toHaveBeenCalled();
      expect(result.token).toEqual(mockToken);
      expect(result.usd).toEqual('100');
    });

    it('should update an existing quote if one exists', async () => {
      // Setup mocks
      const existingQuote = {
        id: 1,
        provider: 'old-provider',
        token: mockToken,
        blockchainType: BlockchainType.Ethereum,
        timestamp: new Date(Date.now() - 86400000), // yesterday
        usd: '90',
      };
      mockQuoteRepository.findOne.mockResolvedValue(existingQuote);
      mockQuoteRepository.save.mockImplementation((entity) => Promise.resolve(entity));

      // Call the method
      const result = await service.addOrUpdateQuote(mockQuote);

      // Verify
      expect(mockQuoteRepository.findOne).toHaveBeenCalledWith({
        where: {
          token: { id: mockToken.id },
          blockchainType: BlockchainType.Ethereum,
        },
        relations: ['token'],
      });
      expect(mockQuoteRepository.save).toHaveBeenCalled();
      expect(result.id).toEqual(1); // Should preserve the ID
      expect(result.provider).toEqual('test'); // Should update the provider
      expect(result.usd).toEqual('100'); // Should update the price
    });

    it('should throw an error if token is missing', async () => {
      const incompleteQuote = {
        provider: 'test',
        blockchainType: BlockchainType.Ethereum,
        timestamp: new Date(),
        usd: '100',
      };

      await expect(service.addOrUpdateQuote(incompleteQuote)).rejects.toThrow('Token and blockchainType are required');
    });

    it('should throw an error if blockchainType is missing', async () => {
      const incompleteQuote = {
        provider: 'test',
        token: mockToken,
        timestamp: new Date(),
        usd: '100',
      };

      await expect(service.addOrUpdateQuote(incompleteQuote)).rejects.toThrow('Token and blockchainType are required');
    });

    it('should use "manual" as default provider if not specified', async () => {
      // Setup mocks
      mockQuoteRepository.findOne.mockResolvedValue(null);
      mockQuoteRepository.create.mockImplementation((entity) => entity);
      mockQuoteRepository.save.mockImplementation((entity) => Promise.resolve(entity));

      const quoteWithoutProvider = {
        token: mockToken,
        blockchainType: BlockchainType.Ethereum,
        timestamp: new Date(),
        usd: '100',
      };

      // Call the method
      const result = await service.addOrUpdateQuote(quoteWithoutProvider);

      // Verify
      expect(result.provider).toEqual('manual');
    });

    it('should use current date as timestamp if not specified', async () => {
      // Setup mocks
      mockQuoteRepository.findOne.mockResolvedValue(null);
      mockQuoteRepository.create.mockImplementation((entity) => entity);
      mockQuoteRepository.save.mockImplementation((entity) => Promise.resolve(entity));

      const quoteWithoutTimestamp = {
        token: mockToken,
        blockchainType: BlockchainType.Ethereum,
        provider: 'test',
        usd: '100',
      };

      // Call the method
      const result = await service.addOrUpdateQuote(quoteWithoutTimestamp);

      // Verify
      expect(result.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('all', () => {
    it('should return all quotes when no deployments have Ethereum mappings', async () => {
      const mockQuotes = [
        { id: 1, token: { address: '0x123' }, blockchainType: BlockchainType.Ethereum },
        { id: 2, token: { address: '0x456' }, blockchainType: BlockchainType.Sei },
      ];

      mockDeploymentService.getDeployments.mockReturnValue([
        createMockDeployment(BlockchainType.Ethereum),
        createMockDeployment(BlockchainType.Sei),
      ]);
      mockQuoteRepository.find.mockResolvedValue(mockQuotes);

      const result = await service.all();
      expect(result).toEqual(mockQuotes);
    });

    it('should map quotes using Ethereum prices when mappings exist', async () => {
      const mockToken1 = { id: 1, address: '0xtoken1' };
      const mockToken2 = { id: 2, address: '0xtoken2' };
      const mockEthToken = { id: 3, address: '0xethtoken' };

      const mockQuotes = [
        {
          id: 1,
          token: mockToken1,
          blockchainType: BlockchainType.Sei,
          usd: '10',
          provider: 'codex',
          timestamp: new Date(),
        },
        {
          id: 2,
          token: mockToken2,
          blockchainType: BlockchainType.Sei,
          usd: '20',
          provider: 'codex',
          timestamp: new Date(),
        },
      ];

      const mockEthQuote = {
        id: 3,
        token: mockEthToken,
        blockchainType: BlockchainType.Ethereum,
        usd: '100',
        provider: 'coingecko',
        timestamp: new Date(),
      };

      mockDeploymentService.getDeployments.mockReturnValue([
        createMockDeployment(BlockchainType.Sei, {
          '0xtoken1': '0xethtoken',
        }),
      ]);

      mockQuoteRepository.find.mockResolvedValue(mockQuotes);
      mockQuoteRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockEthQuote]),
      });

      const result = await service.all();

      expect(result).toHaveLength(2);
      // Only usd and provider should be from Ethereum quote, rest from original
      expect(result[0]).toEqual({
        id: 1,
        token: mockToken1,
        blockchainType: BlockchainType.Sei,
        usd: '100',
        provider: 'coingecko',
        timestamp: mockQuotes[0].timestamp,
      });
      expect(result[1]).toEqual(mockQuotes[1]);
    });
  });

  describe('allByAddress', () => {
    it('should return quotes by address when no Ethereum mappings exist', async () => {
      const mockQuotes = [
        { token: { address: '0x123' }, blockchainType: BlockchainType.Sei },
        { token: { address: '0x456' }, blockchainType: BlockchainType.Sei },
      ];

      const deployment = createMockDeployment(BlockchainType.Sei);

      mockQuoteRepository.find.mockResolvedValue(mockQuotes);

      const result = await service.allByAddress(deployment);
      expect(result['0x123']).toEqual(mockQuotes[0]);
      expect(result['0x456']).toEqual(mockQuotes[1]);
    });

    it('should map quotes using Ethereum prices when mappings exist', async () => {
      const mockToken = { address: '0xtoken1' };
      const mockEthToken = { address: '0xethtoken' };

      const mockQuote = {
        token: mockToken,
        blockchainType: BlockchainType.Sei,
        usd: '10',
        provider: 'codex',
        timestamp: new Date(),
      };

      const mockEthQuote = {
        token: mockEthToken,
        blockchainType: BlockchainType.Ethereum,
        usd: '100',
        provider: 'coingecko',
        timestamp: new Date(),
      };

      const deployment = createMockDeployment(BlockchainType.Sei, {
        '0xtoken1': '0xethtoken',
      });

      // Mock TokenService to return the token
      mockTokenService.getTokensByBlockchainType.mockResolvedValue([
        { address: '0xtoken1', id: 1, name: 'Token 1', symbol: 'TKN1', decimals: 18 },
      ]);

      mockQuoteRepository.find.mockResolvedValue([mockQuote]);
      mockQuoteRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockEthQuote]),
      });

      const result = await service.allByAddress(deployment);

      // Only usd and provider should be from Ethereum quote, rest from original
      expect(result['0xtoken1']).toEqual({
        token: mockToken,
        blockchainType: BlockchainType.Sei,
        usd: '100',
        provider: 'coingecko',
        timestamp: mockQuote.timestamp,
      });
    });

    it('should return mapped Ethereum quotes even when no quotes exist for original blockchain', async () => {
      const mockEthToken = {
        address: '0xethtoken',
        id: 3,
        name: 'Ethereum Token',
        symbol: 'ETH',
        decimals: 18,
        blockchainType: BlockchainType.Ethereum,
      };

      // Create a full token object for the Sei blockchain
      const fullSeiToken = {
        id: 5,
        address: '0xtoken1',
        name: 'Sei Original Token',
        symbol: 'SEI',
        decimals: 8,
        blockchainType: BlockchainType.Sei,
        exchangeId: ExchangeId.OGSei,
      };

      const mockEthQuote = {
        token: mockEthToken,
        blockchainType: BlockchainType.Ethereum,
        usd: '100',
        provider: 'coingecko',
        timestamp: new Date(),
      };

      const deployment = createMockDeployment(BlockchainType.Sei, {
        '0xtoken1': '0xethtoken',
      });

      // Mock the TokenService to return the full token info
      mockTokenService.getTokensByBlockchainType.mockResolvedValue([fullSeiToken]);

      // No quotes exist for original blockchain
      mockQuoteRepository.find.mockResolvedValue([]);
      mockQuoteRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockEthQuote]),
      });

      const result = await service.allByAddress(deployment);

      // For new quotes, create with Ethereum price but full original token data
      expect(result['0xtoken1']).toEqual({
        usd: '100',
        provider: 'coingecko',
        token: fullSeiToken,
        blockchainType: BlockchainType.Sei,
        timestamp: mockEthQuote.timestamp,
      });
      expect(Object.keys(result).length).toBe(1);

      // Verify all token properties are present
      expect(result['0xtoken1'].token.id).toEqual(fullSeiToken.id);
      expect(result['0xtoken1'].token.name).toEqual(fullSeiToken.name);
      expect(result['0xtoken1'].token.symbol).toEqual(fullSeiToken.symbol);
      expect(result['0xtoken1'].token.decimals).toEqual(fullSeiToken.decimals);
      expect(result['0xtoken1'].token.blockchainType).toEqual(BlockchainType.Sei);
    });

    it('should handle case where Ethereum quote is not found for a mapped token', async () => {
      const mockToken = { address: '0xtoken1' };
      const mockQuote = {
        token: mockToken,
        blockchainType: BlockchainType.Sei,
        usd: '10',
        provider: 'codex',
      };

      const deployment = createMockDeployment(BlockchainType.Sei, {
        '0xtoken1': '0xethtoken', // Mapping exists but no Ethereum quote found
      });

      mockQuoteRepository.find.mockResolvedValue([mockQuote]);
      mockQuoteRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]), // No Ethereum quotes found
      });

      const result = await service.allByAddress(deployment);

      // Should fall back to original quote when Ethereum quote not found
      expect(result['0xtoken1']).toEqual(mockQuote);
      expect(Object.keys(result).length).toBe(1);
    });

    it('should handle case where mapEthereumTokens is empty object', async () => {
      const mockToken = { address: '0xtoken1' };
      const mockQuote = {
        token: mockToken,
        blockchainType: BlockchainType.Sei,
        usd: '10',
        provider: 'codex',
      };

      const deployment = createMockDeployment(BlockchainType.Sei, {}); // Empty mapping object

      mockQuoteRepository.find.mockResolvedValue([mockQuote]);
      // Should not make any Ethereum quote queries
      mockQuoteRepository.createQueryBuilder.mockImplementation(() => {
        throw new Error('Should not query Ethereum quotes when mappings is empty');
      });

      const result = await service.allByAddress(deployment);

      expect(result['0xtoken1']).toEqual(mockQuote);
      expect(Object.keys(result).length).toBe(1);
    });

    it('should handle case where multiple tokens map to same Ethereum token', async () => {
      const mockToken1 = { address: '0xtoken1' };
      const mockToken2 = { address: '0xtoken2' };
      const mockEthToken = { address: '0xethtoken' };

      const mockQuotes = [
        {
          token: mockToken1,
          blockchainType: BlockchainType.Sei,
          usd: '10',
          provider: 'codex',
          timestamp: new Date(),
        },
        {
          token: mockToken2,
          blockchainType: BlockchainType.Sei,
          usd: '20',
          provider: 'codex',
          timestamp: new Date(),
        },
      ];

      const mockEthQuote = {
        token: mockEthToken,
        blockchainType: BlockchainType.Ethereum,
        usd: '100',
        provider: 'coingecko',
        timestamp: new Date(),
      };

      const deployment = createMockDeployment(BlockchainType.Sei, {
        '0xtoken1': '0xethtoken',
        '0xtoken2': '0xethtoken', // Both tokens map to same Ethereum token
      });

      mockQuoteRepository.find.mockResolvedValue(mockQuotes);
      mockQuoteRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockEthQuote]),
      });

      const result = await service.allByAddress(deployment);

      // Both tokens should get the same Ethereum price but keep their original data
      expect(result['0xtoken1']).toEqual({
        token: mockToken1,
        blockchainType: BlockchainType.Sei,
        usd: '100',
        provider: 'coingecko',
        timestamp: mockQuotes[0].timestamp,
      });
      expect(result['0xtoken2']).toEqual({
        token: mockToken2,
        blockchainType: BlockchainType.Sei,
        usd: '100',
        provider: 'coingecko',
        timestamp: mockQuotes[1].timestamp,
      });
      expect(Object.keys(result).length).toBe(2);
    });

    it('should handle case-insensitive token addresses', async () => {
      const mockToken = { address: '0xToKeN1' }; // Mixed case
      const mockEthToken = { address: '0xEtHtOkEn' }; // Mixed case

      const mockQuote = {
        token: mockToken,
        blockchainType: BlockchainType.Sei,
        usd: '10',
        provider: 'codex',
      };

      const mockEthQuote = {
        token: mockEthToken,
        blockchainType: BlockchainType.Ethereum,
        usd: '100',
        provider: 'coingecko',
        timestamp: new Date(),
      };

      const deployment = createMockDeployment(BlockchainType.Sei, {
        '0xtoken1': '0xethtoken', // Lowercase in mapping
      });

      mockQuoteRepository.find.mockResolvedValue([mockQuote]);
      mockQuoteRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockEthQuote]),
      });

      const result = await service.allByAddress(deployment);

      // Should match despite case differences
      expect(result['0xToKeN1'.toLowerCase()]).toBeDefined();
      expect(result['0xtoken1']).toBeDefined();
      expect(Object.keys(result).length).toBe(1);
    });
  });

  describe('findQuotes', () => {
    it('should return quotes by address when no Ethereum mappings exist', async () => {
      const mockQuotes = [
        { token: { address: '0x123' }, blockchainType: BlockchainType.Sei },
        { token: { address: '0x456' }, blockchainType: BlockchainType.Sei },
      ];

      mockDeploymentService.getDeploymentByBlockchainType.mockReturnValue(createMockDeployment(BlockchainType.Sei));

      mockQuoteRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockQuotes),
      });

      const result = await service.findQuotes(BlockchainType.Sei, ['0x123', '0x456']);
      expect(result['0x123']).toEqual(mockQuotes[0]);
      expect(result['0x456']).toEqual(mockQuotes[1]);
    });

    it('should map quotes using Ethereum prices when mappings exist', async () => {
      const mockToken = { address: '0xtoken1' };
      const mockEthToken = { address: '0xethtoken' };

      const mockQuote = {
        token: mockToken,
        blockchainType: BlockchainType.Sei,
        usd: '10',
        provider: 'codex',
        timestamp: new Date(),
      };

      const mockEthQuote = {
        token: mockEthToken,
        blockchainType: BlockchainType.Ethereum,
        usd: '100',
        provider: 'coingecko',
        timestamp: new Date(),
      };

      mockDeploymentService.getDeploymentByBlockchainType.mockReturnValue(
        createMockDeployment(BlockchainType.Sei, {
          '0xtoken1': '0xethtoken',
        }),
      );

      const queryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn(),
      };

      // First call returns original quotes, second call returns Ethereum quotes
      queryBuilder.getMany.mockResolvedValueOnce([mockQuote]).mockResolvedValueOnce([mockEthQuote]);

      mockQuoteRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const result = await service.findQuotes(BlockchainType.Sei, ['0xtoken1']);

      // Only usd and provider should be from Ethereum quote, rest from original
      expect(result['0xtoken1']).toEqual({
        token: mockToken,
        blockchainType: BlockchainType.Sei,
        usd: '100',
        provider: 'coingecko',
        timestamp: mockQuote.timestamp,
      });
    });
  });

  describe('pollForLatest', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should handle no Ethereum token mappings', async () => {
      // Clear all mocks to ensure a clean state
      jest.clearAllMocks();

      // Create deployments with NO ethereum token mappings
      const ethereumDeployment = createMockDeployment(BlockchainType.Ethereum);
      const seiDeployment = createMockDeployment(BlockchainType.Sei);

      mockDeploymentService.getDeployments.mockReturnValue([ethereumDeployment, seiDeployment]);

      // Since we'll process each deployment
      mockTokenService.getTokensByBlockchainType
        .mockResolvedValueOnce([]) // For Ethereum
        .mockResolvedValueOnce([]); // For Sei

      // Mock other calls needed for the test
      mockCoinGeckoService.getLatestPrices.mockResolvedValue({});
      mockCoinGeckoService.getLatestGasTokenPrice.mockResolvedValue({});
      mockQuoteRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      });
      mockDeploymentService.getDeploymentByBlockchainType.mockReturnValue(ethereumDeployment);

      // Call the method
      await service.pollForLatest();

      // Should still process each deployment
      expect(mockTokenService.getTokensByBlockchainType).toHaveBeenCalledTimes(2);

      // Should call getLatestPrices with the right args for each deployment
      expect(mockCoinGeckoService.getLatestPrices).toHaveBeenCalledWith([], ethereumDeployment);
    });

    it('should fetch Ethereum prices first when mappings exist', async () => {
      const ethereumTokenAddress = '0xethtoken';
      mockDeploymentService.getDeployments.mockReturnValue([
        createMockDeployment(BlockchainType.Ethereum),
        createMockDeployment(BlockchainType.Sei, {
          '0xseitoken': ethereumTokenAddress,
        }),
      ]);

      mockDeploymentService.getDeploymentByBlockchainType.mockReturnValue(
        createMockDeployment(BlockchainType.Ethereum),
      );

      const mockEthTokens = [{ id: 1, address: ethereumTokenAddress }];
      mockTokenService.getTokensByBlockchainType.mockResolvedValue(mockEthTokens);

      const mockEthPrices = {
        [ethereumTokenAddress]: { usd: '100', provider: 'coingecko' },
      };
      mockCoinGeckoService.getLatestPrices.mockResolvedValue(mockEthPrices);
      mockCoinGeckoService.getLatestGasTokenPrice.mockResolvedValue({});

      // Mock the query builder for existing quotes
      mockQuoteRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]), // No existing quotes
      });

      await service.pollForLatest();

      // Should fetch Ethereum prices first
      expect(mockCoinGeckoService.getLatestPrices).toHaveBeenCalledWith(
        [ethereumTokenAddress.toLowerCase()],
        expect.objectContaining({ blockchainType: BlockchainType.Ethereum }),
      );

      // Should create a new quote since none exists
      expect(mockQuoteRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          token: mockEthTokens[0],
          usd: '100',
          provider: 'coingecko',
          blockchainType: BlockchainType.Ethereum,
        }),
      );
    });

    it('should handle errors gracefully', async () => {
      mockDeploymentService.getDeployments.mockRejectedValue(new Error('Test error'));

      await service.pollForLatest();

      expect(service['isPolling']).toBe(false);
    });
  });

  describe('updateQuotes', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockQuoteRepository.create.mockImplementation((entity) => entity);
      mockQuoteRepository.save.mockImplementation((entity) => Promise.resolve(entity));
    });

    it('should create quotes for tokens with direct price data', async () => {
      const tokens = [
        {
          id: 1,
          address: '0xtoken1',
          blockchainType: BlockchainType.Sei,
          exchangeId: ExchangeId.OGSei,
          symbol: 'TKN1',
          decimals: 18,
          name: 'Token 1',
        } as Token,
        {
          id: 2,
          address: '0xtoken2',
          blockchainType: BlockchainType.Sei,
          exchangeId: ExchangeId.OGSei,
          symbol: 'TKN2',
          decimals: 18,
          name: 'Token 2',
        } as Token,
      ];

      const newPrices = {
        '0xtoken1': { usd: '100', provider: 'codex' },
        '0xtoken2': { usd: '200', provider: 'codex' },
      };

      const deployment = createMockDeployment(BlockchainType.Sei);

      // Mock the query builder for existing quotes
      mockQuoteRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]), // No existing quotes
      });

      await service['updateQuotes'](tokens, newPrices, deployment);

      expect(mockQuoteRepository.create).toHaveBeenCalledTimes(2);
      expect(mockQuoteRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          token: tokens[0],
          usd: '100',
          provider: 'codex',
          blockchainType: BlockchainType.Sei,
        }),
      );
    });

    it('should update existing quotes instead of creating new ones', async () => {
      const tokens = [
        {
          id: 1,
          address: '0xtoken1',
          blockchainType: BlockchainType.Sei,
          exchangeId: ExchangeId.OGSei,
          symbol: 'TKN1',
          decimals: 18,
          name: 'Token 1',
        } as Token,
        {
          id: 2,
          address: '0xtoken2',
          blockchainType: BlockchainType.Sei,
          exchangeId: ExchangeId.OGSei,
          symbol: 'TKN2',
          decimals: 18,
          name: 'Token 2',
        } as Token,
      ];

      const existingQuotes = [
        {
          id: 1,
          token: tokens[0],
          usd: '90',
          provider: 'codex',
          blockchainType: BlockchainType.Sei,
          timestamp: new Date(Date.now() - 60000), // 1 minute ago
        },
        {
          id: 2,
          token: tokens[1],
          usd: '180',
          provider: 'codex',
          blockchainType: BlockchainType.Sei,
          timestamp: new Date(Date.now() - 60000), // 1 minute ago
        },
      ];

      const newPrices = {
        '0xtoken1': { usd: '100', provider: 'codex' },
        '0xtoken2': { usd: '200', provider: 'codex' },
      };

      const deployment = createMockDeployment(BlockchainType.Sei);

      // Mock the query builder to return existing quotes
      mockQuoteRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(existingQuotes),
      });

      await service['updateQuotes'](tokens, newPrices, deployment);

      // Should not create any new quotes
      expect(mockQuoteRepository.create).not.toHaveBeenCalled();

      // Should save the updated quotes
      expect(mockQuoteRepository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 1,
            token: tokens[0],
            usd: '100',
            provider: 'codex',
            blockchainType: BlockchainType.Sei,
          }),
          expect.objectContaining({
            id: 2,
            token: tokens[1],
            usd: '200',
            provider: 'codex',
            blockchainType: BlockchainType.Sei,
          }),
        ]),
      );
    });

    it('should handle mix of existing and new quotes', async () => {
      const tokens = [
        {
          id: 1,
          address: '0xtoken1',
          blockchainType: BlockchainType.Sei,
          exchangeId: ExchangeId.OGSei,
          symbol: 'TKN1',
          decimals: 18,
          name: 'Token 1',
        } as Token,
        {
          id: 2,
          address: '0xtoken2',
          blockchainType: BlockchainType.Sei,
          exchangeId: ExchangeId.OGSei,
          symbol: 'TKN2',
          decimals: 18,
          name: 'Token 2',
        } as Token,
      ];

      const existingQuotes = [
        {
          id: 1,
          token: tokens[0],
          usd: '90',
          provider: 'codex',
          blockchainType: BlockchainType.Sei,
          timestamp: new Date(Date.now() - 60000), // 1 minute ago
        },
      ];

      const newPrices = {
        '0xtoken1': { usd: '100', provider: 'codex' },
        '0xtoken2': { usd: '200', provider: 'codex' },
      };

      const deployment = createMockDeployment(BlockchainType.Sei);

      // Mock the query builder to return one existing quote
      mockQuoteRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(existingQuotes),
      });

      await service['updateQuotes'](tokens, newPrices, deployment);

      // Should create one new quote for token2
      expect(mockQuoteRepository.create).toHaveBeenCalledTimes(1);
      expect(mockQuoteRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          token: tokens[1],
          usd: '200',
          provider: 'codex',
          blockchainType: BlockchainType.Sei,
        }),
      );

      // Should save both the updated and new quote
      expect(mockQuoteRepository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 1,
            token: tokens[0],
            usd: '100',
            provider: 'codex',
            blockchainType: BlockchainType.Sei,
          }),
          expect.objectContaining({
            token: tokens[1],
            usd: '200',
            provider: 'codex',
            blockchainType: BlockchainType.Sei,
          }),
        ]),
      );
    });

    it('should use Ethereum quotes for mapped tokens when no direct price', async () => {
      const tokens = [
        {
          id: 1,
          address: '0xseitoken',
          blockchainType: BlockchainType.Sei,
          exchangeId: ExchangeId.OGSei,
          symbol: 'TKN1',
          decimals: 18,
          name: 'Token 1',
        } as Token,
      ];

      const newPrices = {}; // No direct prices

      const deployment = createMockDeployment(BlockchainType.Sei, {
        '0xseitoken': '0xethtoken',
      });

      const mockEthQuote = {
        token: { address: '0xethtoken' },
        usd: '100',
        provider: 'coingecko',
        blockchainType: BlockchainType.Ethereum,
      };

      mockQuoteRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockEthQuote]),
      });

      await service['updateQuotes'](tokens, newPrices, deployment);

      expect(mockQuoteRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          token: tokens[0],
          usd: '100',
          provider: 'coingecko',
          blockchainType: BlockchainType.Sei,
        }),
      );
    });

    it('should handle case where neither direct price nor Ethereum mapping exists', async () => {
      const tokens = [
        {
          id: 1,
          address: '0xtoken1',
          blockchainType: BlockchainType.Sei,
          exchangeId: ExchangeId.OGSei,
          symbol: 'TKN1',
          decimals: 18,
          name: 'Token 1',
        } as Token,
      ];

      const newPrices = {}; // No direct prices
      const deployment = createMockDeployment(BlockchainType.Sei, {}); // No mappings

      await service['updateQuotes'](tokens, newPrices, deployment);

      expect(mockQuoteRepository.create).not.toHaveBeenCalled();
      expect(mockQuoteRepository.save).not.toHaveBeenCalled();
    });

    it('should handle errors during quote creation', async () => {
      const tokens = [
        {
          id: 1,
          address: '0xtoken1',
          blockchainType: BlockchainType.Sei,
          exchangeId: ExchangeId.OGSei,
          symbol: 'TKN1',
          decimals: 18,
          name: 'Token 1',
        } as Token,
      ];
      const newPrices = { '0xtoken1': { usd: '100', provider: 'codex' } };
      const deployment = createMockDeployment(BlockchainType.Sei);

      mockQuoteRepository.save.mockRejectedValue(new Error('Test error'));

      await expect(service['updateQuotes'](tokens, newPrices, deployment)).rejects.toThrow('Test error');
    });
  });

  describe('prepareQuotesForQuery', () => {
    it('should return empty string when no quotes exist', async () => {
      mockQuoteRepository.find.mockResolvedValue([]);
      const deployment = createMockDeployment(BlockchainType.Sei);

      const result = await service.prepareQuotesForQuery(deployment);
      expect(result).toBe('');
    });

    it('should create correct CTE when quotes exist', async () => {
      const mockQuotes = {
        '0xtoken1': {
          token: { id: 1, address: '0xtoken1' },
          usd: '10.5',
          blockchainType: BlockchainType.Sei,
          provider: 'codex',
          timestamp: new Date(),
        },
        '0xtoken2': {
          token: { id: 2, address: '0xtoken2' },
          usd: '20.75',
          blockchainType: BlockchainType.Sei,
          provider: 'codex',
          timestamp: new Date(),
        },
      };

      mockQuoteRepository.find.mockResolvedValue([mockQuotes['0xtoken1'], mockQuotes['0xtoken2']]);
      const deployment = createMockDeployment(BlockchainType.Sei);

      const result = await service.prepareQuotesForQuery(deployment);

      expect(result).toContain('quotes as (');
      expect(result).toContain(
        'SELECT CAST("tokenId" AS integer) as "tokenId", CAST(usd AS double precision) as usd, "blockchainType"',
      );
      expect(result).toContain('FROM (VALUES');
      expect(result).toContain("('1', '10.5', 'sei-network')");
      expect(result).toContain("('2', '20.75', 'sei-network')");
      expect(result).toContain(') AS t("tokenId", usd, "blockchainType")');
    });

    it('should deduplicate quotes by token ID', async () => {
      const mockQuotes = [
        {
          token: { id: 1, address: '0xtoken1' },
          usd: '11.0',
          blockchainType: BlockchainType.Sei,
          provider: 'codex',
          timestamp: new Date(),
        },
        {
          token: { id: 2, address: '0xtoken2' },
          usd: '20.75',
          blockchainType: BlockchainType.Sei,
          provider: 'codex',
          timestamp: new Date(),
        },
      ];

      mockQuoteRepository.find.mockResolvedValue(mockQuotes);
      const deployment = createMockDeployment(BlockchainType.Sei);

      const result = await service.prepareQuotesForQuery(deployment);

      // Should only include one entry for token ID 1
      const valueMatches = result.match(/\('[\d]+', '[\d.]+', '[^']+'\)/g) || [];
      expect(valueMatches.length).toBe(2); // Only 2 unique token IDs
      expect(result).toContain("('1', '11.0', 'sei-network')"); // First occurrence should be kept
      expect(result).toContain("('2', '20.75', 'sei-network')");
    });

    it('should handle Ethereum token mappings correctly', async () => {
      const mockToken = { id: 1, address: '0xtoken1' };
      const mockEthToken = { id: 2, address: '0xethtoken' };

      const mockQuote = {
        token: mockToken,
        usd: '10.5',
        blockchainType: BlockchainType.Sei,
        provider: 'codex',
        timestamp: new Date(),
      };

      const mockEthQuote = {
        token: mockEthToken,
        usd: '100.0',
        blockchainType: BlockchainType.Ethereum,
        provider: 'coingecko',
        timestamp: new Date(),
      };

      const deployment = createMockDeployment(BlockchainType.Sei, {
        '0xtoken1': '0xethtoken',
      });

      mockQuoteRepository.find.mockResolvedValue([mockQuote]);
      mockQuoteRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockEthQuote]),
      });

      const result = await service.prepareQuotesForQuery(deployment);

      // Should use the Ethereum quote's price but original token's ID
      expect(result).toContain("('1', '100.0', 'sei-network')");
    });
  });
});
