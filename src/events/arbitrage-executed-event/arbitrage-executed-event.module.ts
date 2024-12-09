import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArbitrageExecutedEvent } from './arbitrage-executed-event.entity';
import { ArbitrageExecutedEventService } from './arbitrage-executed-event.service';
import { HarvesterModule } from '../../harvester/harvester.module';

@Module({
  imports: [TypeOrmModule.forFeature([ArbitrageExecutedEvent]), HarvesterModule],
  providers: [ArbitrageExecutedEventService],
  exports: [ArbitrageExecutedEventService],
})
export class ArbitrageExecutedEventModule {}
