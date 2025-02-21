import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TvlTokensDto } from '../v1/analytics/tvl.tokens.dto';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { Tvl } from './tvl.entity';
import { Deployment } from '../deployment/deployment.service';
import moment from 'moment';
import Decimal from 'decimal.js';
import { PairsDictionary } from '../pair/pair.service';
import { TvlPairsDto } from '../v1/analytics/tvl.pairs.dto';
import { TotalTvl } from './total-tvl.entity';
import { TotalTvlDto } from '../v1/analytics/tvl.total.dto';
import { HistoricQuoteService } from '../historic-quote/historic-quote.service';

export enum GroupBy {
  ADDRESS = 'address',
  PAIR = 'pair',
}

@Injectable()
export class TvlService {
  constructor(
    @InjectRepository(Tvl)
    private tvlRepository: Repository<Tvl>,
    @InjectRepository(TotalTvl) private totalTvlRepository: Repository<TotalTvl>,
    private dataSource: DataSource,
    private lastProcessedBlockService: LastProcessedBlockService,
    private historicQuoteService: HistoricQuoteService,
  ) {}

  async update(endBlock: number, deployment: Deployment): Promise<void> {
    const startBlock =
      (await this.lastProcessedBlockService.get(`${deployment.blockchainType}-${deployment.exchangeId}-tvl`)) || 1;

    // perform cleanup
    await this.tvlRepository
      .createQueryBuilder()
      .delete()
      .where('evt_block_number > :startBlock', { startBlock })
      .andWhere('blockchainType = :blockchainType', { blockchainType: deployment.blockchainType })
      .andWhere('exchangeId = :exchangeId', { exchangeId: deployment.exchangeId })
      .execute();

    const query = `
      WITH strategy_created AS (
      SELECT
          0 AS transaction_index,
          timestamp AS evt_block_time,
          sce."blockId" AS evt_block_number,
          sce."strategyId" AS strategyId,
          order0,
          order1,
          t0.address AS token0,
          t0.symbol AS symbol0,
          t0.decimals AS decimals0,
          t1.address AS token1,
          t1.symbol AS symbol1,
          t1.decimals AS decimals1,
          2 AS reason,
          sce."pairId" AS pairId,
          ps."name" AS pairName
      FROM
          "strategy-created-events" sce
          LEFT JOIN tokens t0 ON t0.id = sce."token0Id"
          LEFT JOIN tokens t1 ON t1.id = sce."token1Id"
          LEFT JOIN pairs ps ON ps.id = sce."pairId"
      WHERE
          sce."exchangeId" = '${deployment.exchangeId}'
      ),
      strategy_updated AS (
      SELECT
          sue.id AS transaction_index,
          timestamp AS evt_block_time,
          sue."blockId" AS evt_block_number,
          sue."strategyId" AS strategyId,
          order0,
          order1,
          t0.address AS token0,
          t0.symbol AS symbol0,
          t0.decimals AS decimals0,
          t1.address AS token1,
          t1.symbol AS symbol1,
          t1.decimals AS decimals1,
          reason,
          sue."pairId" AS pairId,
          ps."name" AS pairName
      FROM
          "strategy-updated-events" sue
          LEFT JOIN tokens t0 ON t0.id = sue."token0Id"
          LEFT JOIN tokens t1 ON t1.id = sue."token1Id"
          LEFT JOIN pairs ps ON ps."id" = sue."pairId"
      WHERE
          sue."exchangeId" = '${deployment.exchangeId}'         
      ),
      strategy_deleted AS (
      SELECT
          99999999999 AS transaction_index,
          timestamp AS evt_block_time,
          sde."blockId" AS evt_block_number,
          sde."strategyId" AS strategyId,
          order0,
          order1,
          t0.address AS token0,
          t0.symbol AS symbol0,
          t0.decimals AS decimals0,
          t1.address AS token1,
          t1.symbol AS symbol1,
          t1.decimals AS decimals1,
          4 AS reason,
          sde."pairId" AS pairId,
          ps."name" AS pairName
      FROM
          "strategy-deleted-events" sde
          LEFT JOIN tokens t0 ON t0.id = sde."token0Id"
          LEFT JOIN tokens t1 ON t1.id = sde."token1Id"
          LEFT JOIN pairs ps ON ps."id" = sde."pairId"
      WHERE
          sde."exchangeId" = '${deployment.exchangeId}'
      ),
      all_txs AS (
      SELECT
          *
      FROM
          strategy_created
      UNION
      ALL
      SELECT
          *
      FROM
          strategy_updated
      UNION
      ALL
      SELECT
          *
      FROM
          strategy_deleted
      ),
      recent_txs AS (
      SELECT
          *
      FROM
          all_txs
      WHERE
          evt_block_number > ${startBlock} 
      ),
      
      orders_with_y_and_day AS (
      SELECT
          evt_block_number,
          evt_block_time,
          transaction_index,
          DATE_TRUNC('day', evt_block_time) AS evt_day,
          token0,
          strategyId,
          symbol0,
          decimals0,
          token1,
          symbol1,
          decimals1,
          reason,
          pairName,
          pairId,
          COALESCE((order0 :: json ->> 'y') :: double precision, 0) AS y0,
          COALESCE((order1 :: json ->> 'y') :: double precision, 0) AS y1
      FROM
          recent_txs
      ),
      split_orders AS (
      SELECT
          evt_block_time,
          transaction_index,
          evt_day,
          evt_block_number,
          strategyId,
          pairName,
          pairId,
          reason,
          LOWER(token0) AS address,
          symbol0 AS symbol,
          decimals0 AS decimals,
          y0 AS y
      FROM
          orders_with_y_and_day
      UNION
      ALL
      SELECT
          evt_block_time,
          transaction_index,
          evt_day,
          evt_block_number,
          strategyId,
          pairName,
          pairId,
          reason,
          LOWER(token1) AS address,
          symbol1 AS symbol,
          decimals1 AS decimals,
          y1 AS y
      FROM
          orders_with_y_and_day
      ),
      orders_with_tvl AS (
      SELECT
          *,
          (
              CASE
                  WHEN reason = 4 THEN 0 
                  ELSE y
              END
          ) / POW(10, decimals) AS tvl
      FROM
          split_orders
      ),
      start_date_from_blocks AS (
      SELECT
          COALESCE(
              (
                  SELECT
                      DATE_TRUNC('day', timestamp)
                  FROM
                      "blocks"
                  WHERE
                      id <= ${startBlock} 
                  ORDER BY
                      id DESC
                  LIMIT
                      1
              ), TO_DATE('1970-01-01', 'YYYY-MM-DD')
          ) AS timestamp
      ),
      tvl AS (
      SELECT
          *
      FROM
          orders_with_tvl
      WHERE
          evt_block_time >= (
              SELECT
                  timestamp
              FROM
                  start_date_from_blocks
              LIMIT
                  1
          )
      ORDER BY
          evt_block_time
      )
      SELECT
      evt_block_time,
      evt_block_number,
      evt_day,
      transaction_index,
      strategyId,
      pairName,
      pairId,
      reason,
      address,
      symbol,
      tvl
      FROM
      tvl
      ORDER BY
      evt_block_time,
      transaction_index,
      address
      `;

    const result = await this.dataSource.query(query);
    const batchSize = 1000;

    // Get the range of block time from TVL result to fetch relevant USD rates
    const firstDate = result.length > 0 ? moment(result[0].evt_block_time).format('YYYY-MM-DD HH:mm:ss') : null;
    const lastDate =
      result.length > 0 ? moment(result[result.length - 1].evt_block_time).format('YYYY-MM-DD HH:mm:ss') : null;

    if (firstDate && lastDate) {
      // Process the batches and store with USD rates
      for (let i = 0; i < result.length; i += batchSize) {
        const batch = result.slice(i, i + batchSize).map((record) => {
          return {
            blockchainType: deployment.blockchainType,
            exchangeId: deployment.exchangeId,
            strategyId: record.strategyid,
            pairName: record.pairname,
            pairId: record.pairid,
            symbol: record.symbol,
            tvl: record.tvl,
            evt_block_time: record.evt_block_time,
            address: record.address,
            reason: record.reason,
            evt_block_number: record.evt_block_number,
            transaction_index: record.transaction_index,
          };
        });

        await this.tvlRepository.save(batch);
      }
    }

    await this.updateTotalTvl(deployment);

    // Update the last processed block number
    await this.lastProcessedBlockService.update(`${deployment.blockchainType}-${deployment.exchangeId}-tvl`, endBlock);
  }

