#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse';

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
    duplicateCount: number;
    epochRange: { min: number; max: number } | null;
    timeRange: { start: string; end: string } | null;
  };
}

class StreamingCSVValidator {
  private errors: string[] = [];
  private warnings: string[] = [];
  private duplicateTracker = new Map<string, { rowNum: number; totalReward: string }>();
  private epochTracker = new Set<number>();
  private strategyTracker = new Set<string>();
  private rowCount = 0;
  private minEpoch = Infinity;
  private maxEpoch = -Infinity;
  private minTime = Infinity;
  private maxTime = -Infinity;

  constructor(private csvFilePath: string) {}

  async validate(): Promise<ValidationResult> {
    try {
      if (!fs.existsSync(this.csvFilePath)) {
        throw new Error(`CSV file not found: ${this.csvFilePath}`);
      }

      const fileStats = fs.statSync(this.csvFilePath);
      console.log(
        `📁 Processing CSV file: ${path.basename(this.csvFilePath)} (${(fileStats.size / 1024 / 1024).toFixed(2)} MB)`,
      );

      await this.processStream();
      this.validateEpochContinuity();

      return this.generateResult();
    } catch (error) {
      this.errors.push(`Failed to validate CSV: ${error.message}`);
      return this.generateResult();
    }
  }

  private async processStream(): Promise<void> {
    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(this.csvFilePath).pipe(
        parse({
          columns: true,
          skip_empty_lines: true,
          trim: true,
        }),
      );

      stream.on('data', (record: any) => {
        this.processRow(record);
      });

      stream.on('end', () => {
        console.log(`✅ Processed ${this.rowCount} rows`);
        resolve();
      });

      stream.on('error', (error) => {
        reject(error);
      });
    });
  }

  private processRow(record: any): void {
    this.rowCount++;

    if (this.rowCount % 25000 === 0) {
      console.log(`📊 Processed ${this.rowCount} rows...`);
    }

    const row: CSVRow = {
      ...record,
      epoch_number: parseInt(record.epoch_number, 10),
    };

    // Track statistics
    this.strategyTracker.add(row.strategy_id);

    if (!isNaN(row.epoch_number)) {
      this.epochTracker.add(row.epoch_number);
      this.minEpoch = Math.min(this.minEpoch, row.epoch_number);
      this.maxEpoch = Math.max(this.maxEpoch, row.epoch_number);
    }

    // Track time range
    const timestamp = Date.parse(row.sub_epoch_timestamp);
    if (!isNaN(timestamp)) {
      this.minTime = Math.min(this.minTime, timestamp);
      this.maxTime = Math.max(this.maxTime, timestamp);
    }

    // Check for duplicates (strategy_id + sub_epoch_timestamp)
    const duplicateKey = `${row.strategy_id}|${row.sub_epoch_timestamp}`;
    if (this.duplicateTracker.has(duplicateKey)) {
      const existing = this.duplicateTracker.get(duplicateKey)!;

      this.errors.push(
        `🔴 DUPLICATE FOUND:\n` +
          `   Strategy ID: ${row.strategy_id}\n` +
          `   Sub-epoch: ${row.sub_epoch_timestamp}\n` +
          `   Row ${existing.rowNum}: total_reward=${existing.totalReward}\n` +
          `   Row ${this.rowCount}: total_reward=${row.total_reward}\n`,
      );
    } else {
      this.duplicateTracker.set(duplicateKey, {
        rowNum: this.rowCount,
        totalReward: row.total_reward,
      });
    }

    // Basic data validation
    this.validateRowData(row);
  }

  private validateRowData(row: CSVRow): void {
    // Validate required fields
    const requiredFields = ['strategy_id', 'epoch_number', 'sub_epoch_timestamp', 'total_reward'];
    requiredFields.forEach((field) => {
      if (!row[field as keyof CSVRow] && row[field as keyof CSVRow] !== 0) {
        this.errors.push(`Row ${this.rowCount}: Missing required field: ${field}`);
      }
    });

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
      'token0_decimals',
      'token1_decimals',
    ];

    numericFields.forEach((field) => {
      const value = row[field as keyof CSVRow];
      if (value && isNaN(parseFloat(String(value)))) {
        this.errors.push(`Row ${this.rowCount}: Invalid numeric value for ${field}: "${value}"`);
      }
    });

    // Validate addresses
    const addressFields = ['token0_address', 'token1_address'];
    addressFields.forEach((field) => {
      const value = String(row[field as keyof CSVRow]);
      if (value && (!value.startsWith('0x') || value.length !== 42)) {
        this.warnings.push(`Row ${this.rowCount}: Suspicious address format for ${field}: "${value}"`);
      }
    });

    // Validate epoch number
    if (isNaN(row.epoch_number)) {
      this.errors.push(`Row ${this.rowCount}: Invalid epoch_number: "${row.epoch_number}"`);
    }

    // Validate timestamp format
    if (isNaN(Date.parse(row.sub_epoch_timestamp))) {
      this.errors.push(`Row ${this.rowCount}: Invalid timestamp format: "${row.sub_epoch_timestamp}"`);
    }

    // Business logic validation
    const token0Reward = parseFloat(row.token0_reward || '0');
    const token1Reward = parseFloat(row.token1_reward || '0');
    const totalReward = parseFloat(row.total_reward || '0');

    if (!isNaN(token0Reward) && !isNaN(token1Reward) && !isNaN(totalReward)) {
      const calculatedTotal = token0Reward + token1Reward;
      const tolerance = 0.000001; // Small tolerance for floating point precision

      if (Math.abs(calculatedTotal - totalReward) > tolerance) {
        this.warnings.push(
          `Row ${this.rowCount}: total_reward mismatch - ` +
            `calculated: ${calculatedTotal.toFixed(6)}, actual: ${totalReward.toFixed(6)}`,
        );
      }
    }
  }

  private validateEpochContinuity(): void {
    console.log('🔍 Checking epoch continuity...');

    if (this.epochTracker.size === 0) {
      this.errors.push('No valid epochs found in CSV');
      return;
    }

    const epochs = Array.from(this.epochTracker).sort((a, b) => a - b);
    const expectedCount = this.maxEpoch - this.minEpoch + 1;

    if (epochs.length !== expectedCount) {
      this.errors.push(
        `❌ EPOCH GAP DETECTED: Expected ${expectedCount} epochs (${this.minEpoch}-${this.maxEpoch}), ` +
          `but found ${epochs.length} epochs`,
      );

      // Find missing epochs
      const missingEpochs: number[] = [];
      for (let i = this.minEpoch; i <= this.maxEpoch; i++) {
        if (!this.epochTracker.has(i)) {
          missingEpochs.push(i);
        }
      }

      if (missingEpochs.length <= 10) {
        this.errors.push(`Missing epochs: ${missingEpochs.join(', ')}`);
      } else {
        this.errors.push(
          `Missing ${missingEpochs.length} epochs. First few: ${missingEpochs.slice(0, 10).join(', ')}...`,
        );
      }
    }
  }

  private generateResult(): ValidationResult {
    const duplicateCount = this.errors.filter((e) => e.includes('DUPLICATE FOUND')).length;

    return {
      isValid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      stats: {
        totalRows: this.rowCount,
        uniqueStrategies: this.strategyTracker.size,
        uniqueEpochs: this.epochTracker.size,
        duplicateCount,
        epochRange: this.minEpoch !== Infinity ? { min: this.minEpoch, max: this.maxEpoch } : null,
        timeRange:
          this.minTime !== Infinity
            ? {
                start: new Date(this.minTime).toISOString(),
                end: new Date(this.maxTime).toISOString(),
              }
            : null,
      },
    };
  }
}

