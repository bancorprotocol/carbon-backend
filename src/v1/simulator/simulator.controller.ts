import { BadRequestException, Controller, Get, Header, Query } from '@nestjs/common';
import { SimulatorDto } from './simulator.dto';
import { CacheTTL } from '@nestjs/cache-manager';
import { SimulatorService } from './simulator.service';

import { HistoricQuoteService } from '../../historic-quote/historic-quote.service';
import Decimal from 'decimal.js';
import {
  BlockchainType,
  Deployment,
  DeploymentService,
  ExchangeId,
  NATIVE_TOKEN,
} from '../../deployment/deployment.service';
import { ApiExchangeIdParam, ExchangeIdParam } from '../../exchange-id-param.decorator';
import { cotiMap } from 'src/utilities';

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

    params.baseToken = params.baseToken.toLowerCase();
    params.quoteToken = params.quoteToken.toLowerCase();

    // TEMPORARY HACK: Use Ethereum deployment for COTI
    const effectiveDeployment =
      deployment.blockchainType === BlockchainType.Coti
        ? {
            ...this.deploymentService.getDeploymentByBlockchainType(BlockchainType.Ethereum),
            nativeTokenAlias: '0xDDB3422497E61e13543BeA06989C0789117555c5',
          }
        : deployment;

    if (deployment.blockchainType === BlockchainType.Coti && params.baseToken === NATIVE_TOKEN.toLowerCase()) {
      params.baseToken = effectiveDeployment.nativeTokenAlias.toLowerCase();
    }

    if (deployment.blockchainType === BlockchainType.Coti && params.quoteToken === NATIVE_TOKEN.toLowerCase()) {
      params.quoteToken = effectiveDeployment.nativeTokenAlias.toLowerCase();
    }

    if (deployment.blockchainType === BlockchainType.Coti && cotiMap[params.baseToken.toLowerCase()]) {
      params.baseToken = cotiMap[params.baseToken.toLowerCase()];
    }

    if (deployment.blockchainType === BlockchainType.Coti && cotiMap[params.quoteToken.toLowerCase()]) {
      params.quoteToken = cotiMap[params.quoteToken.toLowerCase()];
    }

    const usdPrices = await this.historicQuoteService.getUsdBuckets(
      effectiveDeployment.blockchainType,
      params.baseToken,
      params.quoteToken,
      params.start,
      params.end,
    );

    const data = await this.simulatorService.generateSimulation(params, usdPrices, effectiveDeployment);

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
