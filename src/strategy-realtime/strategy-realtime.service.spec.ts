import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StrategyRealtimeService } from './strategy-realtime.service';
import { StrategyRealtime } from './strategy-realtime.entity';
import { HarvesterService, ContractsNames } from '../harvester/harvester.service';
import { BlockchainType, Deployment, ExchangeId } from '../deployment/deployment.service';
import { TokensByAddress } from '../token/token.service';

// Mock Web3
jest.mock('web3', () => {
  return jest.fn().mockImplementation(() => ({
    eth: {
      abi: {
        decodeParameter: jest.fn(),
      },
    },
  }));
});

describe('StrategyRealtimeService', () => {
  let service: StrategyRealtimeService;
  let repository: jest.Mocked<Repository<StrategyRealtime>>;
  let harvesterService: jest.Mocked<HarvesterService>;
  let mockRedis: { client: { get: jest.Mock; set: jest.Mock } };

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
    contracts: {
      CarbonController: {
        address: '0xCarbonControllerAddress',
      },
    },
  };

  const mockTokens: TokensByAddress = {
    '0xToken1Address': {
      id: 1,
      address: '0xToken1Address',
      symbol: 'TKN1',
      name: 'Token 1',
      decimals: 18,
      blockchainType: BlockchainType.Ethereum,
      exchangeId: ExchangeId.OGEthereum,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    '0xToken2Address': {
      id: 2,
      address: '0xToken2Address',
      symbol: 'TKN2',
      name: 'Token 2',
      decimals: 6,
      blockchainType: BlockchainType.Ethereum,
      exchangeId: ExchangeId.OGEthereum,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  const mockStrategyRealtimeEntities: StrategyRealtime[] = [
    {
      id: '1',
      blockchainType: BlockchainType.Ethereum,
      exchangeId: ExchangeId.OGEthereum,
      strategyId: '100',
      owner: '0xOwner1',
      token0Address: '0xToken1Address',
      token1Address: '0xToken2Address',
      liquidity0: '10',
      lowestRate0: '0.001',
      highestRate0: '0.002',
      marginalRate0: '0.0015',
      liquidity1: '1000',
      lowestRate1: '500',
      highestRate1: '1000',
      marginalRate1: '750',
      encodedOrder0: JSON.stringify({ y: '10000000000000000000', z: '10000000000000000000', A: '0', B: '1000' }),
      encodedOrder1: JSON.stringify({ y: '1000000000', z: '1000000000', A: '0', B: '2000' }),
      deleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '2',
      blockchainType: BlockchainType.Ethereum,
      exchangeId: ExchangeId.OGEthereum,
      strategyId: '101',
      owner: '0xOwner2',
      token0Address: '0xToken1Address',
      token1Address: '0xToken2Address',
      liquidity0: '20',
      lowestRate0: '0.002',
      highestRate0: '0.003',
      marginalRate0: '0.0025',
      liquidity1: '2000',
      lowestRate1: '400',
      highestRate1: '800',
      marginalRate1: '600',
      encodedOrder0: JSON.stringify({ y: '20000000000000000000', z: '20000000000000000000', A: '0', B: '1500' }),
      encodedOrder1: JSON.stringify({ y: '2000000000', z: '2000000000', A: '0', B: '2500' }),
      deleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  beforeEach(async () => {
    mockRedis = {
      client: {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StrategyRealtimeService,
        {
          provide: getRepositoryToken(StrategyRealtime),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: HarvesterService,
          useValue: {
            getContract: jest.fn(),
            genericMulticall: jest.fn(),
          },
        },
        {
          provide: 'REDIS',
          useValue: mockRedis,
        },
      ],
    }).compile();

    service = module.get<StrategyRealtimeService>(StrategyRealtimeService);
    repository = module.get(getRepositoryToken(StrategyRealtime));
    harvesterService = module.get(HarvesterService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getStrategiesWithOwners', () => {
    it('should return all non-deleted strategies for deployment', async () => {
      repository.find.mockResolvedValue(mockStrategyRealtimeEntities);

      const result = await service.getStrategiesWithOwners(mockDeployment);

      expect(result.strategies).toHaveLength(2);
      expect(result.blockNumber).toBe(0); // No block number set yet
      expect(repository.find).toHaveBeenCalledWith({
        where: {
          blockchainType: mockDeployment.blockchainType,
          exchangeId: mockDeployment.exchangeId,
          deleted: false,
        },
        order: { strategyId: 'ASC' },
      });
    });

    it('should map strategy fields correctly', async () => {
      repository.find.mockResolvedValue([mockStrategyRealtimeEntities[0]]);

      const result = await service.getStrategiesWithOwners(mockDeployment);

      expect(result.strategies[0]).toEqual({
        strategyId: '100',
        owner: '0xOwner1',
        token0Address: '0xToken1Address',
        token1Address: '0xToken2Address',
        order0: mockStrategyRealtimeEntities[0].encodedOrder0,
        order1: mockStrategyRealtimeEntities[0].encodedOrder1,
        liquidity0: '10',
        lowestRate0: '0.001',
        highestRate0: '0.002',
        marginalRate0: '0.0015',
        liquidity1: '1000',
        lowestRate1: '500',
        highestRate1: '1000',
        marginalRate1: '750',
      });
    });

    it('should return empty array when no strategies exist', async () => {
      repository.find.mockResolvedValue([]);

      const result = await service.getStrategiesWithOwners(mockDeployment);

      expect(result.strategies).toEqual([]);
      expect(result.blockNumber).toBe(0);
    });

    it('should filter by deployment blockchainType and exchangeId', async () => {
      const seiDeployment: Deployment = {
        ...mockDeployment,
        blockchainType: BlockchainType.Sei,
        exchangeId: ExchangeId.OGSei,
      };
      repository.find.mockResolvedValue([]);

      await service.getStrategiesWithOwners(seiDeployment);

      expect(repository.find).toHaveBeenCalledWith({
        where: {
          blockchainType: BlockchainType.Sei,
          exchangeId: ExchangeId.OGSei,
          deleted: false,
        },
        order: { strategyId: 'ASC' },
      });
    });
  });

  describe('update', () => {
    let mockContract: any;

    beforeEach(() => {
      mockContract = {
        methods: {
          pairs: jest.fn().mockReturnValue({
            call: jest.fn().mockResolvedValue([]),
          }),
          strategiesByPairCount: jest.fn().mockReturnValue({
            encodeABI: jest.fn().mockReturnValue('0xencoded'),
          }),
          strategiesByPair: jest.fn().mockReturnValue({
            encodeABI: jest.fn().mockReturnValue('0xencoded'),
          }),
        },
      };
      harvesterService.getContract.mockReturnValue(mockContract);
    });

    it('should call getContract with correct parameters', async () => {
      mockContract.methods.pairs().call.mockResolvedValue([]);

      await service.update(mockDeployment, mockTokens);

      expect(harvesterService.getContract).toHaveBeenCalledWith(
        ContractsNames.CarbonController,
        undefined,
        undefined,
        mockDeployment,
      );
    });

    it('should return early when no pairs exist', async () => {
      mockContract.methods.pairs().call.mockResolvedValue([]);

      await service.update(mockDeployment, mockTokens);

      expect(harvesterService.genericMulticall).not.toHaveBeenCalled();
    });

    it('should fetch strategy counts for all pairs', async () => {
      const pairs = [
        ['0xToken1Address', '0xToken2Address'],
        ['0xToken3Address', '0xToken4Address'],
      ];
      mockContract.methods.pairs().call.mockResolvedValue(pairs);
      harvesterService.genericMulticall.mockResolvedValue({
        results: [
          { success: true, data: '0x0' }, // 0 strategies
          { success: true, data: '0x0' }, // 0 strategies
        ],
        blockNumber: 12345678,
      });
      repository.find.mockResolvedValue([]);

      await service.update(mockDeployment, mockTokens);

      expect(harvesterService.genericMulticall).toHaveBeenCalledTimes(1);
      expect(mockContract.methods.strategiesByPairCount).toHaveBeenCalledTimes(2);
    });

    it('should call markDeletedStrategies when pairs exist but have no strategies', async () => {
      // Pairs exist but all have 0 strategies
      mockContract.methods.pairs().call.mockResolvedValue([['0xToken1Address', '0xToken2Address']]);
      harvesterService.genericMulticall.mockResolvedValue({
        results: [{ success: true, data: '0x0' }], // 0 strategies
        blockNumber: 12345678,
      });

      // markDeletedStrategies will find existing strategies in DB
      repository.find.mockResolvedValueOnce([
        { id: '1', strategyId: '100', deleted: false },
        { id: '2', strategyId: '101', deleted: false },
      ] as StrategyRealtime[]);

      await service.update(mockDeployment, mockTokens);

      // markDeletedStrategies should have been called
      expect(repository.find).toHaveBeenCalled();
      expect(repository.update).toHaveBeenCalled();
    });

    it('should return early when no pairs exist', async () => {
      mockContract.methods.pairs().call.mockResolvedValue([]);

      await service.update(mockDeployment, mockTokens);

      // Should return early without calling multicall
      expect(harvesterService.genericMulticall).not.toHaveBeenCalled();
    });
  });

  describe('different blockchain types', () => {
    it('should work with Sei deployment', async () => {
      const seiDeployment: Deployment = {
        ...mockDeployment,
        blockchainType: BlockchainType.Sei,
        exchangeId: ExchangeId.OGSei,
      };

      repository.find.mockResolvedValue([]);

      const result = await service.getStrategiesWithOwners(seiDeployment);

      expect(result.strategies).toEqual([]);
      expect(result.blockNumber).toBe(0);
      expect(repository.find).toHaveBeenCalledWith({
        where: {
          blockchainType: BlockchainType.Sei,
          exchangeId: ExchangeId.OGSei,
          deleted: false,
        },
        order: { strategyId: 'ASC' },
      });
    });
  });
});
