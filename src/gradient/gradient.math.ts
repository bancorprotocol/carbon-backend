import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';
import { GradientOffsetData } from './gradient.interfaces';
import { GradientStrategy } from './gradient-strategy.entity';

const BnToDec = (x: BigNumber): Decimal => new Decimal(x.toString());
const DecToBn = (x: Decimal): BigNumber => BigNumber.from(x.toFixed());

const ONE_48 = 2 ** 48;
const ONE_24 = 2 ** 24;

const R_ONE = BigNumber.from(ONE_48);
const M_ONE = BigNumber.from(ONE_24);

const MAX_UINT256 = BigNumber.from(2).pow(256).sub(1);

const RR = R_ONE.mul(R_ONE);
const MM = M_ONE.mul(M_ONE);

const RR_MUL_MM = RR.mul(MM);
const RR_DIV_MM = RR.div(MM);

const EXP_ONE = BigNumber.from('0x0080000000000000000000000000000000');
const EXP_MID = BigNumber.from('0x0400000000000000000000000000000000');
const EXP_MAX = BigNumber.from('0x2cb53f09f05cc627c85ddebfccfeb72758');
const EXP_LN2 = BigNumber.from('0x0058b90bfbe8e7bcd5e4f1d9cc01f97b58');

const EXP_ONE_MUL_RR = EXP_ONE.mul(RR);
const EXP_ONE_DIV_RR = EXP_ONE.div(RR);
const EXP_ONE_DIV_MM = EXP_ONE.div(MM);

const check = (val: BigNumber, max: BigNumber): BigNumber => {
  if (val.gte(0) && val.lte(max)) {
    return val;
  }
  throw new Error('Overflow');
};

const add = (a: BigNumber, b: BigNumber) => check(a.add(b), MAX_UINT256);
const mul = (a: BigNumber, b: BigNumber) => check(a.mul(b), MAX_UINT256);
const mulDivF = (a: BigNumber, b: BigNumber, c: BigNumber) =>
  check(a.mul(b).div(c), MAX_UINT256);
const mulDivC = (a: BigNumber, b: BigNumber, c: BigNumber) =>
  check(a.mul(b).add(c).sub(1).div(c), MAX_UINT256);
const minFactor = (a: BigNumber, b: BigNumber) => mulDivC(a, b, MAX_UINT256);

const sub = (one: BigNumber, mt: BigNumber): BigNumber => {
  if (one.lte(mt)) {
    throw new Error('InvalidRate');
  }
  return one.sub(mt);
};

const bitLength = (value: BigNumber): number => {
  return value.gt(0)
    ? Decimal.log2(value.toString()).add(1).floor().toNumber()
    : 0;
};

const encodeRate = (value: Decimal): BigNumber => {
  const data = DecToBn(value.sqrt().mul(ONE_48).floor());
  const length = bitLength(data.div(ONE_48));
  return data.shr(length).shl(length);
};

const encodeScale = (value: Decimal, one: number): BigNumber => {
  const data = DecToBn(value.mul(one).floor());
  const length = bitLength(data.div(one));
  return data.shr(length).shl(length);
};

const decodeScale = (value: Decimal, one: number): Decimal => {
  return value.div(one);
};

const encodeFloat = (value: BigNumber, one: number): BigNumber => {
  const exponent = bitLength(value.div(one));
  const mantissa = value.shr(exponent);
  return BigNumber.from(one).mul(exponent).or(mantissa);
};

const decodeFloat = (value: BigNumber, one: number): BigNumber => {
  return value.mod(one).shl(value.div(one).toNumber());
};

export const encodeScaleInitialRate = (value: Decimal) =>
  encodeScale(value.sqrt(), ONE_48);
export const decodeScaleInitialRate = (value: Decimal) =>
  decodeScale(value, ONE_48).pow(2);

export const encodeScaleMultiFactor = (value: Decimal) =>
  encodeScale(value.mul(ONE_24), ONE_24);
export const decodeScaleMultiFactor = (value: Decimal) =>
  decodeScale(value, ONE_24).div(ONE_24);

export const encodeFloatInitialRate = (value: BigNumber) =>
  encodeFloat(value, ONE_48);
export const decodeFloatInitialRate = (value: BigNumber) =>
  decodeFloat(value, ONE_48);

export const encodeFloatMultiFactor = (value: BigNumber) =>
  encodeFloat(value, ONE_24);
