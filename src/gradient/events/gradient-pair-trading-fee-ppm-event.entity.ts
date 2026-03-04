import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';
import { BlockchainType, ExchangeId } from '../../deployment/deployment.service';

@Entity({ name: 'gradient_pair_trading_fee_ppm_events' })
export class GradientPairTradingFeePPMEvent {
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
  blockNumber: number;

  @Column()
  token0: string;

  @Column()
  token1: string;

  @Column()
  prevFeePPM: number;

  @Column()
  newFeePPM: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
