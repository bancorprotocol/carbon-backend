import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HarvesterModule } from '../../harvester/harvester.module';
import { StrategyCreatedEvent } from './strategy-created-event.entity';
import { StrategyCreatedEventService } from './strategy-created-event.service';

@Module({
  imports: [TypeOrmModule.forFeature([StrategyCreatedEvent]), HarvesterModule],
  providers: [ConfigService, StrategyCreatedEventService],
  exports: [StrategyCreatedEventService, TypeOrmModule.forFeature([StrategyCreatedEvent])],
})
export class StrategyCreatedEventModule {}
