import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { PairCreatedEvent } from './pair-created-event.entity';
import { ContractsNames, HarvesterService } from '../../harvester/harvester.service';
import { Deployment } from '../../deployment/deployment.service';

@Injectable()
export class PairCreatedEventService {
  constructor(
    @InjectRepository(PairCreatedEvent)
    private repository: Repository<PairCreatedEvent>,
    private harvesterService: HarvesterService,
  ) {}

  async update(endBlock: number, deployment: Deployment): Promise<any> {
    return this.harvesterService.processEvents({
      entity: 'pair-created-events',
      contractName: ContractsNames.CarbonController,
      eventName: 'PairCreated',
      endBlock,
      repository: this.repository,
      stringFields: ['token0', 'token1'],
      tagTimestampFromBlock: true,
      deployment, // Pass deployment here
    });
  }

  async get(startBlock: number, endBlock: number, deployment: Deployment): Promise<PairCreatedEvent[]> {
    return this.repository
      .createQueryBuilder('pairCreatedEvent')
      .leftJoinAndSelect('pairCreatedEvent.block', 'block')
      .where('block.id >= :startBlock', { startBlock })
      .andWhere('block.id <= :endBlock', { endBlock })
      .andWhere('pairCreatedEvent.blockchainType = :blockchainType', { blockchainType: deployment.blockchainType })
      .andWhere('pairCreatedEvent.exchangeId = :exchangeId', { exchangeId: deployment.exchangeId })
      .orderBy('block.id', 'ASC')
      .getMany();
  }
}