  private async generateTvlByAddress(deployment: Deployment, params: TvlTokensDto): Promise<any[]> {
    const { addresses: _addresses } = params;

    // Ensure the address is an array and convert it to lowercase
    const addresses = _addresses.map((addr) => addr.toLowerCase());

    // Format start and end using moment.js to the required timestamp format
    const startFormatted = moment.unix(params.start).format('YYYY-MM-DD');
    const endFormatted = moment.unix(params.end).add(1, 'day').format('YYYY-MM-DD');

    const query = `
      WITH gapfilled_tvl AS (
        SELECT 
          time_bucket_gapfill('1 day', "evt_block_time", '${startFormatted}', '${endFormatted}') AS "timestam",
          address,
          symbol,
          locf(LAST("tvl"::decimal, "evt_block_time")) AS "daily_tvl",
          "strategyId"
        FROM 
          tvl
        WHERE 
          address IN (${addresses.map((addr) => `'${addr}'`).join(', ')})
          AND "exchangeId" = '${deployment.exchangeId}'
          AND "blockchainType" = '${deployment.blockchainType}'
        GROUP BY 
          address,
          timestam,
          symbol,
          "strategyId"          
        ORDER BY 
          "timestam" ASC
      )
      SELECT
        "timestam",
        address,
        symbol,
        SUM("daily_tvl")::decimal AS total_daily_tvl
      FROM 
        gapfilled_tvl
      WHERE 
        "timestam" >= '${startFormatted}'
      GROUP BY 
        "timestam", address, symbol
      ORDER BY 
        "timestam", address, symbol ASC
      OFFSET ${params.offset} LIMIT ${params.limit};
    `;

    // Execute the query using the data source
    const result = await this.dataSource.query(query);

    // Format the output as requested using moment.js
    const formattedResult = result.map((row) => ({
      timestamp: moment.utc(row.timestam).unix(),
      tvl: parseFloat(row.total_daily_tvl),
      address: row.address,
      symbol: row.symbol,
    }));

    return formattedResult;
  }

