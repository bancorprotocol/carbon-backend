import { Module } from '@nestjs/common';
import { CarbonPriceService } from './carbon-price.service';
import { TokensTradedEventModule } from '../events/tokens-traded-event/tokens-traded-event.module';
import { LastProcessedBlockModule } from '../last-processed-block/last-processed-block.module';
import { HistoricQuoteModule } from '../historic-quote/historic-quote.module';
import { DeploymentModule } from '../deployment/deployment.module';
@Module({
  imports: [TokensTradedEventModule, LastProcessedBlockModule, HistoricQuoteModule, DeploymentModule],
  providers: [CarbonPriceService],
  exports: [CarbonPriceService],
})
export class CarbonPriceModule {}
