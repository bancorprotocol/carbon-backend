import { Module } from '@nestjs/common';
import { BlockModule } from '../block/block.module';
import { BlockchainConfigModule } from '../blockchain-config/blockchain-config.module';
import { RedisModule } from '../redis/redis.module';
import { UpdaterService } from './updater.service';
import { HarvesterModule } from '../harvester/harvester.module';
import { CacheModule } from '../cache/cache.module';
import { LastProcessedBlockModule } from 'src/last-processed-block/last-processed-block.module';
import { QuoteModule } from 'src/quote/quote.module';
import { StrategyCreatedEventModule } from 'src/events/strategy-created-event/strategy-created-event.module';
import { TokenModule } from 'src/token/token.module';
import { PairModule } from 'src/pair/pair.module';
import { PairCreatedEventModule } from 'src/events/pair-created-event /pair-created-event.module';

@Module({
  imports: [
    BlockModule,
    BlockchainConfigModule,
    RedisModule,
    HarvesterModule,
    CacheModule,
    LastProcessedBlockModule,
    QuoteModule,
    StrategyCreatedEventModule,
    TokenModule,
    PairModule,
    PairCreatedEventModule,
  ],
  providers: [UpdaterService],
})
export class UpdaterModule {}
