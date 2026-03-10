import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BigNumber } from '@ethersproject/bignumber';
import { VoucherTransferEvent } from '../../events/voucher-transfer-event/voucher-transfer-event.entity';
import { ContractsNames, CustomFnArgs, HarvesterService } from '../../harvester/harvester.service';
import { Deployment, DeploymentService } from '../../deployment/deployment.service';

@Injectable()
export class GradientVoucherTransferEventService {
  constructor(
    @InjectRepository(VoucherTransferEvent)
    private repository: Repository<VoucherTransferEvent>,
    private harvesterService: HarvesterService,
    private deploymentService: DeploymentService,
  ) {}

  async update(endBlock: number, deployment: Deployment): Promise<any> {
    if (!this.deploymentService.hasGradientSupport(deployment)) return;
    if (!deployment.contracts.GradientVoucher?.address) return;

    return this.harvesterService.processEvents({
      entity: 'gradient-voucher-transfer-events',
      contractName: ContractsNames.GradientVoucher,
      eventName: 'Transfer',
      endBlock,
      repository: this.repository,
      customFns: [this.parseEvent],
      tagTimestampFromBlock: true,
      stringFields: ['from', 'to'],
      skipPreClearing: true,
      deployment,
    });
  }

  async parseEvent(args: CustomFnArgs): Promise<any> {
    const { event, rawEvent } = args;
    event['strategyId'] = BigNumber.from(rawEvent.returnValues['tokenId']).toString();
    return event;
  }
}
