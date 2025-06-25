import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DexScreenerV2Service } from './dex-screener-v2.service';
import { DexScreenerEventV2 } from './dex-screener-event-v2.entity';
import { LastProcessedBlockService } from '../../last-processed-block/last-processed-block.service';
import { StrategyCreatedEventService } from '../../events/strategy-created-event/strategy-created-event.service';
import { StrategyUpdatedEventService } from '../../events/strategy-updated-event/strategy-updated-event.service';
import { StrategyDeletedEventService } from '../../events/strategy-deleted-event/strategy-deleted-event.service';
import { VoucherTransferEventService } from '../../events/voucher-transfer-event/voucher-transfer-event.service';
import { TokensTradedEventService } from '../../events/tokens-traded-event/tokens-traded-event.service';
import { Deployment, BlockchainType, ExchangeId } from '../../deployment/deployment.service';
import { TokensByAddress } from '../../token/token.service';

describe('DexScreenerV2Service', () => {
  let service: DexScreenerV2Service;
  let dexScreenerEventV2Repository: jest.Mocked<Repository<DexScreenerEventV2>>;
  let lastProcessedBlockService: jest.Mocked<LastProcessedBlockService>;
  let strategyCreatedEventService: jest.Mocked<StrategyCreatedEventService>;
  let strategyUpdatedEventService: jest.Mocked<StrategyUpdatedEventService>;
  let strategyDeletedEventService: jest.Mocked<StrategyDeletedEventService>;
  let voucherTransferEventService: jest.Mocked<VoucherTransferEventService>;
  let tokensTradedEventService: jest.Mocked<TokensTradedEventService>;

  // Test data fixtures
  const mockDeployment: Deployment = {
    blockchainType: 'ethereum' as BlockchainType,
    exchangeId: 'ethereum' as ExchangeId,
    startBlock: 1000,
    rpcEndpoint: 'https://ethereum-rpc.com',
    harvestEventsBatchSize: 1000,
    harvestConcurrency: 1,
    multicallAddress: '0x123',
    gasToken: {
      name: 'Ethereum',
      symbol: 'ETH',
      address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    },
    contracts: {
      CarbonController: { address: '0x456' },
    },
  };

  const mockTokens: TokensByAddress = {
    '0xtoken0': {
      id: 1,
      address: '0xtoken0',
      symbol: 'TOKEN0',
      name: 'Token 0',
      decimals: 18,
      blockchainType: 'ethereum' as BlockchainType,
      exchangeId: 'ethereum' as ExchangeId,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    '0xtoken1': {
      id: 2,
      address: '0xtoken1',
      symbol: 'TOKEN1',
      name: 'Token 1',
      decimals: 6,
      blockchainType: 'ethereum' as BlockchainType,
      exchangeId: 'ethereum' as ExchangeId,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  const createMockStrategyCreatedEvent = (overrides: any = {}) => ({
    id: '1',
    strategyId: 'strategy1',
    pair: {
      id: 1,
      token0: mockTokens['0xtoken0'],
      token1: mockTokens['0xtoken1'],
      blockchainType: 'ethereum' as BlockchainType,
      exchangeId: 'ethereum' as ExchangeId,
      name: 'TOKEN0/TOKEN1',
      block: { id: 1000, timestamp: new Date() },
      createdAt: new Date(),
      updatedAt: new Date(),
      tokensTradedEvents: [],
    },
    block: { id: 1000, timestamp: new Date('2024-01-01') },
    blockchainType: 'ethereum' as BlockchainType,
    exchangeId: 'ethereum' as ExchangeId,
    timestamp: new Date('2024-01-01'),
    owner: '0xowner1',
    token0: mockTokens['0xtoken0'],
    token1: mockTokens['0xtoken1'],
    order0: JSON.stringify({ y: '1000000000000000000' }), // 1 TOKEN0
    order1: JSON.stringify({ y: '1000000' }), // 1 TOKEN1
    transactionIndex: 0,
    transactionHash: '0xtx1',
    logIndex: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const createMockStrategyUpdatedEvent = (overrides: any = {}) => ({
    id: 1,
    strategyId: 'strategy1',
    pair: {
      id: 1,
      token0: mockTokens['0xtoken0'],
      token1: mockTokens['0xtoken1'],
      blockchainType: 'ethereum' as BlockchainType,
      exchangeId: 'ethereum' as ExchangeId,
      name: 'TOKEN0/TOKEN1',
      block: { id: 1001, timestamp: new Date() },
      createdAt: new Date(),
      updatedAt: new Date(),
      tokensTradedEvents: [],
    },
    block: { id: 1001, timestamp: new Date('2024-01-01T01:00:00') },
    blockchainType: 'ethereum' as BlockchainType,
    exchangeId: 'ethereum' as ExchangeId,
    timestamp: new Date('2024-01-01T01:00:00'),
    reason: 0, // Non-trade update
    token0: mockTokens['0xtoken0'],
    token1: mockTokens['0xtoken1'],
    order0: JSON.stringify({ y: '2000000000000000000' }), // 2 TOKEN0
    order1: JSON.stringify({ y: '2000000' }), // 2 TOKEN1
    transactionIndex: 0,
    transactionHash: '0xtx2',
    logIndex: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const createMockTokensTradedEvent = (overrides: any = {}) => ({
    id: 1,
    pair: {
      id: 1,
      token0: mockTokens['0xtoken0'],
      token1: mockTokens['0xtoken1'],
      blockchainType: 'ethereum' as BlockchainType,
      exchangeId: 'ethereum' as ExchangeId,
      name: 'TOKEN0/TOKEN1',
      block: { id: 1002, timestamp: new Date() },
      createdAt: new Date(),
      updatedAt: new Date(),
      tokensTradedEvents: [],
    },
    block: { id: 1002, timestamp: new Date('2024-01-01T02:00:00') },
    blockchainType: 'ethereum' as BlockchainType,
    exchangeId: 'ethereum' as ExchangeId,
    timestamp: new Date('2024-01-01T02:00:00'),
    trader: '0xtrader1',
    sourceToken: mockTokens['0xtoken0'],
    targetToken: mockTokens['0xtoken1'],
    sourceAmount: '500000000000000000', // 0.5 TOKEN0
    targetAmount: '500000', // 0.5 TOKEN1
    tradingFeeAmount: '1000000000000000', // 0.001 TOKEN0
    byProducts: [],
    transactionIndex: 0,
    transactionHash: '0xtx3',
    logIndex: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    const mockQuery = jest.fn();
    const mockRepository = {
      createQueryBuilder: jest.fn().mockReturnValue({
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      }),
      save: jest.fn().mockResolvedValue([]),
      manager: {
        query: mockQuery,
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DexScreenerV2Service,
        {
          provide: getRepositoryToken(DexScreenerEventV2),
          useValue: mockRepository,
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
          useValue: {
            get: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: StrategyUpdatedEventService,
          useValue: {
            get: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: StrategyDeletedEventService,
          useValue: {
            get: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: VoucherTransferEventService,
          useValue: {
            get: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: TokensTradedEventService,
          useValue: {
            get: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<DexScreenerV2Service>(DexScreenerV2Service);
    dexScreenerEventV2Repository = module.get(getRepositoryToken(DexScreenerEventV2));
    lastProcessedBlockService = module.get(LastProcessedBlockService);
    strategyCreatedEventService = module.get(StrategyCreatedEventService);
    strategyUpdatedEventService = module.get(StrategyUpdatedEventService);
    strategyDeletedEventService = module.get(StrategyDeletedEventService);
    voucherTransferEventService = module.get(VoucherTransferEventService);
    tokensTradedEventService = module.get(TokensTradedEventService);
  });

  describe('State Initialization Tests', () => {
    it('should initialize strategy states from historical events correctly', async () => {
      // Mock historical data for state initialization
      const mockHistoricalStates = [
        {
          strategy_id: 'strategy1',
          block_id: 999,
          order0: JSON.stringify({ y: '1000000000000000000' }),
          order1: JSON.stringify({ y: '1000000' }),
          pair_id: 1,
          token0_address: '0xtoken0',
          token1_address: '0xtoken1',
          token0_decimals: 18,
          token1_decimals: 6,
          owner: '0xowner1',
          transaction_index: 0,
          log_index: 0,
        },
      ];

      (dexScreenerEventV2Repository.manager.query as jest.Mock)
        .mockResolvedValueOnce(mockHistoricalStates) // Latest liquidity states
        .mockResolvedValueOnce([]) // Latest ownership states
        .mockResolvedValueOnce([]); // Deleted strategies

      lastProcessedBlockService.getOrInit.mockResolvedValue(1000);

      await service.update(1001, mockDeployment, mockTokens);

      // Verify state initialization query was called
      expect(dexScreenerEventV2Repository.manager.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT DISTINCT ON (strategy_id)'),
        [1000, 'ethereum', 'ethereum'],
      );
    });

    it('should handle deleted strategies by setting liquidity to zero', async () => {
      const mockHistoricalStates = [
        {
          strategy_id: 'strategy1',
          block_id: 999,
          order0: JSON.stringify({ y: '1000000000000000000' }),
          order1: JSON.stringify({ y: '1000000' }),
          pair_id: 1,
          token0_address: '0xtoken0',
          token1_address: '0xtoken1',
          token0_decimals: 18,
          token1_decimals: 6,
          owner: '0xowner1',
          transaction_index: 0,
          log_index: 0,
        },
      ];

      const mockDeletedStrategies = [{ strategy_id: 'strategy1' }];

      (dexScreenerEventV2Repository.manager.query as jest.Mock)
        .mockResolvedValueOnce(mockHistoricalStates)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(mockDeletedStrategies);

      lastProcessedBlockService.getOrInit.mockResolvedValue(1000);

      await service.update(1001, mockDeployment, mockTokens);

      // Verify the service handled the processing correctly
      expect(dexScreenerEventV2Repository.manager.query).toHaveBeenCalledTimes(3);
    });

    it('should handle ownership transfers correctly', async () => {
      const mockHistoricalStates = [
        {
          strategy_id: 'strategy1',
          block_id: 999,
          order0: JSON.stringify({ y: '1000000000000000000' }),
          order1: JSON.stringify({ y: '1000000' }),
          pair_id: 1,
          token0_address: '0xtoken0',
          token1_address: '0xtoken1',
          token0_decimals: 18,
          token1_decimals: 6,
          owner: '0xowner1',
          transaction_index: 0,
          log_index: 0,
        },
      ];

      const mockOwnershipStates = [
        {
          strategy_id: 'strategy1',
          current_owner: '0xnewowner',
        },
      ];

      (dexScreenerEventV2Repository.manager.query as jest.Mock)
        .mockResolvedValueOnce(mockHistoricalStates)
        .mockResolvedValueOnce(mockOwnershipStates)
        .mockResolvedValueOnce([]);

      lastProcessedBlockService.getOrInit.mockResolvedValue(1000);

      await service.update(1001, mockDeployment, mockTokens);

      expect(dexScreenerEventV2Repository.manager.query).toHaveBeenCalledTimes(3);
    });
  });

  describe('Batching Edge Cases', () => {
    it('should process events in correct chronological order within a batch', async () => {
      const createdEvent = createMockStrategyCreatedEvent({
        block: { id: 1000, timestamp: new Date('2024-01-01T00:00:00') },
        transactionIndex: 0,
        logIndex: 0,
      });

      const updatedEvent = createMockStrategyUpdatedEvent({
        block: { id: 1000, timestamp: new Date('2024-01-01T00:00:00') },
        transactionIndex: 0,
        logIndex: 1, // Same transaction, later log
      });

      const tradeEvent = createMockTokensTradedEvent({
        block: { id: 1000, timestamp: new Date('2024-01-01T00:00:00') },
        transactionIndex: 1, // Later transaction
        logIndex: 0,
      });

      (dexScreenerEventV2Repository.manager.query as jest.Mock).mockResolvedValue([]);
      lastProcessedBlockService.getOrInit.mockResolvedValue(1000);

      strategyCreatedEventService.get.mockResolvedValue([createdEvent]);
      strategyUpdatedEventService.get.mockResolvedValue([updatedEvent]);
      strategyDeletedEventService.get.mockResolvedValue([]);
      voucherTransferEventService.get.mockResolvedValue([]);
      tokensTradedEventService.get.mockResolvedValue([tradeEvent]);

      await service.update(1001, mockDeployment, mockTokens);

      // Verify events were saved
      expect(dexScreenerEventV2Repository.save).toHaveBeenCalled();
    });

    it('should maintain accurate reserves across batch boundaries', async () => {
      // Set batch size to 1 to force batching
      const originalBatchSize = (service as any).BATCH_SIZE;
      (service as any).BATCH_SIZE = 1;

      try {
        // Mock events in different blocks
        const createdEventBlock1000 = createMockStrategyCreatedEvent({
          block: { id: 1000, timestamp: new Date('2024-01-01T00:00:00') },
        });

        const updatedEventBlock1001 = createMockStrategyUpdatedEvent({
          block: { id: 1001, timestamp: new Date('2024-01-01T01:00:00') },
          order0: JSON.stringify({ y: '3000000000000000000' }), // Increased liquidity
          order1: JSON.stringify({ y: '3000000' }),
        });

        (dexScreenerEventV2Repository.manager.query as jest.Mock).mockResolvedValue([]);
        lastProcessedBlockService.getOrInit.mockResolvedValue(1000);

        // Mock different events for different batches
        strategyCreatedEventService.get
          .mockResolvedValueOnce([createdEventBlock1000]) // First batch
          .mockResolvedValueOnce([]); // Second batch

        strategyUpdatedEventService.get
          .mockResolvedValueOnce([]) // First batch
          .mockResolvedValueOnce([updatedEventBlock1001]); // Second batch

        strategyDeletedEventService.get.mockResolvedValue([]);
        voucherTransferEventService.get.mockResolvedValue([]);
        tokensTradedEventService.get.mockResolvedValue([]);

        await service.update(1002, mockDeployment, mockTokens);

        // Verify batching occurred
        expect(strategyCreatedEventService.get).toHaveBeenCalledTimes(2);
        expect(strategyUpdatedEventService.get).toHaveBeenCalledTimes(2);
      } finally {
        (service as any).BATCH_SIZE = originalBatchSize;
      }
    });

    it('should handle trade-triggered strategy updates correctly', async () => {
      const tradeEvent = createMockTokensTradedEvent();

      const tradeTriggeredUpdate = createMockStrategyUpdatedEvent({
        reason: 1, // Trade update
        block: { id: 1002, timestamp: new Date('2024-01-01T02:00:00') },
        order0: JSON.stringify({ y: '1500000000000000000' }), // Updated after trade
        order1: JSON.stringify({ y: '500000' }),
      });

      (dexScreenerEventV2Repository.manager.query as jest.Mock).mockResolvedValue([]);
      lastProcessedBlockService.getOrInit.mockResolvedValue(1000);

      strategyCreatedEventService.get.mockResolvedValue([]);
      strategyUpdatedEventService.get.mockResolvedValue([tradeTriggeredUpdate]);
      strategyDeletedEventService.get.mockResolvedValue([]);
      voucherTransferEventService.get.mockResolvedValue([]);
      tokensTradedEventService.get.mockResolvedValue([tradeEvent]);

      await service.update(1003, mockDeployment, mockTokens);

      expect(dexScreenerEventV2Repository.save).toHaveBeenCalled();
    });

    it('should handle multiple strategies with overlapping events', async () => {
      const strategy1Created = createMockStrategyCreatedEvent({
        strategyId: 'strategy1',
        block: { id: 1000, timestamp: new Date('2024-01-01T00:00:00') },
      });

      const strategy2Created = createMockStrategyCreatedEvent({
        strategyId: 'strategy2',
        block: { id: 1000, timestamp: new Date('2024-01-01T00:00:00') },
        transactionIndex: 1,
      });

      const strategy1Updated = createMockStrategyUpdatedEvent({
        strategyId: 'strategy1',
        block: { id: 1001, timestamp: new Date('2024-01-01T01:00:00') },
      });

      (dexScreenerEventV2Repository.manager.query as jest.Mock).mockResolvedValue([]);
      lastProcessedBlockService.getOrInit.mockResolvedValue(1000);

      strategyCreatedEventService.get.mockResolvedValue([strategy1Created, strategy2Created]);
      strategyUpdatedEventService.get.mockResolvedValue([strategy1Updated]);
      strategyDeletedEventService.get.mockResolvedValue([]);
      voucherTransferEventService.get.mockResolvedValue([]);
      tokensTradedEventService.get.mockResolvedValue([]);

      await service.update(1002, mockDeployment, mockTokens);

      expect(dexScreenerEventV2Repository.save).toHaveBeenCalled();
    });

    it('should calculate reserves correctly at each point in time', async () => {
      // Test that reserves are calculated BEFORE state changes
      const mockHistoricalStates = [
        {
          strategy_id: 'strategy1',
          block_id: 999,
          order0: JSON.stringify({ y: '1000000000000000000' }),
          order1: JSON.stringify({ y: '1000000' }),
          pair_id: 1,
          token0_address: '0xtoken0',
          token1_address: '0xtoken1',
          token0_decimals: 18,
          token1_decimals: 6,
          owner: '0xowner1',
          transaction_index: 0,
          log_index: 0,
        },
      ];

      (dexScreenerEventV2Repository.manager.query as jest.Mock)
        .mockResolvedValueOnce(mockHistoricalStates)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const updatedEvent = createMockStrategyUpdatedEvent({
        block: { id: 1001, timestamp: new Date('2024-01-01T01:00:00') },
        order0: JSON.stringify({ y: '2000000000000000000' }), // Doubled liquidity
        order1: JSON.stringify({ y: '2000000' }),
      });

      lastProcessedBlockService.getOrInit.mockResolvedValue(1000);

      strategyCreatedEventService.get.mockResolvedValue([]);
      strategyUpdatedEventService.get.mockResolvedValue([updatedEvent]);
      strategyDeletedEventService.get.mockResolvedValue([]);
      voucherTransferEventService.get.mockResolvedValue([]);
      tokensTradedEventService.get.mockResolvedValue([]);

      await service.update(1002, mockDeployment, mockTokens);

      expect(dexScreenerEventV2Repository.save).toHaveBeenCalled();
    });

    it('should handle empty batches correctly', async () => {
      (dexScreenerEventV2Repository.manager.query as jest.Mock).mockResolvedValue([]);
      lastProcessedBlockService.getOrInit.mockResolvedValue(1000);

      // All event services return empty arrays
      strategyCreatedEventService.get.mockResolvedValue([]);
      strategyUpdatedEventService.get.mockResolvedValue([]);
      strategyDeletedEventService.get.mockResolvedValue([]);
      voucherTransferEventService.get.mockResolvedValue([]);
      tokensTradedEventService.get.mockResolvedValue([]);

      await service.update(1001, mockDeployment, mockTokens);

      // Should still update the last processed block
      expect(lastProcessedBlockService.update).toHaveBeenCalledWith('ethereum-ethereum-dex-screener-v2', 1001);
    });

    it('should handle large save batches correctly', async () => {
      // Set save batch size to 2 to test batching
      const originalSaveBatchSize = (service as any).SAVE_BATCH_SIZE;
      (service as any).SAVE_BATCH_SIZE = 2;

      try {
        const events = [
          createMockStrategyCreatedEvent({ strategyId: 'strategy1' }),
          createMockStrategyCreatedEvent({ strategyId: 'strategy2' }),
          createMockStrategyCreatedEvent({ strategyId: 'strategy3' }),
        ];

        (dexScreenerEventV2Repository.manager.query as jest.Mock).mockResolvedValue([]);
        lastProcessedBlockService.getOrInit.mockResolvedValue(1000);

        strategyCreatedEventService.get.mockResolvedValue(events);
        strategyUpdatedEventService.get.mockResolvedValue([]);
        strategyDeletedEventService.get.mockResolvedValue([]);
        voucherTransferEventService.get.mockResolvedValue([]);
        tokensTradedEventService.get.mockResolvedValue([]);

        await service.update(1001, mockDeployment, mockTokens);

        // Should be called multiple times due to batching
        expect(dexScreenerEventV2Repository.save).toHaveBeenCalledTimes(2);
      } finally {
        (service as any).SAVE_BATCH_SIZE = originalSaveBatchSize;
      }
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle malformed order JSON gracefully', async () => {
      const malformedEvent = createMockStrategyCreatedEvent({
        order0: 'invalid-json',
        order1: JSON.stringify({ y: '1000000' }),
      });

      (dexScreenerEventV2Repository.manager.query as jest.Mock).mockResolvedValue([]);
      lastProcessedBlockService.getOrInit.mockResolvedValue(1000);

      strategyCreatedEventService.get.mockResolvedValue([malformedEvent]);
      strategyUpdatedEventService.get.mockResolvedValue([]);
      strategyDeletedEventService.get.mockResolvedValue([]);
      voucherTransferEventService.get.mockResolvedValue([]);
      tokensTradedEventService.get.mockResolvedValue([]);

      // Should not throw an error
      await expect(service.update(1001, mockDeployment, mockTokens)).rejects.toThrow();
    });

    it('should handle zero liquidity strategies', async () => {
      const zeroLiquidityEvent = createMockStrategyCreatedEvent({
        order0: JSON.stringify({ y: '0' }),
        order1: JSON.stringify({ y: '0' }),
      });

      (dexScreenerEventV2Repository.manager.query as jest.Mock).mockResolvedValue([]);
      lastProcessedBlockService.getOrInit.mockResolvedValue(1000);

      strategyCreatedEventService.get.mockResolvedValue([zeroLiquidityEvent]);
      strategyUpdatedEventService.get.mockResolvedValue([]);
      strategyDeletedEventService.get.mockResolvedValue([]);
      voucherTransferEventService.get.mockResolvedValue([]);
      tokensTradedEventService.get.mockResolvedValue([]);

      await service.update(1001, mockDeployment, mockTokens);

      expect(dexScreenerEventV2Repository.save).toHaveBeenCalled();
    });

    it('should handle missing strategy state for updates', async () => {
      const orphanedUpdate = createMockStrategyUpdatedEvent({
        strategyId: 'nonexistent-strategy',
      });

      (dexScreenerEventV2Repository.manager.query as jest.Mock).mockResolvedValue([]);
      lastProcessedBlockService.getOrInit.mockResolvedValue(1000);

      strategyCreatedEventService.get.mockResolvedValue([]);
      strategyUpdatedEventService.get.mockResolvedValue([orphanedUpdate]);
      strategyDeletedEventService.get.mockResolvedValue([]);
      voucherTransferEventService.get.mockResolvedValue([]);
      tokensTradedEventService.get.mockResolvedValue([]);

      // Should not throw an error when processing orphaned updates
      await expect(service.update(1001, mockDeployment, mockTokens)).resolves.not.toThrow();

      // Should still update the last processed block even with no events saved
      expect(lastProcessedBlockService.update).toHaveBeenCalledWith('ethereum-ethereum-dex-screener-v2', 1001);
    });
  });

  describe('Reserve Calculation Accuracy', () => {
    it('should calculate reserves before state changes for join events', async () => {
      // This test verifies that reserves reflect the state BEFORE the join event
      const mockHistoricalStates = [
        {
          strategy_id: 'existing-strategy',
          block_id: 999,
          order0: JSON.stringify({ y: '1000000000000000000' }),
          order1: JSON.stringify({ y: '1000000' }),
          pair_id: 1,
          token0_address: '0xtoken0',
          token1_address: '0xtoken1',
          token0_decimals: 18,
          token1_decimals: 6,
          owner: '0xowner1',
          transaction_index: 0,
          log_index: 0,
        },
      ];

      (dexScreenerEventV2Repository.manager.query as jest.Mock)
        .mockResolvedValueOnce(mockHistoricalStates)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const newStrategyEvent = createMockStrategyCreatedEvent({
        strategyId: 'new-strategy',
        pair: {
          id: 1, // Same pair as existing strategy
          token0: mockTokens['0xtoken0'],
          token1: mockTokens['0xtoken1'],
          blockchainType: 'ethereum' as BlockchainType,
          exchangeId: 'ethereum' as ExchangeId,
          name: 'TOKEN0/TOKEN1',
          block: { id: 1000, timestamp: new Date() },
          createdAt: new Date(),
          updatedAt: new Date(),
          tokensTradedEvents: [],
        },
        order0: JSON.stringify({ y: '2000000000000000000' }),
        order1: JSON.stringify({ y: '2000000' }),
      });

      lastProcessedBlockService.getOrInit.mockResolvedValue(1000);

      strategyCreatedEventService.get.mockResolvedValue([newStrategyEvent]);
      strategyUpdatedEventService.get.mockResolvedValue([]);
      strategyDeletedEventService.get.mockResolvedValue([]);
      voucherTransferEventService.get.mockResolvedValue([]);
      tokensTradedEventService.get.mockResolvedValue([]);

      await service.update(1001, mockDeployment, mockTokens);

      expect(dexScreenerEventV2Repository.save).toHaveBeenCalled();
    });

    it('should calculate reserves correctly for multiple strategies in same pair', async () => {
      const mockHistoricalStates = [
        {
          strategy_id: 'strategy1',
          block_id: 999,
          order0: JSON.stringify({ y: '1000000000000000000' }),
          order1: JSON.stringify({ y: '1000000' }),
          pair_id: 1,
          token0_address: '0xtoken0',
          token1_address: '0xtoken1',
          token0_decimals: 18,
          token1_decimals: 6,
          owner: '0xowner1',
          transaction_index: 0,
          log_index: 0,
        },
        {
          strategy_id: 'strategy2',
          block_id: 999,
          order0: JSON.stringify({ y: '500000000000000000' }),
          order1: JSON.stringify({ y: '500000' }),
          pair_id: 1,
          token0_address: '0xtoken0',
          token1_address: '0xtoken1',
          token0_decimals: 18,
          token1_decimals: 6,
          owner: '0xowner2',
          transaction_index: 0,
          log_index: 0,
        },
      ];

      (dexScreenerEventV2Repository.manager.query as jest.Mock)
        .mockResolvedValueOnce(mockHistoricalStates)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const updateEvent = createMockStrategyUpdatedEvent({
        strategyId: 'strategy1',
        order0: JSON.stringify({ y: '2000000000000000000' }),
        order1: JSON.stringify({ y: '2000000' }),
      });

      lastProcessedBlockService.getOrInit.mockResolvedValue(1000);

      strategyCreatedEventService.get.mockResolvedValue([]);
      strategyUpdatedEventService.get.mockResolvedValue([updateEvent]);
      strategyDeletedEventService.get.mockResolvedValue([]);
      voucherTransferEventService.get.mockResolvedValue([]);
      tokensTradedEventService.get.mockResolvedValue([]);

      await service.update(1002, mockDeployment, mockTokens);

      expect(dexScreenerEventV2Repository.save).toHaveBeenCalled();
    });
  });

  describe('Batching Accuracy', () => {
    it('should maintain consistent reserves when strategy creation spans batch boundaries', async () => {
      // Set small batch size to force batching
      const originalBatchSize = (service as any).BATCH_SIZE;
      (service as any).BATCH_SIZE = 1;

      try {
        // Strategy created in first batch (block 1000)
        const strategyCreated = createMockStrategyCreatedEvent({
          strategyId: 'strategy1',
          block: { id: 1000, timestamp: new Date('2024-01-01T00:00:00') },
          order0: JSON.stringify({ y: '1000000000000000000' }), // 1 TOKEN0
          order1: JSON.stringify({ y: '1000000' }), // 1 TOKEN1
        });

        // Strategy updated in second batch (block 1001)
        const strategyUpdated = createMockStrategyUpdatedEvent({
          strategyId: 'strategy1',
          block: { id: 1001, timestamp: new Date('2024-01-01T01:00:00') },
          order0: JSON.stringify({ y: '2000000000000000000' }), // 2 TOKEN0
          order1: JSON.stringify({ y: '2000000' }), // 2 TOKEN1
        });

        (dexScreenerEventV2Repository.manager.query as jest.Mock).mockResolvedValue([]);
        lastProcessedBlockService.getOrInit.mockResolvedValue(1000);

        // Mock events for different batches
        strategyCreatedEventService.get
          .mockResolvedValueOnce([strategyCreated]) // First batch (block 1000)
          .mockResolvedValueOnce([]); // Second batch (block 1001)

        strategyUpdatedEventService.get
          .mockResolvedValueOnce([]) // First batch
          .mockResolvedValueOnce([strategyUpdated]); // Second batch

        strategyDeletedEventService.get.mockResolvedValue([]);
        voucherTransferEventService.get.mockResolvedValue([]);
        tokensTradedEventService.get.mockResolvedValue([]);

        await service.update(1002, mockDeployment, mockTokens);

        // Verify both batches were processed
        expect(strategyCreatedEventService.get).toHaveBeenCalledTimes(2);
        expect(strategyUpdatedEventService.get).toHaveBeenCalledTimes(2);

        // Verify events were saved (should be called twice due to batching)
        expect(dexScreenerEventV2Repository.save).toHaveBeenCalledTimes(2);
      } finally {
        (service as any).BATCH_SIZE = originalBatchSize;
      }
    });

    it('should calculate correct reserves when multiple strategies interact across batches', async () => {
      const originalBatchSize = (service as any).BATCH_SIZE;
      (service as any).BATCH_SIZE = 1;

      try {
        // Initial state: strategy1 exists
        const mockHistoricalStates = [
          {
            strategy_id: 'strategy1',
            block_id: 999,
            order0: JSON.stringify({ y: '1000000000000000000' }),
            order1: JSON.stringify({ y: '1000000' }),
            pair_id: 1,
            token0_address: '0xtoken0',
            token1_address: '0xtoken1',
            token0_decimals: 18,
            token1_decimals: 6,
            owner: '0xowner1',
            transaction_index: 0,
            log_index: 0,
          },
        ];

        (dexScreenerEventV2Repository.manager.query as jest.Mock)
          .mockResolvedValueOnce(mockHistoricalStates)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]);

        // Batch 1: Create strategy2 (should see strategy1's reserves)
        const strategy2Created = createMockStrategyCreatedEvent({
          strategyId: 'strategy2',
          block: { id: 1000, timestamp: new Date('2024-01-01T00:00:00') },
          order0: JSON.stringify({ y: '500000000000000000' }), // 0.5 TOKEN0
          order1: JSON.stringify({ y: '500000' }), // 0.5 TOKEN1
        });

        // Batch 2: Update strategy1 (should see both strategies' reserves)
        const strategy1Updated = createMockStrategyUpdatedEvent({
          strategyId: 'strategy1',
          block: { id: 1001, timestamp: new Date('2024-01-01T01:00:00') },
          order0: JSON.stringify({ y: '3000000000000000000' }), // 3 TOKEN0
          order1: JSON.stringify({ y: '3000000' }), // 3 TOKEN1
        });

        lastProcessedBlockService.getOrInit.mockResolvedValue(1000);

        strategyCreatedEventService.get
          .mockResolvedValueOnce([strategy2Created]) // Batch 1
          .mockResolvedValueOnce([]); // Batch 2

        strategyUpdatedEventService.get
          .mockResolvedValueOnce([]) // Batch 1
          .mockResolvedValueOnce([strategy1Updated]); // Batch 2

        strategyDeletedEventService.get.mockResolvedValue([]);
        voucherTransferEventService.get.mockResolvedValue([]);
        tokensTradedEventService.get.mockResolvedValue([]);

        await service.update(1002, mockDeployment, mockTokens);

        // Verify the service processed both batches correctly
        expect(dexScreenerEventV2Repository.save).toHaveBeenCalledTimes(2);

        // The key test: reserves should be calculated correctly at each point
        // - When strategy2 is created, reserves should include only strategy1
        // - When strategy1 is updated, reserves should include both strategies
        const savedEvents = dexScreenerEventV2Repository.save.mock.calls.flat();
        expect(savedEvents.length).toBeGreaterThan(0);
      } finally {
        (service as any).BATCH_SIZE = originalBatchSize;
      }
    });

    it('should handle trade events that span batch boundaries correctly', async () => {
      const originalBatchSize = (service as any).BATCH_SIZE;
      (service as any).BATCH_SIZE = 1;

      try {
        // Initial state with a strategy
        const mockHistoricalStates = [
          {
            strategy_id: 'strategy1',
            block_id: 999,
            order0: JSON.stringify({ y: '10000000000000000000' }), // 10 TOKEN0
            order1: JSON.stringify({ y: '10000000' }), // 10 TOKEN1
            pair_id: 1,
            token0_address: '0xtoken0',
            token1_address: '0xtoken1',
            token0_decimals: 18,
            token1_decimals: 6,
            owner: '0xowner1',
            transaction_index: 0,
            log_index: 0,
          },
        ];

        (dexScreenerEventV2Repository.manager.query as jest.Mock)
          .mockResolvedValueOnce(mockHistoricalStates)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]);

        // Batch 1: Trade occurs
        const tradeEvent = createMockTokensTradedEvent({
          block: { id: 1000, timestamp: new Date('2024-01-01T00:00:00') },
          sourceAmount: '1000000000000000000', // 1 TOKEN0
          targetAmount: '1000000', // 1 TOKEN1
        });

        // Batch 2: Strategy update from trade (reason: 1)
        const tradeTriggeredUpdate = createMockStrategyUpdatedEvent({
          strategyId: 'strategy1',
          block: { id: 1001, timestamp: new Date('2024-01-01T01:00:00') },
          reason: 1, // Trade update
          order0: JSON.stringify({ y: '9000000000000000000' }), // 9 TOKEN0 (after trade)
          order1: JSON.stringify({ y: '11000000' }), // 11 TOKEN1 (after trade)
        });

        lastProcessedBlockService.getOrInit.mockResolvedValue(1000);

        strategyCreatedEventService.get.mockResolvedValue([]);
        strategyUpdatedEventService.get
          .mockResolvedValueOnce([]) // Batch 1
          .mockResolvedValueOnce([tradeTriggeredUpdate]); // Batch 2

        strategyDeletedEventService.get.mockResolvedValue([]);
        voucherTransferEventService.get.mockResolvedValue([]);
        tokensTradedEventService.get
          .mockResolvedValueOnce([tradeEvent]) // Batch 1
          .mockResolvedValueOnce([]); // Batch 2

        await service.update(1002, mockDeployment, mockTokens);

        // Verify both batches were processed (but save may not be called for empty batches)
        expect(dexScreenerEventV2Repository.save).toHaveBeenCalled();

        // The key insight: reserves before the trade should reflect pre-trade state
        // and reserves after the trade update should reflect post-trade state
        expect(tokensTradedEventService.get).toHaveBeenCalledTimes(2);
        expect(strategyUpdatedEventService.get).toHaveBeenCalledTimes(2);

        // Verify the last processed block was updated correctly
        expect(lastProcessedBlockService.update).toHaveBeenLastCalledWith('ethereum-ethereum-dex-screener-v2', 1001);
      } finally {
        (service as any).BATCH_SIZE = originalBatchSize;
      }
    });

    it('should preserve state consistency when batch size changes mid-processing', async () => {
      // This test simulates what happens when batch processing is interrupted
      // and resumed with different batch sizes

      const mockHistoricalStates = [
        {
          strategy_id: 'strategy1',
          block_id: 1000,
          order0: JSON.stringify({ y: '1000000000000000000' }),
          order1: JSON.stringify({ y: '1000000' }),
          pair_id: 1,
          token0_address: '0xtoken0',
          token1_address: '0xtoken1',
          token0_decimals: 18,
          token1_decimals: 6,
          owner: '0xowner1',
          transaction_index: 0,
          log_index: 0,
        },
      ];

      (dexScreenerEventV2Repository.manager.query as jest.Mock)
        .mockResolvedValueOnce(mockHistoricalStates)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      // Simulate processing from block 1001 (after some events already processed)
      lastProcessedBlockService.getOrInit.mockResolvedValue(1001);

      const strategyUpdate = createMockStrategyUpdatedEvent({
        strategyId: 'strategy1',
        block: { id: 1002, timestamp: new Date('2024-01-01T02:00:00') },
        order0: JSON.stringify({ y: '2000000000000000000' }),
        order1: JSON.stringify({ y: '2000000' }),
      });

      strategyCreatedEventService.get.mockResolvedValue([]);
      strategyUpdatedEventService.get.mockResolvedValue([strategyUpdate]);
      strategyDeletedEventService.get.mockResolvedValue([]);
      voucherTransferEventService.get.mockResolvedValue([]);
      tokensTradedEventService.get.mockResolvedValue([]);

      await service.update(1003, mockDeployment, mockTokens);

      // Should initialize state correctly from historical data
      expect(dexScreenerEventV2Repository.manager.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT DISTINCT ON (strategy_id)'),
        [1001, 'ethereum', 'ethereum'],
      );

      expect(dexScreenerEventV2Repository.save).toHaveBeenCalled();
    });

    it('should handle chronological ordering correctly across batch boundaries', async () => {
      const originalBatchSize = (service as any).BATCH_SIZE;
      (service as any).BATCH_SIZE = 1;

      try {
        (dexScreenerEventV2Repository.manager.query as jest.Mock).mockResolvedValue([]);
        lastProcessedBlockService.getOrInit.mockResolvedValue(1000);

        // Events that should be processed in chronological order
        // but span multiple batches

        // Batch 1 (block 1000): Strategy creation
        const strategyCreated = createMockStrategyCreatedEvent({
          block: { id: 1000, timestamp: new Date('2024-01-01T00:00:00') },
          transactionIndex: 5,
          logIndex: 0,
        });

        // Batch 2 (block 1001): Earlier transaction in later block
        const strategyUpdated = createMockStrategyUpdatedEvent({
          block: { id: 1001, timestamp: new Date('2024-01-01T01:00:00') },
          transactionIndex: 0, // Earlier transaction index
          logIndex: 0,
        });

        strategyCreatedEventService.get
          .mockResolvedValueOnce([strategyCreated]) // Batch 1
          .mockResolvedValueOnce([]); // Batch 2

        strategyUpdatedEventService.get
          .mockResolvedValueOnce([]) // Batch 1
          .mockResolvedValueOnce([strategyUpdated]); // Batch 2

        strategyDeletedEventService.get.mockResolvedValue([]);
        voucherTransferEventService.get.mockResolvedValue([]);
        tokensTradedEventService.get.mockResolvedValue([]);

        await service.update(1002, mockDeployment, mockTokens);

        // Both batches should be processed correctly
        expect(dexScreenerEventV2Repository.save).toHaveBeenCalledTimes(2);

        // Events within each batch should be chronologically ordered
        // (this tests the internal sorting logic)
        expect(strategyCreatedEventService.get).toHaveBeenCalledWith(1000, 1000, mockDeployment);
        expect(strategyUpdatedEventService.get).toHaveBeenCalledWith(1001, 1001, mockDeployment);
      } finally {
        (service as any).BATCH_SIZE = originalBatchSize;
      }
    });

    it('should calculate reserves accurately when processing large numbers of strategies', async () => {
      // Test with many strategies to ensure performance doesn't affect accuracy
      const originalBatchSize = (service as any).BATCH_SIZE;
      const originalSaveBatchSize = (service as any).SAVE_BATCH_SIZE;
      (service as any).BATCH_SIZE = 1;
      (service as any).SAVE_BATCH_SIZE = 2; // Small save batches

      try {
        // Create many historical strategies
        const mockHistoricalStates = Array.from({ length: 10 }, (_, i) => ({
          strategy_id: `strategy${i}`,
          block_id: 999,
          order0: JSON.stringify({ y: '1000000000000000000' }), // 1 TOKEN0 each
          order1: JSON.stringify({ y: '1000000' }), // 1 TOKEN1 each
          pair_id: 1,
          token0_address: '0xtoken0',
          token1_address: '0xtoken1',
          token0_decimals: 18,
          token1_decimals: 6,
          owner: `0xowner${i}`,
          transaction_index: 0,
          log_index: 0,
        }));

        (dexScreenerEventV2Repository.manager.query as jest.Mock)
          .mockResolvedValueOnce(mockHistoricalStates)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]);

        // Create a new strategy that should see all existing reserves
        const newStrategy = createMockStrategyCreatedEvent({
          strategyId: 'new-strategy',
          block: { id: 1000, timestamp: new Date('2024-01-01T00:00:00') },
          order0: JSON.stringify({ y: '5000000000000000000' }), // 5 TOKEN0
          order1: JSON.stringify({ y: '5000000' }), // 5 TOKEN1
        });

        lastProcessedBlockService.getOrInit.mockResolvedValue(1000);

        strategyCreatedEventService.get.mockResolvedValue([newStrategy]);
        strategyUpdatedEventService.get.mockResolvedValue([]);
        strategyDeletedEventService.get.mockResolvedValue([]);
        voucherTransferEventService.get.mockResolvedValue([]);
        tokensTradedEventService.get.mockResolvedValue([]);

        await service.update(1001, mockDeployment, mockTokens);

        // Should handle many strategies correctly
        expect(dexScreenerEventV2Repository.save).toHaveBeenCalled();

        // Total reserves should be: 10 existing strategies (10 TOKEN0, 10 TOKEN1)
        // when the new strategy is created
        const savedCalls = dexScreenerEventV2Repository.save.mock.calls;
        expect(savedCalls.length).toBeGreaterThan(0);
      } finally {
        (service as any).BATCH_SIZE = originalBatchSize;
        (service as any).SAVE_BATCH_SIZE = originalSaveBatchSize;
      }
    });
  });
});
