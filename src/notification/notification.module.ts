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
import { TokenModule } from 'src/token/token.module';
import { QuoteModule } from 'src/quote/quote.module';

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
  ],
  controllers: [NotificationController],
  providers: [NotificationService, TelegramService],
  exports: [NotificationService],
})
export class NotificationModule {}
