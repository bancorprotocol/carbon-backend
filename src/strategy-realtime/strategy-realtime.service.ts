import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import Web3 from 'web3';
import { WebSocketProvider } from 'web3-providers-ws';
import Decimal from 'decimal.js';
import { StrategyRealtime } from './strategy-realtime.entity';
import { Deployment } from '../deployment/deployment.service';
import { TokensByAddress, TokenService } from '../token/token.service';
import { HarvesterService, ContractsNames } from '../harvester/harvester.service';
import { parseOrder, processOrders } from '../activity/activity.utils';
import { CarbonController as CarbonControllerABI } from '../abis/CarbonController.abi';
import { CarbonVoucher as CarbonVoucherABI } from '../abis/CarbonVoucher.abi';

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

interface WssChannel {
  deployment: Deployment;
  tokens: TokensByAddress;
  provider: any;
  web3: any;
  subs: any[];
  keepalive: ReturnType<typeof setInterval> | null;
  connectedOnce: boolean;
  resubscribing: boolean;
}

@Injectable()
export class StrategyRealtimeService implements OnModuleDestroy {
  private readonly logger = new Logger(StrategyRealtimeService.name);
  private channels = new Map<string, WssChannel>();

  constructor(
    @InjectRepository(StrategyRealtime)
    private strategyRealtimeRepository: Repository<StrategyRealtime>,
    private harvesterService: HarvesterService,
    private tokenService: TokenService,
    @Inject('REDIS') private redis: any,
  ) {}

  onModuleDestroy() {
    this.stopAllEventListeners();
  }

  private getDeploymentKey(deployment: Deployment): string {
    return `${deployment.blockchainType}-${deployment.exchangeId}`;
  }

  private getBlockRedisKey(deployment: Deployment): string {
    return `${STRATEGY_REALTIME_BLOCK_KEY}:${this.getDeploymentKey(deployment)}`;
  }

  // ─── WSS Event Listener ──────────────────────────────────────────────

  async startEventListener(deployment: Deployment, tokens: TokensByAddress): Promise<void> {
    if (!deployment.wssEndpoint) {
      this.logger.warn(`No WSS endpoint configured for ${deployment.exchangeId}, skipping event listener`);
      return;
    }

    const key = this.getDeploymentKey(deployment);
    await this.stopChannel(key);

    const channel: WssChannel = {
      deployment,
      tokens,
      provider: null,
      web3: null,
      subs: [],
      keepalive: null,
      connectedOnce: false,
      resubscribing: false,
    };
    this.channels.set(key, channel);

    try {
      channel.provider = new WebSocketProvider(
        deployment.wssEndpoint,
        {},
        {
          autoReconnect: true,
          delay: 1000,
          maxAttempts: Number.MAX_SAFE_INTEGER,
        },
      );

      channel.web3 = new Web3(channel.provider);

      channel.provider.on('connect', () => {
        if (!channel.connectedOnce) {
          channel.connectedOnce = true;
          return;
        }
        this.logger.log(`WSS reconnected for ${deployment.exchangeId}, re-subscribing...`);
        this.resubscribe(channel).catch((err) =>
          this.logger.error(`WSS re-subscribe failed for ${deployment.exchangeId}: ${err.message}`),
        );
      });

      channel.provider.on('disconnect', () => {
        this.logger.warn(`WSS disconnected for ${deployment.exchangeId}, waiting for auto-reconnect...`);
      });

      await this.subscribe(channel);

      channel.keepalive = setInterval(async () => {
        try {
          await channel.web3.eth.getBlockNumber();
        } catch {
          this.logger.warn(`WSS keepalive ping failed for ${deployment.exchangeId}`);
        }
      }, 30000);

      this.logger.log(`WSS event listener started for ${deployment.exchangeId} at ${deployment.wssEndpoint}`);
    } catch (error) {
      this.logger.error(`Failed to start WSS event listener for ${deployment.exchangeId}: ${error.message}`);
      await this.stopChannel(key);
    }
  }

