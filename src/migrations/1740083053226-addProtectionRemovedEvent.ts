import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProtectionRemovedEvent1740083053226 implements MigrationInterface {
  name = 'AddProtectionRemovedEvent1740083053226';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "protection-removed-events" ("id" SERIAL NOT NULL, "blockchainType" character varying NOT NULL, "exchangeId" character varying NOT NULL, "provider" character varying NOT NULL, "poolToken" character varying NOT NULL, "reserveToken" character varying NOT NULL, "poolAmount" character varying NOT NULL, "reserveAmount" character varying NOT NULL, "transactionIndex" integer NOT NULL, "transactionHash" character varying NOT NULL, "timestamp" TIMESTAMP NOT NULL, "logIndex" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "blockId" integer, CONSTRAINT "UQ_c87b82d1fe5fed8380696892100" UNIQUE ("transactionIndex", "transactionHash", "logIndex"), CONSTRAINT "PK_fe2105de523181c1194dd0833c9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d51e7a593e43512128d7d941f2" ON "protection-removed-events" ("blockchainType") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e42e2c560058b9b006a4f5af15" ON "protection-removed-events" ("exchangeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_931a18b62f3a83d583b1990458" ON "protection-removed-events" ("blockId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2efb4ea266c393e1e8bfe51c88" ON "protection-removed-events" ("timestamp") `,
    );
    await queryRunner.query(
      `ALTER TABLE "protection-removed-events" ADD CONSTRAINT "FK_931a18b62f3a83d583b1990458b" FOREIGN KEY ("blockId") REFERENCES "blocks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "protection-removed-events" DROP CONSTRAINT "FK_931a18b62f3a83d583b1990458b"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2efb4ea266c393e1e8bfe51c88"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_931a18b62f3a83d583b1990458"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e42e2c560058b9b006a4f5af15"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d51e7a593e43512128d7d941f2"`);
    await queryRunner.query(`DROP TABLE "protection-removed-events"`);
  }
}
