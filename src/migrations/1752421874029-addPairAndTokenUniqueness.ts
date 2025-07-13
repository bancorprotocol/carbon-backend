import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPairAndTokenUniqueness1752421874029 implements MigrationInterface {
  name = 'AddPairAndTokenUniqueness1752421874029';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tokens" ADD CONSTRAINT "UQ_e3b5032d4ff52de1697727a61c3" UNIQUE ("blockchainType", "exchangeId", "address")`,
    );
    await queryRunner.query(
      `ALTER TABLE "pairs" ADD CONSTRAINT "UQ_452146c3a7aa014ae5fc126a5e4" UNIQUE ("blockchainType", "exchangeId", "token0Id", "token1Id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pairs" DROP CONSTRAINT "UQ_452146c3a7aa014ae5fc126a5e4"`);
    await queryRunner.query(`ALTER TABLE "tokens" DROP CONSTRAINT "UQ_e3b5032d4ff52de1697727a61c3"`);
  }
}
