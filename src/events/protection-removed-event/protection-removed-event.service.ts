import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { ProtectionRemovedEvent } from './protection-removed-event.entity';
import { ContractsNames, HarvesterService } from '../../harvester/harvester.service';
import { Deployment } from '../../deployment/deployment.service';

@Injectable()
export class ProtectionRemovedEventService {
  constructor(
    @InjectRepository(ProtectionRemovedEvent)
    private repository: Repository<ProtectionRemovedEvent>,
    private harvesterService: HarvesterService,
  ) {}

  async update(endBlock: number, deployment: Deployment): Promise<any> {
    if (!deployment.contracts[ContractsNames.LiquidityProtectionStore]) {
      return;
    }

    return this.harvesterService.processEvents({
      entity: 'protection-removed-events',
      contractName: ContractsNames.LiquidityProtectionStore,
      eventName: 'ProtectionRemoved',
      endBlock,
      repository: this.repository,
      sourceMap: [
        {
          key: 'provider',
          eventKey: '_provider',
        },
        {
          key: 'poolToken',
          eventKey: '_poolToken',
        },
        {
          key: 'reserveToken',
          eventKey: '_reserveToken',
        },
        {
          key: 'poolAmount',
          eventKey: '_poolAmount',
        },
        {
          key: 'reserveAmount',
          eventKey: '_reserveAmount',
        },
      ],
      tagTimestampFromBlock: true,
      deployment,
    });
  }

  async get(startBlock: number, endBlock: number, deployment: Deployment): Promise<ProtectionRemovedEvent[]> {
    return this.repository
      .createQueryBuilder('protectionRemovedEvents')
      .leftJoinAndSelect('protectionRemovedEvents.block', 'block')
      .where('block.id >= :startBlock', { startBlock })
      .andWhere('block.id <= :endBlock', { endBlock })
      .andWhere('protectionRemovedEvents.blockchainType = :blockchainType', {
        blockchainType: deployment.blockchainType,
      })
      .andWhere('protectionRemovedEvents.exchangeId = :exchangeId', {
        exchangeId: deployment.exchangeId,
      })
      .orderBy('block.id', 'ASC')
      .getMany();
  }

  async all(deployment: Deployment): Promise<ProtectionRemovedEvent[]> {
    return this.repository
      .createQueryBuilder('protectionRemovedEvents')
      .leftJoinAndSelect('protectionRemovedEvents.block', 'block')
      .where('protectionRemovedEvents.blockchainType = :blockchainType', {
        blockchainType: deployment.blockchainType,
      })
      .andWhere('protectionRemovedEvents.exchangeId = :exchangeId', {
        exchangeId: deployment.exchangeId,
      })
      .orderBy('block.id', 'ASC')
      .getMany();
  }

  async getOne(id: number) {
    return this.repository.findOne({ where: { id } });
  }
}
