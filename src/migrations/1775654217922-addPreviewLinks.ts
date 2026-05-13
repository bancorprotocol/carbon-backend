import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPreviewLinks1775654217922 implements MigrationInterface {
  name = 'AddPreviewLinks1775654217922';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "preview_backends" ("id" SERIAL NOT NULL, "tenderlyId" character varying NOT NULL, "instanceName" character varying NOT NULL, "instanceId" character varying NOT NULL, "provider" character varying NOT NULL DEFAULT 'gce', "url" character varying NOT NULL, "deployment" character varying NOT NULL, "networkId" integer NOT NULL, "forkBlock" integer NOT NULL, "currentBlock" integer, "rpcUrl" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'creating', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_16ceead873a31c85bfe86eda184" UNIQUE ("tenderlyId"), CONSTRAINT "PK_0f42e0cdb4a8233a3020aaac6e0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_16ceead873a31c85bfe86eda18" ON "preview_backends" ("tenderlyId") `);
    await queryRunner.query(`ALTER TABLE "strategy-realtime" ADD "updatedAtBlock" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "strategy-realtime" DROP COLUMN "updatedAtBlock"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_16ceead873a31c85bfe86eda18"`);
    await queryRunner.query(`DROP TABLE "preview_backends"`);
  }
}
