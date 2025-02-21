import { Module } from '@nestjs/common';
import { BlockModule } from '../block/block.module';
import { RedisModule } from '../redis/redis.module';
import { UpdaterService } from './updater.service';
import { HarvesterModule } from '../harvester/harvester.module';
import { LastProcessedBlockModule } from '../last-processed-block/last-processed-block.module';
import { QuoteModule } from '../quote/quote.module';
import { StrategyCreatedEventModule } from '../events/strategy-created-event/strategy-created-event.module';
import { TokenModule } from '../token/token.module';
import { PairModule } from '../pair/pair.module';
import { PairCreatedEventModule } from '../events/pair-created-event/pair-created-event.module';
import { StrategyModule } from '../strategy/strategy.module';
import { TokensTradedEventModule } from '../events/tokens-traded-event/tokens-traded-event.module';
import { RoiModule } from '../v1/roi/roi.module';
import { CoingeckoModule } from '../v1/coingecko/coingecko.module';
import { TradingFeePpmUpdatedEventModule } from '../events/trading-fee-ppm-updated-event/trading-fee-ppm-updated-event.module';
import { PairTradingFeePpmUpdatedEventModule } from '../events/pair-trading-fee-ppm-updated-event/pair-trading-fee-ppm-updated-event.module';
import { ActivityModule } from '../activity/activity.module';
import { HistoricQuoteModule } from '../historic-quote/historic-quote.module';
import { VoucherTransferEventModule } from '../events/voucher-transfer-event/voucher-transfer-event.module';
import { AnalyticsModule } from '../v1/analytics/analytics.module';
import { DexScreenerModule } from '../v1/dex-screener/dex-screener.module';
import { VolumeModule } from '../volume/volume.module';
import { TvlModule } from '../tvl/tvl.module';
import { DeploymentModule } from '../deployment/deployment.module';
import { CodexModule } from '../codex/codex.module';
import { ArbitrageExecutedEventModule } from '../events/arbitrage-executed-event/arbitrage-executed-event.module';
import { VortexTokensTradedEventModule } from '../events/vortex-tokens-traded-event/vortex-tokens-traded-event.module';
import { VortexTradingResetEventModule } from '../events/vortex-trading-reset-event/vortex-trading-reset-event.module';
import { VortexFundsWithdrawnEventModule } from '../events/vortex-funds-withdrawn-event/vortex-funds-withdrawn-event.module';
import { NotificationModule } from '../notification/notification.module';
import { ProtectionRemovedEventModule } from '../events/protection-removed-event/protection-removed-event.module';
@Module({
  imports: [
    BlockModule,
    RedisModule,
    HarvesterModule,
    LastProcessedBlockModule,
    QuoteModule,
    StrategyCreatedEventModule,
    TokenModule,
    PairModule,
    PairCreatedEventModule,
    StrategyModule,
    TokensTradedEventModule,
    RoiModule,
    CoingeckoModule,
    TradingFeePpmUpdatedEventModule,
    PairTradingFeePpmUpdatedEventModule,
    ActivityModule,
    HistoricQuoteModule,
    VoucherTransferEventModule,
    AnalyticsModule,
    DexScreenerModule,
    VolumeModule,
    TvlModule,
    DeploymentModule,
    CodexModule,
    ArbitrageExecutedEventModule,
    VortexTokensTradedEventModule,
    VortexTradingResetEventModule,
    VortexFundsWithdrawnEventModule,
    NotificationModule,
    ProtectionRemovedEventModule,
  ],
  providers: [UpdaterService],
})
export class UpdaterModule {}
