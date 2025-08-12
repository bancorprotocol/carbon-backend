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
    // Return all campaigns that are marked as active, regardless of timestamps
    // This enables historic campaign reprocessing when manually set to active
    return await this.campaignRepository.find({
      where: {
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        isActive: true,
      },
      relations: ['pair', 'pair.token0', 'pair.token1'],
      order: {
        id: 'ASC', // Ensure deterministic ordering
      },
    });
  }

  async getCampaignByPair(deployment: Deployment, pairName: string): Promise<Campaign | null> {
    // Return campaign that is marked as active, regardless of timestamps
    // Lifecycle management is handled elsewhere for consistency
    return await this.campaignRepository.findOne({
      where: {
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        pair: { name: pairName },
        isActive: true,
      },
      relations: ['pair', 'pair.token0', 'pair.token1'],
    });
  }

  async updateCampaignStatus(id: number, isActive: boolean): Promise<Campaign> {
    await this.campaignRepository.update(id, { isActive });
    return this.campaignRepository.findOne({ where: { id }, relations: ['pair'] });
  }

  async markProcessedCampaignsInactive(
    deployment: Deployment,
    campaigns: Campaign[],
    processedUpToTimestamp: number,
  ): Promise<void> {
    // Only mark campaigns inactive if we've processed past their end time
    const expiredCampaigns = campaigns.filter((campaign) => {
      const campaignEndTimestamp = campaign.endDate.getTime();
      return processedUpToTimestamp >= campaignEndTimestamp;
    });

    if (expiredCampaigns.length > 0) {
      await this.campaignRepository.update(
        expiredCampaigns.map((c) => c.id),
        { isActive: false },
      );

      this.logger.log(
        `Post-processing: Set ${expiredCampaigns.length} campaigns to inactive after processing up to timestamp ${processedUpToTimestamp}`,
      );
    }
  }
}
