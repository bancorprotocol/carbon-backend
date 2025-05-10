import { Module } from '@nestjs/common';
import { RoiController } from './roi.controller';
import { RoiService } from './roi.service';
import { StrategyModule } from '../../strategy/strategy.module';
import { DeploymentModule } from '../../deployment/deployment.module';
import { QuoteModule } from '../../quote/quote.module';

@Module({
  imports: [StrategyModule, DeploymentModule, QuoteModule],
  controllers: [RoiController],
  providers: [RoiService],
  exports: [RoiService],
})
export class RoiModule {}
