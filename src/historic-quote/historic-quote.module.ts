import { Module } from '@nestjs/common';
import { HistoricQuoteService } from './historic-quote.service';
import { CoinMarketCapModule } from '../coinmarketcap/coinmarketcap.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HistoricQuote } from './historic-quote.entity';
import { HistoricQuoteController } from './historic-quote.controller';
import { CodexModule } from '../codex/codex.module';

@Module({
  imports: [TypeOrmModule.forFeature([HistoricQuote]), CoinMarketCapModule, CodexModule],
  providers: [HistoricQuoteService],
  exports: [HistoricQuoteService],
  controllers: [HistoricQuoteController],
})
export class HistoricQuoteModule {}
