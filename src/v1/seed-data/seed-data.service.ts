import { Injectable } from '@nestjs/common';
import { EncodedStrategy, SeedDataResponse } from './seed-data.dto';
import { StrategyWithOwner } from '../../strategy/strategy.service';

const SCHEME_VERSION = 7;

@Injectable()
export class SeedDataService {
  async buildSeedData(
    latestBlockNumber: number,
    strategiesWithOwners: StrategyWithOwner[],
    tradingFeePPMByPair: { [pairKey: string]: number },
    page = 0,
    pageSize = 0,
  ): Promise<SeedDataResponse> {
    // Apply pagination if pageSize is specified
    const totalStrategies = strategiesWithOwners.length;
    let paginatedStrategies = strategiesWithOwners;
    let paginationInfo = undefined;

    if (pageSize > 0) {
      const totalPages = Math.ceil(totalStrategies / pageSize);
      const startIdx = page * pageSize;
      const endIdx = startIdx + pageSize;
      paginatedStrategies = strategiesWithOwners.slice(startIdx, endIdx);

      paginationInfo = {
        page,
        pageSize,
        totalStrategies,
        totalPages,
        hasMore: endIdx < totalStrategies,
      };
    }

    // Group strategies by pair
    const strategiesByPair: { [pairKey: string]: EncodedStrategy[] } = {};

    for (const strategy of paginatedStrategies) {
      // Tokens are already stored alphabetically in the database
      const pairKey = `${strategy.token0Address}_${strategy.token1Address}`;

      if (!strategiesByPair[pairKey]) {
        strategiesByPair[pairKey] = [];
      }

      const encodedStrategy: EncodedStrategy = {
        id: strategy.strategyId,
        owner: strategy.owner,
        token0: strategy.token0Address,
        token1: strategy.token1Address,
        order0: JSON.parse(strategy.order0),
        order1: JSON.parse(strategy.order1),
      };

      strategiesByPair[pairKey].push(encodedStrategy);
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
