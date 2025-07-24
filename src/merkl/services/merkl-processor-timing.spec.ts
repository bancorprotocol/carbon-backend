import { Test, TestingModule } from '@nestjs/testing';
import { MerklProcessorService } from './merkl-processor.service';
import { CampaignService } from './campaign.service';
import { LastProcessedBlockService } from '../../last-processed-block/last-processed-block.service';
import { HistoricQuoteService } from '../../historic-quote/historic-quote.service';
import { StrategyCreatedEventService } from '../../events/strategy-created-event/strategy-created-event.service';
import { StrategyUpdatedEventService } from '../../events/strategy-updated-event/strategy-updated-event.service';
import { StrategyDeletedEventService } from '../../events/strategy-deleted-event/strategy-deleted-event.service';
import { VoucherTransferEventService } from '../../events/voucher-transfer-event/voucher-transfer-event.service';
import { BlockService } from '../../block/block.service';
import { DeploymentService } from '../../deployment/deployment.service';
import { TokenService } from '../../token/token.service';
import { PairService } from '../../pair/pair.service';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EpochReward } from '../entities/epoch-reward.entity';
import { Campaign } from '../entities/campaign.entity';
import { ExchangeId, BlockchainType } from '../../deployment/deployment.service';
import { Decimal } from 'decimal.js';

/**
 * TIMING VALIDATION TESTS
 *
 * These tests validate that:
 * 1. Events are applied at the correct timestamps
 * 2. Strategy states don't leak between epochs
 * 3. Snapshots contain correct liquidity values at each timestamp
 * 4. Future events don't affect past snapshots
 *
 * EXPECTED BEHAVIOR: These tests should FAIL with the current implementation
 * because of the timing bugs we identified.
 */
