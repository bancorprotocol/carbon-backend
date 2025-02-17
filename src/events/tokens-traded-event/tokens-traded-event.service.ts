import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { TokensTradedEvent } from './tokens-traded-event.entity';
import { ContractsNames, CustomFnArgs, HarvesterService } from '../../harvester/harvester.service';
import { PairsDictionary } from '../../pair/pair.service';
import { TokensByAddress } from '../../token/token.service';
import Decimal from 'decimal.js';
import { Deployment } from '../../deployment/deployment.service';

export type TokensTradedEventQueryParams = {
  startBlock?: number;
  endBlock?: number;
  startTime?: number;
  endTime?: number;
  limit?: number;
  type?: string;
  pairId?: number;
  last24h?: boolean;
  order?: QueryOrder; // ASC is default
  normalizeDecimals?: boolean; // NO is default
};

type QueryOrder = 'ASC' | 'DESC';

@Injectable()
export class TokensTradedEventService {
  constructor(
    @InjectRepository(TokensTradedEvent)
    private repository: Repository<TokensTradedEvent>,
    private harvesterService: HarvesterService,
  ) {}

  async update(
    endBlock: number,
    pairsDictionary: PairsDictionary,
    tokens: TokensByAddress,
    deployment: Deployment,
  ): Promise<any> {
    return this.harvesterService.processEvents({
      entity: 'tokens-traded-events',
      contractName: ContractsNames.CarbonController,
      eventName: 'TokensTraded',
      endBlock,
      repository: this.repository,
      stringFields: ['trader'],
      bigNumberFields: ['sourceAmount', 'targetAmount', 'tradingFeeAmount'],
      booleanFields: ['byTargetAmount'],
      customFns: [this.parseEvent],
      tagTimestampFromBlock: true,
      pairsDictionary,
      tokens,
      fetchCallerId: true,
      deployment,
    });
  }

  async parseEvent(args: CustomFnArgs): Promise<any> {
    const { event, rawEvent, pairsDictionary, tokens } = args;

    event['sourceToken'] = tokens[rawEvent.returnValues['sourceToken']];
    event['targetToken'] = tokens[rawEvent.returnValues['targetToken']];
    event['pair'] = pairsDictionary[event['sourceToken'].address][event['targetToken'].address];
    event['type'] = event['sourceToken'].id === event['pair'].token0.id ? 'sell' : 'buy';

    return event;
  }

  async getWithQueryParams(
    params: TokensTradedEventQueryParams = {},
    deployment: Deployment,
  ): Promise<TokensTradedEvent[]> {
    const { startBlock, endBlock, startTime, endTime, limit, type, pairId, last24h, order } = params;
    const queryOrder = order === 'DESC' ? 'DESC' : 'ASC';

    const queryBuilder = this.repository
      .createQueryBuilder('tokensTradedEvents')
      .leftJoinAndSelect('tokensTradedEvents.pair', 'pair')
      .leftJoinAndSelect('pair.token0', 'token0')
      .leftJoinAndSelect('pair.token1', 'token1')
      .leftJoinAndSelect('tokensTradedEvents.block', 'block')
      .leftJoinAndSelect('tokensTradedEvents.sourceToken', 'sourceToken')
      .leftJoinAndSelect('tokensTradedEvents.targetToken', 'targetToken')
      .where('tokensTradedEvents.blockchainType = :blockchainType', { blockchainType: deployment.blockchainType })
      .andWhere('tokensTradedEvents.exchangeId = :exchangeId', { exchangeId: deployment.exchangeId })
      .orderBy('block.id', queryOrder);

    if (startBlock !== undefined) {
      queryBuilder.andWhere('block.id > :startBlock', { startBlock });
    }

    if (endBlock !== undefined) {
      queryBuilder.andWhere('block.id <= :endBlock', { endBlock });
    }

    if (startTime !== undefined) {
      queryBuilder.andWhere('tokensTradedEvents.timestamp >= :startTime', { startTime: new Date(startTime * 1000) });
    }

    if (endTime !== undefined) {
      queryBuilder.andWhere('tokensTradedEvents.timestamp <= :endTime', { endTime: new Date(endTime) });
    }

    if (type !== undefined) {
      queryBuilder.andWhere('tokensTradedEvents.type = :type', { type });
    }

    if (pairId !== undefined) {
      queryBuilder.andWhere('pair.id = :pairId', { pairId });
    }

    if (last24h === true) {
      queryBuilder.andWhere(`tokensTradedEvents.timestamp >= NOW() - INTERVAL '24 hours'`);
    }

    if (limit !== undefined) {
      queryBuilder.take(limit);
    }

    const trades = await queryBuilder.getMany();

    // normalize amounts
    if (params.normalizeDecimals === true) {
      trades.forEach((t) => {
        t.sourceAmount = new Decimal(t.sourceAmount).div(`1e${t.sourceToken.decimals}`).toString();
        t.targetAmount = new Decimal(t.targetAmount).div(`1e${t.targetToken.decimals}`).toString();
        if (t.byTargetAmount) {
          t.tradingFeeAmount = new Decimal(t.tradingFeeAmount).div(`1e${t.sourceToken.decimals}`).toString();
        } else {
          t.tradingFeeAmount = new Decimal(t.tradingFeeAmount).div(`1e${t.targetToken.decimals}`).toString();
        }
      });
    }

    return trades;
  }

