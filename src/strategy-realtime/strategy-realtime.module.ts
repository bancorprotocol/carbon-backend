import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StrategyRealtime } from './strategy-realtime.entity';
import { StrategyRealtimeService } from './strategy-realtime.service';
import { HarvesterModule } from '../harvester/harvester.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [TypeOrmModule.forFeature([StrategyRealtime]), HarvesterModule, RedisModule],
  providers: [StrategyRealtimeService],
  exports: [StrategyRealtimeService],
})
export class StrategyRealtimeModule {}