  private async subscribe(channel: WssChannel): Promise<void> {
    const { deployment, web3 } = channel;
    const controllerAddress = deployment.contracts.CarbonController.address;
    const controllerContract = new web3.eth.Contract(CarbonControllerABI, controllerAddress);

    const voucherAddress = deployment.contracts.CarbonVoucher?.address;
    const voucherContract = voucherAddress ? new web3.eth.Contract(CarbonVoucherABI, voucherAddress) : null;

    const createdSub = await (controllerContract.events as any).StrategyCreated();
    createdSub.on('data', (event: any) => this.handleEvent('StrategyCreated', event, channel));
    createdSub.on('error', (err: any) =>
      this.logger.error(`WSS StrategyCreated error for ${deployment.exchangeId}: ${err.message}`),
    );
    channel.subs.push(createdSub);

    const updatedSub = await (controllerContract.events as any).StrategyUpdated();
    updatedSub.on('data', (event: any) => this.handleEvent('StrategyUpdated', event, channel));
    updatedSub.on('error', (err: any) =>
      this.logger.error(`WSS StrategyUpdated error for ${deployment.exchangeId}: ${err.message}`),
    );
    channel.subs.push(updatedSub);

    const deletedSub = await (controllerContract.events as any).StrategyDeleted();
    deletedSub.on('data', (event: any) => this.handleEvent('StrategyDeleted', event, channel));
    deletedSub.on('error', (err: any) =>
      this.logger.error(`WSS StrategyDeleted error for ${deployment.exchangeId}: ${err.message}`),
    );
    channel.subs.push(deletedSub);

    if (voucherContract) {
      const transferSub = await (voucherContract.events as any).Transfer();
      transferSub.on('data', (event: any) => this.handleEvent('Transfer', event, channel));
      transferSub.on('error', (err: any) =>
        this.logger.error(`WSS VoucherTransfer error for ${deployment.exchangeId}: ${err.message}`),
      );
      channel.subs.push(transferSub);
    }
  }

  private async resubscribe(channel: WssChannel): Promise<void> {
    if (channel.resubscribing) return;
    channel.resubscribing = true;

    try {
      for (const sub of channel.subs) {
        try {
          sub.unsubscribe?.();
        } catch {
          /* old subs are already dead */
        }
      }
      channel.subs = [];

      await this.subscribe(channel);
      this.logger.log(`WSS re-subscribed successfully for ${channel.deployment.exchangeId}`);
    } finally {
      channel.resubscribing = false;
    }
  }

  async stopChannel(key: string): Promise<void> {
    const channel = this.channels.get(key);
    if (!channel) return;
    this.channels.delete(key);

    if (channel.keepalive) {
      clearInterval(channel.keepalive);
      channel.keepalive = null;
    }

    for (const sub of channel.subs) {
      try {
        sub.unsubscribe?.();
      } catch {
        /* ignore cleanup errors */
      }
    }
    channel.subs = [];

    if (channel.provider) {
      try {
        channel.provider.disconnect?.();
      } catch {
        /* ignore */
      }
      channel.provider = null;
    }
    channel.web3 = null;
  }

  stopAllEventListeners(): void {
    for (const key of [...this.channels.keys()]) {
      this.stopChannel(key).catch(() => undefined);
    }
  }

  updateTokens(deployment: Deployment, tokens: TokensByAddress): void {
    const channel = this.channels.get(this.getDeploymentKey(deployment));
    if (channel) channel.tokens = tokens;
  }

