import { Type } from 'class-transformer';
import { IsOptional, IsIn, IsNumber } from 'class-validator';
import { isTickerId } from './ticker_id.validator';

export class HistoricalTradesDto {
  @IsOptional()
  @isTickerId()
  ticker_id?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  start_time?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  end_time?: number;

  // eslint-disable-next-line @typescript-eslint/no-inferrable-types
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit: number = 10000; // Default value is set to 10000

  @IsOptional()
  @IsIn(['buy', 'sell'])
  type?: string;
}