  async getTvlByAddress(deployment: Deployment, params: TvlTokensDto): Promise<any[]> {
    const start = params.start ?? moment().subtract(1, 'year').unix();
    const end = params.end ?? moment().unix();
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 10000;
    const updatedParams = { ...params, start, end, offset, limit };

    // Format start and end to the required timestamp string format
    const startFormatted = moment.unix(start).format('YYYY-MM-DD HH:mm:ss');
    const endFormatted = moment.unix(end).format('YYYY-MM-DD HH:mm:ss');

    // Use Promise.all to run both methods concurrently
    const [tvlData, usdRates] = await Promise.all([
      this.generateTvlByAddress(deployment, updatedParams),
      this.historicQuoteService.getUsdRates(deployment, updatedParams.addresses, startFormatted, endFormatted), // Use the formatted start/end
    ]);

    // Combine TVL data with USD rates
    const combinedResult = tvlData.map((tvlEntry) => {
      const usdRate = usdRates.find(
        (usdEntry) => usdEntry.day === tvlEntry.timestamp && usdEntry.address === tvlEntry.address,
      );
      const tvlUsd = usdRate ? new Decimal(tvlEntry.tvl).mul(new Decimal(usdRate.usd)).toNumber() : null;
      return {
        ...tvlEntry,
        tvlUsd,
      };
    });

    return combinedResult;
  }