  async get(startBlock: number, endBlock: number, deployment: Deployment): Promise<TokensTradedEvent[]> {
    return this.repository
      .createQueryBuilder('tokensTradedEvents')
      .leftJoinAndSelect('tokensTradedEvents.block', 'block')
      .leftJoinAndSelect('tokensTradedEvents.pair', 'pair')
      .leftJoinAndSelect('tokensTradedEvents.sourceToken', 'sourceToken')
      .leftJoinAndSelect('tokensTradedEvents.targetToken', 'targetToken')
      .where('block.id >= :startBlock', { startBlock })
      .andWhere('block.id <= :endBlock', { endBlock })
      .andWhere('tokensTradedEvents.blockchainType = :blockchainType', { blockchainType: deployment.blockchainType })
      .andWhere('tokensTradedEvents.exchangeId = :exchangeId', { exchangeId: deployment.exchangeId })
      .orderBy('block.id', 'ASC')
      .getMany();
  }

  async volume24hByToken(deployment: Deployment): Promise<any> {
    const trades = await this.getWithQueryParams({ last24h: true, normalizeDecimals: true }, deployment);

    const result = {};
    trades.forEach((t) => {
      if (!result[t.sourceToken.id]) {
        result[t.sourceToken.id] = new Decimal(0);
      }

      if (!result[t.targetToken.id]) {
        result[t.targetToken.id] = new Decimal(0);
      }

      result[t.sourceToken.id] = new Decimal(result[t.sourceToken.id]).add(new Decimal(t.sourceAmount));
      result[t.targetToken.id] = new Decimal(result[t.targetToken.id]).add(new Decimal(t.targetAmount));
    });

    return result;
  }

  async volume24hByPair(deployment: Deployment): Promise<any> {
    const trades = await this.getWithQueryParams({ last24h: true, normalizeDecimals: true }, deployment);

    const result = {};
    trades.forEach((t) => {
      if (!result[t.pair.id]) {
        result[t.pair.id] = {
          token0Volume: new Decimal(0),
          token1Volume: new Decimal(0),
        };
      }

      if (t.pair.token0.id === t.sourceToken.id) {
        result[t.pair.id].token0Volume = result[t.pair.id].token0Volume.add(new Decimal(t.sourceAmount));
        result[t.pair.id].token1Volume = result[t.pair.id].token1Volume.add(new Decimal(t.targetAmount));
      } else {
        result[t.pair.id].token0Volume = result[t.pair.id].token0Volume.add(new Decimal(t.targetAmount));
        result[t.pair.id].token1Volume = result[t.pair.id].token1Volume.add(new Decimal(t.sourceAmount));
      }
    });

    return result;
  }

  async lastTradesByPair(deployment: Deployment): Promise<any> {
    const trades = await this.repository
      .createQueryBuilder('tokensTradedEvents')
      .leftJoinAndSelect('tokensTradedEvents.pair', 'pair')
      .leftJoinAndSelect('pair.token0', 'token0')
      .leftJoinAndSelect('pair.token1', 'token1')
      .leftJoinAndSelect('tokensTradedEvents.block', 'block')
      .leftJoinAndSelect('tokensTradedEvents.sourceToken', 'sourceToken')
      .leftJoinAndSelect('tokensTradedEvents.targetToken', 'targetToken')
      .where('tokensTradedEvents.blockchainType = :blockchainType', { blockchainType: deployment.blockchainType })
      .andWhere('tokensTradedEvents.exchangeId = :exchangeId', { exchangeId: deployment.exchangeId })
      .orderBy('pair.id', 'DESC')
      .addOrderBy('block.id', 'DESC')
      .distinctOn(['pair.id'])
      .getMany();

    const result = {};
    trades.forEach((t) => {
      const sourceAmount = new Decimal(t.sourceAmount).div(`1e${t.sourceToken.decimals}`);
      const targetAmount = new Decimal(t.targetAmount).div(`1e${t.targetToken.decimals}`);
      if (sourceAmount.greaterThan(0) && targetAmount.greaterThan(0)) {
        const price = t.type === 'buy' ? sourceAmount.div(targetAmount) : targetAmount.div(sourceAmount);
        result[t.pair.id] = price.toString();
      } else {
        result[t.pair.id] = '0';
      }
    });

    return result;
  }

  async getOne(id: string) {
    return this.repository
      .createQueryBuilder('tokensTradedEvents')
      .leftJoinAndSelect('tokensTradedEvents.block', 'block')
      .leftJoinAndSelect('tokensTradedEvents.pair', 'pair')
      .leftJoinAndSelect('tokensTradedEvents.sourceToken', 'token0')
      .leftJoinAndSelect('tokensTradedEvents.targetToken', 'token1')
      .where('tokensTradedEvents.id = :id', { id })
      .getOne();
  }
}
