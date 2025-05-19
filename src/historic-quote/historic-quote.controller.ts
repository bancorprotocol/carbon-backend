import { CacheTTL } from '@nestjs/cache-manager';
import { BadRequestException, Controller, Get, Header, Query } from '@nestjs/common';
import { HistoricQuoteDto } from './historic-quote.dto';
import { HistoricQuoteService } from './historic-quote.service';
import { Deployment, DeploymentService, ExchangeId } from '../deployment/deployment.service';
import { ApiExchangeIdParam, ExchangeIdParam } from '../exchange-id-param.decorator';

@Controller({ version: '1', path: ':exchangeId?/history/prices' })
export class HistoricQuoteController {
  constructor(private historicQuoteService: HistoricQuoteService, private deploymentService: DeploymentService) {}

  @Get()
  @CacheTTL(1 * 60 * 60 * 1000)
  @Header('Cache-Control', 'public, max-age=60') // Set Cache-Control header
  @ApiExchangeIdParam()
  async prices(@ExchangeIdParam() exchangeId: ExchangeId, @Query() params: HistoricQuoteDto) {
    const deployment: Deployment = await this.deploymentService.getDeploymentByExchangeId(exchangeId);

    if (params.end <= params.start) {
      throw new BadRequestException({
        message: ['End date must be after the start date'],
        error: 'Bad Request',
        statusCode: 400,
      });
    }

    // Convert tokens to lowercase
    const baseTokenAddress = params.baseToken.toLowerCase();
    const quoteTokenAddress = params.quoteToken.toLowerCase();

    // Get the price data - the service handles token mapping internally
    const data = await this.historicQuoteService.getUsdBuckets(
      deployment.blockchainType,
      deployment.blockchainType,
      baseTokenAddress,
      quoteTokenAddress,
      params.start,
      params.end,
    );

    // Format the result
    const result = [];

    if (data && data.length > 0) {
      // Format the price data
      data.forEach((p) => {
        const item = {
          timestamp: p.timestamp,
          low: p.low.toString(),
          high: p.high.toString(),
          open: p.open.toString(),
          close: p.close.toString(),
          provider: p.provider,
        };

        // Include mapping information in each price point if available
        if (p.mappedBaseToken) {
          item['mappedBaseToken'] = p.mappedBaseToken;
        }

        if (p.mappedQuoteToken) {
          item['mappedQuoteToken'] = p.mappedQuoteToken;
        }

        result.push(item);
      });
    }

    return result;
  }
}
