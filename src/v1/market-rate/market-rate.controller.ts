import { Controller, Get, Header, Query } from '@nestjs/common';
import { MarketRateDto } from './market-rate.dto';
import { QuoteService } from '../../quote/quote.service';
import { CacheTTL } from '@nestjs/cache-manager';
import { DeploymentService, ExchangeId } from '../../deployment/deployment.service';
import { BlockchainType, Deployment } from '../../deployment/deployment.service';
import { ApiExchangeIdParam, ExchangeIdParam } from '../../exchange-id-param.decorator';
import { CELO_NETWORK_ID, CodexService, SEI_NETWORK_ID } from '../../codex/codex.service';

@Controller({ version: '1', path: ':exchangeId?/market-rate' })
export class MarketRateController {
  constructor(
    private quoteService: QuoteService,
    private deploymentService: DeploymentService,
    private codexService: CodexService,
  ) {}

  @Get('')
  @CacheTTL(1 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  @ApiExchangeIdParam()
  async marketRate(@ExchangeIdParam() exchangeId: ExchangeId, @Query() params: MarketRateDto): Promise<any> {
    const deployment: Deployment = await this.deploymentService.getDeploymentByExchangeId(exchangeId);
    const { address, convert } = params;
    const currencies = convert.split(',');
    let data;

    if (deployment.blockchainType === BlockchainType.Sei) {
      data = await this.codexService.getLatestPrices(deployment, SEI_NETWORK_ID, [address]);
    } else if (deployment.blockchainType === BlockchainType.Celo) {
      data = await this.codexService.getLatestPrices(deployment, CELO_NETWORK_ID, [address]);
    } else {
      data = await this.quoteService.fetchLatestPrice(deployment, address, currencies);
    }

    const result = {
      data: {},
    };
    currencies.forEach((c) => {
      if (data[address.toLowerCase()] && data[address.toLowerCase()][c.toLowerCase()]) {
        result['data'][c.toUpperCase()] = data[address.toLowerCase()][c.toLowerCase()];
      }
    });
    return result;
  }
}
