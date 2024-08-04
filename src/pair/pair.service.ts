import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { Pair } from './pair.entity';
import { HarvesterService } from '../harvester/harvester.service';
import { decimalsABI, symbolABI } from '../abis/erc20.abi';
import { PairCreatedEvent } from '../events/pair-created-event/pair-created-event.entity';
import { TokensByAddress } from '../token/token.service';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { PairCreatedEventService } from '../events/pair-created-event/pair-created-event.service';
import * as _ from 'lodash';
import { Deployment } from '../deployment/deployment.service';

interface PairDictionaryItem {
  [address: string]: Pair;
}

export interface PairsDictionary {
  [address: string]: PairDictionaryItem;
}

@Injectable()
export class PairService {
  constructor(
    @InjectRepository(Pair) private pair: Repository<Pair>,
    private harvesterService: HarvesterService,
    private lastProcessedBlockService: LastProcessedBlockService,
    private pairCreatedEventService: PairCreatedEventService,
  ) {}

  async update(endBlock: number, tokens: TokensByAddress, deployment: Deployment): Promise<void> {
    const lastProcessedEntity = `${deployment.blockchainType}-${deployment.exchangeId}-pairs`;

    // figure out start block
    const lastProcessedBlockNumber = await this.lastProcessedBlockService.getOrInit(lastProcessedEntity, 1);

    // fetch pair created events
    const newEvents = await this.pairCreatedEventService.get(lastProcessedBlockNumber, endBlock, deployment);

    // create new pairs
    const eventBatches = _.chunk(newEvents, 1000);
    for (const eventsBatch of eventBatches) {
      await this.createFromEvents(eventsBatch, tokens, deployment);
      await this.lastProcessedBlockService.update(lastProcessedEntity, eventsBatch[eventsBatch.length - 1].block.id);
    }

    // update last processed block number
    await this.lastProcessedBlockService.update(lastProcessedEntity, endBlock);
  }

  async createFromEvents(events: PairCreatedEvent[], tokens: TokensByAddress, deployment: Deployment) {
    const pairs = [];
    events.forEach((e) => {
      if (!tokens[e.token1] || !tokens[e.token0]) {
        console.log('Token not found', e.token1, e.token0);
      }
      pairs.push(
        this.pair.create({
          token0: tokens[e.token0],
          token1: tokens[e.token1],
          name: `${tokens[e.token0].symbol}_${tokens[e.token1].symbol}`,
          block: e.block,
          blockchainType: deployment.blockchainType, // Include blockchainType
          exchangeId: deployment.exchangeId, // Include exchangeId
        }),
      );
    });

    await this.pair.save(pairs);
  }

  async getSymbols(addresses: string[], deployment: Deployment): Promise<string[]> {
    const symbols = await this.harvesterService.stringsWithMulticall(
      addresses,
      symbolABI,
      'symbol',
      deployment, // Use deployment
    );
    const index = addresses.indexOf(deployment.gasToken.address);
    if (index >= 0) {
      symbols[index] = deployment.gasToken.symbol;
    }
    return symbols;
  }

  async getDecimals(addresses: string[], deployment: Deployment): Promise<number[]> {
    const decimals = await this.harvesterService.integersWithMulticall(
      addresses,
      decimalsABI,
      'decimals',
      deployment, // Use deployment
    );
    const index = addresses.indexOf(deployment.gasToken.address);
    if (index >= 0) {
      decimals[index] = 18;
    }
    return decimals;
  }

  async all(deployment: Deployment): Promise<Pair[]> {
    return this.pair
      .createQueryBuilder('pools')
      .leftJoinAndSelect('pools.block', 'block')
      .leftJoinAndSelect('pools.token0', 'token0')
      .leftJoinAndSelect('pools.token1', 'token1')
      .where('pools.exchangeId = :exchangeId', { exchangeId: deployment.exchangeId })
      .andWhere('pools.blockchainType = :blockchainType', { blockchainType: deployment.blockchainType })
      .getMany();
  }

  async allAsDictionary(deployment: Deployment): Promise<PairsDictionary> {
    const all = await this.all(deployment);
    const dictionary: PairsDictionary = {};
    all.forEach((p) => {
      if (!(p.token0.address in dictionary)) {
        dictionary[p.token0.address] = {};
      }
      if (!(p.token1.address in dictionary)) {
        dictionary[p.token1.address] = {};
      }
      dictionary[p.token0.address][p.token1.address] = p;
      dictionary[p.token1.address][p.token0.address] = p;
    });
    return dictionary;
  }
}
