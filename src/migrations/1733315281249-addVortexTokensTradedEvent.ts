import { MigrationInterface, QueryRunner } from "typeorm";

export class AddVortexTokensTradedEvent1733315281249 implements MigrationInterface {
    name = 'AddVortexTokensTradedEvent1733315281249'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."vortex-tokens-traded-events_blockchaintype_enum" AS ENUM('ethereum', 'sei-network', 'celo', 'blast')`);
        await queryRunner.query(`CREATE TYPE "public"."vortex-tokens-traded-events_exchangeid_enum" AS ENUM('ethereum', 'sei', 'celo', 'blast')`);
        await queryRunner.query(`CREATE TABLE "vortex-tokens-traded-events" ("id" SERIAL NOT NULL, "blockchainType" "public"."vortex-tokens-traded-events_blockchaintype_enum" NOT NULL, "exchangeId" "public"."vortex-tokens-traded-events_exchangeid_enum" NOT NULL, "caller" character varying NOT NULL, "token" character varying NOT NULL, "sourceAmount" text NOT NULL, "targetAmount" text NOT NULL, "transactionIndex" integer NOT NULL, "transactionHash" character varying NOT NULL, "timestamp" TIMESTAMP NOT NULL, "logIndex" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "blockId" integer, CONSTRAINT "UQ_d43ac776a60b8c78fb2e8b4b64c" UNIQUE ("transactionIndex", "transactionHash", "logIndex"), CONSTRAINT "PK_a14b40d4c35229dc0f462699fab" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_fd9d2d0903bc14e8435c634b0f" ON "vortex-tokens-traded-events" ("blockchainType") `);
        await queryRunner.query(`CREATE INDEX "IDX_e4f82c59c17e9787d6bd1364d6" ON "vortex-tokens-traded-events" ("exchangeId") `);
        await queryRunner.query(`CREATE INDEX "IDX_63734fffd99f910f03fadfe3ad" ON "vortex-tokens-traded-events" ("blockId") `);
        await queryRunner.query(`CREATE INDEX "IDX_d647acab90ee2f65a3473acf79" ON "vortex-tokens-traded-events" ("caller") `);
        await queryRunner.query(`CREATE INDEX "IDX_2d102125a8477e1c79bcb73ad3" ON "vortex-tokens-traded-events" ("token") `);
        await queryRunner.query(`CREATE INDEX "IDX_a86e718b161bbc2ba208e3b05d" ON "vortex-tokens-traded-events" ("timestamp") `);
        await queryRunner.query(`ALTER TABLE "vortex-tokens-traded-events" ADD CONSTRAINT "FK_63734fffd99f910f03fadfe3ad2" FOREIGN KEY ("blockId") REFERENCES "blocks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "vortex-tokens-traded-events" DROP CONSTRAINT "FK_63734fffd99f910f03fadfe3ad2"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a86e718b161bbc2ba208e3b05d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2d102125a8477e1c79bcb73ad3"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d647acab90ee2f65a3473acf79"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_63734fffd99f910f03fadfe3ad"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e4f82c59c17e9787d6bd1364d6"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fd9d2d0903bc14e8435c634b0f"`);
        await queryRunner.query(`DROP TABLE "vortex-tokens-traded-events"`);
        await queryRunner.query(`DROP TYPE "public"."vortex-tokens-traded-events_exchangeid_enum"`);
        await queryRunner.query(`DROP TYPE "public"."vortex-tokens-traded-events_blockchaintype_enum"`);
    }

}
