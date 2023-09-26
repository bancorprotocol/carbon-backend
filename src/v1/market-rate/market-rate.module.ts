import { Module } from '@nestjs/common';
import { MarketRateController } from './market-rate.controller';
import { QuoteModule } from 'src/quote/quote.module';

@Module({
  imports: [QuoteModule],
  controllers: [MarketRateController],
})
export class MarketRateModule {}
