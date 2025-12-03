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
      const smallDecimal = new Decimal('0.0000000000000006507933332773792928809083689620633450013953424928558888495899736881256103515625');
      const smallStr = smallDecimal.toString();

      // Should NOT be in exponential notation
      expect(smallStr).not.toContain('e');

      // Should maintain full precision (the string should equal the original)
      expect(smallStr).toBe('0.0000000000000006507933332773792928809083689620633450013953424928558888495899736881256103515625');
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
});
