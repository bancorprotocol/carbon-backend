import { MigrationInterface, QueryRunner } from "typeorm";

export class AddVortexTradingResetEvent1733316784182 implements MigrationInterface {
    name = 'AddVortexTradingResetEvent1733316784182'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."vortex-trading-reset-events_blockchaintype_enum" AS ENUM('ethereum', 'sei-network', 'celo', 'blast')`);
        await queryRunner.query(`CREATE TYPE "public"."vortex-trading-reset-events_exchangeid_enum" AS ENUM('ethereum', 'sei', 'celo', 'blast')`);
        await queryRunner.query(`CREATE TABLE "vortex-trading-reset-events" ("id" SERIAL NOT NULL, "blockchainType" "public"."vortex-trading-reset-events_blockchaintype_enum" NOT NULL, "exchangeId" "public"."vortex-trading-reset-events_exchangeid_enum" NOT NULL, "token" character varying NOT NULL, "sourceAmount" text NOT NULL, "targetAmount" text NOT NULL, "transactionIndex" integer NOT NULL, "transactionHash" character varying NOT NULL, "timestamp" TIMESTAMP NOT NULL, "logIndex" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "blockId" integer, CONSTRAINT "UQ_c30a3702f2e28183250e7f96995" UNIQUE ("transactionIndex", "transactionHash", "logIndex"), CONSTRAINT "PK_eb1d46d9d43d913f70f6fdf7e12" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_a3a015d6530eec204734606276" ON "vortex-trading-reset-events" ("blockchainType") `);
        await queryRunner.query(`CREATE INDEX "IDX_8c31037872ad8a8a8280d51261" ON "vortex-trading-reset-events" ("exchangeId") `);
        await queryRunner.query(`CREATE INDEX "IDX_8e4a2ad08794d7e20df02ab996" ON "vortex-trading-reset-events" ("blockId") `);
        await queryRunner.query(`CREATE INDEX "IDX_544f5a3e612ff1a949d6f4f951" ON "vortex-trading-reset-events" ("token") `);
        await queryRunner.query(`CREATE INDEX "IDX_87d106f1babb36431cdb465729" ON "vortex-trading-reset-events" ("timestamp") `);
        await queryRunner.query(`ALTER TABLE "vortex-trading-reset-events" ADD CONSTRAINT "FK_8e4a2ad08794d7e20df02ab9967" FOREIGN KEY ("blockId") REFERENCES "blocks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "vortex-trading-reset-events" DROP CONSTRAINT "FK_8e4a2ad08794d7e20df02ab9967"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_87d106f1babb36431cdb465729"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_544f5a3e612ff1a949d6f4f951"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8e4a2ad08794d7e20df02ab996"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8c31037872ad8a8a8280d51261"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a3a015d6530eec204734606276"`);
        await queryRunner.query(`DROP TABLE "vortex-trading-reset-events"`);
        await queryRunner.query(`DROP TYPE "public"."vortex-trading-reset-events_exchangeid_enum"`);
        await queryRunner.query(`DROP TYPE "public"."vortex-trading-reset-events_blockchaintype_enum"`);
    }

}
