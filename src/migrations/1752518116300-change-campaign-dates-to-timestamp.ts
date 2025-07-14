import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangeCampaignDatesToTimestamp1752518116300 implements MigrationInterface {
  name = 'ChangeCampaignDatesToTimestamp1752518116300';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_229a90e89f028ccc1dfd904e6a"`);
    await queryRunner.query(`ALTER TABLE "merkl_campaigns" DROP COLUMN "startDate"`);
    await queryRunner.query(`ALTER TABLE "merkl_campaigns" ADD "startDate" TIMESTAMP NOT NULL`);
    await queryRunner.query(`DROP INDEX "public"."IDX_afdcf7118dcb7dedc972c3f0a1"`);
    await queryRunner.query(`ALTER TABLE "merkl_campaigns" DROP COLUMN "endDate"`);
    await queryRunner.query(`ALTER TABLE "merkl_campaigns" ADD "endDate" TIMESTAMP NOT NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_229a90e89f028ccc1dfd904e6a" ON "merkl_campaigns" ("startDate") `);
    await queryRunner.query(`CREATE INDEX "IDX_afdcf7118dcb7dedc972c3f0a1" ON "merkl_campaigns" ("endDate") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_afdcf7118dcb7dedc972c3f0a1"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_229a90e89f028ccc1dfd904e6a"`);
    await queryRunner.query(`ALTER TABLE "merkl_campaigns" DROP COLUMN "endDate"`);
    await queryRunner.query(`ALTER TABLE "merkl_campaigns" ADD "endDate" integer NOT NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_afdcf7118dcb7dedc972c3f0a1" ON "merkl_campaigns" ("endDate") `);
    await queryRunner.query(`ALTER TABLE "merkl_campaigns" DROP COLUMN "startDate"`);
    await queryRunner.query(`ALTER TABLE "merkl_campaigns" ADD "startDate" integer NOT NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_229a90e89f028ccc1dfd904e6a" ON "merkl_campaigns" ("startDate") `);
  }
}