  private async handleEvent(eventName: string, event: any, channel: WssChannel): Promise<void> {
    const blockNumber = Number(event.blockNumber);
    const returnValues = event.returnValues;
    const { deployment, tokens } = channel;

    try {
      switch (eventName) {
        case 'StrategyCreated':
          await this.applyStrategyCreated(returnValues, blockNumber, deployment, tokens);
          break;
        case 'StrategyUpdated':
          await this.applyStrategyUpdated(returnValues, blockNumber, deployment, tokens);
          break;
        case 'StrategyDeleted':
          await this.applyStrategyDeleted(returnValues, blockNumber, deployment);
          break;
        case 'Transfer':
          await this.applyVoucherTransfer(returnValues, blockNumber, deployment);
          break;
      }

      await this.redis.client.set(this.getBlockRedisKey(deployment), blockNumber.toString());
      this.logger.log(`WSS ${eventName} processed at block ${blockNumber} for ${deployment.exchangeId}`);
    } catch (error) {
      this.logger.error(
        `Error processing WSS ${eventName} at block ${blockNumber} for ${deployment.exchangeId}: ${error.message}`,
      );
    }
  }

  // ─── Token Resolution ──────────────────────────────────────────────

  private async resolveToken(
    address: string,
    tokens: TokensByAddress,
    deployment: Deployment,
  ): Promise<{ decimals: number } | null> {
    if (tokens[address]) return tokens[address];

    try {
      const token = await this.tokenService.getOrCreateTokenByAddress(address, deployment);
      tokens[address] = token;
      return token;
    } catch (error) {
      this.logger.error(`Failed to fetch token metadata for ${address}: ${error.message}`);
      return null;
    }
  }

  // ─── Event Handlers ──────────────────────────────────────────────────

  async applyStrategyCreated(
    returnValues: any,
    blockNumber: number,
    deployment: Deployment,
    tokens: TokensByAddress,
  ): Promise<boolean> {
    const strategyId = returnValues.id.toString();
    const owner = returnValues.owner;
    const token0Address = returnValues.token0;
    const token1Address = returnValues.token1;

    const token0 = await this.resolveToken(token0Address, tokens, deployment);
    const token1 = await this.resolveToken(token1Address, tokens, deployment);
    if (!token0 || !token1) {
      this.logger.warn(`WSS StrategyCreated: unable to resolve token info for ${strategyId}`);
      return false;
    }

    const orderFields = this.buildOrderFields(returnValues.order0, returnValues.order1, token0, token1);

    const updateFields: Partial<StrategyRealtime> = {
      owner,
      token0Address,
      token1Address,
      ...orderFields,
      deleted: false,
    };

    return this.guardedWrite(strategyId, deployment, blockNumber, updateFields, updateFields);
  }

  async applyStrategyUpdated(
    returnValues: any,
    blockNumber: number,
    deployment: Deployment,
    tokens: TokensByAddress,
  ): Promise<boolean> {
    const strategyId = returnValues.id.toString();
    const token0Address = returnValues.token0;
    const token1Address = returnValues.token1;

    const token0 = await this.resolveToken(token0Address, tokens, deployment);
    const token1 = await this.resolveToken(token1Address, tokens, deployment);
    if (!token0 || !token1) {
      this.logger.warn(`WSS StrategyUpdated: unable to resolve token info for ${strategyId}`);
      return false;
    }

    const orderFields = this.buildOrderFields(returnValues.order0, returnValues.order1, token0, token1);

    const updateFields: Partial<StrategyRealtime> = {
      token0Address,
      token1Address,
      ...orderFields,
      deleted: false,
    };

    return this.guardedWrite(strategyId, deployment, blockNumber, updateFields);
  }

  async applyStrategyDeleted(returnValues: any, blockNumber: number, deployment: Deployment): Promise<boolean> {
    const strategyId = returnValues.id.toString();
    return this.guardedWrite(strategyId, deployment, blockNumber, { deleted: true });
  }

  async applyVoucherTransfer(returnValues: any, blockNumber: number, deployment: Deployment): Promise<boolean> {
    const strategyId = returnValues.tokenId.toString();
    const newOwner = returnValues.to;
    return this.guardedWrite(strategyId, deployment, blockNumber, { owner: newOwner });
  }

