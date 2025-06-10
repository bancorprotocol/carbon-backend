import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LastProcessedBlockModule } from '../last-processed-block/last-processed-block.module';
import { RedisModule } from '../redis/redis.module';
import { HarvesterModule } from '../harvester/harvester.module';
import { Token } from './token.entity';
import { TokenService } from './token.service';
import { PairCreatedEventModule } from '../events/pair-created-event/pair-created-event.module';
import { ArbitrageExecutedEventModule } from '../events/arbitrage-executed-event/arbitrage-executed-event.module';
import { ArbitrageExecutedEventModuleV2 } from '../events/arbitrage-executed-event-v2/arbitrage-executed-event-v2.module';
import { VortexTokensTradedEventModule } from '../events/vortex-tokens-traded-event/vortex-tokens-traded-event.module';
import { VortexTradingResetEventModule } from '../events/vortex-trading-reset-event/vortex-trading-reset-event.module';
import { VortexFundsWithdrawnEventModule } from '../events/vortex-funds-withdrawn-event/vortex-funds-withdrawn-event.module';
import { ProtectionRemovedEventModule } from '../events/protection-removed-event/protection-removed-event.module';
import { DeploymentModule } from '../deployment/deployment.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([Token]),
    LastProcessedBlockModule,
    RedisModule,
    HarvesterModule,
    PairCreatedEventModule,
    ArbitrageExecutedEventModule,
    ArbitrageExecutedEventModuleV2,
    VortexTokensTradedEventModule,
    VortexTradingResetEventModule,
    VortexFundsWithdrawnEventModule,
    ProtectionRemovedEventModule,
    DeploymentModule,
  ],
  providers: [TokenService],
  exports: [TokenService, TypeOrmModule.forFeature([Token])],
})
export class TokenModule {}
