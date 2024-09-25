import { IsOptional, IsNumber, Min, Max, IsString, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { formatEthereumAddress, IsAddress } from '../../isAddress.validator';

export class VolumeTokensDto {
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
  @Transform(({ value }) => value.split(',').map((addr: string) => addr.trim()))
  @IsAddress() // Updated to support array validation
  @IsString({ each: true })
  @ApiProperty({
    type: String,
    description: 'Array of addresses or comma-separated list of addresses to filter TVL',
  })
  addresses: string[]; // Updated to be an array of strings
}
