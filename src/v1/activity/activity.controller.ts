import { Controller, Get, Header, Query } from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { ActivityDto } from './activity.dto';
import { ActivityMetaDto } from './activity-meta.dto';
import moment from 'moment';
import { DeploymentService, ExchangeId } from '../../deployment/deployment.service';
import { ApiExchangeIdParam, ExchangeIdParam } from '../../exchange-id-param.decorator';
import { ActivityV2Service } from '../../activity/activity-v2.service';
@Controller({ version: '1', path: ':exchangeId?/activity' })
export class ActivityController {
  constructor(private activityV2Service: ActivityV2Service, private deploymentService: DeploymentService) {}

  private async getDeployment(exchangeId: ExchangeId): Promise<any> {
    return this.deploymentService.getDeploymentByExchangeId(exchangeId);
  }

  private formatAction(action: string): string {
    if (action.includes('sell')) return 'sell';
    if (action.includes('buy')) return 'buy';
    if (action.includes('create')) return 'create';
    if (action.includes('deposit')) return 'deposit';
    if (action.includes('withdraw')) return 'withdraw';
    if (action.includes('transfer')) return 'transfer';
    if (action.includes('edit')) return 'edit';
    if (action.includes('delete')) return 'delete';
    if (action.includes('pause')) return 'pause';
    return '';
  }

  private mapData(d: any): any {
    const action = this.formatAction(d.action);

    const result = {
      action,
      strategy: {
        id: d.strategyId,
        owner: d.currentOwner,
        base: d.baseSellTokenAddress,
        quote: d.quoteBuyTokenAddress,
        buy: {
          budget: d.buyBudget.toString(),
          min: d.buyPriceA.toString(),
          max: d.buyPriceB.toString(),
          marginal: d.buyPriceMarg.toString(),
        },
        sell: {
          budget: d.sellBudget.toString(),
          min: d.sellPriceA.toString(),
          max: d.sellPriceB.toString(),
          marginal: d.sellPriceMarg.toString(),
        },
      },
      blockNumber: d.blockNumber,
      txHash: d.txhash,
      timestamp: moment(d.timestamp).unix(),
      changes: {},
    };

    if (d.buyBudgetChange) {
      result['changes']['buy'] = { ...result['changes']['buy'], budget: d.buyBudgetChange.toString() };
    }

    if (d.sellBudgetChange) {
      result['changes']['sell'] = { ...result['changes']['sell'], budget: d.sellBudgetChange.toString() };
    }

    if (d.buyPriceADelta) {
      result['changes']['buy'] = { ...result['changes']['buy'], min: d.buyPriceADelta.toString() };
    }

    if (d.buyPriceBDelta) {
      result['changes']['buy'] = { ...result['changes']['buy'], max: d.buyPriceBDelta.toString() };
    }

    if (d.sellPriceADelta) {
      result['changes']['sell'] = { ...result['changes']['sell'], min: d.sellPriceADelta.toString() };
    }

    if (d.sellPriceBDelta) {
      result['changes']['sell'] = { ...result['changes']['sell'], max: d.sellPriceBDelta.toString() };
    }

    if (d.buyPriceMargDelta) {
      result['changes']['buy'] = { ...result['changes']['buy'], marginal: d.buyPriceMargDelta.toString() };
    }

    if (d.sellPriceMargDelta) {
      result['changes']['sell'] = { ...result['changes']['sell'], marginal: d.sellPriceMargDelta.toString() };
    }

    if (d.newOwner && d.oldOwner) {
      result['changes']['owner'] = d.oldOwner;
    }

    if (Object.keys(result['changes']).length === 0) {
      delete result['changes'];
    }

    return result;
  }

  @Get()
  @CacheTTL(1 * 60 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  @ApiExchangeIdParam()
  async activity(@ExchangeIdParam() exchangeId: ExchangeId, @Query() params: ActivityDto): Promise<any> {
    const deployment = await this.getDeployment(exchangeId);
    const _params = { ...params, limit: params.limit || 100, deployment };
    const data = await this.activityV2Service.getFilteredActivities(_params, deployment);
    return data.map((d) => this.mapData(d));
  }

  @Get('meta')
  @CacheTTL(1 * 60 * 1000)
  @ApiExchangeIdParam()
  async activityMeta(@ExchangeIdParam() exchangeId: ExchangeId, @Query() params: ActivityMetaDto): Promise<any> {
    const deployment = await this.getDeployment(exchangeId);
    const _params = { ...params, deployment };
    const data = await this.activityV2Service.getActivityMeta(_params, deployment);

    // Collect meta information
    const actions = [...new Set(data.actions.map((d) => this.formatAction(d)))];
    return { ...data, actions };
  }

  @Get('v2')
  @CacheTTL(1 * 60 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  @ApiExchangeIdParam()
  async activityV2(@ExchangeIdParam() exchangeId: ExchangeId, @Query() params: ActivityDto): Promise<any> {
    const deployment = await this.getDeployment(exchangeId);
    const _params = { ...params, limit: params.limit || 100, deployment };
    const data = await this.activityV2Service.getFilteredActivities(_params, deployment);
    return data.map((d) => this.mapData(d));
  }

  @Get('v2/meta')
  @CacheTTL(1 * 60 * 1000)
  @ApiExchangeIdParam()
  async activityV2Meta(@ExchangeIdParam() exchangeId: ExchangeId, @Query() params: ActivityMetaDto): Promise<any> {
    const deployment = await this.getDeployment(exchangeId);
    const _params = { ...params, deployment };
    const data = await this.activityV2Service.getActivityMeta(_params, deployment);

    // Collect meta information
    const actions = [...new Set(data.actions.map((d) => this.formatAction(d)))];
    return { ...data, actions };
  }
}
