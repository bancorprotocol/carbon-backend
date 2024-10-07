import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTotalTvlTable1726683511863 implements MigrationInterface {
  name = 'AddTotalTvlTable1726683511863';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."total-tvl_blockchaintype_enum" AS ENUM('ethereum', 'sei-network', 'celo', 'blast')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."total-tvl_exchangeid_enum" AS ENUM('ethereum', 'sei', 'celo', 'blast')`,
    );
    await queryRunner.query(
      `CREATE TABLE "total-tvl" ("id" SERIAL NOT NULL, "blockchainType" "public"."total-tvl_blockchaintype_enum" NOT NULL, "exchangeId" "public"."total-tvl_exchangeid_enum" NOT NULL, "timestamp" TIMESTAMP NOT NULL, "tvl" text NOT NULL, CONSTRAINT "UQ_7fe5b00781f6564ec055b4f88ab" UNIQUE ("blockchainType", "exchangeId", "timestamp"), CONSTRAINT "PK_11e6b29ef16c61c5364a9d78c14" PRIMARY KEY ("id", "timestamp"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_77a80f3a926a86c52efa22402a" ON "total-tvl" ("blockchainType") `);
    await queryRunner.query(`CREATE INDEX "IDX_03e591b57b14a9618bcb029583" ON "total-tvl" ("exchangeId") `);
    await queryRunner.query(`CREATE INDEX "IDX_ef67aba5c92802261b541d5288" ON "total-tvl" ("timestamp") `);
    await queryRunner.query(`SELECT create_hypertable('total-tvl', 'timestamp')`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_ef67aba5c92802261b541d5288"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_03e591b57b14a9618bcb029583"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_77a80f3a926a86c52efa22402a"`);
    await queryRunner.query(`DROP TABLE "total-tvl"`);
    await queryRunner.query(`DROP TYPE "public"."total-tvl_exchangeid_enum"`);
    await queryRunner.query(`DROP TYPE "public"."total-tvl_blockchaintype_enum"`);
  }
}
