import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, Unique } from 'typeorm';
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
  @PrimaryColumn()
  id: string;

  @ManyToOne(() => Pair, { eager: true })
  pair: Pair;

  @Index()
  @ManyToOne(() => Block, { eager: true })
  block: Block;

  @Column()
  @Index()
  timestamp: Date;

  @Column()
  owner: string;

  @Index()
  @ManyToOne(() => Token, { eager: true })
  token0: Token;

  @Index()
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
