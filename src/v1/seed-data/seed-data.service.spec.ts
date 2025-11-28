import { Test, TestingModule } from '@nestjs/testing';
import { SeedDataService } from './seed-data.service';

describe('SeedDataService', () => {
  let service: SeedDataService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SeedDataService],
    }).compile();

    service = module.get<SeedDataService>(SeedDataService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('buildSeedData', () => {
    it('should return seed data with correct structure', async () => {
      const mockStrategies = [
        {
          strategyId: '1',
          owner: '0xOwner1',
          token0Address: '0xTokenA',
          token1Address: '0xTokenB',
          order0: JSON.stringify({ y: '100', z: '100', A: '200', B: '300' }),
          order1: JSON.stringify({ y: '200', z: '200', A: '400', B: '500' }),
          liquidity0: '100',
          lowestRate0: '0.1',
          highestRate0: '0.2',
          marginalRate0: '0.15',
          liquidity1: '200',
          lowestRate1: '5',
          highestRate1: '10',
          marginalRate1: '7.5',
        },
      ];

      const mockTradingFees = {
        '0xTokenA_0xTokenB': 2000,
      };

      const result = await service.buildSeedData(1000, mockStrategies, mockTradingFees);

      expect(result).toHaveProperty('schemeVersion', 7);
      expect(result).toHaveProperty('latestBlockNumber', 1000);
      expect(result).toHaveProperty('strategiesByPair');
      expect(result).toHaveProperty('tradingFeePPMByPair');
      expect(result.pagination).toBeUndefined(); // No pagination by default
    });

    it('should return paginated results when pageSize is specified', async () => {
      const mockStrategies = Array.from({ length: 15 }, (_, i) => ({
        strategyId: `${i + 1}`,
        owner: `0xOwner${i + 1}`,
        token0Address: '0xTokenA',
        token1Address: '0xTokenB',
        order0: JSON.stringify({ y: '100', z: '100', A: '200', B: '300' }),
        order1: JSON.stringify({ y: '200', z: '200', A: '400', B: '500' }),
        liquidity0: '100',
        lowestRate0: '0.1',
        highestRate0: '0.2',
        marginalRate0: '0.15',
        liquidity1: '200',
        lowestRate1: '5',
        highestRate1: '10',
        marginalRate1: '7.5',
      }));

      const mockTradingFees = {
        '0xTokenA_0xTokenB': 2000,
      };

      const result = await service.buildSeedData(1000, mockStrategies, mockTradingFees, 0, 10);

      expect(result.pagination).toBeDefined();
      expect(result.pagination.page).toBe(0);
      expect(result.pagination.pageSize).toBe(10);
      expect(result.pagination.totalStrategies).toBe(15);
      expect(result.pagination.totalPages).toBe(2);
      expect(result.pagination.hasMore).toBe(true);
    });

    it('should group strategies by pair correctly', async () => {
      const mockStrategies = [
        {
          strategyId: '1',
          owner: '0xOwner1',
          token0Address: '0xTokenA',
          token1Address: '0xTokenB',
          order0: JSON.stringify({ y: '100', z: '100', A: '200', B: '300' }),
          order1: JSON.stringify({ y: '200', z: '200', A: '400', B: '500' }),
          liquidity0: '100',
          lowestRate0: '0.1',
          highestRate0: '0.2',
          marginalRate0: '0.15',
          liquidity1: '200',
          lowestRate1: '5',
          highestRate1: '10',
          marginalRate1: '7.5',
        },
        {
          strategyId: '2',
          owner: '0xOwner2',
          token0Address: '0xTokenA',
          token1Address: '0xTokenB',
          order0: JSON.stringify({ y: '150', z: '150', A: '250', B: '350' }),
          order1: JSON.stringify({ y: '250', z: '250', A: '450', B: '550' }),
          liquidity0: '150',
          lowestRate0: '0.12',
          highestRate0: '0.22',
          marginalRate0: '0.17',
          liquidity1: '250',
          lowestRate1: '5.5',
          highestRate1: '10.5',
          marginalRate1: '8',
        },
      ];

      const mockTradingFees = {
        '0xTokenA_0xTokenB': 2000,
      };

      const result = await service.buildSeedData(1000, mockStrategies, mockTradingFees);

      const pairKey = Object.keys(result.strategiesByPair)[0];
      expect(result.strategiesByPair[pairKey]).toHaveLength(2);
      expect(result.strategiesByPair[pairKey][0].id).toBe('1');
      expect(result.strategiesByPair[pairKey][1].id).toBe('2');
    });

    it('should create pair keys from token0 and token1', async () => {
      const mockStrategies = [
        {
          strategyId: '1',
          owner: '0xOwner1',
          token0Address: '0xAAA',
          token1Address: '0xZZZ',
          order0: JSON.stringify({ y: '100', z: '100', A: '200', B: '300' }),
          order1: JSON.stringify({ y: '200', z: '200', A: '400', B: '500' }),
          liquidity0: '100',
          lowestRate0: '0.1',
          highestRate0: '0.2',
          marginalRate0: '0.15',
          liquidity1: '200',
          lowestRate1: '5',
          highestRate1: '10',
          marginalRate1: '7.5',
        },
      ];

      const mockTradingFees = {
        '0xAAA_0xZZZ': 2000,
      };

      const result = await service.buildSeedData(1000, mockStrategies, mockTradingFees);

      const pairKey = Object.keys(result.strategiesByPair)[0];
      // Tokens are already stored alphabetically, just concatenate
      expect(pairKey).toBe('0xAAA_0xZZZ');
    });
  });
});