describe('MerklProcessorService - Timing Validation', () => {
  let service: MerklProcessorService;
  let module: TestingModule;

  // Constants matching the service
  const SNAPSHOT_INTERVAL = 5 * 60; // 5 minutes in seconds
  const EPOCH_DURATION = 4 * 60 * 60; // 4 hours in seconds

  // Test timeline: 2022-01-01 00:00:00 UTC
  const CAMPAIGN_START = new Date('2022-01-01T00:00:00.000Z');
  const EPOCH_1_START = CAMPAIGN_START;
  const EPOCH_1_END = new Date(EPOCH_1_START.getTime() + EPOCH_DURATION * 1000);
  const EPOCH_2_START = EPOCH_1_END;
  const EPOCH_2_END = new Date(EPOCH_2_START.getTime() + EPOCH_DURATION * 1000);

  // Mock services with minimal implementations
  const mockServices = {
    campaignService: {
      findByPairId: jest.fn(),
      markProcessedCampaignsInactive: jest.fn().mockResolvedValue(undefined),
      getActiveCampaigns: jest.fn(),
    },
    lastProcessedBlockService: {
      getOrInit: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    },
    historicQuoteService: {
      getUsdRates: jest.fn().mockResolvedValue([
        { address: '0xtoken0', day: Math.floor(CAMPAIGN_START.getTime() / 1000), usd: 1500 },
        { address: '0xtoken1', day: Math.floor(CAMPAIGN_START.getTime() / 1000), usd: 1 },
      ]),
    },
    strategyCreatedEventService: { get: jest.fn() },
    strategyUpdatedEventService: { get: jest.fn() },
    strategyDeletedEventService: { get: jest.fn() },
    voucherTransferEventService: { get: jest.fn() },
    blockService: {
      getLastBlock: jest.fn(),
      getBlocksDictionary: jest.fn(),
      getBlock: jest.fn().mockResolvedValue({
        timestamp: new Date(),
      }),
    },
    deploymentService: { getDeployment: jest.fn() },
    tokenService: { findByAddress: jest.fn() },
    pairService: { findById: jest.fn() },
    campaignRepository: {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    },
    epochRewardRepository: {
      save: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '0' }),
      }),
      manager: {
        transaction: jest.fn().mockImplementation((callback) =>
          callback({
            delete: jest.fn().mockResolvedValue({}),
            create: jest.fn().mockImplementation((target, data) => data),
            save: jest.fn().mockResolvedValue([]),
          }),
        ),
        query: jest.fn(),
      },
    },
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        MerklProcessorService,
        { provide: CampaignService, useValue: mockServices.campaignService },
        { provide: LastProcessedBlockService, useValue: mockServices.lastProcessedBlockService },
        { provide: HistoricQuoteService, useValue: mockServices.historicQuoteService },
        { provide: StrategyCreatedEventService, useValue: mockServices.strategyCreatedEventService },
        { provide: StrategyUpdatedEventService, useValue: mockServices.strategyUpdatedEventService },
        { provide: StrategyDeletedEventService, useValue: mockServices.strategyDeletedEventService },
        { provide: VoucherTransferEventService, useValue: mockServices.voucherTransferEventService },
        { provide: BlockService, useValue: mockServices.blockService },
        { provide: DeploymentService, useValue: mockServices.deploymentService },
        { provide: TokenService, useValue: mockServices.tokenService },
        { provide: PairService, useValue: mockServices.pairService },
        { provide: getRepositoryToken(Campaign), useValue: mockServices.campaignRepository },
        { provide: getRepositoryToken(EpochReward), useValue: mockServices.epochRewardRepository },
      ],
    }).compile();

    service = module.get<MerklProcessorService>(MerklProcessorService);
  });

  afterEach(async () => {
    await module.close();
    jest.clearAllMocks();
  });

  // Helper function to create mock strategy state
  function createMockStrategyState(strategyId: string, liquidity0: string, liquidity1: string) {
    return {
      strategyId,
      pairId: 1,
      token0Address: '0xtoken0',
      token1Address: '0xtoken1',
      token0Decimals: 18,
      token1Decimals: 18,
      liquidity0: new Decimal(liquidity0),
      liquidity1: new Decimal(liquidity1),
      order0_A: new Decimal(1000000),
      order0_B: new Decimal(2000000),
      order0_z: new Decimal(liquidity0),
      order1_A: new Decimal(1000000),
      order1_B: new Decimal(2000000),
      order1_z: new Decimal(liquidity1),
      currentOwner: 'owner1',
      creationWallet: 'owner1',
      lastProcessedBlock: 100,
      isDeleted: false,
    };
  }

  // Helper function to create mock campaign
  function createMockCampaign() {
    return {
      id: '1',
      blockchainType: BlockchainType.Ethereum,
      exchangeId: ExchangeId.OGEthereum,
      pairId: 1,
      rewardAmount: '1000',
      rewardTokenAddress: '0x1234567890123456789012345678901234567890',
      startDate: CAMPAIGN_START,
      endDate: EPOCH_2_END,
      opportunityName: 'Test Campaign',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      pair: {
        id: 1,
        blockchainType: BlockchainType.Ethereum,
        exchangeId: ExchangeId.OGEthereum,
        block: {
          id: 1,
          blockchainType: BlockchainType.Ethereum,
          timestamp: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        token0: {
          address: '0xtoken0',
          decimals: 18,
          id: 1,
          blockchainType: BlockchainType.Ethereum,
          exchangeId: ExchangeId.OGEthereum,
          symbol: 'TOKEN0',
          name: 'Token 0',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        token1: {
          address: '0xtoken1',
          decimals: 18,
          id: 2,
          blockchainType: BlockchainType.Ethereum,
          exchangeId: ExchangeId.OGEthereum,
          symbol: 'TOKEN1',
          name: 'Token 1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        name: 'TOKEN0/TOKEN1',
        createdAt: new Date(),
        updatedAt: new Date(),
        tokensTradedEvents: [],
      },
    };
  }

  // Helper function to create mock strategy updated event
  function createMockStrategyUpdatedEvent(
    strategyId: string,
    timestamp: Date,
    blockId: number,
    newLiquidity0: string,
    newLiquidity1: string,
  ) {
    return {
      strategyId,
      block: {
        id: blockId,
        timestamp,
      },
      transactionIndex: 1,
      logIndex: 1,
      order0: JSON.stringify({
        y: newLiquidity0,
        A: '1000000',
        B: '2000000',
        z: newLiquidity0,
      }),
      order1: JSON.stringify({
        y: newLiquidity1,
        A: '1000000',
        B: '2000000',
        z: newLiquidity1,
      }),
      pair: { id: 1 },
      token0: { address: '0xtoken0', decimals: 18 },
      token1: { address: '0xtoken1', decimals: 18 },
    };
  }

  // Helper function to create mock price cache
  function createMockPriceCache(timestamp: number) {
    return {
      rates: new Map([
        ['0xtoken0', 1500],
        ['0xtoken1', 1],
      ]),
      timestamp,
    };
  }

  // Helper function to create mock batch events
  function createMockBatchEvents(events: any[], blockTimestamps: Record<number, Date>) {
    return {
      createdEvents: [],
      updatedEvents: events,
      deletedEvents: [],
      transferEvents: [],
      blockTimestamps,
    };
  }

  describe('Event Timing Precision Tests', () => {
    /**
     * CRITICAL TEST 1: Event applied at correct timestamp
     *
     * Timeline:
     * - Epoch 1: 00:00 - 04:00
     * - Event at 00:40 (40 minutes into epoch)
     * - Snapshots at 00:00, 00:05, 00:10, ..., 00:35, 00:40, 00:45, ...
     *
     * Expected: Snapshots before 00:40 should have OLD liquidity
     *          Snapshots at/after 00:40 should have NEW liquidity
     *
     * CURRENT BUG: All snapshots show NEW liquidity from epoch start
     */
    it('should apply events at correct timestamps within epoch', () => {
      const strategyId = 'strategy1';
      const initialLiquidity0 = '1000000000000000000'; // 1.0
      const updatedLiquidity0 = '2000000000000000000'; // 2.0

      // Event happens 40 minutes into epoch
      const eventTimestamp = new Date(EPOCH_1_START.getTime() + 40 * 60 * 1000);
      const eventBlockId = 1001;

      // Create initial strategy state
      const strategyStates = new Map();
      strategyStates.set(strategyId, createMockStrategyState(strategyId, initialLiquidity0, '1000000000000000000'));

      // Create mock epoch
      const epoch = {
        epochNumber: 1,
        startTimestamp: EPOCH_1_START,
        endTimestamp: EPOCH_1_END,
        totalRewards: new Decimal('1000'),
      };

      // Create mock event that changes liquidity
      const updatedEvent = createMockStrategyUpdatedEvent(
        strategyId,
        eventTimestamp,
        eventBlockId,
        updatedLiquidity0,
        '1000000000000000000',
      );

      // Create batch events with proper timestamps
      const blockTimestamps = {
        [eventBlockId]: eventTimestamp,
      };
      const batchEvents = createMockBatchEvents([updatedEvent], blockTimestamps);

      // Create mock campaign and price cache
      const campaign = createMockCampaign();
      const priceCache = createMockPriceCache(Math.floor(EPOCH_1_START.getTime() / 1000));

      // Generate snapshots
      const snapshots = service['generateSnapshotsForEpoch'](epoch, strategyStates, campaign, priceCache, batchEvents);

      // Validate snapshot timing
      expect(snapshots.length).toBeGreaterThan(0);

      // Find snapshots before, at, and after the event
      const eventTimestampSeconds = Math.floor(eventTimestamp.getTime() / 1000);
      const snapshotBefore = snapshots.find((s) => s.timestamp < eventTimestampSeconds);
      const snapshotAtOrAfter = snapshots.find((s) => s.timestamp >= eventTimestampSeconds);

      expect(snapshotBefore).toBeDefined();
      expect(snapshotAtOrAfter).toBeDefined();

      // CRITICAL ASSERTION: Snapshots before event should have OLD liquidity
      const strategyBefore = snapshotBefore!.strategies.get(strategyId);
      expect(strategyBefore).toBeDefined();
      expect(strategyBefore!.liquidity0.toString()).toBe(initialLiquidity0); // Should be OLD value

      // CRITICAL ASSERTION: Snapshots at/after event should have NEW liquidity
      const strategyAfter = snapshotAtOrAfter!.strategies.get(strategyId);
      expect(strategyAfter).toBeDefined();
      expect(strategyAfter!.liquidity0.toString()).toBe(updatedLiquidity0); // Should be NEW value

      // DEBUGGING: Log actual values to see the bug
      console.log('=== EVENT TIMING TEST RESULTS ===');
      console.log(`Event timestamp: ${eventTimestamp.toISOString()}`);
      console.log(
        `Snapshot before (${new Date(
          snapshotBefore!.timestamp * 1000,
        ).toISOString()}): ${strategyBefore!.liquidity0.toString()}`,
      );
      console.log(
        `Snapshot after (${new Date(
          snapshotAtOrAfter!.timestamp * 1000,
        ).toISOString()}): ${strategyAfter!.liquidity0.toString()}`,
      );
      console.log(`Expected before: ${initialLiquidity0}, Expected after: ${updatedLiquidity0}`);
    });

    /**
     * CRITICAL TEST 2: Strategy state isolation between epochs
     *
     * Timeline:
     * - Epoch 1: 00:00 - 04:00 (initial liquidity: 1.0)
     * - Event at 04:40 (40 minutes into Epoch 2)
     * - Epoch 2: 04:00 - 08:00
     *
     * Expected: Epoch 1 snapshots should show 1.0 throughout
     *          Epoch 2 snapshots before 04:40 should show 1.0
     *          Epoch 2 snapshots after 04:40 should show 2.0
     *
     * CURRENT BUG: Epoch 1 shows 2.0 from beginning due to state contamination
     */
    it('should isolate strategy states between epochs', () => {
      const strategyId = 'strategy1';
      const initialLiquidity = '1000000000000000000'; // 1.0
      const updatedLiquidity = '2000000000000000000'; // 2.0

      // Event happens 40 minutes into Epoch 2
      const eventTimestamp = new Date(EPOCH_2_START.getTime() + 40 * 60 * 1000);
      const eventBlockId = 2001;

      // Create initial strategy state (clean for both epochs)
      const strategyStates = new Map();
      strategyStates.set(strategyId, createMockStrategyState(strategyId, initialLiquidity, '1000000000000000000'));

      // Create epochs
      const epoch1 = {
        epochNumber: 1,
        startTimestamp: EPOCH_1_START,
        endTimestamp: EPOCH_1_END,
        totalRewards: new Decimal('500'),
      };

      const epoch2 = {
        epochNumber: 2,
        startTimestamp: EPOCH_2_START,
        endTimestamp: EPOCH_2_END,
        totalRewards: new Decimal('500'),
      };

      // Create event that happens during Epoch 2
      const updatedEvent = createMockStrategyUpdatedEvent(
        strategyId,
        eventTimestamp,
        eventBlockId,
        updatedLiquidity,
        '1000000000000000000',
      );

      const blockTimestamps = {
        [eventBlockId]: eventTimestamp,
      };
      const batchEvents = createMockBatchEvents([updatedEvent], blockTimestamps);

      const campaign = createMockCampaign();
      const priceCache = createMockPriceCache(Math.floor(EPOCH_1_START.getTime() / 1000));

      // Generate snapshots for Epoch 1 (should NOT be affected by future event)
      const epoch1Snapshots = service['generateSnapshotsForEpoch'](
        epoch1,
        strategyStates,
        campaign,
        priceCache,
        batchEvents,
      );

      // Generate snapshots for Epoch 2 (should be affected by event at 04:40)
      const epoch2Snapshots = service['generateSnapshotsForEpoch'](
        epoch2,
        strategyStates,
        campaign,
        priceCache,
        batchEvents,
      );

      // CRITICAL ASSERTION: ALL Epoch 1 snapshots should have initial liquidity
      epoch1Snapshots.forEach((snapshot, index) => {
        const strategy = snapshot.strategies.get(strategyId);
        expect(strategy).toBeDefined();
        expect(strategy!.liquidity0.toString()).toBe(initialLiquidity);
        console.log(
          `Epoch 1 Snapshot ${index} (${new Date(
            snapshot.timestamp * 1000,
          ).toISOString()}): ${strategy!.liquidity0.toString()}`,
        );
      });

      // CRITICAL ASSERTION: Epoch 2 snapshots should show transition
      const eventTimestampSeconds = Math.floor(eventTimestamp.getTime() / 1000);
      const epoch2Before = epoch2Snapshots.filter((s) => s.timestamp < eventTimestampSeconds);
      const epoch2After = epoch2Snapshots.filter((s) => s.timestamp >= eventTimestampSeconds);

      epoch2Before.forEach((snapshot, index) => {
        const strategy = snapshot.strategies.get(strategyId);
        expect(strategy).toBeDefined();
        expect(strategy!.liquidity0.toString()).toBe(initialLiquidity);
        console.log(
          `Epoch 2 Before Event ${index} (${new Date(
            snapshot.timestamp * 1000,
          ).toISOString()}): ${strategy!.liquidity0.toString()}`,
        );
      });

      epoch2After.forEach((snapshot, index) => {
        const strategy = snapshot.strategies.get(strategyId);
        expect(strategy).toBeDefined();
        expect(strategy!.liquidity0.toString()).toBe(updatedLiquidity);
        console.log(
          `Epoch 2 After Event ${index} (${new Date(
            snapshot.timestamp * 1000,
          ).toISOString()}): ${strategy!.liquidity0.toString()}`,
        );
      });
    });

    /**
     * CRITICAL TEST 3: Multiple events within single epoch
     *
     * Timeline:
     * - Epoch 1: 00:00 - 04:00
     * - Event A at 00:30 (liquidity: 1.0 → 2.0)
     * - Event B at 01:15 (liquidity: 2.0 → 3.0)
     * - Event C at 02:45 (liquidity: 3.0 → 1.5)
     *
     * Expected: Snapshots should show incremental changes at correct times
     *
     * CURRENT BUG: All snapshots likely show final state from beginning
     */
    it('should handle multiple events within single epoch correctly', () => {
      const strategyId = 'strategy1';
      const initialLiquidity = '1000000000000000000'; // 1.0
      const liquidity2 = '2000000000000000000'; // 2.0
      const liquidity3 = '3000000000000000000'; // 3.0
      const finalLiquidity = '1500000000000000000'; // 1.5

      // Events at specific times within epoch
      const eventA_timestamp = new Date(EPOCH_1_START.getTime() + 30 * 60 * 1000); // 00:30
      const eventB_timestamp = new Date(EPOCH_1_START.getTime() + 75 * 60 * 1000); // 01:15
      const eventC_timestamp = new Date(EPOCH_1_START.getTime() + 165 * 60 * 1000); // 02:45

      const eventA = createMockStrategyUpdatedEvent(
        strategyId,
        eventA_timestamp,
        1001,
        liquidity2,
        '1000000000000000000',
      );
      const eventB = createMockStrategyUpdatedEvent(
        strategyId,
        eventB_timestamp,
        1002,
        liquidity3,
        '1000000000000000000',
      );
      const eventC = createMockStrategyUpdatedEvent(
        strategyId,
        eventC_timestamp,
        1003,
        finalLiquidity,
        '1000000000000000000',
      );

      const blockTimestamps = {
        1001: eventA_timestamp,
        1002: eventB_timestamp,
        1003: eventC_timestamp,
      };

      const batchEvents = createMockBatchEvents([eventA, eventB, eventC], blockTimestamps);

      const strategyStates = new Map();
      strategyStates.set(strategyId, createMockStrategyState(strategyId, initialLiquidity, '1000000000000000000'));

      const epoch = {
        epochNumber: 1,
        startTimestamp: EPOCH_1_START,
        endTimestamp: EPOCH_1_END,
        totalRewards: new Decimal('1000'),
      };

      const campaign = createMockCampaign();
      const priceCache = createMockPriceCache(Math.floor(EPOCH_1_START.getTime() / 1000));

      const snapshots = service['generateSnapshotsForEpoch'](epoch, strategyStates, campaign, priceCache, batchEvents);

      // Convert event timestamps to seconds
      const eventA_seconds = Math.floor(eventA_timestamp.getTime() / 1000);
      const eventB_seconds = Math.floor(eventB_timestamp.getTime() / 1000);
      const eventC_seconds = Math.floor(eventC_timestamp.getTime() / 1000);

      console.log('=== MULTIPLE EVENTS TEST ===');

      snapshots.forEach((snapshot, index) => {
        const strategy = snapshot.strategies.get(strategyId);
        const snapshotTime = new Date(snapshot.timestamp * 1000).toISOString();

        let expectedLiquidity: string;
        if (snapshot.timestamp < eventA_seconds) {
          expectedLiquidity = initialLiquidity;
        } else if (snapshot.timestamp < eventB_seconds) {
          expectedLiquidity = liquidity2;
        } else if (snapshot.timestamp < eventC_seconds) {
          expectedLiquidity = liquidity3;
        } else {
          expectedLiquidity = finalLiquidity;
        }

        console.log(
          `Snapshot ${index} (${snapshotTime}): actual=${strategy!.liquidity0.toString()}, expected=${expectedLiquidity}`,
        );

        // CRITICAL ASSERTION: Each snapshot should have correct liquidity for its time
        expect(strategy!.liquidity0.toString()).toBe(expectedLiquidity);
      });
    });

    /**
     * CRITICAL TEST 4: Cross-epoch event contamination
     *
     * This test specifically validates the bug where Epoch 1 processing
     * contaminates the shared strategy states that Epoch 2 then uses.
     *
     * Timeline:
     * - Batch contains events for both epochs
     * - Event X at 01:00 (during Epoch 1)
     * - Event Y at 05:00 (during Epoch 2)
     *
     * Expected: When processing epochs in batch, each should see correct initial state
     *
     * CURRENT BUG: Epoch 2 sees contaminated state from Epoch 1 processing
     */
    // it('should prevent cross-epoch state contamination in batch processing', () => {
    //   const strategyId = 'strategy1';
    //   const initialLiquidity = '1000000000000000000';
    //   const epoch1UpdatedLiquidity = '2000000000000000000';
    //   const epoch2UpdatedLiquidity = '3000000000000000000';

    //   // Events in different epochs
    //   const epoch1Event = createMockStrategyUpdatedEvent(
    //     strategyId,
    //     new Date(EPOCH_1_START.getTime() + 60 * 60 * 1000), // 01:00
    //     1001,
    //     epoch1UpdatedLiquidity,
    //     '1000000000000000000',
    //   );

    //   const epoch2Event = createMockStrategyUpdatedEvent(
    //     strategyId,
    //     new Date(EPOCH_2_START.getTime() + 60 * 60 * 1000), // 05:00
    //     2001,
    //     epoch2UpdatedLiquidity,
    //     '1000000000000000000',
    //   );

    //   const blockTimestamps = {
    //     1001: epoch1Event.block.timestamp,
    //     2001: epoch2Event.block.timestamp,
    //   };

    //   // Batch events contain BOTH epoch events (simulating real batch processing)
    //   const batchEvents = createMockBatchEvents([epoch1Event, epoch2Event], blockTimestamps);

    //   // Shared strategy states (this is what gets contaminated)
    //   const sharedStrategyStates = new Map();
    //   sharedStrategyStates.set(
    //     strategyId,
    //     createMockStrategyState(strategyId, initialLiquidity, '1000000000000000000'),
    //   );

    //   const epoch1 = {
    //     epochNumber: 1,
    //     startTimestamp: EPOCH_1_START,
    //     endTimestamp: EPOCH_1_END,
    //     totalRewards: new Decimal('500'),
    //   };

    //   const epoch2 = {
    //     epochNumber: 2,
    //     startTimestamp: EPOCH_2_START,
    //     endTimestamp: EPOCH_2_END,
    //     totalRewards: new Decimal('500'),
    //   };

    //   const campaign = createMockCampaign();
    //   const priceCache = createMockPriceCache(Math.floor(EPOCH_1_START.getTime() / 1000));

    //   // Process Epoch 1 first (simulating batch processing order)
    //   const epoch1Snapshots = service['generateSnapshotsForEpoch'](
    //     epoch1,
    //     sharedStrategyStates,
    //     campaign,
    //     priceCache,
    //     batchEvents,
    //   );

    //   // Now process Epoch 2 with the SAME shared strategy states
    //   // BUG: This will see contaminated state from Epoch 1 processing
    //   const epoch2Snapshots = service['generateSnapshotsForEpoch'](
    //     epoch2,
    //     sharedStrategyStates,
    //     campaign,
    //     priceCache,
    //     batchEvents,
    //   );

    //   console.log('=== CROSS-EPOCH CONTAMINATION TEST ===');

    //   // Epoch 1: First snapshot should show initial liquidity, later ones should show epoch1 update
    //   const epoch1FirstSnapshot = epoch1Snapshots[0];
    //   const epoch1Strategy = epoch1FirstSnapshot.strategies.get(strategyId);
    //   console.log(`Epoch 1 first snapshot: ${epoch1Strategy!.liquidity0.toString()} (expected: ${initialLiquidity})`);

    //   // Epoch 2: First snapshot should show initial liquidity (not contaminated from Epoch 1)
    //   const epoch2FirstSnapshot = epoch2Snapshots[0];
    //   const epoch2Strategy = epoch2FirstSnapshot.strategies.get(strategyId);
    //   console.log(`Epoch 2 first snapshot: ${epoch2Strategy!.liquidity0.toString()} (expected: ${initialLiquidity})`);

    //   // CRITICAL ASSERTION: Epoch 2 should start with clean state
    //   // BUG: This will likely fail because Epoch 2 sees contaminated state
    //   expect(epoch2Strategy!.liquidity0.toString()).toBe(initialLiquidity);
    // });

    /**
     * CRITICAL TEST 5: Event ordering and transaction/log index precision
     *
     * Timeline:
     * - Multiple events in same block with different log indices
     * - Should be applied in correct order
     *
     * Expected: Events applied in transaction/log index order
     *
     * CURRENT BUG: May not respect precise ordering
     */
    it('should respect transaction and log index ordering for same-block events', () => {
      const strategyId = 'strategy1';
      const initialLiquidity = '1000000000000000000';

      const blockTimestamp = new Date(EPOCH_1_START.getTime() + 30 * 60 * 1000);
      const blockId = 1001;

      // Create events in same block with different ordering
      const event1 = createMockStrategyUpdatedEvent(
        strategyId,
        blockTimestamp,
        blockId,
        '2000000000000000000',
        '1000000000000000000',
      );
      event1.transactionIndex = 1;
      event1.logIndex = 1;

      const event2 = createMockStrategyUpdatedEvent(
        strategyId,
        blockTimestamp,
        blockId,
        '3000000000000000000',
        '1000000000000000000',
      );
      event2.transactionIndex = 1;
      event2.logIndex = 2; // Later log index

      const event3 = createMockStrategyUpdatedEvent(
        strategyId,
        blockTimestamp,
        blockId,
        '4000000000000000000',
        '1000000000000000000',
      );
      event3.transactionIndex = 2; // Later transaction
      event3.logIndex = 1;

      const blockTimestamps = {
        [blockId]: blockTimestamp,
      };

      // Events provided in wrong order intentionally
      const batchEvents = createMockBatchEvents([event3, event1, event2], blockTimestamps);

      const strategyStates = new Map();
      strategyStates.set(strategyId, createMockStrategyState(strategyId, initialLiquidity, '1000000000000000000'));

      const epoch = {
        epochNumber: 1,
        startTimestamp: EPOCH_1_START,
        endTimestamp: EPOCH_1_END,
        totalRewards: new Decimal('1000'),
      };

      const campaign = createMockCampaign();
      const priceCache = createMockPriceCache(Math.floor(EPOCH_1_START.getTime() / 1000));

      const snapshots = service['generateSnapshotsForEpoch'](epoch, strategyStates, campaign, priceCache, batchEvents);

      // Find snapshot at or after the events
      const eventTimestampSeconds = Math.floor(blockTimestamp.getTime() / 1000);
      const snapshotAfterEvents = snapshots.find((s) => s.timestamp >= eventTimestampSeconds);

      expect(snapshotAfterEvents).toBeDefined();
      const strategy = snapshotAfterEvents!.strategies.get(strategyId);

      // CRITICAL ASSERTION: Should show final event result (event3 with tx=2, log=1)
      expect(strategy!.liquidity0.toString()).toBe('4000000000000000000');

      console.log(
        `Final liquidity after ordered events: ${strategy!.liquidity0.toString()} (expected: 4000000000000000000)`,
      );
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    /**
     * Edge case: Event exactly at epoch boundary
     */
    it('should handle events exactly at epoch boundaries', () => {
      const strategyId = 'strategy1';
      const initialLiquidity = '1000000000000000000';
      const updatedLiquidity = '2000000000000000000';

      // Event exactly at Epoch 2 start (which is Epoch 1 end)
      const eventAtBoundary = createMockStrategyUpdatedEvent(
        strategyId,
        EPOCH_2_START, // Exactly at boundary
        2000,
        updatedLiquidity,
        '1000000000000000000',
      );

      const blockTimestamps = {
        2000: EPOCH_2_START,
      };

      const batchEvents = createMockBatchEvents([eventAtBoundary], blockTimestamps);
      const strategyStates = new Map();
      strategyStates.set(strategyId, createMockStrategyState(strategyId, initialLiquidity, '1000000000000000000'));

      const epoch1 = {
        epochNumber: 1,
        startTimestamp: EPOCH_1_START,
        endTimestamp: EPOCH_1_END,
        totalRewards: new Decimal('500'),
      };

      const epoch2 = {
        epochNumber: 2,
        startTimestamp: EPOCH_2_START,
        endTimestamp: EPOCH_2_END,
        totalRewards: new Decimal('500'),
      };

      const campaign = createMockCampaign();
      const priceCache = createMockPriceCache(Math.floor(EPOCH_1_START.getTime() / 1000));

      const epoch1Snapshots = service['generateSnapshotsForEpoch'](
        epoch1,
        strategyStates,
        campaign,
        priceCache,
        batchEvents,
      );
      const epoch2Snapshots = service['generateSnapshotsForEpoch'](
        epoch2,
        strategyStates,
        campaign,
        priceCache,
        batchEvents,
      );

      // Epoch 1 should not see the boundary event
      epoch1Snapshots.forEach((snapshot) => {
        const strategy = snapshot.strategies.get(strategyId);
        expect(strategy!.liquidity0.toString()).toBe(initialLiquidity);
      });

      // Epoch 2 should see the boundary event from its first snapshot
      const epoch2FirstSnapshot = epoch2Snapshots[0];
      const strategy = epoch2FirstSnapshot.strategies.get(strategyId);
      expect(strategy!.liquidity0.toString()).toBe(updatedLiquidity);
    });

    /**
     * Edge case: Event between snapshots
     */
    it('should handle events that fall between snapshot intervals', () => {
      const strategyId = 'strategy1';
      const initialLiquidity = '1000000000000000000';
      const updatedLiquidity = '2000000000000000000';

      // Event at 00:07:30 (between 00:05 and 00:10 snapshots)
      const eventBetweenSnapshots = new Date(EPOCH_1_START.getTime() + 7.5 * 60 * 1000);
      const event = createMockStrategyUpdatedEvent(
        strategyId,
        eventBetweenSnapshots,
        1001,
        updatedLiquidity,
        '1000000000000000000',
      );

      const blockTimestamps = {
        1001: eventBetweenSnapshots,
      };

      const batchEvents = createMockBatchEvents([event], blockTimestamps);
      const strategyStates = new Map();
      strategyStates.set(strategyId, createMockStrategyState(strategyId, initialLiquidity, '1000000000000000000'));

      const epoch = {
        epochNumber: 1,
        startTimestamp: EPOCH_1_START,
        endTimestamp: EPOCH_1_END,
        totalRewards: new Decimal('1000'),
      };

      const campaign = createMockCampaign();
      const priceCache = createMockPriceCache(Math.floor(EPOCH_1_START.getTime() / 1000));

      const snapshots = service['generateSnapshotsForEpoch'](epoch, strategyStates, campaign, priceCache, batchEvents);

      // Find 00:05 and 00:10 snapshots
      const snapshot_0005 = snapshots.find(
        (s) => s.timestamp === Math.floor((EPOCH_1_START.getTime() + 5 * 60 * 1000) / 1000),
      );
      const snapshot_0010 = snapshots.find(
        (s) => s.timestamp === Math.floor((EPOCH_1_START.getTime() + 10 * 60 * 1000) / 1000),
      );

      expect(snapshot_0005).toBeDefined();
      expect(snapshot_0010).toBeDefined();

      // 00:05 snapshot should have old liquidity (event at 00:07:30 hasn't happened yet)
      const strategy_0005 = snapshot_0005!.strategies.get(strategyId);
      expect(strategy_0005!.liquidity0.toString()).toBe(initialLiquidity);

      // 00:10 snapshot should have new liquidity (event at 00:07:30 has happened)
      const strategy_0010 = snapshot_0010!.strategies.get(strategyId);
      expect(strategy_0010!.liquidity0.toString()).toBe(updatedLiquidity);
    });
  });
});
