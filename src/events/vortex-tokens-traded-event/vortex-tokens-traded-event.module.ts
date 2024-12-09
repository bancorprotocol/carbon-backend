import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VortexTokensTradedEvent } from './vortex-tokens-traded-event.entity';
import { VortexTokensTradedEventService } from './vortex-tokens-traded-event.service';
import { HarvesterModule } from '../../harvester/harvester.module';

@Module({
  imports: [TypeOrmModule.forFeature([VortexTokensTradedEvent]), HarvesterModule],
  providers: [VortexTokensTradedEventService],
  exports: [VortexTokensTradedEventService],
})
export class VortexTokensTradedEventModule {}
