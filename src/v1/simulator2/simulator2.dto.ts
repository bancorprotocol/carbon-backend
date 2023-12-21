// coinmarketcap.dto.ts

import { IsNumber, IsNumberString } from 'class-validator';
import { IsAddress } from '../../isAddress.validator';
import { Type } from 'class-transformer';

export class Simulator2Dto {
  @IsAddress()
  baseToken: string;

  @IsAddress()
  quoteToken: string;

  @IsNumber()
  @Type(() => Number)
  start: number;

  @IsNumber()
  @Type(() => Number)
  end: number;

  @IsNumberString()
  baseBudget: number;

  @IsNumberString()
  quoteBudget: number;

  @IsNumberString()
  sellMax: number;

  @IsNumberString()
  sellMin: number;

  @IsNumberString()
  buyMax: number;

  @IsNumberString()
  buyMin: number;
}
