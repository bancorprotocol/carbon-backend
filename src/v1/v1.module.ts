import { Module } from '@nestjs/common';
import { CmcModule } from './cmc/cmc.module';

@Module({
  imports: [CmcModule],
})
export class V1Module {}
