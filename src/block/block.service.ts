import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Block } from './block.entity';
import { Repository } from 'typeorm';
import * as _ from 'lodash';
import Web3 from 'web3';
import { Deployment } from '../deployment/deployment.service';

export interface BlocksDictionary {
  [id: number]: Date;
}

@Injectable()
export class BlockService {
  constructor(@InjectRepository(Block) private block: Repository<Block>) {}

  private async update(blockNumbers: number[], deployment: Deployment): Promise<void> {
    let missingBlocks = await this.getMissingBlocks(blockNumbers, deployment);

    while (missingBlocks.length > 0) {
      await this.fetchAndStore(missingBlocks, deployment);
      missingBlocks = await this.getMissingBlocks(blockNumbers, deployment);
    }
  }

  private async getMissingBlocks(blockNumbers: number[], deployment: Deployment): Promise<number[]> {
    const existingBlocks = await this.block
      .createQueryBuilder()
      .where('id IN (:...ids)', { ids: blockNumbers })
      .andWhere('"blockchainType" = :blockchainType', { blockchainType: deployment.blockchainType })
      .getMany();

    const existingBlockIds = existingBlocks.map((block) => block.id);
    return _.difference(blockNumbers, existingBlockIds);
  }

  private async fetchAndStore(blocks: Array<number>, deployment: Deployment): Promise<void> {
    const batches = _.chunk(blocks, 100);

    for (let i = 0; i < batches.length; i++) {
      const promises = [];
      const newBlocks = [];

      for (let x = 0; x < batches[i].length; x++) {
        const promise = new Promise(async (resolve) => {
          try {
            const blockchainData = await this.getBlockchainData(batches[i][x], deployment);
            const newBlock = this.block.create({
              id: Number(blockchainData.number),
              timestamp: new Date(parseInt(blockchainData.timestamp) * 1000),
              blockchainType: deployment.blockchainType,
            });
            newBlocks.push(newBlock);
          } catch (error) {
            console.log('error detected:', error);
          }
          resolve(true);
        });
        promises.push(promise);
      }
      await Promise.all(promises);
      await this.block.save(newBlocks);
    }
  }

  private async getBlockchainData(blockNumber: number, deployment: Deployment): Promise<any> {
    const web3 = new Web3(deployment.rpcEndpoint);
    return web3.eth.getBlock(blockNumber);
  }

  async getBlocks(from: number, to: number, deployment: Deployment): Promise<any> {
    const blocks = await this.block
      .createQueryBuilder()
      .select(['"id"', '"timestamp"'])
      .where('"id" >= :from', { from })
      .andWhere('"id" <= :to', { to })
      .andWhere('"blockchainType" = :blockchainType', { blockchainType: deployment.blockchainType })
      .orderBy('"id"', 'ASC')
      .execute();
    return blocks;
  }

  async getBlock(number: number, deployment: Deployment): Promise<Block> {
    return this.block.findOne({ where: { id: number, blockchainType: deployment.blockchainType } });
  }

  async getLastBlock(deployment: Deployment): Promise<Block> {
    return this.block
      .createQueryBuilder()
      .where('"blockchainType" = :blockchainType', { blockchainType: deployment.blockchainType })
      .orderBy('"id"', 'DESC')
      .limit(1)
      .getOne();
  }

  async getBlocksDictionary(blockNumbers: number[], deployment: Deployment): Promise<BlocksDictionary> {
    await this.update(blockNumbers, deployment);

    const blocksInDb = await this.block
      .createQueryBuilder()
      .where('id IN (:...blockNumbers)', { blockNumbers })
      .andWhere('"blockchainType" = :blockchainType', { blockchainType: deployment.blockchainType })
      .getMany();

    const result: BlocksDictionary = {};
    blocksInDb.forEach((block) => {
      result[block.id] = block.timestamp;
    });

    return result;
  }

  async getLastBlockFromBlockchain(deployment: Deployment): Promise<number> {
    const web3 = new Web3(deployment.rpcEndpoint);
    const blockNumber = await web3.eth.getBlockNumber();
    return Number(blockNumber);
  }

  async getFirst(deployment: Deployment): Promise<Block> {
    return this.block
      .createQueryBuilder('blocks')
      .where('"blockchainType" = :blockchainType', { blockchainType: deployment.blockchainType })
      .orderBy('id', 'ASC')
      .limit(1)
      .getOne();
  }
}
