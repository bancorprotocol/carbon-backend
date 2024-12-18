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

@Index(['blockchainType', 'tokenAddress', 'timestamp']) // Composite index for gapfill query efficiency
@Entity({ name: 'historic-quotes' })
@Index('IDX_token_address_desc', { synchronize: false })
export class HistoricQuote {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
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
