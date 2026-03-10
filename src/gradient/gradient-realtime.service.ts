import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import Web3 from 'web3';
import Decimal from 'decimal.js';
import { GradientStrategyRealtime } from './gradient-strategy-realtime.entity';
import { Deployment, DeploymentService } from '../deployment/deployment.service';
import { HarvesterService, ContractsNames } from '../harvester/harvester.service';
import { TokensByAddress } from '../token/token.service';
import { decodeGradientOrderPrices } from './gradient.math';
import { GradientOrder } from './gradient.interfaces';

const GRADIENT_REALTIME_BLOCK_KEY = 'gradient-realtime:block';

interface GradientContractOrder {
  liquidity: string;
  initialPrice: string;
  tradingStartTime: number;
  expiry: number;
  multiFactor: string;
  gradientType: number;
}

interface GradientContractStrategy {
  id: string;
  owner: string;
  tokens: [string, string];
  orders: [GradientContractOrder, GradientContractOrder];
}

const GRADIENT_STRATEGY_ARRAY_ABI_TYPE = {
  type: 'tuple[]',
  components: [
    { name: 'id', type: 'uint256' },
    { name: 'owner', type: 'address' },
    { name: 'tokens', type: 'address[2]' },
    {
      name: 'orders',
      type: 'tuple[2]',
      components: [
        { name: 'liquidity', type: 'uint128' },
        { name: 'initialPrice', type: 'uint64' },
        { name: 'tradingStartTime', type: 'uint32' },
        { name: 'expiry', type: 'uint32' },
        { name: 'multiFactor', type: 'uint32' },
        { name: 'gradientType', type: 'uint8' },
      ],
    },
  ],
};

export interface GradientRealtimeWithOwner {
  strategyId: string;
  owner: string;
  token0Address: string;
  token1Address: string;
  order0Liquidity: string;
  order0InitialPrice: string;
  order0TradingStartTime: number;
  order0Expiry: number;
  order0MultiFactor: string;
  order0GradientType: string;
  order1Liquidity: string;
  order1InitialPrice: string;
  order1TradingStartTime: number;
  order1Expiry: number;
  order1MultiFactor: string;
  order1GradientType: string;
}

@Injectable()
export class GradientRealtimeService {
  private readonly logger = new Logger(GradientRealtimeService.name);

  constructor(
    @InjectRepository(GradientStrategyRealtime)
    private gradientRealtimeRepository: Repository<GradientStrategyRealtime>,
    private harvesterService: HarvesterService,
    private deploymentService: DeploymentService,
    @Inject('REDIS') private redis: any,
  ) {}

  private getDeploymentKey(deployment: Deployment): string {
    return `${deployment.blockchainType}-${deployment.exchangeId}`;
  }

  private getBlockRedisKey(deployment: Deployment): string {
    return `${GRADIENT_REALTIME_BLOCK_KEY}:${this.getDeploymentKey(deployment)}`;
  }

