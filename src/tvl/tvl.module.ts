import { Module } from '@nestjs/common';
import { TvlService } from './tvl.service';
import { LastProcessedBlockModule } from '../last-processed-block/last-processed-block.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tvl } from './tvl.entity';
import { TotalTvl } from './total-tvl.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Tvl, TotalTvl]), LastProcessedBlockModule],
  providers: [TvlService],
  exports: [TvlService],
})
export class TvlModule {}
