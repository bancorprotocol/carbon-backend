import { Controller, Get, Header, Query } from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { DeploymentService, ExchangeId } from '../../deployment/deployment.service';
import { ApiExchangeIdParam, ExchangeIdParam } from '../../exchange-id-param.decorator';
import { StrategyRealtimeService } from '../../strategy-realtime/strategy-realtime.service';
import { GradientRealtimeService } from '../../gradient/gradient-realtime.service';
import { TokenService } from '../../token/token.service';
import {
  StrategiesQueryDto,
  StrategiesResponse,
  Strategy,
  RegularStrategy,
  GradientStrategyDto,
} from './strategies.dto';

@Controller({ version: '1', path: ':exchangeId?/strategies' })
export class StrategiesController {
  constructor(
    private deploymentService: DeploymentService,
    private strategyRealtimeService: StrategyRealtimeService,
    private gradientRealtimeService: GradientRealtimeService,
    private tokenService: TokenService,
  ) {}

  @Get()
  @CacheTTL(10 * 1000)
  @Header('Cache-Control', 'public, max-age=10')
  @ApiExchangeIdParam()
  async getStrategies(
    @ExchangeIdParam() exchangeId: ExchangeId,
    @Query() query: StrategiesQueryDto,
  ): Promise<StrategiesResponse> {
    const deployment = this.deploymentService.getDeploymentByExchangeId(exchangeId);
    const { strategies: allStrategies } = await this.strategyRealtimeService.getStrategiesWithOwners(deployment);

    const regularStrategies: Strategy[] = allStrategies.map(
      (strategy): RegularStrategy => ({
        type: 'regular',
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
      }),
    );

    let gradientStrategies: Strategy[] = [];
    if (this.deploymentService.hasGradientSupport(deployment)) {
      const tokens = await this.tokenService.allByAddress(deployment);
      const { strategies: gradientRaw } =
        await this.gradientRealtimeService.getStrategiesWithOwners(deployment);

      gradientStrategies = gradientRaw
        .map((strategy): GradientStrategyDto | null => {
          const token0 = tokens[strategy.token0Address];
          const token1 = tokens[strategy.token1Address];
          if (!token0 || !token1) return null;

          return {
            type: 'gradient',
            id: strategy.strategyId,
            owner: strategy.owner,
            base: strategy.token0Address,
            quote: strategy.token1Address,
            sell: GradientRealtimeService.toGradientOrder(
              strategy,
              0,
              token0.decimals,
            ),
            buy: GradientRealtimeService.toGradientOrder(
              strategy,
              1,
              token1.decimals,
            ),
          };
        })
        .filter(Boolean);
    }

    const mappedStrategies = [...regularStrategies, ...gradientStrategies];

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

    return { strategies: mappedStrategies };
  }
}
