import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { AnalyticsService } from './analytics.service';
import { Strategy } from '../../strategy/strategy.entity';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let mockStrategyRepository: { query: jest.Mock };
  let mockCacheManager: { get: jest.Mock; set: jest.Mock };

  beforeEach(async () => {
    mockStrategyRepository = {
      query: jest.fn(),
    };

    mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: getRepositoryToken(Strategy),
          useValue: mockStrategyRepository,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getGenericMetrics SQL query', () => {
    /**
     * CRITICAL: This test verifies that liquidity values are NOT divided by decimals.
     *
     * The strategies table stores NORMALIZED values (already human-readable).
     * A bug was introduced when the storage format changed but the query wasn't updated,
     * causing double-division (e.g., 247000 became 0.000000000000247).
     *
     * The SQL query should use: (liquidity0 * price0)
     * NOT: (liquidity0 / POW(10, decimals0) * price0)
     */
    it('should NOT divide liquidity by decimals (values are already normalized)', async () => {
      // Access private method via any cast for testing
      const serviceAny = service as any;

      // Mock deployment
      const deployment = {
        blockchainType: 'ethereum',
        exchangeId: 'carbon',
      };

      // Mock the query to return empty results (we just want to verify the query structure)
      mockStrategyRepository.query.mockResolvedValue([
        {
          current_liquidity: '1000000',
          strategies_created: 100,
          pairs_created: 50,
          unique_traders: 200,
          active_pairs: 30,
          number_trades: 5000,
          volume: '500000',
          fees: '1000',
          last_block: 12345678,
          last_timestamp: new Date(),
        },
      ]);

      // Call the private method
      await serviceAny.getGenericMetrics(deployment, 'quotes AS (SELECT 1)', 'historic_quotes AS (SELECT 1)');

      // Get the SQL query that was executed
      const executedQuery = mockStrategyRepository.query.mock.calls[0][0];

      // CRITICAL ASSERTION: Verify the query does NOT divide by decimals for liquidity
      // The query should have: (liquidity0 * price0) NOT (liquidity0 / POW(10, decimals0) * price0)
      expect(executedQuery).toContain('(liquidity0 * price0)');
      expect(executedQuery).toContain('(liquidity1 * price1)');

      // Make sure the old buggy pattern is NOT present
      expect(executedQuery).not.toMatch(/liquidity0\s*\/\s*POW\s*\(\s*10\s*,\s*decimals0\s*\)/i);
      expect(executedQuery).not.toMatch(/liquidity1\s*\/\s*POW\s*\(\s*10\s*,\s*decimals1\s*\)/i);
    });

    it('should include a comment explaining liquidity values are already normalized', async () => {
      const serviceAny = service as any;

      const deployment = {
        blockchainType: 'ethereum',
        exchangeId: 'carbon',
      };

      mockStrategyRepository.query.mockResolvedValue([{}]);

      await serviceAny.getGenericMetrics(deployment, 'quotes AS (SELECT 1)', 'historic_quotes AS (SELECT 1)');

      const executedQuery = mockStrategyRepository.query.mock.calls[0][0];

      // Verify there's a comment explaining the data format
      expect(executedQuery).toContain('already normalized');
    });
  });

  describe('getCachedGenericMetrics', () => {
    it('should return cached metrics', async () => {
      const mockMetrics = { current_liquidity: '1000000' };
      mockCacheManager.get.mockResolvedValue(mockMetrics);

      const deployment = {
        blockchainType: 'ethereum',
        exchangeId: 'carbon',
      };

      const result = await service.getCachedGenericMetrics(deployment as any);

      expect(result).toEqual(mockMetrics);
      expect(mockCacheManager.get).toHaveBeenCalledWith('carbon:ethereum:carbon:generic-metrics');
    });
  });

  describe('getCachedTradesCount', () => {
    it('should return cached trades count with parsed integers', async () => {
      const mockTrades = [
        { id: 'strategy1', trade_count: '100' },
        { id: 'strategy2', trade_count: '200' },
      ];
      mockCacheManager.get.mockResolvedValue(mockTrades);

      const deployment = {
        blockchainType: 'ethereum',
        exchangeId: 'carbon',
      };

      const result = await service.getCachedTradesCount(deployment as any);

      expect(result).toEqual([
        { strategyId: 'strategy1', tradeCount: 100 },
        { strategyId: 'strategy2', tradeCount: 200 },
      ]);
    });
  });
});
