import { Test, TestingModule } from '@nestjs/testing';
import { StrategiesController } from './strategies.controller';
import { DeploymentService, ExchangeId, BlockchainType, Deployment } from '../../deployment/deployment.service';
import { StrategyService, StrategyWithOwner } from '../../strategy/strategy.service';
import { BlockService } from '../../block/block.service';
import { Block } from '../../block/block.entity';
import { StrategiesQueryDto } from './strategies.dto';

describe('StrategiesController', () => {
  let controller: StrategiesController;
  let deploymentService: jest.Mocked<DeploymentService>;
  let strategyService: jest.Mocked<StrategyService>;
  let blockService: jest.Mocked<BlockService>;

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

  const mockBlock: Block = {
    id: 1000,
    timestamp: new Date(),
    blockchainType: BlockchainType.Ethereum,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockStrategiesWithOrders: StrategyWithOwner[] = [
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
          },
        },
        {
          provide: StrategyService,
          useValue: {
            getStrategiesWithOwners: jest.fn(),
          },
        },
        {
          provide: BlockService,
          useValue: {
            getLastBlock: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<StrategiesController>(StrategiesController);
    deploymentService = module.get(DeploymentService);
    strategyService = module.get(StrategyService);
    blockService = module.get(BlockService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getStrategies', () => {
    it('should return all non-deleted strategies with decoded orders', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      blockService.getLastBlock.mockResolvedValue(mockBlock);
      strategyService.getStrategiesWithOwners.mockResolvedValue(mockStrategiesWithOrders);

      const query: StrategiesQueryDto = {};
      const result = await controller.getStrategies(ExchangeId.OGEthereum, query);

      expect(result.strategies).toHaveLength(2);
      expect(result.strategies[0]).toMatchObject({
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

      expect(deploymentService.getDeploymentByExchangeId).toHaveBeenCalledWith(ExchangeId.OGEthereum);
      expect(blockService.getLastBlock).toHaveBeenCalledWith(mockDeployment);
      expect(strategyService.getStrategiesWithOwners).toHaveBeenCalledWith(mockDeployment, mockBlock.id);
    });

    it('should return empty array when no last block exists', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      blockService.getLastBlock.mockResolvedValue(null);

      const query: StrategiesQueryDto = {};
      const result = await controller.getStrategies(ExchangeId.OGEthereum, query);

      expect(result).toEqual({ strategies: [] });
      expect(blockService.getLastBlock).toHaveBeenCalledWith(mockDeployment);
      expect(strategyService.getStrategiesWithOwners).not.toHaveBeenCalled();
    });

    it('should return empty array when no strategies exist', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      blockService.getLastBlock.mockResolvedValue(mockBlock);
      strategyService.getStrategiesWithOwners.mockResolvedValue([]);

      const query: StrategiesQueryDto = {};
      const result = await controller.getStrategies(ExchangeId.OGEthereum, query);

      expect(result).toEqual({ strategies: [] });
    });

    it('should correctly map base and quote (token0 and token1)', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      blockService.getLastBlock.mockResolvedValue(mockBlock);
      strategyService.getStrategiesWithOwners.mockResolvedValue(mockStrategiesWithOrders);

      const query: StrategiesQueryDto = {};
      const result = await controller.getStrategies(ExchangeId.OGEthereum, query);

      // Strategy 1: base = token0, quote = token1
      expect(result.strategies[0].base).toBe('0xToken1Address');
      expect(result.strategies[0].quote).toBe('0xToken2Address');

      // Strategy 2: base = token0, quote = token1 (different tokens)
      expect(result.strategies[1].base).toBe('0xToken2Address');
      expect(result.strategies[1].quote).toBe('0xToken1Address');
    });

    it('should map order1 to buy and order0 to sell', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      blockService.getLastBlock.mockResolvedValue(mockBlock);
      strategyService.getStrategiesWithOwners.mockResolvedValue(mockStrategiesWithOrders);

      const query: StrategiesQueryDto = {};
      const result = await controller.getStrategies(ExchangeId.OGEthereum, query);

      // Both strategies should have buy and sell orders
      result.strategies.forEach((strategy) => {
        expect(strategy.buy).toBeDefined();
        expect(strategy.sell).toBeDefined();
      });
    });

    it('should have all order fields as strings', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      blockService.getLastBlock.mockResolvedValue(mockBlock);
      strategyService.getStrategiesWithOwners.mockResolvedValue(mockStrategiesWithOrders);

      const query: StrategiesQueryDto = {};
      const result = await controller.getStrategies(ExchangeId.OGEthereum, query);

      result.strategies.forEach((strategy) => {
        expect(typeof strategy.buy.budget).toBe('string');
        expect(typeof strategy.buy.min).toBe('string');
        expect(typeof strategy.buy.max).toBe('string');
        expect(typeof strategy.buy.marginal).toBe('string');
        expect(typeof strategy.sell.budget).toBe('string');
        expect(typeof strategy.sell.min).toBe('string');
        expect(typeof strategy.sell.max).toBe('string');
        expect(typeof strategy.sell.marginal).toBe('string');
      });
    });

    it('should work with different exchange IDs', async () => {
      const seiDeployment: Deployment = {
        ...mockDeployment,
        blockchainType: BlockchainType.Sei,
        exchangeId: ExchangeId.OGSei,
      };

      deploymentService.getDeploymentByExchangeId.mockReturnValue(seiDeployment);
      blockService.getLastBlock.mockResolvedValue(mockBlock);
      strategyService.getStrategiesWithOwners.mockResolvedValue(mockStrategiesWithOrders);

      const query: StrategiesQueryDto = {};
      const result = await controller.getStrategies(ExchangeId.OGSei, query);

      expect(result.strategies).toHaveLength(2);
      expect(deploymentService.getDeploymentByExchangeId).toHaveBeenCalledWith(ExchangeId.OGSei);
    });

    it('should handle multiple strategies correctly', async () => {
      const manyStrategies: StrategyWithOwner[] = Array.from({ length: 10 }, (_, i) => ({
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

      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      blockService.getLastBlock.mockResolvedValue(mockBlock);
      strategyService.getStrategiesWithOwners.mockResolvedValue(manyStrategies);

      const query: StrategiesQueryDto = {};
      const result = await controller.getStrategies(ExchangeId.OGEthereum, query);

      expect(result.strategies).toHaveLength(10);
      result.strategies.forEach((strategy, index) => {
        expect(strategy.id).toBe(`${index + 1}`);
        expect(strategy.owner).toBe(`0xOwner${index + 1}`);
      });
    });
  });

  describe('Pagination', () => {
    const manyStrategies: StrategyWithOwner[] = Array.from({ length: 25 }, (_, i) => ({
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
      blockService.getLastBlock.mockResolvedValue(mockBlock);
      strategyService.getStrategiesWithOwners.mockResolvedValue(manyStrategies);

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

    it('should return second page of results', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      blockService.getLastBlock.mockResolvedValue(mockBlock);
      strategyService.getStrategiesWithOwners.mockResolvedValue(manyStrategies);

      const query: StrategiesQueryDto = { page: 1, pageSize: 10 };
      const result = await controller.getStrategies(ExchangeId.OGEthereum, query);

      expect(result.strategies).toHaveLength(10);
      expect(result.strategies[0].id).toBe('11');
      expect(result.strategies[9].id).toBe('20');
      expect(result.pagination).toEqual({
        page: 1,
        pageSize: 10,
        totalStrategies: 25,
        totalPages: 3,
        hasMore: true,
      });
    });

    it('should return last page with remaining items', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      blockService.getLastBlock.mockResolvedValue(mockBlock);
      strategyService.getStrategiesWithOwners.mockResolvedValue(manyStrategies);

      const query: StrategiesQueryDto = { page: 2, pageSize: 10 };
      const result = await controller.getStrategies(ExchangeId.OGEthereum, query);

      expect(result.strategies).toHaveLength(5);
      expect(result.strategies[0].id).toBe('21');
      expect(result.strategies[4].id).toBe('25');
      expect(result.pagination).toEqual({
        page: 2,
        pageSize: 10,
        totalStrategies: 25,
        totalPages: 3,
        hasMore: false,
      });
    });

    it('should return all strategies when pageSize is 0', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      blockService.getLastBlock.mockResolvedValue(mockBlock);
      strategyService.getStrategiesWithOwners.mockResolvedValue(manyStrategies);

      const query: StrategiesQueryDto = { page: 0, pageSize: 0 };
      const result = await controller.getStrategies(ExchangeId.OGEthereum, query);

      expect(result.strategies).toHaveLength(25);
      expect(result.pagination).toBeUndefined();
    });

    it('should return empty array for page beyond available data', async () => {
      deploymentService.getDeploymentByExchangeId.mockReturnValue(mockDeployment);
      blockService.getLastBlock.mockResolvedValue(mockBlock);
      strategyService.getStrategiesWithOwners.mockResolvedValue(manyStrategies);

      const query: StrategiesQueryDto = { page: 10, pageSize: 10 };
      const result = await controller.getStrategies(ExchangeId.OGEthereum, query);

      expect(result.strategies).toHaveLength(0);
      expect(result.pagination).toEqual({
        page: 10,
        pageSize: 10,
        totalStrategies: 25,
        totalPages: 3,
        hasMore: false,
      });
    });
  });
});
