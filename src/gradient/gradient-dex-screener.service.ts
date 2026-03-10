import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Decimal } from 'decimal.js';
import { DexScreenerEventV2 } from '../v1/dex-screener/dex-screener-event-v2.entity';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { Deployment, DeploymentService } from '../deployment/deployment.service';
import { TokensByAddress } from '../token/token.service';
import { BlockService } from '../block/block.service';
import { GradientStrategyCreatedEventService } from './events/gradient-strategy-created-event.service';
import { GradientStrategyUpdatedEventService } from './events/gradient-strategy-updated-event.service';
import { GradientStrategyDeletedEventService } from './events/gradient-strategy-deleted-event.service';
import { GradientStrategyLiquidityUpdatedEventService } from './events/gradient-strategy-liquidity-updated-event.service';

interface GradientLiquidityState {
  pairId: number;
  token0Address: string;
  token1Address: string;
  token0Decimals: number;
  token1Decimals: number;
  liquidity0: Decimal;
  liquidity1: Decimal;
  owner: string;
}

@Injectable()
export class GradientDexScreenerService {
  private readonly logger = new Logger(GradientDexScreenerService.name);

  constructor(
    @InjectRepository(DexScreenerEventV2)
    private eventRepository: Repository<DexScreenerEventV2>,
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

    const key = `${deployment.blockchainType}-${deployment.exchangeId}-gradient-dex-screener-v2`;
    const lastProcessedBlock = await this.lastProcessedBlockService.getOrInit(key, deployment.startBlock);

    if (lastProcessedBlock >= endBlock) return;

    await this.eventRepository
      .createQueryBuilder()
      .delete()
      .where('"blockNumber" > :lastProcessedBlock', { lastProcessedBlock })
      .andWhere('"blockchainType" = :blockchainType', { blockchainType: deployment.blockchainType })
      .andWhere('"exchangeId" = :exchangeId', { exchangeId: deployment.exchangeId })
      .andWhere(`"maker" IN (SELECT DISTINCT "owner" FROM gradient_strategy_created_events WHERE "blockchainType" = :blockchainType AND "exchangeId" = :exchangeId)`)
      .execute();

    // Build gradient strategy states from all historical events
    const states = new Map<string, GradientLiquidityState>();
    const allCreated = await this.gradientCreatedEventService.get(0, lastProcessedBlock, deployment);
    for (const e of allCreated) {
      const pairId = e.pair?.id || 0;
      const t0Addr = e.token0?.address || '';
      const t1Addr = e.token1?.address || '';

      states.set(e.strategyId, {
        pairId,
        token0Address: t0Addr,
        token1Address: t1Addr,
        token0Decimals: tokens[t0Addr]?.decimals || 18,
        token1Decimals: tokens[t1Addr]?.decimals || 18,
        liquidity0: new Decimal(e.order0Liquidity),
        liquidity1: new Decimal(e.order1Liquidity),
        owner: e.owner,
      });
    }

    // Apply historical StrategyUpdated events
    const allUpdated = await this.gradientUpdatedEventService.get(0, lastProcessedBlock, deployment);
    for (const e of allUpdated) {
      const state = states.get(e.strategyId);
      if (state) {
        state.liquidity0 = new Decimal(e.order0Liquidity);
        state.liquidity1 = new Decimal(e.order1Liquidity);
      }
    }

    // Apply historical LiquidityUpdated events (trade-driven)
    const allLiqUpdated = await this.gradientLiquidityUpdatedEventService.get(0, lastProcessedBlock, deployment);
    for (const e of allLiqUpdated) {
      const state = states.get(e.strategyId);
      if (state) {
        state.liquidity0 = new Decimal(e.liquidity0);
        state.liquidity1 = new Decimal(e.liquidity1);
      }
    }

    // Remove deleted strategies
    const allDeleted = await this.gradientDeletedEventService.get(0, lastProcessedBlock, deployment);
    for (const e of allDeleted) {
      states.delete(e.strategyId);
    }

    // Fetch new events in the batch range
    const [createdEvents, updatedEvents, deletedEvents, liquidityUpdatedEvents] = await Promise.all([
      this.gradientCreatedEventService.get(lastProcessedBlock + 1, endBlock, deployment),
      this.gradientUpdatedEventService.get(lastProcessedBlock + 1, endBlock, deployment),
      this.gradientDeletedEventService.get(lastProcessedBlock + 1, endBlock, deployment),
      this.gradientLiquidityUpdatedEventService.get(lastProcessedBlock + 1, endBlock, deployment),
    ]);

    // Fetch gradient trades in range
    const tradeRows = await this.dataSource.query(
      `SELECT t."transactionHash", t."transactionIndex", t."logIndex", t.timestamp,
              b.id as "blockNumber", t."sourceAmount", t."targetAmount", t."tradingFeeAmount",
              t."byTargetAmount", t.trader, t.type,
              st.address as "sourceAddress", tt.address as "targetAddress",
              p.id as "pairId"
       FROM "tokens-traded-events" t
       JOIN blocks b ON b.id = t."blockId"
       JOIN tokens st ON st.id = t."sourceTokenId"
       JOIN tokens tt ON tt.id = t."targetTokenId"
       JOIN pairs p ON p.id = t."pairId"
       WHERE t."blockchainType" = $1 AND t."exchangeId" = $2
       AND b.id > $3 AND b.id <= $4
       AND p.id IN (SELECT DISTINCT p2.id FROM pairs p2 JOIN tokens pt0 ON pt0.id = p2."token0Id" JOIN tokens pt1 ON pt1.id = p2."token1Id"
                    WHERE p2."blockchainType" = $1 AND p2."exchangeId" = $2
                    AND p2.id IN (SELECT DISTINCT "pairId" FROM gradient_strategy_created_events WHERE "blockchainType" = $1 AND "exchangeId" = $2))
       ORDER BY b.id ASC, t."logIndex" ASC`,
      [deployment.blockchainType, deployment.exchangeId, lastProcessedBlock, endBlock],
    ).catch(() => []);

    if (createdEvents.length === 0 && updatedEvents.length === 0 && deletedEvents.length === 0 &&
        liquidityUpdatedEvents.length === 0 && tradeRows.length === 0) {
      await this.lastProcessedBlockService.update(key, endBlock);
      return;
    }

    const blockNumbers = new Set<number>();
    [...createdEvents, ...updatedEvents, ...deletedEvents].forEach((e) => blockNumbers.add(e.block?.id || 0));
    liquidityUpdatedEvents.forEach((e) => blockNumbers.add(e.block?.id || 0));
    tradeRows.forEach((r: any) => blockNumbers.add(r.blockNumber));
    const blockTimestamps = await this.blockService.getBlocksDictionary([...blockNumbers], deployment);

    const dexEvents: DexScreenerEventV2[] = [];
    let eventIndex = 0;

    // Process created events -> join
    for (const e of createdEvents) {
      const pairId = e.pair?.id || 0;
      if (!pairId) continue;

      const t0Addr = e.token0?.address || '';
      const t1Addr = e.token1?.address || '';
      const t0Dec = tokens[t0Addr]?.decimals || 18;
      const t1Dec = tokens[t1Addr]?.decimals || 18;
      const amount0 = new Decimal(e.order0Liquidity).div(new Decimal(10).pow(t0Dec));
      const amount1 = new Decimal(e.order1Liquidity).div(new Decimal(10).pow(t1Dec));

      states.set(e.strategyId, {
        pairId,
        token0Address: t0Addr,
        token1Address: t1Addr,
        token0Decimals: t0Dec,
        token1Decimals: t1Dec,
        liquidity0: new Decimal(e.order0Liquidity),
        liquidity1: new Decimal(e.order1Liquidity),
        owner: e.owner,
      });

      const reserves = this.getAggregatedReserves(states, pairId, tokens);

      const event = this.eventRepository.create({
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        blockNumber: e.block?.id || 0,
        blockTimestamp: blockTimestamps[e.block?.id] || new Date(),
        eventType: 'join',
        txnId: e.transactionHash,
        txnIndex: e.transactionIndex,
        eventIndex: eventIndex++,
        maker: e.owner,
        pairId,
        amount0: amount0.toString(),
        amount1: amount1.toString(),
        reserves0: reserves.reserves0,
        reserves1: reserves.reserves1,
      });
      dexEvents.push(event);
    }

    // Process updated events -> update state (edits only)
    for (const e of updatedEvents) {
      const state = states.get(e.strategyId);
      if (state) {
        state.liquidity0 = new Decimal(e.order0Liquidity);
        state.liquidity1 = new Decimal(e.order1Liquidity);
      }
    }

    // Process liquidity updated events -> update state (trade-driven)
    for (const e of liquidityUpdatedEvents) {
      const state = states.get(e.strategyId);
      if (state) {
        state.liquidity0 = new Decimal(e.liquidity0);
        state.liquidity1 = new Decimal(e.liquidity1);
      }
    }

    // Process deleted events -> exit
    for (const e of deletedEvents) {
      const state = states.get(e.strategyId);
      if (state) {
        const amount0 = state.liquidity0.div(new Decimal(10).pow(state.token0Decimals));
        const amount1 = state.liquidity1.div(new Decimal(10).pow(state.token1Decimals));

        states.delete(e.strategyId);
        const reserves = this.getAggregatedReserves(states, state.pairId, tokens);

        const event = this.eventRepository.create({
          blockchainType: deployment.blockchainType,
          exchangeId: deployment.exchangeId,
          blockNumber: e.block?.id || 0,
          blockTimestamp: blockTimestamps[e.block?.id] || new Date(),
          eventType: 'exit',
          txnId: e.transactionHash,
          txnIndex: e.transactionIndex,
          eventIndex: eventIndex++,
          maker: state.owner,
          pairId: state.pairId,
          amount0: amount0.toString(),
          amount1: amount1.toString(),
          reserves0: reserves.reserves0,
          reserves1: reserves.reserves1,
        });
        dexEvents.push(event);
      }
    }

    // Process gradient trades -> swap
    for (const trade of tradeRows) {
      const reserves = this.getAggregatedReserves(states, trade.pairId, tokens);

      const srcDec = tokens[trade.sourceAddress]?.decimals || 18;
      const tgtDec = tokens[trade.targetAddress]?.decimals || 18;
      const sourceAmount = new Decimal(trade.sourceAmount).div(new Decimal(10).pow(srcDec));
      const targetAmount = new Decimal(trade.targetAmount).div(new Decimal(10).pow(tgtDec));

      const event = this.eventRepository.create({
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        blockNumber: trade.blockNumber,
        blockTimestamp: trade.timestamp || blockTimestamps[trade.blockNumber] || new Date(),
        eventType: 'swap',
        txnId: trade.transactionHash,
        txnIndex: trade.transactionIndex,
        eventIndex: eventIndex++,
        maker: trade.trader,
        pairId: trade.pairId,
        asset0In: trade.type === 'sell' ? sourceAmount.toString() : null,
        asset1In: trade.type === 'buy' ? sourceAmount.toString() : null,
        asset0Out: trade.type === 'buy' ? targetAmount.toString() : null,
        asset1Out: trade.type === 'sell' ? targetAmount.toString() : null,
        priceNative: targetAmount.gt(0) ? sourceAmount.div(targetAmount).toString() : '0',
        reserves0: reserves.reserves0,
        reserves1: reserves.reserves1,
      });
      dexEvents.push(event);
    }

    if (dexEvents.length > 0) {
      this.logger.log(`[Gradient] Created ${dexEvents.length} DexScreener events`);
      const BATCH = 1000;
      for (let i = 0; i < dexEvents.length; i += BATCH) {
        await this.eventRepository.save(dexEvents.slice(i, i + BATCH));
      }
    }

    await this.lastProcessedBlockService.update(key, endBlock);
  }

  private getAggregatedReserves(
    states: Map<string, GradientLiquidityState>,
    pairId: number,
    tokens: TokensByAddress,
  ): { reserves0: string; reserves1: string } {
    let total0 = new Decimal(0);
    let total1 = new Decimal(0);

    for (const state of states.values()) {
      if (state.pairId === pairId) {
        total0 = total0.add(state.liquidity0.div(new Decimal(10).pow(state.token0Decimals)));
        total1 = total1.add(state.liquidity1.div(new Decimal(10).pow(state.token1Decimals)));
      }
    }

    return { reserves0: total0.toString(), reserves1: total1.toString() };
  }
}
