import { Controller, Get, Query, Param } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Decimal } from 'decimal.js';
import { ExchangeIdParam } from '../../exchange-id-param.decorator';
import { Campaign } from '../../merkl/entities/campaign.entity';
import { EpochReward } from '../../merkl/entities/epoch-reward.entity';
import { CampaignService } from '../../merkl/services/campaign.service';
import { DataJSON } from '../../merkl/dto/data-response.dto';
import { EncompassingJSON } from '../../merkl/dto/rewards-response.dto';
import { Deployment, DeploymentService } from '../../deployment/deployment.service';

@Controller('merkl')
export class MerklController {
  constructor(
    @InjectRepository(Campaign) private campaignRepository: Repository<Campaign>,
    @InjectRepository(EpochReward) private epochRewardRepository: Repository<EpochReward>,
    private campaignService: CampaignService,
    private deploymentService: DeploymentService,
  ) {}

  @Get('data')
  async getData(@ExchangeIdParam() deployment: Deployment): Promise<DataJSON> {
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

      // Calculate TVL for this pair (placeholder - you'd use actual TVL calculation)
      const tvl = await this.calculatePairTVL(campaign, deployment);

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
  async getRewards(@Query('pair') pair: string, @ExchangeIdParam() deployment: Deployment): Promise<EncompassingJSON> {
    if (!pair) {
      throw new Error('Pair parameter is required');
    }

    // Parse pair format token0_token1
    const [token0Address, token1Address] = pair.split('_');
    if (!token0Address || !token1Address) {
      throw new Error('Invalid pair format. Expected: token0_token1');
    }

    // Find campaign for this pair
    const campaign = await this.campaignRepository.findOne({
      where: {
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        pair: {
          token0: { address: token0Address },
          token1: { address: token1Address },
        },
        isActive: true,
      },
      relations: ['pair', 'pair.token0', 'pair.token1'],
    });

    if (!campaign) {
      throw new Error(`No active campaign found for pair ${pair}`);
    }

    // Get all epoch rewards for this campaign
    const epochRewards = await this.epochRewardRepository.find({
      where: { campaign: { id: campaign.id } },
      order: { epochNumber: 'ASC' },
    });

    // Transform to Merkl format
    const rewards: EncompassingJSON['rewards'] = {};

    for (const reward of epochRewards) {
      if (!rewards[reward.owner]) {
        rewards[reward.owner] = {};
      }

      rewards[reward.owner][reward.reason] = {
        amount: reward.rewardAmount,
        timestamp: Math.floor(reward.epochEndTimestamp.getTime() / 1000).toString(),
      };
    }

    return {
      rewardToken: campaign.rewardTokenAddress,
      rewards,
    };
  }

  private async calculatePairTVL(campaign: Campaign, deployment: Deployment): Promise<Decimal> {
    // TODO: Implement actual TVL calculation using TVL service
    // For now, return placeholder
    return new Decimal(1000000);
  }
}
