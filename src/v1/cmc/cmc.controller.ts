import { CacheTTL } from '@nestjs/cache-manager';
import { Controller, Get, Query } from '@nestjs/common';
import { HistoricalTradesDto } from './historical_trades.dto';
import { TokensTradedEventService } from '../../events/tokens-traded-event/tokens-traded-event.service';

@Controller({ version: '1', path: 'cmc' })
export class CmcController {
  constructor(private tokensTradedEventService: TokensTradedEventService) {}

  @Get('historical_trades')
  @CacheTTL(10 * 1000)
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
