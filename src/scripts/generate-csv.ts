#!/usr/bin/env ts-node

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { createWriteStream } from 'fs';
import { readFile, unlink } from 'fs/promises';
import { SubEpoch } from '../merkl/entities/sub-epoch.entity';

// Load environment variables
dotenv.config();

export interface CsvGeneratorOptions {
  campaignId: string;
  fromEpoch?: number;
  toEpoch?: number;
  fromSubEpoch?: number;
  toSubEpoch?: number;
  outputPath?: string;
  keepOnFailure?: boolean;
}

interface ValidationIssue {
  row: number;
  column?: string;
  value?: any;
  issue: string;
}

interface ValidationStatistics {
  totalRows: number;
  dateRange: { start: Date | null; end: Date | null };
  uniqueStrategies: number;
  subEpochRange: { min: number | null; max: number | null };
  completenessPercentage: number;
}

interface ValidationResult {
  isValid: boolean;
  statistics: ValidationStatistics;
  issues: {
    gaps: Array<{ strategyId: string; missingSubEpochs: number[] }>;
    duplicates: ValidationIssue[];
    invalidData: ValidationIssue[];
    invalidDates: ValidationIssue[];
    timestampOrder: Array<{
      strategyId: string;
      subEpoch: number;
      timestamp: string;
      previousTimestamp: string;
      issue: string;
    }>;
    invalidTimestampRelation: Array<{
      row: number;
      strategyId: string;
      subEpoch: number;
      subEpochTimestamp: string;
      lastEventTimestamp: string;
      issue: string;
    }>;
  };
  recommendations: string[];
}

