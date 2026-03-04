import { Module } from '@nestjs/common';
import { StrategiesController } from './strategies.controller';
import { DeploymentModule } from '../../deployment/deployment.module';
import { StrategyRealtimeModule } from '../../strategy-realtime/strategy-realtime.module';
import { GradientModule } from '../../gradient/gradient.module';
import { TokenModule } from '../../token/token.module';

@Module({
  imports: [DeploymentModule, StrategyRealtimeModule, GradientModule, TokenModule],
  controllers: [StrategiesController],
})
export class StrategiesModule {}
