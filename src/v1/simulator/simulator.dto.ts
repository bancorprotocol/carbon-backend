// coinmarketcap.dto.ts

import { IsNumber, IsNumberString } from 'class-validator';
import { IsAddress } from '../../isAddress.validator';
import { Type } from 'class-transformer';

export class SimulatorDto {
  @IsAddress()
  token0: string;

  @IsAddress()
  token1: string;

  @IsNumber()
  @Type(() => Number)
  start: number;

  @IsNumber()
  @Type(() => Number)
  end: number;

  @IsNumberString()
  portfolioCashValue: number;

  @IsNumberString()
  portfolioRiskValue: number;

  @IsNumberString()
  lowRangeLowPrice: number;

  @IsNumberString()
  lowRangeHighPrice: number;

  @IsNumberString()
  lowRangeStartPrice: number;

  @IsNumberString()
  highRangeLowPrice: number;

  @IsNumberString()
  highRangeHighPrice: number;

  @IsNumberString()
  highRangeStartPrice: number;

  @IsNumberString()
  networkFee: number;
}
