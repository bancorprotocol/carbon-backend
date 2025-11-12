import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HarvesterModule } from '../../harvester/harvester.module';
import { PairCreatedEvent } from './pair-created-event.entity';
import { PairCreatedEventService } from './pair-created-event.service';

@Module({
  imports: [TypeOrmModule.forFeature([PairCreatedEvent]), HarvesterModule],
  providers: [ConfigService, PairCreatedEventService],
  exports: [PairCreatedEventService, TypeOrmModule.forFeature([PairCreatedEvent])],
})
export class PairCreatedEventModule {}
