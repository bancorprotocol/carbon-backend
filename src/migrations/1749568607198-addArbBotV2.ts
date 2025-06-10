import { MigrationInterface, QueryRunner } from "typeorm";

export class AddArbBotV21749568607198 implements MigrationInterface {
    name = 'AddArbBotV21749568607198'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "arbitrage-executed-events-v2" ("id" SERIAL NOT NULL, "blockchainType" character varying NOT NULL, "exchangeId" character varying NOT NULL, "caller" character varying NOT NULL, "exchanges" text NOT NULL, "tokenPath" text NOT NULL, "sourceTokens" text NOT NULL, "sourceAmounts" text NOT NULL, "protocolAmounts" text NOT NULL, "rewardAmounts" text NOT NULL, "transactionIndex" integer NOT NULL, "transactionHash" character varying NOT NULL, "timestamp" TIMESTAMP NOT NULL, "logIndex" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "blockId" integer, CONSTRAINT "UQ_62066f7777603690481539004e3" UNIQUE ("transactionIndex", "transactionHash", "logIndex"), CONSTRAINT "PK_62ab3201669c1b956e76881c4ad" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_305edd238bdbdc22f483f53e00" ON "arbitrage-executed-events-v2" ("blockchainType") `);
        await queryRunner.query(`CREATE INDEX "IDX_ba60cbae3db2913ffa32fe5630" ON "arbitrage-executed-events-v2" ("exchangeId") `);
        await queryRunner.query(`CREATE INDEX "IDX_d13afc933d8a97b1b479d92246" ON "arbitrage-executed-events-v2" ("blockId") `);
        await queryRunner.query(`CREATE INDEX "IDX_5a72d81b80f000394222290e26" ON "arbitrage-executed-events-v2" ("caller") `);
        await queryRunner.query(`CREATE INDEX "IDX_f5088b239b8cfc08239c8b107b" ON "arbitrage-executed-events-v2" ("timestamp") `);
        await queryRunner.query(`ALTER TABLE "arbitrage-executed-events-v2" ADD CONSTRAINT "FK_d13afc933d8a97b1b479d922464" FOREIGN KEY ("blockId") REFERENCES "blocks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "arbitrage-executed-events-v2" DROP CONSTRAINT "FK_d13afc933d8a97b1b479d922464"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f5088b239b8cfc08239c8b107b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5a72d81b80f000394222290e26"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d13afc933d8a97b1b479d92246"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ba60cbae3db2913ffa32fe5630"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_305edd238bdbdc22f483f53e00"`);
        await queryRunner.query(`DROP TABLE "arbitrage-executed-events-v2"`);
    }

}
