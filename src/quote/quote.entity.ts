import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'quotes' })
export class Quote {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  provider: string;

  @PrimaryColumn('timestamp')
  @Index()
  timestamp: Date;

  @Column()
  @Index()
  symbol: string;

  @Column()
  price: string;

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
