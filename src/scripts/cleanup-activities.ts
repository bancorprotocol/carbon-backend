#!/usr/bin/env ts-node

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as readline from 'readline';
import { ActivityV2 } from '../activity/activity-v2.entity';
import { Token } from '../token/token.entity';

// Load environment variables
dotenv.config();

interface BatchTransferCleanupSummary {
  totalBatchTransfers: number;
  totalCreateActivitiesToUpdate: number;
  batchTransfersByBlockchain: Record<string, number>;
  batchTransfersByExchange: Record<string, number>;
  affectedTransactions: number;
  dateRange: {
    earliest: Date | null;
    latest: Date | null;
  };
  sampleTransferIds: number[];
  sampleCreateIds: number[];
  sampleTransactionHashes: string[];
}

interface ActivityCleanupOptions {
  dryRun: boolean;
  blockchainType?: string;
  exchangeId?: string;
  confirmationRequired: boolean;
}

// Database configuration
const ssl =
  process.env.DATABASE_SSL_ENABLED === '1'
    ? {
        require: true,
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
      }
    : null;

const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [ActivityV2, Token],
  ssl,
  synchronize: false,
  logging: false,
});

class ActivityCleanupService {
  private dataSource: DataSource;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
  }

  /**
   * Get a summary of batch transfer activities that would be affected by the cleanup
   */
  async getCleanupSummary(options: ActivityCleanupOptions): Promise<BatchTransferCleanupSummary> {
    // Step 1: Find transactions that have both create_strategy and transfer_strategy activities
    const batchTransactionsQuery = `
      SELECT 
        txhash,
        "blockchainType",
        "exchangeId",
        COUNT(CASE WHEN action = 'create_strategy' THEN 1 END) as create_count,
        COUNT(CASE WHEN action = 'transfer_strategy' THEN 1 END) as transfer_count
      FROM "activities-v2" 
      WHERE action IN ('create_strategy', 'transfer_strategy')
      ${options.blockchainType ? `AND "blockchainType" = '${options.blockchainType}'` : ''}
      ${options.exchangeId ? `AND "exchangeId" = '${options.exchangeId}'` : ''}
      GROUP BY txhash, "blockchainType", "exchangeId"
      HAVING COUNT(CASE WHEN action = 'create_strategy' THEN 1 END) > 0 
         AND COUNT(CASE WHEN action = 'transfer_strategy' THEN 1 END) > 0
    `;

    const batchTransactions = await this.dataSource.query(batchTransactionsQuery);

    if (batchTransactions.length === 0) {
      return {
        totalBatchTransfers: 0,
        totalCreateActivitiesToUpdate: 0,
        batchTransfersByBlockchain: {},
        batchTransfersByExchange: {},
        affectedTransactions: 0,
        dateRange: { earliest: null, latest: null },
        sampleTransferIds: [],
        sampleCreateIds: [],
        sampleTransactionHashes: [],
      };
    }

    const txHashes = batchTransactions.map((tx) => tx.txhash);

    // Step 2: Find batch transfer activities that need to be removed
    const batchTransfersQuery = this.dataSource
      .getRepository(ActivityV2)
      .createQueryBuilder('activity')
      .where('activity.action = :action', { action: 'transfer_strategy' })
      .andWhere('activity.txhash IN (:...txHashes)', { txHashes });

    if (options.blockchainType) {
      batchTransfersQuery.andWhere('activity.blockchainType = :blockchainType', {
        blockchainType: options.blockchainType,
      });
    }

    if (options.exchangeId) {
      batchTransfersQuery.andWhere('activity.exchangeId = :exchangeId', {
        exchangeId: options.exchangeId,
      });
    }

    const totalBatchTransfers = await batchTransfersQuery.getCount();

    // Step 3: Find create activities that need owner updates
    const batchCreatesQuery = this.dataSource
      .getRepository(ActivityV2)
      .createQueryBuilder('activity')
      .where('activity.action = :action', { action: 'create_strategy' })
      .andWhere('activity.txhash IN (:...txHashes)', { txHashes });

    if (options.blockchainType) {
      batchCreatesQuery.andWhere('activity.blockchainType = :blockchainType', {
        blockchainType: options.blockchainType,
      });
    }

    if (options.exchangeId) {
      batchCreatesQuery.andWhere('activity.exchangeId = :exchangeId', {
        exchangeId: options.exchangeId,
      });
    }

    const totalCreateActivitiesToUpdate = await batchCreatesQuery.getCount();

    // Get breakdown by blockchain
    const blockchainQuery = batchTransfersQuery
      .clone()
      .select(['activity.blockchainType', 'COUNT(*) as count'])
      .groupBy('activity.blockchainType')
      .orderBy('count', 'DESC');

    const blockchainResults = await blockchainQuery.getRawMany();
    const batchTransfersByBlockchain = blockchainResults.reduce((acc, row) => {
      acc[row.activity_blockchainType] = parseInt(row.count);
      return acc;
    }, {} as Record<string, number>);

    // Get breakdown by exchange
    const exchangeQuery = batchTransfersQuery
      .clone()
      .select(['activity.exchangeId', 'COUNT(*) as count'])
      .groupBy('activity.exchangeId')
      .orderBy('count', 'DESC');

    const exchangeResults = await exchangeQuery.getRawMany();
    const batchTransfersByExchange = exchangeResults.reduce((acc, row) => {
      acc[row.activity_exchangeId] = parseInt(row.count);
      return acc;
    }, {} as Record<string, number>);

    // Get date range
    const dateQuery = batchTransfersQuery
      .clone()
      .select(['MIN(activity.timestamp) as earliest', 'MAX(activity.timestamp) as latest']);

    const dateResult = await dateQuery.getRawOne();
    const dateRange = {
      earliest: dateResult?.earliest ? new Date(dateResult.earliest) : null,
      latest: dateResult?.latest ? new Date(dateResult.latest) : null,
    };

    // Get sample transfer IDs
    const sampleTransferQuery = batchTransfersQuery
      .clone()
      .select(['activity.id', 'activity.txhash'])
      .orderBy('activity.id', 'ASC')
      .limit(20);

    const sampleTransferResults = await sampleTransferQuery.getMany();
    const sampleTransferIds = sampleTransferResults.map((activity) => activity.id);

    // Get sample create IDs
    const sampleCreateQuery = batchCreatesQuery
      .clone()
      .select(['activity.id', 'activity.txhash'])
      .orderBy('activity.id', 'ASC')
      .limit(20);

    const sampleCreateResults = await sampleCreateQuery.getMany();
    const sampleCreateIds = sampleCreateResults.map((activity) => activity.id);

    const sampleTransactionHashes = [
      ...new Set([
        ...sampleTransferResults.map((activity) => activity.txhash),
        ...sampleCreateResults.map((activity) => activity.txhash),
      ]),
    ].slice(0, 10);

    return {
      totalBatchTransfers,
      totalCreateActivitiesToUpdate,
      batchTransfersByBlockchain,
      batchTransfersByExchange,
      affectedTransactions: batchTransactions.length,
      dateRange,
      sampleTransferIds,
      sampleCreateIds,
      sampleTransactionHashes,
    };
  }

  /**
   * Perform the actual cleanup of batch transfer activities
   */
  async performCleanup(options: ActivityCleanupOptions): Promise<{ deletedCount: number; updatedCount: number }> {
    if (options.dryRun) {
      throw new Error('Cannot perform cleanup in dry run mode');
    }

    // Step 1: Find transactions that have both create_strategy and transfer_strategy activities
    const batchTransactionsQuery = `
      SELECT 
        txhash,
        "blockchainType",
        "exchangeId",
        COUNT(CASE WHEN action = 'create_strategy' THEN 1 END) as create_count,
        COUNT(CASE WHEN action = 'transfer_strategy' THEN 1 END) as transfer_count
      FROM "activities-v2" 
      WHERE action IN ('create_strategy', 'transfer_strategy')
      ${options.blockchainType ? `AND "blockchainType" = '${options.blockchainType}'` : ''}
      ${options.exchangeId ? `AND "exchangeId" = '${options.exchangeId}'` : ''}
      GROUP BY txhash, "blockchainType", "exchangeId"
      HAVING COUNT(CASE WHEN action = 'create_strategy' THEN 1 END) > 0 
         AND COUNT(CASE WHEN action = 'transfer_strategy' THEN 1 END) > 0
    `;

    const batchTransactions = await this.dataSource.query(batchTransactionsQuery);

    if (batchTransactions.length === 0) {
      return { deletedCount: 0, updatedCount: 0 };
    }

    const txHashes = batchTransactions.map((tx) => tx.txhash);

    // Step 2: Update create activities with correct ownership
    // We need to update each create activity to use the 'to' address from its corresponding transfer
    let updatedCount = 0;

    for (const batchTx of batchTransactions) {
      const { txhash, blockchainType, exchangeId } = batchTx;

      // Get the transfer and create activities for this specific transaction
      const activitiesInTx = await this.dataSource
        .getRepository(ActivityV2)
        .createQueryBuilder('activity')
        .where('activity.txhash = :txhash', { txhash })
        .andWhere('activity.blockchainType = :blockchainType', { blockchainType })
        .andWhere('activity.exchangeId = :exchangeId', { exchangeId })
        .andWhere('activity.action IN (:...actions)', { actions: ['create_strategy', 'transfer_strategy'] })
        .orderBy('activity.logIndex', 'ASC')
        .getMany();

      const transferActivities = activitiesInTx.filter((a) => a.action === 'transfer_strategy');
      const createActivities = activitiesInTx.filter((a) => a.action === 'create_strategy');

      // For each create activity, find the corresponding transfer and update ownership
      for (const createActivity of createActivities) {
        const matchingTransfer = transferActivities.find(
          (transfer) => transfer.strategyId === createActivity.strategyId,
        );

        if (matchingTransfer) {
          // Update the create activity with correct ownership
          await this.dataSource
            .getRepository(ActivityV2)
            .createQueryBuilder()
            .update(ActivityV2)
            .set({
              currentOwner: matchingTransfer.newOwner, // This should be the 'to' address
              creationWallet: matchingTransfer.newOwner,
            })
            .where('id = :id', { id: createActivity.id })
            .execute();

          updatedCount++;
        }
      }
    }

    // Step 3: Delete batch transfer activities
    const deleteQuery = this.dataSource
      .getRepository(ActivityV2)
      .createQueryBuilder()
      .delete()
      .from(ActivityV2)
      .where('action = :action', { action: 'transfer_strategy' })
      .andWhere('txhash IN (:...txHashes)', { txHashes });

    if (options.blockchainType) {
      deleteQuery.andWhere('blockchainType = :blockchainType', {
        blockchainType: options.blockchainType,
      });
    }

    if (options.exchangeId) {
      deleteQuery.andWhere('exchangeId = :exchangeId', {
        exchangeId: options.exchangeId,
      });
    }

    const deleteResult = await deleteQuery.execute();
    return {
      deletedCount: deleteResult.affected || 0,
      updatedCount: updatedCount,
    };
  }

  /**
   * Display cleanup summary in a formatted way
   */
  displaySummary(summary: BatchTransferCleanupSummary, options: ActivityCleanupOptions): void {
    console.log('\n' + '='.repeat(80));
    console.log('🧹 BATCH TRANSFER CLEANUP SUMMARY');
    console.log('='.repeat(80));

    console.log(`\n🔍 Target: Fix batch create transactions by removing duplicates and correcting ownership`);
    console.log(`   • Looking for: Transactions with both create_strategy AND transfer_strategy`);
    console.log(`   • Will delete: Redundant transfer_strategy activities`);
    console.log(`   • Will update: create_strategy activities to have correct ownership`);

    console.log(`\n🔍 Filters Applied:`);
    if (options.blockchainType) console.log(`   • Blockchain Type: ${options.blockchainType}`);
    if (options.exchangeId) console.log(`   • Exchange ID: ${options.exchangeId}`);
    if (!options.blockchainType && !options.exchangeId) {
      console.log(`   • No filters applied (ALL BLOCKCHAINS/EXCHANGES)`);
    }

    console.log(`\n📈 Operations to ${options.dryRun ? 'be performed' : 'perform'}:`);
    console.log(`   • Transfer activities to delete: ${summary.totalBatchTransfers.toLocaleString()}`);
    console.log(`   • Create activities to update: ${summary.totalCreateActivitiesToUpdate.toLocaleString()}`);
    console.log(`📊 Affected Transactions: ${summary.affectedTransactions.toLocaleString()}`);

    if (summary.dateRange.earliest && summary.dateRange.latest) {
      console.log(`\n📅 Date Range:`);
      console.log(`   • Earliest: ${summary.dateRange.earliest.toISOString()}`);
      console.log(`   • Latest: ${summary.dateRange.latest.toISOString()}`);
    }

    if (Object.keys(summary.batchTransfersByBlockchain).length > 0) {
      console.log(`\n🌐 Batch Transfers by Blockchain:`);
      Object.entries(summary.batchTransfersByBlockchain)
        .sort(([, a], [, b]) => b - a)
        .forEach(([blockchain, count]) => {
          console.log(`   • ${blockchain}: ${count.toLocaleString()}`);
        });
    }

    if (Object.keys(summary.batchTransfersByExchange).length > 0) {
      console.log(`\n🔗 Batch Transfers by Exchange:`);
      Object.entries(summary.batchTransfersByExchange)
        .sort(([, a], [, b]) => b - a)
        .forEach(([exchange, count]) => {
          console.log(`   • ${exchange}: ${count.toLocaleString()}`);
        });
    }

    if (summary.sampleTransferIds.length > 0) {
      console.log(`\n🔢 Sample Transfer IDs to be deleted:`);
      console.log(`   ${summary.sampleTransferIds.join(', ')}`);
    }

    if (summary.sampleCreateIds.length > 0) {
      console.log(`\n🔧 Sample Create IDs to be updated:`);
      console.log(`   ${summary.sampleCreateIds.join(', ')}`);
    }

    if (summary.sampleTransactionHashes.length > 0) {
      console.log(`\n📋 Sample Transaction Hashes (batch creates):`);
      summary.sampleTransactionHashes.forEach((hash) => {
        console.log(`   • ${hash}`);
      });
    }

    console.log('\n' + '='.repeat(80));
  }
}

