import { MigrationInterface, QueryRunner } from 'typeorm';

export class VolumeRefactor1725977797719 implements MigrationInterface {
  name = 'VolumeRefactor1725977797719';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."volume_blockchaintype_enum" AS ENUM('ethereum', 'sei-network', 'celo', 'blast')`,
    );
    await queryRunner.query(`ALTER TABLE "volume" ADD "blockchainType" "public"."volume_blockchaintype_enum" NOT NULL`);
    await queryRunner.query(
      `CREATE TYPE "public"."volume_exchangeid_enum" AS ENUM('ethereum', 'sei', 'celo', 'blast')`,
    );
    await queryRunner.query(`ALTER TABLE "volume" ADD "exchangeId" "public"."volume_exchangeid_enum" NOT NULL`);
    await queryRunner.query(`ALTER TABLE "volume" ADD "pairId" integer NOT NULL`);
    await queryRunner.query(`ALTER TABLE "volume" ADD "blockNumber" integer NOT NULL`);
    await queryRunner.query(`ALTER TABLE "volume" ADD "transactionIndex" integer NOT NULL`);
    await queryRunner.query(`ALTER TABLE "volume" DROP CONSTRAINT "PK_666025cd0c36727216bb7f2a680"`);
    await queryRunner.query(
      `ALTER TABLE "volume" ADD CONSTRAINT "PK_e97dc8e2b9df850fcb223ed6174" PRIMARY KEY ("id", "timestamp")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_db648c938603c1079d7e44f07a" ON "volume" ("blockchainType") `);
    await queryRunner.query(`CREATE INDEX "IDX_91f1aa58d47c8ffc81adad6fb1" ON "volume" ("exchangeId") `);
    await queryRunner.query(`CREATE INDEX "IDX_2f7bb4fc384a68a13f3bf4574f" ON "volume" ("pairId") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_796a52b2eb7472206c0fe9d62d" ON "volume" ("feeAddress", "blockchainType", "exchangeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5231f9fa521998b7fb45c582ad" ON "volume" ("targetAddress", "blockchainType", "exchangeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a637489965565d258cae2283b4" ON "volume" ("pairId", "blockchainType", "exchangeId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "volume" ADD CONSTRAINT "UQ_25d27c92dd0baa9b519f62d62b7" UNIQUE ("blockchainType", "exchangeId", "timestamp", "blockNumber", "transactionIndex", "feeSymbol", "feeAddress", "tradingFeeAmountReal", "tradingFeeAmountUsd", "targetSymbol", "targetAddress", "targetAmountReal", "targetAmountUsd")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "volume" DROP CONSTRAINT "UQ_25d27c92dd0baa9b519f62d62b7"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a637489965565d258cae2283b4"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_5231f9fa521998b7fb45c582ad"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_796a52b2eb7472206c0fe9d62d"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2f7bb4fc384a68a13f3bf4574f"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_91f1aa58d47c8ffc81adad6fb1"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_db648c938603c1079d7e44f07a"`);
    await queryRunner.query(`ALTER TABLE "volume" DROP CONSTRAINT "PK_e97dc8e2b9df850fcb223ed6174"`);
    await queryRunner.query(`ALTER TABLE "volume" ADD CONSTRAINT "PK_666025cd0c36727216bb7f2a680" PRIMARY KEY ("id")`);
    await queryRunner.query(`ALTER TABLE "volume" DROP COLUMN "transactionIndex"`);
    await queryRunner.query(`ALTER TABLE "volume" DROP COLUMN "blockNumber"`);
    await queryRunner.query(`ALTER TABLE "volume" DROP COLUMN "pairId"`);
    await queryRunner.query(`ALTER TABLE "volume" DROP COLUMN "exchangeId"`);
    await queryRunner.query(`DROP TYPE "public"."volume_exchangeid_enum"`);
    await queryRunner.query(`ALTER TABLE "volume" DROP COLUMN "blockchainType"`);
    await queryRunner.query(`DROP TYPE "public"."volume_blockchaintype_enum"`);
  }
}