  async update(deployment: Deployment, tokens: TokensByAddress): Promise<number> {
    if (!this.deploymentService.hasGradientSupport(deployment)) {
      return 0;
    }

    const gradientController = this.harvesterService.getContract(
      ContractsNames.GradientController,
      undefined,
      undefined,
      deployment,
    );
    const contractAddress = deployment.contracts.GradientController.address;
    const web3 = new Web3(deployment.rpcEndpoint);
    let lastBlockNumber = 0;

    try {
      const rawPairs = await gradientController.methods.pairs(0, 10000).call();
      const pairs: [string, string][] = Array.from(rawPairs).map((p: any) => [p[0] || p.token0, p[1] || p.token1]);
      this.logger.log(`[Gradient] Found ${pairs.length} pairs for ${deployment.exchangeId}`);

      if (pairs.length === 0) {
        return lastBlockNumber;
      }

      const countCallsEncoded = pairs.map(([token0, token1]) =>
        gradientController.methods.strategiesByPairCount(token0, token1).encodeABI(),
      );

      const { results: countResults, blockNumber: countBlockNumber } =
        await this.harvesterService.genericMulticall(contractAddress, countCallsEncoded, deployment);
      lastBlockNumber = countBlockNumber;

      const pairsWithCounts: { pair: [string, string]; count: number }[] = [];
      for (let i = 0; i < pairs.length; i++) {
        if (countResults[i].success) {
          const count = parseInt(countResults[i].data, 16);
          if (count > 0) {
            pairsWithCounts.push({ pair: pairs[i], count });
          }
        }
      }

      this.logger.log(`[Gradient] Found ${pairsWithCounts.length} pairs with strategies for ${deployment.exchangeId}`);

      if (pairsWithCounts.length === 0) {
        await this.markDeletedStrategies([], deployment);
        return lastBlockNumber;
      }

      const STRATEGY_CHUNK_SIZE = 100;
      const strategyCallsEncoded: string[] = [];
      const callMetadata: { pair: [string, string]; startIndex: number; endIndex: number }[] = [];

      for (const { pair, count } of pairsWithCounts) {
        const [token0, token1] = pair;
        for (let startIndex = 0; startIndex < count; startIndex += STRATEGY_CHUNK_SIZE) {
          const endIndex = Math.min(startIndex + STRATEGY_CHUNK_SIZE, count);
          strategyCallsEncoded.push(
            gradientController.methods.strategiesByPair(token0, token1, startIndex, endIndex).encodeABI(),
          );
          callMetadata.push({ pair, startIndex, endIndex });
        }
      }

      this.logger.log(
        `[Gradient] Making ${strategyCallsEncoded.length} strategiesByPair calls via multicall for ${deployment.exchangeId}`,
      );

      const { results: strategyResults, blockNumber: strategyBlockNumber } =
        await this.harvesterService.genericMulticall(contractAddress, strategyCallsEncoded, deployment);
      lastBlockNumber = strategyBlockNumber;

      const allStrategies: GradientContractStrategy[] = [];
      for (let i = 0; i < strategyResults.length; i++) {
        if (strategyResults[i].success && strategyResults[i].data !== '0x') {
          try {
            const decoded = web3.eth.abi.decodeParameter(
              GRADIENT_STRATEGY_ARRAY_ABI_TYPE,
              strategyResults[i].data,
            ) as any[];
            for (const strategy of decoded) {
              allStrategies.push({
                id: strategy.id.toString(),
                owner: strategy.owner,
                tokens: [strategy.tokens[0], strategy.tokens[1]],
                orders: [
                  {
                    liquidity: strategy.orders[0].liquidity.toString(),
                    initialPrice: strategy.orders[0].initialPrice.toString(),
                    tradingStartTime: Number(strategy.orders[0].tradingStartTime),
                    expiry: Number(strategy.orders[0].expiry),
                    multiFactor: strategy.orders[0].multiFactor.toString(),
                    gradientType: Number(strategy.orders[0].gradientType),
                  },
                  {
                    liquidity: strategy.orders[1].liquidity.toString(),
                    initialPrice: strategy.orders[1].initialPrice.toString(),
                    tradingStartTime: Number(strategy.orders[1].tradingStartTime),
                    expiry: Number(strategy.orders[1].expiry),
                    multiFactor: strategy.orders[1].multiFactor.toString(),
                    gradientType: Number(strategy.orders[1].gradientType),
                  },
                ],
              });
            }
          } catch (decodeError) {
            this.logger.error(
              `[Gradient] Error decoding strategies for ${callMetadata[i].pair}: ${decodeError.message}`,
            );
          }
        }
      }

      this.logger.log(`[Gradient] Fetched ${allStrategies.length} strategies for ${deployment.exchangeId}`);

      if (allStrategies.length === 0) {
        return lastBlockNumber;
      }

      await this.saveStrategies(allStrategies, deployment);
      await this.markDeletedStrategies(allStrategies, deployment);

      await this.redis.client.set(this.getBlockRedisKey(deployment), lastBlockNumber.toString());

      this.logger.log(
        `[Gradient] Successfully updated ${allStrategies.length} strategies at block ${lastBlockNumber} for ${deployment.exchangeId}`,
      );

      return lastBlockNumber;
    } catch (error) {
      this.logger.error(`[Gradient] Error updating strategies for ${deployment.exchangeId}: ${error.message}`);
      throw error;
    }
  }

