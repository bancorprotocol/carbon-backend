import { Module } from '@nestjs/common';
import { CmcModule } from './cmc/cmc.module';
import { RoiModule } from './roi/roi.module';

@Module({
  imports: [CmcModule, RoiModule],
})
export class V1Module {}
