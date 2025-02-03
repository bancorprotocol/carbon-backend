import { Entity, Column, PrimaryGeneratedColumn, Index, Unique, ManyToOne, JoinColumn } from 'typeorm';
import { BlockchainType, ExchangeId } from '../deployment/deployment.service';
import { Token } from '../token/token.entity';

@Entity({ name: 'activities-v2' })
@Unique([
  'blockchainType',
  'exchangeId',
  'strategyId',
  'action',
  'baseQuote',
  'baseSellToken',
  'baseSellTokenAddress',
  'quoteBuyToken',
  'quoteBuyTokenAddress',
  'buyBudget',
  'sellBudget',
  'buyPriceA',
  'buyPriceMarg',
  'buyPriceB',
  'sellPriceA',
  'sellPriceMarg',
  'sellPriceB',
  'timestamp',
  'txhash',
  'blockNumber',
])
export class ActivityV2 {
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

  @Column({ nullable: true })
  creationWallet: string;

  @Column({ nullable: true })
  @Index()
  currentOwner: string;

  @Column({ nullable: true })
  @Index()
  oldOwner: string;

  @Column({ nullable: true })
  newOwner: string;

  @Column()
  @Index()
  action: string;

  @Column()
  baseQuote: string;

  @Column()
  baseSellToken: string;

  @Column()
  @Index()
  baseSellTokenAddress: string;

  @Column()
  quoteBuyToken: string;

  @Column()
  @Index()
  quoteBuyTokenAddress: string;

  @Column()
  buyBudget: string;

  @Column()
  sellBudget: string;

  @Column({ nullable: true })
  buyBudgetChange: string;

  @Column({ nullable: true })
  sellBudgetChange: string;

  @Column()
  buyPriceA: string;

  @Column()
  buyPriceMarg: string;

  @Column()
  buyPriceB: string;

  @Column()
  sellPriceA: string;

  @Column()
  sellPriceMarg: string;

  @Column()
  sellPriceB: string;

  @Column({ nullable: true })
  buyPriceADelta: string;

  @Column({ nullable: true })
  buyPriceMargDelta: string;

  @Column({ nullable: true })
  buyPriceBDelta: string;

  @Column({ nullable: true })
  sellPriceADelta: string;

  @Column({ nullable: true })
  sellPriceMargDelta: string;

  @Column({ nullable: true })
  sellPriceBDelta: string;

  @Column({ nullable: true })
  strategySold: string;

  @Column({ nullable: true })
  tokenSold: string;

  @Column({ nullable: true })
  strategyBought: string;

  @Column({ nullable: true })
  tokenBought: string;

  @Column({ nullable: true })
  avgPrice: string;

  @Column()
  @Index()
  timestamp: Date;

  @Column()
  txhash: string;

  @Column()
  @Index()
  blockNumber: number;

  @Column()
  @Index()
  logIndex: number;

  @Column()
  @Index()
  transactionIndex: number;

  @Column('jsonb', { nullable: true })
  order0: string;

  @Column('jsonb', { nullable: true })
  order1: string;

  @ManyToOne(() => Token)
  @JoinColumn({ name: 'token0Id' })
  token0: Token;

  @Column({ nullable: true })
  token0Id: number;

  @ManyToOne(() => Token)
  @JoinColumn({ name: 'token1Id' })
  token1: Token;

  @Column({ nullable: true })
  token1Id: number;
}
