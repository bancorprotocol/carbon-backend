import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Decimal } from 'decimal.js';
import { createWriteStream } from 'fs';
import { ConfigService } from '@nestjs/config';
import { partitionSingleEpoch } from './partitioner';
import { createHash } from 'crypto';
import { Campaign } from '../entities/campaign.entity';
import { EpochReward } from '../entities/epoch-reward.entity';
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
}

interface EpochInfo {
  epochNumber: number;
  startTimestamp: Date;
  endTimestamp: Date;
  totalRewards: Decimal;
}

interface SnapshotData {
  timestamp: number;
  order0TargetPrice: Decimal; // token1Usd/token0Usd for order0
  order1TargetPrice: Decimal; // token0Usd/token1Usd for order1
  targetSqrtPriceScaled: Decimal;
  invTargetSqrtPriceScaled: Decimal;
  strategies: Map<string, StrategyState>;
}

interface PriceCache {
  rates: Map<string, number>; // tokenAddress -> USD rate
  timestamp: number; // When this cache was created
}

interface BatchEvents {
  createdEvents: StrategyCreatedEvent[];
  updatedEvents: StrategyUpdatedEvent[];
  deletedEvents: StrategyDeletedEvent[];
  transferEvents: VoucherTransferEvent[];
  blockTimestamps: Record<number, Date>;
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

interface CSVContext {
  rewardBreakdown: any;
  currentEpochStart: string;
  currentEpochNumber: number;
  currentCampaign: Campaign | null;
  priceCache: PriceCache | null;
  globalSubEpochNumber: number;
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
  private readonly csvExportEnabled: boolean;

  // Note: Sensitive state moved to local variables in update() to prevent concurrent deployment interference

  // Token weighting configuration per deployment
  private readonly DEPLOYMENT_TOKEN_WEIGHTINGS: Record<string, TokenWeightingConfig> = {
    // Ethereum mainnet
    [ExchangeId.OGEthereum]: {
      tokenWeightings: {},
      whitelistedAssets: [],
      defaultWeighting: 1, // Other assets get no incentives
    },
    [ExchangeId.OGCoti]: {
      tokenWeightings: {},
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
        '0x7048c9e4aBD0cf0219E95a17A8C6908dfC4f0Ee4': 1.25, // cbBTC
        '0xecAc9C5F704e954931349Da37F60E39f515c11c1': 1.25, // lbBTC
      },
      whitelistedAssets: [],
      defaultWeighting: 0.5,
    },
  };

  constructor(
    @InjectRepository(EpochReward) private epochRewardRepository: Repository<EpochReward>,
    private campaignService: CampaignService,
    private lastProcessedBlockService: LastProcessedBlockService,
    private blockService: BlockService,
    private historicQuoteService: HistoricQuoteService,
    private strategyCreatedEventService: StrategyCreatedEventService,
    private strategyUpdatedEventService: StrategyUpdatedEventService,
    private strategyDeletedEventService: StrategyDeletedEventService,
    private voucherTransferEventService: VoucherTransferEventService,
    private configService: ConfigService,
  ) {
    this.csvExportEnabled = this.configService.get<string>('MERKL_ENABLE_CSV_EXPORT') === '1';
  }

  async update(endBlock: number, deployment: Deployment): Promise<void> {
    // Initialize CSV context locally to prevent concurrent deployment interference
    const csvContext: CSVContext = {
      rewardBreakdown: {},
      currentEpochStart: '',
      currentEpochNumber: 0,
      currentCampaign: null,
      priceCache: null,
      globalSubEpochNumber: 0, // Reset global sub-epoch counter for each deployment processing
    };

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
        csvContext,
      );

