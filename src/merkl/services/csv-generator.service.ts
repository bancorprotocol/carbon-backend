import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createWriteStream } from 'fs';
import { SubEpoch } from '../entities/sub-epoch.entity';

export interface CsvGeneratorOptions {
  campaignId: string;
  fromEpoch?: number;
  toEpoch?: number;
  fromSubEpoch?: number;
  toSubEpoch?: number;
  outputPath?: string;
}

@Injectable()
export class CsvGeneratorService {
  constructor(@InjectRepository(SubEpoch) private subEpochRepository: Repository<SubEpoch>) {}

  async generateCSV(options: CsvGeneratorOptions): Promise<string> {
    const outputPath = options.outputPath || `reward_breakdown_${options.campaignId}_${Date.now()}.csv`;

    // Stream directly from database
    const queryBuilder = this.subEpochRepository
      .createQueryBuilder('se')
      .where('se.campaignId = :campaignId', { campaignId: options.campaignId });

    if (options.fromEpoch) queryBuilder.andWhere('se.epochNumber >= :fromEpoch', { fromEpoch: options.fromEpoch });
    if (options.toEpoch) queryBuilder.andWhere('se.epochNumber <= :toEpoch', { toEpoch: options.toEpoch });
    if (options.fromSubEpoch)
      queryBuilder.andWhere('se.subEpochNumber >= :fromSubEpoch', { fromSubEpoch: options.fromSubEpoch });
    if (options.toSubEpoch)
      queryBuilder.andWhere('se.subEpochNumber <= :toSubEpoch', { toSubEpoch: options.toSubEpoch });

    queryBuilder.orderBy('se.subEpochNumber', 'ASC');

    const stream = createWriteStream(outputPath);

    // Write header
    stream.write(
      [
        'strategy_id',
        'epoch_start',
        'epoch_number',
        'sub_epoch_number',
        'sub_epoch_timestamp',
        'token0_reward',
        'token1_reward',
        'total_reward',
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
      ].join(',') + '\n',
    );

    // Stream results
    const results = await queryBuilder.stream();

    results.on('data', (subEpoch: SubEpoch) => {
      const row = [
        subEpoch.strategyId,
        subEpoch.epochStart.toISOString(),
        subEpoch.epochNumber,
        subEpoch.subEpochNumber,
        subEpoch.subEpochTimestamp.toISOString(),
        subEpoch.token0Reward,
        subEpoch.token1Reward,
        subEpoch.totalReward,
        subEpoch.liquidity0,
        subEpoch.liquidity1,
        subEpoch.token0Address,
        subEpoch.token1Address,
        subEpoch.token0UsdRate,
        subEpoch.token1UsdRate,
        subEpoch.targetPrice,
        subEpoch.eligible0,
        subEpoch.eligible1,
        subEpoch.token0RewardZoneBoundary,
        subEpoch.token1RewardZoneBoundary,
        subEpoch.token0Weighting,
        subEpoch.token1Weighting,
        subEpoch.token0Decimals,
        subEpoch.token1Decimals,
        subEpoch.order0ACompressed,
        subEpoch.order0BCompressed,
        subEpoch.order0A,
        subEpoch.order0B,
        subEpoch.order0Z,
        subEpoch.order1ACompressed,
        subEpoch.order1BCompressed,
        subEpoch.order1A,
        subEpoch.order1B,
        subEpoch.order1Z,
        subEpoch.lastEventTimestamp.toISOString(),
      ]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(',');

      stream.write(row + '\n');
    });

    return new Promise((resolve, reject) => {
      results.on('end', () => {
        stream.end();
        resolve(outputPath);
      });
      results.on('error', reject);
    });
  }
}
