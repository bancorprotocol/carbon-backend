import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCodexToken1732708334092 implements MigrationInterface {
    name = 'AddCodexToken1732708334092'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "codex-tokens" ("id" SERIAL NOT NULL, "address" character varying NOT NULL, "networkId" integer NOT NULL, "blockchainType" character varying NOT NULL, "timestamp" TIMESTAMP NOT NULL, "createdAt" TIMESTAMP NOT NULL, CONSTRAINT "UQ_5f3a38c1edf37cd21d2ffdffa38" UNIQUE ("address", "networkId", "timestamp"), CONSTRAINT "PK_c9e1f8cf86351e34b072d98326b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c831b13bf987faf6d6a9cf5ea3" ON "codex-tokens" ("networkId") `);
        await queryRunner.query(`CREATE INDEX "IDX_56668fc30a4a211f3be6e90f5c" ON "codex-tokens" ("blockchainType") `);
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
        await queryRunner.query(`DROP INDEX "public"."IDX_56668fc30a4a211f3be6e90f5c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c831b13bf987faf6d6a9cf5ea3"`);
        await queryRunner.query(`DROP TABLE "codex-tokens"`);
    }

}
