import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity()
export class Tvl {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  timestamp: Date;

  @Column()
  symbol: string;

  @Column()
  deltaLiquidityReal: string;

  @Column()
  deltaLiquidityUsd: string;

  @Column()
  blockNumber: number;
}
