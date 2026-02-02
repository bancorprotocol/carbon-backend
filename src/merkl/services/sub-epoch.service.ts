import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Decimal } from 'decimal.js';
import { SubEpoch } from '../entities/sub-epoch.entity';

// Type for service-level usage with Decimals
export interface SubEpochDecimal
  extends Omit<
    SubEpoch,
    | 'token0Reward'
    | 'token1Reward'
    | 'totalReward'
    | 'liquidity0'
    | 'liquidity1'
    | 'token0UsdRate'
    | 'token1UsdRate'
    | 'targetPrice'
    | 'eligible0'
    | 'eligible1'
    | 'token0RewardZoneBoundary'
    | 'token1RewardZoneBoundary'
    | 'token0Weighting'
    | 'token1Weighting'
    | 'order0A'
    | 'order0B'
    | 'order0Z'
    | 'order1A'
    | 'order1B'
    | 'order1Z'
  > {
  token0Reward: Decimal;
  token1Reward: Decimal;
  totalReward: Decimal;
  liquidity0: Decimal;
  liquidity1: Decimal;
  token0UsdRate: Decimal;
  token1UsdRate: Decimal;
  targetPrice: Decimal;
  eligible0: Decimal;
  eligible1: Decimal;
  token0RewardZoneBoundary: Decimal;
  token1RewardZoneBoundary: Decimal;
  token0Weighting: Decimal;
  token1Weighting: Decimal;
  order0A: Decimal;
  order0B: Decimal;
  order0Z: Decimal;
  order1A: Decimal;
  order1B: Decimal;
  order1Z: Decimal;
}

@Injectable()
export class SubEpochService {
  constructor(@InjectRepository(SubEpoch) public subEpochRepository: Repository<SubEpoch>) {}

  async saveSubEpochs(subEpochs: Partial<SubEpoch>[]): Promise<void> {
    if (subEpochs.length === 0) return;

    const campaignId = subEpochs[0].campaignId;

    // Get current max sub-epoch number for this campaign
    const { maxSubEpoch } = await this.subEpochRepository
      .createQueryBuilder('se')
      .select('MAX(se.subEpochNumber)', 'maxSubEpoch')
      .where('se.campaignId = :campaignId', { campaignId })
      .getRawOne();

    let nextSubEpochNumber = (maxSubEpoch || 0) + 1;

    // Group by timestamp
    const timestampGroups = new Map<number, Partial<SubEpoch>[]>();
    for (const subEpoch of subEpochs) {
      const timestamp = subEpoch.subEpochTimestamp.getTime();
      if (!timestampGroups.has(timestamp)) {
        timestampGroups.set(timestamp, []);
      }
      timestampGroups.get(timestamp).push(subEpoch);
    }

    // Sort timestamps chronologically to ensure chronological sub-epoch numbering
    const sortedTimestamps = Array.from(timestampGroups.keys()).sort((a, b) => a - b);

    // Process each timestamp group with UPSERT
    for (const timestamp of sortedTimestamps) {
      const strategiesAtTimestamp = timestampGroups.get(timestamp);

      // Check if any records already exist for this timestamp
      const existingRecords = await this.subEpochRepository
        .createQueryBuilder('se')
        .select(['se.strategyId', 'se.subEpochNumber'])
        .where('se.campaignId = :campaignId', { campaignId })
        .andWhere('se.subEpochTimestamp = :timestamp', { timestamp: new Date(timestamp) })
        .orderBy('se.strategyId', 'ASC') // Ensure deterministic ordering
        .getMany();

      const existingStrategies = new Map(existingRecords.map((r) => [r.strategyId, r.subEpochNumber]));

      // Assign sub-epoch numbers: use existing for conflicts, new for inserts
      let hasNewRecords = false;
      for (const subEpoch of strategiesAtTimestamp) {
        if (existingStrategies.has(subEpoch.strategyId)) {
          // Use existing subEpochNumber for UPSERT
          subEpoch.subEpochNumber = existingStrategies.get(subEpoch.strategyId);
        } else {
          // Assign new subEpochNumber for INSERT
          subEpoch.subEpochNumber = nextSubEpochNumber;
          hasNewRecords = true;
        }
      }

      // Only increment if we have new records
      if (hasNewRecords) {
        nextSubEpochNumber++;
      }

      // UPSERT in chunks using PostgreSQL ON CONFLICT
      const chunkSize = 1000;
      for (let i = 0; i < strategiesAtTimestamp.length; i += chunkSize) {
        const chunk = strategiesAtTimestamp.slice(i, i + chunkSize);
        await this.upsertSubEpochs(chunk);
      }
    }
  }

  private async upsertSubEpochs(subEpochs: Partial<SubEpoch>[]): Promise<void> {
    if (subEpochs.length === 0) return;

    // Build PostgreSQL UPSERT query
    const queryBuilder = this.subEpochRepository
      .createQueryBuilder()
      .insert()
      .into(SubEpoch)
      .values(subEpochs)
      .orUpdate(
        [
          'epoch_number',
          'epoch_start',
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
          'last_processed_block',
          'owner_address',
          'updated_at',
        ],
        ['strategy_id', 'campaign_id', 'sub_epoch_timestamp'],
      );

    await queryBuilder.execute();
  }

