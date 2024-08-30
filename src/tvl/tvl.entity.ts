import { Entity, Column, PrimaryGeneratedColumn, Index, Unique, PrimaryColumn } from 'typeorm';
import { BlockchainType, ExchangeId } from '../deployment/deployment.service';

@Entity('tvl') // Specify table name explicitly
@Unique([
  'blockchainType',
  'exchangeId',
  'strategyid',
  'pairname',
  'symbol',
  'tvl',
  'address',
  'evt_block_time', // Ensure evt_block_time is included in the unique constraint
  'evt_block_number',
  'reason',
  'transaction_index',
])
@Index('idx_evt_block_time', ['evt_block_time']) // Index on evt_block_time
@Index('idx_address_symbol_blockchain_exchange', ['address', 'symbol', 'blockchainType', 'exchangeId']) // Composite index
export class Tvl {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: BlockchainType })
  @Index() // Single-column index for fast filtering on blockchainType
  blockchainType: BlockchainType;

  @Column({ type: 'enum', enum: ExchangeId })
  @Index() // Single-column index for fast filtering on exchangeId
  exchangeId: ExchangeId;

  @PrimaryColumn('timestamp')
  evt_block_time: Date;

  @Column({ type: 'int', nullable: false })
  evt_block_number: number;

  @Column({ type: 'text', nullable: false })
  @Index('idx_strategyid_pairname') // Composite index for strategyid and pairname
  strategyid: string;

  @Column({ type: 'text', nullable: false })
  pairname: string;

  @Column({ type: 'text', nullable: false })
  @Index('idx_symbol_address') // Composite index for symbol and address
  symbol: string;

  @Column({ type: 'text', nullable: false })
  address: string;

  @Column({ type: 'text', nullable: false })
  @Index('idx_tvl_reason', { where: "reason != '4'" }) // Partial index for filtering by reason != 4
  tvl: string;

  @Column({ type: 'text', nullable: false })
  reason: string;

  @Column({ type: 'text', nullable: false })
  @Index() // Index for transaction_index for optimization in filtering
  transaction_index: string;
}
