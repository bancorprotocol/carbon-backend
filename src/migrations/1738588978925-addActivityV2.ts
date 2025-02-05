import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddActivityV21738588978925 implements MigrationInterface {
  name = 'AddActivityV21738588978925';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "activities-v2" ("id" SERIAL NOT NULL, "blockchainType" character varying NOT NULL, "exchangeId" character varying NOT NULL, "strategyId" character varying NOT NULL, "creationWallet" character varying, "currentOwner" character varying, "oldOwner" character varying, "newOwner" character varying, "action" character varying NOT NULL, "baseQuote" character varying NOT NULL, "baseSellToken" character varying NOT NULL, "baseSellTokenAddress" character varying NOT NULL, "quoteBuyToken" character varying NOT NULL, "quoteBuyTokenAddress" character varying NOT NULL, "buyBudget" character varying NOT NULL, "sellBudget" character varying NOT NULL, "buyBudgetChange" character varying, "sellBudgetChange" character varying, "buyPriceA" character varying NOT NULL, "buyPriceMarg" character varying NOT NULL, "buyPriceB" character varying NOT NULL, "sellPriceA" character varying NOT NULL, "sellPriceMarg" character varying NOT NULL, "sellPriceB" character varying NOT NULL, "buyPriceADelta" character varying, "buyPriceMargDelta" character varying, "buyPriceBDelta" character varying, "sellPriceADelta" character varying, "sellPriceMargDelta" character varying, "sellPriceBDelta" character varying, "strategySold" character varying, "tokenSold" character varying, "strategyBought" character varying, "tokenBought" character varying, "avgPrice" character varying, "timestamp" TIMESTAMP NOT NULL, "txhash" character varying NOT NULL, "blockNumber" integer NOT NULL, "logIndex" integer NOT NULL, "transactionIndex" integer NOT NULL, "order0" jsonb, "order1" jsonb, "token0Id" integer, "token1Id" integer, CONSTRAINT "UQ_809db05b3f4deed88f7dd717498" UNIQUE ("blockchainType", "exchangeId", "strategyId", "action", "baseQuote", "baseSellToken", "baseSellTokenAddress", "quoteBuyToken", "quoteBuyTokenAddress", "buyBudget", "sellBudget", "buyPriceA", "buyPriceMarg", "buyPriceB", "sellPriceA", "sellPriceMarg", "sellPriceB", "timestamp", "txhash", "blockNumber"), CONSTRAINT "PK_2dcd8415c9c9176984a22ec4b4d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_159d1ef9c844ad2bf40c894e3e" ON "activities-v2" ("blockchainType") `);
    await queryRunner.query(`CREATE INDEX "IDX_828401bd1175f97080473e119b" ON "activities-v2" ("exchangeId") `);
    await queryRunner.query(`CREATE INDEX "IDX_39bcc57a01e25d0a70837d1782" ON "activities-v2" ("strategyId") `);
    await queryRunner.query(`CREATE INDEX "IDX_2f85307a9c581907b40899a4cb" ON "activities-v2" ("currentOwner") `);
    await queryRunner.query(`CREATE INDEX "IDX_29c26548428fa789f65cb7242e" ON "activities-v2" ("oldOwner") `);
    await queryRunner.query(`CREATE INDEX "IDX_fface4db28aaa3675565c10c9b" ON "activities-v2" ("action") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_a37307f204a293b6437632a478" ON "activities-v2" ("baseSellTokenAddress") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7ba7181393b295d77c12e34deb" ON "activities-v2" ("quoteBuyTokenAddress") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_388ed5fd0d16645bf567edc3a2" ON "activities-v2" ("timestamp") `);
    await queryRunner.query(`CREATE INDEX "IDX_e4b13cb8b317ced37902d2e4df" ON "activities-v2" ("blockNumber") `);
    await queryRunner.query(`CREATE INDEX "IDX_029a6f27fd8c3acdb7bdf47569" ON "activities-v2" ("logIndex") `);
    await queryRunner.query(`CREATE INDEX "IDX_8e831f05c8e4425ec7cb48dd73" ON "activities-v2" ("transactionIndex") `);
    await queryRunner.query(
      `ALTER TABLE "activities-v2" ADD CONSTRAINT "FK_b00f82c523e04d902a52f96a0c7" FOREIGN KEY ("token0Id") REFERENCES "tokens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "activities-v2" ADD CONSTRAINT "FK_09c42c10e51e5b43cb051bc3afc" FOREIGN KEY ("token1Id") REFERENCES "tokens"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "activities-v2" DROP CONSTRAINT "FK_09c42c10e51e5b43cb051bc3afc"`);
    await queryRunner.query(`ALTER TABLE "activities-v2" DROP CONSTRAINT "FK_b00f82c523e04d902a52f96a0c7"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8e831f05c8e4425ec7cb48dd73"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_029a6f27fd8c3acdb7bdf47569"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e4b13cb8b317ced37902d2e4df"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_388ed5fd0d16645bf567edc3a2"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7ba7181393b295d77c12e34deb"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a37307f204a293b6437632a478"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_fface4db28aaa3675565c10c9b"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_29c26548428fa789f65cb7242e"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2f85307a9c581907b40899a4cb"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_39bcc57a01e25d0a70837d1782"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_828401bd1175f97080473e119b"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_159d1ef9c844ad2bf40c894e3e"`);
    await queryRunner.query(`DROP TABLE "activities-v2"`);
  }
}