export const decodeFloatMultiFactor = (value: BigNumber) =>
  decodeFloat(value, ONE_24);

export enum GradientType {
  LINEAR_INCREASE,
  LINEAR_DECREASE,
  LINEAR_INV_INCREASE,
  LINEAR_INV_DECREASE,
  EXPONENTIAL_INCREASE,
  EXPONENTIAL_DECREASE,
}

function _exp(x: BigNumber): BigNumber {
  let res = BigNumber.from(0);

  let y: BigNumber;
  let z: BigNumber;

  z = y = x.mod(BigNumber.from('0x10000000000000000000000000000000'));
  z = z.mul(y).div(EXP_ONE);
  res = res.add(z.mul(BigNumber.from('0x10e1b3be415a0000')));
  z = z.mul(y).div(EXP_ONE);
  res = res.add(z.mul(BigNumber.from('0x05a0913f6b1e0000')));
  z = z.mul(y).div(EXP_ONE);
  res = res.add(z.mul(BigNumber.from('0x0168244fdac78000')));
  z = z.mul(y).div(EXP_ONE);
  res = res.add(z.mul(BigNumber.from('0x004807432bc18000')));
  z = z.mul(y).div(EXP_ONE);
  res = res.add(z.mul(BigNumber.from('0x000c0135dca04000')));
  z = z.mul(y).div(EXP_ONE);
  res = res.add(z.mul(BigNumber.from('0x0001b707b1cdc000')));
  z = z.mul(y).div(EXP_ONE);
  res = res.add(z.mul(BigNumber.from('0x000036e0f639b800')));
  z = z.mul(y).div(EXP_ONE);
  res = res.add(z.mul(BigNumber.from('0x00000618fee9f800')));
  z = z.mul(y).div(EXP_ONE);
  res = res.add(z.mul(BigNumber.from('0x0000009c197dcc00')));
  z = z.mul(y).div(EXP_ONE);
  res = res.add(z.mul(BigNumber.from('0x0000000e30dce400')));
  z = z.mul(y).div(EXP_ONE);
  res = res.add(z.mul(BigNumber.from('0x000000012ebd1300')));
  z = z.mul(y).div(EXP_ONE);
  res = res.add(z.mul(BigNumber.from('0x0000000017499f00')));
  z = z.mul(y).div(EXP_ONE);
  res = res.add(z.mul(BigNumber.from('0x0000000001a9d480')));
  z = z.mul(y).div(EXP_ONE);
  res = res.add(z.mul(BigNumber.from('0x00000000001c6380')));
  z = z.mul(y).div(EXP_ONE);
  res = res.add(z.mul(BigNumber.from('0x000000000001c638')));
  z = z.mul(y).div(EXP_ONE);
  res = res.add(z.mul(BigNumber.from('0x0000000000001ab8')));
  z = z.mul(y).div(EXP_ONE);
  res = res.add(z.mul(BigNumber.from('0x000000000000017c')));
  z = z.mul(y).div(EXP_ONE);
  res = res.add(z.mul(BigNumber.from('0x0000000000000014')));
  z = z.mul(y).div(EXP_ONE);
  res = res.add(z.mul(BigNumber.from('0x0000000000000001')));
  res = res.div(BigNumber.from('0x21c3677c82b40000')).add(y).add(EXP_ONE);

  if (!x.and(BigNumber.from('0x010000000000000000000000000000000')).eq(0))
    res = res
      .mul(BigNumber.from('0x1c3d6a24ed82218787d624d3e5eba95f9'))
      .div(BigNumber.from('0x18ebef9eac820ae8682b9793ac6d1e776'));
  if (!x.and(BigNumber.from('0x020000000000000000000000000000000')).eq(0))
    res = res
      .mul(BigNumber.from('0x18ebef9eac820ae8682b9793ac6d1e778'))
      .div(BigNumber.from('0x1368b2fc6f9609fe7aceb46aa619baed4'));
  if (!x.and(BigNumber.from('0x040000000000000000000000000000000')).eq(0))
    res = res
      .mul(BigNumber.from('0x1368b2fc6f9609fe7aceb46aa619baed5'))
      .div(BigNumber.from('0x0bc5ab1b16779be3575bd8f0520a9f21f'));
  if (!x.and(BigNumber.from('0x080000000000000000000000000000000')).eq(0))
    res = res
      .mul(BigNumber.from('0x0bc5ab1b16779be3575bd8f0520a9f21e'))
      .div(BigNumber.from('0x0454aaa8efe072e7f6ddbab84b40a55c9'));
  if (!x.and(BigNumber.from('0x100000000000000000000000000000000')).eq(0))
    res = res
      .mul(BigNumber.from('0x0454aaa8efe072e7f6ddbab84b40a55c5'))
      .div(BigNumber.from('0x00960aadc109e7a3bf4578099615711ea'));
  if (!x.and(BigNumber.from('0x200000000000000000000000000000000')).eq(0))
    res = res
      .mul(BigNumber.from('0x00960aadc109e7a3bf4578099615711d7'))
      .div(BigNumber.from('0x0002bf84208204f5977f9a8cf01fdce3d'));
  if (!x.and(BigNumber.from('0x400000000000000000000000000000000')).eq(0))
    res = res
      .mul(BigNumber.from('0x0002bf84208204f5977f9a8cf01fdc307'))
      .div(BigNumber.from('0x0000003c6ab775dd0b95b4cbee7e65d11'));

  return res;
}

