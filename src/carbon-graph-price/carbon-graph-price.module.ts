import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CarbonGraphPriceService } from './carbon-graph-price.service';
import { TokensTradedEventModule } from '../events/tokens-traded-event/tokens-traded-event.module';
import { LastProcessedBlockModule } from '../last-processed-block/last-processed-block.module';
import { DeploymentModule } from '../deployment/deployment.module';
import { HistoricQuoteModule } from '../historic-quote/historic-quote.module';
import { QuoteModule } from '../quote/quote.module';

@Module({
  imports: [TokensTradedEventModule, LastProcessedBlockModule, DeploymentModule, HistoricQuoteModule, QuoteModule],
  providers: [ConfigService, CarbonGraphPriceService],
  exports: [CarbonGraphPriceService],
})
export class CarbonGraphPriceModule {}
