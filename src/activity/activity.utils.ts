import { OrderData, ProcessedOrders } from './activity.types';
import { Decimal } from 'decimal.js';

export function parseOrder(orderJson: string): OrderData {
  const order = JSON.parse(orderJson);
  return {
    y: new Decimal(order.y || 0),
    z: new Decimal(order.z || 0),
    A: new Decimal(order.A || 0),
    B: new Decimal(order.B || 0),
  };
}

export function processOrders(
  order0: OrderData,
  order1: OrderData,
  decimals0: Decimal,
  decimals1: Decimal,
): ProcessedOrders {
  // Constants
  const two48 = new Decimal(2).pow(48);
  const denominator0 = new Decimal(10).pow(decimals0);
  const denominator1 = new Decimal(10).pow(decimals1);

  // Normalize y and z values
  const liquidity0 = order0.y.div(denominator0);
  const capacity0 = order0.z.div(denominator0);
  const liquidity1 = order1.y.div(denominator1);
  const capacity1 = order1.z.div(denominator1);

  // For order0: compute B0_real and A0_real (like the SQL expressions using modulo and exponent)
  const B0_remainder = order0.B.mod(two48);
  const B0_exponent = order0.B.div(two48).floor();
  const B0_real = B0_remainder.mul(new Decimal(2).pow(B0_exponent));

  const A0_remainder = order0.A.mod(two48);
  const A0_exponent = order0.A.div(two48).floor();
  const A0_real = A0_remainder.mul(new Decimal(2).pow(A0_exponent));

  // For order1: compute B1_real and A1_real
  const B1_remainder = order1.B.mod(two48);
  const B1_exponent = order1.B.div(two48).floor();
  const B1_real = B1_remainder.mul(new Decimal(2).pow(B1_exponent));

  const A1_remainder = order1.A.mod(two48);
  const A1_exponent = order1.A.div(two48).floor();
  const A1_real = A1_remainder.mul(new Decimal(2).pow(A1_exponent));

  // Multipliers to adjust for the difference in decimals between tokens
  const multiplierSell = new Decimal(10).pow(decimals1.sub(decimals0));
  const multiplierBuy = new Decimal(10).pow(decimals0.sub(decimals1));

  // --- For the sell side (order0 values) ---
  // Compute lowest, marginal, and highest rates for token0 side.
  const lowestRate0 = new Decimal(B0_real.div(two48)).pow(2).mul(multiplierSell);
  const highestRate0 = new Decimal(B0_real.plus(A0_real).div(two48)).pow(2).mul(multiplierSell);
  const baseMarg0 = liquidity0.equals(capacity0)
    ? B0_real.plus(A0_real)
    : B0_real.plus(A0_real.mul(liquidity0).div(capacity0));
  const marginalRate0 = new Decimal(baseMarg0.div(two48)).pow(2).mul(multiplierSell);

  // --- For the buy side (order1 values) ---
  const lowestRate1 = new Decimal(B1_real.div(two48)).pow(2).mul(multiplierBuy);
  const highestRate1 = new Decimal(B1_real.plus(A1_real).div(two48)).pow(2).mul(multiplierBuy);
  const baseMarg1 = liquidity1.equals(capacity1)
    ? B1_real.plus(A1_real)
    : B1_real.plus(A1_real.mul(liquidity1).div(capacity1));
  const marginalRate1 = new Decimal(baseMarg1.div(two48)).pow(2).mul(multiplierBuy);

  // --- Final Price Calculations ---
  // On the sell side, the SQL inverts the computed raw values:
  const sellPriceA = highestRate0.isZero() ? new Decimal(0) : new Decimal(1).div(highestRate0);
  const sellPriceMarg = marginalRate0.isZero() ? new Decimal(0) : new Decimal(1).div(marginalRate0);
  const sellPriceB = lowestRate0.isZero() ? new Decimal(0) : new Decimal(1).div(lowestRate0);

  // On the buy side, the values are used directly:
  const buyPriceA = lowestRate1;
  const buyPriceMarg = marginalRate1;
  const buyPriceB = highestRate1;

  return {
    y0: order0.y.toString(),
    z0: order0.z.toString(),
    y1: order1.y.toString(),
    z1: order1.z.toString(),
    liquidity0,
    capacity0,
    liquidity1,
    capacity1,
    sellPriceA,
    sellPriceMarg,
    sellPriceB,
    buyPriceA,
    buyPriceMarg,
    buyPriceB,
  };
}
