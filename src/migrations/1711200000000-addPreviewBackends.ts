import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPreviewBackends1711200000000 implements MigrationInterface {
  name = 'AddPreviewBackends1711200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "preview_backends" (
        "id" SERIAL NOT NULL,
        "tenderlyId" character varying NOT NULL,
        "instanceName" character varying NOT NULL,
        "instanceId" character varying NOT NULL,
        "provider" character varying NOT NULL DEFAULT 'gce',
        "url" character varying NOT NULL,
        "deployment" character varying NOT NULL,
        "networkId" integer NOT NULL,
        "forkBlock" integer NOT NULL,
        "currentBlock" integer,
        "rpcUrl" character varying NOT NULL,
        "status" character varying NOT NULL DEFAULT 'creating',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_preview_backends_tenderlyId" UNIQUE ("tenderlyId"),
        CONSTRAINT "PK_preview_backends" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_preview_backends_tenderlyId" ON "preview_backends" ("tenderlyId")`);
    await queryRunner.query(`CREATE INDEX "IDX_preview_backends_status" ON "preview_backends" ("status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_preview_backends_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_preview_backends_tenderlyId"`);
    await queryRunner.query(`DROP TABLE "preview_backends"`);
  }
}
