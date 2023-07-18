import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LastProcessedBlockModule } from '../last-processed-block/last-processed-block.module';
import { RedisModule } from '../redis/redis.module';
import { Strategy } from './strategy.entity';
import { StrategyService } from './strategy.service';
import { CacheModule } from '../cache/cache.module';
import { StrategyController } from './strategy.controller';
import { StrategyCreatedEventModule } from '../events/strategy-created-event/strategy-created-event.module';
import { StrategyUpdatedEventModule } from '../events/strategy-updated-event/strategy-updated-event.module';
import { StrategyDeletedEventModule } from '../events/strategy-deleted-event/strategy-deleted-event.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Strategy]),
    LastProcessedBlockModule,
    RedisModule,
    CacheModule,
    StrategyCreatedEventModule,
    StrategyUpdatedEventModule,
    StrategyDeletedEventModule,
  ],
  providers: [ConfigService, StrategyService],
  exports: [StrategyService, TypeOrmModule.forFeature([Strategy])],
  controllers: [StrategyController],
})
export class StrategyModule {}
