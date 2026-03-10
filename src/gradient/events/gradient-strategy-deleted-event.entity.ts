import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryGeneratedColumn,
  Index,
  ManyToOne,
  Unique,
} from 'typeorm';
import { Pair } from '../../pair/pair.entity';
import { Block } from '../../block/block.entity';
import { Token } from '../../token/token.entity';
import { BlockchainType, ExchangeId } from '../../deployment/deployment.service';

@Entity({ name: 'gradient_strategy_deleted_events' })
@Unique(['transactionIndex', 'transactionHash', 'logIndex'])
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

  @ManyToOne(() => Pair, { eager: true })
  pair: Pair;

  @Index()
  @ManyToOne(() => Block, { eager: true })
  block: Block;

  @Column()
  transactionHash: string;

  @Column()
  transactionIndex: number;

  @Column()
  logIndex: number;

  @Column({ type: 'timestamp', nullable: true })
  @Index()
  timestamp: Date;

  @ManyToOne(() => Token, { eager: true })
  token0: Token;

  @ManyToOne(() => Token, { eager: true })
  token1: Token;

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
