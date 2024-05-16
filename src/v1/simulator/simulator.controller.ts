import { BadRequestException, Controller, Get, Header, Query } from '@nestjs/common';
import { SimulatorDto } from './simulator.dto';
import { CacheTTL } from '@nestjs/cache-manager';
import { SimulatorService } from './simulator.service';
import moment from 'moment';
import { HistoricQuoteService } from '../../historic-quote/historic-quote.service';
import Decimal from 'decimal.js';

@Controller({ version: '1', path: 'simulate-create-strategy' })
export class SimulatorControllerDeprecated {
  constructor(
    private readonly simulatorService: SimulatorService,
    private historicQuoteService: HistoricQuoteService,
  ) {}

  @Get()
  @CacheTTL(10 * 60 * 1000) // Cache response for 1 second
  @Header('Cache-Control', 'public, max-age=60') // Set Cache-Control header
  async simulator(@Query() params: SimulatorDto) {
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
      params.baseToken,
      params.quoteToken,
      params.start,
      params.end,
    );

    const data = await this.simulatorService.generateSimulation(params, usdPrices);
    return data;
  }
}
@Controller({ version: '1', path: 'simulator' })
export class SimulatorController {
  constructor(
    private readonly simulatorService: SimulatorService,
    private historicQuoteService: HistoricQuoteService,
  ) {}

  @Get('create')
  @CacheTTL(10 * 60 * 1000) // Cache response for 1 second
  @Header('Cache-Control', 'public, max-age=60') // Set Cache-Control header
  async simulator(@Query() params: SimulatorDto) {
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
      params.baseToken,
      params.quoteToken,
      params.start,
      params.end,
    );

    const data = await this.simulatorService.generateSimulation(params, usdPrices);

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
