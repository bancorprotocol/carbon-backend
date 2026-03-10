import { BigNumber } from '@ethersproject/bignumber';

export function parseGradientOrderFields(returnValues: any): Record<string, any> {
  const fields: Record<string, any> = {};

  for (let i = 0; i < 2; i++) {
    const key = `order${i}`;
    // web3 may return tuple as named (order0.liquidity) or positional (returnValues[4], returnValues[5])
    let order = returnValues[key];
    if (!order || order.liquidity === undefined) {
      // fallback: try positional index — order0 is typically at position 4, order1 at position 5
      // (after id, owner/token0, token0/token1, token1)
      const positionalIndex = i === 0 ? 4 : 5;
      order = returnValues[positionalIndex] || returnValues[String(positionalIndex)];
    }
    if (!order || order.liquidity === undefined) {
      // try index 2 and 3 for StrategyUpdated (id, token0, token1, order0, order1)
      const altIndex = i + 2;
      order = returnValues[altIndex] || returnValues[String(altIndex)];
    }
    if (!order || (order.liquidity === undefined && order[0] === undefined)) {
      throw new Error(`Cannot parse gradient order${i} from event returnValues: ${JSON.stringify(Object.keys(returnValues))}`);
    }

    // Handle both named and positional access within the tuple
    const liq = order.liquidity ?? order[0];
    const price = order.initialPrice ?? order[1];
    const start = order.tradingStartTime ?? order[2];
    const exp = order.expiry ?? order[3];
    const mf = order.multiFactor ?? order[4];
    const gt = order.gradientType ?? order[5];

    fields[`${key}Liquidity`] = BigNumber.from(liq).toString();
    fields[`${key}InitialPrice`] = BigNumber.from(price).toString();
    fields[`${key}TradingStartTime`] = Number(start);
    fields[`${key}Expiry`] = Number(exp);
    fields[`${key}MultiFactor`] = BigNumber.from(mf).toString();
    fields[`${key}GradientType`] = gt.toString();
  }

  return fields;
}
