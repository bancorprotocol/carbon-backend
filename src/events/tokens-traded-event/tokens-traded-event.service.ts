import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { TokensTradedEvent } from './tokens-traded-event.entity';
import { CustomFnArgs, HarvesterService } from '../../harvester/harvester.service';
import { PairsDictionary } from '../../pair/pair.service';
import { TokensByAddress } from '../../token/token.service';
import Decimal from 'decimal.js';
@Injectable()
export class TokensTradedEventService {
  constructor(
    @InjectRepository(TokensTradedEvent)
    private repository: Repository<TokensTradedEvent>,
    private harvesterService: HarvesterService,
  ) {}

  async update(endBlock: number, pairsDictionary: PairsDictionary, tokens: TokensByAddress): Promise<any[]> {
    return this.harvesterService.processEvents({
      entity: 'tokens-traded-events',
      contractName: 'CarbonController',
      eventName: 'TokensTraded',
      endBlock,
      repository: this.repository,
      stringFields: ['trader'],
      bigNumberFields: ['sourceAmount', 'targetAmount', 'tradingFeeAmount'],
      booleanFields: ['byTargetAmount'],
      pairsDictionary,
      tokens,
      customFns: [this.parseEvent],
    });
  }

  async parseEvent(args: CustomFnArgs): Promise<any> {
    const { event, rawEvent, pairsDictionary, tokens } = args;

    event['sourceToken'] = tokens[rawEvent.returnValues['sourceToken']];
    event['targetToken'] = tokens[rawEvent.returnValues['targetToken']];
    event['pair'] = pairsDictionary[event['sourceToken'].address][event['targetToken'].address];

    return event;
  }

  async get(startBlock: number, endBlock: number): Promise<TokensTradedEvent[]> {
    return this.repository
      .createQueryBuilder('tokensTradedEvents')
      .leftJoinAndSelect('tokensTradedEvents.block', 'block')
      .leftJoinAndSelect('tokensTradedEvents.pair', 'pair')
      .leftJoinAndSelect('tokensTradedEvents.sourceToken', 'sourceToken')
      .leftJoinAndSelect('tokensTradedEvents.targetToken', 'targetToken')
      .where('block.id > :startBlock', { startBlock })
      .andWhere('block.id <= :endBlock', { endBlock })
      .orderBy('block.id', 'ASC')
      .getMany();
  }

  async all(limit = 0, ascending = true): Promise<TokensTradedEvent[]> {
    const order = ascending ? 'ASC' : 'DESC';
    let trades = this.repository
      .createQueryBuilder('tokensTradedEvents')
      .leftJoinAndSelect('tokensTradedEvents.block', 'block')
      .leftJoinAndSelect('tokensTradedEvents.pair', 'pair')
      .leftJoinAndSelect('tokensTradedEvents.sourceToken', 'sourceToken')
      .leftJoinAndSelect('tokensTradedEvents.targetToken', 'targetToken')
      .orderBy('block.id', order);

    if (limit > 0) {
      trades = trades.take(limit);
    }

    return trades.getMany();
  }

  async volume24hByToken(): Promise<any> {
    const trades = await this.repository
      .createQueryBuilder('tokensTradedEvents')
      .leftJoinAndSelect('tokensTradedEvents.block', 'block')
      .leftJoinAndSelect('tokensTradedEvents.pair', 'pair')
      .leftJoinAndSelect('tokensTradedEvents.sourceToken', 'sourceToken')
      .leftJoinAndSelect('tokensTradedEvents.targetToken', 'targetToken')
      .where(`tokensTradedEvents.timestamp >= NOW() - INTERVAL '24 hours'`)
      .getMany();

    const result = {};
    trades.forEach((t) => {
      if (!result[t.sourceToken.id]) {
        result[t.sourceToken.id] = new Decimal(0);
      }

      if (!result[t.targetToken.id]) {
        result[t.targetToken.id] = new Decimal(0);
      }

      result[t.sourceToken.id] = new Decimal(result[t.sourceToken.id]).add(
        new Decimal(t.sourceAmount).div(`1e${t.sourceToken.decimals}`),
      );

      result[t.targetToken.id] = new Decimal(result[t.targetToken.id]).add(
        new Decimal(t.targetAmount).div(`1e${t.targetToken.decimals}`),
      );
    });

    return result;
  }

  async volume24hByPair(): Promise<any> {
    const trades = await this.repository
      .createQueryBuilder('tokensTradedEvents')
      .leftJoinAndSelect('tokensTradedEvents.block', 'block')
      .leftJoinAndSelect('tokensTradedEvents.pair', 'pair')
      .leftJoinAndSelect('pair.token0', 'token0')
      .leftJoinAndSelect('pair.token1', 'token1')
      .leftJoinAndSelect('tokensTradedEvents.sourceToken', 'sourceToken')
      .leftJoinAndSelect('tokensTradedEvents.targetToken', 'targetToken')
      .where(`tokensTradedEvents.timestamp >= NOW() - INTERVAL '24 hours'`)
      .getMany();

    const result = {};
    trades.forEach((t) => {
      if (!result[t.pair.id]) {
        result[t.pair.id] = {
          token0Volume: new Decimal(0),
          token1Volume: new Decimal(0),
        };
      }

      if (t.pair.token0.id === t.sourceToken.id) {
        result[t.pair.id].token0Volume = result[t.pair.id].token0Volume.add(
          new Decimal(t.sourceAmount).div(`1e${t.sourceToken.decimals}`),
        );

        result[t.pair.id].token1Volume = result[t.pair.id].token1Volume.add(
          new Decimal(t.targetAmount).div(`1e${t.targetToken.decimals}`),
        );
      } else {
        result[t.pair.id].token0Volume = result[t.pair.id].token0Volume.add(
          new Decimal(t.targetAmount).div(`1e${t.targetToken.decimals}`),
        );

        result[t.pair.id].token1Volume = result[t.pair.id].token1Volume.add(
          new Decimal(t.sourceAmount).div(`1e${t.sourceToken.decimals}`),
        );
      }
    });

    return result;
  }
}
