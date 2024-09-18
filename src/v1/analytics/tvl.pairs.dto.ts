import { IsOptional, IsNumber, Min, Max, IsString, IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { formatEthereumAddress, IsAddress } from '../../isAddress.validator';
import { isAddress } from 'ethers/lib/utils';

class TokenPair {
  @IsAddress()
  @IsString()
  token0: string;

  @IsAddress()
  @IsString()
  token1: string;
}

export class TvlPairsDto {
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
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TokenPair)
  @Transform(({ value }) => {
    // Transform the comma-separated pairs into an array of TokenPair objects
    if (typeof value === 'string') {
      return value.split(',').map((pair: string) => {
        const [token0, token1] = pair.split('_').map((addr: string, index: number) => {
          const key = index === 0 ? 'token0' : 'token1';

          // Format the address using the utility function
          return formatEthereumAddress({ value: addr.trim(), key });
        });

        return { token0, token1 };
      });
    }
    return value;
  })
  @ApiProperty({
    type: [String],
    description: 'Comma-separated list of token pairs in the format address1_address2',
  })
  pairs: TokenPair[]; // Each entry will be an object with token0 and token1
}
