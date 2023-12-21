import { Module } from '@nestjs/common';
import { Simulator2Controller } from './simulator2.controller';
import { CoinMarketCapModule } from '../../coinmarketcap/coinmarketcap.module';
import { Simulator2Service } from './simulator2.service';
import { TradingFeePpmUpdatedEventModule } from '../../events/trading-fee-ppm-updated-event/trading-fee-ppm-updated-event.module';
import { PairTradingFeePpmUpdatedEventModule } from '../../events/pair-trading-fee-ppm-updated-event/pair-trading-fee-ppm-updated-event.module';

@Module({
  imports: [CoinMarketCapModule, TradingFeePpmUpdatedEventModule, PairTradingFeePpmUpdatedEventModule],
  controllers: [Simulator2Controller],
  providers: [Simulator2Service],
})
export class Simulator2Module {}
