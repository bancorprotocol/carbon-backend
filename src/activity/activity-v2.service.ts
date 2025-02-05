import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { ActivityV2 } from './activity-v2.entity';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { ActivityDto } from '../v1/activity/activity.dto';
import { ActivityMetaDto } from '../v1/activity/activity-meta.dto';
import { BlockchainType, Deployment } from '../deployment/deployment.service';
import { StrategyCreatedEvent } from '../events/strategy-created-event/strategy-created-event.entity';
import { StrategyUpdatedEvent } from '../events/strategy-updated-event/strategy-updated-event.entity';
import { StrategyDeletedEvent } from '../events/strategy-deleted-event/strategy-deleted-event.entity';
import { VoucherTransferEvent } from '../events/voucher-transfer-event/voucher-transfer-event.entity';
import { StrategyCreatedEventService } from '../events/strategy-created-event/strategy-created-event.service';
import { StrategyUpdatedEventService } from '../events/strategy-updated-event/strategy-updated-event.service';
import { StrategyDeletedEventService } from '../events/strategy-deleted-event/strategy-deleted-event.service';
import { VoucherTransferEventService } from '../events/voucher-transfer-event/voucher-transfer-event.service';
import { StrategyState, StrategyStatesMap } from './activity.types';
import { createActivityFromEvent, parseOrder, processOrders } from './activity.utils';
import { TokensByAddress } from '../token/token.service';
import { Decimal } from 'decimal.js';
import { Activity } from './activity.entity';

@Injectable()
export class ActivityV2Service {
  private readonly BATCH_SIZE = 300000; // Number of blocks per batch
  private readonly SAVE_BATCH_SIZE = 1000; // Number of activities to save at once
  strategyStates: StrategyStatesMap = new Map<string, StrategyState>();

  constructor(
    @InjectRepository(ActivityV2)
    private activityRepository: Repository<ActivityV2>,
    @InjectRepository(Activity)
    private oldActivityRepository: Repository<Activity>,
    private strategyCreatedEventService: StrategyCreatedEventService,
    private strategyUpdatedEventService: StrategyUpdatedEventService,
    private strategyDeletedEventService: StrategyDeletedEventService,
    private voucherTransferEventService: VoucherTransferEventService,
    private lastProcessedBlockService: LastProcessedBlockService,
  ) {}

