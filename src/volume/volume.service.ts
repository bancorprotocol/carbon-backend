import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { VolumeTokensDto } from '../v1/analytics/volume.tokens.dto';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { Deployment } from '../deployment/deployment.service';
import moment from 'moment';
import { HistoricQuoteService } from '../historic-quote/historic-quote.service';
import Decimal from 'decimal.js';
import { TokensByAddress } from '../token/token.service';
import { PairsDictionary } from '../pair/pair.service';
import { VolumePairsDto } from '../v1/analytics/volume.pairs.dto';
import { VolumeTotalDto } from '../v1/analytics/volume.total.dto';

// Types for the returned results
type VolumeByAddressResult = {
  timestamp: number;
  address: string;
  symbol: string;
  volumeUsd: number;
  feesUsd: number;
};

type VolumeByPairResult = {
  timestamp: number;
  pairId: number;
  volumeUsd: number;
  feesUsd: number;
};

type VolumeResult = {
  timestamp: number;
  volumeUsd: number;
  feesUsd: number;
};

@Injectable()
export class VolumeService {
  constructor(
    private dataSource: DataSource,
    private lastProcessedBlockService: LastProcessedBlockService,
    private historicQuoteService: HistoricQuoteService,
  ) {}

  async getVolume(
    deployment: Deployment,
    params: VolumeTokensDto | VolumePairsDto | VolumeTotalDto,
    tokens: TokensByAddress,
    pairs?: PairsDictionary,
  ): Promise<VolumeByAddressResult[] | VolumeByPairResult[]> {
    const start = params.start ?? moment().subtract(1, 'year').unix();
    const end = params.end ?? moment().unix();
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 10000;

    const startFormatted = moment.unix(start).format('YYYY-MM-DD HH:mm:ss');
    const endFormatted = moment.unix(end).format('YYYY-MM-DD HH:mm:ss');

    let volumeData;
    if (this.isVolumeTokensDto(params)) {
      volumeData = await this.generateVolumeByAddress(deployment, params, tokens, startFormatted, endFormatted);
      volumeData = this.accumulateByAddressAndTimestamp(volumeData);
    } else if (this.isVolumePairsDto(params)) {
      volumeData = await this.generateVolumeByPair(deployment, params, pairs, startFormatted, endFormatted);
    } else if (this.isTotalVolumeDto(params)) {
      volumeData = await this.generateVolumeByAddress(deployment, params, tokens, startFormatted, endFormatted);
      volumeData = this.accumulateByTimestamp(volumeData);
    }

    // Apply pagination (offset and limit) on the sorted result
    return volumeData.slice(offset, offset + limit);
  }

  private isVolumeTokensDto(params: any): params is VolumeTokensDto {
    return 'addresses' in params;
  }

  private isVolumePairsDto(params: any): params is VolumePairsDto {
    return 'pairs' in params;
  }

  private isTotalVolumeDto(params: any): params is VolumeTotalDto {
    return !('pairs' in params) && !('addresses' in params);
  }

  private async generateVolumeByAddress(
    deployment: Deployment,
    params: VolumeTokensDto | VolumeTotalDto,
    tokens: TokensByAddress,
    startFormatted: string,
    endFormatted: string,
  ): Promise<VolumeByAddressResult[]> {
    let tokenIds = [];
    if ('addresses' in params) {
      tokenIds = params.addresses.map((a) => tokens[a].id);
    } else {
      tokenIds = Object.values(tokens).map((t) => t.id);
    }

    const result = await this.dataSource.query(`
      WITH gapfilled_traded_events AS (
        SELECT
          time_bucket_gapfill('1 day', timestamp, '${startFormatted}', '${endFormatted}') AS "timestam",
          sum("targetAmount" :: decimal) AS "targetAmount",
          sum("tradingFeeAmount" :: decimal) AS "feeAmount",
          CASE
            WHEN tte."byTargetAmount" = TRUE THEN "sourceTokenId"
            ELSE "targetTokenId"
          END AS "feeTokenId",
          "feeToken"."address" AS "feeAddress",
          "feeToken"."symbol" AS "feeSymbol",
          "feeToken"."decimals" AS "feeDecimals",
          "targetToken"."address" AS "targetAddress",
          "targetToken"."symbol" AS "targetSymbol",
          "targetToken"."decimals" AS "targetDecimals"
        FROM
          "tokens-traded-events" tte
        JOIN tokens "feeToken"
          ON (CASE 
                WHEN tte."byTargetAmount" = TRUE THEN tte."sourceTokenId"
                ELSE tte."targetTokenId"
              END) = "feeToken"."id"
        JOIN tokens "targetToken" 
          ON tte."targetTokenId" = "targetToken"."id"
        WHERE
          tte."blockchainType" = '${deployment.blockchainType}'
          AND tte."exchangeId" = '${deployment.exchangeId}'
          AND tte."targetTokenId" IN (${tokenIds.join(', ')})
        GROUP BY
          "timestam",
          "feeTokenId",
          "feeAddress",
          "feeSymbol",
          "feeDecimals",
          "targetAddress",
          "targetSymbol",
          "targetDecimals"
        ORDER BY
          "timestam" ASC
      )
      SELECT 
        "timestam",
        "feeAddress",
        "feeSymbol",
        "targetAddress",
        "targetSymbol",
        ("feeAmount" / POWER(10, "feeDecimals")) AS fees,
        ("targetAmount" / POWER(10, "targetDecimals")) AS volume,
        "feeAmount",
        "targetAmount"
      FROM
        gapfilled_traded_events
      WHERE
        "timestam" >= '${startFormatted}'
      GROUP BY
        "timestam",
        "feeAddress",
        "feeSymbol",
        "targetAddress",
        "targetSymbol",
        "feeAmount",
        "targetAmount",
        "feeDecimals",
        "targetDecimals"        
      ORDER BY
        "timestam",
        "targetAddress";      
    `);

    const volumeData = result.map((row) => ({
      timestamp: moment.utc(row.timestam).unix(),
      volume: parseFloat(row.volume) || 0,
      fees: parseFloat(row.fees) || 0,
      feeAddress: row.feeAddress,
      feeSymbol: row.feeSymbol,
      targetAddress: row.targetAddress,
      targetSymbol: row.targetSymbol,
    }));

    const uniqueTokenAddresses = new Set<string>();
    volumeData.forEach((volumeEntry) => {
      uniqueTokenAddresses.add(volumeEntry.feeAddress.toLowerCase());
      uniqueTokenAddresses.add(volumeEntry.targetAddress.toLowerCase());
    });

    const usdRates = await this.historicQuoteService.getUsdRates(
      deployment,
      Array.from(uniqueTokenAddresses),
      startFormatted,
      endFormatted,
    );

    return this.mapVolumeDataToUsd(volumeData, usdRates);
  }

