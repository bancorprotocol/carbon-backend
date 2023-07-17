import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Inject, Injectable } from '@nestjs/common';
import { HarvesterService } from '../harvester/harvester.service';
import { CacheService } from '../cache/cache.service';
import { BlockService } from '../block/block.service';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import { QuoteService } from '../quote/quote.service';
import * as _ from 'lodash';
import { StrategyCreatedEventService } from '../events/strategy-created-event/strategy-created-event.service';
import { TokenService } from '../token/token.service';
import { PairService } from '../pair/pair.service';
import { PairCreatedEventService } from '../events/pair-created-event /pair-created-event.service';

export const CARBON_IS_UPDATING = 'carbon:isUpdating';
export const CARBON_IS_UPDATING_REALTIME = 'carbon:isUpdatingRealtime';

@Injectable()
export class UpdaterService {
  private isUpdating: boolean;
  private isUpdatingRealtime: boolean;

  constructor(
    private configService: ConfigService,
    private harvesterService: HarvesterService,
    private cacheService: CacheService,
    private blockService: BlockService,
    private lastProcessedBlockService: LastProcessedBlockService,
    private quoteService: QuoteService,
    private strategyCreatedEventsService: StrategyCreatedEventService,
    private tokenService: TokenService,
    private pairService: PairService,
    private pairCreatedEventService: PairCreatedEventService,
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
      const lockDuration =
        parseInt(this.configService.get('CARBON_LOCK_DURATION')) || 120;
      await this.redis.client.setex('carbon:isUpdating', lockDuration, 1);
      if (endBlock === -12) {
        if (this.configService.get('IS_FORK') === '1') {
          endBlock = await this.harvesterService.latestBlock();
        } else {
          endBlock = (await this.harvesterService.latestBlock()) - 12;
        }
      }

      await this.blockService.update(endBlock);
      console.log('V3 SERVICE - Finished blocks');

      // quotes
      // const firstBlock = await this.blockService.getFirst();
      // await this.quoteService.update(firstBlock.timestamp);
      // await this.quoteService.updateV3Cache();
      // console.log('V3 SERVICE - Finished quotes');

      const firstUnprocessedBlockNumber =
        await this.lastProcessedBlockService.firstUnprocessedBlockNumber();
      const fullRange = range(firstUnprocessedBlockNumber, endBlock);
      const batches = _.chunk(fullRange, 1000000);

      for (const batch of batches) {
        const fromBlock = batch[0];
        const toBlock = batch[batch.length - 1];
        const blocks = await this.blockService.getBlocksDictionary(
          fromBlock,
          toBlock,
        );

        // handle PairCreated events
        await this.pairCreatedEventService.update(toBlock);

        // create tokens
        await this.tokenService.update(endBlock);
        const tokens = await this.tokenService.allByAddress();

        // create pairs
        await this.pairService.update(endBlock, tokens);
        const pairs = await this.pairService.allAsDictionary();

        // handle StrategyCreated events
        // const strategyCreatedEvents =
        //   await this.strategyCreatedEventsService.update(
        //     toBlock,
        //     pairs,
        //     tokens,
        //   );
      }

      // finish
      console.log('CARBON SERVICE', Date.now() - t);
      this.isUpdating = false;
      await this.redis.client.set(CARBON_IS_UPDATING, 0);
    } catch (error) {
      console.log('error in carbon updater', error, Date.now() - t);
      this.isUpdating = false;
      await this.redis.client.set(CARBON_IS_UPDATING, 0);
    }
  }
}

function range(start, end) {
  return Array(end - start + 1)
    .fill(1)
    .map((_, idx) => start + idx);
}
