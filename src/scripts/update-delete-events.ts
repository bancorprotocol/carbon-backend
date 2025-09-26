#!/usr/bin/env ts-node

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as readline from 'readline';
import { ActivityV2 } from '../activity/activity-v2.entity';
import { Token } from '../token/token.entity';
import { parseOrder, processOrders } from '../activity/activity.utils';
import { Decimal } from 'decimal.js';

// Load environment variables
dotenv.config();

interface DeleteEventUpdateSummary {
  totalDeleteActivities: number;
  activitiesNeedingUpdate: number;
  activitiesByBlockchain: Record<string, number>;
  activitiesByExchange: Record<string, number>;
  dateRange: {
    earliest: Date | null;
    latest: Date | null;
  };
  sampleActivityIds: number[];
  sampleStrategyIds: string[];
}

interface UpdateDeleteEventsOptions {
  dryRun: boolean;
  blockchainType?: string;
  exchangeId?: string;
  confirmationRequired: boolean;
  batchSize: number;
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

class DeleteEventUpdateService {
  private dataSource: DataSource;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
  }

  /**
   * Get a summary of delete activities that need budget and changes updates
   */
  async getUpdateSummary(options: UpdateDeleteEventsOptions): Promise<DeleteEventUpdateSummary> {
    // Find delete activities
    const deleteActivitiesQuery = this.dataSource
      .getRepository(ActivityV2)
      .createQueryBuilder('activity')
      .leftJoinAndSelect('activity.token0', 'token0')
      .leftJoinAndSelect('activity.token1', 'token1')
      .where('activity.action = :action', { action: 'deleted' });

    if (options.blockchainType) {
      deleteActivitiesQuery.andWhere('activity.blockchainType = :blockchainType', {
        blockchainType: options.blockchainType,
      });
    }

    if (options.exchangeId) {
      deleteActivitiesQuery.andWhere('activity.exchangeId = :exchangeId', {
        exchangeId: options.exchangeId,
      });
    }

    const totalDeleteActivities = await deleteActivitiesQuery.getCount();

    // Find activities that need updates
    // We look for delete activities where:
    // 1. Budget is not 0 (should be 0 after deletion)
    // 2. Budget changes are 0 or null (should show the negative change)
    const activitiesNeedingUpdateQuery = deleteActivitiesQuery
      .clone()
      .andWhere(
        "(activity.sellBudget != '0' OR activity.buyBudget != '0' OR " +
          "activity.sellBudgetChange = '0' OR activity.buyBudgetChange = '0' OR " +
          'activity.sellBudgetChange IS NULL OR activity.buyBudgetChange IS NULL OR ' +
          "activity.sellPriceADelta = '0' OR activity.sellPriceMargDelta = '0' OR " +
          "activity.sellPriceBDelta = '0' OR activity.buyPriceADelta = '0' OR " +
          "activity.buyPriceMargDelta = '0' OR activity.buyPriceBDelta = '0' OR " +
          'activity.sellPriceADelta IS NULL OR activity.sellPriceMargDelta IS NULL OR ' +
          'activity.sellPriceBDelta IS NULL OR activity.buyPriceADelta IS NULL OR ' +
          'activity.buyPriceMargDelta IS NULL OR activity.buyPriceBDelta IS NULL)',
      );

    const activitiesNeedingUpdate = await activitiesNeedingUpdateQuery.getCount();

    if (activitiesNeedingUpdate === 0) {
      return {
        totalDeleteActivities,
        activitiesNeedingUpdate: 0,
        activitiesByBlockchain: {},
        activitiesByExchange: {},
        dateRange: { earliest: null, latest: null },
        sampleActivityIds: [],
        sampleStrategyIds: [],
      };
    }

    // Get breakdown by blockchain
    const blockchainQuery = activitiesNeedingUpdateQuery
      .clone()
      .select(['activity.blockchainType', 'COUNT(*) as count'])
      .groupBy('activity.blockchainType')
      .orderBy('count', 'DESC');

    const blockchainResults = await blockchainQuery.getRawMany();
    const activitiesByBlockchain = blockchainResults.reduce((acc, row) => {
      acc[row.activity_blockchainType] = parseInt(row.count);
      return acc;
    }, {} as Record<string, number>);

    // Get breakdown by exchange
    const exchangeQuery = activitiesNeedingUpdateQuery
      .clone()
      .select(['activity.exchangeId', 'COUNT(*) as count'])
      .groupBy('activity.exchangeId')
      .orderBy('count', 'DESC');

    const exchangeResults = await exchangeQuery.getRawMany();
    const activitiesByExchange = exchangeResults.reduce((acc, row) => {
      acc[row.activity_exchangeId] = parseInt(row.count);
      return acc;
    }, {} as Record<string, number>);

    // Get date range
    const dateQuery = activitiesNeedingUpdateQuery
      .clone()
      .select(['MIN(activity.timestamp) as earliest', 'MAX(activity.timestamp) as latest']);

    const dateResult = await dateQuery.getRawOne();
    const dateRange = {
      earliest: dateResult?.earliest ? new Date(dateResult.earliest) : null,
      latest: dateResult?.latest ? new Date(dateResult.latest) : null,
    };

    // Get sample activity IDs and strategy IDs
    const sampleQuery = activitiesNeedingUpdateQuery
      .clone()
      .select(['activity.id', 'activity.strategyId'])
      .orderBy('activity.id', 'ASC')
      .limit(20);

    const sampleResults = await sampleQuery.getMany();
    const sampleActivityIds = sampleResults.map((activity) => activity.id);
    const sampleStrategyIds = sampleResults.map((activity) => activity.strategyId);

    return {
      totalDeleteActivities,
      activitiesNeedingUpdate,
      activitiesByBlockchain,
      activitiesByExchange,
      dateRange,
      sampleActivityIds,
      sampleStrategyIds,
    };
  }

