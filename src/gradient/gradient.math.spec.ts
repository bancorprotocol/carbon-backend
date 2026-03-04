import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';
import {
  GradientType,
  expectedCurrentRate,
  calcCurrentRate,
  decodeScaleInitialRate,
  decodeScaleMultiFactor,
  encodeScaleInitialRate,
  encodeScaleMultiFactor,
  decodeFloatInitialRate,
  decodeFloatMultiFactor,
  encodeFloatInitialRate,
  encodeFloatMultiFactor,
  decodeGradientOrderPrices,
} from './gradient.math';

describe('GradientMath', () => {
  describe('expectedCurrentRate', () => {
    const initialRate = new Decimal('2000');
    const multiFactor = new Decimal('0.0001');
    const timeElapsed = new Decimal('3600');

    it('should compute LINEAR_INCREASE correctly: r * (1 + m*t)', () => {
      const result = expectedCurrentRate(
        GradientType.LINEAR_INCREASE,
        initialRate,
        multiFactor,
        timeElapsed,
      );
      // 2000 * (1 + 0.0001 * 3600) = 2000 * 1.36 = 2720
      expect(result.toNumber()).toBeCloseTo(2720, 5);
    });

    it('should compute LINEAR_DECREASE correctly: r * (1 - m*t)', () => {
      const smallTime = new Decimal('1000');
      const result = expectedCurrentRate(
        GradientType.LINEAR_DECREASE,
        initialRate,
        multiFactor,
        smallTime,
      );
      // 2000 * (1 - 0.0001 * 1000) = 2000 * 0.9 = 1800
      expect(result.toNumber()).toBeCloseTo(1800, 5);
    });

    it('should compute LINEAR_INV_INCREASE correctly: r / (1 - m*t)', () => {
      const smallTime = new Decimal('1000');
      const result = expectedCurrentRate(
        GradientType.LINEAR_INV_INCREASE,
        initialRate,
        multiFactor,
        smallTime,
      );
      // 2000 / (1 - 0.0001 * 1000) = 2000 / 0.9 ≈ 2222.22
      expect(result.toNumber()).toBeCloseTo(2222.222222, 3);
    });

    it('should compute LINEAR_INV_DECREASE correctly: r / (1 + m*t)', () => {
      const result = expectedCurrentRate(
        GradientType.LINEAR_INV_DECREASE,
        initialRate,
        multiFactor,
        timeElapsed,
      );
      // 2000 / (1 + 0.0001 * 3600) = 2000 / 1.36 ≈ 1470.59
      expect(result.toNumber()).toBeCloseTo(1470.5882, 2);
    });

    it('should compute EXPONENTIAL_INCREASE correctly: r * e^(m*t)', () => {
      const result = expectedCurrentRate(
        GradientType.EXPONENTIAL_INCREASE,
        initialRate,
        multiFactor,
        timeElapsed,
      );
      // 2000 * e^(0.0001 * 3600) = 2000 * e^0.36 ≈ 2000 * 1.4333 ≈ 2866.6
      expect(result.toNumber()).toBeCloseTo(2866.6, 0);
    });

    it('should compute EXPONENTIAL_DECREASE correctly: r / e^(m*t)', () => {
      const result = expectedCurrentRate(
        GradientType.EXPONENTIAL_DECREASE,
        initialRate,
        multiFactor,
        timeElapsed,
      );
      // 2000 / e^(0.36) ≈ 2000 / 1.4333 ≈ 1395.5
      expect(result.toNumber()).toBeCloseTo(1395.5, 0);
    });

    it('should throw for invalid gradient type', () => {
      expect(() =>
        expectedCurrentRate(99, initialRate, multiFactor, timeElapsed),
      ).toThrow('Invalid gradientType');
    });

    it('should return initial rate when timeElapsed is 0', () => {
      const result = expectedCurrentRate(
        GradientType.LINEAR_INCREASE,
        initialRate,
        multiFactor,
        new Decimal(0),
      );
      expect(result.toNumber()).toEqual(2000);
    });
  });

  describe('encoding/decoding round-trips', () => {
    it('should round-trip encodeScaleInitialRate / decodeScaleInitialRate', () => {
      const original = new Decimal('2000');
      const encoded = encodeScaleInitialRate(original);
      const decoded = decodeScaleInitialRate(new Decimal(encoded.toString()));
      expect(decoded.toNumber()).toBeCloseTo(original.toNumber(), -1);
    });

    it('should round-trip encodeScaleMultiFactor / decodeScaleMultiFactor', () => {
      const original = new Decimal('0.0001');
      const encoded = encodeScaleMultiFactor(original);
      const decoded = decodeScaleMultiFactor(new Decimal(encoded.toString()));
      expect(decoded.toNumber()).toBeCloseTo(original.toNumber(), 6);
    });

    it('should round-trip encodeFloatInitialRate / decodeFloatInitialRate', () => {
      const value = BigNumber.from('12345678901234');
      const encoded = encodeFloatInitialRate(value);
      const decoded = decodeFloatInitialRate(encoded);
      expect(decoded.toString()).toBe(value.toString());
    });

    it('should round-trip encodeFloatMultiFactor / decodeFloatMultiFactor with precision loss', () => {
      // 24-bit mantissa + 5-bit exponent encoding is lossy for values that exceed mantissa precision
      const value = BigNumber.from('16777216'); // 2^24, fits exactly in 24-bit mantissa
      const encoded = encodeFloatMultiFactor(value);
      const decoded = decodeFloatMultiFactor(encoded);
      expect(decoded.toString()).toBe(value.toString());
    });
  });

  describe('decodeGradientOrderPrices', () => {
    it('should compute prices for a gradient order', () => {
      const now = 1700043200; // halfway through the strategy
      const result = decodeGradientOrderPrices(
        '3377704960', // encoded initial price
        '16777728',   // encoded multi factor
        '0',          // LINEAR_INCREASE
        1700000000,   // tradingStartTime
        1700086400,   // expiry
        now,
      );

      expect(result.startPrice).toBeDefined();
      expect(result.endPrice).toBeDefined();
      expect(result.marginalPrice).toBeDefined();
      expect(parseFloat(result.startPrice.toString())).toBeGreaterThan(0);
      expect(parseFloat(result.endPrice.toString())).toBeGreaterThan(0);
      expect(parseFloat(result.marginalPrice.toString())).toBeGreaterThan(0);
    });

    it('should return startPrice = marginalPrice when now < tradingStartTime', () => {
      const result = decodeGradientOrderPrices(
        '3377704960',
        '16777728',
        '0',
        1700000000,
        1700086400,
        1699999000, // before start
      );

      expect(result.startPrice.toString()).toBe(result.marginalPrice.toString());
    });

    it('should return endPrice = marginalPrice when now > expiry', () => {
      const result = decodeGradientOrderPrices(
        '3377704960',
        '16777728',
        '0',
        1700000000,
        1700086400,
        1700100000, // after expiry
      );

      expect(result.endPrice.toString()).toBe(result.marginalPrice.toString());
    });
  });

  describe('calcCurrentRate', () => {
    it('should not throw for valid LINEAR_INCREASE inputs', () => {
      const initialRate = BigNumber.from('3377704960');
      const multiFactor = BigNumber.from('16777728');
      const timeElapsed = BigNumber.from('3600');

      expect(() => {
        calcCurrentRate(
          GradientType.LINEAR_INCREASE,
          initialRate,
          multiFactor,
          timeElapsed,
        );
      }).not.toThrow();
    });

    it('should return a numerator/denominator tuple', () => {
      const initialRate = BigNumber.from('3377704960');
      const multiFactor = BigNumber.from('16777728');
      const timeElapsed = BigNumber.from('100');

      const [num, den] = calcCurrentRate(
        GradientType.LINEAR_INCREASE,
        initialRate,
        multiFactor,
        timeElapsed,
      );

      expect(num.gt(0)).toBe(true);
      expect(den.gt(0)).toBe(true);
    });

    it('should throw InitialRateTooHigh for overflow', () => {
      const tooHigh = BigNumber.from(2).pow(96);
      const multiFactor = BigNumber.from('16777728');
      const timeElapsed = BigNumber.from('100');

      expect(() => {
        calcCurrentRate(
          GradientType.LINEAR_INCREASE,
          tooHigh,
          multiFactor,
          timeElapsed,
        );
      }).toThrow('InitialRateTooHigh');
    });
  });
});
