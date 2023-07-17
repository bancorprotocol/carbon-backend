import { Module } from '@nestjs/common';
import { BlockchainConfigProvider } from './blockchain-config.provider';
import { ConfigService } from '@nestjs/config';

@Module({
  providers: [BlockchainConfigProvider, ConfigService],
  exports: [BlockchainConfigProvider],
})
export class BlockchainConfigModule {}
