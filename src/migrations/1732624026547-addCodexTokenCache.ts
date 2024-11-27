import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCodexTokenCache1732624026547 implements MigrationInterface {
    name = 'AddCodexTokenCache1732624026547'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "codexTokens" ("id" SERIAL NOT NULL, "address" character varying NOT NULL, "networkId" integer NOT NULL, "blockchainType" character varying NOT NULL, "timestamp" TIMESTAMP NOT NULL, "createdAt" TIMESTAMP NOT NULL, CONSTRAINT "UQ_fa4f3c8ae5c8bd052d5ddfd6010" UNIQUE ("address", "networkId", "timestamp"), CONSTRAINT "PK_9c86b629789dc1dc048e44e7b3e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_e5157aefaf8feedccb17b0151c" ON "codexTokens" ("networkId") `);
        await queryRunner.query(`CREATE INDEX "IDX_27e5e29b9f566303e48468673d" ON "codexTokens" ("blockchainType") `);
        await queryRunner.query(`DROP INDEX "public"."IDX_token_address_desc"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9e13b1c45c5d2beb1b69711236"`);
        await queryRunner.query(`ALTER TABLE "historic-quotes" ALTER COLUMN "blockchainType" SET DEFAULT 'ethereum'`);
        await queryRunner.query(`CREATE INDEX "IDX_9e13b1c45c5d2beb1b69711236" ON "historic-quotes" ("blockchainType", "tokenAddress", "timestamp") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_9e13b1c45c5d2beb1b69711236"`);
        await queryRunner.query(`ALTER TABLE "historic-quotes" ALTER COLUMN "blockchainType" DROP DEFAULT`);
        await queryRunner.query(`CREATE INDEX "IDX_9e13b1c45c5d2beb1b69711236" ON "historic-quotes" ("blockchainType", "timestamp", "tokenAddress") `);
        await queryRunner.query(`CREATE INDEX "IDX_token_address_desc" ON "historic-quotes" ("id", "blockchainType", "timestamp", "tokenAddress", "provider", "usd") `);
        await queryRunner.query(`DROP INDEX "public"."IDX_27e5e29b9f566303e48468673d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e5157aefaf8feedccb17b0151c"`);
        await queryRunner.query(`DROP TABLE "codexTokens"`);
    }

}
