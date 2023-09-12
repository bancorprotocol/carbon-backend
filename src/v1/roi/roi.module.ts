import { Module } from '@nestjs/common';
import { RoiController } from './roi.controller';
import { RoiService } from './roi.service';
import { StrategyModule } from '../../strategy/strategy.module';

@Module({
  imports: [StrategyModule],
  controllers: [RoiController],
  providers: [RoiService],
})
export class RoiModule {}
