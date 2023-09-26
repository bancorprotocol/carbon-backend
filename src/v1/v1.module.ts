import { Module } from '@nestjs/common';
import { CmcModule } from './cmc/cmc.module';
import { RoiModule } from './roi/roi.module';
import { CoingeckoModule } from './coingecko/coingecko.module';
import { MarketRateModule } from './market-rate/market-rate.module';

@Module({
  imports: [CmcModule, RoiModule, CoingeckoModule, MarketRateModule],
})
export class V1Module {}
