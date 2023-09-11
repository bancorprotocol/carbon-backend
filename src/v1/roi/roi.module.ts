import { Module } from '@nestjs/common';
import { RoiController } from './roi.controller';

@Module({
  controllers: [RoiController]
})
export class RoiModule {}
