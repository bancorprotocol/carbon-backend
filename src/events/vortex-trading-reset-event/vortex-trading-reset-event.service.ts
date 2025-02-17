import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { VortexTradingResetEvent } from './vortex-trading-reset-event.entity';
import { ContractsNames, CustomFnArgs, HarvesterService } from '../../harvester/harvester.service';
import { Deployment } from '../../deployment/deployment.service';
import { BigNumber } from '@ethersproject/bignumber';

@Injectable()
export class VortexTradingResetEventService {
  constructor(
    @InjectRepository(VortexTradingResetEvent)
    private repository: Repository<VortexTradingResetEvent>,
    private harvesterService: HarvesterService,
  ) {}

  async update(endBlock: number, deployment: Deployment): Promise<any> {
    if (!deployment.contracts[ContractsNames.CarbonVortex]) {
      return;
    }

    return this.harvesterService.processEvents({
      entity: 'vortex-trading-reset-events',
      contractName: ContractsNames.CarbonVortex,
      eventName: 'TradingReset',
      endBlock,
      repository: this.repository,
      stringFields: ['token'],
      customFns: [this.parseEvent],
      tagTimestampFromBlock: true,
      deployment,
    });
  }

  async get(startBlock: number, endBlock: number, deployment: Deployment): Promise<VortexTradingResetEvent[]> {
    return this.repository
      .createQueryBuilder('vortexTradingResetEvents')
      .leftJoinAndSelect('vortexTradingResetEvents.block', 'block')
      .where('block.id >= :startBlock', { startBlock })
      .andWhere('block.id <= :endBlock', { endBlock })
      .andWhere('vortexTradingResetEvents.blockchainType = :blockchainType', {
        blockchainType: deployment.blockchainType,
      })
      .andWhere('vortexTradingResetEvents.exchangeId = :exchangeId', { exchangeId: deployment.exchangeId })
      .orderBy('block.id', 'ASC')
      .getMany();
  }

  async all(deployment: Deployment): Promise<VortexTradingResetEvent[]> {
    return this.repository
      .createQueryBuilder('vortexTradingResetEvents')
      .leftJoinAndSelect('vortexTradingResetEvents.block', 'block')
      .where('vortexTradingResetEvents.blockchainType = :blockchainType', {
        blockchainType: deployment.blockchainType,
      })
      .andWhere('vortexTradingResetEvents.exchangeId = :exchangeId', { exchangeId: deployment.exchangeId })
      .orderBy('block.id', 'ASC')
      .getMany();
  }

  private async parseEvent(args: CustomFnArgs): Promise<any> {
    const { event, rawEvent } = args;
    event['sourceAmount'] = BigNumber.from(rawEvent.returnValues.price.sourceAmount).toString();
    event['targetAmount'] = BigNumber.from(rawEvent.returnValues.price.targetAmount).toString();
    return event;
  }

  async getOne(id: number) {
    return this.repository.findOne({ where: { id } });
  }
}
