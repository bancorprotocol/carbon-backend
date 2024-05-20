import { IsAddress } from '../../isAddress.validator';

export class AssetDto {
  @IsAddress()
  id: string;
}
