import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HarvesterModule } from '../../harvester/harvester.module';
import { StrategyDeletedEvent } from './strategy-deleted-event.entity';
import { StrategyDeletedEventService } from './strategy-deleted-event.service';

@Module({
  imports: [TypeOrmModule.forFeature([StrategyDeletedEvent]), HarvesterModule],
  providers: [ConfigService, StrategyDeletedEventService],
  exports: [StrategyDeletedEventService, TypeOrmModule.forFeature([StrategyDeletedEvent])],
})
export class StrategyDeletedEventModule {}
