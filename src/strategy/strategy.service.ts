import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { Strategy } from './strategy.entity';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import * as _ from 'lodash';
import Decimal from 'decimal.js';
import { StrategyCreatedEventService } from '../events/strategy-created-event/strategy-created-event.service';
import { StrategyCreatedEvent } from '../events/strategy-created-event/strategy-created-event.entity';
import { StrategyUpdatedEventService } from '../events/strategy-updated-event/strategy-updated-event.service';
import { StrategyUpdatedEvent } from '../events/strategy-updated-event/strategy-updated-event.entity';
import { PairsDictionary } from '../pair/pair.service';
import { TokensByAddress } from '../token/token.service';
import { StrategyDeletedEventService } from 'src/events/strategy-deleted-event/strategy-deleted-event.service';
import { BlocksDictionary } from '../block/block.service';
import { BigNumber } from '@ethersproject/bignumber';

const LAST_PROCESSED_ENTITY = 'strategies';

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
    @InjectRepository(Strategy) private strategy: Repository<Strategy>,
    private lastProcessedBlockService: LastProcessedBlockService,
    private strategyCreatedEventService: StrategyCreatedEventService,
    private strategyUpdatedEventService: StrategyUpdatedEventService,
    private strategyDeletedEventService: StrategyDeletedEventService,
  ) {}

  async update(endBlock: number, pairs: PairsDictionary, tokens: TokensByAddress): Promise<void> {
    // create new strategies
    const newCreateEvents = await this.strategyCreatedEventService.update(endBlock, pairs, tokens);
    let eventBatches = _.chunk(newCreateEvents, 1000);
    for (const eventsBatch of eventBatches) {
      await this.createOrUpdateFromEvents(eventsBatch);
    }

    // update strategies
    const newUpdateEvents = await this.strategyUpdatedEventService.update(endBlock, pairs, tokens);
    eventBatches = _.chunk(newUpdateEvents, 1000);
    for (const eventsBatch of eventBatches) {
      await this.createOrUpdateFromEvents(eventsBatch);
    }

    // delete strategies
    const newDeleteEvents = await this.strategyDeletedEventService.update(endBlock, pairs, tokens);
    eventBatches = _.chunk(newDeleteEvents, 1000);
    for (const eventsBatch of eventBatches) {
      await this.createOrUpdateFromEvents(eventsBatch, true);
    }

    // update last processed block number
    await this.lastProcessedBlockService.update(LAST_PROCESSED_ENTITY, endBlock);
  }

  async createOrUpdateFromEvents(events: StrategyCreatedEvent[] | StrategyUpdatedEvent[], deletionEvent = false) {
    const strategies = [];
    events.forEach((e) => {
      const order0 = this.decodeOrder(JSON.parse(e.order0));
      const order1 = this.decodeOrder(JSON.parse(e.order1));
      const id = e['strategy'] ? e.strategy.id : e.id;
      const strategyIndex = strategies.findIndex((s) => s.id === id);
      const newStrategy = this.strategy.create({
        id,
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
        deleted: deletionEvent,
      });

      if (strategyIndex >= 0) {
        strategies[strategyIndex] = newStrategy;
      } else {
        strategies.push(newStrategy);
      }
    });

    await this.strategy.save(strategies);
  }

  async all(): Promise<Strategy[]> {
    const strategies = await this.strategy
      .createQueryBuilder('pools')
      .leftJoinAndSelect('pools.block', 'block')
      .leftJoinAndSelect('pools.token0', 'token0')
      .leftJoinAndSelect('pools.token1', 'token1')
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
}
