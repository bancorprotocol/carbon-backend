import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Decimal } from 'decimal.js';
import { ActivityV2 } from '../activity/activity-v2.entity';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { Deployment, DeploymentService } from '../deployment/deployment.service';
import { TokensByAddress } from '../token/token.service';
import { BlockService } from '../block/block.service';
import { GradientStrategyCreatedEventService } from './events/gradient-strategy-created-event.service';
import { GradientStrategyUpdatedEventService } from './events/gradient-strategy-updated-event.service';
import { GradientStrategyDeletedEventService } from './events/gradient-strategy-deleted-event.service';
import { GradientStrategyLiquidityUpdatedEventService } from './events/gradient-strategy-liquidity-updated-event.service';
import { GradientStrategyCreatedEvent } from './events/gradient-strategy-created-event.entity';
import { GradientStrategyUpdatedEvent } from './events/gradient-strategy-updated-event.entity';
import { GradientStrategyDeletedEvent } from './events/gradient-strategy-deleted-event.entity';
import { GradientStrategyLiquidityUpdatedEvent } from './events/gradient-strategy-liquidity-updated-event.entity';

interface GradientStrategyState {
  owner: string;
  token0Address: string;
  token1Address: string;
  order0Liquidity: string;
  order1Liquidity: string;
}

@Injectable()
export class GradientActivityService {
  private readonly logger = new Logger(GradientActivityService.name);

  constructor(
    @InjectRepository(ActivityV2)
    private activityRepository: Repository<ActivityV2>,
    private gradientCreatedEventService: GradientStrategyCreatedEventService,
    private gradientUpdatedEventService: GradientStrategyUpdatedEventService,
    private gradientDeletedEventService: GradientStrategyDeletedEventService,
    private gradientLiquidityUpdatedEventService: GradientStrategyLiquidityUpdatedEventService,
    private lastProcessedBlockService: LastProcessedBlockService,
    private deploymentService: DeploymentService,
    private blockService: BlockService,
    private dataSource: DataSource,
  ) {}

