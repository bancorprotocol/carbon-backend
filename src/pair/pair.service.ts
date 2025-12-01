import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable, Logger } from '@nestjs/common';
import { Pair } from './pair.entity';
import { HarvesterService } from '../harvester/harvester.service';
import { decimalsABI, symbolABI } from '../abis/erc20.abi';
import { PairCreatedEvent } from '../events/pair-created-event/pair-created-event.entity';
import { TokensByAddress } from '../token/token.service';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { PairCreatedEventService } from '../events/pair-created-event/pair-created-event.service';
import { PairTradingFeePpmUpdatedEventService } from '../events/pair-trading-fee-ppm-updated-event/pair-trading-fee-ppm-updated-event.service';
import { TradingFeePpmUpdatedEventService } from '../events/trading-fee-ppm-updated-event/trading-fee-ppm-updated-event.service';
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
  private readonly logger = new Logger(PairService.name);
  constructor(
    @InjectRepository(Pair) private pair: Repository<Pair>,
    private harvesterService: HarvesterService,
    private lastProcessedBlockService: LastProcessedBlockService,
    private pairCreatedEventService: PairCreatedEventService,
    private pairTradingFeePpmService: PairTradingFeePpmUpdatedEventService,
    private tradingFeePpmService: TradingFeePpmUpdatedEventService,
  ) {}

  async update(endBlock: number, tokens: TokensByAddress, deployment: Deployment): Promise<void> {
    const lastProcessedEntity = `${deployment.blockchainType}-${deployment.exchangeId}-pairs`;

    // figure out start block
    const lastProcessedBlockNumber = await this.lastProcessedBlockService.getOrInit(lastProcessedEntity, 1);

    // fetch pair created events
    const newEvents = await this.pairCreatedEventService.get(lastProcessedBlockNumber + 1, endBlock, deployment);

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
        this.logger.warn('Token not found', e.token1, e.token0);
        return;
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

  async getTradingFeesByPair(deployment: Deployment): Promise<{ [pairKey: string]: number }> {
    // Get default trading fee
    const defaultFeeEvent = await this.tradingFeePpmService.last(deployment);
    const defaultFee = defaultFeeEvent ? defaultFeeEvent.newFeePPM : 0;

    // Get pair-specific fees
    const pairFees = await this.pairTradingFeePpmService.allAsDictionary(deployment);

    // Get all pairs and create result map
    const query = `
      SELECT
        t0.address as token0_address,
        t1.address as token1_address,
        p.id as pair_id
      FROM pairs p
      LEFT JOIN tokens t0 ON p."token0Id" = t0.id
      LEFT JOIN tokens t1 ON p."token1Id" = t1.id
      WHERE p."blockchainType" = $1
        AND p."exchangeId" = $2
    `;

    const pairs = await this.pair.manager.query(query, [deployment.blockchainType, deployment.exchangeId]);

    const result: { [pairKey: string]: number } = {};

    for (const pair of pairs) {
      // Tokens are already stored alphabetically in the database
      const pairKey = `${pair.token0_address}_${pair.token1_address}`;
      const pairFee = pairFees[pair.pair_id];
      result[pairKey] = pairFee !== undefined ? pairFee : defaultFee;
    }

    return result;
  }
}
