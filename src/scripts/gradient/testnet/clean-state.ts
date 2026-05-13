/**
 * Gradient Testnet DB Cleanup
 *
 * Wipes gradient_* tables for the ethereum/ethereum deployment and resets the
 * gradient-related last_processed_block rows so harvesting starts fresh from a
 * Tenderly fork created by `gradient/testnet/create.sh --run`.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register src/scripts/gradient/testnet/clean-state.ts <syncBlock>
 *
 * Required env:
 *   DATABASE_URL
 */
import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const BLOCKCHAIN_TYPE = 'ethereum';
const EXCHANGE_ID = 'ethereum';

const GRADIENT_TABLES = [
  'gradient_strategies',
  'gradient_strategy_realtime',
  'gradient_strategy_created_events',
  'gradient_strategy_updated_events',
  'gradient_strategy_deleted_events',
  'gradient_strategy_liquidity_updated_events',
  'gradient_trading_fee_ppm_events',
  'gradient_pair_trading_fee_ppm_events',
];

const GRADIENT_LPB_KEYS = [
  'ethereum-ethereum-gradient-strategy-created-events',
  'ethereum-ethereum-gradient-strategy-updated-events',
  'ethereum-ethereum-gradient-strategy-deleted-events',
  'ethereum-ethereum-gradient-strategy-liquidity-updated-events',
  'ethereum-ethereum-gradient-activities',
  'ethereum-ethereum-gradient-pair-created-events',
  'ethereum-ethereum-gradient-tokens-traded-events',
  'ethereum-ethereum-gradient-trading-fee-ppm-events',
  'ethereum-ethereum-gradient-pair-trading-fee-ppm-events',
  'ethereum-ethereum-gradient-voucher-transfer-events',
  'ethereum-ethereum-gradient-dex-screener-v2',
  'ethereum-ethereum-gradient-strategies',
];

async function main(): Promise<void> {
  const arg = process.argv[2];
  const syncBlock = parseInt(arg, 10);
  if (!Number.isFinite(syncBlock)) {
    throw new Error('clean-state.ts: <syncBlock> must be an integer (got: ' + arg + ')');
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('clean-state.ts: DATABASE_URL is required');
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    for (const table of GRADIENT_TABLES) {
      await client.query(`DELETE FROM "${table}" WHERE "blockchainType" = $1 AND "exchangeId" = $2`, [
        BLOCKCHAIN_TYPE,
        EXCHANGE_ID,
      ]);
    }

    for (const key of GRADIENT_LPB_KEYS) {
      await client.query('DELETE FROM last_processed_block WHERE param = $1', [key]);
      await client.query('INSERT INTO last_processed_block (param, block) VALUES ($1, $2)', [key, syncBlock]);
    }

    // activities-v2 is a shared table — drop only rows owned by gradient strategies.
    // Failure-tolerant: the table or owning rows may not exist on a fresh DB.
    await client
      .query(
        `DELETE FROM "activities-v2"
         WHERE "blockchainType" = $1
           AND "exchangeId" = $2
           AND "currentOwner" IN (
             SELECT DISTINCT "owner" FROM gradient_strategy_created_events
             WHERE "blockchainType" = $1 AND "exchangeId" = $2
           )`,
        [BLOCKCHAIN_TYPE, EXCHANGE_ID],
      )
      .catch(() => undefined);

    console.log(`  Cleaned gradient tables and set lastProcessedBlock to ${syncBlock}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
