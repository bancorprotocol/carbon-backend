import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BigNumber } from '@ethersproject/bignumber';
import { GradientStrategyCreatedEvent } from './gradient-strategy-created-event.entity';
import { ContractsNames, HarvesterService } from '../../harvester/harvester.service';
import { Deployment, DeploymentService } from '../../deployment/deployment.service';
import { LastProcessedBlockService } from '../../last-processed-block/last-processed-block.service';
import { BlockService } from '../../block/block.service';
import { parseGradientOrderFields } from './gradient-event.utils';
import { TokensByAddress } from '../../token/token.service';
import { PairsDictionary } from '../../pair/pair.service';

@Injectable()
export class GradientStrategyCreatedEventService {
  private readonly logger = new Logger(GradientStrategyCreatedEventService.name);

  constructor(
    @InjectRepository(GradientStrategyCreatedEvent)
    private repository: Repository<GradientStrategyCreatedEvent>,
    private harvesterService: HarvesterService,
    private lastProcessedBlockService: LastProcessedBlockService,
    private deploymentService: DeploymentService,
    private blockService: BlockService,
  ) {}

  async update(endBlock: number, deployment: Deployment, tokens: TokensByAddress, pairsDictionary: PairsDictionary): Promise<void> {
    if (!this.deploymentService.hasGradientSupport(deployment)) return;

    const key = `${deployment.blockchainType}-${deployment.exchangeId}-gradient-strategy-created-events`;
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
      'StrategyCreated',
      lastProcessedBlock + 1,
      endBlock,
      undefined,
      deployment,
    );

    if (events.length > 0) {
      this.logger.log(`[Gradient] Harvested ${events.length} StrategyCreated events for ${deployment.exchangeId}`);

      const uniqueBlocks = [...new Set(events.map((e) => Number(e.blockNumber)))];
      const blockTimestampsDict = await this.blockService.getBlocksDictionary(uniqueBlocks, deployment);

      const entities = events.map((e) => {
        const blockNum = Number(e.blockNumber);
        const orderFields = parseGradientOrderFields(e.returnValues);
        const token0 = tokens[e.returnValues.token0];
        const token1 = tokens[e.returnValues.token1];
        const pair = token0 && token1 && pairsDictionary[e.returnValues.token0]
          ? pairsDictionary[e.returnValues.token0][e.returnValues.token1]
          : undefined;

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
          owner: e.returnValues.owner,
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

  async all(deployment: Deployment): Promise<GradientStrategyCreatedEvent[]> {
    return this.repository
      .createQueryBuilder('e')
      .where('e."blockchainType" = :blockchainType', { blockchainType: deployment.blockchainType })
      .andWhere('e."exchangeId" = :exchangeId', { exchangeId: deployment.exchangeId })
      .orderBy('e."blockId"', 'ASC')
      .addOrderBy('e."logIndex"', 'ASC')
      .getMany();
  }

  async get(startBlock: number, endBlock: number, deployment: Deployment): Promise<GradientStrategyCreatedEvent[]> {
    return this.repository
      .createQueryBuilder('e')
      .where('e."blockId" >= :startBlock', { startBlock })
      .andWhere('e."blockId" <= :endBlock', { endBlock })
      .andWhere('e."blockchainType" = :blockchainType', { blockchainType: deployment.blockchainType })
      .andWhere('e."exchangeId" = :exchangeId', { exchangeId: deployment.exchangeId })
      .orderBy('e."blockId"', 'ASC')
      .addOrderBy('e."logIndex"', 'ASC')
      .getMany();
  }
}
