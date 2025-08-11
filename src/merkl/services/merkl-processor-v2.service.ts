import { Injectable, Logger } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { ConfigService } from '@nestjs/config';
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
import { partitionSingleEpoch } from './partitioner';

/**
 * Strategy state at a specific point in time
 */
interface StrategyState {
  readonly strategyId: string;
  readonly pairId: number;
  readonly token0Address: string;
  readonly token1Address: string;
  readonly token0Decimals: number;
  readonly token1Decimals: number;
  readonly liquidity0: Decimal;
  readonly liquidity1: Decimal;
  readonly order0_A: Decimal;
  readonly order0_B: Decimal;
  readonly order0_z: Decimal;
  readonly order1_A: Decimal;
  readonly order1_B: Decimal;
  readonly order1_z: Decimal;
  readonly order0_A_compressed: Decimal;
  readonly order0_B_compressed: Decimal;
  readonly order0_z_compressed: Decimal;
  readonly order1_A_compressed: Decimal;
  readonly order1_B_compressed: Decimal;
  readonly order1_z_compressed: Decimal;
  readonly currentOwner: string;
  readonly creationWallet: string;
  readonly lastProcessedBlock: number;
  readonly isDeleted: boolean;
  readonly lastEventTimestamp: number;
}

/**
 * Epoch configuration
 */
interface EpochConfig {
  readonly epochNumber: number;
  readonly startTimestamp: Date;
  readonly endTimestamp: Date;
  readonly totalRewards: Decimal;
}

/**
 * Sub-epoch snapshot data
 */
interface SubEpochSnapshot {
  readonly timestamp: number;
  readonly order0TargetPrice: Decimal;
  readonly order1TargetPrice: Decimal;
  readonly targetSqrtPriceScaled: Decimal;
  readonly invTargetSqrtPriceScaled: Decimal;
  readonly strategies: ReadonlyArray<StrategyState>;
}

/**
 * USD price cache for efficient lookups
 */
interface PriceCache {
  readonly rates: ReadonlyMap<string, ReadonlyArray<{ timestamp: number; usd: number }>>;
  readonly timeWindow: { start: number; end: number };
}

/**
 * Event types for temporal processing
 */
type EventType = 'created' | 'updated' | 'deleted' | 'transfer';

interface BaseEvent {
  readonly timestamp: number;
  readonly blockId: number;
  readonly transactionIndex: number;
  readonly logIndex: number;
  readonly strategyId: string;
}

interface CreatedEventData extends BaseEvent {
  readonly type: 'created';
  readonly pairId: number;
  readonly token0Address: string;
  readonly token1Address: string;
  readonly token0Decimals: number;
  readonly token1Decimals: number;
  readonly order0: string;
  readonly order1: string;
  readonly owner: string;
}

interface UpdatedEventData extends BaseEvent {
  readonly type: 'updated';
  readonly order0: string;
  readonly order1: string;
}

interface DeletedEventData extends BaseEvent {
  readonly type: 'deleted';
}

interface TransferEventData extends BaseEvent {
  readonly type: 'transfer';
  readonly to: string;
}

type EventData = CreatedEventData | UpdatedEventData | DeletedEventData | TransferEventData;

/**
 * Processing checkpoint for resumability
 */
interface ProcessingCheckpoint {
  readonly campaignId: string;
  readonly lastProcessedBlock: number;
  readonly lastSubEpochNumber: number;
  readonly distributedAmount: Decimal;
}

/**
 * Token weighting configuration
 */
interface TokenWeightingConfig {
  readonly tokenWeightings: Readonly<Record<string, number>>;
  readonly whitelistedAssets: ReadonlyArray<string>;
  readonly defaultWeighting: number;
}

@Injectable()
export class MerklProcessorV2Service {
  private readonly logger = new Logger(MerklProcessorV2Service.name);

  // Processing constants
  private readonly BATCH_SIZE = 50000; // Smaller batches for memory efficiency
  private readonly EVENT_CHUNK_SIZE = 10000; // Events per chunk
  private readonly MIN_SNAPSHOT_INTERVAL = 4 * 60; // 240 seconds
  private readonly MAX_SNAPSHOT_INTERVAL = 6 * 60; // 360 seconds
  private readonly EPOCH_DURATION = 4 * 60 * 60; // 4 hours in seconds
  private readonly TOLERANCE_PERCENTAGE = 0.02; // 2%
  private readonly SCALING_CONSTANT = new Decimal(2).pow(48);

  // Token weighting configuration per deployment
  private readonly DEPLOYMENT_TOKEN_WEIGHTINGS: Readonly<Record<string, TokenWeightingConfig>> = {
    [ExchangeId.OGEthereum]: {
      tokenWeightings: {
        '0xdAC17F958D2ee523a2206206994597C13D831ec7': 0.7, // usdt
        '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE': 1.8, // eth
      },
      whitelistedAssets: [],
      defaultWeighting: 1,
    },
    [ExchangeId.OGSei]: {
      tokenWeightings: {
        '0x160345fC359604fC6e70E3c5fAcbdE5F7A9342d8': 1, // weth
        '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE': 99, // sei
      },
      whitelistedAssets: [],
      defaultWeighting: 0,
    },
    [ExchangeId.OGTac]: {
      tokenWeightings: {
        '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE': 0.75, // tac
        '0xB63B9f0eb4A6E6f191529D71d4D88cc8900Df2C9': 0.75, // wtac
        '0xAF988C3f7CB2AceAbB15f96b19388a259b6C438f': 2, // usdt
        '0xb76d91340F5CE3577f0a056D29f6e3Eb4E88B140': 0.5, // ton
        '0x61D66bC21fED820938021B06e9b2291f3FB91945': 1.25, // weth
        '0xAf368c91793CB22739386DFCbBb2F1A9e4bCBeBf': 1.25, // wstETH
        '0x7048c9e4aBD0cf0219E95a17A8C6908dfC4f0Ee4': 1, // cbBTC
        '0xecAc9C5F704e954931349Da37F60E39f515c11c1': 1, // lbBTC
      },
      whitelistedAssets: [],
      defaultWeighting: 0.5,
    },
  };

