import * as fs from 'fs';
import csv from 'csv-parser';

interface RewardRow {
  strategy_id: string;
  epoch_start: string;
  epoch_number: string;
  sub_epoch_number: string;
  sub_epoch_timestamp: string;
  token0_reward: string;
  token1_reward: string;
  sum_token0_token1_rewards: string;
  liquidity0: string;
  liquidity1: string;
  token0_address: string;
  token1_address: string;
  token0_usd_rate: string;
  token1_usd_rate: string;
  target_price: string;
  eligible0: string;
  eligible1: string;
  token0_reward_zone_boundary: string;
  token1_reward_zone_boundary: string;
  token0_weighting: string;
  token1_weighting: string;
  token0_decimals: string;
  token1_decimals: string;
  order0_a_compressed: string;
  order0_b_compressed: string;
  order0_a: string;
  order0_b: string;
  order0_z: string;
  order1_a_compressed: string;
  order1_b_compressed: string;
  order1_a: string;
  order1_b: string;
  order1_z: string;
  last_event_timestamp: string;
}

interface StrategyDifference {
  strategy_id: string;
  token0_diff: number;
  token1_diff: number;
  sum_diff: number;
  row_count: number;
  first_timestamp: string;
  last_timestamp: string;
}

async function readCSVFile(filePath: string): Promise<RewardRow[]> {
  return new Promise((resolve, reject) => {
    const results: RewardRow[] = [];

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data: RewardRow) => {
        results.push(data);
      })
      .on('end', () => {
        resolve(results);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

function createRowKey(row: RewardRow): string {
  return `${row.strategy_id}_${row.sub_epoch_timestamp}_${row.epoch_number}_${row.sub_epoch_number}`;
}

async function analyzeDetailedDifferences(file1Path: string, file2Path: string) {
  console.log('Reading CSV files for detailed analysis...');

  const [rows1, rows2] = await Promise.all([readCSVFile(file1Path), readCSVFile(file2Path)]);

  // Create maps for efficient lookup
  const map1 = new Map<string, RewardRow>();
  const map2 = new Map<string, RewardRow>();

  for (const row of rows1) {
    const key = createRowKey(row);
    map1.set(key, row);
  }

  for (const row of rows2) {
    const key = createRowKey(row);
    map2.set(key, row);
  }

  // Analyze differences by strategy
  const strategyDifferences = new Map<string, StrategyDifference>();
  const timestampDifferences = new Map<string, number>();
  const significantDifferences: Array<{
    strategy_id: string;
    timestamp: string;
    field: string;
    value1: number;
    value2: number;
    difference: number;
    percentage: number;
  }> = [];

  for (const [key, row1] of map1) {
    if (map2.has(key)) {
      const row2 = map2.get(key)!;

      const token0_1 = parseFloat(row1.token0_reward) || 0;
      const token0_2 = parseFloat(row2.token0_reward) || 0;
      const token1_1 = parseFloat(row1.token1_reward) || 0;
      const token1_2 = parseFloat(row2.token1_reward) || 0;
      const sum_1 = parseFloat(row1.sum_token0_token1_rewards) || 0;
      const sum_2 = parseFloat(row2.sum_token0_token1_rewards) || 0;

      const token0_diff = token0_2 - token0_1;
      const token1_diff = token1_2 - token1_1;
      const sum_diff = sum_2 - sum_1;

      // Track significant differences (> 0.001 or > 1% change)
      if (Math.abs(token0_diff) > 0.001 || (token0_1 > 0 && Math.abs(token0_diff / token0_1) > 0.01)) {
        significantDifferences.push({
          strategy_id: row1.strategy_id,
          timestamp: row1.sub_epoch_timestamp,
          field: 'token0_reward',
          value1: token0_1,
          value2: token0_2,
          difference: token0_diff,
          percentage: token0_1 > 0 ? (token0_diff / token0_1) * 100 : 0,
        });
      }

      if (Math.abs(token1_diff) > 0.001 || (token1_1 > 0 && Math.abs(token1_diff / token1_1) > 0.01)) {
        significantDifferences.push({
          strategy_id: row1.strategy_id,
          timestamp: row1.sub_epoch_timestamp,
          field: 'token1_reward',
          value1: token1_1,
          value2: token1_2,
          difference: token1_diff,
          percentage: token1_1 > 0 ? (token1_diff / token1_1) * 100 : 0,
        });
      }

      if (Math.abs(sum_diff) > 0.001 || (sum_1 > 0 && Math.abs(sum_diff / sum_1) > 0.01)) {
        significantDifferences.push({
          strategy_id: row1.strategy_id,
          timestamp: row1.sub_epoch_timestamp,
          field: 'sum_token0_token1_rewards',
          value1: sum_1,
          value2: sum_2,
          difference: sum_diff,
          percentage: sum_1 > 0 ? (sum_diff / sum_1) * 100 : 0,
        });
      }

      // Accumulate by strategy
      if (!strategyDifferences.has(row1.strategy_id)) {
        strategyDifferences.set(row1.strategy_id, {
          strategy_id: row1.strategy_id,
          token0_diff: 0,
          token1_diff: 0,
          sum_diff: 0,
          row_count: 0,
          first_timestamp: row1.sub_epoch_timestamp,
          last_timestamp: row1.sub_epoch_timestamp,
        });
      }

      const stratDiff = strategyDifferences.get(row1.strategy_id)!;
      stratDiff.token0_diff += token0_diff;
      stratDiff.token1_diff += token1_diff;
      stratDiff.sum_diff += sum_diff;
      stratDiff.row_count++;

      if (row1.sub_epoch_timestamp < stratDiff.first_timestamp) {
        stratDiff.first_timestamp = row1.sub_epoch_timestamp;
      }
      if (row1.sub_epoch_timestamp > stratDiff.last_timestamp) {
        stratDiff.last_timestamp = row1.sub_epoch_timestamp;
      }

      // Accumulate by timestamp
      const timestampDiff = timestampDifferences.get(row1.sub_epoch_timestamp) || 0;
      timestampDifferences.set(row1.sub_epoch_timestamp, timestampDiff + sum_diff);

      // Check if last_event_timestamp differs
      if (row1.last_event_timestamp !== row2.last_event_timestamp) {
        console.log(`Timestamp difference for strategy ${row1.strategy_id}:`);
        console.log(`  File 1: ${row1.last_event_timestamp}`);
        console.log(`  File 2: ${row2.last_event_timestamp}`);
      }
    }
  }

  console.log('\n=== TOP 20 STRATEGIES WITH LARGEST DIFFERENCES ===');
  const sortedStrategyDiffs = Array.from(strategyDifferences.values())
    .sort((a, b) => Math.abs(b.sum_diff) - Math.abs(a.sum_diff))
    .slice(0, 20);

  for (const stratDiff of sortedStrategyDiffs) {
    console.log(`Strategy: ${stratDiff.strategy_id}`);
    console.log(`  Sum difference: ${stratDiff.sum_diff.toFixed(6)}`);
    console.log(`  Token0 difference: ${stratDiff.token0_diff.toFixed(6)}`);
    console.log(`  Token1 difference: ${stratDiff.token1_diff.toFixed(6)}`);
    console.log(`  Affected rows: ${stratDiff.row_count}`);
    console.log(`  Time range: ${stratDiff.first_timestamp} to ${stratDiff.last_timestamp}`);
    console.log('  ---');
  }

  console.log('\n=== TOP 20 MOST SIGNIFICANT PERCENTAGE DIFFERENCES ===');
  const sortedSignificantDiffs = significantDifferences
    .filter((d) => Math.abs(d.percentage) > 0)
    .sort((a, b) => Math.abs(b.percentage) - Math.abs(a.percentage))
    .slice(0, 20);

  for (const diff of sortedSignificantDiffs) {
    console.log(`Strategy: ${diff.strategy_id}`);
    console.log(`  Field: ${diff.field}`);
    console.log(`  Timestamp: ${diff.timestamp}`);
    console.log(`  File 1: ${diff.value1}`);
    console.log(`  File 2: ${diff.value2}`);
    console.log(`  Difference: ${diff.difference.toFixed(6)} (${diff.percentage.toFixed(2)}%)`);
    console.log('  ---');
  }

  console.log('\n=== TIMESTAMPS WITH LARGEST CUMULATIVE DIFFERENCES ===');
  const sortedTimestampDiffs = Array.from(timestampDifferences.entries())
    .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
    .slice(0, 10);

  for (const [timestamp, diff] of sortedTimestampDiffs) {
    console.log(`${timestamp}: ${diff.toFixed(6)}`);
  }

  // Calculate some statistics
  const totalStrategiesWithDiffs = Array.from(strategyDifferences.values()).filter(
    (s) => Math.abs(s.sum_diff) > 0.000001,
  ).length;

  const avgDiffPerStrategy =
    Array.from(strategyDifferences.values()).reduce((sum, s) => sum + Math.abs(s.sum_diff), 0) /
    strategyDifferences.size;

  console.log('\n=== STATISTICS ===');
  console.log(`Total strategies: ${strategyDifferences.size}`);
  console.log(`Strategies with differences: ${totalStrategiesWithDiffs}`);
  console.log(`Average absolute difference per strategy: ${avgDiffPerStrategy.toFixed(6)}`);
  console.log(`Total significant differences found: ${significantDifferences.length}`);

  // Look for patterns in timestamps
  const timestampPattern = new Map<string, number>();
  for (const diff of significantDifferences) {
    const hour = new Date(diff.timestamp).getHours();
    timestampPattern.set(`hour_${hour}`, (timestampPattern.get(`hour_${hour}`) || 0) + 1);
  }

  console.log('\n=== DIFFERENCES BY HOUR OF DAY ===');
  for (const [hour, count] of Array.from(timestampPattern.entries()).sort()) {
    console.log(`${hour}: ${count} differences`);
  }
}

async function main() {
  const file1 = './reward_breakdown_1_1754597049151.csv';
  const file2 = './reward_breakdown_1_1754597301418.csv';

  try {
    await analyzeDetailedDifferences(file1, file2);
  } catch (error) {
    console.error('Error analyzing differences:', error);
  }
}

if (require.main === module) {
  main();
}
