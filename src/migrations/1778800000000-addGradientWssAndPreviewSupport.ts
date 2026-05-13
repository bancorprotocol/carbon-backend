import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGradientWssAndPreviewSupport1778800000000 implements MigrationInterface {
  name = 'AddGradientWssAndPreviewSupport1778800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "gradient_strategy_realtime" ADD "updatedAtBlock" integer`);
    await queryRunner.query(`ALTER TABLE "preview_backends" ADD "gradientControllerAddress" character varying`);
    await queryRunner.query(`ALTER TABLE "preview_backends" ADD "gradientVoucherAddress" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "preview_backends" DROP COLUMN "gradientVoucherAddress"`);
    await queryRunner.query(`ALTER TABLE "preview_backends" DROP COLUMN "gradientControllerAddress"`);
    await queryRunner.query(`ALTER TABLE "gradient_strategy_realtime" DROP COLUMN "updatedAtBlock"`);
  }
}
