import { Module } from '@nestjs/common';
import { Simulator2Controller } from './simulator2.controller';
import { CoinMarketCapModule } from '../../coinmarketcap/coinmarketcap.module';
import { Simulator2Service } from './simulator2.service';

@Module({
  imports: [CoinMarketCapModule],
  controllers: [Simulator2Controller],
  providers: [Simulator2Service],
})
export class Simulator2Module {}
