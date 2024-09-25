import { MigrationInterface, QueryRunner } from 'typeorm';

export class HyperTokensTraded1727095200919 implements MigrationInterface {
  name = 'HyperTokensTraded1727095200919';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" DROP CONSTRAINT "UQ_908649b973c9978cd4235cf1cc9"`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" DROP CONSTRAINT "PK_5aa00d572774b0b66ee8ea01314"`);
    await queryRunner.query(
      `ALTER TABLE "tokens-traded-events" ADD CONSTRAINT "PK_76de9df9844fedaa60a29e88410" PRIMARY KEY ("id", "timestamp")`,
    );
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" DROP COLUMN "trader"`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" ADD "trader" text NOT NULL`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" DROP COLUMN "type"`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" ADD "type" text NOT NULL`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" DROP COLUMN "sourceAmount"`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" ADD "sourceAmount" text NOT NULL`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" DROP COLUMN "targetAmount"`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" ADD "targetAmount" text NOT NULL`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" DROP COLUMN "tradingFeeAmount"`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" ADD "tradingFeeAmount" text NOT NULL`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" DROP COLUMN "transactionHash"`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" ADD "transactionHash" text NOT NULL`);
    await queryRunner.query(`DROP INDEX "public"."IDX_94fd1b26cb2dbeeba497fa79ba"`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" DROP COLUMN "callerId"`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" ADD "callerId" text`);
    await queryRunner.query(`CREATE INDEX "IDX_c081dde529d0e03627b56844e4" ON "tokens-traded-events" ("pairId") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_c03a21b4dead9ab3345f3ad490" ON "tokens-traded-events" ("sourceTokenId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4bec19484efcbe1a523521c5fe" ON "tokens-traded-events" ("targetTokenId") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_4b447c4070d7d9f532817c8867" ON "tokens-traded-events" ("trader") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_6d5a448e3ac65b30cc6ebb45b4" ON "tokens-traded-events" ("transactionIndex") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_974b69b8082522efa7f2ba47c1" ON "tokens-traded-events" ("transactionHash") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_94fd1b26cb2dbeeba497fa79ba" ON "tokens-traded-events" ("callerId") `);
    await queryRunner.query(`CREATE INDEX "IDX_a6f4a2c99c4cad6663f94935fc" ON "tokens-traded-events" ("logIndex") `);
    await queryRunner.query(`CREATE INDEX "IDX_5ad4851dae6f841d71d1b631b3" ON "tokens-traded-events" ("timestamp") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_89f2258231d48af5d0d43e3ecd" ON "tokens-traded-events" ("trader", "blockchainType", "exchangeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2342ae203567a867b6fe366929" ON "tokens-traded-events" ("targetTokenId", "blockchainType", "exchangeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1117c3f900aaa2af9d97c39513" ON "tokens-traded-events" ("sourceTokenId", "blockchainType", "exchangeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e84271b4e93070bc7a68cabc9e" ON "tokens-traded-events" ("pairId", "blockchainType", "exchangeId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "tokens-traded-events" ADD CONSTRAINT "UQ_7a43713f7ecc6bed9db2a945327" UNIQUE ("transactionIndex", "transactionHash", "logIndex", "timestamp")`,
    );
    await queryRunner.query(`SELECT create_hypertable('tokens-traded-events', 'timestamp')`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" DROP CONSTRAINT "UQ_7a43713f7ecc6bed9db2a945327"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e84271b4e93070bc7a68cabc9e"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_1117c3f900aaa2af9d97c39513"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2342ae203567a867b6fe366929"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_89f2258231d48af5d0d43e3ecd"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_5ad4851dae6f841d71d1b631b3"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a6f4a2c99c4cad6663f94935fc"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_94fd1b26cb2dbeeba497fa79ba"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_974b69b8082522efa7f2ba47c1"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_6d5a448e3ac65b30cc6ebb45b4"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_4b447c4070d7d9f532817c8867"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_4bec19484efcbe1a523521c5fe"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c03a21b4dead9ab3345f3ad490"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c081dde529d0e03627b56844e4"`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" DROP COLUMN "callerId"`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" ADD "callerId" character varying`);
    await queryRunner.query(`CREATE INDEX "IDX_94fd1b26cb2dbeeba497fa79ba" ON "tokens-traded-events" ("callerId") `);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" DROP COLUMN "transactionHash"`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" ADD "transactionHash" character varying NOT NULL`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" DROP COLUMN "tradingFeeAmount"`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" ADD "tradingFeeAmount" character varying NOT NULL`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" DROP COLUMN "targetAmount"`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" ADD "targetAmount" character varying NOT NULL`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" DROP COLUMN "sourceAmount"`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" ADD "sourceAmount" character varying NOT NULL`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" DROP COLUMN "type"`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" ADD "type" character varying NOT NULL`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" DROP COLUMN "trader"`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" ADD "trader" character varying NOT NULL`);
    await queryRunner.query(`ALTER TABLE "tokens-traded-events" DROP CONSTRAINT "PK_76de9df9844fedaa60a29e88410"`);
    await queryRunner.query(
      `ALTER TABLE "tokens-traded-events" ADD CONSTRAINT "PK_5aa00d572774b0b66ee8ea01314" PRIMARY KEY ("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "tokens-traded-events" ADD CONSTRAINT "UQ_908649b973c9978cd4235cf1cc9" UNIQUE ("transactionIndex", "transactionHash", "logIndex")`,
    );
  }
}
