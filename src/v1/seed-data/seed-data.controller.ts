import { Controller, Get, Header, Query, HttpStatus, HttpException } from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DeploymentService, ExchangeId } from '../../deployment/deployment.service';
import { ApiExchangeIdParam, ExchangeIdParam } from '../../exchange-id-param.decorator';
import { SeedDataService } from './seed-data.service';
import { SeedDataQueryDto, SeedDataResponse } from './seed-data.dto';
import { StrategyService } from '../../strategy/strategy.service';
import { PairService } from '../../pair/pair.service';
import { LastProcessedBlockService } from '../../last-processed-block/last-processed-block.service';

@Controller({ version: '1', path: ':exchangeId?/seed-data' })
export class SeedDataController {
  constructor(
    private deploymentService: DeploymentService,
    private seedDataService: SeedDataService,
    private lastProcessedBlockService: LastProcessedBlockService,
    private strategyService: StrategyService,
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

      // Get the last fully processed block for this deployment
      const state = await this.lastProcessedBlockService.getState(deployment);
      if (!state || !state.lastBlock) {
        throw new Error('No processed blocks found for this deployment');
      }

      const lastProcessedBlock = state.lastBlock;

      // Fetch strategies and trading fees in parallel
      const [strategiesWithOwners, tradingFeePPMByPair] = await Promise.all([
        this.strategyService.getStrategiesWithOwners(deployment, lastProcessedBlock),
        this.pairService.getTradingFeesByPair(deployment),
      ]);

      // Pass fetched data to service for processing
      const seedData = await this.seedDataService.buildSeedData(
        lastProcessedBlock,
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
