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

@Entity({ name: 'protection-removed-events' })
@Unique(['transactionIndex', 'transactionHash', 'logIndex'])
export class ProtectionRemovedEvent {
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
  provider: string;

  @Column()
  poolToken: string;

  @Column()
  reserveToken: string;

  @Column()
  poolAmount: string;

  @Column()
  reserveAmount: string;

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
