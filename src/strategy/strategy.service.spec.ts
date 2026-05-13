import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StrategyService } from './strategy.service';
import { Strategy } from './strategy.entity';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { StrategyCreatedEventService } from '../events/strategy-created-event/strategy-created-event.service';
import { StrategyUpdatedEventService } from '../events/strategy-updated-event/strategy-updated-event.service';
import { StrategyDeletedEventService } from '../events/strategy-deleted-event/strategy-deleted-event.service';
import { VoucherTransferEventService } from '../events/voucher-transfer-event/voucher-transfer-event.service';
import { BlockchainType, Deployment, ExchangeId } from '../deployment/deployment.service';

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

const mockToken0 = { decimals: 18 } as any;
const mockToken1 = { decimals: 6 } as any;
const mockBlock = { id: 5000 } as any;
const mockPair = { id: 1 } as any;

function makeOrder(y = '1000000000000000000', z = '1000000000000000000', A = '0', B = '500') {
  return JSON.stringify({ y, z, A, B });
}

function makeEvent(strategyId: string, overrides: Record<string, any> = {}) {
  return {
    strategyId,
    token0: mockToken0,
    token1: mockToken1,
    block: mockBlock,
    pair: mockPair,
    order0: makeOrder(),
    order1: makeOrder('500000', '500000', '0', '1000'),
    ...overrides,
  } as any;
}

