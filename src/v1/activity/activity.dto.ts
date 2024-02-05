import { IsOptional } from 'class-validator';
import { IsAddress } from '../../isAddress.validator';

export class ActivityDto {
  @IsOptional()
  strategyId: string;

  @IsAddress()
  @IsOptional()
  ownerId: string;
}