  private async saveStrategies(strategies: GradientContractStrategy[], deployment: Deployment): Promise<void> {
    const existingStrategies = await this.gradientRealtimeRepository.find({
      where: {
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
      },
    });

    const existingMap = new Map<string, GradientStrategyRealtime>();
    for (const existing of existingStrategies) {
      existingMap.set(existing.strategyId, existing);
    }

    const entities: GradientStrategyRealtime[] = [];

    for (const strategy of strategies) {
      const strategyId = strategy.id.toString();
      const existingEntity = existingMap.get(strategyId);

      const entity =
        existingEntity ||
        this.gradientRealtimeRepository.create({
          blockchainType: deployment.blockchainType,
          exchangeId: deployment.exchangeId,
          strategyId,
        });

      entity.owner = strategy.owner;
      entity.token0Address = strategy.tokens[0];
      entity.token1Address = strategy.tokens[1];

      entity.order0Liquidity = strategy.orders[0].liquidity;
      entity.order0InitialPrice = strategy.orders[0].initialPrice;
      entity.order0TradingStartTime = strategy.orders[0].tradingStartTime;
      entity.order0Expiry = strategy.orders[0].expiry;
      entity.order0MultiFactor = strategy.orders[0].multiFactor;
      entity.order0GradientType = strategy.orders[0].gradientType.toString();

      entity.order1Liquidity = strategy.orders[1].liquidity;
      entity.order1InitialPrice = strategy.orders[1].initialPrice;
      entity.order1TradingStartTime = strategy.orders[1].tradingStartTime;
      entity.order1Expiry = strategy.orders[1].expiry;
      entity.order1MultiFactor = strategy.orders[1].multiFactor;
      entity.order1GradientType = strategy.orders[1].gradientType.toString();

      entity.deleted = false;
      entities.push(entity);
    }

    const BATCH_SIZE = 500;
    for (let i = 0; i < entities.length; i += BATCH_SIZE) {
      const batch = entities.slice(i, i + BATCH_SIZE);
      await this.gradientRealtimeRepository.save(batch);
    }
  }

  private async markDeletedStrategies(
    currentStrategies: GradientContractStrategy[],
    deployment: Deployment,
  ): Promise<void> {
    const currentStrategyIds = currentStrategies.map((s) => s.id.toString());

    const existingStrategies = await this.gradientRealtimeRepository.find({
      where: {
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        deleted: false,
      },
      select: ['id', 'strategyId'],
    });

    const toMarkDeleted = existingStrategies.filter((s) => !currentStrategyIds.includes(s.strategyId));

    if (toMarkDeleted.length > 0) {
      await this.gradientRealtimeRepository.update(
        { id: In(toMarkDeleted.map((s) => s.id)) },
        { deleted: true },
      );
      this.logger.log(`[Gradient] Marked ${toMarkDeleted.length} strategies as deleted for ${deployment.exchangeId}`);
    }
  }

  async getStrategiesWithOwners(
    deployment: Deployment,
  ): Promise<{
    strategies: GradientRealtimeWithOwner[];
    blockNumber: number;
  }> {
    const strategies = await this.gradientRealtimeRepository.find({
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
        order0Liquidity: s.order0Liquidity,
        order0InitialPrice: s.order0InitialPrice,
        order0TradingStartTime: s.order0TradingStartTime,
        order0Expiry: s.order0Expiry,
        order0MultiFactor: s.order0MultiFactor,
        order0GradientType: s.order0GradientType,
        order1Liquidity: s.order1Liquidity,
        order1InitialPrice: s.order1InitialPrice,
        order1TradingStartTime: s.order1TradingStartTime,
        order1Expiry: s.order1Expiry,
        order1MultiFactor: s.order1MultiFactor,
        order1GradientType: s.order1GradientType,
      })),
      blockNumber,
    };
  }

  /**
   * Convert a raw gradient realtime strategy to a GradientOrder for API display.
   * Normalizes liquidity by token decimals and computes prices via gradient math.
   */
  static toGradientOrder(
    strategy: GradientRealtimeWithOwner,
    orderIndex: 0 | 1,
    tokenDecimals: number,
  ): GradientOrder {
    const now = Math.ceil(Date.now() / 1000);
    const liquidity = orderIndex === 0 ? strategy.order0Liquidity : strategy.order1Liquidity;
    const initialPrice = orderIndex === 0 ? strategy.order0InitialPrice : strategy.order1InitialPrice;
    const multiFactor = orderIndex === 0 ? strategy.order0MultiFactor : strategy.order1MultiFactor;
    const gradientType = orderIndex === 0 ? strategy.order0GradientType : strategy.order1GradientType;
    const tradingStartTime = orderIndex === 0 ? strategy.order0TradingStartTime : strategy.order1TradingStartTime;
    const expiryTime = orderIndex === 0 ? strategy.order0Expiry : strategy.order1Expiry;

    const { startPrice, endPrice, marginalPrice } = decodeGradientOrderPrices(
      initialPrice,
      multiFactor,
      gradientType,
      tradingStartTime,
      expiryTime,
      now,
    );

    const normalizedBudget = new Decimal(liquidity).div(new Decimal(10).pow(tokenDecimals));

    return {
      startPrice: startPrice.toString(),
      endPrice: endPrice.toString(),
      startDate: tradingStartTime.toString(),
      endDate: expiryTime.toString(),
      budget: normalizedBudget.toString(),
      marginalPrice: marginalPrice.toString(),
    };
  }
}
