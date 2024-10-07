import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIndexBlockToTvl1726576901633 implements MigrationInterface {
  name = 'AddIndexBlockToTvl1726576901633';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE INDEX "IDX_a5bf157ef061f897df67c0dec2" ON "tvl" ("evt_block_number") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_a5bf157ef061f897df67c0dec2"`);
  }
}
