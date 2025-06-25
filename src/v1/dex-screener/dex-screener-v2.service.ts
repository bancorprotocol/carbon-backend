import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DexScreenerEventV2 } from './dex-screener-event-v2.entity';
import { LastProcessedBlockService } from '../../last-processed-block/last-processed-block.service';
import { Deployment } from '../../deployment/deployment.service';
import { StrategyCreatedEventService } from '../../events/strategy-created-event/strategy-created-event.service';
import { StrategyUpdatedEventService } from '../../events/strategy-updated-event/strategy-updated-event.service';
import { StrategyDeletedEventService } from '../../events/strategy-deleted-event/strategy-deleted-event.service';
import { VoucherTransferEventService } from '../../events/voucher-transfer-event/voucher-transfer-event.service';
import { TokensTradedEventService } from '../../events/tokens-traded-event/tokens-traded-event.service';
import { TokensByAddress } from '../../token/token.service';
import { Decimal } from 'decimal.js';
import { StrategyCreatedEvent } from '../../events/strategy-created-event/strategy-created-event.entity';
import { StrategyUpdatedEvent } from '../../events/strategy-updated-event/strategy-updated-event.entity';
import { StrategyDeletedEvent } from '../../events/strategy-deleted-event/strategy-deleted-event.entity';
import { VoucherTransferEvent } from '../../events/voucher-transfer-event/voucher-transfer-event.entity';
import { TokensTradedEvent } from '../../events/tokens-traded-event/tokens-traded-event.entity';

interface StrategyLiquidityState {
  strategyId: string;
  pairId: number;
  token0Address: string;
  token1Address: string;
  token0Decimals: number;
  token1Decimals: number;
  liquidity0: Decimal; // y0 value (raw)
  liquidity1: Decimal; // y1 value (raw)
  lastProcessedBlock: number;
  currentOwner: string;
  creationWallet: string;
}

type StrategyLiquidityStatesMap = Map<string, StrategyLiquidityState>;

@Injectable()
export class DexScreenerV2Service {
  private readonly BATCH_SIZE = 100000; // Number of blocks per batch
  private readonly SAVE_BATCH_SIZE = 1000; // Number of events to save at once

  constructor(
    @InjectRepository(DexScreenerEventV2)
    private dexScreenerEventV2Repository: Repository<DexScreenerEventV2>,
    private strategyCreatedEventService: StrategyCreatedEventService,
    private strategyUpdatedEventService: StrategyUpdatedEventService,
    private strategyDeletedEventService: StrategyDeletedEventService,
    private voucherTransferEventService: VoucherTransferEventService,
    private tokensTradedEventService: TokensTradedEventService,
    private lastProcessedBlockService: LastProcessedBlockService,
  ) {}

