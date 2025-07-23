import { Controller, Get, Query, Header, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Decimal } from 'decimal.js';
import { toChecksumAddress } from 'web3-utils';
import { ApiExchangeIdParam, ExchangeIdParam } from '../../exchange-id-param.decorator';
import { Campaign } from '../../merkl/entities/campaign.entity';
import { EpochReward } from '../../merkl/entities/epoch-reward.entity';
import { CampaignService } from '../../merkl/services/campaign.service';
import { DataResponseDto } from '../../merkl/dto/data-response.dto';
import { EncompassingJSON } from '../../merkl/dto/rewards-response.dto';
import { MerklRewardsQueryDto } from './rewards.dto';
import { MerklDataQueryDto } from './data.dto';
import { Deployment, DeploymentService, ExchangeId } from '../../deployment/deployment.service';
import { PairService } from '../../pair/pair.service';
import { TvlService } from '../../tvl/tvl.service';
import { TvlPairsDto } from '../analytics/tvl.pairs.dto';
import { CacheTTL } from '@nestjs/cache-manager';
import { TokenService } from '../../token/token.service';
import { HistoricQuoteService } from '../../historic-quote/historic-quote.service';

@Controller({ version: '1', path: ':exchangeId?/merkle' })
export class MerklController {
  constructor(
    @InjectRepository(Campaign) private campaignRepository: Repository<Campaign>,
    @InjectRepository(EpochReward) private epochRewardRepository: Repository<EpochReward>,
    private campaignService: CampaignService,
    private deploymentService: DeploymentService,
    private pairService: PairService,
    private tvlService: TvlService,
    private tokenService: TokenService,
    private historicQuoteService: HistoricQuoteService,
  ) {}

  /**
   * Converts a normalized reward amount to wei format
   * @param normalizedAmount - The normalized amount as a string (e.g., "2.024792857777485576")
   * @param decimals - Number of decimals for the token
   * @returns The wei amount as a string (e.g., "2024792857777485576")
   */
  private convertToWei(normalizedAmount: string, decimals: number): string {
    const decimal = new Decimal(normalizedAmount);
    const multiplier = new Decimal(10).pow(decimals);
    return decimal.mul(multiplier).toFixed(0);
  }

