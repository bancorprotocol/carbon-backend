#!/usr/bin/env ts-node
/* eslint-disable */
// @ts-nocheck

import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse';
import { Transform } from 'stream';

interface CSVRow {
  strategy_id: string;
  epoch_start: string;
  epoch_number: number;
  sub_epoch_timestamp: string;
  token0_reward: string;
  token1_reward: string;
  total_reward: string;
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
  token0_reward_weight: string;
  token1_reward_weight: string;
  token0_decimals: string;
  token1_decimals: string;
  token0_order_A_compressed: string;
  token0_order_B_compressed: string;
  token0_order_A: string;
  token0_order_B: string;
  token0_order_z: string;
  token1_order_A_compressed: string;
  token1_order_B_compressed: string;
  token1_order_A: string;
  token1_order_B: string;
  token1_order_z: string;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalRows: number;
    uniqueStrategies: number;
    uniqueEpochs: number;
    uniqueSubEpochs: number;
    duplicateCount: number;
    epochRange: { min: number; max: number } | null;
    timeRange: { start: string; end: string } | null;
  };
}

class CSVValidator {
  private rows: CSVRow[] = [];
  private errors: string[] = [];
  private warnings: string[] = [];

  constructor(private csvFilePath: string) {}

  async validate(): Promise<ValidationResult> {
    try {
      await this.loadCSV();
      console.log('📋 Validating structure...');
      this.validateStructure();
      console.log('🔍 Checking for duplicates...');
      this.validateDuplicates();
      console.log('📊 Validating epoch continuity...');
      this.validateEpochContinuity();
      console.log('🔢 Validating data integrity...');
      this.validateDataIntegrity();
      console.log('💼 Validating business logic...');
      this.validateBusinessLogic();
      console.log('📈 Generating results...');
      return this.generateResult();
    } catch (error) {
      this.errors.push(`Failed to validate CSV: ${error.message}`);
      return this.generateResult();
    }
  }

  private async loadCSV(): Promise<void> {
    if (!fs.existsSync(this.csvFilePath)) {
      throw new Error(`CSV file not found: ${this.csvFilePath}`);
    }

    const fileContent = fs.readFileSync(this.csvFilePath, 'utf-8');

    try {
      const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      this.rows = records.map((row: any, index: number) => {
        // Convert epoch_number to number for proper validation
        const epochNumber = parseInt(row.epoch_number);
        if (isNaN(epochNumber)) {
          this.errors.push(`Row ${index + 2}: Invalid epoch_number "${row.epoch_number}"`);
        }

        return {
          ...row,
          epoch_number: epochNumber,
        } as CSVRow;
      });

      console.log(`✅ Loaded ${this.rows.length} rows from CSV`);
    } catch (error) {
      throw new Error(`Failed to parse CSV: ${error.message}`);
    }
  }

  private validateStructure(): void {
    if (this.rows.length === 0) {
      this.errors.push('CSV file is empty or has no data rows');
      return;
    }

    // Check required columns
    const requiredColumns = [
      'strategy_id',
      'epoch_start',
      'epoch_number',
      'sub_epoch_timestamp',
      'token0_reward',
      'token1_reward',
      'total_reward',
    ];

    const firstRow = this.rows[0];
    const missingColumns = requiredColumns.filter((col) => !(col in firstRow));

    if (missingColumns.length > 0) {
      this.errors.push(`Missing required columns: ${missingColumns.join(', ')}`);
    }

    // Check for empty required fields
    this.rows.forEach((row, index) => {
      requiredColumns.forEach((col) => {
        if (!row[col as keyof CSVRow] || row[col as keyof CSVRow].toString().trim() === '') {
          this.errors.push(`Row ${index + 2}: Missing value for required column "${col}"`);
        }
      });
    });
  }

