import { MigrationInterface, QueryRunner } from "typeorm";

export class RefactorMerklRewards1754933893189 implements MigrationInterface {
    name = 'RefactorMerklRewards1754933893189'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "merkl_sub_epochs" ("id" SERIAL NOT NULL, "campaign_id" integer NOT NULL, "strategy_id" character varying NOT NULL, "epoch_number" integer NOT NULL, "sub_epoch_number" integer NOT NULL, "epoch_start" TIMESTAMP NOT NULL, "sub_epoch_timestamp" TIMESTAMP NOT NULL, "token0_reward" text NOT NULL DEFAULT '0', "token1_reward" text NOT NULL DEFAULT '0', "total_reward" text NOT NULL DEFAULT '0', "liquidity0" text NOT NULL, "liquidity1" text NOT NULL, "token0_address" character varying NOT NULL, "token1_address" character varying NOT NULL, "token0_usd_rate" text NOT NULL, "token1_usd_rate" text NOT NULL, "target_price" text NOT NULL, "eligible0" text NOT NULL, "eligible1" text NOT NULL, "token0_reward_zone_boundary" text NOT NULL, "token1_reward_zone_boundary" text NOT NULL, "token0_weighting" text NOT NULL, "token1_weighting" text NOT NULL, "token0_decimals" integer NOT NULL, "token1_decimals" integer NOT NULL, "order0_a_compressed" character varying NOT NULL, "order0_b_compressed" character varying NOT NULL, "order0_a" text NOT NULL, "order0_b" text NOT NULL, "order0_z" text NOT NULL, "order1_a_compressed" character varying NOT NULL, "order1_b_compressed" character varying NOT NULL, "order1_a" text NOT NULL, "order1_b" text NOT NULL, "order1_z" text NOT NULL, "last_event_timestamp" TIMESTAMP NOT NULL, "last_processed_block" integer NOT NULL, "owner_address" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7271b43c4eb5455db4304b43124" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_1a88b21757e12514b2a30b269b" ON "merkl_sub_epochs" ("strategy_id", "campaign_id", "sub_epoch_number") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_cb05676e80b4fe2f2df95a84cb" ON "merkl_sub_epochs" ("strategy_id", "campaign_id", "sub_epoch_timestamp") `);
        await queryRunner.query(`CREATE INDEX "IDX_d516d6ca253c61c27f277fda73" ON "merkl_sub_epochs" ("strategy_id", "campaign_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_18309d4834c24351d31e750e28" ON "merkl_sub_epochs" ("campaign_id", "sub_epoch_number") `);
        await queryRunner.query(`CREATE INDEX "IDX_60884107b3b60ae4df8d7d47ba" ON "merkl_sub_epochs" ("campaign_id", "sub_epoch_timestamp") `);
        await queryRunner.query(`CREATE INDEX "IDX_352c8980cb8ef5bbf1a124de57" ON "merkl_sub_epochs" ("campaign_id", "epoch_number") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_352c8980cb8ef5bbf1a124de57"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_60884107b3b60ae4df8d7d47ba"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_18309d4834c24351d31e750e28"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d516d6ca253c61c27f277fda73"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cb05676e80b4fe2f2df95a84cb"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1a88b21757e12514b2a30b269b"`);
        await queryRunner.query(`DROP TABLE "merkl_sub_epochs"`);
    }

}