// Main execution
async function main() {
  const csvFilePath = process.argv[2];

  if (!csvFilePath) {
    console.error('❌ Usage: npm run validate-csv <path-to-csv-file>');
    process.exit(1);
  }

  console.log('🚀 Starting CSV validation...\n');

  const validator = new StreamingCSVValidator(csvFilePath);
  const result = await validator.validate();

  // Print results
  console.log('\n' + '='.repeat(80));
  console.log('📊 VALIDATION RESULTS');
  console.log('='.repeat(80));

  console.log(`\n📈 Statistics:`);
  console.log(`   Total Rows: ${result.stats.totalRows.toLocaleString()}`);
  console.log(`   Unique Strategies: ${result.stats.uniqueStrategies.toLocaleString()}`);
  console.log(`   Unique Epochs: ${result.stats.uniqueEpochs.toLocaleString()}`);
  console.log(`   Duplicate Count: ${result.stats.duplicateCount.toLocaleString()}`);

  if (result.stats.epochRange) {
    console.log(`   Epoch Range: ${result.stats.epochRange.min} - ${result.stats.epochRange.max}`);
  }

  if (result.stats.timeRange) {
    console.log(`   Time Range: ${result.stats.timeRange.start} - ${result.stats.timeRange.end}`);
  }

  // Show errors
  if (result.errors.length > 0) {
    console.log(`\n❌ ERRORS (${result.errors.length}):`);
    result.errors.slice(0, 20).forEach((error, index) => {
      console.log(`${index + 1}. ${error}`);
    });

    if (result.errors.length > 20) {
      console.log(`... and ${result.errors.length - 20} more errors`);
    }
  }

  // Show warnings
  if (result.warnings.length > 0) {
    console.log(`\n⚠️  WARNINGS (${result.warnings.length}):`);
    result.warnings.slice(0, 10).forEach((warning, index) => {
      console.log(`${index + 1}. ${warning}`);
    });

    if (result.warnings.length > 10) {
      console.log(`... and ${result.warnings.length - 10} more warnings`);
    }
  }

  // Final verdict
  console.log('\n' + '='.repeat(80));
  if (result.isValid) {
    console.log('✅ CSV IS VALID - No critical errors found!');
  } else {
    console.log('❌ CSV HAS ISSUES - Please review the errors above');
  }
  console.log('='.repeat(80));

  process.exit(result.isValid ? 0 : 1);
}

main().catch(console.error);
