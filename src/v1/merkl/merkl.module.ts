import { Module } from '@nestjs/common';
import { MerklController } from './merkl.controller';
import { MerklModule as MainMerklModule } from '../../merkl/merkl.module';
import { DeploymentModule } from '../../deployment/deployment.module';
import { PairModule } from '../../pair/pair.module';
import { TvlModule } from '../../tvl/tvl.module';

@Module({
  imports: [MainMerklModule, DeploymentModule, PairModule, TvlModule],
  controllers: [MerklController],
})
export class MerklModule {}
