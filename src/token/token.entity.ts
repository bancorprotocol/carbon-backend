import { Entity, Column, CreateDateColumn, UpdateDateColumn, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'tokens' })
export class Token {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  address: string;

  @Column()
  symbol: string;

  @Column()
  name: string;

  @Column()
  decimals: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
