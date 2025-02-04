import { Decimal } from 'decimal.js';
import { parseOrder, processOrders } from './activity.utils';
import { ProcessedOrders } from './activity.types';

describe('ActivityV2 Utilities', () => {
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
