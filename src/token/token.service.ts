import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { decimalsABI, nameABI, symbolABI } from '../abis/erc20.abi';
import * as _ from 'lodash';
import { Token } from './token.entity';
import { HarvesterService } from '../harvester/harvester.service';
import { PairCreatedEvent } from '../events/pair-created-event/pair-created-event.entity';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { PairCreatedEventService } from '../events/pair-created-event/pair-created-event.service';
import { BlockchainType, Deployment } from '../deployment/deployment.service';

export interface TokensByAddress {
  [address: string]: Token;
}

@Injectable()
export class TokenService {
  constructor(
    @InjectRepository(Token) private token: Repository<Token>,
    private harvesterService: HarvesterService,
    private lastProcessedBlockService: LastProcessedBlockService,
    private pairCreatedEventService: PairCreatedEventService,
  ) {}

  async update(endBlock: number, deployment: Deployment): Promise<void> {
    const lastProcessedEntity = `${deployment.blockchainType}-${deployment.exchangeId}-tokens`;

    // figure out start block
    const lastProcessedBlockNumber = await this.lastProcessedBlockService.getOrInit(lastProcessedEntity, 1);

    // fetch pair created events
    const newEvents = await this.pairCreatedEventService.get(lastProcessedBlockNumber, endBlock, deployment);

    // create new tokens
    const eventBatches = _.chunk(newEvents, 1000);
    for (const eventsBatch of eventBatches) {
      await this.createFromEvents(eventsBatch, deployment);
      await this.lastProcessedBlockService.update(lastProcessedEntity, eventsBatch[eventsBatch.length - 1].block.id);
    }

    // update last processed block number
    await this.lastProcessedBlockService.update(lastProcessedEntity, endBlock);
  }

  async allByAddress(deployment: Deployment): Promise<TokensByAddress> {
    const all = await this.token.find({
      where: {
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
      },
    });
    const tokensByAddress = {};
    all.forEach((t) => (tokensByAddress[t.address] = t));
    return tokensByAddress;
  }

  async all(deployment: Deployment): Promise<Token[]> {
    return this.token.find({
      where: {
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
      },
    });
  }

  private async createFromEvents(events: PairCreatedEvent[], deployment: Deployment) {
    // map all token addresses in an array
    const eventsAddresses = new Set();
    events.forEach((e) => {
      eventsAddresses.add(e.token0);
      eventsAddresses.add(e.token1);
    });

    // filter out already existing tokens
    const currentlyExistingTokens: any = await this.token.find({
      where: { blockchainType: deployment.blockchainType, exchangeId: deployment.exchangeId },
    });
    const currentlyExistingAddresses = currentlyExistingTokens.map((t) => t.address);

    const newAddresses = [];
    Array.from(eventsAddresses).forEach((t) => {
      if (!currentlyExistingAddresses.includes(t)) {
        newAddresses.push(t);
      }
    });

    // fetch metadata
    const decimals = await this.getDecimals(newAddresses, deployment);
    const symbols = await this.getSymbols(newAddresses, deployment);
    const names = await this.getNames(newAddresses, deployment);

    // create new tokens
    const newTokens = [];
    for (let i = 0; i < newAddresses.length; i++) {
      newTokens.push(
        this.token.create({
          address: newAddresses[i],
          symbol: symbols[i],
          decimals: decimals[i],
          name: names[i],
          blockchainType: deployment.blockchainType, // Include blockchainType
          exchangeId: deployment.exchangeId, // Include exchangeId
        }),
      );
    }
    await this.token.save(newTokens);
  }

  private async getSymbols(addresses: string[], deployment: Deployment): Promise<string[]> {
    const symbols = await this.harvesterService.stringsWithMulticall(addresses, symbolABI, 'symbol', deployment);
    const index = addresses.indexOf(deployment.gasToken.address);
    if (index >= 0) {
      symbols[index] = deployment.gasToken.symbol;
    }
    return symbols;
  }

  private async getNames(addresses: string[], deployment: Deployment): Promise<string[]> {
    const names = await this.harvesterService.stringsWithMulticall(addresses, nameABI, 'name', deployment);
    const index = addresses.indexOf(deployment.gasToken.address);
    if (index >= 0) {
      names[index] = deployment.gasToken.name;
    }
    return names;
  }

  private async getDecimals(addresses: string[], deployment: Deployment): Promise<number[]> {
    const decimals = await this.harvesterService.integersWithMulticall(addresses, decimalsABI, 'decimals', deployment);
    const index = addresses.indexOf(deployment.gasToken.address);
    if (index >= 0) {
      decimals[index] = 18;
    }
    return decimals;
  }

  async getTokensByBlockchainType(blockchainType: BlockchainType): Promise<Token[]> {
    return this.token.find({
      where: { blockchainType },
    });
  }
}