/**
 * Parse command line arguments
 */
function parseArguments(): ActivityCleanupOptions {
  const args = process.argv.slice(2);
  const options: ActivityCleanupOptions = {
    dryRun: true,
    confirmationRequired: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--execute':
        options.dryRun = false;
        break;
      case '--no-confirm':
        options.confirmationRequired = false;
        break;
      case '--blockchain':
        options.blockchainType = args[++i];
        break;
      case '--exchange':
        options.exchangeId = args[++i];
        break;
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        printHelp();
        process.exit(1);
    }
  }

  return options;
}

/**
 * Print help information
 */
function printHelp(): void {
  console.log(`
🧹 Batch Transfer Cleanup Script

Usage: npm run cleanup:activities [options]

Purpose: Remove redundant transfer_strategy activities from batch create transactions.
This script identifies transactions that contain both create_strategy AND transfer_strategy
activities and removes only the transfer_strategy activities (which are duplicates).

Options:
  --dry-run              Preview changes without executing (default)
  --execute              Actually perform the cleanup
  --no-confirm           Skip confirmation prompt
  --blockchain <type>    Filter by blockchain type (e.g., ethereum, polygon)
  --exchange <id>        Filter by exchange ID
  --help                 Show this help message

Examples:
  npm run cleanup:activities                          # Preview batch transfers to be cleaned
  npm run cleanup:activities -- --execute            # Clean up all batch transfers
  npm run cleanup:activities -- --blockchain ethereum # Preview ethereum batch transfers only
  npm run cleanup:activities -- --exchange ethereum --execute # Clean ethereum exchange only

⚠️  SAFE: This script only removes redundant transfer activities from batch creates.
         It will NOT delete create_strategy activities or standalone transfers.
`);
}