  /**
   * Perform the actual update of delete activities
   */
  async performUpdate(options: UpdateDeleteEventsOptions): Promise<{ updatedCount: number }> {
    if (options.dryRun) {
      throw new Error('Cannot perform update in dry run mode');
    }

    let updatedCount = 0;
    let offset = 0;

    while (true) {
      // Get a batch of delete activities that need updates
      const activitiesQuery = this.dataSource
        .getRepository(ActivityV2)
        .createQueryBuilder('activity')
        .leftJoinAndSelect('activity.token0', 'token0')
        .leftJoinAndSelect('activity.token1', 'token1')
        .where('activity.action = :action', { action: 'deleted' })
        .andWhere(
          "(activity.sellBudget != '0' OR activity.buyBudget != '0' OR " +
            "activity.sellBudgetChange = '0' OR activity.buyBudgetChange = '0' OR " +
            'activity.sellBudgetChange IS NULL OR activity.buyBudgetChange IS NULL OR ' +
            "activity.sellPriceADelta = '0' OR activity.sellPriceMargDelta = '0' OR " +
            "activity.sellPriceBDelta = '0' OR activity.buyPriceADelta = '0' OR " +
            "activity.buyPriceMargDelta = '0' OR activity.buyPriceBDelta = '0' OR " +
            'activity.sellPriceADelta IS NULL OR activity.sellPriceMargDelta IS NULL OR ' +
            'activity.sellPriceBDelta IS NULL OR activity.buyPriceADelta IS NULL OR ' +
            'activity.buyPriceMargDelta IS NULL OR activity.buyPriceBDelta IS NULL)',
        );

      if (options.blockchainType) {
        activitiesQuery.andWhere('activity.blockchainType = :blockchainType', {
          blockchainType: options.blockchainType,
        });
      }

      if (options.exchangeId) {
        activitiesQuery.andWhere('activity.exchangeId = :exchangeId', {
          exchangeId: options.exchangeId,
        });
      }

      const activities = await activitiesQuery
        .orderBy('activity.id', 'ASC')
        .skip(offset)
        .take(options.batchSize)
        .getMany();

      if (activities.length === 0) {
        break; // No more activities to process
      }

      // Process each activity in this batch
      for (const activity of activities) {
        try {
          // Calculate correct budget and price changes for this delete activity
          const token0 = activity.token0;
          const token1 = activity.token1;

          if (!token0 || !token1) {
            console.warn(`⚠️  Skipping activity ${activity.id}: Missing token information`);
            continue;
          }

          const decimals0 = new Decimal(token0.decimals);
          const decimals1 = new Decimal(token1.decimals);

          // Parse the orders from the activity (this contains the previous state before deletion)
          const order0 = parseOrder(activity.order0);
          const order1 = parseOrder(activity.order1);

          // Process the original orders to get the previous state
          const eventProcessedOrders = processOrders(order0, order1, decimals0, decimals1);

          // For delete events:
          // - Current state should be all zeros (strategy is deleted)
          // - Changes should be negative (from previous budget to zero)
          const updateData = {
            // Set budgets to zero (final state after deletion)
            sellBudget: '0',
            buyBudget: '0',

            // Set all prices to zero (final state after deletion)
            sellPriceA: '0',
            sellPriceMarg: '0',
            sellPriceB: '0',
            buyPriceA: '0',
            buyPriceMarg: '0',
            buyPriceB: '0',

            // Calculate changes as negative values (from previous state to zero)
            sellBudgetChange: eventProcessedOrders.liquidity0.negated().toString(),
            buyBudgetChange: eventProcessedOrders.liquidity1.negated().toString(),

            // Price deltas as negative values (from previous prices to zero)
            sellPriceADelta: eventProcessedOrders.sellPriceA.negated().toString(),
            sellPriceMargDelta: eventProcessedOrders.sellPriceMarg.negated().toString(),
            sellPriceBDelta: eventProcessedOrders.sellPriceB.negated().toString(),
            buyPriceADelta: eventProcessedOrders.buyPriceA.negated().toString(),
            buyPriceMargDelta: eventProcessedOrders.buyPriceMarg.negated().toString(),
            buyPriceBDelta: eventProcessedOrders.buyPriceB.negated().toString(),
          };

          // Update the activity
          await this.dataSource
            .getRepository(ActivityV2)
            .createQueryBuilder()
            .update(ActivityV2)
            .set(updateData)
            .where('id = :id', { id: activity.id })
            .execute();

          updatedCount++;

          if (updatedCount % 100 === 0) {
            console.log(`📊 Progress: Updated ${updatedCount} activities...`);
          }
        } catch (error) {
          console.error(`❌ Error updating activity ${activity.id}:`, error);
        }
      }

      offset += options.batchSize;
    }

    return { updatedCount };
  }

