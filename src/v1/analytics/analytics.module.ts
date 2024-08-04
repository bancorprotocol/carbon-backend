import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { StrategyModule } from 'src/strategy/strategy.module';
import { AnalyticsController } from './analytics.controller';
import { VolumeModule } from '../../volume/volume.module';
import { TvlModule } from '../../tvl/tvl.module';
import { DeploymentModule } from '../../deployment/deployment.module';

@Module({
  imports: [StrategyModule, VolumeModule, TvlModule, DeploymentModule],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
  controllers: [AnalyticsController],
})
export class AnalyticsModule {}
