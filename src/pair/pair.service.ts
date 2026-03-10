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
import { GradientPairTradingFeePPMEventService } from '../gradient/events/gradient-pair-trading-fee-ppm-event.service';
import { GradientTradingFeePPMEventService } from '../gradient/events/gradient-trading-fee-ppm-event.service';
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
    private gradientPairTradingFeePpmService: GradientPairTradingFeePPMEventService,
    private gradientTradingFeePpmService: GradientTradingFeePPMEventService,
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
    for (const e of events) {
      if (!tokens[e.token1] || !tokens[e.token0]) {
        this.logger.warn('Token not found', e.token1, e.token0);
        continue;
      }

      const existing = await this.pair.findOne({
        where: {
          blockchainType: deployment.blockchainType,
          exchangeId: deployment.exchangeId,
          token0: { id: tokens[e.token0].id },
          token1: { id: tokens[e.token1].id },
        },
      });
      if (existing) continue;

      pairs.push(
        this.pair.create({
          token0: tokens[e.token0],
          token1: tokens[e.token1],
          name: `${tokens[e.token0].symbol}_${tokens[e.token1].symbol}`,
          block: e.block,
          blockchainType: deployment.blockchainType,
          exchangeId: deployment.exchangeId,
        }),
      );
    }

    if (pairs.length > 0) {
      await this.pair.save(pairs);
    }
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
    const defaultFeeEvent = await this.tradingFeePpmService.last(deployment);
    const gradientDefaultFeeEvent = await this.gradientTradingFeePpmService.last(deployment);
    const defaultFee = defaultFeeEvent ? defaultFeeEvent.newFeePPM : 0;
    const gradientDefaultFee = gradientDefaultFeeEvent ? gradientDefaultFeeEvent.newFeePPM : defaultFee;

    const rawPairFees = await this.pairTradingFeePpmService.allAsDictionary(deployment);
    const gradientPairFees = await this.gradientPairTradingFeePpmService.allAsDictionary(deployment);

    // Normalize regular pair fees to lowercase keys for consistent lookup
    const pairFees: { [addr: string]: { [addr: string]: number } } = {};
    for (const [k1, v1] of Object.entries(rawPairFees)) {
      const lk1 = k1.toLowerCase();
      if (!pairFees[lk1]) pairFees[lk1] = {};
      for (const [k2, v2] of Object.entries(v1 as any)) {
        pairFees[lk1][k2.toLowerCase()] = v2 as number;
      }
    }

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
      const t0 = pair.token0_address?.toLowerCase();
      const t1 = pair.token1_address?.toLowerCase();
      if (!t0 || !t1) continue;

      const [sortedToken0, sortedToken1] = [t0, t1].sort((a, b) => a.localeCompare(b));
      const pairKey = `${sortedToken0}_${sortedToken1}`;

      const regularPairFee = pairFees[t0]?.[t1] ?? pairFees[t1]?.[t0];
      const gradientPairFee = gradientPairFees[t0]?.[t1] ?? gradientPairFees[t1]?.[t0];
      const fee = regularPairFee ?? gradientPairFee ?? defaultFee;
      result[pairKey] = fee;
    }

    // Include gradient-only pairs that may not be in the regular pairs table
    for (const t0 of Object.keys(gradientPairFees)) {
      for (const t1 of Object.keys(gradientPairFees[t0])) {
        const [sortedToken0, sortedToken1] = [t0, t1].sort((a, b) => a.localeCompare(b));
        const pairKey = `${sortedToken0}_${sortedToken1}`;
        if (!(pairKey in result)) {
          result[pairKey] = gradientPairFees[t0][t1];
        }
      }
    }

    return result;
  }
}
