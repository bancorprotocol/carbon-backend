import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDexScreenerV21749568607199 implements MigrationInterface {
  name = 'AddDexScreenerV21749568607199';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "dex-screener-events-v2" (
                "id" SERIAL NOT NULL,
                "blockchainType" character varying NOT NULL,
                "exchangeId" character varying NOT NULL,
                "blockNumber" integer NOT NULL,
                "blockTimestamp" TIMESTAMP NOT NULL,
                "eventType" character varying NOT NULL,
                "txnId" character varying NOT NULL,
                "txnIndex" integer NOT NULL,
                "eventIndex" numeric(10,1) NOT NULL,
                "maker" character varying NOT NULL,
                "pairId" integer NOT NULL,
                "asset0In" numeric(78,18),
                "asset1In" numeric(78,18),
                "asset0Out" numeric(78,18),
                "asset1Out" numeric(78,18),
                "priceNative" numeric(78,18),
                "amount0" numeric(78,18),
                "amount1" numeric(78,18),
                "reserves0" numeric(78,18) NOT NULL,
                "reserves1" numeric(78,18) NOT NULL,
                CONSTRAINT "PK_dex_screener_events_v2_id" PRIMARY KEY ("id")
            )
        `);

    await queryRunner.query(`
            CREATE INDEX "IDX_dex_screener_events_v2_blockchain_type" ON "dex-screener-events-v2" ("blockchainType")
        `);

    await queryRunner.query(`
            CREATE INDEX "IDX_dex_screener_events_v2_exchange_id" ON "dex-screener-events-v2" ("exchangeId")
        `);

    await queryRunner.query(`
            CREATE INDEX "IDX_dex_screener_events_v2_block_number" ON "dex-screener-events-v2" ("blockNumber")
        `);

    await queryRunner.query(`
            CREATE INDEX "IDX_dex_screener_events_v2_pair_id" ON "dex-screener-events-v2" ("pairId")
        `);

    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_dex_screener_events_v2_unique" ON "dex-screener-events-v2" (
                "blockchainType", "exchangeId", "blockNumber", "txnId", "txnIndex", "eventIndex", "eventType"
            )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_dex_screener_events_v2_unique"`);
    await queryRunner.query(`DROP INDEX "IDX_dex_screener_events_v2_pair_id"`);
    await queryRunner.query(`DROP INDEX "IDX_dex_screener_events_v2_block_number"`);
    await queryRunner.query(`DROP INDEX "IDX_dex_screener_events_v2_exchange_id"`);
    await queryRunner.query(`DROP INDEX "IDX_dex_screener_events_v2_blockchain_type"`);
    await queryRunner.query(`DROP TABLE "dex-screener-events-v2"`);
  }
}
