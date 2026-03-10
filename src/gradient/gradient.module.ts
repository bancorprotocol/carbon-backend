import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GradientStrategy } from './gradient-strategy.entity';
import { GradientStrategyRealtime } from './gradient-strategy-realtime.entity';
import { GradientStrategyCreatedEvent } from './events/gradient-strategy-created-event.entity';
import { GradientStrategyUpdatedEvent } from './events/gradient-strategy-updated-event.entity';
import { GradientStrategyDeletedEvent } from './events/gradient-strategy-deleted-event.entity';
import { GradientTradingFeePPMEvent } from './events/gradient-trading-fee-ppm-event.entity';
import { GradientPairTradingFeePPMEvent } from './events/gradient-pair-trading-fee-ppm-event.entity';
import { GradientStrategyLiquidityUpdatedEvent } from './events/gradient-strategy-liquidity-updated-event.entity';
import { GradientStrategyLiquidityUpdatedEventService } from './events/gradient-strategy-liquidity-updated-event.service';
import { GradientRealtimeService } from './gradient-realtime.service';
import { GradientStrategyService } from './gradient-strategy.service';
import { GradientStrategyCreatedEventService } from './events/gradient-strategy-created-event.service';
import { GradientStrategyUpdatedEventService } from './events/gradient-strategy-updated-event.service';
import { GradientStrategyDeletedEventService } from './events/gradient-strategy-deleted-event.service';
import { GradientPairCreatedEventService } from './events/gradient-pair-created-event.service';
import { GradientTokensTradedEventService } from './events/gradient-tokens-traded-event.service';
import { GradientTradingFeePPMEventService } from './events/gradient-trading-fee-ppm-event.service';
import { GradientPairTradingFeePPMEventService } from './events/gradient-pair-trading-fee-ppm-event.service';
import { GradientVoucherTransferEventService } from './events/gradient-voucher-transfer-event.service';
import { GradientActivityService } from './gradient-activity.service';
import { GradientDexScreenerService } from './gradient-dex-screener.service';
import { ActivityV2 } from '../activity/activity-v2.entity';
import { DexScreenerEventV2 } from '../v1/dex-screener/dex-screener-event-v2.entity';
import { PairCreatedEvent } from '../events/pair-created-event/pair-created-event.entity';
import { TokensTradedEvent } from '../events/tokens-traded-event/tokens-traded-event.entity';
import { VoucherTransferEvent } from '../events/voucher-transfer-event/voucher-transfer-event.entity';
import { RedisModule } from '../redis/redis.module';
import { HarvesterModule } from '../harvester/harvester.module';
import { DeploymentModule } from '../deployment/deployment.module';
import { LastProcessedBlockModule } from '../last-processed-block/last-processed-block.module';
import { BlockModule } from '../block/block.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GradientStrategy,
      GradientStrategyRealtime,
      GradientStrategyCreatedEvent,
      GradientStrategyUpdatedEvent,
      GradientStrategyDeletedEvent,
      GradientTradingFeePPMEvent,
      GradientPairTradingFeePPMEvent,
      GradientStrategyLiquidityUpdatedEvent,
      ActivityV2,
      DexScreenerEventV2,
      PairCreatedEvent,
      TokensTradedEvent,
      VoucherTransferEvent,
    ]),
    RedisModule,
    HarvesterModule,
    DeploymentModule,
    LastProcessedBlockModule,
    BlockModule,
  ],
  providers: [
    GradientRealtimeService,
    GradientStrategyService,
    GradientStrategyCreatedEventService,
    GradientStrategyUpdatedEventService,
    GradientStrategyDeletedEventService,
    GradientPairCreatedEventService,
    GradientTokensTradedEventService,
    GradientTradingFeePPMEventService,
    GradientPairTradingFeePPMEventService,
    GradientStrategyLiquidityUpdatedEventService,
    GradientVoucherTransferEventService,
    GradientActivityService,
    GradientDexScreenerService,
  ],
  exports: [
    GradientRealtimeService,
    GradientStrategyService,
    GradientStrategyCreatedEventService,
    GradientStrategyUpdatedEventService,
    GradientStrategyDeletedEventService,
    GradientStrategyLiquidityUpdatedEventService,
    GradientPairCreatedEventService,
    GradientTokensTradedEventService,
    GradientTradingFeePPMEventService,
    GradientPairTradingFeePPMEventService,
    GradientVoucherTransferEventService,
    GradientActivityService,
    GradientDexScreenerService,
  ],
})
export class GradientModule {}
