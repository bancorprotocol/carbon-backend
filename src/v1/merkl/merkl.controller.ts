import { Controller, Get, Query, Header, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Decimal } from 'decimal.js';
import { toChecksumAddress } from 'web3-utils';
import { ApiExchangeIdParam, ExchangeIdParam } from '../../exchange-id-param.decorator';
import { Campaign } from '../../merkl/entities/campaign.entity';
import { EpochReward } from '../../merkl/entities/epoch-reward.entity';
import { CampaignService } from '../../merkl/services/campaign.service';
import { DataJSON } from '../../merkl/dto/data-response.dto';
import { EncompassingJSON } from '../../merkl/dto/rewards-response.dto';
import { MerklRewardsQueryDto } from './rewards.dto';
import { Deployment, DeploymentService, ExchangeId } from '../../deployment/deployment.service';
import { PairService } from '../../pair/pair.service';
import { TvlService } from '../../tvl/tvl.service';
import { TvlPairsDto } from '../analytics/tvl.pairs.dto';
import { CacheTTL } from '@nestjs/cache-manager';
import { TokenService } from '../../token/token.service';

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
  async getData(@ExchangeIdParam() exchangeId: ExchangeId): Promise<any> {
    const deployment = await this.deploymentService.getDeploymentByExchangeId(exchangeId);
    const campaigns = await this.campaignService.getActiveCampaigns(deployment);
    const currentTime = Math.floor(Date.now() / 1000);

    const data: DataJSON = [];

    for (const campaign of campaigns) {
      // Convert Date objects to Unix timestamps (seconds) for comparison
      const campaignStartTime = Math.floor(campaign.startDate.getTime() / 1000);
      const campaignEndTime = Math.floor(campaign.endDate.getTime() / 1000);

      // Check if campaign is currently active
      const isCurrentlyActive = currentTime >= campaignStartTime && currentTime <= campaignEndTime && campaign.isActive;

      if (!isCurrentlyActive) continue;

      // Get TVL for this pair using the TVL service with recent time range
      const pairsDictionary = await this.pairService.allAsDictionary(deployment);

      // Check if the pair exists in the dictionary first
      const token0Address = campaign.pair.token0.address;
      const token1Address = campaign.pair.token1.address;
      const pairExists = pairsDictionary[token0Address] && pairsDictionary[token0Address][token1Address];

      let tvl = new Decimal(0);
      if (pairExists) {
        // Get TVL data from the last 24 hours to find the most recent value
        const now = Math.floor(Date.now() / 1000);
        const oneDayAgo = now - 24 * 60 * 60;

        const tvlParams: TvlPairsDto = {
          pairs: [
            {
              token0: token0Address,
              token1: token1Address,
            },
          ],
          start: oneDayAgo,
          end: now,
          limit: 100, // Get more entries to find the most recent
        };

        const tvlData = await this.tvlService.getTvlByPair(deployment, tvlParams, pairsDictionary);
        // Take the most recent entry (data is sorted by timestamp ascending)
        tvl = tvlData.length > 0 ? new Decimal(tvlData[tvlData.length - 1].tvlUsd) : new Decimal(0);
      }

      // Calculate APR: (daily rewards * 365) / TVL
      const campaignDurationDays = (campaignEndTime - campaignStartTime) / (24 * 60 * 60);
      const rewardsPerDay = new Decimal(campaign.rewardAmount).div(campaignDurationDays);
      const aprDecimal = rewardsPerDay.mul(365).div(tvl);

      data.push({
        pair: `${campaign.pair.token0.address.toLowerCase()}_${campaign.pair.token1.address.toLowerCase()}`,
        tvl: tvl.toFixed(),
        apr: aprDecimal.toFixed(),
        opportunityName: campaign.opportunityName,
      });
    }

    return data;
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
    const pair = pairsDictionary[token0Address]?.[token1Address];

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
        isActive: true,
      },
      relations: ['pair', 'pair.token0', 'pair.token1'],
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

    // for (const reward of filteredRewards) {
    //   if (!rewards[reward.owner]) {
    //     rewards[reward.owner] = {};
    //   }

    //   rewards[reward.owner][reward.reason] = {
    //     amount: this.convertToWei(reward.rewardAmount, tokenDecimals),
    //     timestamp: Math.floor(reward.epochEndTimestamp.getTime() / 1000).toString(),
    //   };
    // }

    return {
      rewardToken: campaign.rewardTokenAddress,
      rewards,
    };
  }
}
