import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Decimal } from 'decimal.js';
import { DexScreenerEventV2 } from './dex-screener-event-v2.entity';
import { LastProcessedBlockService } from '../../last-processed-block/last-processed-block.service';
import { Deployment } from '../../deployment/deployment.service';
import { StrategyCreatedEventService } from '../../events/strategy-created-event/strategy-created-event.service';
import { StrategyUpdatedEventService } from '../../events/strategy-updated-event/strategy-updated-event.service';
import { StrategyDeletedEventService } from '../../events/strategy-deleted-event/strategy-deleted-event.service';
import { VoucherTransferEventService } from '../../events/voucher-transfer-event/voucher-transfer-event.service';
import { TokensTradedEventService } from '../../events/tokens-traded-event/tokens-traded-event.service';
import { TokenService, TokensByAddress } from '../../token/token.service';
import { StrategyCreatedEvent } from '../../events/strategy-created-event/strategy-created-event.entity';
import { StrategyUpdatedEvent } from '../../events/strategy-updated-event/strategy-updated-event.entity';
import { StrategyDeletedEvent } from '../../events/strategy-deleted-event/strategy-deleted-event.entity';
import { VoucherTransferEvent } from '../../events/voucher-transfer-event/voucher-transfer-event.entity';
import { TokensTradedEvent } from '../../events/tokens-traded-event/tokens-traded-event.entity';

interface StrategyState {
  id: string;
  pairId: number;
  order0: any;
  order1: any;
  token0Address: string;
  token1Address: string;
  token0Decimals: number;
  token1Decimals: number;
  y0: number;
  y1: number;
  reserves0: number;
  reserves1: number;
}

interface TokenReserves {
  [tokenAddress: string]: number;
}

@Injectable()
export class DexScreenerV2Service {
  private readonly BATCH_SIZE = 50000; // Number of blocks per batch
  private readonly SAVE_BATCH_SIZE = 1000; // Number of events to save at once

  constructor(
    @InjectRepository(DexScreenerEventV2)
    private dexScreenerEventRepository: Repository<DexScreenerEventV2>,
    private strategyCreatedEventService: StrategyCreatedEventService,
    private strategyUpdatedEventService: StrategyUpdatedEventService,
    private strategyDeletedEventService: StrategyDeletedEventService,
    private voucherTransferEventService: VoucherTransferEventService,
    private tokensTradeEventService: TokensTradedEventService,
    private lastProcessedBlockService: LastProcessedBlockService,
    private tokenService: TokenService,
  ) {}

