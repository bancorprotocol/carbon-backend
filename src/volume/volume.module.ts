import { Module } from '@nestjs/common';
import { VolumeService } from './volume.service';
import { LastProcessedBlockModule } from '../last-processed-block/last-processed-block.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HistoricQuoteModule } from '../historic-quote/historic-quote.module';

@Module({
  imports: [TypeOrmModule.forFeature([]), LastProcessedBlockModule, HistoricQuoteModule],
  providers: [VolumeService],
  exports: [VolumeService],
})
export class VolumeModule {}
