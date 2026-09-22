import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePlatformLeadFormConfigs1748500000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "platform"."lead_form_configs" (
        "tenant_id"      UUID          NOT NULL,
        "audience_mode"  VARCHAR(20)   NOT NULL DEFAULT 'GUEST_AND_CUSTOMER',
        "questions"      JSONB         NOT NULL DEFAULT '[]',
        "updated_at"     TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_platform_lead_form_configs" PRIMARY KEY ("tenant_id"),
        CONSTRAINT "CHK_platform_lead_form_configs_audience_mode"
          CHECK ("audience_mode" IN ('GUEST_AND_CUSTOMER', 'CUSTOMER_ONLY')),
        CONSTRAINT "FK_platform_lead_form_configs_tenant_id" FOREIGN KEY ("tenant_id")
          REFERENCES "platform"."tenants" ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "platform"."lead_form_configs"`);
  }
}
