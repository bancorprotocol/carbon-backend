import { Controller, Get, Header, Query } from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { toTimestamp } from '../../utilities';
import { DexScreenerV2Service } from './dex-screener-v2.service';
import { BlockService } from '../../block/block.service';
import { AssetDto } from './asset.dto';
import { TokenService } from '../../token/token.service';
import { toChecksumAddress } from 'web3-utils';
import { EventDto } from './event.dto';
import { DeploymentService, ExchangeId } from '../../deployment/deployment.service';
import { Deployment } from '../../deployment/deployment.service';
import { ApiExchangeIdParam, ExchangeIdParam } from '../../exchange-id-param.decorator';

@Controller({ version: '1', path: ':exchangeId?/dex-screener-v2' })
export class DexScreenerV2Controller {
  constructor(
    private dexScreenerV2Service: DexScreenerV2Service,
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

    const events = await this.dexScreenerV2Service.getEvents(parseInt(fromBlock), parseInt(toBlock), deployment);

    return {
      events: events.map((e) => {
        // Helper function to convert string to number, null to 0
        const toNumber = (value: string | null): number => {
          if (value === null) return 0;
          return parseFloat(value);
        };

        // Helper function to format event index (remove .0 suffix)
        const formatEventIndex = (value: number): string => {
          return value.toString().replace('.0', '');
        };

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
            asset0In: toNumber(e.asset0In),
            asset1In: toNumber(e.asset1In),
            asset0Out: toNumber(e.asset0Out),
            asset1Out: toNumber(e.asset1Out),
            priceNative: toNumber(e.priceNative),
            reserves: {
              asset0: toNumber(e.reserves0),
              asset1: toNumber(e.reserves1),
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
            amount0: toNumber(e.amount0),
            amount1: toNumber(e.amount1),
            reserves: {
              asset0: toNumber(e.reserves0),
              asset1: toNumber(e.reserves1),
            },
          };
        }
      }),
    };
  }
}
