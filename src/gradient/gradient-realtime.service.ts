import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import Web3 from 'web3';
import { WebSocketProvider } from 'web3-providers-ws';
import Decimal from 'decimal.js';
import { GradientStrategyRealtime } from './gradient-strategy-realtime.entity';
import { Deployment, DeploymentService } from '../deployment/deployment.service';
import { HarvesterService, ContractsNames } from '../harvester/harvester.service';
import { TokensByAddress, TokenService } from '../token/token.service';
import { decodeGradientOrderPrices } from './gradient.math';
import { GradientOrder } from './gradient.interfaces';
import { GradientController as GradientControllerABI } from '../abis/GradientController.abi';
import { CarbonVoucher as CarbonVoucherABI } from '../abis/CarbonVoucher.abi';

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
export class GradientRealtimeService implements OnModuleDestroy {
  private readonly logger = new Logger(GradientRealtimeService.name);
  private channels = new Map<string, WssChannel>();

  constructor(
    @InjectRepository(GradientStrategyRealtime)
    private gradientRealtimeRepository: Repository<GradientStrategyRealtime>,
    private harvesterService: HarvesterService,
    private deploymentService: DeploymentService,
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
    return `${GRADIENT_REALTIME_BLOCK_KEY}:${this.getDeploymentKey(deployment)}`;
  }

  // ─── WSS Event Listener ──────────────────────────────────────────────

  async startEventListener(deployment: Deployment, tokens: TokensByAddress): Promise<void> {
    if (!this.deploymentService.hasGradientSupport(deployment)) {
      return;
    }
    if (!deployment.wssEndpoint) {
      this.logger.warn(
        `[Gradient] No WSS endpoint configured for ${deployment.exchangeId}, skipping event listener`,
      );
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
        this.logger.log(`[Gradient] WSS reconnected for ${deployment.exchangeId}, re-subscribing...`);
        this.resubscribe(channel).catch((err) =>
          this.logger.error(`[Gradient] WSS re-subscribe failed for ${deployment.exchangeId}: ${err.message}`),
        );
      });

      channel.provider.on('disconnect', () => {
        this.logger.warn(`[Gradient] WSS disconnected for ${deployment.exchangeId}, waiting for auto-reconnect...`);
      });

      await this.subscribe(channel);

      channel.keepalive = setInterval(async () => {
        try {
          await channel.web3.eth.getBlockNumber();
        } catch {
          this.logger.warn(`[Gradient] WSS keepalive ping failed for ${deployment.exchangeId}`);
        }
      }, 30000);

