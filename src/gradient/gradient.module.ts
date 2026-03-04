import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GradientStrategy } from './gradient-strategy.entity';
import { GradientStrategyRealtime } from './gradient-strategy-realtime.entity';
import { GradientStrategyCreatedEvent } from './events/gradient-strategy-created-event.entity';
import { GradientStrategyUpdatedEvent } from './events/gradient-strategy-updated-event.entity';
import { GradientStrategyDeletedEvent } from './events/gradient-strategy-deleted-event.entity';
import { GradientTradingFeePPMEvent } from './events/gradient-trading-fee-ppm-event.entity';
import { GradientPairTradingFeePPMEvent } from './events/gradient-pair-trading-fee-ppm-event.entity';
import { GradientRealtimeService } from './gradient-realtime.service';
import { RedisModule } from '../redis/redis.module';
import { HarvesterModule } from '../harvester/harvester.module';
import { DeploymentModule } from '../deployment/deployment.module';

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
    ]),
    RedisModule,
    HarvesterModule,
    DeploymentModule,
  ],
  providers: [GradientRealtimeService],
  exports: [GradientRealtimeService],
})
export class GradientModule {}