      // 6. Update the global lastProcessedBlock after each batch
      await this.lastProcessedBlockService.update(globalKey, batchEnd);
    }

    // 7. Post-processing: Mark campaigns inactive if we've processed past their end time
    const endBlockTimestamp = await this.getTimestampForBlock(endBlock, deployment);
    await this.campaignService.markProcessedCampaignsInactive(deployment, campaigns, endBlockTimestamp);

    // 8. Write reward breakdown JSON file
    if (this.csvExportEnabled) {
      await this.writeRewardBreakdownFile(deployment, csvContext);
    }
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
    csvContext: CSVContext,
  ): Promise<void> {
    const batchStartTimestamp = await this.getTimestampForBlock(batchStart, deployment);
    const batchEndTimestamp = await this.getTimestampForBlock(batchEnd, deployment);

    // COLLECT ALL UNIQUE BLOCK IDs FROM ALL EVENTS
    const allBlockIds = new Set<number>();
    [...events.createdEvents, ...events.updatedEvents, ...events.deletedEvents, ...events.transferEvents].forEach(
      (event) => allBlockIds.add(event.block.id),
    );

    // FETCH ALL BLOCK TIMESTAMPS AT ONCE (only if we have events)
    let blockTimestamps: Record<number, Date> = {};
    if (allBlockIds.size > 0) {
      blockTimestamps = await this.blockService.getBlocksDictionary([...allBlockIds], deployment);
    }

    // Create price cache once for all campaigns in this batch
    const campaigns = campaignContexts.map((ctx) => ctx.campaign);
    const priceCache = await this.createPriceCache(campaigns, batchStartTimestamp, deployment);

    // Process each campaign with the same batch of events
    for (const context of campaignContexts) {
      const campaignEndTimestamp = Math.floor(context.campaign.endDate.getTime() / 1000);

      // Skip campaign if entire batch is after campaign end
      if (batchStartTimestamp >= campaignEndTimestamp) {
        this.logger.warn(`Skipping campaign ${context.campaign.id} - batch starts after campaign end`);
        continue;
      }

      // Filter events by campaign end time
      const filterEventsByCampaignEnd = <T extends { block: { id: number } }>(eventList: T[]): T[] => {
        return eventList.filter((event) => {
          const eventTimestamp = Math.floor(blockTimestamps[event.block.id].getTime() / 1000);
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
        priceCache,
        {
          createdEvents: pairCreatedEvents,
          updatedEvents: pairUpdatedEvents,
          deletedEvents: pairDeletedEvents,
          transferEvents: pairTransferEvents,
          blockTimestamps,
        },
        csvContext,
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
    const latestStrategyStates = await this.epochRewardRepository.manager.query(
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
        log_index
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
          c."logIndex" as log_index 
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
          u."logIndex" as log_index 
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
      latestOwnershipStates = await this.epochRewardRepository.manager.query(
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
    const deletedStrategies = await this.epochRewardRepository.manager.query(
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
      switch (type) {
        case 'created':
          this.processCreatedEvent(event, strategyStates);
          break;
        case 'updated':
          this.processUpdatedEvent(event, strategyStates);
          break;
        case 'deleted':
          this.processDeletedEvent(event, strategyStates);
          break;
        case 'transfer':
          this.processTransferEvent(event, strategyStates);
          break;
      }
    }
  }

  private processCreatedEvent(event: StrategyCreatedEvent, strategyStates: StrategyStatesMap): void {
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
    };

    strategyStates.set(event.strategyId, state);
  }

  private processUpdatedEvent(event: StrategyUpdatedEvent, strategyStates: StrategyStatesMap): void {
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
  }

  private processDeletedEvent(event: StrategyDeletedEvent, strategyStates: StrategyStatesMap): void {
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
  }

  private processTransferEvent(event: VoucherTransferEvent, strategyStates: StrategyStatesMap): void {
    const existingState = strategyStates.get(event.strategyId);
    if (!existingState) return;

    existingState.currentOwner = event.to;
    existingState.lastProcessedBlock = event.block.id;
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
    csvContext: CSVContext,
  ): Promise<void> {
    // Skip if start timestamp is after campaign end
    const campaignEndTimestamp = Math.floor(campaign.endDate.getTime() / 1000);
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
      await this.processEpoch(campaign, epoch, epochStrategyStates, priceCache, batchEvents, csvContext);
    }
  }

  private calculateEpochsInRange(campaign: Campaign, startTimestamp: number, endTimestamp: number): EpochInfo[] {
    const epochs: EpochInfo[] = [];

    // Convert Date objects to Unix timestamps (seconds)
    const campaignStartTime = Math.floor(campaign.startDate.getTime() / 1000);
    const campaignEndTime = Math.floor(campaign.endDate.getTime() / 1000);
    const totalCampaignDuration = campaignEndTime - campaignStartTime;

    // First pass: calculate all epochs for the entire campaign to ensure exact total
    const allEpochs = [];
    let epochStart = campaignStartTime;
    let epochNumber = 1;
    let cumulativeRewards = new Decimal(0);

    while (epochStart < campaignEndTime) {
      const epochEnd = Math.min(epochStart + this.EPOCH_DURATION, campaignEndTime);
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
        startTimestamp: new Date(epochStart * 1000),
        endTimestamp: new Date(epochEnd * 1000),
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
    csvContext: CSVContext,
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

    // Use transaction for safety
    await this.epochRewardRepository.manager.transaction(async (transactionalEntityManager) => {
      // Delete existing rewards for this epoch and campaign (important for ongoing epochs)
      await transactionalEntityManager.delete(this.epochRewardRepository.target, {
        campaignId: campaign.id,
        epochNumber: epoch.epochNumber,
        blockchainType: campaign.blockchainType,
        exchangeId: campaign.exchangeId,
      });

      // Generate snapshots for this epoch and calculate rewards
      const epochRewards = this.calculateEpochRewards(
        epoch,
        strategyStates,
        campaign,
        priceCache,
        batchEvents,
        csvContext,
      );

      // Validate that new epoch rewards won't exceed campaign total
      const isEpochValid = await this.validateEpochRewardsWontExceedTotal(campaign, epoch, epochRewards);
      if (!isEpochValid) {
        this.logger.error(`Skipping epoch ${epoch.epochNumber} for campaign ${campaign.id} due to validation failure`);
        return; // Skip this epoch
      }

      // Save epoch rewards to database
      const rewardsToSave = [];
      for (const [strategyId, { owner, totalReward }] of epochRewards) {
        if (totalReward.gt(0)) {
          rewardsToSave.push(
            transactionalEntityManager.create(this.epochRewardRepository.target, {
              campaign,
              blockchainType: campaign.blockchainType,
              exchangeId: campaign.exchangeId,
              epochNumber: epoch.epochNumber,
              epochStartTimestamp: epoch.startTimestamp,
              epochEndTimestamp: epoch.endTimestamp,
              strategyId,
              owner,
              rewardAmount: totalReward.toString(),
              reason: `epoch-${epoch.epochNumber}-${strategyId}`,
              calculatedAt: new Date(),
            }),
          );
        }
      }

      // Save in batches
      for (let i = 0; i < rewardsToSave.length; i += this.SAVE_BATCH_SIZE) {
        const batch = rewardsToSave.slice(i, i + this.SAVE_BATCH_SIZE);
        await transactionalEntityManager.save(this.epochRewardRepository.target, batch);
      }

      this.logger.log(`Saved ${rewardsToSave.length} rewards for epoch ${epoch.epochNumber}`);
    });

    // Validate total rewards after processing
    const isTotalValid = await this.validateTotalRewardsNotExceeded(campaign);
    if (!isTotalValid) {
      this.logger.error(
        `Total rewards validation failed after processing epoch ${epoch.epochNumber} for campaign ${campaign.id}`,
      );
    }
  }

  private calculateEpochRewards(
    epoch: EpochInfo,
    strategyStates: StrategyStatesMap,
    campaign: Campaign,
    priceCache: PriceCache,
    batchEvents: BatchEvents,
    csvContext: CSVContext,
  ): Map<string, { owner: string; totalReward: Decimal }> {
    const epochRewards = new Map<string, { owner: string; totalReward: Decimal }>();

    // Generate snapshots every 5 minutes within the epoch
    const snapshots = this.generateSnapshotsForEpoch(epoch, strategyStates, campaign, priceCache, batchEvents);
    const rewardPerSnapshot = epoch.totalRewards.div(snapshots.length);

    // Track epoch data for JSON output
    const epochStartISO = epoch.startTimestamp.toISOString();
    csvContext.currentEpochStart = epochStartISO;
    csvContext.currentEpochNumber = epoch.epochNumber;
    csvContext.currentCampaign = campaign;
    csvContext.priceCache = priceCache;

    for (let i = 0; i < snapshots.length; i++) {
      const snapshot = snapshots[i];
      csvContext.globalSubEpochNumber++; // Increment global sub-epoch counter
      const snapshotRewards = this.calculateSnapshotRewards(
        snapshot,
        rewardPerSnapshot,
        campaign,
        csvContext.globalSubEpochNumber, // Use global counter instead of local i+1
        csvContext,
      );

      // Check if snapshot had no eligible liquidity
      const hasEligibleLiquidity = snapshotRewards.size > 0;

      if (!hasEligibleLiquidity) {
        continue; // Skip this snapshot, rewards are lost
      }

      // Accumulate rewards per strategy
      for (const [strategyId, reward] of snapshotRewards) {
        const existing = epochRewards.get(strategyId) || {
          owner: snapshot.strategies.get(strategyId)?.currentOwner || '',
          totalReward: new Decimal(0),
        };
        existing.totalReward = existing.totalReward.add(reward);
        epochRewards.set(strategyId, existing);
      }
    }

    return epochRewards;
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
    const epochStartTimestamp = Math.floor(epoch.startTimestamp.getTime() / 1000);

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
    const epochDurationSeconds = Math.floor((epoch.endTimestamp.getTime() - epoch.startTimestamp.getTime()) / 1000);

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

  private generateSnapshotsForEpoch(
    epoch: EpochInfo,
    strategyStates: StrategyStatesMap,
    campaign: Campaign,
    priceCache: PriceCache,
    batchEvents: BatchEvents,
  ): SnapshotData[] {
    const snapshots: SnapshotData[] = [];

    // Step 1: Get all batch events in chronological order
    const chronologicalEvents = this.sortBatchEventsChronologically(batchEvents);

    // Step 2: Get snapshot intervals using partitioner
    const snapshotIntervals = this.getSnapshotIntervals(campaign, epoch, chronologicalEvents);

    // Step 3: Initialize snapshot generation variables
    const currentStrategyStates = this.deepCloneStrategyStates(strategyStates); // Deep clone to prevent input mutation
    let eventIndex = 0;
    let currentTime = Math.floor(epoch.startTimestamp.getTime() / 1000);
    const epochStartTimestamp = currentTime;
    const epochEndTimestamp = Math.floor(epoch.endTimestamp.getTime() / 1000);
    const campaignEndTimestamp = Math.floor(campaign.endDate.getTime() / 1000);

    // Step 4: Apply events that occurred before epoch start
    // Only apply events from within this campaign's timeframe, not arbitrary historical events
    const campaignStartTimestamp = Math.floor(campaign.startDate.getTime() / 1000);
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

      // Generate snapshot with current state
      snapshots.push({
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

      // Advance to next snapshot using partitioner interval
      currentTime += snapshotIntervals[intervalIndex];
      intervalIndex++;
    }

    return snapshots;
  }

  private calculateSnapshotRewards(
    snapshot: SnapshotData,
    rewardPool: Decimal,
    campaign: Campaign,
    subEpochNumber: number,
    csvContext: CSVContext,
  ): Map<string, Decimal> {
    const rewards = new Map<string, Decimal>();
    const toleranceFactor = new Decimal(1 - this.TOLERANCE_PERCENTAGE).sqrt();

    let totalWeightedEligible0 = new Decimal(0);
    let totalWeightedEligible1 = new Decimal(0);
    const strategyWeightedEligibility0 = new Map<string, Decimal>();
    const strategyWeightedEligibility1 = new Map<string, Decimal>();

    // CSV prep (only if enabled)
    let subEpochTimestamp: string | null = null;
    if (this.csvExportEnabled) {
      subEpochTimestamp = new Date(snapshot.timestamp * 1000).toISOString();
    }

    // PHASE 1: Single pass calculation + CSV data collection
    for (const [strategyId, strategy] of snapshot.strategies) {
      if (strategy.isDeleted || (strategy.liquidity0.eq(0) && strategy.liquidity1.eq(0))) {
        continue;
      }

      const token0Weighting = this.getTokenWeighting(strategy.token0Address, campaign.exchangeId);
      const token1Weighting = this.getTokenWeighting(strategy.token1Address, campaign.exchangeId);

      // Calculate eligible liquidity ONCE per side
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

      // CSV DATA COLLECTION (inline, using already-calculated values)
      if (this.csvExportEnabled && subEpochTimestamp) {
        const lpKey = `LP_${strategyId}`;

        // Initialize structure if needed
        if (!csvContext.rewardBreakdown[lpKey]) {
          csvContext.rewardBreakdown[lpKey] = { epochs: {} };
        }
        if (!csvContext.rewardBreakdown[lpKey].epochs[csvContext.currentEpochStart]) {
          csvContext.rewardBreakdown[lpKey].epochs[csvContext.currentEpochStart] = {
            epoch_number: csvContext.currentEpochNumber,
            sub_epochs: {},
            token0_reward: '0',
            token1_reward: '0',
            total_reward: '0',
          };
        }

        // Calculate reward zone boundaries
        const token0RewardZoneBoundary = toleranceFactor.mul(snapshot.targetSqrtPriceScaled);
        const token1RewardZoneBoundary = toleranceFactor.mul(snapshot.invTargetSqrtPriceScaled);

        // Get USD rates from price cache
        const token0UsdRate = csvContext.priceCache?.rates?.get(strategy.token0Address.toLowerCase()) || 0;
        const token1UsdRate = csvContext.priceCache?.rates?.get(strategy.token1Address.toLowerCase()) || 0;

        // Store sub-epoch data (rewards will be filled in Phase 2)
        csvContext.rewardBreakdown[lpKey].epochs[csvContext.currentEpochStart].sub_epochs[subEpochNumber] = {
          sub_epoch_number: subEpochNumber,
          sub_epoch_timestamp: subEpochTimestamp,
          token0_reward: '0', // Will be updated in Phase 2
          token1_reward: '0', // Will be updated in Phase 2
          total_reward: '0', // Will be updated in Phase 2
          strategy_liquidity: {
            liquidity0: strategy.liquidity0.toString(),
            liquidity1: strategy.liquidity1.toString(),
          },
          market_data: {
            token0_usd_rate: token0UsdRate.toString(),
            token1_usd_rate: token1UsdRate.toString(),
            target_price: snapshot.order0TargetPrice.toString(),
            token0_address: strategy.token0Address,
            token1_address: strategy.token1Address,
          },
          eligibility: {
            eligible0: eligible0.toString(), // Using calculated value
            eligible1: eligible1.toString(), // Using calculated value
            token0_reward_zone_boundary: token0RewardZoneBoundary.toString(),
            token1_reward_zone_boundary: token1RewardZoneBoundary.toString(),
          },
        };
      }
    }

    // Calculate weight-based reward pool allocation (Python simulator approach)
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
      return rewards;
    }

    // PHASE 2: Distribute token0 rewards + update CSV
    if (totalWeightedEligible0.gt(0)) {
      for (const [strategyId, weightedEligibleLiquidity] of strategyWeightedEligibility0) {
        const rewardShare = weightedEligibleLiquidity.div(totalWeightedEligible0);
        const reward = token0RewardPool.mul(rewardShare);
        rewards.set(strategyId, (rewards.get(strategyId) || new Decimal(0)).add(reward));

        // Update CSV with actual token0 reward
        if (this.csvExportEnabled && subEpochTimestamp) {
          const lpKey = `LP_${strategyId}`;
          const subEpochData =
            csvContext.rewardBreakdown[lpKey].epochs[csvContext.currentEpochStart].sub_epochs[subEpochNumber];
          subEpochData.token0_reward = reward.toString();

          // Update running totals
          const currentTotal = new Decimal(subEpochData.total_reward);
          subEpochData.total_reward = currentTotal.add(reward).toString();
        }
      }
    }

    // PHASE 3: Distribute token1 rewards + update CSV
    if (totalWeightedEligible1.gt(0)) {
      for (const [strategyId, weightedEligibleLiquidity] of strategyWeightedEligibility1) {
        const rewardShare = weightedEligibleLiquidity.div(totalWeightedEligible1);
        const reward = token1RewardPool.mul(rewardShare);
        rewards.set(strategyId, (rewards.get(strategyId) || new Decimal(0)).add(reward));

        // Update CSV with actual token1 reward
        if (this.csvExportEnabled && subEpochTimestamp) {
          const lpKey = `LP_${strategyId}`;
          const subEpochData =
            csvContext.rewardBreakdown[lpKey].epochs[csvContext.currentEpochStart].sub_epochs[subEpochNumber];
          subEpochData.token1_reward = reward.toString();

          // Update running totals
          const currentTotal = new Decimal(subEpochData.total_reward);
          subEpochData.total_reward = currentTotal.add(reward).toString();
        }
      }
    }

    // PHASE 4: Update epoch-level aggregates (CSV only)
    if (this.csvExportEnabled && subEpochTimestamp) {
      for (const [strategyId] of rewards) {
        const lpKey = `LP_${strategyId}`;
        const epochData = csvContext.rewardBreakdown[lpKey].epochs[csvContext.currentEpochStart];
        const subEpochData = epochData.sub_epochs[subEpochNumber];

        // Aggregate to epoch level
        epochData.token0_reward = new Decimal(epochData.token0_reward).add(subEpochData.token0_reward).toString();
        epochData.token1_reward = new Decimal(epochData.token1_reward).add(subEpochData.token1_reward).toString();
        epochData.total_reward = new Decimal(epochData.total_reward).add(subEpochData.total_reward).toString();
      }
    }

    return rewards;
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
    return Math.floor(block.timestamp.getTime() / 1000);
  }

  /**
   * Validates that total distributed rewards don't exceed campaign amount
   */
  private async validateTotalRewardsNotExceeded(campaign: Campaign): Promise<boolean> {
    try {
      const result = await this.epochRewardRepository
        .createQueryBuilder('reward')
        .select('SUM(CAST(reward.rewardAmount as DECIMAL))', 'total')
        .where('reward.campaignId = :campaignId', { campaignId: campaign.id })
        .andWhere('reward.blockchainType = :blockchainType', { blockchainType: campaign.blockchainType })
        .andWhere('reward.exchangeId = :exchangeId', { exchangeId: campaign.exchangeId })
        .getRawOne();

      const totalDistributed = new Decimal(result.total || '0');
      const campaignAmount = new Decimal(campaign.rewardAmount);

      if (totalDistributed.gt(campaignAmount)) {
        this.logger.error(
          `Total rewards validation failed for campaign ${campaign.id}: ` +
            `distributed=${totalDistributed.toString()}, campaign_amount=${campaignAmount.toString()}`,
        );
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(`Error validating total rewards for campaign ${campaign.id}:`, error);
      return false;
    }
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
        const prevEpochEnd = Math.floor(epochs[i - 1].endTimestamp.getTime() / 1000);
        const currentEpochStart = Math.floor(epochs[i].startTimestamp.getTime() / 1000);

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
        const epochDuration =
          Math.floor(epoch.endTimestamp.getTime() / 1000) - Math.floor(epoch.startTimestamp.getTime() / 1000);
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
   * Validates that new epoch rewards won't exceed campaign total
   */
  private async validateEpochRewardsWontExceedTotal(
    campaign: Campaign,
    epoch: EpochInfo,
    newRewards: Map<string, { owner: string; totalReward: Decimal }>,
  ): Promise<boolean> {
    try {
      // Get current total distributed rewards (excluding this epoch)
      const result = await this.epochRewardRepository
        .createQueryBuilder('reward')
        .select('SUM(CAST(reward.rewardAmount as DECIMAL))', 'total')
        .where('reward.campaignId = :campaignId', { campaignId: campaign.id })
        .andWhere('reward.epochNumber != :epochNumber', { epochNumber: epoch.epochNumber })
        .andWhere('reward.blockchainType = :blockchainType', { blockchainType: campaign.blockchainType })
        .andWhere('reward.exchangeId = :exchangeId', { exchangeId: campaign.exchangeId })
        .getRawOne();

      const currentTotal = new Decimal(result.total || '0');

      // Calculate new epoch total
      const newEpochTotal = Array.from(newRewards.values()).reduce(
        (sum, { totalReward }) => sum.add(totalReward),
        new Decimal(0),
      );

      const projectedTotal = currentTotal.add(newEpochTotal);
      const campaignAmount = new Decimal(campaign.rewardAmount);

      if (projectedTotal.gt(campaignAmount)) {
        this.logger.error(
          `Epoch rewards validation failed for campaign ${campaign.id}, epoch ${epoch.epochNumber}: ` +
            `current_total=${currentTotal.toString()}, new_epoch_total=${newEpochTotal.toString()}, ` +
            `projected_total=${projectedTotal.toString()}, campaign_amount=${campaignAmount.toString()}`,
        );
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Error validating epoch rewards for campaign ${campaign.id}, epoch ${epoch.epochNumber}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Fetch USD rates for all unique token addresses in campaigns once per batch
   */
  private async createPriceCache(
    campaigns: Campaign[],
    batchStartTimestamp: number,
    deployment: Deployment,
  ): Promise<PriceCache> {
    // Collect all unique token addresses from campaigns
    const uniqueTokenAddresses = new Set<string>();
    for (const campaign of campaigns) {
      uniqueTokenAddresses.add(campaign.pair.token0.address);
      uniqueTokenAddresses.add(campaign.pair.token1.address);
    }

    const tokenAddresses = Array.from(uniqueTokenAddresses);
    const targetDate = new Date(batchStartTimestamp * 1000).toISOString();
    const endDate = new Date((batchStartTimestamp + 24 * 60 * 60) * 1000).toISOString(); // +1 day

    this.logger.log(`Fetching USD rates for ${tokenAddresses.length} unique tokens at ${targetDate}`);

    // Fetch USD rates for all token addresses at once
    const rates = await this.historicQuoteService.getUsdRates(deployment, tokenAddresses, targetDate, endDate);

    // Build cache map
    const cacheMap = new Map<string, number>();
    for (const rate of rates) {
      const closestRate = this.findClosestRate(rates, rate.address, batchStartTimestamp);
      if (closestRate !== null) {
        cacheMap.set(rate.address.toLowerCase(), closestRate);
      }
    }

    return {
      rates: cacheMap,
      timestamp: batchStartTimestamp,
    };
  }

  private getTargetPricesAtTime(
    timestamp: number,
    campaign: Campaign,
    priceCache: PriceCache,
  ): { order0TargetPrice: Decimal; order1TargetPrice: Decimal } | null {
    // Get token addresses and USD rates
    const token0Address = campaign.pair.token0.address.toLowerCase();
    const token1Address = campaign.pair.token1.address.toLowerCase();
    const token0Rate = priceCache.rates.get(token0Address);
    const token1Rate = priceCache.rates.get(token1Address);

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

  private findClosestRate(rates: any[], tokenAddress: string, targetTimestamp: number): number | null {
    const tokenRates = rates.filter((rate) => rate.address.toLowerCase() === tokenAddress.toLowerCase());

    if (tokenRates.length === 0) return null;

    // Find rate with timestamp closest to target
    let closest = tokenRates[0];
    let minDiff = Math.abs(closest.day - targetTimestamp);

    for (const rate of tokenRates) {
      const diff = Math.abs(rate.day - targetTimestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closest = rate;
      }
    }

    return closest.usd;
  }

  private async writeRewardBreakdownFile(deployment: Deployment, csvContext: CSVContext): Promise<void> {
    try {
      const jsonFilename = `reward_breakdown_${deployment.blockchainType}_${deployment.exchangeId}_${Date.now()}.json`;
      const csvFilename = `reward_breakdown_${deployment.blockchainType}_${deployment.exchangeId}_${Date.now()}.csv`;

      // Write JSON file using streaming approach
      const jsonStream = createWriteStream(jsonFilename);
      jsonStream.write('{\n');

      const strategyKeys = Object.keys(csvContext.rewardBreakdown);
      let isFirstStrategy = true;

      for (const strategyKey of strategyKeys) {
        if (!isFirstStrategy) {
          jsonStream.write(',\n');
        }
        isFirstStrategy = false;

        // Write strategy key
        jsonStream.write(`  "${strategyKey}": {\n`);
        jsonStream.write(`    "epochs": {\n`);

        const epochs = csvContext.rewardBreakdown[strategyKey].epochs;
        const epochKeys = Object.keys(epochs);
        let isFirstEpoch = true;

        for (const epochKey of epochKeys) {
          if (!isFirstEpoch) {
            jsonStream.write(',\n');
          }
          isFirstEpoch = false;

          // Write epoch key and data
          jsonStream.write(`      "${epochKey}": `);
          jsonStream.write(JSON.stringify(epochs[epochKey], null, 6));
        }

        jsonStream.write('\n    }\n  }');
      }

      jsonStream.write('\n}');
      jsonStream.end();

      // Write CSV file
      const csvStream = createWriteStream(csvFilename);

      // Write CSV header
      csvStream.write(
        'strategy_id,epoch_start,epoch_number,sub_epoch_timestamp,sub_epoch_number,token0_reward,token1_reward,total_reward,liquidity0,liquidity1,token0_address,token1_address,token0_usd_rate,token1_usd_rate,target_price,eligible0,eligible1,token0_reward_zone_boundary,token1_reward_zone_boundary\n',
      );

      // Write CSV data rows
      for (const strategyKey of strategyKeys) {
        const strategyId = strategyKey.replace('LP_', '');
        const epochs = csvContext.rewardBreakdown[strategyKey].epochs;

        for (const epochKey of Object.keys(epochs)) {
          const epochData = epochs[epochKey];
          const epochNumber = epochData.epoch_number;

          for (const subEpochNumber of Object.keys(epochData.sub_epochs)) {
            const subEpochData = epochData.sub_epochs[subEpochNumber];

            // Escape CSV values and write row
            const row = [
              strategyId,
              epochKey,
              epochNumber,
              subEpochData.sub_epoch_timestamp,
              subEpochData.sub_epoch_number,
              subEpochData.token0_reward,
              subEpochData.token1_reward,
              subEpochData.total_reward,
              subEpochData.strategy_liquidity.liquidity0,
              subEpochData.strategy_liquidity.liquidity1,
              `"${subEpochData.market_data.token0_address}"`,
              `"${subEpochData.market_data.token1_address}"`,
              subEpochData.market_data.token0_usd_rate,
              subEpochData.market_data.token1_usd_rate,
              subEpochData.market_data.target_price,
              subEpochData.eligibility.eligible0,
              subEpochData.eligibility.eligible1,
              subEpochData.eligibility.token0_reward_zone_boundary,
              subEpochData.eligibility.token1_reward_zone_boundary,
            ]
              .map((value) => `"${String(value).replace(/"/g, '""')}"`)
              .join(',');

            csvStream.write(row + '\n');
          }
        }
      }

      csvStream.end();

      // Wait for both streams to finish
      await Promise.all([
        new Promise((resolve, reject) => {
          jsonStream.on('finish', resolve);
          jsonStream.on('error', reject);
        }),
        new Promise((resolve, reject) => {
          csvStream.on('finish', resolve);
          csvStream.on('error', reject);
        }),
      ]);

      this.logger.log(`✅ Reward breakdown written to ${jsonFilename} and ${csvFilename}`);
    } catch (error) {
      this.logger.error('Failed to write reward breakdown files:', error);
    }
  }

  private sortBatchEventsChronologically(batchEvents: BatchEvents): TimestampedEvent[] {
    const events: TimestampedEvent[] = [];

    // Convert all event types to timestamped events
    const addEvents = (eventList: any[], type: string) => {
      eventList.forEach((event) => {
        const timestamp = Math.floor(batchEvents.blockTimestamps[event.block.id].getTime() / 1000);
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
        this.processCreatedEvent(event.event as StrategyCreatedEvent, strategyStates);
        break;
      case 'updated':
        this.processUpdatedEvent(event.event as StrategyUpdatedEvent, strategyStates);
        break;
      case 'deleted':
        this.processDeletedEvent(event.event as StrategyDeletedEvent, strategyStates);
        break;
      case 'transfer':
        this.processTransferEvent(event.event as VoucherTransferEvent, strategyStates);
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
