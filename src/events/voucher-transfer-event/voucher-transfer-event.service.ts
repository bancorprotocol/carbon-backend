import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { VoucherTransferEvent } from './voucher-transfer-event.entity';
import { ContractsNames, CustomFnArgs, HarvesterService } from '../../harvester/harvester.service';
import { BigNumber } from '@ethersproject/bignumber';
import { Deployment } from '../../deployment/deployment.service';

@Injectable()
export class VoucherTransferEventService {
  constructor(
    @InjectRepository(VoucherTransferEvent)
    private repository: Repository<VoucherTransferEvent>,
    private harvesterService: HarvesterService,
  ) {}

  async all(deployment: Deployment): Promise<VoucherTransferEvent[]> {
    return this.repository
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.block', 'block')
      .where('v.blockchainType = :blockchainType', { blockchainType: deployment.blockchainType })
      .andWhere('v.exchangeId = :exchangeId', { exchangeId: deployment.exchangeId })
      .orderBy('block.id', 'ASC')
      .getMany();
  }

  async update(endBlock: number, deployment: Deployment): Promise<any> {
    return this.harvesterService.processEvents({
      entity: 'voucher-transfer-events',
      contractName: ContractsNames.CarbonVoucher,
      eventName: 'Transfer',
      endBlock,
      repository: this.repository,
      customFns: [this.parseEvent],
      tagTimestampFromBlock: true,
      stringFields: ['from', 'to'],
      deployment, // Include deployment for blockchainType and exchangeId
    });
  }

  async get(startBlock: number, endBlock: number, deployment: Deployment): Promise<VoucherTransferEvent[]> {
    return this.repository
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.block', 'block')
      .where('block.id >= :startBlock', { startBlock })
      .andWhere('block.id <= :endBlock', { endBlock })
      .andWhere('v.blockchainType = :blockchainType', { blockchainType: deployment.blockchainType })
      .andWhere('v.exchangeId = :exchangeId', { exchangeId: deployment.exchangeId })
      .orderBy('block.id', 'ASC')
      .getMany();
  }

  async parseEvent(args: CustomFnArgs): Promise<any> {
    const { event, rawEvent } = args;

    // parse strategy id
    event['strategyId'] = BigNumber.from(rawEvent.returnValues['tokenId']).toString();

    return event;
  }
}
