#!/usr/bin/env ts-node

import 'reflect-metadata';
import { DataSource, In } from 'typeorm';
import * as dotenv from 'dotenv';
import { Token } from '../token/token.entity';
import { Pair } from '../pair/pair.entity';
import { Strategy } from '../strategy/strategy.entity';
import { Block } from '../block/block.entity';
import { TokensTradedEvent } from '../events/tokens-traded-event/tokens-traded-event.entity';
import { PairTradingFeePpmUpdatedEvent } from '../events/pair-trading-fee-ppm-updated-event/pair-trading-fee-ppm-updated-event.entity';
import { StrategyCreatedEvent } from '../events/strategy-created-event/strategy-created-event.entity';
import { StrategyUpdatedEvent } from '../events/strategy-updated-event/strategy-updated-event.entity';
import { StrategyDeletedEvent } from '../events/strategy-deleted-event/strategy-deleted-event.entity';
import { Quote } from '../quote/quote.entity';

// Load environment variables
dotenv.config();

interface DuplicateTokenInfo {
  normalized_address: string;
  blockchainType: string;
  exchangeId: string;
  count: number;
  token_ids: number[];
  addresses: string[];
  keep_token_id: number;
  remove_token_ids: number[];
  affected_records: number;
}

interface DuplicatePairInfo {
  token0Id: number;
  token1Id: number;
  count: number;
  pair_ids: number[];
  keep_pair_id: number;
  remove_pair_ids: number[];
  affected_records: number;
}

interface CleanupResult {
  summary: {
    duplicateTokens: number;
    duplicatePairs: number;
    affectedRecords: number;
  };
  tokenUpdates: DuplicateTokenInfo[];
  pairUpdates: DuplicatePairInfo[];
  logs: string[];
}

