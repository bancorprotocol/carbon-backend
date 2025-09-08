import { Injectable, Logger } from '@nestjs/common';

import { Decimal } from 'decimal.js';
import { ConfigService } from '@nestjs/config';
import { partitionSingleEpoch } from './partitioner';
import { createHash } from 'crypto';
import { Campaign } from '../entities/campaign.entity';
import { SubEpoch } from '../entities/sub-epoch.entity';
import { SubEpochService } from './sub-epoch.service';
import { CampaignService } from './campaign.service';
import { LastProcessedBlockService } from '../../last-processed-block/last-processed-block.service';
import { BlockService } from '../../block/block.service';
import { HistoricQuoteService } from '../../historic-quote/historic-quote.service';
import { StrategyCreatedEventService } from '../../events/strategy-created-event/strategy-created-event.service';
import { StrategyUpdatedEventService } from '../../events/strategy-updated-event/strategy-updated-event.service';
import { StrategyDeletedEventService } from '../../events/strategy-deleted-event/strategy-deleted-event.service';
import { VoucherTransferEventService } from '../../events/voucher-transfer-event/voucher-transfer-event.service';
import { Deployment, ExchangeId } from '../../deployment/deployment.service';
import { StrategyCreatedEvent } from '../../events/strategy-created-event/strategy-created-event.entity';
import { StrategyUpdatedEvent } from '../../events/strategy-updated-event/strategy-updated-event.entity';
import { StrategyDeletedEvent } from '../../events/strategy-deleted-event/strategy-deleted-event.entity';
import { VoucherTransferEvent } from '../../events/voucher-transfer-event/voucher-transfer-event.entity';

interface StrategyState {
  strategyId: string;
  pairId: number;
  token0Address: string;
  token1Address: string;
  token0Decimals: number;
  token1Decimals: number;
  liquidity0: Decimal; // Available liquidity for token0 orders
  liquidity1: Decimal; // Available liquidity for token1 orders
  // Decompressed A, B parameters for price curve calculations
  order0_A: Decimal;
  order0_B: Decimal;
  order0_z: Decimal; // Total capacity for token0 orders
  order1_A: Decimal;
  order1_B: Decimal;
  order1_z: Decimal; // Total capacity for token1 orders
  // Compressed format of price curve parameters for storage efficiency
  order0_A_compressed: Decimal;
  order0_B_compressed: Decimal;
  order0_z_compressed: Decimal;
  order1_A_compressed: Decimal;
  order1_B_compressed: Decimal;
  order1_z_compressed: Decimal;
  currentOwner: string;
  creationWallet: string;
  lastProcessedBlock: number;
  isDeleted: boolean;
  // Temporal tracking for event ordering and deduplication
  lastEventTimestamp: number; // Timestamp of the most recent event affecting this strategy
}

interface EpochInfo {
  epochNumber: number;
  startTimestamp: Date;
  endTimestamp: Date;
  totalRewards: Decimal;
}

interface EpochBatch {
  epochInfo: EpochInfo;
  campaign: Campaign;
  // Unique identifier combining campaign and epoch for deterministic processing
  globalEpochId: string;
  startTimestampMs: number;
  endTimestampMs: number;
}

interface SubEpochData {
  timestamp: number;
  order0TargetPrice: Decimal; // Target price for token0->token1 orders (token1/token0)
  order1TargetPrice: Decimal; // Target price for token1->token0 orders (token0/token1)
  targetSqrtPriceScaled: Decimal;
  invTargetSqrtPriceScaled: Decimal;
  strategies: Map<string, StrategyState>;
}

interface PriceCache {
  rates: Map<string, Array<{ timestamp: number; usd: number }>>; // Token address mapped to historical USD rates
  timeWindow: { start: number; end: number }; // Time range covered by this price cache
}

interface BatchEvents {
  createdEvents: StrategyCreatedEvent[];
  updatedEvents: StrategyUpdatedEvent[];
  deletedEvents: StrategyDeletedEvent[];
  transferEvents: VoucherTransferEvent[];
}

interface TimestampedEvent {
  timestamp: number;
  type: 'created' | 'updated' | 'deleted' | 'transfer';
  event: StrategyCreatedEvent | StrategyUpdatedEvent | StrategyDeletedEvent | VoucherTransferEvent;
}

type StrategyStatesMap = Map<string, StrategyState>;

interface TokenWeightingConfig {
  tokenWeightings: Record<string, number>;
  whitelistedAssets: string[];
  defaultWeighting: number;
}

/**
 * MerklProcessorService
 *
 * Core service responsible for processing Merkl reward campaigns and distributing
 * incentives to liquidity providers based on their strategy positions and market conditions.
 *
 * This service implements a sophisticated epoch-based reward distribution system that:
 * - Processes campaigns in chronological epochs to ensure temporal consistency
 * - Maintains strategy state isolation to prevent cross-contamination between time periods
 * - Calculates reward eligibility based on liquidity proximity to market prices
 * - Applies configurable token weightings to incentivize specific assets
 * - Enforces campaign budget limits and proportional reward scaling
 *
 * Key Features:
 * - Temporal isolation: Each epoch is processed independently with its own state snapshot
 * - Price-based eligibility: Rewards are distributed based on how close liquidity is to market rates
 * - Token weighting system: Different tokens receive different incentive multipliers
 * - Budget enforcement: Automatic scaling to prevent over-distribution of campaign rewards
 * - Deterministic processing: Reproducible results using transaction-based randomness
 *
 * @critical This service handles financial reward distribution and must maintain
 * strict accuracy and consistency. All calculations are performed using high-precision
 * Decimal arithmetic to prevent rounding errors.
 *
 * @author Carbon DeFi Team
 * @version 2.0
 */
@Injectable()
export class MerklProcessorService {
  private readonly logger = new Logger(MerklProcessorService.name);

  /** Minimum time between sub-epoch snapshots (240 seconds) */
  private readonly MIN_SNAPSHOT_INTERVAL = 4 * 60;

  /** Maximum time between sub-epoch snapshots (360 seconds) */
  private readonly MAX_SNAPSHOT_INTERVAL = 6 * 60;

  /** Standard epoch duration for campaign processing (4 hours) */
  private readonly EPOCH_DURATION = 4 * 60 * 60;

  /** Price tolerance for reward eligibility (2% deviation from market price) */
  private readonly TOLERANCE_PERCENTAGE = 0.02;

  /** Scaling constant for price curve calculations (2^48) */
  private readonly SCALING_CONSTANT = new Decimal(2).pow(48);

  /**
   * Token incentive weighting configurations for each blockchain deployment.
   *
   * This configuration defines how rewards are distributed across different tokens
   * to align incentives with protocol objectives and market conditions:
   *
   * - **tokenWeightings**: Specific multipliers for strategic tokens
   * - **whitelistedAssets**: Approved tokens receiving standard weighting
   * - **defaultWeighting**: Fallback weighting for unlisted tokens
   *
   * Higher weightings incentivize liquidity provision in specific tokens,
   * while zero weightings effectively disable rewards for certain assets.
   *
   * @internal These weightings directly control reward distribution and should
   * be carefully configured in consultation with protocol governance.
   */
  private readonly DEPLOYMENT_TOKEN_WEIGHTINGS: Record<string, TokenWeightingConfig> = {
    // Ethereum mainnet
    [ExchangeId.OGEthereum]: {
      tokenWeightings: {
        '0xdAC17F958D2ee523a2206206994597C13D831ec7': 0.7, // USDT
        '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE': 1.8, // ETH
      },
      whitelistedAssets: [],
      defaultWeighting: 1, // Default weighting for unlisted tokens
    },
    [ExchangeId.OGSei]: {
      tokenWeightings: {
        '0x160345fC359604fC6e70E3c5fAcbdE5F7A9342d8': 1, // WETH
        '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE': 99, // SEI
      },
      whitelistedAssets: [],
      defaultWeighting: 0,
    },
    [ExchangeId.OGTac]: {
      tokenWeightings: {
        '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE': 0.75, // TAC
        '0xB63B9f0eb4A6E6f191529D71d4D88cc8900Df2C9': 0.75, // WTAC
        '0xAF988C3f7CB2AceAbB15f96b19388a259b6C438f': 2, // USDT
        '0xb76d91340F5CE3577f0a056D29f6e3Eb4E88B140': 0.5, // TON
        '0x61D66bC21fED820938021B06e9b2291f3FB91945': 1.25, // WETH
        '0xAf368c91793CB22739386DFCbBb2F1A9e4bCBeBf': 1.25, // wstETH
        '0x7048c9e4aBD0cf0219E95a17A8C6908dfC4f0Ee4': 1, // cbBTC
        '0xecAc9C5F704e954931349Da37F60E39f515c11c1': 1, // lbBTC
      },
      whitelistedAssets: [],
      defaultWeighting: 0.5,
    },
  };

  /**
   * Initializes the MerklProcessorService with required dependencies.
   *
   * @param subEpochService - Service for managing sub-epoch data persistence
   * @param campaignService - Service for campaign management and queries
   * @param lastProcessedBlockService - Service for tracking processing progress
   * @param blockService - Service for blockchain block data access
   * @param historicQuoteService - Service for historical USD price data
   * @param strategyCreatedEventService - Service for strategy creation events
   * @param strategyUpdatedEventService - Service for strategy update events
   * @param strategyDeletedEventService - Service for strategy deletion events
   * @param voucherTransferEventService - Service for voucher transfer events
   * @param configService - Configuration service for environment variables
   */
  constructor(
    private subEpochService: SubEpochService,
    private campaignService: CampaignService,
    private lastProcessedBlockService: LastProcessedBlockService,
    private blockService: BlockService,
    private historicQuoteService: HistoricQuoteService,
    private strategyCreatedEventService: StrategyCreatedEventService,
    private strategyUpdatedEventService: StrategyUpdatedEventService,
    private strategyDeletedEventService: StrategyDeletedEventService,
    private voucherTransferEventService: VoucherTransferEventService,
    private configService: ConfigService,
  ) {}

