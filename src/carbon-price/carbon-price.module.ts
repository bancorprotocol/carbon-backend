import { Module } from '@nestjs/common';
import { CarbonPriceService } from './carbon-price.service';
import { TokensTradedEventModule } from '../events/tokens-traded-event/tokens-traded-event.module';
import { LastProcessedBlockModule } from '../last-processed-block/last-processed-block.module';

@Module({
  imports: [TokensTradedEventModule, LastProcessedBlockModule],
  providers: [CarbonPriceService],
  exports: [CarbonPriceService],
})
export class CarbonPriceModule {}
