import { IsOptional, IsNumberString } from 'class-validator';

export class HistoricalTradesDto {
  @IsOptional()
  @IsNumberString()
  limit?: number;
}
