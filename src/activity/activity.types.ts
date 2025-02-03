import { Token } from '../token/token.entity';

export interface StrategyState {
  currentOwner: string;
  creationWallet: string;
  order0: string;
  order1: string;
  token0: Token;
  token1: Token;
  lastProcessedBlock?: number;
}

export interface OrderData {
  y: number;
  z: number;
  A: bigint;
  B: bigint;
}

export interface ProcessedOrder {
  y: number;
  z: number;
  A: number;
  B: number;
  yNormalized: number;
  zNormalized: number;
  priceA: number;
  priceMarg: number;
  priceB: number;
}