  private async generateVolumeByPair(
    deployment: Deployment,
    params: VolumePairsDto,
    pairs: PairsDictionary,
    startFormatted: string,
    endFormatted: string,
  ): Promise<VolumeByPairResult[]> {
    const pairIds = this.getPairIds(params, pairs);

    const result = await this.dataSource.query(`
      WITH gapfilled_traded_events AS (
        SELECT
          time_bucket_gapfill('1 day', timestamp, '${startFormatted}', '${endFormatted}') AS "timestam",
          sum("targetAmount" :: decimal) AS "targetAmount",
          sum("tradingFeeAmount" :: decimal) AS "feeAmount",
          CASE
            WHEN tte."byTargetAmount" = TRUE THEN "sourceTokenId"
            ELSE "targetTokenId"
          END AS "feeTokenId",
          "feeToken"."address" AS "feeAddress",
          "feeToken"."symbol" AS "feeSymbol",
          "feeToken"."decimals" AS "feeDecimals",
          "targetToken"."address" AS "targetAddress",
          "targetToken"."symbol" AS "targetSymbol",
          "targetToken"."decimals" AS "targetDecimals",
          "pairId"
        FROM
          "tokens-traded-events" tte
        JOIN tokens "feeToken"
          ON (CASE 
                WHEN tte."byTargetAmount" = TRUE THEN tte."sourceTokenId"
                ELSE tte."targetTokenId"
              END) = "feeToken"."id"
        JOIN tokens "targetToken" 
          ON tte."targetTokenId" = "targetToken"."id"
        WHERE
          tte."blockchainType" = '${deployment.blockchainType}'
          AND tte."exchangeId" = '${deployment.exchangeId}'
          AND tte."pairId" IN (${pairIds.join(', ')})
        GROUP BY
          "timestam",
          "feeTokenId",
          "feeAddress",
          "feeSymbol",
          "feeDecimals",
          "targetAddress",
          "targetSymbol",
          "targetDecimals",
          "pairId"
        ORDER BY
          "timestam" ASC
      )
      SELECT 
        "timestam",
        "feeAddress",
        "feeSymbol",
        "targetAddress",
        "targetSymbol",
        ("feeAmount" / POWER(10, "feeDecimals")) AS fees,
        ("targetAmount" / POWER(10, "targetDecimals")) AS volume,
        "feeAmount",
        "targetAmount",
        "pairId"
      FROM
        gapfilled_traded_events
      WHERE
        "timestam" >= '${startFormatted}'
      GROUP BY
        "timestam",
        "feeAddress",
        "feeSymbol",
        "targetAddress",
        "targetSymbol",
        "feeAmount",
        "targetAmount",
        "feeDecimals",
        "targetDecimals",
        "pairId"
      ORDER BY
        "timestam",
        "targetAddress"      
    `);

    const volumeData = result.map((row) => ({
      timestamp: moment.utc(row.timestam).unix(),
      volume: parseFloat(row.volume) || 0,
      fees: parseFloat(row.fees) || 0,
      pairId: row.pairId,
      feeAddress: row.feeAddress,
      targetAddress: row.targetAddress,
    }));

    const uniqueTokenAddresses = new Set<string>();
    volumeData.forEach((volumeEntry) => {
      uniqueTokenAddresses.add(volumeEntry.feeAddress.toLowerCase());
      uniqueTokenAddresses.add(volumeEntry.targetAddress.toLowerCase());
    });

    const usdRates = await this.historicQuoteService.getUsdRates(
      deployment,
      Array.from(uniqueTokenAddresses),
      startFormatted,
      endFormatted,
    );

    const volumeWithUsd = this.mapVolumeDataToUsd(volumeData, usdRates);

    return this.accumulateByPairAndTimestamp(volumeWithUsd);
  }