  constructor(
    private readonly subEpochService: SubEpochService,
    private readonly campaignService: CampaignService,
    private readonly lastProcessedBlockService: LastProcessedBlockService,
    private readonly blockService: BlockService,
    private readonly historicQuoteService: HistoricQuoteService,
    private readonly strategyCreatedEventService: StrategyCreatedEventService,
    private readonly strategyUpdatedEventService: StrategyUpdatedEventService,
    private readonly strategyDeletedEventService: StrategyDeletedEventService,
    private readonly voucherTransferEventService: VoucherTransferEventService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Main processing entry point - handles millions of events efficiently
   */
  async update(endBlock: number, deployment: Deployment): Promise<void> {
    const globalKey = `${deployment.blockchainType}-${deployment.exchangeId}-merkl-v2`;
    const lastProcessedBlock = await this.lastProcessedBlockService.getOrInit(globalKey, deployment.startBlock);

    const campaigns = await this.campaignService.getActiveCampaigns(deployment);
    if (campaigns.length === 0) {
      this.logger.log(`No active campaigns found for ${deployment.blockchainType}-${deployment.exchangeId}`);
      await this.lastProcessedBlockService.update(globalKey, endBlock);
      return;
    }

    this.logger.log(
      `🚀 Processing merkl v2 from block ${lastProcessedBlock} to ${endBlock} for ${campaigns.length} campaigns`,
    );

    // Create global price cache once for all campaigns
    const globalStartTimestamp = await this.getTimestampForBlock(lastProcessedBlock + 1, deployment);
    const globalEndTimestamp = await this.getTimestampForBlock(endBlock, deployment);
    const priceCache = await this.createPriceCache(campaigns, globalStartTimestamp, globalEndTimestamp, deployment);

    // Process each campaign independently for memory efficiency
    for (let i = 0; i < campaigns.length; i++) {
      const campaign = campaigns[i];
      this.logger.log(`🎯 Starting campaign ${i + 1}/${campaigns.length}: ${campaign.id}`);
      await this.processCampaignInBlocks(campaign, lastProcessedBlock + 1, endBlock, deployment, priceCache);
    }

    // Update global checkpoint
    await this.lastProcessedBlockService.update(globalKey, endBlock);

    // Mark completed campaigns as inactive
    const endBlockTimestamp = await this.getTimestampForBlock(endBlock, deployment);
    await this.campaignService.markProcessedCampaignsInactive(deployment, campaigns, endBlockTimestamp);

    this.logger.log(
      `🏁 Completed processing all ${campaigns.length} campaigns from block ${lastProcessedBlock} to ${endBlock}`,
    );
  }

  /**
   * Process a single campaign in manageable blocks
   */
  private async processCampaignInBlocks(
    campaign: Campaign,
    startBlock: number,
    endBlock: number,
    deployment: Deployment,
    priceCache: PriceCache,
  ): Promise<void> {
    this.logger.log(`📊 Processing campaign ${campaign.id} from block ${startBlock} to ${endBlock}`);

    const checkpoint = await this.loadCheckpoint(campaign.id);
    const startTimestamp = await this.getTimestampForBlock(startBlock, deployment);
    const endTimestamp = await this.getTimestampForBlock(endBlock, deployment);

    // Skip if entire range is after campaign end
    const campaignEndTimestamp = campaign.endDate.getTime();
    if (startTimestamp >= campaignEndTimestamp) {
      this.logger.log(`⏭️ Skipping campaign ${campaign.id} - processing range after campaign end`);
      return;
    }

    // Calculate epochs that intersect with our time range
    const epochs = this.calculateEpochsInRange(campaign, startTimestamp, endTimestamp);
    this.logger.log(`📅 Campaign ${campaign.id}: Processing ${epochs.length} epochs`);

    for (const epoch of epochs) {
      await this.processEpochEfficiently(campaign, epoch, startBlock, endBlock, deployment, priceCache, checkpoint);
    }

    this.logger.log(`✅ Completed campaign ${campaign.id}`);
  }

  /**
   * Process a single epoch efficiently using streaming
   */
  private async processEpochEfficiently(
    campaign: Campaign,
    epoch: EpochConfig,
    startBlock: number,
    endBlock: number,
    deployment: Deployment,
    priceCache: PriceCache,
    checkpoint: ProcessingCheckpoint,
  ): Promise<void> {
    this.logger.log(`🔄 Processing epoch ${epoch.epochNumber} for campaign ${campaign.id}`);

    // Validate token weightings exist
    const weightingConfig = this.DEPLOYMENT_TOKEN_WEIGHTINGS[campaign.exchangeId];
    if (!weightingConfig) {
      this.logger.error(`❌ No weighting configuration for exchangeId: ${campaign.exchangeId}`);
      return;
    }

    // Generate sub-epoch snapshots using partitioner
    const snapshots = await this.generateSubEpochSnapshots(
      campaign,
      epoch,
      startBlock,
      endBlock,
      deployment,
      priceCache,
    );

    if (snapshots.length === 0) {
      this.logger.log(`⚠️ No valid snapshots for epoch ${epoch.epochNumber}`);
      return;
    }

    const rewardPerSubEpoch = epoch.totalRewards.div(snapshots.length);
    this.logger.log(
      `📸 Generated ${snapshots.length} snapshots for epoch ${
        epoch.epochNumber
      }, ${rewardPerSubEpoch.toFixed()} rewards per snapshot`,
    );

    // Process each snapshot independently to avoid memory issues
    let processedSnapshots = 0;
    for (const snapshot of snapshots) {
      await this.processSubEpochSnapshot(
        campaign,
        epoch,
        snapshot,
        rewardPerSubEpoch,
        checkpoint,
        endBlock,
        priceCache,
      );
      processedSnapshots++;

      // Log progress every 10 snapshots for longer epochs
      if (processedSnapshots % 10 === 0 || processedSnapshots === snapshots.length) {
        this.logger.log(
          `⏳ Processed ${processedSnapshots}/${snapshots.length} snapshots for epoch ${epoch.epochNumber}`,
        );
      }
    }
  }

  /**
   * Generate sub-epoch snapshots efficiently using streaming
   */
  private async generateSubEpochSnapshots(
    campaign: Campaign,
    epoch: EpochConfig,
    startBlock: number,
    endBlock: number,
    deployment: Deployment,
    priceCache: PriceCache,
  ): Promise<SubEpochSnapshot[]> {
    const snapshots: SubEpochSnapshot[] = [];

    // Get snapshot intervals from partitioner
    const epochDurationSeconds = Math.floor((epoch.endTimestamp.getTime() - epoch.startTimestamp.getTime()) / 1000);
    const seed = this.generateEpochSeed(campaign, epoch);
    const snapshotIntervals = partitionSingleEpoch(
      epochDurationSeconds,
      this.MIN_SNAPSHOT_INTERVAL,
      this.MAX_SNAPSHOT_INTERVAL,
      seed,
    );

    this.logger.log(
      `🎯 Generating snapshots for epoch ${epoch.epochNumber}: ${snapshotIntervals.length} intervals over ${epochDurationSeconds}s`,
    );

    let currentTime = epoch.startTimestamp.getTime();
    const epochEndTime = epoch.endTimestamp.getTime();
    const campaignEndTime = campaign.endDate.getTime();
    let strategiesLoaded = 0;

    for (let i = 0; i < snapshotIntervals.length && currentTime < epochEndTime; i++) {
      // Skip snapshots after campaign end
      if (currentTime >= campaignEndTime) break;

      // Get target prices
      const targetPrices = this.getTargetPricesAtTime(currentTime, campaign, priceCache);
      if (!targetPrices) {
        currentTime += snapshotIntervals[i] * 1000;
        continue;
      }

      // Build strategy states at this exact timestamp
      const strategies = await this.buildStrategyStatesAtTime(
        campaign.pair.id,
        currentTime,
        startBlock,
        endBlock,
        deployment,
      );

      if (strategies.length > 0) {
        strategiesLoaded = strategies.length; // Track for logging

        const targetSqrtPriceScaled = this.calculateTargetSqrtPriceScaled(
          targetPrices.order0TargetPrice,
          campaign.pair.token0.decimals,
          campaign.pair.token1.decimals,
        );

        const invTargetSqrtPriceScaled = this.calculateInvTargetSqrtPriceScaled(
          targetPrices.order1TargetPrice,
          campaign.pair.token0.decimals,
          campaign.pair.token1.decimals,
        );

        snapshots.push({
          timestamp: currentTime,
          order0TargetPrice: targetPrices.order0TargetPrice,
          order1TargetPrice: targetPrices.order1TargetPrice,
          targetSqrtPriceScaled,
          invTargetSqrtPriceScaled,
          strategies: Object.freeze(strategies),
        });
      }

      currentTime += snapshotIntervals[i] * 1000;
    }

    this.logger.log(
      `✨ Generated ${snapshots.length} snapshots with ${strategiesLoaded} strategies each for epoch ${epoch.epochNumber}`,
    );
    return snapshots;
  }

  /**
   * Build accurate strategy states at exact timestamp using streaming
   */
  private async buildStrategyStatesAtTime(
    pairId: number,
    timestamp: number,
    startBlock: number,
    endBlock: number,
    deployment: Deployment,
  ): Promise<StrategyState[]> {
    const strategies = new Map<string, StrategyState>();

    // Get baseline states up to startBlock
    const baselines = await this.loadStrategyBaselines(startBlock - 1, deployment, pairId);

    // Add baselines to working set
    for (const [strategyId, baseline] of baselines) {
      strategies.set(strategyId, baseline);
    }

    // Stream events from startBlock to endBlock and apply up to timestamp
    await this.streamEventsAndApply(pairId, startBlock, endBlock, timestamp, deployment, strategies);

    // Return only non-deleted strategies with liquidity
    return Array.from(strategies.values())
      .filter((s) => !s.isDeleted && (s.liquidity0.gt(0) || s.liquidity1.gt(0)))
      .sort((a, b) => a.strategyId.localeCompare(b.strategyId)); // Deterministic ordering
  }

  /**
   * Stream events efficiently to avoid memory issues
   */
  private async streamEventsAndApply(
    pairId: number,
    startBlock: number,
    endBlock: number,
    timestamp: number,
    deployment: Deployment,
    strategies: Map<string, StrategyState>,
  ): Promise<void> {
    // Process events in chunks to avoid memory issues
    for (let chunkStart = startBlock; chunkStart <= endBlock; chunkStart += this.EVENT_CHUNK_SIZE) {
      const chunkEnd = Math.min(chunkStart + this.EVENT_CHUNK_SIZE - 1, endBlock);

      // Load events for this chunk
      const events = await this.loadEventsChunk(pairId, chunkStart, chunkEnd, deployment);

      // Apply events chronologically up to timestamp
      const sortedEvents = this.sortEventsChronologically(events);

      for (const eventData of sortedEvents) {
        if (eventData.timestamp > timestamp) break;

        this.applyEventToStrategies(eventData, strategies);
      }
    }
  }

  /**
   * Load a chunk of events for a specific pair
   */
  private async loadEventsChunk(
    pairId: number,
    startBlock: number,
    endBlock: number,
    deployment: Deployment,
  ): Promise<EventData[]> {
    const events: EventData[] = [];

    // Load each event type in parallel
    const [createdEvents, updatedEvents, deletedEvents, transferEvents] = await Promise.all([
      this.strategyCreatedEventService.get(startBlock, endBlock, deployment),
      this.strategyUpdatedEventService.get(startBlock, endBlock, deployment),
      this.strategyDeletedEventService.get(startBlock, endBlock, deployment),
      this.voucherTransferEventService.get(startBlock, endBlock, deployment),
    ]);

    // Convert to uniform event data format
    for (const event of createdEvents.filter((e) => e.pair.id === pairId)) {
      events.push(this.convertToEventData(event, 'created'));
    }

    for (const event of updatedEvents.filter((e) => e.pair.id === pairId)) {
      events.push(this.convertToEventData(event, 'updated'));
    }

    for (const event of deletedEvents.filter((e) => e.pair.id === pairId)) {
      events.push(this.convertToEventData(event, 'deleted'));
    }

    // For transfers, need to check if strategy belongs to this pair
    const pairStrategyIds = new Set(
      [...createdEvents, ...updatedEvents, ...deletedEvents]
        .filter((e) => e.pair.id === pairId)
        .map((e) => e.strategyId),
    );

    for (const event of transferEvents.filter((e) => pairStrategyIds.has(e.strategyId))) {
      events.push(this.convertToEventData(event, 'transfer'));
    }

    return events;
  }

  /**
   * Convert raw events to uniform EventData format
   */
  private convertToEventData(
    event: StrategyCreatedEvent | StrategyUpdatedEvent | StrategyDeletedEvent | VoucherTransferEvent,
    type: EventType,
  ): EventData {
    const base: BaseEvent = {
      timestamp: event.timestamp.getTime(),
      blockId: event.block.id,
      transactionIndex: event.transactionIndex,
      logIndex: event.logIndex,
      strategyId: event.strategyId,
    };

    switch (type) {
      case 'created':
        const createdEvent = event as StrategyCreatedEvent;
        return {
          ...base,
          type: 'created',
          pairId: createdEvent.pair.id,
          token0Address: createdEvent.token0.address,
          token1Address: createdEvent.token1.address,
          token0Decimals: createdEvent.token0.decimals,
          token1Decimals: createdEvent.token1.decimals,
          order0: createdEvent.order0,
          order1: createdEvent.order1,
          owner: createdEvent.owner,
        };

      case 'updated':
        const updatedEvent = event as StrategyUpdatedEvent;
        return {
          ...base,
          type: 'updated',
          order0: updatedEvent.order0,
          order1: updatedEvent.order1,
        };

      case 'deleted':
        return {
          ...base,
          type: 'deleted',
        };

      case 'transfer':
        const transferEvent = event as VoucherTransferEvent;
        return {
          ...base,
          type: 'transfer',
          to: transferEvent.to,
        };

      default:
        throw new Error(`Unknown event type: ${type}`);
    }
  }

  /**
   * Apply event to strategy map efficiently
   */
  private applyEventToStrategies(event: EventData, strategies: Map<string, StrategyState>): void {
    const strategyId = event.strategyId;

    switch (event.type) {
      case 'created':
        const createdEvent = event as CreatedEventData;
        const order0 = JSON.parse(createdEvent.order0);
        const order1 = JSON.parse(createdEvent.order1);

        // Apply token ordering logic
        const isToken0Smaller = createdEvent.token0Address.toLowerCase() <= createdEvent.token1Address.toLowerCase();
        const pairToken0Address = isToken0Smaller ? createdEvent.token0Address : createdEvent.token1Address;
        const pairToken1Address = isToken0Smaller ? createdEvent.token1Address : createdEvent.token0Address;
        const pairToken0Decimals = isToken0Smaller ? createdEvent.token0Decimals : createdEvent.token1Decimals;
        const pairToken1Decimals = isToken0Smaller ? createdEvent.token1Decimals : createdEvent.token0Decimals;

        const order0ForPair = isToken0Smaller ? order0 : order1;
        const order1ForPair = isToken0Smaller ? order1 : order0;

        strategies.set(strategyId, {
          strategyId,
          pairId: createdEvent.pairId,
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
          currentOwner: createdEvent.owner,
          creationWallet: createdEvent.owner,
          lastProcessedBlock: event.blockId,
          isDeleted: false,
          lastEventTimestamp: event.timestamp,
        });
        break;

      case 'updated':
        const existing = strategies.get(strategyId);
        if (!existing) break;

        const updatedEvent = event as UpdatedEventData;
        const order0Upd = JSON.parse(updatedEvent.order0);
        const order1Upd = JSON.parse(updatedEvent.order1);

        const isToken0SmallerUpd = existing.token0Address.toLowerCase() <= existing.token1Address.toLowerCase();
        const order0ForPairUpd = isToken0SmallerUpd ? order0Upd : order1Upd;
        const order1ForPairUpd = isToken0SmallerUpd ? order1Upd : order0Upd;

        strategies.set(strategyId, {
          ...existing,
          liquidity0: new Decimal(order0ForPairUpd.y || 0),
          liquidity1: new Decimal(order1ForPairUpd.y || 0),
          order0_A: this.decompressRateParameter(order0ForPairUpd.A || '0'),
          order0_B: this.decompressRateParameter(order0ForPairUpd.B || '0'),
          order0_z: new Decimal(order0ForPairUpd.z || order0ForPairUpd.y || 0),
          order1_A: this.decompressRateParameter(order1ForPairUpd.A || '0'),
          order1_B: this.decompressRateParameter(order1ForPairUpd.B || '0'),
          order1_z: new Decimal(order1ForPairUpd.z || order1ForPairUpd.y || 0),
          order0_A_compressed: new Decimal(order0ForPairUpd.A || '0'),
          order0_B_compressed: new Decimal(order0ForPairUpd.B || '0'),
          order0_z_compressed: new Decimal(order0ForPairUpd.z || order0ForPairUpd.y || '0'),
          order1_A_compressed: new Decimal(order1ForPairUpd.A || '0'),
          order1_B_compressed: new Decimal(order1ForPairUpd.B || '0'),
          order1_z_compressed: new Decimal(order1ForPairUpd.z || order1ForPairUpd.y || '0'),
          lastProcessedBlock: event.blockId,
          lastEventTimestamp: event.timestamp,
        });
        break;

      case 'deleted':
        const existingDel = strategies.get(strategyId);
        if (!existingDel) break;

        strategies.set(strategyId, {
          ...existingDel,
          isDeleted: true,
          liquidity0: new Decimal(0),
          liquidity1: new Decimal(0),
          order0_A_compressed: new Decimal(0),
          order0_B_compressed: new Decimal(0),
          order0_z_compressed: new Decimal(0),
          order1_A_compressed: new Decimal(0),
          order1_B_compressed: new Decimal(0),
          order1_z_compressed: new Decimal(0),
          lastProcessedBlock: event.blockId,
          lastEventTimestamp: event.timestamp,
        });
        break;

      case 'transfer':
        const existingTransfer = strategies.get(strategyId);
        if (!existingTransfer) break;

        const transferEvent = event as TransferEventData;
        strategies.set(strategyId, {
          ...existingTransfer,
          currentOwner: transferEvent.to,
          lastProcessedBlock: event.blockId,
          lastEventTimestamp: event.timestamp,
        });
        break;
    }
  }

  /**
   * Process a single sub-epoch snapshot and save results
   */
  private async processSubEpochSnapshot(
    campaign: Campaign,
    epoch: EpochConfig,
    snapshot: SubEpochSnapshot,
    rewardPerSubEpoch: Decimal,
    checkpoint: ProcessingCheckpoint,
    currentBlock: number,
    priceCache: PriceCache,
  ): Promise<void> {
    // Calculate rewards for this snapshot
    const rewardResults = this.calculateSubEpochRewards(snapshot, rewardPerSubEpoch, campaign);

    // Convert to SubEpoch entities
    const subEpochsToSave: Partial<SubEpoch>[] = [];
    const toleranceFactor = new Decimal(1 - this.TOLERANCE_PERCENTAGE).sqrt();

    for (const strategy of snapshot.strategies) {
      const strategyId = strategy.strategyId;
      const totalReward = rewardResults.totalRewards.get(strategyId) || new Decimal(0);
      const tokenRewards = rewardResults.tokenRewards.get(strategyId) || {
        token0: new Decimal(0),
        token1: new Decimal(0),
      };

      // Calculate eligibility values
      const eligible0 = this.calculateEligibleLiquidity(
        strategy.liquidity0,
        strategy.order0_z,
        strategy.order0_A,
        strategy.order0_B,
        snapshot.targetSqrtPriceScaled,
        toleranceFactor,
      );

      const eligible1 = this.calculateEligibleLiquidity(
        strategy.liquidity1,
        strategy.order1_z,
        strategy.order1_A,
        strategy.order1_B,
        snapshot.invTargetSqrtPriceScaled,
        toleranceFactor,
      );

      const token0RewardZoneBoundary = toleranceFactor.mul(snapshot.targetSqrtPriceScaled);
      const token1RewardZoneBoundary = toleranceFactor.mul(snapshot.invTargetSqrtPriceScaled);

      // Get token weightings
      const token0Weighting = this.getTokenWeighting(strategy.token0Address, campaign.exchangeId);
      const token1Weighting = this.getTokenWeighting(strategy.token1Address, campaign.exchangeId);

      subEpochsToSave.push({
        strategyId,
        campaignId: campaign.id,
        epochNumber: epoch.epochNumber,
        epochStart: epoch.startTimestamp,
        subEpochTimestamp: new Date(snapshot.timestamp),
        token0Reward: tokenRewards.token0.toFixed(),
        token1Reward: tokenRewards.token1.toFixed(),
        totalReward: totalReward.toFixed(),
        liquidity0: strategy.liquidity0.toFixed(),
        liquidity1: strategy.liquidity1.toFixed(),
        token0Address: strategy.token0Address,
        token1Address: strategy.token1Address,
        token0UsdRate: this.getUsdRateForTimestamp(
          priceCache,
          campaign.pair.token0.address,
          snapshot.timestamp,
        ).toString(),
        token1UsdRate: this.getUsdRateForTimestamp(
          priceCache,
          campaign.pair.token1.address,
          snapshot.timestamp,
        ).toString(),
        targetPrice: snapshot.order0TargetPrice.toFixed(),
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
        lastProcessedBlock: currentBlock,
        ownerAddress: strategy.currentOwner,
      });
    }

    // Save sub-epochs with proper numbering
    if (subEpochsToSave.length > 0) {
      await this.subEpochService.saveSubEpochs(subEpochsToSave);
      this.logger.log(
        `💾 Saved ${subEpochsToSave.length} sub-epoch records for snapshot at ${new Date(
          snapshot.timestamp,
        ).toISOString()}`,
      );
    }
  }

  /**
   * Calculate rewards for a sub-epoch - preserves original math exactly
   */
  private calculateSubEpochRewards(
    snapshot: SubEpochSnapshot,
    rewardPool: Decimal,
    campaign: Campaign,
  ): { totalRewards: Map<string, Decimal>; tokenRewards: Map<string, { token0: Decimal; token1: Decimal }> } {
    const totalRewards = new Map<string, Decimal>();
    const tokenRewards = new Map<string, { token0: Decimal; token1: Decimal }>();
    const toleranceFactor = new Decimal(1 - this.TOLERANCE_PERCENTAGE).sqrt();

    let totalWeightedEligible0 = new Decimal(0);
    let totalWeightedEligible1 = new Decimal(0);
    const strategyWeightedEligibility0 = new Map<string, Decimal>();
    const strategyWeightedEligibility1 = new Map<string, Decimal>();

    // Calculate weighted eligibility for all strategies
    for (const strategy of snapshot.strategies) {
      const token0Weighting = this.getTokenWeighting(strategy.token0Address, campaign.exchangeId);
      const token1Weighting = this.getTokenWeighting(strategy.token1Address, campaign.exchangeId);

      const eligible0 = this.calculateEligibleLiquidity(
        strategy.liquidity0,
        strategy.order0_z,
        strategy.order0_A,
        strategy.order0_B,
        snapshot.targetSqrtPriceScaled,
        toleranceFactor,
      );

      const eligible1 = this.calculateEligibleLiquidity(
        strategy.liquidity1,
        strategy.order1_z,
        strategy.order1_A,
        strategy.order1_B,
        snapshot.invTargetSqrtPriceScaled,
        toleranceFactor,
      );

      if (eligible0.gt(0) && token0Weighting > 0) {
        const weightedEligible0 = eligible0.mul(token0Weighting);
        strategyWeightedEligibility0.set(strategy.strategyId, weightedEligible0);
        totalWeightedEligible0 = totalWeightedEligible0.add(weightedEligible0);
      }

      if (eligible1.gt(0) && token1Weighting > 0) {
        const weightedEligible1 = eligible1.mul(token1Weighting);
        strategyWeightedEligibility1.set(strategy.strategyId, weightedEligible1);
        totalWeightedEligible1 = totalWeightedEligible1.add(weightedEligible1);
      }
    }

    // Calculate reward pool allocation by token weights
    const token0Weighting = this.getTokenWeighting(campaign.pair.token0.address, campaign.exchangeId);
    const token1Weighting = this.getTokenWeighting(campaign.pair.token1.address, campaign.exchangeId);
    const totalWeight = token0Weighting + token1Weighting;

    let token0RewardPool = new Decimal(0);
    let token1RewardPool = new Decimal(0);

    if (totalWeight > 0) {
      token0RewardPool = rewardPool.mul(token0Weighting).div(totalWeight);
      token1RewardPool = rewardPool.mul(token1Weighting).div(totalWeight);
    }

    // Distribute rewards proportionally
    if (totalWeightedEligible0.gt(0)) {
      for (const [strategyId, weightedEligible] of strategyWeightedEligibility0) {
        const share = weightedEligible.div(totalWeightedEligible0);
        const reward = token0RewardPool.mul(share);
        totalRewards.set(strategyId, (totalRewards.get(strategyId) || new Decimal(0)).add(reward));

        const existing = tokenRewards.get(strategyId) || { token0: new Decimal(0), token1: new Decimal(0) };
        existing.token0 = existing.token0.add(reward);
        tokenRewards.set(strategyId, existing);
      }
    }

    if (totalWeightedEligible1.gt(0)) {
      for (const [strategyId, weightedEligible] of strategyWeightedEligibility1) {
        const share = weightedEligible.div(totalWeightedEligible1);
        const reward = token1RewardPool.mul(share);
        totalRewards.set(strategyId, (totalRewards.get(strategyId) || new Decimal(0)).add(reward));

        const existing = tokenRewards.get(strategyId) || { token0: new Decimal(0), token1: new Decimal(0) };
        existing.token1 = existing.token1.add(reward);
        tokenRewards.set(strategyId, existing);
      }
    }

    return { totalRewards, tokenRewards };
  }

  /**
   * Calculate eligible liquidity - exact same math as original
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

    if (A.eq(0)) {
      return new Decimal(0);
    }

    const ineligibleFraction = rewardZoneBoundary.sub(B).div(A);
    const ineligibleLiquidity = z.mul(ineligibleFraction);
    const eligibleLiquidity = y.sub(ineligibleLiquidity);

    return Decimal.max(eligibleLiquidity, 0);
  }

  // === UTILITY METHODS ===

  private decompressRateParameter(compressedValue: string): Decimal {
    const compressed = new Decimal(compressedValue || '0');
    const mantissa = compressed.mod(this.SCALING_CONSTANT);
    const exponent = compressed.div(this.SCALING_CONSTANT).floor();
    return mantissa.mul(new Decimal(2).pow(exponent));
  }

  private calculateTargetSqrtPriceScaled(targetPrice: Decimal, baseDecimals: number, quoteDecimals: number): Decimal {
    const baseDecimalsFactor = new Decimal(10).pow(baseDecimals);
    const quoteDecimalsFactor = new Decimal(10).pow(quoteDecimals);
    const adjustedPrice = targetPrice.mul(baseDecimalsFactor).div(quoteDecimalsFactor);
    const sqrtAdjustedPrice = adjustedPrice.sqrt();
    return sqrtAdjustedPrice.mul(this.SCALING_CONSTANT);
  }

  private calculateInvTargetSqrtPriceScaled(
    targetPrice: Decimal,
    baseDecimals: number,
    quoteDecimals: number,
  ): Decimal {
    const baseDecimalsFactor = new Decimal(10).pow(baseDecimals);
    const quoteDecimalsFactor = new Decimal(10).pow(quoteDecimals);
    const adjustedPrice = targetPrice.mul(quoteDecimalsFactor).div(baseDecimalsFactor);
    const sqrtAdjustedPrice = adjustedPrice.sqrt();
    return sqrtAdjustedPrice.mul(this.SCALING_CONSTANT);
  }

  private generateEpochSeed(campaign: Campaign, epoch: EpochConfig): string {
    const salt = this.configService.get<string>('MERKL_SNAPSHOT_SALT');
    if (!salt) {
      throw new Error('MERKL_SNAPSHOT_SALT environment variable is required');
    }

    const seedComponents = [
      salt,
      campaign.id,
      epoch.epochNumber.toString(),
      campaign.startDate.getTime().toString(),
      campaign.endDate.getTime().toString(),
      epoch.startTimestamp.getTime().toString(),
      epoch.endTimestamp.getTime().toString(),
    ];

    return '0x' + createHash('sha256').update(seedComponents.join('|')).digest('hex');
  }

  private calculateEpochsInRange(campaign: Campaign, startTimestamp: number, endTimestamp: number): EpochConfig[] {
    const epochs: EpochConfig[] = [];
    const campaignStartTime = campaign.startDate.getTime();
    const campaignEndTime = campaign.endDate.getTime();
    const totalCampaignDuration = campaignEndTime - campaignStartTime;

    let epochStart = campaignStartTime;
    let epochNumber = 1;

    while (epochStart < campaignEndTime) {
      const epochEnd = Math.min(epochStart + this.EPOCH_DURATION * 1000, campaignEndTime);

      // Check if epoch intersects with requested range
      if (epochEnd > startTimestamp && epochStart < endTimestamp) {
        const epochDuration = epochEnd - epochStart;
        const epochRewards = new Decimal(campaign.rewardAmount).mul(epochDuration).div(totalCampaignDuration);

        epochs.push({
          epochNumber,
          startTimestamp: new Date(epochStart),
          endTimestamp: new Date(epochEnd),
          totalRewards: epochRewards,
        });
      }

      epochStart = epochEnd;
      epochNumber++;
    }

    return epochs;
  }

  private async loadStrategyBaselines(
    lastProcessedBlock: number,
    deployment: Deployment,
    pairId: number,
  ): Promise<Map<string, StrategyState>> {
    this.logger.log(`🔍 Loading strategy baselines up to block ${lastProcessedBlock} for pair ${pairId}`);
    const baselines = new Map<string, StrategyState>();

    // Same logic as original but optimized query
    const latestStrategyStates = await this.subEpochService.subEpochRepository.manager.query(
      `
      SELECT DISTINCT ON (strategy_id) 
        strategy_id, block_id, order0, order1, pair_id, 
        token0_address, token1_address, token0_decimals, token1_decimals,
        owner, transaction_index, log_index, timestamp
      FROM (
        SELECT 
          c."strategyId" as strategy_id, c."blockId" as block_id, 
          c.order0, c.order1, c."pairId" as pair_id, 
          t0.address as token0_address, t1.address as token1_address,
          t0.decimals as token0_decimals, t1.decimals as token1_decimals,
          c.owner, c."transactionIndex" as transaction_index, 
          c."logIndex" as log_index, c.timestamp
        FROM "strategy-created-events" c
        LEFT JOIN tokens t0 ON c."token0Id" = t0.id  
        LEFT JOIN tokens t1 ON c."token1Id" = t1.id
        WHERE c."blockId" <= $1 AND c."blockchainType" = $2 
          AND c."exchangeId" = $3 AND c."pairId" = $4
        UNION ALL
        SELECT 
          u."strategyId" as strategy_id, u."blockId" as block_id, 
          u.order0, u.order1, u."pairId" as pair_id, 
          t0.address as token0_address, t1.address as token1_address,
          t0.decimals as token0_decimals, t1.decimals as token1_decimals,
          null as owner, u."transactionIndex" as transaction_index, 
          u."logIndex" as log_index, u.timestamp
        FROM "strategy-updated-events" u
        LEFT JOIN tokens t0 ON u."token0Id" = t0.id  
        LEFT JOIN tokens t1 ON u."token1Id" = t1.id
        WHERE u."blockId" <= $1 AND u."blockchainType" = $2 
          AND u."exchangeId" = $3 AND u."pairId" = $4
      ) combined
      ORDER BY strategy_id, block_id DESC, transaction_index DESC, log_index DESC
    `,
      [lastProcessedBlock, deployment.blockchainType, deployment.exchangeId, pairId],
    );

    // Get ownership and deletion info (same as original)
    const strategyIds = (latestStrategyStates || []).map((s) => s.strategy_id);

    let latestOwnershipStates = [];
    if (strategyIds.length > 0) {
      const placeholders = strategyIds.map((_, index) => `$${index + 4}`).join(', ');
      latestOwnershipStates = await this.subEpochService.subEpochRepository.manager.query(
        `
        SELECT DISTINCT ON ("strategyId") 
          "strategyId" as strategy_id, "to" as current_owner
        FROM "voucher-transfer-events" 
        WHERE "blockId" <= $1 AND "blockchainType" = $2 
          AND "exchangeId" = $3 AND "strategyId" IN (${placeholders})
        ORDER BY "strategyId", "blockId" DESC, "transactionIndex" DESC, "logIndex" DESC
      `,
        [lastProcessedBlock, deployment.blockchainType, deployment.exchangeId, ...strategyIds],
      );
    }

    const deletedStrategies = await this.subEpochService.subEpochRepository.manager.query(
      `
      SELECT DISTINCT "strategyId" as strategy_id 
      FROM "strategy-deleted-events" 
      WHERE "blockId" <= $1 AND "blockchainType" = $2 
        AND "exchangeId" = $3 AND "pairId" = $4
    `,
      [lastProcessedBlock, deployment.blockchainType, deployment.exchangeId, pairId],
    );

    // Build baseline map (same logic as original)
    const ownershipMap = new Map((latestOwnershipStates || []).map((o) => [o.strategy_id, o.current_owner]));
    const deletedStrategyIds = new Set((deletedStrategies || []).map((d) => d.strategy_id));

    for (const strategyState of latestStrategyStates || []) {
      const strategyId = strategyState.strategy_id;
      const isDeleted = deletedStrategyIds.has(strategyId);

      const order0 = isDeleted ? { y: '0', A: '0', B: '0', z: '0' } : JSON.parse(strategyState.order0);
      const order1 = isDeleted ? { y: '0', A: '0', B: '0', z: '0' } : JSON.parse(strategyState.order1);

      const isToken0Smaller = strategyState.token0_address.toLowerCase() <= strategyState.token1_address.toLowerCase();
      const pairToken0Address = isToken0Smaller ? strategyState.token0_address : strategyState.token1_address;
      const pairToken1Address = isToken0Smaller ? strategyState.token1_address : strategyState.token0_address;
      const pairToken0Decimals = isToken0Smaller ? strategyState.token0_decimals : strategyState.token1_decimals;
      const pairToken1Decimals = isToken0Smaller ? strategyState.token1_decimals : strategyState.token0_decimals;

      const order0ForPair = isToken0Smaller ? order0 : order1;
      const order1ForPair = isToken0Smaller ? order1 : order0;

      const baseline: StrategyState = {
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
        lastEventTimestamp: new Date(strategyState.timestamp).getTime(),
      };

      baselines.set(strategyId, baseline);
    }

    this.logger.log(`📋 Loaded ${baselines.size} strategy baselines for pair ${pairId}`);
    return baselines;
  }

  private sortEventsChronologically(events: EventData[]): EventData[] {
    return events.sort((a, b) => {
      if (a.blockId !== b.blockId) return a.blockId - b.blockId;
      if (a.transactionIndex !== b.transactionIndex) return a.transactionIndex - b.transactionIndex;
      return a.logIndex - b.logIndex;
    });
  }

  private async createPriceCache(
    campaigns: Campaign[],
    startTimestamp: number,
    endTimestamp: number,
    deployment: Deployment,
  ): Promise<PriceCache> {
    const uniqueTokenAddresses = new Set<string>();
    for (const campaign of campaigns) {
      uniqueTokenAddresses.add(campaign.pair.token0.address);
      uniqueTokenAddresses.add(campaign.pair.token1.address);
    }

    const tokenAddresses = Array.from(uniqueTokenAddresses);
    const startDate = new Date(startTimestamp).toISOString();
    const endDate = new Date(endTimestamp).toISOString();

    this.logger.log(`💱 Fetching USD rates for ${tokenAddresses.length} tokens from ${startDate} to ${endDate}`);
    const rates = await this.historicQuoteService.getUsdRates(deployment, tokenAddresses, startDate, endDate);

    const cacheMap = new Map<string, Array<{ timestamp: number; usd: number }>>();
    for (const rate of rates) {
      const tokenAddress = rate.address.toLowerCase();
      if (!cacheMap.has(tokenAddress)) {
        cacheMap.set(tokenAddress, []);
      }
      cacheMap.get(tokenAddress)?.push({
        timestamp: rate.day * 1000,
        usd: rate.usd,
      });
    }

    // Sort rates by timestamp
    for (const [, tokenRates] of cacheMap.entries()) {
      tokenRates.sort((a, b) => a.timestamp - b.timestamp);
    }

    this.logger.log(`📊 Built price cache with ${rates.length} total rates for ${cacheMap.size} tokens`);

    return {
      rates: cacheMap,
      timeWindow: { start: startTimestamp, end: endTimestamp },
    };
  }

  private getUsdRateForTimestamp(priceCache: PriceCache, tokenAddress: string, targetTimestamp: number): number {
    const tokenRates = priceCache.rates.get(tokenAddress.toLowerCase());
    if (!tokenRates || tokenRates.length === 0) {
      return 0;
    }

    // Find rate with timestamp closest to target with deterministic tiebreaker
    let closest = tokenRates[0];
    let minDiff = Math.abs(closest.timestamp - targetTimestamp);

    for (const rate of tokenRates) {
      const diff = Math.abs(rate.timestamp - targetTimestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closest = rate;
      } else if (diff === minDiff) {
        // Deterministic tiebreaker: prefer later timestamp
        if (rate.timestamp > closest.timestamp) {
          closest = rate;
        } else if (rate.timestamp === closest.timestamp && rate.usd > closest.usd) {
          closest = rate;
        }
      }
    }

    return closest.usd;
  }

  private getTargetPricesAtTime(
    timestamp: number,
    campaign: Campaign,
    priceCache: PriceCache,
  ): { order0TargetPrice: Decimal; order1TargetPrice: Decimal } | null {
    const token0Address = campaign.pair.token0.address;
    const token1Address = campaign.pair.token1.address;

    const token0Rate = this.getUsdRateForTimestamp(priceCache, token0Address, timestamp);
    const token1Rate = this.getUsdRateForTimestamp(priceCache, token1Address, timestamp);

    if (!token0Rate || !token1Rate || token0Rate === 0 || token1Rate === 0) {
      return null;
    }

    return {
      order0TargetPrice: new Decimal(token1Rate).div(token0Rate),
      order1TargetPrice: new Decimal(token0Rate).div(token1Rate),
    };
  }

  private getTokenWeighting(tokenAddress: string, exchangeId: ExchangeId): number {
    const config = this.DEPLOYMENT_TOKEN_WEIGHTINGS[exchangeId];
    if (!config) return 0;

    const normalizedAddress = tokenAddress.toLowerCase();

    for (const [configAddress, weighting] of Object.entries(config.tokenWeightings)) {
      if (configAddress.toLowerCase() === normalizedAddress) {
        return weighting;
      }
    }

    for (const whitelistedAddress of config.whitelistedAssets) {
      if (whitelistedAddress.toLowerCase() === normalizedAddress) {
        return 0.5;
      }
    }

    return config.defaultWeighting;
  }

  private async getTimestampForBlock(blockNumber: number, deployment: Deployment): Promise<number> {
    const block = await this.blockService.getBlock(blockNumber, deployment);
    return block.timestamp.getTime();
  }

  private async loadCheckpoint(campaignId: string): Promise<ProcessingCheckpoint> {
    const distributed = await this.subEpochService.getTotalRewardsForCampaign(campaignId);
    return {
      campaignId,
      lastProcessedBlock: 0,
      lastSubEpochNumber: 0,
      distributedAmount: distributed,
    };
  }
}