  @Get('data')
  @CacheTTL(1 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  @ApiExchangeIdParam()
  async getData(@Query() query: MerklDataQueryDto, @ExchangeIdParam() exchangeId: ExchangeId): Promise<any> {
    const deployment = await this.deploymentService.getDeploymentByExchangeId(exchangeId);
    const pairsDictionary = await this.pairService.allAsDictionary(deployment);

    let token0Checksum: string;
    let token1Checksum: string;

    try {
      token0Checksum = toChecksumAddress(query.pair.token0);
      token1Checksum = toChecksumAddress(query.pair.token1);
    } catch (error) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: `Invalid address format: ${query.pair.token0} or ${query.pair.token1}`,
      });
    }

    const pair = pairsDictionary[token0Checksum]?.[token1Checksum];

    if (!pair) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: `No pair found for tokens ${query.pair.token0} and ${query.pair.token1}`,
      });
    }

    // Get the latest campaign for the requested pair
    const campaign = await this.campaignRepository.findOne({
      where: {
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        pair: {
          token0: { address: pair.token0.address },
          token1: { address: pair.token1.address },
        },
      },
      relations: ['pair', 'pair.token0', 'pair.token1'],
      order: { endDate: 'DESC' },
    });

    if (!campaign) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: `No campaign found for pair ${query.pair.token0}_${query.pair.token1}`,
      });
    }

    return this.processSingleCampaign(campaign, deployment);
  }

  private async processSingleCampaign(campaign: Campaign, deployment: Deployment): Promise<DataResponseDto> {
    const currentTime = Math.floor(Date.now() / 1000);
    const campaignStartTime = Math.floor(campaign.startDate.getTime() / 1000);
    const campaignEndTime = Math.floor(campaign.endDate.getTime() / 1000);
    const token0Address = campaign.pair.token0.address;
    const token1Address = campaign.pair.token1.address;

    let tvl = new Decimal(0);
    // Get TVL data from the last 24 hours to find the most recent value
    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - 24 * 60 * 60;

    const pairsDictionary = await this.pairService.allAsDictionary(deployment);
    const tvlParams: TvlPairsDto = {
      pairs: [
        {
          token0: token0Address,
          token1: token1Address,
        },
      ],
      start: oneDayAgo,
      end: now,
      limit: 100,
    };

    const tvlData = await this.tvlService.getTvlByPair(deployment, tvlParams, pairsDictionary);
    const latestTvlUsd = tvlData.length > 0 ? tvlData[tvlData.length - 1].tvlUsd : 0;
    tvl = isNaN(latestTvlUsd) ? new Decimal(0) : new Decimal(latestTvlUsd);

    // Calculate APR
    const campaignDurationDays = (campaignEndTime - campaignStartTime) / (24 * 60 * 60);

    // Handle edge cases that could cause Infinity
    if (campaignDurationDays <= 0 || tvl.isZero()) {
      return {
        pair: `${token0Address.toLowerCase()}_${token1Address.toLowerCase()}`,
        tvl: tvl.toFixed(),
        apr: '0',
        opportunityName: campaign.opportunityName,
      };
    }

    // Get USD price of reward token from last 30 days
    let rewardTokenUsdPrice = new Decimal(0);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const nowIso = new Date().toISOString();

    const usdRates = await this.historicQuoteService.getUsdRates(
      deployment,
      [campaign.rewardTokenAddress],
      thirtyDaysAgo,
      nowIso,
    );

    // Filter for the reward token and get the most recent rate
    const rewardTokenRates = usdRates.filter(
      (rate) => rate.address.toLowerCase() === campaign.rewardTokenAddress.toLowerCase(),
    );

    if (rewardTokenRates.length > 0) {
      // Sort by day (timestamp) and take the most recent
      const mostRecentRate = rewardTokenRates.sort((a, b) => b.day - a.day)[0];
      rewardTokenUsdPrice = new Decimal(mostRecentRate.usd || 0);
    }

    // Convert reward amount to USD
    const rewardAmountUsd = new Decimal(campaign.rewardAmount).mul(rewardTokenUsdPrice);
    const rewardsPerDayUsd = rewardAmountUsd.div(campaignDurationDays);

    // Calculate APR using USD values for both numerator and denominator
    const aprDecimal = rewardsPerDayUsd.mul(365).div(tvl);

    const isActive = currentTime >= campaignStartTime && currentTime <= campaignEndTime && campaign.isActive;

    return {
      pair: `${token0Address.toLowerCase()}_${token1Address.toLowerCase()}`,
      tvl: tvl.toFixed(),
      apr: aprDecimal.toFixed(),
      opportunityName: campaign.opportunityName,
      // Add isActive as a comment in the response
      ...(isActive && { opportunityName: `${campaign.opportunityName || ''}` }),
    };
  }

  @Get('rewards')
  @CacheTTL(1 * 1000)
  @Header('Cache-Control', 'public, max-age=60')
  @ApiExchangeIdParam()
  async getRewards(@Query() query: MerklRewardsQueryDto, @ExchangeIdParam() exchangeId: ExchangeId): Promise<any> {
    const deployment: Deployment = await this.deploymentService.getDeploymentByExchangeId(exchangeId);
    // Get the first pair from the transformed array
    const pairData = Array.isArray(query.pair) ? query.pair[0] : query.pair;
    if (!pairData || !pairData.token0 || !pairData.token1) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid pair format. Expected: token0_token1',
      });
    }

    const token0Address = pairData.token0;
    const token1Address = pairData.token1;

    // Get pairs dictionary to find the correct pair with proper address format
    const pairsDictionary = await this.pairService.allAsDictionary(deployment);

    // Find the pair using case-insensitive lookup
    const pair = pairsDictionary[toChecksumAddress(token0Address)]?.[toChecksumAddress(token1Address)];

    if (!pair) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: `No pair found for tokens ${token0Address} and ${token1Address}`,
      });
    }

    // Find campaign for this pair
    const campaign = await this.campaignRepository.findOne({
      where: {
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        pair: { id: pair.id },
      },
      relations: ['pair', 'pair.token0', 'pair.token1'],
      order: { endDate: 'DESC' },
    });

    if (!campaign) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: `No active campaign found for pair ${token0Address}_${token1Address}`,
      });
    }

    // Get token information to determine decimals for wei conversion
    const tokensByAddress = await this.tokenService.allByAddress(deployment);
    let rewardToken;

    try {
      rewardToken = tokensByAddress[toChecksumAddress(campaign.rewardTokenAddress)];
    } catch (error) {
      // Handle invalid address format gracefully
      rewardToken = undefined;
    }

    // Default to 18 decimals if token not found (standard ERC-20)
    const tokenDecimals = rewardToken?.decimals ?? 18;

    // Get all epoch rewards for this campaign
    const epochRewards = await this.epochRewardRepository.find({
      where: { campaign: { id: campaign.id } },
      order: { epochNumber: 'ASC' },
    });

    // Filter rewards based on start timestamp if provided
    let filteredRewards = epochRewards;
    if (query.start) {
      const startTimestamp = parseInt(query.start, 10) * 1000; // Convert to milliseconds
      filteredRewards = epochRewards.filter((reward) => reward.epochEndTimestamp.getTime() >= startTimestamp);
    }

    // Transform to Merkl format with wei conversion
    const rewards: EncompassingJSON['rewards'] = {};

    for (const reward of filteredRewards) {
      if (!rewards[reward.owner]) {
        rewards[reward.owner] = {};
      }

      rewards[reward.owner][reward.reason] = {
        amount: this.convertToWei(reward.rewardAmount, tokenDecimals),
        timestamp: Math.floor(reward.epochEndTimestamp.getTime() / 1000).toString(),
      };
    }

    return {
      rewardToken: campaign.rewardTokenAddress,
      rewards,
    };
  }
}