  private buildOrderFields(
    rawOrder0: any,
    rawOrder1: any,
    token0: { decimals: number },
    token1: { decimals: number },
  ): Partial<StrategyRealtime> {
    const encodedOrder0 = JSON.stringify({
      y: rawOrder0.y.toString(),
      z: rawOrder0.z.toString(),
      A: rawOrder0.A.toString(),
      B: rawOrder0.B.toString(),
    });
    const encodedOrder1 = JSON.stringify({
      y: rawOrder1.y.toString(),
      z: rawOrder1.z.toString(),
      A: rawOrder1.A.toString(),
      B: rawOrder1.B.toString(),
    });

    const decimals0 = new Decimal(token0.decimals);
    const decimals1 = new Decimal(token1.decimals);
    const order0 = parseOrder(encodedOrder0);
    const order1 = parseOrder(encodedOrder1);
    const processed = processOrders(order0, order1, decimals0, decimals1);

    return {
      liquidity0: processed.liquidity0.toString(),
      lowestRate0: processed.sellPriceA.toString(),
      highestRate0: processed.sellPriceB.toString(),
      marginalRate0: processed.sellPriceMarg.toString(),
      liquidity1: processed.liquidity1.toString(),
      lowestRate1: processed.buyPriceA.toString(),
      highestRate1: processed.buyPriceB.toString(),
      marginalRate1: processed.buyPriceMarg.toString(),
      encodedOrder0,
      encodedOrder1,
    };
  }

  // ─── Guarded Write ───────────────────────────────────────────────────

  /**
   * Atomically update a strategy row only if the incoming blockNumber is >= the existing updatedAtBlock.
   * If the row doesn't exist and createFields is provided, insert it.
   * Returns true if a write occurred, false if skipped (DB had newer data).
   */
  async guardedWrite(
    strategyId: string,
    deployment: Deployment,
    blockNumber: number,
    updateFields: Partial<StrategyRealtime>,
    createFields?: Partial<StrategyRealtime>,
  ): Promise<boolean> {
    const result = await this.strategyRealtimeRepository
      .createQueryBuilder()
      .update(StrategyRealtime)
      .set({ ...updateFields, updatedAtBlock: blockNumber })
      .where('"blockchainType" = :blockchainType', { blockchainType: deployment.blockchainType })
      .andWhere('"exchangeId" = :exchangeId', { exchangeId: deployment.exchangeId })
      .andWhere('"strategyId" = :strategyId', { strategyId })
      .andWhere('("updatedAtBlock" IS NULL OR "updatedAtBlock" <= :blockNumber)', { blockNumber })
      .execute();

    if (result.affected && result.affected > 0) {
      return true;
    }

    if (createFields) {
      try {
        const entity = this.strategyRealtimeRepository.create({
          ...createFields,
          strategyId,
          blockchainType: deployment.blockchainType,
          exchangeId: deployment.exchangeId,
          updatedAtBlock: blockNumber,
        });
        await this.strategyRealtimeRepository.save(entity);
        return true;
      } catch (e: any) {
        if (e.code === '23505') {
          // Row was inserted concurrently — retry the update (without createFields to avoid infinite loop)
          return this.guardedWrite(strategyId, deployment, blockNumber, updateFields);
        }
        throw e;
      }
    }

    return false;
  }

  // ─── Full Contract Sync (existing + guarded) ─────────────────────────

