import { MigrationInterface, QueryRunner } from 'typeorm';

// Drops preview_backends.gradientControllerAddress / gradientVoucherAddress.
// These columns were used to plumb fork-deployed gradient contract addresses
// into preview containers while gradients were off-mainnet. Now that
// GradientController + GradientVoucher are deployed to Ethereum mainnet,
// every Tenderly fork inherits them at the canonical mainnet addresses
// (hardcoded in deployment.service.ts) and the per-preview override is dead
// weight.
export class RemovePreviewGradientColumns1779000000000 implements MigrationInterface {
  name = 'RemovePreviewGradientColumns1779000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "preview_backends" DROP COLUMN IF EXISTS "gradientVoucherAddress"`);
    await queryRunner.query(`ALTER TABLE "preview_backends" DROP COLUMN IF EXISTS "gradientControllerAddress"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "preview_backends" ADD "gradientControllerAddress" character varying`);
    await queryRunner.query(`ALTER TABLE "preview_backends" ADD "gradientVoucherAddress" character varying`);
  }
}
