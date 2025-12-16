import { Controller, Get, Header, Query, HttpStatus, HttpException } from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DeploymentService, ExchangeId } from '../../deployment/deployment.service';
import { ApiExchangeIdParam, ExchangeIdParam } from '../../exchange-id-param.decorator';
import { SeedDataService } from './seed-data.service';
import { SeedDataQueryDto, SeedDataResponse } from './seed-data.dto';
import { StrategyRealtimeService } from '../../strategy-realtime/strategy-realtime.service';
import { PairService } from '../../pair/pair.service';

@Controller({ version: '1', path: ':exchangeId?/seed-data' })
export class SeedDataController {
  constructor(
    private deploymentService: DeploymentService,
    private seedDataService: SeedDataService,
    private strategyRealtimeService: StrategyRealtimeService,
    private pairService: PairService,
  ) {}

  @Get()
  @CacheTTL(10 * 1000) // Cache for 10 seconds
  @Header('Cache-Control', 'public, max-age=10')
  @ApiExchangeIdParam()
  @ApiOperation({
    summary: 'Get seed data for SDK cache initialization',
    description:
      'Returns a snapshot of the chain state including all active strategies with their owners and trading fees. Supports pagination for large datasets.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Successfully retrieved seed data',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Seed data not available',
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Internal server error',
  })
  async getSeedData(
    @ExchangeIdParam() exchangeId: ExchangeId,
    @Query() query: SeedDataQueryDto,
  ): Promise<SeedDataResponse> {
    try {
      const deployment = this.deploymentService.getDeploymentByExchangeId(exchangeId);

      // Fetch strategies (with block number from multicall) and trading fees in parallel
      const [strategiesResult, tradingFeePPMByPair] = await Promise.all([
        this.strategyRealtimeService.getStrategiesWithOwners(deployment),
        this.pairService.getTradingFeesByPair(deployment),
      ]);

      const { strategies: strategiesWithOwners, blockNumber } = strategiesResult;

      if (blockNumber === 0) {
        throw new Error('No processed blocks found for this deployment');
      }

      // Pass fetched data to service for processing
      const seedData = await this.seedDataService.buildSeedData(
        blockNumber,
        strategiesWithOwners,
        tradingFeePPMByPair,
        query.page,
        query.pageSize,
      );

      return seedData;
    } catch (error) {
      if (error.message.includes('not found')) {
        throw new HttpException('Seed data not available', HttpStatus.NOT_FOUND);
      }
      throw new HttpException('Failed to retrieve seed data', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
