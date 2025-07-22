import { IsString, ValidateNested, IsOptional } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsAddress, formatEthereumAddress } from '../../isAddress.validator';

export class TokenPair {
  @IsAddress()
  @IsString()
  token0: string;

  @IsAddress()
  @IsString()
  token1: string;
}

export class MerklDataQueryDto {
  @ValidateNested()
  @Type(() => TokenPair)
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (typeof value === 'string') {
      const [token0, token1] = value.split('_').map((addr: string, index: number) => {
        const key = index === 0 ? 'token0' : 'token1';
        return formatEthereumAddress({ value: addr.trim(), key });
      });
      return { token0, token1 };
    }
    return value;
  })
  @ApiProperty({
    type: String,
    description: 'Optional token pair in the format address1_address2',
    required: false,
    example: '0x1234...5678_0x8765...4321',
  })
  @IsOptional()
  pair?: TokenPair;
}
