import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, Index } from 'typeorm';

@Entity()
export class LastProcessedBlock {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  param: string;

  @Column()
  block: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
