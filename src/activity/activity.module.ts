import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityService } from './activity.service';
import { Activity } from './activity.entity';
import { LastProcessedBlockModule } from '../last-processed-block/last-processed-block.module';
import { ActivityV2 } from './activity-v2.entity';
import { ActivityV2Service } from './activity-v2.service';
import { StrategyCreatedEventModule } from '../events/strategy-created-event/strategy-created-event.module';
import { StrategyUpdatedEventModule } from '../events/strategy-updated-event/strategy-updated-event.module';
import { StrategyDeletedEventModule } from '../events/strategy-deleted-event/strategy-deleted-event.module';
import { VoucherTransferEventModule } from '../events/voucher-transfer-event/voucher-transfer-event.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([Activity, ActivityV2]),
    LastProcessedBlockModule,
    StrategyCreatedEventModule,
    StrategyUpdatedEventModule,
    StrategyDeletedEventModule,
    VoucherTransferEventModule,
  ],
  providers: [ActivityService, ActivityV2Service],
  exports: [ActivityService, ActivityV2Service],
})
export class ActivityModule {}
