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
  liquidity0: Decimal; // y0 value (raw)
  liquidity1: Decimal; // y1 value (raw)
  // A, B parameters for reward calculation (decompressed)
  order0_A: Decimal;
  order0_B: Decimal;
  order0_z: Decimal; // capacity for order0
  order1_A: Decimal;
  order1_B: Decimal;
  order1_z: Decimal; // capacity for order1
  // Compressed A, B, z values
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
  // Metadata for chronological deduplication
  lastEventTimestamp: number; // Unix timestamp of the latest event that modified this strategy
}

interface EpochInfo {
  epochNumber: number;
  startTimestamp: Date;
  endTimestamp: Date;
  totalRewards: Decimal;
}

interface SubEpochData {
  timestamp: number;
  order0TargetPrice: Decimal; // token1Usd/token0Usd for order0
  order1TargetPrice: Decimal; // token0Usd/token1Usd for order1
  targetSqrtPriceScaled: Decimal;
  invTargetSqrtPriceScaled: Decimal;
  strategies: Map<string, StrategyState>;
}

interface PriceCache {
  rates: Map<string, Array<{ timestamp: number; usd: number }>>; // tokenAddress -> array of rates with timestamps
  timeWindow: { start: number; end: number }; // Time window this cache covers
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

interface CampaignContext {
  campaign: Campaign;
  strategyStates: StrategyStatesMap;
}

interface TokenWeightingConfig {
  tokenWeightings: Record<string, number>;
  whitelistedAssets: string[];
  defaultWeighting: number;
}

@Injectable()
export class MerklProcessorService {
  private readonly logger = new Logger(MerklProcessorService.name);
  private readonly BATCH_SIZE = 100000; // Number of blocks per batch
  private readonly SAVE_BATCH_SIZE = 1000; // Number of rewards to save at once
  private readonly MIN_SNAPSHOT_INTERVAL = 4 * 60; // 240 seconds
  private readonly MAX_SNAPSHOT_INTERVAL = 6 * 60; // 360 seconds
  private readonly EPOCH_DURATION = 4 * 60 * 60; // 4 hours in seconds
  private readonly TOLERANCE_PERCENTAGE = 0.02; // 2%
  private readonly SCALING_CONSTANT = new Decimal(2).pow(48);

  // Token weighting configuration per deployment
  private readonly DEPLOYMENT_TOKEN_WEIGHTINGS: Record<string, TokenWeightingConfig> = {
    // Ethereum mainnet
    [ExchangeId.OGEthereum]: {
      tokenWeightings: {
        '0xdAC17F958D2ee523a2206206994597C13D831ec7': 0.7, // usdt
        '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE': 1.8, // eth
      },
      whitelistedAssets: [],
      defaultWeighting: 1, // Other assets get no incentives
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
        '0xAF988C3f7CB2AceAbB15f96b19388a259b6C438f': 2, //usdt
        '0xb76d91340F5CE3577f0a056D29f6e3Eb4E88B140': 0.5, // ton
        '0x61D66bC21fED820938021B06e9b2291f3FB91945': 1.25, // weth
        '0xAf368c91793CB22739386DFCbBb2F1A9e4bCBeBf': 1.25, // wstETH
        // '0x7048c9e4aBD0cf0219E95a17A8C6908dfC4f0Ee4': 2, // cbBTC
        // '0xecAc9C5F704e954931349Da37F60E39f515c11c1': 0.7, // lbBTC
        '0x7048c9e4aBD0cf0219E95a17A8C6908dfC4f0Ee4': 1, // cbBTC
        '0xecAc9C5F704e954931349Da37F60E39f515c11c1': 1, // lbBTC
      },
      whitelistedAssets: [],
      defaultWeighting: 0.5,
    },
  };

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

  async update(endBlock: number, deployment: Deployment): Promise<void> {
    // 1. Get single global lastProcessedBlock for merkl
    const globalKey = `${deployment.blockchainType}-${deployment.exchangeId}-merkl-global`;
    const lastProcessedBlock = await this.lastProcessedBlockService.getOrInit(globalKey, deployment.startBlock);
    const campaigns = await this.campaignService.getActiveCampaigns(deployment);

    if (campaigns.length === 0) {
      this.logger.log(`No active campaigns found for ${deployment.blockchainType}-${deployment.exchangeId}`);
      await this.lastProcessedBlockService.update(globalKey, endBlock);
      return;
    }

    this.logger.log(`Processing merkl globally from block ${lastProcessedBlock} to ${endBlock}`);

    // 2. Initialize strategy states for all campaigns up to lastProcessedBlock
    const campaignContexts: CampaignContext[] = [];
    for (const campaign of campaigns) {
      const strategyStates: StrategyStatesMap = new Map();
      await this.initializeStrategyStates(lastProcessedBlock, deployment, campaign, strategyStates);

      campaignContexts.push({
        campaign,
        strategyStates,
      });
    }

    // 2.5. Create global price cache for consistent USD rates across all batches
    const globalStartTimestamp = await this.getTimestampForBlock(lastProcessedBlock + 1, deployment);
    const globalEndTimestamp = await this.getTimestampForBlock(endBlock, deployment);
    const activeCampaigns = campaignContexts.map((ctx) => ctx.campaign);
    const globalPriceCache = await this.createGlobalPriceCache(
      activeCampaigns,
      globalStartTimestamp,
      globalEndTimestamp,
      deployment,
    );

    // 3. Process blocks in batches globally
    for (let batchStart = lastProcessedBlock + 1; batchStart <= endBlock; batchStart += this.BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + this.BATCH_SIZE - 1, endBlock);

      this.logger.log(`Processing global merkl batch ${batchStart} to ${batchEnd}`);

      // 4. Fetch ALL events for this batch once (not per campaign)
      const [createdEvents, updatedEvents, deletedEvents, transferEvents] = await Promise.all([
        this.strategyCreatedEventService.get(batchStart, batchEnd, deployment),
        this.strategyUpdatedEventService.get(batchStart, batchEnd, deployment),
        this.strategyDeletedEventService.get(batchStart, batchEnd, deployment),
        this.voucherTransferEventService.get(batchStart, batchEnd, deployment),
      ]);

      // 5. Process all campaigns using this batch of events
      await this.processBatchForAllCampaigns(
        campaignContexts,
        { createdEvents, updatedEvents, deletedEvents, transferEvents },
        batchStart,
        batchEnd,
        deployment,
        globalPriceCache,
      );

      // 6. Update the global lastProcessedBlock after each batch
      await this.lastProcessedBlockService.update(globalKey, batchEnd);
    }

