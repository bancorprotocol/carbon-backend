import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { VoucherTransferEvent } from './voucher-transfer-event.entity';
import { CustomFnArgs, HarvesterService } from '../../harvester/harvester.service';
import { BigNumber } from '@ethersproject/bignumber';

@Injectable()
export class VoucherTransferEventService {
  constructor(
    @InjectRepository(VoucherTransferEvent)
    private repository: Repository<VoucherTransferEvent>,
    private harvesterService: HarvesterService,
  ) {}

  async all(): Promise<VoucherTransferEvent[]> {
    return this.repository
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.block', 'block')
      .leftJoinAndSelect('v.strategy', 'strategy')
      .orderBy('block.id', 'ASC')
      .getMany();
  }

  async update(endBlock: number): Promise<any[]> {
    return this.harvesterService.processEvents({
      entity: 'voucher-transfer-events',
      contractName: 'Voucher',
      eventName: 'Transfer',
      endBlock,
      repository: this.repository,
      customFns: [this.parseEvent],
      tagTimestampFromBlock: true,
      stringFields: ['from', 'to'],
    });
  }

  async get(startBlock: number, endBlock: number): Promise<VoucherTransferEvent[]> {
    return this.repository
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.block', 'block')
      .leftJoinAndSelect('v.strategy', 'strategy')
      .where('block.id > :startBlock', { startBlock })
      .andWhere('block.id <= :endBlock', { endBlock })
      .orderBy('block.id', 'ASC')
      .getMany();
  }

  async parseEvent(args: CustomFnArgs): Promise<any> {
    const { event, rawEvent } = args;

    // parse strategy id
    event['strategy'] = {
      id: BigNumber.from(rawEvent.returnValues['tokenId']).toString(),
    };

    return event;
  }
}