  async update(endBlock: number, deployment: Deployment, tokens: TokensByAddress): Promise<void> {
    if (!this.deploymentService.hasGradientSupport(deployment)) return;

    const key = `${deployment.blockchainType}-${deployment.exchangeId}-gradient-activities`;
    const lastProcessedBlock = await this.lastProcessedBlockService.getOrInit(key, deployment.startBlock);

    if (lastProcessedBlock >= endBlock) return;

    const strategyStates = new Map<string, GradientStrategyState>();
    const allCreated = await this.gradientCreatedEventService.get(0, lastProcessedBlock, deployment);
    for (const e of allCreated) {
      strategyStates.set(e.strategyId, {
        owner: e.owner,
        token0Address: e.token0?.address || '',
        token1Address: e.token1?.address || '',
        order0Liquidity: e.order0Liquidity,
        order1Liquidity: e.order1Liquidity,
      });
    }

    // Apply historical StrategyUpdated events to state
    const allUpdated = await this.gradientUpdatedEventService.get(0, lastProcessedBlock, deployment);
    for (const e of allUpdated) {
      const state = strategyStates.get(e.strategyId);
      if (state) {
        state.order0Liquidity = e.order0Liquidity;
        state.order1Liquidity = e.order1Liquidity;
      }
    }

    // Apply historical LiquidityUpdated events to state
    const allLiqUpdated = await this.gradientLiquidityUpdatedEventService.get(0, lastProcessedBlock, deployment);
    for (const e of allLiqUpdated) {
      const state = strategyStates.get(e.strategyId);
      if (state) {
        state.order0Liquidity = e.liquidity0;
        state.order1Liquidity = e.liquidity1;
      }
    }

    const ownerUpdates = await this.dataSource.query(
      `SELECT "strategyId", "to" as owner FROM "voucher-transfer-events"
       WHERE "blockchainType" = $1 AND "exchangeId" = $2 AND "blockId" <= $3
       AND "from" != '0x0000000000000000000000000000000000000000'
       AND "to" != '0x0000000000000000000000000000000000000000'
       ORDER BY "blockId" ASC, "logIndex" ASC`,
      [deployment.blockchainType, deployment.exchangeId, lastProcessedBlock],
    ).catch(() => []);

    for (const row of ownerUpdates) {
      const state = strategyStates.get(row.strategyId);
      if (state) state.owner = row.owner;
    }

    await this.activityRepository
      .createQueryBuilder()
      .delete()
      .where('"blockNumber" > :lastProcessedBlock', { lastProcessedBlock })
      .andWhere('"blockchainType" = :blockchainType', { blockchainType: deployment.blockchainType })
      .andWhere('"exchangeId" = :exchangeId', { exchangeId: deployment.exchangeId })
      .andWhere(`"strategyId" IN (SELECT DISTINCT "strategyId" FROM gradient_strategy_created_events WHERE "blockchainType" = :blockchainType AND "exchangeId" = :exchangeId)`)
      .execute();

    const [createdEvents, updatedEvents, deletedEvents, liquidityUpdatedEvents] = await Promise.all([
      this.gradientCreatedEventService.get(lastProcessedBlock + 1, endBlock, deployment),
      this.gradientUpdatedEventService.get(lastProcessedBlock + 1, endBlock, deployment),
      this.gradientDeletedEventService.get(lastProcessedBlock + 1, endBlock, deployment),
      this.gradientLiquidityUpdatedEventService.get(lastProcessedBlock + 1, endBlock, deployment),
    ]);

    const transferRows = await this.dataSource.query(
      `SELECT v."strategyId", v."from", v."to", v."transactionHash", v."transactionIndex", v."logIndex", b.id as "blockNumber", b.timestamp
       FROM "voucher-transfer-events" v
       JOIN blocks b ON b.id = v."blockId"
       WHERE v."blockchainType" = $1 AND v."exchangeId" = $2
       AND b.id > $3 AND b.id <= $4
       AND v."from" != '0x0000000000000000000000000000000000000000'
       AND v."to" != '0x0000000000000000000000000000000000000000'
       AND v."strategyId" IN (SELECT DISTINCT "strategyId" FROM gradient_strategy_created_events WHERE "blockchainType" = $1 AND "exchangeId" = $2)
       ORDER BY b.id ASC, v."logIndex" ASC`,
      [deployment.blockchainType, deployment.exchangeId, lastProcessedBlock, endBlock],
    ).catch(() => []);

    if (createdEvents.length === 0 && updatedEvents.length === 0 && deletedEvents.length === 0 &&
        liquidityUpdatedEvents.length === 0 && transferRows.length === 0) {
      await this.lastProcessedBlockService.update(key, endBlock);
      return;
    }

    this.logger.log(
      `[Gradient] Processing ${createdEvents.length} created, ${updatedEvents.length} updated, ${liquidityUpdatedEvents.length} liquidity_updated, ${deletedEvents.length} deleted, ${transferRows.length} transfer events into activities`,
    );

    const blockNumbers = new Set<number>();
    [...createdEvents, ...updatedEvents, ...deletedEvents].forEach((e) => blockNumbers.add(e.block?.id || 0));
    liquidityUpdatedEvents.forEach((e) => blockNumbers.add(e.block?.id || 0));
    transferRows.forEach((r: any) => blockNumbers.add(r.blockNumber));
    const blockTimestamps = await this.blockService.getBlocksDictionary([...blockNumbers], deployment);

    const activities: ActivityV2[] = [];

    type EventEntry = { blockNumber: number; txIndex: number; logIndex: number; type: string; data: any };
    const allEvents: EventEntry[] = [];

    for (const e of createdEvents) {
      allEvents.push({ blockNumber: e.block?.id || 0, txIndex: e.transactionIndex, logIndex: e.logIndex, type: 'created', data: e });
    }
    for (const e of updatedEvents) {
      allEvents.push({ blockNumber: e.block?.id || 0, txIndex: e.transactionIndex, logIndex: e.logIndex, type: 'updated', data: e });
    }
    for (const e of liquidityUpdatedEvents) {
      allEvents.push({ blockNumber: e.block?.id || 0, txIndex: e.transactionIndex, logIndex: e.logIndex, type: 'liquidity_updated', data: e });
    }
    for (const e of deletedEvents) {
      allEvents.push({ blockNumber: e.block?.id || 0, txIndex: e.transactionIndex, logIndex: e.logIndex, type: 'deleted', data: e });
    }
    for (const r of transferRows) {
      allEvents.push({ blockNumber: r.blockNumber, txIndex: r.transactionIndex, logIndex: r.logIndex, type: 'transfer', data: r });
    }

    allEvents.sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
      if (a.txIndex !== b.txIndex) return a.txIndex - b.txIndex;
      return a.logIndex - b.logIndex;
    });

    for (const entry of allEvents) {
      switch (entry.type) {
        case 'created': {
          const e = entry.data as GradientStrategyCreatedEvent;
          const t0Addr = e.token0?.address || '';
          const t1Addr = e.token1?.address || '';
          strategyStates.set(e.strategyId, {
            owner: e.owner,
            token0Address: t0Addr,
            token1Address: t1Addr,
            order0Liquidity: e.order0Liquidity,
            order1Liquidity: e.order1Liquidity,
          });
          activities.push(this.createActivity(e, 'strategy_created', deployment, tokens, blockTimestamps, e.owner, t0Addr, t1Addr));
          break;
        }
        case 'updated': {
          const e = entry.data as GradientStrategyUpdatedEvent;
          const state = strategyStates.get(e.strategyId);
          const t0 = state?.token0Address || '';
          const t1 = state?.token1Address || '';
          const activity = this.createStrategyActivity(e, 'strategy_edited', deployment, tokens, blockTimestamps, state?.owner, t0, t1);

          if (state) {
            state.order0Liquidity = e.order0Liquidity;
            state.order1Liquidity = e.order1Liquidity;
          }
          activities.push(activity);
          break;
        }
        case 'liquidity_updated': {
          const e = entry.data as GradientStrategyLiquidityUpdatedEvent;
          const state = strategyStates.get(e.strategyId);
          const t0 = state?.token0Address || '';
          const t1 = state?.token1Address || '';

          const activity = this.createLiquidityActivity(e, deployment, tokens, blockTimestamps, state, t0, t1);

          if (state) {
            state.order0Liquidity = e.liquidity0;
            state.order1Liquidity = e.liquidity1;
          }
          activities.push(activity);
          break;
        }
        case 'deleted': {
          const e = entry.data as GradientStrategyDeletedEvent;
          const state = strategyStates.get(e.strategyId);
          const t0 = e.token0?.address || state?.token0Address || '';
          const t1 = e.token1?.address || state?.token1Address || '';
          activities.push(this.createActivity(e, 'strategy_deleted', deployment, tokens, blockTimestamps, state?.owner, t0, t1));
          strategyStates.delete(e.strategyId);
          break;
        }
        case 'transfer': {
          const r = entry.data;
          const state = strategyStates.get(r.strategyId);
          if (state) {
            const activity = new ActivityV2();
            activity.blockchainType = deployment.blockchainType;
            activity.exchangeId = deployment.exchangeId;
            activity.strategyId = r.strategyId;
            activity.action = 'transfer_strategy';
            activity.oldOwner = r.from;
            activity.newOwner = r.to;
            activity.currentOwner = r.to;
            activity.creationWallet = state.owner;
            activity.baseSellToken = tokens[state.token0Address]?.symbol || '';
            activity.baseSellTokenAddress = state.token0Address;
            activity.quoteBuyToken = tokens[state.token1Address]?.symbol || '';
            activity.quoteBuyTokenAddress = state.token1Address;
            activity.baseQuote = `${activity.baseSellToken}/${activity.quoteBuyToken}`;
            activity.sellBudget = '0';
            activity.buyBudget = '0';
            activity.sellPriceA = '0'; activity.sellPriceMarg = '0'; activity.sellPriceB = '0';
            activity.buyPriceA = '0'; activity.buyPriceMarg = '0'; activity.buyPriceB = '0';
            activity.timestamp = r.timestamp || blockTimestamps[r.blockNumber] || new Date();
            activity.txhash = r.transactionHash;
            activity.blockNumber = r.blockNumber;
            activity.transactionIndex = r.transactionIndex;
            activity.logIndex = r.logIndex;
            activities.push(activity);
            state.owner = r.to;
          }
          break;
        }
      }
    }

    const BATCH = 1000;
    for (let i = 0; i < activities.length; i += BATCH) {
      await this.activityRepository.save(activities.slice(i, i + BATCH));
    }

    await this.lastProcessedBlockService.update(key, endBlock);

    this.logger.log(`[Gradient] Created ${activities.length} gradient activities`);
  }

  private createLiquidityActivity(
    event: GradientStrategyLiquidityUpdatedEvent,
    deployment: Deployment,
    tokens: TokensByAddress,
    blockTimestamps: Record<number, Date>,
    state: GradientStrategyState | undefined,
    token0Addr: string,
    token1Addr: string,
  ): ActivityV2 {
    const t0Dec = tokens[token0Addr]?.decimals || 18;
    const t1Dec = tokens[token1Addr]?.decimals || 18;
    const t0Symbol = tokens[token0Addr]?.symbol || 'UNKNOWN';
    const t1Symbol = tokens[token1Addr]?.symbol || 'UNKNOWN';

    const newLiq0 = new Decimal(event.liquidity0);
    const newLiq1 = new Decimal(event.liquidity1);
    const liq0 = newLiq0.div(new Decimal(10).pow(t0Dec));
    const liq1 = newLiq1.div(new Decimal(10).pow(t1Dec));

    const activity = new ActivityV2();
    activity.blockchainType = deployment.blockchainType;
    activity.exchangeId = deployment.exchangeId;
    activity.strategyId = event.strategyId;
    activity.action = 'token_sell_executed';
    activity.baseQuote = `${t0Symbol}/${t1Symbol}`;
    activity.baseSellToken = t0Symbol;
    activity.baseSellTokenAddress = token0Addr;
    activity.quoteBuyToken = t1Symbol;
    activity.quoteBuyTokenAddress = token1Addr;
    activity.sellBudget = liq0.toString();
    activity.buyBudget = liq1.toString();
    activity.sellPriceA = '0';
    activity.sellPriceMarg = '0';
    activity.sellPriceB = '0';
    activity.buyPriceA = '0';
    activity.buyPriceMarg = '0';
    activity.buyPriceB = '0';
    activity.timestamp = blockTimestamps[event.block?.id] || new Date();
    activity.txhash = event.transactionHash;
    activity.blockNumber = event.block?.id || 0;
    activity.transactionIndex = event.transactionIndex;
    activity.logIndex = event.logIndex;
    activity.currentOwner = state?.owner;
    activity.creationWallet = state?.owner;

    if (state) {
      const prevLiq0 = new Decimal(state.order0Liquidity);
      const prevLiq1 = new Decimal(state.order1Liquidity);
      const delta0 = newLiq0.sub(prevLiq0).div(new Decimal(10).pow(t0Dec));
      const delta1 = newLiq1.sub(prevLiq1).div(new Decimal(10).pow(t1Dec));
      activity.sellBudgetChange = delta0.toString();
      activity.buyBudgetChange = delta1.toString();

      if (delta0.isNegative() && delta1.gte(0)) {
        activity.strategySold = delta0.negated().toString();
        activity.tokenSold = t0Symbol;
        activity.strategyBought = delta1.toString();
        activity.tokenBought = t1Symbol;
        activity.action = 'sell_high';
      } else if (delta1.isNegative() && delta0.gt(0)) {
        activity.strategySold = delta1.negated().toString();
        activity.tokenSold = t1Symbol;
        activity.strategyBought = delta0.toString();
        activity.tokenBought = t0Symbol;
        activity.action = 'buy_low';
      }
    }

    return activity;
  }

  private createStrategyActivity(
    event: GradientStrategyUpdatedEvent,
    action: string,
    deployment: Deployment,
    tokens: TokensByAddress,
    blockTimestamps: Record<number, Date>,
    owner?: string,
    token0Addr?: string,
    token1Addr?: string,
  ): ActivityV2 {
    return this.createActivity(event, action, deployment, tokens, blockTimestamps, owner, token0Addr, token1Addr);
  }

  private createActivity(
    event: GradientStrategyCreatedEvent | GradientStrategyUpdatedEvent | GradientStrategyDeletedEvent,
    action: string,
    deployment: Deployment,
    tokens: TokensByAddress,
    blockTimestamps: Record<number, Date>,
    owner?: string,
    token0Addr?: string,
    token1Addr?: string,
  ): ActivityV2 {
    let t0Symbol = 'UNKNOWN';
    let t1Symbol = 'UNKNOWN';
    let t0Decimals = 18;
    let t1Decimals = 18;

    if (token0Addr && tokens[token0Addr]) {
      t0Symbol = tokens[token0Addr].symbol;
      t0Decimals = tokens[token0Addr].decimals;
    }
    if (token1Addr && tokens[token1Addr]) {
      t1Symbol = tokens[token1Addr].symbol;
      t1Decimals = tokens[token1Addr].decimals;
    }

    const liq0 = new Decimal(event.order0Liquidity).div(new Decimal(10).pow(t0Decimals));
    const liq1 = new Decimal(event.order1Liquidity).div(new Decimal(10).pow(t1Decimals));

    const activity = new ActivityV2();
    activity.blockchainType = deployment.blockchainType;
    activity.exchangeId = deployment.exchangeId;
    activity.strategyId = event.strategyId;
    activity.action = action;
    activity.baseQuote = `${t0Symbol}/${t1Symbol}`;
    activity.baseSellToken = t0Symbol;
    activity.baseSellTokenAddress = token0Addr || '';
    activity.quoteBuyToken = t1Symbol;
    activity.quoteBuyTokenAddress = token1Addr || '';
    activity.sellBudget = liq0.toString();
    activity.buyBudget = liq1.toString();
    activity.sellPriceA = '0';
    activity.sellPriceMarg = '0';
    activity.sellPriceB = '0';
    activity.buyPriceA = '0';
    activity.buyPriceMarg = '0';
    activity.buyPriceB = '0';
    activity.timestamp = blockTimestamps[event.block?.id] || new Date();
    activity.txhash = event.transactionHash;
    activity.blockNumber = event.block?.id || 0;
    activity.transactionIndex = event.transactionIndex;
    activity.logIndex = event.logIndex;
    activity.currentOwner = owner;
    activity.creationWallet = owner;

    return activity;
  }
}