class CsvGeneratorWithValidation {
  private dataSource: DataSource;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
  }

  private log(message: string) {
    console.log(`${new Date().toISOString()}: ${message}`);
  }

  async generateAndValidateCSV(options: CsvGeneratorOptions): Promise<ValidationResult> {
    const startTime = Date.now();

    try {
      // Step 1: Generate CSV file
      this.log(`🚀 Starting CSV generation for campaign: ${options.campaignId}`);
      const csvPath = await this.generateCSV(options);
      const generationTime = Date.now() - startTime;
      this.log(`✅ Generated CSV: ${csvPath} (${generationTime}ms)`);

      // Step 2: Validate the generated file
      this.log('🔍 Validating generated CSV...');
      const validationStartTime = Date.now();
      const validationResult = await this.validateCSV(csvPath, options.campaignId);
      const validationTime = Date.now() - validationStartTime;
      this.log(`📊 Validation completed (${validationTime}ms)`);

      // Step 3: Report results
      this.logValidationResults(validationResult);

      // Step 4: Handle validation failure
      if (!validationResult.isValid) {
        if (!options.keepOnFailure) {
          await unlink(csvPath);
          this.log(`🗑️ Deleted invalid CSV file: ${csvPath}`);
        } else {
          this.log(`⚠️ Keeping invalid CSV file: ${csvPath} (--keep-on-failure specified)`);
        }
        this.log(`❌ CSV generation failed validation. Total time: ${Date.now() - startTime}ms`);
      } else {
        this.log(`🎉 CSV generation and validation completed successfully! Total time: ${Date.now() - startTime}ms`);
      }

      return validationResult;
    } catch (error) {
      this.log(`❌ CSV generation failed: ${error.message}`);
      throw error;
    }
  }

  private async generateCSV(options: CsvGeneratorOptions): Promise<string> {
    const outputPath = options.outputPath || `reward_breakdown_${options.campaignId}_${Date.now()}.csv`;

    this.log('📊 Querying database for sub-epochs...');

    // Build query
    const queryBuilder = this.dataSource
      .getRepository(SubEpoch)
      .createQueryBuilder('se')
      .where('se.campaignId = :campaignId', { campaignId: options.campaignId });

    if (options.fromEpoch) queryBuilder.andWhere('se.epochNumber >= :fromEpoch', { fromEpoch: options.fromEpoch });
    if (options.toEpoch) queryBuilder.andWhere('se.epochNumber <= :toEpoch', { toEpoch: options.toEpoch });
    if (options.fromSubEpoch)
      queryBuilder.andWhere('se.subEpochNumber >= :fromSubEpoch', { fromSubEpoch: options.fromSubEpoch });
    if (options.toSubEpoch)
      queryBuilder.andWhere('se.subEpochNumber <= :toSubEpoch', { toSubEpoch: options.toSubEpoch });

    queryBuilder.orderBy('se.subEpochNumber', 'ASC').addOrderBy('se.strategyId', 'ASC');

    const stream = createWriteStream(outputPath);

    // Write header
    const headers = [
      'strategy_id',
      'epoch_start',
      'epoch_number',
      'sub_epoch_number',
      'sub_epoch_timestamp',
      'token0_reward',
      'token1_reward',
      'sum_token0_token1_rewards',
      'liquidity0',
      'liquidity1',
      'token0_address',
      'token1_address',
      'token0_usd_rate',
      'token1_usd_rate',
      'target_price',
      'eligible0',
      'eligible1',
      'token0_reward_zone_boundary',
      'token1_reward_zone_boundary',
      'token0_weighting',
      'token1_weighting',
      'token0_decimals',
      'token1_decimals',
      'order0_a_compressed',
      'order0_b_compressed',
      'order0_a',
      'order0_b',
      'order0_z',
      'order1_a_compressed',
      'order1_b_compressed',
      'order1_a',
      'order1_b',
      'order1_z',
      'last_event_timestamp',
    ];

    stream.write(headers.join(',') + '\n');

    // Stream results
    const results = await queryBuilder.stream();
    let rowCount = 0;

    results.on('data', (rawRow: any) => {
      // The streaming query returns raw database rows, not mapped entities
      const row = [
        rawRow.se_strategy_id,
        new Date(rawRow.se_epoch_start).toISOString(),
        rawRow.se_epoch_number,
        rawRow.se_sub_epoch_number,
        new Date(rawRow.se_sub_epoch_timestamp).toISOString(),
        rawRow.se_token0_reward,
        rawRow.se_token1_reward,
        rawRow.se_total_reward,
        rawRow.se_liquidity0,
        rawRow.se_liquidity1,
        rawRow.se_token0_address,
        rawRow.se_token1_address,
        rawRow.se_token0_usd_rate,
        rawRow.se_token1_usd_rate,
        rawRow.se_target_price,
        rawRow.se_eligible0,
        rawRow.se_eligible1,
        rawRow.se_token0_reward_zone_boundary,
        rawRow.se_token1_reward_zone_boundary,
        rawRow.se_token0_weighting,
        rawRow.se_token1_weighting,
        rawRow.se_token0_decimals,
        rawRow.se_token1_decimals,
        rawRow.se_order0_a_compressed,
        rawRow.se_order0_b_compressed,
        rawRow.se_order0_a,
        rawRow.se_order0_b,
        rawRow.se_order0_z,
        rawRow.se_order1_a_compressed,
        rawRow.se_order1_b_compressed,
        rawRow.se_order1_a,
        rawRow.se_order1_b,
        rawRow.se_order1_z,
        new Date(rawRow.se_last_event_timestamp).toISOString(),
      ]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(',');

      stream.write(row + '\n');
      rowCount++;
    });

    return new Promise((resolve, reject) => {
      results.on('end', () => {
        stream.end();
        this.log(`📝 Wrote ${rowCount} rows to CSV`);
        resolve(outputPath);
      });
      results.on('error', reject);
    });
  }

  private async validateCSV(csvPath: string, campaignId: string): Promise<ValidationResult> {
    const csvContent = await readFile(csvPath, 'utf-8');
    const lines = csvContent.trim().split('\n');

    if (lines.length === 0) {
      throw new Error('CSV file is empty');
    }

    const headers = lines[0].split(',').map((h) => h.replace(/"/g, ''));
    const dataLines = lines.slice(1);

    const issues: ValidationResult['issues'] = {
      gaps: [],
      duplicates: [],
      invalidData: [],
      invalidDates: [],
      timestampOrder: [],
      invalidTimestampRelation: [],
    };

    const recommendations: string[] = [];
    const strategySubEpochs = new Map<string, number[]>();
    const strategyTimestamps = new Map<string, Array<{ subEpoch: number; timestamp: string; rowIndex: number }>>();
    const strategyEpochTimestamps = new Map<string, Array<{ epoch: number; timestamp: string; rowIndex: number }>>();
    const rowHashes = new Set<string>();
    let minSubEpoch: number | null = null;
    let maxSubEpoch: number | null = null;
    let minDate: Date | null = null;
    let maxDate: Date | null = null;
    const uniqueStrategies = new Set<string>();

    // Parse and validate each data row
    for (let i = 0; i < dataLines.length; i++) {
      const rowIndex = i + 2; // +2 because line numbers start at 1 and we skip header
      const line = dataLines[i];

      if (!line.trim()) continue;

      const values = this.parseCSVLine(line);

      if (values.length !== headers.length) {
        issues.invalidData.push({
          row: rowIndex,
          issue: `Expected ${headers.length} columns, got ${values.length}`,
        });
        continue;
      }

      const [
        strategyId,
        epochStart,
        epochNumber,
        subEpochNumber,
        subEpochTimestamp,
        token0Reward,
        token1Reward,
        totalReward,
        liquidity0,
        liquidity1,
        token0Address,
        token1Address,
        token0UsdRate,
        token1UsdRate,
        targetPrice,
        eligible0,
        eligible1,
        token0RewardZoneBoundary,
        token1RewardZoneBoundary,
        token0Weighting,
        token1Weighting,
        token0Decimals,
        token1Decimals,
        order0ACompressed,
        order0BCompressed,
        order0A,
        order0B,
        order0Z,
        order1ACompressed,
        order1BCompressed,
        order1A,
        order1B,
        order1Z,
        lastEventTimestamp,
      ] = values;

      // Track unique strategies
      uniqueStrategies.add(strategyId);

      // Validate sub-epoch number
      const subEpochNum = parseInt(subEpochNumber);
      if (isNaN(subEpochNum)) {
        issues.invalidData.push({
          row: rowIndex,
          column: 'sub_epoch_number',
          value: subEpochNumber,
          issue: 'Invalid sub-epoch number',
        });
      } else {
        // Track sub-epochs per strategy
        if (!strategySubEpochs.has(strategyId)) {
          strategySubEpochs.set(strategyId, []);
        }
        strategySubEpochs.get(strategyId)!.push(subEpochNum);

        // Track timestamps per strategy for chronological validation
        if (!strategyTimestamps.has(strategyId)) {
          strategyTimestamps.set(strategyId, []);
        }
        strategyTimestamps.get(strategyId)!.push({
          subEpoch: subEpochNum,
          timestamp: subEpochTimestamp,
          rowIndex,
        });

        // Track min/max sub-epochs
        if (minSubEpoch === null || subEpochNum < minSubEpoch) minSubEpoch = subEpochNum;
        if (maxSubEpoch === null || subEpochNum > maxSubEpoch) maxSubEpoch = subEpochNum;
      }

      // Validate epoch number and track epoch timestamps
      const epochNum = parseInt(epochNumber);
      if (!isNaN(epochNum)) {
        // Track epoch timestamps per strategy for chronological validation
        if (!strategyEpochTimestamps.has(strategyId)) {
          strategyEpochTimestamps.set(strategyId, []);
        }
        strategyEpochTimestamps.get(strategyId)!.push({
          epoch: epochNum,
          timestamp: epochStart,
          rowIndex,
        });
      }

      // Check for duplicates (strategy + sub-epoch combination)
      const rowKey = `${strategyId}:${subEpochNumber}`;
      if (rowHashes.has(rowKey)) {
        issues.duplicates.push({
          row: rowIndex,
          issue: `Duplicate row for strategy ${strategyId} sub-epoch ${subEpochNumber}`,
        });
      } else {
        rowHashes.add(rowKey);
      }

      // Validate dates
      this.validateDate(epochStart, 'epoch_start', rowIndex, issues.invalidDates);
      this.validateDate(subEpochTimestamp, 'sub_epoch_timestamp', rowIndex, issues.invalidDates);
      this.validateDate(lastEventTimestamp, 'last_event_timestamp', rowIndex, issues.invalidDates);

      // Validate timestamp relationship: lastEventTimestamp should never be after subEpochTimestamp
      this.validateTimestampRelation(
        subEpochTimestamp,
        lastEventTimestamp,
        strategyId,
        subEpochNum,
        rowIndex,
        issues.invalidTimestampRelation,
      );

      // Update date range
      const epochStartDate = new Date(epochStart);
      const subEpochDate = new Date(subEpochTimestamp);
      if (!isNaN(epochStartDate.getTime())) {
        if (minDate === null || epochStartDate < minDate) minDate = epochStartDate;
        if (maxDate === null || epochStartDate > maxDate) maxDate = epochStartDate;
      }
      if (!isNaN(subEpochDate.getTime())) {
        if (minDate === null || subEpochDate < minDate) minDate = subEpochDate;
        if (maxDate === null || subEpochDate > maxDate) maxDate = subEpochDate;
      }

      // Validate numeric fields
      const numericFields = [
        { value: token0Reward, name: 'token0_reward' },
        { value: token1Reward, name: 'token1_reward' },
        { value: totalReward, name: 'total_reward' },
        { value: liquidity0, name: 'liquidity0' },
        { value: liquidity1, name: 'liquidity1' },
        { value: token0UsdRate, name: 'token0_usd_rate' },
        { value: token1UsdRate, name: 'token1_usd_rate' },
        { value: targetPrice, name: 'target_price' },
      ];

      for (const field of numericFields) {
        this.validateNumericField(field.value, field.name, rowIndex, issues.invalidData);
      }

      // Validate addresses
      this.validateAddress(token0Address, 'token0_address', rowIndex, issues.invalidData);
      this.validateAddress(token1Address, 'token1_address', rowIndex, issues.invalidData);
    }

    // Check for gaps in sub-epochs per strategy
    for (const [strategyId, subEpochs] of strategySubEpochs) {
      const sortedSubEpochs = [...subEpochs].sort((a, b) => a - b);
      const uniqueSubEpochs = [...new Set(sortedSubEpochs)];

      const gaps: number[] = [];
      for (let i = 1; i < uniqueSubEpochs.length; i++) {
        const current = uniqueSubEpochs[i];
        const previous = uniqueSubEpochs[i - 1];

        if (current - previous > 1) {
          for (let gap = previous + 1; gap < current; gap++) {
            gaps.push(gap);
          }
        }
      }

      if (gaps.length > 0) {
        issues.gaps.push({
          strategyId,
          missingSubEpochs: gaps,
        });
      }
    }

    // Check for chronological timestamp order per strategy (sub-epochs)
    for (const [strategyId, timestamps] of strategyTimestamps) {
      // Sort by sub-epoch number to check chronological order
      const sortedTimestamps = [...timestamps].sort((a, b) => a.subEpoch - b.subEpoch);

      for (let i = 1; i < sortedTimestamps.length; i++) {
        const current = sortedTimestamps[i];
        const previous = sortedTimestamps[i - 1];

        const currentDate = new Date(current.timestamp);
        const previousDate = new Date(previous.timestamp);

        // Skip if either date is invalid (will be caught by date validation)
        if (isNaN(currentDate.getTime()) || isNaN(previousDate.getTime())) {
          continue;
        }

        // Check if timestamp goes backwards (current should be >= previous)
        if (currentDate.getTime() < previousDate.getTime()) {
          issues.timestampOrder.push({
            strategyId,
            subEpoch: current.subEpoch,
            timestamp: current.timestamp,
            previousTimestamp: previous.timestamp,
            issue: `Sub-epoch ${current.subEpoch} timestamp (${current.timestamp}) is before sub-epoch ${previous.subEpoch} timestamp (${previous.timestamp})`,
          });
        }
      }
    }

    // Check for chronological timestamp order per strategy (epochs)
    // This validates that ALL timestamps in epoch N+1 are >= ALL timestamps in epoch N
    for (const [strategyId, epochTimestamps] of strategyEpochTimestamps) {
      // Group timestamps by epoch
      const epochGroups = new Map<number, string[]>();
      for (const item of epochTimestamps) {
        if (!epochGroups.has(item.epoch)) {
          epochGroups.set(item.epoch, []);
        }
        epochGroups.get(item.epoch)!.push(item.timestamp);
      }

      // Sort epochs
      const sortedEpochs = Array.from(epochGroups.keys()).sort((a, b) => a - b);

      // Check that all timestamps in epoch N+1 are >= all timestamps in epoch N
      for (let i = 1; i < sortedEpochs.length; i++) {
        const currentEpoch = sortedEpochs[i];
        const previousEpoch = sortedEpochs[i - 1];

        const currentEpochTimestamps = epochGroups.get(currentEpoch)!;
        const previousEpochTimestamps = epochGroups.get(previousEpoch)!;

        // Find min timestamp in current epoch and max timestamp in previous epoch
        let minCurrentTime = Number.MAX_VALUE;
        let maxPreviousTime = Number.MIN_VALUE;
        let minCurrentTimestamp = '';
        let maxPreviousTimestamp = '';

        for (const timestamp of currentEpochTimestamps) {
          const time = new Date(timestamp).getTime();
          if (!isNaN(time) && time < minCurrentTime) {
            minCurrentTime = time;
            minCurrentTimestamp = timestamp;
          }
        }

        for (const timestamp of previousEpochTimestamps) {
          const time = new Date(timestamp).getTime();
          if (!isNaN(time) && time > maxPreviousTime) {
            maxPreviousTime = time;
            maxPreviousTimestamp = timestamp;
          }
        }

        // Check if any timestamp in current epoch is before any timestamp in previous epoch
        if (minCurrentTime < maxPreviousTime) {
          issues.timestampOrder.push({
            strategyId,
            subEpoch: currentEpoch, // Using subEpoch field for epoch number for consistency
            timestamp: minCurrentTimestamp,
            previousTimestamp: maxPreviousTimestamp,
            issue: `Epoch ${currentEpoch} has timestamp (${minCurrentTimestamp}) that is before a timestamp in epoch ${previousEpoch} (${maxPreviousTimestamp}). All timestamps in epoch ${currentEpoch} must be >= all timestamps in epoch ${previousEpoch}`,
          });
        }
      }
    }

    // Generate recommendations
    if (issues.gaps.length > 0) {
      recommendations.push('Check data integrity for strategies with missing sub-epochs');
    }
    if (issues.duplicates.length > 0) {
      recommendations.push('Review duplicate detection logic in data processing');
    }
    if (issues.invalidDates.length > 0) {
      recommendations.push('Verify timestamp processing and date formatting');
    }
    if (issues.invalidData.length > 0) {
      recommendations.push('Validate numeric field processing and data types');
    }
    if (issues.timestampOrder.length > 0) {
      recommendations.push('Check timestamp chronological ordering for sub-epochs');
    }
    if (issues.invalidTimestampRelation.length > 0) {
      recommendations.push('Review timestamp relationship: lastEventTimestamp should not be after subEpochTimestamp');
    }

    const totalIssues =
      issues.gaps.length +
      issues.duplicates.length +
      issues.invalidData.length +
      issues.invalidDates.length +
      issues.timestampOrder.length +
      issues.invalidTimestampRelation.length;

    const statistics: ValidationStatistics = {
      totalRows: dataLines.length,
      dateRange: { start: minDate, end: maxDate },
      uniqueStrategies: uniqueStrategies.size,
      subEpochRange: { min: minSubEpoch, max: maxSubEpoch },
      completenessPercentage: Math.round(((dataLines.length - totalIssues) / dataLines.length) * 100),
    };

    return {
      isValid: totalIssues === 0,
      statistics,
      issues,
      recommendations,
    };
  }

  private parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current); // Add final value
    return values;
  }

  private validateDate(dateStr: string, fieldName: string, row: number, issues: ValidationIssue[]) {
    if (!dateStr || dateStr === 'null' || dateStr === 'undefined') {
      issues.push({
        row,
        column: fieldName,
        value: dateStr,
        issue: 'Date is null or undefined',
      });
      return;
    }

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      issues.push({
        row,
        column: fieldName,
        value: dateStr,
        issue: 'Invalid date format',
      });
      return;
    }

    // Check for epoch 0 (1970-01-01)
    if (date.getFullYear() === 1970 && date.getMonth() === 0 && date.getDate() === 1) {
      issues.push({
        row,
        column: fieldName,
        value: dateStr,
        issue: 'Date is epoch 0 (1970-01-01)',
      });
    }
  }

  private validateNumericField(value: string, fieldName: string, row: number, issues: ValidationIssue[]) {
    if (!value || value === 'null' || value === 'undefined' || value === 'NaN' || value.toLowerCase() === 'error') {
      issues.push({
        row,
        column: fieldName,
        value,
        issue: 'Value is null, undefined, NaN, or error',
      });
      return;
    }

    // Try to parse as number
    const num = parseFloat(value);
    if (isNaN(num)) {
      issues.push({
        row,
        column: fieldName,
        value,
        issue: 'Invalid numeric value',
      });
    }
  }

  private validateAddress(address: string, fieldName: string, row: number, issues: ValidationIssue[]) {
    if (!address || address === 'null' || address === 'undefined') {
      issues.push({
        row,
        column: fieldName,
        value: address,
        issue: 'Address is null or undefined',
      });
      return;
    }

    if (address.length === 0) {
      issues.push({
        row,
        column: fieldName,
        value: address,
        issue: 'Address is empty',
      });
    }
  }

  private validateTimestampRelation(
    subEpochTimestamp: string,
    lastEventTimestamp: string,
    strategyId: string,
    subEpochNum: number,
    row: number,
    issues: Array<{
      row: number;
      strategyId: string;
      subEpoch: number;
      subEpochTimestamp: string;
      lastEventTimestamp: string;
      issue: string;
    }>,
  ) {
    // Skip validation if either timestamp is null/undefined/invalid
    if (
      !subEpochTimestamp ||
      !lastEventTimestamp ||
      subEpochTimestamp === 'null' ||
      subEpochTimestamp === 'undefined' ||
      lastEventTimestamp === 'null' ||
      lastEventTimestamp === 'undefined'
    ) {
      return;
    }

    const subEpochDate = new Date(subEpochTimestamp);
    const lastEventDate = new Date(lastEventTimestamp);

    // Skip if either date is invalid (will be caught by date validation)
    if (isNaN(subEpochDate.getTime()) || isNaN(lastEventDate.getTime())) {
      return;
    }

    // Check if lastEventTimestamp is after subEpochTimestamp
    if (lastEventDate.getTime() > subEpochDate.getTime()) {
      issues.push({
        row,
        strategyId,
        subEpoch: subEpochNum,
        subEpochTimestamp,
        lastEventTimestamp,
        issue: `LastEvent timestamp is after SubEpoch timestamp`,
      });
    }
  }

  private logValidationResults(result: ValidationResult) {
    this.log('📋 Validation Results:');
    this.log(`   • Total rows: ${result.statistics.totalRows.toLocaleString()}`);

    if (result.statistics.dateRange.start && result.statistics.dateRange.end) {
      this.log(
        `   • Date range: ${result.statistics.dateRange.start.toISOString().split('T')[0]} to ${
          result.statistics.dateRange.end.toISOString().split('T')[0]
        }`,
      );
    }

    this.log(`   • Unique strategies: ${result.statistics.uniqueStrategies}`);

    if (result.statistics.subEpochRange.min !== null && result.statistics.subEpochRange.max !== null) {
      this.log(`   • Sub-epoch range: ${result.statistics.subEpochRange.min} - ${result.statistics.subEpochRange.max}`);
    }

    this.log(`   • Data completeness: ${result.statistics.completenessPercentage}%`);

    const totalIssues =
      result.issues.gaps.length +
      result.issues.duplicates.length +
      result.issues.invalidData.length +
      result.issues.invalidDates.length +
      result.issues.timestampOrder.length +
      result.issues.invalidTimestampRelation.length;

    if (result.isValid) {
      this.log('✅ Validation passed! No issues found.');
    } else {
      this.log(`❌ Validation failed! Found ${totalIssues} issue(s):`);

      if (result.issues.gaps.length > 0) {
        this.log(`   • ${result.issues.gaps.length} strategies with sub-epoch gaps:`);
        result.issues.gaps.slice(0, 5).forEach((gap) => {
          this.log(
            `     - Strategy ${gap.strategyId}: missing sub-epochs ${gap.missingSubEpochs.slice(0, 10).join(', ')}${
              gap.missingSubEpochs.length > 10 ? '...' : ''
            }`,
          );
        });
        if (result.issues.gaps.length > 5) {
          this.log(`     - ... and ${result.issues.gaps.length - 5} more strategies`);
        }
      }

      if (result.issues.duplicates.length > 0) {
        this.log(`   • ${result.issues.duplicates.length} duplicate rows:`);
        result.issues.duplicates.slice(0, 5).forEach((dup) => {
          this.log(`     - Row ${dup.row}: ${dup.issue}`);
        });
        if (result.issues.duplicates.length > 5) {
          this.log(`     - ... and ${result.issues.duplicates.length - 5} more duplicates`);
        }
      }

      if (result.issues.invalidData.length > 0) {
        this.log(`   • ${result.issues.invalidData.length} invalid data entries:`);
        result.issues.invalidData.slice(0, 5).forEach((invalid) => {
          this.log(`     - Row ${invalid.row}${invalid.column ? ` (${invalid.column})` : ''}: ${invalid.issue}`);
        });
        if (result.issues.invalidData.length > 5) {
          this.log(`     - ... and ${result.issues.invalidData.length - 5} more invalid entries`);
        }
      }

      if (result.issues.invalidDates.length > 0) {
        this.log(`   • ${result.issues.invalidDates.length} invalid dates:`);
        result.issues.invalidDates.slice(0, 5).forEach((date) => {
          this.log(`     - Row ${date.row} (${date.column}): ${date.issue}`);
        });
        if (result.issues.invalidDates.length > 5) {
          this.log(`     - ... and ${result.issues.invalidDates.length - 5} more invalid dates`);
        }
      }

      if (result.issues.timestampOrder.length > 0) {
        this.log(`   • ${result.issues.timestampOrder.length} timestamp ordering issues:`);
        result.issues.timestampOrder.slice(0, 5).forEach((timestamp) => {
          this.log(`     - Strategy ${timestamp.strategyId}: ${timestamp.issue}`);
        });
        if (result.issues.timestampOrder.length > 5) {
          this.log(`     - ... and ${result.issues.timestampOrder.length - 5} more timestamp issues`);
        }
      }

      if (result.issues.invalidTimestampRelation.length > 0) {
        this.log(`   • ${result.issues.invalidTimestampRelation.length} invalid timestamp relation issues:`);
        this.log('     ⚠️  LastEvent timestamp cannot be after SubEpoch timestamp');
        this.log('');
        result.issues.invalidTimestampRelation.slice(0, 5).forEach((relation) => {
          const subEpochDate = new Date(relation.subEpochTimestamp);
          const lastEventDate = new Date(relation.lastEventTimestamp);
          const diffMs = lastEventDate.getTime() - subEpochDate.getTime();
          const diffMinutes = Math.round(diffMs / (1000 * 60));
          const diffHours = Math.round(diffMs / (1000 * 60 * 60));

          let timeDiff = '';
          if (diffMs < 60000) {
            timeDiff = `${Math.round(diffMs / 1000)} seconds`;
          } else if (diffMs < 3600000) {
            timeDiff = `${diffMinutes} minutes`;
          } else {
            timeDiff = `${diffHours} hours`;
          }

          this.log(`     📍 Row ${relation.row}:`);
          this.log(`        Strategy ID:        ${relation.strategyId}`);
          this.log(`        Sub-Epoch:          ${relation.subEpoch}`);
          this.log(`        SubEpoch Time:      ${relation.subEpochTimestamp}`);
          this.log(`        LastEvent Time:     ${relation.lastEventTimestamp}`);
          this.log(`        ❌ Problem:         LastEvent is ${timeDiff} AFTER SubEpoch (invalid)`);
          this.log('');
        });
        if (result.issues.invalidTimestampRelation.length > 5) {
          this.log(`     ... and ${result.issues.invalidTimestampRelation.length - 5} more timestamp relation issues`);
        }
      }

      if (result.recommendations.length > 0) {
        this.log('\n💡 Recommendations:');
        result.recommendations.forEach((rec) => {
          this.log(`   • ${rec}`);
        });
      }
    }
  }
}

