import { Test, TestingModule } from '@nestjs/testing';
import { StrategiesController } from './strategies.controller';
import { DeploymentService, ExchangeId, BlockchainType, Deployment } from '../../deployment/deployment.service';
import { StrategyRealtimeService, StrategyRealtimeWithOwner } from '../../strategy-realtime/strategy-realtime.service';
import { GradientRealtimeService } from '../../gradient/gradient-realtime.service';
import { TokenService } from '../../token/token.service';
import { StrategiesQueryDto } from './strategies.dto';

describe('StrategiesController', () => {
  let controller: StrategiesController;
  let deploymentService: jest.Mocked<DeploymentService>;
  let strategyRealtimeService: jest.Mocked<StrategyRealtimeService>;
  let gradientRealtimeService: jest.Mocked<GradientRealtimeService>;
  let tokenService: jest.Mocked<TokenService>;

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

  const mockStrategies: StrategyRealtimeWithOwner[] = [
    {
      strategyId: '1',
      owner: '0xOwner1',
      token0Address: '0xToken1Address',
      token1Address: '0xToken2Address',
      order0: JSON.stringify({ y: '10000000000000000000', z: '10000000000000000000', A: '0', B: '4409572391052980' }),
      order1: JSON.stringify({ y: '2000000000', z: '2000000000', A: '0', B: '12397686690' }),
      liquidity0: '10',
      lowestRate0: '0.000244140625',
      highestRate0: '0.000244140625',
      marginalRate0: '0.000244140625',
      liquidity1: '2000',
      lowestRate1: '4096',
      highestRate1: '4096',
      marginalRate1: '4096',
    },
    {
      strategyId: '2',
      owner: '0xOwner2',
      token0Address: '0xToken2Address',
      token1Address: '0xToken1Address',
      order0: JSON.stringify({ y: '5000000000', z: '5000000000', A: '0', B: '12397686690' }),
      order1: JSON.stringify({ y: '1000000000000000000', z: '1000000000000000000', A: '0', B: '4409572391052980' }),
      liquidity0: '5000',
      lowestRate0: '4096',
      highestRate0: '4096',
      marginalRate0: '4096',
      liquidity1: '1',
      lowestRate1: '0.000244140625',
      highestRate1: '0.000244140625',
      marginalRate1: '0.000244140625',
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StrategiesController],
      providers: [
        {
          provide: DeploymentService,
          useValue: {
            getDeploymentByExchangeId: jest.fn(),
            hasGradientSupport: jest.fn().mockReturnValue(false),
          },
        },
        {
          provide: StrategyRealtimeService,
          useValue: {
            getStrategiesWithOwners: jest.fn(),
          },
        },
        {
          provide: GradientRealtimeService,
          useValue: {
            getStrategiesWithOwners: jest.fn().mockResolvedValue({ strategies: [], blockNumber: 0 }),
          },
        },
        {
          provide: TokenService,
          useValue: {
            allByAddress: jest.fn().mockResolvedValue({}),
          },
        },
      ],
    }).compile();

    controller = module.get<StrategiesController>(StrategiesController);
    deploymentService = module.get(DeploymentService);
    strategyRealtimeService = module.get(StrategyRealtimeService);
    gradientRealtimeService = module.get(GradientRealtimeService);
    tokenService = module.get(TokenService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getStrategies', () => {
    it('should return all regular strategies with type discriminator', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      strategyRealtimeService.getStrategiesWithOwners.mockResolvedValue({
        strategies: mockStrategies,
        blockNumber: 12345678,
      });

      const query: StrategiesQueryDto = {};
      const result = await controller.getStrategies(ExchangeId.OGEthereum, query);

      expect(result.strategies).toHaveLength(2);
      expect(result.strategies[0]).toMatchObject({
        type: 'regular',
        id: '1',
        owner: '0xOwner1',
        base: '0xToken1Address',
        quote: '0xToken2Address',
      });
      expect(result.strategies[0].buy).toEqual({
        budget: '2000',
        min: '4096',
        max: '4096',
        marginal: '4096',
      });
      expect(result.strategies[0].sell).toEqual({
        budget: '10',
        min: '0.000244140625',
        max: '0.000244140625',
        marginal: '0.000244140625',
      });
      expect(result.pagination).toBeUndefined();
    });

    it('should return mixed strategies when gradient support is enabled', async () => {
      const deploymentWithGradient = {
        ...mockDeployment,
        gradientTimestampOffset: 60,
        contracts: { GradientController: { address: '0x123' } },
      };
      deploymentService.getDeploymentByExchangeId.mockReturnValue(deploymentWithGradient);
      deploymentService.hasGradientSupport.mockReturnValue(true);
      strategyRealtimeService.getStrategiesWithOwners.mockResolvedValue({
        strategies: [mockStrategies[0]],
        blockNumber: 12345678,
      });

      const mockGradientStrategy = {
        strategyId: 'gradient-1',
        owner: '0xGradientOwner',
        token0Address: '0xToken1Address',
        token1Address: '0xToken2Address',
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

      gradientRealtimeService.getStrategiesWithOwners.mockResolvedValue({
        strategies: [mockGradientStrategy],
        blockNumber: 12345678,
      });

      tokenService.allByAddress.mockResolvedValue({
        '0xToken1Address': { address: '0xToken1Address', decimals: 6, symbol: 'USDC', name: 'USD Coin' } as any,
        '0xToken2Address': { address: '0xToken2Address', decimals: 18, symbol: 'WETH', name: 'Wrapped Ether' } as any,
      });

      const query: StrategiesQueryDto = {};
      const result = await controller.getStrategies(ExchangeId.OGEthereum, query);

      expect(result.strategies).toHaveLength(2);
      expect(result.strategies[0].type).toBe('regular');
      expect(result.strategies[1].type).toBe('gradient');

      const gradientStrat = result.strategies[1] as any;
      expect(gradientStrat.id).toBe('gradient-1');
      expect(gradientStrat.owner).toBe('0xGradientOwner');
      expect(gradientStrat.sell).toHaveProperty('startPrice');
      expect(gradientStrat.sell).toHaveProperty('endPrice');
      expect(gradientStrat.sell).toHaveProperty('startDate');
      expect(gradientStrat.sell).toHaveProperty('endDate');
      expect(gradientStrat.sell).toHaveProperty('budget');
      expect(gradientStrat.sell).toHaveProperty('marginalPrice');
    });

    it('should have all gradient order fields as strings', async () => {
      const deploymentWithGradient = {
        ...mockDeployment,
        gradientTimestampOffset: 60,
        contracts: { GradientController: { address: '0x123' } },
      };
      deploymentService.getDeploymentByExchangeId.mockReturnValue(deploymentWithGradient);
      deploymentService.hasGradientSupport.mockReturnValue(true);
      strategyRealtimeService.getStrategiesWithOwners.mockResolvedValue({
        strategies: [],
        blockNumber: 12345678,
      });

      gradientRealtimeService.getStrategiesWithOwners.mockResolvedValue({
        strategies: [
          {
            strategyId: 'g-1',
            owner: '0xOwner',
            token0Address: '0xToken1Address',
            token1Address: '0xToken2Address',
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
        ],
        blockNumber: 12345678,
      });

      tokenService.allByAddress.mockResolvedValue({
        '0xToken1Address': { address: '0xToken1Address', decimals: 6, symbol: 'USDC', name: 'USD Coin' } as any,
        '0xToken2Address': { address: '0xToken2Address', decimals: 18, symbol: 'WETH', name: 'Wrapped Ether' } as any,
      });

      const result = await controller.getStrategies(ExchangeId.OGEthereum, {});

      expect(result.strategies).toHaveLength(1);
      const g = result.strategies[0] as any;
      expect(g.type).toBe('gradient');
      expect(typeof g.sell.startPrice).toBe('string');
      expect(typeof g.sell.endPrice).toBe('string');
      expect(typeof g.sell.startDate).toBe('string');
      expect(typeof g.sell.endDate).toBe('string');
      expect(typeof g.sell.budget).toBe('string');
      expect(typeof g.sell.marginalPrice).toBe('string');
      expect(typeof g.buy.startPrice).toBe('string');
      expect(typeof g.buy.budget).toBe('string');
    });

    it('should skip gradient strategies when token info is missing', async () => {
      const deploymentWithGradient = {
        ...mockDeployment,
        gradientTimestampOffset: 60,
        contracts: { GradientController: { address: '0x123' } },
      };
      deploymentService.getDeploymentByExchangeId.mockReturnValue(deploymentWithGradient);
      deploymentService.hasGradientSupport.mockReturnValue(true);
      strategyRealtimeService.getStrategiesWithOwners.mockResolvedValue({
        strategies: [],
        blockNumber: 12345678,
      });

      gradientRealtimeService.getStrategiesWithOwners.mockResolvedValue({
        strategies: [
          {
            strategyId: 'g-1',
            owner: '0xOwner',
            token0Address: '0xUnknownToken',
            token1Address: '0xToken2Address',
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
        ],
        blockNumber: 12345678,
      });

      tokenService.allByAddress.mockResolvedValue({
        '0xToken2Address': { address: '0xToken2Address', decimals: 18, symbol: 'WETH', name: 'Wrapped Ether' } as any,
      });

      const result = await controller.getStrategies(ExchangeId.OGEthereum, {});

      expect(result.strategies).toHaveLength(0);
    });

    it('should not fetch gradient data when gradient support is disabled', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      deploymentService.hasGradientSupport.mockReturnValue(false);
      strategyRealtimeService.getStrategiesWithOwners.mockResolvedValue({
        strategies: mockStrategies,
        blockNumber: 12345678,
      });

      const result = await controller.getStrategies(ExchangeId.OGEthereum, {});

      expect(result.strategies).toHaveLength(2);
      expect(gradientRealtimeService.getStrategiesWithOwners).not.toHaveBeenCalled();
      expect(tokenService.allByAddress).not.toHaveBeenCalled();
    });

    it('should return empty array when no strategies exist', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      strategyRealtimeService.getStrategiesWithOwners.mockResolvedValue({
        strategies: [],
        blockNumber: 12345678,
      });

      const query: StrategiesQueryDto = {};
      const result = await controller.getStrategies(ExchangeId.OGEthereum, query);

      expect(result).toEqual({ strategies: [] });
    });

    it('should have all regular order fields as strings', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      strategyRealtimeService.getStrategiesWithOwners.mockResolvedValue({
        strategies: mockStrategies,
        blockNumber: 12345678,
      });

      const query: StrategiesQueryDto = {};
      const result = await controller.getStrategies(ExchangeId.OGEthereum, query);

      result.strategies.forEach((strategy) => {
        expect(strategy.type).toBe('regular');
        if (strategy.type === 'regular') {
          expect(typeof strategy.buy.budget).toBe('string');
          expect(typeof strategy.buy.min).toBe('string');
          expect(typeof strategy.buy.max).toBe('string');
          expect(typeof strategy.buy.marginal).toBe('string');
          expect(typeof strategy.sell.budget).toBe('string');
          expect(typeof strategy.sell.min).toBe('string');
          expect(typeof strategy.sell.max).toBe('string');
          expect(typeof strategy.sell.marginal).toBe('string');
        }
      });
    });
  });

  describe('Pagination', () => {
    const manyStrategies: StrategyRealtimeWithOwner[] = Array.from({ length: 25 }, (_, i) => ({
      strategyId: `${i + 1}`,
      owner: `0xOwner${i + 1}`,
      token0Address: '0xToken1Address',
      token1Address: '0xToken2Address',
      order0: JSON.stringify({ y: '10000000000000000000', z: '10000000000000000000', A: '0', B: '4409572391052980' }),
      order1: JSON.stringify({ y: '2000000000', z: '2000000000', A: '0', B: '12397686690' }),
      liquidity0: '10',
      lowestRate0: '0.000244140625',
      highestRate0: '0.000244140625',
      marginalRate0: '0.000244140625',
      liquidity1: '2000',
      lowestRate1: '4096',
      highestRate1: '4096',
      marginalRate1: '4096',
    }));

    it('should return paginated results when pageSize is specified', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      strategyRealtimeService.getStrategiesWithOwners.mockResolvedValue({
        strategies: manyStrategies,
        blockNumber: 12345678,
      });

      const query: StrategiesQueryDto = { page: 0, pageSize: 10 };
      const result = await controller.getStrategies(ExchangeId.OGEthereum, query);

      expect(result.strategies).toHaveLength(10);
      expect(result.strategies[0].id).toBe('1');
      expect(result.strategies[9].id).toBe('10');
      expect(result.pagination).toEqual({
        page: 0,
        pageSize: 10,
        totalStrategies: 25,
        totalPages: 3,
        hasMore: true,
      });
    });

    it('should return all strategies when pageSize is 0', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      strategyRealtimeService.getStrategiesWithOwners.mockResolvedValue({
        strategies: manyStrategies,
        blockNumber: 12345678,
      });

      const query: StrategiesQueryDto = { page: 0, pageSize: 0 };
      const result = await controller.getStrategies(ExchangeId.OGEthereum, query);

      expect(result.strategies).toHaveLength(25);
      expect(result.pagination).toBeUndefined();
    });
  });
});
