import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePlatformTenants1716500000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "platform"."tenants" (
        "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
        "name"       VARCHAR(255) NOT NULL,
        "slug"       VARCHAR(100) NOT NULL,
        "settings"   JSONB        NOT NULL DEFAULT '{}',
        "is_active"  BOOLEAN      NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_platform_tenants"      PRIMARY KEY ("id"),
        CONSTRAINT "UQ_platform_tenants_slug" UNIQUE ("slug")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "platform"."tenants"`);
  }
}
