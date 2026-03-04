import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryGeneratedColumn,
  Index,
  Unique,
} from 'typeorm';
import { BlockchainType, ExchangeId } from '../deployment/deployment.service';

@Entity({ name: 'gradient_strategies' })
@Unique(['blockchainType', 'exchangeId', 'strategyId'])
export class GradientStrategy {
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
  strategyId: string;

  @Column()
  token0: string;

  @Column()
  token1: string;

  @Column({ nullable: true })
  owner: string;

  @Column()
  order0Liquidity: string;

  @Column()
  order0InitialPrice: string;

  @Column()
  order0TradingStartTime: number;

  @Column()
  order0Expiry: number;

  @Column()
  order0MultiFactor: string;

  @Column()
  order0GradientType: string;

  @Column()
  order1Liquidity: string;

  @Column()
  order1InitialPrice: string;

  @Column()
  order1TradingStartTime: number;

  @Column()
  order1Expiry: number;

  @Column()
  order1MultiFactor: string;

  @Column()
  order1GradientType: string;

  @Column()
  blockNumber: number;

  @Column({ default: false })
  deleted: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
