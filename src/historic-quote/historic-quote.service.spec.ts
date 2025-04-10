import { Test, TestingModule } from '@nestjs/testing';
import { HistoricQuoteService } from './historic-quote.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HistoricQuote } from './historic-quote.entity';
import { CoinMarketCapService } from '../coinmarketcap/coinmarketcap.service';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CodexService } from '../codex/codex.service';
import { BlockchainType, DeploymentService } from '../deployment/deployment.service';
import { Repository } from 'typeorm';
import moment from 'moment';
import Decimal from 'decimal.js';

describe('HistoricQuoteService', () => {
  let service: HistoricQuoteService;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let repository: Repository<HistoricQuote>;

  const mockRepository = {
    query: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockCoinMarketCapService = {
    getLatestQuotes: jest.fn(),
    getAllTokens: jest.fn(),
    getHistoricalQuotes: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockSchedulerRegistry = {
    addInterval: jest.fn(),
  };

  const mockCodexService = {
    getAllTokenAddresses: jest.fn(),
    getLatestPrices: jest.fn(),
    getHistoricalQuotes: jest.fn(),
  };

  const mockDeploymentService = {
    getDeploymentByBlockchainType: jest.fn(),
    getDeploymentByExchangeId: jest.fn(),
    getDeployments: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HistoricQuoteService,
        {
          provide: getRepositoryToken(HistoricQuote),
          useValue: mockRepository,
        },
        {
          provide: CoinMarketCapService,
          useValue: mockCoinMarketCapService,
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
          provide: CodexService,
          useValue: mockCodexService,
        },
        {
          provide: DeploymentService,
          useValue: mockDeploymentService,
        },
      ],
    }).compile();

    service = module.get<HistoricQuoteService>(HistoricQuoteService);
    repository = module.get<Repository<HistoricQuote>>(getRepositoryToken(HistoricQuote));
  });

  describe('createDailyCandlestick', () => {
    it('should ensure continuity between days by using previous day close as next day open', () => {
      const prices = [
        {
          timestamp: moment().startOf('day').unix(),
          usd: new Decimal('100'),
          provider: 'test',
        },
        {
          timestamp: moment().startOf('day').add(1, 'day').unix(),
          usd: new Decimal('110'),
          provider: 'test',
        },
        {
          timestamp: moment().startOf('day').add(2, 'day').unix(),
          usd: new Decimal('120'),
          provider: 'test',
        },
      ];

      const candlesticks = service.createDailyCandlestick(prices);

      expect(candlesticks).toHaveLength(3);
      expect(candlesticks[0].close.toString()).toBe('100');
      expect(candlesticks[1].open.toString()).toBe('100'); // Should use previous day's close
      expect(candlesticks[1].close.toString()).toBe('110');
      expect(candlesticks[2].open.toString()).toBe('110'); // Should use previous day's close
      expect(candlesticks[2].close.toString()).toBe('120');
    });

    it('should handle gaps in data by maintaining continuity', () => {
      const prices = [
        {
          timestamp: moment().startOf('day').unix(),
          usd: new Decimal('100'),
          provider: 'test',
        },
        {
          timestamp: moment().startOf('day').add(2, 'day').unix(), // Skip one day
          usd: new Decimal('120'),
          provider: 'test',
        },
      ];

      const candlesticks = service.createDailyCandlestick(prices);

      expect(candlesticks).toHaveLength(2);
      expect(candlesticks[0].close.toString()).toBe('100');
      expect(candlesticks[1].open.toString()).toBe('100'); // Should use previous day's close even with gap
      expect(candlesticks[1].close.toString()).toBe('120');
    });

    it('should handle null values appropriately by carrying forward last valid price', () => {
      const prices = [
        {
          timestamp: moment().startOf('day').unix(),
          usd: new Decimal('100'),
          provider: 'test',
        },
        {
          timestamp: moment().startOf('day').add(1, 'day').unix(),
          usd: null,
          provider: 'test',
        },
        {
          timestamp: moment().startOf('day').add(2, 'day').unix(),
          usd: new Decimal('120'),
          provider: 'test',
        },
      ];

      const candlesticks = service.createDailyCandlestick(prices);

      expect(candlesticks).toHaveLength(3);
      expect(candlesticks[0].close.toString()).toBe('100');
      expect(candlesticks[1].open.toString()).toBe('100'); // Should use previous day's close
      expect(candlesticks[1].close).toBeNull();
      expect(candlesticks[2].open.toString()).toBe('100'); // Should carry forward the last valid close price
      expect(candlesticks[2].close.toString()).toBe('120');
    });

    it('should return empty array for empty prices input', () => {
      const prices = [];
      const candlesticks = service.createDailyCandlestick(prices);
      expect(candlesticks).toHaveLength(0);
    });

    it('should handle single price point correctly', () => {
      const prices = [
        {
          timestamp: moment().startOf('day').unix(),
          usd: new Decimal('100'),
          provider: 'test',
        },
      ];

      const candlesticks = service.createDailyCandlestick(prices);
      expect(candlesticks).toHaveLength(1);
      expect(candlesticks[0].open.toString()).toBe('100');
      expect(candlesticks[0].high.toString()).toBe('100');
      expect(candlesticks[0].low.toString()).toBe('100');
      expect(candlesticks[0].close.toString()).toBe('100');
    });

    it('should handle consecutive null values correctly', () => {
      const prices = [
        {
          timestamp: moment().startOf('day').unix(),
          usd: new Decimal('100'),
          provider: 'test',
        },
        {
          timestamp: moment().startOf('day').add(1, 'day').unix(),
          usd: null,
          provider: 'test',
        },
        {
          timestamp: moment().startOf('day').add(2, 'day').unix(),
          usd: null,
          provider: 'test',
        },
        {
          timestamp: moment().startOf('day').add(3, 'day').unix(),
          usd: new Decimal('120'),
          provider: 'test',
        },
      ];

      const candlesticks = service.createDailyCandlestick(prices);
      expect(candlesticks).toHaveLength(4);
      expect(candlesticks[0].close.toString()).toBe('100');
      expect(candlesticks[1].open.toString()).toBe('100');
      expect(candlesticks[1].close).toBeNull();
      expect(candlesticks[2].open.toString()).toBe('100'); // Should still carry last valid price
      expect(candlesticks[2].close).toBeNull();
      expect(candlesticks[3].open.toString()).toBe('100'); // Should still carry last valid price
      expect(candlesticks[3].close.toString()).toBe('120');
    });

    it('should handle all null values correctly', () => {
      const prices = [
        {
          timestamp: moment().startOf('day').unix(),
          usd: null,
          provider: 'test',
        },
        {
          timestamp: moment().startOf('day').add(1, 'day').unix(),
          usd: null,
          provider: 'test',
        },
      ];

      const candlesticks = service.createDailyCandlestick(prices);
      expect(candlesticks).toHaveLength(2);
      expect(candlesticks[0].open).toBeNull();
      expect(candlesticks[0].close).toBeNull();
      expect(candlesticks[1].open).toBeNull(); // No valid price to carry forward
      expect(candlesticks[1].close).toBeNull();
    });

    it('should handle first value null correctly', () => {
      const prices = [
        {
          timestamp: moment().startOf('day').unix(),
          usd: null,
          provider: 'test',
        },
        {
          timestamp: moment().startOf('day').add(1, 'day').unix(),
          usd: new Decimal('100'),
          provider: 'test',
        },
      ];

      const candlesticks = service.createDailyCandlestick(prices);
      expect(candlesticks).toHaveLength(2);
      expect(candlesticks[0].open).toBeNull();
      expect(candlesticks[0].close).toBeNull();
      expect(candlesticks[1].open.toString()).toBe('100');
      expect(candlesticks[1].close.toString()).toBe('100');
    });

    it('should handle multiple prices in the same day correctly', () => {
      const dayStart = moment().startOf('day').unix();
      const prices = [
        {
          timestamp: dayStart,
          usd: new Decimal('100'),
          provider: 'test',
        },
        {
          timestamp: dayStart + 3600, // 1 hour later
          usd: new Decimal('105'),
          provider: 'test',
        },
        {
          timestamp: dayStart + 7200, // 2 hours later
          usd: new Decimal('95'),
          provider: 'test',
        },
      ];

      const candlesticks = service.createDailyCandlestick(prices);
      expect(candlesticks).toHaveLength(1);
      expect(candlesticks[0].open.toString()).toBe('100'); // First price of the day
      expect(candlesticks[0].high.toString()).toBe('105'); // Highest price
      expect(candlesticks[0].low.toString()).toBe('95'); // Lowest price
      expect(candlesticks[0].close.toString()).toBe('95'); // Last price of the day
    });
  });

  // Add new test suite for the Ethereum token mapping functionality
  describe('updateMappedEthereumTokens', () => {
    beforeEach(() => {
      // Reset mocks
      jest.clearAllMocks();

      // Setup mock implementation for getDeployments
      mockDeploymentService.getDeployments.mockReturnValue([
        {
          exchangeId: 'ethereum',
          blockchainType: 'ethereum',
          mapEthereumTokens: null, // No mappings on Ethereum deployment
        },
        {
          exchangeId: 'sei',
          blockchainType: 'sei-network',
          mapEthereumTokens: {
            '0xtoken1OnSei': '0xethtoken1', // lowercase 't'
            '0xtoken2OnSei': '0xethtoken2', // lowercase 't'
          },
        },
        {
          exchangeId: 'base-graphene',
          blockchainType: 'base',
          mapEthereumTokens: {
            '0xtoken1OnBase': '0xethtoken1', // lowercase 't'
            '0xtoken3OnBase': '0xethtoken3', // lowercase 't'
          },
        },
      ]);

      // Setup mock for getDeploymentByBlockchainType
      mockDeploymentService.getDeploymentByBlockchainType.mockReturnValue({
        exchangeId: 'ethereum',
        blockchainType: 'ethereum',
      });

      // Setup mock for repository.query used by getLatest
      mockRepository.query.mockResolvedValue([
        {
          tokenAddress: '0xethtoken1',
          blockchainType: 'ethereum',
          usd: '100.5',
          timestamp: '2023-01-01T00:00:00.000Z',
        },
        {
          tokenAddress: '0xethtoken2',
          blockchainType: 'ethereum',
          usd: '200.75',
          timestamp: '2023-01-01T00:00:00.000Z',
        },
      ]);

      // Setup mock for codexService.getLatestPrices
      mockCodexService.getLatestPrices.mockImplementation((deployment, addresses) => {
        const result = {};
        addresses.forEach((address) => {
          if (address === '0xethtoken1') {
            result[address] = {
              usd: '101.5',
              last_updated_at: Math.floor(new Date('2023-01-02T00:00:00.000Z').getTime() / 1000),
            };
          } else if (address === '0xethtoken2') {
            result[address] = {
              usd: '200.75',
              last_updated_at: Math.floor(new Date('2023-01-01T00:00:00.000Z').getTime() / 1000),
            };
          } else if (address === '0xethtoken3') {
            result[address] = {
              usd: '300.25',
              last_updated_at: Math.floor(new Date('2023-01-02T00:00:00.000Z').getTime() / 1000),
            };
          }
        });
        return Promise.resolve(result);
      });

      // Setup mock for repository.create
      mockRepository.create.mockImplementation((data) => data);

      // Setup mock for repository.save
      mockRepository.save.mockResolvedValue([]);
    });

    it('should collect unique Ethereum token addresses from all deployments', async () => {
      // Call the private method using any
      await (service as any).updateMappedEthereumTokens();

      // Verify getDeployments was called
      expect(mockDeploymentService.getDeployments).toHaveBeenCalled();

      // Verify getLatest was called (implicitly via repository.query)
      expect(mockRepository.query).toHaveBeenCalled();

      // Verify getLatestPrices was called with the correct Ethereum tokens (unique set)
      // We expect 3 unique Ethereum tokens from the mappings
      expect(mockCodexService.getLatestPrices).toHaveBeenCalledTimes(3);
      expect(mockCodexService.getLatestPrices).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining(['0xethtoken1']),
      );
      expect(mockCodexService.getLatestPrices).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining(['0xethtoken2']),
      );
      expect(mockCodexService.getLatestPrices).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining(['0xethtoken3']),
      );
    });

    it('should update quotes only when USD value differs and timestamp is newer', async () => {
      // Call the private method using any
      await (service as any).updateMappedEthereumTokens();

      // Verify repository.create was called for the tokens that should be updated
      // We expect 2 tokens to be updated:
      // - ethtoken1 (different value and newer timestamp)
      // - ethtoken3 (new token, no existing data)
      expect(mockRepository.create).toHaveBeenCalledTimes(2);

      // Verify ethtoken1 update
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenAddress: '0xethtoken1',
          usd: '101.5',
          provider: 'codex',
          blockchainType: 'ethereum',
        }),
      );

      // Verify ethtoken3 update
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenAddress: '0xethtoken3',
          usd: '300.25',
          provider: 'codex',
          blockchainType: 'ethereum',
        }),
      );

      // Verify ethtoken2 was NOT updated (same value)
      const ethtoken2Update = mockRepository.create.mock.calls.find((call) => call[0].tokenAddress === '0xethtoken2');
      expect(ethtoken2Update).toBeUndefined();

      // Verify save was called with the created quotes
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should not update when there are no mapped Ethereum tokens', async () => {
      // Update mock to return deployments with no Ethereum token mappings
      mockDeploymentService.getDeployments.mockReturnValue([
        {
          exchangeId: 'ethereum',
          blockchainType: 'ethereum',
        },
        {
          exchangeId: 'sei',
          blockchainType: 'sei-network',
          // No mapEthereumTokens property
        },
      ]);

      // Call the private method using any
      await (service as any).updateMappedEthereumTokens();

      // Verify no codex data was fetched
      expect(mockCodexService.getLatestPrices).not.toHaveBeenCalled();

      // Verify no quotes were created or saved
      expect(mockRepository.create).not.toHaveBeenCalled();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should handle errors when fetching price data', async () => {
      // Make one of the codex calls throw an error
      mockCodexService.getLatestPrices.mockImplementation((deployment, addresses) => {
        if (addresses.includes('0xethtoken2')) {
          return Promise.reject(new Error('Failed to fetch price data'));
        }

        const result = {};
        addresses.forEach((address) => {
          if (address === '0xethtoken1') {
            result[address] = {
              usd: '101.5',
              last_updated_at: Math.floor(new Date('2023-01-02T00:00:00.000Z').getTime() / 1000),
            };
          } else if (address === '0xethtoken3') {
            result[address] = {
              usd: '300.25',
              last_updated_at: Math.floor(new Date('2023-01-02T00:00:00.000Z').getTime() / 1000),
            };
          }
        });
        return Promise.resolve(result);
      });

      // Call the private method using any
      await (service as any).updateMappedEthereumTokens();

      // Verify we still processed the other tokens
      expect(mockRepository.create).toHaveBeenCalledTimes(2);
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should handle token addresses with different cases (uppercase, lowercase, mixed case)', async () => {
      // Setup the mock for getLatest to return only one existing quote
      mockRepository.query.mockResolvedValue([
        {
          tokenAddress: '0xethtoken1',
          blockchainType: 'ethereum',
          usd: '100.5',
          timestamp: '2023-01-01T00:00:00.000Z',
        },
        // No record for ethtoken2 or ethtoken3, so they should both be created
      ]);

      // Update mock to include tokens with different cases
      mockDeploymentService.getDeployments.mockReturnValue([
        {
          exchangeId: 'ethereum',
          blockchainType: 'ethereum',
        },
        {
          exchangeId: 'sei',
          blockchainType: 'sei-network',
          mapEthereumTokens: {
            '0xTOKEN1ONSEI': '0xETHTOKEN1', // All uppercase
            '0xtoken2onsei': '0xethtoken2', // All lowercase
          },
        },
        {
          exchangeId: 'base-graphene',
          blockchainType: 'base',
          mapEthereumTokens: {
            '0xToKeN3oNbAsE': '0xEtHtOkEn3', // Mixed case
          },
        },
      ]);

      // Update mock for codexService.getLatestPrices to handle case-insensitive lookups
      mockCodexService.getLatestPrices.mockImplementation((deployment, addresses) => {
        const result = {};
        addresses.forEach((address) => {
          // Normalize address to lowercase for comparison
          const lowerAddress = address.toLowerCase();

          if (lowerAddress === '0xethtoken1') {
            result[address] = {
              usd: '101.5', // Different value than existing
              last_updated_at: Math.floor(new Date('2023-01-02T00:00:00.000Z').getTime() / 1000),
            };
          } else if (lowerAddress === '0xethtoken2') {
            result[address] = {
              usd: '200.75', // No existing record, so this should be created
              last_updated_at: Math.floor(new Date('2023-01-01T00:00:00.000Z').getTime() / 1000),
            };
          } else if (lowerAddress === '0xethtoken3') {
            result[address] = {
              usd: '300.25', // No existing record, so this should be created
              last_updated_at: Math.floor(new Date('2023-01-02T00:00:00.000Z').getTime() / 1000),
            };
          }
        });
        return Promise.resolve(result);
      });

      // Call the method
      await (service as any).updateMappedEthereumTokens();

      // Verify getDeployments was called
      expect(mockDeploymentService.getDeployments).toHaveBeenCalled();

      // Verify we collect all token addresses regardless of case
      // We should get 3 calls - one for each unique token address
      expect(mockCodexService.getLatestPrices).toHaveBeenCalledTimes(3);

      // Verify repository.create was called for all three tokens
      expect(mockRepository.create).toHaveBeenCalledTimes(3);

      // Check that addresses were normalized to lowercase when saved
      const createdAddresses = mockRepository.create.mock.calls.map((call) => call[0].tokenAddress.toLowerCase());
      expect(createdAddresses).toContain('0xethtoken1');
      expect(createdAddresses).toContain('0xethtoken2');
      expect(createdAddresses).toContain('0xethtoken3');

      // Verify save was called with the created quotes
      expect(mockRepository.save).toHaveBeenCalled();
    });
  });

  describe('getUsdBuckets', () => {
    it('should correctly align price data by timestamp and generate candlesticks', async () => {
      // Mock the getHistoryQuotesBuckets method
      const now = moment().unix();
      const tokenA = '0xTokenA';
      const tokenB = '0xTokenB';
      const blockchainType = BlockchainType.Ethereum;

      // Token A has more historical data than Token B
      const tokenACandles = [
        { timestamp: now - 7200, open: '10', close: '11', high: '12', low: '9', provider: 'test' },
        { timestamp: now - 3600, open: '11', close: '12', high: '13', low: '10', provider: 'test' },
        { timestamp: now, open: '12', close: '13', high: '14', low: '11', provider: 'test' },
      ];

      // Token B starts later
      const tokenBCandles = [
        { timestamp: now - 3600, open: '1', close: '1.1', high: '1.2', low: '0.9', provider: 'test' },
        { timestamp: now, open: '1.1', close: '1.2', high: '1.3', low: '1.0', provider: 'test' },
      ];

      const mockHistoryData = {
        [tokenA]: tokenACandles,
        [tokenB]: tokenBCandles,
      };

      jest.spyOn(service, 'getHistoryQuotesBuckets').mockResolvedValue(mockHistoryData);
      jest.spyOn(service, 'createDailyCandlestick').mockImplementation((prices) => prices);

      await service.getUsdBuckets(blockchainType, blockchainType, tokenA, tokenB, now - 7200, now);

      // Should have called getHistoryQuotesBuckets with right params
      expect(service.getHistoryQuotesBuckets).toHaveBeenCalledWith(
        blockchainType,
        [tokenA, tokenB],
        now - 7200,
        now,
        '1 hour',
      );

      // Should have called createDailyCandlestick
      expect(service.createDailyCandlestick).toHaveBeenCalled();

      // We expect only data points where both tokens have values
      // This should skip the earliest timestamp (now - 7200) since tokenB doesn't have data for it
      const pricesPassedToCreateDailyCandlestick = (service.createDailyCandlestick as jest.Mock).mock.calls[0][0];

      expect(pricesPassedToCreateDailyCandlestick).toHaveLength(2);
      expect(pricesPassedToCreateDailyCandlestick[0].timestamp).toBe(now - 3600);
      expect(pricesPassedToCreateDailyCandlestick[0].usd.toString()).toBe('10.909090909090909091');
      expect(pricesPassedToCreateDailyCandlestick[1].timestamp).toBe(now);
      expect(pricesPassedToCreateDailyCandlestick[1].usd.toString()).toBe('10.833333333333333333');
    });

    it('should handle different price providers correctly', async () => {
      const now = moment().unix();
      const tokenA = '0xTokenA';
      const tokenB = '0xTokenB';
      const blockchainType = BlockchainType.Ethereum;

      const mockHistoryData = {
        [tokenA]: [{ timestamp: now, open: '100', close: '110', high: '120', low: '90', provider: 'provider1' }],
        [tokenB]: [{ timestamp: now, open: '10', close: '11', high: '12', low: '9', provider: 'provider2' }],
      };

      jest.spyOn(service, 'getHistoryQuotesBuckets').mockResolvedValue(mockHistoryData);
      jest.spyOn(service, 'createDailyCandlestick').mockImplementation((prices) => prices);

      await service.getUsdBuckets(blockchainType, blockchainType, tokenA, tokenB, now - 3600, now);

      const pricesPassedToCreateDailyCandlestick = (service.createDailyCandlestick as jest.Mock).mock.calls[0][0];
      expect(pricesPassedToCreateDailyCandlestick).toHaveLength(1);
      expect(pricesPassedToCreateDailyCandlestick[0].provider).toBe('provider1/provider2');
    });

    it('should skip timestamps where either token has null close prices', async () => {
      const now = moment().unix();
      const tokenA = '0xTokenA';
      const tokenB = '0xTokenB';
      const blockchainType = BlockchainType.Ethereum;

      const mockHistoryData = {
        [tokenA]: [
          { timestamp: now - 3600, open: '10', close: null, high: '12', low: '9', provider: 'test' },
          { timestamp: now, open: '11', close: '12', high: '14', low: '10', provider: 'test' },
        ],
        [tokenB]: [
          { timestamp: now - 3600, open: '1', close: '1.1', high: '1.2', low: '0.9', provider: 'test' },
          { timestamp: now, open: '1.1', close: '1.2', high: '1.3', low: '1.0', provider: 'test' },
        ],
      };

      jest.spyOn(service, 'getHistoryQuotesBuckets').mockResolvedValue(mockHistoryData);
      jest.spyOn(service, 'createDailyCandlestick').mockImplementation((prices) => prices);

      await service.getUsdBuckets(blockchainType, blockchainType, tokenA, tokenB, now - 3600, now);

      const pricesPassedToCreateDailyCandlestick = (service.createDailyCandlestick as jest.Mock).mock.calls[0][0];
      expect(pricesPassedToCreateDailyCandlestick).toHaveLength(1); // Should skip the timestamp with null close
      expect(pricesPassedToCreateDailyCandlestick[0].timestamp).toBe(now);
    });

    it('should handle tokens from different blockchain types', async () => {
      const now = moment().unix();
      const tokenA = '0xTokenA';
      const tokenB = '0xTokenB';
      const baseBlockchainType = BlockchainType.Ethereum;
      const quoteBlockchainType = BlockchainType.Sei;

      const mockTokenAData = {
        [tokenA]: [{ timestamp: now, open: '100', close: '110', high: '120', low: '90', provider: 'provider1' }],
      };

      const mockTokenBData = {
        [tokenB]: [{ timestamp: now, open: '10', close: '11', high: '12', low: '9', provider: 'provider2' }],
      };

      // Mock implementation for getHistoryQuotesBuckets to return different data based on blockchain type
      jest.spyOn(service, 'getHistoryQuotesBuckets').mockImplementation((blockchain) => {
        if (blockchain === baseBlockchainType) {
          return Promise.resolve(mockTokenAData);
        } else if (blockchain === quoteBlockchainType) {
          return Promise.resolve(mockTokenBData);
        }
        return Promise.resolve({});
      });

      jest.spyOn(service, 'createDailyCandlestick').mockImplementation((prices) => prices);

      await service.getUsdBuckets(baseBlockchainType, quoteBlockchainType, tokenA, tokenB, now - 3600, now);

      // Verify getHistoryQuotesBuckets was called twice with different blockchain types
      expect(service.getHistoryQuotesBuckets).toHaveBeenCalledTimes(2);

      // First call should be for base token with Ethereum blockchain
      expect(service.getHistoryQuotesBuckets).toHaveBeenCalledWith(
        baseBlockchainType,
        [tokenA],
        now - 3600,
        now,
        '1 hour',
      );

      // Second call should be for quote token with Sei blockchain
      expect(service.getHistoryQuotesBuckets).toHaveBeenCalledWith(
        quoteBlockchainType,
        [tokenB],
        now - 3600,
        now,
        '1 hour',
      );

      // Verify the data passed to createDailyCandlestick
      const pricesPassedToCreateDailyCandlestick = (service.createDailyCandlestick as jest.Mock).mock.calls[0][0];
      expect(pricesPassedToCreateDailyCandlestick).toHaveLength(1);
      expect(pricesPassedToCreateDailyCandlestick[0].timestamp).toBe(now);
      expect(pricesPassedToCreateDailyCandlestick[0].provider).toBe('provider1/provider2');
      expect(pricesPassedToCreateDailyCandlestick[0].usd.toString()).toBe('10');
    });
  });

  describe('getHistoryQuotesBuckets', () => {
    it('should select provider with significantly more data over default provider order', async () => {
      const tokenA = '0xtokena'; // lowercase to match normalization in the method
      const tokenB = '0xtokenb'; // lowercase to match normalization in the method
      const blockchainType = BlockchainType.Ethereum;
      const start = moment().subtract(1, 'year').unix();
      const end = moment().unix();
      const startDay = moment.unix(start).utc().startOf('day');

      // Mock data to return for tokenA and tokenB
      const queryResult = [
        // TokenA with codex provider (selected due to having significantly more data)
        {
          tokenAddress: tokenA,
          bucket: startDay.toISOString(),
          open: '10',
          close: '11',
          high: '12',
          low: '9',
          selected_provider: 'codex',
        },
        {
          tokenAddress: tokenA,
          bucket: startDay.add(1, 'day').toISOString(),
          open: '11',
          close: '12',
          high: '13',
          low: '10',
          selected_provider: 'codex',
        },

        // TokenB with coinmarketcap provider (default provider order)
        {
          tokenAddress: tokenB,
          bucket: startDay.clone().subtract(1, 'day').toISOString(),
          open: '1',
          close: '1.1',
          high: '1.2',
          low: '0.9',
          selected_provider: 'coinmarketcap',
        },
        {
          tokenAddress: tokenB,
          bucket: startDay.clone().toISOString(),
          open: '1.1',
          close: '1.2',
          high: '1.3',
          low: '1',
          selected_provider: 'coinmarketcap',
        },
      ];

      // Reset the mock
      mockRepository.query.mockReset();

      // Add a specific implementation for this test
      mockRepository.query.mockImplementation((sql) => {
        // Only respond to the specific query that contains the provider selection logic
        if (sql.includes('TokenStats') && sql.includes('max_points > 5 * COALESCE')) {
          return Promise.resolve(queryResult);
        }

        // For any other query, just return an empty array
        return Promise.resolve([]);
      });

      const result = await service.getHistoryQuotesBuckets(blockchainType, [tokenA, tokenB], start, end, '1 day');

      // Check that repository.query was called
      expect(mockRepository.query).toHaveBeenCalled();

      // Verify that the results have the expected providers based on our mock
      expect(result[tokenA]).toBeDefined();
      expect(result[tokenB]).toBeDefined();

      // Provider selection should match what we mocked
      expect(result[tokenA][0].provider).toBe('codex');
      expect(result[tokenB][0].provider).toBe('coinmarketcap');
    });
  });
});
