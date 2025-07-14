import {
  IsString,
  IsNotEmpty,
  ValidateNested,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsNumberString,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { formatEthereumAddress, IsAddress } from '../../isAddress.validator';

class TokenPair {
  @IsAddress()
  @IsString()
  token0: string;

  @IsAddress()
  @IsString()
  token1: string;
}

export class MerklRewardsQueryDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TokenPair)
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map((pair: string) => {
        const [token0, token1] = pair.split('_').map((addr: string, index: number) => {
          const key = index === 0 ? 'token0' : 'token1';
          return formatEthereumAddress({ value: addr.trim(), key });
        });
        return { token0, token1 };
      });
    }
    return value;
  })
  @ApiProperty({
    type: String, // Display as a string in Swagger
    description: 'Comma-separated list of token pairs in the format address1_address2, address3_address4',
  })
  pair: TokenPair[];

  @IsOptional()
  @IsNumberString()
  @ApiProperty({
    type: String,
    description:
      'Unix timestamp to indicate the start of the data fetch. Only rewards from this timestamp onwards will be included.',
    required: false,
  })
  start?: string;
}