function exp(x: BigNumber): BigNumber {
  if (x.lt(EXP_MID)) {
    return _exp(x);
  }
  if (x.lt(EXP_MAX)) {
    return _exp(x.mod(EXP_LN2)).shl(x.div(EXP_LN2).toNumber());
  }
  throw new Error('ExpOverflow');
}

/**
 * Calculate the current exchange rate for a gradient strategy.
 *
 * @param gradientType - one of 6 gradient types
 * @param initialRate - 48-bit-mantissa-6-bit-exponent encoding of the initial exchange rate square root
 * @param multiFactor - 24-bit-mantissa-5-bit-exponent encoding of the multiplication factor times 2^24
 * @param timeElapsed - time elapsed since strategy creation
 * @returns [numerator, denominator] pair representing the current rate
 */
export const calcCurrentRate = (
  gradientType: GradientType,
  initialRate: BigNumber,
  multiFactor: BigNumber,
  timeElapsed: BigNumber,
): [BigNumber, BigNumber] => {
  if (R_ONE.shr(initialRate.div(R_ONE).toNumber()).eq(0)) {
    throw new Error('InitialRateTooHigh');
  }

  if (M_ONE.shr(multiFactor.div(M_ONE).toNumber()).eq(0)) {
    throw new Error('MultiFactorTooHigh');
  }

  const r = initialRate.mod(R_ONE).shl(initialRate.div(R_ONE).toNumber());
  const m = multiFactor.mod(M_ONE).shl(multiFactor.div(M_ONE).toNumber());
  const t = timeElapsed;

  const rr = mul(r, r);
  const mt = mul(m, t);

  if (gradientType == GradientType.LINEAR_INCREASE) {
    const temp1 = rr;
    const temp2 = add(MM, mt);
    const temp3 = minFactor(temp1, temp2);
    const temp4 = RR_MUL_MM;
    return [mulDivF(temp1, temp2, temp3), temp4.div(temp3)];
  }

  if (gradientType == GradientType.LINEAR_DECREASE) {
    const temp1 = mul(rr, sub(MM, mt));
    const temp2 = RR_MUL_MM;
    return [temp1, temp2];
  }

  if (gradientType == GradientType.LINEAR_INV_INCREASE) {
    const temp1 = rr;
    const temp2 = sub(RR, mul(mt, RR_DIV_MM));
    return [temp1, temp2];
  }

  if (gradientType == GradientType.LINEAR_INV_DECREASE) {
    const temp1 = rr;
    const temp2 = add(RR, mul(mt, RR_DIV_MM));
    return [temp1, temp2];
  }

  if (gradientType == GradientType.EXPONENTIAL_INCREASE) {
    const temp1 = rr;
    const temp2 = exp(mul(mt, EXP_ONE_DIV_MM));
    const temp3 = minFactor(temp1, temp2);
    const temp4 = EXP_ONE_MUL_RR;
    return [mulDivF(temp1, temp2, temp3), temp4.div(temp3)];
  }

  if (gradientType == GradientType.EXPONENTIAL_DECREASE) {
    const temp1 = mul(rr, EXP_ONE_DIV_RR);
    const temp2 = exp(mul(mt, EXP_ONE_DIV_MM));
    return [temp1, temp2];
  }

  throw new Error(`Invalid gradientType ${gradientType}`);
};

