import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryGeneratedColumn,
  Index,
  Unique,
} from 'typeorm';
import { BlockchainType, ExchangeId } from '../../deployment/deployment.service';

@Entity({ name: 'gradient_strategy_deleted_events' })
@Unique(['blockchainType', 'exchangeId', 'transactionHash', 'logIndex'])
export class GradientStrategyDeletedEvent {
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
  @Index()
  blockNumber: number;

  @Column()
  transactionHash: string;

  @Column()
  transactionIndex: number;

  @Column()
  logIndex: number;

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
