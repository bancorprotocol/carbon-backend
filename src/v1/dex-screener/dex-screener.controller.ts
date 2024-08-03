import { Controller, Get, Header, Query, Param } from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { toTimestamp } from '../../utilities';
import { DexScreenerService } from './dex-screener.service';
import { BlockService } from '../../block/block.service';
import { AssetDto } from './asset.dto';
import { TokenService } from '../../token/token.service';
import { toChecksumAddress } from 'web3-utils';
import { PairDto } from './pair.dto';
import { EventDto } from './event.dto';
import { DeploymentService, ExchangeId } from '../../deployment/deployment.service';
import { Deployment } from '../../deployment/deployment.service';
import { ApiExchangeIdParam, ExchangeIdParam } from '../../exchange-id-param.decorator';

@Controller({ version: '1', path: ':exchangeId?/dex-screener' })
export class DexScreenerController {
  constructor(
    private dexScreenerService: DexScreenerService,
    private blockService: BlockService,
    private tokenService: TokenService,
    private deploymentService: DeploymentService,
  ) {}

  @Get('latest-block')
  @CacheTTL(1 * 1000)
  @Header('Cache-Control', 'public, max-age=60, s-max-age=60')
  @ApiExchangeIdParam()
  async latestBlock(@ExchangeIdParam() exchangeId: ExchangeId): Promise<any> {
    const deployment: Deployment = await this.deploymentService.getDeploymentByExchangeId(exchangeId);
    const lastBlock = await this.blockService.getLastBlock(deployment);
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
  @ApiExchangeIdParam()
  async asset(@ExchangeIdParam() exchangeId: ExchangeId, @Query() params: AssetDto): Promise<any> {
    const deployment: Deployment = await this.deploymentService.getDeploymentByExchangeId(exchangeId);
    const address = toChecksumAddress(params.id);
    const tokens = await this.tokenService.allByAddress(deployment);
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
  @ApiExchangeIdParam()
  async pair(@ExchangeIdParam() exchangeId: ExchangeId, @Query() params: PairDto): Promise<any> {
    const deployment: Deployment = await this.deploymentService.getDeploymentByExchangeId(exchangeId);
    const { id } = params;
    const pairs = await this.dexScreenerService.getCachedPairs(deployment);
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

  @Get('events')
  @CacheTTL(1 * 1000)
  @Header('Cache-Control', 'public, max-age=60, s-max-age=60')
  @ApiExchangeIdParam()
  async events(@ExchangeIdParam() exchangeId: ExchangeId, @Query() params: EventDto): Promise<any> {
    const deployment: Deployment = await this.deploymentService.getDeploymentByExchangeId(exchangeId);
    const { fromBlock, toBlock } = params;
    const events = await this.dexScreenerService.getCachedEvents(deployment);
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
            asset1In: e.asset1in,
            asset0Out: e.asset0out,
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
