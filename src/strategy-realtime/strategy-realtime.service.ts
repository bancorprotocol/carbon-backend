import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import Web3 from 'web3';
import Decimal from 'decimal.js';
import { StrategyRealtime } from './strategy-realtime.entity';
import { Deployment } from '../deployment/deployment.service';
import { TokensByAddress } from '../token/token.service';
import { HarvesterService, ContractsNames } from '../harvester/harvester.service';
import { parseOrder, processOrders } from '../activity/activity.utils';

const STRATEGY_REALTIME_BLOCK_KEY = 'strategy-realtime:block';

interface ContractOrder {
  y: string;
  z: string;
  A: string;
  B: string;
}

interface ContractStrategy {
  id: string;
  owner: string;
  tokens: [string, string];
  orders: [ContractOrder, ContractOrder];
}

// ABI types for decoding multicall results
const STRATEGY_ARRAY_ABI_TYPE = {
  type: 'tuple[]',
  components: [
    { name: 'id', type: 'uint256' },
    { name: 'owner', type: 'address' },
    { name: 'tokens', type: 'address[2]' },
    {
      name: 'orders',
      type: 'tuple[2]',
      components: [
        { name: 'y', type: 'uint128' },
        { name: 'z', type: 'uint128' },
        { name: 'A', type: 'uint64' },
        { name: 'B', type: 'uint64' },
      ],
    },
  ],
};

@Injectable()
export class StrategyRealtimeService {
  private readonly logger = new Logger(StrategyRealtimeService.name);

  constructor(
    @InjectRepository(StrategyRealtime)
    private strategyRealtimeRepository: Repository<StrategyRealtime>,
    private harvesterService: HarvesterService,
    @Inject('REDIS') private redis: any,
  ) {}

  private getDeploymentKey(deployment: Deployment): string {
    return `${deployment.blockchainType}-${deployment.exchangeId}`;
  }

  private getBlockRedisKey(deployment: Deployment): string {
    return `${STRATEGY_REALTIME_BLOCK_KEY}:${this.getDeploymentKey(deployment)}`;
  }

