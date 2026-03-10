import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GradientPairTradingFeePPMEvent } from './gradient-pair-trading-fee-ppm-event.entity';
import { ContractsNames, HarvesterService } from '../../harvester/harvester.service';
import { Deployment, DeploymentService } from '../../deployment/deployment.service';
import { LastProcessedBlockService } from '../../last-processed-block/last-processed-block.service';
import { BlockService } from '../../block/block.service';
import { PairsDictionary } from '../../pair/pair.service';

export interface GradientPairTradingFeePPMDictionary {
  [token0Address: string]: { [token1Address: string]: number };
}

@Injectable()
export class GradientPairTradingFeePPMEventService {
  private readonly logger = new Logger(GradientPairTradingFeePPMEventService.name);

  constructor(
    @InjectRepository(GradientPairTradingFeePPMEvent)
    private repository: Repository<GradientPairTradingFeePPMEvent>,
    private harvesterService: HarvesterService,
    private lastProcessedBlockService: LastProcessedBlockService,
    private deploymentService: DeploymentService,
    private blockService: BlockService,
  ) {}

  async update(endBlock: number, deployment: Deployment, pairsDictionary: PairsDictionary): Promise<void> {
    if (!this.deploymentService.hasGradientSupport(deployment)) return;

    const key = `${deployment.blockchainType}-${deployment.exchangeId}-gradient-pair-trading-fee-ppm-events`;
    const lastProcessedBlock = await this.lastProcessedBlockService.getOrInit(key, deployment.startBlock);

    if (lastProcessedBlock >= endBlock) return;

    const events = await this.harvesterService.fetchEventsFromBlockchain(
      ContractsNames.GradientController,
      'PairTradingFeePPMUpdated',
      lastProcessedBlock + 1,
      endBlock,
      undefined,
      deployment,
    );

    if (events.length > 0) {
      this.logger.log(`[Gradient] Harvested ${events.length} PairTradingFeePPMUpdated events for ${deployment.exchangeId}`);

      const uniqueBlocks = [...new Set(events.map((e) => Number(e.blockNumber)))];
      const blockTimestampsDict = await this.blockService.getBlocksDictionary(uniqueBlocks, deployment);

      const entities = events.map((e) => {
        const blockNum = Number(e.blockNumber);
        const pair = pairsDictionary[e.returnValues.token0]
          ? pairsDictionary[e.returnValues.token0][e.returnValues.token1]
          : undefined;

        return this.repository.create({
          blockchainType: deployment.blockchainType,
          exchangeId: deployment.exchangeId,
          block: { id: blockNum } as any,
          transactionHash: e.transactionHash,
          transactionIndex: Number(e.transactionIndex),
          logIndex: Number(e.logIndex),
          timestamp: blockTimestampsDict[blockNum] || null,
          pair,
          prevFeePPM: Number(e.returnValues.prevFeePPM),
          newFeePPM: Number(e.returnValues.newFeePPM),
        });
      });

      await this.repository.save(entities);
    }

    await this.lastProcessedBlockService.update(key, endBlock);
  }

  async all(deployment: Deployment): Promise<GradientPairTradingFeePPMEvent[]> {
    return this.repository
      .createQueryBuilder('e')
      .where('e."blockchainType" = :blockchainType', { blockchainType: deployment.blockchainType })
      .andWhere('e."exchangeId" = :exchangeId', { exchangeId: deployment.exchangeId })
      .orderBy('e."blockId"', 'ASC')
      .addOrderBy('e."logIndex"', 'ASC')
      .getMany();
  }

  async allAsDictionary(deployment: Deployment): Promise<GradientPairTradingFeePPMDictionary> {
    const events = await this.all(deployment);
    const dict: GradientPairTradingFeePPMDictionary = {};

    for (const e of events) {
      if (!e.pair) continue;
      const t0 = e.pair.token0.address.toLowerCase();
      const t1 = e.pair.token1.address.toLowerCase();
      if (!dict[t0]) dict[t0] = {};
      if (!dict[t1]) dict[t1] = {};
      dict[t0][t1] = e.newFeePPM;
      dict[t1][t0] = e.newFeePPM;
    }

    return dict;
  }
}
