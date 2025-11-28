import { MigrationInterface, QueryRunner } from 'typeorm';
import Decimal from 'decimal.js';
import { parseOrder, processOrders } from '../activity/activity.utils';

export class BackfillStrategyDecodedValues1757000000000 implements MigrationInterface {
  name = 'BackfillStrategyDecodedValues1757000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log('Starting backfill of strategy decoded values...');

    // Process in batches to avoid memory issues
    const batchSize = 100;
    let offset = 0;
    let totalProcessed = 0;
    let totalErrors = 0;

    while (true) {
      // Fetch strategies with their tokens in batches
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

      // Process each strategy
      for (const strategy of strategies) {
        try {
          // Parse encoded orders
          const parsedOrder0 = parseOrder(strategy.encodedOrder0);
          const parsedOrder1 = parseOrder(strategy.encodedOrder1);

          if (!parsedOrder0 || !parsedOrder1) {
            // Skip strategies that can't be parsed
            continue;
          }

          // Get decimals - pass the raw decimal count, not 10^decimals
          const decimals0 = new Decimal(strategy.token0Decimals);
          const decimals1 = new Decimal(strategy.token1Decimals);

          // Process orders to get decoded values
          const processedOrders = processOrders(parsedOrder0, parsedOrder1, decimals0, decimals1);

          // Helper function to sanitize numeric values
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

          // Update strategy with decoded values (sanitize to prevent NaN/Infinity)
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
          // Continue to next strategy instead of failing entire migration
        }
      }

      console.log(`Processed batch: ${totalProcessed} strategies updated, ${totalErrors} errors`);
      offset += batchSize;
    }

    console.log(`Backfill complete: ${totalProcessed} strategies updated, ${totalErrors} errors total`);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log('Revert complete');
  }
}
