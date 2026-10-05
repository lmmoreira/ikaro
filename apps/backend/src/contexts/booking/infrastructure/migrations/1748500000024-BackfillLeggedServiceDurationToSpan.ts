import { MigrationInterface, QueryRunner } from 'typeorm';

// M23-S11b — a legged service's persisted `duration_minutes` is now always its legs' span
// (sum of leg durations + every transition gap except the last leg's, UC-052): every booking line
// copies it, and the availability/occupancy cursor advances by it between the lines of one
// booking. Before this, `Service.setLegs()` left it at whatever the Details tab held, so a booking
// line's length could disagree with its own legs.
//
// Data-only and backward compatible (no schema change): the old code ignored the column for leg
// windows, and the new aggregate recomputes it on every legs/details write. Existing bookings keep
// the duration they were persisted with — only the service rows move. A separate migration, since
// 1748500000010 (which introduced legs) has already run in staging.
export class BackfillLeggedServiceDurationToSpan1748500000024 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "booking"."services" AS s
         SET "duration_minutes" = spans."span_minutes",
             "updated_at" = now()
        FROM (
          SELECT "tenant_id",
                 "service_id",
                 SUM("duration_minutes") + SUM("transition_gap_after_minutes")
                   - (ARRAY_AGG("transition_gap_after_minutes" ORDER BY "leg_index" DESC))[1]
                   AS "span_minutes"
            FROM "booking"."service_legs"
           GROUP BY "tenant_id", "service_id"
        ) AS spans
       WHERE s."tenant_id" = spans."tenant_id"
         AND s."id" = spans."service_id"
         AND s."duration_minutes" IS DISTINCT FROM spans."span_minutes"
    `);
  }

  // The previous per-service values were arbitrary Details-tab durations that disagreed with the
  // legs; there is nothing meaningful to restore, so the span stays.
  public async down(): Promise<void> {
    return;
  }
}
