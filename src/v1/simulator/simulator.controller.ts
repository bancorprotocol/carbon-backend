import { BadRequestException, Controller, Get, Header, Param, Query } from '@nestjs/common';
import { SimulatorDto } from './simulator.dto';
import { CacheTTL } from '@nestjs/cache-manager';
import { SimulatorService } from './simulator.service';
import moment from 'moment';
import { HistoricQuoteService } from '../../historic-quote/historic-quote.service';
import Decimal from 'decimal.js';
import { Deployment, DeploymentService, ExchangeId } from '../../deployment/deployment.service';
import { ApiExchangeIdParam, ExchangeIdParam } from '../../exchange-id-param.decorator';

@Controller({ version: '1', path: ':exchangeId?/simulator' })
export class SimulatorController {
  constructor(
    private readonly simulatorService: SimulatorService,
    private historicQuoteService: HistoricQuoteService,
    private deploymentService: DeploymentService,
  ) {}

  @Get('create')
  @CacheTTL(10 * 60 * 1000) // Cache response for 1 second
  @Header('Cache-Control', 'public, max-age=60') // Set Cache-Control header
  @ApiExchangeIdParam()
  async simulator(@ExchangeIdParam() exchangeId: ExchangeId, @Query() params: SimulatorDto) {
    const deployment: Deployment = await this.deploymentService.getDeploymentByExchangeId(exchangeId);

    if (!isValidStart(params.start)) {
      throw new BadRequestException({
        message: ['start must be within the last 12 months'],
        error: 'Bad Request',
        statusCode: 400,
      });
    }

    if (params.end < params.start) {
      throw new BadRequestException({
        message: ['End date must be after the start date'],
        error: 'Bad Request',
        statusCode: 400,
      });
    }

    params.baseToken = params.baseToken.toLowerCase();
    params.quoteToken = params.quoteToken.toLowerCase();

    const usdPrices = await this.historicQuoteService.getUsdBuckets(
      deployment.blockchainType,
      params.baseToken,
      params.quoteToken,
      params.start,
      params.end,
    );

    const data = await this.simulatorService.generateSimulation(params, usdPrices, deployment);

    return {
      data: data.dates.map((d, i) => ({
        date: d,
        price: data.prices[i],
        sell: data.ask[i],
        buy: data.bid[i],
        baseBalance: data.RISK.balance[i],
        basePortion: data.portfolio_risk[i],
        quoteBalance: data.CASH.balance[i],
        quotePortion: data.portfolio_cash[i],
        portfolioValueInQuote: data.portfolio_value[i],
        hodlValueInQuote: data.hodl_value[i],
        portfolioOverHodlInPercent: data.portfolio_over_hodl[i],
      })),
      roiInPercent: data.portfolio_over_hodl[data.portfolio_over_hodl.length - 1],
      gainsInQuote: new Decimal(
        new Decimal(data.portfolio_value[data.portfolio_value.length - 1]).minus(
          new Decimal(data.hodl_value[data.hodl_value.length - 1]),
        ),
      ).toString(),
      bounds: {
        sellMax: data.max_ask,
        sellMin: data.min_ask,
        buyMax: data.max_bid,
        buyMin: data.min_bid,
      },
      debug: data.curve_parameters,
    };
  }
}

const isValidStart = async (start: number): Promise<boolean> => {
  const twelveMonthsAgo = moment().subtract(12, 'months').startOf('day').unix();
  return start >= twelveMonthsAgo;
};
