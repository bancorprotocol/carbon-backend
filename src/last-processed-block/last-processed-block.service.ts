import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LastProcessedBlock } from './last-processed-block.entity';

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
    const _initTo = initTo || this.configService.get('START_BLOCK') - 1;
    const lastProcessed = await this.lastProcessedBlock.findOneBy({ param });
    return lastProcessed ? lastProcessed.block : _initTo;
  }

  async firstUnprocessedBlockNumber(): Promise<number> {
    const startBlock = parseInt(this.configService.get('START_BLOCK'));
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
}
