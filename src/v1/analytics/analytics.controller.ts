import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { AnalyticsService } from './analytics.service';
import { VolumeTokensDto } from './volume.tokens.dto';
import { TvlTokensDto } from './tvl.tokens.dto';
import { VolumeService } from '../../volume/volume.service';
import { TvlService } from '../../tvl/tvl.service';
import { DeploymentService, ExchangeId } from '../../deployment/deployment.service';
import { ApiExchangeIdParam, ExchangeIdParam } from '../../exchange-id-param.decorator';
import { PairService } from '../../pair/pair.service';
import { TvlPairsDto } from './tvl.pairs.dto';
import { TotalTvlDto } from './tvl.total.dto';
import { TokenService } from '../../token/token.service';
import { VolumePairsDto } from './volume.pairs.dto';
import { VolumeTotalDto } from './volume.total.dto';

@Controller({ version: '1', path: ':exchangeId?/analytics' })
export class AnalyticsController {
  constructor(
    private analyticsService: AnalyticsService,
    private volumeService: VolumeService,
    private tvlService: TvlService,
    private deploymentService: DeploymentService,
    private pairService: PairService,
    private tokenService: TokenService,
  ) {}

  @Get('tvl/tokens')
  @CacheTTL(1 * 60 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  @ApiExchangeIdParam()
  async tvlByTokens(@ExchangeIdParam() exchangeId: ExchangeId, @Query() query: TvlTokensDto): Promise<any> {
    const deployment = this.deploymentService.getDeploymentByExchangeId(exchangeId);
    return this.tvlService.getTvlByAddress(deployment, query);
  }

  @Get('tvl/pairs')
  @CacheTTL(1 * 60 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  @ApiExchangeIdParam()
  async tvlByPair(@ExchangeIdParam() exchangeId: ExchangeId, @Query() query: TvlPairsDto): Promise<any> {
    const deployment = this.deploymentService.getDeploymentByExchangeId(exchangeId);
    const pairs = await this.pairService.allAsDictionary(deployment);
    return this.tvlService.getTvlByPair(deployment, query, pairs);
  }

  @Get('tvl')
  @CacheTTL(1 * 60 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  @ApiExchangeIdParam()
  async tvl(@ExchangeIdParam() exchangeId: ExchangeId, @Query() query: TotalTvlDto): Promise<any> {
    const deployment = this.deploymentService.getDeploymentByExchangeId(exchangeId);
    return this.tvlService.getTotalTvl(deployment, query);
  }

  @Get('volume/tokens')
  @CacheTTL(1 * 60 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  @ApiExchangeIdParam()
  async volumeByTokens(@ExchangeIdParam() exchangeId: ExchangeId, @Query() query: VolumeTokensDto): Promise<any> {
    const deployment = this.deploymentService.getDeploymentByExchangeId(exchangeId);
    const tokens = await this.tokenService.allByAddress(deployment);
    return this.volumeService.getVolume(deployment, query, tokens);
  }

  @Get('volume/pairs')
  @CacheTTL(1 * 60 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  @ApiExchangeIdParam()
  async volumeByPairs(@ExchangeIdParam() exchangeId: ExchangeId, @Query() query: VolumePairsDto): Promise<any> {
    const deployment = this.deploymentService.getDeploymentByExchangeId(exchangeId);
    const tokens = await this.tokenService.allByAddress(deployment);
    const pairs = await this.pairService.allAsDictionary(deployment);
    return this.volumeService.getVolume(deployment, query, tokens, pairs);
  }

  @Get('volume')
  @CacheTTL(1 * 60 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  @ApiExchangeIdParam()
  async volumeTotal(@ExchangeIdParam() exchangeId: ExchangeId, @Query() query: VolumeTotalDto): Promise<any> {
    const deployment = this.deploymentService.getDeploymentByExchangeId(exchangeId);
    const tokens = await this.tokenService.allByAddress(deployment);
    return this.volumeService.getVolume(deployment, query, tokens);
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
