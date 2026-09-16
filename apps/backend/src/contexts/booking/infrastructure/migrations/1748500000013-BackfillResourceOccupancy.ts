import { MigrationInterface, QueryRunner } from 'typeorm';

// Backfill phase (2 of 3) — docs/13-DATABASE_SCHEMA.md § booking.resource_occupancy migration
// ordering. Scoped to APPROVED bookings with a still-future scheduled_end_at only — resource_
// occupancy exists purely to protect FUTURE availability (90-day-past-ends_at GC sweep), so
// backfilling a PENDING/REJECTED/CANCELLED/COMPLETED or already-past booking would create rows
// with no business purpose the very next GC sweep would delete. Idempotent via NOT EXISTS: skips
// any booking line that already has an assignment row, safe to re-run.
export class BackfillResourceOccupancy1748500000013 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH inserted_assignments AS (
        INSERT INTO "booking"."booking_line_resource_assignments"
          ("id", "tenant_id", "booking_line_id", "resource_id", "resource_type",
           "leg_index", "quantity_position", "resource_name_at_assignment", "assigned_at")
        SELECT
          gen_random_uuid(), bl."tenant_id", bl."line_id", r."id", r."type",
          NULL, NULL, r."name", now()
        FROM "booking"."booking_lines" bl
        JOIN "booking"."bookings" b
          ON b."tenant_id" = bl."tenant_id" AND b."id" = bl."booking_id"
        JOIN "booking"."resources" r
          ON r."tenant_id" = bl."tenant_id" AND r."type" = 'LOCATION' AND r."is_active"
        WHERE b."status" = 'APPROVED'
          AND b."scheduled_end_at" > now()
          AND NOT EXISTS (
            SELECT 1 FROM "booking"."booking_line_resource_assignments" existing
            WHERE existing."tenant_id" = bl."tenant_id" AND existing."booking_line_id" = bl."line_id"
          )
        RETURNING "id", "tenant_id", "booking_line_id", "resource_id", "resource_type", "resource_name_at_assignment"
      )
      INSERT INTO "booking"."resource_occupancy"
        ("id", "tenant_id", "resource_id", "resource_type", "source_type",
         "booking_line_resource_assignment_id", "leg_index", "class_session_id",
         "resource_name_at_assignment", "starts_at", "ends_at", "lock_state", "hold_expires_at", "created_at")
      SELECT
        gen_random_uuid(), ia."tenant_id", ia."resource_id", ia."resource_type", 'BOOKING_LINE',
        ia."id", NULL, NULL,
        ia."resource_name_at_assignment", b."scheduled_at", b."scheduled_end_at", 'COMMITTED', NULL, now()
      FROM inserted_assignments ia
      JOIN "booking"."booking_lines" bl
        ON bl."tenant_id" = ia."tenant_id" AND bl."line_id" = ia."booking_line_id"
      JOIN "booking"."bookings" b
        ON b."tenant_id" = bl."tenant_id" AND b."id" = bl."booking_id"
    `);
  }

  // Data-only migration — no schema to revert. Deleting the backfilled rows on rollback would
  // require distinguishing "backfilled by this migration" from "written since by the real write
  // path" with no qualifying column to do so (same class of limitation as
  // BackfillLocationResources1748500000008's down()) — left as a documented no-op rather than a
  // blunt delete-everything that could remove live data.
  public async down(): Promise<void> {}
}