  /**
   * Processes Merkl reward campaigns for the specified deployment up to the given block.
   *
   * This is the main entry point for reward processing. It orchestrates the entire
   * reward calculation and distribution pipeline by:
   *
   * 1. Identifying active campaigns requiring processing
   * 2. Building comprehensive price caches for consistent USD rate lookups
   * 3. Calculating epoch batches that need processing (unprocessed + recent updates)
   * 4. Processing each epoch batch in chronological order with temporal isolation
   * 5. Updating campaign status for completed campaigns
   *
   * The method ensures temporal consistency by processing epochs chronologically
   * and maintaining isolated state for each time period to prevent data contamination.
   *
   * @param endBlock - The latest block number to process up to
   * @param deployment - The blockchain deployment configuration containing network details
   *
   * @throws {Error} When no active campaigns are found or processing fails
   *
   * @example
   * ```typescript
   * await merklProcessor.update(18500000, ethereumDeployment);
   * ```
   *
   * @critical This method handles financial reward distribution and must complete
   * successfully to ensure accurate reward calculations. Any failure should be
   * investigated immediately.
   */
  async update(endBlock: number, deployment: Deployment): Promise<void> {
    const campaigns = await this.campaignService.getActiveCampaigns(deployment);

    if (campaigns.length === 0) {
      this.logger.log(`No active campaigns found for ${deployment.blockchainType}-${deployment.exchangeId}`);
      return;
    }

    this.logger.log(`Processing merkl with epoch-based batching up to block ${endBlock}`);

    // Determine the time range to process based on active campaigns
    const earliestCampaignStart = Math.min(...campaigns.map((c) => c.startDate.getTime()));
    const globalStartTimestamp = earliestCampaignStart;
    const globalEndTimestamp = await this.getTimestampForBlock(endBlock, deployment);

    this.logger.log(
      `Global processing range: ${new Date(globalStartTimestamp).toISOString()} to ${new Date(
        globalEndTimestamp,
      ).toISOString()}`,
    );

    // Build comprehensive price cache to ensure consistent USD rates across all processing
    const globalPriceCache = await this.createGlobalPriceCache(
      campaigns,
      globalStartTimestamp,
      globalEndTimestamp,
      deployment,
    );

    // Identify epoch batches requiring processing and order them chronologically
    const epochBatchesToProcess = await this.calculateEpochBatchesToProcess(
      campaigns,
      globalStartTimestamp,
      globalEndTimestamp,
    );

    this.logger.log(
      `Found ${epochBatchesToProcess.length} epoch batches to process spanning ${new Date(
        globalStartTimestamp,
      ).toISOString()} to ${new Date(globalEndTimestamp).toISOString()}`,
    );

    // Execute processing for each epoch batch in temporal sequence
    for (const epochBatch of epochBatchesToProcess) {
      await this.processEpochBatch(epochBatch, deployment, globalPriceCache, endBlock);
    }

    // Update campaign status for completed campaigns
    await this.campaignService.markProcessedCampaignsInactive(deployment, campaigns, globalEndTimestamp);
  }

  /**
   * Calculates which epoch batches require processing across all active campaigns.
   *
   * This method implements intelligent epoch selection by:
   * - Identifying all epochs within the global processing timeframe
   * - Filtering out already processed epochs to avoid duplicate work
   * - Including a buffer of recent epochs to handle late-arriving events
   * - Sorting all selected epochs chronologically for deterministic processing
   *
   * The reprocessing buffer ensures that if new events arrive for recently processed
   * time periods, those epochs will be recalculated to maintain accuracy.
   *
   * @param campaigns - List of active campaigns to process
   * @param globalStartTimestamp - Earliest timestamp to consider for processing
   * @param globalEndTimestamp - Latest timestamp to process up to
   *
   * @returns Promise resolving to chronologically sorted array of epoch batches requiring processing
   *
   * @internal This method is critical for determining processing scope and ensuring
   * no epochs are missed while avoiding unnecessary duplicate processing.
   */
  private async calculateEpochBatchesToProcess(
    campaigns: Campaign[],
    globalStartTimestamp: number,
    globalEndTimestamp: number,
  ): Promise<EpochBatch[]> {
    const epochBatches: EpochBatch[] = [];

    // Generate epochs for each campaign and identify those requiring processing
    for (const campaign of campaigns) {
      const allEpochs = this.calculateEpochsInRange(campaign, globalStartTimestamp, globalEndTimestamp);

      // Retrieve the most recently processed epoch number for this campaign
      const lastProcessedEpochNumber = await this.subEpochService.getLastProcessedEpochNumber(campaign.id);

      // Include recent epochs for reprocessing to handle late-arriving events
      // This ensures data consistency when events are received out of chronological order
      const reprocessBuffer = 2; // Number of recent epochs to reprocess
      const cutoffEpoch = Math.max(0, lastProcessedEpochNumber - reprocessBuffer);

      // Select epochs that require processing (recent + unprocessed)
      const epochsToProcess = allEpochs.filter((epoch) => epoch.epochNumber > cutoffEpoch);

      this.logger.log(
        `Campaign ${campaign.id}: ${allEpochs.length} total epochs, ${epochsToProcess.length} to process ` +
          `(last processed: ${lastProcessedEpochNumber}, cutoff: ${cutoffEpoch}, buffer: ${reprocessBuffer})`,
      );

      for (const epoch of epochsToProcess) {
        const globalEpochId = `${campaign.id}-epoch-${epoch.epochNumber}`;
        const startTimestampMs = epoch.startTimestamp.getTime();
        const endTimestampMs = epoch.endTimestamp.getTime();

        epochBatches.push({
          epochInfo: epoch,
          campaign,
          globalEpochId,
          startTimestampMs,
          endTimestampMs,
        });
      }
    }

    // Sort by start timestamp to ensure chronological processing
    epochBatches.sort((a, b) => {
      if (a.startTimestampMs !== b.startTimestampMs) {
        return a.startTimestampMs - b.startTimestampMs;
      }
      // Use campaign ID as tiebreaker for deterministic ordering
      return a.campaign.id - b.campaign.id;
    });

    return epochBatches;
  }

  /**
   * Processes a single epoch batch with complete temporal isolation.
   *
   * This method is the core of the reward processing pipeline and implements
   * strict temporal boundaries to ensure accurate calculations:
   *
   * 1. **State Initialization**: Creates fresh strategy states up to epoch start
   * 2. **Event Filtering**: Retrieves only events within the epoch timeframe
   * 3. **Budget Tracking**: Monitors campaign reward distribution limits
   * 4. **Reward Processing**: Executes the epoch with isolated state and events
   *
   * Temporal isolation is critical - each epoch processes with its own snapshot
   * of strategy states and events, preventing future events from affecting past
   * reward calculations and ensuring reproducible results.
   *
   * @param epochBatch - The epoch batch configuration containing timing and campaign details
   * @param deployment - Blockchain deployment configuration
   * @param globalPriceCache - Pre-built cache of USD rates for the entire processing timeframe
   * @param endBlock - Maximum block number to consider for event retrieval
   *
   * @throws {Error} When epoch processing fails or budget calculations are invalid
   *
   * @internal This method handles the financial core of reward distribution and must
   * maintain perfect temporal isolation to ensure calculation accuracy.
   */
  private async processEpochBatch(
    epochBatch: EpochBatch,
    deployment: Deployment,
    globalPriceCache: PriceCache,
    endBlock: number,
  ): Promise<void> {
    const { epochInfo, campaign, globalEpochId } = epochBatch;

    this.logger.log(
      `Processing epoch batch: ${globalEpochId} (${epochInfo.startTimestamp.toISOString()} to ${epochInfo.endTimestamp.toISOString()})`,
    );

    // Initialize clean strategy states specific to this epoch's timeframe
    // Ensures temporal isolation and prevents data contamination
    const strategyStates: StrategyStatesMap = new Map();
    const epochStartTimestamp = epochInfo.startTimestamp.getTime();

    // Build strategy states up to the start of this epoch
    await this.initializeStrategyStates(epochStartTimestamp, deployment, campaign, strategyStates);

    // Retrieve events that occurred within this epoch's time boundaries
    // Maintains temporal accuracy for reward calculations
    const epochEvents = await this.fetchEventsForEpochTimeframe(epochBatch, deployment, endBlock);

    // Track reward distribution to enforce campaign limits
    const campaignDistributedAmounts = new Map<number, Decimal>();
    const campaignTotalAmounts = new Map<number, Decimal>();

    const currentDistributed = await this.subEpochService.getTotalRewardsForCampaign(campaign.id);
    const campaignAmount = new Decimal(campaign.rewardAmount);

    campaignDistributedAmounts.set(campaign.id, currentDistributed);
    campaignTotalAmounts.set(campaign.id, campaignAmount);

    // Execute epoch processing with isolated state and events
    await this.processEpoch(
      campaign,
      epochInfo,
      strategyStates, // Temporally isolated strategy states
      globalPriceCache,
      epochEvents, // Events filtered to this epoch's timeframe
      campaignDistributedAmounts,
      campaignTotalAmounts,
    );

    this.logger.log(`Completed epoch batch: ${globalEpochId}`);
  }

