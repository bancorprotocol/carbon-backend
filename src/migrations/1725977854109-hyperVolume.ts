import { MigrationInterface, QueryRunner } from 'typeorm';

export class HyperVolume1725977854109 implements MigrationInterface {
  name = 'HyperVolume1725977854109';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT create_hypertable('volume', 'timestamp')`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    return;
  }
}
