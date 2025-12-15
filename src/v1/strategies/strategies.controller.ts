import { Controller, Get, Header, Query } from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { DeploymentService, ExchangeId } from '../../deployment/deployment.service';
import { ApiExchangeIdParam, ExchangeIdParam } from '../../exchange-id-param.decorator';
import { StrategyRealtimeService } from '../../strategy-realtime/strategy-realtime.service';
import { StrategiesQueryDto, StrategiesResponse, Strategy } from './strategies.dto';

@Controller({ version: '1', path: ':exchangeId?/strategies' })
export class StrategiesController {
  constructor(private deploymentService: DeploymentService, private strategyRealtimeService: StrategyRealtimeService) {}

  @Get()
  @CacheTTL(10 * 1000) // Cache for 10 seconds
  @Header('Cache-Control', 'public, max-age=10')
  @ApiExchangeIdParam()
  async getStrategies(
    @ExchangeIdParam() exchangeId: ExchangeId,
    @Query() query: StrategiesQueryDto,
  ): Promise<StrategiesResponse> {
    const deployment = this.deploymentService.getDeploymentByExchangeId(exchangeId);
    const { strategies: allStrategies } = await this.strategyRealtimeService.getStrategiesWithOwners(deployment);

    // Map strategies to the response format using already-decoded values
    // Note: buy = order1 (uses quote token), sell = order0 (uses base token)
    // base = token0 (budget for sell order), quote = token1 (budget for buy order)
    const mappedStrategies: Strategy[] = allStrategies.map((strategy) => ({
      id: strategy.strategyId,
      owner: strategy.owner,
      base: strategy.token0Address,
      quote: strategy.token1Address,
      buy: {
        budget: strategy.liquidity1,
        min: strategy.lowestRate1,
        max: strategy.highestRate1,
        marginal: strategy.marginalRate1,
      },
      sell: {
        budget: strategy.liquidity0,
        min: strategy.lowestRate0,
        max: strategy.highestRate0,
        marginal: strategy.marginalRate0,
      },
    }));

    // Apply pagination if requested
    const page = query.page ?? 0;
    const pageSize = query.pageSize ?? 0;

    if (pageSize > 0) {
      const totalStrategies = mappedStrategies.length;
      const totalPages = Math.ceil(totalStrategies / pageSize);
      const startIndex = page * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedStrategies = mappedStrategies.slice(startIndex, endIndex);

      return {
        strategies: paginatedStrategies,
        pagination: {
          page,
          pageSize,
          totalStrategies,
          totalPages,
          hasMore: page < totalPages - 1,
        },
      };
    }

    // No pagination - return all strategies
    return { strategies: mappedStrategies };
  }
}
