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

@Entity({ name: 'vortex-tokens-traded-events' })
@Unique(['transactionIndex', 'transactionHash', 'logIndex'])
export class VortexTokensTradedEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  blockchainType: BlockchainType;

  @Column()
  @Index()
  exchangeId: ExchangeId;

  @Index()
  @ManyToOne(() => Block, { eager: true })
  block: Block;

  @Column()
  @Index()
  caller: string;

  @Column()
  @Index()
  token: string;

  @Column({ type: 'text' })
  sourceAmount: string;

  @Column({ type: 'text' })
  targetAmount: string;

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
