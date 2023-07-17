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

const LAST_PROCESSED_ENTITY = 'blocks';

@Injectable()
export class BlockService {
  constructor(
    private configService: ConfigService,
    private lastProcessedBlockService: LastProcessedBlockService,
    @Inject('BLOCKCHAIN_CONFIG') private blockchainConfig: any,
    @InjectRepository(Block) private block: Repository<Block>,
  ) {}

  async update(upToBlockNumber: number): Promise<Block> {
    // get last known processed block id, it is guaranteed that all ids below this are sequenced without gaps.
    const lastProcessedBlock = await this.lastProcessedBlockService.get(
      LAST_PROCESSED_ENTITY,
    );
    const startBlock = lastProcessedBlock
      ? lastProcessedBlock + 1
      : parseInt(this.configService.get('START_BLOCK'));

    if (startBlock > upToBlockNumber) return;
    // const startBlock = parseInt(this.configService.get('START_BLOCK'));
    // get the missing block ids
    let missingBlocks = await this.getMissingBlocks(
      startBlock,
      upToBlockNumber,
    );
    // iterate until there are no missing ids
    let lastBlock;
    while (missingBlocks.length > 0) {
      lastBlock = await this.fetchAndStore(missingBlocks);
      missingBlocks = await this.getMissingBlocks(startBlock, upToBlockNumber);
    }
    // cache the last processed block id
    await this.lastProcessedBlockService.update(
      LAST_PROCESSED_ENTITY,
      upToBlockNumber,
    );
    return lastBlock;
  }

  async getMissingBlocks(from: number, to: number): Promise<any> {
    const fullRange = range(from, to);
    let stored = await this.block
      .createQueryBuilder()
      .select('"id"')
      .where('"id" >= :from', { from })
      .orderBy('"id"')
      .execute();
    stored = stored.map((b) => b.id);
    return _.difference(fullRange, stored);
  }

  async fetchAndStore(blocks: Array<number>): Promise<Block> {
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
      console.log('finished blocks batch:', batches[i][batches[i].length - 1]);
      return newBlocks[newBlocks.length - 1];
    }
  }

  async getBlockchainData(blockNumber: number): Promise<any> {
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

  async getBlocksDictionary(
    from: number,
    to: number,
  ): Promise<BlocksDictionary> {
    const blocks = await this.block
      .createQueryBuilder()
      .select(['"id"', '"timestamp"'])
      .where('"id" >= :from', { from })
      .andWhere('"id" <= :to', { to })
      .orderBy('"id"', 'ASC')
      .execute();

    const result = {};
    blocks.forEach((b) => (result[b.id] = b.timestamp));
    return result;
  }

  async getLastBlockFromBlockchain(): Promise<number> {
    const web3 = new Web3(this.blockchainConfig.ethereumEndpoint);
    const blockNumber = await web3.eth.getBlockNumber();
    return Number(blockNumber);
  }

  async getFirst(): Promise<Block> {
    return this.block
      .createQueryBuilder('blocks')
      .orderBy('id', 'ASC')
      .limit(1)
      .getOne();
  }
}

function range(start, end) {
  return Array(end - start + 1)
    .fill(1)
    .map((_, idx) => start + idx);
}
