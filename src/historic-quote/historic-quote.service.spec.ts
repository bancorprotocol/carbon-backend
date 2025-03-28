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

      await service.getUsdBuckets(blockchainType, tokenA, tokenB, now - 7200, now);

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

      await service.getUsdBuckets(blockchainType, tokenA, tokenB, now - 3600, now);

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

      await service.getUsdBuckets(blockchainType, tokenA, tokenB, now - 3600, now);

      const pricesPassedToCreateDailyCandlestick = (service.createDailyCandlestick as jest.Mock).mock.calls[0][0];
      expect(pricesPassedToCreateDailyCandlestick).toHaveLength(1); // Should skip the timestamp with null close
      expect(pricesPassedToCreateDailyCandlestick[0].timestamp).toBe(now);
    });
  });
});