/**
 * Pure decimal math for computing the expected current rate.
 * Used for API display values (user-facing price computation).
 */
export const expectedCurrentRate = (
  gradientType: number,
  initialRate: Decimal,
  multiFactor: Decimal,
  timeElapsed: Decimal,
): Decimal => {
  const ONE = new Decimal(1);

  switch (gradientType) {
    case 0:
      return initialRate.mul(ONE.add(multiFactor.mul(timeElapsed)));
    case 1:
      return initialRate.mul(ONE.sub(multiFactor.mul(timeElapsed)));
    case 2:
      return initialRate.div(ONE.sub(multiFactor.mul(timeElapsed)));
    case 3:
      return initialRate.div(ONE.add(multiFactor.mul(timeElapsed)));
    case 4:
      return initialRate.mul(multiFactor.mul(timeElapsed).exp());
    case 5:
      return initialRate.div(multiFactor.mul(timeElapsed).exp());
  }

  throw new Error(`Invalid gradientType ${gradientType}`);
};

/**
 * Calculate the gradient price for the analysis/curve system.
 * Returns an encoded BigNumber rate suitable for the existing CarbonCurve format.
 */
export const calculateGradientPrice = (
  strategy: GradientStrategy,
  offsetData: GradientOffsetData,
  orderIndex: number,
): BigNumber => {
  const initialRate =
    orderIndex === 0
      ? strategy.order0InitialPrice
      : strategy.order1InitialPrice;
  const multiFactorRaw =
    orderIndex === 0
      ? strategy.order0MultiFactor
      : strategy.order1MultiFactor;
  const gradientTypeStr =
    orderIndex === 0
      ? strategy.order0GradientType
      : strategy.order1GradientType;
  const tradingStartTime =
    orderIndex === 0
      ? strategy.order0TradingStartTime
      : strategy.order1TradingStartTime;

  const timeElapsed = new Decimal(offsetData.now - tradingStartTime).add(
    parseInt(gradientTypeStr) % 2 === 0
      ? offsetData.increaseOffset
      : offsetData.decreaseOffset,
  );

  const rateDecoded = decodeScaleInitialRate(
    BnToDec(decodeFloatInitialRate(BigNumber.from(initialRate))),
  );
  const mfDecoded = decodeScaleMultiFactor(
    BnToDec(decodeFloatMultiFactor(BigNumber.from(multiFactorRaw))),
  );

  const rate = expectedCurrentRate(
    parseInt(gradientTypeStr),
    rateDecoded,
    mfDecoded,
    timeElapsed,
  );

  const encodedRate = encodeFloat(encodeRate(rate), ONE_48);
  return encodedRate;
};

/**
 * Decode raw on-chain gradient order params into human-readable price values.
 * Returns { initialRate, endRate, currentRate } as Decimal strings.
 */
export const decodeGradientOrderPrices = (
  initialPriceRaw: string,
  multiFactorRaw: string,
  gradientTypeStr: string,
  tradingStartTime: number,
  expiry: number,
  nowTimestamp: number,
): { startPrice: Decimal; endPrice: Decimal; marginalPrice: Decimal } => {
  const rateDecoded = decodeScaleInitialRate(
    BnToDec(decodeFloatInitialRate(BigNumber.from(initialPriceRaw))),
  );
  const mfDecoded = decodeScaleMultiFactor(
    BnToDec(decodeFloatMultiFactor(BigNumber.from(multiFactorRaw))),
  );

  const gradientType = parseInt(gradientTypeStr);
  const startPrice = rateDecoded;

  const totalDuration = new Decimal(expiry - tradingStartTime);
  const endPrice = totalDuration.gt(0)
    ? expectedCurrentRate(gradientType, rateDecoded, mfDecoded, totalDuration)
    : rateDecoded;

  const elapsed = new Decimal(Math.max(0, nowTimestamp - tradingStartTime));
  const marginalPrice =
    elapsed.gt(0) && nowTimestamp <= expiry
      ? expectedCurrentRate(gradientType, rateDecoded, mfDecoded, elapsed)
      : elapsed.lte(0)
        ? rateDecoded
        : endPrice;

  return { startPrice, endPrice, marginalPrice };
};
