import { MigrationInterface, QueryRunner } from 'typeorm';

export class StoreUsdValuesOnTvl1725887471388 implements MigrationInterface {
  name = 'StoreUsdValuesOnTvl1725887471388';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tvl" ADD "tvlUsd" text`);
    await queryRunner.query(`ALTER TABLE "tvl" ADD "usdRate" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tvl" DROP COLUMN "usdRate"`);
    await queryRunner.query(`ALTER TABLE "tvl" DROP COLUMN "tvlUsd"`);
  }
}
