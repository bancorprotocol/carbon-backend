import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LastProcessedBlockModule } from '../last-processed-block/last-processed-block.module';
import { RedisModule } from '../redis/redis.module';
import { HarvesterModule } from '../harvester/harvester.module';
import { Pair } from './pair.entity';
import { PairService } from './pair.service';
import { PairController } from './pair.controller';
import { PairCreatedEventModule } from '../events/pair-created-event/pair-created-event.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Pair]),
    LastProcessedBlockModule,
    RedisModule,
    HarvesterModule,
    PairCreatedEventModule,
  ],
  providers: [ConfigService, PairService],
  exports: [PairService, TypeOrmModule.forFeature([Pair])],
  controllers: [PairController],
})
export class PairModule {}