    // 7. Post-processing: Mark campaigns inactive if we've processed past their end time
    const endBlockTimestamp = await this.getTimestampForBlock(endBlock, deployment);
    await this.campaignService.markProcessedCampaignsInactive(deployment, campaigns, endBlockTimestamp);
  }

  private async processBatchForAllCampaigns(
    campaignContexts: CampaignContext[],
    events: {
      createdEvents: StrategyCreatedEvent[];
      updatedEvents: StrategyUpdatedEvent[];
      deletedEvents: StrategyDeletedEvent[];
      transferEvents: VoucherTransferEvent[];
    },
    batchStart: number,
    batchEnd: number,
    deployment: Deployment,
    globalPriceCache: PriceCache,
  ): Promise<void> {
    const batchStartTimestamp = await this.getTimestampForBlock(batchStart, deployment);
    const batchEndTimestamp = await this.getTimestampForBlock(batchEnd, deployment);

    // COLLECT ALL UNIQUE BLOCK IDs FROM ALL EVENTS
    const allBlockIds = new Set<number>();
    [...events.createdEvents, ...events.updatedEvents, ...events.deletedEvents, ...events.transferEvents].forEach(
      (event) => allBlockIds.add(event.block.id),
    );

    // LOCAL VARIABLES - Query once per campaign before processing to track reward limits
    const campaignDistributedAmounts = new Map<string, Decimal>(); // campaignId -> total distributed
    const campaignTotalAmounts = new Map<string, Decimal>(); // campaignId -> campaign amount

    for (const context of campaignContexts) {
      const currentDistributed = await this.subEpochService.getTotalRewardsForCampaign(context.campaign.id);
      const campaignAmount = new Decimal(context.campaign.rewardAmount);

      campaignDistributedAmounts.set(context.campaign.id, currentDistributed);
      campaignTotalAmounts.set(context.campaign.id, campaignAmount);

      const remaining = campaignAmount.sub(currentDistributed);
      this.logger.log(
        `Campaign ${context.campaign.id}: Already distributed ${currentDistributed.toString()}, ` +
          `Remaining ${remaining.toString()}`,
      );
    }

    // Process each campaign with the same batch of events using global price cache
    for (const context of campaignContexts) {
      const campaignEndTimestamp = context.campaign.endDate.getTime();

      // Skip campaign if entire batch is after campaign end
      if (batchStartTimestamp >= campaignEndTimestamp) {
        this.logger.warn(`Skipping campaign ${context.campaign.id} - batch starts after campaign end`);
        continue;
      }

      // Filter events by campaign end time
      const filterEventsByCampaignEnd = <T extends { timestamp: Date }>(eventList: T[]): T[] => {
        return eventList.filter((event) => {
          const eventTimestamp = event.timestamp.getTime();
          return eventTimestamp < campaignEndTimestamp;
        });
      };
      // Filter events for this campaign's pair AND campaign end time
      const pairCreatedEvents = filterEventsByCampaignEnd(
        events.createdEvents.filter((e) => e.pair.id === context.campaign.pair.id),
      );
      const pairUpdatedEvents = filterEventsByCampaignEnd(
        events.updatedEvents.filter((e) => e.pair.id === context.campaign.pair.id),
      );
      const pairDeletedEvents = filterEventsByCampaignEnd(
        events.deletedEvents.filter((e) => e.pair.id === context.campaign.pair.id),
      );

      // For transfer events, filter by strategies that belong to this pair AND campaign end time
      const pairStrategies = Array.from(context.strategyStates.values()).filter(
        (s) => s.pairId === context.campaign.pair.id,
      );
      const pairStrategyIds = new Set(pairStrategies.map((s) => s.strategyId));
      const pairTransferEvents = filterEventsByCampaignEnd(
        events.transferEvents.filter((e) => pairStrategyIds.has(e.strategyId)),
      );

      // Process epochs for this time range
      await this.processEpochsInTimeRange(
        context.campaign,
        batchStartTimestamp,
        batchEndTimestamp,
        context.strategyStates,
        globalPriceCache,
        {
          createdEvents: pairCreatedEvents,
          updatedEvents: pairUpdatedEvents,
          deletedEvents: pairDeletedEvents,
          transferEvents: pairTransferEvents,
        },
        campaignDistributedAmounts,
        campaignTotalAmounts,
      );

      // Update strategy states after epoch processing
      this.updateStrategyStates(
        pairCreatedEvents,
        pairUpdatedEvents,
        pairDeletedEvents,
        pairTransferEvents,
        context.strategyStates,
      );
    }
  }

  private async initializeStrategyStates(
    lastProcessedBlock: number,
    deployment: Deployment,
    campaign: Campaign,
    strategyStates: StrategyStatesMap,
  ): Promise<void> {
    this.logger.log(`Initializing strategy states up to block ${lastProcessedBlock}`);

    // Get latest created/updated event per strategy for liquidity state with token data
    // TODO: Replace with SubEpoch-based query
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
        WHERE c."blockId" <= $1 
          AND c."blockchainType" = $2 
          AND c."exchangeId" = $3
          AND c."pairId" = $4
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
        WHERE u."blockId" <= $1 
          AND u."blockchainType" = $2 
          AND u."exchangeId" = $3
          AND u."pairId" = $4
      ) combined
      ORDER BY strategy_id, block_id DESC, transaction_index DESC, log_index DESC
    `,
      [lastProcessedBlock, deployment.blockchainType, deployment.exchangeId, campaign.pair.id],
    );

    // Get latest transfer event per strategy for ownership
    // First get strategy IDs for this pair from strategy events
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
        WHERE "blockId" <= $1
          AND "blockchainType" = $2 
          AND "exchangeId" = $3
          AND "strategyId" IN (${placeholders})
        ORDER BY "strategyId", "blockId" DESC, "transactionIndex" DESC, "logIndex" DESC
      `,
        [lastProcessedBlock, deployment.blockchainType, deployment.exchangeId, ...strategyIds],
      );
    }

    // Get list of deleted strategies
    // TODO: Replace with SubEpoch-based query
    const deletedStrategies = await this.subEpochService.subEpochRepository.manager.query(
      `
      SELECT DISTINCT "strategyId" as strategy_id 
      FROM "strategy-deleted-events" 
      WHERE "blockId" <= $1
        AND "blockchainType" = $2 
        AND "exchangeId" = $3
        AND "pairId" = $4
    `,
      [lastProcessedBlock, deployment.blockchainType, deployment.exchangeId, campaign.pair.id],
    );

    // Build lookup maps
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
        order0_A_compressed: order0ForPair.A || '0',
        order0_B_compressed: order0ForPair.B || '0',
        order0_z_compressed: order0ForPair.z || order0ForPair.y || '0',
        order1_A_compressed: order1ForPair.A || '0',
        order1_B_compressed: order1ForPair.B || '0',
        order1_z_compressed: order1ForPair.z || order1ForPair.y || '0',
        currentOwner: ownershipMap.get(strategyId) || strategyState.owner || '',
        creationWallet: strategyState.owner || '',
        lastProcessedBlock: strategyState.block_id,
        isDeleted,
        // Use the actual event timestamp from the database
        lastEventTimestamp: new Date(strategyState.timestamp).getTime(),
      };

      strategyStates.set(strategyId, state);
    }

    this.logger.log(`Initialized ${strategyStates.size} strategy states`);
  }

  private updateStrategyStates(
    createdEvents: StrategyCreatedEvent[],
    updatedEvents: StrategyUpdatedEvent[],
    deletedEvents: StrategyDeletedEvent[],
    transferEvents: VoucherTransferEvent[],
    strategyStates: StrategyStatesMap,
  ): void {
    // Combine all events and sort chronologically
    const allEvents = [
      ...createdEvents.map((e) => ({ type: 'created' as const, event: e })),
      ...updatedEvents.map((e) => ({ type: 'updated' as const, event: e })),
      ...deletedEvents.map((e) => ({ type: 'deleted' as const, event: e })),
      ...transferEvents.map((e) => ({ type: 'transfer' as const, event: e })),
    ].sort((a, b) => {
      if (a.event.block.id !== b.event.block.id) return a.event.block.id - b.event.block.id;
      if (a.event.transactionIndex !== b.event.transactionIndex)
        return a.event.transactionIndex - b.event.transactionIndex;
      return a.event.logIndex - b.event.logIndex;
    });

    // Process events chronologically
    for (const { type, event } of allEvents) {
      const eventTimestamp = event.timestamp.getTime();
      switch (type) {
        case 'created':
          this.processCreatedEvent(event, strategyStates, eventTimestamp);
          break;
        case 'updated':
          this.processUpdatedEvent(event, strategyStates, eventTimestamp);
          break;
        case 'deleted':
          this.processDeletedEvent(event, strategyStates, eventTimestamp);
          break;
        case 'transfer':
          this.processTransferEvent(event, strategyStates, eventTimestamp);
          break;
      }
    }
  }

  private processCreatedEvent(
    event: StrategyCreatedEvent,
    strategyStates: StrategyStatesMap,
    eventTimestamp: number,
  ): void {
    const order0 = JSON.parse(event.order0);
    const order1 = JSON.parse(event.order1);

    // Handle lexicographic token ordering
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
      order0_A_compressed: order0ForPair.A || '0',
      order0_B_compressed: order0ForPair.B || '0',
      order0_z_compressed: order0ForPair.z || order0ForPair.y || '0',
      order1_A_compressed: order1ForPair.A || '0',
      order1_B_compressed: order1ForPair.B || '0',
      order1_z_compressed: order1ForPair.z || order1ForPair.y || '0',
      currentOwner: event.owner,
      creationWallet: event.owner,
      lastProcessedBlock: event.block.id,
      isDeleted: false,
      lastEventTimestamp: eventTimestamp,
    };

    strategyStates.set(event.strategyId, state);
  }

  private processUpdatedEvent(
    event: StrategyUpdatedEvent,
    strategyStates: StrategyStatesMap,
    eventTimestamp: number,
  ): void {
    const existingState = strategyStates.get(event.strategyId);
    if (!existingState) return;

    // Handle lexicographic token ordering
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

  private decompressRateParameter(compressedValue: string): Decimal {
    const compressed = new Decimal(compressedValue || '0');
    const mantissa = compressed.mod(this.SCALING_CONSTANT);
    const exponent = compressed.div(this.SCALING_CONSTANT).floor();
    return mantissa.mul(new Decimal(2).pow(exponent));
  }

  /**
   * Deep clone a single StrategyState object to prevent reference sharing
   */
  private deepCloneStrategyState(state: StrategyState): StrategyState {
    return {
      strategyId: state.strategyId,
      pairId: state.pairId,
      token0Address: state.token0Address,
      token1Address: state.token1Address,
      token0Decimals: state.token0Decimals,
      token1Decimals: state.token1Decimals,
      liquidity0: new Decimal(state.liquidity0.toString()), // Deep clone Decimal
      liquidity1: new Decimal(state.liquidity1.toString()),
      order0_A: new Decimal(state.order0_A.toString()),
      order0_B: new Decimal(state.order0_B.toString()),
      order0_z: new Decimal(state.order0_z.toString()),
      order1_A: new Decimal(state.order1_A.toString()),
      order1_B: new Decimal(state.order1_B.toString()),
      order1_z: new Decimal(state.order1_z.toString()),
      order0_A_compressed: state.order0_A_compressed,
      order0_B_compressed: state.order0_B_compressed,
      order0_z_compressed: state.order0_z_compressed,
      order1_A_compressed: state.order1_A_compressed,
      order1_B_compressed: state.order1_B_compressed,
      order1_z_compressed: state.order1_z_compressed,
      currentOwner: state.currentOwner,
      creationWallet: state.creationWallet,
      lastProcessedBlock: state.lastProcessedBlock,
      isDeleted: state.isDeleted,
      lastEventTimestamp: state.lastEventTimestamp,
    };
  }

  /**
   * Deep clone a Map of StrategyState objects to prevent reference sharing
   */
  private deepCloneStrategyStates(states: StrategyStatesMap): StrategyStatesMap {
    const cloned = new Map<string, StrategyState>();
    for (const [id, state] of states) {
      cloned.set(id, this.deepCloneStrategyState(state));
    }
    return cloned;
  }

  private async processEpochsInTimeRange(
    campaign: Campaign,
    startTimestamp: number,
    endTimestamp: number,
    strategyStates: StrategyStatesMap,
    priceCache: PriceCache,
    batchEvents: BatchEvents,
    campaignDistributedAmounts: Map<string, Decimal>,
    campaignTotalAmounts: Map<string, Decimal>,
  ): Promise<void> {
    // Skip if start timestamp is after campaign end
    const campaignEndTimestamp = campaign.endDate.getTime();
    if (startTimestamp >= campaignEndTimestamp) {
      this.logger.warn(`Skipping epoch processing for campaign ${campaign.id} - time range starts after campaign end`);
      return;
    }

    const epochs = this.calculateEpochsInRange(campaign, startTimestamp, endTimestamp);

    // Validate epoch integrity before processing
    const isEpochIntegrityValid = this.validateEpochIntegrity(campaign, epochs);
    if (!isEpochIntegrityValid) {
      this.logger.error(
        `Skipping epoch processing for campaign ${campaign.id} due to epoch integrity validation failure`,
      );
      return; // Skip processing all epochs for this campaign
    }

    for (const epoch of epochs) {
      // Clone strategy states for this epoch
      const epochStrategyStates = this.deepCloneStrategyStates(strategyStates);
      await this.processEpoch(
        campaign,
        epoch,
        epochStrategyStates,
        priceCache,
        batchEvents,
        campaignDistributedAmounts,
        campaignTotalAmounts,
      );
    }
  }

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

  private async processEpoch(
    campaign: Campaign,
    epoch: EpochInfo,
    strategyStates: StrategyStatesMap,
    priceCache: PriceCache,
    batchEvents: BatchEvents,
    campaignDistributedAmounts: Map<string, Decimal>,
    campaignTotalAmounts: Map<string, Decimal>,
  ): Promise<void> {
    this.logger.log(`Processing epoch ${epoch.epochNumber} for campaign ${campaign.id}`);

    // Validate weighting configuration exists
    const config = this.DEPLOYMENT_TOKEN_WEIGHTINGS[campaign.exchangeId];
    if (!config) {
      this.logger.error(`No weighting configuration found for exchangeId: ${campaign.exchangeId}, skipping epoch`);
      return;
    }

    // Check if pair tokens have any weighting
    const token0Weighting = this.getTokenWeighting(campaign.pair.token0.address, campaign.exchangeId);
    const token1Weighting = this.getTokenWeighting(campaign.pair.token1.address, campaign.exchangeId);

    if (token0Weighting === 0 && token1Weighting === 0) {
      this.logger.warn(
        `Both tokens in pair ${campaign.pair.token0.address}/${campaign.pair.token1.address} have zero weighting - no rewards will be distributed`,
      );
      // Continue processing but expect no rewards
    }

    // Generate sub-epochs for this epoch
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

      // Convert to SubEpoch entities
      for (const [strategyId, strategy] of subEpochData.strategies) {
        if (strategy.isDeleted || (strategy.liquidity0.eq(0) && strategy.liquidity1.eq(0))) {
          continue;
        }

        // The strategy from subEpochData.strategies already contains the correct point-in-time state
        // as calculated by generateSubEpochsForEpoch through event replay

        const totalStrategyReward = rewardResults.totalRewards.get(strategyId) || new Decimal(0);
        const tokenRewards = rewardResults.tokenRewards.get(strategyId) || {
          token0: new Decimal(0),
          token1: new Decimal(0),
        };

        // Calculate all values using the point-in-time strategy state
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

        // Get USD rates using point-in-time strategy
        const token0UsdRate = this.getUsdRateForTimestamp(priceCache, strategy.token0Address, subEpochData.timestamp);
        const token1UsdRate = this.getUsdRateForTimestamp(priceCache, strategy.token1Address, subEpochData.timestamp);

        subEpochsToSave.push({
          strategyId,
          campaignId: campaign.id,
          // subEpochNumber will be assigned by SubEpochService in chronological order
          epochNumber: epoch.epochNumber,
          epochStart: epoch.startTimestamp,
          subEpochTimestamp: new Date(subEpochData.timestamp),

          // All as strings for database storage
          token0Reward: tokenRewards.token0.toString(),
          token1Reward: tokenRewards.token1.toString(),
          totalReward: totalStrategyReward.toString(),
          liquidity0: strategy.liquidity0.toString(),
          liquidity1: strategy.liquidity1.toString(),
          token0Address: strategy.token0Address,
          token1Address: strategy.token1Address,
          token0UsdRate: token0UsdRate.toString(),
          token1UsdRate: token1UsdRate.toString(),
          targetPrice: subEpochData.order0TargetPrice.toString(),
          eligible0: eligible0.toString(),
          eligible1: eligible1.toString(),
          token0RewardZoneBoundary: token0RewardZoneBoundary.toString(),
          token1RewardZoneBoundary: token1RewardZoneBoundary.toString(),
          token0Weighting: token0Weighting.toString(),
          token1Weighting: token1Weighting.toString(),
          token0Decimals: strategy.token0Decimals,
          token1Decimals: strategy.token1Decimals,
          order0ACompressed: strategy.order0_A_compressed.toString(),
          order0BCompressed: strategy.order0_B_compressed.toString(),
          order0A: strategy.order0_A.toString(),
          order0B: strategy.order0_B.toString(),
          order0Z: strategy.order0_z.toString(),
          order1ACompressed: strategy.order1_A_compressed.toString(),
          order1BCompressed: strategy.order1_B_compressed.toString(),
          order1A: strategy.order1_A.toString(),
          order1B: strategy.order1_B.toString(),
          order1Z: strategy.order1_z.toString(),
          lastEventTimestamp: new Date(strategy.lastEventTimestamp),
          lastProcessedBlock: currentBatchEndBlock,
          ownerAddress: strategy.currentOwner,
        });
      }
    }

    // Save sub-epochs (service will assign chronological subEpochNumbers)
    await this.subEpochService.saveSubEpochs(subEpochsToSave);
    this.logger.log(`Saved ${subEpochsToSave.length} sub-epoch records for epoch ${epoch.epochNumber}`);
  }

  /**
   * Generate epoch seed using last transaction hash from already-sorted events with mandatory salt
   */
  private generateEpochSeed(campaign: Campaign, epoch: EpochInfo, chronologicalEvents: TimestampedEvent[]): string {
    const salt = this.configService.get<string>('MERKL_SNAPSHOT_SALT');

    if (!salt) {
      throw new Error('MERKL_SNAPSHOT_SALT environment variable is required for secure seed generation');
    }

    const lastTxHash = this.getLastTransactionHashFromSortedEvents(epoch, chronologicalEvents);

    const seedComponents = [salt, campaign.id, epoch.epochNumber.toString(), lastTxHash];

    return '0x' + createHash('sha256').update(seedComponents.join('|')).digest('hex');
  }

  /**
   * Get the most recent transaction hash from already-sorted events before epoch start
   * Falls back to campaign ID if no events exist before epoch start
   */
  private getLastTransactionHashFromSortedEvents(epoch: EpochInfo, chronologicalEvents: TimestampedEvent[]): string {
    const epochStartTimestamp = epoch.startTimestamp.getTime();

    // Iterate backwards through already-sorted events to find last one before epoch start
    for (let i = chronologicalEvents.length - 1; i >= 0; i--) {
      if (chronologicalEvents[i].timestamp < epochStartTimestamp) {
        return chronologicalEvents[i].event.transactionHash;
      }
    }

    // Fallback: if no events before epoch start, use the first available event hash
    // This can happen for the first epoch of a campaign
    if (chronologicalEvents.length > 0) {
      return chronologicalEvents[0].event.transactionHash;
    }

    // Ultimate fallback: if no events at all, throw error (this should be very rare)
    throw new Error(`No events found for epoch ${epoch.epochNumber} - cannot generate seed`);
  }

  /**
   * Get snapshot intervals using environment-appropriate method
   */
  private getSnapshotIntervals(
    campaign: Campaign,
    epoch: EpochInfo,
    chronologicalEvents: TimestampedEvent[],
  ): number[] {
    const epochDurationMs = epoch.endTimestamp.getTime() - epoch.startTimestamp.getTime();
    const epochDurationSeconds = Math.floor(epochDurationMs / 1000); // Convert to seconds for partitioner

    // Check for MERKL_SNAPSHOT_SEED environment variable
    const merklSnapshotSeed = this.configService.get<string>('MERKL_SNAPSHOT_SEED');

    if (merklSnapshotSeed) {
      return partitionSingleEpoch(
        epochDurationSeconds,
        this.MIN_SNAPSHOT_INTERVAL,
        this.MAX_SNAPSHOT_INTERVAL,
        merklSnapshotSeed,
      );
    } else {
      // Production mode: use transaction-based seed
      const seed = this.generateEpochSeed(campaign, epoch, chronologicalEvents);

      return partitionSingleEpoch(epochDurationSeconds, this.MIN_SNAPSHOT_INTERVAL, this.MAX_SNAPSHOT_INTERVAL, seed);
    }
  }

  private generateSubEpochsForEpoch(
    epoch: EpochInfo,
    strategyStates: StrategyStatesMap,
    campaign: Campaign,
    priceCache: PriceCache,
    batchEvents: BatchEvents,
  ): SubEpochData[] {
    const subEpochs: SubEpochData[] = [];

    // Step 1: Get all batch events in chronological order
    const chronologicalEvents = this.sortBatchEventsChronologically(batchEvents);

    // Step 2: Get snapshot intervals using partitioner
    const snapshotIntervals = this.getSnapshotIntervals(campaign, epoch, chronologicalEvents);

    // Step 3: Initialize snapshot generation variables
    const currentStrategyStates = this.deepCloneStrategyStates(strategyStates); // Deep clone to prevent input mutation
    let eventIndex = 0;
    let currentTime = epoch.startTimestamp.getTime();
    const epochStartTimestamp = currentTime;
    const epochEndTimestamp = epoch.endTimestamp.getTime();
    const campaignEndTimestamp = campaign.endDate.getTime();

    // Step 4: Apply events that occurred before epoch start
    // Only apply events from within this campaign's timeframe, not arbitrary historical events
    const campaignStartTimestamp = campaign.startDate.getTime();
    while (
      eventIndex < chronologicalEvents.length &&
      chronologicalEvents[eventIndex].timestamp < currentTime &&
      chronologicalEvents[eventIndex].timestamp >= campaignStartTimestamp
    ) {
      this.applyEventToStrategyStates(chronologicalEvents[eventIndex], currentStrategyStates);
      eventIndex++;
    }

    // Step 5: Generate snapshots using partitioner intervals
    let intervalIndex = 0;
    while (currentTime < epochEndTimestamp && intervalIndex < snapshotIntervals.length) {
      // Skip snapshots after campaign end
      if (currentTime >= campaignEndTimestamp) {
        break;
      }

      // Apply any events that occurred at or before this snapshot timestamp
      while (
        eventIndex < chronologicalEvents.length &&
        chronologicalEvents[eventIndex].timestamp <= currentTime &&
        chronologicalEvents[eventIndex].timestamp >= epochStartTimestamp
      ) {
        this.applyEventToStrategyStates(chronologicalEvents[eventIndex], currentStrategyStates);
        eventIndex++;
      }

      // Get target prices using campaign pair tokens
      const targetPrices = this.getTargetPricesAtTime(currentTime, campaign, priceCache);
      if (targetPrices === null) {
        currentTime += snapshotIntervals[intervalIndex];
        intervalIndex++;
        continue;
      }

      // Use campaign pair token decimals
      const token0Decimals = campaign.pair.token0.decimals;
      const token1Decimals = campaign.pair.token1.decimals;

      // Generate sub-epoch with current state
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

      // Advance to next snapshot using partitioner interval (convert seconds to milliseconds)
      currentTime += snapshotIntervals[intervalIndex] * 1000;
      intervalIndex++;
    }

    return subEpochs;
  }

  private calculateSubEpochRewards(
    subEpoch: SubEpochData,
    rewardPool: Decimal,
    campaign: Campaign,
    campaignDistributedAmounts: Map<string, Decimal>,
    campaignTotalAmounts: Map<string, Decimal>,
  ): { totalRewards: Map<string, Decimal>; tokenRewards: Map<string, { token0: Decimal; token1: Decimal }> } {
    const rewards = new Map<string, Decimal>();
    const toleranceFactor = new Decimal(1 - this.TOLERANCE_PERCENTAGE).sqrt();

    let totalWeightedEligible0 = new Decimal(0);
    let totalWeightedEligible1 = new Decimal(0);
    const strategyWeightedEligibility0 = new Map<string, Decimal>();
    const strategyWeightedEligibility1 = new Map<string, Decimal>();

    // PHASE 1: Calculate eligibility and weightings
    for (const [strategyId, strategy] of subEpoch.strategies) {
      if (strategy.isDeleted || (strategy.liquidity0.eq(0) && strategy.liquidity1.eq(0))) {
        continue;
      }

      const token0Weighting = this.getTokenWeighting(strategy.token0Address, campaign.exchangeId);
      const token1Weighting = this.getTokenWeighting(strategy.token1Address, campaign.exchangeId);

      // Calculate eligible liquidity
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

      // Apply weighting for reward calculation
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

    // Calculate weight-based reward pool allocation
    const token0Weighting = this.getTokenWeighting(campaign.pair.token0.address, campaign.exchangeId);
    const token1Weighting = this.getTokenWeighting(campaign.pair.token1.address, campaign.exchangeId);
    const totalWeight = token0Weighting + token1Weighting;

    let token0RewardPool = new Decimal(0);
    let token1RewardPool = new Decimal(0);

    if (totalWeight > 0) {
      token0RewardPool = rewardPool.mul(token0Weighting).div(totalWeight);
      token1RewardPool = rewardPool.mul(token1Weighting).div(totalWeight);
    }

    // Handle edge cases
    if (totalWeightedEligible0.eq(0) && totalWeightedEligible1.eq(0)) {
      return { totalRewards: rewards, tokenRewards: new Map() };
    }

    // PHASE 2: Distribute rewards AND write CSV rows immediately
    const strategyRewards = new Map<string, { token0: Decimal; token1: Decimal }>();

    // Distribute token0 rewards
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

    // Distribute token1 rewards
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

    // REWARD CAPPING LOGIC - Ensure campaign limits are never exceeded
    const currentDistributed = campaignDistributedAmounts.get(campaign.id) as Decimal;
    const campaignTotal = campaignTotalAmounts.get(campaign.id) as Decimal;
    const remaining = campaignTotal.sub(currentDistributed);

    // Calculate total rewards to distribute this sub-epoch
    let totalRewardsToDistribute = new Decimal(0);
    for (const reward of rewards.values()) {
      totalRewardsToDistribute = totalRewardsToDistribute.add(reward);
    }

    // Cap if would exceed remaining
    if (totalRewardsToDistribute.gt(remaining)) {
      this.logger.warn(
        `Campaign ${campaign.id}: Capping rewards from ${totalRewardsToDistribute.toString()} ` +
          `to ${remaining.toString()}`,
      );

      if (remaining.gt(0)) {
        // Proportionally reduce all rewards
        const scaleFactor = remaining.div(totalRewardsToDistribute);

        for (const [strategyId, reward] of rewards) {
          const scaledReward = reward.mul(scaleFactor);
          rewards.set(strategyId, scaledReward);

          // Also scale token rewards
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
        // No remaining rewards - zero everything
        for (const [strategyId] of rewards) {
          rewards.set(strategyId, new Decimal(0));
          strategyRewards.set(strategyId, { token0: new Decimal(0), token1: new Decimal(0) });
        }
        totalRewardsToDistribute = new Decimal(0);
      }
    }

    // Update the distributed amount for this campaign
    campaignDistributedAmounts.set(campaign.id, currentDistributed.add(totalRewardsToDistribute));

    return { totalRewards: rewards, tokenRewards: strategyRewards };
  }

  /**
   * Extract all events related to a specific strategy from batch events
   */
  private getStrategyEventsFromBatch(
    strategyId: string,
    batchEvents: BatchEvents,
  ): Array<{ timestamp: number; blockId: number; transactionIndex: number; logIndex: number }> {
    const events: Array<{ timestamp: number; blockId: number; transactionIndex: number; logIndex: number }> = [];

    // Add created events
    batchEvents.createdEvents
      .filter((event) => event.strategyId === strategyId)
      .forEach((event) =>
        events.push({
          timestamp: event.timestamp.getTime(),
          blockId: event.block.id,
          transactionIndex: event.transactionIndex,
          logIndex: event.logIndex,
        }),
      );

    // Add updated events
    batchEvents.updatedEvents
      .filter((event) => event.strategyId === strategyId)
      .forEach((event) =>
        events.push({
          timestamp: event.timestamp.getTime(),
          blockId: event.block.id,
          transactionIndex: event.transactionIndex,
          logIndex: event.logIndex,
        }),
      );

    // Add deleted events
    batchEvents.deletedEvents
      .filter((event) => event.strategyId === strategyId)
      .forEach((event) =>
        events.push({
          timestamp: event.timestamp.getTime(),
          blockId: event.block.id,
          transactionIndex: event.transactionIndex,
          logIndex: event.logIndex,
        }),
      );

    // Add transfer events
    batchEvents.transferEvents
      .filter((event) => event.strategyId === strategyId)
      .forEach((event) =>
        events.push({
          timestamp: event.timestamp.getTime(),
          blockId: event.block.id,
          transactionIndex: event.transactionIndex,
          logIndex: event.logIndex,
        }),
      );

    return events;
  }

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

    // Add check for A == 0 to prevent division by zero
    if (A.eq(0)) {
      return new Decimal(0);
    }

    const ineligibleFraction = rewardZoneBoundary.sub(B).div(A);
    const ineligibleLiquidity = z.mul(ineligibleFraction);
    const eligibleLiquidity = y.sub(ineligibleLiquidity);

    return Decimal.max(eligibleLiquidity, 0);
  }

  private calculateTargetSqrtPriceScaled(targetPrice: Decimal, baseDecimals: number, quoteDecimals: number): Decimal {
    // Calculate adjusted price and return scaled square root
    const baseDecimalsFactor = new Decimal(10).pow(baseDecimals);
    const quoteDecimalsFactor = new Decimal(10).pow(quoteDecimals);
    const adjustedPrice = targetPrice.mul(baseDecimalsFactor).div(quoteDecimalsFactor);
    const sqrtAdjustedPrice = adjustedPrice.sqrt();
    const result = sqrtAdjustedPrice.mul(this.SCALING_CONSTANT);

    return result;
  }

  private calculateInvTargetSqrtPriceScaled(
    targetPrice: Decimal,
    baseDecimals: number,
    quoteDecimals: number,
  ): Decimal {
    // Calculate adjusted price and return scaled inverse square root
    const baseDecimalsFactor = new Decimal(10).pow(baseDecimals);
    const quoteDecimalsFactor = new Decimal(10).pow(quoteDecimals);
    const adjustedPrice = targetPrice.mul(quoteDecimalsFactor).div(baseDecimalsFactor);
    const sqrtAdjustedPrice = adjustedPrice.sqrt();
    // const invSqrtAdjustedPrice = new Decimal(1).div(sqrtAdjustedPrice);
    const result = sqrtAdjustedPrice.mul(this.SCALING_CONSTANT);

    return result;
  }

  private async getTimestampForBlock(blockNumber: number, deployment: Deployment): Promise<number> {
    const block = await this.blockService.getBlock(blockNumber, deployment);
    return block.timestamp.getTime();
  }

  /**
   * Validates epoch integrity - no overlaps and no gaps between consecutive epochs
   * Only validates the epochs that are actually being processed, not the entire campaign
   */
  private validateEpochIntegrity(campaign: Campaign, epochs: EpochInfo[]): boolean {
    try {
      // If no epochs, nothing to validate
      if (epochs.length === 0) {
        return true;
      }

      // Check for overlaps/gaps between consecutive epochs
      for (let i = 1; i < epochs.length; i++) {
        const prevEpochEnd = epochs[i - 1].endTimestamp.getTime();
        const currentEpochStart = epochs[i].startTimestamp.getTime();

        if (currentEpochStart !== prevEpochEnd) {
          this.logger.error(
            `Epoch overlap/gap detected for campaign ${campaign.id}: ` +
              `epoch_${epochs[i - 1].epochNumber} ends at ${prevEpochEnd}, ` +
              `epoch_${epochs[i].epochNumber} starts at ${currentEpochStart}`,
          );
          return false;
        }
      }

      // Validate that individual epochs have positive duration
      for (const epoch of epochs) {
        const epochDuration = epoch.endTimestamp.getTime() - epoch.startTimestamp.getTime();
        if (epochDuration <= 0) {
          this.logger.error(
            `Invalid epoch duration for campaign ${campaign.id}, epoch ${epoch.epochNumber}: ${epochDuration}`,
          );
          return false;
        }
      }

      return true;
    } catch (error) {
      this.logger.error(`Error validating epoch integrity for campaign ${campaign.id}:`, error);
      return false;
    }
  }

  /**
   * Create global price cache covering entire processing timeframe for consistent USD rates
   */
  private async createGlobalPriceCache(
    campaigns: Campaign[],
    startTimestamp: number,
    endTimestamp: number,
    deployment: Deployment,
  ): Promise<PriceCache> {
    // Collect all unique token addresses from campaigns
    const uniqueTokenAddresses = new Set<string>();
    for (const campaign of campaigns) {
      uniqueTokenAddresses.add(campaign.pair.token0.address);
      uniqueTokenAddresses.add(campaign.pair.token1.address);
    }

    const tokenAddresses = Array.from(uniqueTokenAddresses);
    const startDate = new Date(startTimestamp).toISOString();
    const endDate = new Date(endTimestamp).toISOString();

    this.logger.log(`Fetching global USD rates for ${tokenAddresses.length} tokens from ${startDate} to ${endDate}`);

    // Fetch USD rates for entire timeframe
    const rates = await this.historicQuoteService.getUsdRates(deployment, tokenAddresses, startDate, endDate);

    // Build cache map - store ALL rates
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

    // Sort rates by timestamp for efficient closest lookup
    for (const [, tokenRates] of cacheMap.entries()) {
      tokenRates.sort((a, b) => a.timestamp - b.timestamp);
    }

    return {
      rates: cacheMap,
      timeWindow: { start: startTimestamp, end: endTimestamp },
    };
  }

  /**
   * Get USD rate for a specific timestamp using deterministic closest lookup
   */
  private getUsdRateForTimestamp(priceCache: PriceCache, tokenAddress: string, targetTimestamp: number): number {
    const tokenRates = priceCache.rates.get(tokenAddress.toLowerCase());
    if (!tokenRates || tokenRates.length === 0) {
      return 0;
    }

    // Find rate with timestamp closest to target (DETERMINISTIC)
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

  private getTargetPricesAtTime(
    timestamp: number,
    campaign: Campaign,
    priceCache: PriceCache,
  ): { order0TargetPrice: Decimal; order1TargetPrice: Decimal } | null {
    // Get token addresses and USD rates using deterministic lookup
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

    // Return both target prices
    return {
      order0TargetPrice: new Decimal(token1Rate).div(token0Rate), // token1Usd/token0Usd for order0
      order1TargetPrice: new Decimal(token0Rate).div(token1Rate), // token0Usd/token1Usd for order1
    };
  }

  private sortBatchEventsChronologically(batchEvents: BatchEvents): TimestampedEvent[] {
    const events: TimestampedEvent[] = [];

    // Convert all event types to timestamped events
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

    // Sort chronologically with transaction/log index tiebreakers
    return events.sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      if (a.event.transactionIndex !== b.event.transactionIndex)
        return a.event.transactionIndex - b.event.transactionIndex;
      return a.event.logIndex - b.event.logIndex;
    });
  }

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

  private getTokenWeighting(tokenAddress: string, exchangeId: ExchangeId): number {
    const config = this.DEPLOYMENT_TOKEN_WEIGHTINGS[exchangeId];
    if (!config) {
      this.logger.warn(`No weighting configuration found for exchangeId: ${exchangeId}`);
      return 0;
    }

    const normalizedAddress = tokenAddress.toLowerCase();

    // Check specific weightings first (case-insensitive)
    for (const [configAddress, weighting] of Object.entries(config.tokenWeightings)) {
      if (configAddress.toLowerCase() === normalizedAddress) {
        return weighting;
      }
    }

    // Check if it's a whitelisted asset (case-insensitive)
    for (const whitelistedAddress of config.whitelistedAssets) {
      if (whitelistedAddress.toLowerCase() === normalizedAddress) {
        return 0.5;
      }
    }

    // Use default weighting (typically 0 for no incentives)
    return config.defaultWeighting;
  }
}