  async update(endBlock: number, deployment: Deployment, tokens: TokensByAddress): Promise<void> {
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

    await this.initializeStrategyStates(lastProcessedBlock, deployment);

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

    return queryBuilder.getMany();
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
  ): ActivityV2[] {
    const activities: ActivityV2[] = [];

    // Process all events in chronological order
    const allEvents = this.sortEventsByChronologicalOrder(createdEvents, updatedEvents, deletedEvents, transferEvents);

    for (const { type, event } of allEvents) {
      switch (type) {
        case 'created': {
          const createdEvent = event as StrategyCreatedEvent;
          const activity = createActivityFromEvent(
            createdEvent,
            'create_strategy',
            deployment,
            tokens,
            this.strategyStates,
          );
          activities.push(activity);
          this.strategyStates.set(createdEvent.strategyId, {
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
          const state = this.strategyStates.get(event.strategyId);
          if (state) {
            const updatedEvent = event as StrategyUpdatedEvent;
            const activity = createActivityFromEvent(
              updatedEvent,
              this.determineUpdateType(updatedEvent, state),
              deployment,
              tokens,
              this.strategyStates,
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
          const activity = createActivityFromEvent(deletedEvent, 'deleted', deployment, tokens, this.strategyStates);
          activities.push(activity);
          this.strategyStates.delete(deletedEvent.strategyId);
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
          const state = this.strategyStates.get(event.strategyId);
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

      // Case 4: Significant price change (with no y delta)
      if (significantPriceChange) {
        return 'edit_price';
      }

      // Case 5: No significant price change but deposit/withdraw activities
      if (y0Delta.gt(0)) return 'deposit';
      if (y1Delta.gt(0)) return 'deposit';
      if (y0Delta.lt(0)) return 'withdraw';
      if (y1Delta.lt(0)) return 'withdraw';

      // Case 0: If all A and B are set to 0 then Strategy Paused
      if (newOrder0.A.equals(0) && 
          newOrder0.B.equals(0) && 
          newOrder1.A.equals(0) && 
          newOrder1.B.equals(0)
        ) {
        return 'strategy_paused';
      }
      
      // Fallback: if no conditions met
      return 'edit_price';
    } 

      // Reason as 1 corresponds to Trade Occurred
    if (event.reason === 1) {

      // If token0 liquidity increases or token1 liquidity decreases then its sell high
      if (
        (y0Delta.gt(0) && y1Delta.lt(0)) ||     // common case
        (y0Delta.equals(0) && y1Delta.lt(0)) || // edge case
        (y0Delta.gt(0) && y1Delta.equals(0))    // edge case
      ) {
        return 'sell_high'
      }
      // If token0 liquidity decreases or token 1 liquidity increases then its buy low
      if (
        (y0Delta.lt(0) && y1Delta.gt(0)) ||     // common case
        (y0Delta.equals(0) && y1Delta.gt(0)) || // edge case
        (y0Delta.lt(0) && y1Delta.equals(0))    // edge case
      ) {
        return 'buy_low'
      }
    }

    else {
      // For non-zero reasons default to 'edit_price'.
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

  private async initializeStrategyStates(lastProcessedBlock: number, deployment: Deployment): Promise<void> {
    this.strategyStates.clear();

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

      this.strategyStates.set(activity.strategyId, {
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

  async getEthereumActivityDifferencesDetailed() {
    // Fetch all Ethereum activities from both tables
    const [oldActivities, v2Activities] = await Promise.all([
      this.oldActivityRepository.find({ where: { blockchainType: BlockchainType.Ethereum } }),
      this.activityRepository.find({ where: { blockchainType: BlockchainType.Ethereum } }),
    ]);

    // Create maps for easier lookup
    const v2ActivitiesByKey = new Map<string, ActivityV2>();
    v2Activities.forEach((act) => {
      v2ActivitiesByKey.set(this.getCompositeKey(act), act);
    });

    // Compare activities and collect differences
    const differences = [];

    for (const oldActivity of oldActivities) {
      const key = this.getCompositeKey(oldActivity);
      const v2Activity = v2ActivitiesByKey.get(key);

      if (!v2Activity) {
        // Activity is missing entirely from v2
        differences.push({
          ...oldActivity,
          differences: [
            {
              field: 'entire_record',
              oldValue: {
                blockNumber: oldActivity.blockNumber,
                txhash: oldActivity.txhash,
                timestamp: oldActivity.timestamp,
              },
              newValue: null,
              status: 'missing',
            },
          ],
        });
        continue;
      }

      // Only check for differences in action
      if (oldActivity.action !== v2Activity.action) {
        differences.push({
          ...oldActivity,
          differences: [
            {
              field: 'action',
              oldValue: oldActivity.action,
              newValue: v2Activity.action,
              status: 'different',
            },
          ],
        });
      }
    }

    // Build summary report
    const reportLines: string[] = [];
    reportLines.push(`Total records with differences: ${differences.length}`);

    return {
      differences,
      report: reportLines.join('\n'),
    };
  }

  private getCompositeKey(activity: Partial<Activity | ActivityV2>): string {
    const blockNumber = activity.blockNumber ? String(activity.blockNumber) : '';
    const strategyId = activity.strategyId;
    const txhash = (activity.txhash || '').toLowerCase();
    const timestamp = activity.timestamp ? activity.timestamp.getTime().toString() : '';
    return [blockNumber, strategyId, txhash, timestamp].join('|');
  }

  private getActivityQuery(batchStart: number, batchEnd: number, deployment: Deployment): string {
    return `WITH selector_created AS (
        SELECT
          "strategyId",
          "blockId",
          "logIndex",
          'created' AS current_state
        FROM
          "strategy-created-events"
        WHERE
          "blockchainType" = '${deployment.blockchainType}'
          AND "exchangeId" = '${deployment.exchangeId}'
      ),
      selector_strategyupdated AS (
        SELECT DISTINCT ON ("strategyId")
          "strategyId",
          "blockId",
          "logIndex",
          'updated' AS current_state
        FROM
          "strategy-updated-events"
        WHERE
          "blockchainType" = '${deployment.blockchainType}'
          AND "exchangeId" = '${deployment.exchangeId}'
        ORDER BY
          "strategyId", "blockId" DESC, "logIndex" DESC
      ),
      selector_deleted AS (
        SELECT DISTINCT ON ("strategyId")
          "strategyId",
          "blockId",
          "logIndex",
          'deleted' AS current_state
        FROM
          "strategy-deleted-events"
        WHERE
          "blockchainType" = '${deployment.blockchainType}'
          AND "exchangeId" = '${deployment.exchangeId}'
        ORDER BY
          "strategyId", "blockId" DESC, "logIndex" DESC
      ),
      all_states AS (
        SELECT
          *
        FROM
          selector_created
        UNION
        ALL
        SELECT
          *
        FROM
          selector_strategyupdated
        UNION
        ALL
        SELECT
          *
        FROM
          selector_deleted
      ),
      all_states_marked AS (
        SELECT DISTINCT ON ("strategyId")
          *,
          'latest' AS mark
        FROM
          all_states
        ORDER BY
          "strategyId", "blockId" DESC, "logIndex" DESC
      ),
      recently_updated_strategies AS ( 
        SELECT
          *
        FROM
          all_states_marked
        WHERE
          "blockId" > ${batchStart}
      ),
      -- For each strategy that needs updating we can get the prior state AND insert that into the original flow
      prior_strategyupdated AS (
        SELECT DISTINCT ON ("strategyId")
          *
        FROM
          "strategy-updated-events"
        WHERE
          "blockId" < ${batchStart}
          AND "blockchainType" = '${deployment.blockchainType}'
          AND "exchangeId" = '${deployment.exchangeId}'
        ORDER BY
          "strategyId", "blockId" DESC, "logIndex" DESC
      ),
      updated_insert AS (
        SELECT
          1 AS sorting_order,
          timestamp AS evt_block_time,
          "blockId" AS evt_block_number,
          s."strategyId" AS id,
          order0,
          order1,
          t0.address AS token0,
          t0.symbol AS symbol0,
          t0.decimals AS decimals0,
          t1.address AS token1,
          t1.symbol AS symbol1,
          t1.decimals AS decimals1,
          reason,
          s."transactionHash" AS txhash,
          TRUE AS deleteme
        FROM
          prior_strategyupdated s
          LEFT JOIN tokens t0 ON t0.id = s."token0Id"
          LEFT JOIN tokens t1 ON t1.id = s."token1Id"
        WHERE
          "strategyId" IN (
            SELECT
              "strategyId"
            FROM
              recently_updated_strategies
          )
      ),
      created_insert AS (
        SELECT
          0 AS sorting_order,
          timestamp AS evt_block_time,
          "blockId" AS evt_block_number,
          s."strategyId" AS id,
          order0,
          order1,
          t0.address AS token0,
          t0.symbol AS symbol0,
          t0.decimals AS decimals0,
          t1.address AS token1,
          t1.symbol AS symbol1,
          t1.decimals AS decimals1,
          2 AS reason,
          s."transactionHash" AS txhash,
          TRUE AS deleteme
        FROM
          "strategy-created-events" s
          LEFT JOIN tokens t0 ON t0.id = s."token0Id"
          LEFT JOIN tokens t1 ON t1.id = s."token1Id"
        WHERE
          s."strategyId" NOT IN (
            SELECT
              "strategyId"
            FROM
              "strategy-updated-events"
            WHERE
              "blockId" < ${batchStart}
              AND "blockchainType" = '${deployment.blockchainType}'
              AND "exchangeId" = '${deployment.exchangeId}'
          )
          AND s."blockchainType" = '${deployment.blockchainType}'
          AND s."exchangeId" = '${deployment.exchangeId}'
      ),
      -- ORIGINAL QUERY STARTS HERE
      created AS (
        SELECT
          0 AS sorting_order,
          timestamp AS evt_block_time,
          "blockId" AS evt_block_number,
          s."strategyId" AS id,
          order0,
          order1,
          t0.address AS token0,
          t0.symbol AS symbol0,
          t0.decimals AS decimals0,
          t1.address AS token1,
          t1.symbol AS symbol1,
          t1.decimals AS decimals1,
          2 AS reason,
          s."transactionHash" AS txhash,
          FALSE AS deleteme
        FROM
          "strategy-created-events" s
          LEFT JOIN tokens t0 ON t0.id = s."token0Id"
          LEFT JOIN tokens t1 ON t1.id = s."token1Id"
        WHERE
          "blockId" >= ${batchStart}
          AND
          "blockId" < ${batchEnd}
          AND s."blockchainType" = '${deployment.blockchainType}'
          AND s."exchangeId" = '${deployment.exchangeId}'
      ),
      updated AS (
        SELECT
          s."logIndex"+2 AS sorting_order,
          timestamp AS evt_block_time,
          "blockId" AS evt_block_number,
          s."strategyId" AS id,
          order0,
          order1,
          t0.address AS token0,
          t0.symbol AS symbol0,
          t0.decimals AS decimals0,
          t1.address AS token1,
          t1.symbol AS symbol1,
          t1.decimals AS decimals1,
          reason,
          s."transactionHash" AS txhash,
          FALSE AS deleteme
        FROM
          "strategy-updated-events" s
          LEFT JOIN tokens t0 ON t0.id = s."token0Id"
          LEFT JOIN tokens t1 ON t1.id = s."token1Id"
        WHERE
          "blockId" >= ${batchStart}
          AND
          "blockId" < ${batchEnd}
          AND s."blockchainType" = '${deployment.blockchainType}'
          AND s."exchangeId" = '${deployment.exchangeId}'
      ),
      deleted AS (
        SELECT
          999999999 AS sorting_order,
          timestamp AS evt_block_time,
          "blockId" AS evt_block_number,
          s."strategyId" AS id,
          order0,
          order1,
          t0.address AS token0,
          t0.symbol AS symbol0,
          t0.decimals AS decimals0,
          t1.address AS token1,
          t1.symbol AS symbol1,
          t1.decimals AS decimals1,
          4 AS reason,
          s."transactionHash" AS txhash,
          FALSE AS deleteme
        FROM
          "strategy-deleted-events" s
          LEFT JOIN tokens t0 ON t0.id = s."token0Id"
          LEFT JOIN tokens t1 ON t1.id = s."token1Id"
        WHERE
          "blockId" >= ${batchStart}
          AND
          "blockId" < ${batchEnd}
          AND s."blockchainType" = '${deployment.blockchainType}'
          AND s."exchangeId" = '${deployment.exchangeId}'
      ),
      all_txs AS (
        SELECT
          *
        FROM
          created
        UNION
        ALL
        SELECT
          *
        FROM
          created_insert
        UNION
        ALL
        SELECT
          *
        FROM
          updated_insert
        UNION
        ALL
        SELECT
          *
        FROM
          updated
        UNION
        ALL
        SELECT
          *
        FROM
          deleted
      ),
      --- ADD A FILTER THAT TAKES OUT ANY DUPLICATE txhash THAT IS FLAGGED FOR DELETION
      -- THIS PREVENTS MISCALCS DURING LAG()

      filtered_txs AS (
          SELECT DISTINCT ON (id, txhash, sorting_order) *
          FROM all_txs
          ORDER BY id, txhash, sorting_order, deleteme ASC
      ),
      ---------
      current_orders3 AS (
        SELECT
          *,
          (
            CASE
              WHEN (order0 :: json ->> 'y') IS NOT NULL THEN (order0 :: json ->> 'y') :: DOUBLE PRECISION
              ELSE 0
            END
          ) AS y0,
          (
            CASE
              WHEN (order1 :: json ->> 'y') IS NOT NULL THEN (order1 :: json ->> 'y') :: DOUBLE PRECISION
              ELSE 0
            END
          ) AS y1,
          (
            CASE
              WHEN (order0 :: json ->> 'z') IS NOT NULL THEN (order0 :: json ->> 'z') :: DOUBLE PRECISION
              ELSE 0
            END
          ) AS z0,
          (
            CASE
              WHEN (order1 :: json ->> 'z') IS NOT NULL THEN (order1 :: json ->> 'z') :: DOUBLE PRECISION
              ELSE 0
            END
          ) AS z1,
          (
            CASE
              WHEN (order0 :: json ->> 'A') IS NOT NULL THEN (order0 :: json ->> 'A') :: BIGINT
              ELSE 0
            END
          ) AS A0,
          (
            CASE
              WHEN (order1 :: json ->> 'A') IS NOT NULL THEN (order1 :: json ->> 'A') :: BIGINT
              ELSE 0
            END
          ) AS A1,
          (
            CASE
              WHEN (order0 :: json ->> 'B') IS NOT NULL THEN (order0 :: json ->> 'B') :: BIGINT
              ELSE 0
            END
          ) AS B0,
          (
            CASE
              WHEN (order1 :: json ->> 'B') IS NOT NULL THEN (order1 :: json ->> 'B') :: BIGINT
              ELSE 0
            END
          ) AS B1
        FROM
          filtered_txs
      ),
      deletions_zero AS (
        SELECT
          sorting_order,
          deleteme,
          evt_block_time,
          evt_block_number,
          id,
          token0,
          token1,
          reason,
          symbol0,
          decimals0,
          symbol1,
          decimals1,
          txhash,
          CASE
            WHEN reason = 4 THEN 0
            ELSE y0
          END AS y0,
          CASE
            WHEN reason = 4 THEN 0
            ELSE y1
          END AS y1,
          z0,
          z1,
          A0,
          A1,
          B0,
          B1
        FROM
          current_orders3
      ),
      current_orders4 AS (
        SELECT
          c.sorting_order,
          c.deleteme,
          c.evt_block_time,
          c.evt_block_number,
          sce.owner AS creation_wallet,
          c.id,
          c.token0,
          c.token1,
          c.reason,
          c.y0,
          c.y1,
          c.symbol0,
          c.decimals0,
          c.symbol1,
          c.decimals1,
          y0 / POW(10, decimals0) AS liquidity0,
          y1 / POW(10, decimals1) AS liquidity1,
          z0 / POW(10, decimals0) AS capacity0,
          z1 / POW(10, decimals1) AS capacity1,
          (
            B0 % POW(2, 48) :: BIGINT * POW(2, FLOOR(B0 / POW(2, 48)))
          ) AS B0_real,
          (
            B1 % POW(2, 48) :: BIGINT * POW(2, FLOOR(B1 / POW(2, 48)))
          ) AS B1_real,
          (
            A0 % POW(2, 48) :: BIGINT * POW(2, FLOOR(A0 / POW(2, 48)))
          ) AS A0_real,
          (
            A1 % POW(2, 48) :: BIGINT * POW(2, FLOOR(A1 / POW(2, 48)))
          ) AS A1_real,
          COALESCE(
            (
              B0 - LAG(B0, 1) OVER (
                PARTITION BY c.id
                ORDER BY
                  evt_block_number, sorting_order
              )
            ),
            0
          ) AS B0_delta,
          COALESCE(
            (
              B1 - LAG(B1, 1) OVER (
                PARTITION BY c.id
                ORDER BY
                  evt_block_number, sorting_order
              )
            ),
            0
          ) AS B1_delta,
          COALESCE(
            (
              A0 - LAG(A0, 1) OVER (
                PARTITION BY c.id
                ORDER BY
                  evt_block_number, sorting_order
              )
            ),
            0
          ) AS A0_delta,
          COALESCE(
            (
              A1 - LAG(A1, 1) OVER (
                PARTITION BY c.id
                ORDER BY
                  evt_block_number, sorting_order
              )
            ),
            0
          ) AS A1_delta,
          txhash
        FROM
          deletions_zero c
          LEFT JOIN "strategy-created-events" sce ON sce."strategyId" = c.id
          WHERE sce."blockchainType" = '${deployment.blockchainType}'
          AND sce."exchangeId" = '${deployment.exchangeId}'    
      ),
      order_lifespan AS (
        SELECT
          *,
          COALESCE(
            (
              y0 - LAG(y0, 1) OVER (
                PARTITION BY id
                ORDER BY
                  evt_block_number, sorting_order
              )
            ) / POW(10, decimals0),
            0
          ) AS y0_delta,
          COALESCE(
            (
              y1 - LAG(y1, 1) OVER (
                PARTITION BY id
                ORDER BY
                  evt_block_number, sorting_order
              )
            ) / POW(10, decimals1),
            0
          ) AS y1_delta,
          POW((B0_real) / POW(2, 48) :: BIGINT, 2) * POW(10, (decimals1 - decimals0)) AS lowestRate0,
          CASE
            WHEN liquidity0 = capacity0 THEN POW((B0_real + A0_real) / POW(2, 48) :: BIGINT, 2) * POW(10, (decimals1 - decimals0))
            ELSE POW(
              (B0_real + A0_real * liquidity0 / capacity0) / POW(2, 48) :: BIGINT,
              2
            ) * POW(10, (decimals1 - decimals0))
          END AS marginalRate0,
          POW((B0_real + A0_real) / POW(2, 48) :: BIGINT, 2) * POW(10, (decimals1 - decimals0)) AS highestRate0,
          POW((B1_real) / POW(2, 48) :: BIGINT, 2) * POW(10, (decimals0 - decimals1)) AS lowestRate1,
          CASE
            WHEN liquidity1 = capacity1 THEN POW((B1_real + A1_real) / POW(2, 48) :: BIGINT, 2) * POW(10, (decimals0 - decimals1))
            ELSE POW(
              (B1_real + A1_real * liquidity1 / capacity1) / POW(2, 48) :: BIGINT,
              2
            ) * POW(10, (decimals0 - decimals1))
          END AS marginalRate1,
          POW((B1_real + A1_real) / POW(2, 48) :: BIGINT, 2) * POW(10, (decimals0 - decimals1)) AS highestRate1
        FROM
          current_orders4
      ),
      dep_with AS (
        SELECT
          *,
          CASE
            WHEN reason = 2 THEN liquidity0
            ELSE 0
          END + CASE
            WHEN (
              reason = 0
              AND y0_delta > 0
            ) THEN y0_delta
            ELSE 0
          END AS y0_deposited,
          CASE
            WHEN reason = 2 THEN liquidity1
            ELSE 0
          END + CASE
            WHEN (
              reason = 0
              AND y1_delta > 0
            ) THEN y1_delta
            ELSE 0
          END AS y1_deposited,
          CASE
            WHEN reason = 4 THEN - liquidity0
            ELSE 0
          END + CASE
            WHEN (
              reason = 0
              AND y0_delta < 0
            ) THEN y0_delta
            ELSE 0
          END AS y0_withdrawn,
          CASE
            WHEN reason = 4 THEN - liquidity1
            ELSE 0
          END + CASE
            WHEN (
              reason = 0
              AND y1_delta < 0
            ) THEN y1_delta
            ELSE 0
          END AS y1_withdrawn,
          CAST(symbol0 AS VARCHAR) || '/' || CAST(symbol1 AS VARCHAR) AS base_quote,
          CASE
            WHEN highestRate0 = 0 THEN 0
            ELSE 1 / highestRate0
          END AS lowestRate0_norm,
          CASE
            WHEN marginalRate0 = 0 THEN 0
            ELSE 1 / marginalRate0
          END AS marginalRate0_norm,
          CASE
            WHEN lowestRate0 = 0 THEN 0
            ELSE 1 / lowestRate0
          END AS highestRate0_norm,
          lowestRate1 AS lowestRate1_norm,
          marginalRate1 AS marginalRate1_norm,
          highestRate1 AS highestRate1_norm
        FROM
          order_lifespan
      ),
      add_price_delta AS (
        SELECT
          *,
          COALESCE(
            (
              lowestRate0_norm - LAG(lowestRate0_norm, 1) OVER (
                PARTITION BY id
                ORDER BY
                  evt_block_number, sorting_order
              )
            ),
            0
          ) AS lowestRate0_norm_delta,
          COALESCE(
            (
              marginalRate0_norm - LAG(marginalRate0_norm, 1) OVER (
                PARTITION BY id
                ORDER BY
                  evt_block_number, sorting_order
              )
            ),
            0
          ) AS marginalRate0_norm_delta,
          COALESCE(
            (
              highestRate0_norm - LAG(highestRate0_norm, 1) OVER (
                PARTITION BY id
                ORDER BY
                  evt_block_number, sorting_order
              )
            ),
            0
          ) AS highestRate0_norm_delta,
          COALESCE(
            (
              lowestRate1_norm - LAG(lowestRate1_norm, 1) OVER (
                PARTITION BY id
                ORDER BY
                  evt_block_number, sorting_order
              )
            ),
            0
          ) AS lowestRate1_norm_delta,
          COALESCE(
            (
              marginalRate1_norm - LAG(marginalRate1_norm, 1) OVER (
                PARTITION BY id
                ORDER BY
                  evt_block_number, sorting_order
              )
            ),
            0
          ) AS marginalRate1_norm_delta,
          COALESCE(
            (
              highestRate1_norm - LAG(highestRate1_norm, 1) OVER (
                PARTITION BY id
                ORDER BY
                  evt_block_number, sorting_order
              )
            ),
            0
          ) AS highestRate1_norm_delta
        FROM
          dep_with
      ),
      descriptions AS (
        SELECT
          *,
          CASE
            WHEN reason = 2 THEN 'Created'
            WHEN reason = 0
            AND (
              ABS(B0_delta) > 1
              OR ABS(B1_delta) > 1
              OR ABS(A0_delta) > 1
              OR ABS(A1_delta) > 1
            )
            AND (
              (
                y0_delta > 0
                AND y1_delta = 0
              )
              OR (
                y0_delta = 0
                AND y1_delta > 0
              )
              OR (
                y0_delta > 0
                AND y1_delta > 0
              )
            ) THEN 'edit_deposit'
            WHEN reason = 0
            AND (
              ABS(B0_delta) > 1
              OR ABS(B1_delta) > 1
              OR ABS(A0_delta) > 1
              OR ABS(A1_delta) > 1
            )
            AND (
              (
                y0_delta < 0
                AND y1_delta = 0
              )
              OR (
                y0_delta = 0
                AND y1_delta < 0
              )
              OR (
                y0_delta < 0
                AND y1_delta < 0
              )
            ) THEN 'edit_withdraw'
            WHEN reason = 0
            AND (
              ABS(B0_delta) > 1
              OR ABS(B1_delta) > 1
              OR ABS(A0_delta) > 1
              OR ABS(A1_delta) > 1
            )
            AND (
              y0_delta != 0
              OR y1_delta != 0
            ) THEN 'edit_deposit_withdraw'
            WHEN reason = 0
            AND (
              ABS(B0_delta) > 1
              OR ABS(B1_delta) > 1
              OR ABS(A0_delta) > 1
              OR ABS(A1_delta) > 1
            ) THEN 'Updated Price'
            WHEN reason = 0
            AND y0_delta > 0 THEN 'Deposited TKN0'
            WHEN reason = 0
            AND y1_delta > 0 THEN 'Deposited TKN1'
            WHEN reason = 0
            AND y0_delta < 0 THEN 'Withdrew TKN0'
            WHEN reason = 0
            AND y1_delta < 0 THEN 'Withdrew TKN1'
            WHEN reason = 1 THEN 'Trade Occurred'
            WHEN reason = 4 THEN 'deleted'
            ELSE 'edit_price'
          END AS descr
        FROM
          add_price_delta
      ),
      all_trades AS (
        SELECT
          sorting_order,
          evt_block_number,
          deleteme,
          id,
          CASE
            WHEN (
              y0_delta < 0
              AND y1_delta >= 0
            )
            OR (
              y0_delta = 0
              AND y1_delta > 0
            ) THEN - y0_delta
            ELSE - y1_delta
          END AS strategy_sold,
          CASE
            WHEN (
              y0_delta < 0
              AND y1_delta >= 0
            )
            OR (
              y0_delta = 0
              AND y1_delta > 0
            ) THEN symbol0
            ELSE symbol1
          END AS token_sold,
          CASE
            WHEN (
              y0_delta > 0
              AND y1_delta <= 0
            )
            OR (
              y0_delta = 0
              AND y1_delta < 0
            ) THEN y0_delta
            ELSE y1_delta
          END AS strategy_bought,
          CASE
            WHEN (
              y0_delta > 0
              AND y1_delta <= 0
            )
            OR (
              y0_delta = 0
              AND y1_delta < 0
            ) THEN symbol0
            ELSE symbol1
          END AS token_bought,
          txhash
        FROM
          order_lifespan
        WHERE
          reason = 1
      ),
      trade_info AS (
        SELECT
          d.*,
          a.strategy_sold,
          a.token_sold,
          a.strategy_bought,
          a.token_bought,
          CASE
            WHEN a.strategy_sold = 0 THEN 0
            ELSE a.strategy_bought / a.strategy_sold
          END AS effective_price,
          a.token_sold || '/' || a.token_bought AS trade_base_quote,
          CASE
            WHEN a.strategy_bought = 0 THEN 0
            ELSE a.strategy_sold / a.strategy_bought
          END AS effective_price_inv,
          a.token_bought || '/' || a.token_sold AS inv_trade_base_quote
        FROM
          descriptions d
          LEFT JOIN all_trades a ON a.txhash = d.txhash
          AND a.id = d.id
          AND a.sorting_order = d.sorting_order
          AND a.evt_block_number = d.evt_block_number
      ),
      voucher_transfers AS (
        SELECT
          *
        FROM
          "voucher-transfer-events" s
        WHERE
          s."from" != '0x0000000000000000000000000000000000000000'
          AND s."to" != '0x0000000000000000000000000000000000000000'
          AND s."blockchainType" = '${deployment.blockchainType}'
          AND s."exchangeId" = '${deployment.exchangeId}'
      ),
      most_recent_transfer AS (
        SELECT DISTINCT ON ("strategyId")
          *
        FROM
          voucher_transfers
        ORDER BY
          "strategyId", "blockId" DESC
      ),
      voucher_minimal AS (
        SELECT
          "strategyId" AS id,
          'transfer_strategy' AS action,
          "from" AS old_owner,
          "to" AS new_owner,
          timestamp AS date,
          "transactionHash" AS txhash,
          "blockId" AS block_number
        FROM
          voucher_transfers
      ),
      complete_info AS (
        SELECT
          ti.*,
          CASE
            WHEN base_quote = trade_base_quote THEN effective_price
            ELSE effective_price_inv
          END AS avg_price,
          CASE
            WHEN descr = 'Trade Occurred'
            AND token_sold = symbol0 THEN 'sell_high'
            WHEN descr = 'Trade Occurred'
            AND token_sold != symbol0 THEN 'buy_low'
            WHEN descr = 'Created' THEN 'create_strategy'
            WHEN descr = 'Deposited TKN0' THEN 'deposit'
            WHEN descr = 'Deposited TKN1' THEN 'deposit'
            WHEN descr = 'Withdrew TKN0' THEN 'withdraw'
            WHEN descr = 'Withdrew TKN1' THEN 'withdraw'
            WHEN descr = 'Updated Price'
            AND NOT (
              lowestRate0_norm != 0
              OR highestRate0_norm != 0
              OR lowestRate1_norm != 0
              OR highestRate1_norm != 0
            ) THEN 'strategy_paused'
            WHEN descr = 'Updated Price' THEN 'edit_price'
            ELSE descr
          END AS action,
          CASE
            WHEN mrt."strategyId" IS NOT NULL THEN mrt."to"
            ELSE ti.creation_wallet
          END AS current_owner
        FROM
          trade_info ti
          LEFT JOIN most_recent_transfer mrt ON ti.id = mrt."strategyId"
      ),
      complete_renamed AS (
        SELECT
          sorting_order,
          deleteme,
          evt_block_number AS block_number,
          creation_wallet,
          current_owner,
          id,
          action,
          base_quote,
          token0 AS base_sell_token_address,
          symbol0 AS base_sell_token,
          token1 AS quote_buy_token_address,
          symbol1 AS quote_buy_token,
          liquidity1 AS buy_budget,
          liquidity0 AS sell_budget,
          y1_delta AS buy_budget_change,
          y0_delta AS sell_budget_change,
          lowestrate1_norm AS buy_price_a,
          marginalRate1_norm AS buy_price_marg,
          highestrate1_norm AS buy_price_b,
          lowestrate0_norm AS sell_price_a,
          marginalRate0_norm AS sell_price_marg,
          highestrate0_norm AS sell_price_b,
          lowestrate1_norm_delta AS buy_price_a_delta,
          marginalRate1_norm_delta AS buy_price_marg_delta,
          highestrate1_norm_delta AS buy_price_b_delta,
          lowestrate0_norm_delta AS sell_price_a_delta,
          marginalRate0_norm_delta AS sell_price_marg_delta,
          highestrate0_norm_delta AS sell_price_b_delta,
          strategy_sold,
          token_sold,
          strategy_bought,
          token_bought,
          avg_price,
          date,
          txhash
        FROM
          complete_info
      ),
      prior_action AS (
        SELECT DISTINCT ON (vm.id)
          ci.*
        FROM
          voucher_minimal vm
        LEFT JOIN
          complete_renamed ci
        ON
          ci.id = vm.id
          AND ci.block_number <= vm.block_number
        ORDER BY
          vm.id, ci.block_number DESC, ci.deleteme ASC
      ),
      transfer_action AS (
        SELECT
          sorting_order,
          deleteme,
          creation_wallet,
          current_owner,
          vm.id,
          vm.action,
          base_quote,
          base_sell_token,
          base_sell_token_address,
          quote_buy_token,
          quote_buy_token_address,
          buy_budget,
          sell_budget,
          NULL :: DOUBLE PRECISION AS buy_budget_change,
          NULL :: DOUBLE PRECISION AS sell_budget_change,
          buy_price_a,
          buy_price_marg,
          buy_price_b,
          sell_price_a,
          sell_price_marg,
          sell_price_b,
          buy_price_a_delta,
          buy_price_marg_delta,
          buy_price_b_delta,
          sell_price_a_delta,
          sell_price_marg_delta,
          sell_price_b_delta,
          NULL :: DOUBLE PRECISION AS strategy_sold,
          NULL AS token_sold,
          NULL :: DOUBLE PRECISION AS strategy_bought,
          NULL AS token_bought,
          NULL :: DOUBLE PRECISION AS avg_price,
          vm.date,
          vm.txhash,
          vm.old_owner,
          vm.new_owner,
          vm.block_number
        FROM
          voucher_minimal vm
          LEFT JOIN prior_action pa ON pa.id = vm.id
      ),
      complete_actions AS (
        SELECT
          sorting_order,
          deleteme,
          creation_wallet,
          current_owner,
          NULL AS old_owner,
          NULL AS new_owner,
          id,
          action,
          base_quote,
          base_sell_token,
          base_sell_token_address,
          quote_buy_token,
          quote_buy_token_address,
          buy_budget,
          sell_budget,
          buy_budget_change,
          sell_budget_change,
          buy_price_a,
          buy_price_marg,
          buy_price_b,
          sell_price_a,
          sell_price_marg,
          sell_price_b,
          buy_price_a_delta,
          buy_price_marg_delta,
          buy_price_b_delta,
          sell_price_a_delta,
          sell_price_marg_delta,
          sell_price_b_delta,
          strategy_sold,
          token_sold,
          strategy_bought,
          token_bought,
          avg_price,
          date,
          txhash,
          block_number
        FROM
          complete_renamed
        UNION
        ALL
        SELECT
          sorting_order,
          deleteme,
          creation_wallet,
          current_owner,
          old_owner,
          new_owner,
          id,
          action,
          base_quote,
          base_sell_token,
          base_sell_token_address,
          quote_buy_token,
          quote_buy_token_address,
          buy_budget,
          sell_budget,
          buy_budget_change,
          sell_budget_change,
          buy_price_a,
          buy_price_marg,
          buy_price_b,
          sell_price_a,
          sell_price_marg,
          sell_price_b,
          buy_price_a_delta,
          buy_price_marg_delta,
          buy_price_b_delta,
          sell_price_a_delta,
          sell_price_marg_delta,
          sell_price_b_delta,
          strategy_sold,
          token_sold,
          strategy_bought,
          token_bought,
          avg_price,
          date,
          txhash,
          block_number
        FROM
          transfer_action
      )
      SELECT
        creation_wallet,
        current_owner,
        old_owner,
        new_owner,
        id,
        action,
        base_quote,
        base_sell_token,
        base_sell_token_address,
        quote_buy_token,
        quote_buy_token_address,
        buy_budget,
        sell_budget,
        buy_budget_change,
        sell_budget_change,
        buy_price_a,
        buy_price_marg,
        buy_price_b,
        sell_price_a,
        sell_price_marg,
        sell_price_b,
        buy_price_a_delta,
        buy_price_marg_delta,
        buy_price_b_delta,
        sell_price_a_delta,
        sell_price_marg_delta,
        sell_price_b_delta,
        strategy_sold,
        token_sold,
        strategy_bought,
        token_bought,
        avg_price,
        date,
        txhash,
        block_number
      FROM
        complete_actions
      WHERE
        deleteme IS FALSE
      ORDER BY
        block_number,
        sorting_order,
        id;
  `;
  }
}
