import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Block } from './block.entity';
import { Repository } from 'typeorm';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import * as _ from 'lodash';
import Web3 from 'web3';

export interface BlocksDictionary {
  [id: number]: Date;
}

@Injectable()
export class BlockService {
  constructor(
    private configService: ConfigService,
    private lastProcessedBlockService: LastProcessedBlockService,
    @Inject('BLOCKCHAIN_CONFIG') private blockchainConfig: any,
    @InjectRepository(Block) private block: Repository<Block>,
  ) {}

  private async update(blockNumbers: number[]): Promise<void> {
    let missingBlocks = await this.getMissingBlocks(blockNumbers);

    while (missingBlocks.length > 0) {
      await this.fetchAndStore(missingBlocks);
      missingBlocks = await this.getMissingBlocks(blockNumbers);
    }
  }

  private async getMissingBlocks(blockNumbers: number[]): Promise<number[]> {
    const existingBlocks = await this.block
      .createQueryBuilder()
      .where('id IN (:...ids)', { ids: blockNumbers })
      .getMany();

    const existingBlockIds = existingBlocks.map((block) => block.id);
    return _.difference(blockNumbers, existingBlockIds);
  }

  private async fetchAndStore(blocks: Array<number>): Promise<void> {
    const batches = _.chunk(blocks, 100);

    // for each batch
    for (let i = 0; i < batches.length; i++) {
      const promises = [];
      const newBlocks = [];
      // for each blockId in a batch
      for (let x = 0; x < batches[i].length; x++) {
        // create a promise that handles a single blockId
        const promise = new Promise(async (resolve) => {
          try {
            // get blockchain data
            const blockchainData = await this.getBlockchainData(batches[i][x]);
            // save data
            const newBlock = this.block.create({
              id: Number(blockchainData.number),
              timestamp: new Date(parseInt(blockchainData.timestamp) * 1000),
            });
            newBlocks.push(newBlock);
          } catch (error) {
            // we don't reject or throw on failures, instead we allow for a silent failure.
            // to make sure there are no gaps in the sequence we iterate until getMissingBlocks returns an empty list
            console.log('error detected god damn it?', error);
          }
          resolve(true);
        });
        promises.push(promise);
      }
      // start executing
      await Promise.all(promises);
      await this.block.save(newBlocks);
      console.log('finished blocks batch');
    }
  }

  private async getBlockchainData(blockNumber: number): Promise<any> {
    const web3 = new Web3(this.blockchainConfig.ethereumEndpoint);
    return web3.eth.getBlock(blockNumber);
  }

  async getBlocks(from: number, to: number): Promise<any> {
    const blocks = await this.block
      .createQueryBuilder()
      .select(['"id"', '"timestamp"'])
      .where('"id" >= :from', { from })
      .andWhere('"id" <= :to', { to })
      .orderBy('"id"', 'ASC')
      .execute();
    return blocks;
  }

  async getBlock(number: number): Promise<Block> {
    return this.block.findOneBy({ id: number });
  }

  async getLastBlock(): Promise<Block> {
    return this.block.createQueryBuilder().orderBy('"id"', 'DESC').limit(1).getOne();
  }

  async getBlocksDictionary(blockNumbers: number[]): Promise<BlocksDictionary> {
    // Ensure all requested blocks are fetched and stored
    await this.update(blockNumbers);

    // Fetch the blocks from the database
    const blocksInDb = await this.block
      .createQueryBuilder()
      .where('id IN (:...blockNumbers)', { blockNumbers })
      .getMany();

    // Construct and return the dictionary
    const result: BlocksDictionary = {};
    blocksInDb.forEach((block) => {
      result[block.id] = block.timestamp;
    });

    return result;
  }

  async getLastBlockFromBlockchain(): Promise<number> {
    const web3 = new Web3(this.blockchainConfig.ethereumEndpoint);
    const blockNumber = await web3.eth.getBlockNumber();
    return Number(blockNumber);
  }

  async getFirst(): Promise<Block> {
    return this.block.createQueryBuilder('blocks').orderBy('id', 'ASC').limit(1).getOne();
  }
}
