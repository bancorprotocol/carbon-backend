import { Entity, Column, PrimaryGeneratedColumn, Index, Unique } from 'typeorm';
import { BlockchainType, ExchangeId } from '../deployment/deployment.service';

@Entity()
@Unique([
  'blockchainType',
  'exchangeId',
  'strategyid',
  'pairname',
  'symbol',
  'tvl',
  'address',
  'evt_block_time',
  'evt_block_number',
  'reason',
  'transaction_index',
])
export class Tvl {
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
  evt_block_time: Date;

  @Column()
  @Index()
  evt_block_number: number;

  @Column()
  strategyid: string;

  @Column()
  pairname: string;

  @Column()
  symbol: string;

  @Column()
  address: string;

  @Column()
  tvl: string;

  @Column()
  reason: string;

  @Column()
  transaction_index: string;
}
