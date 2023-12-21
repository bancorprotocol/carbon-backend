import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HarvesterModule } from '../../harvester/harvester.module';
import { TradingFeePpmUpdatedEvent } from './trading-fee-ppm-updated-event.entity';
import { TradingFeePpmUpdatedEventService } from './trading-fee-ppm-updated-event.service';

@Module({
  imports: [TypeOrmModule.forFeature([TradingFeePpmUpdatedEvent]), HarvesterModule],
  providers: [ConfigService, TradingFeePpmUpdatedEventService],
  exports: [TradingFeePpmUpdatedEventService, TypeOrmModule.forFeature([TradingFeePpmUpdatedEvent])],
})
export class TradingFeePpmUpdatedEventModule {}
