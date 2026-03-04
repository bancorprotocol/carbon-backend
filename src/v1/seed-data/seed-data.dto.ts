import { IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class SeedDataQueryDto {
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

export interface EncodedOrder {
  y: string;
  z: string;
  A: string;
  B: string;
}

export interface GradientEncodedOrder {
  liquidity: string;
  initialPrice: string;
  tradingStartTime: number;
  expiry: number;
  multiFactor: string;
  gradientType: string;
}

export interface RegularEncodedStrategy {
  type: 'regular';
  id: string;
  owner: string;
  token0: string;
  token1: string;
  order0: EncodedOrder;
  order1: EncodedOrder;
}

export interface GradientEncodedStrategy {
  type: 'gradient';
  id: string;
  owner: string;
  token0: string;
  token1: string;
  order0: GradientEncodedOrder;
  order1: GradientEncodedOrder;
}

export type EncodedStrategy = RegularEncodedStrategy | GradientEncodedStrategy;

export interface SeedDataResponse {
  schemeVersion: number;
  latestBlockNumber: number;
  strategiesByPair: {
    [pairKey: string]: EncodedStrategy[];
  };
  tradingFeePPMByPair: {
    [pairKey: string]: number;
  };
  pagination?: {
    page: number;
    pageSize: number;
    totalStrategies: number;
    totalPages: number;
    hasMore: boolean;
  };
}
