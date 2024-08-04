import { Module } from '@nestjs/common';
import { ActivityController } from './activity.controller';
import { StrategyModule } from '../../strategy/strategy.module';
import { ActivityModule as ActivityModuleMain } from '../../activity/activity.module';
import { DeploymentModule } from '../../deployment/deployment.module';
@Module({
  imports: [StrategyModule, ActivityModuleMain, DeploymentModule],
  controllers: [ActivityController],
})
export class ActivityModule {}
