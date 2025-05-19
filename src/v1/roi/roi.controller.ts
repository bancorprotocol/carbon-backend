import { Controller, Get, Header } from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { RoiService } from './roi.service';
import { DeploymentService, ExchangeId, BlockchainType } from '../../deployment/deployment.service';
import { ApiExchangeIdParam, ExchangeIdParam } from '../../exchange-id-param.decorator';
import { QuoteService } from '../../quote/quote.service';

@Controller({ version: '1', path: ':exchangeId?/roi' })
export class RoiController {
  constructor(
    private roiService: RoiService,
    private deploymentService: DeploymentService,
    private quoteService: QuoteService,
  ) {}

  @Get()
  @CacheTTL(1 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  @ApiExchangeIdParam()
  async roi(@ExchangeIdParam() exchangeId: ExchangeId): Promise<any> {
    const deployment = this.deploymentService.getDeploymentByExchangeId(exchangeId);

    // Get all quotes for this deployment, handling mapped tokens
    const allQuotes = await this.quoteService.allByAddress(deployment);
    const quotes = Object.values(allQuotes);

    // Update ROI with quotes
    await this.roiService.update(deployment, quotes);

    // Get cached ROI
    const roi = await this.roiService.getCachedROI(deployment);
    return roi;
  }
}
