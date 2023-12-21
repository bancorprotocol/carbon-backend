import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HarvesterModule } from '../../harvester/harvester.module';
import { PairTradingFeePpmUpdatedEvent } from './pair-trading-fee-ppm-updated-event.entity';
import { PairTradingFeePpmUpdatedEventService } from './pair-trading-fee-ppm-updated-event.service';

@Module({
  imports: [TypeOrmModule.forFeature([PairTradingFeePpmUpdatedEvent]), HarvesterModule],
  providers: [ConfigService, PairTradingFeePpmUpdatedEventService],
  exports: [PairTradingFeePpmUpdatedEventService, TypeOrmModule.forFeature([PairTradingFeePpmUpdatedEvent])],
})
export class PairTradingFeePpmUpdatedEventModule {}
