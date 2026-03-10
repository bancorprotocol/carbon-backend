import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { GradientActivityService } from './gradient-activity.service';
import { ActivityV2 } from '../activity/activity-v2.entity';
import { GradientStrategyCreatedEventService } from './events/gradient-strategy-created-event.service';
import { GradientStrategyUpdatedEventService } from './events/gradient-strategy-updated-event.service';
import { GradientStrategyDeletedEventService } from './events/gradient-strategy-deleted-event.service';
import { GradientStrategyLiquidityUpdatedEventService } from './events/gradient-strategy-liquidity-updated-event.service';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { DeploymentService, BlockchainType, ExchangeId, Deployment } from '../deployment/deployment.service';
import { BlockService } from '../block/block.service';
import { TokensByAddress } from '../token/token.service';

const mockDeployment: Deployment = {
  blockchainType: BlockchainType.Ethereum,
  exchangeId: ExchangeId.OGEthereum,
  startBlock: 1,
  rpcEndpoint: '',
  harvestEventsBatchSize: 0,
  harvestConcurrency: 0,
  multicallAddress: '',
  gasToken: undefined,
  contracts: {},
};

const mockTokens: TokensByAddress = {
  '0xtoken0': {
    id: 1,
    address: '0xtoken0',
    symbol: 'ETH',
    decimals: 18,
    blockchainType: mockDeployment.blockchainType,
    exchangeId: mockDeployment.exchangeId,
    name: 'Ether',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  '0xtoken1': {
    id: 2,
    address: '0xtoken1',
    symbol: 'USDC',
    decimals: 6,
    blockchainType: mockDeployment.blockchainType,
    exchangeId: mockDeployment.exchangeId,
    name: 'USD Coin',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

const mockBlock = {
  id: 100,
  blockchainType: mockDeployment.blockchainType,
  timestamp: new Date('2025-01-01'),
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeCreatedEvent(overrides: any = {}) {
  return {
    id: 1,
    blockchainType: mockDeployment.blockchainType,
    exchangeId: mockDeployment.exchangeId,
    strategyId: '1000',
    block: mockBlock,
    transactionHash: '0xabc',
    transactionIndex: 0,
    logIndex: 0,
    timestamp: new Date('2025-01-01'),
    token0: mockTokens['0xtoken0'],
    token1: mockTokens['0xtoken1'],
    pair: null,
    owner: '0xowner',
    order0Liquidity: '1000000000000000000',
    order0InitialPrice: '100',
    order0TradingStartTime: 0,
    order0Expiry: 0,
    order0MultiFactor: '1',
    order0GradientType: '0',
    order1Liquidity: '2000000000',
    order1InitialPrice: '100',
    order1TradingStartTime: 0,
    order1Expiry: 0,
    order1MultiFactor: '1',
    order1GradientType: '0',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeUpdatedEvent(overrides: any = {}) {
  return {
    id: 2,
    blockchainType: mockDeployment.blockchainType,
    exchangeId: mockDeployment.exchangeId,
    strategyId: '1000',
    block: { ...mockBlock, id: 101 },
    transactionHash: '0xdef',
    transactionIndex: 0,
    logIndex: 1,
    timestamp: new Date('2025-01-02'),
    token0: mockTokens['0xtoken0'],
    token1: mockTokens['0xtoken1'],
    pair: null,
    order0Liquidity: '2000000000000000000',
    order0InitialPrice: '100',
    order0TradingStartTime: 0,
    order0Expiry: 0,
    order0MultiFactor: '1',
    order0GradientType: '0',
    order1Liquidity: '3000000000',
    order1InitialPrice: '100',
    order1TradingStartTime: 0,
    order1Expiry: 0,
    order1MultiFactor: '1',
    order1GradientType: '0',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeDeletedEvent(overrides: any = {}) {
  return {
    id: 3,
    blockchainType: mockDeployment.blockchainType,
    exchangeId: mockDeployment.exchangeId,
    strategyId: '1000',
    block: { ...mockBlock, id: 102 },
    transactionHash: '0xghi',
    transactionIndex: 0,
    logIndex: 2,
    timestamp: new Date('2025-01-03'),
    token0: mockTokens['0xtoken0'],
    token1: mockTokens['0xtoken1'],
    pair: null,
    order0Liquidity: '1000000000000000000',
    order0InitialPrice: '100',
    order0TradingStartTime: 0,
    order0Expiry: 0,
    order0MultiFactor: '1',
    order0GradientType: '0',
    order1Liquidity: '2000000000',
    order1InitialPrice: '100',
    order1TradingStartTime: 0,
    order1Expiry: 0,
    order1MultiFactor: '1',
    order1GradientType: '0',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeLiquidityEvent(overrides: any = {}) {
  return {
    id: 4,
    blockchainType: mockDeployment.blockchainType,
    exchangeId: mockDeployment.exchangeId,
    strategyId: '1000',
    block: { ...mockBlock, id: 103 },
    transactionHash: '0xjkl',
    transactionIndex: 0,
    logIndex: 3,
    timestamp: new Date('2025-01-04'),
    token0: mockTokens['0xtoken0'],
    token1: mockTokens['0xtoken1'],
    pair: null,
    liquidity0: '500000000000000000',
    liquidity1: '2500000000',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('GradientActivityService', () => {
  let service: GradientActivityService;
  let mockActivityRepo: any;
  let mockCreatedEventService: any;
  let mockUpdatedEventService: any;
  let mockDeletedEventService: any;
  let mockLiquidityUpdatedEventService: any;
  let mockLastProcessedBlockService: any;
  let mockDeploymentService: any;
  let mockBlockService: any;
  let mockDataSource: any;
  let savedActivities: ActivityV2[];

  beforeEach(async () => {
    savedActivities = [];

    mockActivityRepo = {
      save: jest.fn().mockImplementation((batch) => {
        savedActivities.push(...batch);
        return Promise.resolve(batch);
      }),
      createQueryBuilder: jest.fn().mockReturnValue({
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      }),
    };

    mockCreatedEventService = {
      get: jest.fn().mockResolvedValue([]),
    };

    mockUpdatedEventService = {
      get: jest.fn().mockResolvedValue([]),
    };

    mockDeletedEventService = {
      get: jest.fn().mockResolvedValue([]),
    };

    mockLiquidityUpdatedEventService = {
      get: jest.fn().mockResolvedValue([]),
    };

    mockLastProcessedBlockService = {
      getOrInit: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue(undefined),
    };

    mockDeploymentService = {
      hasGradientSupport: jest.fn().mockReturnValue(true),
    };

    mockBlockService = {
      getBlocksDictionary: jest.fn().mockResolvedValue({
        100: new Date('2025-01-01'),
        101: new Date('2025-01-02'),
        102: new Date('2025-01-03'),
        103: new Date('2025-01-04'),
      }),
    };

    mockDataSource = {
      query: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GradientActivityService,
        { provide: getRepositoryToken(ActivityV2), useValue: mockActivityRepo },
        { provide: GradientStrategyCreatedEventService, useValue: mockCreatedEventService },
        { provide: GradientStrategyUpdatedEventService, useValue: mockUpdatedEventService },
        { provide: GradientStrategyDeletedEventService, useValue: mockDeletedEventService },
        { provide: GradientStrategyLiquidityUpdatedEventService, useValue: mockLiquidityUpdatedEventService },
        { provide: LastProcessedBlockService, useValue: mockLastProcessedBlockService },
        { provide: DeploymentService, useValue: mockDeploymentService },
        { provide: BlockService, useValue: mockBlockService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<GradientActivityService>(GradientActivityService);
  });

  describe('action types match regular strategy conventions', () => {
    it('should use create_strategy for created events', async () => {
      const created = makeCreatedEvent();
      mockCreatedEventService.get.mockResolvedValueOnce([]).mockResolvedValueOnce([created]);

      await service.update(200, mockDeployment, mockTokens);

      expect(savedActivities).toHaveLength(1);
      expect(savedActivities[0].action).toBe('create_strategy');
    });

    it('should use edit_price for updated events', async () => {
      const created = makeCreatedEvent();
      const updated = makeUpdatedEvent();
      mockCreatedEventService.get
        .mockResolvedValueOnce([created])
        .mockResolvedValueOnce([]);
      mockUpdatedEventService.get
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([updated]);

      await service.update(200, mockDeployment, mockTokens);

      expect(savedActivities).toHaveLength(1);
      expect(savedActivities[0].action).toBe('edit_price');
    });

    it('should use deleted for deleted events', async () => {
      const created = makeCreatedEvent();
      const deleted = makeDeletedEvent();
      mockCreatedEventService.get
        .mockResolvedValueOnce([created])
        .mockResolvedValueOnce([]);
      mockDeletedEventService.get
        .mockResolvedValueOnce([deleted]);

      await service.update(200, mockDeployment, mockTokens);

      expect(savedActivities).toHaveLength(1);
      expect(savedActivities[0].action).toBe('deleted');
    });

    it('should use sell_high when token0 decreases and token1 increases', async () => {
      const created = makeCreatedEvent();
      const liqEvent = makeLiquidityEvent({
        liquidity0: '500000000000000000',
        liquidity1: '2500000000',
      });
      mockCreatedEventService.get
        .mockResolvedValueOnce([created])
        .mockResolvedValueOnce([]);
      mockLiquidityUpdatedEventService.get
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([liqEvent]);

      await service.update(200, mockDeployment, mockTokens);

      expect(savedActivities).toHaveLength(1);
      expect(savedActivities[0].action).toBe('sell_high');
    });

    it('should use buy_low when token1 decreases and token0 increases', async () => {
      const created = makeCreatedEvent();
      const liqEvent = makeLiquidityEvent({
        liquidity0: '2000000000000000000',
        liquidity1: '500000000',
      });
      mockCreatedEventService.get
        .mockResolvedValueOnce([created])
        .mockResolvedValueOnce([]);
      mockLiquidityUpdatedEventService.get
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([liqEvent]);

      await service.update(200, mockDeployment, mockTokens);

      expect(savedActivities).toHaveLength(1);
      expect(savedActivities[0].action).toBe('buy_low');
    });

    it('should use trade_occurred as fallback for liquidity updates', async () => {
      const created = makeCreatedEvent();
      const liqEvent = makeLiquidityEvent({
        liquidity0: '2000000000000000000',
        liquidity1: '4000000000',
      });
      mockCreatedEventService.get
        .mockResolvedValueOnce([created])
        .mockResolvedValueOnce([]);
      mockLiquidityUpdatedEventService.get
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([liqEvent]);

      await service.update(200, mockDeployment, mockTokens);

      expect(savedActivities).toHaveLength(1);
      expect(savedActivities[0].action).toBe('trade_occurred');
    });

    it('should use transfer_strategy for transfer events', async () => {
      const created = makeCreatedEvent();
      mockCreatedEventService.get
        .mockResolvedValueOnce([created])
        .mockResolvedValueOnce([]);

      mockDataSource.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{
          strategyId: '1000',
          from: '0xowner',
          to: '0xnewowner',
          transactionHash: '0xtransfer',
          transactionIndex: 0,
          logIndex: 5,
          blockNumber: 101,
          timestamp: new Date('2025-01-02'),
        }]);

      await service.update(200, mockDeployment, mockTokens);

      expect(savedActivities).toHaveLength(1);
      expect(savedActivities[0].action).toBe('transfer_strategy');
    });
  });

  describe('token information is properly populated', () => {
    it('should set token symbols and addresses from tokens map', async () => {
      const created = makeCreatedEvent();
      mockCreatedEventService.get.mockResolvedValueOnce([]).mockResolvedValueOnce([created]);

      await service.update(200, mockDeployment, mockTokens);

      expect(savedActivities[0].baseSellToken).toBe('ETH');
      expect(savedActivities[0].baseSellTokenAddress).toBe('0xtoken0');
      expect(savedActivities[0].quoteBuyToken).toBe('USDC');
      expect(savedActivities[0].quoteBuyTokenAddress).toBe('0xtoken1');
      expect(savedActivities[0].baseQuote).toBe('ETH/USDC');
    });

    it('should set token0Id and token1Id', async () => {
      const created = makeCreatedEvent();
      mockCreatedEventService.get.mockResolvedValueOnce([]).mockResolvedValueOnce([created]);

      await service.update(200, mockDeployment, mockTokens);

      expect(savedActivities[0].token0Id).toBe(1);
      expect(savedActivities[0].token1Id).toBe(2);
      expect(savedActivities[0].token0).toBe(mockTokens['0xtoken0']);
      expect(savedActivities[0].token1).toBe(mockTokens['0xtoken1']);
    });

    it('should set token IDs on liquidity activities', async () => {
      const created = makeCreatedEvent();
      const liqEvent = makeLiquidityEvent();
      mockCreatedEventService.get
        .mockResolvedValueOnce([created])
        .mockResolvedValueOnce([]);
      mockLiquidityUpdatedEventService.get
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([liqEvent]);

      await service.update(200, mockDeployment, mockTokens);

      expect(savedActivities[0].token0Id).toBe(1);
      expect(savedActivities[0].token1Id).toBe(2);
    });

    it('should set token IDs on transfer activities', async () => {
      const created = makeCreatedEvent();
      mockCreatedEventService.get
        .mockResolvedValueOnce([created])
        .mockResolvedValueOnce([]);

      mockDataSource.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{
          strategyId: '1000',
          from: '0xowner',
          to: '0xnewowner',
          transactionHash: '0xtransfer',
          transactionIndex: 0,
          logIndex: 5,
          blockNumber: 101,
          timestamp: new Date('2025-01-02'),
        }]);

      await service.update(200, mockDeployment, mockTokens);

      expect(savedActivities[0].token0Id).toBe(1);
      expect(savedActivities[0].token1Id).toBe(2);
    });
  });

  describe('block number is properly populated', () => {
    it('should set blockNumber from block relation', async () => {
      const created = makeCreatedEvent();
      mockCreatedEventService.get.mockResolvedValueOnce([]).mockResolvedValueOnce([created]);

      await service.update(200, mockDeployment, mockTokens);

      expect(savedActivities[0].blockNumber).toBe(100);
    });

    it('should set blockNumber on liquidity activities', async () => {
      const created = makeCreatedEvent();
      const liqEvent = makeLiquidityEvent();
      mockCreatedEventService.get
        .mockResolvedValueOnce([created])
        .mockResolvedValueOnce([]);
      mockLiquidityUpdatedEventService.get
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([liqEvent]);

      await service.update(200, mockDeployment, mockTokens);

      expect(savedActivities[0].blockNumber).toBe(103);
    });
  });

  describe('budget calculations', () => {
    it('should normalize liquidity by token decimals for created events', async () => {
      const created = makeCreatedEvent({
        order0Liquidity: '1000000000000000000',
        order1Liquidity: '2000000000',
      });
      mockCreatedEventService.get.mockResolvedValueOnce([]).mockResolvedValueOnce([created]);

      await service.update(200, mockDeployment, mockTokens);

      expect(savedActivities[0].sellBudget).toBe('1');
      expect(savedActivities[0].buyBudget).toBe('2000');
    });

    it('should compute budget change deltas for liquidity events', async () => {
      const created = makeCreatedEvent({
        order0Liquidity: '1000000000000000000',
        order1Liquidity: '2000000000',
      });
      const liqEvent = makeLiquidityEvent({
        liquidity0: '500000000000000000',
        liquidity1: '2500000000',
      });
      mockCreatedEventService.get
        .mockResolvedValueOnce([created])
        .mockResolvedValueOnce([]);
      mockLiquidityUpdatedEventService.get
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([liqEvent]);

      await service.update(200, mockDeployment, mockTokens);

      expect(savedActivities[0].sellBudgetChange).toBe('-0.5');
      expect(savedActivities[0].buyBudgetChange).toBe('500');
    });
  });

  describe('owner information', () => {
    it('should set owner from created event', async () => {
      const created = makeCreatedEvent({ owner: '0xmyowner' });
      mockCreatedEventService.get.mockResolvedValueOnce([]).mockResolvedValueOnce([created]);

      await service.update(200, mockDeployment, mockTokens);

      expect(savedActivities[0].currentOwner).toBe('0xmyowner');
      expect(savedActivities[0].creationWallet).toBe('0xmyowner');
    });

    it('should set transfer owners correctly', async () => {
      const created = makeCreatedEvent();
      mockCreatedEventService.get
        .mockResolvedValueOnce([created])
        .mockResolvedValueOnce([]);

      mockDataSource.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{
          strategyId: '1000',
          from: '0xowner',
          to: '0xnewowner',
          transactionHash: '0xtransfer',
          transactionIndex: 0,
          logIndex: 5,
          blockNumber: 101,
          timestamp: new Date('2025-01-02'),
        }]);

      await service.update(200, mockDeployment, mockTokens);

      expect(savedActivities[0].oldOwner).toBe('0xowner');
      expect(savedActivities[0].newOwner).toBe('0xnewowner');
      expect(savedActivities[0].currentOwner).toBe('0xnewowner');
    });
  });

  describe('skips when gradient not supported', () => {
    it('should return early when gradient support is disabled', async () => {
      mockDeploymentService.hasGradientSupport.mockReturnValue(false);

      await service.update(200, mockDeployment, mockTokens);

      expect(mockCreatedEventService.get).not.toHaveBeenCalled();
      expect(savedActivities).toHaveLength(0);
    });
  });

  describe('throws when tokens are not found', () => {
    const emptyTokens: TokensByAddress = {};

    it('should throw for created event with missing tokens', async () => {
      const created = makeCreatedEvent();
      mockCreatedEventService.get.mockResolvedValueOnce([]).mockResolvedValueOnce([created]);

      await expect(service.update(200, mockDeployment, emptyTokens)).rejects.toThrow(
        /Token0 not found.*create_strategy/,
      );
    });

    it('should throw for updated event with missing tokens', async () => {
      const created = makeCreatedEvent();
      const updated = makeUpdatedEvent();
      mockCreatedEventService.get
        .mockResolvedValueOnce([created])
        .mockResolvedValueOnce([]);
      mockUpdatedEventService.get
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([updated]);

      await expect(service.update(200, mockDeployment, emptyTokens)).rejects.toThrow(
        /Token0 not found.*edit_price/,
      );
    });

    it('should throw for deleted event with missing tokens', async () => {
      const created = makeCreatedEvent();
      const deleted = makeDeletedEvent();
      mockCreatedEventService.get
        .mockResolvedValueOnce([created])
        .mockResolvedValueOnce([]);
      mockDeletedEventService.get
        .mockResolvedValueOnce([deleted]);

      await expect(service.update(200, mockDeployment, emptyTokens)).rejects.toThrow(
        /Token0 not found.*deleted/,
      );
    });

    it('should throw for liquidity event with missing tokens', async () => {
      const created = makeCreatedEvent();
      const liqEvent = makeLiquidityEvent();
      mockCreatedEventService.get
        .mockResolvedValueOnce([created])
        .mockResolvedValueOnce([]);
      mockLiquidityUpdatedEventService.get
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([liqEvent]);

      await expect(service.update(200, mockDeployment, emptyTokens)).rejects.toThrow(
        /Token0 not found.*liquidity_updated/,
      );
    });

    it('should throw for transfer event with missing tokens', async () => {
      const created = makeCreatedEvent();
      mockCreatedEventService.get
        .mockResolvedValueOnce([created])
        .mockResolvedValueOnce([]);

      mockDataSource.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{
          strategyId: '1000',
          from: '0xowner',
          to: '0xnewowner',
          transactionHash: '0xtransfer',
          transactionIndex: 0,
          logIndex: 5,
          blockNumber: 101,
          timestamp: new Date('2025-01-02'),
        }]);

      await expect(service.update(200, mockDeployment, emptyTokens)).rejects.toThrow(
        /Token0 not found.*transfer/,
      );
    });
  });
});
