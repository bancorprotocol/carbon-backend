import { Token } from 'src/token/token.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryColumn,
  Index,
  ManyToOne,
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

  @ManyToOne(() => Token, { eager: true })
  token: Token;

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
