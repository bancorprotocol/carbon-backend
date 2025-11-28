import { Controller, Get, Header } from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { DeploymentService, ExchangeId } from '../../deployment/deployment.service';
import { ApiExchangeIdParam, ExchangeIdParam } from '../../exchange-id-param.decorator';
import { TokenService } from '../../token/token.service';
import { QuoteService } from '../../quote/quote.service';
import { StrategyService } from '../../strategy/strategy.service';
import { BlockService } from '../../block/block.service';

interface TokenResponse {
  address: string;
  decimals: number;
  symbol: string;
  name: string;
}

@Controller({ version: '1', path: ':exchangeId?/tokens' })
export class TokensController {
  constructor(
    private deploymentService: DeploymentService,
    private tokenService: TokenService,
    private quoteService: QuoteService,
    private strategyService: StrategyService,
    private blockService: BlockService,
  ) {}

  @Get()
  @CacheTTL(60 * 1000) // Cache for 60 seconds
  @Header('Cache-Control', 'public, max-age=60')
  @ApiExchangeIdParam()
  async getTokens(@ExchangeIdParam() exchangeId: ExchangeId): Promise<TokenResponse[]> {
    const deployment = this.deploymentService.getDeploymentByExchangeId(exchangeId);
    const tokens = await this.tokenService.all(deployment);

    return tokens.map((token) => ({
      address: token.address,
      decimals: token.decimals,
      symbol: token.symbol,
      name: token.name,
    }));
  }

  @Get('prices')
  @CacheTTL(60 * 1000) // Cache for 60 seconds
  @Header('Cache-Control', 'public, max-age=60')
  @ApiExchangeIdParam()
  async getTokensPrices(@ExchangeIdParam() exchangeId: ExchangeId): Promise<Record<string, number>> {
    const deployment = this.deploymentService.getDeploymentByExchangeId(exchangeId);

    // Get the latest block for this deployment
    const lastBlock = await this.blockService.getLastBlock(deployment);
    if (!lastBlock) {
      return {};
    }

    // Get all non-deleted strategies
    const strategies = await this.strategyService.getStrategiesWithOwners(deployment, lastBlock.id);

    // Collect all unique token addresses from strategies
    const tokenAddresses = new Set<string>();
    strategies.forEach((strategy) => {
      tokenAddresses.add(strategy.token0Address.toLowerCase());
      tokenAddresses.add(strategy.token1Address.toLowerCase());
    });

    // Get all quotes for this deployment
    const quotesByAddress = await this.quoteService.allByAddress(deployment);

    // Filter quotes to only include tokens used in non-deleted strategies
    const result: Record<string, number> = {};
    Object.entries(quotesByAddress).forEach(([address, quote]) => {
      if (tokenAddresses.has(address.toLowerCase())) {
        result[address] = parseFloat(quote.usd);
      }
    });

    return result;
  }
}
