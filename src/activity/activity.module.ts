import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityService } from './activity.service';
import { Activity } from './activity.entity';
import { LastProcessedBlockModule } from '../last-processed-block/last-processed-block.module';

@Module({
  imports: [TypeOrmModule.forFeature([Activity]), LastProcessedBlockModule],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
