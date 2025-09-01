import { Controller, Get, Header } from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { WalletPairBalanceService } from '../../wallet-pair-balance/wallet-pair-balance.service';
import { DeploymentService, ExchangeId } from '../../deployment/deployment.service';
import { ApiExchangeIdParam, ExchangeIdParam } from '../../exchange-id-param.decorator';
import { LastProcessedBlockService } from '../../last-processed-block/last-processed-block.service';

@Controller({ version: '1', path: ':exchangeId?/wallet-pair-balance' })
export class WalletPairBalanceController {
  constructor(
    private walletPairBalanceService: WalletPairBalanceService,
    private deploymentService: DeploymentService,
    private lastProcessedBlockService: LastProcessedBlockService,
  ) {}

  @Get()
  @CacheTTL(1 * 60 * 1000)
  @Header('Cache-Control', 'public, max-age=300')
  @ApiExchangeIdParam()
  async getWalletPairBalances(@ExchangeIdParam() exchangeId: ExchangeId): Promise<any> {
    const deployment = this.deploymentService.getDeploymentByExchangeId(exchangeId);
    const data = await this.walletPairBalanceService.getLatestBalances(deployment);
    const blockState = await this.lastProcessedBlockService.getState(deployment);

    return {
      blockNumber: blockState.lastBlock,
      blockTimestamp: Math.floor(new Date(blockState.timestamp).getTime() / 1000),
      data: data,
    };
  }
}
