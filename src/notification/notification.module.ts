import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { TelegramService } from './telegram.service';
import { ConfigModule } from '@nestjs/config';
import { VortexFundsWithdrawnEventModule } from '../events/vortex-funds-withdrawn-event/vortex-funds-withdrawn-event.module';
import { VortexTradingResetEventModule } from '../events/vortex-trading-reset-event/vortex-trading-reset-event.module';
import { ArbitrageExecutedEventModule } from '../events/arbitrage-executed-event/arbitrage-executed-event.module';
import { VortexTokensTradedEventModule } from '../events/vortex-tokens-traded-event/vortex-tokens-traded-event.module';
import { LastProcessedBlockModule } from '../last-processed-block/last-processed-block.module';
import { DeploymentModule } from '../deployment/deployment.module';
import { TokenModule } from '../token/token.module';
import { QuoteModule } from '../quote/quote.module';
import { StrategyCreatedEventModule } from '../events/strategy-created-event/strategy-created-event.module';
import { TokensTradedEventModule } from '../events/tokens-traded-event/tokens-traded-event.module';
import { ProtectionRemovedEventModule } from '../events/protection-removed-event/protection-removed-event.module';
@Module({
  imports: [
    ConfigModule,
    VortexTokensTradedEventModule,
    ArbitrageExecutedEventModule,
    VortexTradingResetEventModule,
    VortexFundsWithdrawnEventModule,
    LastProcessedBlockModule,
    DeploymentModule,
    TokenModule,
    QuoteModule,
    StrategyCreatedEventModule,
    TokensTradedEventModule,
    ProtectionRemovedEventModule,
  ],
  controllers: [NotificationController],
  providers: [NotificationService, TelegramService],
  exports: [NotificationService],
})
export class NotificationModule {}
