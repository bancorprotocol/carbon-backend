// coinmarketcap.module.ts

import { Module } from '@nestjs/common';
import { CoinMarketCapService } from './coinmarketcap.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [CoinMarketCapService],
  exports: [CoinMarketCapService],
})
export class CoinMarketCapModule {}
