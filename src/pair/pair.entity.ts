import { Block } from '../block/block.entity';
import { Token } from '../token/token.entity';
import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'pairs' })
export class Pair {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Block)
  block: Block;

  @ManyToOne(() => Token)
  token0: Token;

  @ManyToOne(() => Token)
  token1: Token;

  @Column()
  name: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
