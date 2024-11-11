import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LastProcessedBlock } from './last-processed-block.entity';
import { Deployment } from '../deployment/deployment.service';

@Injectable()
export class LastProcessedBlockService {
  constructor(
    @InjectRepository(LastProcessedBlock)
    private lastProcessedBlock: Repository<LastProcessedBlock>,
    private configService: ConfigService,
  ) {}

  // caches the last processed block id if it is in fact greater than the previous processed block id.
  async update(param: string, block: number): Promise<any> {
    let lastProcessed = await this.lastProcessedBlock.findOneBy({ param });
    if (!lastProcessed) {
      lastProcessed = this.lastProcessedBlock.create({
        param,
        block,
      });
      await this.lastProcessedBlock.save(lastProcessed);
    } else if (block > lastProcessed.block) {
      await this.lastProcessedBlock.update(lastProcessed.id, {
        block,
      });
    }
  }

  async get(param: string): Promise<number> {
    const lastProcessed = await this.lastProcessedBlock.findOneBy({ param });
    return lastProcessed ? lastProcessed.block : null;
  }
  async getOrInit(param: string, initTo?: number): Promise<number> {
    const _initTo = initTo || 1; // defaults to 1 if not provided, startBlock should be provided in the deployment config
    const lastProcessed = await this.lastProcessedBlock.findOneBy({ param });
    return lastProcessed ? lastProcessed.block : _initTo;
  }

  async firstUnprocessedBlockNumber(): Promise<number> {
    const startBlock = 1;
    const entities = [
      'blocks',
      'pair-created-events',
      'strategy-created-events',
      'trading-fee-ppm-updated-events',
      'pair-trading-fee-ppm-updated-events',
      'voucher-transfer-events',
    ];
    const values = await Promise.all(
      entities.map((e) => {
        return this.getOrInit(e, startBlock);
      }),
    );

    return Math.min(...values);
  }

  async getState(deployment: Deployment): Promise<any> {
    const state = await this.lastProcessedBlock.query(`
      SELECT MIN("last_processed_block"."block") AS "lastBlock", MIN("updatedAt") AS timestamp 
      FROM last_processed_block
      WHERE "param" LIKE '%${deployment.blockchainType}-${deployment.exchangeId}%'
    `);

    return state[0];
  }
}
