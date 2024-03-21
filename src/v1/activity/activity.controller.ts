import { Controller, Get, Header, Query } from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { ActivityService } from './activity.service';
import { ActivityDto } from './activity.dto';
import moment from 'moment';
import * as _ from 'lodash';

@Controller({ version: '1', path: 'activity' })
export class ActivityController {
  constructor(private activityService: ActivityService) {}

  @Get()
  @CacheTTL(1 * 60 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  async activity(@Query() params: ActivityDto): Promise<any> {
    // get cached data
    let data = await this.activityService.getCachedActivity();

    // filter data using input parameters
    if (params.ownerId) {
      data = data.filter((d) => [d.actionOwner, d.currentOwner].includes(params.ownerId));
    }

    if (params.strategyIds) {
      const strategyIds = params.strategyIds.split(',');
      data = data.filter((d) => strategyIds.includes(d.id));
    }

    if (params.token0 && !params.token1) {
      data = data.filter((d) => [d.quoteBuyTokenAddress, d.baseSellTokenAddress].includes(params.token0));
    }

    if (params.token1 && !params.token0) {
      data = data.filter((d) => [d.quoteBuyTokenAddress, d.baseSellTokenAddress].includes(params.token1));
    }

    if (params.token0 && params.token1) {
      data = data.filter((d) =>
        _.isEqual([params.token0, params.token1].sort(), [d.quoteBuyTokenAddress, d.baseSellTokenAddress].sort()),
      );
    }

    // format data
    return data.map((d) => {
      let action = '';
      if (d.action.includes('Sell')) action = 'sell';
      if (d.action.includes('Buy')) action = 'buy';
      if (d.action.includes('Create')) action = 'create';
      if (d.action.includes('Deposit')) action = 'deposit';
      if (d.action.includes('Withdraw')) action = 'withdraw';
      if (d.action.includes('Transfer')) action = 'transfer';
      if (d.action.includes('Edit')) action = 'edit';
      if (d.action.includes('Delete')) action = 'delete';
      if (d.action.includes('Pause')) action = 'pause';

      const result = {
        action,
        strategy: {
          id: d.id,
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
        timestamp: moment(d.date).unix(),
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
    });
  }
}