  private validateDuplicates(): void {
    const duplicateMap = new Map<string, number[]>();
    const totalRows = this.rows.length;

    this.rows.forEach((row, index) => {
      if (index % 50000 === 0 && index > 0) {
        console.log(
          `  Progress: ${index}/${totalRows} rows checked for duplicates (${Math.round((index / totalRows) * 100)}%)`,
        );
      }

      const key = `${row.strategy_id}|${row.sub_epoch_timestamp}`;

      if (!duplicateMap.has(key)) {
        duplicateMap.set(key, []);
      }
      duplicateMap.get(key)!.push(index + 2); // +2 for header and 0-based index
    });

    console.log(`  Analyzing ${duplicateMap.size} unique strategy+timestamp combinations...`);
    const duplicates = Array.from(duplicateMap.entries()).filter(([_, indices]) => indices.length > 1);

    if (duplicates.length > 0) {
      this.errors.push(
        `❌ CRITICAL: Found ${duplicates.length} duplicate strategy_id + sub_epoch_timestamp combinations:`,
      );

      duplicates.forEach(([key, indices]) => {
        const [strategyId, subEpochTimestamp] = key.split('|');
        const duplicateRows = indices.map((i) => this.rows[i - 2]);

        this.errors.push(`  • Strategy ${strategyId} at ${subEpochTimestamp}:`);
        this.errors.push(`    Rows: ${indices.join(', ')}`);

        // Show the different reward values
        const rewards = duplicateRows.map((row) => ({
          token0: row.token0_reward,
          token1: row.token1_reward,
          total: row.total_reward,
        }));

        this.errors.push(`    Rewards: ${JSON.stringify(rewards, null, 6)}`);
      });
    }
  }

  private validateEpochContinuity(): void {
    const epochs = [...new Set(this.rows.map((row) => row.epoch_number))].sort((a, b) => a - b);

    if (epochs.length === 0) return;

    // Check for gaps in epoch sequence
    for (let i = 1; i < epochs.length; i++) {
      const current = epochs[i];
      const previous = epochs[i - 1];

      if (current - previous > 1) {
        this.errors.push(`Gap in epoch sequence: Missing epochs between ${previous} and ${current}`);
      }
    }

    // Check for epoch consistency within each epoch
    const epochGroups = new Map<number, Set<string>>();
    this.rows.forEach((row) => {
      if (!epochGroups.has(row.epoch_number)) {
        epochGroups.set(row.epoch_number, new Set());
      }
      epochGroups.get(row.epoch_number)!.add(row.epoch_start);
    });

    epochGroups.forEach((epochStarts, epochNumber) => {
      if (epochStarts.size > 1) {
        this.errors.push(
          `Epoch ${epochNumber} has inconsistent epoch_start values: ${Array.from(epochStarts).join(', ')}`,
        );
      }
    });
  }

