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
import { Pair } from '../../pair/pair.entity';
import { Block } from '../../block/block.entity';
import { Token } from '../../token/token.entity';
import { Strategy } from '../../strategy/strategy.entity';

@Entity({ name: 'voucher-transfer-events' })
@Unique('voucher-transfer-events-transactionIndex_transactionHash_logIndex', [
  'transactionIndex',
  'transactionHash',
  'logIndex',
])
export class VoucherTransferEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Strategy, { eager: true })
  strategy: Strategy;

  @Index()
  @ManyToOne(() => Block, { eager: true })
  block: Block;

  @Column()
  timestamp: Date;

  @Column()
  from: string;

  @Column()
  to: string;

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