  async update(deployment: Deployment, tokens: TokensByAddress): Promise<number> {
    const carbonController = this.harvesterService.getContract(
      ContractsNames.CarbonController,
      undefined,
      undefined,
      deployment,
    );
    const contractAddress = deployment.contracts.CarbonController.address;
    // Web3 instance needed for ABI decoding in multicall results
    const web3 = new Web3(deployment.rpcEndpoint);
    let lastBlockNumber = 0;

    try {
      // Step 1: Fetch all pairs from the contract
      const pairs: [string, string][] = await carbonController.methods.pairs().call();
      this.logger.log(`Found ${pairs.length} pairs for ${deployment.exchangeId}`);

      if (pairs.length === 0) {
        return lastBlockNumber;
      }

      // Step 2: Use multicall to get strategy counts for all pairs at once
      const countCallsEncoded = pairs.map(([token0, token1]) =>
        carbonController.methods.strategiesByPairCount(token0, token1).encodeABI(),
      );

      const { results: countResults, blockNumber: countBlockNumber } = await this.harvesterService.genericMulticall(
        contractAddress,
        countCallsEncoded,
        deployment,
      );
      lastBlockNumber = countBlockNumber;

      // Decode the counts and identify pairs with strategies
      const pairsWithCounts: { pair: [string, string]; count: number }[] = [];
      for (let i = 0; i < pairs.length; i++) {
        if (countResults[i].success) {
          const count = parseInt(countResults[i].data, 16);
          if (count > 0) {
            pairsWithCounts.push({ pair: pairs[i], count });
          }
        }
      }

      this.logger.log(`Found ${pairsWithCounts.length} pairs with strategies for ${deployment.exchangeId}`);

      if (pairsWithCounts.length === 0) {
        // No strategies exist, clear any existing realtime data
        await this.markDeletedStrategies([], deployment);
        return lastBlockNumber;
      }

      // Step 3: Use multicall to fetch all strategies for all pairs
      const STRATEGY_CHUNK_SIZE = 100;
      const strategyCallsEncoded: string[] = [];
      const callMetadata: { pair: [string, string]; startIndex: number; endIndex: number }[] = [];

      for (const { pair, count } of pairsWithCounts) {
        const [token0, token1] = pair;
        for (let startIndex = 0; startIndex < count; startIndex += STRATEGY_CHUNK_SIZE) {
          const endIndex = Math.min(startIndex + STRATEGY_CHUNK_SIZE, count);
          strategyCallsEncoded.push(
            carbonController.methods.strategiesByPair(token0, token1, startIndex, endIndex).encodeABI(),
          );
          callMetadata.push({ pair, startIndex, endIndex });
        }
      }

      this.logger.log(
        `Making ${strategyCallsEncoded.length} strategiesByPair calls via multicall for ${deployment.exchangeId}`,
      );

      const { results: strategyResults, blockNumber: strategyBlockNumber } =
        await this.harvesterService.genericMulticall(contractAddress, strategyCallsEncoded, deployment);
      lastBlockNumber = strategyBlockNumber;

      // Decode all strategies
      const allStrategies: ContractStrategy[] = [];
      for (let i = 0; i < strategyResults.length; i++) {
        if (strategyResults[i].success && strategyResults[i].data !== '0x') {
          try {
            const decoded = web3.eth.abi.decodeParameter(STRATEGY_ARRAY_ABI_TYPE, strategyResults[i].data) as any[];
            for (const strategy of decoded) {
              allStrategies.push({
                id: strategy.id.toString(),
                owner: strategy.owner,
                tokens: [strategy.tokens[0], strategy.tokens[1]],
                orders: [
                  {
                    y: strategy.orders[0].y.toString(),
                    z: strategy.orders[0].z.toString(),
                    A: strategy.orders[0].A.toString(),
                    B: strategy.orders[0].B.toString(),
                  },
                  {
                    y: strategy.orders[1].y.toString(),
                    z: strategy.orders[1].z.toString(),
                    A: strategy.orders[1].A.toString(),
                    B: strategy.orders[1].B.toString(),
                  },
                ],
              });
            }
          } catch (decodeError) {
            this.logger.error(`Error decoding strategies for ${callMetadata[i].pair}: ${decodeError.message}`);
          }
        }
      }

      this.logger.log(`Fetched ${allStrategies.length} strategies for ${deployment.exchangeId}`);

      if (allStrategies.length === 0) {
        return lastBlockNumber;
      }

      // Step 4: Process and save strategies
      await this.saveStrategies(allStrategies, deployment, tokens);

      // Step 5: Remove strategies that no longer exist in the contract
      await this.markDeletedStrategies(allStrategies, deployment);

      // Store the block number in Redis for later retrieval by API instances
      await this.redis.client.set(this.getBlockRedisKey(deployment), lastBlockNumber.toString());

      this.logger.log(
        `Successfully updated ${allStrategies.length} strategies at block ${lastBlockNumber} for ${deployment.exchangeId}`,
      );

      return lastBlockNumber;
    } catch (error) {
      this.logger.error(`Error updating strategies for ${deployment.exchangeId}: ${error.message}`);
      throw error;
    }
  }

