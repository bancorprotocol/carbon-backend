import { MigrationInterface, QueryRunner } from 'typeorm';
import { Decimal } from 'decimal.js';
import { parseOrder, processOrders } from '../activity/activity.utils';

export class FixStrategyPrecision1757500000000 implements MigrationInterface {
  name = 'FixStrategyPrecision1757500000000';

  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log('Starting re-backfill of strategy decoded values with full precision...');

    // Ensure Decimal.js is configured for maximum precision
    Decimal.set({
      precision: 100,
      toExpNeg: -100,
      toExpPos: 100,
    });

    const batchSize = 300;
    let offset = 0;
    let totalProcessed = 0;
    let totalErrors = 0;
    let totalSkipped = 0;

    while (true) {
      const strategies = await queryRunner.query(
        `
        SELECT 
          s.id,
          s."strategyId",
          s."encodedOrder0",
          s."encodedOrder1",
          t0.decimals as "token0Decimals",
          t1.decimals as "token1Decimals"
        FROM strategies s
        LEFT JOIN tokens t0 ON s."token0Id" = t0.id
        LEFT JOIN tokens t1 ON s."token1Id" = t1.id
        WHERE s."encodedOrder0" IS NOT NULL 
          AND s."encodedOrder1" IS NOT NULL
          AND t0.decimals IS NOT NULL
          AND t1.decimals IS NOT NULL
        ORDER BY s.id
        LIMIT $1 OFFSET $2
        `,
        [batchSize, offset],
      );

      if (strategies.length === 0) {
        break;
      }

      for (const strategy of strategies) {
        try {
          const parsedOrder0 = parseOrder(strategy.encodedOrder0);
          const parsedOrder1 = parseOrder(strategy.encodedOrder1);

          if (!parsedOrder0 || !parsedOrder1) {
            totalSkipped++;
            continue;
          }

          const decimals0 = new Decimal(strategy.token0Decimals);
          const decimals1 = new Decimal(strategy.token1Decimals);

          const processedOrders = processOrders(parsedOrder0, parsedOrder1, decimals0, decimals1);

          const sanitizeValue = (value: string): string => {
            if (!value || value === 'NaN' || value === 'Infinity' || value === '-Infinity') {
              return '0';
            }
            return value;
          };

          const liquidity0 = sanitizeValue(processedOrders.liquidity0.toString());
          const lowestRate0 = sanitizeValue(processedOrders.sellPriceA.toString());
          const highestRate0 = sanitizeValue(processedOrders.sellPriceB.toString());
          const marginalRate0 = sanitizeValue(processedOrders.sellPriceMarg.toString());
          const liquidity1 = sanitizeValue(processedOrders.liquidity1.toString());
          const lowestRate1 = sanitizeValue(processedOrders.buyPriceA.toString());
          const highestRate1 = sanitizeValue(processedOrders.buyPriceB.toString());
          const marginalRate1 = sanitizeValue(processedOrders.buyPriceMarg.toString());

          await queryRunner.query(
            `
            UPDATE strategies
            SET 
              "liquidity0" = $1,
              "lowestRate0" = $2,
              "highestRate0" = $3,
              "marginalRate0" = $4,
              "liquidity1" = $5,
              "lowestRate1" = $6,
              "highestRate1" = $7,
              "marginalRate1" = $8
            WHERE id = $9
            `,
            [
              liquidity0,
              lowestRate0,
              highestRate0,
              marginalRate0,
              liquidity1,
              lowestRate1,
              highestRate1,
              marginalRate1,
              strategy.id,
            ],
          );

          totalProcessed++;
        } catch (error) {
          console.error(`Error processing strategy ${strategy.strategyId}:`, error.message);
          totalErrors++;
        }
      }

      offset += batchSize;

      if (offset % 100 === 0) {
        console.log(`Progress: ${totalProcessed} updated, ${totalSkipped} skipped, ${totalErrors} errors`);
      }
    }

    console.log(
      `Precision fix complete: ${totalProcessed} strategies updated, ${totalSkipped} skipped, ${totalErrors} errors`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log('Revert complete - no action needed');
  }
}