  private async generateTvlByPair(deployment: Deployment, params: TvlPairsDto, pairIds: number[]): Promise<any[]> {
    const startFormatted = moment.unix(params.start).format('YYYY-MM-DD');
    const endFormatted = moment.unix(params.end).add(1, 'day').format('YYYY-MM-DD');

    // Construct the SQL query using pre-computed pairIds
    const query = `
      WITH gapfilled_tvl AS (
        SELECT 
          time_bucket_gapfill('1 day', "evt_block_time", '${startFormatted}', '${endFormatted}') AS "timestam",
          "pairId",
          "pairName",
          locf(LAST("tvl"::decimal, "evt_block_time")) AS "daily_tvl",
          address,
          "strategyId"
        FROM 
          tvl
        WHERE 
          "pairId" IN (${pairIds.join(', ')})
          AND "exchangeId" = '${deployment.exchangeId}'
          AND "blockchainType" = '${deployment.blockchainType}'
        GROUP BY 
          "pairId",
          timestam,
          "pairName",
          address,
          "strategyId"
        ORDER BY 
          "timestam", "pairId" ASC
      )
      SELECT
        "timestam",
        "pairId",
        "pairName",
        address,
        SUM("daily_tvl")::decimal AS total_daily_tvl
      FROM 
        gapfilled_tvl
      WHERE 
        "timestam" >= '${startFormatted}'
      GROUP BY 
        "timestam", "pairId", "pairName", address
      ORDER BY 
        "timestam", "pairId" ASC;
    `;

    // Execute the query using the data source
    const result = await this.dataSource.query(query);

    // Format the output as requested using moment.js
    return result.map((row) => ({
      day: moment.utc(row.timestam).unix(),
      pairId: row.pairId,
      pairName: row.pairName,
      tvl: new Decimal(row.total_daily_tvl),
      address: row.address,
    }));
  }

  async getTvlByPair(deployment: Deployment, params: TvlPairsDto, pairs: PairsDictionary): Promise<any[]> {
    const start = params.start ?? moment().subtract(1, 'year').unix();
    const end = params.end ?? moment().unix();
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 10000; // You can adjust or default these values

    // Format start and end to the required timestamp string format
    const startFormatted = moment.unix(start).format('YYYY-MM-DD HH:mm:ss');
    const endFormatted = moment.unix(end).format('YYYY-MM-DD HH:mm:ss');

    // Extract the pairIds and token addresses based on the pairs array from the DTO
    const pairIds: number[] = [];
    const tokenAddresses: string[] = [];

    // Create a map to store token0 and token1 for each pairId
    const pairTokensMap: Record<number, { token0: string; token1: string }> = {};

    for (const { token0, token1 } of params.pairs) {
      // Lookup the pair in the pairs dictionary
      const pair = pairs[token0]?.[token1];
      if (pair) {
        pairIds.push(pair.id);
        tokenAddresses.push(pair.token0.address.toLowerCase(), pair.token1.address.toLowerCase());

        // Store token0 and token1 for this pairId
        pairTokensMap[pair.id] = {
          token0: pair.token0.address.toLowerCase(),
          token1: pair.token1.address.toLowerCase(),
        };
      } else {
        console.warn(`Pair not found for tokens: ${token0}, ${token1}`);
      }
    }

    // Use Promise.all to run both methods concurrently
    const [tvlData, usdRates] = await Promise.all([
      this.generateTvlByPair(deployment, { ...params, start, end }, pairIds),
      this.historicQuoteService.getUsdRates(deployment, tokenAddresses, startFormatted, endFormatted),
    ]);

    // Step 1: Calculate tvlUsd for each row
    const tvlWithUsd = tvlData.map((tvlEntry) => {
      // Find the USD rate for the token address in the tvl entry
      const usdRate = usdRates.find((usdEntry) => usdEntry.address === tvlEntry.address.toLowerCase());

      // Calculate the tvlUsd value for the given address
      const tvlUsd = usdRate ? new Decimal(tvlEntry.tvl).mul(usdRate.usd) : new Decimal(0);

      return {
        day: tvlEntry.day,
        pairId: tvlEntry.pairId,
        pairName: tvlEntry.pairName,
        tvlUsd,
        address: tvlEntry.address, // Include the address to help find token0 and token1 later
      };
    });

    // Step 2: Group and sum by pairId and day
    const groupedResult = tvlWithUsd.reduce((acc, tvlEntry) => {
      const groupKey = `${tvlEntry.pairId}_${tvlEntry.day}`;

      if (!acc[groupKey]) {
        acc[groupKey] = {
          day: tvlEntry.day,
          pairId: tvlEntry.pairId,
          pairName: tvlEntry.pairName,
          tvlUsd: new Decimal(0),
          token0: pairTokensMap[tvlEntry.pairId]?.token0, // Add token0 from the pairTokensMap
          token1: pairTokensMap[tvlEntry.pairId]?.token1, // Add token1 from the pairTokensMap
        };
      }

      // Sum the tvlUsd for each pairId/day combination
      acc[groupKey].tvlUsd = acc[groupKey].tvlUsd.add(tvlEntry.tvlUsd);

      return acc;
    }, {});

    // Step 3: Convert the grouped result into an array and sort by day, pairId, and pairName in ascending order
    const sortedResult = Object.values(groupedResult)
      .map((group) => ({
        timestamp: group['day'],
        pairId: group['pairId'],
        pairName: group['pairName'],
        tvlUsd: group['tvlUsd'].toNumber(),
        token0: group['token0'], // Include token0
        token1: group['token1'], // Include token1
      }))
      .sort((a, b) => {
        if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
        if (a.pairId !== b.pairId) return a.pairId - b.pairId;
        return a.pairName.localeCompare(b.pairName);
      });

    // Step 4: Apply pagination (offset and limit) on the sorted result
    const paginatedResult = sortedResult.slice(offset, offset + limit);

    return paginatedResult;
  }

