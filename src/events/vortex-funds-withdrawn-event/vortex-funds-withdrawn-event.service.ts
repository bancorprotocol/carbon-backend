import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { VortexFundsWithdrawnEvent } from './vortex-funds-withdrawn-event.entity';
import { ContractsNames, HarvesterService, CustomFnArgs } from '../../harvester/harvester.service';
import { Deployment } from '../../deployment/deployment.service';

@Injectable()
export class VortexFundsWithdrawnEventService {
  constructor(
    @InjectRepository(VortexFundsWithdrawnEvent)
    private repository: Repository<VortexFundsWithdrawnEvent>,
    private harvesterService: HarvesterService,
  ) {}

  async update(endBlock: number, deployment: Deployment): Promise<any> {
    return this.harvesterService.processEvents({
      entity: 'vortex-funds-withdrawn-events',
      contractName: ContractsNames.CarbonVortex,
      eventName: 'FundsWithdrawn',
      endBlock,
      repository: this.repository,
      customFns: [this.parseEvent],
      tagTimestampFromBlock: true,
      deployment,
    });
  }

  async get(startBlock: number, endBlock: number, deployment: Deployment): Promise<VortexFundsWithdrawnEvent[]> {
    return this.repository
      .createQueryBuilder('vortexFundsWithdrawnEvents')
      .leftJoinAndSelect('vortexFundsWithdrawnEvents.block', 'block')
      .where('block.id >= :startBlock', { startBlock })
      .andWhere('block.id <= :endBlock', { endBlock })
      .andWhere('vortexFundsWithdrawnEvents.blockchainType = :blockchainType', {
        blockchainType: deployment.blockchainType,
      })
      .andWhere('vortexFundsWithdrawnEvents.exchangeId = :exchangeId', { exchangeId: deployment.exchangeId })
      .orderBy('block.id', 'ASC')
      .getMany();
  }

  async all(deployment: Deployment): Promise<VortexFundsWithdrawnEvent[]> {
    return this.repository
      .createQueryBuilder('vortexFundsWithdrawnEvents')
      .leftJoinAndSelect('vortexFundsWithdrawnEvents.block', 'block')
      .where('vortexFundsWithdrawnEvents.blockchainType = :blockchainType', {
        blockchainType: deployment.blockchainType,
      })
      .andWhere('vortexFundsWithdrawnEvents.exchangeId = :exchangeId', { exchangeId: deployment.exchangeId })
      .orderBy('block.id', 'ASC')
      .getMany();
  }

  private async parseEvent(args: CustomFnArgs): Promise<any> {
    const { event, rawEvent } = args;

    event['tokens'] = rawEvent.returnValues.tokens;
    event['amounts'] = rawEvent.returnValues.amounts;
    event['caller'] = rawEvent.returnValues.caller;
    event['target'] = rawEvent.returnValues.target;

    return event;
  }

  async getOne(id: number) {
    return this.repository.findOne({ where: { id } });
  }
}
