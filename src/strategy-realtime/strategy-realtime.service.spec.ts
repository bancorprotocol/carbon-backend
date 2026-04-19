import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StrategyRealtimeService } from './strategy-realtime.service';
import { StrategyRealtime } from './strategy-realtime.entity';
import { HarvesterService, ContractsNames } from '../harvester/harvester.service';
import { BlockchainType, Deployment, ExchangeId } from '../deployment/deployment.service';
import { TokensByAddress, TokenService } from '../token/token.service';

// Mock Web3
jest.mock('web3', () => {
  const mockWeb3 = jest.fn().mockImplementation(() => ({
    eth: {
      abi: {
        decodeParameter: jest.fn(),
      },
      Contract: jest.fn().mockImplementation(() => ({
        events: {},
      })),
    },
  }));
  (mockWeb3 as any).providers = {
    WebsocketProvider: jest.fn().mockImplementation(() => ({
      disconnect: jest.fn(),
      on: jest.fn(),
    })),
  };
  return mockWeb3;
});

jest.mock('web3-providers-ws', () => ({
  WebSocketProvider: jest.fn().mockImplementation(() => ({
    disconnect: jest.fn(),
    on: jest.fn(),
  })),
}));

describe('StrategyRealtimeService', () => {
  let module: TestingModule;
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
      updatedAtBlock: null,
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
      updatedAtBlock: null,
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

    module = await Test.createTestingModule({
      providers: [
        StrategyRealtimeService,
        {
          provide: getRepositoryToken(StrategyRealtime),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn().mockImplementation((data) => ({ ...data })),
            save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
            update: jest.fn(),
            delete: jest.fn(),
            createQueryBuilder: jest.fn(),
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
          provide: TokenService,
          useValue: {
            getOrCreateTokenByAddress: jest.fn(),
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

  // ─── guardedWrite tests ──────────────────────────────────────────────

  describe('guardedWrite', () => {
    let mockQueryBuilder: any;

    beforeEach(() => {
      mockQueryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn(),
      };
      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    });

    it('should update when DB has updatedAtBlock = null (conditional update succeeds)', async () => {
      mockQueryBuilder.execute.mockResolvedValue({ affected: 1 });

      const result = await service.guardedWrite('100', mockDeployment, 5000, { owner: '0xNewOwner' });

      expect(result).toBe(true);
      expect(mockQueryBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({ owner: '0xNewOwner', updatedAtBlock: 5000 }),
      );
    });

    it('should update when DB has updatedAtBlock <= incoming block', async () => {
      mockQueryBuilder.execute.mockResolvedValue({ affected: 1 });

      const result = await service.guardedWrite('100', mockDeployment, 6000, { owner: '0xNewOwner' });

      expect(result).toBe(true);
    });

    it('should skip write when DB has updatedAtBlock > incoming block', async () => {
      mockQueryBuilder.execute.mockResolvedValue({ affected: 0 });

      const result = await service.guardedWrite('100', mockDeployment, 3000, { owner: '0xNewOwner' });

      expect(result).toBe(false);
    });

    it('should insert new row when update affects 0 and createFields provided', async () => {
      mockQueryBuilder.execute.mockResolvedValue({ affected: 0 });

      const createFields = { owner: '0xCreator', token0Address: '0xT0', token1Address: '0xT1' };
      const result = await service.guardedWrite('999', mockDeployment, 5000, createFields, createFields);

      expect(result).toBe(true);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          strategyId: '999',
          owner: '0xCreator',
          updatedAtBlock: 5000,
          blockchainType: mockDeployment.blockchainType,
          exchangeId: mockDeployment.exchangeId,
        }),
      );
      expect(repository.save).toHaveBeenCalled();
    });

    it('should retry update on unique constraint violation during insert', async () => {
      // First call: update finds no row
      mockQueryBuilder.execute.mockResolvedValueOnce({ affected: 0 });
      // Insert fails with unique constraint
      repository.save.mockRejectedValueOnce({ code: '23505' });
      // Retry: update succeeds (row was inserted concurrently)
      mockQueryBuilder.execute.mockResolvedValueOnce({ affected: 1 });

      const createFields = { owner: '0xCreator' };
      const result = await service.guardedWrite('999', mockDeployment, 5000, createFields, createFields);

      expect(result).toBe(true);
      expect(mockQueryBuilder.execute).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Event handler tests ─────────────────────────────────────────────

  describe('applyStrategyCreated', () => {
    let mockQueryBuilder: any;

    beforeEach(() => {
      mockQueryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };
      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    });

    it('should create entity with correct owner, tokens, and computed rates', async () => {
      const returnValues = {
        id: '200',
        owner: '0xCreatorAddress',
        token0: '0xToken1Address',
        token1: '0xToken2Address',
        order0: { y: '1000000000000000000', z: '1000000000000000000', A: '0', B: '500' },
        order1: { y: '500000', z: '500000', A: '0', B: '1000' },
      };

      const result = await service.applyStrategyCreated(returnValues, 10000, mockDeployment, mockTokens);

      expect(result).toBe(true);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          strategyId: '200',
          owner: '0xCreatorAddress',
          token0Address: '0xToken1Address',
          token1Address: '0xToken2Address',
          updatedAtBlock: 10000,
        }),
      );
    });

    it('should fetch unknown token on-demand via TokenService and succeed', async () => {
      const tokenService = module.get(TokenService);
      (tokenService.getOrCreateTokenByAddress as jest.Mock).mockResolvedValue({
        address: '0xNewToken',
        symbol: 'NEW',
        name: 'New Token',
        decimals: 18,
      });

      const returnValues = {
        id: '300',
        owner: '0xCreatorAddress',
        token0: '0xNewToken',
        token1: '0xToken2Address',
        order0: { y: '1000000000000000000', z: '1000000000000000000', A: '0', B: '500' },
        order1: { y: '500000', z: '500000', A: '0', B: '1000' },
      };

      const result = await service.applyStrategyCreated(returnValues, 10000, mockDeployment, mockTokens);

      expect(result).toBe(true);
      expect(tokenService.getOrCreateTokenByAddress).toHaveBeenCalledWith('0xNewToken', mockDeployment);
    });

    it('should return false when on-demand token fetch also fails', async () => {
      const tokenService = module.get(TokenService);
      (tokenService.getOrCreateTokenByAddress as jest.Mock).mockRejectedValue(new Error('RPC error'));

      const returnValues = {
        id: '200',
        owner: '0xCreatorAddress',
        token0: '0xUnknownToken',
        token1: '0xToken2Address',
        order0: { y: '1000', z: '1000', A: '0', B: '500' },
        order1: { y: '500', z: '500', A: '0', B: '1000' },
      };

      const result = await service.applyStrategyCreated(returnValues, 10000, mockDeployment, mockTokens);

      expect(result).toBe(false);
    });
  });

  describe('applyStrategyUpdated', () => {
    let mockQueryBuilder: any;

    beforeEach(() => {
      mockQueryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    });

    it('should update orders and rates but NOT include owner in update fields', async () => {
      const returnValues = {
        id: '100',
        token0: '0xToken1Address',
        token1: '0xToken2Address',
        order0: { y: '2000000000000000000', z: '2000000000000000000', A: '0', B: '700' },
        order1: { y: '800000', z: '800000', A: '0', B: '1200' },
        reason: 0,
      };

      const result = await service.applyStrategyUpdated(returnValues, 10001, mockDeployment, mockTokens);

      expect(result).toBe(true);
      const setCall = mockQueryBuilder.set.mock.calls[0][0];
      expect(setCall).not.toHaveProperty('owner');
      expect(setCall.updatedAtBlock).toBe(10001);
      expect(setCall.deleted).toBe(false);
      expect(setCall).toHaveProperty('liquidity0');
      expect(setCall).toHaveProperty('encodedOrder0');
    });
  });

  describe('applyStrategyDeleted', () => {
    let mockQueryBuilder: any;

    beforeEach(() => {
      mockQueryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    });

    it('should set deleted: true with updatedAtBlock', async () => {
      const returnValues = { id: '100' };

      const result = await service.applyStrategyDeleted(returnValues, 10002, mockDeployment);

      expect(result).toBe(true);
      expect(mockQueryBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({ deleted: true, updatedAtBlock: 10002 }),
      );
    });
  });

  describe('applyVoucherTransfer', () => {
    let mockQueryBuilder: any;

    beforeEach(() => {
      mockQueryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    });

    it('should update owner to event.to (new owner)', async () => {
      const returnValues = {
        tokenId: '100',
        from: '0xOwner1',
        to: '0xNewOwner',
      };

      const result = await service.applyVoucherTransfer(returnValues, 10003, mockDeployment);

      expect(result).toBe(true);
      expect(mockQueryBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({ owner: '0xNewOwner', updatedAtBlock: 10003 }),
      );
    });

    it('should use tokenId as strategyId', async () => {
      const returnValues = {
        tokenId: '42',
        from: '0xOld',
        to: '0xNew',
      };

      await service.applyVoucherTransfer(returnValues, 10004, mockDeployment);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('strategyId'),
        expect.objectContaining({ strategyId: '42' }),
      );
    });
  });

  // ─── WSS lifecycle tests ─────────────────────────────────────────────

  describe('stopEventListener', () => {
    it('should clean up subscriptions and provider', () => {
      const mockSub = { unsubscribe: jest.fn() };
      (service as any).wssSubscriptions = [mockSub];
      (service as any).wssProvider = { disconnect: jest.fn() };
      (service as any).wssDeployment = mockDeployment;
      (service as any).wssTokens = mockTokens;

      service.stopEventListener();

      expect(mockSub.unsubscribe).toHaveBeenCalled();
      expect((service as any).wssSubscriptions).toEqual([]);
      expect((service as any).wssProvider).toBeNull();
      expect((service as any).wssDeployment).toBeNull();
      expect((service as any).wssTokens).toBeNull();
    });
  });

  describe('updateTokens', () => {
    it('should update the stored tokens reference', () => {
      const newTokens: TokensByAddress = {
        '0xNewToken': {
          id: 3,
          address: '0xNewToken',
          symbol: 'NEW',
          name: 'New Token',
          decimals: 18,
          blockchainType: BlockchainType.Ethereum,
          exchangeId: ExchangeId.OGEthereum,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      service.updateTokens(newTokens);

      expect((service as any).wssTokens).toBe(newTokens);
    });
  });
});
