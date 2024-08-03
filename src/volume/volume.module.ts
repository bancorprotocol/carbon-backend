import { Module } from '@nestjs/common';
import { VolumeService } from './volume.service';
import { LastProcessedBlockModule } from '../last-processed-block/last-processed-block.module';
import { Volume } from './volume.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([Volume]), LastProcessedBlockModule],
  providers: [VolumeService],
  exports: [VolumeService],
})
export class VolumeModule {}