  /**
   * Retrieves events that occurred within the epoch's specific timeframe.
   * Optimizes memory usage by fetching only events within the epoch's block range.
   */
  private async fetchEventsForEpochTimeframe(
    epochBatch: EpochBatch,
    deployment: Deployment,
    endBlock: number,
  ): Promise<BatchEvents> {
    const { startTimestampMs, endTimestampMs } = epochBatch;

    // Get exact block range for this epoch only to ensure all events are captured
    // Find blocks that correspond to epoch start and end timestamps
    const epochStartBlock = await this.getBlockForTimestamp(startTimestampMs, deployment, endBlock);
    const epochEndBlock = await this.getBlockForTimestamp(endTimestampMs, deployment, endBlock);

    this.logger.log(
      `Fetching events for epoch from block ${epochStartBlock} to ${epochEndBlock} (${new Date(
        startTimestampMs,
      ).toISOString()} to ${new Date(endTimestampMs).toISOString()})`,
    );

    // Fetch events in the epoch's block range only
    const [createdEvents, updatedEvents, deletedEvents, transferEvents] = await Promise.all([
      this.strategyCreatedEventService.get(epochStartBlock, epochEndBlock, deployment),
      this.strategyUpdatedEventService.get(epochStartBlock, epochEndBlock, deployment),
      this.strategyDeletedEventService.get(epochStartBlock, epochEndBlock, deployment),
      this.voucherTransferEventService.get(epochStartBlock, epochEndBlock, deployment),
    ]);

    // Filter events by timestamp to ensure they fall within the epoch timeframe
    // This maintains temporal accuracy for reward calculations
    const filterByTimestamp = <T extends { timestamp: Date; pair?: { id: number } }>(events: T[]): T[] => {
      return events.filter((event) => {
        const eventTimestamp = event.timestamp.getTime();
        const withinTimeframe = eventTimestamp >= startTimestampMs && eventTimestamp < endTimestampMs;
        const correctPair = !event.pair || event.pair.id === epochBatch.campaign.pair.id;
        return withinTimeframe && correctPair;
      });
    };

    const filteredCreatedEvents = filterByTimestamp(createdEvents);
    const filteredUpdatedEvents = filterByTimestamp(updatedEvents);
    const filteredDeletedEvents = filterByTimestamp(deletedEvents);

    // For transfer events, we need to check if they belong to strategies in this campaign's pair
    const filteredTransferEvents = transferEvents.filter((event) => {
      const eventTimestamp = event.timestamp.getTime();
      return eventTimestamp >= startTimestampMs && eventTimestamp < endTimestampMs;
      // Note: We'll further filter by strategy ownership in the epoch processing logic
    });

    this.logger.log(
      `Filtered events: ${filteredCreatedEvents.length} created, ${filteredUpdatedEvents.length} updated, ${filteredDeletedEvents.length} deleted, ${filteredTransferEvents.length} transfers`,
    );

    return {
      createdEvents: filteredCreatedEvents,
      updatedEvents: filteredUpdatedEvents,
      deletedEvents: filteredDeletedEvents,
      transferEvents: filteredTransferEvents,
    };
  }

  /**
   * Initializes strategy states up to a specific timestamp for temporal accuracy.
   *
   * @param maxTimestamp - Maximum timestamp to consider for state initialization
   * @param deployment - Blockchain deployment configuration
   * @param campaign - Campaign to initialize strategies for
   * @param strategyStates - Map to populate with initialized strategy states
   */
  private async initializeStrategyStates(
    maxTimestamp: number,
    deployment: Deployment,
    campaign: Campaign,
    strategyStates: StrategyStatesMap,
  ): Promise<void> {
    this.logger.log(`Initializing strategy states up to timestamp ${new Date(maxTimestamp).toISOString()}`);

    // Get latest created/updated event per strategy for liquidity state with token data
    // Filter by timestamp only since we don't rely on block numbers for epoch-based processing
    const latestStrategyStates = await this.subEpochService.subEpochRepository.manager.query(
      `
      SELECT DISTINCT ON (strategy_id) 
        strategy_id, 
        block_id, 
        order0, 
        order1, 
        pair_id, 
        token0_address, 
        token1_address, 
        token0_decimals, 
        token1_decimals,
        owner, 
        transaction_index, 
        log_index,
        timestamp
      FROM (
        SELECT 
          c."strategyId" as strategy_id, 
          c."blockId" as block_id, 
          c.order0, 
          c.order1, 
          c."pairId" as pair_id, 
          t0.address as token0_address,
          t1.address as token1_address,
          t0.decimals as token0_decimals,
          t1.decimals as token1_decimals,
          c.owner, 
          c."transactionIndex" as transaction_index, 
          c."logIndex" as log_index,
          c.timestamp
        FROM "strategy-created-events" c
        LEFT JOIN tokens t0 ON c."token0Id" = t0.id  
        LEFT JOIN tokens t1 ON c."token1Id" = t1.id
        WHERE c.timestamp <= $4
          AND c."blockchainType" = $1 
          AND c."exchangeId" = $2
          AND c."pairId" = $3
        UNION ALL
        SELECT 
          u."strategyId" as strategy_id, 
          u."blockId" as block_id, 
          u.order0, 
          u.order1, 
          u."pairId" as pair_id, 
          t0.address as token0_address,
          t1.address as token1_address,
          t0.decimals as token0_decimals,
          t1.decimals as token1_decimals,
          null as owner, 
          u."transactionIndex" as transaction_index, 
          u."logIndex" as log_index,
          u.timestamp
        FROM "strategy-updated-events" u
        LEFT JOIN tokens t0 ON u."token0Id" = t0.id  
        LEFT JOIN tokens t1 ON u."token1Id" = t1.id
        WHERE u.timestamp <= $4
          AND u."blockchainType" = $1 
          AND u."exchangeId" = $2
          AND u."pairId" = $3
      ) combined
      ORDER BY strategy_id, block_id DESC, transaction_index DESC, log_index DESC
    `,
      [deployment.blockchainType, deployment.exchangeId, campaign.pair.id, new Date(maxTimestamp)],
    );

    // Get latest transfer event per strategy for ownership (with timestamp filter)
    const strategyIds = latestStrategyStates.map((s) => s.strategy_id);

    let latestOwnershipStates = [];
    if (strategyIds.length > 0) {
      const placeholders = strategyIds.map((_, index) => `$${index + 4}`).join(', ');
      latestOwnershipStates = await this.subEpochService.subEpochRepository.manager.query(
        `
        SELECT DISTINCT ON ("strategyId") 
          "strategyId" as strategy_id, 
          "to" as current_owner
        FROM "voucher-transfer-events" 
        WHERE timestamp <= $3
          AND "blockchainType" = $1 
          AND "exchangeId" = $2
          AND "strategyId" IN (${placeholders})
        ORDER BY "strategyId", "blockId" DESC, "transactionIndex" DESC, "logIndex" DESC
      `,
        [deployment.blockchainType, deployment.exchangeId, new Date(maxTimestamp), ...strategyIds],
      );
    }

    // Get list of deleted strategies (with timestamp filter)
    const deletedStrategies = await this.subEpochService.subEpochRepository.manager.query(
      `
      SELECT DISTINCT "strategyId" as strategy_id 
      FROM "strategy-deleted-events" 
      WHERE timestamp <= $4
        AND "blockchainType" = $1 
        AND "exchangeId" = $2
        AND "pairId" = $3
    `,
      [deployment.blockchainType, deployment.exchangeId, campaign.pair.id, new Date(maxTimestamp)],
    );

    // Build lookup maps and strategy states (rest of the logic remains the same)
    const ownershipMap = new Map<string, string>();
    for (const ownership of latestOwnershipStates) {
      ownershipMap.set(ownership.strategy_id, ownership.current_owner);
    }

    const deletedStrategyIds = new Set(deletedStrategies.map((d) => d.strategy_id));

    // Build strategy states from latest states
    for (const strategyState of latestStrategyStates) {
      const strategyId = strategyState.strategy_id;
      const isDeleted = deletedStrategyIds.has(strategyId);

      const order0 = isDeleted ? { y: '0', A: '0', B: '0', z: '0' } : JSON.parse(strategyState.order0);
      const order1 = isDeleted ? { y: '0', A: '0', B: '0', z: '0' } : JSON.parse(strategyState.order1);

      // Order tokens lexicographically
      const isToken0Smaller = strategyState.token0_address.toLowerCase() <= strategyState.token1_address.toLowerCase();

      const pairToken0Address = isToken0Smaller ? strategyState.token0_address : strategyState.token1_address;
      const pairToken1Address = isToken0Smaller ? strategyState.token1_address : strategyState.token0_address;
      const pairToken0Decimals = isToken0Smaller ? strategyState.token0_decimals : strategyState.token1_decimals;
      const pairToken1Decimals = isToken0Smaller ? strategyState.token1_decimals : strategyState.token0_decimals;

      // Map orders to pair tokens
      const order0ForPair = isToken0Smaller ? order0 : order1; // token0 order
      const order1ForPair = isToken0Smaller ? order1 : order0; // token1 order

      const state: StrategyState = {
        strategyId,
        pairId: strategyState.pair_id,
        token0Address: pairToken0Address,
        token1Address: pairToken1Address,
        token0Decimals: pairToken0Decimals,
        token1Decimals: pairToken1Decimals,
        liquidity0: new Decimal(order0ForPair.y || 0),
        liquidity1: new Decimal(order1ForPair.y || 0),
        order0_A: this.decompressRateParameter(order0ForPair.A || '0'),
        order0_B: this.decompressRateParameter(order0ForPair.B || '0'),
        order0_z: new Decimal(order0ForPair.z || order0ForPair.y || 0),
        order1_A: this.decompressRateParameter(order1ForPair.A || '0'),
        order1_B: this.decompressRateParameter(order1ForPair.B || '0'),
        order1_z: new Decimal(order1ForPair.z || order1ForPair.y || 0),
        order0_A_compressed: new Decimal(order0ForPair.A || '0'),
        order0_B_compressed: new Decimal(order0ForPair.B || '0'),
        order0_z_compressed: new Decimal(order0ForPair.z || order0ForPair.y || '0'),
        order1_A_compressed: new Decimal(order1ForPair.A || '0'),
        order1_B_compressed: new Decimal(order1ForPair.B || '0'),
        order1_z_compressed: new Decimal(order1ForPair.z || order1ForPair.y || '0'),
        currentOwner: ownershipMap.get(strategyId) || strategyState.owner || '',
        creationWallet: strategyState.owner || '',
        lastProcessedBlock: strategyState.block_id,
        isDeleted,
        // Use the actual event timestamp from the database
        lastEventTimestamp: new Date(strategyState.timestamp).getTime(),
      };

      strategyStates.set(strategyId, state);
    }

    this.logger.log(
      `Initialized ${strategyStates.size} strategy states up to timestamp ${new Date(maxTimestamp).toISOString()}`,
    );
  }

  /**
   * Finds the block number that corresponds to a specific timestamp.
   *
   * @param timestamp - Target timestamp to find block for
   * @param deployment - Blockchain deployment configuration
   * @param maxBlock - Maximum block number to consider
   * @returns Promise resolving to block number at or before the timestamp
   */
  private async getBlockForTimestamp(timestamp: number, deployment: Deployment, maxBlock: number): Promise<number> {
    try {
      const targetDate = new Date(timestamp);
      const block = await this.blockService.getBlockAtOrBeforeTimestamp(targetDate, deployment);

      if (!block) {
        this.logger.warn(`No block found for timestamp ${targetDate.toISOString()}, using deployment start block`);
        return deployment.startBlock;
      }

      // Ensure we don't exceed the maxBlock limit
      const blockNumber = Math.min(block.id, maxBlock);

      return blockNumber;
    } catch (error) {
      this.logger.warn(`Error finding block for timestamp ${timestamp}, using deployment start block: ${error}`);
      return deployment.startBlock;
    }
  }

