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

    /**
     * CRITICAL: 2% Depth Calculation Tests
     *
     * CoinGecko's 2% depth metric measures liquidity available WITHIN 2% of the current price.
     * The formula must calculate: (marginalRate - target) / (marginalRate - lowestRate)
     * NOT: (target - lowestRate) / (marginalRate - lowestRate)
     *
     * The wrong formula gives liquidity OUTSIDE the 2% range (~97-99%).
     * The correct formula gives liquidity INSIDE the 2% range (~1-3%).
     *
     * Example: If price range is $3000-$3200 and target is $3136 (98% of $3200):
     * - Wrong: ($3136 - $3000) / ($3200 - $3000) = 68% (outside 2%)
     * - Correct: ($3200 - $3136) / ($3200 - $3000) = 32% (inside 2%)
     */
    it('should calculate 2% depth using (marginalRate - target) for liquidity INSIDE 2%', async () => {
      const serviceAny = service as any;
      mockStrategyRepository.query.mockResolvedValue([]);

      await serviceAny.getTickers(mockDeployment, 'quotes AS (SELECT 1)');

      const executedQuery = mockStrategyRepository.query.mock.calls[0][0];

      // CRITICAL: The depth formula must use (marginalRate_sqrt - target_sqrt)
      // to calculate liquidity INSIDE the 2% range, not (target_sqrt - lowestRate_sqrt)
      // which would give liquidity OUTSIDE the 2% range

      // Verify the correct formula pattern for order0 (sell side)
      expect(executedQuery).toMatch(/liquidity0.*\*.*\(marginalRate0_sqrt\s*-\s*rate0_min2perc_sqrt\)/i);

      // Verify the correct formula pattern for order1 (buy side)
      expect(executedQuery).toMatch(/liquidity1.*\*.*\(marginalRate1_sqrt\s*-\s*rate1_min2perc_sqrt\)/i);

      // Ensure the OLD wrong formula is NOT present
      // Wrong: (target - lowest) which gives liquidity OUTSIDE 2%
      expect(executedQuery).not.toMatch(/liquidity0.*\*.*\(rate0_min2perc_sqrt\s*-\s*lowestRate0_sqrt\)/i);
      expect(executedQuery).not.toMatch(/liquidity1.*\*.*\(rate1_min2perc_sqrt\s*-\s*lowestRate1_sqrt\)/i);
    });

    it('should include a comment explaining the 2% depth calculation', async () => {
      const serviceAny = service as any;
      mockStrategyRepository.query.mockResolvedValue([]);

      await serviceAny.getTickers(mockDeployment, 'quotes AS (SELECT 1)');

      const executedQuery = mockStrategyRepository.query.mock.calls[0][0];

      // Verify there's a comment explaining the depth calculation
      expect(executedQuery).toMatch(/2%.*depth/i);
      expect(executedQuery).toMatch(/INSIDE.*2%|WITHIN.*2%/i);
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