  async update(deployment: Deployment, tokens: TokensByAddress, guarded = false): Promise<number> {
    const carbonController = this.harvesterService.getContract(
      ContractsNames.CarbonController,
      undefined,
      undefined,
      deployment,
    );
    const contractAddress = deployment.contracts.CarbonController.address;
    const web3 = new Web3(deployment.rpcEndpoint);
    let lastBlockNumber = 0;

    try {
      const pairs: [string, string][] = await carbonController.methods.pairs().call();
      this.logger.log(`Found ${pairs.length} pairs for ${deployment.exchangeId}`);

      if (pairs.length === 0) {
        return lastBlockNumber;
      }

      const countCallsEncoded = pairs.map(([token0, token1]) =>
        carbonController.methods.strategiesByPairCount(token0, token1).encodeABI(),
      );

      const { results: countResults, blockNumber: countBlockNumber } = await this.harvesterService.genericMulticall(
        contractAddress,
        countCallsEncoded,
        deployment,
      );
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

      this.logger.log(`Found ${pairsWithCounts.length} pairs with strategies for ${deployment.exchangeId}`);

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

      await this.saveStrategies(allStrategies, deployment, tokens, lastBlockNumber);

      if (!guarded) {
        await this.markDeletedStrategies(allStrategies, deployment);
      }

      await this.redis.client.set(this.getBlockRedisKey(deployment), lastBlockNumber.toString());

      const mode = guarded ? ' (guarded)' : '';
      this.logger.log(
        `Successfully updated ${allStrategies.length} strategies at block ${lastBlockNumber} for ${deployment.exchangeId}${mode}`,
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
    syncBlock?: number,
  ): Promise<void> {
    const existingStrategies = await this.strategyRealtimeRepository.find({
      where: {
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
      },
    });

    const existingMap = new Map<string, StrategyRealtime>();
    for (const existing of existingStrategies) {
      existingMap.set(existing.strategyId, existing);
    }

    const strategyEntities: StrategyRealtime[] = [];

    for (const strategy of strategies) {
      const token0Address = strategy.tokens[0];
      const token1Address = strategy.tokens[1];

      const token0 = tokens[token0Address];
      const token1 = tokens[token1Address];

      if (!token0 || !token1) {
        this.logger.warn(`Missing token info for strategy ${strategy.id}: ${token0Address} or ${token1Address}`);
        continue;
      }

      const strategyId = strategy.id.toString();
      const existingEntity = existingMap.get(strategyId);

      if (
        syncBlock !== undefined &&
        existingEntity?.updatedAtBlock != null &&
        existingEntity.updatedAtBlock > syncBlock
      ) {
        continue;
      }

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

      const decimals0 = new Decimal(token0.decimals);
      const decimals1 = new Decimal(token1.decimals);
      const order0 = parseOrder(encodedOrder0);
      const order1 = parseOrder(encodedOrder1);
      const processed = processOrders(order0, order1, decimals0, decimals1);

      // Always build a fresh entity (without the existing PK `id`) so the
      // batched upsert below resolves conflicts on the unique key
      // (blockchainType, exchangeId, strategyId) rather than on the PK. This
      // keeps saveStrategies idempotent against concurrent writers (the
      // initial WSS sync, the 60s guarded safety-net sync, the polling
      // fallback, and WSS event handlers writing via guardedWrite).
      const entity = this.strategyRealtimeRepository.create({
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        strategyId,
        owner: strategy.owner,
        token0Address,
        token1Address,
        liquidity0: processed.liquidity0.toString(),
        lowestRate0: processed.sellPriceA.toString(),
        highestRate0: processed.sellPriceB.toString(),
        marginalRate0: processed.sellPriceMarg.toString(),
        liquidity1: processed.liquidity1.toString(),
        lowestRate1: processed.buyPriceA.toString(),
        highestRate1: processed.buyPriceB.toString(),
        marginalRate1: processed.buyPriceMarg.toString(),
        encodedOrder0,
        encodedOrder1,
        deleted: false,
        ...(syncBlock !== undefined ? { updatedAtBlock: syncBlock } : {}),
      });

      strategyEntities.push(entity);
    }

    const BATCH_SIZE = 500;
    for (let i = 0; i < strategyEntities.length; i += BATCH_SIZE) {
      const batch = strategyEntities.slice(i, i + BATCH_SIZE);
      await this.strategyRealtimeRepository.upsert(batch, {
        conflictPaths: ['blockchainType', 'exchangeId', 'strategyId'],
        skipUpdateIfNoValuesChanged: true,
      });
    }
  }

  private async markDeletedStrategies(currentStrategies: ContractStrategy[], deployment: Deployment): Promise<void> {
    const currentStrategyIds = currentStrategies.map((s) => s.id.toString());

    const existingStrategies = await this.strategyRealtimeRepository.find({
      where: {
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        deleted: false,
      },
      select: ['id', 'strategyId'],
    });

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