  private async updateTotalTvl(deployment: Deployment): Promise<void> {
    // Find the most recent timestamp already processed
    const lastProcessedTvl = await this.totalTvlRepository
      .createQueryBuilder('total_tvl')
      .where('total_tvl."blockchainType" = :blockchainType', { blockchainType: deployment.blockchainType })
      .andWhere('total_tvl."exchangeId" = :exchangeId', { exchangeId: deployment.exchangeId })
      .orderBy('total_tvl.timestamp', 'DESC')
      .limit(1)
      .getOne();

    // If there's a previously processed record, get the timestamp
    let lastProcessedTimestamp;
    if (lastProcessedTvl) {
      lastProcessedTimestamp = moment(lastProcessedTvl.timestamp).format('YYYY-MM-DD HH:mm:ss');
    } else {
      const firstTvlUpdate = await this.tvlRepository
        .createQueryBuilder('tvl')
        .where('tvl."blockchainType" = :blockchainType', { blockchainType: deployment.blockchainType })
        .andWhere('tvl."exchangeId" = :exchangeId', { exchangeId: deployment.exchangeId })
        .orderBy('tvl.evt_block_number', 'ASC')
        .limit(1)
        .getOne();

      if (!firstTvlUpdate) {
        return;
      }
      lastProcessedTimestamp = moment(firstTvlUpdate.evt_block_time).format('YYYY-MM-DD HH:mm:ss');
    }

    const startFormatted = lastProcessedTimestamp;
    const endFormatted = moment().format('YYYY-MM-DD HH:mm:ss'); // Calculate until now

    const query = `
  WITH gapfilled_tvl AS (
    SELECT
      time_bucket_gapfill('1 hour', "evt_block_time", '${startFormatted}', '${endFormatted}') AS "timestam",
      locf(LAST("tvl" :: decimal, "evt_block_time")) AS "hourly_tvl",
      address,
      "strategyId"
    FROM
      tvl
    WHERE
      "exchangeId" = '${deployment.exchangeId}'
      AND "blockchainType" = '${deployment.blockchainType}'
    GROUP BY
      timestam, address, "strategyId"
    ORDER BY
      "timestam", "address" ASC
  )
  SELECT
    "timestam",
    address,
    SUM("hourly_tvl") :: decimal AS total_hourly_tvl
  FROM
    gapfilled_tvl
  WHERE
    "timestam" > '${startFormatted}'
  GROUP BY
    "timestam", address
  ORDER BY
    "timestam";
  `;

    const tvlData = await this.dataSource.query(query);

    // Get the date range from the TVL data to fetch relevant USD rates
    const firstDate = tvlData.length > 0 ? moment(tvlData[0].timestam).format('YYYY-MM-DD') : null;
    const lastDate = tvlData.length > 0 ? moment(tvlData[tvlData.length - 1].timestam).format('YYYY-MM-DD') : null;

    if (firstDate && lastDate) {
      // Deduplicate addresses
      const uniqueAddresses: string[] = Array.from(new Set(tvlData.map((entry) => entry.address)));

      // Fetch USD rates for unique addresses within the TVL data
      const usdRates = await this.historicQuoteService.getUsdRates(deployment, uniqueAddresses, firstDate, lastDate);

      // Create a map from usdRates with the key being `${address}_${dayUnix}`
      const usdRatesMap = new Map();
      usdRates.forEach((usdEntry) => {
        const dayUnix = moment.unix(usdEntry.day).startOf('day').unix(); // Ensure day is start of day
        const key = `${usdEntry.address}_${dayUnix}`;
        usdRatesMap.set(key, usdEntry.usd);
      });

      // Now, use the map to find the usdRate in constant time
      const groupedResult = tvlData.reduce((acc, tvlEntry) => {
        const groupKey = `${tvlEntry.timestam}`;
        if (!acc[groupKey]) {
          acc[groupKey] = {
            timestamp: tvlEntry.timestam,
            totalTvl: new Decimal(0),
          };
        }

        // Prepare the key for the map lookup
        const tvlEntryTimestampStartOfDay = moment.utc(tvlEntry.timestam).startOf('day').unix();
        const key = `${tvlEntry.address}_${tvlEntryTimestampStartOfDay}`;

        // Get the USD rate from the map
        const usdRate = usdRatesMap.get(key);

        if (usdRate && tvlEntry.total_hourly_tvl) {
          const tvlUsd = new Decimal(tvlEntry.total_hourly_tvl).mul(usdRate);
          acc[groupKey].totalTvl = acc[groupKey].totalTvl.add(tvlUsd);
        }

        return acc;
      }, {});

      // Step 2: Insert or update the records in total_tvl
      for (const key in groupedResult) {
        const row = groupedResult[key];

        const existingRecord = await this.totalTvlRepository.findOne({
          where: {
            timestamp: row.timestamp,
            blockchainType: deployment.blockchainType,
            exchangeId: deployment.exchangeId,
          },
        });

        if (existingRecord) {
          // Update existing record with new TVL
          existingRecord.tvl = row.totalTvl.toString();
          await this.totalTvlRepository.save(existingRecord);
        } else {
          // Insert new record
          const newRecord = this.totalTvlRepository.create({
            blockchainType: deployment.blockchainType,
            exchangeId: deployment.exchangeId,
            timestamp: row.timestamp,
            tvl: row.totalTvl.toString(),
          });
          await this.totalTvlRepository.save(newRecord);
        }
      }
    }
  }

