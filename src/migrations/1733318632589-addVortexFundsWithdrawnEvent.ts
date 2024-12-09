import { MigrationInterface, QueryRunner } from "typeorm";

export class AddVortexFundsWithdrawnEvent1733318632589 implements MigrationInterface {
    name = 'AddVortexFundsWithdrawnEvent1733318632589'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."vortex-funds-withdrawn-events_blockchaintype_enum" AS ENUM('ethereum', 'sei-network', 'celo', 'blast')`);
        await queryRunner.query(`CREATE TYPE "public"."vortex-funds-withdrawn-events_exchangeid_enum" AS ENUM('ethereum', 'sei', 'celo', 'blast')`);
        await queryRunner.query(`CREATE TABLE "vortex-funds-withdrawn-events" ("id" SERIAL NOT NULL, "blockchainType" "public"."vortex-funds-withdrawn-events_blockchaintype_enum" NOT NULL, "exchangeId" "public"."vortex-funds-withdrawn-events_exchangeid_enum" NOT NULL, "caller" character varying NOT NULL, "target" character varying NOT NULL, "tokens" text array NOT NULL, "amounts" text array NOT NULL, "transactionIndex" integer NOT NULL, "transactionHash" character varying NOT NULL, "timestamp" TIMESTAMP NOT NULL, "logIndex" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "blockId" integer, CONSTRAINT "UQ_c3cc49aba18d188afe58df53191" UNIQUE ("transactionIndex", "transactionHash", "logIndex"), CONSTRAINT "PK_ec5ec6cb6578dbfcb0cf72080ba" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_377408d0c0541389473b3835b6" ON "vortex-funds-withdrawn-events" ("blockchainType") `);
        await queryRunner.query(`CREATE INDEX "IDX_3db3cd5cb695111b75f7b30b6e" ON "vortex-funds-withdrawn-events" ("exchangeId") `);
        await queryRunner.query(`CREATE INDEX "IDX_8ba94fcea32aa9ab7e62e64c9f" ON "vortex-funds-withdrawn-events" ("blockId") `);
        await queryRunner.query(`CREATE INDEX "IDX_bbef3e8d43bcd8d72c830de4df" ON "vortex-funds-withdrawn-events" ("caller") `);
        await queryRunner.query(`CREATE INDEX "IDX_e3e8cca2280e4cbdda57a426b5" ON "vortex-funds-withdrawn-events" ("target") `);
        await queryRunner.query(`CREATE INDEX "IDX_a79cca94d6ef15daa29e4171a7" ON "vortex-funds-withdrawn-events" ("timestamp") `);
        await queryRunner.query(`ALTER TABLE "vortex-funds-withdrawn-events" ADD CONSTRAINT "FK_8ba94fcea32aa9ab7e62e64c9fd" FOREIGN KEY ("blockId") REFERENCES "blocks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "vortex-funds-withdrawn-events" DROP CONSTRAINT "FK_8ba94fcea32aa9ab7e62e64c9fd"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a79cca94d6ef15daa29e4171a7"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e3e8cca2280e4cbdda57a426b5"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bbef3e8d43bcd8d72c830de4df"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8ba94fcea32aa9ab7e62e64c9f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3db3cd5cb695111b75f7b30b6e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_377408d0c0541389473b3835b6"`);
        await queryRunner.query(`DROP TABLE "vortex-funds-withdrawn-events"`);
        await queryRunner.query(`DROP TYPE "public"."vortex-funds-withdrawn-events_exchangeid_enum"`);
        await queryRunner.query(`DROP TYPE "public"."vortex-funds-withdrawn-events_blockchaintype_enum"`);
    }

}
