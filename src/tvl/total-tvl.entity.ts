import { Entity, Column, PrimaryGeneratedColumn, Index, Unique, PrimaryColumn } from 'typeorm';
import { BlockchainType, ExchangeId } from '../deployment/deployment.service';

@Entity('total-tvl') // Specify table name explicitly
@Unique(['blockchainType', 'exchangeId', 'timestamp'])
export class TotalTvl {
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
  timestamp: Date;

  @Column({ type: 'text' })
  tvl: string;
}
