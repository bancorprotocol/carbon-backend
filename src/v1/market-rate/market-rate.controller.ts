import { Controller, Get, Header, Query } from '@nestjs/common';
import { MarketRateDto } from './market-rate.dto';
import { QuoteService } from '../../quote/quote.service';
import { CacheTTL } from '@nestjs/cache-manager';

@Controller({ version: '1', path: 'market-rate' })
export class MarketRateController {
  constructor(private quoteService: QuoteService) {}

  @Get('')
  @CacheTTL(1 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  async marketRate(@Query() params: MarketRateDto): Promise<any> {
    const { address, convert } = params;
    const data = await this.quoteService.fetchLatestPrice(address, convert);
    return {
      data: {
        [convert.toUpperCase()]: data[address.toLowerCase()][convert.toLowerCase()],
      },
      provider: 'coingecko',
    };
  }
}
