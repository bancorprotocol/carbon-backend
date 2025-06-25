import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDexScreenerV21750866464083 implements MigrationInterface {
  name = 'AddDexScreenerV21750866464083';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "dex-screener-events-v2" ("id" SERIAL NOT NULL, "blockchainType" character varying NOT NULL, "exchangeId" character varying NOT NULL, "blockNumber" integer NOT NULL, "blockTimestamp" TIMESTAMP NOT NULL, "eventType" character varying NOT NULL, "txnId" character varying NOT NULL, "txnIndex" integer NOT NULL, "eventIndex" numeric(10,1) NOT NULL, "maker" character varying NOT NULL, "pairId" integer NOT NULL, "asset0In" text, "asset1In" text, "asset0Out" text, "asset1Out" text, "priceNative" text, "amount0" text, "amount1" text, "reserves0" text NOT NULL, "reserves1" text NOT NULL, CONSTRAINT "UQ_f3686345a687ce5b53c240c1c2c" UNIQUE ("blockchainType", "exchangeId", "blockNumber", "txnId", "txnIndex", "eventIndex", "eventType"), CONSTRAINT "PK_31011708532dde593dc7532f4e3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c273030935e2523a2234c5f599" ON "dex-screener-events-v2" ("blockchainType") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_33602713fc3a407b3339779a70" ON "dex-screener-events-v2" ("exchangeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ba528ae0047316788442818541" ON "dex-screener-events-v2" ("blockNumber") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_796857bda3778fa715da7d2f98" ON "dex-screener-events-v2" ("pairId") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_796857bda3778fa715da7d2f98"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ba528ae0047316788442818541"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_33602713fc3a407b3339779a70"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c273030935e2523a2234c5f599"`);
    await queryRunner.query(`DROP TABLE "dex-screener-events-v2"`);
  }
}