  /**
   * Processes a strategy creation event and updates the strategy states map.
   *
   * This method handles the initialization of a new strategy by:
   * - Extracting order parameters from the event data
   * - Applying lexicographic token ordering for consistent pair representation
   * - Decompressing price curve parameters for calculations
   * - Creating a complete StrategyState record with all required fields
   *
   * The created strategy state includes both compressed and decompressed versions
   * of price parameters to optimize for both storage and calculation efficiency.
   *
   * @param event - The strategy creation event containing order and token data
   * @param strategyStates - Map of current strategy states to update
   * @param eventTimestamp - Unix timestamp of the event for temporal tracking
   *
   * @internal This method must correctly handle token ordering and parameter
   * decompression to ensure accurate strategy state initialization.
   */
  private processCreatedEvent(
    event: StrategyCreatedEvent,
    strategyStates: StrategyStatesMap,
    eventTimestamp: number,
  ): void {
    const order0 = JSON.parse(event.order0);
    const order1 = JSON.parse(event.order1);

    // Ensure consistent token ordering within the pair
    const token0Address = event.token0.address.toLowerCase();
    const token1Address = event.token1.address.toLowerCase();
    const isToken0Smaller = token0Address <= token1Address;

    const pairToken0Address = isToken0Smaller ? token0Address : token1Address;
    const pairToken1Address = isToken0Smaller ? token1Address : token0Address;
    const pairToken0Decimals = isToken0Smaller ? event.token0.decimals : event.token1.decimals;
    const pairToken1Decimals = isToken0Smaller ? event.token1.decimals : event.token0.decimals;

    const order0ForPair = isToken0Smaller ? order0 : order1;
    const order1ForPair = isToken0Smaller ? order1 : order0;

    const state: StrategyState = {
      strategyId: event.strategyId,
      pairId: event.pair.id,
      token0Address: pairToken0Address,
      token1Address: pairToken1Address,
      token0Decimals: pairToken0Decimals,
      token1Decimals: pairToken1Decimals,
      liquidity0: new Decimal(order0ForPair.y || 0),
      liquidity1: new Decimal(order1ForPair.y || 0),
      order0_A: this.decompressRateParameter(order0ForPair.A || '0'),
      order0_B: this.decompressRateParameter(order0ForPair.B || '0'),
      order0_z: new Decimal(order0ForPair.z || order0ForPair.y || 0),
      order1_A: this.decompressRateParameter(order1ForPair.A || '0'),
      order1_B: this.decompressRateParameter(order1ForPair.B || '0'),
      order1_z: new Decimal(order1ForPair.z || order1ForPair.y || 0),
      order0_A_compressed: new Decimal(order0ForPair.A || '0'),
      order0_B_compressed: new Decimal(order0ForPair.B || '0'),
      order0_z_compressed: new Decimal(order0ForPair.z || order0ForPair.y || '0'),
      order1_A_compressed: new Decimal(order1ForPair.A || '0'),
      order1_B_compressed: new Decimal(order1ForPair.B || '0'),
      order1_z_compressed: new Decimal(order1ForPair.z || order1ForPair.y || '0'),
      currentOwner: event.owner,
      creationWallet: event.owner,
      lastProcessedBlock: event.block.id,
      isDeleted: false,
      lastEventTimestamp: eventTimestamp,
    };

    strategyStates.set(event.strategyId, state);
  }

  /**
   * Processes a strategy update event and modifies existing strategy state.
   *
   * This method updates an existing strategy's liquidity and price curve parameters
   * when a strategy is modified on-chain. It preserves the strategy's identity
   * (creation wallet, strategy ID) while updating all variable parameters.
   *
   * @param event - The strategy update event containing new order parameters
   * @param strategyStates - Map of current strategy states to update
   * @param eventTimestamp - Unix timestamp of the event for temporal tracking
   *
   * @internal Updates must maintain consistency with the original strategy's
   * token ordering and preserve all non-order-related state.
   */
  private processUpdatedEvent(
    event: StrategyUpdatedEvent,
    strategyStates: StrategyStatesMap,
    eventTimestamp: number,
  ): void {
    const existingState = strategyStates.get(event.strategyId);
    if (!existingState) return;

    // Apply consistent token ordering for the pair
    const token0Address = event.token0.address.toLowerCase();
    const token1Address = event.token1.address.toLowerCase();
    const isToken0Smaller = token0Address <= token1Address;

    const order0 = JSON.parse(event.order0);
    const order1 = JSON.parse(event.order1);

    const order0ForPair = isToken0Smaller ? order0 : order1;
    const order1ForPair = isToken0Smaller ? order1 : order0;

    existingState.liquidity0 = new Decimal(order0ForPair.y || 0);
    existingState.liquidity1 = new Decimal(order1ForPair.y || 0);
    existingState.order0_A = this.decompressRateParameter(order0ForPair.A || '0');
    existingState.order0_B = this.decompressRateParameter(order0ForPair.B || '0');
    existingState.order0_z = new Decimal(order0ForPair.z || order0ForPair.y || 0);
    existingState.order1_A = this.decompressRateParameter(order1ForPair.A || '0');
    existingState.order1_B = this.decompressRateParameter(order1ForPair.B || '0');
    existingState.order1_z = new Decimal(order1ForPair.z || order1ForPair.y || 0);
    existingState.order0_A_compressed = new Decimal(order0ForPair.A || '0');
    existingState.order0_B_compressed = new Decimal(order0ForPair.B || '0');
    existingState.order0_z_compressed = new Decimal(order0ForPair.z || order0ForPair.y || '0');
    existingState.order1_A_compressed = new Decimal(order1ForPair.A || '0');
    existingState.order1_B_compressed = new Decimal(order1ForPair.B || '0');
    existingState.order1_z_compressed = new Decimal(order1ForPair.z || order1ForPair.y || '0');
    existingState.lastProcessedBlock = event.block.id;
    existingState.lastEventTimestamp = eventTimestamp;
  }

  /**
   * Processes a strategy deletion event and marks the strategy as inactive.
   *
   * When a strategy is deleted on-chain, this method:
   * - Sets the deletion flag to prevent future reward calculations
   * - Zeros out all liquidity values to reflect the strategy's inactive state
   * - Resets all price curve parameters to zero
   * - Preserves historical data for audit purposes
   *
   * @param event - The strategy deletion event
   * @param strategyStates - Map of current strategy states to update
   * @param eventTimestamp - Unix timestamp of the event for temporal tracking
   *
   * @internal Deleted strategies should not receive rewards but their historical
   * data must be preserved for accurate reward calculations in past epochs.
   */
  private processDeletedEvent(
    event: StrategyDeletedEvent,
    strategyStates: StrategyStatesMap,
    eventTimestamp: number,
  ): void {
    const existingState = strategyStates.get(event.strategyId);
    if (!existingState) return;

    existingState.isDeleted = true;
    existingState.liquidity0 = new Decimal(0);
    existingState.liquidity1 = new Decimal(0);
    existingState.order0_A_compressed = new Decimal(0);
    existingState.order0_B_compressed = new Decimal(0);
    existingState.order0_z_compressed = new Decimal(0);
    existingState.order1_A_compressed = new Decimal(0);
    existingState.order1_B_compressed = new Decimal(0);
    existingState.order1_z_compressed = new Decimal(0);
    existingState.lastProcessedBlock = event.block.id;
    existingState.lastEventTimestamp = eventTimestamp;
  }

  /**
   * Processes a voucher transfer event to update strategy ownership.
   *
   * @param event - The voucher transfer event containing new owner information
   * @param strategyStates - Map of current strategy states to update
   * @param eventTimestamp - Unix timestamp of the event for temporal tracking
   */
  private processTransferEvent(
    event: VoucherTransferEvent,
    strategyStates: StrategyStatesMap,
    eventTimestamp: number,
  ): void {
    const existingState = strategyStates.get(event.strategyId);
    if (!existingState) return;

    existingState.currentOwner = event.to;
    existingState.lastProcessedBlock = event.block.id;
    existingState.lastEventTimestamp = eventTimestamp;
  }

  /**
   * Decompresses a rate parameter from its storage-optimized format.
   *
   * Carbon's price curve parameters are stored in compressed format to optimize
   * storage space. This method converts them back to their working precision:
   *
   * **Compression Format**: `compressed = mantissa + (exponent * SCALING_CONSTANT)`
   * **Decompression**: `value = mantissa * (2 ^ exponent)`
   *
   * The compression scheme allows storing large price ranges efficiently while
   * maintaining sufficient precision for reward calculations.
   *
   * @param compressedValue - The compressed parameter as a string
   *
   * @returns Decompressed Decimal value ready for mathematical operations
   *
   * @internal This method must maintain perfect precision to ensure accurate
   * price curve calculations and reward eligibility determinations.
   */
  private decompressRateParameter(compressedValue: string): Decimal {
    const compressed = new Decimal(compressedValue || '0');
    const mantissa = compressed.mod(this.SCALING_CONSTANT);
    const exponent = compressed.div(this.SCALING_CONSTANT).floor();
    return mantissa.mul(new Decimal(2).pow(exponent));
  }

  /**
   * Creates a deep copy of a StrategyState to prevent reference sharing.
   *
   * @param state - The strategy state to clone
   * @returns Deep copy with new Decimal instances for temporal isolation
   */
  private deepCloneStrategyState(state: StrategyState): StrategyState {
    return {
      strategyId: state.strategyId,
      pairId: state.pairId,
      token0Address: state.token0Address,
      token1Address: state.token1Address,
      token0Decimals: state.token0Decimals,
      token1Decimals: state.token1Decimals,
      liquidity0: new Decimal(state.liquidity0.toFixed()), // Deep clone Decimal
      liquidity1: new Decimal(state.liquidity1.toFixed()),
      order0_A: new Decimal(state.order0_A.toFixed()),
      order0_B: new Decimal(state.order0_B.toFixed()),
      order0_z: new Decimal(state.order0_z.toFixed()),
      order1_A: new Decimal(state.order1_A.toFixed()),
      order1_B: new Decimal(state.order1_B.toFixed()),
      order1_z: new Decimal(state.order1_z.toFixed()),
      order0_A_compressed: new Decimal(state.order0_A_compressed.toFixed()),
      order0_B_compressed: new Decimal(state.order0_B_compressed.toFixed()),
      order0_z_compressed: new Decimal(state.order0_z_compressed.toFixed()),
      order1_A_compressed: new Decimal(state.order1_A_compressed.toFixed()),
      order1_B_compressed: new Decimal(state.order1_B_compressed.toFixed()),
      order1_z_compressed: new Decimal(state.order1_z_compressed.toFixed()),
      currentOwner: state.currentOwner,
      creationWallet: state.creationWallet,
      lastProcessedBlock: state.lastProcessedBlock,
      isDeleted: state.isDeleted,
      lastEventTimestamp: state.lastEventTimestamp,
    };
  }

