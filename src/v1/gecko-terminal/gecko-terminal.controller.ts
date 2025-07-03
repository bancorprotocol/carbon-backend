import { Controller, Get, Header, Query } from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { toTimestamp } from '../../utilities';
import { DexScreenerV2Service } from '../dex-screener/dex-screener-v2.service';
import { AssetQueryDto, AssetResponse } from './asset.dto';
import { TokenService } from '../../token/token.service';
import { toChecksumAddress } from 'web3-utils';
import { PairQueryDto, PairResponse } from './pair.dto';
import { EventsQueryDto, EventsResponse } from './events.dto';
import { LatestBlockResponse } from './latest-block.dto';
import { DeploymentService, ExchangeId } from '../../deployment/deployment.service';
import { Deployment } from '../../deployment/deployment.service';
import { ApiExchangeIdParam, ExchangeIdParam } from '../../exchange-id-param.decorator';
import { LastProcessedBlockService } from '../../last-processed-block/last-processed-block.service';

@Controller({ version: '1', path: ':exchangeId?/gecko-terminal' })
export class GeckoTerminalController {
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
  async latestBlock(@ExchangeIdParam() exchangeId: ExchangeId): Promise<LatestBlockResponse> {
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
  async asset(@ExchangeIdParam() exchangeId: ExchangeId, @Query() params: AssetQueryDto): Promise<AssetResponse> {
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

  @Get('pair')
  @CacheTTL(1 * 1000)
  @Header('Cache-Control', 'public, max-age=60, s-max-age=60')
  @ApiExchangeIdParam()
  async pair(@ExchangeIdParam() exchangeId: ExchangeId, @Query() params: PairQueryDto): Promise<PairResponse> {
    const deployment: Deployment = await this.deploymentService.getDeploymentByExchangeId(exchangeId);
    const { id } = params;
    const pairs = await this.dexScreenerV2Service.getCachedPairs(deployment);
    const pair = pairs.find((p) => p.id === parseInt(id.split('-')[1]));

    return {
      pair: {
        id,
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
  async events(@ExchangeIdParam() exchangeId: ExchangeId, @Query() params: EventsQueryDto): Promise<EventsResponse> {
    const deployment: Deployment = await this.deploymentService.getDeploymentByExchangeId(exchangeId);
    const { fromBlock, toBlock } = params;
    const events = await this.dexScreenerV2Service.getEvents(parseInt(fromBlock), parseInt(toBlock), deployment);

    // Helper function to convert null to "0", keep strings as strings
    const toString = (value: string | null): string => {
      if (value === null) return '0';
      return value;
    };

    // Helper function to format event index (remove .0 suffix)
    const formatEventIndex = (value: number): number => {
      return parseInt(value.toString().replace('.0', ''));
    };

    return {
      events: events.map((e) => {
        // Format pairId as carbonController-index for gecko-terminal
        const pairId = `${deployment.contracts.CarbonController.address}-${e.pairId}`;

        if (e.eventType === 'swap') {
          return {
            block: {
              blockNumber: e.blockNumber,
              blockTimestamp: toTimestamp(e.blockTimestamp),
            },
            eventType: 'swap' as const,
            txnId: e.txnId,
            txnIndex: e.txnIndex,
            eventIndex: formatEventIndex(e.eventIndex),
            maker: e.maker,
            pairId: pairId,
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
            eventType: e.eventType as 'join' | 'exit',
            txnId: e.txnId,
            txnIndex: e.txnIndex,
            eventIndex: formatEventIndex(e.eventIndex),
            maker: e.maker,
            pairId: pairId,
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
}
