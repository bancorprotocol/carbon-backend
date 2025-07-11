import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUniquenessToPairAndToken1752270784093 implements MigrationInterface {
    name = 'AddUniquenessToPairAndToken1752270784093'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tokens" ADD CONSTRAINT "UQ_e3b5032d4ff52de1697727a61c3" UNIQUE ("blockchainType", "exchangeId", "address")`);
        await queryRunner.query(`ALTER TABLE "pairs" ADD CONSTRAINT "UQ_e4e2c824aea9ff6b58563662932" UNIQUE ("blockchainType", "token0Id", "token1Id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "pairs" DROP CONSTRAINT "UQ_e4e2c824aea9ff6b58563662932"`);
        await queryRunner.query(`ALTER TABLE "tokens" DROP CONSTRAINT "UQ_e3b5032d4ff52de1697727a61c3"`);
    }

}
