// coinmarketcap.dto.ts

import { IsNumber } from 'class-validator';
import { IsAddress } from '../isAddress.validator';
import { Type } from 'class-transformer';

export class HistoricQuoteDto {
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
}
