// coinmarketcap.dto.ts

import { IsNumber, IsNumberString } from 'class-validator';
import { IsAddress } from '../../isAddress.validator';
import { Transform, Type } from 'class-transformer';

export class SimulatorDto {
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
  sellBudget: string;

  @IsNumberString()
  buyBudget: string;

  @IsNumberString()
  sellMax: string;

  @IsNumberString()
  sellMin: string;

  @IsNumberString()
  buyMax: string;

  @IsNumberString()
  buyMin: string;

  @Transform(({ value }) => (value !== undefined ? value : undefined))
  buyMarginal?: string;

  @Transform(({ value }) => (value !== undefined ? value : undefined))
  sellMarginal?: string;
}
