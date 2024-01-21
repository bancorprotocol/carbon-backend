import { Module } from '@nestjs/common';
import { RoiController } from './activity.controller';
import { ActivityService } from './activity.service';
import { StrategyModule } from '../../strategy/strategy.module';

@Module({
  imports: [StrategyModule],
  controllers: [RoiController],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
