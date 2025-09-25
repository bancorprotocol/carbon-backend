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

interface CreateChangeUpdateSummary {
  totalCreateActivities: number;
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

interface UpdateCreateChangesOptions {
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

class CreateChangeUpdateService {
  private dataSource: DataSource;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
  }

  /**
   * Get a summary of create activities that need budget change updates
   */
  async getUpdateSummary(options: UpdateCreateChangesOptions): Promise<CreateChangeUpdateSummary> {
    // Find create activities that are missing budget change information
    const createActivitiesQuery = this.dataSource
      .getRepository(ActivityV2)
      .createQueryBuilder('activity')
      .leftJoinAndSelect('activity.token0', 'token0')
      .leftJoinAndSelect('activity.token1', 'token1')
      .where('activity.action = :action', { action: 'create_strategy' });

    if (options.blockchainType) {
      createActivitiesQuery.andWhere('activity.blockchainType = :blockchainType', {
        blockchainType: options.blockchainType,
      });
    }

    if (options.exchangeId) {
      createActivitiesQuery.andWhere('activity.exchangeId = :exchangeId', {
        exchangeId: options.exchangeId,
      });
    }

    const totalCreateActivities = await createActivitiesQuery.getCount();

    // Find activities that need updates (missing budget change data)
    const activitiesNeedingUpdateQuery = createActivitiesQuery
      .clone()
      .andWhere(
        '(activity.sellBudgetChange IS NULL OR activity.buyBudgetChange IS NULL OR ' +
          'activity.sellPriceADelta IS NULL OR activity.sellPriceMargDelta IS NULL OR ' +
          'activity.sellPriceBDelta IS NULL OR activity.buyPriceADelta IS NULL OR ' +
          'activity.buyPriceMargDelta IS NULL OR activity.buyPriceBDelta IS NULL)',
      );

    const activitiesNeedingUpdate = await activitiesNeedingUpdateQuery.getCount();

    if (activitiesNeedingUpdate === 0) {
      return {
        totalCreateActivities,
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
      totalCreateActivities,
      activitiesNeedingUpdate,
      activitiesByBlockchain,
      activitiesByExchange,
      dateRange,
      sampleActivityIds,
      sampleStrategyIds,
    };
  }

  /**
   * Perform the actual update of create activities
   */
  async performUpdate(options: UpdateCreateChangesOptions): Promise<{ updatedCount: number }> {
    if (options.dryRun) {
      throw new Error('Cannot perform update in dry run mode');
    }

    let updatedCount = 0;
    let offset = 0;

    while (true) {
      // Get a batch of create activities that need updates
      const activitiesQuery = this.dataSource
        .getRepository(ActivityV2)
        .createQueryBuilder('activity')
        .leftJoinAndSelect('activity.token0', 'token0')
        .leftJoinAndSelect('activity.token1', 'token1')
        .where('activity.action = :action', { action: 'create_strategy' })
        .andWhere(
          '(activity.sellBudgetChange IS NULL OR activity.buyBudgetChange IS NULL OR ' +
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
          // Calculate budget and price changes for this create activity
          const token0 = activity.token0;
          const token1 = activity.token1;

          if (!token0 || !token1) {
            console.warn(`⚠️  Skipping activity ${activity.id}: Missing token information`);
            continue;
          }

          const decimals0 = new Decimal(token0.decimals);
          const decimals1 = new Decimal(token1.decimals);

          // Parse the orders from the activity
          const order0 = parseOrder(activity.order0);
          const order1 = parseOrder(activity.order1);

          // Process the orders
          const processedOrders = processOrders(order0, order1, decimals0, decimals1);

          // For create events, the change equals the current budget (change from null/0 to current)
          const updateData = {
            sellBudgetChange: processedOrders.liquidity0.toString(),
            buyBudgetChange: processedOrders.liquidity1.toString(),
            sellPriceADelta: processedOrders.sellPriceA.toString(),
            sellPriceMargDelta: processedOrders.sellPriceMarg.toString(),
            sellPriceBDelta: processedOrders.sellPriceB.toString(),
            buyPriceADelta: processedOrders.buyPriceA.toString(),
            buyPriceMargDelta: processedOrders.buyPriceMarg.toString(),
            buyPriceBDelta: processedOrders.buyPriceB.toString(),
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
  displaySummary(summary: CreateChangeUpdateSummary, options: UpdateCreateChangesOptions): void {
    console.log('\n' + '='.repeat(80));
    console.log('🔄 CREATE EVENTS BUDGET CHANGE UPDATE SUMMARY');
    console.log('='.repeat(80));

    console.log(`\n🎯 Target: Update existing create_strategy activities to include budget change information`);
    console.log(`   • Looking for: create_strategy activities missing budget/price change fields`);
    console.log(`   • Will update: sellBudgetChange, buyBudgetChange, and all price delta fields`);
    console.log(`   • Logic: Change = Current Value (since previous state was null/0)`);

    console.log(`\n🔍 Filters Applied:`);
    if (options.blockchainType) console.log(`   • Blockchain Type: ${options.blockchainType}`);
    if (options.exchangeId) console.log(`   • Exchange ID: ${options.exchangeId}`);
    if (!options.blockchainType && !options.exchangeId) {
      console.log(`   • No filters applied (ALL BLOCKCHAINS/EXCHANGES)`);
    }

    console.log(`\n📈 Activities Found:`);
    console.log(`   • Total create_strategy activities: ${summary.totalCreateActivities.toLocaleString()}`);
    console.log(`   • Activities needing update: ${summary.activitiesNeedingUpdate.toLocaleString()}`);
    console.log(
      `   • Already up-to-date: ${(summary.totalCreateActivities - summary.activitiesNeedingUpdate).toLocaleString()}`,
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
function parseArguments(): UpdateCreateChangesOptions {
  const args = process.argv.slice(2);
  const options: UpdateCreateChangesOptions = {
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
🔄 Create Events Budget Change Update Script

Usage: npm run update:create-changes [options]

Purpose: Update existing create_strategy activities to include budget change information.
This script adds sellBudgetChange, buyBudgetChange, and price delta fields to create events
that are missing this information, setting them equal to the current budget/price values.

Options:
  --dry-run              Preview changes without executing (default)
  --execute              Actually perform the update
  --no-confirm           Skip confirmation prompt
  --blockchain <type>    Filter by blockchain type (e.g., ethereum, polygon)
  --exchange <id>        Filter by exchange ID
  --batch-size <num>     Number of activities to process per batch (default: 1000)
  --help                 Show this help message

Examples:
  npm run update:create-changes                           # Preview updates needed
  npm run update:create-changes -- --execute             # Update all create activities
  npm run update:create-changes -- --blockchain ethereum # Preview ethereum activities only
  npm run update:create-changes -- --execute --batch-size 500 # Update with smaller batches

⚠️  SAFE: This script only updates create_strategy activities that are missing change data.
         It will NOT modify activities that already have change information.
`);
}

/**
 * Prompt for user confirmation
 */
async function promptConfirmation(summary: CreateChangeUpdateSummary): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const message = `\n⚠️  You are about to update create_strategy activities:\n• UPDATE ${summary.activitiesNeedingUpdate.toLocaleString()} activities with budget change information\n• This will add sellBudgetChange, buyBudgetChange, and price delta fields\n• Changes are additive only (no data will be lost)\nType 'UPDATE' to confirm: `;

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
  console.log('🔄 Starting Create Events Budget Change Update Script...\n');

  const options = parseArguments();

  try {
    // Initialize database connection
    console.log('📦 Connecting to database...');
    await dataSource.initialize();
    console.log('✅ Database connected successfully\n');

    const updateService = new CreateChangeUpdateService(dataSource);

    // Get update summary
    console.log('🔍 Analyzing create activities that need budget change updates...');
    const summary = await updateService.getUpdateSummary(options);

    // Display summary
    updateService.displaySummary(summary, options);

    if (summary.activitiesNeedingUpdate === 0) {
      console.log('ℹ️  No create activities need updates. This means:');
      console.log('   • All create_strategy activities already have budget change information');
      console.log("   • OR: Your filter criteria didn't match any activities");
      console.log('   • All activities are up-to-date with the latest schema');
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
    console.log(`   • Updated: ${result.updatedCount.toLocaleString()} create_strategy activities`);
    console.log(`   • Duration: ${((endTime - startTime) / 1000).toFixed(2)}s`);
    console.log(`   • Result: Create events now include budget change information for the frontend`);
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
