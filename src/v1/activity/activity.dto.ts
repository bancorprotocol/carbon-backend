import { IsOptional, IsNumber, IsString, IsIn } from 'class-validator';
import { formatEthereumAddress } from '../../isAddress.validator';
import { Transform } from 'class-transformer';

export class ActivityDto {
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
  @IsIn(['sell', 'buy', 'create', 'deposit', 'withdraw', 'transfer', 'edit', 'delete', 'pause'])
  actions?: string;

  @IsOptional()
  @IsString()
  pairs?: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  limit?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  offset?: number;
}
