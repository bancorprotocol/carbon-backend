import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'historic-quotes' })
export class HistoricQuote {
  @PrimaryGeneratedColumn()
  id: number;

  @PrimaryColumn('timestamp')
  timestamp: Date;

  @Column()
  @Index()
  tokenAddress: string;

  @Column()
  provider: string;

  @Column()
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
