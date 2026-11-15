import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M25-S27: the ledger of suspension spans during which a tenant's loyalty points do not expire,
 * plus the standalone `expires_at` index the system-wide expiry sweep and warning need (the
 * existing index leads with `tenant_id`, which those cross-tenant reads do not filter by).
 */
export class CreateLoyaltyTenantExpiryPauses1748500000044 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "loyalty"."tenant_expiry_pauses" (
        "tenant_id"  UUID        NOT NULL,
        "paused_at"  TIMESTAMPTZ NOT NULL,
        "resumed_at" TIMESTAMPTZ,
        CONSTRAINT "PK_loyalty_tenant_expiry_pauses" PRIMARY KEY ("tenant_id", "paused_at"),
        CONSTRAINT "CHK_loyalty_tenant_expiry_pauses_span"
          CHECK ("resumed_at" IS NULL OR "resumed_at" >= "paused_at")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_loyalty_tenant_expiry_pauses_open"
        ON "loyalty"."tenant_expiry_pauses" ("tenant_id")
        WHERE "resumed_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_loyalty_entries_expires_at"
        ON "loyalty"."loyalty_entries" ("expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "loyalty"."IDX_loyalty_entries_expires_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "loyalty"."tenant_expiry_pauses"`);
  }
}
