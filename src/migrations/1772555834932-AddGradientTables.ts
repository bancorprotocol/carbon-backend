import { MigrationInterface, QueryRunner } from "typeorm";

export class AddGradientTables1772555834932 implements MigrationInterface {
    name = 'AddGradientTables1772555834932'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "gradient_strategies" ("id" SERIAL NOT NULL, "blockchainType" character varying NOT NULL, "exchangeId" character varying NOT NULL, "strategyId" character varying NOT NULL, "token0" character varying NOT NULL, "token1" character varying NOT NULL, "owner" character varying, "order0Liquidity" character varying NOT NULL, "order0InitialPrice" character varying NOT NULL, "order0TradingStartTime" integer NOT NULL, "order0Expiry" integer NOT NULL, "order0MultiFactor" character varying NOT NULL, "order0GradientType" character varying NOT NULL, "order1Liquidity" character varying NOT NULL, "order1InitialPrice" character varying NOT NULL, "order1TradingStartTime" integer NOT NULL, "order1Expiry" integer NOT NULL, "order1MultiFactor" character varying NOT NULL, "order1GradientType" character varying NOT NULL, "blockNumber" integer NOT NULL, "deleted" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_c1b54c4a8cd94266f944a88595c" UNIQUE ("blockchainType", "exchangeId", "strategyId"), CONSTRAINT "PK_29973b74ec4e612c4961459c697" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_a66b3698766309d636d66f1922" ON "gradient_strategies" ("blockchainType") `);
        await queryRunner.query(`CREATE INDEX "IDX_f175d3bcacf403fd9231556314" ON "gradient_strategies" ("exchangeId") `);
        await queryRunner.query(`CREATE INDEX "IDX_30638341429408726a1f125a10" ON "gradient_strategies" ("strategyId") `);
        await queryRunner.query(`CREATE TABLE "gradient_strategy_realtime" ("id" SERIAL NOT NULL, "blockchainType" character varying NOT NULL, "exchangeId" character varying NOT NULL, "strategyId" character varying NOT NULL, "owner" character varying, "token0Address" character varying NOT NULL, "token1Address" character varying NOT NULL, "order0Liquidity" character varying NOT NULL, "order0InitialPrice" character varying NOT NULL, "order0TradingStartTime" integer NOT NULL, "order0Expiry" integer NOT NULL, "order0MultiFactor" character varying NOT NULL, "order0GradientType" character varying NOT NULL, "order1Liquidity" character varying NOT NULL, "order1InitialPrice" character varying NOT NULL, "order1TradingStartTime" integer NOT NULL, "order1Expiry" integer NOT NULL, "order1MultiFactor" character varying NOT NULL, "order1GradientType" character varying NOT NULL, "deleted" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_dbe762aaf81ad1c5539c864f13e" UNIQUE ("blockchainType", "exchangeId", "strategyId"), CONSTRAINT "PK_9d8e9040a17b270487bd9a4e05a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_2df496c35c19d0575ab162c3c8" ON "gradient_strategy_realtime" ("blockchainType") `);
        await queryRunner.query(`CREATE INDEX "IDX_cb278e50b61498588306ba3c10" ON "gradient_strategy_realtime" ("exchangeId") `);
        await queryRunner.query(`CREATE INDEX "IDX_fdb315d934c3a8cd0a44cf278a" ON "gradient_strategy_realtime" ("strategyId") `);
        await queryRunner.query(`CREATE TABLE "gradient_strategy_updated_events" ("id" SERIAL NOT NULL, "blockchainType" character varying NOT NULL, "exchangeId" character varying NOT NULL, "strategyId" character varying NOT NULL, "blockNumber" integer NOT NULL, "transactionHash" character varying NOT NULL, "transactionIndex" integer NOT NULL, "logIndex" integer NOT NULL, "order0Liquidity" character varying NOT NULL, "order0InitialPrice" character varying NOT NULL, "order0TradingStartTime" integer NOT NULL, "order0Expiry" integer NOT NULL, "order0MultiFactor" character varying NOT NULL, "order0GradientType" character varying NOT NULL, "order1Liquidity" character varying NOT NULL, "order1InitialPrice" character varying NOT NULL, "order1TradingStartTime" integer NOT NULL, "order1Expiry" integer NOT NULL, "order1MultiFactor" character varying NOT NULL, "order1GradientType" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_6405822d47e2573c5431fd91307" UNIQUE ("blockchainType", "exchangeId", "transactionHash", "logIndex"), CONSTRAINT "PK_4578c6167dc1618ead6006e4e1d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_3f808c9b1f805353441d9580ec" ON "gradient_strategy_updated_events" ("blockchainType") `);
        await queryRunner.query(`CREATE INDEX "IDX_e0f20548f99e09a27f9e6fbb98" ON "gradient_strategy_updated_events" ("exchangeId") `);
        await queryRunner.query(`CREATE INDEX "IDX_f9f73c6cf9196fe39351269eeb" ON "gradient_strategy_updated_events" ("strategyId") `);
        await queryRunner.query(`CREATE INDEX "IDX_87410aeb156e3040fd364b5f4a" ON "gradient_strategy_updated_events" ("blockNumber") `);
        await queryRunner.query(`CREATE TABLE "gradient_strategy_created_events" ("id" SERIAL NOT NULL, "blockchainType" character varying NOT NULL, "exchangeId" character varying NOT NULL, "strategyId" character varying NOT NULL, "blockNumber" integer NOT NULL, "transactionHash" character varying NOT NULL, "transactionIndex" integer NOT NULL, "logIndex" integer NOT NULL, "token0" character varying NOT NULL, "token1" character varying NOT NULL, "owner" character varying, "order0Liquidity" character varying NOT NULL, "order0InitialPrice" character varying NOT NULL, "order0TradingStartTime" integer NOT NULL, "order0Expiry" integer NOT NULL, "order0MultiFactor" character varying NOT NULL, "order0GradientType" character varying NOT NULL, "order1Liquidity" character varying NOT NULL, "order1InitialPrice" character varying NOT NULL, "order1TradingStartTime" integer NOT NULL, "order1Expiry" integer NOT NULL, "order1MultiFactor" character varying NOT NULL, "order1GradientType" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_39b29e73fe3b82ad07860ed4c99" UNIQUE ("blockchainType", "exchangeId", "transactionHash", "logIndex"), CONSTRAINT "PK_0dce3ed80e54649b9a23c1ee490" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_7044ebac9e0c274ad7e604cd89" ON "gradient_strategy_created_events" ("blockchainType") `);
        await queryRunner.query(`CREATE INDEX "IDX_10284a3072006258beadec7789" ON "gradient_strategy_created_events" ("exchangeId") `);
        await queryRunner.query(`CREATE INDEX "IDX_d7db2ffc691405b7e74318b89e" ON "gradient_strategy_created_events" ("strategyId") `);
        await queryRunner.query(`CREATE INDEX "IDX_18986f89e48f72a319e33529fc" ON "gradient_strategy_created_events" ("blockNumber") `);
        await queryRunner.query(`CREATE TABLE "gradient_strategy_deleted_events" ("id" SERIAL NOT NULL, "blockchainType" character varying NOT NULL, "exchangeId" character varying NOT NULL, "strategyId" character varying NOT NULL, "blockNumber" integer NOT NULL, "transactionHash" character varying NOT NULL, "transactionIndex" integer NOT NULL, "logIndex" integer NOT NULL, "order0Liquidity" character varying NOT NULL, "order0InitialPrice" character varying NOT NULL, "order0TradingStartTime" integer NOT NULL, "order0Expiry" integer NOT NULL, "order0MultiFactor" character varying NOT NULL, "order0GradientType" character varying NOT NULL, "order1Liquidity" character varying NOT NULL, "order1InitialPrice" character varying NOT NULL, "order1TradingStartTime" integer NOT NULL, "order1Expiry" integer NOT NULL, "order1MultiFactor" character varying NOT NULL, "order1GradientType" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_61f7f93c36764d4a4b0457b5cf8" UNIQUE ("blockchainType", "exchangeId", "transactionHash", "logIndex"), CONSTRAINT "PK_394b7b6ed7abd8dad5f7cd683c6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_d35309f7973d467d8245b53a5c" ON "gradient_strategy_deleted_events" ("blockchainType") `);
        await queryRunner.query(`CREATE INDEX "IDX_4f05dc5b20da26dcc75178ebca" ON "gradient_strategy_deleted_events" ("exchangeId") `);
        await queryRunner.query(`CREATE INDEX "IDX_db03a4f491be16879ac0e4db4a" ON "gradient_strategy_deleted_events" ("strategyId") `);
        await queryRunner.query(`CREATE INDEX "IDX_1d3c575eda3a25a3800b3af32c" ON "gradient_strategy_deleted_events" ("blockNumber") `);
        await queryRunner.query(`CREATE TABLE "gradient_pair_trading_fee_ppm_events" ("id" SERIAL NOT NULL, "blockchainType" character varying NOT NULL, "exchangeId" character varying NOT NULL, "blockNumber" integer NOT NULL, "token0" character varying NOT NULL, "token1" character varying NOT NULL, "prevFeePPM" integer NOT NULL, "newFeePPM" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b2515f8dea8cab651b8e218aaf3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_8a871c73c618d66442f158d00d" ON "gradient_pair_trading_fee_ppm_events" ("blockchainType") `);
        await queryRunner.query(`CREATE INDEX "IDX_d59d6ead402b3ba0d87dcc0c47" ON "gradient_pair_trading_fee_ppm_events" ("exchangeId") `);
        await queryRunner.query(`CREATE INDEX "IDX_09c270f11ef8ecbfd33f48a575" ON "gradient_pair_trading_fee_ppm_events" ("blockNumber") `);
        await queryRunner.query(`CREATE TABLE "gradient_trading_fee_ppm_events" ("id" SERIAL NOT NULL, "blockchainType" character varying NOT NULL, "exchangeId" character varying NOT NULL, "blockNumber" integer NOT NULL, "prevFeePPM" integer NOT NULL, "newFeePPM" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_fcd1f8fdf8813351a102ff54152" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_9ddabaa75d7941b431e4838136" ON "gradient_trading_fee_ppm_events" ("blockchainType") `);
        await queryRunner.query(`CREATE INDEX "IDX_3a6900b400aa0b49a0a5672036" ON "gradient_trading_fee_ppm_events" ("exchangeId") `);
        await queryRunner.query(`CREATE INDEX "IDX_3039447717f9dbd9926238bfaf" ON "gradient_trading_fee_ppm_events" ("blockNumber") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_3039447717f9dbd9926238bfaf"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3a6900b400aa0b49a0a5672036"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9ddabaa75d7941b431e4838136"`);
        await queryRunner.query(`DROP TABLE "gradient_trading_fee_ppm_events"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_09c270f11ef8ecbfd33f48a575"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d59d6ead402b3ba0d87dcc0c47"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8a871c73c618d66442f158d00d"`);
        await queryRunner.query(`DROP TABLE "gradient_pair_trading_fee_ppm_events"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1d3c575eda3a25a3800b3af32c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_db03a4f491be16879ac0e4db4a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4f05dc5b20da26dcc75178ebca"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d35309f7973d467d8245b53a5c"`);
        await queryRunner.query(`DROP TABLE "gradient_strategy_deleted_events"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_18986f89e48f72a319e33529fc"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d7db2ffc691405b7e74318b89e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_10284a3072006258beadec7789"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7044ebac9e0c274ad7e604cd89"`);
        await queryRunner.query(`DROP TABLE "gradient_strategy_created_events"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_87410aeb156e3040fd364b5f4a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f9f73c6cf9196fe39351269eeb"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e0f20548f99e09a27f9e6fbb98"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3f808c9b1f805353441d9580ec"`);
        await queryRunner.query(`DROP TABLE "gradient_strategy_updated_events"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fdb315d934c3a8cd0a44cf278a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cb278e50b61498588306ba3c10"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2df496c35c19d0575ab162c3c8"`);
        await queryRunner.query(`DROP TABLE "gradient_strategy_realtime"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_30638341429408726a1f125a10"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f175d3bcacf403fd9231556314"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a66b3698766309d636d66f1922"`);
        await queryRunner.query(`DROP TABLE "gradient_strategies"`);
    }

}
