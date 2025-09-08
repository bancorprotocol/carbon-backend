import { Module } from '@nestjs/common';
import { MerklController } from './merkl.controller';
import { MerklModule as MainMerklModule } from '../../merkl/merkl.module';
import { DeploymentModule } from '../../deployment/deployment.module';
import { PairModule } from '../../pair/pair.module';
import { TvlModule } from '../../tvl/tvl.module';
import { TokenModule } from '../../token/token.module';
import { HistoricQuoteModule } from '../../historic-quote/historic-quote.module';

@Module({
  imports: [MainMerklModule, DeploymentModule, PairModule, TvlModule, TokenModule, HistoricQuoteModule],
  controllers: [MerklController],
})
export class MerklModule {}