  /**
   * Creates a deep copy of the entire strategy states map.
   *
   * @param states - The strategy states map to clone
   * @returns New map with deep-copied strategy states
   */
  private deepCloneStrategyStates(states: StrategyStatesMap): StrategyStatesMap {
    const cloned = new Map<string, StrategyState>();
    for (const [id, state] of states) {
      cloned.set(id, this.deepCloneStrategyState(state));
    }
    return cloned;
  }

  /**
   * Calculates all epochs within a given time range for a campaign.
   *
   * @param campaign - The campaign to calculate epochs for
   * @param startTimestamp - Start of the time range to consider
   * @param endTimestamp - End of the time range to consider
   * @returns Array of epoch information objects with timing and reward details
   */
  private calculateEpochsInRange(campaign: Campaign, startTimestamp: number, endTimestamp: number): EpochInfo[] {
    const epochs: EpochInfo[] = [];

    // Convert Date objects to Unix timestamps (milliseconds)
    const campaignStartTime = campaign.startDate.getTime();
    const campaignEndTime = campaign.endDate.getTime();
    const totalCampaignDuration = campaignEndTime - campaignStartTime;

    // First pass: calculate all epochs for the entire campaign to ensure exact total
    const allEpochs = [];
    let epochStart = campaignStartTime;
    let epochNumber = 1;
    let cumulativeRewards = new Decimal(0);

    while (epochStart < campaignEndTime) {
      const epochEnd = Math.min(epochStart + this.EPOCH_DURATION * 1000, campaignEndTime); // Convert EPOCH_DURATION to milliseconds
      const epochDuration = epochEnd - epochStart;

      // Always use proportional calculation for all epochs
      let epochRewards = new Decimal(campaign.rewardAmount).mul(epochDuration).div(totalCampaignDuration);

      // Safety check: ensure we never exceed campaign total
      const projectedTotal = cumulativeRewards.add(epochRewards);
      if (projectedTotal.gt(new Decimal(campaign.rewardAmount))) {
        // Cap the epoch reward to remaining budget
        epochRewards = new Decimal(campaign.rewardAmount).minus(cumulativeRewards);
        // Ensure non-negative
        epochRewards = Decimal.max(epochRewards, 0);
      }

      allEpochs.push({
        epochNumber,
        startTimestamp: new Date(epochStart),
        endTimestamp: new Date(epochEnd),
        totalRewards: epochRewards,
        start: epochStart,
        end: epochEnd,
      });

      cumulativeRewards = cumulativeRewards.add(epochRewards);
      epochStart = epochEnd;
      epochNumber++;
    }

    // Second pass: filter epochs that intersect with the requested time range
    for (const epoch of allEpochs) {
      if (epoch.end > startTimestamp && epoch.start < endTimestamp) {
        epochs.push({
          epochNumber: epoch.epochNumber,
          startTimestamp: epoch.startTimestamp,
          endTimestamp: epoch.endTimestamp,
          totalRewards: epoch.totalRewards,
        });
      }
    }

    return epochs;
  }

  /**
   * Processes a single epoch by generating sub-epochs and calculating rewards.
   *
   * @param campaign - The campaign being processed
   * @param epoch - Epoch timing and reward information
   * @param strategyStates - Current strategy states for this epoch
   * @param priceCache - USD price data for the processing timeframe
   * @param batchEvents - Events that occurred during this epoch
   * @param campaignDistributedAmounts - Tracking of distributed rewards per campaign
   * @param campaignTotalAmounts - Total budget available per campaign
   */
  private async processEpoch(
    campaign: Campaign,
    epoch: EpochInfo,
    strategyStates: StrategyStatesMap,
    priceCache: PriceCache,
    batchEvents: BatchEvents,
    campaignDistributedAmounts: Map<number, Decimal>,
    campaignTotalAmounts: Map<number, Decimal>,
  ): Promise<void> {
    this.logger.log(`Processing epoch ${epoch.epochNumber} for campaign ${campaign.id}`);

    // Ensure token weighting configuration is available for this deployment
    const config = this.DEPLOYMENT_TOKEN_WEIGHTINGS[campaign.exchangeId];
    if (!config) {
      this.logger.error(`No weighting configuration found for exchangeId: ${campaign.exchangeId}, skipping epoch`);
      return;
    }

    // Verify that the token pair has configured reward weightings
    const token0Weighting = this.getTokenWeighting(campaign.pair.token0.address, campaign.exchangeId);
    const token1Weighting = this.getTokenWeighting(campaign.pair.token1.address, campaign.exchangeId);

    if (token0Weighting === 0 && token1Weighting === 0) {
      this.logger.warn(
        `Both tokens in pair ${campaign.pair.token0.address}/${campaign.pair.token1.address} have zero weighting - no rewards will be distributed`,
      );
      // Process epoch but no rewards will be distributed
    }

    // Create time-based snapshots within the epoch for reward calculation
    const subEpochs = this.generateSubEpochsForEpoch(epoch, strategyStates, campaign, priceCache, batchEvents);

    if (subEpochs.length === 0) return;

    const subEpochsToSave: Partial<SubEpoch>[] = [];
    const rewardPerSubEpoch = epoch.totalRewards.div(subEpochs.length);
    const currentBatchEndBlock = Math.max(
      0,
      ...batchEvents.createdEvents.map((e) => e.block.id),
      ...batchEvents.updatedEvents.map((e) => e.block.id),
      ...batchEvents.deletedEvents.map((e) => e.block.id),
      ...batchEvents.transferEvents.map((e) => e.block.id),
    );

    for (const subEpochData of subEpochs) {
      const rewardResults = this.calculateSubEpochRewards(
        subEpochData,
        rewardPerSubEpoch,
        campaign,
        campaignDistributedAmounts,
        campaignTotalAmounts,
      );

      // Transform reward calculations into database entities
      for (const [strategyId, strategy] of subEpochData.strategies) {
        if (strategy.isDeleted || (strategy.liquidity0.eq(0) && strategy.liquidity1.eq(0))) {
          continue;
        }

        // Strategy state reflects the exact point-in-time conditions during this sub-epoch

        const totalStrategyReward = rewardResults.totalRewards.get(strategyId) || new Decimal(0);
        const tokenRewards = rewardResults.tokenRewards.get(strategyId) || {
          token0: new Decimal(0),
          token1: new Decimal(0),
        };

        // Compute reward eligibility based on strategy state at this specific time
        const toleranceFactor = new Decimal(1 - this.TOLERANCE_PERCENTAGE).sqrt();
        const eligible0 = this.calculateEligibleLiquidity(
          strategy.liquidity0,
          strategy.order0_z,
          strategy.order0_A,
          strategy.order0_B,
          subEpochData.targetSqrtPriceScaled,
          toleranceFactor,
        );

        const eligible1 = this.calculateEligibleLiquidity(
          strategy.liquidity1,
          strategy.order1_z,
          strategy.order1_A,
          strategy.order1_B,
          subEpochData.invTargetSqrtPriceScaled,
          toleranceFactor,
        );

        const token0RewardZoneBoundary = toleranceFactor.mul(subEpochData.targetSqrtPriceScaled);
        const token1RewardZoneBoundary = toleranceFactor.mul(subEpochData.invTargetSqrtPriceScaled);

        // Retrieve USD exchange rates for the sub-epoch timestamp
        const token0UsdRate = this.getUsdRateForTimestamp(priceCache, strategy.token0Address, subEpochData.timestamp);
        const token1UsdRate = this.getUsdRateForTimestamp(priceCache, strategy.token1Address, subEpochData.timestamp);

        subEpochsToSave.push({
          strategyId,
          campaignId: campaign.id,
          // SubEpochService will assign sequential numbers during save operation
          epochNumber: epoch.epochNumber,
          epochStart: epoch.startTimestamp,
          subEpochTimestamp: new Date(subEpochData.timestamp),

          // Convert all numeric values to strings for precise database storage
          token0Reward: tokenRewards.token0.toFixed(),
          token1Reward: tokenRewards.token1.toFixed(),
          totalReward: totalStrategyReward.toFixed(),
          liquidity0: strategy.liquidity0.toFixed(),
          liquidity1: strategy.liquidity1.toFixed(),
          token0Address: strategy.token0Address,
          token1Address: strategy.token1Address,
          token0UsdRate: new Decimal(token0UsdRate).toFixed(),
          token1UsdRate: new Decimal(token1UsdRate).toFixed(),
          targetPrice: subEpochData.order0TargetPrice.toFixed(),
          eligible0: eligible0.toFixed(),
          eligible1: eligible1.toFixed(),
          token0RewardZoneBoundary: token0RewardZoneBoundary.toFixed(),
          token1RewardZoneBoundary: token1RewardZoneBoundary.toFixed(),
          token0Weighting: token0Weighting.toString(),
          token1Weighting: token1Weighting.toString(),
          token0Decimals: strategy.token0Decimals,
          token1Decimals: strategy.token1Decimals,
          order0ACompressed: strategy.order0_A_compressed.toFixed(),
          order0BCompressed: strategy.order0_B_compressed.toFixed(),
          order0A: strategy.order0_A.toFixed(),
          order0B: strategy.order0_B.toFixed(),
          order0Z: strategy.order0_z.toFixed(),
          order1ACompressed: strategy.order1_A_compressed.toFixed(),
          order1BCompressed: strategy.order1_B_compressed.toFixed(),
          order1A: strategy.order1_A.toFixed(),
          order1B: strategy.order1_B.toFixed(),
          order1Z: strategy.order1_z.toFixed(),
          lastEventTimestamp: new Date(strategy.lastEventTimestamp),
          lastProcessedBlock: currentBatchEndBlock,
          ownerAddress: strategy.currentOwner,
        });
      }
    }

    // Persist sub-epoch data with automatic sequential numbering
    await this.subEpochService.saveSubEpochs(subEpochsToSave);
    this.logger.log(`Saved ${subEpochsToSave.length} sub-epoch records for epoch ${epoch.epochNumber}`);
  }

