import { Module } from '@nestjs/common';
import { SimulatorController } from './simulator.controller';
import { CoinMarketCapModule } from '../../coinmarketcap/coinmarketcap.module';
import { SimulatorService } from './simulator.service';

@Module({
  imports: [CoinMarketCapModule],
  controllers: [SimulatorController],
  providers: [SimulatorService],
})
export class SimulatorModule {}
