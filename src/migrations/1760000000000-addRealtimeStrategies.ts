import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRealtimeStrategies1760000000000 implements MigrationInterface {
  name = 'AddRealtimeStrategies1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "strategy-realtime" (
        "id" SERIAL NOT NULL,
        "blockchainType" character varying NOT NULL,
        "exchangeId" character varying NOT NULL,
        "strategyId" character varying NOT NULL,
        "owner" character varying NOT NULL,
        "token0Address" character varying NOT NULL,
        "token1Address" character varying NOT NULL,
        "liquidity0" character varying NOT NULL,
        "lowestRate0" character varying NOT NULL,
        "highestRate0" character varying NOT NULL,
        "marginalRate0" character varying NOT NULL,
        "liquidity1" character varying NOT NULL,
        "lowestRate1" character varying NOT NULL,
        "highestRate1" character varying NOT NULL,
        "marginalRate1" character varying NOT NULL,
        "encodedOrder0" text,
        "encodedOrder1" text,
        "deleted" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_strategy-realtime_deployment_strategyId" UNIQUE ("blockchainType", "exchangeId", "strategyId"),
        CONSTRAINT "PK_strategy-realtime" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_strategy-realtime_blockchainType" ON "strategy-realtime" ("blockchainType")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_strategy-realtime_exchangeId" ON "strategy-realtime" ("exchangeId")`);
    await queryRunner.query(`CREATE INDEX "IDX_strategy-realtime_strategyId" ON "strategy-realtime" ("strategyId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_strategy-realtime_strategyId"`);
    await queryRunner.query(`DROP INDEX "IDX_strategy-realtime_exchangeId"`);
    await queryRunner.query(`DROP INDEX "IDX_strategy-realtime_blockchainType"`);
    await queryRunner.query(`DROP TABLE "strategy-realtime"`);
  }
}
