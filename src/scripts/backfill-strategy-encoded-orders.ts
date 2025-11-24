#!/usr/bin/env ts-node

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { Token } from '../token/token.entity';
import { Pair } from '../pair/pair.entity';
import { Strategy } from '../strategy/strategy.entity';
import { Block } from '../block/block.entity';
import { StrategyCreatedEvent } from '../events/strategy-created-event/strategy-created-event.entity';
import { StrategyUpdatedEvent } from '../events/strategy-updated-event/strategy-updated-event.entity';
import { StrategyDeletedEvent } from '../events/strategy-deleted-event/strategy-deleted-event.entity';
import { VoucherTransferEvent } from '../events/voucher-transfer-event/voucher-transfer-event.entity';
import { TokensTradedEvent } from '../events/tokens-traded-event/tokens-traded-event.entity';
import { PairCreatedEvent } from '../events/pair-created-event/pair-created-event.entity';
import { PairTradingFeePpmUpdatedEvent } from '../events/pair-trading-fee-ppm-updated-event/pair-trading-fee-ppm-updated-event.entity';
import { TradingFeePpmUpdatedEvent } from '../events/trading-fee-ppm-updated-event/trading-fee-ppm-updated-event.entity';

// Load environment variables
dotenv.config();

class StrategyEncodedOrdersBackfill {
  private dataSource: DataSource;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
  }

  private log(message: string) {
    console.log(`${new Date().toISOString()}: ${message}`);
  }

  async backfillEncodedOrders(): Promise<void> {
    const startTime = Date.now();
    this.log('🚀 Starting encoded orders backfill...');

    // Check if there are more than 1 row with NULL values
    const nullCount = await this.dataSource
      .getRepository(Strategy)
      .createQueryBuilder('s')
      .where('s.encodedOrder0 IS NULL')
      .orWhere('s.encodedOrder1 IS NULL')
      .orWhere('s.owner IS NULL')
      .getCount();

    this.log(`📊 Found ${nullCount} strategies with NULL values`);

    if (nullCount <= 1) {
      this.log('✅ No significant NULL values found, skipping backfill');
      return;
    }

    // Get ALL strategies (not just ones with NULL values)
    // This allows re-running the script to fix any bad data
    const strategies = await this.dataSource.getRepository(Strategy).createQueryBuilder('s').getMany();

    this.log(`📊 Found ${strategies.length} strategies to backfill`);

    if (strategies.length === 0) {
      this.log('✅ No strategies need backfilling');
      return;
    }

    // Group strategies by deployment (blockchainType + exchangeId)
    const strategiesByDeployment = new Map<string, Strategy[]>();
    for (const strategy of strategies) {
      const key = `${strategy.blockchainType}_${strategy.exchangeId}`;
      if (!strategiesByDeployment.has(key)) {
        strategiesByDeployment.set(key, []);
      }
      strategiesByDeployment.get(key).push(strategy);
    }

    this.log(`📊 Found ${strategiesByDeployment.size} deployments to process`);

    let totalProcessedCount = 0;

    // Process each deployment separately
    for (const [deploymentKey, deploymentStrategies] of strategiesByDeployment.entries()) {
      const [blockchainType, exchangeId] = deploymentKey.split('_');
      this.log(`\n🔗 Processing ${deploymentStrategies.length} strategies for ${blockchainType}:${exchangeId}`);

      const BATCH_SIZE = 100;
      let processedCount = 0;

      for (let i = 0; i < deploymentStrategies.length; i += BATCH_SIZE) {
        const batch = deploymentStrategies.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(deploymentStrategies.length / BATCH_SIZE);

        this.log(`  📦 Batch ${batchNumber}/${totalBatches} (${batch.length} strategies)`);

        const strategyIds = batch.map((s) => s.strategyId);

        // Get latest orders for each strategy
        const latestEvents = await this.getLatestEventsForStrategies(strategyIds, blockchainType, exchangeId);

        // Get latest owners
        const latestOwners = await this.getLatestOwnersForStrategies(strategyIds, blockchainType, exchangeId);

        // Update strategies
        for (const strategy of batch) {
          const latestEvent = latestEvents.get(strategy.strategyId);
          const latestOwner = latestOwners.get(strategy.strategyId);

          if (latestEvent) {
            strategy.encodedOrder0 = latestEvent.order0;
            strategy.encodedOrder1 = latestEvent.order1;
          }

          if (latestOwner) {
            strategy.owner = latestOwner;
          } else if (latestEvent && latestEvent.owner) {
            // Fallback to created event owner if no transfer found
            strategy.owner = latestEvent.owner;
          }
        }

        // Save batch
        await this.dataSource.getRepository(Strategy).save(batch);
        processedCount += batch.length;
        totalProcessedCount += batch.length;

        this.log(
          `  ✅ Batch ${batchNumber}/${totalBatches} completed (${processedCount}/${deploymentStrategies.length} for this deployment)`,
        );
      }
    }

    const totalTime = Date.now() - startTime;
    this.log(`\n🎉 Backfill completed successfully in ${totalTime}ms`);
    this.log(`📊 Total strategies backfilled: ${totalProcessedCount}`);
  }

  private async getLatestEventsForStrategies(
    strategyIds: string[],
    blockchainType: string,
    exchangeId: string,
  ): Promise<Map<string, { order0: string; order1: string; owner?: string }>> {
    // Query to get the latest event (created or updated) for each strategy
    const query = `
      WITH latest_events AS (
        SELECT DISTINCT ON (strategy_id)
          strategy_id,
          order0,
          order1,
          owner,
          block_id,
          transaction_index,
          log_index
        FROM (
          SELECT
            c."strategyId" as strategy_id,
            c.order0,
            c.order1,
            c.owner,
            c."blockId" as block_id,
            c."transactionIndex" as transaction_index,
            c."logIndex" as log_index
          FROM "strategy-created-events" c
          WHERE c."strategyId" = ANY($1)
            AND c."blockchainType" = $2
            AND c."exchangeId" = $3
          
          UNION ALL
          
          SELECT
            u."strategyId" as strategy_id,
            u.order0,
            u.order1,
            null as owner,
            u."blockId" as block_id,
            u."transactionIndex" as transaction_index,
            u."logIndex" as log_index
          FROM "strategy-updated-events" u
          WHERE u."strategyId" = ANY($1)
            AND u."blockchainType" = $2
            AND u."exchangeId" = $3
        ) combined
        ORDER BY strategy_id, block_id DESC, transaction_index DESC, log_index DESC
      )
      SELECT * FROM latest_events
    `;

    const results = await this.dataSource.query(query, [strategyIds, blockchainType, exchangeId]);

    const eventsMap = new Map<string, { order0: string; order1: string; owner?: string }>();
    for (const row of results) {
      eventsMap.set(row.strategy_id, {
        order0: row.order0,
        order1: row.order1,
        owner: row.owner,
      });
    }

    return eventsMap;
  }

  private async getLatestOwnersForStrategies(
    strategyIds: string[],
    blockchainType: string,
    exchangeId: string,
  ): Promise<Map<string, string>> {
    // Query to get the latest owner (from transfer events) for each strategy
    const query = `
      SELECT DISTINCT ON ("strategyId")
        "strategyId" as strategy_id,
        "to" as owner
      FROM "voucher-transfer-events"
      WHERE "strategyId" = ANY($1)
        AND "blockchainType" = $2
        AND "exchangeId" = $3
      ORDER BY "strategyId", "blockId" DESC, "transactionIndex" DESC, "logIndex" DESC
    `;

    const results = await this.dataSource.query(query, [strategyIds, blockchainType, exchangeId]);

    const ownersMap = new Map<string, string>();
    for (const row of results) {
      ownersMap.set(row.strategy_id, row.owner);
    }

    return ownersMap;
  }
}

