import { Controller, Get, Header, Query } from '@nestjs/common';
import { MarketRateDto } from './market-rate.dto';
import { QuoteService } from '../../quote/quote.service';
import { CacheTTL } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { BlockchainType } from '../../harvester/harvester.service';
import { CoinGeckoService } from '../../quote/coingecko.service';

@Controller({ version: '1', path: 'market-rate' })
export class MarketRateController {
  private blockchainType: BlockchainType;
  constructor(
    private configService: ConfigService,
    private quoteService: QuoteService,
    private coingeckoService: CoinGeckoService,
  ) {
    this.blockchainType = this.configService.get('BLOCKCHAIN_TYPE');
  }

  @Get('')
  @CacheTTL(1 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  async marketRate(@Query() params: MarketRateDto): Promise<any> {
    const { address, convert } = params;
    const currencies = convert.split(',');
    let _address = address;
    let data;
    if (this.blockchainType === BlockchainType.Sei) {
      const seiMap = {
        '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee': 'sei-network',
        '0xace5f7ea93439af39b46d2748fa1ac19951c8d7c': 'usd-coin',
        '0xf983afa393199d6902a1dd04f8e93465915ffd8b': 'tether',
        '0x027d2e627209f1ceba52adc8a5afe9318459b44b': 'sei-network',
      };
      _address = seiMap[address.toLowerCase()];
      data = await this.coingeckoService.getCoinPrices([_address], currencies);
    } else {
      data = await this.quoteService.fetchLatestPrice(_address, currencies);
    }

    const result = {
      data: {},
      provider: 'coingecko',
    };
    currencies.forEach((c) => {
      result['data'][c.toUpperCase()] = data[_address.toLowerCase()][c.toLowerCase()];
    });
    return result;
  }
}