  /**
   * Display update summary in a formatted way
   */
  displaySummary(summary: DeleteEventUpdateSummary, options: UpdateDeleteEventsOptions): void {
    console.log('\n' + '='.repeat(80));
    console.log('🗑️  DELETE EVENTS BUDGET UPDATE SUMMARY');
    console.log('='.repeat(80));

    console.log(`\n🎯 Target: Update existing deleted activities to show correct budget state and changes`);
    console.log(`   • Looking for: deleted activities with incorrect budget/change information`);
    console.log(`   • Will update: Set budgets to 0 and show negative budget changes`);
    console.log(`   • Logic: Final state = 0, Changes = negative of original budget`);

    console.log(`\n🔍 Filters Applied:`);
    if (options.blockchainType) console.log(`   • Blockchain Type: ${options.blockchainType}`);
    if (options.exchangeId) console.log(`   • Exchange ID: ${options.exchangeId}`);
    if (!options.blockchainType && !options.exchangeId) {
      console.log(`   • No filters applied (ALL BLOCKCHAINS/EXCHANGES)`);
    }

    console.log(`\n📈 Activities Found:`);
    console.log(`   • Total deleted activities: ${summary.totalDeleteActivities.toLocaleString()}`);
    console.log(`   • Activities needing update: ${summary.activitiesNeedingUpdate.toLocaleString()}`);
    console.log(
      `   • Already up-to-date: ${(summary.totalDeleteActivities - summary.activitiesNeedingUpdate).toLocaleString()}`,
    );

    if (summary.dateRange.earliest && summary.dateRange.latest) {
      console.log(`\n📅 Date Range (activities needing update):`);
      console.log(`   • Earliest: ${summary.dateRange.earliest.toISOString()}`);
      console.log(`   • Latest: ${summary.dateRange.latest.toISOString()}`);
    }

    if (Object.keys(summary.activitiesByBlockchain).length > 0) {
      console.log(`\n🌐 Activities Needing Update by Blockchain:`);
      Object.entries(summary.activitiesByBlockchain)
        .sort(([, a], [, b]) => b - a)
        .forEach(([blockchain, count]) => {
          console.log(`   • ${blockchain}: ${count.toLocaleString()}`);
        });
    }

    if (Object.keys(summary.activitiesByExchange).length > 0) {
      console.log(`\n🔗 Activities Needing Update by Exchange:`);
      Object.entries(summary.activitiesByExchange)
        .sort(([, a], [, b]) => b - a)
        .forEach(([exchange, count]) => {
          console.log(`   • ${exchange}: ${count.toLocaleString()}`);
        });
    }

    if (summary.sampleActivityIds.length > 0) {
      console.log(`\n🔢 Sample Activity IDs to be updated:`);
      console.log(`   ${summary.sampleActivityIds.slice(0, 10).join(', ')}`);
    }

    if (summary.sampleStrategyIds.length > 0) {
      console.log(`\n🔧 Sample Strategy IDs to be updated:`);
      console.log(`   ${summary.sampleStrategyIds.slice(0, 10).join(', ')}`);
    }

    console.log(`\n⚙️ Batch Size: ${options.batchSize.toLocaleString()}`);
    console.log('\n' + '='.repeat(80));
  }
}