  private mapVolumeDataToUsd(volumeData: any[], usdRates: any[]): any[] {
    // Create a dictionary for quick lookup of USD rates by address
    const usdRateDict: Record<string, number> = usdRates.reduce((acc, usdEntry) => {
      acc[usdEntry.address.toLowerCase()] = usdEntry.usd;
      return acc;
    }, {});

    // Map volume data to include USD values
    return volumeData.map((entry) => {
      const volumeUsdRate = usdRateDict[entry.targetAddress.toLowerCase()] || 0;
      const feesUsdRate = usdRateDict[entry.feeAddress.toLowerCase()] || 0;

      const volumeUsd = new Decimal(entry.volume).mul(volumeUsdRate).toNumber();
      const feesUsd = new Decimal(entry.fees).mul(feesUsdRate).toNumber();

      return {
        ...entry,
        volumeUsd,
        feesUsd,
      };
    });
  }

  private accumulateByAddressAndTimestamp(volumeWithUsd: any[]): VolumeByAddressResult[] {
    const groupedResult = volumeWithUsd.reduce((acc, volumeEntry) => {
      const groupKey = `${volumeEntry.targetAddress}_${volumeEntry.timestamp}`;

      if (!acc[groupKey]) {
        acc[groupKey] = {
          timestamp: volumeEntry.timestamp,
          address: volumeEntry.targetAddress,
          symbol: volumeEntry.targetSymbol,
          volumeUsd: new Decimal(0),
          feesUsd: new Decimal(0),
        };
      }

      acc[groupKey].volumeUsd = acc[groupKey].volumeUsd.add(volumeEntry.volumeUsd);
      acc[groupKey].feesUsd = acc[groupKey].feesUsd.add(volumeEntry.feesUsd);

      return acc;
    }, {});

    return Object.values(groupedResult).map((group: any) => ({
      timestamp: group.timestamp,
      address: group.address,
      symbol: group.symbol,
      volumeUsd: group.volumeUsd.toNumber(),
      feesUsd: group.feesUsd.toNumber(),
    }));
  }

  private accumulateByTimestamp(volumeWithUsd: any[]): VolumeResult[] {
    const groupedResult = volumeWithUsd.reduce((acc, volumeEntry) => {
      const groupKey = `${volumeEntry.timestamp}`;

      if (!acc[groupKey]) {
        acc[groupKey] = {
          timestamp: volumeEntry.timestamp,
          address: volumeEntry.targetAddress,
          symbol: volumeEntry.targetSymbol,
          volumeUsd: new Decimal(0),
          feesUsd: new Decimal(0),
        };
      }

      acc[groupKey].volumeUsd = acc[groupKey].volumeUsd.add(volumeEntry.volumeUsd);
      acc[groupKey].feesUsd = acc[groupKey].feesUsd.add(volumeEntry.feesUsd);

      return acc;
    }, {});

    return Object.values(groupedResult).map((group: any) => ({
      timestamp: group.timestamp,
      volumeUsd: group.volumeUsd.toNumber(),
      feesUsd: group.feesUsd.toNumber(),
    }));
  }

  private accumulateByPairAndTimestamp(volumeWithUsd: any[]): VolumeByPairResult[] {
    const groupedResult = volumeWithUsd.reduce((acc, volumeEntry) => {
      const groupKey = `${volumeEntry.pairId}_${volumeEntry.timestamp}`;

      if (!acc[groupKey]) {
        acc[groupKey] = {
          timestamp: volumeEntry.timestamp,
          pairId: volumeEntry.pairId,
          volumeUsd: new Decimal(0),
          feesUsd: new Decimal(0),
        };
      }

      acc[groupKey].volumeUsd = acc[groupKey].volumeUsd.add(volumeEntry.volumeUsd);
      acc[groupKey].feesUsd = acc[groupKey].feesUsd.add(volumeEntry.feesUsd);

      return acc;
    }, {});

    return Object.values(groupedResult).map((group: any) => ({
      timestamp: group.timestamp,
      pairId: group.pairId,
      volumeUsd: group.volumeUsd.toNumber(),
      feesUsd: group.feesUsd.toNumber(),
    }));
  }

  private getPairIds(params: VolumePairsDto, pairs: PairsDictionary): number[] {
    const pairIds: number[] = [];
    for (const { token0, token1 } of params.pairs) {
      const pair = pairs[token0]?.[token1];
      if (pair) {
        pairIds.push(pair.id);
      } else {
        console.warn(`Pair not found for tokens: ${token0}, ${token1}`);
      }
    }
    return pairIds;
  }
}
