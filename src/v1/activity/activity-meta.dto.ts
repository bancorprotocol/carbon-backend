import { IsOptional, IsString, IsNumber } from 'class-validator';
import { formatEthereumAddress } from '../../isAddress.validator';
import { Transform } from 'class-transformer';

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
  @IsString()
  actions?: string;

  @IsOptional()
  @IsString()
  pairs?: string;
}
