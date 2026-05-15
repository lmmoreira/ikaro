import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePlatformHotsiteConfigs1716500000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "platform"."hotsite_configs" (
        "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"    UUID        NOT NULL,
        "branding"     JSONB       NOT NULL DEFAULT '{}',
        "layout"       JSONB       NOT NULL DEFAULT '[]',
        "is_published" BOOLEAN     NOT NULL DEFAULT false,
        "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_platform_hotsite_configs"           PRIMARY KEY ("id"),
        CONSTRAINT "UQ_platform_hotsite_configs_tenant_id" UNIQUE ("tenant_id"),
        CONSTRAINT "FK_platform_hotsite_configs_tenant_id" FOREIGN KEY ("tenant_id")
          REFERENCES "platform"."tenants" ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "platform"."hotsite_configs"`);
  }
}
