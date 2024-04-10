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

  async update(endBlock: number): Promise<any[]> {
    return this.harvesterService.processEvents({
      entity: 'pair-created-events',
      contractName: 'CarbonController',
      eventName: 'PairCreated',
      endBlock,
      repository: this.repository,
      stringFields: ['token0', 'token1'],
      tagTimestampFromBlock: true,
    });
  }

  async get(startBlock: number, endBlock: number): Promise<PairCreatedEvent[]> {
    return this.repository
      .createQueryBuilder('pairCreatedEvent')
      .leftJoinAndSelect('pairCreatedEvent.block', 'block')
      .where('block.id > :startBlock', { startBlock })
      .andWhere('block.id <= :endBlock', { endBlock })
      .orderBy('block.id', 'ASC')
      .getMany();
  }
}
