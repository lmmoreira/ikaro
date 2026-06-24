import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStaffStaff1716600000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "staff"."staff" (
        "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"       UUID         NOT NULL,
        "google_oauth_id" VARCHAR(255),
        "email"           VARCHAR(255) NOT NULL,
        "role"            VARCHAR(20)  NOT NULL CHECK (role IN ('MANAGER','STAFF')),
        "is_active"       BOOLEAN      NOT NULL DEFAULT true,
        "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_staff_staff" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_staff_staff_tenant_id"
        ON "staff"."staff" ("tenant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_staff_staff_tenant_email"
        ON "staff"."staff" ("tenant_id", "email")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_staff_staff_tenant_oauth"
        ON "staff"."staff" ("tenant_id", "google_oauth_id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_staff_tenant_google_oauth_id"
        ON "staff"."staff" ("tenant_id", "google_oauth_id")
        WHERE "google_oauth_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "staff"."staff"`);
  }
}
