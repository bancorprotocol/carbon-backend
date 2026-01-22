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

/**
 * Strategy entity representing a Carbon DeFi strategy.
 *
 * IMPORTANT: All numeric values are stored in NORMALIZED format (human-readable).
 *
 * Liquidity values (liquidity0, liquidity1):
 * - Already divided by 10^decimals
 * - Example: 247,000 COTI is stored as "247000", not "247000000000000000000000"
 *
 * Rate values (lowestRate0, highestRate0, etc.):
 * - Already adjusted by 10^(decimals difference)
 * - Ready for display without further conversion
 *
 * This normalization is performed by processOrders() in activity.utils.ts.
 * See activity-v2.utilities.spec.ts for the contract tests that verify this format.
 *
 * DO NOT apply decimal conversions when reading these values.
 */
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

  @Column({ type: 'text', nullable: true })
  encodedOrder0: string;

  @Column({ type: 'text', nullable: true })
  encodedOrder1: string;

  @Column({ nullable: true })
  owner: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
