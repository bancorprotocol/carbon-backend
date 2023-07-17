import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QuoteModule } from '../quote/quote.module';
import { BlockModule } from '../block/block.module';
import { BlockchainConfigModule } from '../blockchain-config/blockchain-config.module';
import { LastProcessedBlockModule } from '../last-processed-block/last-processed-block.module';
import { HarvesterService } from './harvester.service';

@Module({
  imports: [
    LastProcessedBlockModule,
    BlockchainConfigModule,
    BlockModule,
    QuoteModule,
  ],
  providers: [ConfigService, HarvesterService],
  exports: [HarvesterService],
})
export class HarvesterModule {}
