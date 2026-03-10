import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BigNumber } from '@ethersproject/bignumber';
import { GradientStrategyUpdatedEvent } from './gradient-strategy-updated-event.entity';
import { ContractsNames, HarvesterService } from '../../harvester/harvester.service';
import { Deployment, DeploymentService } from '../../deployment/deployment.service';
import { LastProcessedBlockService } from '../../last-processed-block/last-processed-block.service';
import { BlockService } from '../../block/block.service';
import { parseGradientOrderFields } from './gradient-event.utils';
import { TokensByAddress } from '../../token/token.service';
import { PairsDictionary } from '../../pair/pair.service';

@Injectable()
export class GradientStrategyUpdatedEventService {
  private readonly logger = new Logger(GradientStrategyUpdatedEventService.name);

  constructor(
    @InjectRepository(GradientStrategyUpdatedEvent)
    private repository: Repository<GradientStrategyUpdatedEvent>,
    private harvesterService: HarvesterService,
    private lastProcessedBlockService: LastProcessedBlockService,
    private deploymentService: DeploymentService,
    private blockService: BlockService,
  ) {}

  async update(endBlock: number, deployment: Deployment, tokens: TokensByAddress, pairsDictionary: PairsDictionary): Promise<void> {
    if (!this.deploymentService.hasGradientSupport(deployment)) return;

    const key = `${deployment.blockchainType}-${deployment.exchangeId}-gradient-strategy-updated-events`;
    const lastProcessedBlock = await this.lastProcessedBlockService.getOrInit(key, deployment.startBlock);

    if (lastProcessedBlock >= endBlock) return;

    await this.repository
      .createQueryBuilder()
      .delete()
      .where('"blockId" > :lastProcessedBlock', { lastProcessedBlock })
      .andWhere('"blockchainType" = :blockchainType', { blockchainType: deployment.blockchainType })
      .andWhere('"exchangeId" = :exchangeId', { exchangeId: deployment.exchangeId })
      .execute();

    const events = await this.harvesterService.fetchEventsFromBlockchain(
      ContractsNames.GradientController,
      'StrategyUpdated',
      lastProcessedBlock + 1,
      endBlock,
      undefined,
      deployment,
    );

    if (events.length > 0) {
      this.logger.log(`[Gradient] Harvested ${events.length} StrategyUpdated events for ${deployment.exchangeId}`);

      const uniqueBlocks = [...new Set(events.map((e) => Number(e.blockNumber)))];
      const blockTimestampsDict = await this.blockService.getBlocksDictionary(uniqueBlocks, deployment);

      const entities = events.map((e) => {
        const blockNum = Number(e.blockNumber);
        const orderFields = parseGradientOrderFields(e.returnValues);
        const t0Addr = e.returnValues.token0;
        const t1Addr = e.returnValues.token1;
        const token0 = tokens[t0Addr] || tokens[t0Addr.toLowerCase()];
        const token1 = tokens[t1Addr] || tokens[t1Addr.toLowerCase()];
        if (!token0 || !token1) {
          throw new Error(`[Gradient] Token not found for StrategyUpdated event: token0=${t0Addr} (found=${!!token0}), token1=${t1Addr} (found=${!!token1})`);
        }
        const pairKey = token0.address;
        const pair = pairsDictionary[pairKey]?.[token1.address] || undefined;

        return this.repository.create({
          blockchainType: deployment.blockchainType,
          exchangeId: deployment.exchangeId,
          strategyId: BigNumber.from(e.returnValues.id).toString(),
          block: { id: blockNum } as any,
          transactionHash: e.transactionHash,
          transactionIndex: Number(e.transactionIndex),
          logIndex: Number(e.logIndex),
          timestamp: blockTimestampsDict[blockNum] || null,
          token0,
          token1,
          pair,
          ...orderFields,
        });
      });

      const BATCH = 1000;
      for (let i = 0; i < entities.length; i += BATCH) {
        await this.repository.save(entities.slice(i, i + BATCH));
      }
    }

    await this.lastProcessedBlockService.update(key, endBlock);
  }

  async get(startBlock: number, endBlock: number, deployment: Deployment): Promise<GradientStrategyUpdatedEvent[]> {
    return this.repository
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.block', 'block')
      .leftJoinAndSelect('e.pair', 'pair')
      .leftJoinAndSelect('e.token0', 'token0')
      .leftJoinAndSelect('e.token1', 'token1')
      .where('block.id >= :startBlock', { startBlock })
      .andWhere('block.id <= :endBlock', { endBlock })
      .andWhere('e."blockchainType" = :blockchainType', { blockchainType: deployment.blockchainType })
      .andWhere('e."exchangeId" = :exchangeId', { exchangeId: deployment.exchangeId })
      .orderBy('block.id', 'ASC')
      .addOrderBy('e."logIndex"', 'ASC')
      .getMany();
  }
}
