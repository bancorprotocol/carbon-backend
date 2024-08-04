import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity({ name: 'volume' })
export class Volume {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  timestamp: Date;

  @Column()
  feeSymbol: string;

  @Column()
  feeAddress: string;

  @Column()
  tradingFeeAmountReal: string;

  @Column()
  tradingFeeAmountUsd: string;

  @Column()
  targetSymbol: string;

  @Column()
  targetAddress: string;

  @Column()
  targetAmountReal: string;

  @Column()
  targetAmountUsd: string;
}
