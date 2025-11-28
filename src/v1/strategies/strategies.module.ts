import { Module } from '@nestjs/common';
import { StrategiesController } from './strategies.controller';
import { DeploymentModule } from '../../deployment/deployment.module';
import { StrategyModule } from '../../strategy/strategy.module';
import { BlockModule } from '../../block/block.module';

@Module({
  imports: [DeploymentModule, StrategyModule, BlockModule],
  controllers: [StrategiesController],
})
export class StrategiesModule {}
