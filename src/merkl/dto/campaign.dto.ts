import { IsNotEmpty, IsNumber, IsString, IsBoolean, IsOptional, IsDateString } from 'class-validator';
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

  @IsDateString()
  startDate: Date;

  @IsDateString()
  endDate: Date;

  @IsString()
  opportunityName: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
