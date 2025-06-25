import { Entity, Column, PrimaryGeneratedColumn, Index, Unique } from 'typeorm';
import { BlockchainType, ExchangeId } from '../../deployment/deployment.service';

@Entity({ name: 'dex-screener-events-v2' })
@Unique(['blockchainType', 'exchangeId', 'blockNumber', 'txnId', 'txnIndex', 'eventIndex', 'eventType'])
export class DexScreenerEventV2 {
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
  blockNumber: number;

  @Column()
  blockTimestamp: Date;

  @Column()
  eventType: string; // 'swap', 'join', 'exit'

  @Column()
  txnId: string;

  @Column()
  txnIndex: number;

  @Column('decimal', { precision: 10, scale: 1 })
  eventIndex: number;

  @Column()
  maker: string;

  @Column()
  @Index()
  pairId: number;

  // Swap-specific fields (large amounts - use text)
  @Column('text', { nullable: true })
  asset0In: string;

  @Column('text', { nullable: true })
  asset1In: string;

  @Column('text', { nullable: true })
  asset0Out: string;

  @Column('text', { nullable: true })
  asset1Out: string;

  @Column('text', { nullable: true })
  priceNative: string;

  // Join/Exit-specific fields (large amounts - use text)
  @Column('text', { nullable: true })
  amount0: string;

  @Column('text', { nullable: true })
  amount1: string;

  // Reserve fields (large amounts - use text)
  @Column('text')
  reserves0: string;

  @Column('text')
  reserves1: string;
}
