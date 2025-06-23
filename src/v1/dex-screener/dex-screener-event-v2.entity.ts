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

  // Swap-specific fields
  @Column('decimal', { precision: 78, scale: 18, nullable: true })
  asset0In: string;

  @Column('decimal', { precision: 78, scale: 18, nullable: true })
  asset1In: string;

  @Column('decimal', { precision: 78, scale: 18, nullable: true })
  asset0Out: string;

  @Column('decimal', { precision: 78, scale: 18, nullable: true })
  asset1Out: string;

  @Column('decimal', { precision: 78, scale: 18, nullable: true })
  priceNative: string;

  // Join/Exit-specific fields
  @Column('decimal', { precision: 78, scale: 18, nullable: true })
  amount0: string;

  @Column('decimal', { precision: 78, scale: 18, nullable: true })
  amount1: string;

  // Reserve fields (common to all event types)
  @Column('decimal', { precision: 78, scale: 18 })
  reserves0: string;

  @Column('decimal', { precision: 78, scale: 18 })
  reserves1: string;
}
