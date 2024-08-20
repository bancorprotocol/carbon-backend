import { Controller, Get, Header } from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { RoiService } from './roi.service';
import { DeploymentService, ExchangeId } from '../../deployment/deployment.service';
import { ApiExchangeIdParam, ExchangeIdParam } from '../../exchange-id-param.decorator';

@Controller({ version: '1', path: ':exchangeId?/roi' })
export class RoiController {
  constructor(private roiService: RoiService, private deploymentService: DeploymentService) {}

  @Get()
  @CacheTTL(1 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  @ApiExchangeIdParam()
  async roi(@ExchangeIdParam() exchangeId: ExchangeId): Promise<any> {
    const deployment = this.deploymentService.getDeploymentByExchangeId(exchangeId);
    const roi = await this.roiService.getCachedROI(deployment);
    return roi;
  }
}
