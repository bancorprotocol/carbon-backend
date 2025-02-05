import { Test, TestingModule } from '@nestjs/testing';
import { ActivityV2Service } from './activity-v2.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActivityV2 } from './activity-v2.entity';
import { Activity } from './activity.entity';
import { Repository } from 'typeorm';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { StrategyCreatedEventService } from '../events/strategy-created-event/strategy-created-event.service';
import { StrategyUpdatedEventService } from '../events/strategy-updated-event/strategy-updated-event.service';
import { StrategyDeletedEventService } from '../events/strategy-deleted-event/strategy-deleted-event.service';
import { VoucherTransferEventService } from '../events/voucher-transfer-event/voucher-transfer-event.service';
import { BlockchainType, Deployment, ExchangeId } from '../deployment/deployment.service';
import { TokensByAddress } from '../token/token.service';
import { StrategyCreatedEvent } from '../events/strategy-created-event/strategy-created-event.entity';
import { StrategyUpdatedEvent } from '../events/strategy-updated-event/strategy-updated-event.entity';
import { StrategyDeletedEvent } from '../events/strategy-deleted-event/strategy-deleted-event.entity';

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
    symbol: 'TKN0',
    decimals: 18,
    blockchainType: mockDeployment.blockchainType,
    exchangeId: mockDeployment.exchangeId,
    name: 'Token 0',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  '0xtoken1': {
    id: 2,
    address: '0xtoken1',
    symbol: 'TKN1',
    decimals: 18,
    blockchainType: mockDeployment.blockchainType,
    exchangeId: mockDeployment.exchangeId,
    name: 'Token 1',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

const mockPair = {
  id: 1,
  blockchainType: mockDeployment.blockchainType,
  exchangeId: mockDeployment.exchangeId,
  block: {
    id: 1,
    blockchainType: mockDeployment.blockchainType,
    timestamp: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  token0: mockTokens['0xtoken0'],
  token1: mockTokens['0xtoken1'],
  name: 'TKN0-TKN1',
  tokensTradedEvents: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const baseCreatedEvent: StrategyCreatedEvent = {
  id: '1',
  strategyId: '1',
  owner: '0xowner',
  token0: mockTokens['0xtoken0'],
  token1: mockTokens['0xtoken1'],
  order0: JSON.stringify({ y: '100', A: '1', B: '1' }),
  order1: JSON.stringify({ y: '100', A: '1', B: '1' }),
  block: {
    id: 1,
    blockchainType: mockDeployment.blockchainType,
    timestamp: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  timestamp: new Date(),
  transactionHash: '0xtx',
  transactionIndex: 0,
  logIndex: 0,
  pair: mockPair,
  blockchainType: mockDeployment.blockchainType,
  exchangeId: mockDeployment.exchangeId,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const baseUpdatedEvent: StrategyUpdatedEvent = {
  id: 1,
  strategyId: '1',
  token0: mockTokens['0xtoken0'],
  token1: mockTokens['0xtoken1'],
  order0: JSON.stringify({ y: '100', A: '1', B: '1' }),
  order1: JSON.stringify({ y: '100', A: '1', B: '1' }),
  block: {
    id: 1,
    blockchainType: mockDeployment.blockchainType,
    timestamp: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  timestamp: new Date(),
  transactionHash: '0xtx',
  transactionIndex: 0,
  logIndex: 0,
  pair: mockPair,
  blockchainType: mockDeployment.blockchainType,
  exchangeId: mockDeployment.exchangeId,
  createdAt: new Date(),
  updatedAt: new Date(),
  reason: 1,
};

const baseDeletedEvent: StrategyDeletedEvent = {
  ...baseUpdatedEvent,
};

describe('ActivityV2Service', () => {
  let service: ActivityV2Service;
  let mockActivityRepository: Partial<Repository<ActivityV2>>;
  let mockOldActivityRepository: Partial<Repository<Activity>>;

  beforeEach(async () => {
    mockActivityRepository = {
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      }),
    };

    mockOldActivityRepository = {
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityV2Service,
        {
          provide: getRepositoryToken(ActivityV2),
          useValue: mockActivityRepository,
        },
        {
          provide: getRepositoryToken(Activity),
          useValue: mockOldActivityRepository,
        },
        {
          provide: LastProcessedBlockService,
          useValue: {
            getOrInit: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: StrategyCreatedEventService,
          useValue: { get: jest.fn() },
        },
        {
          provide: StrategyUpdatedEventService,
          useValue: { get: jest.fn() },
        },
        {
          provide: StrategyDeletedEventService,
          useValue: { get: jest.fn() },
        },
        {
          provide: VoucherTransferEventService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<ActivityV2Service>(ActivityV2Service);
  });

  describe('determine action type', () => {
    it('should assign create_strategy action for creation events', async () => {
      const createdEvent = { ...baseCreatedEvent } as StrategyCreatedEvent;
      const strategyStates = new Map();
      const activities = service.processEvents([createdEvent], [], [], [], mockDeployment, mockTokens, strategyStates);
      expect(activities[0].action).toBe('create_strategy');
    });

    it('should assign strategy_paused action when prices are zero', async () => {
      const createdEvent = { ...baseCreatedEvent } as StrategyCreatedEvent;
      const updatedEvent = {
        ...baseUpdatedEvent,
        order0: JSON.stringify({ y: '100', A: '0', B: '0' }),
        order1: JSON.stringify({ y: '100', A: '0', B: '0' }),
        transactionHash: '0xtx2',
        reason: 0,
      } as StrategyUpdatedEvent;

      const strategyStates = new Map();
      const activities = service.processEvents(
        [createdEvent],
        [updatedEvent],
        [],
        [],
        mockDeployment,
        mockTokens,
        strategyStates,
      );
      expect(activities[1].action).toBe('strategy_paused');
    });

    it('should assign edit_deposit action when prices change with deposit', async () => {
      const createdEvent = { ...baseCreatedEvent } as StrategyCreatedEvent;
      const updatedEvent = {
        ...baseUpdatedEvent,
        order0: JSON.stringify({ y: '200', A: '2', B: '2' }), // Increased y and changed prices
        order1: JSON.stringify({ y: '100', A: '2', B: '2' }),
        transactionHash: '0xtx2',
        reason: 0,
      } as StrategyUpdatedEvent;

      const strategyStates = new Map();
      const activities = service.processEvents(
        [createdEvent],
        [updatedEvent],
        [],
        [],
        mockDeployment,
        mockTokens,
        strategyStates,
      );
      expect(activities[1].action).toBe('edit_deposit');
    });

    it('should assign edit_withdraw action when prices change with withdrawal', async () => {
      const createdEvent = { ...baseCreatedEvent } as StrategyCreatedEvent;
      const updatedEvent = {
        ...baseUpdatedEvent,
        order0: JSON.stringify({ y: '50', A: '2', B: '2' }), // Decreased y and changed prices
        order1: JSON.stringify({ y: '100', A: '2', B: '2' }),
        transactionHash: '0xtx2',
        reason: 0,
      } as StrategyUpdatedEvent;

      const strategyStates = new Map();
      const activities = service.processEvents(
        [createdEvent],
        [updatedEvent],
        [],
        [],
        mockDeployment,
        mockTokens,
        strategyStates,
      );
      expect(activities[1].action).toBe('edit_withdraw');
    });

    it('should assign edit_deposit_withdraw action when prices change with both deposit and withdrawal', async () => {
      const createdEvent = { ...baseCreatedEvent } as StrategyCreatedEvent;
      const updatedEvent = {
        ...baseUpdatedEvent,
        order0: JSON.stringify({ y: '200', A: '2', B: '2' }), // Increased y0
        order1: JSON.stringify({ y: '50', A: '2', B: '2' }), // Decreased y1
        transactionHash: '0xtx2',
        reason: 0,
      } as StrategyUpdatedEvent;

      const strategyStates = new Map();
      const activities = service.processEvents(
        [createdEvent],
        [updatedEvent],
        [],
        [],
        mockDeployment,
        mockTokens,
        strategyStates,
      );
      expect(activities[1].action).toBe('edit_deposit_withdraw');
    });

    it('should assign edit_price action when only prices change', async () => {
      const createdEvent = { ...baseCreatedEvent } as StrategyCreatedEvent;
      const updatedEvent = {
        ...baseUpdatedEvent,
        order0: JSON.stringify({ y: '100', A: '2', B: '2' }), // Same y, different prices
        order1: JSON.stringify({ y: '100', A: '2', B: '2' }),
        transactionHash: '0xtx2',
        reason: 0,
      } as StrategyUpdatedEvent;

      const strategyStates = new Map();
      const activities = service.processEvents(
        [createdEvent],
        [updatedEvent],
        [],
        [],
        mockDeployment,
        mockTokens,
        strategyStates,
      );
      expect(activities[1].action).toBe('edit_price');
    });

    it('should assign deposit action for simple deposits without price changes', async () => {
      const createdEvent = { ...baseCreatedEvent } as StrategyCreatedEvent;
      const updatedEvent = {
        ...baseUpdatedEvent,
        order0: JSON.stringify({ y: '200', A: '1', B: '1' }), // Increased y, same prices
        order1: JSON.stringify({ y: '100', A: '1', B: '1' }),
        transactionHash: '0xtx2',
        reason: 0,
      } as StrategyUpdatedEvent;

      const strategyStates = new Map();
      const activities = service.processEvents(
        [createdEvent],
        [updatedEvent],
        [],
        [],
        mockDeployment,
        mockTokens,
        strategyStates,
      );
      expect(activities[1].action).toBe('deposit');
    });

    it('should assign withdraw action for simple withdrawals without price changes', async () => {
      const createdEvent = { ...baseCreatedEvent } as StrategyCreatedEvent;
      const updatedEvent = {
        ...baseUpdatedEvent,
        order0: JSON.stringify({ y: '50', A: '1', B: '1' }), // Decreased y, same prices
        order1: JSON.stringify({ y: '100', A: '1', B: '1' }),
        transactionHash: '0xtx2',
        reason: 0,
      } as StrategyUpdatedEvent;

      const strategyStates = new Map();
      const activities = service.processEvents(
        [createdEvent],
        [updatedEvent],
        [],
        [],
        mockDeployment,
        mockTokens,
        strategyStates,
      );
      expect(activities[1].action).toBe('withdraw');
    });

    it('should assign deleted action for deletion events', async () => {
      const deletedEvent = {
        ...baseDeletedEvent,
        order0: JSON.stringify({ y: '0', A: '0', B: '0' }),
        order1: JSON.stringify({ y: '0', A: '0', B: '0' }),
      } as StrategyDeletedEvent;

      const strategyStates = new Map();
      const activities = service.processEvents([], [], [deletedEvent], [], mockDeployment, mockTokens, strategyStates);
      expect(activities[0].action).toBe('deleted');
    });

    it('should assign edit_price action for trade events (reason = 1)', async () => {
      const createdEvent = { ...baseCreatedEvent } as StrategyCreatedEvent;
      const updatedEvent = {
        ...baseUpdatedEvent,
        order0: JSON.stringify({ y: '100', A: '2', B: '2' }),
        order1: JSON.stringify({ y: '100', A: '2', B: '2' }),
        transactionHash: '0xtx2',
        reason: 1, // Trade event
      } as StrategyUpdatedEvent;

      const strategyStates = new Map();
      const activities = service.processEvents(
        [createdEvent],
        [updatedEvent],
        [],
        [],
        mockDeployment,
        mockTokens,
        strategyStates,
      );
      expect(activities[1].action).toBe('edit_price');
    });

    it('should assign edit_price action for trade events when neither buy_low nor sell_high conditions are met', async () => {
      const createdEvent = { ...baseCreatedEvent } as StrategyCreatedEvent;
      const updatedEvent = {
        ...baseUpdatedEvent,
        order0: JSON.stringify({ y: '100', A: '2', B: '2' }), // Same y values
        order1: JSON.stringify({ y: '100', A: '2', B: '2' }), // but different A/B
        transactionHash: '0xtx2',
        reason: 1, // Trade event
      } as StrategyUpdatedEvent;

      const strategyStates = new Map();
      const activities = service.processEvents(
        [createdEvent],
        [updatedEvent],
        [],
        [],
        mockDeployment,
        mockTokens,
        strategyStates,
      );
      expect(activities[1].action).toBe('edit_price');
    });
  });

  describe('batching behavior', () => {
    it('should maintain correct state across batches', async () => {
      const strategyStates = new Map();
      const createdEvent = { ...baseCreatedEvent } as StrategyCreatedEvent;
      const updatedEvent1 = {
        ...baseUpdatedEvent,
        order0: JSON.stringify({ y: '200000000000000000000', A: '2', B: '2' }),
        order1: JSON.stringify({ y: '200000000000000000000', A: '2', B: '2' }),
        block: { ...baseCreatedEvent.block, id: 2 },
        transactionHash: '0xtx2',
      } as StrategyUpdatedEvent;
      const updatedEvent2 = {
        ...baseUpdatedEvent,
        order0: JSON.stringify({ y: '300000000000000000000', A: '3', B: '3' }),
        order1: JSON.stringify({ y: '300000000000000000000', A: '3', B: '3' }),
        block: { ...baseCreatedEvent.block, id: 3 },
        transactionHash: '0xtx3',
      } as StrategyUpdatedEvent;

      // First batch: Process creation and first update
      const firstBatchActivities = service.processEvents(
        [createdEvent],
        [updatedEvent1],
        [],
        [],
        mockDeployment,
        mockTokens,
        strategyStates,
      );

      // Verify first batch
      expect(firstBatchActivities).toHaveLength(2);
      expect(firstBatchActivities[0].action).toBe('create_strategy');
      expect(firstBatchActivities[1].action).toBe('edit_price');
      expect(firstBatchActivities[1].sellBudget).toBe('200');

      // Second batch: Process second update
      const secondBatchActivities = service.processEvents(
        [],
        [updatedEvent2],
        [],
        [],
        mockDeployment,
        mockTokens,
        strategyStates,
      );

      // Verify second batch maintains state from first batch
      expect(secondBatchActivities).toHaveLength(1);
      expect(secondBatchActivities[0].action).toBe('edit_price');
      expect(secondBatchActivities[0].sellBudget).toBe('300');
    });

    it('should not miss events between batches', async () => {
      const events = Array.from({ length: 5 }).map((_, i) => ({
        ...baseUpdatedEvent,
        order0: JSON.stringify({ y: `${100 * (i + 1)}000000000000000000`, A: '1', B: '1' }),
        order1: JSON.stringify({ y: `${100 * (i + 1)}000000000000000000`, A: '1', B: '1' }),
        block: { ...baseCreatedEvent.block, id: i + 1 },
        transactionHash: `0xtx${i + 1}`,
      })) as StrategyUpdatedEvent[];

      const createdEvent = { ...baseCreatedEvent } as StrategyCreatedEvent;
      const strategyStates = new Map();

      // Process events in batches of 2
      const batch1 = service.processEvents(
        [createdEvent],
        events.slice(0, 2),
        [],
        [],
        mockDeployment,
        mockTokens,
        strategyStates,
      );
      const batch2 = service.processEvents([], events.slice(2, 4), [], [], mockDeployment, mockTokens, strategyStates);
      const batch3 = service.processEvents([], events.slice(4), [], [], mockDeployment, mockTokens, strategyStates);

      // Verify all events were processed
      expect(batch1).toHaveLength(3); // creation + 2 updates
      expect(batch2).toHaveLength(2); // 2 updates
      expect(batch3).toHaveLength(1); // 1 update

      // Verify correct order and values
      expect(batch1[0].action).toBe('create_strategy');
      expect(parseFloat(batch1[1].sellBudget)).toBe(100);
      expect(parseFloat(batch1[2].sellBudget)).toBe(200);
      expect(parseFloat(batch2[0].sellBudget)).toBe(300);
      expect(parseFloat(batch2[1].sellBudget)).toBe(400);
      expect(parseFloat(batch3[0].sellBudget)).toBe(500);
    });

    it('should handle deletion events across batches', async () => {
      const createdEvent = { ...baseCreatedEvent } as StrategyCreatedEvent;
      const updatedEvent = {
        ...baseUpdatedEvent,
        block: { ...baseCreatedEvent.block, id: 2 },
        transactionHash: '0xtx2',
      } as StrategyUpdatedEvent;
      const deletedEvent = {
        ...baseDeletedEvent,
        block: { ...baseCreatedEvent.block, id: 3 },
        transactionHash: '0xtx3',
      } as StrategyDeletedEvent;

      const strategyStates = new Map();

      // First batch: creation and update
      const batch1 = service.processEvents(
        [createdEvent],
        [updatedEvent],
        [],
        [],
        mockDeployment,
        mockTokens,
        strategyStates,
      );

      // Second batch: deletion
      const batch2 = service.processEvents([], [], [deletedEvent], [], mockDeployment, mockTokens, strategyStates);

      expect(batch1).toHaveLength(2);
      expect(batch2).toHaveLength(1);
      expect(batch2[0].action).toBe('deleted');

      // Verify state is cleared after deletion
      const batch3 = service.processEvents([], [updatedEvent], [], [], mockDeployment, mockTokens, strategyStates);
      expect(batch3).toHaveLength(0); // Should not process updates for deleted strategy
    });
  });
});