async function main() {
  console.log('🚀 Starting strategy encoded orders backfill script...');
  console.log('📅 Started at:', new Date().toISOString());

  // Validate required environment variables
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  // Create database connection
  console.log('🔗 Connecting to database...');
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_SSL_ENABLED === '1'
        ? {
            ca: process.env.CARBON_BACKEND_SQL_CERTIFICATION,
            ciphers: [
              'ECDHE-RSA-AES128-SHA256',
              'DHE-RSA-AES128-SHA256',
              'AES128-GCM-SHA256',
              '!RC4',
              'HIGH',
              '!MD5',
              '!aNULL',
            ].join(':'),
            honorCipherOrder: true,
            rejectUnauthorized: false,
          }
        : false,
    entities: [
      Token,
      Pair,
      Strategy,
      Block,
      StrategyCreatedEvent,
      StrategyUpdatedEvent,
      StrategyDeletedEvent,
      VoucherTransferEvent,
      TokensTradedEvent,
      PairCreatedEvent,
      PairTradingFeePpmUpdatedEvent,
      TradingFeePpmUpdatedEvent,
    ],
    synchronize: false,
    logging: false,
  });

  try {
    await dataSource.initialize();
    console.log('✅ Database connected successfully');

    const backfill = new StrategyEncodedOrdersBackfill(dataSource);
    await backfill.backfillEncodedOrders();

    console.log('\n✅ Script completed successfully!');
  } catch (error) {
    console.error('❌ Script failed:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
      console.log('🔄 Database connection closed');
    }
    console.log('✅ Script completed at:', new Date().toISOString());
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Run the script
main();
