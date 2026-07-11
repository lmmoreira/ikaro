import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSharedOutbox1748400000006 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "shared"."outbox" (
        "id"           UUID         NOT NULL,
        "dedup_key"    VARCHAR(255) NOT NULL,
        "tenant_id"    UUID         NOT NULL,
        "event_name"   VARCHAR(100) NOT NULL,
        "payload"      JSONB        NOT NULL,
        "created_at"   TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "published_at" TIMESTAMPTZ  NULL,
        CONSTRAINT "PK_shared_outbox" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_shared_outbox_dedup_key" UNIQUE ("dedup_key")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_shared_outbox_unpublished"
        ON "shared"."outbox" ("created_at") WHERE "published_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_shared_outbox_published_gc"
        ON "shared"."outbox" ("published_at") WHERE "published_at" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "shared"."outbox"`);
  }
}
