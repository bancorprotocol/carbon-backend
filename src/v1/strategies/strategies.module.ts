import { Module } from '@nestjs/common';
import { StrategiesController } from './strategies.controller';
import { DeploymentModule } from '../../deployment/deployment.module';
import { StrategyRealtimeModule } from '../../strategy-realtime/strategy-realtime.module';

@Module({
  imports: [DeploymentModule, StrategyRealtimeModule],
  controllers: [StrategiesController],
})
export class StrategiesModule {}
