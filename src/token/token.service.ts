import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { decimalsABI, nameABI, symbolABI } from '../abis/erc20.abi';
import * as _ from 'lodash';
import { Token } from './token.entity';
import { HarvesterService } from '../harvester/harvester.service';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { PairCreatedEventService } from '../events/pair-created-event/pair-created-event.service';
import { BlockchainType, Deployment } from '../deployment/deployment.service';
import { VortexTokensTradedEventService } from '../events/vortex-tokens-traded-event/vortex-tokens-traded-event.service';
import { ArbitrageExecutedEventService } from '../events/arbitrage-executed-event/arbitrage-executed-event.service';
import { VortexTradingResetEventService } from '../events/vortex-trading-reset-event/vortex-trading-reset-event.service';
import { VortexFundsWithdrawnEventService } from '../events/vortex-funds-withdrawn-event/vortex-funds-withdrawn-event.service';
import { ProtectionRemovedEventService } from '../events/protection-removed-event/protection-removed-event.service';
export interface TokensByAddress {
  [address: string]: Token;
}

// First define an interface for the address data
interface AddressData {
  address: string;
  blockId: number;
}

@Injectable()
export class TokenService {
  constructor(
    @InjectRepository(Token) private token: Repository<Token>,
    private harvesterService: HarvesterService,
    private lastProcessedBlockService: LastProcessedBlockService,
    private pairCreatedEventService: PairCreatedEventService,
    private vortexTokensTradedEventService: VortexTokensTradedEventService,
    private arbitrageExecutedEventService: ArbitrageExecutedEventService,
    private vortexTradingResetEventService: VortexTradingResetEventService,
    private vortexFundsWithdrawnEventService: VortexFundsWithdrawnEventService,
    private protectionRemovedEventService: ProtectionRemovedEventService,
  ) {}

  async update(endBlock: number, deployment: Deployment): Promise<void> {
    const lastProcessedEntity = `${deployment.blockchainType}-${deployment.exchangeId}-tokens`;

    // figure out start block
    const lastProcessedBlockNumber = await this.lastProcessedBlockService.getOrInit(lastProcessedEntity, 1);

    // Define batch size
    const batchSize = 10000;
    let currentBlock = lastProcessedBlockNumber;

    while (currentBlock < endBlock) {
      const nextBlock = Math.min(currentBlock + batchSize, endBlock);

      // fetch pair created events
      const newPairCreatedEvents = await this.pairCreatedEventService.get(currentBlock, nextBlock, deployment);

      // fetch arbitrage executed events
      const newArbitrageExecutedEvents = await this.arbitrageExecutedEventService.get(
        currentBlock,
        nextBlock,
        deployment,
      );

      // fetch vortex tokens traded events
      const newVortexTokensTradedEvents = await this.vortexTokensTradedEventService.get(
        currentBlock,
        nextBlock,
        deployment,
      );

      // fetch vortex trading reset events
      const newVortexTradingResetEvents = await this.vortexTradingResetEventService.get(
        currentBlock,
        nextBlock,
        deployment,
      );

      // fetch vortex funds withdrawn events
      const newVortexFundsWithdrawnEvents = await this.vortexFundsWithdrawnEventService.get(
        currentBlock,
        nextBlock,
        deployment,
      );

      // fetch protection removed events
      const newProtectionRemovedEvents = await this.protectionRemovedEventService.get(
        currentBlock,
        nextBlock,
        deployment,
      );

      // Create array of AddressData objects with both address and blockId
      const addressesData: AddressData[] = [
        ...newPairCreatedEvents.map((e) => ({ address: e.token0, blockId: e.block.id })),
        ...newPairCreatedEvents.map((e) => ({ address: e.token1, blockId: e.block.id })),
        ...newVortexTokensTradedEvents.map((e) => ({ address: e.token, blockId: e.block.id })),
        ...newArbitrageExecutedEvents
          .map((e) => e.sourceTokens.map((token) => ({ address: token, blockId: e.block.id })))
          .flat(),
        ...newArbitrageExecutedEvents
          .map((e) => e.tokenPath.map((token) => ({ address: token, blockId: e.block.id })))
          .flat(),
        ...newVortexTradingResetEvents.map((e) => ({ address: e.token, blockId: e.block.id })),
        ...newVortexFundsWithdrawnEvents
          .map((e) => e.tokens.map((token) => ({ address: token, blockId: e.block.id })))
          .flat(),
        ...newProtectionRemovedEvents.map((e) => ({ address: e.poolToken, blockId: e.block.id })),
        ...newProtectionRemovedEvents.map((e) => ({ address: e.reserveToken, blockId: e.block.id })),
      ];

      // Sort by blockId to ensure we process in chronological order
      addressesData.sort((a, b) => a.blockId - b.blockId);

      // create new tokens
      const addressesBatches = _.chunk(addressesData, 1000);
      for (const addressesBatch of addressesBatches) {
        // Extract just the addresses for token creation
        const addresses = addressesBatch.map((data) => data.address);
        await this.createFromAddresses(addresses, deployment);

        // Update using the last block ID from this batch
        await this.lastProcessedBlockService.update(
          lastProcessedEntity,
          addressesBatch[addressesBatch.length - 1].blockId,
        );
      }

      // Move to the next batch
      currentBlock = nextBlock;
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

  private async createFromAddresses(addresses: string[], deployment: Deployment) {
    // map all token addresses in an array
    const addressesSet = new Set(addresses);

    // filter out already existing tokens
    const currentlyExistingTokens: any = await this.token.find({
      where: { blockchainType: deployment.blockchainType, exchangeId: deployment.exchangeId },
    });
    const currentlyExistingAddresses = currentlyExistingTokens.map((t) => t.address);

    const newAddresses = [];
    Array.from(addressesSet).forEach((t) => {
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