  async update(endBlock: number, deployment: Deployment): Promise<void> {
    const key = `${deployment.blockchainType}-${deployment.exchangeId}-dex-screener-v2`;
    const lastProcessedBlock = await this.lastProcessedBlockService.getOrInit(key, deployment.startBlock);

    // Clean up existing events for this batch range
    await this.dexScreenerEventRepository
      .createQueryBuilder()
      .delete()
      .where('"blockNumber" >= :lastProcessedBlock', { lastProcessedBlock })
      .andWhere('"blockchainType" = :blockchainType', { blockchainType: deployment.blockchainType })
      .andWhere('"exchangeId" = :exchangeId', { exchangeId: deployment.exchangeId })
      .execute();

    const tokens = await this.tokenService.allByAddress(deployment);
    const strategyStates = new Map<string, StrategyState>();

    // Initialize strategy states from last processed block
    await this.initializeStrategyStates(lastProcessedBlock, deployment, strategyStates, tokens);

    // Process blocks in batches
    for (let batchStart = lastProcessedBlock; batchStart < endBlock; batchStart += this.BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + this.BATCH_SIZE - 1, endBlock);

      // Fetch events in parallel
      const [createdEvents, updatedEvents, deletedEvents, transferEvents, tradeEvents] = await Promise.all([
        this.strategyCreatedEventService.get(batchStart, batchEnd, deployment),
        this.strategyUpdatedEventService.get(batchStart, batchEnd, deployment),
        this.strategyDeletedEventService.get(batchStart, batchEnd, deployment),
        this.voucherTransferEventService.get(batchStart, batchEnd, deployment),
        this.tokensTradeEventService.get(batchStart, batchEnd, deployment),
      ]);

      // Process events into dex-screener events
      const dexScreenerEvents = this.processEvents(
        createdEvents,
        updatedEvents,
        deletedEvents,
        transferEvents,
        tradeEvents,
        strategyStates,
        tokens,
        deployment,
      );

      // Save events in smaller batches
      for (let i = 0; i < dexScreenerEvents.length; i += this.SAVE_BATCH_SIZE) {
        const eventBatch = dexScreenerEvents.slice(i, i + this.SAVE_BATCH_SIZE);
        await this.dexScreenerEventRepository.save(eventBatch);
      }

      // Update the last processed block for this batch
      await this.lastProcessedBlockService.update(key, batchEnd);
    }
  }

  async getEvents(fromBlock: number, toBlock: number, deployment: Deployment): Promise<DexScreenerEventV2[]> {
    return this.dexScreenerEventRepository
      .createQueryBuilder('event')
      .where('event.blockchainType = :blockchainType', { blockchainType: deployment.blockchainType })
      .andWhere('event.exchangeId = :exchangeId', { exchangeId: deployment.exchangeId })
      .andWhere('event.blockNumber >= :fromBlock', { fromBlock })
      .andWhere('event.blockNumber <= :toBlock', { toBlock })
      .orderBy('event.blockNumber', 'ASC')
      .addOrderBy('event.txnIndex', 'ASC')
      .addOrderBy('event.eventIndex', 'ASC')
      .getMany();
  }

  private async initializeStrategyStates(
    lastProcessedBlock: number,
    deployment: Deployment,
    strategyStates: Map<string, StrategyState>,
    tokens: TokensByAddress,
  ): Promise<void> {
    // Get the latest state of all strategies as of the last processed block
    const query = `
      WITH strategy_events AS (
        SELECT 
          sce."strategyId" as strategy_id,
          sce."pairId" as pair_id,
          sce.order0,
          sce.order1,
          t0.address as token0_address,
          t1.address as token1_address,
          t0.decimals as token0_decimals,
          t1.decimals as token1_decimals,
          sce."blockId" as block_number,
          2 as reason
        FROM "strategy-created-events" sce
        LEFT JOIN tokens t0 ON t0.id = sce."token0Id"
        LEFT JOIN tokens t1 ON t1.id = sce."token1Id"
        WHERE sce."blockchainType" = $1 AND sce."exchangeId" = $2 AND sce."blockId" < $3
        
        UNION ALL
        
        SELECT 
          sue."strategyId" as strategy_id,
          sue."pairId" as pair_id,
          sue.order0,
          sue.order1,
          t0.address as token0_address,
          t1.address as token1_address,
          t0.decimals as token0_decimals,
          t1.decimals as token1_decimals,
          sue."blockId" as block_number,
          sue.reason
        FROM "strategy-updated-events" sue
        LEFT JOIN tokens t0 ON t0.id = sue."token0Id"
        LEFT JOIN tokens t1 ON t1.id = sue."token1Id"
        WHERE sue."blockchainType" = $1 AND sue."exchangeId" = $2 AND sue."blockId" < $3
        
        UNION ALL
        
        SELECT 
          sde."strategyId" as strategy_id,
          sde."pairId" as pair_id,
          sde.order0,
          sde.order1,
          t0.address as token0_address,
          t1.address as token1_address,
          t0.decimals as token0_decimals,
          t1.decimals as token1_decimals,
          sde."blockId" as block_number,
          3 as reason
        FROM "strategy-deleted-events" sde
        LEFT JOIN tokens t0 ON t0.id = sde."token0Id"
        LEFT JOIN tokens t1 ON t1.id = sde."token1Id"
        WHERE sde."blockchainType" = $1 AND sde."exchangeId" = $2 AND sde."blockId" < $3
      ),
      latest_strategy_states AS (
        SELECT DISTINCT ON (strategy_id)
          strategy_id,
          pair_id,
          order0,
          order1,
          token0_address,
          token1_address,
          token0_decimals,
          token1_decimals,
          reason
        FROM strategy_events
        ORDER BY strategy_id, block_number DESC
      )
      SELECT * FROM latest_strategy_states WHERE reason != 3
    `;

    const results = await this.dexScreenerEventRepository.query(query, [
      deployment.blockchainType,
      deployment.exchangeId,
      lastProcessedBlock,
    ]);

    // Calculate cumulative reserves for each strategy
    for (const result of results) {
      const y0 = result.order0?.y ? new Decimal(result.order0.y).toNumber() : 0;
      const y1 = result.order1?.y ? new Decimal(result.order1.y).toNumber() : 0;

      strategyStates.set(result.strategy_id, {
        id: result.strategy_id,
        pairId: result.pair_id,
        order0: result.order0,
        order1: result.order1,
        token0Address: result.token0_address,
        token1Address: result.token1_address,
        token0Decimals: result.token0_decimals,
        token1Decimals: result.token1_decimals,
        y0,
        y1,
        reserves0: 0, // Will be calculated
        reserves1: 0, // Will be calculated
      });
    }

    // Calculate cumulative reserves
    this.calculateCumulativeReserves(strategyStates);
  }

  private processEvents(
    createdEvents: StrategyCreatedEvent[],
    updatedEvents: StrategyUpdatedEvent[],
    deletedEvents: StrategyDeletedEvent[],
    transferEvents: VoucherTransferEvent[],
    tradeEvents: TokensTradedEvent[],
    strategyStates: Map<string, StrategyState>,
    tokens: TokensByAddress,
    deployment: Deployment,
  ): DexScreenerEventV2[] {
    const events: DexScreenerEventV2[] = [];

    // Process strategy events (created, updated, deleted) to generate join/exit events
    const strategyEvents = this.processStrategyEvents(
      createdEvents,
      updatedEvents,
      deletedEvents,
      transferEvents,
      strategyStates,
      tokens,
      deployment,
    );

    // Process trade events to generate swap events with reserves calculated using the original approach
    const swapEvents = this.processTradeEventsWithOriginalLogic(
      tradeEvents,
      createdEvents,
      updatedEvents,
      deletedEvents,
      tokens,
      deployment,
    );

    events.push(...strategyEvents, ...swapEvents);

    // Sort by block number, transaction index, and event index
    return events.sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
      if (a.txnIndex !== b.txnIndex) return a.txnIndex - b.txnIndex;
      return a.eventIndex - b.eventIndex;
    });
  }

  private buildLiquidityTimeline(
    createdEvents: StrategyCreatedEvent[],
    updatedEvents: StrategyUpdatedEvent[],
    deletedEvents: StrategyDeletedEvent[],
    tokens: TokensByAddress,
  ): Map<
    string,
    Array<{
      timestamp: number;
      blockId: number;
      pairId: number;
      y_delta: number;
      tokenAddress: string;
    }>
  > {
    const timeline = new Map<
      string,
      Array<{
        timestamp: number;
        blockId: number;
        pairId: number;
        y_delta: number;
        tokenAddress: string;
      }>
    >();

    // Track strategy states for delta calculations
    const strategyStates = new Map<string, { y0: number; y1: number }>();

    // Combine all strategy events and sort by timestamp
    const allEvents = [
      ...createdEvents.map((e) => ({ ...e, type: 'created', reason: 2 })),
      ...updatedEvents.filter((e) => e.reason !== 1).map((e) => ({ ...e, type: 'updated', reason: e.reason })), // Filter out trade-induced updates
      ...deletedEvents.map((e) => ({ ...e, type: 'deleted', reason: 3 })),
    ].sort((a, b) => {
      if (a.block.id !== b.block.id) return a.block.id - b.block.id;
      if (a.transactionIndex !== b.transactionIndex) return a.transactionIndex - b.transactionIndex;
      return a.logIndex - b.logIndex;
    });

    for (const event of allEvents) {
      const strategyId = event.strategyId.toString();
      const currentState = strategyStates.get(strategyId);

      const token0 = tokens[event.token0.address];
      const token1 = tokens[event.token1.address];

      if (!token0 || !token1) continue;

      const order0 = typeof event.order0 === 'string' ? JSON.parse(event.order0) : event.order0;
      const order1 = typeof event.order1 === 'string' ? JSON.parse(event.order1) : event.order1;
      const y0 = order0?.y ? parseFloat(order0.y) : 0;
      const y1 = order1?.y ? parseFloat(order1.y) : 0;

      let y_delta0 = 0;
      let y_delta1 = 0;

      if (event.reason === 2) {
        // Created
        y_delta0 = y0;
        y_delta1 = y1;
      } else if (event.reason === 3) {
        // Deleted
        y_delta0 = currentState ? -currentState.y0 : 0;
        y_delta1 = currentState ? -currentState.y1 : 0;
      } else {
        // Updated
        y_delta0 = currentState ? y0 - currentState.y0 : y0;
        y_delta1 = currentState ? y1 - currentState.y1 : y1;
      }

      // Update strategy state
      if (event.reason === 3) {
        strategyStates.delete(strategyId);
      } else {
        strategyStates.set(strategyId, { y0, y1 });
      }

      // Add entries for each token separately (like the original SQL partitioning)
      const entries = [
        {
          timestamp: event.block.timestamp.getTime(),
          blockId: event.block.id,
          pairId: event.pair.id,
          y_delta: y_delta0 / Math.pow(10, token0.decimals),
          tokenAddress: token0.address,
        },
        {
          timestamp: event.block.timestamp.getTime(),
          blockId: event.block.id,
          pairId: event.pair.id,
          y_delta: y_delta1 / Math.pow(10, token1.decimals),
          tokenAddress: token1.address,
        },
      ];

      for (const entry of entries) {
        if (!timeline.has(entry.tokenAddress)) {
          timeline.set(entry.tokenAddress, []);
        }
        timeline.get(entry.tokenAddress)!.push(entry);
      }
    }

    // Sort each timeline by timestamp
    for (const [, events] of timeline) {
      events.sort((a, b) => {
        if (a.blockId !== b.blockId) return a.blockId - b.blockId;
        return a.timestamp - b.timestamp;
      });
    }

    return timeline;
  }

  private processTradeEventsWithOriginalLogic(
    tradeEvents: TokensTradedEvent[],
    createdEvents: StrategyCreatedEvent[],
    updatedEvents: StrategyUpdatedEvent[],
    deletedEvents: StrategyDeletedEvent[],
    tokens: TokensByAddress,
    deployment: Deployment,
  ): DexScreenerEventV2[] {
    const events: DexScreenerEventV2[] = [];

    // Build a comprehensive list of all strategy events with their deltas (like the original SQL)
    const allStrategyEvents = this.buildStrategyEventsList(createdEvents, updatedEvents, deletedEvents, tokens);

    for (const tradeEvent of tradeEvents) {
      const sourceToken = tokens[tradeEvent.sourceToken.address];
      const targetToken = tokens[tradeEvent.targetToken.address];

      if (!sourceToken || !targetToken) continue;

      const sourceAmountDecimal = new Decimal(tradeEvent.sourceAmount).div(new Decimal(10).pow(sourceToken.decimals));
      const targetAmountDecimal = new Decimal(tradeEvent.targetAmount).div(new Decimal(10).pow(targetToken.decimals));

      const isSourceAsset0 = sourceToken.address <= targetToken.address;

      const asset0In = isSourceAsset0 ? sourceAmountDecimal.toNumber() : 0;
      const asset1In = !isSourceAsset0 ? sourceAmountDecimal.toNumber() : 0;
      const asset0Out = isSourceAsset0 ? 0 : targetAmountDecimal.toNumber();
      const asset1Out = !isSourceAsset0 ? 0 : targetAmountDecimal.toNumber();

      const priceNative = isSourceAsset0
        ? !targetAmountDecimal.isZero()
          ? sourceAmountDecimal.div(targetAmountDecimal).toNumber()
          : 0
        : !sourceAmountDecimal.isZero()
        ? targetAmountDecimal.div(sourceAmountDecimal).toNumber()
        : 0;

      // Calculate reserves using the exact same logic as the original SQL window function
      const reserves = this.calculateReservesUsingWindowFunction(
        sourceToken.address,
        targetToken.address,
        tradeEvent.block.timestamp,
        tradeEvent.block.id,
        tradeEvent.transactionIndex,
        tradeEvent.logIndex,
        allStrategyEvents,
      );

      events.push({
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        blockNumber: tradeEvent.block.id,
        blockTimestamp: tradeEvent.block.timestamp,
        eventType: 'swap',
        txnId: tradeEvent.transactionHash,
        txnIndex: tradeEvent.transactionIndex,
        eventIndex: tradeEvent.logIndex,
        maker: tradeEvent.callerId,
        pairId: tradeEvent.pair.id,
        asset0In: asset0In ? asset0In.toString() : null,
        asset1In: asset1In ? asset1In.toString() : null,
        asset0Out: asset0Out ? asset0Out.toString() : null,
        asset1Out: asset1Out ? asset1Out.toString() : null,
        priceNative: priceNative.toString(),
        amount0: null,
        amount1: null,
        reserves0: reserves.reserves0.toString(),
        reserves1: reserves.reserves1.toString(),
      } as DexScreenerEventV2);
    }

    return events;
  }

  private buildStrategyEventsList(
    createdEvents: StrategyCreatedEvent[],
    updatedEvents: StrategyUpdatedEvent[],
    deletedEvents: StrategyDeletedEvent[],
    tokens: TokensByAddress,
  ): Array<{
    blockId: number;
    blockTimestamp: Date;
    transactionIndex: number;
    logIndex: number;
    token0Address: string;
    token1Address: string;
    y_delta0: number;
    y_delta1: number;
    pairId: number;
  }> {
    const strategyEvents: Array<{
      blockId: number;
      blockTimestamp: Date;
      transactionIndex: number;
      logIndex: number;
      token0Address: string;
      token1Address: string;
      y_delta0: number;
      y_delta1: number;
      pairId: number;
    }> = [];

    // Track strategy states for delta calculations
    const strategyStates = new Map<string, { y0: number; y1: number }>();

    // Combine all strategy events and sort by timestamp (like the original SQL ORDER BY)
    const allEvents = [
      ...createdEvents.map((e) => ({ ...e, type: 'created', reason: 2 })),
      ...updatedEvents.filter((e) => e.reason !== 1).map((e) => ({ ...e, type: 'updated', reason: e.reason })), // Filter out trade-induced updates
      ...deletedEvents.map((e) => ({ ...e, type: 'deleted', reason: 3 })),
    ].sort((a, b) => {
      if (a.block.id !== b.block.id) return a.block.id - b.block.id;
      if (a.transactionIndex !== b.transactionIndex) return a.transactionIndex - b.transactionIndex;
      return a.logIndex - b.logIndex;
    });

    for (const event of allEvents) {
      const strategyId = event.strategyId.toString();
      const currentState = strategyStates.get(strategyId);

      const token0 = tokens[event.token0.address];
      const token1 = tokens[event.token1.address];

      if (!token0 || !token1) continue;

      const order0 = typeof event.order0 === 'string' ? JSON.parse(event.order0) : event.order0;
      const order1 = typeof event.order1 === 'string' ? JSON.parse(event.order1) : event.order1;
      const y0 = order0?.y ? parseFloat(order0.y) : 0;
      const y1 = order1?.y ? parseFloat(order1.y) : 0;

      let y_delta0 = 0;
      let y_delta1 = 0;

      if (event.reason === 2) {
        // Created
        y_delta0 = y0;
        y_delta1 = y1;
      } else if (event.reason === 3) {
        // Deleted
        y_delta0 = currentState ? -currentState.y0 : 0;
        y_delta1 = currentState ? -currentState.y1 : 0;
      } else {
        // Updated
        y_delta0 = currentState ? y0 - currentState.y0 : y0;
        y_delta1 = currentState ? y1 - currentState.y1 : y1;
      }

      // Update strategy state
      if (event.reason === 3) {
        strategyStates.delete(strategyId);
      } else {
        strategyStates.set(strategyId, { y0, y1 });
      }

      // Add to events list with normalized deltas
      strategyEvents.push({
        blockId: event.block.id,
        blockTimestamp: event.block.timestamp,
        transactionIndex: event.transactionIndex,
        logIndex: event.logIndex,
        token0Address: token0.address,
        token1Address: token1.address,
        y_delta0: y_delta0 / Math.pow(10, token0.decimals),
        y_delta1: y_delta1 / Math.pow(10, token1.decimals),
        pairId: event.pair.id,
      });
    }

    return strategyEvents;
  }

  private calculateReservesUsingWindowFunction(
    sourceTokenAddress: string,
    targetTokenAddress: string,
    tradeTimestamp: Date,
    tradeBlockId: number,
    tradeTransactionIndex: number,
    tradeLogIndex: number,
    allStrategyEvents: Array<{
      blockId: number;
      blockTimestamp: Date;
      transactionIndex: number;
      logIndex: number;
      token0Address: string;
      token1Address: string;
      y_delta0: number;
      y_delta1: number;
      pairId: number;
    }>,
  ): { reserves0: number; reserves1: number } {
    // Determine asset ordering (asset0 < asset1)
    const [asset0Address, asset1Address] = [sourceTokenAddress, targetTokenAddress].sort();

    let reserves0 = 0;
    let reserves1 = 0;

    // Replicate the SQL window function: SUM(y_delta0) OVER (PARTITION BY address0 ORDER BY blockTimestamp)
    // This means: for each token, sum all deltas that happened before or at this trade's timestamp

    for (const strategyEvent of allStrategyEvents) {
      // Only include events that happened before this trade
      // Use strict ordering: block number, then transaction index, then log index
      const isBeforeTrade =
        strategyEvent.blockId < tradeBlockId ||
        (strategyEvent.blockId === tradeBlockId && strategyEvent.blockTimestamp.getTime() < tradeTimestamp.getTime()) ||
        (strategyEvent.blockId === tradeBlockId &&
          strategyEvent.blockTimestamp.getTime() === tradeTimestamp.getTime() &&
          strategyEvent.transactionIndex < tradeTransactionIndex) ||
        (strategyEvent.blockId === tradeBlockId &&
          strategyEvent.blockTimestamp.getTime() === tradeTimestamp.getTime() &&
          strategyEvent.transactionIndex === tradeTransactionIndex &&
          strategyEvent.logIndex < tradeLogIndex);

      if (!isBeforeTrade) continue;

      // Check if this strategy event involves our asset0 token
      if (strategyEvent.token0Address === asset0Address) {
        reserves0 += strategyEvent.y_delta0;
      }
      if (strategyEvent.token1Address === asset0Address) {
        reserves0 += strategyEvent.y_delta1;
      }

      // Check if this strategy event involves our asset1 token
      if (strategyEvent.token0Address === asset1Address) {
        reserves1 += strategyEvent.y_delta0;
      }
      if (strategyEvent.token1Address === asset1Address) {
        reserves1 += strategyEvent.y_delta1;
      }
    }

    return { reserves0, reserves1 };
  }

  private processTradeEventsWithTimeline(
    tradeEvents: TokensTradedEvent[],
    updatedEvents: StrategyUpdatedEvent[],
    liquidityTimeline: Map<
      string,
      Array<{
        timestamp: number;
        blockId: number;
        pairId: number;
        y_delta: number;
        tokenAddress: string;
      }>
    >,
    tokens: TokensByAddress,
    deployment: Deployment,
  ): DexScreenerEventV2[] {
    const events: DexScreenerEventV2[] = [];

    for (const event of tradeEvents) {
      const sourceToken = tokens[event.sourceToken.address];
      const targetToken = tokens[event.targetToken.address];

      if (!sourceToken || !targetToken) continue;

      const sourceAmountDecimal = new Decimal(event.sourceAmount).div(new Decimal(10).pow(sourceToken.decimals));
      const targetAmountDecimal = new Decimal(event.targetAmount).div(new Decimal(10).pow(targetToken.decimals));

      const isSourceAsset0 = sourceToken.address <= targetToken.address;

      const asset0In = isSourceAsset0 ? sourceAmountDecimal.toNumber() : 0;
      const asset1In = !isSourceAsset0 ? sourceAmountDecimal.toNumber() : 0;
      const asset0Out = isSourceAsset0 ? 0 : targetAmountDecimal.toNumber();
      const asset1Out = !isSourceAsset0 ? 0 : targetAmountDecimal.toNumber();

      const priceNative = isSourceAsset0
        ? !targetAmountDecimal.isZero()
          ? sourceAmountDecimal.div(targetAmountDecimal).toNumber()
          : 0
        : !sourceAmountDecimal.isZero()
        ? targetAmountDecimal.div(sourceAmountDecimal).toNumber()
        : 0;

      // Calculate reserves using timeline (cumulative sum up to this point)
      const reserves = this.calculateReservesFromTimeline(
        sourceToken.address,
        targetToken.address,
        event.block.timestamp.getTime(),
        event.block.id,
        liquidityTimeline,
      );

      events.push({
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        blockNumber: event.block.id,
        blockTimestamp: event.block.timestamp,
        eventType: 'swap',
        txnId: event.transactionHash,
        txnIndex: event.transactionIndex,
        eventIndex: event.logIndex,
        maker: event.callerId,
        pairId: event.pair.id,
        asset0In: asset0In ? asset0In.toString() : null,
        asset1In: asset1In ? asset1In.toString() : null,
        asset0Out: asset0Out ? asset0Out.toString() : null,
        asset1Out: asset1Out ? asset1Out.toString() : null,
        priceNative: priceNative.toString(),
        amount0: null,
        amount1: null,
        reserves0: reserves.reserves0.toString(),
        reserves1: reserves.reserves1.toString(),
      } as DexScreenerEventV2);
    }

    return events;
  }

  private calculateReservesFromTimeline(
    sourceTokenAddress: string,
    targetTokenAddress: string,
    tradeTimestamp: number,
    tradeBlockId: number,
    liquidityTimeline: Map<
      string,
      Array<{
        timestamp: number;
        blockId: number;
        pairId: number;
        y_delta: number;
        tokenAddress: string;
      }>
    >,
  ): { reserves0: number; reserves1: number } {
    // Determine asset ordering (asset0 < asset1)
    const [asset0Address, asset1Address] = [sourceTokenAddress, targetTokenAddress].sort();

    let reserves0 = 0;
    let reserves1 = 0;

    // Calculate cumulative reserves for asset0
    const asset0Timeline = liquidityTimeline.get(asset0Address) || [];
    for (const entry of asset0Timeline) {
      // Include events that happened before or at the same time as the trade
      if (entry.blockId < tradeBlockId || (entry.blockId === tradeBlockId && entry.timestamp <= tradeTimestamp)) {
        reserves0 += entry.y_delta;
      }
    }

    // Calculate cumulative reserves for asset1
    const asset1Timeline = liquidityTimeline.get(asset1Address) || [];
    for (const entry of asset1Timeline) {
      // Include events that happened before or at the same time as the trade
      if (entry.blockId < tradeBlockId || (entry.blockId === tradeBlockId && entry.timestamp <= tradeTimestamp)) {
        reserves1 += entry.y_delta;
      }
    }

    return { reserves0, reserves1 };
  }

  private calculateCumulativeReserves(strategyStates: Map<string, StrategyState>): void {
    // Group strategies by token addresses
    const tokenReserves = new Map<string, Decimal>();

    for (const [, state] of strategyStates) {
      const token0Reserves = tokenReserves.get(state.token0Address) || new Decimal(0);
      const token1Reserves = tokenReserves.get(state.token1Address) || new Decimal(0);

      const y0Normalized = new Decimal(state.y0).div(new Decimal(10).pow(state.token0Decimals));
      const y1Normalized = new Decimal(state.y1).div(new Decimal(10).pow(state.token1Decimals));

      tokenReserves.set(state.token0Address, token0Reserves.add(y0Normalized));
      tokenReserves.set(state.token1Address, token1Reserves.add(y1Normalized));
    }

    // Update strategy states with calculated reserves
    for (const [, state] of strategyStates) {
      const isAddress0Asset0 = state.token0Address <= state.token1Address;

      if (isAddress0Asset0) {
        state.reserves0 = (tokenReserves.get(state.token0Address) || new Decimal(0)).toNumber();
        state.reserves1 = (tokenReserves.get(state.token1Address) || new Decimal(0)).toNumber();
      } else {
        state.reserves0 = (tokenReserves.get(state.token1Address) || new Decimal(0)).toNumber();
        state.reserves1 = (tokenReserves.get(state.token0Address) || new Decimal(0)).toNumber();
      }
    }
  }

  private processStrategyEvents(
    createdEvents: StrategyCreatedEvent[],
    updatedEvents: StrategyUpdatedEvent[],
    deletedEvents: StrategyDeletedEvent[],
    transferEvents: VoucherTransferEvent[],
    strategyStates: Map<string, StrategyState>,
    tokens: TokensByAddress,
    deployment: Deployment,
  ): DexScreenerEventV2[] {
    const events: DexScreenerEventV2[] = [];

    // Filter out updated events with reason = 1 (trade-induced updates)
    // These should not generate join/exit events, only the trade event itself
    const filteredUpdatedEvents = updatedEvents.filter((e) => e.reason !== 1);

    // Combine and sort all strategy events by block number, transaction index, log index
    const allEvents = [
      ...createdEvents.map((e) => ({ ...e, type: 'created', reason: 2 })),
      ...filteredUpdatedEvents.map((e) => ({ ...e, type: 'updated', reason: e.reason })),
      ...deletedEvents.map((e) => ({ ...e, type: 'deleted', reason: 3 })),
    ].sort((a, b) => {
      if (a.block.id !== b.block.id) return a.block.id - b.block.id;
      if (a.transactionIndex !== b.transactionIndex) return a.transactionIndex - b.transactionIndex;
      return a.logIndex - b.logIndex;
    });

    for (const event of allEvents) {
      const strategyId = event.strategyId.toString();
      const currentState = strategyStates.get(strategyId);

      const token0 = tokens[event.token0.address];
      const token1 = tokens[event.token1.address];

      if (!token0 || !token1) continue;

      const order0 = typeof event.order0 === 'string' ? JSON.parse(event.order0) : event.order0;
      const order1 = typeof event.order1 === 'string' ? JSON.parse(event.order1) : event.order1;
      const y0 = order0?.y ? parseFloat(order0.y) : 0;
      const y1 = order1?.y ? parseFloat(order1.y) : 0;

      let y_delta0 = 0;
      let y_delta1 = 0;

      if (event.reason === 2) {
        // Created
        y_delta0 = y0;
        y_delta1 = y1;
      } else if (event.reason === 3) {
        // Deleted
        y_delta0 = currentState ? -currentState.y0 : 0;
        y_delta1 = currentState ? -currentState.y1 : 0;
      } else {
        // Updated
        y_delta0 = currentState ? y0 - currentState.y0 : y0;
        y_delta1 = currentState ? y1 - currentState.y1 : y1;
      }

      // Update strategy state
      if (event.reason === 3) {
        strategyStates.delete(strategyId);
      } else {
        strategyStates.set(strategyId, {
          id: strategyId,
          pairId: event.pair.id,
          order0: order0,
          order1: order1,
          token0Address: token0.address,
          token1Address: token1.address,
          token0Decimals: token0.decimals,
          token1Decimals: token1.decimals,
          y0,
          y1,
          reserves0: 0, // Will be calculated
          reserves1: 0, // Will be calculated
        });
      }

      // Calculate liquidity deltas normalized by decimals
      const y_delta0_normalized = y_delta0 / Math.pow(10, token0.decimals);
      const y_delta1_normalized = y_delta1 / Math.pow(10, token1.decimals);

      // Determine asset ordering (asset0 < asset1)
      const isAddress0Asset0 = token0.address <= token1.address;
      const amount0 = isAddress0Asset0 ? y_delta0_normalized : y_delta1_normalized;
      const amount1 = isAddress0Asset0 ? y_delta1_normalized : y_delta0_normalized;

      // Recalculate reserves after state change
      this.calculateCumulativeReserves(strategyStates);
      const reserves = this.getReservesForPair(event.pair.id, strategyStates, isAddress0Asset0);

      // Determine event type based on deltas
      const joinExitType = this.determineJoinExitType(amount0, amount1, event.reason);

      // Find the maker (strategy owner)
      const maker = this.findMaker(event, transferEvents, deployment);

      if (joinExitType.length > 0) {
        for (let i = 0; i < joinExitType.length; i++) {
          const { eventType, amount0: eventAmount0, amount1: eventAmount1, eventIndexOffset } = joinExitType[i];

          events.push({
            blockchainType: deployment.blockchainType,
            exchangeId: deployment.exchangeId,
            blockNumber: event.block.id,
            blockTimestamp: event.block.timestamp,
            eventType,
            txnId: event.transactionHash,
            txnIndex: event.transactionIndex,
            eventIndex: event.logIndex + eventIndexOffset,
            maker,
            pairId: event.pair.id,
            asset0In: null,
            asset1In: null,
            asset0Out: null,
            asset1Out: null,
            priceNative: null,
            amount0: eventAmount0?.toString() || null,
            amount1: eventAmount1?.toString() || null,
            reserves0: reserves.reserves0.toString(),
            reserves1: reserves.reserves1.toString(),
          } as DexScreenerEventV2);
        }
      }
    }

    return events;
  }

  private processTradeEvents(
    tradeEvents: TokensTradedEvent[],
    updatedEvents: StrategyUpdatedEvent[],
    strategyStates: Map<string, StrategyState>,
    tokens: TokensByAddress,
    deployment: Deployment,
  ): DexScreenerEventV2[] {
    const events: DexScreenerEventV2[] = [];

    // Create a map of trade-induced strategy updates (reason = 1) by transaction hash and pair
    const tradeUpdates = new Map<string, StrategyUpdatedEvent[]>();
    for (const updateEvent of updatedEvents) {
      if (updateEvent.reason === 1) {
        const key = `${updateEvent.transactionHash}-${updateEvent.pair.id}`;
        if (!tradeUpdates.has(key)) {
          tradeUpdates.set(key, []);
        }
        tradeUpdates.get(key)!.push(updateEvent);
      }
    }

    for (const event of tradeEvents) {
      const sourceToken = tokens[event.sourceToken.address];
      const targetToken = tokens[event.targetToken.address];

      if (!sourceToken || !targetToken) continue;

      const sourceAmountDecimal = new Decimal(event.sourceAmount).div(new Decimal(10).pow(sourceToken.decimals));
      const targetAmountDecimal = new Decimal(event.targetAmount).div(new Decimal(10).pow(targetToken.decimals));

      const isSourceAsset0 = sourceToken.address <= targetToken.address;

      const asset0In = isSourceAsset0 ? sourceAmountDecimal.toNumber() : null;
      const asset1In = !isSourceAsset0 ? sourceAmountDecimal.toNumber() : null;
      const asset0Out = isSourceAsset0 ? null : targetAmountDecimal.toNumber();
      const asset1Out = !isSourceAsset0 ? null : targetAmountDecimal.toNumber();

      const priceNative = isSourceAsset0
        ? !targetAmountDecimal.isZero()
          ? sourceAmountDecimal.div(targetAmountDecimal).toNumber()
          : 0
        : !sourceAmountDecimal.isZero()
        ? targetAmountDecimal.div(sourceAmountDecimal).toNumber()
        : 0;

      // Get reserves from current strategy states for this pair
      const reserves = this.getReservesForPair(event.pair.id, strategyStates, isSourceAsset0);

      events.push({
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        blockNumber: event.block.id,
        blockTimestamp: event.block.timestamp,
        eventType: 'swap',
        txnId: event.transactionHash,
        txnIndex: event.transactionIndex,
        eventIndex: event.logIndex,
        maker: event.callerId,
        pairId: event.pair.id,
        asset0In: asset0In ? asset0In.toString() : null,
        asset1In: asset1In ? asset1In.toString() : null,
        asset0Out: asset0Out ? asset0Out.toString() : null,
        asset1Out: asset1Out ? asset1Out.toString() : null,
        priceNative: priceNative.toString(),
        amount0: null,
        amount1: null,
        reserves0: reserves.reserves0.toString(),
        reserves1: reserves.reserves1.toString(),
      } as DexScreenerEventV2);
    }

    return events;
  }

  private determineJoinExitType(
    amount0: number,
    amount1: number,
    reason: number,
  ): Array<{
    eventType: string;
    amount0: number | null;
    amount1: number | null;
    eventIndexOffset: number;
  }> {
    if (reason === 2) {
      // Created
      return [
        {
          eventType: 'join',
          amount0,
          amount1,
          eventIndexOffset: 0,
        },
      ];
    }

    if (reason === 3) {
      // Deleted
      return [
        {
          eventType: 'exit',
          amount0: Math.abs(amount0),
          amount1: Math.abs(amount1),
          eventIndexOffset: 0,
        },
      ];
    }

    // Updated (reason === 0 or 1)
    if (amount0 >= 0 && amount1 >= 0) {
      return [
        {
          eventType: 'join',
          amount0,
          amount1,
          eventIndexOffset: 0,
        },
      ];
    }

    if (amount0 <= 0 && amount1 <= 0) {
      return [
        {
          eventType: 'exit',
          amount0: Math.abs(amount0),
          amount1: Math.abs(amount1),
          eventIndexOffset: 0,
        },
      ];
    }

    if (amount0 < 0 && amount1 > 0) {
      return [
        {
          eventType: 'join',
          amount0: null,
          amount1,
          eventIndexOffset: 0,
        },
        {
          eventType: 'exit',
          amount0: Math.abs(amount0),
          amount1: null,
          eventIndexOffset: 0.5,
        },
      ];
    }

    if (amount0 > 0 && amount1 < 0) {
      return [
        {
          eventType: 'exit',
          amount0: null,
          amount1: Math.abs(amount1),
          eventIndexOffset: 0,
        },
        {
          eventType: 'join',
          amount0,
          amount1: null,
          eventIndexOffset: 0.5,
        },
      ];
    }

    return [];
  }

  private findMaker(event: any, transferEvents: VoucherTransferEvent[], deployment: Deployment): string {
    if (event.type === 'created') {
      return event.owner;
    }

    // For updated/deleted events, find the latest voucher transfer
    const latestTransfer = transferEvents
      .filter((t) => t.strategyId.toString() === event.strategyId.toString() && t.block.id < event.block.id)
      .sort((a, b) => b.block.id - a.block.id)[0];

    return latestTransfer?.to || event.owner || '';
  }

  private getReservesForPair(
    pairId: number,
    strategyStates: Map<string, StrategyState>,
    isAddress0Asset0: boolean,
  ): { reserves0: number; reserves1: number } {
    let reserves0 = new Decimal(0);
    let reserves1 = new Decimal(0);

    for (const [, state] of strategyStates) {
      if (state.pairId === pairId) {
        const normalizedY0 = new Decimal(state.y0).div(new Decimal(10).pow(state.token0Decimals));
        const normalizedY1 = new Decimal(state.y1).div(new Decimal(10).pow(state.token1Decimals));

        if (isAddress0Asset0) {
          reserves0 = reserves0.add(normalizedY0);
          reserves1 = reserves1.add(normalizedY1);
        } else {
          reserves0 = reserves0.add(normalizedY1);
          reserves1 = reserves1.add(normalizedY0);
        }
      }
    }

    return { reserves0: reserves0.toNumber(), reserves1: reserves1.toNumber() };
  }

  private getReservesFromTradeUpdates(
    transactionHash: string,
    pairId: number,
    tradeUpdates: Map<string, StrategyUpdatedEvent[]>,
    sourceTokenAddress: string,
    targetTokenAddress: string,
    tokens: TokensByAddress,
  ): { reserves0: number; reserves1: number } {
    const key = `${transactionHash}-${pairId}`;
    const updates = tradeUpdates.get(key) || [];

    // Get the cumulative reserves for the pair from the trade-induced strategy updates
    // These updates contain the total reserves after the trade
    let totalReserves0 = 0;
    let totalReserves1 = 0;

    for (const update of updates) {
      const token0 = tokens[update.token0.address];
      const token1 = tokens[update.token1.address];

      if (!token0 || !token1) continue;

      const order0 = JSON.parse(update.order0);
      const order1 = JSON.parse(update.order1);

      const y0 = parseFloat(order0.y || '0');
      const y1 = parseFloat(order1.y || '0');

      // Normalize by decimals
      const normalizedY0 = y0 / Math.pow(10, token0.decimals);
      const normalizedY1 = y1 / Math.pow(10, token1.decimals);

      // Check if this strategy's tokens match the trade tokens
      const isMatchingStrategy =
        (token0.address === sourceTokenAddress || token0.address === targetTokenAddress) &&
        (token1.address === sourceTokenAddress || token1.address === targetTokenAddress);

      if (isMatchingStrategy) {
        // Order according to asset0/asset1 convention (lexicographic order)
        const isToken0Asset0 = token0.address <= token1.address;

        if (isToken0Asset0) {
          totalReserves0 += normalizedY0;
          totalReserves1 += normalizedY1;
        } else {
          totalReserves0 += normalizedY1;
          totalReserves1 += normalizedY0;
        }
      }
    }

    return { reserves0: totalReserves0, reserves1: totalReserves1 };
  }
}
