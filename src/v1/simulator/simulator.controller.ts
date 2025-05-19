import { BadRequestException, Controller, Get, Header, Query } from '@nestjs/common';
import { SimulatorDto } from './simulator.dto';
import { CacheTTL } from '@nestjs/cache-manager';
import { SimulatorService } from './simulator.service';

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

    if (params.end < params.start) {
      throw new BadRequestException({
        message: ['End date must be after the start date'],
        error: 'Bad Request',
        statusCode: 400,
      });
    }

    // Convert tokens to lowercase once
    const baseTokenAddress = params.baseToken.toLowerCase();
    const quoteTokenAddress = params.quoteToken.toLowerCase();

    // Always set lowercase token values in params
    params.baseToken = baseTokenAddress;
    params.quoteToken = quoteTokenAddress;

    // Get price data - the historic-quote service now handles token mapping internally
    const usdPrices = await this.historicQuoteService.getUsdBuckets(
      deployment.blockchainType,
      deployment.blockchainType,
      params.baseToken,
      params.quoteToken,
      params.start,
      params.end,
    );

    const data = await this.simulatorService.generateSimulation(
      params,
      usdPrices,
      deployment, // Both base token and quote token use the same deployment now
      deployment,
      deployment,
    );

    const resultData = data.dates.map((d, i) => ({
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
    }));

    return {
      data: resultData,
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
