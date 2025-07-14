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
    return this.campaignRepository.find({
      where: {
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        isActive: true,
      },
      relations: ['pair', 'pair.token0', 'pair.token1'],
    });
  }

  async getCampaignByPair(deployment: Deployment, pairName: string): Promise<Campaign | null> {
    const currentTime = Math.floor(Date.now() / 1000);

    return this.campaignRepository.findOne({
      where: {
        blockchainType: deployment.blockchainType,
        exchangeId: deployment.exchangeId,
        pair: { name: pairName },
        isActive: true,
      },
      relations: ['pair', 'pair.token0', 'pair.token1'],
    });
  }

  async updateCampaignStatus(id: string, isActive: boolean): Promise<Campaign> {
    await this.campaignRepository.update(id, { isActive });
    return this.campaignRepository.findOne({ where: { id }, relations: ['pair'] });
  }
}
