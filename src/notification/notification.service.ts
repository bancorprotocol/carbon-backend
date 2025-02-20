import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ArbitrageExecutedEventService } from '../events/arbitrage-executed-event/arbitrage-executed-event.service';
import { VortexFundsWithdrawnEventService } from '../events/vortex-funds-withdrawn-event/vortex-funds-withdrawn-event.service';
import { VortexTokensTradedEventService } from '../events/vortex-tokens-traded-event/vortex-tokens-traded-event.service';
import { VortexTradingResetEventService } from '../events/vortex-trading-reset-event/vortex-trading-reset-event.service';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { Deployment } from '../deployment/deployment.service';
import { StrategyCreatedEventService } from '../events/strategy-created-event/strategy-created-event.service';
import { EventTypes } from '../events/event-types';
import { TokensTradedEventService } from '../events/tokens-traded-event/tokens-traded-event.service';
import { ProtectionRemovedEventService } from '../events/protection-removed-event/protection-removed-event.service';
@Injectable()
export class NotificationService {
  private tasksClient: any;
  private projectId: string;
  private queueName: string;
  private location: string;
  private readonly eventServices = new Map<EventTypes, any>();
  private shouldSendNotifications: boolean;

  constructor(
    private configService: ConfigService,
    private vortexTokensTradedEventService: VortexTokensTradedEventService,
    private arbitrageExecutedEventService: ArbitrageExecutedEventService,
    private vortexTradingResetEventService: VortexTradingResetEventService,
    private vortexFundsWithdrawnEventService: VortexFundsWithdrawnEventService,
    private strategyCreatedEventService: StrategyCreatedEventService,
    private lastProcessedBlockService: LastProcessedBlockService,
    private tokensTradedEventService: TokensTradedEventService,
    private protectionRemovedEventService: ProtectionRemovedEventService,
  ) {
    this.projectId = this.configService.get('GOOGLE_CLOUD_PROJECT');
    this.queueName = this.configService.get('QUEUE_NAME');
    this.location = this.configService.get('QUEUE_LOCATION');
    this.shouldSendNotifications = this.configService.get('SEND_NOTIFICATIONS') === '1';

    // Register all event services
    this.registerEventServices();
  }

  private registerEventServices() {
    this.eventServices.set(EventTypes.VortexTokensTradedEvent, this.vortexTokensTradedEventService);
    this.eventServices.set(EventTypes.ArbitrageExecutedEvent, this.arbitrageExecutedEventService);
    this.eventServices.set(EventTypes.VortexTradingResetEvent, this.vortexTradingResetEventService);
    this.eventServices.set(EventTypes.VortexFundsWithdrawnEvent, this.vortexFundsWithdrawnEventService);
    this.eventServices.set(EventTypes.StrategyCreatedEvent, this.strategyCreatedEventService);
    this.eventServices.set(EventTypes.TokensTradedEvent, this.tokensTradedEventService);
    this.eventServices.set(EventTypes.ProtectionRemovedEvent, this.protectionRemovedEventService);
  }

  async update(endBlock: number, deployment: Deployment): Promise<void> {
    if (!deployment.notifications || !this.shouldSendNotifications) return;

    if (!this.queueName || !this.location) {
      throw new Error('QUEUE_NAME or QUEUE_LOCATION is not set');
    }

    const lastProcessedEntity = `${deployment.blockchainType}-${deployment.exchangeId}-notifications`;
    const initTo = await this.lastProcessedBlockService.get(
      `${deployment.blockchainType}-${deployment.exchangeId}-pair-created-events`,
    );
    const lastProcessedBlockNumber = await this.lastProcessedBlockService.getOrInit(lastProcessedEntity, initTo);
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

  private async initClient() {
    if (!this.tasksClient) {
      const { CloudTasksClient } = await import('@google-cloud/tasks');
      this.tasksClient = new CloudTasksClient();
    }
    return this.tasksClient;
  }

  private async processBlockRange(startBlock: number, endBlock: number, deployment: Deployment): Promise<void> {
    const BATCH_SIZE = 500;
    const allTasks = [];

    const eventProcessingPromises = Array.from(this.eventServices.entries()).map(async ([eventType, service]) => {
      if (deployment.notifications?.disabledEvents?.includes(eventType)) {
        return;
      }

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

    const client = await this.initClient();
    const parent = client.queuePath(this.projectId, this.location, this.queueName);

    // Process tasks in batches, but create them individually
    for (let i = 0; i < allTasks.length; i += BATCH_SIZE) {
      const taskBatch = allTasks.slice(i, i + BATCH_SIZE);
      await Promise.all(
        taskBatch.map(async (task) => {
          const request = {
            parent,
            task,
          };
          try {
            await client.createTask(request);
          } catch (error) {
            console.error('Error creating task:', error);
          }
        }),
      );
    }
  }
}
