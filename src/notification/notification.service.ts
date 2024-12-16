import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ArbitrageExecutedEventService } from '../events/arbitrage-executed-event/arbitrage-executed-event.service';
import { VortexFundsWithdrawnEventService } from '../events/vortex-funds-withdrawn-event/vortex-funds-withdrawn-event.service';
import { VortexTokensTradedEventService } from '../events/vortex-tokens-traded-event/vortex-tokens-traded-event.service';
import { VortexTradingResetEventService } from '../events/vortex-trading-reset-event/vortex-trading-reset-event.service';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { Deployment } from '../deployment/deployment.service';
import { StrategyCreatedEventService } from '../events/strategy-created-event/strategy-created-event.service';

export enum EventTypes {
  VortexTokensTradedEvent = 'VortexTokensTradedEvent',
  ArbitrageExecutedEvent = 'ArbitrageExecutedEvent',
  VortexTradingResetEvent = 'VortexTradingResetEvent',
  VortexFundsWithdrawnEvent = 'VortexFundsWithdrawnEvent',
  StrategyCreatedEvent = 'StrategyCreatedEvent',
}

@Injectable()
export class NotificationService {
  private tasksClient: any;
  private projectId: string;
  private queueName: string;
  private location: string;
  private readonly eventServices = new Map<EventTypes, any>();

  constructor(
    private configService: ConfigService,
    private vortexTokensTradedEventService: VortexTokensTradedEventService,
    private arbitrageExecutedEventService: ArbitrageExecutedEventService,
    private vortexTradingResetEventService: VortexTradingResetEventService,
    private vortexFundsWithdrawnEventService: VortexFundsWithdrawnEventService,
    private strategyCreatedEventService: StrategyCreatedEventService,
    private lastProcessedBlockService: LastProcessedBlockService,
  ) {
    this.initClient();
    this.projectId = this.configService.get('GOOGLE_CLOUD_PROJECT');
    this.queueName = 'bancor-alerts';
    this.location = 'europe-west2';

    // Register all event services
    this.registerEventServices();
  }

  private registerEventServices() {
    this.eventServices.set(EventTypes.VortexTokensTradedEvent, this.vortexTokensTradedEventService);
    this.eventServices.set(EventTypes.ArbitrageExecutedEvent, this.arbitrageExecutedEventService);
    this.eventServices.set(EventTypes.VortexTradingResetEvent, this.vortexTradingResetEventService);
    this.eventServices.set(EventTypes.VortexFundsWithdrawnEvent, this.vortexFundsWithdrawnEventService);
    this.eventServices.set(EventTypes.StrategyCreatedEvent, this.strategyCreatedEventService);
  }

  async update(endBlock: number, deployment: Deployment): Promise<void> {
    const lastProcessedEntity = `${deployment.blockchainType}-${deployment.exchangeId}-notifications`;
    const lastProcessedBlockNumber = await this.lastProcessedBlockService.getOrInit(lastProcessedEntity, 1);
    const batchSize = 100000;
    let currentBlock = lastProcessedBlockNumber;

    while (currentBlock < endBlock) {
      const nextBlock = Math.min(currentBlock + batchSize, endBlock);

      await this.processBlockRange(currentBlock, nextBlock, deployment);
      await this.lastProcessedBlockService.update(lastProcessedEntity, nextBlock);
      currentBlock = nextBlock;
    }

    await this.lastProcessedBlockService.update(lastProcessedEntity, endBlock);
  }

  private async processBlockRange(startBlock: number, endBlock: number, deployment: Deployment): Promise<void> {
    const BATCH_SIZE = 500; // Conservative batch size for createTasks
    const allTasks = [];

    const eventProcessingPromises = Array.from(this.eventServices.entries()).map(async ([eventType, service]) => {
      const events = await service.get(startBlock, endBlock, deployment);
      const tasks = events.map((event) => ({
        httpRequest: {
          httpMethod: 'POST',
          url: `${this.configService.get('API_URL')}/notifications/telegram`,
          body: Buffer.from(
            JSON.stringify({
              eventType,
              eventId: event.id,
            }),
          ).toString('base64'),
          headers: {
            'Content-Type': 'application/json',
          },
        },
      }));
      allTasks.push(...tasks);
    });

    await Promise.all(eventProcessingPromises);

    // Process tasks in batches
    for (let i = 0; i < allTasks.length; i += BATCH_SIZE) {
      const taskBatch = allTasks.slice(i, i + BATCH_SIZE);
      if (taskBatch.length > 0) {
        const parent = this.tasksClient.queuePath(this.projectId, this.location, this.queueName);
        const request = {
          parent,
          tasks: taskBatch,
        };

        await this.tasksClient.createTasks(request);
      }
    }
  }

  private async initClient() {
    const { CloudTasksClient } = await import('@google-cloud/tasks');
    this.tasksClient = new CloudTasksClient();
  }
}
