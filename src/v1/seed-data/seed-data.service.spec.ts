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

      const result = await service.buildSeedData(1000, mockStrategies, mockTradingFees, []);

      expect(result).toHaveProperty('schemeVersion', 8);
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

      const result = await service.buildSeedData(1000, mockStrategies, mockTradingFees, [], 0, 10);

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

      const result = await service.buildSeedData(1000, mockStrategies, mockTradingFees, []);

      const pairKey = Object.keys(result.strategiesByPair)[0];
      expect(result.strategiesByPair[pairKey]).toHaveLength(2);
      expect(result.strategiesByPair[pairKey][0].id).toBe('1');
      expect(result.strategiesByPair[pairKey][1].id).toBe('2');
    });

    it('should create pair keys with tokens sorted alphabetically', async () => {
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

      const result = await service.buildSeedData(1000, mockStrategies, mockTradingFees, []);

      const pairKey = Object.keys(result.strategiesByPair)[0];
      expect(pairKey).toBe('0xAAA_0xZZZ');
    });

    it('should merge strategies with reversed token order under a single sorted pair key', async () => {
      const mockStrategies = [
        {
          strategyId: '1',
          owner: '0xOwner1',
          token0Address: '0xZZZ',
          token1Address: '0xAAA',
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
          token0Address: '0xAAA',
          token1Address: '0xZZZ',
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
        '0xAAA_0xZZZ': 2000,
      };

      const result = await service.buildSeedData(1000, mockStrategies, mockTradingFees, []);

      const pairKeys = Object.keys(result.strategiesByPair);
      expect(pairKeys).toHaveLength(1);
      expect(pairKeys[0]).toBe('0xAAA_0xZZZ');
      expect(result.strategiesByPair['0xAAA_0xZZZ']).toHaveLength(2);

      // Each strategy preserves its original token0/token1 and order0/order1
      expect(result.strategiesByPair['0xAAA_0xZZZ'][0].token0).toBe('0xZZZ');
      expect(result.strategiesByPair['0xAAA_0xZZZ'][0].token1).toBe('0xAAA');
      expect(result.strategiesByPair['0xAAA_0xZZZ'][1].token0).toBe('0xAAA');
      expect(result.strategiesByPair['0xAAA_0xZZZ'][1].token1).toBe('0xZZZ');
    });

    it('should add type: regular to regular strategies', async () => {
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

      const result = await service.buildSeedData(1000, mockStrategies, {}, []);

      const pairKey = Object.keys(result.strategiesByPair)[0];
      expect(result.strategiesByPair[pairKey][0].type).toBe('regular');
    });

    it('should include gradient strategies with type: gradient', async () => {
      const mockGradientStrategies = [
        {
          strategyId: 'gradient-1',
          owner: '0xGradientOwner',
          token0Address: '0xTokenA',
          token1Address: '0xTokenB',
          order0Liquidity: '1000000000',
          order0InitialPrice: '3377704960',
          order0TradingStartTime: 1700000000,
          order0Expiry: 1700086400,
          order0MultiFactor: '16777728',
          order0GradientType: '0',
          order1Liquidity: '500000000000000000',
          order1InitialPrice: '3377704960',
          order1TradingStartTime: 1700000000,
          order1Expiry: 1700086400,
          order1MultiFactor: '16777728',
          order1GradientType: '1',
        },
      ];

      const result = await service.buildSeedData(1000, [], {}, mockGradientStrategies);

      const pairKey = Object.keys(result.strategiesByPair)[0];
      const strategy = result.strategiesByPair[pairKey][0];
      expect(strategy.type).toBe('gradient');
      expect(strategy.id).toBe('gradient-1');
      expect(strategy.order0).toHaveProperty('liquidity');
      expect(strategy.order0).toHaveProperty('initialPrice');
      expect(strategy.order0).toHaveProperty('tradingStartTime');
      expect(strategy.order0).toHaveProperty('expiry');
      expect(strategy.order0).toHaveProperty('multiFactor');
      expect(strategy.order0).toHaveProperty('gradientType');
    });

    it('should mix regular and gradient strategies in the same pair', async () => {
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

      const mockGradientStrategies = [
        {
          strategyId: 'gradient-1',
          owner: '0xGradientOwner',
          token0Address: '0xTokenA',
          token1Address: '0xTokenB',
          order0Liquidity: '1000000000',
          order0InitialPrice: '3377704960',
          order0TradingStartTime: 1700000000,
          order0Expiry: 1700086400,
          order0MultiFactor: '16777728',
          order0GradientType: '0',
          order1Liquidity: '500000000000000000',
          order1InitialPrice: '3377704960',
          order1TradingStartTime: 1700000000,
          order1Expiry: 1700086400,
          order1MultiFactor: '16777728',
          order1GradientType: '1',
        },
      ];

      const result = await service.buildSeedData(1000, mockStrategies, {}, mockGradientStrategies);

      const pairKey = Object.keys(result.strategiesByPair)[0];
      expect(result.strategiesByPair[pairKey]).toHaveLength(2);
      expect(result.strategiesByPair[pairKey][0].type).toBe('regular');
      expect(result.strategiesByPair[pairKey][1].type).toBe('gradient');
    });

    it('should count gradient strategies in pagination totalStrategies', async () => {
      const mockStrategies = Array.from({ length: 5 }, (_, i) => ({
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

      const mockGradientStrategies = Array.from({ length: 3 }, (_, i) => ({
        strategyId: `gradient-${i + 1}`,
        owner: `0xGradOwner${i + 1}`,
        token0Address: '0xTokenA',
        token1Address: '0xTokenB',
        order0Liquidity: '1000',
        order0InitialPrice: '3377704960',
        order0TradingStartTime: 1700000000,
        order0Expiry: 1700086400,
        order0MultiFactor: '16777728',
        order0GradientType: '0',
        order1Liquidity: '2000',
        order1InitialPrice: '3377704960',
        order1TradingStartTime: 1700000000,
        order1Expiry: 1700086400,
        order1MultiFactor: '16777728',
        order1GradientType: '1',
      }));

      const result = await service.buildSeedData(1000, mockStrategies, {}, mockGradientStrategies, 0, 10);

      expect(result.pagination.totalStrategies).toBe(8);
    });
  });
});
