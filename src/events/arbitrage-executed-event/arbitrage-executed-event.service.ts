import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { ArbitrageExecutedEvent } from './arbitrage-executed-event.entity';
import { ContractsNames, HarvesterService } from '../../harvester/harvester.service';
import { Deployment } from '../../deployment/deployment.service';

@Injectable()
export class ArbitrageExecutedEventService {
  constructor(
    @InjectRepository(ArbitrageExecutedEvent)
    private repository: Repository<ArbitrageExecutedEvent>,
    private harvesterService: HarvesterService,
  ) {}

  async update(endBlock: number, deployment: Deployment): Promise<any> {
    if (!deployment.contracts[ContractsNames.BancorArbitrage]) {
      return;
    }

    return this.harvesterService.processEvents({
      entity: 'arbitrage-executed-events',
      contractName: ContractsNames.BancorArbitrage,
      eventName: 'ArbitrageExecuted',
      endBlock,
      repository: this.repository,
      stringFields: [
        'caller',
        'platformIds',
        'tokenPath',
        'sourceTokens',
        'sourceAmounts',
        'protocolAmounts',
        'rewardAmounts',
      ],
      tagTimestampFromBlock: true,
      deployment,
    });
  }

  async get(startBlock: number, endBlock: number, deployment: Deployment): Promise<ArbitrageExecutedEvent[]> {
    return this.repository
      .createQueryBuilder('arbitrageExecutedEvents')
      .leftJoinAndSelect('arbitrageExecutedEvents.block', 'block')
      .where('block.id >= :startBlock', { startBlock })
      .andWhere('block.id <= :endBlock', { endBlock })
      .andWhere('arbitrageExecutedEvents.blockchainType = :blockchainType', {
        blockchainType: deployment.blockchainType,
      })
      .andWhere('arbitrageExecutedEvents.exchangeId = :exchangeId', {
        exchangeId: deployment.exchangeId,
      })
      .orderBy('block.id', 'ASC')
      .getMany();
  }

  async all(deployment: Deployment): Promise<ArbitrageExecutedEvent[]> {
    return this.repository
      .createQueryBuilder('arbitrageExecutedEvents')
      .leftJoinAndSelect('arbitrageExecutedEvents.block', 'block')
      .where('arbitrageExecutedEvents.blockchainType = :blockchainType', {
        blockchainType: deployment.blockchainType,
      })
      .andWhere('arbitrageExecutedEvents.exchangeId = :exchangeId', {
        exchangeId: deployment.exchangeId,
      })
      .orderBy('block.id', 'ASC')
      .getMany();
  }

  async getOne(id: number) {
    return this.repository.findOne({ where: { id } });
  }
}
