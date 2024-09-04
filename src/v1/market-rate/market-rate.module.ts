import { Module } from '@nestjs/common';
import { MarketRateController } from './market-rate.controller';
import { QuoteModule } from '../../quote/quote.module';
import { DeploymentModule } from '../../deployment/deployment.module';

@Module({
  imports: [QuoteModule, DeploymentModule],
  controllers: [MarketRateController],
})
export class MarketRateModule {}
