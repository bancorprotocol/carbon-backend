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
import { Block } from '../../block/block.entity';
import { BlockchainType, ExchangeId } from '../../deployment/deployment.service';

@Entity({ name: 'trading-fee-ppm-updated-events' })
@Unique(['transactionIndex', 'transactionHash', 'logIndex'])
export class TradingFeePpmUpdatedEvent {
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
