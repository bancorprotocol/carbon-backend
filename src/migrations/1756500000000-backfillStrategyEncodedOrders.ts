import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillStrategyEncodedOrders1756500000000 implements MigrationInterface {
  name = 'BackfillStrategyEncodedOrders1756500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log('Starting backfill of strategy encoded orders and owners...');

    // Process in batches
    const batchSize = 100;
    let offset = 0;
    let totalProcessed = 0;
    let totalErrors = 0;

    while (true) {
      // Fetch strategies in batches
      const strategies = await queryRunner.query(
        `
        SELECT 
          s.id,
          s."blockchainType",
          s."exchangeId",
          s."strategyId"
        FROM strategies s
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
          // Get latest encoded orders
          const latestEventResult = await queryRunner.query(
            `
            WITH latest_events AS (
              SELECT DISTINCT ON (strategy_id)
                strategy_id,
                order0,
                order1,
                owner,
                block_id,
                transaction_index,
                log_index
              FROM (
                SELECT
                  c."strategyId" as strategy_id,
                  c.order0,
                  c.order1,
                  c.owner,
                  c."blockId" as block_id,
                  c."transactionIndex" as transaction_index,
                  c."logIndex" as log_index
                FROM "strategy-created-events" c
                WHERE c."strategyId" = $1
                  AND c."blockchainType" = $2
                  AND c."exchangeId" = $3
                
                UNION ALL
                
                SELECT
                  u."strategyId" as strategy_id,
                  u.order0,
                  u.order1,
                  null as owner,
                  u."blockId" as block_id,
                  u."transactionIndex" as transaction_index,
                  u."logIndex" as log_index
                FROM "strategy-updated-events" u
                WHERE u."strategyId" = $1
                  AND u."blockchainType" = $2
                  AND u."exchangeId" = $3
              ) combined
              ORDER BY strategy_id, block_id DESC, transaction_index DESC, log_index DESC
            )
            SELECT * FROM latest_events
            `,
            [strategy.strategyId, strategy.blockchainType, strategy.exchangeId],
          );

          if (latestEventResult.length === 0) {
            // Skip strategies with no events
            continue;
          }

          const latestEvent = latestEventResult[0];
          const encodedOrder0 = latestEvent.order0;
          const encodedOrder1 = latestEvent.order1;

          // Get latest owner from transfer events
          const latestOwnerResult = await queryRunner.query(
            `
            SELECT "to" as owner
            FROM "voucher-transfer-events"
            WHERE "strategyId" = $1
              AND "blockchainType" = $2
              AND "exchangeId" = $3
            ORDER BY "blockId" DESC, "transactionIndex" DESC, "logIndex" DESC
            LIMIT 1
            `,
            [strategy.strategyId, strategy.blockchainType, strategy.exchangeId],
          );

          const owner = latestOwnerResult.length > 0 ? latestOwnerResult[0].owner : latestEvent.owner;

          if (!encodedOrder0 || !encodedOrder1) {
            // Skip strategies with missing encoded orders
            continue;
          }

          // Update strategy with encoded orders and owner only
          // The next migration will handle decoding the values
          await queryRunner.query(
            `
            UPDATE strategies
            SET 
              "encodedOrder0" = $1,
              "encodedOrder1" = $2,
              "owner" = $3
            WHERE id = $4
            `,
            [encodedOrder0, encodedOrder1, owner, strategy.id],
          );

          totalProcessed++;
        } catch (error) {
          console.error(`Error processing strategy ${strategy.strategyId}:`, error.message);
          totalErrors++;
          // Continue to next strategy instead of failing entire migration
        }
      }

      console.log(`Processed batch: ${totalProcessed} strategies updated, ${totalErrors} errors (offset: ${offset})`);
      offset += batchSize;
    }

    console.log(`Backfill complete: ${totalProcessed} strategies updated, ${totalErrors} errors total`);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log('Revert complete - no action needed');
  }
}
