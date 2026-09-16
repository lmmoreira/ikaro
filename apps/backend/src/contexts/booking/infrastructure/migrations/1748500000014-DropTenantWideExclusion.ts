import { MigrationInterface, QueryRunner } from 'typeorm';

// Contract phase (3 of 3) — docs/13-DATABASE_SCHEMA.md § booking.resource_occupancy migration
// ordering. Drops the old whole-tenant exclusion constraint now that resource_occupancy's own
// shared GIST exclusion constraint (EX_booking_resource_occupancy_locked_window, created in
// 1748500000012) is live, dual-written (every booking creation/approval path, M22-S03), and
// backfilled (1748500000013) for every pre-existing approved booking.
//
// NON-NEGOTIABLE PRE-DEPLOY STEP, per this milestone's own Non-Goals section: re-verify "no live
// tenants yet" immediately before this migration runs in any real environment — do not treat the
// drafting-time assumption as still true at deploy time without checking. This platform is
// pre-production with no per-tenant feature-flag mechanism, so this is a single, irreversible
// cutover for every tenant at once, not a staged rollout.
export class DropTenantWideExclusion1748500000014 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "booking"."bookings"
        DROP CONSTRAINT IF EXISTS "EX_booking_bookings_approved_slot"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "booking"."bookings"
        ADD CONSTRAINT "EX_booking_bookings_approved_slot"
          EXCLUDE USING gist (
            "tenant_id" WITH =,
            tstzrange("scheduled_at", "scheduled_end_at", '[)') WITH &&
          )
          WHERE ("status" = 'APPROVED')
    `);
  }
}
