import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBancorArbitrage1733233111128 implements MigrationInterface {
    name = 'AddBancorArbitrage1733233111128'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."arbitrage-executed-events_blockchaintype_enum" AS ENUM('ethereum', 'sei-network', 'celo', 'blast')`);
        await queryRunner.query(`CREATE TYPE "public"."arbitrage-executed-events_exchangeid_enum" AS ENUM('ethereum', 'sei', 'celo', 'blast')`);
        await queryRunner.query(`CREATE TABLE "arbitrage-executed-events" ("id" SERIAL NOT NULL, "blockchainType" "public"."arbitrage-executed-events_blockchaintype_enum" NOT NULL, "exchangeId" "public"."arbitrage-executed-events_exchangeid_enum" NOT NULL, "caller" character varying NOT NULL, "platformIds" text NOT NULL, "tokenPath" text NOT NULL, "sourceTokens" text NOT NULL, "sourceAmounts" text NOT NULL, "protocolAmounts" text NOT NULL, "rewardAmounts" text NOT NULL, "transactionIndex" integer NOT NULL, "transactionHash" character varying NOT NULL, "timestamp" TIMESTAMP NOT NULL, "logIndex" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "blockId" integer, CONSTRAINT "UQ_7a4f5bf42cbc40193754d207e00" UNIQUE ("transactionIndex", "transactionHash", "logIndex"), CONSTRAINT "PK_7ba465627bf7c78a392a7714b0a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c498a9178b0c1aa00f91b554b4" ON "arbitrage-executed-events" ("blockchainType") `);
        await queryRunner.query(`CREATE INDEX "IDX_54cadf5810efa5baacf5514bd3" ON "arbitrage-executed-events" ("exchangeId") `);
        await queryRunner.query(`CREATE INDEX "IDX_031644dee1db0ea853324d7346" ON "arbitrage-executed-events" ("blockId") `);
        await queryRunner.query(`CREATE INDEX "IDX_40dcbc10d54c70e82fbfd61429" ON "arbitrage-executed-events" ("caller") `);
        await queryRunner.query(`CREATE INDEX "IDX_77de28e463be1f696a516d07a0" ON "arbitrage-executed-events" ("timestamp") `);
        await queryRunner.query(`ALTER TABLE "arbitrage-executed-events" ADD CONSTRAINT "FK_031644dee1db0ea853324d73468" FOREIGN KEY ("blockId") REFERENCES "blocks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "arbitrage-executed-events" DROP CONSTRAINT "FK_031644dee1db0ea853324d73468"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_77de28e463be1f696a516d07a0"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_40dcbc10d54c70e82fbfd61429"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_031644dee1db0ea853324d7346"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_54cadf5810efa5baacf5514bd3"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c498a9178b0c1aa00f91b554b4"`);
        await queryRunner.query(`DROP TABLE "arbitrage-executed-events"`);
        await queryRunner.query(`DROP TYPE "public"."arbitrage-executed-events_exchangeid_enum"`);
        await queryRunner.query(`DROP TYPE "public"."arbitrage-executed-events_blockchaintype_enum"`);
    }

}
