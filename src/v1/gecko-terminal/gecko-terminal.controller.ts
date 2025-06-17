import { Controller, Get, Header, Query, Param } from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { toTimestamp } from '../../utilities';
import { DexScreenerService } from '../dex-screener/dex-screener.service';
import { BlockService } from '../../block/block.service';
import { AssetQueryDto, AssetResponse } from './asset.dto';
import { TokenService } from '../../token/token.service';
import { toChecksumAddress } from 'web3-utils';
import { PairQueryDto, PairResponse } from './pair.dto';
import { EventsQueryDto, EventsResponse } from './events.dto';
import { LatestBlockResponse } from './latest-block.dto';
import { DeploymentService, ExchangeId } from '../../deployment/deployment.service';
import { Deployment } from '../../deployment/deployment.service';
import { ApiExchangeIdParam, ExchangeIdParam } from '../../exchange-id-param.decorator';

@Controller({ version: '1', path: ':exchangeId?/gecko-terminal' })
export class GeckoTerminalController {
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
  async latestBlock(@ExchangeIdParam() exchangeId: ExchangeId): Promise<LatestBlockResponse> {
    const deployment: Deployment = await this.deploymentService.getDeploymentByExchangeId(exchangeId);
    const lastBlockNumber = await this.dexScreenerService.getLastProcessedBlock(deployment);
    const lastBlock = await this.blockService.getBlock(lastBlockNumber, deployment);
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
        // Optional fields are omitted as they're not available in current token structure
        // totalSupply, circulatingSupply, coinGeckoId, metadata can be added when available
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
    const pairs = await this.dexScreenerService.getCachedPairs(deployment);
    const pair = pairs.find((p) => p.id === parseInt(id));

    // Format pairId as carbonController-index for gecko-terminal
    const pairId = `${deployment.contracts.CarbonController.address}-${pair.id}`;

    return {
      pair: {
        id: pairId,
        dexKey: 'carbondefi',
        asset0Id: pair.asset0id,
        asset1Id: pair.asset1id,
        createdAtBlockNumber: pair.createdatblocknumber,
        createdAtBlockTimestamp: toTimestamp(pair.createdatblocktimestamp),
        createdAtTxnId: pair.createdattxnid,
        feeBps: pair.feebps,
        // Optional fields are omitted as they're not available in current pair structure
        // creator, pool, metadata can be added when available
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
    const events = await this.dexScreenerService.getCachedEvents(deployment);
    const filteredEvents = events.filter(
      (e) => e.blocknumber >= parseInt(fromBlock) && e.blocknumber <= parseInt(toBlock),
    );

    return {
      events: filteredEvents.map((e) => {
        // Format pairId as carbonController-index for gecko-terminal
        const pairId = `${deployment.contracts.CarbonController.address}-${e.pairid}`;

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
            pairId: pairId,
            asset0In: e.asset0in || undefined,
            asset1In: e.asset1in || undefined,
            asset0Out: e.asset0out || undefined,
            asset1Out: e.asset1out || undefined,
            priceNative: e.pricenative,
            reserves: {
              asset0: e.reserves0,
              asset1: e.reserves1,
            },
            // metadata field is optional as per GeckoTerminal spec
            // Can be added when available
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
            pairId: pairId,
            amount0: e.amount0,
            amount1: e.amount1,
            reserves: {
              asset0: e.reserves0,
              asset1: e.reserves1,
            },
            // metadata field is optional as per GeckoTerminal spec
            // Can be added when available
          };
        }
      }),
    };
  }
}