/**
 * Parse command line arguments
 */
function parseArguments(): UpdateDeleteEventsOptions {
  const args = process.argv.slice(2);
  const options: UpdateDeleteEventsOptions = {
    dryRun: true,
    confirmationRequired: true,
    batchSize: 1000,
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
      case '--batch-size':
        options.batchSize = parseInt(args[++i]);
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
🗑️  Delete Events Budget Update Script

Usage: npm run update:delete-events [options]

Purpose: Update existing delete event activities to show correct budget state and changes.
This script fixes delete activities to show:
- Budget state as 0 (final state after strategy deletion)
- Budget changes as negative values (showing the decrease from previous state to zero)

Options:
  --dry-run              Preview changes without executing (default)
  --execute              Actually perform the updates
  --no-confirm           Skip confirmation prompt
  --blockchain <type>    Filter by blockchain type (e.g., ethereum, base)
  --exchange <id>        Filter by exchange ID
  --batch-size <number>  Number of activities to process per batch (default: 1000)
  --help                 Show this help message

Examples:
  npm run update:delete-events                          # Preview delete events to be updated
  npm run update:delete-events -- --execute            # Update all delete events
  npm run update:delete-events -- --blockchain ethereum # Preview ethereum delete events only
  npm run update:delete-events -- --exchange ethereum --execute # Update ethereum exchange only

⚠️  SAFE: This script only updates delete activities with incorrect budget information.
         It will NOT affect other activity types or correct delete activities.
`);
}

/**
 * Prompt for user confirmation
 */
async function promptConfirmation(summary: DeleteEventUpdateSummary): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const message = `\n⚠️  You are about to update delete event activities:\n• UPDATE ${summary.activitiesNeedingUpdate.toLocaleString()} delete activities with correct budget state and changes\n• This will set budgets to 0 and show negative budget changes\n• Changes are corrective only (fixing incorrect data)\nType 'UPDATE' to confirm: `;

    rl.question(message, (answer: string) => {
      rl.close();
      resolve(answer === 'UPDATE');
    });
  });
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  console.log('🗑️  Starting Delete Events Budget Update Script...\n');

  const options = parseArguments();

  try {
    // Initialize database connection
    console.log('📦 Connecting to database...');
    await dataSource.initialize();
    console.log('✅ Database connected successfully\n');

    const updateService = new DeleteEventUpdateService(dataSource);

    // Get update summary
    console.log('🔍 Analyzing delete activities that need budget updates...');
    const summary = await updateService.getUpdateSummary(options);

    // Display summary
    updateService.displaySummary(summary, options);

    if (summary.activitiesNeedingUpdate === 0) {
      console.log('ℹ️  No delete activities need updates. This means:');
      console.log('   • All deleted activities already have correct budget state (0) and changes');
      console.log("   • OR: Your filter criteria didn't match any activities");
      console.log('   • All delete activities are up-to-date with the latest schema');
      return;
    }

    if (options.dryRun) {
      console.log('\n🔍 DRY RUN MODE: No changes will be made to the database.');
      console.log('💡 To execute the update, run with --execute flag.');
      return;
    }

    // Confirmation for actual execution
    if (options.confirmationRequired) {
      const confirmed = await promptConfirmation(summary);
      if (!confirmed) {
        console.log('\n❌ Update cancelled by user.');
        return;
      }
    }

    // Perform update
    console.log('\n🔄 Performing updates...');
    const startTime = Date.now();
    const result = await updateService.performUpdate(options);
    const endTime = Date.now();

    console.log(`✅ Update completed successfully!`);
    console.log(`   • Updated: ${result.updatedCount.toLocaleString()} delete activities`);
    console.log(`   • Duration: ${((endTime - startTime) / 1000).toFixed(2)}s`);
    console.log(`   • Result: Delete events now show correct budget state (0) and negative budget changes`);
  } catch (error) {
    console.error('\n❌ Error during update:', error);
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
