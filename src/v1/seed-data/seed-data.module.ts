import { Module } from '@nestjs/common';
import { SeedDataController } from './seed-data.controller';
import { SeedDataService } from './seed-data.service';
import { DeploymentModule } from '../../deployment/deployment.module';
import { StrategyRealtimeModule } from '../../strategy-realtime/strategy-realtime.module';
import { PairModule } from '../../pair/pair.module';
import { LastProcessedBlockModule } from '../../last-processed-block/last-processed-block.module';

@Module({
  imports: [DeploymentModule, StrategyRealtimeModule, PairModule, LastProcessedBlockModule],
  controllers: [SeedDataController],
  providers: [SeedDataService],
  exports: [SeedDataService],
})
export class SeedDataModule {}
