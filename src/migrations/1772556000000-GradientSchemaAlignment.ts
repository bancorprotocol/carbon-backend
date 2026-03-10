import { MigrationInterface, QueryRunner } from 'typeorm';

export class GradientSchemaAlignment1772556000000 implements MigrationInterface {
  name = 'GradientSchemaAlignment1772556000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop existing gradient event tables (they will be re-harvested with proper FK structure)
    await queryRunner.query(`DROP TABLE IF EXISTS "gradient_strategy_liquidity_updated_events" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gradient_strategy_created_events" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gradient_strategy_updated_events" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gradient_strategy_deleted_events" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gradient_trading_fee_ppm_events" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gradient_pair_trading_fee_ppm_events" CASCADE`);

    // Clear last_processed_block entries so gradient events are re-harvested
    await queryRunner.query(`DELETE FROM "last_processed_block" WHERE "param" LIKE '%gradient-%'`);

    // 1. gradient_strategy_created_events with FK relations
    await queryRunner.query(`
      CREATE TABLE "gradient_strategy_created_events" (
        "id" SERIAL NOT NULL,
        "blockchainType" character varying NOT NULL,
        "exchangeId" character varying NOT NULL,
        "strategyId" character varying NOT NULL,
        "transactionHash" character varying NOT NULL,
        "transactionIndex" integer NOT NULL,
        "logIndex" integer NOT NULL,
        "timestamp" TIMESTAMP,
        "owner" character varying NOT NULL DEFAULT '',
        "order0Liquidity" character varying NOT NULL,
        "order0InitialPrice" character varying NOT NULL,
        "order0TradingStartTime" integer NOT NULL,
        "order0Expiry" integer NOT NULL,
        "order0MultiFactor" character varying NOT NULL,
        "order0GradientType" character varying NOT NULL,
        "order1Liquidity" character varying NOT NULL,
        "order1InitialPrice" character varying NOT NULL,
        "order1TradingStartTime" integer NOT NULL,
        "order1Expiry" integer NOT NULL,
        "order1MultiFactor" character varying NOT NULL,
        "order1GradientType" character varying NOT NULL,
        "token0Id" integer,
        "token1Id" integer,
        "pairId" integer,
        "blockId" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_grad_created_txidx_txhash_log" UNIQUE ("transactionIndex", "transactionHash", "logIndex"),
        CONSTRAINT "PK_grad_created" PRIMARY KEY ("id"),
        CONSTRAINT "FK_grad_created_token0" FOREIGN KEY ("token0Id") REFERENCES "tokens"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_grad_created_token1" FOREIGN KEY ("token1Id") REFERENCES "tokens"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_grad_created_pair" FOREIGN KEY ("pairId") REFERENCES "pairs"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_grad_created_block" FOREIGN KEY ("blockId") REFERENCES "blocks"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_grad_created_bc" ON "gradient_strategy_created_events" ("blockchainType")`);
    await queryRunner.query(`CREATE INDEX "IDX_grad_created_ex" ON "gradient_strategy_created_events" ("exchangeId")`);
    await queryRunner.query(`CREATE INDEX "IDX_grad_created_sid" ON "gradient_strategy_created_events" ("strategyId")`);
    await queryRunner.query(`CREATE INDEX "IDX_grad_created_block" ON "gradient_strategy_created_events" ("blockId")`);
    await queryRunner.query(`CREATE INDEX "IDX_grad_created_ts" ON "gradient_strategy_created_events" ("timestamp")`);
    await queryRunner.query(`CREATE INDEX "IDX_grad_created_t0" ON "gradient_strategy_created_events" ("token0Id")`);
    await queryRunner.query(`CREATE INDEX "IDX_grad_created_t1" ON "gradient_strategy_created_events" ("token1Id")`);

