// coinmarketcap.dto.ts

import { IsNumber, IsOptional, Min, Max } from 'class-validator';
import { IsAddress } from '../../isAddress.validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

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

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  @ApiPropertyOptional({
    type: Number,
    description: 'Offset for pagination',
  })
  offset?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  @Min(0)
  @Max(10000)
  @ApiPropertyOptional({
    type: Number,
    description: 'Limit for pagination',
    default: 10000,
  })
  limit?: number;
}
