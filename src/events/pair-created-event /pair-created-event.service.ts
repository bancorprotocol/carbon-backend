import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { PairCreatedEvent } from './pair-created-event.entity';
import { HarvesterService } from '../../harvester/harvester.service';

@Injectable()
export class PairCreatedEventService {
  constructor(
    @InjectRepository(PairCreatedEvent)
    private repository: Repository<PairCreatedEvent>,
    private harvesterService: HarvesterService,
  ) {}

  async update(upToBlock: number): Promise<any[]> {
    return this.harvesterService.processEvents({
      entity: 'pair-created-events',
      contractName: 'CarbonController',
      eventName: 'PairCreated',
      upToBlock,
      repository: this.repository,
      fields: ['token0', 'token1'],
    });
  }

  async get(
    startBlock: number,
    upToBlock: number,
  ): Promise<PairCreatedEvent[]> {
    return this.repository
      .createQueryBuilder('pairCreatedEvent')
      .leftJoinAndSelect('pairCreatedEvent.block', 'block')
      .where('block.id > :startBlock', { startBlock })
      .andWhere('block.id <= :upToBlock', { upToBlock })
      .orderBy('block.id', 'ASC')
      .getMany();
  }
}
