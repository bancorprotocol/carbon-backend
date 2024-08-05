import { Entity, Column, PrimaryGeneratedColumn, Index, Unique } from 'typeorm';
import { BlockchainType, ExchangeId } from '../deployment/deployment.service';

@Entity({ name: 'activities' })
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
export class Activity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: BlockchainType })
  @Index()
  blockchainType: BlockchainType;

  @Column({ type: 'enum', enum: ExchangeId })
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
}
