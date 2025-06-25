import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DexScreenerEventV2 } from './dex-screener-event-v2.entity';
import { DexScreenerV2Service } from './dex-screener-v2.service';
import { DexScreenerV2Controller } from './dex-screener-v2.controller';
import { LastProcessedBlockModule } from '../../last-processed-block/last-processed-block.module';
import { StrategyCreatedEventModule } from '../../events/strategy-created-event/strategy-created-event.module';
import { StrategyUpdatedEventModule } from '../../events/strategy-updated-event/strategy-updated-event.module';
import { StrategyDeletedEventModule } from '../../events/strategy-deleted-event/strategy-deleted-event.module';
import { VoucherTransferEventModule } from '../../events/voucher-transfer-event/voucher-transfer-event.module';
import { TokensTradedEventModule } from '../../events/tokens-traded-event/tokens-traded-event.module';
import { TokenModule } from '../../token/token.module';
import { BlockModule } from '../../block/block.module';
import { DeploymentModule } from '../../deployment/deployment.module';
import { StrategyCreatedEvent } from '../../events/strategy-created-event/strategy-created-event.entity';
import { StrategyUpdatedEvent } from '../../events/strategy-updated-event/strategy-updated-event.entity';
import { StrategyDeletedEvent } from '../../events/strategy-deleted-event/strategy-deleted-event.entity';
import { VoucherTransferEvent } from '../../events/voucher-transfer-event/voucher-transfer-event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DexScreenerEventV2,
      StrategyCreatedEvent,
      StrategyUpdatedEvent,
      StrategyDeletedEvent,
      VoucherTransferEvent,
    ]),
    LastProcessedBlockModule,
    StrategyCreatedEventModule,
    StrategyUpdatedEventModule,
    StrategyDeletedEventModule,
    VoucherTransferEventModule,
    TokensTradedEventModule,
    TokenModule,
    BlockModule,
    DeploymentModule,
  ],
  providers: [DexScreenerV2Service],
  controllers: [DexScreenerV2Controller],
  exports: [DexScreenerV2Service],
})
export class DexScreenerV2Module {}
