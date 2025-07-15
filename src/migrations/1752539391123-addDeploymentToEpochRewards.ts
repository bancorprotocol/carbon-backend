import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeploymentToEpochRewards1752539391123 implements MigrationInterface {
  name = 'AddDeploymentToEpochRewards1752539391123';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add new columns
    await queryRunner.query(`ALTER TABLE "merkl_epoch_rewards" ADD "blockchainType" character varying`);
    await queryRunner.query(`ALTER TABLE "merkl_epoch_rewards" ADD "exchangeId" character varying`);

    // Populate the new columns with data from campaigns
    await queryRunner.query(`
            UPDATE "merkl_epoch_rewards" 
            SET "blockchainType" = c."blockchainType", 
                "exchangeId" = c."exchangeId"
            FROM "merkl_campaigns" c
            WHERE "merkl_epoch_rewards"."campaignId" = c."id"
        `);

    // Make the columns NOT NULL now that they're populated
    await queryRunner.query(`ALTER TABLE "merkl_epoch_rewards" ALTER COLUMN "blockchainType" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "merkl_epoch_rewards" ALTER COLUMN "exchangeId" SET NOT NULL`);

    // Create indexes for new columns
    await queryRunner.query(
      `CREATE INDEX "IDX_merkl_epoch_rewards_blockchainType" ON "merkl_epoch_rewards" ("blockchainType")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_merkl_epoch_rewards_exchangeId" ON "merkl_epoch_rewards" ("exchangeId")`,
    );

    // Drop the old unique constraint
    await queryRunner.query(`ALTER TABLE "merkl_epoch_rewards" DROP CONSTRAINT "UQ_16f6feee67daee190fcff5a7c41"`);

    // Add the new unique constraint with deployment fields
    await queryRunner.query(
      `ALTER TABLE "merkl_epoch_rewards" ADD CONSTRAINT "UQ_merkl_epoch_rewards_deployment_strategy" UNIQUE ("blockchainType", "exchangeId", "campaignId", "epochNumber", "strategyId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the new unique constraint
    await queryRunner.query(
      `ALTER TABLE "merkl_epoch_rewards" DROP CONSTRAINT "UQ_merkl_epoch_rewards_deployment_strategy"`,
    );

    // Restore the old unique constraint
    await queryRunner.query(
      `ALTER TABLE "merkl_epoch_rewards" ADD CONSTRAINT "UQ_16f6feee67daee190fcff5a7c41" UNIQUE ("campaignId", "epochNumber", "strategyId")`,
    );

    // Drop indexes
    await queryRunner.query(`DROP INDEX "public"."IDX_merkl_epoch_rewards_exchangeId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_merkl_epoch_rewards_blockchainType"`);

    // Drop columns
    await queryRunner.query(`ALTER TABLE "merkl_epoch_rewards" DROP COLUMN "exchangeId"`);
    await queryRunner.query(`ALTER TABLE "merkl_epoch_rewards" DROP COLUMN "blockchainType"`);
  }
}
