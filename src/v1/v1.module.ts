import { Module } from '@nestjs/common';
import { CmcModule } from './cmc/cmc.module';
import { RoiModule } from './roi/roi.module';
import { CoingeckoModule } from './coingecko/coingecko.module';

@Module({
  imports: [CmcModule, RoiModule, CoingeckoModule],
})
export class V1Module {}
