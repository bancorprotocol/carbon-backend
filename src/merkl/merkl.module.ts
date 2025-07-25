import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campaign } from './entities/campaign.entity';
import { EpochReward } from './entities/epoch-reward.entity';
import { CampaignService } from './services/campaign.service';
import { MerklProcessorService } from './services/merkl-processor.service';
import { LastProcessedBlockModule } from '../last-processed-block/last-processed-block.module';
import { BlockModule } from '../block/block.module';
import { HistoricQuoteModule } from '../historic-quote/historic-quote.module';
import { StrategyCreatedEventModule } from '../events/strategy-created-event/strategy-created-event.module';
import { StrategyUpdatedEventModule } from '../events/strategy-updated-event/strategy-updated-event.module';
import { StrategyDeletedEventModule } from '../events/strategy-deleted-event/strategy-deleted-event.module';
import { VoucherTransferEventModule } from '../events/voucher-transfer-event/voucher-transfer-event.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Campaign, EpochReward]),
    LastProcessedBlockModule,
    BlockModule,
    HistoricQuoteModule,
    StrategyCreatedEventModule,
    StrategyUpdatedEventModule,
    StrategyDeletedEventModule,
    VoucherTransferEventModule,
  ],
  providers: [CampaignService, MerklProcessorService],
  exports: [CampaignService, MerklProcessorService, TypeOrmModule.forFeature([Campaign, EpochReward])],
})
export class MerklModule {}
