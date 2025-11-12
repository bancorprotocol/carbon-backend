import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HarvesterModule } from '../../harvester/harvester.module';
import { StrategyUpdatedEvent } from './strategy-updated-event.entity';
import { StrategyUpdatedEventService } from './strategy-updated-event.service';

@Module({
  imports: [TypeOrmModule.forFeature([StrategyUpdatedEvent]), HarvesterModule],
  providers: [ConfigService, StrategyUpdatedEventService],
  exports: [StrategyUpdatedEventService, TypeOrmModule.forFeature([StrategyUpdatedEvent])],
})
export class StrategyUpdatedEventModule {}