  private validateDataIntegrity(): void {
    const totalRows = this.rows.length;
    this.rows.forEach((row, index) => {
      if (index % 10000 === 0 && index > 0) {
        console.log(`  Progress: ${index}/${totalRows} rows validated (${Math.round((index / totalRows) * 100)}%)`);
      }
      const rowNum = index + 2;

      // Validate numeric fields
      const numericFields = [
        'token0_reward',
        'token1_reward',
        'total_reward',
        'liquidity0',
        'liquidity1',
        'token0_usd_rate',
        'token1_usd_rate',
        'target_price',
        'eligible0',
        'eligible1',
      ];

      numericFields.forEach((field) => {
        const value = row[field as keyof CSVRow];
        if (value && isNaN(parseFloat(String(value)))) {
          this.errors.push(`Row ${rowNum}: Invalid numeric value for ${field}: "${value}"`);
        }
      });

      // Validate addresses (should be 42 characters starting with 0x)
      const addressFields = ['token0_address', 'token1_address'];
      addressFields.forEach((field) => {
        const value = String(row[field as keyof CSVRow] || '');
        if (value && (!value.startsWith('0x') || value.length !== 42)) {
          this.errors.push(`Row ${rowNum}: Invalid address format for ${field}: "${value}"`);
        }
      });

      // Validate timestamps
      const timestampFields = ['epoch_start', 'sub_epoch_timestamp'];
      timestampFields.forEach((field) => {
        const value = String(row[field as keyof CSVRow] || '');
        if (value && isNaN(Date.parse(value))) {
          this.errors.push(`Row ${rowNum}: Invalid timestamp format for ${field}: "${value}"`);
        }
      });

      // Validate total_reward = token0_reward + token1_reward
      const token0Reward = parseFloat(row.token0_reward || '0');
      const token1Reward = parseFloat(row.token1_reward || '0');
      const totalReward = parseFloat(row.total_reward || '0');

      if (!isNaN(token0Reward) && !isNaN(token1Reward) && !isNaN(totalReward)) {
        const expectedTotal = token0Reward + token1Reward;
        const tolerance = 1e-10; // Small tolerance for floating point precision

        if (Math.abs(totalReward - expectedTotal) > tolerance) {
          this.errors.push(
            `Row ${rowNum}: total_reward (${totalReward}) != token0_reward (${token0Reward}) + token1_reward (${token1Reward})`,
          );
        }
      }
    });
  }

  private validateBusinessLogic(): void {
    // Group by strategy to validate consistency
    const strategyGroups = new Map<string, CSVRow[]>();
    this.rows.forEach((row) => {
      if (!strategyGroups.has(row.strategy_id)) {
        strategyGroups.set(row.strategy_id, []);
      }
      strategyGroups.get(row.strategy_id)!.push(row);
    });

    console.log(`  Validating ${strategyGroups.size} unique strategies...`);

    strategyGroups.forEach((rows, strategyId) => {
      // Check that token addresses are consistent for each strategy
      const token0Addresses = new Set(rows.map((r) => r.token0_address));
      const token1Addresses = new Set(rows.map((r) => r.token1_address));

      if (token0Addresses.size > 1) {
        this.errors.push(
          `Strategy ${strategyId} has inconsistent token0_address: ${Array.from(token0Addresses).join(', ')}`,
        );
      }

      if (token1Addresses.size > 1) {
        this.errors.push(
          `Strategy ${strategyId} has inconsistent token1_address: ${Array.from(token1Addresses).join(', ')}`,
        );
      }

      // Check for negative rewards
      rows.forEach((row, index) => {
        const rewards = [
          { name: 'token0_reward', value: parseFloat(row.token0_reward || '0') },
          { name: 'token1_reward', value: parseFloat(row.token1_reward || '0') },
          { name: 'total_reward', value: parseFloat(row.total_reward || '0') },
        ];

        rewards.forEach(({ name, value }) => {
          if (!isNaN(value) && value < 0) {
            this.warnings.push(`Strategy ${strategyId}: Negative ${name} (${value})`);
          }
        });
      });

      // Sort by sub_epoch_timestamp to check chronological order
      const sortedRows = [...rows].sort(
        (a, b) => new Date(a.sub_epoch_timestamp).getTime() - new Date(b.sub_epoch_timestamp).getTime(),
      );

      // Check for timestamp consistency within epochs
      const epochTimestamps = new Map<number, string[]>();
      sortedRows.forEach((row) => {
        if (!epochTimestamps.has(row.epoch_number)) {
          epochTimestamps.set(row.epoch_number, []);
        }
        epochTimestamps.get(row.epoch_number)!.push(row.sub_epoch_timestamp);
      });

      epochTimestamps.forEach((timestamps, epochNumber) => {
        const uniqueTimestamps = new Set(timestamps);
        if (uniqueTimestamps.size !== timestamps.length) {
          this.warnings.push(`Strategy ${strategyId}, Epoch ${epochNumber}: Duplicate sub_epoch_timestamps`);
        }
      });
    });
  }

