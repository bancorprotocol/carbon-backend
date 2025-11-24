import { Repository, In } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { Strategy } from './strategy.entity';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import Decimal from 'decimal.js';
import { StrategyCreatedEventService } from '../events/strategy-created-event/strategy-created-event.service';
import { StrategyUpdatedEventService } from '../events/strategy-updated-event/strategy-updated-event.service';
import { StrategyDeletedEventService } from '../events/strategy-deleted-event/strategy-deleted-event.service';
import { VoucherTransferEventService } from '../events/voucher-transfer-event/voucher-transfer-event.service';
import { PairsDictionary } from '../pair/pair.service';
import { TokensByAddress } from '../token/token.service';
import { BigNumber } from '@ethersproject/bignumber';
import { Deployment } from '../deployment/deployment.service';
import { StrategyCreatedEvent } from '../events/strategy-created-event/strategy-created-event.entity';
import { StrategyUpdatedEvent } from '../events/strategy-updated-event/strategy-updated-event.entity';
import { StrategyDeletedEvent } from '../events/strategy-deleted-event/strategy-deleted-event.entity';

const ONE = 2 ** 48;

type DecodedOrder = {
  liquidity: string;
  lowestRate: string;
  highestRate: string;
  marginalRate: string;
};

type EncodedOrder = {
  y: string;
  z: string;
  A: string;
  B: string;
};

@Injectable()
export class StrategyService {
  constructor(
    @InjectRepository(Strategy) private strategyRepository: Repository<Strategy>,
    private lastProcessedBlockService: LastProcessedBlockService,
    private strategyCreatedEventService: StrategyCreatedEventService,
    private strategyUpdatedEventService: StrategyUpdatedEventService,
    private strategyDeletedEventService: StrategyDeletedEventService,
    private voucherTransferEventService: VoucherTransferEventService,
  ) {}

  async update(
    endBlock: number,
    pairs: PairsDictionary,
    tokens: TokensByAddress,
    deployment: Deployment,
  ): Promise<void> {
    // Harvest all strategy-related events first
    await this.strategyCreatedEventService.update(endBlock, pairs, tokens, deployment);
    await this.strategyUpdatedEventService.update(endBlock, pairs, tokens, deployment);
    await this.strategyDeletedEventService.update(endBlock, pairs, tokens, deployment);
    await this.voucherTransferEventService.update(endBlock, deployment);

    // Get the last processed block number for this deployment
    const startBlock = await this.lastProcessedBlockService.getOrInit(
      `${deployment.blockchainType}-${deployment.exchangeId}-strategies`,
      deployment.startBlock,
    );

    // Process the events in ranges
    for (let block = startBlock + 1; block <= endBlock; block += deployment.harvestEventsBatchSize * 10) {
      const rangeEnd = Math.min(block + deployment.harvestEventsBatchSize * 10 - 1, endBlock);

      // Fetch the events from the current block range
      const createdEvents = await this.strategyCreatedEventService.get(block, rangeEnd, deployment);
      const updatedEvents = await this.strategyUpdatedEventService.get(block, rangeEnd, deployment);
      const deletedEvents = await this.strategyDeletedEventService.get(block, rangeEnd, deployment);
      const transferEvents = await this.voucherTransferEventService.get(block, rangeEnd, deployment);

      // Process the events
      await this.createOrUpdateFromEvents(createdEvents, deployment);
      await this.createOrUpdateFromEvents(updatedEvents, deployment);
      await this.createOrUpdateFromEvents(deletedEvents, deployment, true);
      await this.updateOwnersFromTransferEvents(transferEvents, deployment);

      // Update last processed block number for this deployment
      await this.lastProcessedBlockService.update(
        `${deployment.blockchainType}-${deployment.exchangeId}-strategies`,
        rangeEnd,
      );
    }
  }

  async updateOwnersFromTransferEvents(transferEvents: any[], deployment: Deployment) {
    if (transferEvents.length === 0) {
      return;
    }

    // Group transfer events by strategy ID (keep only the latest per strategy in this batch)
    const latestTransfers = new Map<string, any>();
    for (const event of transferEvents) {
      const existing = latestTransfers.get(event.strategyId);
      if (
        !existing ||
        event.block.id > existing.block.id ||
        (event.block.id === existing.block.id && event.transactionIndex > existing.transactionIndex) ||
        (event.block.id === existing.block.id &&
          event.transactionIndex === existing.transactionIndex &&
          event.logIndex > existing.logIndex)
      ) {
        latestTransfers.set(event.strategyId, event);
      }
    }

    // Update strategies
    const strategyIds = Array.from(latestTransfers.keys());
    const strategies = await this.strategyRepository.find({
      where: {
        strategyId: In(strategyIds),
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
      },
    });

    for (const strategy of strategies) {
      const transferEvent = latestTransfers.get(strategy.strategyId);
      if (transferEvent) {
        strategy.owner = transferEvent.to;
      }
    }

    if (strategies.length > 0) {
      await this.strategyRepository.save(strategies);
    }
  }

