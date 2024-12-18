import { Entity, Column, CreateDateColumn, UpdateDateColumn, PrimaryColumn, Index } from 'typeorm';
import { BlockchainType } from '../deployment/deployment.service';

@Entity({ name: 'blocks' })
export class Block {
  @PrimaryColumn()
  id: number;

  @Column()
  @Index()
  blockchainType: BlockchainType;

  @Column()
  timestamp: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
