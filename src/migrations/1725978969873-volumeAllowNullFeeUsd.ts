import { MigrationInterface, QueryRunner } from 'typeorm';

export class VolumeAllowNullFeeUsd1725978969873 implements MigrationInterface {
  name = 'VolumeAllowNullFeeUsd1725978969873';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "volume" DROP CONSTRAINT "UQ_25d27c92dd0baa9b519f62d62b7"`);
    await queryRunner.query(`ALTER TABLE "volume" ALTER COLUMN "tradingFeeAmountUsd" DROP NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "volume" ADD CONSTRAINT "UQ_25d27c92dd0baa9b519f62d62b7" UNIQUE ("blockchainType", "exchangeId", "timestamp", "blockNumber", "transactionIndex", "feeSymbol", "feeAddress", "tradingFeeAmountReal", "tradingFeeAmountUsd", "targetSymbol", "targetAddress", "targetAmountReal", "targetAmountUsd")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "volume" DROP CONSTRAINT "UQ_25d27c92dd0baa9b519f62d62b7"`);
    await queryRunner.query(`ALTER TABLE "volume" ALTER COLUMN "tradingFeeAmountUsd" SET NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "volume" ADD CONSTRAINT "UQ_25d27c92dd0baa9b519f62d62b7" UNIQUE ("timestamp", "feeSymbol", "feeAddress", "tradingFeeAmountReal", "tradingFeeAmountUsd", "targetSymbol", "targetAddress", "targetAmountReal", "targetAmountUsd", "blockchainType", "exchangeId", "blockNumber", "transactionIndex")`,
    );
  }
}
