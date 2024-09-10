import { Entity, Column, PrimaryGeneratedColumn, Index, Unique, PrimaryColumn } from 'typeorm';
import { BlockchainType, ExchangeId } from '../deployment/deployment.service';

@Entity('volume')
@Unique([
  'blockchainType',
  'exchangeId',
  'timestamp',
  'blockNumber',
  'transactionIndex',
  'feeSymbol',
  'feeAddress',
  'tradingFeeAmountReal',
  'tradingFeeAmountUsd',
  'targetSymbol',
  'targetAddress',
  'targetAmountReal',
  'targetAmountUsd',
])
@Index(['pairId', 'blockchainType', 'exchangeId'])
@Index(['targetAddress', 'blockchainType', 'exchangeId'])
@Index(['feeAddress', 'blockchainType', 'exchangeId'])
export class Volume {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: BlockchainType })
  @Index() // Single-column index for fast filtering on blockchainType
  blockchainType: BlockchainType;

  @Column({ type: 'enum', enum: ExchangeId })
  @Index() // Single-column index for fast filtering on exchangeId
  exchangeId: ExchangeId;

  @Column()
  @Index()
  pairId: number;

  @PrimaryColumn('timestamp')
  @Index()
  timestamp: Date;

  @Column()
  blockNumber: number;

  @Column()
  transactionIndex: number;

  @Column()
  feeSymbol: string;

  @Column()
  feeAddress: string;

  @Column()
  tradingFeeAmountReal: string;

  @Column({ nullable: true })
  tradingFeeAmountUsd: string;

  @Column()
  targetSymbol: string;

  @Column()
  targetAddress: string;

  @Column()
  targetAmountReal: string;

  @Column()
  targetAmountUsd: string;
}
