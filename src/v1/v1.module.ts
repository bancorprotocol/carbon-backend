import { Module } from '@nestjs/common';
import { CmcModule } from './cmc/cmc.module';
import { RoiModule } from './roi/roi.module';
import { CoingeckoModule } from './coingecko/coingecko.module';
import { MarketRateModule } from './market-rate/market-rate.module';
import { V1Controller } from './v1.controller';
import { DuneModule } from '../dune/dune.module';
import { SimulatorModule } from './simulator/simulator.module';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [CmcModule, RoiModule, CoingeckoModule, MarketRateModule, DuneModule, SimulatorModule, AnalyticsModule],
  controllers: [V1Controller],
})
export class V1Module {}
