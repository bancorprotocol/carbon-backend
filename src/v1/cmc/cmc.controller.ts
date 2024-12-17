import { CacheTTL } from '@nestjs/cache-manager';
import { Controller, Get, Header, Query, Param } from '@nestjs/common';
import { HistoricalTradesDto } from './historical_trades.dto';
import { TokensTradedEventService } from '../../events/tokens-traded-event/tokens-traded-event.service';
import { PairService } from '../../pair/pair.service';
import { DeploymentService, ExchangeId } from '../../deployment/deployment.service';
import { ApiExchangeIdParam, ExchangeIdParam } from '../../exchange-id-param.decorator';

@Controller({ version: '1', path: ':exchangeId?/cmc' })
export class CmcController {
  constructor(
    private tokensTradedEventService: TokensTradedEventService,
    private pairService: PairService,
    private deploymentService: DeploymentService,
  ) {}

  private async getDeployment(exchangeId: ExchangeId): Promise<any> {
    return this.deploymentService.getDeploymentByExchangeId(exchangeId);
  }

  @Get('pairs')
  @CacheTTL(1 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  @ApiExchangeIdParam()
  async pairs(@ExchangeIdParam() exchangeId: ExchangeId): Promise<any> {
    const deployment = await this.getDeployment(exchangeId);
    const pairs = await this.pairService.all(deployment);
    const volume24h = await this.tokensTradedEventService.volume24hByPair(deployment);
    const lastTrades = await this.tokensTradedEventService.lastTradesByPair(deployment);

    return pairs.map((p) => {
      return {
        base_id: p.token0.address,
        base_symbol: p.token0.symbol,
        base_volume: volume24h[p.id] ? volume24h[p.id].token0Volume : '0',
        last_price: lastTrades[p.id] || null,
        pair: `${p.token0.address}_${p.token1.address}`,
        quote_id: p.token1.address,
        quote_symbol: p.token1.symbol,
        quote_volume: volume24h[p.id] ? volume24h[p.id].token1Volume : '0',
      };
    });
  }

  @Get('historical_trades')
  @CacheTTL(60 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  @ApiExchangeIdParam()
  async historical_trades(
    @ExchangeIdParam() exchangeId: ExchangeId,
    @Query() params: HistoricalTradesDto,
  ): Promise<any> {
    const deployment = await this.getDeployment(exchangeId);
    const trades = await this.tokensTradedEventService.getWithQueryParams(
      {
        limit: params.limit,
        order: 'DESC',
      },
      deployment,
    );

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
