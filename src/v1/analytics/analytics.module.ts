import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { StrategyModule } from 'src/strategy/strategy.module';
import { AnalyticsController } from './analytics.controller';

@Module({
  imports: [StrategyModule],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
  controllers: [AnalyticsController],
})
export class AnalyticsModule {}
