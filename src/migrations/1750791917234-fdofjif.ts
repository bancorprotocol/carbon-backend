import { MigrationInterface, QueryRunner } from "typeorm";

export class Fdofjif1750791917234 implements MigrationInterface {
    name = 'Fdofjif1750791917234'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_dex_screener_events_v2_blockchain_type"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dex_screener_events_v2_unique"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dex_screener_events_v2_exchange_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dex_screener_events_v2_block_number"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dex_screener_events_v2_pair_id"`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" DROP COLUMN "asset0In"`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" ADD "asset0In" text`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" DROP COLUMN "asset1In"`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" ADD "asset1In" text`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" DROP COLUMN "asset0Out"`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" ADD "asset0Out" text`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" DROP COLUMN "asset1Out"`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" ADD "asset1Out" text`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" DROP COLUMN "priceNative"`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" ADD "priceNative" text`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" DROP COLUMN "amount0"`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" ADD "amount0" text`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" DROP COLUMN "amount1"`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" ADD "amount1" text`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" DROP COLUMN "reserves0"`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" ADD "reserves0" text NOT NULL`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" DROP COLUMN "reserves1"`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" ADD "reserves1" text NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_c273030935e2523a2234c5f599" ON "dex-screener-events-v2" ("blockchainType") `);
        await queryRunner.query(`CREATE INDEX "IDX_33602713fc3a407b3339779a70" ON "dex-screener-events-v2" ("exchangeId") `);
        await queryRunner.query(`CREATE INDEX "IDX_ba528ae0047316788442818541" ON "dex-screener-events-v2" ("blockNumber") `);
        await queryRunner.query(`CREATE INDEX "IDX_796857bda3778fa715da7d2f98" ON "dex-screener-events-v2" ("pairId") `);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" ADD CONSTRAINT "UQ_f3686345a687ce5b53c240c1c2c" UNIQUE ("blockchainType", "exchangeId", "blockNumber", "txnId", "txnIndex", "eventIndex", "eventType")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" DROP CONSTRAINT "UQ_f3686345a687ce5b53c240c1c2c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_796857bda3778fa715da7d2f98"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ba528ae0047316788442818541"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_33602713fc3a407b3339779a70"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c273030935e2523a2234c5f599"`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" DROP COLUMN "reserves1"`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" ADD "reserves1" numeric(78,18) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" DROP COLUMN "reserves0"`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" ADD "reserves0" numeric(78,18) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" DROP COLUMN "amount1"`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" ADD "amount1" numeric(78,18)`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" DROP COLUMN "amount0"`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" ADD "amount0" numeric(78,18)`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" DROP COLUMN "priceNative"`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" ADD "priceNative" numeric(78,18)`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" DROP COLUMN "asset1Out"`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" ADD "asset1Out" numeric(78,18)`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" DROP COLUMN "asset0Out"`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" ADD "asset0Out" numeric(78,18)`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" DROP COLUMN "asset1In"`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" ADD "asset1In" numeric(78,18)`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" DROP COLUMN "asset0In"`);
        await queryRunner.query(`ALTER TABLE "dex-screener-events-v2" ADD "asset0In" numeric(78,18)`);
        await queryRunner.query(`CREATE INDEX "IDX_dex_screener_events_v2_pair_id" ON "dex-screener-events-v2" ("pairId") `);
        await queryRunner.query(`CREATE INDEX "IDX_dex_screener_events_v2_block_number" ON "dex-screener-events-v2" ("blockNumber") `);
        await queryRunner.query(`CREATE INDEX "IDX_dex_screener_events_v2_exchange_id" ON "dex-screener-events-v2" ("exchangeId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_dex_screener_events_v2_unique" ON "dex-screener-events-v2" ("blockchainType", "exchangeId", "blockNumber", "eventType", "txnId", "txnIndex", "eventIndex") `);
        await queryRunner.query(`CREATE INDEX "IDX_dex_screener_events_v2_blockchain_type" ON "dex-screener-events-v2" ("blockchainType") `);
    }

}
