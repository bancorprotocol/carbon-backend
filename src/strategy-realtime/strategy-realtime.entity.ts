import { Entity, Column, CreateDateColumn, UpdateDateColumn, PrimaryGeneratedColumn, Index, Unique } from 'typeorm';
import { BlockchainType, ExchangeId } from '../deployment/deployment.service';

@Entity({ name: 'strategy-realtime' })
@Unique(['blockchainType', 'exchangeId', 'strategyId'])
export class StrategyRealtime {
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
  strategyId: string;

  @Column()
  owner: string;

  @Column()
  token0Address: string;

  @Column()
  token1Address: string;

  @Column()
  liquidity0: string;

  @Column()
  lowestRate0: string;

  @Column()
  highestRate0: string;

  @Column()
  marginalRate0: string;

  @Column()
  liquidity1: string;

  @Column()
  lowestRate1: string;

  @Column()
  highestRate1: string;

  @Column()
  marginalRate1: string;

  @Column({ type: 'text', nullable: true })
  encodedOrder0: string;

  @Column({ type: 'text', nullable: true })
  encodedOrder1: string;

  @Column({ default: false })
  deleted: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