  /**
   * Generates a deterministic seed for epoch processing using campaign and epoch information.
   * This ensures consistent snapshot intervals across multiple runs using only the salt,
   * campaign ID, and epoch number for deterministic randomness.
   *
   * @param campaign - The campaign being processed
   * @param epoch - Epoch information for seed generation
   * @returns Deterministic seed string for reproducible randomness
   */
  private generateEpochSeed(campaign: Campaign, epoch: EpochInfo): string {
    const salt = this.configService.get<string>('MERKL_SNAPSHOT_SALT');

    if (!salt) {
      throw new Error('MERKL_SNAPSHOT_SALT environment variable is required for secure seed generation');
    }

    const seedComponents = [salt, campaign.id, epoch.epochNumber.toString()];

    return '0x' + createHash('sha256').update(seedComponents.join('|')).digest('hex');
  }

  /**
   * Determines snapshot intervals for sub-epoch generation within an epoch.
   * Uses either a fixed seed for testing or deterministic seed for production.
   *
   * @param campaign - The campaign being processed
   * @param epoch - Epoch timing information
   * @returns Array of time intervals in seconds for snapshot generation
   */
  private getSnapshotIntervals(campaign: Campaign, epoch: EpochInfo): number[] {
    const epochDurationMs = epoch.endTimestamp.getTime() - epoch.startTimestamp.getTime();
    const epochDurationSeconds = Math.floor(epochDurationMs / 1000); // Convert to seconds for partitioner

    // Detect if a fixed seed is configured for deterministic testing
    const merklSnapshotSeed = this.configService.get<string>('MERKL_SNAPSHOT_SEED');

    if (merklSnapshotSeed) {
      return partitionSingleEpoch(
        epochDurationSeconds,
        this.MIN_SNAPSHOT_INTERVAL,
        this.MAX_SNAPSHOT_INTERVAL,
        merklSnapshotSeed,
      );
    } else {
      // Production mode: generate seed from campaign and epoch data
      const seed = this.generateEpochSeed(campaign, epoch);

      return partitionSingleEpoch(epochDurationSeconds, this.MIN_SNAPSHOT_INTERVAL, this.MAX_SNAPSHOT_INTERVAL, seed);
    }
  }

  /**
   * Generates sub-epoch snapshots throughout an epoch for reward calculations.
   *
   * @param epoch - Epoch timing and information
   * @param strategyStates - Initial strategy states for the epoch
   * @param campaign - Campaign configuration
   * @param priceCache - USD price data for target price calculations
   * @param batchEvents - Events to replay during snapshot generation
   * @returns Array of sub-epoch snapshots with strategy states and prices
   */
  private generateSubEpochsForEpoch(
    epoch: EpochInfo,
    strategyStates: StrategyStatesMap,
    campaign: Campaign,
    priceCache: PriceCache,
    batchEvents: BatchEvents,
  ): SubEpochData[] {
    const subEpochs: SubEpochData[] = [];

    // Organize all events in temporal sequence for accurate state replay
    const chronologicalEvents = this.sortBatchEventsChronologically(batchEvents);

    // Determine when to take snapshots throughout the epoch
    const snapshotIntervals = this.getSnapshotIntervals(campaign, epoch);

    // Set up variables for iterating through the epoch timeline
    const currentStrategyStates = this.deepCloneStrategyStates(strategyStates); // Deep clone to prevent input mutation
    let eventIndex = 0;
    let currentTime = epoch.startTimestamp.getTime();
    const epochStartTimestamp = currentTime;
    const epochEndTimestamp = epoch.endTimestamp.getTime();
    const campaignEndTimestamp = campaign.endDate.getTime();

    // Initialize strategy states by applying relevant historical events
    // Limited to events within the campaign's active timeframe
    const campaignStartTimestamp = campaign.startDate.getTime();
    while (
      eventIndex < chronologicalEvents.length &&
      chronologicalEvents[eventIndex].timestamp < currentTime &&
      chronologicalEvents[eventIndex].timestamp >= campaignStartTimestamp
    ) {
      this.applyEventToStrategyStates(chronologicalEvents[eventIndex], currentStrategyStates);
      eventIndex++;
    }

    // Create snapshots at predetermined intervals throughout the epoch
    let intervalIndex = 0;
    while (currentTime < epochEndTimestamp && intervalIndex < snapshotIntervals.length) {
      // Avoid processing beyond the campaign's end time
      if (currentTime >= campaignEndTimestamp) {
        break;
      }

      // Update strategy states with events up to the current snapshot time
      while (
        eventIndex < chronologicalEvents.length &&
        chronologicalEvents[eventIndex].timestamp <= currentTime &&
        chronologicalEvents[eventIndex].timestamp >= epochStartTimestamp
      ) {
        this.applyEventToStrategyStates(chronologicalEvents[eventIndex], currentStrategyStates);
        eventIndex++;
      }

      // Calculate target exchange rates for reward eligibility
      const targetPrices = this.getTargetPricesAtTime(currentTime, campaign, priceCache);
      if (targetPrices === null) {
        currentTime += snapshotIntervals[intervalIndex];
        intervalIndex++;
        continue;
      }

      // Apply correct decimal precision for the token pair
      const token0Decimals = campaign.pair.token0.decimals;
      const token1Decimals = campaign.pair.token1.decimals;

      // Create snapshot with current strategy states and price data
      subEpochs.push({
        timestamp: currentTime,
        order0TargetPrice: targetPrices.order0TargetPrice,
        order1TargetPrice: targetPrices.order1TargetPrice,
        targetSqrtPriceScaled: this.calculateTargetSqrtPriceScaled(
          targetPrices.order0TargetPrice,
          token0Decimals,
          token1Decimals,
        ),
        invTargetSqrtPriceScaled: this.calculateInvTargetSqrtPriceScaled(
          targetPrices.order1TargetPrice,
          token0Decimals,
          token1Decimals,
        ),
        strategies: this.deepCloneStrategyStates(currentStrategyStates),
      });

      // Move to the next scheduled snapshot time
      currentTime += snapshotIntervals[intervalIndex] * 1000;
      intervalIndex++;
    }

    return subEpochs;
  }

