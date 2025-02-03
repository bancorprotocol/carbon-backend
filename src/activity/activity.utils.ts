import { OrderData, ProcessedOrder } from './activity.types';
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

export function processOrder(order: OrderData, decimals: Decimal): ProcessedOrder {
  // Constants
  const two48 = new Decimal(2).pow(48);
  const denominator = new Decimal(10).pow(decimals);

  // Normalize y and z values
  const yNormalized = order.y.div(denominator);
  const zNormalized = order.z.div(denominator);

  // Calculate B_real and A_real using pure Decimal operations
  const B_remainder = order.B.mod(two48);
  const B_exponent = order.B.div(two48).floor();
  const A_remainder = order.A.mod(two48);
  const A_exponent = order.A.div(two48).floor();

  const B_real = B_remainder.mul(Decimal.pow(2, B_exponent));
  const A_real = A_remainder.mul(Decimal.pow(2, A_exponent));

  // Calculate base prices
  const baseA = B_real.div(two48).pow(2);
  const baseMarg = yNormalized.eq(zNormalized)
    ? B_real.plus(A_real).div(two48).pow(2)
    : B_real.plus(A_real.mul(yNormalized).div(zNormalized)).div(two48).pow(2);
  const baseB = B_real.plus(A_real).div(two48).pow(2);

  // Calculate inverse prices (with safety checks)
  // For sell prices (lowest rate), use POW(10, decimals1 - decimals0)
  const sellPriceA = baseB.isZero() ? new Decimal(0) : new Decimal(1).div(baseB);
  const sellPriceMarg = baseMarg.isZero() ? new Decimal(0) : new Decimal(1).div(baseMarg);
  const sellPriceB = baseA.isZero() ? new Decimal(0) : new Decimal(1).div(baseA);

  // For buy prices (highest rate), use POW(10, decimals0 - decimals1)
  const buyPriceA = baseA;
  const buyPriceMarg = baseMarg;
  const buyPriceB = baseB;

  return {
    y: order.y.toString(),
    z: order.z.toString(),
    A: order.A.toString(),
    B: order.B.toString(),
    yNormalized,
    zNormalized,
    buyPriceA,
    buyPriceMarg,
    buyPriceB,
    sellPriceA,
    sellPriceMarg,
    sellPriceB,
  };
}
