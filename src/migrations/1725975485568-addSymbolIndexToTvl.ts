import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSymbolIndexToTvl1725975485568 implements MigrationInterface {
    name = 'AddSymbolIndexToTvl1725975485568'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tvl" ALTER COLUMN "tvlUsd" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "tvl" ALTER COLUMN "usdRate" SET NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_068a4a0ae76b8c4595ef9f1a57" ON "tvl" ("symbol") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_068a4a0ae76b8c4595ef9f1a57"`);
        await queryRunner.query(`ALTER TABLE "tvl" ALTER COLUMN "usdRate" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "tvl" ALTER COLUMN "tvlUsd" DROP NOT NULL`);
    }

}
