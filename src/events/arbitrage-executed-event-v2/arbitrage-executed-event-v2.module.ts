import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArbitrageExecutedEventV2 } from './arbitrage-executed-event-v2.entity';
import { ArbitrageExecutedEventServiceV2 } from './arbitrage-executed-event-v2.service';
import { HarvesterModule } from '../../harvester/harvester.module';

@Module({
  imports: [TypeOrmModule.forFeature([ArbitrageExecutedEventV2]), HarvesterModule],
  providers: [ArbitrageExecutedEventServiceV2],
  exports: [ArbitrageExecutedEventServiceV2],
})
export class ArbitrageExecutedEventModuleV2 {}
