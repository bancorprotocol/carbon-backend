import { Module } from '@nestjs/common';
import { DeploymentModule } from '../../deployment/deployment.module';
import { StateController } from './state.controller';
import { LastProcessedBlockModule } from '../../last-processed-block/last-processed-block.module';

@Module({
  imports: [DeploymentModule, LastProcessedBlockModule],
  controllers: [StateController],
})
export class StateModule {}
