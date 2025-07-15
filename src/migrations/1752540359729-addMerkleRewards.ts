import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMerkleRewards1752540359729 implements MigrationInterface {
    name = 'AddMerkleRewards1752540359729'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "merkl_campaigns" ("id" SERIAL NOT NULL, "blockchainType" character varying NOT NULL, "exchangeId" character varying NOT NULL, "pairId" integer NOT NULL, "rewardAmount" numeric(78,0) NOT NULL, "rewardTokenAddress" character varying NOT NULL, "startDate" TIMESTAMP NOT NULL, "endDate" TIMESTAMP NOT NULL, "opportunityName" character varying NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_daf9aa4f8dd1409ae27b3d43a5f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_80f385f165ebce294af9a8a6be" ON "merkl_campaigns" ("blockchainType") `);
        await queryRunner.query(`CREATE INDEX "IDX_b18d7a1b710620ba647b36463d" ON "merkl_campaigns" ("exchangeId") `);
        await queryRunner.query(`CREATE INDEX "IDX_658bfd23e37e5a35201fffc2fc" ON "merkl_campaigns" ("pairId") `);
        await queryRunner.query(`CREATE INDEX "IDX_229a90e89f028ccc1dfd904e6a" ON "merkl_campaigns" ("startDate") `);
        await queryRunner.query(`CREATE INDEX "IDX_afdcf7118dcb7dedc972c3f0a1" ON "merkl_campaigns" ("endDate") `);
        await queryRunner.query(`CREATE INDEX "IDX_8cdd0ece282a91a437fcf9caa6" ON "merkl_campaigns" ("isActive") `);
        await queryRunner.query(`CREATE TABLE "merkl_epoch_rewards" ("id" SERIAL NOT NULL, "blockchainType" character varying NOT NULL, "exchangeId" character varying NOT NULL, "campaignId" integer NOT NULL, "epochNumber" integer NOT NULL, "epochStartTimestamp" TIMESTAMP NOT NULL, "epochEndTimestamp" TIMESTAMP NOT NULL, "strategyId" character varying NOT NULL, "owner" character varying NOT NULL, "rewardAmount" text NOT NULL, "reason" character varying NOT NULL, "calculatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_6517283043faeb80518c3ab00e7" UNIQUE ("blockchainType", "exchangeId", "campaignId", "epochNumber", "strategyId"), CONSTRAINT "PK_7a40369cab7ecacfab89ce7c8cf" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_119f7b05a3aa4791ed40b0b203" ON "merkl_epoch_rewards" ("blockchainType") `);
        await queryRunner.query(`CREATE INDEX "IDX_b68c07c084cfe98fd902eb1ec9" ON "merkl_epoch_rewards" ("exchangeId") `);
        await queryRunner.query(`CREATE INDEX "IDX_225a702fd655b987b07d186ddf" ON "merkl_epoch_rewards" ("campaignId") `);
        await queryRunner.query(`CREATE INDEX "IDX_26a6cd02f62e160bf5a65c3c71" ON "merkl_epoch_rewards" ("epochNumber") `);
        await queryRunner.query(`CREATE INDEX "IDX_eed52a227329783ab2d7e86b44" ON "merkl_epoch_rewards" ("epochStartTimestamp") `);
        await queryRunner.query(`CREATE INDEX "IDX_c593da80d7e479de38dede7f6d" ON "merkl_epoch_rewards" ("epochEndTimestamp") `);
        await queryRunner.query(`CREATE INDEX "IDX_676ed79b0e8c4cfe2ee792654b" ON "merkl_epoch_rewards" ("strategyId") `);
        await queryRunner.query(`CREATE INDEX "IDX_cd81d4316417ceee4d344c60b3" ON "merkl_epoch_rewards" ("owner") `);
        await queryRunner.query(`ALTER TABLE "merkl_campaigns" ADD CONSTRAINT "FK_658bfd23e37e5a35201fffc2fc3" FOREIGN KEY ("pairId") REFERENCES "pairs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "merkl_epoch_rewards" ADD CONSTRAINT "FK_225a702fd655b987b07d186ddf8" FOREIGN KEY ("campaignId") REFERENCES "merkl_campaigns"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "merkl_epoch_rewards" DROP CONSTRAINT "FK_225a702fd655b987b07d186ddf8"`);
        await queryRunner.query(`ALTER TABLE "merkl_campaigns" DROP CONSTRAINT "FK_658bfd23e37e5a35201fffc2fc3"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cd81d4316417ceee4d344c60b3"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_676ed79b0e8c4cfe2ee792654b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c593da80d7e479de38dede7f6d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_eed52a227329783ab2d7e86b44"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_26a6cd02f62e160bf5a65c3c71"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_225a702fd655b987b07d186ddf"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b68c07c084cfe98fd902eb1ec9"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_119f7b05a3aa4791ed40b0b203"`);
        await queryRunner.query(`DROP TABLE "merkl_epoch_rewards"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8cdd0ece282a91a437fcf9caa6"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_afdcf7118dcb7dedc972c3f0a1"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_229a90e89f028ccc1dfd904e6a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_658bfd23e37e5a35201fffc2fc"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b18d7a1b710620ba647b36463d"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_80f385f165ebce294af9a8a6be"`);
        await queryRunner.query(`DROP TABLE "merkl_campaigns"`);
    }

}
