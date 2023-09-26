import { IsString } from 'class-validator';
import { IsAddress } from '../../isAddress.validator';

export class MarketRateDto {
  @IsAddress()
  address: string;

  // eslint-disable-next-line @typescript-eslint/no-inferrable-types
  @IsString()
  convert: string = 'usd';
}
