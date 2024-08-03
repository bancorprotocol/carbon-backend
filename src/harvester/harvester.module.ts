import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LastProcessedBlockModule } from '../last-processed-block/last-processed-block.module';
import { HarvesterService } from './harvester.service';
import { BlockModule } from '../block/block.module';

@Module({
  imports: [LastProcessedBlockModule, BlockModule],
  providers: [ConfigService, HarvesterService],
  exports: [HarvesterService],
})
export class HarvesterModule {}
