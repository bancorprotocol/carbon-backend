import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  Unique,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Pair } from '../../pair/pair.entity';
import { Block } from '../../block/block.entity';
import { Token } from '../../token/token.entity';
import { Strategy } from '../../strategy/strategy.entity';

@Entity({ name: 'strategy-updated-events' })
@Unique('strategy-updated-events-transactionIndex_transactionHash_logIndex', [
  'transactionIndex',
  'transactionHash',
  'logIndex',
])
export class StrategyUpdatedEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @ManyToOne(() => Strategy, { eager: true })
  strategy: Strategy;

  @ManyToOne(() => Pair, { eager: true })
  pair: Pair;

  @Index()
  @ManyToOne(() => Block, { eager: true })
  block: Block;

  @Column()
  @Index()
  timestamp: Date;

  @Column()
  reason: number;

  @ManyToOne(() => Token, { eager: true })
  token0: Token;

  @ManyToOne(() => Token, { eager: true })
  token1: Token;

  @Column()
  order0: string;

  @Column()
  order1: string;

  @Column()
  transactionIndex: number;

  @Column()
  transactionHash: string;

  @Column()
  logIndex: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
