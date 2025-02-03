import { OrderData, ProcessedOrder } from './activity.types';

export function parseOrder(orderJson: string): OrderData {
  const order = JSON.parse(orderJson);
  return {
    y: Number(order.y || 0),
    z: Number(order.z || 0),
    A: BigInt(order.A || 0),
    B: BigInt(order.B || 0),
  };
}

export function processOrder(order: OrderData, decimals: number): ProcessedOrder {
  const denominator = Math.pow(10, decimals);
  const yNormalized = order.y / denominator;
  const zNormalized = order.z / denominator;

  // Calculate prices using the formula from the original SQL
  const B_real = Number(order.B % BigInt(2 ** 48)) * Math.pow(2, Number(order.B / BigInt(2 ** 48)));
  const A_real = Number(order.A % BigInt(2 ** 48)) * Math.pow(2, Number(order.A / BigInt(2 ** 48)));

  return {
    y: order.y,
    z: order.z,
    A: Number(order.A),
    B: Number(order.B),
    yNormalized,
    zNormalized,
    priceA: Math.pow(B_real / Math.pow(2, 48), 2),
    priceMarg:
      yNormalized === zNormalized
        ? Math.pow((B_real + A_real) / Math.pow(2, 48), 2)
        : Math.pow((B_real + (A_real * yNormalized) / zNormalized) / Math.pow(2, 48), 2),
    priceB: Math.pow((B_real + A_real) / Math.pow(2, 48), 2),
  };
}
