import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangeEpochTimestampsToDate1752520751670 implements MigrationInterface {
  name = 'ChangeEpochTimestampsToDate1752520751670';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_eed52a227329783ab2d7e86b44"`);
    await queryRunner.query(`ALTER TABLE "merkl_epoch_rewards" DROP COLUMN "epochStartTimestamp"`);
    await queryRunner.query(`ALTER TABLE "merkl_epoch_rewards" ADD "epochStartTimestamp" TIMESTAMP NOT NULL`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c593da80d7e479de38dede7f6d"`);
    await queryRunner.query(`ALTER TABLE "merkl_epoch_rewards" DROP COLUMN "epochEndTimestamp"`);
    await queryRunner.query(`ALTER TABLE "merkl_epoch_rewards" ADD "epochEndTimestamp" TIMESTAMP NOT NULL`);
    await queryRunner.query(
      `CREATE INDEX "IDX_eed52a227329783ab2d7e86b44" ON "merkl_epoch_rewards" ("epochStartTimestamp") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c593da80d7e479de38dede7f6d" ON "merkl_epoch_rewards" ("epochEndTimestamp") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_c593da80d7e479de38dede7f6d"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_eed52a227329783ab2d7e86b44"`);
    await queryRunner.query(`ALTER TABLE "merkl_epoch_rewards" DROP COLUMN "epochEndTimestamp"`);
    await queryRunner.query(`ALTER TABLE "merkl_epoch_rewards" ADD "epochEndTimestamp" integer NOT NULL`);
    await queryRunner.query(
      `CREATE INDEX "IDX_c593da80d7e479de38dede7f6d" ON "merkl_epoch_rewards" ("epochEndTimestamp") `,
    );
    await queryRunner.query(`ALTER TABLE "merkl_epoch_rewards" DROP COLUMN "epochStartTimestamp"`);
    await queryRunner.query(`ALTER TABLE "merkl_epoch_rewards" ADD "epochStartTimestamp" integer NOT NULL`);
    await queryRunner.query(
      `CREATE INDEX "IDX_eed52a227329783ab2d7e86b44" ON "merkl_epoch_rewards" ("epochStartTimestamp") `,
    );
  }
}
