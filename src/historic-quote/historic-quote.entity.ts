import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryColumn,
  Index,
} from 'typeorm';
import { BlockchainType } from '../deployment/deployment.service';

@Entity({ name: 'historic-quotes' })
@Index(['blockchainType', 'timestamp']) // Composite index for blockchainType and timestamp
@Index(['tokenAddress', 'timestamp']) // Composite index for tokenAddress and timestamp for filtering and grouping
@Index(['blockchainType', 'tokenAddress', 'timestamp']) // Composite index for gapfill query efficiency
export class HistoricQuote {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: BlockchainType })
  @Index()
  blockchainType: BlockchainType;

  @PrimaryColumn('timestamp')
  @Index()
  timestamp: Date;

  @Column()
  @Index()
  tokenAddress: string;

  @Column()
  provider: string;

  @Column() // Keep usd as text
  usd: string;

  @CreateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP(6)',
    onUpdate: 'CURRENT_TIMESTAMP(6)',
  })
  updatedAt: Date;
}
