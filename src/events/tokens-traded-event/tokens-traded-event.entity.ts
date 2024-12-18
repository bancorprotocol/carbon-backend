import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  Unique,
  PrimaryColumn,
} from 'typeorm';
import { Block } from '../../block/block.entity';
import { Token } from '../../token/token.entity';
import { Pair } from '../../pair/pair.entity';
import { BlockchainType, ExchangeId } from '../../deployment/deployment.service';

@Entity({ name: 'tokens-traded-events' })
@Unique(['transactionIndex', 'transactionHash', 'logIndex', 'timestamp'])
@Index(['pair', 'blockchainType', 'exchangeId'])
@Index(['sourceToken', 'blockchainType', 'exchangeId'])
@Index(['targetToken', 'blockchainType', 'exchangeId'])
@Index(['trader', 'blockchainType', 'exchangeId'])
export class TokensTradedEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  blockchainType: BlockchainType;

  @Column()
  @Index()
  exchangeId: ExchangeId;

  @Index()
  @ManyToOne(() => Block, { eager: true })
  block: Block;

  @ManyToOne(() => Pair, { eager: true })
  @Index()
  pair: Pair;

  @ManyToOne(() => Token, { eager: true })
  @Index()
  sourceToken: Token;

  @ManyToOne(() => Token, { eager: true })
  @Index()
  targetToken: Token;

  @Column({ type: 'text' })
  @Index()
  trader: string;

  @Column({ type: 'text' })
  type: string;

  @Column({ type: 'text' })
  sourceAmount: string;

  @Column({ type: 'text' })
  targetAmount: string;

  @Column({ type: 'text' })
  tradingFeeAmount: string;

  @Column()
  byTargetAmount: boolean;

  @Column()
  @Index()
  transactionIndex: number;

  @Column({ type: 'text' })
  @Index()
  transactionHash: string;

  @Column({ type: 'text', nullable: true })
  @Index()
  callerId: string;

  @Column()
  @Index()
  logIndex: number;

  @PrimaryColumn('timestamp')
  @Index()
  timestamp: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
