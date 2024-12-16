import { Controller, Post, Body } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { EventTypes } from './notification.service';
import { ArbitrageExecutedEventService } from '../events/arbitrage-executed-event/arbitrage-executed-event.service';
import { VortexTokensTradedEventService } from '../events/vortex-tokens-traded-event/vortex-tokens-traded-event.service';
import { VortexTradingResetEventService } from '../events/vortex-trading-reset-event/vortex-trading-reset-event.service';
import { VortexFundsWithdrawnEventService } from '../events/vortex-funds-withdrawn-event/vortex-funds-withdrawn-event.service';
import { DeploymentService } from '../deployment/deployment.service';
import { TokenService } from '../token/token.service';
import { QuoteService } from '../quote/quote.service';

@Controller('notifications')
export class NotificationController {
  constructor(
    private telegramService: TelegramService,
    private vortexTokensTradedEventService: VortexTokensTradedEventService,
    private arbitrageExecutedEventService: ArbitrageExecutedEventService,
    private vortexTradingResetEventService: VortexTradingResetEventService,
    private vortexFundsWithdrawnEventService: VortexFundsWithdrawnEventService,
    private deploymentService: DeploymentService,
    private tokenService: TokenService,
    private quoteService: QuoteService,
  ) {}

  @Post('telegram')
  async sendTelegramNotification(@Body() data: any) {
    const { eventType, eventId } = data;

    let event;
    switch (eventType) {
      case EventTypes.VortexTokensTradedEvent:
        event = await this.vortexTokensTradedEventService.getOne(eventId);
        break;
      case EventTypes.ArbitrageExecutedEvent:
        event = await this.arbitrageExecutedEventService.getOne(eventId);
        break;
      case EventTypes.VortexTradingResetEvent:
        event = await this.vortexTradingResetEventService.getOne(eventId);
        break;
      case EventTypes.VortexFundsWithdrawnEvent:
        event = await this.vortexFundsWithdrawnEventService.getOne(eventId);
        break;
      default:
        throw new Error(`Unsupported event type: ${eventType}`);
    }

    const deployment = await this.deploymentService.getDeploymentByExchangeId(event.exchangeId);
    const tokens = await this.tokenService.allByAddress(deployment);
    const quotes = await this.quoteService.allByAddress(deployment);

    await this.telegramService.sendEventNotification(eventType, event, tokens, quotes);
  }
}