  private async saveStrategies(
    strategies: ContractStrategy[],
    deployment: Deployment,
    tokens: TokensByAddress,
  ): Promise<void> {
    // Fetch existing strategies for this deployment to get their IDs
    const existingStrategies = await this.strategyRealtimeRepository.find({
      where: {
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
      },
    });

    // Create a map of strategyId -> existing entity for quick lookup
    const existingMap = new Map<string, StrategyRealtime>();
    for (const existing of existingStrategies) {
      existingMap.set(existing.strategyId, existing);
    }

    const strategyEntities: StrategyRealtime[] = [];

    for (const strategy of strategies) {
      const token0Address = strategy.tokens[0];
      const token1Address = strategy.tokens[1];

      // Get token decimals from the tokens dictionary
      const token0 = tokens[token0Address];
      const token1 = tokens[token1Address];

      if (!token0 || !token1) {
        this.logger.warn(`Missing token info for strategy ${strategy.id}: ${token0Address} or ${token1Address}`);
        continue;
      }

      // Create encoded order JSON strings (same format as existing system)
      const encodedOrder0 = JSON.stringify({
        y: strategy.orders[0].y,
        z: strategy.orders[0].z,
        A: strategy.orders[0].A,
        B: strategy.orders[0].B,
      });
      const encodedOrder1 = JSON.stringify({
        y: strategy.orders[1].y,
        z: strategy.orders[1].z,
        A: strategy.orders[1].A,
        B: strategy.orders[1].B,
      });

      // Use the shared processOrders function from activity.utils
      const decimals0 = new Decimal(token0.decimals);
      const decimals1 = new Decimal(token1.decimals);
      const order0 = parseOrder(encodedOrder0);
      const order1 = parseOrder(encodedOrder1);
      const processed = processOrders(order0, order1, decimals0, decimals1);

      const strategyId = strategy.id.toString();
      const existingEntity = existingMap.get(strategyId);

      // Use existing entity if found, otherwise create new one
      const entity =
        existingEntity ||
        this.strategyRealtimeRepository.create({
          blockchainType: deployment.blockchainType,
          exchangeId: deployment.exchangeId,
          strategyId,
        });

      // Update fields
      entity.owner = strategy.owner;
      entity.token0Address = token0Address;
      entity.token1Address = token1Address;
      // sell side (order0): sellPriceA = min, sellPriceB = max, sellPriceMarg = marginal
      entity.liquidity0 = processed.liquidity0.toString();
      entity.lowestRate0 = processed.sellPriceA.toString();
      entity.highestRate0 = processed.sellPriceB.toString();
      entity.marginalRate0 = processed.sellPriceMarg.toString();
      // buy side (order1): buyPriceA = min, buyPriceB = max, buyPriceMarg = marginal
      entity.liquidity1 = processed.liquidity1.toString();
      entity.lowestRate1 = processed.buyPriceA.toString();
      entity.highestRate1 = processed.buyPriceB.toString();
      entity.marginalRate1 = processed.buyPriceMarg.toString();
      entity.encodedOrder0 = encodedOrder0;
      entity.encodedOrder1 = encodedOrder1;
      entity.deleted = false; // Ensure strategy is marked as active

      strategyEntities.push(entity);
    }

    // Save strategies in batches
    const BATCH_SIZE = 500;
    for (let i = 0; i < strategyEntities.length; i += BATCH_SIZE) {
      const batch = strategyEntities.slice(i, i + BATCH_SIZE);
      await this.strategyRealtimeRepository.save(batch);
    }
  }

  private async markDeletedStrategies(currentStrategies: ContractStrategy[], deployment: Deployment): Promise<void> {
    const currentStrategyIds = currentStrategies.map((s) => s.id.toString());

    // Get all existing strategy IDs for this deployment (only non-deleted ones)
    const existingStrategies = await this.strategyRealtimeRepository.find({
      where: {
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        deleted: false,
      },
      select: ['id', 'strategyId'],
    });

    // Find strategies to mark as deleted
    const toMarkDeleted = existingStrategies.filter((s) => !currentStrategyIds.includes(s.strategyId));

    if (toMarkDeleted.length > 0) {
      await this.strategyRealtimeRepository.update({ id: In(toMarkDeleted.map((s) => s.id)) }, { deleted: true });
      this.logger.log(`Marked ${toMarkDeleted.length} strategies as deleted for ${deployment.exchangeId}`);
    }
  }

  async getStrategiesWithOwners(
    deployment: Deployment,
  ): Promise<{ strategies: StrategyRealtimeWithOwner[]; blockNumber: number }> {
    const strategies = await this.strategyRealtimeRepository.find({
      where: {
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        deleted: false,
      },
      order: { strategyId: 'ASC' },
    });

    const blockNumberStr = await this.redis.client.get(this.getBlockRedisKey(deployment));
    const blockNumber = blockNumberStr ? parseInt(blockNumberStr, 10) : 0;

    return {
      strategies: strategies.map((s) => ({
        strategyId: s.strategyId,
        owner: s.owner,
        token0Address: s.token0Address,
        token1Address: s.token1Address,
        order0: s.encodedOrder0,
        order1: s.encodedOrder1,
        liquidity0: s.liquidity0,
        lowestRate0: s.lowestRate0,
        highestRate0: s.highestRate0,
        marginalRate0: s.marginalRate0,
        liquidity1: s.liquidity1,
        lowestRate1: s.lowestRate1,
        highestRate1: s.highestRate1,
        marginalRate1: s.marginalRate1,
      })),
      blockNumber,
    };
  }
}

export interface StrategyRealtimeWithOwner {
  strategyId: string;
  owner: string;
  token0Address: string;
  token1Address: string;
  order0: string;
  order1: string;
  liquidity0: string;
  lowestRate0: string;
  highestRate0: string;
  marginalRate0: string;
  liquidity1: string;
  lowestRate1: string;
  highestRate1: string;
  marginalRate1: string;
}
