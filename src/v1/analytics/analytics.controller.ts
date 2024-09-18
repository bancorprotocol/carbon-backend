import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { AnalyticsService } from './analytics.service';
import { VolumeDto } from './volume.dto';
import { TvlTokensDto } from './tvl.tokens.dto';
import { VolumeService } from '../../volume/volume.service';
import { GroupBy, TvlService } from '../../tvl/tvl.service';
import { DeploymentService, ExchangeId } from '../../deployment/deployment.service';
import { ApiExchangeIdParam, ExchangeIdParam } from '../../exchange-id-param.decorator';
import { PairService } from '../../pair/pair.service';

@Controller({ version: '1', path: ':exchangeId?/analytics' })
export class AnalyticsController {
  constructor(
    private analyticsService: AnalyticsService,
    private volumeService: VolumeService,
    private tvlService: TvlService,
    private deploymentService: DeploymentService,
    private pairService: PairService,
  ) {}

  @Get('tvl/tokens')
  @CacheTTL(1 * 60 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  @ApiExchangeIdParam()
  async tvlByTokens(@ExchangeIdParam() exchangeId: ExchangeId, @Query() query: TvlTokensDto): Promise<any> {
    const deployment = this.deploymentService.getDeploymentByExchangeId(exchangeId);
    if (!query.groupBy || query.groupBy === GroupBy.ADDRESS) {
      return this.tvlService.getTvlByAddress(deployment, query);
    }

    // if (!query.groupBy || query.groupBy === GroupBy.PAIR) {
    //   return this.tvlService.getTvlByPair(deployment, query);
    // }

    // const pairs = await this.pairService.allAsDictionary(deployment);
  }

  // @Get('tvl/pairs')
  // @CacheTTL(1 * 60 * 1000)
  // @Header('Cache-Control', 'public, max-age=60')
  // @ApiExchangeIdParam()
  // async tvlByPair(@ExchangeIdParam() exchangeId: ExchangeId, @Query() query: TvlTokensDto): Promise<any> {
  //   const deployment = this.deploymentService.getDeploymentByExchangeId(exchangeId);
  //   if (!query.groupBy || query.groupBy === GroupBy.ADDRESS) {
  //     return this.tvlService.getTvlByAddress(deployment, query);
  //   }

  //   if (!query.groupBy || query.groupBy === GroupBy.PAIR) {
  //     return this.tvlService.getTvlByPair(deployment, query, pairs);
  //   }

  //   const pairs = await this.pairService.allAsDictionary(deployment);
  // }

  @Get('volume')
  @CacheTTL(1 * 60 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  @ApiExchangeIdParam()
  async volume(@ExchangeIdParam() exchangeId: ExchangeId, @Query() query: VolumeDto): Promise<any> {
    const deployment = this.deploymentService.getDeploymentByExchangeId(exchangeId);
    return this.volumeService.getVolume(query);
  }

  @Get('generic')
  @CacheTTL(1 * 60 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  @ApiExchangeIdParam()
  async generic(@ExchangeIdParam() exchangeId: ExchangeId): Promise<any> {
    const deployment = this.deploymentService.getDeploymentByExchangeId(exchangeId);
    return this.analyticsService.getCachedGenericMetrics(deployment);
  }
}
