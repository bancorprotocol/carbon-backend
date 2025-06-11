import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { decimalsABI, nameABI, symbolABI } from '../abis/erc20.abi';
import * as _ from 'lodash';
import { Token } from './token.entity';
import { HarvesterService } from '../harvester/harvester.service';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { PairCreatedEventService } from '../events/pair-created-event/pair-created-event.service';
import { BlockchainType, Deployment, NATIVE_TOKEN } from '../deployment/deployment.service';
import { VortexTokensTradedEventService } from '../events/vortex-tokens-traded-event/vortex-tokens-traded-event.service';
import { ArbitrageExecutedEventService } from '../events/arbitrage-executed-event/arbitrage-executed-event.service';
import { ArbitrageExecutedEventServiceV2 } from '../events/arbitrage-executed-event-v2/arbitrage-executed-event-v2.service';
import { VortexTradingResetEventService } from '../events/vortex-trading-reset-event/vortex-trading-reset-event.service';
import { VortexFundsWithdrawnEventService } from '../events/vortex-funds-withdrawn-event/vortex-funds-withdrawn-event.service';
import { ProtectionRemovedEventService } from '../events/protection-removed-event/protection-removed-event.service';
import { DeploymentService } from '../deployment/deployment.service';
export interface TokensByAddress {
  [address: string]: Token;
}

// First define an interface for the address data
interface AddressData {
  address: string;
  blockId: number;
}

@Injectable()
export class TokenService implements OnModuleInit {
  constructor(
    @InjectRepository(Token) private token: Repository<Token>,
    private harvesterService: HarvesterService,
    private lastProcessedBlockService: LastProcessedBlockService,
    private pairCreatedEventService: PairCreatedEventService,
    private vortexTokensTradedEventService: VortexTokensTradedEventService,
    private arbitrageExecutedEventService: ArbitrageExecutedEventService,
    private arbitrageExecutedEventServiceV2: ArbitrageExecutedEventServiceV2,
    private vortexTradingResetEventService: VortexTradingResetEventService,
    private vortexFundsWithdrawnEventService: VortexFundsWithdrawnEventService,
    private protectionRemovedEventService: ProtectionRemovedEventService,
    private deploymentService: DeploymentService,
  ) {}

  /**
   * Ensure all Ethereum tokens mapped from any deployment exist
   * This is done at application startup since token mappings are hardcoded in the
   * deployment configuration and cannot change at runtime.
   */
  async onModuleInit() {
    await this.ensureAllEthereumMappedTokensExist();
  }

  /**
   * Ensures all Ethereum tokens mapped from any deployment exist in the database
   * This replaces the former implementation where QuoteService would call ensureEthereumMappedTokensExist
   * We only need to do this once at startup since mappings are static in the configuration.
   */
  async ensureAllEthereumMappedTokensExist(): Promise<void> {
    const deployments = this.deploymentService.getDeployments();

    for (const deployment of deployments) {
      if (deployment.mapEthereumTokens && Object.keys(deployment.mapEthereumTokens).length > 0) {
        await this.ensureEthereumMappedTokensExist(deployment);
      }
    }
  }

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

      // fetch arbitrage executed events v2
      const newArbitrageExecutedEventsV2 = await this.arbitrageExecutedEventServiceV2.get(
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
        ...newArbitrageExecutedEventsV2
          .map((e) => e.sourceTokens.map((token) => ({ address: token, blockId: e.block.id })))
          .flat(),
        ...newArbitrageExecutedEventsV2
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
    const deployment = this.deploymentService.getDeploymentByBlockchainType(blockchainType);
    const tokens = await this.token.find({
      where: { blockchainType },
    });

    // If there's no deployment or no native token alias, return as is
    if (!deployment || !deployment.nativeTokenAlias) {
      return tokens;
    }

    // Convert addresses to lowercase for comparison
    const nativeTokenAlias = deployment.nativeTokenAlias.toLowerCase();
    const NATIVE_TOKEN_ADDRESS = NATIVE_TOKEN.toLowerCase();

    // Find the native token and check if alias exists
    const nativeToken = tokens.find((token) => token.address.toLowerCase() === NATIVE_TOKEN_ADDRESS);
    const aliasExists = tokens.some((token) => token.address.toLowerCase() === nativeTokenAlias);

    // If we found the native token and the alias doesn't exist, create it
    if (nativeToken && !aliasExists) {
      const aliasToken = this.token.create({
        ...nativeToken,
        address: nativeTokenAlias,
      });
      tokens.push(aliasToken);
    }

    return tokens;
  }

  /**
   * Ensures all mapped Ethereum tokens exist in the database
   * @param deployment The source deployment containing token mappings
   * @returns Array of created or found Ethereum tokens
   */
  async ensureEthereumMappedTokensExist(deployment: Deployment): Promise<Token[]> {
    // Skip if no mappings exist
    if (!deployment.mapEthereumTokens || Object.keys(deployment.mapEthereumTokens).length === 0) {
      return [];
    }

    // Get Ethereum deployment
    const ethereumDeployment = this.deploymentService.getDeploymentByBlockchainType(BlockchainType.Ethereum);

    // Get all mapped Ethereum addresses
    const lowercaseTokenMap = {};
    Object.entries(deployment.mapEthereumTokens).forEach(([key, value]) => {
      lowercaseTokenMap[key.toLowerCase()] = value.toLowerCase();
    });
    const mappedAddresses = Object.values(lowercaseTokenMap) as string[];

    // Return empty array if no mappings
    if (mappedAddresses.length === 0) {
      return [];
    }

    // Ensure each token exists
    const tokens = await Promise.all(
      mappedAddresses.map((address: string) => this.getOrCreateTokenByAddress(address, ethereumDeployment)),
    );

    return tokens;
  }

  /**
   * Gets a token by address for a specific blockchain type, or creates it if it doesn't exist
   * This is particularly useful for Ethereum tokens that are mapped from other chains
   * @param address Token address
   * @param deployment Deployment information
   * @returns The existing or newly created token
   */
  async getOrCreateTokenByAddress(address: string, deployment: Deployment): Promise<Token> {
    // Normalize address to lowercase for consistent lookup
    const normalizedAddress = address.toLowerCase();

    // Check if token already exists
    const existingToken = await this.token.findOne({
      where: {
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        address: normalizedAddress,
      },
    });

    if (existingToken) {
      return existingToken;
    }

    // Token doesn't exist, fetch metadata and create it
    const [decimal] = await this.getDecimals([normalizedAddress], deployment);
    const [symbol] = await this.getSymbols([normalizedAddress], deployment);
    const [name] = await this.getNames([normalizedAddress], deployment);

    // Create and save the new token
    const newToken = this.token.create({
      address: normalizedAddress,
      symbol,
      decimals: decimal,
      name,
      blockchainType: deployment.blockchainType,
      exchangeId: deployment.exchangeId,
    });

    await this.token.save(newToken);
    return newToken;
  }
}
