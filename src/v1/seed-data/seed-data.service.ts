import { Injectable } from '@nestjs/common';
import {
  EncodedStrategy,
  RegularEncodedStrategy,
  GradientEncodedStrategy,
  SeedDataResponse,
} from './seed-data.dto';
import { StrategyRealtimeWithOwner } from '../../strategy-realtime/strategy-realtime.service';
import { GradientRealtimeWithOwner } from '../../gradient/gradient-realtime.service';

const SCHEME_VERSION = 8;

@Injectable()
export class SeedDataService {
  async buildSeedData(
    latestBlockNumber: number,
    strategiesWithOwners: StrategyRealtimeWithOwner[],
    tradingFeePPMByPair: { [pairKey: string]: number },
    gradientStrategies: GradientRealtimeWithOwner[] = [],
    page = 0,
    pageSize = 0,
  ): Promise<SeedDataResponse> {
    const allEncoded: { strategy: EncodedStrategy; token0: string; token1: string }[] = [];

    for (const strategy of strategiesWithOwners) {
      const encoded: RegularEncodedStrategy = {
        type: 'regular',
        id: strategy.strategyId,
        owner: strategy.owner,
        token0: strategy.token0Address,
        token1: strategy.token1Address,
        order0: JSON.parse(strategy.order0),
        order1: JSON.parse(strategy.order1),
      };
      allEncoded.push({
        strategy: encoded,
        token0: strategy.token0Address,
        token1: strategy.token1Address,
      });
    }

    for (const strategy of gradientStrategies) {
      const encoded: GradientEncodedStrategy = {
        type: 'gradient',
        id: strategy.strategyId,
        owner: strategy.owner,
        token0: strategy.token0Address,
        token1: strategy.token1Address,
        order0: {
          liquidity: strategy.order0Liquidity,
          initialPrice: strategy.order0InitialPrice,
          tradingStartTime: strategy.order0TradingStartTime,
          expiry: strategy.order0Expiry,
          multiFactor: strategy.order0MultiFactor,
          gradientType: strategy.order0GradientType,
        },
        order1: {
          liquidity: strategy.order1Liquidity,
          initialPrice: strategy.order1InitialPrice,
          tradingStartTime: strategy.order1TradingStartTime,
          expiry: strategy.order1Expiry,
          multiFactor: strategy.order1MultiFactor,
          gradientType: strategy.order1GradientType,
        },
      };
      allEncoded.push({
        strategy: encoded,
        token0: strategy.token0Address,
        token1: strategy.token1Address,
      });
    }

    const totalStrategies = allEncoded.length;
    let paginated = allEncoded;
    let paginationInfo = undefined;

    if (pageSize > 0) {
      const totalPages = Math.ceil(totalStrategies / pageSize);
      const startIdx = page * pageSize;
      const endIdx = startIdx + pageSize;
      paginated = allEncoded.slice(startIdx, endIdx);

      paginationInfo = {
        page,
        pageSize,
        totalStrategies,
        totalPages,
        hasMore: endIdx < totalStrategies,
      };
    }

    const strategiesByPair: { [pairKey: string]: EncodedStrategy[] } = {};

    for (const { strategy, token0, token1 } of paginated) {
      const [sortedToken0, sortedToken1] = [token0, token1].sort((a, b) =>
        a.localeCompare(b),
      );
      const pairKey = `${sortedToken0}_${sortedToken1}`;

      if (!strategiesByPair[pairKey]) {
        strategiesByPair[pairKey] = [];
      }

      strategiesByPair[pairKey].push(strategy);
    }

    return {
      schemeVersion: SCHEME_VERSION,
      latestBlockNumber,
      strategiesByPair,
      tradingFeePPMByPair,
      ...(paginationInfo && { pagination: paginationInfo }),
    };
  }
}