    // 2. gradient_strategy_updated_events with FK relations
    await queryRunner.query(`
      CREATE TABLE "gradient_strategy_updated_events" (
        "id" SERIAL NOT NULL,
        "blockchainType" character varying NOT NULL,
        "exchangeId" character varying NOT NULL,
        "strategyId" character varying NOT NULL,
        "transactionHash" character varying NOT NULL,
        "transactionIndex" integer NOT NULL,
        "logIndex" integer NOT NULL,
        "timestamp" TIMESTAMP,
        "order0Liquidity" character varying NOT NULL,
        "order0InitialPrice" character varying NOT NULL,
        "order0TradingStartTime" integer NOT NULL,
        "order0Expiry" integer NOT NULL,
        "order0MultiFactor" character varying NOT NULL,
        "order0GradientType" character varying NOT NULL,
        "order1Liquidity" character varying NOT NULL,
        "order1InitialPrice" character varying NOT NULL,
        "order1TradingStartTime" integer NOT NULL,
        "order1Expiry" integer NOT NULL,
        "order1MultiFactor" character varying NOT NULL,
        "order1GradientType" character varying NOT NULL,
        "token0Id" integer,
        "token1Id" integer,
        "pairId" integer,
        "blockId" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_grad_updated_txidx_txhash_log" UNIQUE ("transactionIndex", "transactionHash", "logIndex"),
        CONSTRAINT "PK_grad_updated" PRIMARY KEY ("id"),
        CONSTRAINT "FK_grad_updated_token0" FOREIGN KEY ("token0Id") REFERENCES "tokens"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_grad_updated_token1" FOREIGN KEY ("token1Id") REFERENCES "tokens"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_grad_updated_pair" FOREIGN KEY ("pairId") REFERENCES "pairs"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_grad_updated_block" FOREIGN KEY ("blockId") REFERENCES "blocks"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_grad_updated_bc" ON "gradient_strategy_updated_events" ("blockchainType")`);
    await queryRunner.query(`CREATE INDEX "IDX_grad_updated_ex" ON "gradient_strategy_updated_events" ("exchangeId")`);
    await queryRunner.query(`CREATE INDEX "IDX_grad_updated_sid" ON "gradient_strategy_updated_events" ("strategyId")`);
    await queryRunner.query(`CREATE INDEX "IDX_grad_updated_block" ON "gradient_strategy_updated_events" ("blockId")`);
    await queryRunner.query(`CREATE INDEX "IDX_grad_updated_ts" ON "gradient_strategy_updated_events" ("timestamp")`);

    // 3. gradient_strategy_deleted_events with FK relations
    await queryRunner.query(`
      CREATE TABLE "gradient_strategy_deleted_events" (
        "id" SERIAL NOT NULL,
        "blockchainType" character varying NOT NULL,
        "exchangeId" character varying NOT NULL,
        "strategyId" character varying NOT NULL,
        "transactionHash" character varying NOT NULL,
        "transactionIndex" integer NOT NULL,
        "logIndex" integer NOT NULL,
        "timestamp" TIMESTAMP,
        "order0Liquidity" character varying NOT NULL,
        "order0InitialPrice" character varying NOT NULL,
        "order0TradingStartTime" integer NOT NULL,
        "order0Expiry" integer NOT NULL,
        "order0MultiFactor" character varying NOT NULL,
        "order0GradientType" character varying NOT NULL,
        "order1Liquidity" character varying NOT NULL,
        "order1InitialPrice" character varying NOT NULL,
        "order1TradingStartTime" integer NOT NULL,
        "order1Expiry" integer NOT NULL,
        "order1MultiFactor" character varying NOT NULL,
        "order1GradientType" character varying NOT NULL,
        "token0Id" integer,
        "token1Id" integer,
        "pairId" integer,
        "blockId" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_grad_deleted_txidx_txhash_log" UNIQUE ("transactionIndex", "transactionHash", "logIndex"),
        CONSTRAINT "PK_grad_deleted" PRIMARY KEY ("id"),
        CONSTRAINT "FK_grad_deleted_token0" FOREIGN KEY ("token0Id") REFERENCES "tokens"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_grad_deleted_token1" FOREIGN KEY ("token1Id") REFERENCES "tokens"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_grad_deleted_pair" FOREIGN KEY ("pairId") REFERENCES "pairs"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_grad_deleted_block" FOREIGN KEY ("blockId") REFERENCES "blocks"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_grad_deleted_bc" ON "gradient_strategy_deleted_events" ("blockchainType")`);
    await queryRunner.query(`CREATE INDEX "IDX_grad_deleted_ex" ON "gradient_strategy_deleted_events" ("exchangeId")`);
    await queryRunner.query(`CREATE INDEX "IDX_grad_deleted_sid" ON "gradient_strategy_deleted_events" ("strategyId")`);
    await queryRunner.query(`CREATE INDEX "IDX_grad_deleted_block" ON "gradient_strategy_deleted_events" ("blockId")`);
    await queryRunner.query(`CREATE INDEX "IDX_grad_deleted_ts" ON "gradient_strategy_deleted_events" ("timestamp")`);

    // 4. gradient_strategy_liquidity_updated_events with FK relations
    await queryRunner.query(`
      CREATE TABLE "gradient_strategy_liquidity_updated_events" (
        "id" SERIAL NOT NULL,
        "blockchainType" character varying NOT NULL,
        "exchangeId" character varying NOT NULL,
        "strategyId" character varying NOT NULL,
        "transactionHash" character varying NOT NULL,
        "transactionIndex" integer NOT NULL,
        "logIndex" integer NOT NULL,
        "timestamp" TIMESTAMP,
        "liquidity0" character varying NOT NULL,
        "liquidity1" character varying NOT NULL,
        "token0Id" integer,
        "token1Id" integer,
        "pairId" integer,
        "blockId" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_grad_liq_upd_txidx_txhash_log" UNIQUE ("transactionIndex", "transactionHash", "logIndex"),
        CONSTRAINT "PK_grad_liq_upd" PRIMARY KEY ("id"),
        CONSTRAINT "FK_grad_liq_upd_token0" FOREIGN KEY ("token0Id") REFERENCES "tokens"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_grad_liq_upd_token1" FOREIGN KEY ("token1Id") REFERENCES "tokens"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_grad_liq_upd_pair" FOREIGN KEY ("pairId") REFERENCES "pairs"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_grad_liq_upd_block" FOREIGN KEY ("blockId") REFERENCES "blocks"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_grad_liq_upd_bc" ON "gradient_strategy_liquidity_updated_events" ("blockchainType")`);
    await queryRunner.query(`CREATE INDEX "IDX_grad_liq_upd_ex" ON "gradient_strategy_liquidity_updated_events" ("exchangeId")`);
    await queryRunner.query(`CREATE INDEX "IDX_grad_liq_upd_sid" ON "gradient_strategy_liquidity_updated_events" ("strategyId")`);
    await queryRunner.query(`CREATE INDEX "IDX_grad_liq_upd_block" ON "gradient_strategy_liquidity_updated_events" ("blockId")`);
    await queryRunner.query(`CREATE INDEX "IDX_grad_liq_upd_ts" ON "gradient_strategy_liquidity_updated_events" ("timestamp")`);

