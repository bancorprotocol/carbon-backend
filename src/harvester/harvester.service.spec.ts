/* eslint-disable @typescript-eslint/no-var-requires */
import { Test, TestingModule } from '@nestjs/testing';
import { HarvesterService, ContractsNames, ProcessEventsArgs } from './harvester.service';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { BlockService } from '../block/block.service';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { BlockchainType, Deployment, ExchangeId } from '../deployment/deployment.service';
import { BigNumber } from '@ethersproject/bignumber';
import { Token } from '../token/token.entity';
import { Pair } from '../pair/pair.entity';
import { Block } from '../block/block.entity';

// Mock Web3
jest.mock('web3', () => {
  return jest.fn().mockImplementation(() => ({
    eth: {
      Contract: jest.fn(),
      getBlockNumber: jest.fn(),
      getTransaction: jest.fn(),
    },
  }));
});

// Mock p-limit
jest.mock('p-limit', () => ({
  __esModule: true,
  default: jest.fn(() => jest.fn((fn) => fn())),
}));

// Mock utilities
jest.mock('../utilities', () => ({
  sleep: jest.fn().mockResolvedValue(undefined),
}));

describe('HarvesterService', () => {
  let service: HarvesterService;
  let lastProcessedBlockService: jest.Mocked<LastProcessedBlockService>;
  let blockService: jest.Mocked<BlockService>;
  let configService: jest.Mocked<ConfigService>;

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
      [ContractsNames.CarbonController]: {
        address: '0xCarbonControllerAddress',
      },
      [ContractsNames.ERC20]: {
        address: '0xERC20Address',
      },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HarvesterService,
        {
          provide: LastProcessedBlockService,
          useValue: {
            getOrInit: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: BlockService,
          useValue: {
            getBlocksDictionary: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<HarvesterService>(HarvesterService);
    lastProcessedBlockService = module.get(LastProcessedBlockService) as jest.Mocked<LastProcessedBlockService>;
    blockService = module.get(BlockService) as jest.Mocked<BlockService>;
    configService = module.get(ConfigService) as jest.Mocked<ConfigService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should inject dependencies', () => {
      expect(service['lastProcessedBlockService']).toBe(lastProcessedBlockService);
      expect(service['blockService']).toBe(blockService);
      expect(service['configService']).toBe(configService);
    });
  });

  describe('getContract', () => {
    let mockContract: any;
    let mockWeb3: any;

    beforeEach(() => {
      mockContract = {
        getPastEvents: jest.fn(),
        methods: {},
        options: { address: '0xContractAddress' },
      };

      mockWeb3 = {
        eth: {
          Contract: jest.fn().mockReturnValue(mockContract),
        },
      };

      // Mock Web3 constructor
      const Web3 = require('web3');
      Web3.mockImplementation(() => mockWeb3);
    });

    it('should create and return a contract instance with default address', () => {
      const contract = service.getContract(ContractsNames.CarbonController, undefined, undefined, mockDeployment);

      expect(contract).toBeDefined();
    });

    it('should create and return a contract instance with custom address', () => {
      const customAddress = '0xCustomAddress';
      const contract = service.getContract(ContractsNames.CarbonController, undefined, customAddress, mockDeployment);

      expect(contract).toBeDefined();
    });

    it('should throw error when contract address is not found', () => {
      const deploymentWithoutContract = {
        ...mockDeployment,
        contracts: {},
      } as Deployment;

      expect(() => {
        service.getContract(ContractsNames.CarbonController, undefined, undefined, deploymentWithoutContract);
      }).toThrow('Contract CarbonController address not found in deployment configuration');
    });

    it('should handle versioned contracts', () => {
      const contract = service.getContract(ContractsNames.CarbonController, 2, undefined, mockDeployment);

      expect(contract).toBeDefined();
    });
  });

  describe('fetchEventsFromBlockchain', () => {
    let mockContract: any;
    let mockWeb3: any;

    beforeEach(() => {
      mockContract = {
        getPastEvents: jest.fn(),
      };

      mockWeb3 = {
        eth: {
          Contract: jest.fn().mockReturnValue(mockContract),
        },
      };

      const Web3 = require('web3');
      Web3.mockImplementation(() => mockWeb3);
    });

    it('should handle versioned contracts with VERSIONS', async () => {
      // Import VERSIONS and add a test version
      const harvesterModule = require('./harvester.service');
      const originalVersions = { ...harvesterModule.VERSIONS };

      // Add a versioned contract for testing
      harvesterModule.VERSIONS.CarbonController = [
        { terminatesAt: 1500, version: 1 },
        { terminatesAt: 2000, version: 2 },
        { version: 3 },
      ];

      mockContract.getPastEvents.mockResolvedValue([]);

      await service.fetchEventsFromBlockchain(
        ContractsNames.CarbonController,
        'PairCreated',
        1000,
        2500,
        undefined,
        mockDeployment,
      );

      // Should be called once for each version range
      expect(mockContract.getPastEvents).toHaveBeenCalled();

      // Restore original VERSIONS
      harvesterModule.VERSIONS = originalVersions;
    });

    it('should skip version ranges that are beyond toBlock', async () => {
      const harvesterModule = require('./harvester.service');
      const originalVersions = { ...harvesterModule.VERSIONS };

      // Add versions where some ranges are beyond toBlock
      harvesterModule.VERSIONS.CarbonController = [
        { terminatesAt: 1200, version: 1 },
        { terminatesAt: 1800, version: 2 },
        { terminatesAt: 3000, version: 3 }, // This should be skipped as it starts after toBlock
        { version: 4 }, // This too
      ];

      mockContract.getPastEvents.mockResolvedValue([]);

      await service.fetchEventsFromBlockchain(
        ContractsNames.CarbonController,
        'PairCreated',
        1000,
        1500,
        undefined,
        mockDeployment,
      );

      expect(mockContract.getPastEvents).toHaveBeenCalled();

      // Restore original VERSIONS
      harvesterModule.VERSIONS = originalVersions;
    });

    it('should return empty array when fromBlock > toBlock', async () => {
      const result = await service.fetchEventsFromBlockchain(
        ContractsNames.CarbonController,
        'PairCreated',
        2000,
        1000,
        undefined,
        mockDeployment,
      );

      expect(result).toEqual([]);
      expect(mockContract.getPastEvents).not.toHaveBeenCalled();
    });

    it('should fetch events in single batch', async () => {
      const mockEvents = [
        { blockNumber: 1001, transactionHash: '0xabc', logIndex: 0 },
        { blockNumber: 1002, transactionHash: '0xdef', logIndex: 1 },
      ];
      mockContract.getPastEvents.mockResolvedValue(mockEvents);

      const result = await service.fetchEventsFromBlockchain(
        ContractsNames.CarbonController,
        'PairCreated',
        1001,
        1500,
        undefined,
        mockDeployment,
      );

      expect(mockContract.getPastEvents).toHaveBeenCalledWith('PairCreated', {
        fromBlock: 1001,
        toBlock: 1500,
      });
      expect(result).toEqual(mockEvents);
    });

    it('should fetch events in multiple batches', async () => {
      const smallBatchDeployment = {
        ...mockDeployment,
        harvestEventsBatchSize: 100,
      };

      mockContract.getPastEvents.mockResolvedValue([]);

      await service.fetchEventsFromBlockchain(
        ContractsNames.CarbonController,
        'PairCreated',
        1000,
        1250,
        undefined,
        smallBatchDeployment,
      );

      expect(mockContract.getPastEvents).toHaveBeenCalledTimes(3);
      expect(mockContract.getPastEvents).toHaveBeenCalledWith('PairCreated', {
        fromBlock: 1000,
        toBlock: 1099,
      });
      expect(mockContract.getPastEvents).toHaveBeenCalledWith('PairCreated', {
        fromBlock: 1100,
        toBlock: 1199,
      });
      expect(mockContract.getPastEvents).toHaveBeenCalledWith('PairCreated', {
        fromBlock: 1200,
        toBlock: 1250,
      });
    });

    it('should handle custom contract address', async () => {
      const customAddress = '0xCustomContract';
      mockContract.getPastEvents.mockResolvedValue([]);

      await service.fetchEventsFromBlockchain(
        ContractsNames.ERC20,
        'Transfer',
        1000,
        2000,
        customAddress,
        mockDeployment,
      );

      expect(mockContract.getPastEvents).toHaveBeenCalled();
    });

    it('should respect toBlock limit in batches', async () => {
      const smallBatchDeployment = {
        ...mockDeployment,
        harvestEventsBatchSize: 100,
      };

      mockContract.getPastEvents.mockResolvedValue([]);

      await service.fetchEventsFromBlockchain(
        ContractsNames.CarbonController,
        'PairCreated',
        1000,
        1050,
        undefined,
        smallBatchDeployment,
      );

      expect(mockContract.getPastEvents).toHaveBeenCalledTimes(1);
      expect(mockContract.getPastEvents).toHaveBeenCalledWith('PairCreated', {
        fromBlock: 1000,
        toBlock: 1050,
      });
    });
  });

  describe('latestBlock', () => {
    let mockWeb3: any;

    beforeEach(() => {
      mockWeb3 = {
        eth: {
          getBlockNumber: jest.fn(),
        },
      };

      const Web3 = require('web3');
      Web3.mockImplementation(() => mockWeb3);
    });

    it('should return latest block number', async () => {
      mockWeb3.eth.getBlockNumber.mockResolvedValue(12345);

      const result = await service.latestBlock(mockDeployment);

      expect(mockWeb3.eth.getBlockNumber).toHaveBeenCalled();
      expect(result).toBe(12345);
    });

    it('should handle BigInt block numbers', async () => {
      mockWeb3.eth.getBlockNumber.mockResolvedValue(BigInt(99999));

      const result = await service.latestBlock(mockDeployment);

      expect(result).toBe(99999);
    });
  });

  describe('preClear', () => {
    let mockRepository: jest.Mocked<Repository<any>>;
    let mockQueryBuilder: any;

    beforeEach(() => {
      mockQueryBuilder = {
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      };

      mockRepository = {
        createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      } as any;
    });

    it('should delete records after last processed block', async () => {
      await service.preClear(mockRepository, 5000, mockDeployment);

      expect(mockRepository.createQueryBuilder).toHaveBeenCalled();
      expect(mockQueryBuilder.delete).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('block.id > :lastProcessedBlock', {
        lastProcessedBlock: 5000,
      });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('blockchainType = :blockchainType', {
        blockchainType: BlockchainType.Ethereum,
      });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('exchangeId = :exchangeId', {
        exchangeId: ExchangeId.OGEthereum,
      });
      expect(mockQueryBuilder.execute).toHaveBeenCalled();
    });
  });

  describe('processEvents', () => {
    let mockRepository: jest.Mocked<Repository<any>>;
    let processEventsArgs: ProcessEventsArgs;
    let mockContract: any;
    let mockWeb3: any;

    beforeEach(() => {
      mockRepository = {
        create: jest.fn((data) => data),
        save: jest.fn().mockResolvedValue([]),
        createQueryBuilder: jest.fn().mockReturnValue({
          delete: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          execute: jest.fn().mockResolvedValue({}),
        }),
      } as any;

      processEventsArgs = {
        entity: 'TestEntity',
        contractName: ContractsNames.CarbonController,
        eventName: 'PairCreated',
        endBlock: 2000,
        repository: mockRepository,
        deployment: mockDeployment,
      };

      lastProcessedBlockService.getOrInit.mockResolvedValue(1000);
      lastProcessedBlockService.update.mockResolvedValue(undefined);

      mockContract = {
        getPastEvents: jest.fn().mockResolvedValue([]),
      };

      mockWeb3 = {
        eth: {
          Contract: jest.fn().mockReturnValue(mockContract),
          getTransaction: jest.fn(),
        },
      };

      const Web3 = require('web3');
      Web3.mockImplementation(() => mockWeb3);
    });

    it('should process events with minimal configuration', async () => {
      const mockEvents = [
        {
          blockNumber: 1001,
          transactionIndex: 0,
          transactionHash: '0xabc',
          logIndex: 0,
          returnValues: {},
        },
      ];
      mockContract.getPastEvents.mockResolvedValue(mockEvents);

      const result = await service.processEvents(processEventsArgs);

      expect(lastProcessedBlockService.getOrInit).toHaveBeenCalledWith(
        'ethereum-ethereum-TestEntity',
        mockDeployment.startBlock,
      );
      expect(mockRepository.save).toHaveBeenCalled();
      expect(lastProcessedBlockService.update).toHaveBeenCalledWith('ethereum-ethereum-TestEntity', 2000);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should skip pre-clearing when skipPreClearing is true', async () => {
      const args = {
        ...processEventsArgs,
        skipPreClearing: true,
      };

      await service.processEvents(args);

      expect(mockRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should not skip pre-clearing by default', async () => {
      await service.processEvents(processEventsArgs);

      expect(mockRepository.createQueryBuilder).toHaveBeenCalled();
    });

    it('should process string fields', async () => {
      const mockEvents = [
        {
          blockNumber: 1001,
          transactionIndex: 0,
          transactionHash: '0xabc',
          logIndex: 0,
          returnValues: {
            strategyId: 'strategy-123',
            name: 'test-name',
          },
        },
      ];
      mockContract.getPastEvents.mockResolvedValue(mockEvents);

      const args = {
        ...processEventsArgs,
        stringFields: ['strategyId', 'name'],
      };

      await service.processEvents(args);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          strategyId: 'strategy-123',
          name: 'test-name',
        }),
      );
    });

    it('should process number fields', async () => {
      const mockEvents = [
        {
          blockNumber: 1001,
          transactionIndex: 0,
          transactionHash: '0xabc',
          logIndex: 0,
          returnValues: {
            amount: '100',
            count: '5',
          },
        },
      ];
      mockContract.getPastEvents.mockResolvedValue(mockEvents);

      const args = {
        ...processEventsArgs,
        numberFields: ['amount', 'count'],
      };

      await service.processEvents(args);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 100,
          count: 5,
        }),
      );
    });

    it('should process bigNumber fields', async () => {
      const mockEvents = [
        {
          blockNumber: 1001,
          transactionIndex: 0,
          transactionHash: '0xabc',
          logIndex: 0,
          returnValues: {
            largeAmount: '1000000000000000000',
          },
        },
      ];
      mockContract.getPastEvents.mockResolvedValue(mockEvents);

      const args = {
        ...processEventsArgs,
        bigNumberFields: ['largeAmount'],
      };

      await service.processEvents(args);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          largeAmount: BigNumber.from('1000000000000000000').toString(),
        }),
      );
    });

    it('should process boolean fields', async () => {
      const mockEvents = [
        {
          blockNumber: 1001,
          transactionIndex: 0,
          transactionHash: '0xabc',
          logIndex: 0,
          returnValues: {
            isActive: true,
            isEnabled: false,
          },
        },
      ];
      mockContract.getPastEvents.mockResolvedValue(mockEvents);

      const args = {
        ...processEventsArgs,
        booleanFields: ['isActive', 'isEnabled'],
      };

      await service.processEvents(args);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: true,
          isEnabled: false,
        }),
      );
    });

    it('should process constants', async () => {
      const mockEvents = [
        {
          blockNumber: 1001,
          transactionIndex: 0,
          transactionHash: '0xabc',
          logIndex: 0,
          returnValues: {},
        },
      ];
      mockContract.getPastEvents.mockResolvedValue(mockEvents);

      const args = {
        ...processEventsArgs,
        constants: [
          { key: 'type', value: 'TRADE' },
          { key: 'version', value: 2 },
        ],
      };

      await service.processEvents(args);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'TRADE',
          version: 2,
        }),
      );
    });

    it('should extract owner from returnValues', async () => {
      const mockEvents = [
        {
          blockNumber: 1001,
          transactionIndex: 0,
          transactionHash: '0xabc',
          logIndex: 0,
          returnValues: {
            owner: '0xOwnerAddress',
          },
        },
      ];
      mockContract.getPastEvents.mockResolvedValue(mockEvents);

      await service.processEvents(processEventsArgs);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: '0xOwnerAddress',
        }),
      );
    });

    it('should handle token0 and token1 with tokens dictionary', async () => {
      const mockEvents = [
        {
          blockNumber: 1001,
          transactionIndex: 0,
          transactionHash: '0xabc',
          logIndex: 0,
          returnValues: {
            token0: '0xToken0',
            token1: '0xToken1',
          },
        },
      ];
      mockContract.getPastEvents.mockResolvedValue(mockEvents);

      const mockToken0: Token = {
        id: 1,
        address: '0xToken0',
        symbol: 'TKN0',
        name: 'Token 0',
        decimals: 18,
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockToken1: Token = {
        id: 2,
        address: '0xToken1',
        symbol: 'TKN1',
        name: 'Token 1',
        decimals: 6,
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const args = {
        ...processEventsArgs,
        tokens: {
          '0xToken0': mockToken0,
          '0xToken1': mockToken1,
        },
      };

      await service.processEvents(args);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          token0: mockToken0,
          token1: mockToken1,
        }),
      );
    });

    it('should handle token0 and token1 with pairs dictionary', async () => {
      const mockEvents = [
        {
          blockNumber: 1001,
          transactionIndex: 0,
          transactionHash: '0xabc',
          logIndex: 0,
          returnValues: {
            token0: '0xToken0',
            token1: '0xToken1',
          },
        },
      ];
      mockContract.getPastEvents.mockResolvedValue(mockEvents);

      const mockToken0: Token = {
        id: 1,
        address: '0xToken0',
        symbol: 'TKN0',
        name: 'Token 0',
        decimals: 18,
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockToken1: Token = {
        id: 2,
        address: '0xToken1',
        symbol: 'TKN1',
        name: 'Token 1',
        decimals: 6,
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockBlock: Block = {
        id: 1001,
        blockchainType: BlockchainType.Ethereum,
        timestamp: new Date(1234567890 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockPair: Pair = {
        id: 1,
        token0: mockToken0,
        token1: mockToken1,
        block: mockBlock,
        name: 'TKN0-TKN1',
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        createdAt: new Date(),
        updatedAt: new Date(),
        tokensTradedEvents: [],
      };

      const args = {
        ...processEventsArgs,
        pairsDictionary: {
          '0xToken0': {
            '0xToken1': mockPair,
          },
        },
      };

      await service.processEvents(args);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          pair: mockPair,
        }),
      );
    });

    it('should tag timestamp from block when tagTimestampFromBlock is true', async () => {
      const mockEvents = [
        {
          blockNumber: 1001,
          transactionIndex: 0,
          transactionHash: '0xabc',
          logIndex: 0,
          returnValues: {},
        },
      ];
      mockContract.getPastEvents.mockResolvedValue(mockEvents);
      const mockTimestamp = new Date(1234567890 * 1000);
      blockService.getBlocksDictionary.mockResolvedValue({
        1001: mockTimestamp,
      });

      const args = {
        ...processEventsArgs,
        tagTimestampFromBlock: true,
      };

      await service.processEvents(args);

      expect(blockService.getBlocksDictionary).toHaveBeenCalledWith([1001], mockDeployment);
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: mockTimestamp,
        }),
      );
    });

    it('should process date fields', async () => {
      const mockEvents = [
        {
          blockNumber: 1001,
          transactionIndex: 0,
          transactionHash: '0xabc',
          logIndex: 0,
          returnValues: {
            startTime: 1609459200,
            endTime: 1612137600,
          },
        },
      ];
      mockContract.getPastEvents.mockResolvedValue(mockEvents);

      const args = {
        ...processEventsArgs,
        dateFields: ['startTime', 'endTime'],
      };

      await service.processEvents(args);

      const savedData = mockRepository.create.mock.calls[0][0];
      expect(savedData.startTime).toBeDefined();
      expect(savedData.endTime).toBeDefined();
    });

    it('should process source map with non-relation fields', async () => {
      const mockEvents = [
        {
          blockNumber: 1001,
          transactionIndex: 0,
          transactionHash: '0xabc',
          logIndex: 0,
          returnValues: {
            srcField: 'sourceValue',
          },
        },
      ];
      mockContract.getPastEvents.mockResolvedValue(mockEvents);

      const args = {
        ...processEventsArgs,
        sourceMap: [{ key: 'destField', eventKey: 'srcField', isRelation: false }],
      };

      await service.processEvents(args);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          destField: 'sourceValue',
        }),
      );
    });

    it('should process source map with relation fields', async () => {
      const mockEvents = [
        {
          blockNumber: 1001,
          transactionIndex: 0,
          transactionHash: '0xabc',
          logIndex: 0,
          returnValues: {
            strategyId: '123',
          },
        },
      ];
      mockContract.getPastEvents.mockResolvedValue(mockEvents);

      const args = {
        ...processEventsArgs,
        sourceMap: [{ key: 'strategy', eventKey: 'strategyId', isRelation: true }],
      };

      await service.processEvents(args);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          strategy: { id: 123 },
        }),
      );
    });

    it('should fetch caller ID when fetchCallerId is true', async () => {
      const mockEvents = [
        {
          blockNumber: 1001,
          transactionIndex: 0,
          transactionHash: '0xabc',
          logIndex: 0,
          returnValues: {},
        },
      ];
      mockContract.getPastEvents.mockResolvedValue(mockEvents);
      mockWeb3.eth.getTransaction.mockResolvedValue({
        from: '0xCallerAddress',
      });

      const args = {
        ...processEventsArgs,
        fetchCallerId: true,
      };

      await service.processEvents(args);

      expect(mockWeb3.eth.getTransaction).toHaveBeenCalledWith('0xabc');
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          callerId: '0xCallerAddress',
        }),
      );
    });

    it('should execute custom functions', async () => {
      const mockEvents = [
        {
          blockNumber: 1001,
          transactionIndex: 0,
          transactionHash: '0xabc',
          logIndex: 0,
          returnValues: {},
        },
      ];
      mockContract.getPastEvents.mockResolvedValue(mockEvents);

      const customFn = jest.fn(async ({ event }) => ({
        ...event,
        customField: 'customValue',
      }));

      const args = {
        ...processEventsArgs,
        customFns: [customFn],
      };

      await service.processEvents(args);

      expect(customFn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.any(Object),
          rawEvent: expect.any(Object),
          configService: configService,
          endBlock: 2000,
        }),
      );
    });

    it('should skip last processed block update when skipLastProcessedBlockUpdate is true', async () => {
      const args = {
        ...processEventsArgs,
        skipLastProcessedBlockUpdate: true,
      };

      await service.processEvents(args);

      expect(lastProcessedBlockService.update).not.toHaveBeenCalled();
    });

    it('should batch save events in chunks of 1000', async () => {
      const mockEvents = Array.from({ length: 2500 }, (_, i) => ({
        blockNumber: 1001 + i,
        transactionIndex: 0,
        transactionHash: `0xabc${i}`,
        logIndex: i,
        returnValues: {},
      }));
      mockContract.getPastEvents.mockResolvedValue(mockEvents);

      await service.processEvents(processEventsArgs);

      expect(mockRepository.save).toHaveBeenCalledTimes(3);
      expect(mockRepository.save).toHaveBeenNthCalledWith(1, expect.any(Array));
    });

    it('should handle multiple range iterations', async () => {
      const smallBatchDeployment = {
        ...mockDeployment,
        harvestEventsBatchSize: 100,
        harvestConcurrency: 2,
      };

      lastProcessedBlockService.getOrInit.mockResolvedValue(1000);
      mockContract.getPastEvents.mockResolvedValue([]);

      const args = {
        ...processEventsArgs,
        endBlock: 1500,
        deployment: smallBatchDeployment,
      };

      await service.processEvents(args);

      expect(lastProcessedBlockService.update).toHaveBeenCalledWith('ethereum-ethereum-TestEntity', 1201);
      expect(lastProcessedBlockService.update).toHaveBeenCalledWith('ethereum-ethereum-TestEntity', 1402);
      expect(lastProcessedBlockService.update).toHaveBeenCalledWith('ethereum-ethereum-TestEntity', 1500);
    });
  });

  describe('stringsWithMulticall', () => {
    it('should delegate to stringsWithMulticallV2 for Ethereum', async () => {
      const spy = jest.spyOn(service, 'stringsWithMulticallV2').mockResolvedValue(['ETH', 'BTC']);

      const result = await service.stringsWithMulticall(['0xAddr1', '0xAddr2'], {}, 'symbol', mockDeployment);

      expect(spy).toHaveBeenCalledWith(['0xAddr1', '0xAddr2'], {}, 'symbol', mockDeployment);
      expect(result).toEqual(['ETH', 'BTC']);
    });

    it('should delegate to stringsWithMulticallV3 for non-Ethereum', async () => {
      const seiDeployment = {
        ...mockDeployment,
        blockchainType: BlockchainType.Sei,
      };
      const spy = jest.spyOn(service, 'stringsWithMulticallV3').mockResolvedValue(['SEI', 'USDC']);

      const result = await service.stringsWithMulticall(['0xAddr1', '0xAddr2'], {}, 'symbol', seiDeployment);

      expect(spy).toHaveBeenCalledWith(['0xAddr1', '0xAddr2'], {}, 'symbol', seiDeployment);
      expect(result).toEqual(['SEI', 'USDC']);
    });
  });

  describe('integersWithMulticall', () => {
    it('should delegate to integersWithMulticallEthereum for Ethereum', async () => {
      const spy = jest.spyOn(service, 'integersWithMulticallEthereum').mockResolvedValue([18, 6]);

      const result = await service.integersWithMulticall(['0xAddr1', '0xAddr2'], {}, 'decimals', mockDeployment);

      expect(spy).toHaveBeenCalledWith(['0xAddr1', '0xAddr2'], {}, 'decimals', mockDeployment);
      expect(result).toEqual([18, 6]);
    });

    it('should delegate to integersWithMulticallSei for non-Ethereum', async () => {
      const seiDeployment = {
        ...mockDeployment,
        blockchainType: BlockchainType.Sei,
      };
      const spy = jest.spyOn(service, 'integersWithMulticallSei').mockResolvedValue([18, 6]);

      const result = await service.integersWithMulticall(['0xAddr1', '0xAddr2'], {}, 'decimals', seiDeployment);

      expect(spy).toHaveBeenCalledWith(['0xAddr1', '0xAddr2'], {}, 'decimals', seiDeployment);
      expect(result).toEqual([18, 6]);
    });
  });

  describe('stringsWithMulticallV2', () => {
    it('should convert hex data to strings', async () => {
      const mockData = [
        { data: '0x455448', success: true },
        { data: '0x425443', success: true },
      ];
      jest.spyOn(service, 'withMulticallEthereum').mockResolvedValue(mockData);

      const result = await service.stringsWithMulticallV2(['0xAddr1', '0xAddr2'], {}, 'symbol', mockDeployment);

      expect(result).toHaveLength(2);
      expect(typeof result[0]).toBe('string');
    });

    it('should return empty string for failed multicall results', async () => {
      const mockData = [
        { data: '0x455448', success: true },
        { data: '0x', success: false }, // Failed call
        { data: '0x555344', success: true },
      ];
      jest.spyOn(service, 'withMulticallEthereum').mockResolvedValue(mockData);

      const result = await service.stringsWithMulticallV2(
        ['0xValidToken', '0xInvalidContract', '0xAnotherValidToken'],
        {},
        'symbol',
        mockDeployment,
      );

      expect(result).toHaveLength(3);
      expect(result[0]).toBeTruthy(); // Valid symbol
      expect(result[1]).toBe(''); // Failed call returns empty string
      expect(result[2]).toBeTruthy(); // Valid symbol
    });

    it('should handle mixed success and failure results', async () => {
      const mockData = [
        { data: '0x544b4e31', success: true }, // 'TKN1'
        { data: '0x', success: false },
        { data: '0x544b4e32', success: true }, // 'TKN2'
        { data: '0x', success: false },
      ];
      jest.spyOn(service, 'withMulticallEthereum').mockResolvedValue(mockData);

      const result = await service.stringsWithMulticallV2(
        ['0xToken1', '0xContract1', '0xToken2', '0xContract2'],
        {},
        'symbol',
        mockDeployment,
      );

      expect(result).toHaveLength(4);
      expect(result[0]).toBeTruthy();
      expect(result[1]).toBe('');
      expect(result[2]).toBeTruthy();
      expect(result[3]).toBe('');
    });
  });

  describe('integersWithMulticallEthereum', () => {
    it('should convert hex data to integers', async () => {
      const mockData = [
        { data: '0x12', success: true },
        { data: '0x06', success: true },
      ];
      jest.spyOn(service, 'withMulticallEthereum').mockResolvedValue(mockData);

      const result = await service.integersWithMulticallEthereum(
        ['0xAddr1', '0xAddr2'],
        {},
        'decimals',
        mockDeployment,
      );

      expect(result).toEqual([18, 6]);
    });

    it('should return NaN for failed multicall results', async () => {
      const mockData = [
        { data: '0x12', success: true },
        { data: '0x', success: false }, // Failed call
        { data: '0x06', success: true },
      ];
      jest.spyOn(service, 'withMulticallEthereum').mockResolvedValue(mockData);

      const result = await service.integersWithMulticallEthereum(
        ['0xValidToken', '0xInvalidContract', '0xAnotherValidToken'],
        {},
        'decimals',
        mockDeployment,
      );

      expect(result).toEqual([18, NaN, 6]);
      expect(Number.isNaN(result[1])).toBe(true);
    });

    it('should handle all failed calls', async () => {
      const mockData = [
        { data: '0x', success: false },
        { data: '0x', success: false },
      ];
      jest.spyOn(service, 'withMulticallEthereum').mockResolvedValue(mockData);

      const result = await service.integersWithMulticallEthereum(
        ['0xNonERC20Contract1', '0xNonERC20Contract2'],
        {},
        'decimals',
        mockDeployment,
      );

      expect(result).toEqual([NaN, NaN]);
      expect(Number.isNaN(result[0])).toBe(true);
      expect(Number.isNaN(result[1])).toBe(true);
    });
  });

  describe('stringsWithMulticallV3', () => {
    it('should convert hex strings to readable strings', async () => {
      const mockData = ['0x455448', '0x425443'];
      jest.spyOn(service, 'withMulticallSei').mockResolvedValue(mockData);

      const result = await service.stringsWithMulticallV3(['0xAddr1', '0xAddr2'], {}, 'symbol', mockDeployment);

      expect(result).toHaveLength(2);
      expect(typeof result[0]).toBe('string');
    });

    it('should return empty string for null values from failed calls', async () => {
      const mockData = ['0x455448', null, '0x555344']; // null indicates failed call
      jest.spyOn(service, 'withMulticallSei').mockResolvedValue(mockData);

      const result = await service.stringsWithMulticallV3(
        ['0xValidToken', '0xInvalidContract', '0xAnotherValidToken'],
        {},
        'symbol',
        mockDeployment,
      );

      expect(result).toHaveLength(3);
      expect(result[0]).toBeTruthy(); // Valid symbol
      expect(result[1]).toBe(''); // Failed call returns empty string
      expect(result[2]).toBeTruthy(); // Valid symbol
    });

    it('should handle all null values', async () => {
      const mockData = [null, null];
      jest.spyOn(service, 'withMulticallSei').mockResolvedValue(mockData);

      const result = await service.stringsWithMulticallV3(['0xContract1', '0xContract2'], {}, 'symbol', mockDeployment);

      expect(result).toEqual(['', '']);
    });
  });

  describe('integersWithMulticallSei', () => {
    it('should convert hex strings to integers', async () => {
      const mockData = ['0x12', '0x06'];
      jest.spyOn(service, 'withMulticallSei').mockResolvedValue(mockData);

      const result = await service.integersWithMulticallSei(['0xAddr1', '0xAddr2'], {}, 'decimals', mockDeployment);

      expect(result).toEqual([18, 6]);
    });

    it('should return NaN for null values from failed calls', async () => {
      const mockData = ['0x12', null, '0x06']; // null indicates failed call
      jest.spyOn(service, 'withMulticallSei').mockResolvedValue(mockData);

      const result = await service.integersWithMulticallSei(
        ['0xValidToken', '0xInvalidContract', '0xAnotherValidToken'],
        {},
        'decimals',
        mockDeployment,
      );

      expect(result).toEqual([18, NaN, 6]);
      expect(Number.isNaN(result[1])).toBe(true);
    });

    it('should handle all null values', async () => {
      const mockData = [null, null, null];
      jest.spyOn(service, 'withMulticallSei').mockResolvedValue(mockData);

      const result = await service.integersWithMulticallSei(
        ['0xContract1', '0xContract2', '0xContract3'],
        {},
        'decimals',
        mockDeployment,
      );

      expect(result).toEqual([NaN, NaN, NaN]);
      result.forEach((val) => expect(Number.isNaN(val)).toBe(true));
    });
  });

  describe('withMulticallEthereum', () => {
    let mockContract: any;
    let mockWeb3: any;

    beforeEach(() => {
      mockContract = {
        methods: {
          decimals: jest.fn(),
          aggregate: jest.fn(),
        },
        options: { address: '0xAddr' },
      };

      mockWeb3 = {
        eth: {
          Contract: jest.fn().mockReturnValue(mockContract),
        },
      };

      const Web3 = require('web3');
      Web3.mockImplementation(() => mockWeb3);
    });

    it('should make multicall aggregate call', async () => {
      const mockReturnData = [{ data: '0x12' }, { data: '0x06' }];
      mockContract.methods.aggregate.mockReturnValue({
        call: jest.fn().mockResolvedValue({ returnData: mockReturnData }),
      });
      mockContract.methods.decimals = jest.fn().mockReturnValue({
        encodeABI: jest.fn().mockReturnValue('0xencodedABI'),
      });

      const mockAbi = { name: 'decimals', type: 'function' };

      const result = await service.withMulticallEthereum(['0xAddr1', '0xAddr2'], mockAbi, 'decimals', mockDeployment);

      expect(result).toEqual(mockReturnData);
    });

    it('should handle multiple batches', async () => {
      const addresses = Array.from({ length: 2500 }, (_, i) => `0xAddr${i}`);
      const mockReturnData = Array.from({ length: 1000 }, (_, i) => ({ data: `0x${i}` }));

      mockContract.methods.decimals = jest.fn().mockReturnValue({
        encodeABI: jest.fn().mockReturnValue('0xencodedABI'),
      });
      mockContract.methods.aggregate = jest.fn().mockReturnValue({
        call: jest.fn().mockResolvedValue({ returnData: mockReturnData }),
      });

      const result = await service.withMulticallEthereum(addresses, {}, 'decimals', mockDeployment);

      expect(mockContract.methods.aggregate).toHaveBeenCalledTimes(3);
      expect(result).toHaveLength(3000);
    });

    it('should handle empty batches', async () => {
      const result = await service.withMulticallEthereum([], {}, 'decimals', mockDeployment);

      expect(result).toEqual([]);
    });
  });

  describe('withMulticallSei', () => {
    let mockContract: any;
    let mockWeb3: any;

    beforeEach(() => {
      mockContract = {
        methods: {
          decimals: jest.fn(),
          aggregate: jest.fn(),
        },
        options: { address: '0xAddr' },
      };

      mockWeb3 = {
        eth: {
          Contract: jest.fn().mockReturnValue(mockContract),
        },
      };

      const Web3 = require('web3');
      Web3.mockImplementation(() => mockWeb3);
    });

    it('should make multicall aggregate call for Sei', async () => {
      const mockReturnData = ['0x12', '0x06'];
      mockContract.methods.aggregate.mockReturnValue({
        call: jest.fn().mockResolvedValue({ returnData: mockReturnData }),
      });
      mockContract.methods.decimals = jest.fn().mockReturnValue({
        encodeABI: jest.fn().mockReturnValue('0xencodedABI'),
      });

      const mockAbi = { name: 'decimals', type: 'function' };
      const seiDeployment = {
        ...mockDeployment,
        blockchainType: BlockchainType.Sei,
      };

      const result = await service.withMulticallSei(['0xAddr1', '0xAddr2'], mockAbi, 'decimals', seiDeployment);

      expect(result).toEqual(mockReturnData);
    });

    it('should handle multiple batches for Sei', async () => {
      const addresses = Array.from({ length: 2500 }, (_, i) => `0xAddr${i}`);
      const mockReturnData = Array.from({ length: 1000 }, (_, i) => `0x${i}`);

      mockContract.methods.decimals = jest.fn().mockReturnValue({
        encodeABI: jest.fn().mockReturnValue('0xencodedABI'),
      });
      mockContract.methods.aggregate = jest.fn().mockReturnValue({
        call: jest.fn().mockResolvedValue({ returnData: mockReturnData }),
      });

      const seiDeployment = {
        ...mockDeployment,
        blockchainType: BlockchainType.Sei,
      };

      const result = await service.withMulticallSei(addresses, {}, 'decimals', seiDeployment);

      expect(mockContract.methods.aggregate).toHaveBeenCalledTimes(3);
      expect(result).toHaveLength(3000);
    });

    it('should handle empty batches for Sei', async () => {
      const seiDeployment = {
        ...mockDeployment,
        blockchainType: BlockchainType.Sei,
      };

      const result = await service.withMulticallSei([], {}, 'decimals', seiDeployment);

      expect(result).toEqual([]);
    });

    it('should fallback to individual calls when multicall fails for Sei', async () => {
      const addresses = ['0xValidToken', '0xInvalidContract', '0xAnotherValidToken'];

      // Mock aggregate to throw an error (simulating multicall failure)
      mockContract.methods.aggregate.mockReturnValue({
        call: jest.fn().mockRejectedValue(new Error('Multicall3: call failed')),
      });

      // Mock decimals method for individual calls
      const decimalsMethod = jest.fn();
      mockContract.methods.decimals = jest.fn().mockReturnValue({
        encodeABI: jest.fn().mockReturnValue('0xencodedABI'),
        call: decimalsMethod,
      });

      // First call succeeds, second fails, third succeeds
      decimalsMethod
        .mockResolvedValueOnce('18')
        .mockRejectedValueOnce(new Error('Invalid contract'))
        .mockResolvedValueOnce('6');

      const seiDeployment = {
        ...mockDeployment,
        blockchainType: BlockchainType.Sei,
      };

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await service.withMulticallSei(addresses, {}, 'decimals', seiDeployment);

      // Should return successful results and null for failed calls
      expect(result).toEqual(['18', null, '6']);

      // Verify console.warn was called
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Multicall failed for batch of 3 addresses'));

      consoleWarnSpy.mockRestore();
    });

    it('should handle all failed individual calls when multicall fails for Sei', async () => {
      const addresses = ['0xNonERC20Contract1', '0xNonERC20Contract2'];

      // Mock aggregate to throw an error
      mockContract.methods.aggregate.mockReturnValue({
        call: jest.fn().mockRejectedValue(new Error('Multicall3: call failed')),
      });

      // Mock decimals method to fail for all individual calls
      const decimalsMethod = jest.fn().mockRejectedValue(new Error('Invalid contract'));
      mockContract.methods.decimals = jest.fn().mockReturnValue({
        encodeABI: jest.fn().mockReturnValue('0xencodedABI'),
        call: decimalsMethod,
      });

      const seiDeployment = {
        ...mockDeployment,
        blockchainType: BlockchainType.Sei,
      };

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await service.withMulticallSei(addresses, {}, 'decimals', seiDeployment);

      // Should return null for all failed calls
      expect(result).toEqual([null, null]);

      consoleWarnSpy.mockRestore();
    });

    it('should successfully complete multicall without fallback when all calls succeed for Sei', async () => {
      const addresses = ['0xToken1', '0xToken2', '0xToken3'];
      const mockReturnData = ['0x12', '0x06', '0x08'];

      mockContract.methods.aggregate.mockReturnValue({
        call: jest.fn().mockResolvedValue({ returnData: mockReturnData }),
      });
      mockContract.methods.decimals = jest.fn().mockReturnValue({
        encodeABI: jest.fn().mockReturnValue('0xencodedABI'),
      });

      const seiDeployment = {
        ...mockDeployment,
        blockchainType: BlockchainType.Sei,
      };

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await service.withMulticallSei(addresses, {}, 'decimals', seiDeployment);

      // Should return all results without fallback
      expect(result).toEqual(mockReturnData);

      // console.warn should not be called (no fallback needed)
      expect(consoleWarnSpy).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });

  describe('processEvents with missing pairs/tokens (invalid ERC20 handling)', () => {
    let mockRepository: jest.Mocked<Repository<any>>;
    let processEventsArgs: ProcessEventsArgs;
    let mockContract: any;
    let mockWeb3: any;

    beforeEach(() => {
      mockRepository = {
        create: jest.fn((data) => data),
        save: jest.fn().mockResolvedValue([]),
        createQueryBuilder: jest.fn().mockReturnValue({
          delete: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          execute: jest.fn().mockResolvedValue({}),
        }),
      } as any;

      lastProcessedBlockService.getOrInit.mockResolvedValue(1000);
      lastProcessedBlockService.update.mockResolvedValue(undefined);

      mockContract = {
        getPastEvents: jest.fn().mockResolvedValue([]),
      };

      mockWeb3 = {
        eth: {
          Contract: jest.fn().mockReturnValue(mockContract),
          getTransaction: jest.fn(),
        },
      };

      const Web3 = require('web3');
      Web3.mockImplementation(() => mockWeb3);
    });

    it('should not crash when pair is missing due to invalid token', async () => {
      const mockToken0: Token = {
        id: 1,
        address: '0xtoken0',
        symbol: 'TKN0',
        name: 'Token 0',
        decimals: 18,
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockToken1: Token = {
        id: 2,
        address: '0xtoken1',
        symbol: 'TKN1',
        name: 'Token 1',
        decimals: 18,
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockPair: Partial<Pair> = {
        id: 1,
        token0: mockToken0,
        token1: mockToken1,
        name: 'TKN0_TKN1',
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        block: {} as Block,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Simulate scenario where one pair exists but another doesn't
      // (e.g., because one had invalid tokens with no decimals)
      const pairsDictionary = {
        '0xtoken0': {
          '0xtoken1': mockPair as Pair,
        },
        // '0xtoken2' is missing - pair wasn't created due to invalid token
      };

      const tokens = {
        '0xtoken0': mockToken0,
        '0xtoken1': mockToken1,
        // '0xtoken2' is missing - invalid token was skipped
      };

      const mockEvents = [
        // Valid event with existing pair
        {
          blockNumber: 1001,
          transactionIndex: 0,
          transactionHash: '0xabc',
          logIndex: 0,
          returnValues: {
            strategyId: '1',
            token0: '0xtoken0',
            token1: '0xtoken1',
            owner: '0xowner1',
          },
        },
        // Event with missing pair (should not crash)
        {
          blockNumber: 1002,
          transactionIndex: 1,
          transactionHash: '0xdef',
          logIndex: 0,
          returnValues: {
            strategyId: '2',
            token0: '0xtoken2', // This token doesn't exist
            token1: '0xtoken1',
            owner: '0xowner2',
          },
        },
      ];

      mockContract.getPastEvents.mockResolvedValue(mockEvents);

      processEventsArgs = {
        entity: 'strategy-created-events',
        contractName: ContractsNames.CarbonController,
        eventName: 'StrategyCreated',
        endBlock: 2000,
        repository: mockRepository,
        deployment: mockDeployment,
        pairsDictionary,
        tokens,
        stringFields: ['strategyId'],
      };

      // This should not throw an error
      await expect(service.processEvents(processEventsArgs)).resolves.not.toThrow();

      // Verify both events were processed (even though one has missing pair)
      expect(mockRepository.save).toHaveBeenCalled();
      const savedEvents = mockRepository.save.mock.calls[0][0];
      expect(savedEvents).toHaveLength(2);

      // First event should have pair assigned
      expect(savedEvents[0].pair).toEqual(mockPair);
      expect(savedEvents[0].token0).toBe(mockToken0);
      expect(savedEvents[0].token1).toBe(mockToken1);

      // Second event should have undefined pair (not crash)
      expect(savedEvents[1].pair).toBeUndefined();
      expect(savedEvents[1].token0).toBeUndefined();
      expect(savedEvents[1].token1).toBe(mockToken1);
    });

    it('should not crash when both tokens in pair are missing', async () => {
      const pairsDictionary = {
        // Empty - no pairs created
      };

      const tokens = {
        // Empty - no tokens created
      };

      const mockEvents = [
        {
          blockNumber: 1001,
          transactionIndex: 0,
          transactionHash: '0xabc',
          logIndex: 0,
          returnValues: {
            strategyId: '1',
            token0: '0xmissingtoken0',
            token1: '0xmissingtoken1',
            owner: '0xowner1',
          },
        },
      ];

      mockContract.getPastEvents.mockResolvedValue(mockEvents);

      processEventsArgs = {
        entity: 'strategy-created-events',
        contractName: ContractsNames.CarbonController,
        eventName: 'StrategyCreated',
        endBlock: 2000,
        repository: mockRepository,
        deployment: mockDeployment,
        pairsDictionary,
        tokens,
        stringFields: ['strategyId'],
      };

      // This should not throw an error
      await expect(service.processEvents(processEventsArgs)).resolves.not.toThrow();

      // Event should be saved with undefined pair and tokens
      expect(mockRepository.save).toHaveBeenCalled();
      const savedEvents = mockRepository.save.mock.calls[0][0];
      expect(savedEvents).toHaveLength(1);
      expect(savedEvents[0].pair).toBeUndefined();
      expect(savedEvents[0].token0).toBeUndefined();
      expect(savedEvents[0].token1).toBeUndefined();
    });

    it('should handle partial pair dictionary (only one direction exists)', async () => {
      const mockToken0: Token = {
        id: 1,
        address: '0xtoken0',
        symbol: 'TKN0',
        name: 'Token 0',
        decimals: 18,
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockToken1: Token = {
        id: 2,
        address: '0xtoken1',
        symbol: 'TKN1',
        name: 'Token 1',
        decimals: 18,
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Partial dictionary - has token0 entry but missing token1 sub-entry
      const pairsDictionary = {
        '0xtoken0': {
          // Missing '0xtoken1' entry
        },
      };

      const tokens = {
        '0xtoken0': mockToken0,
        '0xtoken1': mockToken1,
      };

      const mockEvents = [
        {
          blockNumber: 1001,
          transactionIndex: 0,
          transactionHash: '0xabc',
          logIndex: 0,
          returnValues: {
            strategyId: '1',
            token0: '0xtoken0',
            token1: '0xtoken1',
            owner: '0xowner1',
          },
        },
      ];

      mockContract.getPastEvents.mockResolvedValue(mockEvents);

      processEventsArgs = {
        entity: 'strategy-created-events',
        contractName: ContractsNames.CarbonController,
        eventName: 'StrategyCreated',
        endBlock: 2000,
        repository: mockRepository,
        deployment: mockDeployment,
        pairsDictionary,
        tokens,
        stringFields: ['strategyId'],
      };

      // This should not throw an error
      await expect(service.processEvents(processEventsArgs)).resolves.not.toThrow();

      // Event should be saved with undefined pair but valid tokens
      expect(mockRepository.save).toHaveBeenCalled();
      const savedEvents = mockRepository.save.mock.calls[0][0];
      expect(savedEvents).toHaveLength(1);
      expect(savedEvents[0].pair).toBeUndefined();
      expect(savedEvents[0].token0).toBe(mockToken0);
      expect(savedEvents[0].token1).toBe(mockToken1);
    });
  });

  describe('genericMulticall', () => {
    let mockMulticallContract: any;
    let mockWeb3: any;

    const ethereumDeployment: Deployment = {
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
        [ContractsNames.CarbonController]: {
          address: '0xCarbonControllerAddress',
        },
      },
    };

    const seiDeployment: Deployment = {
      ...ethereumDeployment,
      blockchainType: BlockchainType.Sei,
      exchangeId: ExchangeId.OGSei,
    };

    beforeEach(() => {
      mockMulticallContract = {
        methods: {
          aggregate: jest.fn().mockReturnValue({
            call: jest.fn(),
          }),
        },
      };

      mockWeb3 = {
        eth: {
          Contract: jest.fn().mockReturnValue(mockMulticallContract),
          call: jest.fn(),
          getBlockNumber: jest.fn().mockResolvedValue(12345678n),
        },
      };

      const Web3 = require('web3');
      Web3.mockImplementation(() => mockWeb3);
    });

    it('should route to Ethereum multicall for Ethereum deployment', async () => {
      mockMulticallContract.methods.aggregate().call.mockResolvedValue({
        returnData: [
          { success: true, data: '0x123' },
          { success: true, data: '0x456' },
        ],
      });

      const encodedCalls = ['0xabc', '0xdef'];
      const result = await service.genericMulticall('0xContractAddress', encodedCalls, ethereumDeployment);

      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({ success: true, data: '0x123' });
      expect(result.results[1]).toEqual({ success: true, data: '0x456' });
      expect(result.blockNumber).toBe(12345678);
    });

    it('should route to Sei multicall for Sei deployment', async () => {
      mockMulticallContract.methods.aggregate().call.mockResolvedValue({
        returnData: ['0x123', '0x456'],
      });

      const encodedCalls = ['0xabc', '0xdef'];
      const result = await service.genericMulticall('0xContractAddress', encodedCalls, seiDeployment);

      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({ success: true, data: '0x123' });
      expect(result.results[1]).toEqual({ success: true, data: '0x456' });
      expect(result.blockNumber).toBe(12345678);
    });

    it('should handle Ethereum multicall failure gracefully', async () => {
      mockMulticallContract.methods.aggregate().call.mockRejectedValue(new Error('RPC error'));

      const encodedCalls = ['0xabc', '0xdef'];
      const result = await service.genericMulticall('0xContractAddress', encodedCalls, ethereumDeployment);

      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({ success: false, data: '0x' });
      expect(result.results[1]).toEqual({ success: false, data: '0x' });
      expect(result.blockNumber).toBe(12345678);
    });

    it('should fallback to individual calls on Sei when multicall fails', async () => {
      mockMulticallContract.methods.aggregate().call.mockRejectedValue(new Error('Multicall failed'));
      mockWeb3.eth.call.mockResolvedValueOnce('0x111').mockResolvedValueOnce('0x222');

      const encodedCalls = ['0xabc', '0xdef'];
      const result = await service.genericMulticall('0xContractAddress', encodedCalls, seiDeployment);

      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({ success: true, data: '0x111' });
      expect(result.results[1]).toEqual({ success: true, data: '0x222' });
      expect(result.blockNumber).toBe(12345678);
      expect(mockWeb3.eth.call).toHaveBeenCalledTimes(2);
    });

    it('should handle individual call failures on Sei fallback', async () => {
      mockMulticallContract.methods.aggregate().call.mockRejectedValue(new Error('Multicall failed'));
      mockWeb3.eth.call.mockResolvedValueOnce('0x111').mockRejectedValueOnce(new Error('Individual call failed'));

      const encodedCalls = ['0xabc', '0xdef'];
      const result = await service.genericMulticall('0xContractAddress', encodedCalls, seiDeployment);

      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({ success: true, data: '0x111' });
      expect(result.results[1]).toEqual({ success: false, data: '0x' });
      expect(result.blockNumber).toBe(12345678);
    });

    it('should return empty results array when no calls provided', async () => {
      const result = await service.genericMulticall('0xContractAddress', [], ethereumDeployment);

      expect(result.results).toEqual([]);
      expect(result.blockNumber).toBe(12345678);
      expect(mockMulticallContract.methods.aggregate).not.toHaveBeenCalled();
    });

    it('should handle Ethereum returnData without success field', async () => {
      // Some multicall implementations return just the data string
      mockMulticallContract.methods.aggregate().call.mockResolvedValue({
        returnData: ['0x123', '0x456'],
      });

      const encodedCalls = ['0xabc', '0xdef'];
      const result = await service.genericMulticall('0xContractAddress', encodedCalls, ethereumDeployment);

      expect(result.results).toHaveLength(2);
      // Should default success to true when not explicitly set
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(true);
      expect(result.blockNumber).toBe(12345678);
    });

    it('should batch large number of calls', async () => {
      // Create 600 calls (should be split into 2 batches of 500 and 100)
      const encodedCalls = Array.from({ length: 600 }, (_, i) => `0x${i.toString(16)}`);

      mockMulticallContract.methods
        .aggregate()
        .call.mockResolvedValueOnce({
          returnData: Array.from({ length: 500 }, () => ({ success: true, data: '0xbatch1' })),
        })
        .mockResolvedValueOnce({
          returnData: Array.from({ length: 100 }, () => ({ success: true, data: '0xbatch2' })),
        });

      const result = await service.genericMulticall('0xContractAddress', encodedCalls, ethereumDeployment);

      expect(result.results).toHaveLength(600);
      expect(result.blockNumber).toBe(12345678);
      expect(mockMulticallContract.methods.aggregate().call).toHaveBeenCalledTimes(2);
    });

    it('should use the same block number for all batches ensuring consistent state', async () => {
      const encodedCalls = ['0xabc', '0xdef'];
      mockMulticallContract.methods.aggregate().call.mockResolvedValue({
        returnData: [
          { success: true, data: '0x123' },
          { success: true, data: '0x456' },
        ],
      });

      await service.genericMulticall('0xContractAddress', encodedCalls, ethereumDeployment);

      // Verify getBlockNumber was called first
      expect(mockWeb3.eth.getBlockNumber).toHaveBeenCalled();
      // Verify the multicall was called with the block number
      expect(mockMulticallContract.methods.aggregate().call).toHaveBeenCalledWith({}, 12345678);
    });
  });
});
