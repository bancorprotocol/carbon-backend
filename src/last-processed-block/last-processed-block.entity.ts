import { Block } from '../block/block.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Index,
} from 'typeorm';

@Entity()
export class LastProcessedBlock {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  param: string;

  @ManyToOne(() => Block, { eager: true })
  @Index()
  block: Block;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
