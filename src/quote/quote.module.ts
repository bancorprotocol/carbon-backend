import { Module } from '@nestjs/common';
import { QuoteService } from './quote.service';
import { Quote } from './quote.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { RedisModule } from '../redis/redis.module';
import { TokenModule } from '../token/token.module';
import { CoinGeckoService } from './coingecko.service';

@Module({
  imports: [TypeOrmModule.forFeature([Quote]), RedisModule, TokenModule],
  providers: [ConfigService, QuoteService, CoinGeckoService],
  exports: [QuoteService, TypeOrmModule.forFeature([Quote]), CoinGeckoService],
})
export class QuoteModule {}