  async getTotalTvl(deployment: Deployment, params: TotalTvlDto): Promise<any[]> {
    const start = params.start ?? moment().subtract(1, 'year').unix();
    const end = params.end ?? moment().unix();
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 10000;

    const startFormatted = moment.unix(start).format('YYYY-MM-DD HH:mm:ss');
    const endFormatted = moment.unix(end).format('YYYY-MM-DD HH:mm:ss');

    const query = `
      WITH gapfilled_tvl AS (
        SELECT 
          time_bucket_gapfill('1 day', "timestamp", '${startFormatted}', '${endFormatted}') AS "timestam",
          locf(last(tvl::decimal, "timestamp")) AS "tvl"
        FROM 
          "total-tvl"
        WHERE 
          "blockchainType" = '${deployment.blockchainType}'
        AND
          "exchangeId" = '${deployment.exchangeId}'
        GROUP BY 
          "timestam"
        ORDER BY 
          "timestam" ASC
      )
        SELECT
          "timestam",
          tvl
        FROM
          gapfilled_tvl
        WHERE
          "timestam" >= '${startFormatted}'
        ORDER BY
          "timestam"
        OFFSET ${offset} LIMIT ${limit};          
    `;

    const result = await this.dataSource.query(query);

    return result.map((row) => ({
      timestamp: moment.utc(row.timestam).unix(),
      tvlUsd: parseFloat(row.tvl),
    }));
  }
}
