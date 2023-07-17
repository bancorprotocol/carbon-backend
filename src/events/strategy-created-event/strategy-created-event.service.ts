import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { StrategyCreatedEvent } from './strategy-created-event.entity';
import { HarvesterService } from '../../harvester/harvester.service';
import { PairsDictionary } from 'src/pair/pair.service';
import { TokensByAddress } from 'src/token/token.service';

@Injectable()
export class StrategyCreatedEventService {
  constructor(
    @InjectRepository(StrategyCreatedEvent)
    private repository: Repository<StrategyCreatedEvent>,
    private harvesterService: HarvesterService,
  ) {}

  async update(
    upToBlock: number,
    pairs: PairsDictionary,
    tokens: TokensByAddress,
  ): Promise<any[]> {
    return this.harvesterService.processEvents({
      entity: 'strategy-created-events',
      contractName: 'CarbonController',
      eventName: 'StrategyCreated',
      upToBlock,
      repository: this.repository,
      fields: [],
    });
  }

  async get(
    startBlock: number,
    upToBlock: number,
  ): Promise<StrategyCreatedEvent[]> {
    return this.repository
      .createQueryBuilder('poolAddedEvent')
      .leftJoinAndSelect('poolAddedEvent.pool', 'pool')
      .leftJoinAndSelect('poolAddedEvent.block', 'block')
      .leftJoinAndSelect('poolAddedEvent.poolCollection', 'poolCollection')
      .where('block.id > :startBlock', { startBlock })
      .andWhere('block.id <= :upToBlock', { upToBlock })
      .orderBy('block.id', 'ASC')
      .getMany();
  }
}