  async update(endBlock: number, deployment: Deployment, tokens: TokensByAddress): Promise<void> {
    const strategyStates: StrategyLiquidityStatesMap = new Map<string, StrategyLiquidityState>();
    const key = `${deployment.blockchainType}-${deployment.exchangeId}-dex-screener-v2`;
    const lastProcessedBlock = await this.lastProcessedBlockService.getOrInit(key, deployment.startBlock);

    // Clean up existing events for this batch range
    await this.dexScreenerEventV2Repository
      .createQueryBuilder()
      .delete()
      .where('"blockNumber" >= :lastProcessedBlock', { lastProcessedBlock })
      .andWhere('"blockchainType" = :blockchainType', { blockchainType: deployment.blockchainType })
      .andWhere('"exchangeId" = :exchangeId', { exchangeId: deployment.exchangeId })
      .execute();

    await this.initializeStrategyStates(lastProcessedBlock, deployment, strategyStates);

    // Process blocks in batches
    for (let batchStart = lastProcessedBlock + 1; batchStart <= endBlock; batchStart += this.BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + this.BATCH_SIZE - 1, endBlock);

      // Fetch events in parallel
      const [createdEvents, updatedEvents, deletedEvents, transferEvents, tradedEvents] = await Promise.all([
        this.strategyCreatedEventService.get(batchStart, batchEnd, deployment),
        this.strategyUpdatedEventService.get(batchStart, batchEnd, deployment),
        this.strategyDeletedEventService.get(batchStart, batchEnd, deployment),
        this.voucherTransferEventService.get(batchStart, batchEnd, deployment),
        this.tokensTradedEventService.get(batchStart, batchEnd, deployment),
      ]);

      // Process events into dex screener events
      const dexScreenerEvents = this.processEvents(
        createdEvents,
        updatedEvents,
        deletedEvents,
        transferEvents,
        tradedEvents,
        deployment,
        tokens,
        strategyStates,
      );

      // Save events in batches
      for (let i = 0; i < dexScreenerEvents.length; i += this.SAVE_BATCH_SIZE) {
        const eventBatch = dexScreenerEvents.slice(i, i + this.SAVE_BATCH_SIZE);
        await this.dexScreenerEventV2Repository.save(eventBatch);
      }

      // Update the last processed block for this batch
      await this.lastProcessedBlockService.update(key, batchEnd);
    }
  }

  private processEvents(
    createdEvents: StrategyCreatedEvent[],
    updatedEvents: StrategyUpdatedEvent[],
    deletedEvents: StrategyDeletedEvent[],
    transferEvents: VoucherTransferEvent[],
    tradedEvents: TokensTradedEvent[],
    deployment: Deployment,
    tokens: TokensByAddress,
    strategyStates: StrategyLiquidityStatesMap,
  ): DexScreenerEventV2[] {
    const events: DexScreenerEventV2[] = [];

    // Combine ALL events (strategy + trade) and sort chronologically
    const allEvents = [
      ...createdEvents.map((e) => ({ type: 'created' as const, event: e })),
      ...updatedEvents.map((e) => ({ type: 'updated' as const, event: e })),
      ...deletedEvents.map((e) => ({ type: 'deleted' as const, event: e })),
      ...transferEvents.map((e) => ({ type: 'transfer' as const, event: e })),
      ...tradedEvents.map((e) => ({ type: 'trade' as const, event: e })),
    ].sort((a, b) => {
      if (a.event.block.id !== b.event.block.id) return a.event.block.id - b.event.block.id;
      if (a.event.transactionIndex !== b.event.transactionIndex)
        return a.event.transactionIndex - b.event.transactionIndex;
      return a.event.logIndex - b.event.logIndex;
    });

    // Process all events in chronological order
    for (const { type, event } of allEvents) {
      switch (type) {
        case 'created': {
          const createdEvent = event as StrategyCreatedEvent;

          // Generate join event for strategy creation BEFORE adding to state
          // so reserves reflect pre-creation state
          const state = this.createStrategyState(createdEvent);
          const joinEvent = this.createJoinExitEvent(
            createdEvent.block.id,
            createdEvent.timestamp,
            createdEvent.transactionHash,
            createdEvent.transactionIndex,
            createdEvent.logIndex,
            'join',
            createdEvent.owner,
            createdEvent.pair.id,
            state,
            deployment,
            strategyStates, // This still has the pre-creation state
          );
          events.push(joinEvent);

          // Now add to state after reserves are calculated
          strategyStates.set(createdEvent.strategyId, state);
          break;
        }
        case 'updated': {
          const updatedEvent = event as StrategyUpdatedEvent;
          const state = strategyStates.get(updatedEvent.strategyId);
          if (state) {
            if (updatedEvent.reason === 1) {
              // Trade update - update state but don't generate join/exit events
              const newOrder0 = JSON.parse(updatedEvent.order0);
              const newOrder1 = JSON.parse(updatedEvent.order1);
              state.liquidity0 = new Decimal(newOrder0.y || 0);
              state.liquidity1 = new Decimal(newOrder1.y || 0);
              state.lastProcessedBlock = updatedEvent.block.id;
            } else {
              // Non-trade update - generate join/exit events and update state
              const { deltaAmount0, deltaAmount1 } = this.calculateLiquidityDelta(updatedEvent, state);

              // Generate join/exit event based on delta BEFORE updating state
              // so reserves reflect pre-update state
              const eventTypes = this.determineJoinExitType(deltaAmount0, deltaAmount1);
              if (eventTypes) {
                for (const eventType of eventTypes) {
                  const joinExitEvent = this.createJoinExitEventWithDeltas(
                    updatedEvent.block.id,
                    updatedEvent.timestamp,
                    updatedEvent.transactionHash,
                    updatedEvent.transactionIndex,
                    updatedEvent.logIndex,
                    eventType.type,
                    state.currentOwner,
                    updatedEvent.pair.id,
                    eventType.amount0,
                    eventType.amount1,
                    state,
                    deployment,
                    strategyStates, // This still has the pre-update state
                  );
                  events.push(...joinExitEvent);
                }
              }

              // Now update state after reserves are calculated
              state.liquidity0 = state.liquidity0.plus(deltaAmount0);
              state.liquidity1 = state.liquidity1.plus(deltaAmount1);
              state.lastProcessedBlock = updatedEvent.block.id;
            }
          }
          break;
        }
        case 'deleted': {
          const deletedEvent = event as StrategyDeletedEvent;
          const state = strategyStates.get(deletedEvent.strategyId);
          if (state) {
            // Generate exit event for strategy deletion BEFORE removing from state
            // so reserves reflect pre-deletion state
            const exitEvent = this.createJoinExitEvent(
              deletedEvent.block.id,
              deletedEvent.timestamp,
              deletedEvent.transactionHash,
              deletedEvent.transactionIndex,
              deletedEvent.logIndex,
              'exit',
              state.currentOwner,
              deletedEvent.pair.id,
              state,
              deployment,
              strategyStates, // This still has the pre-deletion state
            );
            events.push(exitEvent);

            // Now remove from state after reserves are calculated
            strategyStates.delete(deletedEvent.strategyId);
          }
          break;
        }
        case 'transfer': {
          const transferEvent = event as VoucherTransferEvent;
          // Skip zero address transfers
          if (
            transferEvent.to.toLowerCase() === '0x0000000000000000000000000000000000000000' ||
            transferEvent.from.toLowerCase() === '0x0000000000000000000000000000000000000000'
          ) {
            break;
          }
          const state = strategyStates.get(transferEvent.strategyId);
          if (state) {
            state.currentOwner = transferEvent.to;
            state.lastProcessedBlock = transferEvent.block.id;
          }
          break;
        }
        case 'trade': {
          const tradeEvent = event as TokensTradedEvent;
          // Generate swap event with current state of reserves
          const swapEvent = this.createSwapEvent(tradeEvent, deployment, tokens, strategyStates);
          events.push(swapEvent);
          break;
        }
      }
    }

    // Events are already in chronological order from processing, no need to sort again
    return events;
  }

  private createStrategyState(event: StrategyCreatedEvent): StrategyLiquidityState {
    const order0 = JSON.parse(event.order0);
    const order1 = JSON.parse(event.order1);

    return {
      strategyId: event.strategyId,
      pairId: event.pair.id,
      token0Address: event.token0.address,
      token1Address: event.token1.address,
      token0Decimals: event.token0.decimals,
      token1Decimals: event.token1.decimals,
      liquidity0: new Decimal(order0.y || 0),
      liquidity1: new Decimal(order1.y || 0),
      lastProcessedBlock: event.block.id,
      currentOwner: event.owner,
      creationWallet: event.owner,
    };
  }

  private calculateLiquidityDelta(
    event: StrategyUpdatedEvent,
    state: StrategyLiquidityState,
  ): { deltaAmount0: Decimal; deltaAmount1: Decimal } {
    const newOrder0 = JSON.parse(event.order0);
    const newOrder1 = JSON.parse(event.order1);

    const newLiquidity0 = new Decimal(newOrder0.y || 0);
    const newLiquidity1 = new Decimal(newOrder1.y || 0);

    // Calculate delta based on strategy creation vs update
    let deltaAmount0: Decimal;
    let deltaAmount1: Decimal;

    if (event.reason === 2) {
      // Strategy creation
      deltaAmount0 = newLiquidity0;
      deltaAmount1 = newLiquidity1;
    } else if (event.reason === 3) {
      // Strategy deletion
      deltaAmount0 = newLiquidity0.negated();
      deltaAmount1 = newLiquidity1.negated();
    } else {
      // Regular update
      deltaAmount0 = newLiquidity0.minus(state.liquidity0);
      deltaAmount1 = newLiquidity1.minus(state.liquidity1);
    }

    return { deltaAmount0, deltaAmount1 };
  }

  private determineJoinExitType(
    deltaAmount0: Decimal,
    deltaAmount1: Decimal,
  ): { type: 'join' | 'exit'; amount0: Decimal | null; amount1: Decimal | null }[] | null {
    if (deltaAmount0.isZero() && deltaAmount1.isZero()) {
      return null; // No liquidity change
    }

    // Handle simple cases: both positive (join) or both negative (exit)
    if (deltaAmount0.gte(0) && deltaAmount1.gte(0)) {
      return [{ type: 'join', amount0: deltaAmount0, amount1: deltaAmount1 }];
    }
    if (deltaAmount0.lte(0) && deltaAmount1.lte(0)) {
      return [{ type: 'exit', amount0: deltaAmount0.abs(), amount1: deltaAmount1.abs() }];
    }

    // Handle mixed cases: one positive, one negative (requires two events)
    const events: { type: 'join' | 'exit'; amount0: Decimal | null; amount1: Decimal | null }[] = [];

    if (deltaAmount0.lt(0) && deltaAmount1.gt(0)) {
      // Exit token0, join token1
      events.push({ type: 'exit', amount0: deltaAmount0.abs(), amount1: null });
      events.push({ type: 'join', amount0: null, amount1: deltaAmount1 });
    } else if (deltaAmount0.gt(0) && deltaAmount1.lt(0)) {
      // Join token0, exit token1
      events.push({ type: 'join', amount0: deltaAmount0, amount1: null });
      events.push({ type: 'exit', amount0: null, amount1: deltaAmount1.abs() });
    }

    return events;
  }

  private createJoinExitEvent(
    blockNumber: number,
    blockTimestamp: Date,
    txnId: string,
    txnIndex: number,
    eventIndex: number,
    eventType: 'join' | 'exit',
    maker: string,
    pairId: number,
    state: StrategyLiquidityState,
    deployment: Deployment,
    strategyStates: StrategyLiquidityStatesMap,
  ): DexScreenerEventV2 {
    const normalizedLiquidity0 = state.liquidity0.div(new Decimal(10).pow(state.token0Decimals));
    const normalizedLiquidity1 = state.liquidity1.div(new Decimal(10).pow(state.token1Decimals));

    const event = new DexScreenerEventV2();
    event.blockchainType = deployment.blockchainType;
    event.exchangeId = deployment.exchangeId;
    event.blockNumber = blockNumber;
    event.blockTimestamp = blockTimestamp;
    event.eventType = eventType;
    event.txnId = txnId;
    event.txnIndex = txnIndex;
    event.eventIndex = eventIndex;
    event.maker = maker;
    event.pairId = pairId;
    event.asset0In = null;
    event.asset1In = null;
    event.asset0Out = null;
    event.asset1Out = null;
    event.priceNative = null;
    event.amount0 = normalizedLiquidity0.toFixed();
    event.amount1 = normalizedLiquidity1.toFixed();

    // Apply consistent asset ordering for reserves calculation
    const isToken0Asset0 = state.token0Address.toLowerCase() <= state.token1Address.toLowerCase();
    const asset0Address = isToken0Asset0 ? state.token0Address : state.token1Address;
    const asset1Address = isToken0Asset0 ? state.token1Address : state.token0Address;

    event.reserves0 = this.calculateReserves0ForPair(pairId, asset0Address, strategyStates);
    event.reserves1 = this.calculateReserves1ForPair(pairId, asset1Address, strategyStates);

    return event;
  }

  private createJoinExitEventWithDeltas(
    blockNumber: number,
    blockTimestamp: Date,
    txnId: string,
    txnIndex: number,
    eventIndex: number,
    eventType: 'join' | 'exit',
    maker: string,
    pairId: number,
    amount0: Decimal | null,
    amount1: Decimal | null,
    state: StrategyLiquidityState,
    deployment: Deployment,
    strategyStates: StrategyLiquidityStatesMap,
  ): DexScreenerEventV2[] {
    const events: DexScreenerEventV2[] = [];

    // Normalize amounts upfront
    const normalizedAmount0 = amount0?.div(new Decimal(10).pow(state.token0Decimals)).toFixed() || null;
    const normalizedAmount1 = amount1?.div(new Decimal(10).pow(state.token1Decimals)).toFixed() || null;

    // For mixed cases, we might need to generate two events
    // Apply consistent asset ordering for reserves calculation
    const isToken0Asset0 = state.token0Address.toLowerCase() <= state.token1Address.toLowerCase();
    const asset0Address = isToken0Asset0 ? state.token0Address : state.token1Address;
    const asset1Address = isToken0Asset0 ? state.token1Address : state.token0Address;

    const baseEvent = {
      blockchainType: deployment.blockchainType,
      exchangeId: deployment.exchangeId,
      blockNumber,
      blockTimestamp,
      eventType,
      txnId,
      txnIndex,
      maker,
      pairId,
      asset0In: null,
      asset1In: null,
      asset0Out: null,
      asset1Out: null,
      priceNative: null,
      reserves0: this.calculateReserves0ForPair(pairId, asset0Address, strategyStates),
      reserves1: this.calculateReserves1ForPair(pairId, asset1Address, strategyStates),
    };

    if (normalizedAmount0 !== null && normalizedAmount1 !== null) {
      // Single event with both amounts
      const event = new DexScreenerEventV2();
      Object.assign(event, baseEvent);
      event.eventIndex = eventIndex;
      event.amount0 = normalizedAmount0;
      event.amount1 = normalizedAmount1;
      events.push(event);
    } else {
      // Separate events for each token
      if (normalizedAmount0 !== null) {
        const event0 = new DexScreenerEventV2();
        Object.assign(event0, baseEvent);
        event0.eventIndex = eventIndex;
        event0.amount0 = normalizedAmount0;
        event0.amount1 = null;
        events.push(event0);
      }
      if (normalizedAmount1 !== null) {
        const event1 = new DexScreenerEventV2();
        Object.assign(event1, baseEvent);
        event1.eventIndex = eventIndex + 0.5;
        event1.amount0 = null;
        event1.amount1 = normalizedAmount1;
        events.push(event1);
      }
    }

    return events;
  }

  private createSwapEvent(
    tradeEvent: TokensTradedEvent,
    deployment: Deployment,
    tokens: TokensByAddress,
    strategyStates: StrategyLiquidityStatesMap,
  ): DexScreenerEventV2 {
    const sourceToken = tradeEvent.sourceToken;
    const targetToken = tradeEvent.targetToken;

    // Normalize amounts
    const sourceAmount = new Decimal(tradeEvent.sourceAmount).div(new Decimal(10).pow(sourceToken.decimals));
    const targetAmount = new Decimal(tradeEvent.targetAmount).div(new Decimal(10).pow(targetToken.decimals));

    // Determine asset ordering
    const isSourceAsset0 = sourceToken.address.toLowerCase() <= targetToken.address.toLowerCase();

    // Calculate price
    const priceNative = targetAmount.isZero()
      ? new Decimal(0)
      : isSourceAsset0
      ? sourceAmount.div(targetAmount)
      : targetAmount.div(sourceAmount);

    // Convert to fixed strings upfront
    const sourceAmountFixed = sourceAmount.toFixed();
    const targetAmountFixed = targetAmount.toFixed();
    const priceNativeFixed = priceNative.toFixed();

    const event = new DexScreenerEventV2();
    event.blockchainType = deployment.blockchainType;
    event.exchangeId = deployment.exchangeId;
    event.blockNumber = tradeEvent.block.id;
    event.blockTimestamp = tradeEvent.timestamp;
    event.eventType = 'swap';
    event.txnId = tradeEvent.transactionHash;
    event.txnIndex = tradeEvent.transactionIndex;
    event.eventIndex = tradeEvent.logIndex;
    event.maker = tradeEvent.trader;
    event.pairId = tradeEvent.pair.id;
    event.asset0In = isSourceAsset0 ? sourceAmountFixed : null;
    event.asset1In = !isSourceAsset0 ? sourceAmountFixed : null;
    event.asset0Out = !isSourceAsset0 ? targetAmountFixed : null;
    event.asset1Out = isSourceAsset0 ? targetAmountFixed : null;
    event.priceNative = priceNativeFixed;
    event.amount0 = null;
    event.amount1 = null;

    // Calculate reserves scoped to this specific pair with consistent asset ordering
    const asset0Address = isSourceAsset0 ? sourceToken.address : targetToken.address;
    const asset1Address = isSourceAsset0 ? targetToken.address : sourceToken.address;

    event.reserves0 = this.calculateReserves0ForPair(tradeEvent.pair.id, asset0Address, strategyStates);
    event.reserves1 = this.calculateReserves1ForPair(tradeEvent.pair.id, asset1Address, strategyStates);

    return event;
  }

  private calculateReserves0ForPair(
    pairId: number,
    asset0Address: string,
    strategyStates: StrategyLiquidityStatesMap,
  ): string {
    let totalReserves = new Decimal(0);

    for (const [, state] of strategyStates) {
      if (state.pairId === pairId) {
        // Apply consistent asset ordering: asset0 is the lexicographically smaller address
        const isToken0Asset0 = state.token0Address.toLowerCase() <= state.token1Address.toLowerCase();
        const stateAsset0Address = isToken0Asset0 ? state.token0Address : state.token1Address;

        if (stateAsset0Address.toLowerCase() === asset0Address.toLowerCase()) {
          // Sum the liquidity for asset0, which could be token0 or token1 depending on ordering
          const liquidity = isToken0Asset0 ? state.liquidity0 : state.liquidity1;
          const decimals = isToken0Asset0 ? state.token0Decimals : state.token1Decimals;
          totalReserves = totalReserves.plus(liquidity.div(new Decimal(10).pow(decimals)));
        }
      }
    }

    return totalReserves.toFixed();
  }

  private calculateReserves1ForPair(
    pairId: number,
    asset1Address: string,
    strategyStates: StrategyLiquidityStatesMap,
  ): string {
    let totalReserves = new Decimal(0);

    for (const [, state] of strategyStates) {
      if (state.pairId === pairId) {
        // Apply consistent asset ordering: asset1 is the lexicographically larger address
        const isToken0Asset0 = state.token0Address.toLowerCase() <= state.token1Address.toLowerCase();
        const stateAsset1Address = isToken0Asset0 ? state.token1Address : state.token0Address;

        if (stateAsset1Address.toLowerCase() === asset1Address.toLowerCase()) {
          // Sum the liquidity for asset1, which could be token0 or token1 depending on ordering
          const liquidity = isToken0Asset0 ? state.liquidity1 : state.liquidity0;
          const decimals = isToken0Asset0 ? state.token1Decimals : state.token0Decimals;
          totalReserves = totalReserves.plus(liquidity.div(new Decimal(10).pow(decimals)));
        }
      }
    }

    return totalReserves.toFixed();
  }

  private async initializeStrategyStates(
    lastProcessedBlock: number,
    deployment: Deployment,
    strategyStates: StrategyLiquidityStatesMap,
  ): Promise<void> {
    // Get latest created/updated event per strategy for liquidity state with pair/token data
    const latestLiquidityStates = await this.dexScreenerEventV2Repository.manager.query(
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
        LEFT JOIN pairs p ON c."pairId" = p.id
        LEFT JOIN tokens t0 ON p."token0Id" = t0.id  
        LEFT JOIN tokens t1 ON p."token1Id" = t1.id
        WHERE c."blockId" <= $1 
          AND c."blockchainType" = $2 
          AND c."exchangeId" = $3
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
        LEFT JOIN pairs p ON u."pairId" = p.id
        LEFT JOIN tokens t0 ON p."token0Id" = t0.id  
        LEFT JOIN tokens t1 ON p."token1Id" = t1.id
        WHERE u."blockId" <= $1 
          AND u."blockchainType" = $2 
          AND u."exchangeId" = $3
      ) combined
      ORDER BY strategy_id, block_id DESC, transaction_index DESC, log_index DESC
    `,
      [lastProcessedBlock, deployment.blockchainType, deployment.exchangeId],
    );

    // Get latest transfer event per strategy for ownership
    const latestOwnershipStates = await this.dexScreenerEventV2Repository.manager.query(
      `
      SELECT DISTINCT ON ("strategyId") 
        "strategyId" as strategy_id, 
        "to" as current_owner
      FROM "voucher-transfer-events" 
      WHERE "blockId" <= $1
        AND "blockchainType" = $2 
        AND "exchangeId" = $3
      ORDER BY "strategyId", "blockId" DESC, "transactionIndex" DESC, "logIndex" DESC
    `,
      [lastProcessedBlock, deployment.blockchainType, deployment.exchangeId],
    );

    // Get list of deleted strategies
    const deletedStrategies = await this.dexScreenerEventV2Repository.manager.query(
      `
      SELECT DISTINCT "strategyId" as strategy_id 
      FROM "strategy-deleted-events" 
      WHERE "blockId" <= $1
        AND "blockchainType" = $2 
        AND "exchangeId" = $3
    `,
      [lastProcessedBlock, deployment.blockchainType, deployment.exchangeId],
    );

    // Build ownership map for quick lookup
    const ownershipMap = new Map<string, string>();
    for (const ownership of latestOwnershipStates) {
      ownershipMap.set(ownership.strategy_id, ownership.current_owner);
    }

    // Build deleted strategies set for quick lookup
    const deletedStrategyIds = new Set(deletedStrategies.map((d) => d.strategy_id));

    // Build strategy states from latest liquidity states
    for (const liquidityState of latestLiquidityStates) {
      const strategyId = liquidityState.strategy_id;

      // Skip deleted strategies by setting their liquidity to 0
      const isDeleted = deletedStrategyIds.has(strategyId);

      const order0 = isDeleted ? { y: '0' } : JSON.parse(liquidityState.order0);
      const order1 = isDeleted ? { y: '0' } : JSON.parse(liquidityState.order1);

      const state: StrategyLiquidityState = {
        strategyId,
        pairId: liquidityState.pair_id,
        token0Address: liquidityState.token0_address,
        token1Address: liquidityState.token1_address,
        token0Decimals: liquidityState.token0_decimals,
        token1Decimals: liquidityState.token1_decimals,
        liquidity0: new Decimal(order0.y || 0),
        liquidity1: new Decimal(order1.y || 0),
        lastProcessedBlock: liquidityState.block_id,
        currentOwner: ownershipMap.get(strategyId) || liquidityState.owner || '',
        creationWallet: liquidityState.owner || '',
      };

      strategyStates.set(strategyId, state);
    }
  }

  async getEvents(fromBlock: number, endBlock: number, deployment: Deployment): Promise<any[]> {
    return await this.dexScreenerEventV2Repository
      .createQueryBuilder('event')
      .where('event.blockchainType = :blockchainType', { blockchainType: deployment.blockchainType })
      .andWhere('event.exchangeId = :exchangeId', { exchangeId: deployment.exchangeId })
      .andWhere('event.blockNumber >= :fromBlock', { fromBlock })
      .andWhere('event.blockNumber <= :endBlock', { endBlock })
      .orderBy('event.blockNumber', 'ASC')
      .addOrderBy('event.txnIndex', 'ASC')
      .addOrderBy('event.eventIndex', 'ASC')
      .getMany();
  }
}
