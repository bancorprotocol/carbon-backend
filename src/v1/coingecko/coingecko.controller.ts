import { Controller, Get, Header, Query, Param } from '@nestjs/common';
import { HistoricalTradesDto } from './historical_trades.dto';
import {
  TokensTradedEventQueryParams,
  TokensTradedEventService,
} from '../../events/tokens-traded-event/tokens-traded-event.service';
import Decimal from 'decimal.js';
import { CacheTTL } from '@nestjs/cache-manager';
import { toTimestamp } from '../../utilities';
import { PairService } from '../../pair/pair.service';
import { CoingeckoService } from './coingecko.service';
import { Deployment, DeploymentService, ExchangeId } from '../../deployment/deployment.service';
import { ApiExchangeIdParam, ExchangeIdParam } from '../../exchange-id-param.decorator';

@Controller({ version: '1', path: ':exchangeId?/coingecko' })
export class CoinGeckoController {
  constructor(
    private tokensTradedEventService: TokensTradedEventService,
    private pairService: PairService,
    private coingeckoService: CoingeckoService,
    private deploymentService: DeploymentService,
  ) {}

  private async getDeployment(exchangeId: ExchangeId): Promise<Deployment> {
    return this.deploymentService.getDeploymentByExchangeId(exchangeId);
  }

  @Get('historical_trades')
  @CacheTTL(1 * 1000)
  @Header('Cache-Control', 'public, max-age=60, s-max-age=60')
  @ApiExchangeIdParam()
  async historicalTrades(
    @ExchangeIdParam() exchangeId: ExchangeId,
    @Query() params: HistoricalTradesDto,
  ): Promise<any> {
    const deployment = await this.getDeployment(exchangeId);
    const { start_time, end_time, limit, type, ticker_id } = params;
    const queryParams: TokensTradedEventQueryParams = {
      startTime: start_time,
      endTime: end_time,
      limit,
      type,
      normalizeDecimals: true,
    };

    if (ticker_id !== undefined) {
      const [token0, token1] = ticker_id.split('_');
      const pairs = await this.pairService.allAsDictionary(deployment);
      const pair = pairs[token0][token1];
      queryParams['pairId'] = pair.id;
    }

    const trades = await this.tokensTradedEventService.getWithQueryParams(queryParams, deployment);
    const result = [];
    trades.map((t) => {
      const rate = new Decimal(t.targetAmount).div(t.sourceAmount).toNumber();
      const price = t.type === 'sell' ? rate : new Decimal(1).div(rate).toNumber();
      result.push({
        base_volume: t.type === 'sell' ? parseFloat(t.sourceAmount) : parseFloat(t.targetAmount),
        target_volume: t.type === 'sell' ? parseFloat(t.targetAmount) : parseFloat(t.sourceAmount),
        ticker_id: `${t.pair.token0.address}_${t.pair.token1.address}`,
        trade_id: t.transactionHash,
        trade_timestamp: toTimestamp(t.timestamp),
        type: t.type,
        price,
      });
    });
    return result;
  }

  @Get('pairs')
  @CacheTTL(1 * 1000)
  @Header('Cache-Control', 'public, max-age=60, s-max-age=60')
  @ApiExchangeIdParam()
  async pairs(@ExchangeIdParam() exchangeId: ExchangeId): Promise<any> {
    const deployment = await this.getDeployment(exchangeId);
    const pairs = await this.pairService.all(deployment);
    return pairs.map((p) => {
      return {
        base_currency: p.token0.address,
        target_currency: p.token1.address,
        ticker_id: `${p.token0.address}_${p.token1.address}`,
      };
    });
  }

  @Get('tickers')
  @CacheTTL(1 * 1000)
  @Header('Cache-Control', 'public, max-age=43200')
  @ApiExchangeIdParam()
  async tickers(@ExchangeIdParam() exchangeId: ExchangeId): Promise<any> {
    const deployment = await this.getDeployment(exchangeId);
    const data = await this.coingeckoService.getCachedTickers(deployment);
    return data;
  }
}
