import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LastProcessedBlockModule } from '../last-processed-block/last-processed-block.module';
import { RedisModule } from '../redis/redis.module';
import { HarvesterModule } from '../harvester/harvester.module';
import { Token } from './token.entity';
import { TokenService } from './token.service';
import { PairCreatedEventModule } from '../events/pair-created-event/pair-created-event.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Token]),
    LastProcessedBlockModule,
    RedisModule,
    HarvesterModule,
    PairCreatedEventModule,
  ],
  providers: [TokenService],
  exports: [TokenService, TypeOrmModule.forFeature([Token])],
})
export class TokenModule {}
