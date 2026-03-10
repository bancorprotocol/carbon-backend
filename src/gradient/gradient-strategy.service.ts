import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { GradientStrategy } from './gradient-strategy.entity';
import { GradientStrategyCreatedEvent } from './events/gradient-strategy-created-event.entity';
import { GradientStrategyUpdatedEvent } from './events/gradient-strategy-updated-event.entity';
import { GradientStrategyDeletedEvent } from './events/gradient-strategy-deleted-event.entity';
import { GradientStrategyLiquidityUpdatedEvent } from './events/gradient-strategy-liquidity-updated-event.entity';
import { GradientStrategyCreatedEventService } from './events/gradient-strategy-created-event.service';
import { GradientStrategyUpdatedEventService } from './events/gradient-strategy-updated-event.service';
import { GradientStrategyDeletedEventService } from './events/gradient-strategy-deleted-event.service';
import { GradientStrategyLiquidityUpdatedEventService } from './events/gradient-strategy-liquidity-updated-event.service';
import { GradientVoucherTransferEventService } from './events/gradient-voucher-transfer-event.service';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { Deployment } from '../deployment/deployment.service';
import { VoucherTransferEvent } from '../events/voucher-transfer-event/voucher-transfer-event.entity';

@Injectable()
export class GradientStrategyService {
  private readonly logger = new Logger(GradientStrategyService.name);

  constructor(
    @InjectRepository(GradientStrategy) private repository: Repository<GradientStrategy>,
    @InjectRepository(VoucherTransferEvent) private voucherTransferRepository: Repository<VoucherTransferEvent>,
    private lastProcessedBlockService: LastProcessedBlockService,
    private createdEventService: GradientStrategyCreatedEventService,
    private updatedEventService: GradientStrategyUpdatedEventService,
    private deletedEventService: GradientStrategyDeletedEventService,
    private liquidityUpdatedEventService: GradientStrategyLiquidityUpdatedEventService,
  ) {}

  async update(endBlock: number, deployment: Deployment): Promise<void> {
    const key = `${deployment.blockchainType}-${deployment.exchangeId}-gradient-strategies`;
    const startBlock = await this.lastProcessedBlockService.getOrInit(key, deployment.startBlock);

    for (let block = startBlock + 1; block <= endBlock; block += deployment.harvestEventsBatchSize * 10) {
      const rangeEnd = Math.min(block + deployment.harvestEventsBatchSize * 10 - 1, endBlock);

      const createdEvents = await this.createdEventService.get(block, rangeEnd, deployment);
      const updatedEvents = await this.updatedEventService.get(block, rangeEnd, deployment);
      const deletedEvents = await this.deletedEventService.get(block, rangeEnd, deployment);
      const liquidityUpdatedEvents = await this.liquidityUpdatedEventService.get(block, rangeEnd, deployment);

      await this.processCreatedEvents(createdEvents, deployment);
      await this.processUpdatedEvents(updatedEvents, deployment);
      await this.processLiquidityUpdatedEvents(liquidityUpdatedEvents, deployment);
      await this.processDeletedEvents(deletedEvents, deployment);
      await this.processTransferEvents(block, rangeEnd, deployment);

      await this.lastProcessedBlockService.update(key, rangeEnd);
    }
  }

  private async processCreatedEvents(events: GradientStrategyCreatedEvent[], deployment: Deployment): Promise<void> {
    if (events.length === 0) return;

    const strategies: GradientStrategy[] = [];
    for (const e of events) {
      const existing = await this.repository.findOne({
        where: {
          blockchainType: deployment.blockchainType,
          exchangeId: deployment.exchangeId,
          strategyId: e.strategyId,
        },
      });

      if (existing) {
        Object.assign(existing, this.eventToFields(e));
        existing.owner = e.owner;
        existing.deleted = false;
        strategies.push(existing);
      } else {
        strategies.push(
          this.repository.create({
            blockchainType: deployment.blockchainType,
            exchangeId: deployment.exchangeId,
            strategyId: e.strategyId,
            token0: e.token0?.address || '',
            token1: e.token1?.address || '',
            owner: e.owner,
            deleted: false,
            ...this.eventToFields(e),
          }),
        );
      }
    }

    await this.saveBatch(strategies);
    this.logger.log(`Processed ${events.length} gradient StrategyCreated events`);
  }

  private async processUpdatedEvents(events: GradientStrategyUpdatedEvent[], deployment: Deployment): Promise<void> {
    if (events.length === 0) return;

    const strategyIds = [...new Set(events.map((e) => e.strategyId))];
    const existing = await this.repository.find({
      where: {
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        strategyId: In(strategyIds),
      },
    });
    const existingMap = new Map(existing.map((s) => [s.strategyId, s]));

    for (const e of events) {
      const strategy = existingMap.get(e.strategyId);
      if (strategy) {
        Object.assign(strategy, this.eventToFields(e));
      }
    }

    const toSave = existing.filter((s) => existingMap.has(s.strategyId));
    await this.saveBatch(toSave);
    this.logger.log(`Processed ${events.length} gradient StrategyUpdated events`);
  }

