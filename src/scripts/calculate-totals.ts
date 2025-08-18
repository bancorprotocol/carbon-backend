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
}

async function calculateTotals(): Promise<void> {
  const file1 = 'reward_breakdown_1_1754597049151.csv';
  const file2 = 'reward_breakdown_1_1754597301418.csv';

  console.log('='.repeat(80));
  console.log('CSV FILES TOTAL DISTRIBUTION ANALYSIS');
  console.log('='.repeat(80));

  // Calculate totals for file1
  const totals1 = await calculateFileTotal(file1);
  console.log(`\n📊 TOTALS FOR ${file1}:`);
  console.log(`   Total rows: ${totals1.rowCount.toLocaleString()}`);
  console.log(`   Sum of token0_reward: ${totals1.token0Total.toFixed(6)}`);
  console.log(`   Sum of token1_reward: ${totals1.token1Total.toFixed(6)}`);
  console.log(`   Sum of sum_token0_token1_rewards: ${totals1.combinedTotal.toFixed(6)}`);

  // Calculate totals for file2
  const totals2 = await calculateFileTotal(file2);
  console.log(`\n📊 TOTALS FOR ${file2}:`);
  console.log(`   Total rows: ${totals2.rowCount.toLocaleString()}`);
  console.log(`   Sum of token0_reward: ${totals2.token0Total.toFixed(6)}`);
  console.log(`   Sum of token1_reward: ${totals2.token1Total.toFixed(6)}`);
  console.log(`   Sum of sum_token0_token1_rewards: ${totals2.combinedTotal.toFixed(6)}`);

  // Calculate differences
  console.log(`\n🔍 DIFFERENCES:`);
  console.log(`   Row count difference: ${totals2.rowCount - totals1.rowCount}`);
  console.log(`   Token0 reward difference: ${(totals2.token0Total - totals1.token0Total).toFixed(6)}`);
  console.log(`   Token1 reward difference: ${(totals2.token1Total - totals1.token1Total).toFixed(6)}`);
  console.log(`   Combined reward difference: ${(totals2.combinedTotal - totals1.combinedTotal).toFixed(6)}`);

  // Calculate percentage differences
  console.log(`\n📈 PERCENTAGE DIFFERENCES:`);
  const token0PercentDiff =
    totals1.token0Total > 0 ? ((totals2.token0Total - totals1.token0Total) / totals1.token0Total) * 100 : 0;
  const token1PercentDiff =
    totals1.token1Total > 0 ? ((totals2.token1Total - totals1.token1Total) / totals1.token1Total) * 100 : 0;
  const combinedPercentDiff =
    totals1.combinedTotal > 0 ? ((totals2.combinedTotal - totals1.combinedTotal) / totals1.combinedTotal) * 100 : 0;

  console.log(`   Token0 reward: ${token0PercentDiff.toFixed(4)}%`);
  console.log(`   Token1 reward: ${token1PercentDiff.toFixed(4)}%`);
  console.log(`   Combined reward: ${combinedPercentDiff.toFixed(4)}%`);

  // Validate sum consistency within each file
  console.log(`\n✅ INTERNAL CONSISTENCY CHECK:`);
  const file1Consistency = Math.abs(totals1.token0Total + totals1.token1Total - totals1.combinedTotal);
  const file2Consistency = Math.abs(totals2.token0Total + totals2.token1Total - totals2.combinedTotal);

  console.log(
    `   File1 - (token0 + token1) vs combined: ${file1Consistency.toFixed(6)} ${
      file1Consistency < 0.000001 ? '✅' : '❌'
    }`,
  );
  console.log(
    `   File2 - (token0 + token1) vs combined: ${file2Consistency.toFixed(6)} ${
      file2Consistency < 0.000001 ? '✅' : '❌'
    }`,
  );

  // Additional analysis
  console.log(`\n🎯 KEY INSIGHTS:`);
  if (totals2.rowCount !== totals1.rowCount) {
    console.log(`   • Row count changed by ${totals2.rowCount - totals1.rowCount} rows`);
  }

  if (Math.abs(combinedPercentDiff) > 0.01) {
    console.log(`   • Significant difference in total distribution: ${combinedPercentDiff.toFixed(4)}%`);
  }

  if (Math.abs(token0PercentDiff) > Math.abs(token1PercentDiff)) {
    console.log(
      `   • Token0 rewards show larger change (${token0PercentDiff.toFixed(
        4,
      )}%) than Token1 (${token1PercentDiff.toFixed(4)}%)`,
    );
  } else if (Math.abs(token1PercentDiff) > Math.abs(token0PercentDiff)) {
    console.log(
      `   • Token1 rewards show larger change (${token1PercentDiff.toFixed(
        4,
      )}%) than Token0 (${token0PercentDiff.toFixed(4)}%)`,
    );
  }

  console.log('\n' + '='.repeat(80));
}

async function calculateFileTotal(filename: string): Promise<{
  rowCount: number;
  token0Total: number;
  token1Total: number;
  combinedTotal: number;
}> {
  return new Promise((resolve, reject) => {
    let rowCount = 0;
    let token0Total = 0;
    let token1Total = 0;
    let combinedTotal = 0;

    fs.createReadStream(filename)
      .pipe(csv())
      .on('data', (row: RewardRow) => {
        rowCount++;

        const token0Reward = parseFloat(row.token0_reward) || 0;
        const token1Reward = parseFloat(row.token1_reward) || 0;
        const sumReward = parseFloat(row.sum_token0_token1_rewards) || 0;

        token0Total += token0Reward;
        token1Total += token1Reward;
        combinedTotal += sumReward;
      })
      .on('end', () => {
        resolve({
          rowCount,
          token0Total,
          token1Total,
          combinedTotal,
        });
      })
      .on('error', reject);
  });
}

calculateTotals().catch(console.error);
