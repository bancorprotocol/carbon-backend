import { Module } from '@nestjs/common';
import { BlockModule } from '../block/block.module';
import { BlockchainConfigModule } from '../blockchain-config/blockchain-config.module';
import { RedisModule } from '../redis/redis.module';
import { UpdaterService } from './updater.service';
import { HarvesterModule } from '../harvester/harvester.module';
import { LastProcessedBlockModule } from '../last-processed-block/last-processed-block.module';
import { QuoteModule } from '../quote/quote.module';
import { StrategyCreatedEventModule } from '../events/strategy-created-event/strategy-created-event.module';
import { TokenModule } from '../token/token.module';
import { PairModule } from '../pair/pair.module';
import { PairCreatedEventModule } from '../events/pair-created-event /pair-created-event.module';
import { StrategyModule } from '../strategy/strategy.module';
import { TokensTradedEventModule } from '../events/tokens-traded-event/tokens-traded-event.module';
import { RoiModule } from '../v1/roi/roi.module';
import { CoingeckoModule } from '../v1/coingecko/coingecko.module';

@Module({
  imports: [
    BlockModule,
    BlockchainConfigModule,
    RedisModule,
    HarvesterModule,
    LastProcessedBlockModule,
    QuoteModule,
    StrategyCreatedEventModule,
    TokenModule,
    PairModule,
    PairCreatedEventModule,
    StrategyModule,
    TokensTradedEventModule,
    RoiModule,
    CoingeckoModule,
  ],
  providers: [UpdaterService],
})
export class UpdaterModule {}