  private async processLiquidityUpdatedEvents(events: GradientStrategyLiquidityUpdatedEvent[], deployment: Deployment): Promise<void> {
    if (events.length === 0) return;

    const strategyIds = [...new Set(events.map((e) => e.strategyId))];
    const existing = await this.repository.find({
      where: {
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        strategyId: In(strategyIds),
      },
    });
    const existingMap = new Map(existing.map((s) => [s.strategyId, s]));

    for (const e of events) {
      const strategy = existingMap.get(e.strategyId);
      if (strategy) {
        strategy.order0Liquidity = e.liquidity0;
        strategy.order1Liquidity = e.liquidity1;
        strategy.blockNumber = e.block?.id || strategy.blockNumber;
      }
    }

    const toSave = existing.filter((s) => existingMap.has(s.strategyId));
    await this.saveBatch(toSave);
    this.logger.log(`Processed ${events.length} gradient StrategyLiquidityUpdated events`);
  }

  private async processDeletedEvents(events: GradientStrategyDeletedEvent[], deployment: Deployment): Promise<void> {
    if (events.length === 0) return;

    const strategyIds = [...new Set(events.map((e) => e.strategyId))];
    const existing = await this.repository.find({
      where: {
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        strategyId: In(strategyIds),
      },
    });

    for (const strategy of existing) {
      strategy.deleted = true;
      const event = events.find((e) => e.strategyId === strategy.strategyId);
      if (event) {
        Object.assign(strategy, this.eventToFields(event));
      }
    }

    await this.saveBatch(existing);
    this.logger.log(`Processed ${events.length} gradient StrategyDeleted events`);
  }

  private async processTransferEvents(startBlock: number, endBlock: number, deployment: Deployment): Promise<void> {
    const transfers = await this.voucherTransferRepository
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.block', 'block')
      .where('block.id >= :startBlock', { startBlock })
      .andWhere('block.id <= :endBlock', { endBlock })
      .andWhere('e."blockchainType" = :blockchainType', { blockchainType: deployment.blockchainType })
      .andWhere('e."exchangeId" = :exchangeId', { exchangeId: deployment.exchangeId })
      .orderBy('block.id', 'ASC')
      .addOrderBy('e."transactionIndex"', 'ASC')
      .addOrderBy('e."logIndex"', 'ASC')
      .getMany();

    if (transfers.length === 0) return;

    const latestTransfers = new Map<string, VoucherTransferEvent>();
    for (const t of transfers) {
      const existing = latestTransfers.get(t.strategyId);
      if (!existing || t.block.id > existing.block.id ||
        (t.block.id === existing.block.id && t.transactionIndex > existing.transactionIndex) ||
        (t.block.id === existing.block.id && t.transactionIndex === existing.transactionIndex && t.logIndex > existing.logIndex)) {
        latestTransfers.set(t.strategyId, t);
      }
    }

    const strategyIds = Array.from(latestTransfers.keys());
    const strategies = await this.repository.find({
      where: {
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        strategyId: In(strategyIds),
      },
    });

    for (const strategy of strategies) {
      const transfer = latestTransfers.get(strategy.strategyId);
      if (transfer) {
        strategy.owner = transfer.to;
      }
    }

    if (strategies.length > 0) {
      await this.repository.save(strategies);
    }
  }

  private eventToFields(e: GradientStrategyCreatedEvent | GradientStrategyUpdatedEvent | GradientStrategyDeletedEvent) {
    return {
      order0Liquidity: e.order0Liquidity,
      order0InitialPrice: e.order0InitialPrice,
      order0TradingStartTime: e.order0TradingStartTime,
      order0Expiry: e.order0Expiry,
      order0MultiFactor: e.order0MultiFactor,
      order0GradientType: e.order0GradientType,
      order1Liquidity: e.order1Liquidity,
      order1InitialPrice: e.order1InitialPrice,
      order1TradingStartTime: e.order1TradingStartTime,
      order1Expiry: e.order1Expiry,
      order1MultiFactor: e.order1MultiFactor,
      order1GradientType: e.order1GradientType,
      blockNumber: e.block?.id || 0,
    };
  }

  private async saveBatch(strategies: GradientStrategy[]): Promise<void> {
    const BATCH_SIZE = 1000;
    for (let i = 0; i < strategies.length; i += BATCH_SIZE) {
      await this.repository.save(strategies.slice(i, i + BATCH_SIZE));
    }
  }

  async all(deployment: Deployment): Promise<GradientStrategy[]> {
    return this.repository.find({
      where: {
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
      },
      order: { blockNumber: 'DESC' },
    });
  }

  async allActive(deployment: Deployment): Promise<GradientStrategy[]> {
    return this.repository.find({
      where: {
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        deleted: false,
      },
      order: { blockNumber: 'DESC' },
    });
  }
}
