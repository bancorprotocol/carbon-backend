import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GradientTradingFeePPMEvent } from './gradient-trading-fee-ppm-event.entity';
import { ContractsNames, HarvesterService } from '../../harvester/harvester.service';
import { Deployment, DeploymentService } from '../../deployment/deployment.service';
import { LastProcessedBlockService } from '../../last-processed-block/last-processed-block.service';
import { BlockService } from '../../block/block.service';

@Injectable()
export class GradientTradingFeePPMEventService {
  private readonly logger = new Logger(GradientTradingFeePPMEventService.name);

  constructor(
    @InjectRepository(GradientTradingFeePPMEvent)
    private repository: Repository<GradientTradingFeePPMEvent>,
    private harvesterService: HarvesterService,
    private lastProcessedBlockService: LastProcessedBlockService,
    private deploymentService: DeploymentService,
    private blockService: BlockService,
  ) {}

  async update(endBlock: number, deployment: Deployment): Promise<void> {
    if (!this.deploymentService.hasGradientSupport(deployment)) return;

    const key = `${deployment.blockchainType}-${deployment.exchangeId}-gradient-trading-fee-ppm-events`;
    const lastProcessedBlock = await this.lastProcessedBlockService.getOrInit(key, deployment.startBlock);

    if (lastProcessedBlock >= endBlock) return;

    const events = await this.harvesterService.fetchEventsFromBlockchain(
      ContractsNames.GradientController,
      'TradingFeePPMUpdated',
      lastProcessedBlock + 1,
      endBlock,
      undefined,
      deployment,
    );

    if (events.length > 0) {
      this.logger.log(`[Gradient] Harvested ${events.length} TradingFeePPMUpdated events for ${deployment.exchangeId}`);

      const uniqueBlocks = [...new Set(events.map((e) => Number(e.blockNumber)))];
      const blockTimestampsDict = await this.blockService.getBlocksDictionary(uniqueBlocks, deployment);

      const entities = events.map((e) => {
        const blockNum = Number(e.blockNumber);
        return this.repository.create({
          blockchainType: deployment.blockchainType,
          exchangeId: deployment.exchangeId,
          block: { id: blockNum } as any,
          transactionHash: e.transactionHash,
          transactionIndex: Number(e.transactionIndex),
          logIndex: Number(e.logIndex),
          timestamp: blockTimestampsDict[blockNum] || null,
          prevFeePPM: Number(e.returnValues.prevFeePPM),
          newFeePPM: Number(e.returnValues.newFeePPM),
        });
      });

      await this.repository.save(entities);
    }

    await this.lastProcessedBlockService.update(key, endBlock);
  }

  async all(deployment: Deployment): Promise<GradientTradingFeePPMEvent[]> {
    return this.repository
      .createQueryBuilder('e')
      .where('e."blockchainType" = :blockchainType', { blockchainType: deployment.blockchainType })
      .andWhere('e."exchangeId" = :exchangeId', { exchangeId: deployment.exchangeId })
      .orderBy('e."blockId"', 'ASC')
      .addOrderBy('e."logIndex"', 'ASC')
      .getMany();
  }

  async last(deployment: Deployment): Promise<GradientTradingFeePPMEvent | null> {
    return this.repository
      .createQueryBuilder('e')
      .where('e."blockchainType" = :blockchainType', { blockchainType: deployment.blockchainType })
      .andWhere('e."exchangeId" = :exchangeId', { exchangeId: deployment.exchangeId })
      .orderBy('e."blockId"', 'DESC')
      .addOrderBy('e."logIndex"', 'DESC')
      .getOne();
  }
}
