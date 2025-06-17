import { IsAddress } from '../../isAddress.validator';

export class AssetQueryDto {
  @IsAddress()
  id: string;
}

export interface AssetResponse {
  asset: Asset;
}

export interface Asset {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply?: string | number;
  circulatingSupply?: string | number;
  coinGeckoId?: string;
  metadata?: Record<string, string>;
}
