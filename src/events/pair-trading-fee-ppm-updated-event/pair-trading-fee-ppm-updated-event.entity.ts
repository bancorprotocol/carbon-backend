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

@Entity({ name: 'pair-trading-fee-ppm-updated-events' })
@Unique('pair-trading-fee-ppm-updated-events-transactionIndex_transactionHash_logIndex', [
  'transactionIndex',
  'transactionHash',
  'logIndex',
])
export class PairTradingFeePpmUpdatedEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Pair, { eager: true })
  pair: Pair;

  @Index()
  @ManyToOne(() => Block, { eager: true })
  block: Block;

  @Column()
  timestamp: Date;

  @Column()
  prevFeePPM: number;

  @Column()
  newFeePPM: number;

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
