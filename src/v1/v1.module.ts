import { Module } from '@nestjs/common';
import { CmcModule } from './cmc/cmc.module';
import { RoiModule } from './roi/roi.module';
import { CoingeckoModule } from './coingecko/coingecko.module';
import { MarketRateModule } from './market-rate/market-rate.module';
import { V1Controller } from './v1.controller';
import { SimulatorModule } from './simulator/simulator.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { DexScreenerModule } from './dex-screener/dex-screener.module';
import { GeckoTerminalModule } from './gecko-terminal/gecko-terminal.module';
import { ActivityModule } from './activity/activity.module';
import { StateModule } from './state/state.module';
import { MerklModule } from './merkl/merkl.module';

@Module({
  imports: [
    CmcModule,
    RoiModule,
    CoingeckoModule,
    MarketRateModule,
    SimulatorModule,
    AnalyticsModule,
    DexScreenerModule,
    GeckoTerminalModule,
    ActivityModule,
    StateModule,
    MerklModule,
  ],
  controllers: [V1Controller],
})
export class V1Module {}
