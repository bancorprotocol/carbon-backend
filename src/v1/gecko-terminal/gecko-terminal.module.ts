import { Module } from '@nestjs/common';
import { GeckoTerminalController } from './gecko-terminal.controller';
import { DexScreenerModule } from '../dex-screener/dex-screener.module';
import { BlockModule } from '../../block/block.module';
import { TokenModule } from '../../token/token.module';
import { DeploymentModule } from '../../deployment/deployment.module';
import { LastProcessedBlockModule } from '../../last-processed-block/last-processed-block.module';
import { PairModule } from '../../pair/pair.module';

@Module({
  imports: [DexScreenerModule, BlockModule, TokenModule, DeploymentModule, LastProcessedBlockModule, PairModule],
  controllers: [GeckoTerminalController],
})
export class GeckoTerminalModule {}
