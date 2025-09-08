import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Index,
  JoinColumn,
} from 'typeorm';
import { Pair } from '../../pair/pair.entity';
import { BlockchainType, ExchangeId } from '../../deployment/deployment.service';

@Entity({ name: 'merkl_campaigns' })
export class Campaign {
  @PrimaryGeneratedColumn()
  id: number;

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

  @Column({ type: 'timestamp' })
  @Index()
  startDate: Date; // Campaign start date

  @Column({ type: 'timestamp' })
  @Index()
  endDate: Date; // Campaign end date

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
