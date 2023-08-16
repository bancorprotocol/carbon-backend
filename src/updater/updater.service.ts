import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Inject, Injectable } from '@nestjs/common';
import { HarvesterService } from '../harvester/harvester.service';
import { BlockService } from '../block/block.service';
import { LastProcessedBlockService } from '../last-processed-block/last-processed-block.service';
import * as _ from 'lodash';
import { TokenService } from '../token/token.service';
import { PairService } from '../pair/pair.service';
import { PairCreatedEventService } from '../events/pair-created-event /pair-created-event.service';
import { StrategyService } from 'src/strategy/strategy.service';
import { TokensTradedEventService } from 'src/events/tokens-traded-event/tokens-traded-event.service';

export const CARBON_IS_UPDATING = 'carbon:isUpdating';

@Injectable()
export class UpdaterService {
  private isUpdating: boolean;

  constructor(
    private configService: ConfigService,
    private harvesterService: HarvesterService,
    private blockService: BlockService,
    private lastProcessedBlockService: LastProcessedBlockService,
    private tokenService: TokenService,
    private pairService: PairService,
    private pairCreatedEventService: PairCreatedEventService,
    private strategyService: StrategyService,
    private tokensTradedEventService: TokensTradedEventService,
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
      console.log('CARBON SERVICE - Finished blocks');

      const firstUnprocessedBlockNumber =
        await this.lastProcessedBlockService.firstUnprocessedBlockNumber();
      const fullRange = range(firstUnprocessedBlockNumber, endBlock);
      const batches = _.chunk(fullRange, 1000000);

      for (const batch of batches) {
        const toBlock = batch[batch.length - 1];

        // handle PairCreated events
        await this.pairCreatedEventService.update(toBlock);

        // create tokens
        await this.tokenService.update(toBlock);
        const tokens = await this.tokenService.allByAddress();

        // create pairs
        await this.pairService.update(toBlock, tokens);
        const pairs = await this.pairService.allAsDictionary();

        // create strategies
        await this.strategyService.update(toBlock, pairs, tokens);

        // create trades
        await this.tokensTradedEventService.update(toBlock, pairs, tokens);
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
