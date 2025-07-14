import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Campaign } from '../entities/campaign.entity';
import { CreateCampaignDto } from '../dto/campaign.dto';
import { Deployment } from '../../deployment/deployment.service';

@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name);

  constructor(
    @InjectRepository(Campaign)
    private campaignRepository: Repository<Campaign>,
  ) {}

  async createCampaign(createCampaignDto: CreateCampaignDto): Promise<Campaign> {
    // Validate no overlapping campaigns for the same pair
    const existingCampaign = await this.campaignRepository.findOne({
      where: {
        blockchainType: createCampaignDto.blockchainType,
        exchangeId: createCampaignDto.exchangeId,
        pairId: createCampaignDto.pairId,
        isActive: true,
      },
    });

    if (existingCampaign) {
      // Check for time overlap (convert to Date objects for comparison)
      const newStartDate = new Date(createCampaignDto.startDate);
      const newEndDate = new Date(createCampaignDto.endDate);

      const hasOverlap = !(newEndDate <= existingCampaign.startDate || newStartDate >= existingCampaign.endDate);

      if (hasOverlap) {
        throw new Error(`Active campaign already exists for this pair with overlapping time period`);
      }
    }

    const campaign = this.campaignRepository.create(createCampaignDto);
    return this.campaignRepository.save(campaign);
  }

  async getActiveCampaigns(deployment: Deployment): Promise<Campaign[]> {
    const currentTime = new Date();

    // First, get all campaigns that are marked as active
    const activeCampaigns = await this.campaignRepository.find({
      where: {
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        isActive: true,
      },
      relations: ['pair', 'pair.token0', 'pair.token1'],
    });

    // Check for campaigns that have passed their endDate and set them to inactive
    const expiredCampaigns = activeCampaigns.filter((campaign) => campaign.endDate < currentTime);

    if (expiredCampaigns.length > 0) {
      // Set expired campaigns to inactive
      await this.campaignRepository.update(
        expiredCampaigns.map((c) => c.id),
        { isActive: false },
      );

      this.logger.log(`Set ${expiredCampaigns.length} expired campaigns to inactive`);
    }

    // Return only campaigns that are still within their active period
    return activeCampaigns.filter((campaign) => campaign.endDate >= currentTime && campaign.startDate <= currentTime);
  }

  async getCampaignByPair(deployment: Deployment, pairName: string): Promise<Campaign | null> {
    const currentTime = new Date();

    // First, get the campaign that is marked as active
    const campaign = await this.campaignRepository.findOne({
      where: {
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        pair: { name: pairName },
        isActive: true,
      },
      relations: ['pair', 'pair.token0', 'pair.token1'],
    });

    if (!campaign) {
      return null;
    }

    // Check if campaign has expired and set it to inactive if needed
    if (campaign.endDate < currentTime) {
      await this.campaignRepository.update(campaign.id, { isActive: false });
      this.logger.log(`Set expired campaign ${campaign.id} to inactive`);
      return null;
    }

    // Check if campaign has started
    if (campaign.startDate > currentTime) {
      return null; // Campaign hasn't started yet
    }

    return campaign;
  }

  async updateCampaignStatus(id: string, isActive: boolean): Promise<Campaign> {
    await this.campaignRepository.update(id, { isActive });
    return this.campaignRepository.findOne({ where: { id }, relations: ['pair'] });
  }
}
