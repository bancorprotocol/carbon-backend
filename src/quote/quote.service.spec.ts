import { Test, TestingModule } from '@nestjs/testing';
import { QuoteService } from './quote.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Quote } from './quote.entity';
import { TokenService } from '../token/token.service';
import { CoinGeckoService } from './coingecko.service';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { DeploymentService, BlockchainType } from '../deployment/deployment.service';
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
  };

  const mockCodexService = {
    getLatestPrices: jest.fn(),
  };

  const mockRedis = {
    set: jest.fn(),
    get: jest.fn(),
  };

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
});
