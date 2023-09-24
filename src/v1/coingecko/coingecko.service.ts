import { Injectable } from '@nestjs/common';
import { HistoricalTradesDto } from './historical_trades.dto';

@Injectable()
export class CoingeckoService {
  constructor() {}

  async historicalTrades(params: HistoricalTradesDto): Promise<any> {}
}
