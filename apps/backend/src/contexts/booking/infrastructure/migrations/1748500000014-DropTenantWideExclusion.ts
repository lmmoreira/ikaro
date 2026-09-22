import { MigrationInterface, QueryRunner } from 'typeorm';

// Contract phase (3 of 3) — docs/13-DATABASE_SCHEMA.md § booking.resource_occupancy migration
// ordering. Drops the old whole-tenant exclusion constraint now that resource_occupancy's own
// shared GIST exclusion constraint (EX_booking_resource_occupancy_locked_window, created in
// 1748500000012) is live, dual-written (every booking creation/approval path, M22-S03), and
// backfilled (1748500000013) for every pre-existing approved booking.
//
// This platform is pre-production with no per-tenant feature-flag mechanism, so this is a single,
// irreversible cutover for every tenant at once, not a staged rollout. Rather than relying on a
// process step ("re-verify no live tenants yet" at deploy time) that could go stale or get
// skipped, the migration mechanically fails closed on the actual safety precondition itself:
// dropping the old constraint is safe exactly when every APPROVED booking line already has a
// COMMITTED resource_occupancy row (BackfillResourceOccupancy1748500000013's own job) — not merely
// when "no tenants exist yet," which is a proxy for that, not the real invariant.
export class DropTenantWideExclusion1748500000014 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        unprotected_count INTEGER;
      BEGIN
        SELECT COUNT(*) INTO unprotected_count
        FROM "booking"."bookings" b
        JOIN "booking"."booking_lines" bl
          ON bl."tenant_id" = b."tenant_id" AND bl."booking_id" = b."id"
        WHERE b."status" = 'APPROVED'
          AND NOT EXISTS (
            SELECT 1
            FROM "booking"."booking_line_resource_assignments" bla
            JOIN "booking"."resource_occupancy" ro
              ON ro."tenant_id" = bla."tenant_id"
              AND ro."booking_line_resource_assignment_id" = bla."id"
              AND ro."lock_state" = 'COMMITTED'
            WHERE bla."tenant_id" = bl."tenant_id" AND bla."booking_line_id" = bl."line_id"
          );

        IF unprotected_count > 0 THEN
          RAISE EXCEPTION
            'DropTenantWideExclusion1748500000014: % APPROVED booking line(s) have no COMMITTED resource_occupancy row — run BackfillResourceOccupancy1748500000013 (or investigate) before dropping the legacy exclusion constraint',
            unprotected_count;
        END IF;
      END $$;
    `);
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
