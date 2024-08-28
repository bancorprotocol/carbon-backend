import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TvlDto } from '../v1/analytics/tvl.dto';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { Tvl } from './tvl.entity';
import { Deployment } from '../deployment/deployment.service';

@Injectable()
export class TvlService {
  constructor(
    @InjectRepository(Tvl)
    private tvlRepository: Repository<Tvl>,
    private dataSource: DataSource,
    private lastProcessedBlockService: LastProcessedBlockService,
  ) {}

  async getTvl(params: TvlDto): Promise<Tvl[]> {
    const queryBuilder = this.tvlRepository.createQueryBuilder('tvl');

    if (params.start) {
      queryBuilder.andWhere('tvl.timestamp >= :start', { start: new Date(params.start * 1000) });
    }

    if (params.end) {
      queryBuilder.andWhere('tvl.timestamp <= :end', { end: new Date(params.end * 1000) });
    }

    queryBuilder.orderBy('tvl.timestamp', 'DESC');

    const limit = params.limit || 10000; // Default limit of 10,000

    if (limit) {
      queryBuilder.take(limit);
    }

    if ('offset' in params && params.offset) {
      queryBuilder.skip(params.offset);
    }

    return queryBuilder.getMany();
  }

  async update(endBlock: number, deployment: Deployment): Promise<void> {
    const startBlock =
      (await this.lastProcessedBlockService.get(`${deployment.blockchainType}-${deployment.exchangeId}-tvl`)) || 1;

    // Query to get the TVL data
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
        evt_block_number > ${startBlock} -- saved start_block
),
-- Get y and truncated day
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
        pairname,
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
        pairname,
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
                WHEN reason = 4 THEN 0 -- deleted
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
                    id <= ${startBlock} -- saved start_block
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
    reason,
    address,
    symbol,
    tvl
FROM
    tvl    
    `;

    const result = await this.dataSource.query(query);
    const batchSize = 1000;
    for (let i = 0; i < result.length; i += batchSize) {
      const batch = result.slice(i, i + batchSize).map((record) => ({
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        strategyid: record.strategyid,
        pairname: record.pairname,
        symbol: record.symbol,
        tvl: record.tvl,
        evt_block_time: record.evt_block_time,
        address: record.address,
        reason: record.reason,
        evt_block_number: record.evt_block_number,
        transaction_index: record.transaction_index,
      }));
      await this.tvlRepository.save(batch);
    }

    // Update the last processed block number
    await this.lastProcessedBlockService.update(`${deployment.blockchainType}-${deployment.exchangeId}-tvl`, endBlock);
  }
}
