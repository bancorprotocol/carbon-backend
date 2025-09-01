import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Strategy } from '../strategy/strategy.entity';
import { WalletPairBalanceService } from './wallet-pair-balance.service';

@Module({
  imports: [TypeOrmModule.forFeature([Strategy])],
  providers: [WalletPairBalanceService],
  exports: [WalletPairBalanceService],
})
export class WalletPairBalanceModule {}
