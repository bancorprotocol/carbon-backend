import { Token } from '../token/token.entity';
import { Decimal } from 'decimal.js';

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
  y: Decimal;
  z: Decimal;
  A: Decimal;
  B: Decimal;
}

export interface ProcessedOrder {
  y: string;
  z: string;
  A: string;
  B: string;
  yNormalized: Decimal;
  zNormalized: Decimal;
  buyPriceA: Decimal;
  buyPriceMarg: Decimal;
  buyPriceB: Decimal;
  sellPriceA: Decimal;
  sellPriceMarg: Decimal;
  sellPriceB: Decimal;
}
