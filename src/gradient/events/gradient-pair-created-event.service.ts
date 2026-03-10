import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PairCreatedEvent } from '../../events/pair-created-event/pair-created-event.entity';
import { ContractsNames, HarvesterService } from '../../harvester/harvester.service';
import { Deployment, DeploymentService } from '../../deployment/deployment.service';

@Injectable()
export class GradientPairCreatedEventService {
  constructor(
    @InjectRepository(PairCreatedEvent)
    private repository: Repository<PairCreatedEvent>,
    private harvesterService: HarvesterService,
    private deploymentService: DeploymentService,
  ) {}

  async update(endBlock: number, deployment: Deployment): Promise<any> {
    if (!this.deploymentService.hasGradientSupport(deployment)) return;

    return this.harvesterService.processEvents({
      entity: 'gradient-pair-created-events',
      contractName: ContractsNames.GradientController,
      eventName: 'PairCreated',
      endBlock,
      repository: this.repository,
      stringFields: ['token0', 'token1'],
      tagTimestampFromBlock: true,
      skipPreClearing: true,
      deployment,
    });
  }
}
