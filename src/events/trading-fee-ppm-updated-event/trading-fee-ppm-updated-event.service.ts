import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { TradingFeePpmUpdatedEvent } from './trading-fee-ppm-updated-event.entity';
import { HarvesterService } from '../../harvester/harvester.service';

@Injectable()
export class TradingFeePpmUpdatedEventService {
  constructor(
    @InjectRepository(TradingFeePpmUpdatedEvent)
    private repository: Repository<TradingFeePpmUpdatedEvent>,
    private harvesterService: HarvesterService,
  ) {}

  async all(): Promise<TradingFeePpmUpdatedEvent[]> {
    return this.repository
      .createQueryBuilder('tradingFeePpmUpdatedEvents')
      .leftJoinAndSelect('tradingFeePpmUpdatedEvents.block', 'block')
      .orderBy('block.id', 'ASC')
      .getMany();
  }

  async update(endBlock: number): Promise<any[]> {
    return this.harvesterService.processEvents({
      entity: 'trading-fee-ppm-updated-events',
      contractName: 'CarbonController',
      eventName: 'TradingFeePPMUpdated',
      endBlock,
      repository: this.repository,
      bigNumberFields: ['prevFeePPM', 'newFeePPM'],
      tagTimestampFromBlock: true,
    });
  }

  async get(startBlock: number, endBlock: number): Promise<TradingFeePpmUpdatedEvent[]> {
    return this.repository
      .createQueryBuilder('tradingFeePpmUpdatedEvents')
      .leftJoinAndSelect('tradingFeePpmUpdatedEvents.block', 'block')
      .leftJoinAndSelect('tradingFeePpmUpdatedEvents.pair', 'pair')
      .leftJoinAndSelect('pair.token0', 'token0')
      .leftJoinAndSelect('pair.token1', 'token1')
      .where('block.id > :startBlock', { startBlock })
      .andWhere('block.id <= :endBlock', { endBlock })
      .orderBy('block.id', 'ASC')
      .getMany();
  }

  async last(): Promise<TradingFeePpmUpdatedEvent> {
    return this.repository.findOne({ where: {}, order: { timestamp: 'DESC' } });
  }
}