  // Convert strings back to Decimals for service use
  subEpochToDecimal(subEpoch: SubEpoch): SubEpochDecimal {
    return {
      ...subEpoch,
      token0Reward: new Decimal(subEpoch.token0Reward),
      token1Reward: new Decimal(subEpoch.token1Reward),
      totalReward: new Decimal(subEpoch.totalReward),
      liquidity0: new Decimal(subEpoch.liquidity0),
      liquidity1: new Decimal(subEpoch.liquidity1),
      token0UsdRate: new Decimal(subEpoch.token0UsdRate),
      token1UsdRate: new Decimal(subEpoch.token1UsdRate),
      targetPrice: new Decimal(subEpoch.targetPrice),
      eligible0: new Decimal(subEpoch.eligible0),
      eligible1: new Decimal(subEpoch.eligible1),
      token0RewardZoneBoundary: new Decimal(subEpoch.token0RewardZoneBoundary),
      token1RewardZoneBoundary: new Decimal(subEpoch.token1RewardZoneBoundary),
      token0Weighting: new Decimal(subEpoch.token0Weighting),
      token1Weighting: new Decimal(subEpoch.token1Weighting),
      order0A: new Decimal(subEpoch.order0A),
      order0B: new Decimal(subEpoch.order0B),
      order0Z: new Decimal(subEpoch.order0Z),
      order1A: new Decimal(subEpoch.order1A),
      order1B: new Decimal(subEpoch.order1B),
      order1Z: new Decimal(subEpoch.order1Z),
    };
  }

  async getTotalRewardsForCampaign(campaignId: number): Promise<Decimal> {
    const result = await this.subEpochRepository
      .createQueryBuilder('se')
      .select('SUM(CAST(se.totalReward AS DECIMAL))', 'total')
      .where('se.campaignId = :campaignId', { campaignId })
      .getRawOne();

    return new Decimal(result.total || '0');
  }

  /**
   * Get the highest processed epoch number for a campaign
   * This is used for epoch-based processing tracking instead of lastProcessedBlock
   */
  async getLastProcessedEpochNumber(campaignId: number): Promise<number> {
    const result = await this.subEpochRepository
      .createQueryBuilder('se')
      .select('MAX(se.epochNumber)', 'maxEpochNumber')
      .where('se.campaignId = :campaignId', { campaignId })
      .getRawOne();

    return result.maxEpochNumber ? Number(result.maxEpochNumber) : 0;
  }

  /**
   * Check if a specific epoch has been processed for a campaign
   */
  async isEpochProcessed(campaignId: number, epochNumber: number): Promise<boolean> {
    const count = await this.subEpochRepository
      .createQueryBuilder('se')
      .select('COUNT(*)', 'count')
      .where('se.campaignId = :campaignId', { campaignId })
      .andWhere('se.epochNumber = :epochNumber', { epochNumber })
      .getRawOne();

    return Number(count.count) > 0;
  }

  async getEpochRewards(
    campaignId: number,
    epochNumber?: number,
    startTimestamp?: number,
  ): Promise<{ epochNumber: number; strategyId: string; owner: string; totalReward: Decimal; epochEnd: Date }[]> {
    // Aggregate sub-epochs to get epoch totals grouped by epoch and strategy
    const queryBuilder = this.subEpochRepository
      .createQueryBuilder('se')
      .select('se.epochNumber', 'epochNumber')
      .addSelect('se.strategyId', 'strategyId')
      .addSelect('se.ownerAddress', 'owner')
      .addSelect('SUM(CAST(se.totalReward AS DECIMAL))', 'totalReward')
      .addSelect('MAX(se.subEpochTimestamp)', 'epochEnd') // Use the latest sub-epoch timestamp as epoch end
      .where('se.campaignId = :campaignId', { campaignId })
      .groupBy('se.epochNumber')
      .addGroupBy('se.strategyId')
      .addGroupBy('se.ownerAddress')
      .orderBy('se.epochNumber', 'ASC')
      .addOrderBy('se.strategyId', 'ASC')
      .addOrderBy('se.ownerAddress', 'ASC'); // Ensure deterministic ordering

    if (epochNumber !== undefined) {
      queryBuilder.andWhere('se.epochNumber = :epochNumber', { epochNumber });
    }

    if (startTimestamp !== undefined) {
      queryBuilder.andWhere('se.subEpochTimestamp >= :startTimestamp', {
        startTimestamp: new Date(startTimestamp * 1000),
      });
    }

    const result = await queryBuilder.getRawMany();

    return result.map((row) => ({
      epochNumber: row.epochNumber,
      strategyId: row.strategyId,
      owner: row.owner,
      totalReward: new Decimal(row.totalReward || 0),
      epochEnd: new Date(row.epochEnd),
    }));
  }
}
