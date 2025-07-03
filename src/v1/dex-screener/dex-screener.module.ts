import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DexScreenerEventV2 } from './dex-screener-event-v2.entity';
import { DexScreenerV2Service } from './dex-screener-v2.service';
import { DexScreenerV2Controller } from './dex-screener-v2.controller';
import { StrategyModule } from '../../strategy/strategy.module';
import { BlockModule } from '../../block/block.module';
import { TokenModule } from '../../token/token.module';
import { DeploymentModule } from '../../deployment/deployment.module';
import { LastProcessedBlockModule } from '../../last-processed-block/last-processed-block.module';
import { StrategyCreatedEventModule } from '../../events/strategy-created-event/strategy-created-event.module';
import { StrategyUpdatedEventModule } from '../../events/strategy-updated-event/strategy-updated-event.module';
import { StrategyDeletedEventModule } from '../../events/strategy-deleted-event/strategy-deleted-event.module';
import { VoucherTransferEventModule } from '../../events/voucher-transfer-event/voucher-transfer-event.module';
import { TokensTradedEventModule } from '../../events/tokens-traded-event/tokens-traded-event.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DexScreenerEventV2]),
    StrategyModule,
    BlockModule,
    TokenModule,
    DeploymentModule,
    LastProcessedBlockModule,
    StrategyCreatedEventModule,
    StrategyUpdatedEventModule,
    StrategyDeletedEventModule,
    VoucherTransferEventModule,
    TokensTradedEventModule,
  ],
  providers: [DexScreenerV2Service],
  controllers: [DexScreenerV2Controller],
  exports: [DexScreenerV2Service],
})
export class DexScreenerModule {}
