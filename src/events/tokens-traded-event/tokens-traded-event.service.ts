import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { TokensTradedEvent } from './tokens-traded-event.entity';
import {
  CustomFnArgs,
  HarvesterService,
} from '../../harvester/harvester.service';
import { PairsDictionary } from 'src/pair/pair.service';
import { TokensByAddress } from 'src/token/token.service';

@Injectable()
export class TokensTradedEventService {
  constructor(
    @InjectRepository(TokensTradedEvent)
    private repository: Repository<TokensTradedEvent>,
    private harvesterService: HarvesterService,
  ) {}

  async update(
    endBlock: number,
    pairsDictionary: PairsDictionary,
    tokens: TokensByAddress,
  ): Promise<any[]> {
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
    event['pair'] =
      pairsDictionary[event['sourceToken'].address][
        event['targetToken'].address
      ];

    return event;
  }

  async get(
    startBlock: number,
    endBlock: number,
  ): Promise<TokensTradedEvent[]> {
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
}
