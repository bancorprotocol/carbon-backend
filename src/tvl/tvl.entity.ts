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
  @Index() // Single-column index for blockchainType
  blockchainType: BlockchainType;

  @Column({ type: 'enum', enum: ExchangeId })
  @Index() // Single-column index for exchangeId
  exchangeId: ExchangeId;

  @Column()
  @Index('idx_evt_block_time_number') // Composite index for evt_block_time and evt_block_number
  evt_block_time: Date;

  @Column()
  evt_block_number: number;

  @Column()
  @Index('idx_strategyid_pairname') // Composite index for strategyid and pairname
  strategyid: string;

  @Column()
  pairname: string;

  @Column()
  @Index('idx_symbol_address') // Composite index for symbol and address
  symbol: string;

  @Column()
  address: string;

  @Column()
  @Index('idx_tvl_reason', { where: "reason != '4'" }) // Partial index for filtering by reason != 4
  tvl: string;

  @Column()
  reason: string;

  @Column()
  @Index()
  transaction_index: string;
}
