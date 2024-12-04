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
import { BlockchainType, ExchangeId } from '../../deployment/deployment.service';

@Entity({ name: 'arbitrage-executed-events' })
@Unique(['transactionIndex', 'transactionHash', 'logIndex'])
export class ArbitrageExecutedEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: BlockchainType })
  @Index()
  blockchainType: BlockchainType;

  @Column({ type: 'enum', enum: ExchangeId })
  @Index()
  exchangeId: ExchangeId;

  @Index()
  @ManyToOne(() => Block, { eager: true })
  block: Block;

  @Column()
  @Index()
  caller: string;

  @Column('simple-array')
  platformIds: number[];

  @Column('simple-array')
  tokenPath: string[];

  @Column('simple-array')
  sourceTokens: string[];

  @Column('simple-array')
  sourceAmounts: string[];

  @Column('simple-array')
  protocolAmounts: string[];

  @Column('simple-array')
  rewardAmounts: string[];

  @Column()
  transactionIndex: number;

  @Column()
  transactionHash: string;

  @Column()
  @Index()
  timestamp: Date;

  @Column()
  logIndex: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}