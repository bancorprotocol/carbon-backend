import { IsOptional, IsNumber, IsEnum, Min, Max, IsString, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { GroupBy } from '../../tvl/tvl.service';
import { IsAddress } from '../../isAddress.validator';

export class TvlTokensDto {
  @IsOptional()
  @IsEnum(GroupBy)
  groupBy?: GroupBy;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  @ApiPropertyOptional({
    type: Number,
    description: 'Start timestamp in seconds',
  })
  start?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  @ApiPropertyOptional({
    type: Number,
    description: 'End timestamp in seconds',
  })
  end?: number;

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

  @IsArray()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').map((addr: string) => addr.trim()) : value))
  @IsString({ each: true })
  @IsAddress({ each: true }) // Updated to support array validation
  @ApiProperty({
    type: String,
    description: 'Array of addresses or comma-separated list of addresses to filter TVL',
  })
  addresses: string[]; // Updated to be an array of strings
}
