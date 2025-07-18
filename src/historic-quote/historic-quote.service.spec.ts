import { Test, TestingModule } from '@nestjs/testing';
import { HistoricQuoteService } from './historic-quote.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HistoricQuote } from './historic-quote.entity';
import { CoinMarketCapService } from '../coinmarketcap/coinmarketcap.service';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CodexService } from '../codex/codex.service';
import { BlockchainType, DeploymentService, ExchangeId } from '../deployment/deployment.service';
import { Repository } from 'typeorm';
import moment from 'moment';
import Decimal from 'decimal.js';

// Define interface for testing that extends HistoricQuote to include mappedFrom
interface HistoricQuoteWithMapping extends HistoricQuote {
  mappedFrom?: string;
}

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
    getLowercaseTokenMap: jest.fn(),
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

    // Tests covering OHLC consistency issues
    it('should maintain OHLC consistency when previous day close is higher than current day first price', () => {
      const day1 = moment().startOf('day');
      const day2 = day1.clone().add(1, 'day');

      const prices = [
        {
          timestamp: day1.unix(),
          usd: new Decimal('100'), // Day 1 close will be 100
          provider: 'test',
        },
        {
          timestamp: day2.unix(),
          usd: new Decimal('90'), // Day 2 first price is lower than day 1 close
          provider: 'test',
        },
      ];

      const candlesticks = service.createDailyCandlestick(prices);
      expect(candlesticks).toHaveLength(2);

      // Day 1
      expect(candlesticks[0].open.toString()).toBe('100');
      expect(candlesticks[0].close.toString()).toBe('100');
      expect(candlesticks[0].high.toString()).toBe('100');
      expect(candlesticks[0].low.toString()).toBe('100');

      // Day 2: open should be day 1 close (100), but first price is 90
      // This tests the fix where high/low are adjusted to include the open price
      expect(candlesticks[1].open.toString()).toBe('100'); // Previous day's close
      expect(candlesticks[1].close.toString()).toBe('90'); // Current day's price
      expect(candlesticks[1].high.toString()).toBe('100'); // Should be max(open=100, close=90) = 100
      expect(candlesticks[1].low.toString()).toBe('90'); // Should be min(open=100, close=90) = 90

      // Verify OHLC consistency
      expect(parseFloat(candlesticks[1].low.toString())).toBeLessThanOrEqual(
        parseFloat(candlesticks[1].open.toString()),
      );
      expect(parseFloat(candlesticks[1].open.toString())).toBeLessThanOrEqual(
        parseFloat(candlesticks[1].high.toString()),
      );
      expect(parseFloat(candlesticks[1].low.toString())).toBeLessThanOrEqual(
        parseFloat(candlesticks[1].close.toString()),
      );
      expect(parseFloat(candlesticks[1].close.toString())).toBeLessThanOrEqual(
        parseFloat(candlesticks[1].high.toString()),
      );
    });

    it('should maintain OHLC consistency when previous day close is lower than current day first price', () => {
      const day1 = moment().startOf('day');
      const day2 = day1.clone().add(1, 'day');

      const prices = [
        {
          timestamp: day1.unix(),
          usd: new Decimal('80'), // Day 1 close will be 80
          provider: 'test',
        },
        {
          timestamp: day2.unix(),
          usd: new Decimal('100'), // Day 2 first price is higher than day 1 close
          provider: 'test',
        },
      ];

      const candlesticks = service.createDailyCandlestick(prices);
      expect(candlesticks).toHaveLength(2);

      // Day 1
      expect(candlesticks[0].open.toString()).toBe('80');
      expect(candlesticks[0].close.toString()).toBe('80');
      expect(candlesticks[0].high.toString()).toBe('80');
      expect(candlesticks[0].low.toString()).toBe('80');

      // Day 2: open should be day 1 close (80), but first price is 100
      expect(candlesticks[1].open.toString()).toBe('80'); // Previous day's close
      expect(candlesticks[1].close.toString()).toBe('100'); // Current day's price
      expect(candlesticks[1].high.toString()).toBe('100'); // Should be max(open=80, close=100) = 100
      expect(candlesticks[1].low.toString()).toBe('80'); // Should be min(open=80, close=100) = 80

      // Verify OHLC consistency
      expect(parseFloat(candlesticks[1].low.toString())).toBeLessThanOrEqual(
        parseFloat(candlesticks[1].open.toString()),
      );
      expect(parseFloat(candlesticks[1].open.toString())).toBeLessThanOrEqual(
        parseFloat(candlesticks[1].high.toString()),
      );
      expect(parseFloat(candlesticks[1].low.toString())).toBeLessThanOrEqual(
        parseFloat(candlesticks[1].close.toString()),
      );
      expect(parseFloat(candlesticks[1].close.toString())).toBeLessThanOrEqual(
        parseFloat(candlesticks[1].high.toString()),
      );
    });

    it('should handle complex OHLC scenario with multiple prices in a day after gap', () => {
      const day1 = moment().startOf('day');
      const day2 = day1.clone().add(1, 'day');

      const prices = [
        {
          timestamp: day1.unix(),
          usd: new Decimal('95'), // Day 1 close will be 95
          provider: 'test',
        },
        // Day 2 has multiple prices
        {
          timestamp: day2.unix(),
          usd: new Decimal('100'), // First price of day 2
          provider: 'test',
        },
        {
          timestamp: day2.unix() + 3600,
          usd: new Decimal('105'), // Higher price later in day
          provider: 'test',
        },
        {
          timestamp: day2.unix() + 7200,
          usd: new Decimal('90'), // Lower price, ends up as close
          provider: 'test',
        },
      ];

      const candlesticks = service.createDailyCandlestick(prices);
      expect(candlesticks).toHaveLength(2);

      // Day 1
      expect(candlesticks[0].close.toString()).toBe('95');

      // Day 2: open should be day 1 close (95), multiple prices throughout day
      expect(candlesticks[1].open.toString()).toBe('95'); // Previous day's close
      expect(candlesticks[1].close.toString()).toBe('90'); // Last price of the day
      expect(candlesticks[1].high.toString()).toBe('105'); // Should include highest price of the day
      expect(candlesticks[1].low.toString()).toBe('90'); // Should include lowest price of the day

      // Verify OHLC consistency
      expect(parseFloat(candlesticks[1].low.toString())).toBeLessThanOrEqual(
        parseFloat(candlesticks[1].open.toString()),
      );
      expect(parseFloat(candlesticks[1].open.toString())).toBeLessThanOrEqual(
        parseFloat(candlesticks[1].high.toString()),
      );
      expect(parseFloat(candlesticks[1].low.toString())).toBeLessThanOrEqual(
        parseFloat(candlesticks[1].close.toString()),
      );
      expect(parseFloat(candlesticks[1].close.toString())).toBeLessThanOrEqual(
        parseFloat(candlesticks[1].high.toString()),
      );
    });

    it('should handle OHLC consistency when lastValidClose is used with null current price', () => {
      const day1 = moment().startOf('day');
      const day2 = day1.clone().add(1, 'day');

      const prices = [
        {
          timestamp: day1.unix(),
          usd: new Decimal('120'), // Day 1 close will be 120
          provider: 'test',
        },
        {
          timestamp: day2.unix(),
          usd: null, // Day 2 has null price
          provider: 'test',
        },
      ];

      const candlesticks = service.createDailyCandlestick(prices);
      expect(candlesticks).toHaveLength(2);

      // Day 1
      expect(candlesticks[0].close.toString()).toBe('120');

      // Day 2: should use lastValidClose for open but have null close
      expect(candlesticks[1].open.toString()).toBe('120'); // Previous day's close
      expect(candlesticks[1].close).toBeNull();
      expect(candlesticks[1].high.toString()).toBe('120'); // Should fallback to lastValidClose
      expect(candlesticks[1].low.toString()).toBe('120'); // Should fallback to lastValidClose
    });

    it('should prevent open being outside high-low range edge cases', () => {
      // This test specifically targets the bug we fixed where open could be < low or > high
      const day1 = moment().startOf('day');
      const day2 = day1.clone().add(1, 'day');
      const day3 = day2.clone().add(1, 'day');

      const prices = [
        {
          timestamp: day1.unix(),
          usd: new Decimal('2339.94'), // Similar to the real example from the bug report
          provider: 'coinmarketcap',
        },
        {
          timestamp: day2.unix(),
          usd: new Decimal('2360.44'), // Current day's only price
          provider: 'coinmarketcap',
        },
        {
          timestamp: day3.unix(),
          usd: new Decimal('2350.00'), // Another day
          provider: 'coinmarketcap',
        },
      ];

      const candlesticks = service.createDailyCandlestick(prices);
      expect(candlesticks).toHaveLength(3);

      // Check each candlestick for OHLC consistency
      candlesticks.forEach((candle, index) => {
        if (candle.open !== null && candle.high !== null && candle.low !== null && candle.close !== null) {
          const open = parseFloat(candle.open.toString());
          const high = parseFloat(candle.high.toString());
          const low = parseFloat(candle.low.toString());
          const close = parseFloat(candle.close.toString());

          // These are the core OHLC consistency rules that were violated before our fix
          expect(low).toBeLessThanOrEqual(open); // open should not be < low
          expect(open).toBeLessThanOrEqual(high); // open should not be > high
          expect(low).toBeLessThanOrEqual(close); // close should not be < low
          expect(close).toBeLessThanOrEqual(high); // close should not be > high
          expect(low).toBeLessThanOrEqual(high); // low should not be > high
        }
      });

      // Specifically check day 2 which had the problematic pattern
      expect(candlesticks[1].open.toString()).toBe('2339.94'); // Previous day's close
      expect(candlesticks[1].close.toString()).toBe('2360.44'); // Current day's price
      expect(candlesticks[1].high.toString()).toBe('2360.44'); // Max of open and close
      expect(candlesticks[1].low.toString()).toBe('2339.94'); // Min of open and close
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

    it('should update quotes only when USD value differs', async () => {
      // Call the private method using any
      await (service as any).updateMappedEthereumTokens();

      // Verify repository.create was called for the tokens that should be updated
      // We expect 2 tokens to be updated:
      // - ethtoken1 (different value)
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

  describe('getUsdRates', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should fetch USD rates from original blockchain type when no mappings exist', async () => {
      const deployment = {
        exchangeId: ExchangeId.OGEthereum,
        blockchainType: BlockchainType.Ethereum,
        mapEthereumTokens: null, // No mappings
        // Add required fields for Deployment type
        rpcEndpoint: 'http://example.com',
        harvestEventsBatchSize: 100,
        harvestConcurrency: 1,
        multicallAddress: '0xmulticall',
        gasToken: { name: 'Ether', symbol: 'ETH', address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' },
        startBlock: 0,
        contracts: {},
      };

      const addresses = ['0xtoken1', '0xtoken2'];
      const start = '2023-01-01';
      const end = '2023-01-31';

      // Expected SQL result format
      const mockedRates = [
        {
          day: '2023-01-01T00:00:00.000Z',
          address: '0xtoken1',
          usd: '100.5',
          provider: 'codex',
        },
        {
          day: '2023-01-01T00:00:00.000Z',
          address: '0xtoken2',
          usd: '200.75',
          provider: 'coinmarketcap',
        },
      ];

      // Setup repository.query mock
      mockRepository.query.mockResolvedValue(mockedRates);

      const result = await service.getUsdRates(deployment, addresses, start, end);

      // Verify query was executed once
      expect(mockRepository.query).toHaveBeenCalledTimes(1);

      // Verify result is formatted correctly
      expect(result.length).toBe(2);
      expect(result[0]).toEqual(
        expect.objectContaining({
          address: '0xtoken1',
          usd: 100.5, // Parsed to float
          provider: 'codex',
        }),
      );
      expect(result[1]).toEqual(
        expect.objectContaining({
          address: '0xtoken2',
          usd: 200.75, // Parsed to float
          provider: 'coinmarketcap',
        }),
      );
    });

    it('should fetch USD rates from Ethereum when mappings exist', async () => {
      const originalToken = '0xoriginaltoken';
      const ethereumToken = '0xethereumtoken';

      const deployment = {
        exchangeId: ExchangeId.OGSei,
        blockchainType: BlockchainType.Sei,
        mapEthereumTokens: {
          [originalToken]: ethereumToken,
        },
        // Add required fields for Deployment type
        rpcEndpoint: 'http://example.com',
        harvestEventsBatchSize: 100,
        harvestConcurrency: 1,
        multicallAddress: '0xmulticall',
        gasToken: { name: 'Sei', symbol: 'SEI', address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' },
        startBlock: 0,
        contracts: {},
      };

      // Provide the getLowercaseTokenMap implementation
      mockDeploymentService.getLowercaseTokenMap = jest.fn().mockImplementation((dep) => {
        const result = {};
        if (dep.mapEthereumTokens) {
          Object.entries(dep.mapEthereumTokens).forEach(([key, value]) => {
            result[key.toLowerCase()] = String(value).toLowerCase();
          });
        }
        return result;
      });

      const start = '2023-01-01';
      const end = '2023-01-31';

      // Mock rates from Ethereum
      const mockedEthereumRates = [
        {
          day: '2023-01-01T00:00:00.000Z',
          address: ethereumToken.toLowerCase(),
          usd: '150.25',
          provider: 'codex',
        },
      ];

      // Setup repository.query mock
      mockRepository.query.mockImplementation((sql) => {
        if (sql.includes(`IN ('${ethereumToken.toLowerCase()}')`)) {
          return Promise.resolve(mockedEthereumRates);
        }
        return Promise.resolve([]);
      });

      const result = await service.getUsdRates(deployment, [originalToken], start, end);

      // Verify correct query was executed
      expect(mockRepository.query).toHaveBeenCalledTimes(1);
      expect(mockRepository.query).toHaveBeenCalledWith(
        expect.stringContaining(`AND "tokenAddress" IN ('${ethereumToken.toLowerCase()}')`),
      );

      // Verify result is formatted correctly with mapped token info
      expect(result.length).toBe(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          address: originalToken.toLowerCase(), // Original address, not Ethereum address
          usd: 150.25,
          provider: 'codex',
          mappedFrom: ethereumToken.toLowerCase(), // Should include source token
        }),
      );
    });

    it('should combine results from original blockchain and Ethereum when mixed addresses are provided', async () => {
      const unmappedToken = '0xunmappedtoken';
      const originalToken = '0xoriginaltoken';
      const ethereumToken = '0xethereumtoken';

      const deployment = {
        exchangeId: ExchangeId.OGSei,
        blockchainType: BlockchainType.Sei,
        mapEthereumTokens: {
          [originalToken]: ethereumToken,
        },
        // Add required fields for Deployment type
        rpcEndpoint: 'http://example.com',
        harvestEventsBatchSize: 100,
        harvestConcurrency: 1,
        multicallAddress: '0xmulticall',
        gasToken: { name: 'Sei', symbol: 'SEI', address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' },
        startBlock: 0,
        contracts: {},
      };

      // Provide the getLowercaseTokenMap implementation
      mockDeploymentService.getLowercaseTokenMap = jest.fn().mockImplementation((dep) => {
        const result = {};
        if (dep.mapEthereumTokens) {
          Object.entries(dep.mapEthereumTokens).forEach(([key, value]) => {
            result[key.toLowerCase()] = String(value).toLowerCase();
          });
        }
        return result;
      });

      const start = '2023-01-01';
      const end = '2023-01-31';

      // Mock rates from original blockchain
      const mockedOriginalRates = [
        {
          day: '2023-01-01T00:00:00.000Z',
          address: unmappedToken.toLowerCase(),
          usd: '75.50',
          provider: 'codex',
        },
      ];

      // Mock rates from Ethereum
      const mockedEthereumRates = [
        {
          day: '2023-01-01T00:00:00.000Z',
          address: ethereumToken.toLowerCase(),
          usd: '150.25',
          provider: 'coinmarketcap',
        },
      ];

      // Setup repository.query mock to return different results
      mockRepository.query.mockImplementation((sql) => {
        if (sql.includes(`IN ('${unmappedToken.toLowerCase()}')`)) {
          return Promise.resolve(mockedOriginalRates);
        } else if (sql.includes(`IN ('${ethereumToken.toLowerCase()}')`)) {
          return Promise.resolve(mockedEthereumRates);
        }
        return Promise.resolve([]);
      });

      const result = await service.getUsdRates(deployment, [unmappedToken, originalToken], start, end);

      // Verify both queries were executed
      expect(mockRepository.query).toHaveBeenCalledTimes(2);

      // Verify result combines both datasets
      expect(result.length).toBe(2);

      // Verify unmapped token data
      const unmappedResult = result.find((r) => r.address === unmappedToken.toLowerCase());
      expect(unmappedResult).toEqual(
        expect.objectContaining({
          address: unmappedToken.toLowerCase(),
          usd: 75.5,
          provider: 'codex',
        }),
      );

      // Verify mapped token data
      const mappedResult = result.find((r) => r.address === originalToken.toLowerCase());
      expect(mappedResult).toEqual(
        expect.objectContaining({
          address: originalToken.toLowerCase(),
          usd: 150.25,
          provider: 'coinmarketcap',
          mappedFrom: ethereumToken.toLowerCase(), // Should include source token
        }),
      );
    });

    it('should not query when addresses array is empty', async () => {
      const deployment = {
        exchangeId: ExchangeId.OGEthereum,
        blockchainType: BlockchainType.Ethereum,
        mapEthereumTokens: null,
        // Add required fields for Deployment type
        rpcEndpoint: 'http://example.com',
        harvestEventsBatchSize: 100,
        harvestConcurrency: 1,
        multicallAddress: '0xmulticall',
        gasToken: { name: 'Ether', symbol: 'ETH', address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' },
        startBlock: 0,
        contracts: {},
      };

      const result = await service.getUsdRates(deployment, [], '2023-01-01', '2023-01-31');

      // Verify query was not executed
      expect(mockRepository.query).not.toHaveBeenCalled();

      // Verify result is empty array
      expect(result).toEqual([]);
    });

    it('should create separate entries for multiple mapped addresses pointing to same Ethereum token', async () => {
      const originalToken1 = '0xoriginaltoken1';
      const originalToken2 = '0xoriginaltoken2';
      const sharedEthereumToken = '0xsharedethereumtoken';

      const deployment = {
        exchangeId: ExchangeId.OGSei,
        blockchainType: BlockchainType.Sei,
        mapEthereumTokens: {
          [originalToken1]: sharedEthereumToken,
          [originalToken2]: sharedEthereumToken, // Both map to same Ethereum token
        },
        // Add required fields for Deployment type
        rpcEndpoint: 'http://example.com',
        harvestEventsBatchSize: 100,
        harvestConcurrency: 1,
        multicallAddress: '0xmulticall',
        gasToken: { name: 'Sei', symbol: 'SEI', address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' },
        startBlock: 0,
        contracts: {},
      };

      // Provide the getLowercaseTokenMap implementation
      mockDeploymentService.getLowercaseTokenMap = jest.fn().mockImplementation((dep) => {
        const result = {};
        if (dep.mapEthereumTokens) {
          Object.entries(dep.mapEthereumTokens).forEach(([key, value]) => {
            result[key.toLowerCase()] = String(value).toLowerCase();
          });
        }
        return result;
      });

      const start = '2023-01-01';
      const end = '2023-01-31';

      // Mock rates from Ethereum for the shared token
      const mockedEthereumRates = [
        {
          day: '2023-01-01T00:00:00.000Z',
          address: sharedEthereumToken.toLowerCase(),
          usd: '100.50',
          provider: 'codex',
        },
        {
          day: '2023-01-02T00:00:00.000Z',
          address: sharedEthereumToken.toLowerCase(),
          usd: '101.75',
          provider: 'codex',
        },
      ];

      // Setup repository.query mock to return Ethereum data
      mockRepository.query.mockImplementation((sql) => {
        if (sql.includes(`IN ('${sharedEthereumToken.toLowerCase()}')`)) {
          return Promise.resolve(mockedEthereumRates);
        }
        return Promise.resolve([]);
      });

      const result = await service.getUsdRates(deployment, [originalToken1, originalToken2], start, end);

      // Verify query was executed once for Ethereum
      expect(mockRepository.query).toHaveBeenCalledTimes(1);
      expect(mockRepository.query).toHaveBeenCalledWith(
        expect.stringContaining(`AND "tokenAddress" IN ('${sharedEthereumToken.toLowerCase()}')`),
      );

      // Verify result has entries for both original tokens
      expect(result.length).toBe(4); // 2 dates × 2 tokens = 4 entries

      // Group results by address for easier verification
      const resultsByAddress = result.reduce((acc, item) => {
        if (!acc[item.address]) acc[item.address] = [];
        acc[item.address].push(item);
        return acc;
      }, {});

      // Verify both original tokens have their own entries
      expect(resultsByAddress[originalToken1.toLowerCase()]).toBeDefined();
      expect(resultsByAddress[originalToken2.toLowerCase()]).toBeDefined();
      expect(resultsByAddress[originalToken1.toLowerCase()].length).toBe(2);
      expect(resultsByAddress[originalToken2.toLowerCase()].length).toBe(2);

      // Verify first original token data
      expect(resultsByAddress[originalToken1.toLowerCase()][0]).toEqual(
        expect.objectContaining({
          address: originalToken1.toLowerCase(),
          usd: 100.5,
          provider: 'codex',
          mappedFrom: sharedEthereumToken.toLowerCase(),
        }),
      );

      // Verify second original token data
      expect(resultsByAddress[originalToken2.toLowerCase()][0]).toEqual(
        expect.objectContaining({
          address: originalToken2.toLowerCase(),
          usd: 100.5, // Same value as first token since they share the same Ethereum token
          provider: 'codex',
          mappedFrom: sharedEthereumToken.toLowerCase(),
        }),
      );

      // Verify both tokens have the same USD values and timestamps but different addresses
      expect(resultsByAddress[originalToken1.toLowerCase()][0].usd).toBe(
        resultsByAddress[originalToken2.toLowerCase()][0].usd,
      );
      expect(resultsByAddress[originalToken1.toLowerCase()][0].day).toBe(
        resultsByAddress[originalToken2.toLowerCase()][0].day,
      );
      expect(resultsByAddress[originalToken1.toLowerCase()][0].address).not.toBe(
        resultsByAddress[originalToken2.toLowerCase()][0].address,
      );
    });
  });

  describe('getHistoryQuotesBuckets', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should select provider with significantly more data over default provider order', async () => {
      const tokenA = '0xtokena'; // lowercase to match normalization in the method
      const tokenB = '0xtokenb'; // lowercase to match normalization in the method
      const blockchainType = BlockchainType.Ethereum;
      const start = moment().subtract(1, 'year').unix();
      const end = moment().unix();
      const startDay = moment.unix(start).utc().startOf('day');

      // Mock getDeployments to return a deployment with no mappings (to test unmapped addresses)
      mockDeploymentService.getDeployments.mockReturnValue([
        {
          blockchainType: BlockchainType.Ethereum,
          mapEthereumTokens: null,
        },
      ]);

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
          bucket: startDay.clone().add(1, 'day').toISOString(),
          open: '11',
          close: '12',
          high: '13',
          low: '10',
          selected_provider: 'codex',
        },

        // TokenB with coinmarketcap provider (default provider order)
        {
          tokenAddress: tokenB,
          bucket: startDay.clone().toISOString(),
          open: '1',
          close: '1.1',
          high: '1.2',
          low: '0.9',
          selected_provider: 'coinmarketcap',
        },
        {
          tokenAddress: tokenB,
          bucket: startDay.clone().add(1, 'day').toISOString(),
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
        // Check if this is the main fetchHistoryQuotesBucketsData query
        if (sql.includes('raw_counts') && sql.includes('token_stats') && sql.includes('locf')) {
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

    it('should handle empty addresses array', async () => {
      const blockchainType = BlockchainType.Ethereum;
      const start = moment().subtract(1, 'month').unix();
      const end = moment().unix();

      // Mock getDeployments to return a deployment with no mappings
      mockDeploymentService.getDeployments.mockReturnValue([
        {
          blockchainType: BlockchainType.Ethereum,
          mapEthereumTokens: null,
        },
      ]);

      // The method should return an empty object when addresses array is empty
      const result = await service.getHistoryQuotesBuckets(blockchainType, [], start, end, '1 day');
      expect(result).toEqual({});

      // Verify repository.query was not called with empty addresses
      expect(mockRepository.query).not.toHaveBeenCalled();
    });

    it('should handle Ethereum token mappings and fetch data from Ethereum blockchain', async () => {
      const originalToken = '0xoriginaltoken';
      const ethereumToken = '0xethereumtoken';
      const blockchainType = BlockchainType.Sei;
      const start = moment().subtract(1, 'month').unix();
      const end = moment().unix();
      const startDay = moment.unix(start).utc().startOf('day');

      // Mock getDeployments to return a deployment with mappings
      mockDeploymentService.getDeployments.mockReturnValue([
        {
          blockchainType: BlockchainType.Sei,
          mapEthereumTokens: {
            [originalToken]: ethereumToken,
          },
        },
      ]);

      // Mock the results for token from Ethereum blockchain
      const ethereumResults = [
        {
          tokenAddress: ethereumToken.toLowerCase(),
          bucket: startDay.toISOString(),
          open: '50',
          close: '55',
          high: '60',
          low: '45',
          selected_provider: 'codex',
        },
      ];

      // Setup the query mock to return different results based on blockchain type
      mockRepository.query.mockImplementation((sql) => {
        if (sql.includes(`AND "blockchainType" = '${BlockchainType.Ethereum}'`)) {
          return Promise.resolve(ethereumResults);
        }
        return Promise.resolve([]);
      });

      const result = await service.getHistoryQuotesBuckets(blockchainType, [originalToken], start, end, '1 day');

      // Verify we have results for the original token
      expect(result[originalToken.toLowerCase()]).toBeDefined();
      expect(result[originalToken.toLowerCase()][0]).toEqual(
        expect.objectContaining({
          open: '50',
          close: '55',
          high: '60',
          low: '45',
          provider: 'codex',
          mappedFrom: ethereumToken.toLowerCase(), // Should include the source Ethereum token
        }),
      );

      // Verify repository.query was called twice - once for unmapped tokens (which there are none)
      // and once for Ethereum tokens
      expect(mockRepository.query).toHaveBeenCalledTimes(1);
    });

    it('should combine results for both mapped and unmapped tokens', async () => {
      const unmappedToken = '0xunmappedtoken';
      const originalToken = '0xoriginaltoken';
      const ethereumToken = '0xethereumtoken';
      const blockchainType = BlockchainType.Sei;
      const start = moment().subtract(1, 'month').unix();
      const end = moment().unix();
      const startDay = moment.unix(start).utc().startOf('day');

      // Mock getDeployments to return a deployment with mappings
      mockDeploymentService.getDeployments.mockReturnValue([
        {
          blockchainType: BlockchainType.Sei,
          mapEthereumTokens: {
            [originalToken]: ethereumToken,
          },
        },
      ]);

      // Mock results for the unmapped token
      const unmappedResults = [
        {
          tokenAddress: unmappedToken.toLowerCase(),
          bucket: startDay.toISOString(),
          open: '10',
          close: '12',
          high: '15',
          low: '8',
          selected_provider: 'codex',
        },
      ];

      // Mock results for the Ethereum token
      const ethereumResults = [
        {
          tokenAddress: ethereumToken.toLowerCase(),
          bucket: startDay.toISOString(),
          open: '50',
          close: '55',
          high: '60',
          low: '45',
          selected_provider: 'coinmarketcap',
        },
      ];

      // Setup the query mock to return different results based on blockchain type
      mockRepository.query.mockImplementation((sql) => {
        if (sql.includes(`IN ('${unmappedToken.toLowerCase()}')`)) {
          return Promise.resolve(unmappedResults);
        } else if (sql.includes(`IN ('${ethereumToken.toLowerCase()}')`)) {
          return Promise.resolve(ethereumResults);
        }
        return Promise.resolve([]);
      });

      const result = await service.getHistoryQuotesBuckets(
        blockchainType,
        [unmappedToken, originalToken],
        start,
        end,
        '1 day',
      );

      // Verify we have results for both tokens
      expect(result[unmappedToken.toLowerCase()]).toBeDefined();
      expect(result[originalToken.toLowerCase()]).toBeDefined();

      // Verify unmapped token data is correct
      expect(result[unmappedToken.toLowerCase()][0]).toEqual(
        expect.objectContaining({
          open: '10',
          close: '12',
          high: '15',
          low: '8',
          provider: 'codex',
        }),
      );

      // Verify mapped token data is correct and includes mappedFrom property
      expect(result[originalToken.toLowerCase()][0]).toEqual(
        expect.objectContaining({
          open: '50',
          close: '55',
          high: '60',
          low: '45',
          provider: 'coinmarketcap',
          mappedFrom: ethereumToken.toLowerCase(),
        }),
      );

      // Verify repository.query was called twice - once for unmapped tokens and once for Ethereum tokens
      expect(mockRepository.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('addQuote', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockRepository.create.mockImplementation((data) => data);
      mockRepository.save.mockImplementation((data) => Promise.resolve(data));

      // Mock createQueryBuilder for getLast method
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    });

    it('should create and save a new quote with provided values', async () => {
      const quote = {
        tokenAddress: '0xToken123',
        usd: '100.5',
        blockchainType: BlockchainType.Ethereum,
        timestamp: new Date('2023-01-01T12:00:00.000Z'),
        provider: 'test-provider',
      };

      const result = await service.addQuote(quote);

      expect(mockRepository.create).toHaveBeenCalledWith({
        ...quote,
        tokenAddress: '0xtoken123', // Should be lowercase
        timestamp: quote.timestamp,
        provider: 'test-provider',
      });
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result).toEqual({
        ...quote,
        tokenAddress: '0xtoken123', // Should be lowercase
      });
    });

    it('should use default values when not provided', async () => {
      const now = new Date();
      jest.useFakeTimers().setSystemTime(now);

      const quote = {
        tokenAddress: '0xToken456',
        usd: '200.75',
        blockchainType: BlockchainType.Sei,
      };

      const result = await service.addQuote(quote);

      expect(mockRepository.create).toHaveBeenCalledWith({
        ...quote,
        tokenAddress: '0xtoken456', // Should be lowercase
        timestamp: now,
        provider: 'carbon-price', // Default provider
      });
      expect(mockRepository.save).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should handle errors when saving quotes', async () => {
      const errorMessage = 'Database error';
      mockRepository.save.mockRejectedValue(new Error(errorMessage));

      const quote = {
        tokenAddress: '0xErrorToken',
        usd: '300.25',
        blockchainType: BlockchainType.Ethereum,
      };

      await expect(service.addQuote(quote)).rejects.toThrow(`Error adding historical quote for address 0xErrorToken`);
      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should skip creating a new quote if the latest quote has the same USD value', async () => {
      const existingQuote = {
        id: 1,
        tokenAddress: '0xtoken789',
        usd: '150.25',
        blockchainType: BlockchainType.Ethereum,
        timestamp: new Date('2023-01-01T12:00:00.000Z'),
        provider: 'test-provider',
      };

      // Setup mock for getLast to return an existing quote
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(existingQuote),
      };
      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const newQuote = {
        tokenAddress: '0xToken789',
        usd: '150.25', // Same USD value as existing quote
        blockchainType: BlockchainType.Ethereum,
        provider: 'test-provider',
      };

      const result = await service.addQuote(newQuote);

      // Verify that create and save were not called
      expect(mockRepository.create).not.toHaveBeenCalled();
      expect(mockRepository.save).not.toHaveBeenCalled();

      // Verify that the existing quote was returned
      expect(result).toEqual(existingQuote);
    });

    it('should not create duplicate quotes with same USD value even with different timestamp', async () => {
      const existingQuote = {
        id: 1,
        tokenAddress: '0xtoken789',
        usd: '150.25',
        blockchainType: BlockchainType.Ethereum,
        timestamp: new Date('2023-01-01T12:00:00.000Z'),
        provider: 'test-provider',
      };

      // Setup mock for getLast to return an existing quote
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(existingQuote),
      };
      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const newQuote = {
        tokenAddress: '0xToken789',
        usd: '150.25', // Same USD value as existing quote
        blockchainType: BlockchainType.Ethereum,
        timestamp: new Date('2023-01-02T12:00:00.000Z'), // Different timestamp
        provider: 'test-provider',
      };

      const result = await service.addQuote(newQuote);

      // Verify that create and save were not called
      expect(mockRepository.create).not.toHaveBeenCalled();
      expect(mockRepository.save).not.toHaveBeenCalled();

      // Verify that the existing quote was returned
      expect(result).toEqual(existingQuote);

      // Verify that the timestamp difference was ignored
      expect(result.timestamp).not.toEqual(newQuote.timestamp);
    });

    it('should skip quotes when new price is 1000x or more bigger than the previous price', async () => {
      const existingQuote = {
        id: 1,
        tokenAddress: '0xtoken123',
        usd: '1.00',
        blockchainType: BlockchainType.Ethereum,
        timestamp: new Date('2023-01-01T12:00:00.000Z'),
        provider: 'test-provider',
      };

      // Setup mock for getLast to return an existing quote
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(existingQuote),
      };
      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const newQuote = {
        tokenAddress: '0xToken123',
        usd: '1000.00', // Exactly 1000x bigger
        blockchainType: BlockchainType.Ethereum,
        provider: 'test-provider',
      };

      const result = await service.addQuote(newQuote);

      // Verify that create and save were not called
      expect(mockRepository.create).not.toHaveBeenCalled();
      expect(mockRepository.save).not.toHaveBeenCalled();

      // Verify that the existing quote was returned
      expect(result).toEqual(existingQuote);
    });

    it('should skip quotes when new price is 1000x or more smaller than the previous price', async () => {
      const existingQuote = {
        id: 1,
        tokenAddress: '0xtoken123',
        usd: '1000.00',
        blockchainType: BlockchainType.Ethereum,
        timestamp: new Date('2023-01-01T12:00:00.000Z'),
        provider: 'test-provider',
      };

      // Setup mock for getLast to return an existing quote
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(existingQuote),
      };
      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const newQuote = {
        tokenAddress: '0xToken123',
        usd: '1.00', // Exactly 1000x smaller
        blockchainType: BlockchainType.Ethereum,
        provider: 'test-provider',
      };

      const result = await service.addQuote(newQuote);

      // Verify that create and save were not called
      expect(mockRepository.create).not.toHaveBeenCalled();
      expect(mockRepository.save).not.toHaveBeenCalled();

      // Verify that the existing quote was returned
      expect(result).toEqual(existingQuote);
    });

    it('should allow quotes with large but reasonable price changes (less than 1000x)', async () => {
      const existingQuote = {
        id: 1,
        tokenAddress: '0xtoken123',
        usd: '1.00',
        blockchainType: BlockchainType.Ethereum,
        timestamp: new Date('2023-01-01T12:00:00.000Z'),
        provider: 'test-provider',
      };

      // Setup mock for getLast to return an existing quote
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(existingQuote),
      };
      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const newQuote = {
        tokenAddress: '0xToken123',
        usd: '999.00', // 999x bigger, should be allowed
        blockchainType: BlockchainType.Ethereum,
        provider: 'test-provider',
      };

      const result = await service.addQuote(newQuote);

      // Verify that create and save were called
      expect(mockRepository.create).toHaveBeenCalledWith({
        ...newQuote,
        tokenAddress: '0xtoken123',
        timestamp: expect.any(Date),
      });
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          tokenAddress: '0xtoken123',
          usd: '999.00',
        }),
      );
    });

    it('should allow quotes with small price changes (much less than 1000x)', async () => {
      const existingQuote = {
        id: 1,
        tokenAddress: '0xtoken123',
        usd: '100.00',
        blockchainType: BlockchainType.Ethereum,
        timestamp: new Date('2023-01-01T12:00:00.000Z'),
        provider: 'test-provider',
      };

      // Setup mock for getLast to return an existing quote
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(existingQuote),
      };
      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const newQuote = {
        tokenAddress: '0xToken123',
        usd: '95.00', // 5% decrease, should be allowed
        blockchainType: BlockchainType.Ethereum,
        provider: 'test-provider',
      };

      const result = await service.addQuote(newQuote);

      // Verify that create and save were called
      expect(mockRepository.create).toHaveBeenCalledWith({
        ...newQuote,
        tokenAddress: '0xtoken123',
        timestamp: expect.any(Date),
      });
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          tokenAddress: '0xtoken123',
          usd: '95.00',
        }),
      );
    });

    it('should handle zero or negative prices safely in extreme jump check', async () => {
      const existingQuote = {
        id: 1,
        tokenAddress: '0xtoken123',
        usd: '0.00',
        blockchainType: BlockchainType.Ethereum,
        timestamp: new Date('2023-01-01T12:00:00.000Z'),
        provider: 'test-provider',
      };

      // Setup mock for getLast to return an existing quote with zero price
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(existingQuote),
      };
      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const newQuote = {
        tokenAddress: '0xToken123',
        usd: '100.00',
        blockchainType: BlockchainType.Ethereum,
        provider: 'test-provider',
      };

      const result = await service.addQuote(newQuote);

      // When previous price is 0, the ratio check should be skipped and the quote should be created
      expect(mockRepository.create).toHaveBeenCalledWith({
        ...newQuote,
        tokenAddress: '0xtoken123',
        timestamp: expect.any(Date),
      });
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          tokenAddress: '0xtoken123',
          usd: '100.00',
        }),
      );
    });

    it('should skip quotes when new price is exactly 1000x bigger (edge case)', async () => {
      const existingQuote = {
        id: 1,
        tokenAddress: '0xtoken123',
        usd: '0.001',
        blockchainType: BlockchainType.Ethereum,
        timestamp: new Date('2023-01-01T12:00:00.000Z'),
        provider: 'test-provider',
      };

      // Setup mock for getLast to return an existing quote
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(existingQuote),
      };
      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const newQuote = {
        tokenAddress: '0xToken123',
        usd: '1.00', // Exactly 1000x bigger
        blockchainType: BlockchainType.Ethereum,
        provider: 'test-provider',
      };

      const result = await service.addQuote(newQuote);

      // Verify that create and save were not called
      expect(mockRepository.create).not.toHaveBeenCalled();
      expect(mockRepository.save).not.toHaveBeenCalled();

      // Verify that the existing quote was returned
      expect(result).toEqual(existingQuote);
    });

    it('should skip quotes when new price is exactly 0.001x (1000x smaller) of the previous price', async () => {
      const existingQuote = {
        id: 1,
        tokenAddress: '0xtoken123',
        usd: '1000.00',
        blockchainType: BlockchainType.Ethereum,
        timestamp: new Date('2023-01-01T12:00:00.000Z'),
        provider: 'test-provider',
      };

      // Setup mock for getLast to return an existing quote
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(existingQuote),
      };
      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const newQuote = {
        tokenAddress: '0xToken123',
        usd: '1.00', // Exactly 0.001x (1000x smaller)
        blockchainType: BlockchainType.Ethereum,
        provider: 'test-provider',
      };

      const result = await service.addQuote(newQuote);

      // Verify that create and save were not called
      expect(mockRepository.create).not.toHaveBeenCalled();
      expect(mockRepository.save).not.toHaveBeenCalled();

      // Verify that the existing quote was returned
      expect(result).toEqual(existingQuote);
    });
  });

  describe('getLatest', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should fetch latest quotes from original blockchain when no mappings exist', async () => {
      const blockchainType = BlockchainType.Ethereum;

      // Mock deployment with no Ethereum mappings
      mockDeploymentService.getDeployments.mockReturnValue([
        {
          blockchainType: BlockchainType.Ethereum,
          mapEthereumTokens: null,
        },
      ]);

      // Mock repository query response
      const mockQuotes = [
        {
          tokenAddress: '0xtoken1',
          blockchainType: 'ethereum',
          usd: '100.25',
          timestamp: '2023-01-01T00:00:00.000Z',
        },
        {
          tokenAddress: '0xtoken2',
          blockchainType: 'ethereum',
          usd: '200.50',
          timestamp: '2023-01-01T00:00:00.000Z',
        },
      ];
      mockRepository.query.mockResolvedValue(mockQuotes);

      const result = await service.getLatest(blockchainType);

      // Verify query was called with correct parameters
      expect(mockRepository.query).toHaveBeenCalledTimes(1);
      expect(mockRepository.query).toHaveBeenCalledWith(
        expect.stringContaining(`WHERE "blockchainType" = '${blockchainType}'`),
      );

      // Verify results
      expect(Object.keys(result).length).toBe(2);
      expect(result['0xtoken1']).toEqual(mockQuotes[0]);
      expect(result['0xtoken2']).toEqual(mockQuotes[1]);
    });

    it('should fetch mapped data from Ethereum blockchain for mapped tokens', async () => {
      const blockchainType = BlockchainType.Sei;
      const originalToken = '0xoriginaltoken';
      const ethereumToken = '0xethereumtoken';

      // Mock deployment with Ethereum mappings
      mockDeploymentService.getDeployments.mockReturnValue([
        {
          blockchainType: BlockchainType.Sei,
          mapEthereumTokens: {
            [originalToken]: ethereumToken,
          },
        },
      ]);

      // Provide getLowercaseTokenMap implementation
      mockDeploymentService.getLowercaseTokenMap.mockImplementation((dep) => {
        const result = {};
        if (dep.mapEthereumTokens) {
          Object.entries(dep.mapEthereumTokens).forEach(([key, value]) => {
            result[key.toLowerCase()] = String(value).toLowerCase();
          });
        }
        return result;
      });

      // Mock original blockchain quotes
      const originalQuotes = [
        {
          tokenAddress: '0xsomeunmappedtoken',
          blockchainType: 'sei-network',
          usd: '50.75',
          timestamp: '2023-01-01T00:00:00.000Z',
        },
      ];

      // Mock Ethereum quotes
      const ethereumQuotes = [
        {
          tokenAddress: ethereumToken.toLowerCase(),
          blockchainType: 'ethereum',
          usd: '150.25',
          timestamp: '2023-01-01T00:00:00.000Z',
        },
      ];

      // Setup repository query to return different results based on the query
      mockRepository.query.mockImplementation((sql) => {
        if (sql.includes(BlockchainType.Ethereum)) {
          return Promise.resolve(ethereumQuotes);
        } else {
          return Promise.resolve(originalQuotes);
        }
      });

      const result = await service.getLatest(blockchainType);

      // Verify query was called twice - once for Sei and once for Ethereum
      expect(mockRepository.query).toHaveBeenCalledTimes(2);

      // Verify results include both unmapped and mapped tokens
      expect(Object.keys(result).length).toBe(2);

      // Verify unmapped token data is directly from original blockchain
      expect(result['0xsomeunmappedtoken']).toEqual(originalQuotes[0]);

      // Verify mapped token data comes from Ethereum but uses original address as key
      expect(result[originalToken.toLowerCase()]).toBeDefined();
      expect(result[originalToken.toLowerCase()].usd).toBe(ethereumQuotes[0].usd);
      expect(result[originalToken.toLowerCase()].blockchainType).toBe(BlockchainType.Ethereum);
      expect((result[originalToken.toLowerCase()] as HistoricQuoteWithMapping).mappedFrom).toBe(
        ethereumToken.toLowerCase(),
      );
    });

    it('should handle mixed tokens with some mapped to Ethereum and some not', async () => {
      const blockchainType = BlockchainType.Sei;
      const originalToken1 = '0xoriginaltoken1';
      const originalToken2 = '0xoriginaltoken2';
      const ethereumToken1 = '0xethereumtoken1';
      const ethereumToken2 = '0xethereumtoken2';

      // Mock deployment with multiple Ethereum mappings
      mockDeploymentService.getDeployments.mockReturnValue([
        {
          blockchainType: BlockchainType.Sei,
          mapEthereumTokens: {
            [originalToken1]: ethereumToken1,
            [originalToken2]: ethereumToken2,
          },
        },
      ]);

      // Provide getLowercaseTokenMap implementation
      mockDeploymentService.getLowercaseTokenMap.mockImplementation((dep) => {
        const result = {};
        if (dep.mapEthereumTokens) {
          Object.entries(dep.mapEthereumTokens).forEach(([key, value]) => {
            result[key.toLowerCase()] = String(value).toLowerCase();
          });
        }
        return result;
      });

      // Mock original blockchain quotes including one mapped token
      const originalQuotes = [
        {
          tokenAddress: '0xunmappedtoken',
          blockchainType: 'sei-network',
          usd: '25.50',
          timestamp: '2023-01-01T00:00:00.000Z',
        },
        {
          tokenAddress: originalToken1.toLowerCase(), // This one is mapped but has original data too
          blockchainType: 'sei-network',
          usd: '30.00', // This should be overridden by Ethereum data
          timestamp: '2023-01-01T00:00:00.000Z',
        },
      ];

      // Mock Ethereum quotes (only first mapped token has data)
      const ethereumQuotes = [
        {
          tokenAddress: ethereumToken1.toLowerCase(),
          blockchainType: 'ethereum',
          usd: '150.25',
          timestamp: '2023-01-01T00:00:00.000Z',
        },
        // No data for ethereumToken2
      ];

      // Setup repository query to return different results based on the query
      mockRepository.query.mockImplementation((sql) => {
        if (sql.includes(BlockchainType.Ethereum)) {
          return Promise.resolve(ethereumQuotes);
        } else {
          return Promise.resolve(originalQuotes);
        }
      });

      const result = await service.getLatest(blockchainType);

      // Verify both queries were executed
      expect(mockRepository.query).toHaveBeenCalledTimes(2);

      // Should have two tokens in result - unmapped and one mapped with data
      expect(Object.keys(result).length).toBe(2);

      // Verify unmapped token data is directly from original blockchain
      expect(result['0xunmappedtoken']).toEqual(originalQuotes[0]);

      // First mapped token should use Ethereum data
      expect(result[originalToken1.toLowerCase()]).toBeDefined();
      expect(result[originalToken1.toLowerCase()].usd).toBe(ethereumQuotes[0].usd);
      expect(result[originalToken1.toLowerCase()].blockchainType).toBe(BlockchainType.Ethereum);
      expect((result[originalToken1.toLowerCase()] as HistoricQuoteWithMapping).mappedFrom).toBe(
        ethereumToken1.toLowerCase(),
      );

      // Second mapped token should not appear in results since no data exists in either blockchain
      expect(result[originalToken2.toLowerCase()]).toBeUndefined();
    });

    it('should handle case where Ethereum data doesnt exist for a mapped token', async () => {
      const blockchainType = BlockchainType.Sei;
      const originalToken = '0xoriginaltoken';
      const ethereumToken = '0xethereumtoken';

      // Mock deployment with Ethereum mappings
      mockDeploymentService.getDeployments.mockReturnValue([
        {
          blockchainType: BlockchainType.Sei,
          mapEthereumTokens: {
            [originalToken]: ethereumToken,
          },
        },
      ]);

      // Provide getLowercaseTokenMap implementation
      mockDeploymentService.getLowercaseTokenMap.mockImplementation((dep) => {
        const result = {};
        if (dep.mapEthereumTokens) {
          Object.entries(dep.mapEthereumTokens).forEach(([key, value]) => {
            result[key.toLowerCase()] = String(value).toLowerCase();
          });
        }
        return result;
      });

      // Mock original blockchain quotes
      const originalQuotes = [
        {
          tokenAddress: originalToken.toLowerCase(),
          blockchainType: 'sei-network',
          usd: '50.75',
          timestamp: '2023-01-01T00:00:00.000Z',
        },
      ];

      // Mock empty Ethereum quotes - no data exists
      const ethereumQuotes = [];

      // Setup repository query to return different results based on the query
      mockRepository.query.mockImplementation((sql) => {
        if (sql.includes(BlockchainType.Ethereum)) {
          return Promise.resolve(ethereumQuotes);
        } else {
          return Promise.resolve(originalQuotes);
        }
      });

      const result = await service.getLatest(blockchainType);

      // The implementation appears to not return tokens that are mapped to Ethereum but don't have data there,
      // even if they have data in the original blockchain. So we should expect the token to be missing.
      expect(result[originalToken.toLowerCase()]).toBeUndefined();
    });
  });
});
