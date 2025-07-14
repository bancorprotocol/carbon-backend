import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveCampaignUniqueConstraint1752530018000 implements MigrationInterface {
  name = 'RemoveCampaignUniqueConstraint1752530018000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove unique constraint on blockchainType, exchangeId, pairId
    await queryRunner.query(`ALTER TABLE "merkl_campaigns" DROP CONSTRAINT "UQ_96b1f67f2675941e0531a432c2a"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore unique constraint on blockchainType, exchangeId, pairId
    await queryRunner.query(
      `ALTER TABLE "merkl_campaigns" ADD CONSTRAINT "UQ_96b1f67f2675941e0531a432c2a" UNIQUE ("blockchainType", "exchangeId", "pairId")`,
    );
  }
}
