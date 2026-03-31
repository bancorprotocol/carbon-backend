import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity({ name: 'preview_backends' })
export class PreviewBackend {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  @Index()
  tenderlyId: string;

  @Column()
  instanceName: string;

  @Column()
  instanceId: string;

  @Column({ default: 'gce' })
  provider: string;

  @Column()
  url: string;

  @Column()
  deployment: string;

  @Column()
  networkId: number;

  @Column()
  forkBlock: number;

  @Column({ nullable: true })
  currentBlock: number;

  @Column()
  rpcUrl: string;

  @Column({ default: 'creating' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
