import { Module } from '@nestjs/common';
import { ActivityController } from './activity.controller';
import { StrategyModule } from '../../strategy/strategy.module';
import { ActivityModule as ActivityModuleMain } from '../../activity/activity.module';
@Module({
  imports: [StrategyModule, ActivityModuleMain],
  controllers: [ActivityController],
})
export class ActivityModule {}
