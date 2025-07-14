import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Decimal } from 'decimal.js';
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
import { Deployment } from '../../deployment/deployment.service';
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
  targetPrice: Decimal;
  targetSqrtPriceScaled: Decimal;
  invTargetSqrtPriceScaled: Decimal;
  strategies: Map<string, StrategyState>;
}

interface PriceCache {
  rates: Map<string, number>; // tokenAddress -> USD rate
  timestamp: number; // When this cache was created
}

type StrategyStatesMap = Map<string, StrategyState>;

interface CampaignContext {
  campaign: Campaign;
  strategyStates: StrategyStatesMap;
}

@Injectable()
export class MerklProcessorService {
  private readonly logger = new Logger(MerklProcessorService.name);
  private readonly BATCH_SIZE = 100000; // Number of blocks per batch
  private readonly SAVE_BATCH_SIZE = 1000; // Number of rewards to save at once
  private readonly SNAPSHOT_INTERVAL = 5 * 60; // 5 minutes in seconds
  private readonly EPOCH_DURATION = 4 * 60 * 60; // 4 hours in seconds
  private readonly TOLERANCE_PERCENTAGE = 0.02; // 2%
  private readonly SCALING_CONSTANT = new Decimal(2).pow(48);

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
  ) {}

  async update(endBlock: number, deployment: Deployment): Promise<void> {
    const campaigns = await this.campaignService.getActiveCampaigns(deployment);

    if (campaigns.length === 0) {
      this.logger.log(`No active campaigns found for ${deployment.blockchainType}-${deployment.exchangeId}`);
      return;
    }

    // 1. Get single global lastProcessedBlock for merkl
    const globalKey = `${deployment.blockchainType}-${deployment.exchangeId}-merkl-global`;
    const lastProcessedBlock = await this.lastProcessedBlockService.getOrInit(globalKey, deployment.startBlock);

    this.logger.log(`Processing merkl globally from block ${lastProcessedBlock} to ${endBlock}`);

    // 2. Global cleanup - delete any merkl epoch rewards data after lastProcessedBlock
    const lastProcessedTimestamp = await this.getTimestampForBlock(lastProcessedBlock, deployment);
    await this.epochRewardRepository
      .createQueryBuilder()
      .delete()
      .where('epochStartTimestamp >= :startTimestamp', { startTimestamp: new Date(lastProcessedTimestamp * 1000) })
      .execute();

    // 3. Initialize strategy states for all campaigns up to lastProcessedBlock
    const campaignContexts: CampaignContext[] = [];
    for (const campaign of campaigns) {
      const strategyStates: StrategyStatesMap = new Map();
      await this.initializeStrategyStates(lastProcessedBlock, deployment, campaign, strategyStates);

      campaignContexts.push({
        campaign,
        strategyStates,
      });
    }

    // 4. Process blocks in batches globally
    for (let batchStart = lastProcessedBlock + 1; batchStart <= endBlock; batchStart += this.BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + this.BATCH_SIZE - 1, endBlock);

      this.logger.log(`Processing global merkl batch ${batchStart} to ${batchEnd}`);

      // 5. Fetch ALL events for this batch once (not per campaign)
      const [createdEvents, updatedEvents, deletedEvents, transferEvents] = await Promise.all([
        this.strategyCreatedEventService.get(batchStart, batchEnd, deployment),
        this.strategyUpdatedEventService.get(batchStart, batchEnd, deployment),
        this.strategyDeletedEventService.get(batchStart, batchEnd, deployment),
        this.voucherTransferEventService.get(batchStart, batchEnd, deployment),
      ]);

      // 6. Process all campaigns using this batch of events
      await this.processBatchForAllCampaigns(
        campaignContexts,
        { createdEvents, updatedEvents, deletedEvents, transferEvents },
        batchStart,
        batchEnd,
        deployment,
      );

      // 7. Update the global lastProcessedBlock after each batch
      await this.lastProcessedBlockService.update(globalKey, batchEnd);
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
  ): Promise<void> {
    const batchStartTimestamp = await this.getTimestampForBlock(batchStart, deployment);
    const batchEndTimestamp = await this.getTimestampForBlock(batchEnd, deployment);

    // Create price cache once for all campaigns in this batch
    const campaigns = campaignContexts.map((ctx) => ctx.campaign);
    const priceCache = await this.createPriceCache(campaigns, batchStartTimestamp, deployment);

    // Process each campaign with the same batch of events
    for (const context of campaignContexts) {
      // Filter events for this campaign's pair only
      const pairCreatedEvents = events.createdEvents.filter((e) => e.pair.id === context.campaign.pair.id);
      const pairUpdatedEvents = events.updatedEvents.filter((e) => e.pair.id === context.campaign.pair.id);
      const pairDeletedEvents = events.deletedEvents.filter((e) => e.pair.id === context.campaign.pair.id);

      // For transfer events, filter by strategies that belong to this pair
      const pairStrategies = Array.from(context.strategyStates.values()).filter(
        (s) => s.pairId === context.campaign.pair.id,
      );
      const pairStrategyIds = new Set(pairStrategies.map((s) => s.strategyId));
      const pairTransferEvents = events.transferEvents.filter((e) => pairStrategyIds.has(e.strategyId));

      // Update strategy states with events from this batch
      this.updateStrategyStates(
        pairCreatedEvents,
        pairUpdatedEvents,
        pairDeletedEvents,
        pairTransferEvents,
        context.strategyStates,
      );

      // Calculate and save rewards for epochs that overlap with this batch timeframe
      await this.processEpochsInTimeRange(
        context.campaign,
        batchStartTimestamp,
        batchEndTimestamp,
        context.strategyStates,
        priceCache,
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

      // Handle lexicographic token ordering
      const isToken0Smaller = strategyState.token0_address.toLowerCase() <= strategyState.token1_address.toLowerCase();

      const pairToken0Address = isToken0Smaller ? strategyState.token0_address : strategyState.token1_address;
      const pairToken1Address = isToken0Smaller ? strategyState.token1_address : strategyState.token0_address;
      const pairToken0Decimals = isToken0Smaller ? strategyState.token0_decimals : strategyState.token1_decimals;
      const pairToken1Decimals = isToken0Smaller ? strategyState.token1_decimals : strategyState.token0_decimals;

      // Map orders to pair tokens
      const order0ForPair = isToken0Smaller ? order0 : order1; // bid
      const order1ForPair = isToken0Smaller ? order1 : order0; // ask

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

    const order0 = JSON.parse(event.order0);
    const order1 = JSON.parse(event.order1);

    const isToken0Smaller = existingState.token0Address <= existingState.token1Address;
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
    existingState.lastProcessedBlock = event.block.id;
  }

  private processDeletedEvent(event: StrategyDeletedEvent, strategyStates: StrategyStatesMap): void {
    const existingState = strategyStates.get(event.strategyId);
    if (!existingState) return;

    existingState.isDeleted = true;
    existingState.liquidity0 = new Decimal(0);
    existingState.liquidity1 = new Decimal(0);
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

  private async processEpochsInTimeRange(
    campaign: Campaign,
    startTimestamp: number,
    endTimestamp: number,
    strategyStates: StrategyStatesMap,
    priceCache: PriceCache,
  ): Promise<void> {
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
      await this.processEpoch(campaign, epoch, strategyStates, priceCache);
    }
  }

  private calculateEpochsInRange(campaign: Campaign, startTimestamp: number, endTimestamp: number): EpochInfo[] {
    const epochs: EpochInfo[] = [];

    // Convert Date objects to Unix timestamps (seconds)
    const campaignStartTime = Math.floor(campaign.startDate.getTime() / 1000);
    const campaignEndTime = Math.floor(campaign.endDate.getTime() / 1000);

    let epochStart = campaignStartTime;
    let epochNumber = 1;

    while (epochStart < campaignEndTime) {
      const epochEnd = Math.min(epochStart + this.EPOCH_DURATION, campaignEndTime);

      // Check if this epoch intersects with our time range
      if (epochEnd > startTimestamp && epochStart < endTimestamp) {
        const epochDuration = epochEnd - epochStart;
        const rewardsPerSecond = new Decimal(campaign.rewardAmount).div(campaignEndTime - campaignStartTime);

        epochs.push({
          epochNumber,
          startTimestamp: new Date(epochStart * 1000),
          endTimestamp: new Date(epochEnd * 1000),
          totalRewards: rewardsPerSecond.mul(epochDuration),
        });
      }

      epochStart = epochEnd;
      epochNumber++;
    }

    return epochs;
  }

  private async processEpoch(
    campaign: Campaign,
    epoch: EpochInfo,
    strategyStates: StrategyStatesMap,
    priceCache: PriceCache,
  ): Promise<void> {
    this.logger.log(`Processing epoch ${epoch.epochNumber} for campaign ${campaign.id}`);

    // Use transaction for safety
    await this.epochRewardRepository.manager.transaction(async (transactionalEntityManager) => {
      // Delete existing rewards for this epoch and campaign (important for ongoing epochs)
      await transactionalEntityManager.delete(this.epochRewardRepository.target, {
        campaignId: campaign.id,
        epochNumber: epoch.epochNumber,
      });

      // Generate snapshots for this epoch and calculate rewards
      const epochRewards = this.calculateEpochRewards(epoch, strategyStates, campaign, priceCache);

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
  ): Map<string, { owner: string; totalReward: Decimal }> {
    const epochRewards = new Map<string, { owner: string; totalReward: Decimal }>();

    // Generate snapshots every 5 minutes within the epoch
    const snapshots = this.generateSnapshotsForEpoch(epoch, strategyStates, campaign, priceCache);
    const rewardPerSnapshot = epoch.totalRewards.div(snapshots.length);

    for (const snapshot of snapshots) {
      const snapshotRewards = this.calculateSnapshotRewards(snapshot, rewardPerSnapshot);

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

  private generateSnapshotsForEpoch(
    epoch: EpochInfo,
    strategyStates: StrategyStatesMap,
    campaign: Campaign,
    priceCache: PriceCache,
  ): SnapshotData[] {
    const snapshots: SnapshotData[] = [];

    let currentTime = Math.floor(epoch.startTimestamp.getTime() / 1000);
    const endTime = Math.floor(epoch.endTimestamp.getTime() / 1000);

    while (currentTime < endTime) {
      // Get target price for this snapshot using price cache
      const targetPrice = this.getTargetPriceAtTime(currentTime, campaign, priceCache);

      // Skip snapshot if we can't get price data
      if (targetPrice === null) {
        this.logger.warn(`Skipping snapshot at timestamp ${currentTime} - no USD rates available`);
        currentTime += this.SNAPSHOT_INTERVAL;
        continue;
      }

      snapshots.push({
        timestamp: currentTime,
        targetPrice,
        targetSqrtPriceScaled: this.calculateTargetSqrtPriceScaled(targetPrice),
        invTargetSqrtPriceScaled: this.calculateInvTargetSqrtPriceScaled(targetPrice),
        strategies: new Map(strategyStates), // Clone the strategies map
      });

      currentTime += this.SNAPSHOT_INTERVAL;
    }

    return snapshots;
  }

  private calculateSnapshotRewards(snapshot: SnapshotData, rewardPool: Decimal): Map<string, Decimal> {
    const rewards = new Map<string, Decimal>();
    const toleranceFactor = new Decimal(1 - this.TOLERANCE_PERCENTAGE).sqrt();
    const halfRewardPool = rewardPool.div(2);

    let totalEligibleBids = new Decimal(0);
    let totalEligibleAsks = new Decimal(0);
    const strategyEligibilityBids = new Map<string, Decimal>();
    const strategyEligibilityAsks = new Map<string, Decimal>();

    // Calculate eligible liquidity for each strategy
    for (const [strategyId, strategy] of snapshot.strategies) {
      if (strategy.isDeleted || (strategy.liquidity0.eq(0) && strategy.liquidity1.eq(0))) {
        continue;
      }

      // Calculate eligible liquidity for bid side (order0)
      const eligibleBid = this.calculateEligibleLiquidity(
        strategy.liquidity0,
        strategy.order0_z,
        strategy.order0_A,
        strategy.order0_B,
        snapshot.targetSqrtPriceScaled,
        toleranceFactor,
      );

      // Calculate eligible liquidity for ask side (order1)
      const eligibleAsk = this.calculateEligibleLiquidity(
        strategy.liquidity1,
        strategy.order1_z,
        strategy.order1_A,
        strategy.order1_B,
        snapshot.invTargetSqrtPriceScaled,
        toleranceFactor,
      );

      if (eligibleBid.gt(0)) {
        strategyEligibilityBids.set(strategyId, eligibleBid);
        totalEligibleBids = totalEligibleBids.add(eligibleBid);
      }

      if (eligibleAsk.gt(0)) {
        strategyEligibilityAsks.set(strategyId, eligibleAsk);
        totalEligibleAsks = totalEligibleAsks.add(eligibleAsk);
      }
    }

    // Distribute bid rewards
    if (totalEligibleBids.gt(0)) {
      for (const [strategyId, eligibleLiquidity] of strategyEligibilityBids) {
        const rewardShare = eligibleLiquidity.div(totalEligibleBids);
        const reward = halfRewardPool.mul(rewardShare);
        rewards.set(strategyId, (rewards.get(strategyId) || new Decimal(0)).add(reward));
      }
    }

    // Distribute ask rewards
    if (totalEligibleAsks.gt(0)) {
      for (const [strategyId, eligibleLiquidity] of strategyEligibilityAsks) {
        const rewardShare = eligibleLiquidity.div(totalEligibleAsks);
        const reward = halfRewardPool.mul(rewardShare);
        rewards.set(strategyId, (rewards.get(strategyId) || new Decimal(0)).add(reward));
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

    const ineligibleFraction = rewardZoneBoundary.sub(B).div(A);
    const ineligibleLiquidity = z.mul(ineligibleFraction);
    const eligibleLiquidity = y.sub(ineligibleLiquidity);

    return Decimal.max(eligibleLiquidity, 0);
  }

  private calculateTargetSqrtPriceScaled(targetPrice: Decimal): Decimal {
    return targetPrice.sqrt().mul(this.SCALING_CONSTANT);
  }

  private calculateInvTargetSqrtPriceScaled(targetPrice: Decimal): Decimal {
    return new Decimal(1).div(targetPrice.sqrt()).mul(this.SCALING_CONSTANT);
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

  private getTargetPriceAtTime(timestamp: number, campaign: Campaign, priceCache: PriceCache): Decimal | null {
    const token0Address = campaign.pair.token0.address.toLowerCase();
    const token1Address = campaign.pair.token1.address.toLowerCase();

    // Get USD rates from cache
    const token0Rate = priceCache.rates.get(token0Address);
    const token1Rate = priceCache.rates.get(token1Address);

    if (!token0Rate || !token1Rate || token0Rate === 0) {
      this.logger.warn(
        `Missing USD rates for tokens ${token0Address}/${token1Address} at timestamp ${timestamp} - skipping snapshot`,
      );
      return null; // Skip snapshot when rates are missing
    }

    return new Decimal(token1Rate).div(token0Rate);
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
}
