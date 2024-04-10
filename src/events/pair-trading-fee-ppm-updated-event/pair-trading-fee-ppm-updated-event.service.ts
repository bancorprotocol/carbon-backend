import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { PairTradingFeePpmUpdatedEvent } from './pair-trading-fee-ppm-updated-event.entity';
import { CustomFnArgs, HarvesterService } from '../../harvester/harvester.service';
import { PairsDictionary } from '../../pair/pair.service';
import { TokensByAddress } from '../../token/token.service';

export interface PairTradingFeePpmDictionary {
  [address: string]: number;
}

@Injectable()
export class PairTradingFeePpmUpdatedEventService {
  constructor(
    @InjectRepository(PairTradingFeePpmUpdatedEvent)
    private repository: Repository<PairTradingFeePpmUpdatedEvent>,
    private harvesterService: HarvesterService,
  ) {}

  async all(): Promise<PairTradingFeePpmUpdatedEvent[]> {
    return this.repository
      .createQueryBuilder('pairTradingFeePpmUpdatedEvents')
      .leftJoinAndSelect('pairTradingFeePpmUpdatedEvents.block', 'block')
      .leftJoinAndSelect('pairTradingFeePpmUpdatedEvents.pair', 'pair')
      .leftJoinAndSelect('pair.token0', 'token0')
      .leftJoinAndSelect('pair.token1', 'token1')
      .orderBy('block.id', 'ASC')
      .getMany();
  }

  async update(endBlock: number, pairsDictionary: PairsDictionary, tokens: TokensByAddress): Promise<any[]> {
    return this.harvesterService.processEvents({
      entity: 'pair-trading-fee-ppm-updated-events',
      contractName: 'CarbonController',
      eventName: 'PairTradingFeePPMUpdated',
      endBlock,
      repository: this.repository,
      pairsDictionary,
      tokens,
      customFns: [this.parseEvent],
      bigNumberFields: ['prevFeePPM', 'newFeePPM'],
      tagTimestampFromBlock: true,
    });
  }

  async get(startBlock: number, endBlock: number): Promise<PairTradingFeePpmUpdatedEvent[]> {
    return this.repository
      .createQueryBuilder('pairTradingFeePpmUpdatedEvents')
      .leftJoinAndSelect('pairTradingFeePpmUpdatedEvents.block', 'block')
      .leftJoinAndSelect('pairTradingFeePpmUpdatedEvents.pair', 'pair')
      .leftJoinAndSelect('pair.token0', 'token0')
      .leftJoinAndSelect('pair.token1', 'token1')
      .where('block.id > :startBlock', { startBlock })
      .andWhere('block.id <= :endBlock', { endBlock })
      .orderBy('block.id', 'ASC')
      .getMany();
  }

  async parseEvent(args: CustomFnArgs): Promise<any> {
    const { event, pairsDictionary } = args;

    event['pair'] = pairsDictionary[event['token0'].address][event['token1'].address];

    return event;
  }

  async allAsDictionary(): Promise<PairTradingFeePpmDictionary> {
    const all = await this.all();
    const dictionary = {};
    all.forEach((p) => {
      if (!(p.pair.token0.address in dictionary)) {
        dictionary[p.pair.token0.address] = {};
      }
      if (!(p.pair.token1.address in dictionary)) {
        dictionary[p.pair.token1.address] = {};
      }
      dictionary[p.pair.token0.address][p.pair.token1.address] = p.newFeePPM;
      dictionary[p.pair.token1.address][p.pair.token0.address] = p.newFeePPM;
    });
    return dictionary;
  }
}