  /**
   * Calculates reward distribution for a single sub-epoch snapshot.
   *
   * This method implements the core reward distribution algorithm:
   *
   * **Phase 1: Eligibility Calculation**
   * - Determines how much liquidity from each strategy qualifies for rewards
   * - Applies proximity-based eligibility (closer to market price = more rewards)
   * - Applies token-specific weighting multipliers
   *
   * **Phase 2: Reward Distribution**
   * - Splits reward pool between token0 and token1 based on their weightings
   * - Distributes each token's rewards proportionally to eligible liquidity
   * - Enforces campaign budget limits with proportional scaling if needed
   *
   * **Budget Enforcement**
   * - Tracks total distributed amounts to prevent over-allocation
   * - Applies proportional scaling when rewards would exceed remaining budget
   * - Updates campaign distribution tracking for future epoch processing
   *
   * @param subEpoch - Snapshot data containing strategy states and market prices
   * @param rewardPool - Total rewards available for distribution in this sub-epoch
   * @param campaign - Campaign configuration including token weightings
   * @param campaignDistributedAmounts - Running total of rewards distributed per campaign
   * @param campaignTotalAmounts - Total budget available per campaign
   *
   * @returns Object containing total rewards per strategy and breakdown by token
   *
   * @internal This method performs the financial core of reward calculation and must
   * maintain mathematical precision to ensure fair and accurate distribution.
   */
  private calculateSubEpochRewards(
    subEpoch: SubEpochData,
    rewardPool: Decimal,
    campaign: Campaign,
    campaignDistributedAmounts: Map<number, Decimal>,
    campaignTotalAmounts: Map<number, Decimal>,
  ): { totalRewards: Map<string, Decimal>; tokenRewards: Map<string, { token0: Decimal; token1: Decimal }> } {
    const rewards = new Map<string, Decimal>();
    const toleranceFactor = new Decimal(1 - this.TOLERANCE_PERCENTAGE).sqrt();

    let totalWeightedEligible0 = new Decimal(0);
    let totalWeightedEligible1 = new Decimal(0);
    const strategyWeightedEligibility0 = new Map<string, Decimal>();
    const strategyWeightedEligibility1 = new Map<string, Decimal>();

    // Calculate reward eligibility for each strategy based on liquidity and token weightings
    for (const [strategyId, strategy] of subEpoch.strategies) {
      if (strategy.isDeleted || (strategy.liquidity0.eq(0) && strategy.liquidity1.eq(0))) {
        continue;
      }

      const token0Weighting = this.getTokenWeighting(strategy.token0Address, campaign.exchangeId);
      const token1Weighting = this.getTokenWeighting(strategy.token1Address, campaign.exchangeId);

      // Determine how much liquidity qualifies for rewards based on price proximity
      const eligible0 = this.calculateEligibleLiquidity(
        strategy.liquidity0,
        strategy.order0_z,
        strategy.order0_A,
        strategy.order0_B,
        subEpoch.targetSqrtPriceScaled,
        toleranceFactor,
      );

      const eligible1 = this.calculateEligibleLiquidity(
        strategy.liquidity1,
        strategy.order1_z,
        strategy.order1_A,
        strategy.order1_B,
        subEpoch.invTargetSqrtPriceScaled,
        toleranceFactor,
      );

      // Apply token-specific multipliers to eligible liquidity
      if (eligible0.gt(0) && token0Weighting > 0) {
        const weightedEligible0 = eligible0.mul(token0Weighting);
        strategyWeightedEligibility0.set(strategyId, weightedEligible0);
        totalWeightedEligible0 = totalWeightedEligible0.add(weightedEligible0);
      }

      if (eligible1.gt(0) && token1Weighting > 0) {
        const weightedEligible1 = eligible1.mul(token1Weighting);
        strategyWeightedEligibility1.set(strategyId, weightedEligible1);
        totalWeightedEligible1 = totalWeightedEligible1.add(weightedEligible1);
      }
    }

    // Distribute the reward pool between token0 and token1 based on their weightings
    const token0Weighting = this.getTokenWeighting(campaign.pair.token0.address, campaign.exchangeId);
    const token1Weighting = this.getTokenWeighting(campaign.pair.token1.address, campaign.exchangeId);
    const totalWeight = token0Weighting + token1Weighting;

    let token0RewardPool = new Decimal(0);
    let token1RewardPool = new Decimal(0);

    if (totalWeight > 0) {
      token0RewardPool = rewardPool.mul(token0Weighting).div(totalWeight);
      token1RewardPool = rewardPool.mul(token1Weighting).div(totalWeight);
    }

    // Return empty results when no strategies are eligible for rewards
    if (totalWeightedEligible0.eq(0) && totalWeightedEligible1.eq(0)) {
      return { totalRewards: rewards, tokenRewards: new Map() };
    }

    // Distribute rewards proportionally based on weighted eligible liquidity
    const strategyRewards = new Map<string, { token0: Decimal; token1: Decimal }>();

    // Allocate token0 portion of rewards to eligible strategies
    if (totalWeightedEligible0.gt(0)) {
      for (const [strategyId, weightedEligibleLiquidity] of strategyWeightedEligibility0) {
        const rewardShare = weightedEligibleLiquidity.div(totalWeightedEligible0);
        const reward = token0RewardPool.mul(rewardShare);
        rewards.set(strategyId, (rewards.get(strategyId) || new Decimal(0)).add(reward));
        const existing = strategyRewards.get(strategyId) || { token0: new Decimal(0), token1: new Decimal(0) };
        existing.token0 = existing.token0.add(reward);
        strategyRewards.set(strategyId, existing);
      }
    }

    // Allocate token1 portion of rewards to eligible strategies
    if (totalWeightedEligible1.gt(0)) {
      for (const [strategyId, weightedEligibleLiquidity] of strategyWeightedEligibility1) {
        const rewardShare = weightedEligibleLiquidity.div(totalWeightedEligible1);
        const reward = token1RewardPool.mul(rewardShare);
        rewards.set(strategyId, (rewards.get(strategyId) || new Decimal(0)).add(reward));
        const existing = strategyRewards.get(strategyId) || { token0: new Decimal(0), token1: new Decimal(0) };
        existing.token1 = existing.token1.add(reward);
        strategyRewards.set(strategyId, existing);
      }
    }

    // Enforce campaign budget limits to prevent over-distribution
    const currentDistributed = campaignDistributedAmounts.get(campaign.id) as Decimal;
    const campaignTotal = campaignTotalAmounts.get(campaign.id) as Decimal;
    const remaining = campaignTotal.sub(currentDistributed);

    // Sum up all rewards scheduled for distribution
    let totalRewardsToDistribute = new Decimal(0);
    for (const reward of rewards.values()) {
      totalRewardsToDistribute = totalRewardsToDistribute.add(reward);
    }

    // Apply proportional scaling if rewards exceed remaining budget
    if (totalRewardsToDistribute.gt(remaining)) {
      this.logger.warn(
        `Campaign ${campaign.id}: Capping rewards from ${totalRewardsToDistribute.toString()} ` +
          `to ${remaining.toString()}`,
      );

      if (remaining.gt(0)) {
        // Scale down all rewards to fit within remaining budget
        const scaleFactor = remaining.div(totalRewardsToDistribute);

        for (const [strategyId, reward] of rewards) {
          const scaledReward = reward.mul(scaleFactor);
          rewards.set(strategyId, scaledReward);

          // Apply the same scaling to individual token reward components
          const tokenReward = strategyRewards.get(strategyId);
          if (tokenReward) {
            strategyRewards.set(strategyId, {
              token0: tokenReward.token0.mul(scaleFactor),
              token1: tokenReward.token1.mul(scaleFactor),
            });
          }
        }
        totalRewardsToDistribute = remaining;
      } else {
        // Set all rewards to zero when budget is exhausted
        for (const [strategyId] of rewards) {
          rewards.set(strategyId, new Decimal(0));
          strategyRewards.set(strategyId, { token0: new Decimal(0), token1: new Decimal(0) });
        }
        totalRewardsToDistribute = new Decimal(0);
      }
    }

    // Track the total amount distributed to enforce future budget limits
    campaignDistributedAmounts.set(campaign.id, currentDistributed.add(totalRewardsToDistribute));

    return { totalRewards: rewards, tokenRewards: strategyRewards };
  }

  /**
   * Calculates how much liquidity from a strategy order is eligible for rewards.
   *
   * This method implements the proximity-based eligibility algorithm where liquidity
   * closer to the market price receives higher rewards. The calculation considers:
   *
   * - **Price Proximity**: Orders closer to market price are more eligible
   * - **Tolerance Zone**: Defines the price range where rewards are distributed
   * - **Linear Scaling**: Eligibility decreases linearly as price moves away from market
   * - **Boundary Conditions**: Handles edge cases where orders are outside reward zones
   *
   * The algorithm uses the strategy's price curve parameters (A, B) to determine
   * how much of the available liquidity (y) falls within the reward-eligible price range.
   *
   * @param y - Available liquidity in the order
   * @param z - Total capacity of the order (for proportional calculations)
   * @param A - Price curve parameter A (decompressed)
   * @param B - Price curve parameter B (decompressed)
   * @param targetSqrtPriceScaled - Market price scaled by token decimals and scaling constant
   * @param toleranceFactor - Multiplier defining the reward eligibility zone around market price
   *
   * @returns Decimal amount of liquidity eligible for rewards (0 <= result <= y)
   *
   * @internal This calculation is fundamental to fair reward distribution and must
   * handle all edge cases correctly to prevent over or under-rewarding strategies.
   */
  private calculateEligibleLiquidity(
    y: Decimal,
    z: Decimal,
    A: Decimal,
    B: Decimal,
    targetSqrtPriceScaled: Decimal,
    toleranceFactor: Decimal,
  ): Decimal {
    const rewardZoneBoundary = toleranceFactor.mul(targetSqrtPriceScaled);
    const orderPriceHigh = A.add(B);

    if (rewardZoneBoundary.lte(B)) {
      return y;
    }

    if (rewardZoneBoundary.gte(orderPriceHigh)) {
      return new Decimal(0);
    }

    // Handle edge case where price curve parameter A is zero
    if (A.eq(0)) {
      return new Decimal(0);
    }

    const ineligibleFraction = rewardZoneBoundary.sub(B).div(A);
    const ineligibleLiquidity = z.mul(ineligibleFraction);
    const eligibleLiquidity = y.sub(ineligibleLiquidity);

    return Decimal.max(eligibleLiquidity, 0);
  }

  /**
   * Calculates scaled square root price accounting for token decimals.
   *
   * @param targetPrice - The target price to scale
   * @param baseDecimals - Decimal places of the base token
   * @param quoteDecimals - Decimal places of the quote token
   * @returns Scaled square root price for eligibility calculations
   */
  private calculateTargetSqrtPriceScaled(targetPrice: Decimal, baseDecimals: number, quoteDecimals: number): Decimal {
    // Compute scaled square root price accounting for token decimals
    const baseDecimalsFactor = new Decimal(10).pow(baseDecimals);
    const quoteDecimalsFactor = new Decimal(10).pow(quoteDecimals);
    const adjustedPrice = targetPrice.mul(baseDecimalsFactor).div(quoteDecimalsFactor);
    const sqrtAdjustedPrice = adjustedPrice.sqrt();
    const result = sqrtAdjustedPrice.mul(this.SCALING_CONSTANT);

    return result;
  }

  /**
   * Calculates scaled square root of inverse price accounting for token decimals.
   *
   * @param targetPrice - The target price to invert and scale
   * @param baseDecimals - Decimal places of the base token
   * @param quoteDecimals - Decimal places of the quote token
   * @returns Scaled square root of inverse price for eligibility calculations
   */
  private calculateInvTargetSqrtPriceScaled(
    targetPrice: Decimal,
    baseDecimals: number,
    quoteDecimals: number,
  ): Decimal {
    // Compute scaled square root of inverse price accounting for token decimals
    const baseDecimalsFactor = new Decimal(10).pow(baseDecimals);
    const quoteDecimalsFactor = new Decimal(10).pow(quoteDecimals);
    const adjustedPrice = targetPrice.mul(quoteDecimalsFactor).div(baseDecimalsFactor);
    const sqrtAdjustedPrice = adjustedPrice.sqrt();
    // Note: Direct calculation without taking reciprocal for efficiency
    const result = sqrtAdjustedPrice.mul(this.SCALING_CONSTANT);

    return result;
  }

  /**
   * Retrieves the timestamp for a specific block number.
   *
   * @param blockNumber - The block number to get timestamp for
   * @param deployment - Blockchain deployment configuration
   * @returns Promise resolving to block timestamp in milliseconds
   */
  private async getTimestampForBlock(blockNumber: number, deployment: Deployment): Promise<number> {
    const block = await this.blockService.getBlock(blockNumber, deployment);
    return block.timestamp.getTime();
  }

