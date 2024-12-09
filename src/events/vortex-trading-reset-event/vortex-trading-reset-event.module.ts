import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VortexTradingResetEvent } from './vortex-trading-reset-event.entity';
import { VortexTradingResetEventService } from './vortex-trading-reset-event.service';
import { HarvesterModule } from '../../harvester/harvester.module';

@Module({
  imports: [TypeOrmModule.forFeature([VortexTradingResetEvent]), HarvesterModule],
  providers: [VortexTradingResetEventService],
  exports: [VortexTradingResetEventService],
})
export class VortexTradingResetEventModule {}
