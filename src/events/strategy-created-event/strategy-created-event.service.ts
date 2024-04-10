import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { StrategyCreatedEvent } from './strategy-created-event.entity';
import { CustomFnArgs, HarvesterService } from '../../harvester/harvester.service';
import { PairsDictionary } from '../../pair/pair.service';
import { TokensByAddress } from '../../token/token.service';
import { BigNumber } from '@ethersproject/bignumber';
import { BlocksDictionary } from '../../block/block.service';

@Injectable()
export class StrategyCreatedEventService {
  constructor(
    @InjectRepository(StrategyCreatedEvent)
    private repository: Repository<StrategyCreatedEvent>,
    private harvesterService: HarvesterService,
  ) {}

  async update(endBlock: number, pairsDictionary: PairsDictionary, tokens: TokensByAddress): Promise<any[]> {
    return this.harvesterService.processEvents({
      entity: 'strategy-created-events',
      contractName: 'CarbonController',
      eventName: 'StrategyCreated',
      endBlock,
      repository: this.repository,
      pairsDictionary,
      tokens,
      customFns: [this.parseEvent],
      tagTimestampFromBlock: true,
    });
  }

  async all(): Promise<StrategyCreatedEvent[]> {
    return this.repository
      .createQueryBuilder('strategyCreatedEvents')
      .leftJoinAndSelect('strategyCreatedEvents.block', 'block')
      .leftJoinAndSelect('strategyCreatedEvents.pair', 'pair')
      .leftJoinAndSelect('strategyCreatedEvents.token0', 'token0')
      .leftJoinAndSelect('strategyCreatedEvents.token1', 'token1')
      .orderBy('block.id', 'ASC')
      .getMany();
  }

  async get(startBlock: number, endBlock: number): Promise<StrategyCreatedEvent[]> {
    return this.repository
      .createQueryBuilder('strategyCreatedEvents')
      .leftJoinAndSelect('strategyCreatedEvents.block', 'block')
      .leftJoinAndSelect('strategyCreatedEvents.pair', 'pair')
      .leftJoinAndSelect('strategyCreatedEvents.token0', 'token0')
      .leftJoinAndSelect('strategyCreatedEvents.token1', 'token1')
      .where('block.id > :startBlock', { startBlock })
      .andWhere('block.id <= :endBlock', { endBlock })
      .orderBy('block.id', 'ASC')
      .getMany();
  }

  async parseEvent(args: CustomFnArgs): Promise<any> {
    const { event, rawEvent } = args;

    // parse id
    event['id'] = BigNumber.from(rawEvent.returnValues['id']).toString();

    // parse orders
    for (let i = 0; i < 2; i++) {
      const key = `order${i}`;
      event[key] = JSON.stringify({
        y: BigNumber.from(rawEvent.returnValues[key]['y']).toString(),
        z: BigNumber.from(rawEvent.returnValues[key]['z']).toString(),
        A: BigNumber.from(rawEvent.returnValues[key]['A']).toString(),
        B: BigNumber.from(rawEvent.returnValues[key]['B']).toString(),
      });
    }

    return event;
  }
}
