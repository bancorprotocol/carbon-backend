import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { StrategyModule } from '../../strategy/strategy.module';
import { AnalyticsController } from './analytics.controller';
import { VolumeModule } from '../../volume/volume.module';
import { TvlModule } from '../../tvl/tvl.module';
import { DeploymentModule } from '../../deployment/deployment.module';
import { PairModule } from '../../pair/pair.module';

@Module({
  imports: [StrategyModule, VolumeModule, TvlModule, DeploymentModule, PairModule],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
  controllers: [AnalyticsController],
})
export class AnalyticsModule {}
