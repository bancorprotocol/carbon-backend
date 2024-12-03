import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { PairTradingFeePpmUpdatedEvent } from './pair-trading-fee-ppm-updated-event.entity';
import { ContractsNames, CustomFnArgs, HarvesterService } from '../../harvester/harvester.service';
import { PairsDictionary } from '../../pair/pair.service';
import { TokensByAddress } from '../../token/token.service';
import { Deployment } from '../../deployment/deployment.service';

export interface PairTradingFeePpmDictionary {
  [address: string]: number;
}

@Injectable()
export class PairTradingFeePpmUpdatedEventService {
  constructor(
    @InjectRepository(PairTradingFeePpmUpdatedEvent)
    private repository: Repository<PairTradingFeePpmUpdatedEvent>,
    private harvesterService: HarvesterService,
  ) {}

  async update(
    endBlock: number,
    pairsDictionary: PairsDictionary,
    tokens: TokensByAddress,
    deployment: Deployment,
  ): Promise<any> {
    return this.harvesterService.processEvents({
      entity: 'pair-trading-fee-ppm-updated-events',
      contractName: ContractsNames.CarbonController,
      eventName: 'PairTradingFeePPMUpdated',
      endBlock,
      repository: this.repository,
      pairsDictionary,
      tokens,
      customFns: [this.parseEvent],
      bigNumberFields: ['prevFeePPM', 'newFeePPM'],
      tagTimestampFromBlock: true,
      deployment,
    });
  }

  async parseEvent(args: CustomFnArgs): Promise<any> {
    const { event, pairsDictionary } = args;

    event['pair'] = pairsDictionary[event['token0'].address][event['token1'].address];

    return event;
  }

  async all(deployment: Deployment): Promise<PairTradingFeePpmUpdatedEvent[]> {
    return this.repository
      .createQueryBuilder('pairTradingFeePpmUpdatedEvents')
      .leftJoinAndSelect('pairTradingFeePpmUpdatedEvents.block', 'block')
      .leftJoinAndSelect('pairTradingFeePpmUpdatedEvents.pair', 'pair')
      .leftJoinAndSelect('pair.token0', 'token0')
      .leftJoinAndSelect('pair.token1', 'token1')
      .where('pairTradingFeePpmUpdatedEvents.blockchainType = :blockchainType', {
        blockchainType: deployment.blockchainType,
      })
      .andWhere('pairTradingFeePpmUpdatedEvents.exchangeId = :exchangeId', { exchangeId: deployment.exchangeId })
      .orderBy('block.id', 'ASC')
      .getMany();
  }

  async allAsDictionary(deployment: Deployment): Promise<PairTradingFeePpmDictionary> {
    const all = await this.all(deployment);
    const dictionary = {};
    all.forEach((p) => {
      if (!(p.pair.token0.address in dictionary)) {
        dictionary[p.pair.token0.address] = {};
      }
      if (!(p.pair.token1.address in dictionary)) {
        dictionary[p.pair.token1.address] = {};
      }
      dictionary[p.pair.token0.address][p.pair.token1.address] = p.newFeePPM;
      dictionary[p.pair.token1.address][p.pair.token0.address] = p.newFeePPM;
    });
    return dictionary;
  }
}
