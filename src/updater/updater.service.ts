import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Inject, Injectable } from '@nestjs/common';
import * as _ from 'lodash';
import { HarvesterService } from '../harvester/harvester.service';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { TokenService } from '../token/token.service';
import { PairService } from '../pair/pair.service';
import { PairCreatedEventService } from '../events/pair-created-event/pair-created-event.service';
import { StrategyService } from '../strategy/strategy.service';
import { TokensTradedEventService } from '../events/tokens-traded-event/tokens-traded-event.service';
import { RoiService } from '../v1/roi/roi.service';
import { CoingeckoService } from '../v1/coingecko/coingecko.service';
import { PairTradingFeePpmUpdatedEventService } from '../events/pair-trading-fee-ppm-updated-event/pair-trading-fee-ppm-updated-event.service';
import { TradingFeePpmUpdatedEventService } from '../events/trading-fee-ppm-updated-event/trading-fee-ppm-updated-event.service';
import { ActivityService } from '../v1/activity/activity.service';
import { VoucherTransferEventService } from '../events/voucher-transfer-event/voucher-transfer-event.service';
import { AnalyticsService } from '../v1/analytics/analytics.service';
import { DexScreenerService } from '../v1/dex-screener/dex-screener.service';

export const CARBON_IS_UPDATING = 'carbon:isUpdating';
export const CARBON_IS_UPDATING_ANALYTICS = 'carbon:isUpdatingAnalytics';

@Injectable()
export class UpdaterService {
  private isUpdating: boolean;
  private isUpdatingAnalytics: boolean;

  constructor(
    private configService: ConfigService,
    private harvesterService: HarvesterService,
    private lastProcessedBlockService: LastProcessedBlockService,
    private tokenService: TokenService,
    private pairService: PairService,
    private pairCreatedEventService: PairCreatedEventService,
    private strategyService: StrategyService,
    private tokensTradedEventService: TokensTradedEventService,
    private roiService: RoiService,
    private coingeckoService: CoingeckoService,
    private tradingFeePpmUpdatedEventService: TradingFeePpmUpdatedEventService,
    private pairTradingFeePpmUpdatedEventService: PairTradingFeePpmUpdatedEventService,
    private activityService: ActivityService,
    private voucherTransferEventService: VoucherTransferEventService,
    private analyticsService: AnalyticsService,
    private dexScreenerService: DexScreenerService,
    @Inject('REDIS') private redis: any,
  ) {}

  @Interval(5000)
  async update(): Promise<any> {
    const shouldHarvest = this.configService.get('SHOULD_HARVEST');
    if (shouldHarvest !== '1') return;

    if (this.isUpdating) return;

    const isUpdating = await this.redis.client.get(CARBON_IS_UPDATING);
    if (isUpdating === '1' && process.env.NODE_ENV === 'production') return;

    console.log('CARBON SERVICE - Started update cycle');
    let endBlock = parseInt(this.configService.get('END_BLOCK'));

    const t = Date.now();
    try {
      this.isUpdating = true;
      const lockDuration = parseInt(this.configService.get('CARBON_LOCK_DURATION')) || 120;
      await this.redis.client.setex(CARBON_IS_UPDATING, lockDuration, 1);
      if (endBlock === -12) {
        if (this.configService.get('IS_FORK') === '1') {
          endBlock = await this.harvesterService.latestBlock();
        } else {
          endBlock = (await this.harvesterService.latestBlock()) - 12;
        }
      }

      // handle PairCreated events
      await this.pairCreatedEventService.update(endBlock);
      console.log('CARBON SERVICE - Finished pairs creation events');

      // create tokens
      await this.tokenService.update(endBlock);
      const tokens = await this.tokenService.allByAddress();
      console.log('CARBON SERVICE - Finished tokens');

      // create pairs
      await this.pairService.update(endBlock, tokens);
      const pairs = await this.pairService.allAsDictionary();
      console.log('CARBON SERVICE - Finished pairs');

      // create strategies
      await this.strategyService.update(endBlock, pairs, tokens);
      console.log('CARBON SERVICE - Finished strategies');

      // create trades
      await this.tokensTradedEventService.update(endBlock, pairs, tokens);
      console.log('CARBON SERVICE - Finished trades');

      // ROI
      await this.roiService.update();
      console.log('CARBON SERVICE - Finished updating ROI');

      // coingecko tickers
      await this.coingeckoService.update();
      console.log('CARBON SERVICE - Finished updating coingecko tickers');

      // trading fee events
      await this.tradingFeePpmUpdatedEventService.update(endBlock);
      console.log('CARBON SERVICE - Finished updating trading fee events');

      // pair trading fee events
      await this.pairTradingFeePpmUpdatedEventService.update(endBlock, pairs, tokens);
      console.log('CARBON SERVICE - Finished updating pair trading fee events');

      await this.voucherTransferEventService.update(endBlock);
      console.log('CARBON SERVICE - Finished updating voucher transfer events');

      // activity
      await this.activityService.update();
      console.log('CARBON SERVICE - Finished updating activity');

      // finish
      console.log('CARBON SERVICE -', 'Finished update iteration in:', Date.now() - t, 'ms');
      this.isUpdating = false;
      await this.redis.client.set(CARBON_IS_UPDATING, 0);
    } catch (error) {
      console.log('error in carbon updater', error, Date.now() - t);
      this.isUpdating = false;
      await this.redis.client.set(CARBON_IS_UPDATING, 0);
    }
  }

  @Interval(5000)
  async updateAnalytics(): Promise<any> {
    const shouldUpdateAnalytics = this.configService.get('SHOULD_UPDATE_ANALYTICS');
    if (shouldUpdateAnalytics !== '1') return;

    if (this.isUpdatingAnalytics) return;

    const isUpdatingAnalytics = await this.redis.client.get(CARBON_IS_UPDATING_ANALYTICS);
    if (isUpdatingAnalytics === '1' && process.env.NODE_ENV === 'production') return;

    console.log('CARBON SERVICE - Started analytics update cycle');
    const t = Date.now();

    try {
      this.isUpdatingAnalytics = true;
      const lockDuration = parseInt(this.configService.get('CARBON_LOCK_DURATION')) || 120;
      await this.redis.client.setex(CARBON_IS_UPDATING_ANALYTICS, lockDuration, 1);

      // analytics
      await this.analyticsService.update();

      // DexScreener
      await this.dexScreenerService.update();
      console.log('CARBON SERVICE - Finished updating DexScreener');

      console.log('CARBON SERVICE -', 'Finished updating analytics in:', Date.now() - t, 'ms');

      this.isUpdatingAnalytics = false;
      await this.redis.client.set(CARBON_IS_UPDATING_ANALYTICS, 0);
    } catch (error) {
      console.log('error in carbon analytics updater', error, Date.now() - t);
      this.isUpdatingAnalytics = false;
      await this.redis.client.set(CARBON_IS_UPDATING_ANALYTICS, 0);
    }
  }
}

function range(start, end) {
  return Array(end - start + 1)
    .fill(1)
    .map((_, idx) => start + idx);
}
