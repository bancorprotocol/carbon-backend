import * as fs from 'fs';
import * as path from 'path';
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

interface RowWithIndex {
  row: RewardRow;
  csvRowNumber: number; // The actual row number in the CSV file (including header)
}

interface FieldDifference {
  csvRowNumber1: number;
  csvRowNumber2: number;
  columnName: string;
  file1Value: string;
  file2Value: string;
  strategy_id: string;
  sub_epoch_timestamp: string;
  numericDifference?: number; // Only for numeric fields
}

async function readCSVFileWithRowNumbers(filePath: string): Promise<RowWithIndex[]> {
  return new Promise((resolve, reject) => {
    const results: RowWithIndex[] = [];
    let csvRowNumber = 1; // Start at 1 for header

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data: RewardRow) => {
        csvRowNumber++; // Increment for each data row
        results.push({
          row: data,
          csvRowNumber: csvRowNumber,
        });
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

function compareRows(rowData1: RowWithIndex, rowData2: RowWithIndex): FieldDifference[] {
  const differences: FieldDifference[] = [];
  const row1 = rowData1.row;
  const row2 = rowData2.row;

  // Compare all fields
  const fields = Object.keys(row1) as (keyof RewardRow)[];

  for (const field of fields) {
    if (row1[field] !== row2[field]) {
      const diff: FieldDifference = {
        csvRowNumber1: rowData1.csvRowNumber,
        csvRowNumber2: rowData2.csvRowNumber,
        columnName: field,
        file1Value: row1[field],
        file2Value: row2[field],
        strategy_id: row1.strategy_id,
        sub_epoch_timestamp: row1.sub_epoch_timestamp,
      };

      // Calculate numeric difference for numeric fields
      if (
        field.includes('reward') ||
        field.includes('liquidity') ||
        field.includes('rate') ||
        field.includes('price') ||
        field.includes('weighting')
      ) {
        const val1 = parseFloat(row1[field]);
        const val2 = parseFloat(row2[field]);
        if (!isNaN(val1) && !isNaN(val2)) {
          diff.numericDifference = val2 - val1;
        }
      }

      differences.push(diff);
    }
  }

  return differences;
}

/**
 * Find the two most recent CSV files in the root directory
 */
function findLatestCSVFiles(rootDir: string): string[] {
  const files = fs.readdirSync(rootDir);

  // Filter for CSV files and get their stats
  const csvFiles = files
    .filter((file) => file.endsWith('.csv'))
    .map((file) => {
      const filePath = path.join(rootDir, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        path: filePath,
        mtime: stats.mtime,
      };
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime()); // Sort by modified time, newest first

  if (csvFiles.length < 2) {
    throw new Error(`Need at least 2 CSV files in root directory. Found: ${csvFiles.length}`);
  }

  console.log('📂 Found CSV files (sorted by date, newest first):');
  csvFiles.forEach((file, index) => {
    const indicator = index < 2 ? '✅' : '  ';
    console.log(`   ${indicator} ${file.name} (${file.mtime.toISOString()})`);
  });
  console.log('');

  return [csvFiles[0].path, csvFiles[1].path];
}

function calculateTotals(rowsWithIndex: RowWithIndex[]) {
  let totalToken0Rewards = 0;
  let totalToken1Rewards = 0;
  let totalSumRewards = 0;

  for (const { row } of rowsWithIndex) {
    const token0Reward = parseFloat(row.token0_reward) || 0;
    const token1Reward = parseFloat(row.token1_reward) || 0;
    const sumReward = parseFloat(row.sum_token0_token1_rewards) || 0;

    totalToken0Rewards += token0Reward;
    totalToken1Rewards += token1Reward;
    totalSumRewards += sumReward;
  }

  return {
    totalToken0Rewards,
    totalToken1Rewards,
    totalSumRewards,
  };
}

async function compareCSVFiles(file1Path: string, file2Path: string) {
  console.log('');
  console.log('🔍 STARTING CSV COMPARISON');
  console.log('═'.repeat(100));
  console.log(`📄 File 1 (Older):  ${path.basename(file1Path)}`);
  console.log(`📄 File 2 (Newer):  ${path.basename(file2Path)}`);
  console.log('═'.repeat(100));

  const [rowsWithIndex1, rowsWithIndex2] = await Promise.all([
    readCSVFileWithRowNumbers(file1Path),
    readCSVFileWithRowNumbers(file2Path),
  ]);

  console.log(`\n📊 DATA OVERVIEW:`);
  console.log(`   📈 File 1 (Older): ${rowsWithIndex1.length.toLocaleString()} data rows`);
  console.log(`   📈 File 2 (Newer): ${rowsWithIndex2.length.toLocaleString()} data rows`);
  console.log(`   🔢 Row Difference: ${(rowsWithIndex2.length - rowsWithIndex1.length).toLocaleString()}`);

  // Calculate totals
  const totals1 = calculateTotals(rowsWithIndex1);
  const totals2 = calculateTotals(rowsWithIndex2);

  console.log('\n💰 REWARDS TOTALS COMPARISON:');
  console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│                            Token0 Rewards                                  │');
  console.log('├─────────────────────────────────────────────────────────────────────────────┤');
  console.log(`│ File 1 (Older): ${totals1.totalToken0Rewards.toFixed(6).padStart(20)} │`);
  console.log(`│ File 2 (Newer): ${totals2.totalToken0Rewards.toFixed(6).padStart(20)} │`);
  console.log(
    `│ Difference:     ${(totals2.totalToken0Rewards - totals1.totalToken0Rewards).toFixed(6).padStart(20)} │`,
  );
  console.log('├─────────────────────────────────────────────────────────────────────────────┤');
  console.log('│                            Token1 Rewards                                  │');
  console.log('├─────────────────────────────────────────────────────────────────────────────┤');
  console.log(`│ File 1 (Older): ${totals1.totalToken1Rewards.toFixed(6).padStart(20)} │`);
  console.log(`│ File 2 (Newer): ${totals2.totalToken1Rewards.toFixed(6).padStart(20)} │`);
  console.log(
    `│ Difference:     ${(totals2.totalToken1Rewards - totals1.totalToken1Rewards).toFixed(6).padStart(20)} │`,
  );
  console.log('├─────────────────────────────────────────────────────────────────────────────┤');
  console.log('│                          TOTAL REWARDS                                     │');
  console.log('├─────────────────────────────────────────────────────────────────────────────┤');
  console.log(`│ File 1 (Older): ${totals1.totalSumRewards.toFixed(6).padStart(20)} │`);
  console.log(`│ File 2 (Newer): ${totals2.totalSumRewards.toFixed(6).padStart(20)} │`);
  console.log(`│ DIFFERENCE:     ${(totals2.totalSumRewards - totals1.totalSumRewards).toFixed(6).padStart(20)} │`);
  console.log('└─────────────────────────────────────────────────────────────────────────────┘');

  // Create maps for efficient lookup
  const map1 = new Map<string, RowWithIndex>();
  const map2 = new Map<string, RowWithIndex>();

  for (const rowWithIndex of rowsWithIndex1) {
    const key = createRowKey(rowWithIndex.row);
    map1.set(key, rowWithIndex);
  }

  for (const rowWithIndex of rowsWithIndex2) {
    const key = createRowKey(rowWithIndex.row);
    map2.set(key, rowWithIndex);
  }

  // Find structural differences (missing/extra rows)
  const onlyInFile1: RowWithIndex[] = [];
  const onlyInFile2: RowWithIndex[] = [];

  for (const [key, rowData] of map1) {
    if (!map2.has(key)) {
      onlyInFile1.push(rowData);
    }
  }

  for (const [key, rowData] of map2) {
    if (!map1.has(key)) {
      onlyInFile2.push(rowData);
    }
  }

  console.log('\n🔄 STRUCTURAL DIFFERENCES:');
  console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│                          Row Count Analysis                                 │');
  console.log('├─────────────────────────────────────────────────────────────────────────────┤');
  console.log(`│ 📤 Rows only in File 1 (missing in newer):  ${onlyInFile1.length.toString().padStart(8)} │`);
  console.log(`│ 📥 Rows only in File 2 (new in newer):      ${onlyInFile2.length.toString().padStart(8)} │`);
  console.log('└─────────────────────────────────────────────────────────────────────────────┘');

  // Compare matching rows for field differences
  const fieldDifferences: FieldDifference[] = [];

  for (const [key, rowData1] of map1) {
    const rowData2 = map2.get(key);
    if (rowData2) {
      const rowDiffs = compareRows(rowData1, rowData2);
      fieldDifferences.push(...rowDiffs);
    }
  }

  console.log(`\n📝 FIELD DIFFERENCES IN MATCHING ROWS: ${fieldDifferences.length}`);

  // Show detailed field differences or success message
  if (fieldDifferences.length === 0 && onlyInFile1.length === 0 && onlyInFile2.length === 0) {
    console.log('\n✅ *** SUCCESS: ALL ROWS ARE IDENTICAL! ***');
    console.log('═'.repeat(100));
    console.log('🎉 Perfect match! Every row is exactly the same between both files.');
    console.log('═'.repeat(100));
  } else if (fieldDifferences.length > 0) {
    console.log('\n🚨 *** CRITICAL: FOUND NON-EQUAL ROWS! ***');
    console.log('═'.repeat(100));
    console.log('Every row should be identical between files, but differences were found:');
    console.log('═'.repeat(100));

    // Group by field type for analysis
    const rewardDifferences = fieldDifferences.filter(
      (d) => d.columnName.includes('reward') || d.columnName.includes('eligible') || d.columnName.includes('liquidity'),
    );

    const timestampDifferences = fieldDifferences.filter((d) => d.columnName.includes('timestamp'));

    const otherDifferences = fieldDifferences.filter(
      (d) =>
        !d.columnName.includes('reward') &&
        !d.columnName.includes('eligible') &&
        !d.columnName.includes('liquidity') &&
        !d.columnName.includes('timestamp'),
    );

    // Show reward differences first (most important)
    if (rewardDifferences.length > 0) {
      console.log(`\n💸 REWARD/LIQUIDITY DIFFERENCES (${rewardDifferences.length} total):`);
      console.log('┌─' + '─'.repeat(96) + '─┐');
      console.log('│' + ' '.repeat(40) + 'CRITICAL DIFFERENCES' + ' '.repeat(36) + '│');
      console.log('├─' + '─'.repeat(96) + '─┤');

      // Show ALL reward differences, not just first 10
      rewardDifferences.forEach((diff, index) => {
        console.log(
          `│ ${(index + 1).toString().padStart(3)}. ROW ${diff.csvRowNumber1
            .toString()
            .padEnd(6)} │ Strategy: ${diff.strategy_id.padEnd(20)} │`,
        );
        console.log(`│     Column: ${diff.columnName.padEnd(30)} │`);
        console.log(`│     File 1 (Older): ${diff.file1Value.padEnd(25)} │`);
        console.log(`│     File 2 (Newer): ${diff.file2Value.padEnd(25)} │`);
        if (diff.numericDifference !== undefined) {
          const diffSign = diff.numericDifference >= 0 ? '+' : '';
          console.log(`│     Numeric Δ: ${(diffSign + diff.numericDifference.toFixed(6)).padEnd(20)} │`);
        }
        console.log(`│     Timestamp: ${diff.sub_epoch_timestamp.padEnd(25)} │`);
        if (index < rewardDifferences.length - 1) {
          console.log('├─' + '─'.repeat(96) + '─┤');
        }
      });

      console.log('└─' + '─'.repeat(96) + '─┘');

      // Calculate total impact of reward differences
      const token0RewardDiffs = rewardDifferences.filter((d) => d.columnName === 'token0_reward');
      const token1RewardDiffs = rewardDifferences.filter((d) => d.columnName === 'token1_reward');

      console.log(`\\n   📈 REWARD DIFFERENCE BREAKDOWN:`);
      console.log(`      Token0 reward differences: ${token0RewardDiffs.length} rows`);
      console.log(`      Token1 reward differences: ${token1RewardDiffs.length} rows`);

      const totalToken0Impact = token0RewardDiffs.reduce((sum, diff) => sum + (diff.numericDifference || 0), 0);
      const totalToken1Impact = token1RewardDiffs.reduce((sum, diff) => sum + (diff.numericDifference || 0), 0);

      console.log(`      Total Token0 impact: ${totalToken0Impact.toFixed(6)}`);
      console.log(`      Total Token1 impact: ${totalToken1Impact.toFixed(6)}`);
    }

    // Show timestamp differences
    if (timestampDifferences.length > 0) {
      console.log(`\n⏰ TIMESTAMP DIFFERENCES (${timestampDifferences.length} total):`);
      console.log('┌─' + '─'.repeat(96) + '─┐');
      console.log('│' + ' '.repeat(40) + 'TIMESTAMP DIFFERENCES' + ' '.repeat(35) + '│');
      console.log('├─' + '─'.repeat(96) + '─┤');

      timestampDifferences.forEach((diff, index) => {
        console.log(
          `│ ${(index + 1).toString().padStart(3)}. ROW ${diff.csvRowNumber1
            .toString()
            .padEnd(6)} │ Strategy: ${diff.strategy_id.padEnd(20)} │`,
        );
        console.log(`│     Column: ${diff.columnName.padEnd(30)} │`);
        console.log(`│     File 1 (Older): ${diff.file1Value.padEnd(25)} │`);
        console.log(`│     File 2 (Newer): ${diff.file2Value.padEnd(25)} │`);
        if (index < timestampDifferences.length - 1) {
          console.log('├─' + '─'.repeat(96) + '─┤');
        }
      });

      console.log('└─' + '─'.repeat(96) + '─┘');
    }

    // Show other differences
    if (otherDifferences.length > 0) {
      console.log(`\n🔧 OTHER FIELD DIFFERENCES (${otherDifferences.length} total):`);
      console.log('┌─' + '─'.repeat(96) + '─┐');
      console.log('│' + ' '.repeat(42) + 'OTHER DIFFERENCES' + ' '.repeat(37) + '│');
      console.log('├─' + '─'.repeat(96) + '─┤');

      // Group by field name
      const fieldGroups = new Map<string, FieldDifference[]>();
      for (const diff of otherDifferences) {
        if (!fieldGroups.has(diff.columnName)) {
          fieldGroups.set(diff.columnName, []);
        }
        fieldGroups.get(diff.columnName)?.push(diff);
      }

      let groupIndex = 0;
      for (const [fieldName, diffs] of fieldGroups) {
        console.log(
          `│ ${fieldName}: ${diffs.length} differences ${' '.repeat(
            50 - fieldName.length - diffs.length.toString().length,
          )} │`,
        );

        // Show all differences for this field
        diffs.forEach((diff, diffIndex) => {
          console.log(
            `│   ${(diffIndex + 1).toString().padStart(2)}. Row ${diff.csvRowNumber1}: "${diff.file1Value}" → "${
              diff.file2Value
            }" │`,
          );
        });

        if (groupIndex < fieldGroups.size - 1) {
          console.log('├─' + '─'.repeat(96) + '─┤');
        }
        groupIndex++;
      }

      console.log('└─' + '─'.repeat(96) + '─┘');
    }
  }

  // Show rows that exist in only one file
  if (onlyInFile1.length > 0) {
    console.log(`\\n❌ ROWS ONLY IN FILE 1 (${onlyInFile1.length} total):`);
    const showCount = Math.min(5, onlyInFile1.length);

    for (let i = 0; i < showCount; i++) {
      const { row, csvRowNumber } = onlyInFile1[i];
      console.log(`   Row ${csvRowNumber}: Strategy ${row.strategy_id}`);
      console.log(`     Timestamp: ${row.sub_epoch_timestamp}`);
      console.log(
        `     Rewards: Token0=${row.token0_reward}, Token1=${row.token1_reward}, Sum=${row.sum_token0_token1_rewards}`,
      );
    }

    if (onlyInFile1.length > showCount) {
      console.log(`   ... and ${onlyInFile1.length - showCount} more rows`);
    }
  }

  if (onlyInFile2.length > 0) {
    console.log(`\\n✅ ROWS ONLY IN FILE 2 (${onlyInFile2.length} total):`);
    const showCount = Math.min(5, onlyInFile2.length);

    for (let i = 0; i < showCount; i++) {
      const { row, csvRowNumber } = onlyInFile2[i];
      console.log(`   Row ${csvRowNumber}: Strategy ${row.strategy_id}`);
      console.log(`     Timestamp: ${row.sub_epoch_timestamp}`);
      console.log(
        `     Rewards: Token0=${row.token0_reward}, Token1=${row.token1_reward}, Sum=${row.sum_token0_token1_rewards}`,
      );
    }

    if (onlyInFile2.length > showCount) {
      console.log(`   ... and ${onlyInFile2.length - showCount} more rows`);
    }
  }

  // Final summary
  console.log('\n' + '═'.repeat(100));
  console.log('🎯 FINAL SUMMARY:');
  console.log('═'.repeat(100));

  const totalDifference = totals2.totalSumRewards - totals1.totalSumRewards;
  const isEqual = fieldDifferences.length === 0 && onlyInFile1.length === 0 && onlyInFile2.length === 0;

  if (isEqual) {
    console.log('✅ RESULT: FILES ARE IDENTICAL! ✅');
    console.log('   All rows match perfectly between the two files.');
  } else {
    console.log('❌ RESULT: FILES ARE NOT EQUAL! ❌');
    console.log(`   📊 Total reward difference: ${totalDifference.toFixed(6)}`);
    console.log('   🔍 Differences found:');

    if (fieldDifferences.length > 0) {
      console.log(`      • ${fieldDifferences.length} field differences in matching rows`);
    }
    if (onlyInFile1.length > 0) {
      const missingRowsTotal = onlyInFile1.reduce(
        (sum, { row }) => sum + (parseFloat(row.sum_token0_token1_rewards) || 0),
        0,
      );
      console.log(`      • ${onlyInFile1.length} rows missing in newer file (impact: ${missingRowsTotal.toFixed(6)})`);
    }
    if (onlyInFile2.length > 0) {
      const extraRowsTotal = onlyInFile2.reduce(
        (sum, { row }) => sum + (parseFloat(row.sum_token0_token1_rewards) || 0),
        0,
      );
      console.log(`      • ${onlyInFile2.length} new rows in newer file (impact: +${extraRowsTotal.toFixed(6)})`);
    }
  }

  console.log('═'.repeat(100));
}

async function main() {
  try {
    // Get the root directory (2 levels up from this script location)
    const rootDir = path.resolve(__dirname, '..', '..');
    console.log(`🔍 Looking for CSV files in: ${rootDir}`);

    // Find the 2 latest CSV files automatically
    const [newerFile, olderFile] = findLatestCSVFiles(rootDir);

    await compareCSVFiles(olderFile, newerFile);
  } catch (error) {
    console.error('❌ Error comparing CSV files:', error);
    console.error('Make sure there are at least 2 CSV files in the root directory.');
  }
}

if (require.main === module) {
  main();
}
