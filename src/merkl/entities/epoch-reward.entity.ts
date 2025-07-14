import {
  Entity,
  Column,
  CreateDateColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Index,
  Unique,
  JoinColumn,
} from 'typeorm';
import { Campaign } from './campaign.entity';

@Entity({ name: 'merkl_epoch_rewards' })
@Unique(['campaignId', 'epochNumber', 'strategyId'])
export class EpochReward {
  @PrimaryGeneratedColumn()
  id: string;

  @Column()
  @Index()
  campaignId: string;

  @ManyToOne(() => Campaign, { eager: true })
  @JoinColumn({ name: 'campaignId' })
  campaign: Campaign;

  @Column()
  @Index()
  epochNumber: number;

  @Column()
  @Index()
  epochStartTimestamp: number;

  @Column()
  @Index()
  epochEndTimestamp: number;

  @Column()
  @Index()
  strategyId: string;

  @Column()
  @Index()
  owner: string;

  @Column({ type: 'decimal', precision: 78, scale: 0 })
  rewardAmount: string;

  @Column()
  reason: string; // epoch-{number}-{strategyId}

  @CreateDateColumn()
  calculatedAt: Date;
}
