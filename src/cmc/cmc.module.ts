import { Module } from '@nestjs/common';
import { CmcController } from './cmc.controller';

@Module({
  controllers: [CmcController],
})
export class CmcModule {}
