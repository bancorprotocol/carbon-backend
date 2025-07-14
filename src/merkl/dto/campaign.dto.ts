import { IsNotEmpty, IsNumber, IsString, IsBoolean, IsOptional } from 'class-validator';
import { BlockchainType, ExchangeId } from '../../deployment/deployment.service';

export class CreateCampaignDto {
  @IsNotEmpty()
  blockchainType: BlockchainType;

  @IsNotEmpty()
  exchangeId: ExchangeId;

  @IsNumber()
  pairId: number;

  @IsString()
  rewardAmount: string;

  @IsString()
  rewardTokenAddress: string;

  @IsNumber()
  startDate: number;

  @IsNumber()
  endDate: number;

  @IsString()
  opportunityName: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
