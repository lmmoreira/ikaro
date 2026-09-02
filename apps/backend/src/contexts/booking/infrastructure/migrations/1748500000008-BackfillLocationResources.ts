import { MigrationInterface, QueryRunner } from 'typeorm';

// M21-S02 — pure-data migration, no schema change (booking.resources created by
// CreateBookingResources1748500000007). Inserts one active LOCATION resource per tenant,
// regardless of tenants.is_active. Idempotent via WHERE NOT EXISTS: skips any tenant that
// already has an active LOCATION resource, so this migration is safe to re-run and never
// violates UQ_booking_resources_tenant_location.
// Locale-aware name (part 2, story discovery 2026-09-02): matches the two literal strings
// CreateTenantLocationResourceUseCase uses for tenants provisioned going forward — see that
// file's defaultLocationName().
export class BackfillLocationResources1748500000008 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "booking"."resources"
        ("id", "tenant_id", "type", "ref_id", "name", "working_hours",
         "turnover_minutes", "max_capacity", "is_active", "created_at", "updated_at")
      SELECT
        gen_random_uuid(),
        t."id",
        'LOCATION',
        NULL,
        CASE
          WHEN t."settings"->'localization'->>'language' = 'en' THEN 'Main Location'
          ELSE 'Localização Principal'
        END,
        NULL,
        0,
        NULL,
        true,
        now(),
        now()
      FROM "platform"."tenants" t
      WHERE NOT EXISTS (
        SELECT 1 FROM "booking"."resources" r
        WHERE r."tenant_id" = t."id" AND r."type" = 'LOCATION' AND r."is_active"
      )
    `);
  }

  // Every LOCATION resource can only ever originate from this migration — S01's use cases
  // reject POST/type-change to LOCATION (422/409) — so no per-tenant-history qualifier needed.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "booking"."resources" WHERE "type" = 'LOCATION'`);
  }
}
