import { MigrationInterface, QueryRunner } from 'typeorm';

// M23-S24 — the contract step of M23-S08's removal of the schedule-side occurrence-exception path.
// S08 stopped reading and writing this table but left it in place: migrations run in a separate
// job before the deploy, so the previous revision still loaded it for a while. S08 is now live
// everywhere (staging only — there is no production environment yet) and the table held 0 rows
// (confirmed at story discovery, 2026-09-30), so nothing is dropped silently.
export class DropRecurringBookingScheduleExceptions1748500000021 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "booking"."recurring_booking_schedule_exceptions"`,
    );
  }

  // Recreates the table exactly as 1748500000017-CreateRecurringBookingSchedules defined it.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "booking"."recurring_booking_schedule_exceptions" (
        "id"                        UUID          NOT NULL,
        "tenant_id"                 UUID          NOT NULL,
        "recurring_schedule_id"     UUID          NOT NULL,
        "occurrence_start"          TIMESTAMPTZ   NOT NULL,
        "kind"                      VARCHAR(20)   NOT NULL,
        "replacement_booking_id"    UUID,
        "actor_type"                VARCHAR(20)   NOT NULL,
        "actor_id"                  UUID,
        "reason"                    VARCHAR(255),
        "created_at"                TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_booking_rbs_exceptions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_booking_rbs_exceptions_schedule"
          FOREIGN KEY ("tenant_id", "recurring_schedule_id")
          REFERENCES "booking"."recurring_booking_schedules" ("tenant_id", "id"),
        CONSTRAINT "FK_booking_rbs_exceptions_replacement_booking"
          FOREIGN KEY ("tenant_id", "replacement_booking_id")
          REFERENCES "booking"."bookings" ("tenant_id", "id"),
        CONSTRAINT "CHK_booking_rbs_exceptions_kind" CHECK ("kind" IN ('SKIPPED', 'RESCHEDULED')),
        CONSTRAINT "CHK_booking_rbs_exceptions_replacement" CHECK (
          ("kind" = 'RESCHEDULED') = ("replacement_booking_id" IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_booking_rbs_exceptions_schedule_occurrence"
        ON "booking"."recurring_booking_schedule_exceptions"
        ("tenant_id", "recurring_schedule_id", "occurrence_start")
    `);
  }
}
