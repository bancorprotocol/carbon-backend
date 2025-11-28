import { IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class StrategiesQueryDto {
  @ApiProperty({
    description: 'Page number for pagination (0-indexed)',
    required: false,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  page?: number = 0;

  @ApiProperty({
    description: 'Number of strategies per page (0 = no pagination, return all)',
    required: false,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pageSize?: number = 0;
}

export interface Order {
  budget: string;
  min: string;
  max: string;
  marginal: string;
}

export interface Strategy {
  id: string;
  owner: string;
  base: string;
  quote: string;
  buy: Order;
  sell: Order;
}

export interface StrategiesResponse {
  strategies: Strategy[];
  pagination?: {
    page: number;
    pageSize: number;
    totalStrategies: number;
    totalPages: number;
    hasMore: boolean;
  };
}

