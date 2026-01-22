import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { CoingeckoService } from './coingecko.service';
import { Strategy } from '../../strategy/strategy.entity';
import { BlockchainType, ExchangeId, Deployment } from '../../deployment/deployment.service';

describe('CoingeckoService', () => {
  let service: CoingeckoService;
  let mockStrategyRepository: { query: jest.Mock };
  let mockCacheManager: { get: jest.Mock; set: jest.Mock };

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
        CoingeckoService,
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

    service = module.get<CoingeckoService>(CoingeckoService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getTickers SQL query', () => {
    /**
     * CRITICAL: These tests verify that values are NOT divided by decimals.
     *
     * The strategies table stores NORMALIZED values (already human-readable).
     * A bug was introduced when the storage format changed but the query wasn't updated,
     * causing double-division (e.g., 247000 became 0.000000000000247).
     *
     * If processOrders() changes back to outputting raw values, the contract tests
     * in activity-v2.utilities.spec.ts will fail, alerting us to update these queries.
     */
    it('should NOT divide liquidity by decimals (values are already normalized)', async () => {
      const serviceAny = service as any;
      mockStrategyRepository.query.mockResolvedValue([]);

      await serviceAny.getTickers(mockDeployment, 'quotes AS (SELECT 1)');

      const executedQuery = mockStrategyRepository.query.mock.calls[0][0];

      // CRITICAL: Verify liquidity is NOT divided by decimals
      expect(executedQuery).toContain('liquidity0_new as "liquidity0_real"');
      expect(executedQuery).toContain('liquidity1_new as "liquidity1_real"');

      // Make sure the old buggy pattern is NOT present
      expect(executedQuery).not.toMatch(/liquidity0_new\s*\/\s*POW\s*\(\s*10\s*,\s*decimals0\s*\)/i);
      expect(executedQuery).not.toMatch(/liquidity1_new\s*\/\s*POW\s*\(\s*10\s*,\s*decimals1\s*\)/i);
    });

    it('should NOT divide rates by decimals (values are already normalized)', async () => {
      const serviceAny = service as any;
      mockStrategyRepository.query.mockResolvedValue([]);

      await serviceAny.getTickers(mockDeployment, 'quotes AS (SELECT 1)');

      const executedQuery = mockStrategyRepository.query.mock.calls[0][0];

      // CRITICAL: Rates are stored with decimal adjustment from processOrders
      // Do NOT apply additional decimal adjustments in the query
      expect(executedQuery).not.toMatch(/lowestRate0.*\/\s*POW/i);
      expect(executedQuery).not.toMatch(/highestRate0.*\/\s*POW/i);
      expect(executedQuery).not.toMatch(/marginalRate0.*\/\s*POW/i);
      expect(executedQuery).not.toMatch(/lowestRate1.*\/\s*POW/i);
      expect(executedQuery).not.toMatch(/highestRate1.*\/\s*POW/i);
      expect(executedQuery).not.toMatch(/marginalRate1.*\/\s*POW/i);
    });

    it('should use rate values directly without conversion in raw_strategies', async () => {
      const serviceAny = service as any;
      mockStrategyRepository.query.mockResolvedValue([]);

      await serviceAny.getTickers(mockDeployment, 'quotes AS (SELECT 1)');

      const executedQuery = mockStrategyRepository.query.mock.calls[0][0];

      // Rate values from processOrders are already in final human-readable format:
      // - marginalRate0 (sellPrice) is already the ask price
      // - marginalRate1 (buyPrice) is already the bid price
      // NO conversion or inversion needed in raw_strategies
      expect(executedQuery).not.toMatch(/POW\s*\([^)]*\)\s*\/\s*s\."marginalRate0"/i);
      expect(executedQuery).toMatch(/s\."marginalRate0"::double precision as "marginalRate0"/i);
      expect(executedQuery).toMatch(/s\."marginalRate1"::double precision as "marginalRate1"/i);
    });

    it('should use direct min/max for bid/ask without inversion', async () => {
      const serviceAny = service as any;
      mockStrategyRepository.query.mockResolvedValue([]);

      await serviceAny.getTickers(mockDeployment, 'quotes AS (SELECT 1)');

      const executedQuery = mockStrategyRepository.query.mock.calls[0][0];

      // Stored values are already the final prices:
      // ask = min(marginalRate0) - use directly, NO inversion
      // bid = max(marginalRate1) - use directly
      expect(executedQuery).not.toMatch(/min\s*\(\s*1\s*\/\s*m\."marginalRate0"/i);
      expect(executedQuery).toMatch(/min\s*\(\s*m\."marginalRate0"/i);
      expect(executedQuery).toMatch(/max\s*\(\s*m\."marginalRate1"/i);
    });

    it('should NOT divide volume by decimals (values derived from normalized liquidity)', async () => {
      const serviceAny = service as any;
      mockStrategyRepository.query.mockResolvedValue([]);

      await serviceAny.getTickers(mockDeployment, 'quotes AS (SELECT 1)');

      const executedQuery = mockStrategyRepository.query.mock.calls[0][0];

      // CRITICAL: Verify volume is NOT divided by decimals
      // volume0_min2perc comes from liquidity0 which is already normalized
      expect(executedQuery).not.toMatch(/volume0_min2perc\s*\/\s*POW/i);
      expect(executedQuery).not.toMatch(/volume1_min2perc\s*\/\s*POW/i);
    });

    it('should include a comment explaining values are already normalized', async () => {
      const serviceAny = service as any;
      mockStrategyRepository.query.mockResolvedValue([]);

      await serviceAny.getTickers(mockDeployment, 'quotes AS (SELECT 1)');

      const executedQuery = mockStrategyRepository.query.mock.calls[0][0];

      // Verify there's a comment explaining the data format
      expect(executedQuery).toContain('already normalized');
    });

    // 2% Depth: asks use [marginal, highest], bids use [lowest, marginal]
    it('should calculate 2% depth correctly for asks and bids', async () => {
      const serviceAny = service as any;
      mockStrategyRepository.query.mockResolvedValue([]);

      await serviceAny.getTickers(mockDeployment, 'quotes AS (SELECT 1)');

      const executedQuery = mockStrategyRepository.query.mock.calls[0][0];

      // Ask: (target - marginal) / (highest - marginal)
      expect(executedQuery).toMatch(/liquidity0.*\*.*\(rate0_min2perc_sqrt\s*-\s*marginalRate0_sqrt\)/i);

      // Bid: (marginal - target) / (marginal - lowest)
      expect(executedQuery).toMatch(/liquidity1.*\*.*\(marginalRate1_sqrt\s*-\s*rate1_min2perc_sqrt\)/i);
    });

    it('should have correct edge cases for ask and bid depth calculations', async () => {
      const serviceAny = service as any;
      mockStrategyRepository.query.mockResolvedValue([]);

      await serviceAny.getTickers(mockDeployment, 'quotes AS (SELECT 1)');

      const executedQuery = mockStrategyRepository.query.mock.calls[0][0];

      // Ask: target >= highest → ALL, target <= marginal → 0
      expect(executedQuery).toMatch(/WHEN\s+rate0_min2perc_sqrt\s*>=\s*highestRate0_sqrt\s+then\s+liquidity0/i);
      expect(executedQuery).toMatch(/WHEN\s+rate0_min2perc_sqrt\s*<=\s*marginalRate0_sqrt\s+then\s+0/i);

      // Bid: target <= lowest → ALL, target >= marginal → 0
      expect(executedQuery).toMatch(/WHEN\s+rate1_min2perc_sqrt\s*<=\s*lowestRate1_sqrt\s+then\s+liquidity1/i);
      expect(executedQuery).toMatch(/WHEN\s+rate1_min2perc_sqrt\s*>=\s*marginalRate1_sqrt\s+then\s+0/i);
    });

    it('should include a comment explaining the 2% depth calculation', async () => {
      const serviceAny = service as any;
      mockStrategyRepository.query.mockResolvedValue([]);

      await serviceAny.getTickers(mockDeployment, 'quotes AS (SELECT 1)');

      const executedQuery = mockStrategyRepository.query.mock.calls[0][0];

      // Verify there's a comment explaining the depth calculation
      expect(executedQuery).toMatch(/2%.*Depth/i);
    });
  });

  describe('getCachedTickers', () => {
    it('should return cached tickers', async () => {
      const mockTickers = {
        tickers: [{ ticker_id: '0xToken0_0xToken1', liquidity_in_usd: '1000000' }],
      };
      mockCacheManager.get.mockResolvedValue(mockTickers);

      const result = await service.getCachedTickers(mockDeployment);

      expect(result).toEqual(mockTickers);
      expect(mockCacheManager.get).toHaveBeenCalledWith(
        `${mockDeployment.blockchainType}:${mockDeployment.exchangeId}:coingecko:tickers`,
      );
    });

    it('should return null when cache is empty', async () => {
      mockCacheManager.get.mockResolvedValue(null);

      const result = await service.getCachedTickers(mockDeployment);

      expect(result).toBeNull();
    });
  });
});
