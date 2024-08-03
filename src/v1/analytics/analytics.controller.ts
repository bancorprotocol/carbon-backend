import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { AnalyticsService } from './analytics.service';
import { VolumeDto } from './volume.dto';
import { TvlDto } from './tvl.dto';
import { VolumeService } from '../../volume/volume.service';
import { TvlService } from '../../tvl/tvl.service';
import { ApiTags } from '@nestjs/swagger';
import { DeploymentService, ExchangeId } from '../../deployment/deployment.service';

@ApiTags('analytics')
@Controller({ version: '1', path: ':exchangeId/analytics' })
export class AnalyticsController {
  constructor(
    private analyticsService: AnalyticsService,
    private volumeService: VolumeService,
    private tvlService: TvlService,
    private deploymentService: DeploymentService,
  ) {}

  @Get('tvl')
  @CacheTTL(1 * 60 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  async tvl(@Param('exchangeId') exchangeId: ExchangeId, @Query() query: TvlDto): Promise<any> {
    const deployment = this.deploymentService.getDeploymentByExchangeId(exchangeId);
    return this.tvlService.getTvl(query);
  }

  @Get('volume')
  @CacheTTL(1 * 60 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  async volume(@Param('exchangeId') exchangeId: ExchangeId, @Query() query: VolumeDto): Promise<any> {
    const deployment = this.deploymentService.getDeploymentByExchangeId(exchangeId);
    return this.volumeService.getVolume(query);
  }

  @Get('generic')
  @CacheTTL(1 * 60 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  async generic(@Param('exchangeId') exchangeId: ExchangeId): Promise<any> {
    const deployment = this.deploymentService.getDeploymentByExchangeId(exchangeId);
    return this.analyticsService.getCachedGenericMetrics(deployment);
  }
}
