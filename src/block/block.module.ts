import { Module } from '@nestjs/common';
import { BlockService } from './block.service';
import { Block } from './block.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { LastProcessedBlockModule } from '../last-processed-block/last-processed-block.module';

@Module({
  imports: [TypeOrmModule.forFeature([Block]), LastProcessedBlockModule],
  providers: [ConfigService, BlockService],
  exports: [BlockService, TypeOrmModule.forFeature([Block])],
})
export class BlockModule {}
