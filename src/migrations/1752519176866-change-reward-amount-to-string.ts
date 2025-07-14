import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangeRewardAmountToString1752519176866 implements MigrationInterface {
    name = 'ChangeRewardAmountToString1752519176866'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "merkl_epoch_rewards" DROP COLUMN "rewardAmount"`);
        await queryRunner.query(`ALTER TABLE "merkl_epoch_rewards" ADD "rewardAmount" text NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "merkl_epoch_rewards" DROP COLUMN "rewardAmount"`);
        await queryRunner.query(`ALTER TABLE "merkl_epoch_rewards" ADD "rewardAmount" numeric(78,0) NOT NULL`);
    }

}
