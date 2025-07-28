// npm i decimal.js
import Decimal from 'decimal.js';

export type PriceTriple = [Decimal, Decimal, Decimal];

export class CarbonMath {
  /** 2^48 as Decimal (for precise math) */
  public static readonly SCALING_CONSTANT_DEC = new Decimal(2).pow(48);
  /** 2^48 as BigInt (for bit ops) */
  public static readonly SCALING_CONSTANT_INT = 2n ** 48n;
  public static readonly TEN = new Decimal(10);

  /**
   * Decompresses a compressed rate parameter (mantissa | (exponent << 48)).
   */
  static decompressRateParameter(compressed: bigint): bigint {
    if (typeof compressed !== 'bigint') {
      throw new TypeError('`compressed_rate_parameter` must be a bigint.');
    }
    const m = compressed % this.SCALING_CONSTANT_INT;
    const e = compressed / this.SCALING_CONSTANT_INT;
    return m << e; // mantissa << exponent
  }

  /**
   * Compresses a precise Decimal rate parameter into (mantissa | (exponent << 48)).
   */
  static compressRateParameter(rate: Decimal): bigint {
    if (!(rate instanceof Decimal)) {
      throw new TypeError('`rate_parameter` must be a Decimal.');
    }
    const scaling = this.SCALING_CONSTANT_INT;
    const rateInt = decToBigInt(rate);

    const tmp = rateInt / scaling;
    const numberOfBits = bitLength(tmp);
    const truncated = (rateInt >> BigInt(numberOfBits)) << BigInt(numberOfBits);

    const expTmp = truncated / scaling;
    const exponent = bitLength(expTmp);
    const mantissa = truncated >> BigInt(exponent);

    return mantissa | (BigInt(exponent) * scaling);
  }

  /**
   * (10^quoteDecimals) / (10^baseDecimals)
   */
  static calculateWeiScale(quoteTokenDecimals: number, baseTokenDecimals: number): Decimal {
    if (!Number.isInteger(quoteTokenDecimals) || !Number.isInteger(baseTokenDecimals)) {
      throw new TypeError('Token decimals must be integers.');
    }
    return this.TEN.pow(quoteTokenDecimals).div(this.TEN.pow(baseTokenDecimals));
  }

  /**
   * naive_quantity * 10^token_decimals -> bigint (wei)
   */
  static calculateWeiTokenAmount(naiveQuantity: Decimal, tokenDecimals: number): bigint {
    if (!(naiveQuantity instanceof Decimal)) {
      throw new TypeError('`naive_quantity` must be a Decimal.');
    }
    if (!Number.isInteger(tokenDecimals)) {
      throw new TypeError('`token_decimals` must be an integer.');
    }
    const scaled = naiveQuantity.mul(this.TEN.pow(tokenDecimals));
    return decToBigInt(scaled);
  }

  /**
   * z = ceil( y * (sqrtPh - sqrtPl) / (sqrtPm - sqrtPl) ) ; edge cases handled.
   */
  static calculateZ(y: bigint, sqrtPHigh: Decimal, sqrtPMarginal: Decimal, sqrtPLow: Decimal): bigint {
    if (typeof y !== 'bigint') throw new TypeError('`y` must be a bigint.');
    if (![sqrtPHigh, sqrtPMarginal, sqrtPLow].every((d) => d instanceof Decimal)) {
      throw new TypeError('All price parameters must be Decimals.');
    }
    if (sqrtPMarginal.greaterThanOrEqualTo(sqrtPHigh)) return y;
    const denom = sqrtPMarginal.sub(sqrtPLow);
    if (denom.isZero()) return 0n;
    const num = new Decimal(y.toString()).mul(sqrtPHigh.sub(sqrtPLow)).div(denom);
    return decToBigInt(num.toDecimalPlaces(0, Decimal.ROUND_CEIL));
  }

  /**
   * Returns Wei-scaled prices (ascending): (P_low, P_marginal, P_high)
   */
  static calculatePValuesPrecise(
    naiveLow: Decimal,
    naiveMarginal: Decimal,
    naiveHigh: Decimal,
    weiScale: Decimal,
    isBuyOrder: boolean,
  ): PriceTriple {
    const prices = [naiveLow, naiveMarginal, naiveHigh];
    if (!prices.every((p) => p instanceof Decimal)) {
      throw new TypeError('All naive prices must be Decimals.');
    }
    if (!(weiScale instanceof Decimal)) throw new TypeError('`wei_scale` must be a Decimal.');

    const exp = isBuyOrder ? new Decimal(1) : new Decimal(-1);
    const scaled = prices.map((p) => p.mul(weiScale).pow(exp)).sort((a, b) => a.comparedTo(b));
    return [scaled[0], scaled[1], scaled[2]];
  }

  /**
   * Square roots of precise prices.
   */
  static calculateSqrtPValuesPrecise(pLow: Decimal, pMarginal: Decimal, pHigh: Decimal): PriceTriple {
    if (![pLow, pMarginal, pHigh].every((p) => p instanceof Decimal)) {
      throw new TypeError('All prices must be Decimals.');
    }
    return [pLow.sqrt(), pMarginal.sqrt(), pHigh.sqrt()];
  }

  /**
   * A = (sqrtPh - sqrtPl) * SCALING, M = sqrtPm * SCALING, B = sqrtPl * SCALING
   */
  static calculateA_M_BPrecise(sqrtPLow: Decimal, sqrtPMarginal: Decimal, sqrtPHigh: Decimal): PriceTriple {
    if (![sqrtPLow, sqrtPMarginal, sqrtPHigh].every((p) => p instanceof Decimal)) {
      throw new TypeError('All square-root prices must be Decimals.');
    }
    const sc = this.SCALING_CONSTANT_DEC;
    const A = sqrtPHigh.sub(sqrtPLow).mul(sc);
    const M = sqrtPMarginal.mul(sc);
    const B = sqrtPLow.mul(sc);
    return [A, M, B];
  }

  /**
   * ((A/SC * y / z) + (B/SC))^2
   */
  static calculateEffectivePMarginal(y: bigint, A: bigint, B: bigint, z: bigint): Decimal {
    if (![y, A, B, z].every((n) => typeof n === 'bigint')) {
      throw new TypeError('All parameters (y, A, B, z) must be bigints.');
    }
    if (z === 0n) return new Decimal(0);

    const SC = this.SCALING_CONSTANT_INT;

    const term1 = new Decimal(A.toString()).div(SC.toString()).mul(y.toString()).div(z.toString());
    const term2 = new Decimal(B.toString()).div(SC.toString());
    return term1.add(term2).pow(2);
  }
}

/* ---------- helpers ---------- */

function bitLength(x: bigint): number {
  return x === 0n ? 0 : x.toString(2).length;
}

function decToBigInt(d: Decimal): bigint {
  // assumes d is non-negative; adjust if negatives are possible
  return BigInt(d.toDecimalPlaces(0, Decimal.ROUND_FLOOR).toString());
}
