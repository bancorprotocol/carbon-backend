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

export interface ProcessedOrders {
  y0: string;
  z0: string;
  y1: string;
  z1: string;
  liquidity0: Decimal;
  capacity0: Decimal;
  liquidity1: Decimal;
  capacity1: Decimal;
  sellPriceA: Decimal;
  sellPriceMarg: Decimal;
  sellPriceB: Decimal;
  buyPriceA: Decimal;
  buyPriceMarg: Decimal;
  buyPriceB: Decimal;
}

export type StrategyStatesMap = Map<string, StrategyState>;
