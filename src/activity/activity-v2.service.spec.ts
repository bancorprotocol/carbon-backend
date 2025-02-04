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

const baseCreatedEvent = {
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

const baseUpdatedEvent = {
  id: 1,
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

const baseDeletedEvent = {
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

      const activities = service.processEvents([createdEvent], [], [], [], mockDeployment, mockTokens);
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

      const activities = service.processEvents([createdEvent], [updatedEvent], [], [], mockDeployment, mockTokens);
      expect(activities[1].action).toBe('strategy_paused');
    });

    it('should assign deleted action for deletion events', async () => {
      const deletedEvent = {
        ...baseDeletedEvent,
        order0: JSON.stringify({ y: '0', A: '0', B: '0' }),
        order1: JSON.stringify({ y: '0', A: '0', B: '0' }),
      } as StrategyDeletedEvent;

      const activities = service.processEvents([], [], [deletedEvent], [], mockDeployment, mockTokens);
      expect(activities[0].action).toBe('deleted');
    });
  });
});
