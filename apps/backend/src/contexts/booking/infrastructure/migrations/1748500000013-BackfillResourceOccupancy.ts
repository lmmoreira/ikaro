import { MigrationInterface, QueryRunner } from 'typeorm';

// Backfill phase (2 of 3) — docs/13-DATABASE_SCHEMA.md § booking.resource_occupancy migration
// ordering. Backfills every pre-existing APPROVED booking (M22-S03's own AC — no time-window
// qualifier), not just ones with a still-future scheduled_end_at: M22-S04's day grid depends on
// every pre-existing booking having a resource assignment, including past ones, to render
// historical schedule views. A past-window COMMITTED row poses no exclusivity risk (nothing can
// schedule into the past) and is swept by the same 90-day-past-ends_at GC as any other row.
// Idempotent via NOT EXISTS: skips any booking line that already has an assignment row, safe to
// re-run.
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
          AND NOT EXISTS (
            SELECT 1 FROM "booking"."booking_line_resource_assignments" existing
            WHERE existing."tenant_id" = bl."tenant_id" AND existing."booking_line_id" = bl."line_id"
          )
        RETURNING "id", "tenant_id", "booking_line_id", "resource_id", "resource_type", "resource_name_at_assignment"
      ),
      -- Every backfilled line falls back to the same tenant-wide LOCATION resource, so a
      -- multi-line booking's lines must get their own sequential, non-overlapping sub-windows
      -- (matching the write path's cursor-based sequencing and Booking.totalDurationMins — a pure
      -- sum of each line's own duration, no inter-line buffer) instead of all sharing the whole
      -- booking's scheduled_at/scheduled_end_at — the new GIST exclusion constraint would
      -- otherwise reject the migration's own inserts for any pre-existing multi-line booking.
      -- line_id is a uuidv7 PK, generated in creation order within the same booking, so ORDER BY
      -- line_id reconstructs the original sequential order.
      -- The very last line also gets max(service.buffer_after_minutes, resource.turnover_minutes)
      -- added to its ends_at, same as resource-occupancy.helpers.ts's resolveFlatLineCandidates
      -- (write path) — never between two lines of the same booking. Without this, a backfilled
      -- row's ends_at would be gap-free while every newly-approved booking's isn't, letting a new
      -- booking land with zero buffer right after a pre-existing one.
      line_windows AS (
        SELECT
          ia."id" AS assignment_id,
          ia."tenant_id",
          ia."resource_id",
          ia."resource_type",
          ia."resource_name_at_assignment",
          b."scheduled_at" + (
            COALESCE(SUM(bl."duration_mins_at_booking") OVER (
              PARTITION BY bl."booking_id"
              ORDER BY bl."line_id"
              ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ), 0) * INTERVAL '1 minute'
          ) AS starts_at,
          b."scheduled_at" + (
            (
              SUM(bl."duration_mins_at_booking") OVER (
                PARTITION BY bl."booking_id"
                ORDER BY bl."line_id"
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
              )
              + CASE
                  WHEN SUM(bl."duration_mins_at_booking") OVER (
                         PARTITION BY bl."booking_id"
                         ORDER BY bl."line_id"
                         ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                       )
                       = SUM(bl."duration_mins_at_booking") OVER (PARTITION BY bl."booking_id")
                  THEN GREATEST(svc."buffer_after_minutes", res."turnover_minutes")
                  ELSE 0
                END
            ) * INTERVAL '1 minute'
          ) AS ends_at
        FROM inserted_assignments ia
        JOIN "booking"."booking_lines" bl
          ON bl."tenant_id" = ia."tenant_id" AND bl."line_id" = ia."booking_line_id"
        JOIN "booking"."bookings" b
          ON b."tenant_id" = bl."tenant_id" AND b."id" = bl."booking_id"
        JOIN "booking"."services" svc
          ON svc."tenant_id" = bl."tenant_id" AND svc."id" = bl."service_id"
        JOIN "booking"."resources" res
          ON res."tenant_id" = ia."tenant_id" AND res."id" = ia."resource_id"
      )
      INSERT INTO "booking"."resource_occupancy"
        ("id", "tenant_id", "resource_id", "resource_type", "source_type",
         "booking_line_resource_assignment_id", "leg_index", "class_session_id",
         "resource_name_at_assignment", "starts_at", "ends_at", "lock_state", "hold_expires_at", "created_at")
      SELECT
        gen_random_uuid(), lw."tenant_id", lw."resource_id", lw."resource_type", 'BOOKING_LINE',
        lw."assignment_id", NULL, NULL,
        lw."resource_name_at_assignment", lw."starts_at", lw."ends_at", 'COMMITTED', NULL, now()
      FROM line_windows lw
    `);
  }

  // Data-only migration — no schema to revert. Deleting the backfilled rows on rollback would
  // require distinguishing "backfilled by this migration" from "written since by the real write
  // path" with no qualifying column to do so (same class of limitation as
  // BackfillLocationResources1748500000008's down()) — left as a documented no-op rather than a
  // blunt delete-everything that could remove live data.
  public async down(): Promise<void> {}
}
