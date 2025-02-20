import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LastProcessedBlockModule } from '../last-processed-block/last-processed-block.module';
import { RedisModule } from '../redis/redis.module';
import { HarvesterModule } from '../harvester/harvester.module';
import { Token } from './token.entity';
import { TokenService } from './token.service';
import { PairCreatedEventModule } from '../events/pair-created-event/pair-created-event.module';
import { ArbitrageExecutedEventModule } from '../events/arbitrage-executed-event/arbitrage-executed-event.module';
import { VortexTokensTradedEventModule } from '../events/vortex-tokens-traded-event/vortex-tokens-traded-event.module';
import { VortexTradingResetEventModule } from '../events/vortex-trading-reset-event/vortex-trading-reset-event.module';
import { VortexFundsWithdrawnEventModule } from '../events/vortex-funds-withdrawn-event/vortex-funds-withdrawn-event.module';
import { ProtectionRemovedEventModule } from '../events/protection-removed-event/protection-removed-event.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([Token]),
    LastProcessedBlockModule,
    RedisModule,
    HarvesterModule,
    PairCreatedEventModule,
    ArbitrageExecutedEventModule,
    VortexTokensTradedEventModule,
    VortexTradingResetEventModule,
    VortexFundsWithdrawnEventModule,
    ProtectionRemovedEventModule,
  ],
  providers: [TokenService],
  exports: [TokenService, TypeOrmModule.forFeature([Token])],
})
export class TokenModule {}
