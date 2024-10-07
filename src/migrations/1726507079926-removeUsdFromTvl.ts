import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveUsdFromTvl1726507079926 implements MigrationInterface {
  name = 'RemoveUsdFromTvl1726507079926';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tvl" DROP COLUMN "usdRate"`);
    await queryRunner.query(`ALTER TABLE "tvl" DROP COLUMN "tvlUsd"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tvl" ADD "tvlUsd" text NOT NULL`);
    await queryRunner.query(`ALTER TABLE "tvl" ADD "usdRate" text NOT NULL`);
  }
}
