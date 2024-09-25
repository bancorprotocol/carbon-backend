import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { StrategyModule } from '../../strategy/strategy.module';
import { AnalyticsController } from './analytics.controller';
import { VolumeModule } from '../../volume/volume.module';
import { TvlModule } from '../../tvl/tvl.module';
import { DeploymentModule } from '../../deployment/deployment.module';
import { PairModule } from '../../pair/pair.module';
import { TokenModule } from '../../token/token.module';

@Module({
  imports: [StrategyModule, VolumeModule, TvlModule, DeploymentModule, PairModule, TokenModule],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
  controllers: [AnalyticsController],
})
export class AnalyticsModule {}
