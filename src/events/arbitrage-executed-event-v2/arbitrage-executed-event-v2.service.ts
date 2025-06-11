import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { ArbitrageExecutedEventV2 } from './arbitrage-executed-event-v2.entity';
import { ContractsNames, HarvesterService } from '../../harvester/harvester.service';
import { Deployment } from '../../deployment/deployment.service';

@Injectable()
export class ArbitrageExecutedEventServiceV2 {
  constructor(
    @InjectRepository(ArbitrageExecutedEventV2)
    private repository: Repository<ArbitrageExecutedEventV2>,
    private harvesterService: HarvesterService,
  ) {}

  async update(endBlock: number, deployment: Deployment): Promise<any> {
    if (!deployment.contracts[ContractsNames.BancorArbitrageV2]) {
      return;
    }

    return this.harvesterService.processEvents({
      entity: 'arbitrage-executed-events-v2',
      contractName: ContractsNames.BancorArbitrageV2,
      eventName: 'ArbitrageExecuted',
      endBlock,
      repository: this.repository,
      stringFields: [
        'caller',
        'exchanges',
        'tokenPath',
        'sourceTokens',
        'sourceAmounts',
        'protocolAmounts',
        'rewardAmounts',
      ],
      tagTimestampFromBlock: true,
      deployment,
      contractAddress: deployment.contracts[ContractsNames.BancorArbitrageV2].address,
    });
  }

  async get(startBlock: number, endBlock: number, deployment: Deployment): Promise<ArbitrageExecutedEventV2[]> {
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

  async all(deployment: Deployment): Promise<ArbitrageExecutedEventV2[]> {
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
