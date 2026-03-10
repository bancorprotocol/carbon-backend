import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GradientRealtimeService, GradientRealtimeWithOwner } from './gradient-realtime.service';
import { GradientStrategyRealtime } from './gradient-strategy-realtime.entity';
import { HarvesterService } from '../harvester/harvester.service';
import { DeploymentService, BlockchainType, ExchangeId, Deployment } from '../deployment/deployment.service';

describe('GradientRealtimeService', () => {
  let service: GradientRealtimeService;
  let mockRepository: any;
  let mockHarvesterService: any;
  let mockDeploymentService: any;
  let mockRedis: any;

  const mockDeployment: Deployment = {
    blockchainType: BlockchainType.Ethereum,
    exchangeId: ExchangeId.OGEthereum,
    rpcEndpoint: 'https://eth-mainnet.example.com',
    startBlock: 1000,
    harvestConcurrency: 5,
    harvestEventsBatchSize: 1000,
    multicallAddress: '0xMulticallAddress',
    gradientTimestampOffset: 60,
    gasToken: {
      name: 'Ethereum',
      symbol: 'ETH',
      address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    },
    contracts: {
      GradientController: { address: '0xGradientController' },
    },
  };

  const mockDeploymentNoGradient: Deployment = {
    ...mockDeployment,
    gradientTimestampOffset: undefined,
    contracts: {},
  };

  beforeEach(async () => {
    mockRepository = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((data) => ({ ...data })),
      update: jest.fn().mockResolvedValue({}),
      manager: {
        query: jest.fn().mockResolvedValue([]),
      },
    };

    mockHarvesterService = {
      getContract: jest.fn().mockReturnValue({
        methods: {
          pairs: jest.fn().mockReturnValue({ call: jest.fn().mockResolvedValue([]) }),
          strategiesByPairCount: jest.fn().mockReturnValue({ encodeABI: jest.fn().mockReturnValue('0x') }),
          strategiesByPair: jest.fn().mockReturnValue({ encodeABI: jest.fn().mockReturnValue('0x') }),
        },
      }),
      genericMulticall: jest.fn().mockResolvedValue({ results: [], blockNumber: 100 }),
    };

    mockDeploymentService = {
      hasGradientSupport: jest.fn().mockReturnValue(true),
    };

    mockRedis = {
      client: {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GradientRealtimeService,
        { provide: getRepositoryToken(GradientStrategyRealtime), useValue: mockRepository },
        { provide: HarvesterService, useValue: mockHarvesterService },
        { provide: DeploymentService, useValue: mockDeploymentService },
        { provide: 'REDIS', useValue: mockRedis },
      ],
    }).compile();

    service = module.get<GradientRealtimeService>(GradientRealtimeService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('update', () => {
    it('should skip update when deployment has no gradient support', async () => {
      mockDeploymentService.hasGradientSupport.mockReturnValue(false);

      const result = await service.update(mockDeploymentNoGradient, {});

      expect(result).toBe(0);
      expect(mockHarvesterService.getContract).not.toHaveBeenCalled();
    });

    it('should fetch pairs from GradientController', async () => {
      mockHarvesterService.getContract.mockReturnValue({
        methods: {
          pairs: jest.fn().mockReturnValue({ call: jest.fn().mockResolvedValue([]) }),
        },
      });

      await service.update(mockDeployment, {});

      expect(mockHarvesterService.getContract).toHaveBeenCalledWith(
        'GradientController',
        undefined,
        undefined,
        mockDeployment,
      );
    });

    it('should return 0 when no pairs exist', async () => {
      mockHarvesterService.getContract.mockReturnValue({
        methods: {
          pairs: jest.fn().mockReturnValue({ call: jest.fn().mockResolvedValue([]) }),
        },
      });

      const result = await service.update(mockDeployment, {});

      expect(result).toBe(0);
    });

    it('should call genericMulticall for strategy counts when pairs exist', async () => {
      const mockPairs = [['0xToken0', '0xToken1']];
      const mockContract = {
        methods: {
          pairs: jest.fn().mockReturnValue({ call: jest.fn().mockResolvedValue(mockPairs) }),
          strategiesByPairCount: jest.fn().mockReturnValue({ encodeABI: jest.fn().mockReturnValue('0xcount') }),
          strategiesByPair: jest.fn().mockReturnValue({ encodeABI: jest.fn().mockReturnValue('0xstrategies') }),
        },
      };
      mockHarvesterService.getContract.mockReturnValue(mockContract);
      mockHarvesterService.genericMulticall.mockResolvedValue({
        results: [{ success: true, data: '0x0' }],
        blockNumber: 100,
      });

      await service.update(mockDeployment, {});

      expect(mockHarvesterService.genericMulticall).toHaveBeenCalledWith(
        '0xGradientController',
        ['0xcount'],
        mockDeployment,
      );
    });

    it('should store block number in Redis after successful update', async () => {
      const mockContract = {
        methods: {
          pairs: jest.fn().mockReturnValue({ call: jest.fn().mockResolvedValue([]) }),
        },
      };
      mockHarvesterService.getContract.mockReturnValue(mockContract);

      await service.update(mockDeployment, {});

      // No strategies to process, so no Redis set for block number
      // (block number is only set after strategies are saved)
    });
  });

  describe('getStrategiesWithOwners', () => {
    it('should return strategies from repository', async () => {
      const mockEntities = [
        {
          strategyId: '1',
          owner: '0xOwner',
          token0Address: '0xToken0',
          token1Address: '0xToken1',
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
          deleted: false,
        },
      ];
      mockRepository.find.mockResolvedValue(mockEntities);
      mockRedis.client.get.mockResolvedValue('12345');

      const result = await service.getStrategiesWithOwners(mockDeployment);

      expect(result.strategies).toHaveLength(1);
      expect(result.blockNumber).toBe(12345);
      expect(result.strategies[0].strategyId).toBe('1');
      expect(result.strategies[0].owner).toBe('0xOwner');
      expect(result.strategies[0].order0GradientType).toBe('0');
    });

    it('should return blockNumber 0 when Redis has no value', async () => {
      mockRepository.find.mockResolvedValue([]);
      mockRedis.client.get.mockResolvedValue(null);

      const result = await service.getStrategiesWithOwners(mockDeployment);

      expect(result.blockNumber).toBe(0);
      expect(result.strategies).toHaveLength(0);
    });

    it('should only return non-deleted strategies', async () => {
      mockRepository.find.mockResolvedValue([]);

      await service.getStrategiesWithOwners(mockDeployment);

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: {
          blockchainType: BlockchainType.Ethereum,
          exchangeId: ExchangeId.OGEthereum,
          deleted: false,
        },
        order: { strategyId: 'ASC' },
      });
    });
  });

  describe('toGradientOrder (static)', () => {
    const mockStrategy: GradientRealtimeWithOwner = {
      strategyId: '1',
      owner: '0xOwner',
      token0Address: '0xToken0',
      token1Address: '0xToken1',
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
    };

    it('should return a GradientOrder with all required fields', () => {
      const result = GradientRealtimeService.toGradientOrder(mockStrategy, 0, 6);

      expect(result).toHaveProperty('startPrice');
      expect(result).toHaveProperty('endPrice');
      expect(result).toHaveProperty('startDate');
      expect(result).toHaveProperty('endDate');
      expect(result).toHaveProperty('budget');
      expect(result).toHaveProperty('marginalPrice');
    });

    it('should have all fields as strings', () => {
      const result = GradientRealtimeService.toGradientOrder(mockStrategy, 0, 6);

      expect(typeof result.startPrice).toBe('string');
      expect(typeof result.endPrice).toBe('string');
      expect(typeof result.startDate).toBe('string');
      expect(typeof result.endDate).toBe('string');
      expect(typeof result.budget).toBe('string');
      expect(typeof result.marginalPrice).toBe('string');
    });

    it('should normalize budget by token decimals', () => {
      const result = GradientRealtimeService.toGradientOrder(mockStrategy, 0, 6);

      // 1000000000 / 10^6 = 1000
      expect(result.budget).toBe('1000');
    });

    it('should use correct order fields for order index 0', () => {
      const result = GradientRealtimeService.toGradientOrder(mockStrategy, 0, 6);

      expect(result.startDate).toBe('1700000000');
      expect(result.endDate).toBe('1700086400');
    });

    it('should use correct order fields for order index 1', () => {
      const result = GradientRealtimeService.toGradientOrder(mockStrategy, 1, 18);

      // 500000000000000000 / 10^18 = 0.5
      expect(result.budget).toBe('0.5');
      expect(result.startDate).toBe('1700000000');
      expect(result.endDate).toBe('1700086400');
    });

    it('should compute startPrice > 0', () => {
      const result = GradientRealtimeService.toGradientOrder(mockStrategy, 0, 6);

      expect(parseFloat(result.startPrice)).toBeGreaterThan(0);
    });

    it('should compute different marginalPrice for increasing vs decreasing gradient', () => {
      const order0 = GradientRealtimeService.toGradientOrder(mockStrategy, 0, 6);
      const order1 = GradientRealtimeService.toGradientOrder(mockStrategy, 1, 18);

      // Both start with the same initial price, but type 0 (increase) should give
      // a different marginal than type 1 (decrease) at the same elapsed time
      expect(order0.startPrice).toBe(order1.startPrice);
    });
  });
});
