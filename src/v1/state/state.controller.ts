import { Controller, Get, Header } from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { DeploymentService, ExchangeId } from '../../deployment/deployment.service';
import { ApiExchangeIdParam, ExchangeIdParam } from '../../exchange-id-param.decorator';
import { LastProcessedBlockService } from '../../last-processed-block/last-processed-block.service';

@Controller({ version: '1', path: ':exchangeId?/state' })
export class StateController {
  constructor(
    private deploymentService: DeploymentService,
    private lastProcessedBlockService: LastProcessedBlockService,
  ) {}

  @Get()
  @CacheTTL(1 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  @ApiExchangeIdParam()
  async state(@ExchangeIdParam() exchangeId: ExchangeId): Promise<any> {
    const deployment = this.deploymentService.getDeploymentByExchangeId(exchangeId);
    const state = await this.lastProcessedBlockService.getState(deployment);
    return state;
  }
}
