import { Pair } from '../pair/pair.entity';
import { Block } from '../block/block.entity';
import { Token } from '../token/token.entity';
import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Index,
  Unique,
} from 'typeorm';
import { BlockchainType, ExchangeId } from '../deployment/deployment.service';

@Entity({ name: 'strategies' })
@Unique(['blockchainType', 'exchangeId', 'strategyId'])
export class Strategy {
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

  @ManyToOne(() => Block, { eager: true })
  block: Block;

  @ManyToOne(() => Pair, { eager: true })
  pair: Pair;

  @ManyToOne(() => Token, { eager: true })
  token0: Token;

  @ManyToOne(() => Token, { eager: true })
  token1: Token;

  @Column({ default: false })
  deleted: boolean;

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
