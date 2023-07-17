import { Module } from '@nestjs/common';
import { QuoteService } from './quote.service';
import { Quote } from './quote.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { RedisModule } from '../redis/redis.module';
import { CoinMarketCapService } from './coin-market-cap/coin-market-cap.service';
import { CryptoCompareService } from './crypto-compare/crypto-compare.service';

@Module({
  imports: [TypeOrmModule.forFeature([Quote]), RedisModule],
  providers: [
    ConfigService,
    QuoteService,
    CoinMarketCapService,
    CryptoCompareService,
  ],
  exports: [QuoteService, TypeOrmModule.forFeature([Quote])],
})
export class QuoteModule {}
