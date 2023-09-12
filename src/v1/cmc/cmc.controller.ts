import { CacheTTL } from '@nestjs/cache-manager';
import { Controller, Get, Header, Query } from '@nestjs/common';
import { HistoricalTradesDto } from './historical_trades.dto';
import { TokensTradedEventService } from '../../events/tokens-traded-event/tokens-traded-event.service';
import { PairService } from '../../pair/pair.service';

@Controller({ version: '1', path: 'cmc' })
export class CmcController {
  constructor(private tokensTradedEventService: TokensTradedEventService, private pairService: PairService) {}

  @Get('pairs')
  @CacheTTL(1 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  async pairs(): Promise<any> {
    const pairs = await this.pairService.all();
    const volume24h = await this.tokensTradedEventService.volume24hByPair();

    return pairs.map((p) => {
      return {
        quote_symbol: p.token1.symbol,
        base_id: p.token0.address,
        base_volume: volume24h[p.id] ? volume24h[p.id].token0Volume : '0',
        quote_volume: volume24h[p.id] ? volume24h[p.id].token1Volume : '0',
        quote_id: p.token1.address,
        base_symbol: p.token0.symbol,
        pair: `${p.token0.address}_${p.token1.address}`,
        last_price: 0,
      };
    });
  }

  @Get('historical_trades')
  @CacheTTL(60 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  async historical_trades(@Query() params: HistoricalTradesDto): Promise<any> {
    const trades = await this.tokensTradedEventService.all(params.limit, false);

    return trades.map((t) => {
      return {
        fromAmount: t.sourceAmount,
        id: t.transactionHash,
        pair: {
          fromToken: {
            decimals: t.sourceToken.decimals,
            symbol: t.sourceToken.symbol,
            address: t.sourceToken.address,
          },
          toToken: {
            decimals: t.targetToken.decimals,
            symbol: t.targetToken.symbol,
            address: t.targetToken.address,
          },
        },
        timestamp: Math.round(t.block.timestamp.getTime() / 1000),
        toAmount: t.targetAmount,
      };
    });
  }
}
