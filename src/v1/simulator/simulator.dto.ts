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
  startingPortfolioValue: number;

  @IsNumberString()
  highRangeHighPriceCash: number;

  @IsNumberString()
  highRangeLowPriceCash: number;

  @IsNumberString()
  lowRangeHighPriceCash: number;

  @IsNumberString()
  lowRangeLowPriceCash: number;

  @IsNumberString()
  startRateHighRange: number;

  @IsNumberString()
  startRateLowRange: number;

  @IsNumberString()
  cashProportion: number;

  @IsNumberString()
  riskProportion: number;

  @IsNumberString()
  networkFee: number;
}
