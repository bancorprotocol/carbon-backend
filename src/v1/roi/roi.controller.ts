import { Controller, Get, Header, Param } from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { RoiService } from './roi.service';
import { DeploymentService, ExchangeId } from '../../deployment/deployment.service';

@Controller({ version: '1', path: ':exchangeId/roi' })
export class RoiController {
  constructor(private roiService: RoiService, private deploymentService: DeploymentService) {}

  @Get()
  @CacheTTL(1 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  async roi(@Param('exchangeId') exchangeId: ExchangeId): Promise<any> {
    const deployment = this.deploymentService.getDeploymentByExchangeId(exchangeId);
    return this.roiService.getCachedROI(deployment);
  }
}
