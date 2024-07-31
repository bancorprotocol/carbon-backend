import { IsOptional, IsString, IsNumber, IsArray, ArrayNotEmpty, IsIn } from 'class-validator';
import { formatEthereumAddress } from '../../isAddress.validator';
import { Transform } from 'class-transformer';
import { validActions } from './activity.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ActivityMetaDto {
  @IsOptional()
  strategyIds?: string;

  @IsOptional()
  @Transform((value) => formatEthereumAddress(value))
  ownerId?: string;

  @IsOptional()
  @Transform((value) => formatEthereumAddress(value))
  token0?: string;

  @IsOptional()
  @Transform((value) => formatEthereumAddress(value))
  token1?: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  start?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  end?: number;

  @IsOptional()
  @Transform(
    ({ value }) => {
      if (typeof value === 'string') {
        return value.split(',').map((action: string) => action.trim());
      }
      return value;
    },
    { toClassOnly: true },
  )
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(validActions, { each: true })
  @ApiPropertyOptional({
    type: [String],
    description: 'List of comma-separated actions',
  })
  actions?: string[];

  @IsOptional()
  @IsString()
  pairs?: string;
}
