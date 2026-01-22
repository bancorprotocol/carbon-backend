import { Decimal } from 'decimal.js';
import { parseOrder, processOrders } from './activity.utils';
import { ProcessedOrders } from './activity.types';

describe('ActivityV2 Utilities', () => {
  describe('Decimal precision configuration', () => {
    it('should maintain high precision for very small numbers', () => {
      // This test verifies that the Decimal.js configuration maintains precision
      // for numbers like 0.0000000000000006507933332773792928809...
      const sampleOrderJson0 = {
        y: '34993279133544987885948',
        z: '34993279133544987885948',
        A: '4503599627369472',
        B: '57149867462115',
      };
      const sampleOrderJson1 = {
        y: '29394173322282207054332469326543456',
        z: '29394173322282207054332469326543456',
        A: '4503599627369472',
        B: '57424927034998',
      };
      const decimals0 = 18;
      const decimals1 = 18;

      const order0 = parseOrder(JSON.stringify(sampleOrderJson0));
      const order1 = parseOrder(JSON.stringify(sampleOrderJson1));
      const decimals0_d = new Decimal(decimals0);
      const decimals1_d = new Decimal(decimals1);

      const processed: ProcessedOrders = processOrders(order0, order1, decimals0_d, decimals1_d);

      // Verify that toString() returns a non-exponential format with high precision
      const sellPriceAStr = processed.sellPriceA.toString();
      const buyPriceAStr = processed.buyPriceA.toString();

      // These should NOT be in exponential notation (no 'e' in the string)
      expect(sellPriceAStr).not.toContain('e');
      expect(buyPriceAStr).not.toContain('e');

      // The values should have many decimal places (more than the default 20 significant digits)
      // The actual precision depends on the input, but they should be stored as full decimal strings
      expect(sellPriceAStr.length).toBeGreaterThan(20);
      expect(buyPriceAStr.length).toBeGreaterThan(20);
    });

    it('should maintain high precision for liquidity values', () => {
      const sampleOrderJson0 = {
        y: '34993279133544987885948',
        z: '34993279133544987885948',
        A: '4503599627369472',
        B: '57149867462115',
      };
      const sampleOrderJson1 = {
        y: '29394173322282207054332469326543456',
        z: '29394173322282207054332469326543456',
        A: '4503599627369472',
        B: '57424927034998',
      };

      const order0 = parseOrder(JSON.stringify(sampleOrderJson0));
      const order1 = parseOrder(JSON.stringify(sampleOrderJson1));
      const decimals0_d = new Decimal(18);
      const decimals1_d = new Decimal(18);

      const processed: ProcessedOrders = processOrders(order0, order1, decimals0_d, decimals1_d);

      // Verify liquidity maintains full precision
      const liquidity0Str = processed.liquidity0.toString();
      const liquidity1Str = processed.liquidity1.toString();

      // Liquidity0 should be 34993.279133544987885948 (full precision)
      expect(liquidity0Str).toBe('34993.279133544987885948');

      // Liquidity1 should be 29394173322282207.054332469326543456 (full precision)
      expect(liquidity1Str).toBe('29394173322282207.054332469326543456');
    });

    it('should not truncate precision when converting to string', () => {
      // Test with numbers that would lose precision with default Decimal settings
      const smallDecimal = new Decimal(
        '0.0000000000000006507933332773792928809083689620633450013953424928558888495899736881256103515625',
      );
      const smallStr = smallDecimal.toString();

      // Should NOT be in exponential notation
      expect(smallStr).not.toContain('e');

      // Should maintain full precision (the string should equal the original)
      expect(smallStr).toBe(
        '0.0000000000000006507933332773792928809083689620633450013953424928558888495899736881256103515625',
      );
    });
  });

  describe('process orders', () => {
    const testCase1 = {
      sampleOrderJson0: {
        y: '170094842454075153',
        z: '170424481651884481',
        A: '3091437773161920',
        B: '4365290227193173',
      },
      sampleOrderJson1: {
        y: '1216139',
        z: '575996185',
        A: '961648879',
        B: '15922629181',
      },
      decimals0: 18,
      decimals1: 6,
      expectedProcessed: {
        y0: '170094842454075153',
        z0: '170424481651884481',
        y1: '1216139',
        z1: '575996185',
        liquidity0: 0.170095,
        capacity0: 0.170424,
        liquidity1: 1.216139,
        capacity1: 575.996185,
        sellPriceA: 3201.6,
        sellPriceMarg: 3202.305521,
        sellPriceB: 3600.0,
        buyPriceA: 3200.0,
        buyPriceMarg: 3200.816156,
        buyPriceB: 3598.200899,
      },
    };

    const testCase2 = {
      sampleOrderJson0: {
        y: '313867074308629781954050',
        z: '1809224000000000000000000',
        A: '6752374180268429',
        B: '6667651067822137',
      },
      sampleOrderJson1: {
        y: '14809616187',
        z: '22158378151',
        A: '28605233',
        B: '19903286',
      },
      decimals0: 18,
      decimals1: 6,
      expectedProcessed: {
        y0: '313867074308629781954050',
        z0: '1809224000000000000000000',
        y1: '14809616187',
        z1: '22158378151',
        liquidity0: 313867.074309,
        capacity0: 1809224.0,
        liquidity1: 14809.616187,
        capacity1: 22158.378151,
        sellPriceA: 0.00505,
        sellPriceMarg: 0.01922,
        sellPriceB: 0.03,
        buyPriceA: 0.005,
        buyPriceMarg: 0.019219,
        buyPriceB: 0.0297,
      },
    };

    const testCases = [testCase1, testCase2];

    testCases.forEach(({ sampleOrderJson0, sampleOrderJson1, decimals0, decimals1, expectedProcessed }, index) => {
      it(`should compute correct prices for test case ${index + 1}`, () => {
        // If your parseOrder function expects a JSON string, stringify the imported objects.
        const order0 = parseOrder(JSON.stringify(sampleOrderJson0));
        const order1 = parseOrder(JSON.stringify(sampleOrderJson1));
        const decimals0_d = new Decimal(decimals0);
        const decimals1_d = new Decimal(decimals1);

        // Process orders. (Make sure processOrders expects decimals as numbers,
        // or convert if needed. Here, we assume they’re plain numbers as imported.)
        const processed: ProcessedOrders = processOrders(order0, order1, decimals0_d, decimals1_d);

        // Tolerance for floating point comparisons (number of decimal places).
        const tolerance = 6;

        // Compare liquidity/capacity values.
        expect(processed.liquidity0.toNumber()).toBeCloseTo(expectedProcessed.liquidity0, tolerance);
        expect(processed.capacity0.toNumber()).toBeCloseTo(expectedProcessed.capacity0, tolerance);
        expect(processed.liquidity1.toNumber()).toBeCloseTo(expectedProcessed.liquidity1, tolerance);
        expect(processed.capacity1.toNumber()).toBeCloseTo(expectedProcessed.capacity1, tolerance);

        // Compare price values.
        expect(processed.sellPriceA.toNumber()).toBeCloseTo(expectedProcessed.sellPriceA, tolerance);
        expect(processed.sellPriceMarg.toNumber()).toBeCloseTo(expectedProcessed.sellPriceMarg, tolerance);
        expect(processed.sellPriceB.toNumber()).toBeCloseTo(expectedProcessed.sellPriceB, tolerance);
        expect(processed.buyPriceA.toNumber()).toBeCloseTo(expectedProcessed.buyPriceA, tolerance);
        expect(processed.buyPriceMarg.toNumber()).toBeCloseTo(expectedProcessed.buyPriceMarg, tolerance);
        expect(processed.buyPriceB.toNumber()).toBeCloseTo(expectedProcessed.buyPriceB, tolerance);
      });
    });
  });

  /**
   * CONTRACT TESTS: Output Format Verification
   *
   * These tests document and enforce the output format of processOrders().
   * The values stored in the strategies table MUST be in normalized format.
   *
   * If these tests fail, it means the output format has changed, which will
   * break downstream consumers (coingecko, analytics, wallet-pair-balance APIs).
   *
   * DO NOT change these tests without updating ALL consumers.
   */
  describe('CONTRACT: processOrders output format', () => {
    describe('liquidity values are NORMALIZED (divided by 10^decimals)', () => {
      it('should output liquidity in human-readable format, not raw blockchain format', () => {
        // Given: A raw blockchain value of 247,000 tokens with 18 decimals
        // Raw value = 247000 * 10^18 = 247000000000000000000000
        const rawBlockchainValue = '247000000000000000000000';
        const decimals = 18;

        const order0 = parseOrder(
          JSON.stringify({
            y: rawBlockchainValue,
            z: rawBlockchainValue,
            A: '0',
            B: '0',
          }),
        );
        const order1 = parseOrder(JSON.stringify({ y: '0', z: '0', A: '0', B: '0' }));

        const processed = processOrders(order0, order1, new Decimal(decimals), new Decimal(decimals));

        // CRITICAL ASSERTION: liquidity0 should be 247000 (human-readable)
        // NOT 247000000000000000000000 (raw blockchain value)
        expect(processed.liquidity0.toString()).toBe('247000');

        // If this test fails with "247000000000000000000000", the normalization was removed
        // and ALL downstream consumers will show values that are 10^18 too large
      });

      it('should handle different decimal places correctly', () => {
        // USDC has 6 decimals: 1000 USDC raw = 1000000000
        const usdcRaw = '1000000000'; // 1000 USDC in raw format
        const usdcDecimals = 6;

        const order0 = parseOrder(JSON.stringify({ y: usdcRaw, z: usdcRaw, A: '0', B: '0' }));
        const order1 = parseOrder(JSON.stringify({ y: '0', z: '0', A: '0', B: '0' }));

        const processed = processOrders(order0, order1, new Decimal(usdcDecimals), new Decimal(18));

        // Should be 1000, not 1000000000
        expect(processed.liquidity0.toString()).toBe('1000');
      });
    });

    describe('rate values are NORMALIZED (adjusted by decimals difference)', () => {
      it('should apply decimal multiplier to rates', () => {
        // This test verifies that rates include the decimal adjustment multiplier.
        // The multiplier is 10^(decimals1 - decimals0) for sell prices.
        //
        // If we use the same decimals for both tokens, the multiplier is 1,
        // so we can verify the base rate calculation works.
        const order0 = parseOrder(
          JSON.stringify({
            y: '1000000000000000000',
            z: '1000000000000000000',
            A: '0',
            B: '70368744177664', // B value that produces a known rate
          }),
        );
        const order1 = parseOrder(JSON.stringify({ y: '0', z: '0', A: '0', B: '0' }));

        // Same decimals = multiplier of 1
        const processedSame = processOrders(order0, order1, new Decimal(18), new Decimal(18));
        const rateSameDecimals = processedSame.sellPriceB.toNumber();

        // Different decimals = multiplier of 10^12
        const processedDiff = processOrders(order0, order1, new Decimal(18), new Decimal(6));
        const rateDiffDecimals = processedDiff.sellPriceB.toNumber();

        // The rate with 12 decimal difference should be different by a factor of 10^12
        // multiplierSell = 10^(decimals1 - decimals0) = 10^(6-18) = 10^-12
        // sellPriceB = 1/lowestRate0, and lowestRate0 *= multiplierSell
        // So sellPriceB with different decimals = sellPriceB_same / 10^-12 = sellPriceB_same * 10^12
        const ratio = rateDiffDecimals / rateSameDecimals;

        // The ratio should be approximately 10^12
        expect(ratio).toBeCloseTo(1e12, -6); // precision of -6 means within 10^6
      });
    });

    describe('format change detection', () => {
      /**
       * This test uses a specific known input/output pair to detect format changes.
       * If the output format changes (e.g., raw vs normalized), this test WILL fail.
       */
      it('should produce exact expected output for known input (format canary)', () => {
        const order0 = parseOrder(
          JSON.stringify({
            y: '34993279133544987885948',
            z: '34993279133544987885948',
            A: '4503599627369472',
            B: '57149867462115',
          }),
        );
        const order1 = parseOrder(
          JSON.stringify({
            y: '29394173322282207054332469326543456',
            z: '29394173322282207054332469326543456',
            A: '4503599627369472',
            B: '57424927034998',
          }),
        );

        const processed = processOrders(order0, order1, new Decimal(18), new Decimal(18));

        // These exact values serve as a "canary" - if they change, the format changed
        expect(processed.liquidity0.toString()).toBe('34993.279133544987885948');
        expect(processed.liquidity1.toString()).toBe('29394173322282207.054332469326543456');

        // If you see this test fail with values like:
        // - "34993279133544987885948" - normalization was REMOVED (values are raw)
        // - "0.000000000000034993..." - values are being DOUBLE normalized
        // Then downstream consumers (coingecko, analytics, wallet-pair-balance) will break!
      });
    });
  });
});
