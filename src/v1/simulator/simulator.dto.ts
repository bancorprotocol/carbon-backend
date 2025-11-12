// coinmarketcap.dto.ts

import { IsNumber } from 'class-validator';
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

  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  sellBudget: number;

  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  buyBudget: number;

  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  sellMax: number;

  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  sellMin: number;

  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  buyMax: number;

  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  buyMin: number;
}
