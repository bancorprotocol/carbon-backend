import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('merkl_sub_epochs')
@Index(['campaignId', 'epochNumber'])
@Index(['campaignId', 'subEpochTimestamp'])
@Index(['campaignId', 'subEpochNumber'])
@Index(['strategyId', 'campaignId'])
@Index(['strategyId', 'campaignId', 'subEpochTimestamp'], { unique: true })
@Index(['strategyId', 'campaignId', 'subEpochNumber'], { unique: true })
export class SubEpoch {
  @PrimaryGeneratedColumn()
  id: number; // Auto-incrementing primary key

  @Column({ name: 'campaign_id' })
  campaignId: number;

  // Strategy and campaign identification
  @Column({ name: 'strategy_id' })
  strategyId: string;

  @Column({ name: 'epoch_number', type: 'int' })
  epochNumber: number;

  // Sub-epoch identification
  @Column({ name: 'sub_epoch_number', type: 'int' })
  subEpochNumber: number; // Chronological counter per campaign: 1, 2, 3, 4...

  @Column({ name: 'epoch_start', type: 'timestamp' })
  epochStart: Date;

  @Column({ name: 'sub_epoch_timestamp', type: 'timestamp' })
  subEpochTimestamp: Date;

  // Reward data (all strings for large decimal support)
  @Column({ name: 'token0_reward', type: 'text', default: '0' })
  token0Reward: string;

  @Column({ name: 'token1_reward', type: 'text', default: '0' })
  token1Reward: string;

  @Column({ name: 'total_reward', type: 'text', default: '0' })
  totalReward: string;

  // Strategy state at this sub-epoch time
  @Column({ name: 'liquidity0', type: 'text' })
  liquidity0: string;

  @Column({ name: 'liquidity1', type: 'text' })
  liquidity1: string;

  @Column({ name: 'token0_address' })
  token0Address: string;

  @Column({ name: 'token1_address' })
  token1Address: string;

  @Column({ name: 'token0_usd_rate', type: 'text' })
  token0UsdRate: string;

  @Column({ name: 'token1_usd_rate', type: 'text' })
  token1UsdRate: string;

  @Column({ name: 'target_price', type: 'text' })
  targetPrice: string;

  @Column({ name: 'eligible0', type: 'text' })
  eligible0: string;

  @Column({ name: 'eligible1', type: 'text' })
  eligible1: string;

  @Column({ name: 'token0_reward_zone_boundary', type: 'text' })
  token0RewardZoneBoundary: string;

  @Column({ name: 'token1_reward_zone_boundary', type: 'text' })
  token1RewardZoneBoundary: string;

  @Column({ name: 'token0_weighting', type: 'text' })
  token0Weighting: string;

  @Column({ name: 'token1_weighting', type: 'text' })
  token1Weighting: string;

  @Column({ name: 'token0_decimals', type: 'int' })
  token0Decimals: number;

  @Column({ name: 'token1_decimals', type: 'int' })
  token1Decimals: number;

  @Column({ name: 'order0_a_compressed' })
  order0ACompressed: string;

  @Column({ name: 'order0_b_compressed' })
  order0BCompressed: string;

  @Column({ name: 'order0_a', type: 'text' })
  order0A: string;

  @Column({ name: 'order0_b', type: 'text' })
  order0B: string;

  @Column({ name: 'order0_z', type: 'text' })
  order0Z: string;

  @Column({ name: 'order1_a_compressed' })
  order1ACompressed: string;

  @Column({ name: 'order1_b_compressed' })
  order1BCompressed: string;

  @Column({ name: 'order1_a', type: 'text' })
  order1A: string;

  @Column({ name: 'order1_b', type: 'text' })
  order1B: string;

  @Column({ name: 'order1_z', type: 'text' })
  order1Z: string;

  // Metadata
  @Column({ name: 'last_event_timestamp', type: 'timestamp' })
  lastEventTimestamp: Date;

  @Column({ name: 'last_processed_block', type: 'int' })
  lastProcessedBlock: number;

  @Column({ name: 'owner_address' })
  ownerAddress: string;

  // Standard timestamps
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
