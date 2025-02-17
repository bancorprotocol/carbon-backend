import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { StrategyDeletedEvent } from './strategy-deleted-event.entity';
import { ContractsNames, CustomFnArgs, HarvesterService } from '../../harvester/harvester.service';
import { PairsDictionary } from '../../pair/pair.service';
import { TokensByAddress } from '../../token/token.service';
import { BigNumber } from '@ethersproject/bignumber';
import { Deployment } from '../../deployment/deployment.service';

@Injectable()
export class StrategyDeletedEventService {
  constructor(
    @InjectRepository(StrategyDeletedEvent)
    private repository: Repository<StrategyDeletedEvent>,
    private harvesterService: HarvesterService,
  ) {}

  async update(
    endBlock: number,
    pairsDictionary: PairsDictionary,
    tokens: TokensByAddress,
    deployment: Deployment,
  ): Promise<any> {
    return this.harvesterService.processEvents({
      entity: 'strategy-deleted-events',
      contractName: ContractsNames.CarbonController,
      eventName: 'StrategyDeleted',
      endBlock,
      repository: this.repository,
      pairsDictionary,
      tokens,
      deployment,
      customFns: [this.parseEvent],
      tagTimestampFromBlock: true,
    });
  }

  async get(startBlock: number, endBlock: number, deployment: Deployment): Promise<StrategyDeletedEvent[]> {
    return this.repository
      .createQueryBuilder('strategyDeletedEvents')
      .leftJoinAndSelect('strategyDeletedEvents.block', 'block')
      .leftJoinAndSelect('strategyDeletedEvents.pair', 'pair')
      .leftJoinAndSelect('strategyDeletedEvents.token0', 'token0')
      .leftJoinAndSelect('strategyDeletedEvents.token1', 'token1')
      .where('block.id >= :startBlock', { startBlock })
      .andWhere('block.id <= :endBlock', { endBlock })
      .andWhere('strategyDeletedEvents.blockchainType = :blockchainType', { blockchainType: deployment.blockchainType })
      .andWhere('strategyDeletedEvents.exchangeId = :exchangeId', { exchangeId: deployment.exchangeId })
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