  async createOrUpdateFromEvents(
    events: StrategyCreatedEvent[] | StrategyUpdatedEvent[] | StrategyDeletedEvent[],
    deployment: Deployment,
    deletionEvent = false,
  ) {
    // Fetch existing strategies in the current block range
    const existingStrategies = await this.strategyRepository.find({
      where: {
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
      },
    });

    const strategies = [];
    events.forEach((e) => {
      const order0 = this.decodeOrder(JSON.parse(e.order0));
      const order1 = this.decodeOrder(JSON.parse(e.order1));
      const strategyIndex = existingStrategies.findIndex((s) => s.strategyId === e.strategyId);

      let newStrategy;
      if (strategyIndex >= 0) {
        // Update existing strategy
        newStrategy = existingStrategies[strategyIndex];
        newStrategy.token0 = e.token0;
        newStrategy.token1 = e.token1;
        newStrategy.block = e.block;
        newStrategy.pair = e.pair;
        newStrategy.liquidity0 = order0.liquidity;
        newStrategy.lowestRate0 = order0.lowestRate;
        newStrategy.highestRate0 = order0.highestRate;
        newStrategy.marginalRate0 = order0.marginalRate;
        newStrategy.liquidity1 = order1.liquidity;
        newStrategy.lowestRate1 = order1.lowestRate;
        newStrategy.highestRate1 = order1.highestRate;
        newStrategy.marginalRate1 = order1.marginalRate;
        newStrategy.encodedOrder0 = e.order0;
        newStrategy.encodedOrder1 = e.order1;
        newStrategy.deleted = deletionEvent;

        // Update owner if this is a created event
        if ('owner' in e) {
          newStrategy.owner = e.owner;
        }
      } else {
        // Create new strategy
        newStrategy = this.strategyRepository.create({
          token0: e.token0,
          token1: e.token1,
          block: e.block,
          pair: e.pair,
          liquidity0: order0.liquidity,
          lowestRate0: order0.lowestRate,
          highestRate0: order0.highestRate,
          marginalRate0: order0.marginalRate,
          liquidity1: order1.liquidity,
          lowestRate1: order1.lowestRate,
          highestRate1: order1.highestRate,
          marginalRate1: order1.marginalRate,
          encodedOrder0: e.order0,
          encodedOrder1: e.order1,
          owner: 'owner' in e ? e.owner : null,
          blockchainType: deployment.blockchainType,
          exchangeId: deployment.exchangeId,
          deleted: deletionEvent,
          strategyId: e.strategyId,
        });
      }

      strategies.push(newStrategy);
    });

    const BATCH_SIZE = 1000;
    for (let i = 0; i < strategies.length; i += BATCH_SIZE) {
      const batch = strategies.slice(i, i + BATCH_SIZE);
      await this.strategyRepository.save(batch);
    }
  }

  async all(deployment: Deployment): Promise<Strategy[]> {
    const strategies = await this.strategyRepository
      .createQueryBuilder('pools')
      .leftJoinAndSelect('pools.block', 'block')
      .leftJoinAndSelect('pools.token0', 'token0')
      .leftJoinAndSelect('pools.token1', 'token1')
      .where('pools.blockchainType = :blockchainType', { blockchainType: deployment.blockchainType })
      .andWhere('pools.exchangeId = :exchangeId', { exchangeId: deployment.exchangeId })
      .getMany();

    return strategies.sort((a, b) => b.block.id - a.block.id);
  }

  private decodeOrder(order: EncodedOrder): DecodedOrder {
    const y = new Decimal(order.y);
    const z = new Decimal(order.z);
    const A = new Decimal(this.decodeFloat(BigNumber.from(order.A)));
    const B = new Decimal(this.decodeFloat(BigNumber.from(order.B)));
    return {
      liquidity: y.toString(),
      lowestRate: this.decodeRate(B).toString(),
      highestRate: this.decodeRate(B.add(A)).toString(),
      marginalRate: this.decodeRate(y.eq(z) ? B.add(A) : B.add(A.mul(y).div(z))).toString(),
    };
  }

  private decodeRate(value: Decimal) {
    return value.div(ONE).pow(2);
  }

  private decodeFloat(value: BigNumber) {
    return value.mod(ONE).shl(value.div(ONE).toNumber()).toString();
  }

  async getStrategiesWithOwners(deployment: Deployment, blockId: number): Promise<StrategyWithOwner[]> {
    // Super fast query - just read from the denormalized strategy table
    // Owner is kept up-to-date via updateOwnersFromTransferEvents
    // Encoded orders are kept up-to-date via createOrUpdateFromEvents
    const strategies = await this.strategyRepository
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.token0', 't0')
      .leftJoinAndSelect('s.token1', 't1')
      .leftJoinAndSelect('s.block', 'b')
      .where('s.blockchainType = :blockchainType', { blockchainType: deployment.blockchainType })
      .andWhere('s.exchangeId = :exchangeId', { exchangeId: deployment.exchangeId })
      .andWhere('s.deleted = :deleted', { deleted: false })
      .andWhere('b.id <= :blockId', { blockId })
      .andWhere('s.encodedOrder0 IS NOT NULL')
      .andWhere('s.encodedOrder1 IS NOT NULL')
      .orderBy('s.strategyId', 'ASC')
      .getMany();

    return strategies.map((s) => ({
      strategyId: s.strategyId,
      owner: s.owner,
      token0Address: s.token0.address,
      token1Address: s.token1.address,
      order0: s.encodedOrder0,
      order1: s.encodedOrder1,
    }));
  }
}

export interface StrategyWithOwner {
  strategyId: string;
  owner: string;
  token0Address: string;
  token1Address: string;
  order0: string;
  order1: string;
}
