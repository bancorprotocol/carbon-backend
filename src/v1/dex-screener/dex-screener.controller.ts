import { Controller, Get, Header, Query } from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { toTimestamp } from '../../utilities';
import { DexScreenerService } from './dex-screener.service';
import { BlockService } from '../../block/block.service';
import { AssetDto } from './asset.dto';
import { TokenService } from '../../token/token.service';
import { toChecksumAddress } from 'web3-utils';
import { PairDto } from './pair.dto';
import { EventDto } from './event.dto';

@Controller({ version: '1', path: 'dex-screener' })
export class DexScreenerController {
  constructor(
    private dexScreenerService: DexScreenerService,
    private blockService: BlockService,
    private tokenService: TokenService,
  ) {}

  @Get('latest-block')
  @CacheTTL(1 * 1000)
  @Header('Cache-Control', 'public, max-age=60, s-max-age=60')
  async latestBlock(): Promise<any> {
    const lastBlock = await this.blockService.getLastBlock();
    return {
      block: {
        blockNumber: lastBlock.id,
        blockTimestamp: toTimestamp(lastBlock.timestamp),
      },
    };
  }

  @Get('asset')
  @CacheTTL(1 * 1000)
  @Header('Cache-Control', 'public, max-age=60, s-max-age=60')
  async asset(@Query() params: AssetDto): Promise<any> {
    const address = toChecksumAddress(params.id);
    const tokens = await this.tokenService.allByAddress();
    const token = tokens[address];

    return {
      asset: {
        id: token.address,
        name: token.name,
        symbol: token.symbol,
      },
    };
  }

  @Get('pair')
  @CacheTTL(1 * 1000)
  @Header('Cache-Control', 'public, max-age=60, s-max-age=60')
  async pair(@Query() params: PairDto): Promise<any> {
    const { id } = params;
    const pairs = await this.dexScreenerService.getCachedPairs();
    const pair = pairs.find((p) => p.id === parseInt(id));

    return {
      pair: {
        id: pair.id.toString(),
        dexKey: 'carbondefi',
        asset0Id: pair.asset0id,
        asset1Id: pair.asset1id,
        createdAtBlockNumber: pair.createdatblocknumber,
        createdAtBlockTimestamp: toTimestamp(pair.createdatblocktimestamp),
        createdAtTxnId: pair.createdattxnid,
        feeBps: pair.feebps,
      },
    };
  }

  @Get('event')
  @CacheTTL(1 * 1000)
  @Header('Cache-Control', 'public, max-age=60, s-max-age=60')
  async event(@Query() params: EventDto): Promise<any> {
    const { fromBlock, toBlock } = params;
    const events = await this.dexScreenerService.getCachedEvents();
    const filteredEvents = events.filter(
      (e) => e.blocknumber >= parseInt(fromBlock) && e.blocknumber <= parseInt(toBlock),
    );

    return {
      events: filteredEvents.map((e) => {
        if (e.eventtype === 'swap') {
          return {
            block: {
              blockNumber: e.blocknumber,
              blockTimestamp: toTimestamp(e.blocktimestamp),
            },
            eventType: 'swap',
            txnId: e.txnid,
            txnIndex: e.txnindex,
            eventIndex: e.eventindex,
            maker: e.maker,
            pairId: e.pairid.toString(),
            asset0In: e.asset0in,
            asset1Out: e.asset1out,
            priceNative: e.pricenative,
            reserves: {
              asset0: e.reserves0,
              asset1: e.reserves1,
            },
          };
        } else {
          return {
            block: {
              blockNumber: e.blocknumber,
              blockTimestamp: toTimestamp(e.blocktimestamp),
            },
            eventType: e.eventtype,
            txnId: e.txnid,
            txnIndex: e.txnindex,
            eventIndex: e.eventindex,
            maker: e.maker,
            pairId: e.pairid.toString(),
            amount0: e.amount0,
            amount1: e.amount1,
            reserves: {
              asset0: e.reserves0,
              asset1: e.reserves1,
            },
          };
        }
      }),
    };
  }
}
