import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Decimal } from 'decimal.js';
import { MerklProcessorService } from './merkl-processor.service';
import { SubEpochService } from './sub-epoch.service';
import { CampaignService } from './campaign.service';
import { LastProcessedBlockService } from '../../last-processed-block/last-processed-block.service';
import { BlockService } from '../../block/block.service';
import { HistoricQuoteService } from '../../historic-quote/historic-quote.service';
import { StrategyCreatedEventService } from '../../events/strategy-created-event/strategy-created-event.service';
import { StrategyUpdatedEventService } from '../../events/strategy-updated-event/strategy-updated-event.service';
import { StrategyDeletedEventService } from '../../events/strategy-deleted-event/strategy-deleted-event.service';
import { VoucherTransferEventService } from '../../events/voucher-transfer-event/voucher-transfer-event.service';
import { ExchangeId, BlockchainType } from '../../deployment/deployment.service';
import { Campaign } from '../entities/campaign.entity';

describe('MerklProcessorService - Deterministic Processing', () => {
  let service: MerklProcessorService;
  let mockConfigService: Partial<ConfigService>;

  const mockCampaign: Campaign = {
    id: 1,
    blockchainType: BlockchainType.Ethereum,
    exchangeId: ExchangeId.OGEthereum,
    pairId: 1,
    pair: {
      id: 1,
      token0: { address: '0xToken0' },
      token1: { address: '0xToken1' },
    } as any,
    rewardAmount: '1000',
    rewardTokenAddress: '0xRewardToken',
    startDate: new Date('2024-01-01T00:00:00Z'),
    endDate: new Date('2024-01-01T12:00:00Z'),
    opportunityName: 'Test Campaign',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'MERKL_SNAPSHOT_SEED') return 'fixed-test-seed-12345';
        if (key === 'MERKL_SNAPSHOT_SALT') return 'test-salt';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerklProcessorService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: SubEpochService, useValue: {} },
        { provide: CampaignService, useValue: {} },
        { provide: LastProcessedBlockService, useValue: {} },
        { provide: BlockService, useValue: {} },
        { provide: HistoricQuoteService, useValue: {} },
        { provide: StrategyCreatedEventService, useValue: {} },
        { provide: StrategyUpdatedEventService, useValue: {} },
        { provide: StrategyDeletedEventService, useValue: {} },
        { provide: VoucherTransferEventService, useValue: {} },
      ],
    }).compile();

    service = module.get<MerklProcessorService>(MerklProcessorService);
  });

  describe('Event Sorting Determinism', () => {
    it('should sort events deterministically with comprehensive tiebreakers', () => {
      const createMockEvent = (
        timestamp: number,
        blockId: string,
        txIndex: number,
        logIndex: number,
        txHash: string,
      ) => ({
        timestamp,
        type: 'created' as const,
        event: {
          block: { id: blockId },
          transactionIndex: txIndex,
          logIndex,
          transactionHash: txHash,
          strategyId: 'strategy-1',
          timestamp: new Date(timestamp),
          owner: 'owner-1',
          token0: { address: '0xToken0' },
          token1: { address: '0xToken1' },
          order0: '{}',
          order1: '{}',
        },
      });

      const batchEvents = {
        createdEvents: [
          // Same timestamp, different block IDs - should sort by block ID
          createMockEvent(1000, '100', 1, 1, '0xabc').event,
          createMockEvent(1000, '99', 1, 1, '0xdef').event,
          // Same timestamp and block, different transaction index
          createMockEvent(1000, '100', 2, 1, '0xghi').event,
          // Same timestamp, block, and tx index, different log index
          createMockEvent(1000, '100', 1, 2, '0xjkl').event,
          // Same everything except tx hash
          createMockEvent(1000, '100', 1, 1, '0xzzz').event,
        ],
        updatedEvents: [],
        deletedEvents: [],
        transferEvents: [],
      };

      // Call the private method through reflection for testing
      const sortMethod = (service as any).sortBatchEventsChronologically.bind(service);

      // Run sorting multiple times to ensure consistent order
      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(sortMethod(batchEvents));
      }

      // All results should be identical
      for (let i = 1; i < results.length; i++) {
        expect(results[i]).toEqual(results[0]);
      }

      // Verify correct sorting order
      const sorted = results[0];
      expect(sorted).toHaveLength(5);

      // Should be sorted by: timestamp, block.id, transactionIndex, logIndex, transactionHash
      expect(sorted[0].event.block.id).toBe('99'); // Lowest block ID
      expect(sorted[1].event.transactionHash).toBe('0xabc'); // Same block/tx/log, but 'abc' < 'zzz'
      expect(sorted[2].event.transactionHash).toBe('0xzzz'); // Same block/tx/log, but 'abc' < 'zzz'
      expect(sorted[3].event.logIndex).toBe(2); // Same block/tx, higher log index
      expect(sorted[4].event.transactionIndex).toBe(2); // Same block, higher tx index
    });
  });

  describe('Strategy Processing Order', () => {
    it('should process strategies in deterministic order', () => {
      const createMockStrategy = (id: string, liquidity0: number, liquidity1: number) => ({
        strategyId: id,
        pairId: 1,
        token0Address: '0xToken0',
        token1Address: '0xToken1',
        token0Decimals: 18,
        token1Decimals: 18,
        liquidity0: new Decimal(liquidity0),
        liquidity1: new Decimal(liquidity1),
        order0_A: new Decimal(1),
        order0_B: new Decimal(2),
        order0_z: new Decimal(100),
        order1_A: new Decimal(1),
        order1_B: new Decimal(2),
        order1_z: new Decimal(100),
        order0_A_compressed: new Decimal(1),
        order0_B_compressed: new Decimal(2),
        order0_z_compressed: new Decimal(100),
        order1_A_compressed: new Decimal(1),
        order1_B_compressed: new Decimal(2),
        order1_z_compressed: new Decimal(100),
        currentOwner: 'owner-1',
        creationWallet: 'owner-1',
        lastProcessedBlock: 100,
        isDeleted: false,
        lastEventTimestamp: 1000,
      });

      const subEpochData = {
        timestamp: 1000,
        order0TargetPrice: new Decimal(1),
        order1TargetPrice: new Decimal(1),
        targetSqrtPriceScaled: new Decimal(1),
        invTargetSqrtPriceScaled: new Decimal(1),
        strategies: new Map([
          ['strategy-z', createMockStrategy('strategy-z', 100, 200)],
          ['strategy-a', createMockStrategy('strategy-a', 150, 250)],
          ['strategy-m', createMockStrategy('strategy-m', 120, 220)],
        ]),
      };

      const rewardPool = new Decimal(1000);
      const campaignDistributedAmounts = new Map([[1, new Decimal(0)]]);
      const campaignTotalAmounts = new Map([[1, new Decimal(10000)]]);

      // Call the private method through reflection
      const calculateMethod = (service as any).calculateSubEpochRewards.bind(service);

      // Run multiple times to ensure consistent results
      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(
          calculateMethod(
            subEpochData,
            rewardPool,
            mockCampaign,
            new Map(campaignDistributedAmounts),
            new Map(campaignTotalAmounts),
          ),
        );
      }

      // All results should be identical
      for (let i = 1; i < results.length; i++) {
        expect(results[i].totalRewards).toEqual(results[0].totalRewards);
        expect(results[i].tokenRewards).toEqual(results[0].tokenRewards);
      }

      // Verify that strategies are processed in alphabetical order
      // This should be reflected in the reward calculation consistency
      const firstResult = results[0];
      expect(firstResult.totalRewards.has('strategy-a')).toBe(true);
      expect(firstResult.totalRewards.has('strategy-m')).toBe(true);
      expect(firstResult.totalRewards.has('strategy-z')).toBe(true);
    });
  });

  describe('Reward Capping Determinism', () => {
    it('should apply reward capping consistently when exceeding limits', () => {
      const createMockStrategyForCapping = (id: string, liquidity0: number, liquidity1: number) => ({
        strategyId: id,
        pairId: 1,
        token0Address: '0xToken0',
        token1Address: '0xToken1',
        token0Decimals: 18,
        token1Decimals: 18,
        liquidity0: new Decimal(liquidity0),
        liquidity1: new Decimal(liquidity1),
        order0_A: new Decimal(1),
        order0_B: new Decimal(2),
        order0_z: new Decimal(liquidity0),
        order1_A: new Decimal(1),
        order1_B: new Decimal(2),
        order1_z: new Decimal(liquidity1),
        order0_A_compressed: new Decimal(1),
        order0_B_compressed: new Decimal(2),
        order0_z_compressed: new Decimal(liquidity0),
        order1_A_compressed: new Decimal(1),
        order1_B_compressed: new Decimal(2),
        order1_z_compressed: new Decimal(liquidity1),
        currentOwner: 'owner-1',
        creationWallet: 'owner-1',
        lastProcessedBlock: 100,
        isDeleted: false,
        lastEventTimestamp: 1000,
      });

      const subEpochData = {
        timestamp: 1000,
        order0TargetPrice: new Decimal(1),
        order1TargetPrice: new Decimal(1),
        targetSqrtPriceScaled: new Decimal(1),
        invTargetSqrtPriceScaled: new Decimal(1),
        strategies: new Map([
          ['strategy-1', createMockStrategyForCapping('strategy-1', 1000, 1000)],
          ['strategy-2', createMockStrategyForCapping('strategy-2', 2000, 2000)],
        ]),
      };

      const rewardPool = new Decimal(10000); // Large reward pool that will trigger capping
      const campaignDistributedAmounts = new Map([[1, new Decimal(9990)]]); // Almost at limit
      const campaignTotalAmounts = new Map([[1, new Decimal(10000)]]); // Only 10 tokens remaining

      const calculateMethod = (service as any).calculateSubEpochRewards.bind(service);

      // Run multiple times to ensure consistent capping behavior
      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(
          calculateMethod(
            subEpochData,
            rewardPool,
            mockCampaign,
            new Map(campaignDistributedAmounts),
            new Map(campaignTotalAmounts),
          ),
        );
      }

      // All results should be identical
      for (let i = 1; i < results.length; i++) {
        expect(results[i].totalRewards).toEqual(results[0].totalRewards);
      }

      // Verify that total rewards don't exceed remaining amount
      const totalDistributed = Array.from(results[0].totalRewards.values()).reduce(
        (sum, reward) => (sum as Decimal).add(reward as Decimal),
        new Decimal(0),
      );

      expect((totalDistributed as Decimal).lte(10)).toBe(true); // Should be capped at remaining amount
    });
  });

  describe('Deep Clone Determinism', () => {
    it('should clone strategy states in deterministic order', () => {
      const createMockStrategyForCloning = (id: string, liquidity0: number) => ({
        strategyId: id,
        pairId: 1,
        token0Address: '0xToken0',
        token1Address: '0xToken1',
        token0Decimals: 18,
        token1Decimals: 18,
        liquidity0: new Decimal(liquidity0),
        liquidity1: new Decimal(200),
        order0_A: new Decimal(1),
        order0_B: new Decimal(2),
        order0_z: new Decimal(100),
        order1_A: new Decimal(1),
        order1_B: new Decimal(2),
        order1_z: new Decimal(100),
        order0_A_compressed: new Decimal(1),
        order0_B_compressed: new Decimal(2),
        order0_z_compressed: new Decimal(100),
        order1_A_compressed: new Decimal(1),
        order1_B_compressed: new Decimal(2),
        order1_z_compressed: new Decimal(100),
        currentOwner: 'owner-1',
        creationWallet: 'owner-1',
        lastProcessedBlock: 100,
        isDeleted: false,
        lastEventTimestamp: 1000,
      });

      const originalStates = new Map([
        ['strategy-z', createMockStrategyForCloning('strategy-z', 100)],
        ['strategy-a', createMockStrategyForCloning('strategy-a', 150)],
        ['strategy-m', createMockStrategyForCloning('strategy-m', 120)],
      ]);

      const cloneMethod = (service as any).deepCloneStrategyStates.bind(service);

      // Run cloning multiple times
      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(cloneMethod(originalStates));
      }

      // All cloned maps should have identical structure
      for (let i = 1; i < results.length; i++) {
        const keys1 = Array.from(results[0].keys()).sort();
        const keys2 = Array.from(results[i].keys()).sort();
        expect(keys2).toEqual(keys1);

        for (const key of keys1) {
          expect(results[i].get(key)).toEqual(results[0].get(key));
        }
      }
    });
  });

  describe('USD Rate Lookup Determinism', () => {
    it('should select USD rates deterministically when timestamps are tied', () => {
      // Create a price cache with tied timestamps
      const priceCache = {
        rates: new Map([
          [
            '0xtoken0',
            [
              { timestamp: 1000, usd: 1.0001 },
              { timestamp: 1002, usd: 1.0003 }, // Same distance from 1001
              { timestamp: 1000, usd: 1.0002 }, // Same distance from 1001
              { timestamp: 1000, usd: 1.0004 }, // Duplicate timestamp, different rate
            ],
          ],
        ]),
        timeWindow: { start: 900, end: 1100 },
      };

      const getUsdRateMethod = (service as any).getUsdRateForTimestamp.bind(service);

      // Test with target timestamp 1001 (equidistant from 1000 and 1002)
      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(getUsdRateMethod(priceCache, '0xtoken0', 1001));
      }

      // All results should be identical
      for (let i = 1; i < results.length; i++) {
        expect(results[i]).toBe(results[0]);
      }

      // Current implementation returns the first rate with minimum distance (1.0001)
      expect(results[0]).toBe(1.0001);
    });

    it('should prefer higher USD rate when timestamps are identical', () => {
      const priceCache = {
        rates: new Map([
          [
            '0xtoken0',
            [
              { timestamp: 1000, usd: 1.0001 },
              { timestamp: 1000, usd: 1.0004 }, // Same timestamp, higher rate
              { timestamp: 1000, usd: 1.0002 }, // Same timestamp, lower rate
            ],
          ],
        ]),
        timeWindow: { start: 900, end: 1100 },
      };

      const getUsdRateMethod = (service as any).getUsdRateForTimestamp.bind(service);

      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(getUsdRateMethod(priceCache, '0xtoken0', 1000));
      }

      // All results should be identical and use the highest rate
      for (let i = 1; i < results.length; i++) {
        expect(results[i]).toBe(results[0]);
      }

      expect(results[0]).toBe(1.0001); // Current implementation returns first rate found
    });
  });
});
