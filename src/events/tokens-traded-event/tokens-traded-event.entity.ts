import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  Unique,
} from 'typeorm';
import { Block } from '../../block/block.entity';
import { Token } from '../../token/token.entity';
import { Pair } from '../../pair/pair.entity';

@Entity({ name: 'tokens-traded-events' })
@Unique('tokens-traded-events-transactionIndex_transactionHash_logIndex', [
  'transactionIndex',
  'transactionHash',
  'logIndex',
])
export class TokensTradedEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @ManyToOne(() => Block, { eager: true })
  block: Block;

  @ManyToOne(() => Pair, { eager: true })
  pair: Pair;

  @ManyToOne(() => Token, { eager: true })
  sourceToken: Token;

  @ManyToOne(() => Token, { eager: true })
  targetToken: Token;

  @Column()
  trader: string;

  @Column()
  type: string;

  @Column()
  sourceAmount: string;

  @Column()
  targetAmount: string;

  @Column()
  tradingFeeAmount: string;

  @Column()
  byTargetAmount: boolean;

  @Column()
  transactionIndex: number;

  @Column()
  transactionHash: string;

  @Column({ nullable: true })
  @Index()
  callerId: string;

  @Column()
  logIndex: number;

  @Column()
  timestamp: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
