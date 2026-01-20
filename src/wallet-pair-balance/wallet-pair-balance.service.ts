import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Decimal } from 'decimal.js';
import { Strategy } from '../strategy/strategy.entity';
import { Deployment } from '../deployment/deployment.service';

@Injectable()
export class WalletPairBalanceService {
  constructor(
    @InjectRepository(Strategy)
    private strategyRepository: Repository<Strategy>,
  ) {}

  async getLatestBalances(deployment: Deployment): Promise<any> {
    const results = await this.strategyRepository.query(
      `
      WITH latest_owners AS (
        SELECT DISTINCT ON (vte."strategyId")
          vte."strategyId",
          vte."to" as "walletAddress"
        FROM "voucher-transfer-events" vte
        WHERE vte."blockchainType" = $1
          AND vte."exchangeId" = $2
          AND vte."to" != '0x0000000000000000000000000000000000000000'
        ORDER BY vte."strategyId", vte."blockId" DESC, vte."transactionIndex" DESC, vte."logIndex" DESC
      )
      SELECT 
        s."pairId",
        lo."walletAddress",
        t0."address" as "token0Address",
        t0."symbol" as "token0Symbol", 
        t0."decimals" as "token0Decimals",
        t1."address" as "token1Address",
        t1."symbol" as "token1Symbol",
        t1."decimals" as "token1Decimals",
        SUM(COALESCE(s."liquidity0", '0')::decimal)::text as "liquidity0Sum",
        SUM(COALESCE(s."liquidity1", '0')::decimal)::text as "liquidity1Sum"
      FROM "strategies" s
      JOIN latest_owners lo ON lo."strategyId" = s."strategyId"
      JOIN "tokens" t0 ON t0."id" = s."token0Id"
      JOIN "tokens" t1 ON t1."id" = s."token1Id"
      WHERE s."blockchainType" = $1
        AND s."exchangeId" = $2
        AND s."deleted" = false
        AND (COALESCE(s."liquidity0"::decimal, 0) > 0 OR 
             COALESCE(s."liquidity1"::decimal, 0) > 0)
      GROUP BY 
        s."pairId",
        lo."walletAddress", 
        t0."address", 
        t0."symbol",
        t0."decimals",
        t1."address",
        t1."symbol", 
        t1."decimals"
      HAVING SUM(COALESCE(s."liquidity0", '0')::decimal) > 0 OR SUM(COALESCE(s."liquidity1", '0')::decimal) > 0
      ORDER BY s."pairId", lo."walletAddress"
    `,
      [deployment.blockchainType, deployment.exchangeId],
    );

    if (results.length === 0) {
      return {};
    }

    // Group results by pair and format according to the structure
    const groupedByPair = results.reduce((acc, row) => {
      // Determine lexicographic ordering of tokens
      const token0Addr = row.token0Address.toLowerCase();
      const token1Addr = row.token1Address.toLowerCase();
      const isToken0Smaller = token0Addr < token1Addr;

      // Create pairKey with lexicographic ordering (smaller address first)
      const pairKey = isToken0Smaller ? `${token0Addr}_${token1Addr}` : `${token1Addr}_${token0Addr}`;

      if (!acc[pairKey]) {
        // Set canonical token0/token1 based on lexicographic ordering
        acc[pairKey] = {
          token0Address: isToken0Smaller ? token0Addr : token1Addr,
          token0Symbol: isToken0Smaller ? row.token0Symbol : row.token1Symbol,
          token0Decimals: isToken0Smaller ? row.token0Decimals : row.token1Decimals,
          token1Address: isToken0Smaller ? token1Addr : token0Addr,
          token1Symbol: isToken0Smaller ? row.token1Symbol : row.token0Symbol,
          token1Decimals: isToken0Smaller ? row.token1Decimals : row.token0Decimals,
          wallets: {},
        };
      }

      // Map strategy liquidity to canonical token0/token1 based on lexicographic ordering
      const canonicalToken0Balance = isToken0Smaller ? row.liquidity0Sum : row.liquidity1Sum;
      const canonicalToken1Balance = isToken0Smaller ? row.liquidity1Sum : row.liquidity0Sum;

      // Liquidity values are already normalized (human-readable) in the database
      const token0Balance = new Decimal(canonicalToken0Balance || '0').toFixed();
      const token1Balance = new Decimal(canonicalToken1Balance || '0').toFixed();

      acc[pairKey].wallets[row.walletAddress.toLowerCase()] = {
        token0Balance: token0Balance,
        token1Balance: token1Balance,
      };

      return acc;
    }, {});

    return groupedByPair;
  }
}