  /**
   * Builds a comprehensive USD price cache for the entire processing timeframe.
   *
   * This method creates a global price cache that ensures consistent USD exchange rates
   * across all epoch calculations, which is critical for fair reward distribution:
   *
   * **Token Collection**:
   * - Gathers all unique token addresses from campaign pairs
   * - Includes tokens from actual strategy events to handle address variations
   * - Handles lexicographic token ordering differences
   *
   * **Price Retrieval**:
   * - Fetches historical USD rates for the complete processing timeframe
   * - Organizes rates by token address for efficient lookup
   * - Sorts rates chronologically for optimal time-based queries
   *
   * **Consistency Guarantee**:
   * - All epochs use the same price data source for deterministic results
   * - Eliminates price inconsistencies that could arise from separate API calls
   * - Provides foundation for accurate reward-to-USD conversions
   *
   * @param campaigns - Active campaigns requiring price data
   * @param startTimestamp - Earliest timestamp requiring price data
   * @param endTimestamp - Latest timestamp requiring price data
   * @param deployment - Blockchain deployment for token queries
   *
   * @returns Promise resolving to price cache with organized USD rate data
   *
   * @throws {Error} When price data retrieval fails or token addresses are invalid
   *
   * @internal Price consistency is critical for fair reward distribution across
   * different time periods and must be maintained throughout processing.
   */
  private async createGlobalPriceCache(
    campaigns: Campaign[],
    startTimestamp: number,
    endTimestamp: number,
    deployment: Deployment,
  ): Promise<PriceCache> {
    // Gather all token addresses that will be needed for price lookups
    // Includes both pair tokens and strategy tokens to handle address variations
    const uniqueTokenAddresses = new Set<string>();

    for (const campaign of campaigns) {
      // Include the primary token pair for this campaign
      uniqueTokenAddresses.add(campaign.pair.token0.address);
      uniqueTokenAddresses.add(campaign.pair.token1.address);

      // Include tokens from actual strategies to handle address ordering variations
      try {
        const strategyTokens = await this.subEpochService.subEpochRepository.manager.query(
          `
          SELECT DISTINCT 
            t0.address as token0_address,
            t1.address as token1_address
          FROM "strategy-created-events" c
          LEFT JOIN tokens t0 ON c."token0Id" = t0.id  
          LEFT JOIN tokens t1 ON c."token1Id" = t1.id
          WHERE c."blockchainType" = $1 
            AND c."exchangeId" = $2
            AND c."pairId" = $3
        `,
          [deployment.blockchainType, deployment.exchangeId, campaign.pair.id],
        );

        for (const strategyToken of strategyTokens) {
          if (strategyToken.token0_address) uniqueTokenAddresses.add(strategyToken.token0_address);
          if (strategyToken.token1_address) uniqueTokenAddresses.add(strategyToken.token1_address);
        }
      } catch (error) {
        this.logger.warn(
          `Could not fetch strategy token addresses for campaign ${campaign.id}, using pair tokens only`,
        );
      }
    }

    const tokenAddresses = Array.from(uniqueTokenAddresses);
    const startDate = new Date(startTimestamp).toISOString();
    const endDate = new Date(endTimestamp).toISOString();

    this.logger.log(`Fetching global USD rates for ${tokenAddresses.length} tokens from ${startDate} to ${endDate}`);
    this.logger.log(`Token addresses: ${tokenAddresses.join(', ')}`);

    // Retrieve historical USD exchange rates for all required tokens
    const rates = await this.historicQuoteService.getUsdRates(deployment, tokenAddresses, startDate, endDate);

    this.logger.log(`Received ${rates.length} USD rate records from historic quote service`);

    // Organize rates by token address for efficient lookup
    const cacheMap = new Map<string, Array<{ timestamp: number; usd: number }>>();
    for (const rate of rates) {
      const tokenAddress = rate.address.toLowerCase();
      if (!cacheMap.has(tokenAddress)) {
        cacheMap.set(tokenAddress, []);
      }
      const tokenRates = cacheMap.get(tokenAddress);
      if (tokenRates) {
        tokenRates.push({
          timestamp: rate.day * 1000, // Convert seconds to milliseconds
          usd: rate.usd,
        });
      }
    }

    // Order rates chronologically for optimal time-based queries
    for (const [, tokenRates] of cacheMap.entries()) {
      tokenRates.sort((a, b) => a.timestamp - b.timestamp);
    }

    return {
      rates: cacheMap,
      timeWindow: { start: startTimestamp, end: endTimestamp },
    };
  }

  /**
   * Retrieves the USD exchange rate for a token at a specific point in time.
   *
   * @param priceCache - Price cache containing historical USD rates
   * @param tokenAddress - Contract address of the token
   * @param targetTimestamp - Timestamp to get rate for
   * @returns USD exchange rate at the specified time
   */
  private getUsdRateForTimestamp(priceCache: PriceCache, tokenAddress: string, targetTimestamp: number): number {
    const normalizedAddress = tokenAddress.toLowerCase();
    const tokenRates = priceCache.rates.get(normalizedAddress);

    if (!tokenRates || tokenRates.length === 0) {
      this.logger.warn(`No USD rates found for token ${tokenAddress} (normalized: ${normalizedAddress})`);
      this.logger.warn(`Available tokens in cache: ${Array.from(priceCache.rates.keys()).join(', ')}`);
      return 0;
    }

    // Locate the rate entry with timestamp nearest to the target time
    let closest = tokenRates[0];
    let minDiff = Math.abs(closest.timestamp - targetTimestamp);

    for (const rate of tokenRates) {
      const diff = Math.abs(rate.timestamp - targetTimestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closest = rate;
      }
    }

    return closest.usd;
  }

  /**
   * Calculates target prices for both order directions at a specific time.
   *
   * @param timestamp - The timestamp to calculate prices for
   * @param campaign - Campaign containing token pair information
   * @param priceCache - Price cache for USD rate lookups
   * @returns Target prices for both orders, or null if rates unavailable
   */
  private getTargetPricesAtTime(
    timestamp: number,
    campaign: Campaign,
    priceCache: PriceCache,
  ): { order0TargetPrice: Decimal; order1TargetPrice: Decimal } | null {
    // Retrieve current USD exchange rates for both tokens in the pair
    const token0Address = campaign.pair.token0.address;
    const token1Address = campaign.pair.token1.address;
    const token0Rate = this.getUsdRateForTimestamp(priceCache, token0Address, timestamp);
    const token1Rate = this.getUsdRateForTimestamp(priceCache, token1Address, timestamp);

    if (!token0Rate || !token1Rate || token0Rate === 0 || token1Rate === 0) {
      this.logger.warn(
        `Missing USD rates for tokens token0=${token0Address}/token1=${token1Address} at timestamp ${timestamp} - skipping snapshot`,
      );
      return null; // Skip snapshot when rates are missing
    }

    // Provide target prices for both order directions
    return {
      order0TargetPrice: new Decimal(token1Rate).div(token0Rate), // Price for token0->token1 orders
      order1TargetPrice: new Decimal(token0Rate).div(token1Rate), // Price for token1->token0 orders
    };
  }

  /**
   * Sorts all batch events chronologically with deterministic tiebreaking.
   *
   * @param batchEvents - Collection of events from different types
   * @returns Chronologically sorted array of timestamped events
   */
  private sortBatchEventsChronologically(batchEvents: BatchEvents): TimestampedEvent[] {
    const events: TimestampedEvent[] = [];

    // Normalize all event types into a common timestamped format
    const addEvents = (eventList: any[], type: string) => {
      eventList.forEach((event) => {
        const timestamp = event.timestamp.getTime();
        events.push({ timestamp, type: type as any, event });
      });
    };

    addEvents(batchEvents.createdEvents, 'created');
    addEvents(batchEvents.updatedEvents, 'updated');
    addEvents(batchEvents.deletedEvents, 'deleted');
    addEvents(batchEvents.transferEvents, 'transfer');

    // Order events chronologically with deterministic tiebreaking
    return events.sort((a, b) => {
      if (a.event.block.id !== b.event.block.id) return a.event.block.id - b.event.block.id;
      if (a.event.transactionIndex !== b.event.transactionIndex)
        return a.event.transactionIndex - b.event.transactionIndex;
      return a.event.logIndex - b.event.logIndex;
    });
  }

  /**
   * Applies a single event to the strategy states map based on event type.
   *
   * @param event - The timestamped event to apply
   * @param strategyStates - Map of strategy states to update
   */
  private applyEventToStrategyStates(event: TimestampedEvent, strategyStates: StrategyStatesMap): void {
    switch (event.type) {
      case 'created':
        this.processCreatedEvent(event.event as StrategyCreatedEvent, strategyStates, event.timestamp);
        break;
      case 'updated':
        this.processUpdatedEvent(event.event as StrategyUpdatedEvent, strategyStates, event.timestamp);
        break;
      case 'deleted':
        this.processDeletedEvent(event.event as StrategyDeletedEvent, strategyStates, event.timestamp);
        break;
      case 'transfer':
        this.processTransferEvent(event.event as VoucherTransferEvent, strategyStates, event.timestamp);
        break;
    }
  }

  /**
   * Retrieves the reward weighting multiplier for a specific token on a deployment.
   *
   * This method implements the token incentive system that allows different tokens
   * to receive different reward multipliers based on strategic priorities:
   *
   * **Weighting Hierarchy**:
   * 1. **Specific Weightings**: Explicitly configured multipliers for key tokens
   * 2. **Whitelisted Assets**: Standard weighting (0.5) for approved tokens
   * 3. **Default Weighting**: Fallback weighting for unlisted tokens
   *
   * **Use Cases**:
   * - Incentivize specific assets (e.g., higher weighting for stablecoins)
   * - Discourage certain tokens (e.g., zero weighting for unsupported assets)
   * - Provide balanced incentives for approved token sets
   *
   * The weighting system enables fine-grained control over reward distribution
   * to align incentives with protocol objectives and market conditions.
   *
   * @param tokenAddress - Contract address of the token (case-insensitive)
   * @param exchangeId - Deployment identifier to determine weighting configuration
   *
   * @returns Numeric weighting multiplier (0 = no rewards, >1 = bonus rewards)
   *
   * @example
   * ```typescript
   * // USDT on Ethereum might return 0.7
   * const weighting = getTokenWeighting('0xdAC17F958D2ee523a2206206994597C13D831ec7', ExchangeId.OGEthereum);
   * ```
   *
   * @internal Token weightings directly affect reward distribution amounts and should
   * be carefully configured to maintain balanced incentive structures.
   */
  private getTokenWeighting(tokenAddress: string, exchangeId: ExchangeId): number {
    const config = this.DEPLOYMENT_TOKEN_WEIGHTINGS[exchangeId];
    if (!config) {
      this.logger.warn(`No weighting configuration found for exchangeId: ${exchangeId}`);
      return 0;
    }

    const normalizedAddress = tokenAddress.toLowerCase();

    // Look up token-specific weighting configuration
    for (const [configAddress, weighting] of Object.entries(config.tokenWeightings)) {
      if (configAddress.toLowerCase() === normalizedAddress) {
        return weighting;
      }
    }

    // Apply standard weighting for whitelisted tokens
    for (const whitelistedAddress of config.whitelistedAssets) {
      if (whitelistedAddress.toLowerCase() === normalizedAddress) {
        return 0.5;
      }
    }

    // Apply default weighting for unlisted tokens
    return config.defaultWeighting;
  }
}