  private generateResult(): ValidationResult {
    const uniqueStrategies = new Set(this.rows.map((r) => r.strategy_id)).size;
    const uniqueEpochs = new Set(this.rows.map((r) => r.epoch_number)).size;
    const uniqueSubEpochs = new Set(this.rows.map((r) => r.sub_epoch_timestamp)).size;

    const epochs = this.rows.map((r) => r.epoch_number).filter((e) => !isNaN(e));
    let epochRange = null;
    if (epochs.length > 0) {
      let minEpoch = epochs[0];
      let maxEpoch = epochs[0];

      for (const epoch of epochs) {
        if (epoch < minEpoch) minEpoch = epoch;
        if (epoch > maxEpoch) maxEpoch = epoch;
      }

      epochRange = {
        min: minEpoch,
        max: maxEpoch,
      };
    }

    const timestamps = this.rows.map((r) => r.sub_epoch_timestamp).filter((t) => !isNaN(Date.parse(t)));
    let timeRange = null;
    if (timestamps.length > 0) {
      const parsedTimestamps = timestamps.map((t) => Date.parse(t));
      let minTime = parsedTimestamps[0];
      let maxTime = parsedTimestamps[0];

      for (const time of parsedTimestamps) {
        if (time < minTime) minTime = time;
        if (time > maxTime) maxTime = time;
      }

      timeRange = {
        start: new Date(minTime).toISOString(),
        end: new Date(maxTime).toISOString(),
      };
    }

    // Count duplicates
    const duplicateMap = new Map<string, number>();
    this.rows.forEach((row) => {
      const key = `${row.strategy_id}|${row.sub_epoch_timestamp}`;
      duplicateMap.set(key, (duplicateMap.get(key) || 0) + 1);
    });
    const duplicateCount = Array.from(duplicateMap.values()).filter((count) => count > 1).length;

    return {
      isValid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      stats: {
        totalRows: this.rows.length,
        uniqueStrategies,
        uniqueEpochs,
        uniqueSubEpochs,
        duplicateCount,
        epochRange,
        timeRange,
      },
    };
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: ts-node validate-csv.ts <csv-file-path>');
    console.error('Example: ts-node validate-csv.ts ./reward_breakdown_ethereum_1_1234567890.csv');
    process.exit(1);
  }

  const csvFilePath = args[0];
  const validator = new CSVValidator(csvFilePath);

  console.log(`🔍 Validating CSV file: ${csvFilePath}`);
  console.log('='.repeat(80));

  const result = await validator.validate();

  // Print statistics
  console.log('\n📊 CSV Statistics:');
  console.log(`  Total rows: ${result.stats.totalRows}`);
  console.log(`  Unique strategies: ${result.stats.uniqueStrategies}`);
  console.log(`  Unique epochs: ${result.stats.uniqueEpochs}`);
  console.log(`  Unique sub-epochs: ${result.stats.uniqueSubEpochs}`);
  console.log(`  Duplicate entries: ${result.stats.duplicateCount}`);

  if (result.stats.epochRange) {
    console.log(`  Epoch range: ${result.stats.epochRange.min} - ${result.stats.epochRange.max}`);
  }

  if (result.stats.timeRange) {
    console.log(`  Time range: ${result.stats.timeRange.start} to ${result.stats.timeRange.end}`);
  }

  // Print warnings
  if (result.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    result.warnings.forEach((warning) => console.log(`  ${warning}`));
  }

  // Print errors
  if (result.errors.length > 0) {
    console.log('\n❌ Errors:');
    result.errors.forEach((error) => console.log(`  ${error}`));
  }

  // Final result
  console.log('\n' + '='.repeat(80));
  if (result.isValid) {
    console.log('✅ CSV validation PASSED - No critical errors found');
    process.exit(0);
  } else {
    console.log('❌ CSV validation FAILED - Critical errors found');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { CSVValidator, ValidationResult };