function parseArgs(): CsvGeneratorOptions {
  const args = process.argv.slice(2);
  const options: CsvGeneratorOptions = {
    campaignId: '',
    keepOnFailure: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--campaign-id':
        if (!nextArg) throw new Error('--campaign-id requires a value');
        options.campaignId = nextArg;
        i++;
        break;
      case '--from-epoch':
        if (!nextArg) throw new Error('--from-epoch requires a value');
        options.fromEpoch = parseInt(nextArg);
        i++;
        break;
      case '--to-epoch':
        if (!nextArg) throw new Error('--to-epoch requires a value');
        options.toEpoch = parseInt(nextArg);
        i++;
        break;
      case '--from-sub-epoch':
        if (!nextArg) throw new Error('--from-sub-epoch requires a value');
        options.fromSubEpoch = parseInt(nextArg);
        i++;
        break;
      case '--to-sub-epoch':
        if (!nextArg) throw new Error('--to-sub-epoch requires a value');
        options.toSubEpoch = parseInt(nextArg);
        i++;
        break;
      case '--output':
        if (!nextArg) throw new Error('--output requires a value');
        options.outputPath = nextArg;
        i++;
        break;
      case '--keep-on-failure':
        options.keepOnFailure = true;
        break;
      case '--help':
        console.log(`
CSV Generator with Validation

Usage: npm run generate-csv -- [options]

Options:
  --campaign-id <id>        Campaign ID to generate CSV for (required)
  --from-epoch <number>     Starting epoch number (optional)
  --to-epoch <number>       Ending epoch number (optional)
  --from-sub-epoch <number> Starting sub-epoch number (optional)
  --to-sub-epoch <number>   Ending sub-epoch number (optional)
  --output <path>           Output file path (optional, defaults to timestamped filename)
  --keep-on-failure         Keep CSV file even if validation fails (optional, default: delete on failure)
  --help                    Show this help message

Examples:
  npm run generate-csv -- --campaign-id "0x123..." --output "./rewards.csv"
  npm run generate-csv -- --campaign-id "0x123..." --from-epoch 100 --to-epoch 200
  npm run generate-csv -- --campaign-id "0x123..." --from-sub-epoch 1000 --to-sub-epoch 2000 --keep-on-failure
        `);
        process.exit(0);
        break;
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unknown argument: ${arg}`);
        }
        break;
    }
  }

  if (!options.campaignId) {
    throw new Error('--campaign-id is required. Use --help for usage information.');
  }

  return options;
}

async function main() {
  console.log('🚀 Starting CSV generator with validation...');
  console.log('📅 Started at:', new Date().toISOString());

  try {
    // Parse command line arguments
    const options = parseArgs();
    console.log('⚙️ Options:', JSON.stringify(options, null, 2));

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
      entities: [SubEpoch],
      synchronize: false,
      logging: false,
    });

    await dataSource.initialize();
    console.log('✅ Database connected successfully');

    // Generate and validate CSV
    const generator = new CsvGeneratorWithValidation(dataSource);
    const result = await generator.generateAndValidateCSV(options);

    // Exit with appropriate code
    if (result.isValid) {
      console.log('✅ Process completed successfully');
      process.exit(0);
    } else {
      console.log('❌ Process completed with validation errors');
      process.exit(2);
    }
  } catch (error) {
    console.error('❌ Process failed:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    console.log('✅ Process completed at:', new Date().toISOString());
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
if (require.main === module) {
  main();
}
