import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VortexFundsWithdrawnEvent } from './vortex-funds-withdrawn-event.entity';
import { VortexFundsWithdrawnEventService } from './vortex-funds-withdrawn-event.service';
import { HarvesterModule } from '../../harvester/harvester.module';

@Module({
  imports: [TypeOrmModule.forFeature([VortexFundsWithdrawnEvent]), HarvesterModule],
  providers: [VortexFundsWithdrawnEventService],
  exports: [VortexFundsWithdrawnEventService],
})
export class VortexFundsWithdrawnEventModule {}
