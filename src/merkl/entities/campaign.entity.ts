import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Index,
  Unique,
  JoinColumn,
} from 'typeorm';
import { Pair } from '../../pair/pair.entity';
import { BlockchainType, ExchangeId } from '../../deployment/deployment.service';

@Entity({ name: 'merkl_campaigns' })
@Unique(['blockchainType', 'exchangeId', 'pairId'])
export class Campaign {
  @PrimaryGeneratedColumn()
  id: string;

  @Column()
  @Index()
  blockchainType: BlockchainType;

  @Column()
  @Index()
  exchangeId: ExchangeId;

  @Column()
  @Index()
  pairId: number;

  @ManyToOne(() => Pair, { eager: true })
  @JoinColumn({ name: 'pairId' })
  pair: Pair;

  @Column({ type: 'decimal', precision: 78, scale: 0 })
  rewardAmount: string;

  @Column()
  rewardTokenAddress: string;

  @Column()
  @Index()
  startDate: number; // Unix timestamp in seconds

  @Column()
  @Index()
  endDate: number; // Unix timestamp in seconds

  @Column()
  opportunityName: string;

  @Column({ default: true })
  @Index()
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
