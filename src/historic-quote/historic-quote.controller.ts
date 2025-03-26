import { CacheTTL } from '@nestjs/cache-manager';
import { BadRequestException, Controller, Get, Header, Query } from '@nestjs/common';
import { HistoricQuoteDto } from './historic-quote.dto';
import { HistoricQuoteService } from './historic-quote.service';
import {
  BlockchainType,
  Deployment,
  DeploymentService,
  ExchangeId,
  NATIVE_TOKEN,
} from '../deployment/deployment.service';
import { ApiExchangeIdParam, ExchangeIdParam } from '../exchange-id-param.decorator';
import { cotiMap } from '../utilities';
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

    const data = await this.historicQuoteService.getUsdBuckets(
      effectiveDeployment.blockchainType,
      params.baseToken,
      params.quoteToken,
      params.start,
      params.end,
    );

    const result = [];
    data.forEach((p) => {
      result.push({
        timestamp: p.timestamp,
        low: p.low.toString(),
        high: p.high.toString(),
        open: p.open.toString(),
        close: p.close.toString(),
        provider: p.provider,
      });
    });

    return result;
  }
}
