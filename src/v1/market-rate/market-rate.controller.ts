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
        '0x3894085ef7ff0f0aedf52e2a2704928d1ec074f1': 'usd-coin',
        '0xb75d0b03c06a926e488e2659df1a861f860bd3d1': 'tether',
        '0xe30fedd158a2e3b13e9badaeabafc5516e95e8c7': 'sei-network',
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
