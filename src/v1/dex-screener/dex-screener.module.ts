import { Module } from '@nestjs/common';
import { DexScreenerService } from './dex-screener.service';
import { DexScreenerController } from './dex-screener.controller';
import { StrategyModule } from '../../strategy/strategy.module';
import { BlockModule } from '../../block/block.module';
import { TokenModule } from '../../token/token.module';
import { DeploymentModule } from '../../deployment/deployment.module';
import { LastProcessedBlockModule } from '../../last-processed-block/last-processed-block.module';

@Module({
  imports: [StrategyModule, BlockModule, TokenModule, DeploymentModule, LastProcessedBlockModule],
  providers: [DexScreenerService],
  controllers: [DexScreenerController],
  exports: [DexScreenerService],
})
export class DexScreenerModule {}
