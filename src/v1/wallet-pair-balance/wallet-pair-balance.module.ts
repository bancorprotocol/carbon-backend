import { Module } from '@nestjs/common';
import { WalletPairBalanceController } from './wallet-pair-balance.controller';
import { WalletPairBalanceModule } from '../../wallet-pair-balance/wallet-pair-balance.module';
import { DeploymentModule } from '../../deployment/deployment.module';
import { LastProcessedBlockModule } from '../../last-processed-block/last-processed-block.module';

@Module({
  imports: [WalletPairBalanceModule, DeploymentModule, LastProcessedBlockModule],
  controllers: [WalletPairBalanceController],
})
export class WalletPairBalanceV1Module {}
