import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLeadFormSubmissions1748400000014 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "platform"."lead_form_submissions" (
        "id"             UUID          NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"      UUID          NOT NULL,
        "customer_id"    UUID          NULL,
        "name"           VARCHAR       NOT NULL,
        "email"          VARCHAR       NOT NULL,
        "phone"          VARCHAR       NOT NULL,
        "answers"        JSONB         NOT NULL,
        "submitted_at"   TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "expires_at"     TIMESTAMPTZ   NOT NULL,
        "ip_address"     VARCHAR(45)   NOT NULL,
        CONSTRAINT "PK_platform_lead_form_submissions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_platform_lead_form_submissions_tenant_id" UNIQUE ("tenant_id", "id"),
        CONSTRAINT "FK_platform_lead_form_submissions_tenant_id" FOREIGN KEY ("tenant_id")
          REFERENCES "platform"."tenants" ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_platform_lead_form_submissions_tenant_submitted_at"
        ON "platform"."lead_form_submissions" ("tenant_id", "submitted_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_platform_lead_form_submissions_tenant_ip_submitted_at"
        ON "platform"."lead_form_submissions" ("tenant_id", "ip_address", "submitted_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_platform_lead_form_submissions_tenant_expires_at"
        ON "platform"."lead_form_submissions" ("tenant_id", "expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "platform"."lead_form_submissions"`);
  }
}
