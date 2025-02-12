import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { ActivityV2 } from './activity-v2.entity';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { ActivityDto } from '../v1/activity/activity.dto';
import { ActivityMetaDto } from '../v1/activity/activity-meta.dto';
import { Deployment } from '../deployment/deployment.service';
import { StrategyCreatedEvent } from '../events/strategy-created-event/strategy-created-event.entity';
import { StrategyUpdatedEvent } from '../events/strategy-updated-event/strategy-updated-event.entity';
import { StrategyDeletedEvent } from '../events/strategy-deleted-event/strategy-deleted-event.entity';
import { VoucherTransferEvent } from '../events/voucher-transfer-event/voucher-transfer-event.entity';
import { StrategyCreatedEventService } from '../events/strategy-created-event/strategy-created-event.service';
import { StrategyUpdatedEventService } from '../events/strategy-updated-event/strategy-updated-event.service';
import { StrategyDeletedEventService } from '../events/strategy-deleted-event/strategy-deleted-event.service';
import { VoucherTransferEventService } from '../events/voucher-transfer-event/voucher-transfer-event.service';
import { StrategyState, StrategyStatesMap } from './activity.types';
import { createActivityFromEvent, ordersEqual, parseOrder, processOrders } from './activity.utils';
import { TokensByAddress } from '../token/token.service';
import { Decimal } from 'decimal.js';
@Injectable()
export class ActivityV2Service {
  private readonly BATCH_SIZE = 300000; // Number of blocks per batch
  private readonly SAVE_BATCH_SIZE = 1000; // Number of activities to save at once

  constructor(
    @InjectRepository(ActivityV2)
    private activityRepository: Repository<ActivityV2>,
    private strategyCreatedEventService: StrategyCreatedEventService,
    private strategyUpdatedEventService: StrategyUpdatedEventService,
    private strategyDeletedEventService: StrategyDeletedEventService,
    private voucherTransferEventService: VoucherTransferEventService,
    private lastProcessedBlockService: LastProcessedBlockService,
  ) {}

