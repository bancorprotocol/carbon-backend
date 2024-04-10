import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { StrategyDeletedEvent } from './strategy-deleted-event.entity';
import { CustomFnArgs, HarvesterService } from '../../harvester/harvester.service';
import { PairsDictionary } from 'src/pair/pair.service';
import { TokensByAddress } from 'src/token/token.service';
import { BigNumber } from '@ethersproject/bignumber';
import { BlocksDictionary } from '../../block/block.service';

@Injectable()
export class StrategyDeletedEventService {
  constructor(
    @InjectRepository(StrategyDeletedEvent)
    private repository: Repository<StrategyDeletedEvent>,
    private harvesterService: HarvesterService,
  ) {}

  async update(endBlock: number, pairsDictionary: PairsDictionary, tokens: TokensByAddress): Promise<any[]> {
    return this.harvesterService.processEvents({
      entity: 'strategy-deleted-events',
      contractName: 'CarbonController',
      eventName: 'StrategyDeleted',
      endBlock,
      repository: this.repository,
      pairsDictionary,
      tokens,
      customFns: [this.parseEvent],
      tagTimestampFromBlock: true,
    });
  }

  async get(startBlock: number, endBlock: number): Promise<StrategyDeletedEvent[]> {
    return this.repository
      .createQueryBuilder('strategyUpdatedEvents')
      .leftJoinAndSelect('strategyUpdatedEvents.block', 'block')
      .leftJoinAndSelect('strategyUpdatedEvents.pair', 'pair')
      .leftJoinAndSelect('strategyUpdatedEvents.token0', 'token0')
      .leftJoinAndSelect('strategyUpdatedEvents.token1', 'token1')
      .where('block.id > :startBlock', { startBlock })
      .andWhere('block.id <= :endBlock', { endBlock })
      .orderBy('block.id', 'ASC')
      .getMany();
  }

  async parseEvent(args: CustomFnArgs): Promise<any> {
    const { event, rawEvent } = args;

    // parse id
    event['strategy'] = {
      id: BigNumber.from(rawEvent.returnValues['id']).toString(),
    };

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
