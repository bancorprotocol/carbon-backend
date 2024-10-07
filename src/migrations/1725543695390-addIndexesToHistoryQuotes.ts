import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIndexesToHistoryQuotes1725543695390 implements MigrationInterface {
  name = 'AddIndexesToHistoryQuotes1725543695390';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_9e13b1c45c5d2beb1b69711236" ON "historic-quotes" ("blockchainType", "tokenAddress", "timestamp") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_9e13b1c45c5d2beb1b69711236"`);
  }
}
