import { IsAddress } from '../isAddress.validator';

export class IndexDto {
  @IsAddress()
  token0: string;

  @IsAddress()
  token1: string;
}
