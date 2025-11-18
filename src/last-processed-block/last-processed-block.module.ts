import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LastProcessedBlock } from './last-processed-block.entity';
import { LastProcessedBlockService } from './last-processed-block.service';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [TypeOrmModule.forFeature([LastProcessedBlock])],
  providers: [ConfigService, LastProcessedBlockService],
  exports: [LastProcessedBlockService, TypeOrmModule.forFeature([LastProcessedBlock])],
})
export class LastProcessedBlockModule {}
