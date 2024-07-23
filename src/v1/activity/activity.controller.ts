import { Controller, Get, Header, Query } from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { ActivityService } from './activity.service';
import { ActivityDto } from './activity.dto';
import moment from 'moment';
import * as _ from 'lodash';
import { ActivityMetaDto } from './activity-meta.dto';

@Controller({ version: '1', path: 'activity' })
export class ActivityController {
  constructor(private activityService: ActivityService) {}

  @Get()
  @CacheTTL(1 * 60 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  async activity(@Query() params: ActivityDto): Promise<any> {
    let data = await this.activityService.getCachedActivity();

    // Filter data using input parameters
    if (params.start) {
      data = data.filter((d) => moment(d.date).unix() >= params.start);
    }

    if (params.end) {
      data = data.filter((d) => moment(d.date).unix() <= params.end);
    }

    if (params.actions) {
      const actions = params.actions.split(',');
      data = data.filter((d) => actions.includes(d.action));
    }

    if (params.ownerId) {
      data = data.filter((d) => [d.actionOwner, d.currentOwner].includes(params.ownerId));
    }

    if (params.strategyIds) {
      const strategyIds = params.strategyIds.split(',');
      data = data.filter((d) => strategyIds.includes(d.id));
    }

    if (params.pairs) {
      const pairs = params.pairs.split(',').map((pair) => pair.split('_').sort());
      data = data.filter((d) =>
        pairs.some((pair) =>
          _.isEqual(pair, [d.quoteBuyTokenAddress.toLowerCase(), d.baseSellTokenAddress.toLowerCase()].sort()),
        ),
      );
    }

    if (params.token0 && !params.token1) {
      data = data.filter((d) =>
        [d.quoteBuyTokenAddress.toLowerCase(), d.baseSellTokenAddress.toLowerCase()].includes(
          params.token0.toLowerCase(),
        ),
      );
    }

    if (params.token1 && !params.token0) {
      data = data.filter((d) =>
        [d.quoteBuyTokenAddress.toLowerCase(), d.baseSellTokenAddress.toLowerCase()].includes(
          params.token1.toLowerCase(),
        ),
      );
    }

    if (params.token0 && params.token1) {
      data = data.filter((d) =>
        _.isEqual(
          [params.token0.toLowerCase(), params.token1.toLowerCase()].sort(),
          [d.quoteBuyTokenAddress.toLowerCase(), d.baseSellTokenAddress.toLowerCase()].sort(),
        ),
      );
    }

    // Sort data by date in descending order
    data = data.sort((a, b) => moment(b.date).unix() - moment(a.date).unix());

    // Apply pagination
    const totalSize = data.length;
    const limit = params.limit || totalSize;
    const offset = params.offset || 0;
    data = data.slice(offset, offset + limit);

    const result = data.map((d) => {
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

    return result;
  }

  @Get('meta')
  @CacheTTL(1 * 60 * 1000)
  async activityMeta(@Query() params: ActivityMetaDto): Promise<any> {
    let data = await this.activityService.getCachedActivity();

    // Filter data using input parameters (without limit and offset)
    if (params.start) {
      data = data.filter((d) => moment(d.date).unix() >= params.start);
    }

    if (params.end) {
      data = data.filter((d) => moment(d.date).unix() <= params.end);
    }

    if (params.actions) {
      const actions = params.actions.split(',');
      data = data.filter((d) => actions.includes(d.action));
    }

    if (params.ownerId) {
      data = data.filter((d) => [d.actionOwner, d.currentOwner].includes(params.ownerId));
    }

    if (params.strategyIds) {
      const strategyIds = params.strategyIds.split(',');
      data = data.filter((d) => strategyIds.includes(d.id));
    }

    if (params.pairs) {
      const pairs = params.pairs.split(',').map((pair) => pair.split('_').sort());
      data = data.filter((d) =>
        pairs.some((pair) =>
          _.isEqual(pair, [d.quoteBuyTokenAddress.toLowerCase(), d.baseSellTokenAddress.toLowerCase()].sort()),
        ),
      );
    }

    if (params.token0 && !params.token1) {
      data = data.filter((d) =>
        [d.quoteBuyTokenAddress.toLowerCase(), d.baseSellTokenAddress.toLowerCase()].includes(
          params.token0.toLowerCase(),
        ),
      );
    }

    if (params.token1 && !params.token0) {
      data = data.filter((d) =>
        [d.quoteBuyTokenAddress.toLowerCase(), d.baseSellTokenAddress.toLowerCase()].includes(
          params.token1.toLowerCase(),
        ),
      );
    }

    if (params.token0 && params.token1) {
      data = data.filter((d) =>
        _.isEqual(
          [params.token0.toLowerCase(), params.token1.toLowerCase()].sort(),
          [d.quoteBuyTokenAddress.toLowerCase(), d.baseSellTokenAddress.toLowerCase()].sort(),
        ),
      );
    }

    // Collect meta information
    const actions = [...new Set(data.map((d) => d.action))];
    const uniquePairs = new Set();
    data.forEach((d) => {
      const pair = [d.quoteBuyTokenAddress.toLowerCase(), d.baseSellTokenAddress.toLowerCase()].sort().toString();
      uniquePairs.add(pair);
    });
    const pairs = Array.from(uniquePairs).map((pair: string) => pair.split(','));
    const strategies = data.reduce((acc, d) => {
      acc[d.id] = [d.baseSellTokenAddress, d.quoteBuyTokenAddress];
      return acc;
    }, {});

    return {
      size: data.length,
      actions,
      pairs,
      strategies,
    };
  }
}