  async update(endBlock: number, deployment: Deployment, tokens: TokensByAddress): Promise<void> {
    const strategyStates: StrategyStatesMap = new Map<string, StrategyState>();
    const key = `${deployment.blockchainType}-${deployment.exchangeId}-activities-v2`;
    const lastProcessedBlock = await this.lastProcessedBlockService.getOrInit(key, deployment.startBlock);

    // Clean up existing activities for this batch range
    await this.activityRepository
      .createQueryBuilder()
      .delete()
      .where('"blockNumber" >= :lastProcessedBlock', { lastProcessedBlock })
      .andWhere('"blockchainType" = :blockchainType', { blockchainType: deployment.blockchainType })
      .andWhere('"exchangeId" = :exchangeId', { exchangeId: deployment.exchangeId })
      .execute();

    await this.initializeStrategyStates(lastProcessedBlock, deployment, strategyStates);

    // Process blocks in batches
    for (let batchStart = lastProcessedBlock; batchStart < endBlock; batchStart += this.BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + this.BATCH_SIZE - 1, endBlock);

      // Fetch events in parallel
      const [createdEvents, updatedEvents, deletedEvents, transferEvents] = await Promise.all([
        this.strategyCreatedEventService.get(batchStart, batchEnd, deployment),
        this.strategyUpdatedEventService.get(batchStart, batchEnd, deployment),
        this.strategyDeletedEventService.get(batchStart, batchEnd, deployment),
        this.voucherTransferEventService.get(batchStart, batchEnd, deployment),
      ]);

      // Process events into activities
      const activities = this.processEvents(
        createdEvents,
        updatedEvents,
        deletedEvents,
        transferEvents,
        deployment,
        tokens,
        strategyStates,
      );

      // Save activities in smaller batches
      for (let i = 0; i < activities.length; i += this.SAVE_BATCH_SIZE) {
        const activityBatch = activities.slice(i, i + this.SAVE_BATCH_SIZE);
        await this.activityRepository.save(activityBatch);
      }

      // Update the last processed block for this batch
      await this.lastProcessedBlockService.update(key, batchEnd);
    }
  }

  async getFilteredActivities(params: ActivityDto | ActivityMetaDto, deployment: Deployment): Promise<ActivityV2[]> {
    const queryBuilder = this.activityRepository.createQueryBuilder('activity');

    queryBuilder.where('activity.exchangeId = :exchangeId', { exchangeId: deployment.exchangeId });

    if (params.start) {
      queryBuilder.andWhere('activity.timestamp >= :start', { start: new Date(params.start * 1000) });
    }

    if (params.end) {
      queryBuilder.andWhere('activity.timestamp <= :end', { end: new Date(params.end * 1000) });
    }

    if (params.actions) {
      const actionsArray = Array.isArray(params.actions) ? params.actions : [params.actions];
      queryBuilder.andWhere(
        new Brackets((qb) => {
          actionsArray.forEach((action, index) => {
            qb.orWhere(`activity.action LIKE :action${index}`, { [`action${index}`]: `%${action}%` });
          });
        }),
      );
    }

    if (params.ownerId) {
      queryBuilder.andWhere('(activity.creationWallet = :ownerId OR activity.currentOwner = :ownerId)', {
        ownerId: params.ownerId,
      });
    }

    if (params.strategyIds) {
      const strategyIds = params.strategyIds.split(',');
      queryBuilder.andWhere('activity."strategyId" IN (:...strategyIds)', { strategyIds });
    }

    if (params.pairs) {
      const pairs = params.pairs.split(',').map((pair) => pair.split('_'));
      queryBuilder.andWhere(
        new Brackets((qb) => {
          pairs.forEach((pair, index) => {
            qb.orWhere(
              `(LOWER(activity.quoteBuyTokenAddress) = :pair${index}0 AND LOWER(activity.baseSellTokenAddress) = :pair${index}1)`,
              { [`pair${index}0`]: pair[0].toLowerCase(), [`pair${index}1`]: pair[1].toLowerCase() },
            );
          });
        }),
      );
    }

    if (params.token0 && !params.token1) {
      queryBuilder.andWhere(
        '(LOWER(activity.quoteBuyTokenAddress) = :token0 OR LOWER(activity.baseSellTokenAddress) = :token0)',
        { token0: params.token0.toLowerCase() },
      );
    }

    if (params.token1 && !params.token0) {
      queryBuilder.andWhere(
        '(LOWER(activity.quoteBuyTokenAddress) = :token1 OR LOWER(activity.baseSellTokenAddress) = :token1)',
        { token1: params.token1.toLowerCase() },
      );
    }

    if (params.token0 && params.token1) {
      queryBuilder.andWhere(
        '(LOWER(activity.quoteBuyTokenAddress) IN (:...tokens) AND LOWER(activity.baseSellTokenAddress) IN (:...tokens))',
        { tokens: [params.token0.toLowerCase(), params.token1.toLowerCase()] },
      );
    }

    queryBuilder.orderBy('activity.timestamp', 'DESC');

    if ('limit' in params && params.limit) {
      queryBuilder.take(params.limit);
    }

    if ('offset' in params && params.offset) {
      queryBuilder.skip(params.offset);
    }

    const activities = await queryBuilder.getMany();

    // Replace any null values with 0
    return activities.map((activity) => {
      return {
        ...activity,
        sellBudget: activity.sellBudget ?? '0',
        buyBudget: activity.buyBudget ?? '0',
        sellPriceA: activity.sellPriceA ?? '0',
        sellPriceMarg: activity.sellPriceMarg ?? '0',
        sellPriceB: activity.sellPriceB ?? '0',
        buyPriceA: activity.buyPriceA ?? '0',
        buyPriceMarg: activity.buyPriceMarg ?? '0',
        buyPriceB: activity.buyPriceB ?? '0',
      };
    });
  }

  async getActivityMeta(params: ActivityMetaDto, deployment: Deployment): Promise<any> {
    const baseQueryBuilder = this.activityRepository.createQueryBuilder('activity');

    baseQueryBuilder.where('activity.exchangeId = :exchangeId', { exchangeId: deployment.exchangeId });

    if (params.start) {
      baseQueryBuilder.andWhere('activity.timestamp >= :start', { start: new Date(params.start * 1000) });
    }

    if (params.end) {
      baseQueryBuilder.andWhere('activity.timestamp <= :end', { end: new Date(params.end * 1000) });
    }

    if (params.actions) {
      const actionsArray = Array.isArray(params.actions) ? params.actions : [params.actions];
      baseQueryBuilder.andWhere(
        new Brackets((qb) => {
          actionsArray.forEach((action, index) => {
            qb.orWhere(`activity.action LIKE :action${index}`, { [`action${index}`]: `%${action}%` });
          });
        }),
      );
    }

    if (params.ownerId) {
      baseQueryBuilder.andWhere('(activity.creationWallet = :ownerId OR activity.currentOwner = :ownerId)', {
        ownerId: params.ownerId,
      });
    }

    if (params.strategyIds) {
      const strategyIds = params.strategyIds.split(',');
      baseQueryBuilder.andWhere('activity."strategyId" IN (:...strategyIds)', { strategyIds });
    }

    if (params.pairs) {
      const pairs = params.pairs.split(',').map((pair) => pair.split('_').sort());
      baseQueryBuilder.andWhere(
        new Brackets((qb) => {
          pairs.forEach((pair) => {
            qb.orWhere(
              '(LOWER(activity.quoteBuyTokenAddress) = :pair0 AND LOWER(activity.baseSellTokenAddress) = :pair1)',
              { pair0: pair[0].toLowerCase(), pair1: pair[1].toLowerCase() },
            );
          });
        }),
      );
    }

    if (params.token0 && !params.token1) {
      baseQueryBuilder.andWhere(
        '(LOWER(activity.quoteBuyTokenAddress) = :token0 OR LOWER(activity.baseSellTokenAddress) = :token0)',
        { token0: params.token0.toLowerCase() },
      );
    }

    if (params.token1 && !params.token0) {
      baseQueryBuilder.andWhere(
        '(LOWER(activity.quoteBuyTokenAddress) = :token1 OR LOWER(activity.baseSellTokenAddress) = :token1)',
        { token1: params.token1.toLowerCase() },
      );
    }

    if (params.token0 && params.token1) {
      baseQueryBuilder.andWhere(
        '(LOWER(activity.quoteBuyTokenAddress) IN (:...tokens) AND LOWER(activity.baseSellTokenAddress) IN (:...tokens))',
        { tokens: [params.token0.toLowerCase(), params.token1.toLowerCase()] },
      );
    }

    const countQuery = baseQueryBuilder.clone().getCount();

    const actionsQuery = baseQueryBuilder.clone().select('activity.action').distinct(true).getRawMany();

    const pairsQuery = baseQueryBuilder
      .clone()
      .select(['LOWER(activity.quoteBuyTokenAddress) AS quote', 'LOWER(activity.baseSellTokenAddress) AS base'])
      .groupBy('quote')
      .addGroupBy('base')
      .getRawMany();

    const strategiesQuery = baseQueryBuilder
      .clone()
      .select(['activity.strategyId', 'activity.baseSellTokenAddress', 'activity.quoteBuyTokenAddress'])
      .distinct(true)
      .getRawMany();

    // Execute queries in parallel
    const [size, actions, pairs, strategies] = await Promise.all([
      countQuery,
      actionsQuery,
      pairsQuery,
      strategiesQuery,
    ]);

    return {
      size,
      actions: actions.map((action) => action.activity_action),
      pairs: pairs.map((pair) => [pair.quote, pair.base]),
      strategies: strategies.reduce((acc, d) => {
        acc[d.activity_strategyId] = [d.activity_baseSellTokenAddress, d.activity_quoteBuyTokenAddress];
        return acc;
      }, {}),
    };
  }

  processEvents(
    createdEvents: StrategyCreatedEvent[],
    updatedEvents: StrategyUpdatedEvent[],
    deletedEvents: StrategyDeletedEvent[],
    transferEvents: VoucherTransferEvent[],
    deployment: Deployment,
    tokens: TokensByAddress,
    strategyStates: StrategyStatesMap,
  ): ActivityV2[] {
    const activities: ActivityV2[] = [];

    // Process all events in chronological order
    const allEvents = this.sortEventsByChronologicalOrder(createdEvents, updatedEvents, deletedEvents, transferEvents);

    for (const { type, event } of allEvents) {
      switch (type) {
        case 'created': {
          const createdEvent = event as StrategyCreatedEvent;
          const activity = createActivityFromEvent(createdEvent, 'create_strategy', deployment, tokens, strategyStates);
          activities.push(activity);
          strategyStates.set(createdEvent.strategyId, {
            currentOwner: createdEvent.owner,
            creationWallet: createdEvent.owner,
            order0: createdEvent.order0,
            order1: createdEvent.order1,
            token0: createdEvent.token0,
            token1: createdEvent.token1,
            lastProcessedBlock: event.block.id,
          });
          break;
        }
        case 'updated': {
          const state = strategyStates.get(event.strategyId);
          if (state) {
            const updatedEvent = event as StrategyUpdatedEvent;
            const activity = createActivityFromEvent(
              updatedEvent,
              this.determineUpdateType(updatedEvent, state),
              deployment,
              tokens,
              strategyStates,
            );
            activities.push(activity);
            state.order0 = updatedEvent.order0;
            state.order1 = updatedEvent.order1;
            state.lastProcessedBlock = event.block.id;
          }
          break;
        }
        case 'deleted': {
          const deletedEvent = event as StrategyDeletedEvent;
          const activity = createActivityFromEvent(deletedEvent, 'deleted', deployment, tokens, strategyStates);
          activities.push(activity);
          strategyStates.delete(deletedEvent.strategyId);
          break;
        }
        case 'transfer': {
          const transferEvent = event as VoucherTransferEvent;
          // Filter out events with a zero address in either the 'from' or 'to' field
          if (
            transferEvent.to.toLowerCase() === '0x0000000000000000000000000000000000000000' ||
            transferEvent.from.toLowerCase() === '0x0000000000000000000000000000000000000000'
          ) {
            break;
          }
          const state = strategyStates.get(event.strategyId);
          if (state) {
            const activity = this.createTransferActivity(transferEvent, state, deployment);
            activities.push(activity);
            state.currentOwner = transferEvent.to;
            state.lastProcessedBlock = event.block.id;
          }
          break;
        }
      }
    }

    return activities;
  }

  private sortEventsByChronologicalOrder(
    createdEvents: StrategyCreatedEvent[],
    updatedEvents: StrategyUpdatedEvent[],
    deletedEvents: StrategyDeletedEvent[],
    transferEvents: VoucherTransferEvent[],
  ) {
    return [
      ...this.mapEventsWithType('created', createdEvents),
      ...this.mapEventsWithType('updated', updatedEvents),
      ...this.mapEventsWithType('deleted', deletedEvents),
      ...this.mapEventsWithType('transfer', transferEvents),
    ].sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
      if (a.transactionIndex !== b.transactionIndex) return a.transactionIndex - b.transactionIndex;
      return a.logIndex - b.logIndex;
    });
  }

  private mapEventsWithType<T extends { block: { id: number }; transactionIndex: number; logIndex: number }>(
    type: 'created' | 'updated' | 'deleted' | 'transfer',
    events: T[],
  ) {
    return events.map((e) => ({
      type,
      event: e,
      blockNumber: e.block.id,
      transactionIndex: e.transactionIndex,
      logIndex: e.logIndex,
    }));
  }

  private determineUpdateType(event: StrategyUpdatedEvent, previousState: StrategyState): string {
    const prevOrder0 = parseOrder(previousState.order0);
    const prevOrder1 = parseOrder(previousState.order1);
    const newOrder0 = parseOrder(event.order0);
    const newOrder1 = parseOrder(event.order1);

    // Calculate raw deltas from orders
    const y0Delta = newOrder0.y.minus(prevOrder0.y);
    const y1Delta = newOrder1.y.minus(prevOrder1.y);
    const z0Delta = newOrder0.z.minus(prevOrder0.z);
    const z1Delta = newOrder1.z.minus(prevOrder1.z);
    const A0Delta = newOrder0.A.minus(prevOrder0.A);
    const A1Delta = newOrder1.A.minus(prevOrder1.A);
    const B0Delta = newOrder0.B.minus(prevOrder0.B);
    const B1Delta = newOrder1.B.minus(prevOrder1.B);

    // Define threshold for significant price changes
    const threshold = new Decimal(0);
    const significantPriceChange =
      A0Delta.abs().gt(threshold) ||
      A1Delta.abs().gt(threshold) ||
      B0Delta.abs().gt(threshold) ||
      B1Delta.abs().gt(threshold);

    // Case 0: No change at all
    if (ordersEqual(prevOrder0, newOrder0) && ordersEqual(prevOrder1, newOrder1)) {
      return 'edit_price';
    }

    // Reason as 0 corresponds to a User Update
    if (event.reason === 0) {
      // Case 1: Significant price change with deposit-like conditions:
      // Either token0 increases while token1 remains unchanged, token1 increases while token0 is unchanged,
      // or both tokens register a deposit.
      if (
        significantPriceChange &&
        ((y0Delta.gt(0) && y1Delta.eq(0)) || (y0Delta.eq(0) && y1Delta.gt(0)) || (y0Delta.gt(0) && y1Delta.gt(0)))
      ) {
        return 'edit_deposit';
      }

      // Case 2: Significant price change with withdraw-like conditions:
      // Either token0 decreases while token1 remains unchanged, token1 decreases with token0 unchanged,
      // or both tokens decrease.
      if (
        significantPriceChange &&
        ((y0Delta.lt(0) && y1Delta.eq(0)) || (y0Delta.eq(0) && y1Delta.lt(0)) || (y0Delta.lt(0) && y1Delta.lt(0)))
      ) {
        return 'edit_withdraw';
      }

      // Case 3: Significant price change and any nonzero y delta (catching opposite-sign changes)
      if (significantPriceChange && (!y0Delta.eq(0) || !y1Delta.eq(0))) {
        return 'edit_deposit_withdraw';
      }

      // Case 4: No significant price change but deposit/withdraw activities
      if (y0Delta.gt(0)) return 'deposit';
      if (y1Delta.gt(0)) return 'deposit';
      if (y0Delta.lt(0)) return 'withdraw';
      if (y1Delta.lt(0)) return 'withdraw';

      // Case 5: If all A and B are set to 0 then Strategy Paused
      if (newOrder0.A.equals(0) && newOrder0.B.equals(0) && newOrder1.A.equals(0) && newOrder1.B.equals(0)) {
        return 'strategy_paused';
      }

      // Case 6: Significant price change (with no y delta)
      if (significantPriceChange) {
        return 'edit_price';
      }

      // Case 7: Z changes (with no y delta) are equivalent to no change. Requires that the above are already handled
      if (
        (newOrder0.y.equals(0) && y0Delta.equals(0) && (z0Delta.gt(0) || z0Delta.lt(0))) || // z can only change alone, if y is 0, otherwise it concentrates the liquidity
        (newOrder1.y.equals(0) && y1Delta.equals(0) && (z1Delta.gt(0) || z1Delta.lt(0))) // z can only change alone, if y is 0, otherwise it concentrates the liquidity
      ) {
        return 'edit_price';
      }

      // Case when z0Delta is not zero or z1Delta is not zero
      if (z0Delta.gt(0) || z0Delta.lt(0) || z1Delta.gt(0) || z1Delta.lt(0)) {
        return 'edit_price';
      }

      // Fallback: if no conditions met
      return 'edit_price';
    }

    // Reason as 1 corresponds to Trade Occurred
    if (event.reason === 1) {
      // If token0 liquidity increases or token1 liquidity decreases then its sell high
      if (
        (y0Delta.gt(0) && y1Delta.lt(0)) || // common case
        (y0Delta.equals(0) && y1Delta.lt(0)) || // edge case
        (y0Delta.gt(0) && y1Delta.equals(0)) // edge case
      ) {
        return 'sell_high';
      }
      // If token0 liquidity decreases or token 1 liquidity increases then its buy low
      if (
        (y0Delta.lt(0) && y1Delta.gt(0)) || // common case
        (y0Delta.equals(0) && y1Delta.gt(0)) || // edge case
        (y0Delta.lt(0) && y1Delta.equals(0)) // edge case
      ) {
        return 'buy_low';
      }
      // Default to trade_occurred for trade events that don't match buy/sell patterns
      return 'trade_occurred';
    } else {
      // For any unknown reasons default to 'edit_price'
      return 'edit_price';
    }
  }

  private createTransferActivity(
    event: VoucherTransferEvent,
    state: StrategyState,
    deployment: Deployment,
  ): ActivityV2 {
    const activity = new ActivityV2();
    const decimals0 = new Decimal(state.token0.decimals);
    const decimals1 = new Decimal(state.token1.decimals);

    // Basic information
    activity.blockchainType = deployment.blockchainType;
    activity.exchangeId = deployment.exchangeId;
    activity.strategyId = event.strategyId;
    activity.action = 'transfer_strategy';
    activity.baseQuote = `${state.token0.symbol}/${state.token1.symbol}`;

    // Token information
    activity.baseSellToken = state.token0.symbol;
    activity.baseSellTokenAddress = state.token0.address;
    activity.quoteBuyToken = state.token1.symbol;
    activity.quoteBuyTokenAddress = state.token1.address;
    activity.token0 = state.token0;
    activity.token1 = state.token1;
    activity.order0 = state.order0;
    activity.order1 = state.order1;

    // Process orders using the updated processOrders function.
    const order0 = parseOrder(state.order0);
    const order1 = parseOrder(state.order1);
    const processedOrders = processOrders(order0, order1, decimals0, decimals1);

    // Budget information is now derived from the normalized liquidity values.
    activity.sellBudget = processedOrders.liquidity0.toString();
    activity.buyBudget = processedOrders.liquidity1.toString();

    // Price information is taken directly from the processed order prices.
    activity.sellPriceA = processedOrders.sellPriceA.toString();
    activity.sellPriceMarg = processedOrders.sellPriceMarg.toString();
    activity.sellPriceB = processedOrders.sellPriceB.toString();

    activity.buyPriceA = processedOrders.buyPriceA.toString();
    activity.buyPriceMarg = processedOrders.buyPriceMarg.toString();
    activity.buyPriceB = processedOrders.buyPriceB.toString();

    // Transfer specific information
    activity.oldOwner = event.from;
    activity.newOwner = event.to;
    activity.creationWallet = state.creationWallet;
    activity.currentOwner = event.to;

    // Transaction information
    activity.timestamp = event.timestamp;
    activity.txhash = event.transactionHash;
    activity.blockNumber = event.block.id;
    activity.transactionIndex = event.transactionIndex;
    activity.logIndex = event.logIndex;

    return activity;
  }

  private async initializeStrategyStates(
    lastProcessedBlock: number,
    deployment: Deployment,
    strategyStates: StrategyStatesMap,
  ): Promise<void> {
    strategyStates.clear();

    // Get all creation events using the all() method
    const creationEvents = await this.strategyCreatedEventService.all(deployment);
    const creationEventsByStrategyId = new Map(creationEvents.map((event) => [event.strategyId, event]));

    // Get the last events for each strategy
    const lastEvents = await this.activityRepository
      .createQueryBuilder('activity')
      .distinctOn(['activity.strategyId'])
      .leftJoinAndSelect('activity.token0', 'token0')
      .leftJoinAndSelect('activity.token1', 'token1')
      .where('activity."blockNumber" <= :lastProcessedBlock', { lastProcessedBlock })
      .andWhere('activity."blockchainType" = :blockchainType', { blockchainType: deployment.blockchainType })
      .andWhere('activity."exchangeId" = :exchangeId', { exchangeId: deployment.exchangeId })
      .andWhere('activity.action != :deletedAction', { deletedAction: 'deleted' })
      .orderBy('activity."strategyId"')
      .addOrderBy('activity."blockNumber"', 'DESC')
      .addOrderBy('activity."transactionIndex"', 'DESC')
      .addOrderBy('activity."logIndex"', 'DESC')
      .getMany();

    for (const activity of lastEvents) {
      const creationEvent = creationEventsByStrategyId.get(activity.strategyId);

      strategyStates.set(activity.strategyId, {
        currentOwner: activity.currentOwner,
        creationWallet: creationEvent.owner,
        order0: activity.order0,
        order1: activity.order1,
        token0: activity.token0,
        token1: activity.token1,
        lastProcessedBlock: activity.blockNumber,
      });
    }
  }
}
