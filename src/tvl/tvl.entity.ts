import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';
import { BlockchainType, ExchangeId } from '../deployment/deployment.service';

@Entity()
export class Tvl {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: BlockchainType })
  @Index()
  blockchainType: BlockchainType;

  @Column({ type: 'enum', enum: ExchangeId })
  @Index()
  exchangeId: ExchangeId;

  @Column()
  @Index()
  timestamp: Date;

  @Column()
  strategyId: string;

  @Column()
  pair: string;

  @Column()
  symbol: string;

  @Column()
  tvl: string;

  @Column()
  tvlUsd: string;
}
