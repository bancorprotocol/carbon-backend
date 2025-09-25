import { Test, TestingModule } from '@nestjs/testing';
import { ActivityV2Service } from './activity-v2.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActivityV2 } from './activity-v2.entity';
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
import { VoucherTransferEvent } from '../events/voucher-transfer-event/voucher-transfer-event.entity';

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
    name: 'Token 0',
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
  order0: JSON.stringify({ y: '10_000000000000000000', z: '10_000000000000000000', A: '0', B: '4409572391052980' }),
  order1: JSON.stringify({ y: '2000_000000', z: '2000_000000', A: '0', B: '12397686690' }),
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
  order0: JSON.stringify({ y: '9_000000000000000000', A: '0', B: '4409572391052980' }),
  order1: JSON.stringify({ y: '2200_000000', A: '0', B: '12397686690' }),
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

const baseTransferEvent: VoucherTransferEvent = {
  id: 1,
  strategyId: '1',
  from: '0xbatcher',
  to: '0xuser',
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
  logIndex: 1,
  blockchainType: mockDeployment.blockchainType,
  exchangeId: mockDeployment.exchangeId,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ActivityV2Service', () => {
  let service: ActivityV2Service;
  let mockActivityRepository: Partial<Repository<ActivityV2>>;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityV2Service,
        {
          provide: getRepositoryToken(ActivityV2),
          useValue: mockActivityRepository,
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
        order0: JSON.stringify({ y: '10_000000000000000000', A: '0', B: '0' }), // Set both B values to 0
        order1: JSON.stringify({ y: '2000_000000', A: '0', B: '0' }),
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

    it('should assign no_change action when the updated event is the same', async () => {
      const createdEvent = { ...baseCreatedEvent } as StrategyCreatedEvent;
      const updatedEvent = {
        ...baseUpdatedEvent,
        order0: JSON.stringify({
          y: '10_000000000000000000',
          z: '10_000000000000000000',
          A: '0',
          B: '4409572391052980',
        }),
        order1: JSON.stringify({ y: '2000_000000', z: '2000_000000', A: '0', B: '12397686690' }),
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

    it('should assign liquidity_concentration_changed action when the state doesnt change', async () => {
      const createdEvent = { ...baseCreatedEvent } as StrategyCreatedEvent;
      const updatedEvent = {
        ...baseUpdatedEvent,
        order0: JSON.stringify({
          y: '10_000000000000000000',
          z: '10_000000000000000000',
          A: '0',
          B: '4409572391052980',
        }),
        order1: JSON.stringify({ y: '2000_000000', z: '4000_000000', A: '0', B: '12397686690' }),
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

    it('should assign edit_deposit action when prices change with deposit', async () => {
      const createdEvent = { ...baseCreatedEvent } as StrategyCreatedEvent;
      const updatedEvent = {
        ...baseUpdatedEvent,
        order0: JSON.stringify({ y: '11_000000000000000000', A: '0', B: '4416648363926356' }), // Increased y and changed prices
        order1: JSON.stringify({ y: '2000_000000', A: '0', B: '12397686690' }),
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
        order0: JSON.stringify({ y: '9_000000000000000000', A: '0', B: '4416648363926356' }), // Decreased y and changed prices
        order1: JSON.stringify({ y: '2000_000000', A: '0', B: '12397686690' }),
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
        order0: JSON.stringify({ y: '11_000000000000000000', A: '0', B: '4416648363926356' }), // Increased y and changed prices
        order1: JSON.stringify({ y: '1600_000000', A: '0', B: '12397686690' }), // Decrease y
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
        order0: JSON.stringify({ y: '10_000000000000000000', A: '0', B: '4416648363926356' }), // Same y and changed prices
        order1: JSON.stringify({ y: '2000_000000', A: '0', B: '12397686690' }),
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
        order0: JSON.stringify({ y: '11_000000000000000000', A: '0', B: '4409572391052980' }), // Increased y, same prices
        order1: JSON.stringify({ y: '2000_000000', A: '0', B: '12397686690' }),
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
        order0: JSON.stringify({ y: '9_000000000000000000', A: '0', B: '4409572391052980' }), // Decreased y, same prices
        order1: JSON.stringify({ y: '2000_000000', A: '0', B: '12397686690' }),
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
        order0: JSON.stringify({ y: '0', A: '0', B: '4409572391052980' }),
        order1: JSON.stringify({ y: '0', A: '0', B: '12397686690' }),
      } as StrategyDeletedEvent;

      const strategyStates = new Map();
      const activities = service.processEvents([], [], [deletedEvent], [], mockDeployment, mockTokens, strategyStates);
      expect(activities[0].action).toBe('deleted');
    });

    it('should assign sell_high action for trade events (reason = 1) where y0 increases and y1 decreases', async () => {
      const createdEvent = { ...baseCreatedEvent } as StrategyCreatedEvent;
      const updatedEvent = {
        ...baseUpdatedEvent,
        order0: JSON.stringify({ y: '11_000000000000000000', A: '0', B: '4409572391052980' }), // Increased y, same prices
        order1: JSON.stringify({ y: '1600_000000', A: '0', B: '12397686690' }), // Decreased y, same prices
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
      expect(activities[1].action).toBe('sell_high');
    });

    it('should assign buy_low action for trade events (reason = 1) where y0 decreases and y1 increases', async () => {
      const createdEvent = { ...baseCreatedEvent } as StrategyCreatedEvent;
      const updatedEvent = {
        ...baseUpdatedEvent,
        order0: JSON.stringify({ y: '9_000000000000000000', A: '0', B: '4409572391052980' }), // Decreased y, same prices
        order1: JSON.stringify({ y: '2200_000000', A: '0', B: '12397686690' }), // Increased y, same prices
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
      expect(activities[1].action).toBe('buy_low');
    });
  });

  describe('batching behavior', () => {
    it('should maintain correct state across batches', async () => {
      const strategyStates = new Map();
      const createdEvent = { ...baseCreatedEvent } as StrategyCreatedEvent;
      const updatedEvent1 = {
        ...baseUpdatedEvent,
        order0: JSON.stringify({ y: '10_000000000000000000', A: '0', B: '4416648363926356' }), // changed price relative to create
        order1: JSON.stringify({ y: '2000_000000', A: '0', B: '12397686690' }),
        reason: 0,
        block: { ...baseCreatedEvent.block, id: 2 },
        transactionHash: '0xtx2',
      } as StrategyUpdatedEvent;
      const updatedEvent2 = {
        ...baseUpdatedEvent,
        order0: JSON.stringify({ y: '10_000000000000000000', A: '0', B: '4409572391052980' }), // changed price relative to update1
        order1: JSON.stringify({ y: '2000_000000', A: '0', B: '12397686690' }),
        reason: 0,
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
      expect(firstBatchActivities[1].sellBudget).toBe('10');

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
      expect(secondBatchActivities[0].sellBudget).toBe('10');
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

  describe('batch create detection', () => {
    it('should detect batch create and modify strategy owner', async () => {
      const strategyStates = new Map();

      // Create a batch create scenario: StrategyCreated by batcher + Transfer to user
      const batchCreatedEvent = {
        ...baseCreatedEvent,
        owner: '0xbatcher', // Strategy created by batcher
        transactionHash: '0xbatchtx',
      } as StrategyCreatedEvent;

      const batchTransferEvent = {
        ...baseTransferEvent,
        from: '0xbatcher', // Transfer from batcher
        to: '0xuser', // To real user
        transactionHash: '0xbatchtx', // Same transaction
        strategyId: '1', // Same strategy
      } as VoucherTransferEvent;

      const activities = service.processEvents(
        [batchCreatedEvent],
        [],
        [],
        [batchTransferEvent],
        mockDeployment,
        mockTokens,
        strategyStates,
      );

      // Should have only 1 activity (create_strategy), no transfer activity
      expect(activities).toHaveLength(1);
      expect(activities[0].action).toBe('create_strategy');

      // Strategy should be owned by the real user, not the batcher
      expect(activities[0].currentOwner).toBe('0xuser');
      expect(activities[0].creationWallet).toBe('0xuser');

      // Strategy state should also be updated to real user
      const strategyState = strategyStates.get('1');
      expect(strategyState.currentOwner).toBe('0xuser');
      expect(strategyState.creationWallet).toBe('0xuser');
    });

    it('should handle multiple transfers and use the last one', async () => {
      const strategyStates = new Map();

      const batchCreatedEvent = {
        ...baseCreatedEvent,
        owner: '0xbatcher',
        transactionHash: '0xbatchtx',
      } as StrategyCreatedEvent;

      // Multiple transfers in the same transaction (should use the last one)
      const firstTransfer = {
        ...baseTransferEvent,
        from: '0xbatcher',
        to: '0xintermediate',
        transactionHash: '0xbatchtx',
        logIndex: 1,
      } as VoucherTransferEvent;

      const finalTransfer = {
        ...baseTransferEvent,
        from: '0xbatcher',
        to: '0xfinaluser',
        transactionHash: '0xbatchtx',
        logIndex: 2, // Later in the transaction
      } as VoucherTransferEvent;

      const activities = service.processEvents(
        [batchCreatedEvent],
        [],
        [],
        [firstTransfer, finalTransfer],
        mockDeployment,
        mockTokens,
        strategyStates,
      );

      expect(activities).toHaveLength(1);
      expect(activities[0].action).toBe('create_strategy');
      expect(activities[0].currentOwner).toBe('0xfinaluser'); // Should use final transfer
    });

    it('should not detect batch create when addresses do not match', async () => {
      const strategyStates = new Map();

      const createdEvent = {
        ...baseCreatedEvent,
        owner: '0xuser', // Strategy created by user directly
        transactionHash: '0xnormaltx',
      } as StrategyCreatedEvent;

      const transferEvent = {
        ...baseTransferEvent,
        from: '0xbatcher', // Transfer from different address
        to: '0xotheruser',
        transactionHash: '0xnormaltx', // Same transaction but different addresses
      } as VoucherTransferEvent;

      const activities = service.processEvents(
        [createdEvent],
        [],
        [],
        [transferEvent],
        mockDeployment,
        mockTokens,
        strategyStates,
      );

      // Should have both activities since it's not a batch create
      expect(activities).toHaveLength(2);
      expect(activities[0].action).toBe('create_strategy');
      expect(activities[0].currentOwner).toBe('0xuser'); // Original owner preserved
      expect(activities[1].action).toBe('transfer_strategy');
    });

    it('should handle normal transfers without strategy creation', async () => {
      const strategyStates = new Map();

      // Pre-populate strategy state (strategy was created before)
      strategyStates.set('1', {
        currentOwner: '0xoriginalowner',
        creationWallet: '0xoriginalowner',
        order0: baseCreatedEvent.order0,
        order1: baseCreatedEvent.order1,
        token0: mockTokens['0xtoken0'],
        token1: mockTokens['0xtoken1'],
        lastProcessedBlock: 0,
      });

      const normalTransferEvent = {
        ...baseTransferEvent,
        from: '0xoriginalowner',
        to: '0xnewowner',
        transactionHash: '0xnormaltransfer',
      } as VoucherTransferEvent;

      const activities = service.processEvents(
        [],
        [],
        [],
        [normalTransferEvent],
        mockDeployment,
        mockTokens,
        strategyStates,
      );

      // Should have transfer activity
      expect(activities).toHaveLength(1);
      expect(activities[0].action).toBe('transfer_strategy');
      expect(activities[0].oldOwner).toBe('0xoriginalowner');
      expect(activities[0].newOwner).toBe('0xnewowner');
    });

    it('should filter out zero address transfers', async () => {
      const strategyStates = new Map();

      const zeroAddressTransfer = {
        ...baseTransferEvent,
        from: '0x0000000000000000000000000000000000000000',
        to: '0xuser',
        transactionHash: '0xzerotx',
      } as VoucherTransferEvent;

      const activities = service.processEvents(
        [],
        [],
        [],
        [zeroAddressTransfer],
        mockDeployment,
        mockTokens,
        strategyStates,
      );

      // Should not create any activities for zero address transfers
      expect(activities).toHaveLength(0);
    });

    it('should handle batch create with different strategy IDs correctly', async () => {
      const strategyStates = new Map();

      // Pre-populate strategy state for the transfer event (strategy 2 exists)
      strategyStates.set('2', {
        currentOwner: '0xbatcher',
        creationWallet: '0xsomeuser',
        order0: baseCreatedEvent.order0,
        order1: baseCreatedEvent.order1,
        token0: mockTokens['0xtoken0'],
        token1: mockTokens['0xtoken1'],
        lastProcessedBlock: 0,
      });

      const batchCreatedEvent = {
        ...baseCreatedEvent,
        strategyId: '1',
        owner: '0xbatcher',
        transactionHash: '0xbatchtx',
      } as StrategyCreatedEvent;

      // Transfer for a different strategy in same transaction
      const transferEvent = {
        ...baseTransferEvent,
        strategyId: '2', // Different strategy ID
        from: '0xbatcher',
        to: '0xuser',
        transactionHash: '0xbatchtx',
      } as VoucherTransferEvent;

      const activities = service.processEvents(
        [batchCreatedEvent],
        [],
        [],
        [transferEvent],
        mockDeployment,
        mockTokens,
        strategyStates,
      );

      // Should not detect as batch create due to different strategy IDs
      expect(activities).toHaveLength(2);
      expect(activities[0].action).toBe('create_strategy');
      expect(activities[0].currentOwner).toBe('0xbatcher'); // Original owner preserved
      expect(activities[1].action).toBe('transfer_strategy');
    });
  });
});
