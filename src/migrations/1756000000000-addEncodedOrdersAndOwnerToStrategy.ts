import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEncodedOrdersAndOwnerToStrategy1756000000000 implements MigrationInterface {
  name = 'AddEncodedOrdersAndOwnerToStrategy1756000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "strategies" ADD "encodedOrder0" text`);
    await queryRunner.query(`ALTER TABLE "strategies" ADD "encodedOrder1" text`);
    await queryRunner.query(`ALTER TABLE "strategies" ADD "owner" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "strategies" DROP COLUMN "owner"`);
    await queryRunner.query(`ALTER TABLE "strategies" DROP COLUMN "encodedOrder1"`);
    await queryRunner.query(`ALTER TABLE "strategies" DROP COLUMN "encodedOrder0"`);
  }
}

