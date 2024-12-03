import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { BlockchainType } from '../deployment/deployment.service';

@Entity('codex-tokens')
@Unique(['address', 'networkId', 'timestamp'])
export class CodexToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  address: string;

  @Column()
  @Index()
  networkId: number;

  @Column()
  @Index()
  blockchainType: BlockchainType;

  @Column({ type: 'timestamp' })
  timestamp: Date;

  @Column({ type: 'timestamp' })
  createdAt: Date;
}