describe('StrategyService', () => {
  let service: StrategyService;
  let repository: jest.Mocked<Repository<Strategy>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StrategyService,
        {
          provide: getRepositoryToken(Strategy),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            save: jest.fn().mockImplementation((batch) => Promise.resolve(batch)),
            create: jest.fn().mockImplementation((data) => ({ ...data })),
          },
        },
        { provide: LastProcessedBlockService, useValue: { getOrInit: jest.fn(), update: jest.fn() } },
        { provide: StrategyCreatedEventService, useValue: { update: jest.fn(), get: jest.fn() } },
        { provide: StrategyUpdatedEventService, useValue: { update: jest.fn(), get: jest.fn() } },
        { provide: StrategyDeletedEventService, useValue: { update: jest.fn(), get: jest.fn() } },
        { provide: VoucherTransferEventService, useValue: { update: jest.fn(), get: jest.fn() } },
      ],
    }).compile();

    service = module.get<StrategyService>(StrategyService);
    repository = module.get(getRepositoryToken(Strategy));
  });

  afterEach(() => jest.clearAllMocks());

  describe('createOrUpdateFromEvents', () => {
    it('should create a new strategy when none exists', async () => {
      const events = [makeEvent('100', { owner: '0xOwner' })];

      await service.createOrUpdateFromEvents(events, mockDeployment);

      expect(repository.create).toHaveBeenCalledTimes(1);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          strategyId: '100',
          blockchainType: BlockchainType.Ethereum,
          exchangeId: ExchangeId.OGEthereum,
        }),
      );
      expect(repository.save).toHaveBeenCalledTimes(1);
      const saved = (repository.save as jest.Mock).mock.calls[0][0];
      expect(saved).toHaveLength(1);
      expect(saved[0].owner).toBe('0xOwner');
    });

    it('should update an existing strategy', async () => {
      const existing = {
        id: '1',
        strategyId: '100',
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        owner: '0xOldOwner',
      } as Strategy;
      repository.find.mockResolvedValue([existing]);

      const events = [makeEvent('100', { owner: '0xNewOwner' })];
      await service.createOrUpdateFromEvents(events, mockDeployment);

      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalledTimes(1);
      const saved = (repository.save as jest.Mock).mock.calls[0][0];
      expect(saved).toHaveLength(1);
      expect(saved[0].owner).toBe('0xNewOwner');
      expect(saved[0].id).toBe('1');
    });

    it('should deduplicate multiple events for the same new strategy', async () => {
      const events = [
        makeEvent('200', { owner: '0xOwner', block: { id: 5000 } }),
        makeEvent('200', { owner: '0xOwner', block: { id: 5001 } }),
        makeEvent('200', { owner: '0xOwner', block: { id: 5002 } }),
      ];

      await service.createOrUpdateFromEvents(events, mockDeployment);

      expect(repository.create).toHaveBeenCalledTimes(1);
      expect(repository.save).toHaveBeenCalledTimes(1);
      const saved = (repository.save as jest.Mock).mock.calls[0][0];
      expect(saved).toHaveLength(1);
      expect(saved[0].strategyId).toBe('200');
      expect(saved[0].block.id).toBe(5002);
    });

    it('should handle mix of existing and new strategies with duplicates', async () => {
      const existing = {
        id: '1',
        strategyId: '100',
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
      } as Strategy;
      repository.find.mockResolvedValue([existing]);

      const events = [
        makeEvent('100', { block: { id: 5000 } }),
        makeEvent('200', { owner: '0xNew', block: { id: 5001 } }),
        makeEvent('200', { owner: '0xNew', block: { id: 5002 } }),
        makeEvent('100', { block: { id: 5003 } }),
      ];

      await service.createOrUpdateFromEvents(events, mockDeployment);

      expect(repository.create).toHaveBeenCalledTimes(1);
      const saved = (repository.save as jest.Mock).mock.calls[0][0];
      expect(saved).toHaveLength(2);
      const ids = saved.map((s: any) => s.strategyId);
      expect(ids).toContain('100');
      expect(ids).toContain('200');
    });

    it('should only save strategies that had events, not all existing', async () => {
      const existing = [
        { id: '1', strategyId: '100', blockchainType: BlockchainType.Ethereum, exchangeId: ExchangeId.OGEthereum },
        { id: '2', strategyId: '101', blockchainType: BlockchainType.Ethereum, exchangeId: ExchangeId.OGEthereum },
        { id: '3', strategyId: '102', blockchainType: BlockchainType.Ethereum, exchangeId: ExchangeId.OGEthereum },
      ] as Strategy[];
      repository.find.mockResolvedValue(existing);

      const events = [makeEvent('101')];
      await service.createOrUpdateFromEvents(events, mockDeployment);

      const saved = (repository.save as jest.Mock).mock.calls[0][0];
      expect(saved).toHaveLength(1);
      expect(saved[0].strategyId).toBe('101');
    });

    it('should set deleted flag when deletionEvent is true', async () => {
      const events = [makeEvent('300', { owner: '0xOwner' })];

      await service.createOrUpdateFromEvents(events, mockDeployment, true);

      const saved = (repository.save as jest.Mock).mock.calls[0][0];
      expect(saved[0].deleted).toBe(true);
    });

    it('should use latest event data when same strategy appears multiple times', async () => {
      const order0First = makeOrder('1000', '1000', '0', '100');
      const order0Last = makeOrder('9999', '9999', '0', '999');

      const events = [
        makeEvent('400', { order0: order0First, block: { id: 5000 } }),
        makeEvent('400', { order0: order0Last, block: { id: 5005 } }),
      ];

      await service.createOrUpdateFromEvents(events, mockDeployment);

      const saved = (repository.save as jest.Mock).mock.calls[0][0];
      expect(saved).toHaveLength(1);
      expect(saved[0].encodedOrder0).toBe(order0Last);
      expect(saved[0].block.id).toBe(5005);
    });

    it('should not save anything when events array is empty', async () => {
      await service.createOrUpdateFromEvents([], mockDeployment);

      expect(repository.save).not.toHaveBeenCalled();
    });

    it('should not set owner when event has no owner field (update events)', async () => {
      const existing = {
        id: '1',
        strategyId: '100',
        owner: '0xOriginalOwner',
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
      } as Strategy;
      repository.find.mockResolvedValue([existing]);

      const event = makeEvent('100');
      delete event.owner;

      await service.createOrUpdateFromEvents([event], mockDeployment);

      const saved = (repository.save as jest.Mock).mock.calls[0][0];
      expect(saved[0].owner).toBe('0xOriginalOwner');
    });
  });
});
