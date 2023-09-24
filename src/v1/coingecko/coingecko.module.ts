import { Module } from '@nestjs/common';
import { CoinGeckoController } from './coingecko.controller';
import { CoingeckoService } from './coingecko.service';
import { TokensTradedEventModule } from 'src/events/tokens-traded-event/tokens-traded-event.module';
import { PairModule } from '../../pair/pair.module';

@Module({
  imports: [TokensTradedEventModule, PairModule],
  controllers: [CoinGeckoController],
  providers: [CoingeckoService],
  exports: [CoingeckoService],
})
export class CoingeckoModule {}
