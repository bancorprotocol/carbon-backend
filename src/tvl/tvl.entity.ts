import { Entity, Column, PrimaryGeneratedColumn, Index, Unique, PrimaryColumn } from 'typeorm';
import { BlockchainType, ExchangeId } from '../deployment/deployment.service';

@Entity('tvl') // Specify table name explicitly
@Unique([
  'blockchainType',
  'exchangeId',
  'strategyId',
  'pairName',
  'symbol',
  'tvl',
  'address',
  'evt_block_time', // Ensure evt_block_time is included in the unique constraint
  'evt_block_number',
  'reason',
  'transaction_index',
])
@Index(['pairId', 'blockchainType', 'exchangeId'])
@Index(['address', 'blockchainType', 'exchangeId'])
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
  @Index()
  evt_block_time: Date;

  @Column({ type: 'int' })
  @Index()
  evt_block_number: number;

  @Column({ type: 'text' })
  @Index()
  strategyId: string;

  @Column({ type: 'text' })
  pairName: string;

  @Column()
  @Index()
  pairId: number;

  @Column({ type: 'text' })
  @Index()
  symbol: string;

  @Column({ type: 'text' })
  address: string;

  @Column({ type: 'text' })
  tvl: string;

  @Column({ type: 'text' })
  @Index()
  reason: string;

  @Column({ type: 'text' })
  @Index() // Index for transaction_index for optimization in filtering
  transaction_index: string;
}
