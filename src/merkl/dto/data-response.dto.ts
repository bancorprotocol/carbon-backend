export class DataResponseDto {
  pair: string; // token0_token1 format
  tvl: string; // USD value
  apr: string; // decimal format (0.5 = 50%)
  opportunityName?: string;
}

export type DataJSON = DataResponseDto[];
