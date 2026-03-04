import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Strategy } from '../strategy/strategy.entity';
import { WalletPairBalanceService } from './wallet-pair-balance.service';
import { DeploymentModule } from '../deployment/deployment.module';

@Module({
  imports: [TypeOrmModule.forFeature([Strategy]), DeploymentModule],
  providers: [WalletPairBalanceService],
  exports: [WalletPairBalanceService],
})
export class WalletPairBalanceModule {}
