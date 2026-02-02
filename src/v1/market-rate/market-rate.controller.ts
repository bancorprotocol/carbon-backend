import { BadRequestException, Controller, Get, Header, Query } from '@nestjs/common';
import { MarketRateDto } from './market-rate.dto';
import { CacheTTL } from '@nestjs/cache-manager';
import { DeploymentService, ExchangeId } from '../../deployment/deployment.service';
import { BlockchainType, Deployment } from '../../deployment/deployment.service';
import { ApiExchangeIdParam, ExchangeIdParam } from '../../exchange-id-param.decorator';
import { CodexService } from '../../codex/codex.service';
import { CoinGeckoService } from '../../quote/coingecko.service';
import { BlockchainProviderConfig } from '../../historic-quote/historic-quote.service';
import { QuoteService } from '../../quote/quote.service';

@Controller({ version: '1', path: ':exchangeId?/market-rate' })
export class MarketRateController {
  private priceProviders: BlockchainProviderConfig = {
    [BlockchainType.Ethereum]: [
      { name: 'coingecko', enabled: true },
      { name: 'codex', enabled: true },
    ],
    [BlockchainType.Sei]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Celo]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Blast]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Base]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Fantom]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Mantle]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Linea]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Berachain]: [{ name: 'codex', enabled: true }],
    [BlockchainType.Coti]: [],
    [BlockchainType.Iota]: [],
    [BlockchainType.Tac]: [],
  };

  constructor(
    private deploymentService: DeploymentService,
    private codexService: CodexService,
    private coinGeckoService: CoinGeckoService,
    private quoteService: QuoteService,
  ) {}

  @Get('')
  @CacheTTL(1 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  @ApiExchangeIdParam()
  async marketRate(@ExchangeIdParam() exchangeId: ExchangeId, @Query() params: MarketRateDto): Promise<any> {
    const deployment: Deployment = await this.deploymentService.getDeploymentByExchangeId(exchangeId);
    const address = params.address.toLowerCase();
    const { convert } = params;
    const currencies = convert.split(',');

    // Check if the token address is in the pricing ignore list
    if (this.deploymentService.isTokenIgnoredFromPricing(deployment, address)) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Pricing not available for this token address',
      });
    }

    // check if we currencies requested are the same as the ones we already have
    const existingQuote = await this.quoteService.getRecentQuotesForAddress(deployment.blockchainType, address);
    if (existingQuote) {
      return { data: { USD: parseFloat(existingQuote.usd) }, provider: existingQuote.provider };
    }

    let tokenAddress = address;
    let tokenDeployment = deployment;

    // Convert mapEthereumTokens keys to lowercase for case-insensitive matching
    const lowercaseTokenMap = this.deploymentService.getLowercaseTokenMap(deployment);

    // Check if the address is mapped in the mapEthereumTokens object
    if (deployment.mapEthereumTokens && lowercaseTokenMap[address]) {
      // Use the mapped Ethereum address and Ethereum deployment
      tokenAddress = lowercaseTokenMap[address];
      tokenDeployment = this.deploymentService.getDeploymentByBlockchainType(BlockchainType.Ethereum);

      // Also check if the mapped token address is in the target deployment's pricing ignore list
      if (this.deploymentService.isTokenIgnoredFromPricing(tokenDeployment, tokenAddress)) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Pricing not available for this token address',
        });
      }
    }

    // Use the appropriate providers based on the deployment
    const enabledProviders = this.priceProviders[tokenDeployment.blockchainType].filter((p) => p.enabled);

    let data = null;
    let usedProvider = null;

    for (const provider of enabledProviders) {
      try {
        switch (provider.name) {
          case 'codex':
            data = await this.codexService.getLatestPrices(tokenDeployment, [tokenAddress]);
            break;
          case 'coingecko':
            data = await this.coinGeckoService.fetchLatestPrice(tokenDeployment, tokenAddress, currencies);
            break;
        }

        const hasValidPriceData = Object.keys(data[tokenAddress]).some(
          (key) => key !== 'provider' && key !== 'last_updated_at',
        );

        if (data && Object.keys(data).length > 0 && data[tokenAddress] && hasValidPriceData) {
          usedProvider = provider.name;
          break;
        }
      } catch (error) {
        console.error(`Error fetching price from ${provider.name}:`, error);
      }
      data = null;
    }

    if (!data || Object.keys(data).length === 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Unsupported token address',
      });
    }

    const result = {
      data: {},
      provider: usedProvider,
    };

    currencies.forEach((c) => {
      if (data[tokenAddress] && data[tokenAddress][c.toLowerCase()]) {
        result.data[c.toUpperCase()] = data[tokenAddress][c.toLowerCase()];
      }
    });

    return result;
  }
}
