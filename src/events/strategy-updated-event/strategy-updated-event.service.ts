import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { StrategyUpdatedEvent } from './strategy-updated-event.entity';
import { ContractsNames, CustomFnArgs, HarvesterService } from '../../harvester/harvester.service';
import { PairsDictionary } from '../../pair/pair.service';
import { TokensByAddress } from '../../token/token.service';
import { BigNumber } from '@ethersproject/bignumber';
import { Deployment } from '../../deployment/deployment.service';

@Injectable()
export class StrategyUpdatedEventService {
  constructor(
    @InjectRepository(StrategyUpdatedEvent)
    private repository: Repository<StrategyUpdatedEvent>,
    private harvesterService: HarvesterService,
  ) {}

  async all(): Promise<StrategyUpdatedEvent[]> {
    return this.repository
      .createQueryBuilder('strategyUpdatedEvents')
      .leftJoinAndSelect('strategyUpdatedEvents.block', 'block')
      .leftJoinAndSelect('strategyUpdatedEvents.pair', 'pair')
      .leftJoinAndSelect('strategyUpdatedEvents.token0', 'token0')
      .leftJoinAndSelect('strategyUpdatedEvents.token1', 'token1')
      .orderBy('block.id', 'ASC')
      .getMany();
  }

  async update(
    endBlock: number,
    pairsDictionary: PairsDictionary,
    tokens: TokensByAddress,
    deployment: Deployment,
  ): Promise<any> {
    return this.harvesterService.processEvents({
      entity: 'strategy-updated-events',
      contractName: ContractsNames.CarbonController,
      eventName: 'StrategyUpdated',
      endBlock,
      repository: this.repository,
      pairsDictionary,
      tokens,
      deployment,
      customFns: [this.parseEvent],
      numberFields: ['reason'],
      tagTimestampFromBlock: true,
    });
  }

  async get(startBlock: number, endBlock: number, deployment: Deployment): Promise<StrategyUpdatedEvent[]> {
    return this.repository
      .createQueryBuilder('strategyUpdatedEvents')
      .leftJoinAndSelect('strategyUpdatedEvents.block', 'block')
      .leftJoinAndSelect('strategyUpdatedEvents.pair', 'pair')
      .leftJoinAndSelect('strategyUpdatedEvents.token0', 'token0')
      .leftJoinAndSelect('strategyUpdatedEvents.token1', 'token1')
      .where('block.id >= :startBlock', { startBlock })
      .andWhere('block.id <= :endBlock', { endBlock })
      .andWhere('strategyUpdatedEvents.blockchainType = :blockchainType', { blockchainType: deployment.blockchainType })
      .andWhere('strategyUpdatedEvents.exchangeId = :exchangeId', { exchangeId: deployment.exchangeId })
      .orderBy('block.id', 'ASC')
      .getMany();
  }

  async parseEvent(args: CustomFnArgs): Promise<any> {
    const { event, rawEvent } = args;

    // parse id
    event['strategyId'] = BigNumber.from(rawEvent.returnValues['id']).toString();

    // parse orders
    for (let i = 0; i < 2; i++) {
      const key = `order${i}`;
      event[key] = JSON.stringify({
        y: BigNumber.from(rawEvent.returnValues[key]['y']).toString(),
        z: BigNumber.from(rawEvent.returnValues[key]['z']).toString(),
        A: BigNumber.from(rawEvent.returnValues[key]['A']).toString(),
        B: BigNumber.from(rawEvent.returnValues[key]['B']).toString(),
      });
    }

    return event;
  }
}
