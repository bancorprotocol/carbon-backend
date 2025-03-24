import { Controller, Post, Body } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { EventTypes } from '../events/event-types';
import { ArbitrageExecutedEventService } from '../events/arbitrage-executed-event/arbitrage-executed-event.service';
import { VortexTokensTradedEventService } from '../events/vortex-tokens-traded-event/vortex-tokens-traded-event.service';
import { VortexTradingResetEventService } from '../events/vortex-trading-reset-event/vortex-trading-reset-event.service';
import { VortexFundsWithdrawnEventService } from '../events/vortex-funds-withdrawn-event/vortex-funds-withdrawn-event.service';
import { DeploymentService } from '../deployment/deployment.service';
import { TokenService } from '../token/token.service';
import { QuoteService } from '../quote/quote.service';
import { StrategyCreatedEventService } from '../events/strategy-created-event/strategy-created-event.service';
import { TokensTradedEventService } from '../events/tokens-traded-event/tokens-traded-event.service';
import { ProtectionRemovedEventService } from '../events/protection-removed-event/protection-removed-event.service';
import { ApiExcludeController } from '@nestjs/swagger';

interface EventService {
  getOne(id: string | number): Promise<any>;
}

@ApiExcludeController()
@Controller('notifications')
export class NotificationController {
  private eventServiceMap: Map<EventTypes, EventService>;

  constructor(
    private telegramService: TelegramService,
    private vortexTokensTradedEventService: VortexTokensTradedEventService,
    private arbitrageExecutedEventService: ArbitrageExecutedEventService,
    private vortexTradingResetEventService: VortexTradingResetEventService,
    private vortexFundsWithdrawnEventService: VortexFundsWithdrawnEventService,
    private deploymentService: DeploymentService,
    private tokenService: TokenService,
    private quoteService: QuoteService,
    private strategyCreatedEventService: StrategyCreatedEventService,
    private tokensTradedEventService: TokensTradedEventService,
    private protectionRemovedEventService: ProtectionRemovedEventService,
  ) {
    this.eventServiceMap = new Map<EventTypes, EventService>([
      [EventTypes.ArbitrageExecutedEvent, arbitrageExecutedEventService],
      [EventTypes.VortexTokensTradedEvent, vortexTokensTradedEventService],
      [EventTypes.VortexTradingResetEvent, vortexTradingResetEventService],
      [EventTypes.VortexFundsWithdrawnEvent, vortexFundsWithdrawnEventService],
      [EventTypes.StrategyCreatedEvent, strategyCreatedEventService],
      [EventTypes.TokensTradedEvent, tokensTradedEventService],
      [EventTypes.ProtectionRemovedEvent, protectionRemovedEventService],
    ]);
  }

  @Post('telegram')
  async sendTelegramNotification(@Body() data: any) {
    const { eventType, eventId } = data;

    const eventService = this.eventServiceMap.get(eventType);
    if (!eventService) {
      throw new Error(`Unsupported event type: ${eventType}`);
    }

    const event = await eventService.getOne(eventId);
    const deployment = await this.deploymentService.getDeploymentByExchangeId(event.exchangeId);
    const tokens = await this.tokenService.allByAddress(deployment);
    const quotes = await this.quoteService.allByAddress(deployment);

    await this.telegramService.sendEventNotification(eventType, event, tokens, quotes, deployment);
  }
}
