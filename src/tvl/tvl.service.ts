import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TvlDto } from '../v1/analytics/tvl.dto';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { Tvl } from './tvl.entity';
import { Deployment } from '../deployment/deployment.service';
import moment from 'moment';
import Decimal from 'decimal.js';

export enum GroupBy {
  ADDRESS = 'address',
  PAIR = 'pair',
}

@Injectable()
export class TvlService {
  constructor(
    @InjectRepository(Tvl)
    private tvlRepository: Repository<Tvl>,
    private dataSource: DataSource,
    private lastProcessedBlockService: LastProcessedBlockService,
  ) {}

  async getTvl(deployment: Deployment, params: TvlDto): Promise<any[]> {
    // Prepare start and end dates
    const start = params.start
      ? moment.utc(params.start * 1000).format('YYYY-MM-DD HH:mm:ss')
      : moment.utc().subtract(7, 'days').startOf('day').format('YYYY-MM-DD HH:mm:ss');

    const end = params.end
      ? moment.utc(params.end * 1000).format('YYYY-MM-DD HH:mm:ss')
      : moment.utc().format('YYYY-MM-DD HH:mm:ss');

    // For the USD query, decrease the start date by 7 days
    const usdStart = moment.utc(start).subtract(7, 'days').format('YYYY-MM-DD HH:mm:ss');

    const HARD_LIMIT = 10000;
    const limit = Math.min(params.limit, HARD_LIMIT) || HARD_LIMIT;
    const offset = params.offset || 0;

    // Initial TVL Query to include grouping by strategyId
    const initialTvlQuery = `
      SELECT
        tvl."pairId", tvl."pairName", tvl.address, tvl.symbol, tvl."strategyId",
        last(tvl.tvl::numeric, tvl.evt_block_time) AS initial_tvl
      FROM tvl
      WHERE
        tvl.evt_block_time < '${start}'
        AND tvl."blockchainType" = '${deployment.blockchainType}'
        AND tvl."exchangeId" = '${deployment.exchangeId}'
      GROUP BY tvl."pairId", tvl."pairName", tvl.address, tvl.symbol, tvl."strategyId";
    `;

    // TVL Query fetching all data within the date range with stable sorting
    const tvlQuery = `
      SELECT
        tvl."pairId", tvl."pairName", tvl.address, tvl.symbol, tvl."strategyId",
        tvl.tvl::numeric, tvl.evt_block_time, tvl.evt_block_number, tvl.transaction_index
      FROM tvl
      WHERE
        tvl.evt_block_time <= '${end}'
        AND tvl.evt_block_time >= '${start}'
        AND tvl."blockchainType" = '${deployment.blockchainType}'
        AND tvl."exchangeId" = '${deployment.exchangeId}'
      ORDER BY tvl.evt_block_time, tvl."pairId", tvl.address, tvl."strategyId", tvl.evt_block_number, tvl.transaction_index;
    `;

    // Execute initial TVL and TVL data queries concurrently
    const [initialTvlResults, tvlResults] = await Promise.all([
      this.dataSource.query(initialTvlQuery),
      this.dataSource.query(tvlQuery),
    ]);

    // Initialize maps to store TVL values
    const initialTvlMap = new Map<string, Decimal>(); // Map to store the last known TVL for each pairId/address/strategyId combination
    initialTvlResults.forEach((row) => {
      const key = `${row.pairId}_${row.address as string}_${row.strategyId}`;
      initialTvlMap.set(key, new Decimal(row.initial_tvl || 0));
    });

    // Create a map to store the first TVL date for each address
    const firstTvlDateMap = new Map<string, string>();

    // Determine the earliest TVL date for each address from initialTvlResults
    initialTvlResults.forEach((row) => {
      const address = row.address as string;
      const date = moment(row.evt_block_time).format('YYYY-MM-DD');

      if (!firstTvlDateMap.has(address) || date < firstTvlDateMap.get(address)!) {
        firstTvlDateMap.set(address, date);
      }
    });

    // Determine the earliest TVL date for each address from tvlResults
    tvlResults.forEach((row) => {
      const address = row.address as string;
      const date = moment(row.evt_block_time).format('YYYY-MM-DD');

      if (!firstTvlDateMap.has(address) || date < firstTvlDateMap.get(address)!) {
        firstTvlDateMap.set(address, date);
      }
    });

    // Map to store the aggregated daily TVL by address
    const dailyTvlMap = new Map<
      string,
      {
        day: string;
        address: string;
        pairId: string;
        pairName: string;
        symbol: string;
        tvl: Decimal;
        evt_block_time: string;
        evt_block_number: number;
        strategyId: string;
        transaction_index: string;
      }
    >();

    // Process TVL updates within the date range
    const lastKnownTvlByPairAddressStrategy = new Map<string, Decimal>(); // Track the latest TVL value by pairId/address/strategyId
    initialTvlMap.forEach((initialValue, key) => {
      lastKnownTvlByPairAddressStrategy.set(key, initialValue); // Initialize with the last known value before start date
    });

    // Process each TVL row in the date range
    tvlResults.forEach((tvlRow) => {
      const day = moment(tvlRow.evt_block_time).format('YYYY-MM-DD');
      const address = tvlRow.address as string; // Ensure the type is string
      const pairId = tvlRow.pairId as string; // Ensure the type is string
      const pairName = tvlRow.pairName as string;
      const symbol = tvlRow.symbol as string;
      const strategyId = tvlRow.strategyId as string; // Include strategyId
      const evt_block_time = tvlRow.evt_block_time; // Include evt_block_time
      const evt_block_number = tvlRow.evt_block_number; // Include evt_block_number
      const transaction_index = tvlRow.transaction_index; // Include transaction_index
      const pairAddressStrategyKey = `${pairId}_${address}_${strategyId}`; // Unique identifier for pairId/address/strategyId
      const dailyKey = `${day}_${address}`;

      // Update the last known value for this pair/address/strategy
      lastKnownTvlByPairAddressStrategy.set(pairAddressStrategyKey, new Decimal(tvlRow.tvl));

      // Calculate the daily TVL for this address by summing the TVLs of all its strategies
      const dailyTvl = Array.from(lastKnownTvlByPairAddressStrategy.entries())
        .filter(([key]) => key.split('_')[1] === address) // Filter by address
        .reduce((sum, [_, value]) => sum.plus(value), new Decimal(0)); // Sum the TVLs for that day

      dailyTvlMap.set(dailyKey, {
        day: day,
        address: address,
        pairId: pairId,
        pairName: pairName,
        symbol: symbol,
        tvl: dailyTvl,
        evt_block_time: evt_block_time,
        evt_block_number: evt_block_number,
        strategyId: strategyId,
        transaction_index: transaction_index,
      });
    });

    // Collect all unique addresses from both initialTvlResults and tvlResults
    const addresses = new Set<string>([
      ...initialTvlResults.map((row) => row.address as string),
      ...tvlResults.map((row) => row.address as string),
    ]);

    // Fill missing dates with the last known TVL value or updated value
    const filledTvlData = new Map<
      string,
      {
        day: string;
        address: string;
        pairId: string;
        pairName: string;
        symbol: string;
        tvl: Decimal;
        evt_block_time: string;
        evt_block_number: number;
        strategyId: string;
        transaction_index: string;
      }
    >();

    addresses.forEach((address) => {
      // Get the first TVL date for this address
      const firstTvlDate = firstTvlDateMap.get(address);

      // Initialize the last known TVL for the address by summing all strategies for that address
      let lastKnownValue = Array.from(lastKnownTvlByPairAddressStrategy.entries())
        .filter(([key]) => key.split('_')[1] === address)
        .reduce((sum, [_, value]) => sum.plus(value), new Decimal(0));

      // Fill the data starting from the first TVL date
      for (let current = moment.utc(firstTvlDate); current <= moment.utc(end); current.add(1, 'day')) {
        const formattedDay = current.format('YYYY-MM-DD');
        const key = `${formattedDay}_${address}`;

        let pairId = '';
        let pairName = '';
        let symbol = '';
        let evt_block_time = '';
        let evt_block_number = 0; // Default evt_block_number to 0
        let strategyId = '';
        let transaction_index = '';

        if (dailyTvlMap.has(key)) {
          lastKnownValue = dailyTvlMap.get(key)!.tvl; // Update last known value if there is an update
          pairId = dailyTvlMap.get(key)!.pairId;
          pairName = dailyTvlMap.get(key)!.pairName;
          symbol = dailyTvlMap.get(key)!.symbol;
          evt_block_time = dailyTvlMap.get(key)!.evt_block_time;
          evt_block_number = dailyTvlMap.get(key)!.evt_block_number;
          strategyId = dailyTvlMap.get(key)!.strategyId;
          transaction_index = dailyTvlMap.get(key)!.transaction_index;
        } else {
          // If there's no entry in dailyTvlMap for this key, use the last known values
          const knownEntry = Array.from(dailyTvlMap.values()).find((entry) => entry.address === address);
          if (knownEntry) {
            pairId = knownEntry.pairId;
            pairName = knownEntry.pairName;
            symbol = knownEntry.symbol;
            evt_block_time = knownEntry.evt_block_time;
            evt_block_number = knownEntry.evt_block_number;
            strategyId = knownEntry.strategyId;
            transaction_index = knownEntry.transaction_index;
          }
        }

        filledTvlData.set(key, {
          day: formattedDay,
          address: address,
          pairId: pairId,
          pairName: pairName,
          symbol: symbol,
          tvl: lastKnownValue, // Use last known value
          evt_block_time: evt_block_time,
          evt_block_number: evt_block_number,
          strategyId: strategyId,
          transaction_index: transaction_index,
        });
      }
    });

    // Calculate TVL without USD rates and format results
    const finalResults = Array.from(filledTvlData.values()).map((tvlEntry) => {
      const dayTimestamp = moment(tvlEntry.day).unix(); // Convert day to Unix timestamp in seconds
      const evtBlockTimeTimestamp = moment(tvlEntry.evt_block_time).unix(); // Convert evt_block_time to Unix timestamp

      return {
        day: dayTimestamp,
        pairId: tvlEntry.pairId,
        pairName: tvlEntry.pairName,
        address: tvlEntry.address,
        symbol: tvlEntry.symbol,
        tvl: tvlEntry.tvl.toNumber(),
        evt_block_time: evtBlockTimeTimestamp, // Use Unix timestamp for evt_block_time
        evt_block_number: tvlEntry.evt_block_number,
        strategyId: tvlEntry.strategyId,
        transaction_index: tvlEntry.transaction_index,
      };
    });

    // Ensure results are sorted consistently for pagination
    finalResults.sort((a, b) => {
      if (a.pairId === null || a.pairId === undefined) {
        console.log('Missing pairId in finalResults:', a); // Log when a.pairId is null or undefined
      }
      if (b.pairId === null || b.pairId === undefined) {
        console.log('Missing pairId in finalResults:', b); // Log when b.pairId is null or undefined
      }

      // Safely coerce pairId to numbers for arithmetic comparison
      const pairIdA = Number(a.pairId) || 0;
      const pairIdB = Number(b.pairId) || 0;

      return (
        a.day - b.day ||
        a.evt_block_time - b.evt_block_time || // Use Unix timestamp comparison
        pairIdA - pairIdB || // Correct numerical comparison for pairId
        (a.address || '').localeCompare(b.address || '') || // Ensure string comparison for address
        (a.strategyId || '').localeCompare(b.strategyId || '') || // Ensure string comparison for strategyId
        a.evt_block_number - b.evt_block_number || // Correct numerical comparison for evt_block_number
        (a.transaction_index || '').localeCompare(b.transaction_index || '') // Ensure string comparison for transaction_index
      );
    });

    // Perform pagination using slice
    const paginatedResults = finalResults.slice(offset, offset + limit);

    // Determine unique addresses from the paginated results
    const uniqueAddresses = new Set<string>(paginatedResults.map((result) => result.address));

    // Query for USD rates only for these unique addresses
    const usdRateQuery = `
      SELECT
        time_bucket_gapfill('1 day', timestamp, '${usdStart}', '${end}') AS day,
        "tokenAddress" AS address,
        locf(avg("usd"::numeric)) AS usd  
      FROM "historic-quotes"
      WHERE
        timestamp <= '${end}'  
        AND timestamp >= '${usdStart}'  
        AND "blockchainType" = '${deployment.blockchainType}'
        AND "tokenAddress" IN (${Array.from(uniqueAddresses)
          .map((address) => `'${address}'`)
          .join(',')})
      GROUP BY "tokenAddress", day;
    `;
    const usdRateResults = await this.dataSource.query(usdRateQuery);

    // Create a map of USD rates for easier lookup
    const usdRateMap = new Map<string, number>();
    usdRateResults.forEach((rateRow) => {
      const key = `${moment(rateRow.day).format('YYYY-MM-DD')}_${rateRow.address as string}`;
      usdRateMap.set(key, rateRow.usd);
    });

    // Add USD data to the paginated results
    const finalResultsWithUsd = paginatedResults.map((result) => {
      const usdRateKey = `${moment.unix(result.day).format('YYYY-MM-DD')}_${result.address}`;
      const usdRate = usdRateMap.get(usdRateKey) || 0;
      const tvlUsd = result.tvl * usdRate;

      // Return different structures based on groupBy
      if (params.groupBy === GroupBy.PAIR) {
        return {
          pair: result.pairName, // Correct property for pair grouping
          tvlUsd: tvlUsd,
          day: result.day,
        };
      } else {
        return {
          address: result.address, // Correct property for address grouping
          tvl: result.tvl,
          tvlUsd: tvlUsd,
          symbol: result.symbol,
          day: result.day,
        };
      }
    });

    // Check if groupBy is pair and sum TVL values for all addresses with the same pairId
    if (params.groupBy === GroupBy.PAIR) {
      const groupedByPair = new Map<string, { pairName: string; day: number; tvlUsd: number }>();

      finalResultsWithUsd.forEach((result) => {
        const key = `${result.day}_${result.pair}`; // Correct property access
        if (!groupedByPair.has(key)) {
          groupedByPair.set(key, {
            pairName: result.pair,
            day: result.day,
            tvlUsd: result.tvlUsd,
          });
        } else {
          groupedByPair.get(key)!.tvlUsd += result.tvlUsd; // Sum TVL USD values for the same pairId
        }
      });

      return Array.from(groupedByPair.values()).map((entry) => ({
        pair: entry.pairName,
        tvlUsd: entry.tvlUsd,
        day: entry.day,
      }));
    }

    // Return the final results with USD data, respecting the limit and offset
    return finalResultsWithUsd;
  }

  async update(endBlock: number, deployment: Deployment): Promise<void> {
    const startBlock =
      (await this.lastProcessedBlockService.get(`${deployment.blockchainType}-${deployment.exchangeId}-tvl`)) || 1;

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

    // Update the last processed block number
    await this.lastProcessedBlockService.update(`${deployment.blockchainType}-${deployment.exchangeId}-tvl`, endBlock);
  }
}