class StandaloneDuplicateCleanup {
  private dataSource: DataSource;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
  }

  private log(message: string) {
    console.log(`${new Date().toISOString()}: ${message}`);
  }

  async analyzeDuplicates(): Promise<CleanupResult> {
    const startTime = Date.now();
    this.log('🔍 Starting duplicate analysis...');

    // Run primary queries in parallel
    this.log('📊 Running database queries to identify duplicates...');
    const [duplicateTokens, duplicatePairs] = await Promise.all([
      this.findDuplicateTokens(),
      this.findDuplicatePairs(),
    ]);

    const analysisTime = Date.now() - startTime;
    this.log(`✅ Analysis completed in ${analysisTime}ms`);
    this.log(`📋 Found ${duplicateTokens.length} duplicate token groups`);
    this.log(`📋 Found ${duplicatePairs.length} duplicate pair groups`);

    // Log detailed information about each duplicate group
    if (duplicateTokens.length > 0) {
      this.log('\n🔍 Token duplicate details:');
      duplicateTokens.forEach((token, index) => {
        this.log(`  ${index + 1}. ${token.normalized_address} (${token.blockchainType}:${token.exchangeId})`);
        this.log(`     • Duplicates: ${token.count} (keeping ID: ${token.keep_token_id})`);
        this.log(`     • Addresses: ${token.addresses.join(', ')}`);
        this.log(`     • Affected records: ${token.affected_records}`);
      });
    }

    if (duplicatePairs.length > 0) {
      this.log('\n🔍 Pair duplicate details:');
      duplicatePairs.forEach((pair, index) => {
        this.log(`  ${index + 1}. Token0=${pair.token0Id}, Token1=${pair.token1Id}`);
        this.log(`     • Duplicates: ${pair.count} (keeping ID: ${pair.keep_pair_id})`);
        this.log(`     • Affected records: ${pair.affected_records}`);
      });
    }

    const logs = [
      `Analysis completed in ${analysisTime}ms`,
      `Found ${duplicateTokens.length} duplicate token groups`,
      `Found ${duplicatePairs.length} duplicate pair groups`,
    ];

    const totalAffectedRecords =
      duplicateTokens.reduce((sum, token) => sum + token.affected_records, 0) +
      duplicatePairs.reduce((sum, pair) => sum + pair.affected_records, 0);

    this.log(`📊 Total records that will be updated: ${totalAffectedRecords}`);

    return {
      summary: {
        duplicateTokens: duplicateTokens.length,
        duplicatePairs: duplicatePairs.length,
        affectedRecords: totalAffectedRecords,
      },
      tokenUpdates: duplicateTokens,
      pairUpdates: duplicatePairs,
      logs,
    };
  }

  async executeDuplicateCleanup(): Promise<CleanupResult> {
    const startTime = Date.now();
    this.log('🚀 Starting duplicate cleanup execution...');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    this.log('🔄 Database transaction started');

    try {
      // Run primary queries in parallel
      this.log('📊 Re-scanning for duplicates...');
      const [duplicateTokens, duplicatePairs] = await Promise.all([
        this.findDuplicateTokens(),
        this.findDuplicatePairs(),
      ]);

      this.log(`📋 Found ${duplicateTokens.length} duplicate token groups to clean`);
      this.log(`📋 Found ${duplicatePairs.length} duplicate pair groups to clean`);

      const logs = [
        `Found ${duplicateTokens.length} duplicate token groups to clean`,
        `Found ${duplicatePairs.length} duplicate pair groups to clean`,
      ];

      const totalGroups = duplicateTokens.length + duplicatePairs.length;
      if (totalGroups === 0) {
        this.log('✅ No duplicates found - nothing to clean up');
        await queryRunner.commitTransaction();
        return {
          summary: { duplicateTokens: 0, duplicatePairs: 0, affectedRecords: 0 },
          tokenUpdates: [],
          pairUpdates: [],
          logs: ['No duplicates found - nothing to clean up'],
        };
      }

      // Step 1: Update token references
      this.log(`\n🔄 Step 1/4: Updating token references (${duplicateTokens.length} groups)`);
      for (let i = 0; i < duplicateTokens.length; i++) {
        const tokenGroup = duplicateTokens[i];
        this.log(`  [${i + 1}/${duplicateTokens.length}] Processing token: ${tokenGroup.normalized_address}`);
        this.log(`    • Removing IDs: ${tokenGroup.remove_token_ids.join(', ')}`);
        this.log(`    • Keeping ID: ${tokenGroup.keep_token_id}`);
        this.log(`    • Affected records: ${tokenGroup.affected_records}`);

        const stepStart = Date.now();
        await this.updateTokenReferences(tokenGroup, queryRunner);
        const stepTime = Date.now() - stepStart;

        this.log(`    ✅ Completed in ${stepTime}ms`);
        logs.push(`Updated references for token: ${tokenGroup.normalized_address} (${stepTime}ms)`);
      }

      // Step 2: Update pair references
      this.log(`\n🔄 Step 2/4: Updating pair references (${duplicatePairs.length} groups)`);
      for (let i = 0; i < duplicatePairs.length; i++) {
        const pairGroup = duplicatePairs[i];
        this.log(`  [${i + 1}/${duplicatePairs.length}] Processing pair: ${pairGroup.token0Id}-${pairGroup.token1Id}`);
        this.log(`    • Removing IDs: ${pairGroup.remove_pair_ids.join(', ')}`);
        this.log(`    • Keeping ID: ${pairGroup.keep_pair_id}`);
        this.log(`    • Affected records: ${pairGroup.affected_records}`);

        const stepStart = Date.now();
        await this.updatePairReferences(pairGroup, queryRunner);
        const stepTime = Date.now() - stepStart;

        this.log(`    ✅ Completed in ${stepTime}ms`);
        logs.push(`Updated references for pair: ${pairGroup.token0Id}-${pairGroup.token1Id} (${stepTime}ms)`);
      }

      // Step 3: Delete quotes for duplicate tokens
      this.log(`\n🗑️ Step 3/5: Deleting quotes for duplicate tokens (${duplicateTokens.length} groups)`);
      for (let i = 0; i < duplicateTokens.length; i++) {
        const tokenGroup = duplicateTokens[i];
        this.log(
          `  [${i + 1}/${duplicateTokens.length}] Deleting quotes for tokens: ${tokenGroup.remove_token_ids.join(
            ', ',
          )}`,
        );

        const stepStart = Date.now();
        await this.deleteQuotesForDuplicateTokens(tokenGroup, queryRunner);
        const stepTime = Date.now() - stepStart;

        this.log(`    ✅ Deleted in ${stepTime}ms`);
        logs.push(`Deleted quotes for duplicate tokens: ${tokenGroup.normalized_address} (${stepTime}ms)`);
      }

      // Step 4: Delete duplicate tokens
      this.log(`\n🗑️ Step 4/5: Deleting duplicate tokens (${duplicateTokens.length} groups)`);
      for (let i = 0; i < duplicateTokens.length; i++) {
        const tokenGroup = duplicateTokens[i];
        this.log(`  [${i + 1}/${duplicateTokens.length}] Deleting tokens: ${tokenGroup.remove_token_ids.join(', ')}`);

        const stepStart = Date.now();
        await this.deleteDuplicateTokens(tokenGroup, queryRunner);
        const stepTime = Date.now() - stepStart;

        this.log(`    ✅ Deleted in ${stepTime}ms`);
        logs.push(`Deleted duplicate tokens for: ${tokenGroup.normalized_address} (${stepTime}ms)`);
      }

      // Step 5: Delete duplicate pairs
      this.log(`\n🗑️ Step 5/5: Deleting duplicate pairs (${duplicatePairs.length} groups)`);
      for (let i = 0; i < duplicatePairs.length; i++) {
        const pairGroup = duplicatePairs[i];
        this.log(`  [${i + 1}/${duplicatePairs.length}] Deleting pairs: ${pairGroup.remove_pair_ids.join(', ')}`);

        const stepStart = Date.now();
        await this.deleteDuplicatePairs(pairGroup, queryRunner);
        const stepTime = Date.now() - stepStart;

        this.log(`    ✅ Deleted in ${stepTime}ms`);
        logs.push(`Deleted duplicate pairs for: ${pairGroup.token0Id}-${pairGroup.token1Id} (${stepTime}ms)`);
      }

      await queryRunner.commitTransaction();
      const totalTime = Date.now() - startTime;
      this.log(`\n🎉 Duplicate cleanup completed successfully in ${totalTime}ms`);
      logs.push(`Duplicate cleanup completed successfully in ${totalTime}ms`);

      const totalAffectedRecords =
        duplicateTokens.reduce((sum, token) => sum + token.affected_records, 0) +
        duplicatePairs.reduce((sum, pair) => sum + pair.affected_records, 0);

      return {
        summary: {
          duplicateTokens: duplicateTokens.length,
          duplicatePairs: duplicatePairs.length,
          affectedRecords: totalAffectedRecords,
        },
        tokenUpdates: duplicateTokens,
        pairUpdates: duplicatePairs,
        logs,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.log(`❌ Duplicate cleanup failed, rolling back transaction: ${error.message}`);
      throw error;
    } finally {
      await queryRunner.release();
      this.log('🔄 Database connection released');
    }
  }

  private async findDuplicateTokens(): Promise<DuplicateTokenInfo[]> {
    this.log('🔍 Searching for duplicate tokens...');
    const query = `
      SELECT 
        LOWER(address) as normalized_address,
        "blockchainType",
        "exchangeId",
        COUNT(*) as count,
        array_agg(id ORDER BY "createdAt" ASC) as token_ids,
        array_agg(address ORDER BY "createdAt" ASC) as addresses
      FROM tokens 
      GROUP BY LOWER(address), "blockchainType", "exchangeId"
      HAVING COUNT(*) > 1
    `;

    const results = await this.dataSource.query(query);
    this.log(`🔍 Found ${results.length} potential duplicate token groups`);

    if (results.length === 0) {
      return [];
    }

    this.log('📊 Counting affected records for each token group...');
    // Run affected record counting in parallel for all duplicate groups
    const duplicateTokensPromises = results.map(async (result, index) => {
      this.log(`  [${index + 1}/${results.length}] Analyzing token: ${result.normalized_address}`);
      const affectedRecords = await this.countTokenAffectedRecords(result.token_ids);

      return {
        normalized_address: result.normalized_address,
        blockchainType: result.blockchainType,
        exchangeId: result.exchangeId,
        count: result.count,
        token_ids: result.token_ids,
        addresses: result.addresses,
        keep_token_id: result.token_ids[0], // Keep the oldest
        remove_token_ids: result.token_ids.slice(1), // Remove the rest
        affected_records: affectedRecords,
      };
    });

    const duplicateTokens = await Promise.all(duplicateTokensPromises);
    this.log(`✅ Token analysis completed`);
    return duplicateTokens;
  }

  private async findDuplicatePairs(): Promise<DuplicatePairInfo[]> {
    this.log('🔍 Searching for duplicate pairs...');
    const query = `
      SELECT 
        "token0Id",
        "token1Id",
        COUNT(*) as count,
        array_agg(id ORDER BY "createdAt" ASC) as pair_ids
      FROM pairs 
      GROUP BY "token0Id", "token1Id"
      HAVING COUNT(*) > 1
    `;

    const results = await this.dataSource.query(query);
    this.log(`🔍 Found ${results.length} potential duplicate pair groups`);

    if (results.length === 0) {
      return [];
    }

    this.log('📊 Counting affected records for each pair group...');
    // Run affected record counting in parallel for all duplicate groups
    const duplicatePairsPromises = results.map(async (result, index) => {
      this.log(`  [${index + 1}/${results.length}] Analyzing pair: ${result.token0Id}-${result.token1Id}`);
      const affectedRecords = await this.countPairAffectedRecords(result.pair_ids);

      return {
        token0Id: result.token0Id,
        token1Id: result.token1Id,
        count: result.count,
        pair_ids: result.pair_ids,
        keep_pair_id: result.pair_ids[0], // Keep the oldest
        remove_pair_ids: result.pair_ids.slice(1), // Remove the rest
        affected_records: affectedRecords,
      };
    });

    const duplicatePairs = await Promise.all(duplicatePairsPromises);
    this.log(`✅ Pair analysis completed`);
    return duplicatePairs;
  }

  private async countTokenAffectedRecords(tokenIds: number[]): Promise<number> {
    const duplicateIds = tokenIds.slice(1); // Exclude the one we're keeping
    if (duplicateIds.length === 0) return 0;

    // Count affected records in each table
    const tables = [
      { name: 'strategies', columns: ['"token0Id"', '"token1Id"'] },
      { name: 'pairs', columns: ['"token0Id"', '"token1Id"'] },
      { name: '"tokens-traded-events"', columns: ['"sourceTokenId"', '"targetTokenId"'] },
      { name: '"strategy-created-events"', columns: ['"token0Id"', '"token1Id"'] },
      { name: '"strategy-updated-events"', columns: ['"token0Id"', '"token1Id"'] },
      { name: '"strategy-deleted-events"', columns: ['"token0Id"', '"token1Id"'] },
      { name: 'quotes', columns: ['"tokenId"'] },
    ];

    // Run all count queries in parallel
    const countPromises: Promise<number>[] = [];

    for (const table of tables) {
      for (const column of table.columns) {
        countPromises.push(
          this.dataSource
            .query(`SELECT COUNT(*) as count FROM ${table.name} WHERE ${column} = ANY($1::int[])`, [duplicateIds])
            .then((result) => parseInt(result[0].count)),
        );
      }
    }

    const counts = await Promise.all(countPromises);
    const totalCount = counts.reduce((sum, count) => sum + count, 0);

    // Log table-specific counts if there are any affected records
    if (totalCount > 0) {
      let countIndex = 0;
      for (const table of tables) {
        for (const column of table.columns) {
          const count = counts[countIndex];
          if (count > 0) {
            this.log(`    • ${table.name}.${column}: ${count} records`);
          }
          countIndex++;
        }
      }
    }

    return totalCount;
  }

  private async countPairAffectedRecords(pairIds: number[]): Promise<number> {
    const duplicateIds = pairIds.slice(1); // Exclude the one we're keeping
    if (duplicateIds.length === 0) return 0;

    // Count affected records in tables that reference pair
    const tables = [
      { name: 'strategies', column: '"pairId"' },
      { name: '"tokens-traded-events"', column: '"pairId"' },
      { name: '"strategy-created-events"', column: '"pairId"' },
      { name: '"strategy-updated-events"', column: '"pairId"' },
      { name: '"strategy-deleted-events"', column: '"pairId"' },
      { name: '"pair-trading-fee-ppm-updated-events"', column: '"pairId"' },
    ];

    // Run all count queries in parallel
    const countPromises = tables.map((table) =>
      this.dataSource
        .query(`SELECT COUNT(*) as count FROM ${table.name} WHERE ${table.column} = ANY($1::int[])`, [duplicateIds])
        .then((result) => parseInt(result[0].count)),
    );

    const counts = await Promise.all(countPromises);
    const totalCount = counts.reduce((sum, count) => sum + count, 0);

    // Log table-specific counts if there are any affected records
    if (totalCount > 0) {
      tables.forEach((table, index) => {
        const count = counts[index];
        if (count > 0) {
          this.log(`    • ${table.name}.${table.column}: ${count} records`);
        }
      });
    }

    return totalCount;
  }

  private async updateTokenReferences(tokenGroup: DuplicateTokenInfo, queryRunner: any): Promise<void> {
    const keepId = tokenGroup.keep_token_id;
    const removeIds = tokenGroup.remove_token_ids;

    if (removeIds.length === 0) return;

    this.log(`      🔄 Updating token references: ${removeIds.join(', ')} -> ${keepId}`);

    // Update strategies
    this.log(`      • Updating strategies table...`);
    await queryRunner.query(`UPDATE strategies SET "token0Id" = $1 WHERE "token0Id" = ANY($2::int[])`, [
      keepId,
      removeIds,
    ]);
    await queryRunner.query(`UPDATE strategies SET "token1Id" = $1 WHERE "token1Id" = ANY($2::int[])`, [
      keepId,
      removeIds,
    ]);

    // Update pairs table
    this.log(`      • Updating pairs table...`);
    await queryRunner.query(`UPDATE pairs SET "token0Id" = $1 WHERE "token0Id" = ANY($2::int[])`, [keepId, removeIds]);
    await queryRunner.query(`UPDATE pairs SET "token1Id" = $1 WHERE "token1Id" = ANY($2::int[])`, [keepId, removeIds]);

    // Update strategy event tables
    this.log(`      • Updating strategy event tables...`);
    const strategyEventTables = ['"strategy-created-events"', '"strategy-updated-events"', '"strategy-deleted-events"'];

    for (const table of strategyEventTables) {
      await queryRunner.query(`UPDATE ${table} SET "token0Id" = $1 WHERE "token0Id" = ANY($2::int[])`, [
        keepId,
        removeIds,
      ]);
      await queryRunner.query(`UPDATE ${table} SET "token1Id" = $1 WHERE "token1Id" = ANY($2::int[])`, [
        keepId,
        removeIds,
      ]);
    }

    // Update tokens-traded-events table
    this.log(`      • Updating tokens-traded-events table...`);
    await queryRunner.query(
      `UPDATE "tokens-traded-events" SET "sourceTokenId" = $1 WHERE "sourceTokenId" = ANY($2::int[])`,
      [keepId, removeIds],
    );
    await queryRunner.query(
      `UPDATE "tokens-traded-events" SET "targetTokenId" = $1 WHERE "targetTokenId" = ANY($2::int[])`,
      [keepId, removeIds],
    );

    this.log(`      ✅ Token reference updates completed`);
  }

  private async updatePairReferences(pairGroup: DuplicatePairInfo, queryRunner: any): Promise<void> {
    const keepId = pairGroup.keep_pair_id;
    const removeIds = pairGroup.remove_pair_ids;

    if (removeIds.length === 0) return;

    this.log(`      🔄 Updating pair references: ${removeIds.join(', ')} -> ${keepId}`);

    // Update strategies table first (main table)
    this.log(`      • Updating strategies table...`);
    await queryRunner.query(`UPDATE strategies SET "pairId" = $1 WHERE "pairId" = ANY($2::int[])`, [keepId, removeIds]);

    // Update all tables that reference pairId
    const pairEventTables = [
      '"tokens-traded-events"',
      '"strategy-created-events"',
      '"strategy-updated-events"',
      '"strategy-deleted-events"',
      '"pair-trading-fee-ppm-updated-events"',
    ];

    this.log(`      • Updating ${pairEventTables.length} event tables...`);
    for (const table of pairEventTables) {
      this.log(`        - Updating ${table}...`);
      await queryRunner.query(`UPDATE ${table} SET "pairId" = $1 WHERE "pairId" = ANY($2::int[])`, [keepId, removeIds]);
    }

    this.log(`      ✅ Pair reference updates completed`);
  }

  private async deleteQuotesForDuplicateTokens(tokenGroup: DuplicateTokenInfo, queryRunner: any): Promise<void> {
    const removeIds = tokenGroup.remove_token_ids;

    if (removeIds.length === 0) return;

    this.log(`      🗑️ Deleting quotes for duplicate tokens: ${removeIds.join(', ')}`);
    await queryRunner.query(`DELETE FROM quotes WHERE "tokenId" = ANY($1::int[])`, [removeIds]);
  }

  private async deleteDuplicateTokens(tokenGroup: DuplicateTokenInfo, queryRunner: any): Promise<void> {
    const removeIds = tokenGroup.remove_token_ids;

    if (removeIds.length === 0) return;

    this.log(`      🗑️ Deleting duplicate tokens: ${removeIds.join(', ')}`);
    await queryRunner.query(`DELETE FROM tokens WHERE id = ANY($1::int[])`, [removeIds]);
  }

  private async deleteDuplicatePairs(pairGroup: DuplicatePairInfo, queryRunner: any): Promise<void> {
    const removeIds = pairGroup.remove_pair_ids;

    if (removeIds.length === 0) return;

    this.log(`      🗑️ Deleting duplicate pairs: ${removeIds.join(', ')}`);
    await queryRunner.query(`DELETE FROM pairs WHERE id = ANY($1::int[])`, [removeIds]);
  }
}