    // 5. gradient_trading_fee_ppm_events with FK block relation
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "gradient_trading_fee_ppm_events_new" (
        "id" SERIAL NOT NULL,
        "blockchainType" character varying NOT NULL,
        "exchangeId" character varying NOT NULL,
        "transactionHash" character varying NOT NULL,
        "transactionIndex" integer NOT NULL,
        "logIndex" integer NOT NULL,
        "timestamp" TIMESTAMP,
        "prevFeePPM" integer NOT NULL,
        "newFeePPM" integer NOT NULL,
        "blockId" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_grad_fee_txidx_txhash_log" UNIQUE ("transactionIndex", "transactionHash", "logIndex"),
        CONSTRAINT "PK_grad_fee" PRIMARY KEY ("id"),
        CONSTRAINT "FK_grad_fee_block" FOREIGN KEY ("blockId") REFERENCES "blocks"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "gradient_trading_fee_ppm_events" CASCADE`);
    await queryRunner.query(`ALTER TABLE "gradient_trading_fee_ppm_events_new" RENAME TO "gradient_trading_fee_ppm_events"`);
    await queryRunner.query(`CREATE INDEX "IDX_grad_fee_bc" ON "gradient_trading_fee_ppm_events" ("blockchainType")`);
    await queryRunner.query(`CREATE INDEX "IDX_grad_fee_ex" ON "gradient_trading_fee_ppm_events" ("exchangeId")`);
    await queryRunner.query(`CREATE INDEX "IDX_grad_fee_block" ON "gradient_trading_fee_ppm_events" ("blockId")`);
    await queryRunner.query(`CREATE INDEX "IDX_grad_fee_ts" ON "gradient_trading_fee_ppm_events" ("timestamp")`);

    // 6. gradient_pair_trading_fee_ppm_events with FK pair and block relations
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "gradient_pair_trading_fee_ppm_events_new" (
        "id" SERIAL NOT NULL,
        "blockchainType" character varying NOT NULL,
        "exchangeId" character varying NOT NULL,
        "transactionHash" character varying NOT NULL,
        "transactionIndex" integer NOT NULL,
        "logIndex" integer NOT NULL,
        "timestamp" TIMESTAMP,
        "prevFeePPM" integer NOT NULL,
        "newFeePPM" integer NOT NULL,
        "pairId" integer,
        "blockId" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_grad_pair_fee_txidx_txhash_log" UNIQUE ("transactionIndex", "transactionHash", "logIndex"),
        CONSTRAINT "PK_grad_pair_fee" PRIMARY KEY ("id"),
        CONSTRAINT "FK_grad_pair_fee_pair" FOREIGN KEY ("pairId") REFERENCES "pairs"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_grad_pair_fee_block" FOREIGN KEY ("blockId") REFERENCES "blocks"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "gradient_pair_trading_fee_ppm_events" CASCADE`);
    await queryRunner.query(`ALTER TABLE "gradient_pair_trading_fee_ppm_events_new" RENAME TO "gradient_pair_trading_fee_ppm_events"`);
    await queryRunner.query(`CREATE INDEX "IDX_grad_pair_fee_bc" ON "gradient_pair_trading_fee_ppm_events" ("blockchainType")`);
    await queryRunner.query(`CREATE INDEX "IDX_grad_pair_fee_ex" ON "gradient_pair_trading_fee_ppm_events" ("exchangeId")`);
    await queryRunner.query(`CREATE INDEX "IDX_grad_pair_fee_block" ON "gradient_pair_trading_fee_ppm_events" ("blockId")`);
    await queryRunner.query(`CREATE INDEX "IDX_grad_pair_fee_ts" ON "gradient_pair_trading_fee_ppm_events" ("timestamp")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "gradient_pair_trading_fee_ppm_events" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gradient_trading_fee_ppm_events" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gradient_strategy_liquidity_updated_events" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gradient_strategy_deleted_events" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gradient_strategy_updated_events" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gradient_strategy_created_events" CASCADE`);
  }
}