/**
 * Prompt for user confirmation
 */
async function promptConfirmation(summary: BatchTransferCleanupSummary): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const message = `\n⚠️  You are about to perform batch cleanup operations:\n• DELETE ${summary.totalBatchTransfers.toLocaleString()} redundant transfer activities\n• UPDATE ${summary.totalCreateActivitiesToUpdate.toLocaleString()} create activities with correct ownership\n• Affecting ${summary.affectedTransactions.toLocaleString()} transactions\nType 'DELETE' to confirm: `;

    rl.question(message, (answer: string) => {
      rl.close();
      resolve(answer === 'DELETE');
    });
  });
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  console.log('🧹 Starting Batch Transfer Cleanup Script...\n');

  const options = parseArguments();

  try {
    // Initialize database connection
    console.log('📦 Connecting to database...');
    await dataSource.initialize();
    console.log('✅ Database connected successfully\n');

    const cleanupService = new ActivityCleanupService(dataSource);

    // Get cleanup summary
    console.log('🔍 Analyzing batch transfer activities to be cleaned up...');
    const summary = await cleanupService.getCleanupSummary(options);

    // Display summary
    cleanupService.displaySummary(summary, options);

    if (summary.totalBatchTransfers === 0 && summary.totalCreateActivitiesToUpdate === 0) {
      console.log('ℹ️  No batch activities found to clean up. This means:');
      console.log('   • No transactions contain both create_strategy AND transfer_strategy activities');
      console.log("   • OR: Your filter criteria didn't match any batch transactions");
      console.log('   • All existing transfers are standalone (not from batch creates)');
      return;
    }

    if (options.dryRun) {
      console.log('\n🔍 DRY RUN MODE: No changes will be made to the database.');
      console.log('💡 To execute the cleanup, run with --execute flag.');
      return;
    }

    // Confirmation for actual execution
    if (options.confirmationRequired) {
      const confirmed = await promptConfirmation(summary);
      if (!confirmed) {
        console.log('\n❌ Cleanup cancelled by user.');
        return;
      }
    }

    // Perform cleanup
    console.log('\n🗑️  Performing cleanup...');
    const startTime = Date.now();
    const result = await cleanupService.performCleanup(options);
    const endTime = Date.now();

    console.log(`✅ Batch cleanup completed successfully!`);
    console.log(`   • Deleted: ${result.deletedCount.toLocaleString()} redundant transfer activities`);
    console.log(`   • Updated: ${result.updatedCount.toLocaleString()} create activities with correct ownership`);
    console.log(`   • Duration: ${((endTime - startTime) / 1000).toFixed(2)}s`);
    console.log(`   • Result: Batch transactions now show only create_strategy activities with correct owners`);
  } catch (error) {
    console.error('\n❌ Error during cleanup:', error);
    process.exit(1);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
      console.log('\n📦 Database connection closed.');
    }
  }
}

// Run the script
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
