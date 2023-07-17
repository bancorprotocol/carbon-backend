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
import { Pair } from '../../pair/pair.entity';
import { Block } from '../../block/block.entity';
import { Token } from 'src/token/token.entity';

@Entity({ name: 'strategy-created-events' })
@Unique('strategy-created-events-transactionIndex_transactionHash_logIndex', [
  'transactionIndex',
  'transactionHash',
  'logIndex',
])
export class StrategyCreatedEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Pair)
  pair: Pair;

  @Index()
  @ManyToOne(() => Block)
  block: Block;

  @Column()
  owner: string;

  @ManyToOne(() => Token)
  token0: Token;

  @ManyToOne(() => Token)
  token1: Token;

  @Column()
  y0: string;

  @Column()
  z0: string;

  @Column()
  A0: string;

  @Column()
  B0: string;

  @Column()
  y1: string;

  @Column()
  z1: string;

  @Column()
  A1: string;

  @Column()
  B1: string;

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