async function main() {
  console.log('🚀 Starting standalone duplicate cleanup script...');
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
      Quote,
      TokensTradedEvent,
      PairTradingFeePpmUpdatedEvent,
      StrategyCreatedEvent,
      StrategyUpdatedEvent,
      StrategyDeletedEvent,
    ],
    synchronize: false,
    logging: false,
  });

  try {
    await dataSource.initialize();
    console.log('✅ Database connected successfully');

    const cleanup = new StandaloneDuplicateCleanup(dataSource);

    // Run analysis first
    console.log('\n🔍 Running analysis first...');
    const analysis = await cleanup.analyzeDuplicates();

    console.log('\n📊 Analysis Results:');
    console.log(`   • Duplicate token groups: ${analysis.summary.duplicateTokens}`);
    console.log(`   • Duplicate pair groups: ${analysis.summary.duplicatePairs}`);
    console.log(`   • Total affected records: ${analysis.summary.affectedRecords}`);

    if (analysis.summary.duplicateTokens === 0 && analysis.summary.duplicatePairs === 0) {
      console.log('✅ No duplicates found! Nothing to clean up.');
      return;
    }

    // Execute cleanup
    console.log('\n🧹 Starting cleanup execution...');
    const result = await cleanup.executeDuplicateCleanup();

    console.log('\n✅ Cleanup completed successfully!');
    console.log('📋 Final Summary:');
    console.log(`   • Token groups cleaned: ${result.summary.duplicateTokens}`);
    console.log(`   • Pair groups cleaned: ${result.summary.duplicatePairs}`);
    console.log(`   • Records updated: ${result.summary.affectedRecords}`);

    console.log('\n📝 Detailed logs:');
    result.logs.forEach((log, index) => {
      console.log(`   ${index + 1}. ${log}`);
    });
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
