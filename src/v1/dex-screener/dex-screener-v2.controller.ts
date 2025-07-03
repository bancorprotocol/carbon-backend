import { Controller, Get, Header, Query } from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { toTimestamp } from '../../utilities';
import { DexScreenerV2Service } from './dex-screener-v2.service';
import { AssetDto } from './asset.dto';
import { PairDto } from './pair.dto';
import { TokenService } from '../../token/token.service';
import { toChecksumAddress } from 'web3-utils';
import { EventDto } from './event.dto';
import { DeploymentService, ExchangeId } from '../../deployment/deployment.service';
import { Deployment } from '../../deployment/deployment.service';
import { ApiExchangeIdParam, ExchangeIdParam } from '../../exchange-id-param.decorator';
import { LastProcessedBlockService } from '../../last-processed-block/last-processed-block.service';

@Controller({ version: '1', path: ':exchangeId?/dex-screener' })
export class DexScreenerV2Controller {
  constructor(
    private dexScreenerV2Service: DexScreenerV2Service,
    private tokenService: TokenService,
    private deploymentService: DeploymentService,
    private lastProcessedBlockService: LastProcessedBlockService,
  ) {}

  @Get('latest-block')
  @CacheTTL(1 * 1000)
  @Header('Cache-Control', 'public, max-age=60, s-max-age=60')
  @ApiExchangeIdParam()
  async latestBlock(@ExchangeIdParam() exchangeId: ExchangeId): Promise<any> {
    const deployment: Deployment = await this.deploymentService.getDeploymentByExchangeId(exchangeId);
    const lastBlock = await this.lastProcessedBlockService.getState(deployment);
    return {
      block: {
        blockNumber: lastBlock.lastBlock,
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
        decimals: token.decimals,
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

    // Helper function to convert null to "0", keep strings as strings
    const toString = (value: string | null): string => {
      if (value === null) return '0';
      return value;
    };

    // Helper function to format event index (remove .0 suffix)
    const formatEventIndex = (value: number): number => {
      return parseInt(value.toString().replace('.0', ''));
    };

    const events = await this.dexScreenerV2Service.getEvents(parseInt(fromBlock), parseInt(toBlock), deployment);

    return {
      events: events.map((e) => {
        if (e.eventType === 'swap') {
          return {
            block: {
              blockNumber: e.blockNumber,
              blockTimestamp: toTimestamp(e.blockTimestamp),
            },
            eventType: 'swap',
            txnId: e.txnId,
            txnIndex: e.txnIndex,
            eventIndex: formatEventIndex(e.eventIndex),
            maker: e.maker,
            pairId: e.pairId.toString(),
            asset0In: toString(e.asset0In),
            asset1In: toString(e.asset1In),
            asset0Out: toString(e.asset0Out),
            asset1Out: toString(e.asset1Out),
            priceNative: toString(e.priceNative),
            reserves: {
              asset0: toString(e.reserves0),
              asset1: toString(e.reserves1),
            },
          };
        } else {
          return {
            block: {
              blockNumber: e.blockNumber,
              blockTimestamp: toTimestamp(e.blockTimestamp),
            },
            eventType: e.eventType,
            txnId: e.txnId,
            txnIndex: e.txnIndex,
            eventIndex: formatEventIndex(e.eventIndex),
            maker: e.maker,
            pairId: e.pairId.toString(),
            amount0: toString(e.amount0),
            amount1: toString(e.amount1),
            reserves: {
              asset0: toString(e.reserves0),
              asset1: toString(e.reserves1),
            },
          };
        }
      }),
    };
  }

  @Get('pair')
  @CacheTTL(1 * 1000)
  @Header('Cache-Control', 'public, max-age=60, s-max-age=60')
  @ApiExchangeIdParam()
  async pair(@ExchangeIdParam() exchangeId: ExchangeId, @Query() params: PairDto): Promise<any> {
    const deployment: Deployment = await this.deploymentService.getDeploymentByExchangeId(exchangeId);
    const { id } = params;
    const pairs = await this.dexScreenerV2Service.getCachedPairs(deployment);
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
}
