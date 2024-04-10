import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlockchainConfigModule } from '../blockchain-config/blockchain-config.module';
import { LastProcessedBlockModule } from '../last-processed-block/last-processed-block.module';
import { HarvesterService } from './harvester.service';
import { BlockModule } from '../block/block.module';

@Module({
  imports: [LastProcessedBlockModule, BlockchainConfigModule, BlockModule],
  providers: [ConfigService, HarvesterService],
  exports: [HarvesterService],
})
export class HarvesterModule {}