      this.logger.log(
        `[Gradient] WSS event listener started for ${deployment.exchangeId} at ${deployment.wssEndpoint}`,
      );
    } catch (error) {
      this.logger.error(
        `[Gradient] Failed to start WSS event listener for ${deployment.exchangeId}: ${error.message}`,
      );
      await this.stopChannel(key);
    }
  }

  private async subscribe(channel: WssChannel): Promise<void> {
    const { deployment, web3 } = channel;
    const controllerAddress = deployment.contracts.GradientController?.address;
    if (!controllerAddress) return;

    const controllerContract = new web3.eth.Contract(GradientControllerABI, controllerAddress);

    const voucherAddress = deployment.contracts.GradientVoucher?.address;
    const voucherContract = voucherAddress ? new web3.eth.Contract(CarbonVoucherABI, voucherAddress) : null;

    const createdSub = await (controllerContract.events as any).StrategyCreated();
    createdSub.on('data', (event: any) => this.handleEvent('StrategyCreated', event, channel));
    createdSub.on('error', (err: any) =>
      this.logger.error(`[Gradient] WSS StrategyCreated error for ${deployment.exchangeId}: ${err.message}`),
    );
    channel.subs.push(createdSub);

    const updatedSub = await (controllerContract.events as any).StrategyUpdated();
    updatedSub.on('data', (event: any) => this.handleEvent('StrategyUpdated', event, channel));
    updatedSub.on('error', (err: any) =>
      this.logger.error(`[Gradient] WSS StrategyUpdated error for ${deployment.exchangeId}: ${err.message}`),
    );
    channel.subs.push(updatedSub);

    const deletedSub = await (controllerContract.events as any).StrategyDeleted();
    deletedSub.on('data', (event: any) => this.handleEvent('StrategyDeleted', event, channel));
    deletedSub.on('error', (err: any) =>
      this.logger.error(`[Gradient] WSS StrategyDeleted error for ${deployment.exchangeId}: ${err.message}`),
    );
    channel.subs.push(deletedSub);

    const liquiditySub = await (controllerContract.events as any).StrategyLiquidityUpdated();
    liquiditySub.on('data', (event: any) => this.handleEvent('StrategyLiquidityUpdated', event, channel));
    liquiditySub.on('error', (err: any) =>
      this.logger.error(
        `[Gradient] WSS StrategyLiquidityUpdated error for ${deployment.exchangeId}: ${err.message}`,
      ),
    );
    channel.subs.push(liquiditySub);

    if (voucherContract) {
      const transferSub = await (voucherContract.events as any).Transfer();
      transferSub.on('data', (event: any) => this.handleEvent('Transfer', event, channel));
      transferSub.on('error', (err: any) =>
        this.logger.error(
          `[Gradient] WSS GradientVoucher Transfer error for ${deployment.exchangeId}: ${err.message}`,
        ),
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
          /* old subs may already be dead */
        }
      }
      channel.subs = [];

      await this.subscribe(channel);
      this.logger.log(`[Gradient] WSS re-subscribed successfully for ${channel.deployment.exchangeId}`);
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
        case 'StrategyLiquidityUpdated':
          await this.applyStrategyLiquidityUpdated(returnValues, blockNumber, deployment);
          break;
        case 'Transfer':
          await this.applyVoucherTransfer(returnValues, blockNumber, deployment);
          break;
      }

      await this.redis.client.set(this.getBlockRedisKey(deployment), blockNumber.toString());
      this.logger.log(
        `[Gradient] WSS ${eventName} processed at block ${blockNumber} for ${deployment.exchangeId}`,
      );
    } catch (error) {
      this.logger.error(
        `[Gradient] Error processing WSS ${eventName} at block ${blockNumber} for ${deployment.exchangeId}: ${error.message}`,
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
      this.logger.error(`[Gradient] Failed to fetch token metadata for ${address}: ${error.message}`);
      return null;
    }
  }

  // ─── Event Handlers ──────────────────────────────────────────────────

  private buildOrderFieldsFromEvent(rawOrder0: any, rawOrder1: any): Partial<GradientStrategyRealtime> {
    const parse = (o: any) => ({
      liquidity: (o.liquidity ?? o[0]).toString(),
      initialPrice: (o.initialPrice ?? o[1]).toString(),
      tradingStartTime: Number(o.tradingStartTime ?? o[2]),
      expiry: Number(o.expiry ?? o[3]),
      multiFactor: (o.multiFactor ?? o[4]).toString(),
      gradientType: (o.gradientType ?? o[5]).toString(),
    });

    const o0 = parse(rawOrder0);
    const o1 = parse(rawOrder1);

    return {
      order0Liquidity: o0.liquidity,
      order0InitialPrice: o0.initialPrice,
      order0TradingStartTime: o0.tradingStartTime,
      order0Expiry: o0.expiry,
      order0MultiFactor: o0.multiFactor,
      order0GradientType: o0.gradientType,
      order1Liquidity: o1.liquidity,
      order1InitialPrice: o1.initialPrice,
      order1TradingStartTime: o1.tradingStartTime,
      order1Expiry: o1.expiry,
      order1MultiFactor: o1.multiFactor,
      order1GradientType: o1.gradientType,
    };
  }

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
      this.logger.warn(`[Gradient] WSS StrategyCreated: unable to resolve token info for ${strategyId}`);
      return false;
    }

    const orderFields = this.buildOrderFieldsFromEvent(returnValues.order0, returnValues.order1);

    const updateFields: Partial<GradientStrategyRealtime> = {
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
      this.logger.warn(`[Gradient] WSS StrategyUpdated: unable to resolve token info for ${strategyId}`);
      return false;
    }

    const orderFields = this.buildOrderFieldsFromEvent(returnValues.order0, returnValues.order1);

    const updateFields: Partial<GradientStrategyRealtime> = {
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

  async applyStrategyLiquidityUpdated(
    returnValues: any,
    blockNumber: number,
    deployment: Deployment,
  ): Promise<boolean> {
    const strategyId = returnValues.id.toString();
    return this.guardedWrite(strategyId, deployment, blockNumber, {
      order0Liquidity: (returnValues.liquidity0 ?? returnValues[3]).toString(),
      order1Liquidity: (returnValues.liquidity1 ?? returnValues[4]).toString(),
    });
  }

  async applyVoucherTransfer(returnValues: any, blockNumber: number, deployment: Deployment): Promise<boolean> {
    const strategyId = returnValues.tokenId.toString();
    const newOwner = returnValues.to;
    return this.guardedWrite(strategyId, deployment, blockNumber, { owner: newOwner });
  }

  // ─── Guarded Write ───────────────────────────────────────────────────

  /**
   * Atomically update a gradient_strategy_realtime row only if the incoming
   * blockNumber is >= the existing updatedAtBlock. If the row doesn't exist
   * and createFields is provided, insert it.
   * Returns true if a write occurred, false if skipped (DB had newer data).
   */
  async guardedWrite(
    strategyId: string,
    deployment: Deployment,
    blockNumber: number,
    updateFields: Partial<GradientStrategyRealtime>,
    createFields?: Partial<GradientStrategyRealtime>,
  ): Promise<boolean> {
    const result = await this.gradientRealtimeRepository
      .createQueryBuilder()
      .update(GradientStrategyRealtime)
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
        const entity = this.gradientRealtimeRepository.create({
          ...createFields,
          strategyId,
          blockchainType: deployment.blockchainType,
          exchangeId: deployment.exchangeId,
          updatedAtBlock: blockNumber,
        });
        await this.gradientRealtimeRepository.save(entity);
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

      this.logger.log(
        `[Gradient] Found ${pairsWithCounts.length} pairs with strategies for ${deployment.exchangeId}`,
      );

      if (pairsWithCounts.length === 0) {
        if (!guarded) {
          await this.markDeletedStrategies([], deployment);
        }
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

      await this.saveStrategies(allStrategies, deployment, lastBlockNumber);

      if (!guarded) {
        await this.markDeletedStrategies(allStrategies, deployment);
      }

      await this.redis.client.set(this.getBlockRedisKey(deployment), lastBlockNumber.toString());

      const mode = guarded ? ' (guarded)' : '';
      this.logger.log(
        `[Gradient] Successfully updated ${allStrategies.length} strategies at block ${lastBlockNumber} for ${deployment.exchangeId}${mode}`,
      );

      return lastBlockNumber;
    } catch (error) {
      this.logger.error(`[Gradient] Error updating strategies for ${deployment.exchangeId}: ${error.message}`);
      throw error;
    }
  }

  private async saveStrategies(
    strategies: GradientContractStrategy[],
    deployment: Deployment,
    syncBlock?: number,
  ): Promise<void> {
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

      // Skip rows that already have a more recent WSS update than this sync's
      // block — same guarded semantics as StrategyRealtimeService.saveStrategies.
      if (
        syncBlock !== undefined &&
        existingEntity?.updatedAtBlock != null &&
        existingEntity.updatedAtBlock > syncBlock
      ) {
        continue;
      }

      // Always build a fresh entity (without the existing PK `id`) so the batched
      // upsert below resolves conflicts on the unique key
      // (blockchainType, exchangeId, strategyId) rather than on the PK. Keeps
      // saveStrategies idempotent against concurrent writers (WSS event handlers
      // writing via guardedWrite, the 60s guarded full sync, and the polling
      // fallback).
      const entity = this.gradientRealtimeRepository.create({
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        strategyId,
        owner: strategy.owner,
        token0Address: strategy.tokens[0],
        token1Address: strategy.tokens[1],
        order0Liquidity: strategy.orders[0].liquidity,
        order0InitialPrice: strategy.orders[0].initialPrice,
        order0TradingStartTime: strategy.orders[0].tradingStartTime,
        order0Expiry: strategy.orders[0].expiry,
        order0MultiFactor: strategy.orders[0].multiFactor,
        order0GradientType: strategy.orders[0].gradientType.toString(),
        order1Liquidity: strategy.orders[1].liquidity,
        order1InitialPrice: strategy.orders[1].initialPrice,
        order1TradingStartTime: strategy.orders[1].tradingStartTime,
        order1Expiry: strategy.orders[1].expiry,
        order1MultiFactor: strategy.orders[1].multiFactor,
        order1GradientType: strategy.orders[1].gradientType.toString(),
        deleted: false,
        ...(syncBlock !== undefined ? { updatedAtBlock: syncBlock } : {}),
      });

      entities.push(entity);
    }

    const BATCH_SIZE = 500;
    for (let i = 0; i < entities.length; i += BATCH_SIZE) {
      const batch = entities.slice(i, i + BATCH_SIZE);
      await this.gradientRealtimeRepository.upsert(batch, {
        conflictPaths: ['blockchainType', 'exchangeId', 'strategyId'],
        skipUpdateIfNoValuesChanged: true,
      });
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
      this.logger.log(
        `[Gradient] Marked ${toMarkDeleted.length} strategies as deleted for ${deployment.exchangeId}`,
      );
    }

    await this.syncDeletionsFromEvents(deployment);
  }

  private async syncDeletionsFromEvents(deployment: Deployment): Promise<void> {
    const deletedEventRows = await this.gradientRealtimeRepository.manager.query(
      `SELECT d."strategyId", c."owner",
              t0."address" AS "token0Address", t1."address" AS "token1Address",
              d."order0Liquidity", d."order0InitialPrice", d."order0TradingStartTime", d."order0Expiry", d."order0MultiFactor", d."order0GradientType",
              d."order1Liquidity", d."order1InitialPrice", d."order1TradingStartTime", d."order1Expiry", d."order1MultiFactor", d."order1GradientType"
       FROM gradient_strategy_deleted_events d
       LEFT JOIN gradient_strategy_created_events c ON c."strategyId" = d."strategyId" AND c."blockchainType" = d."blockchainType" AND c."exchangeId" = d."exchangeId"
       LEFT JOIN tokens t0 ON d."token0Id" = t0."id"
       LEFT JOIN tokens t1 ON d."token1Id" = t1."id"
       WHERE d."blockchainType" = $1 AND d."exchangeId" = $2
         AND d."strategyId" NOT IN (SELECT "strategyId" FROM gradient_strategy_realtime WHERE "blockchainType" = $1 AND "exchangeId" = $2)`,
      [deployment.blockchainType, deployment.exchangeId],
    );

    if (deletedEventRows.length === 0) return;

    const stubs = deletedEventRows.map((row: any) =>
      this.gradientRealtimeRepository.create({
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        strategyId: row.strategyId,
        owner: row.owner || '',
        token0Address: row.token0Address || '',
        token1Address: row.token1Address || '',
        order0Liquidity: row.order0Liquidity || '0',
        order0InitialPrice: row.order0InitialPrice || '0',
        order0TradingStartTime: row.order0TradingStartTime || 0,
        order0Expiry: row.order0Expiry || 0,
        order0MultiFactor: row.order0MultiFactor || '0',
        order0GradientType: row.order0GradientType || '0',
        order1Liquidity: row.order1Liquidity || '0',
        order1InitialPrice: row.order1InitialPrice || '0',
        order1TradingStartTime: row.order1TradingStartTime || 0,
        order1Expiry: row.order1Expiry || 0,
        order1MultiFactor: row.order1MultiFactor || '0',
        order1GradientType: row.order1GradientType || '0',
        deleted: true,
      }),
    );

    await this.gradientRealtimeRepository.save(stubs);
    this.logger.log(
      `[Gradient] Synced ${stubs.length} deleted strategies from events for ${deployment.exchangeId}`,
    );
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
