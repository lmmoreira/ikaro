import { MigrationInterface, QueryRunner } from 'typeorm';

// M23-S20 — Pause is retired (docs/04-USE_CASES.md UC-070 A2): a fixed-term schedule
// materializes every occurrence up front, so a one-way, resume-less PAUSED status did nothing.
// Backfill first: any row still PAUSED becomes a customer-cancelled schedule, so the constraint
// below never meets a value it no longer knows. No such row exists in any environment (confirmed
// at story discovery, 2026-09-29); the backfill is a safeguard, not a data fix.
//
// A separate migration rather than an edit of 1748500000017, which has already run in staging.
// The constraint is replaced as NOT VALID + a separate VALIDATE CONSTRAINT (docs/ANTI_PATTERNS.md
// § A plain ALTER TABLE): a plain ADD CONSTRAINT would hold ACCESS EXCLUSIVE while it scans the
// table; NOT VALID takes only a brief lock and VALIDATE runs under SHARE UPDATE EXCLUSIVE.
export class RemoveRecurringBookingSchedulePausedStatus1748500000019 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "booking"."recurring_booking_schedules"
         SET "status" = 'CANCELLED',
             "cancellation_reason" = 'CUSTOMER_CANCELLED',
             "updated_at" = now(),
             "version" = "version" + 1
       WHERE "status" = 'PAUSED'
    `);
    await queryRunner.query(
      `ALTER TABLE "booking"."recurring_booking_schedules" DROP CONSTRAINT "CHK_booking_rbs_status"`,
    );
    await queryRunner.query(`
      ALTER TABLE "booking"."recurring_booking_schedules"
        ADD CONSTRAINT "CHK_booking_rbs_status"
        CHECK ("status" IN ('PENDING_APPROVAL', 'ACTIVE', 'CANCELLED')) NOT VALID
    `);
    await queryRunner.query(
      `ALTER TABLE "booking"."recurring_booking_schedules" VALIDATE CONSTRAINT "CHK_booking_rbs_status"`,
    );
  }

  // Restores the previous constraint only. The row rewrite above is not reversible: a schedule
  // that was PAUSED and is now CANCELLED cannot be told apart from one the customer ended.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "booking"."recurring_booking_schedules" DROP CONSTRAINT "CHK_booking_rbs_status"`,
    );
    await queryRunner.query(`
      ALTER TABLE "booking"."recurring_booking_schedules"
        ADD CONSTRAINT "CHK_booking_rbs_status"
        CHECK ("status" IN ('PENDING_APPROVAL', 'ACTIVE', 'PAUSED', 'CANCELLED')) NOT VALID
    `);
    await queryRunner.query(
      `ALTER TABLE "booking"."recurring_booking_schedules" VALIDATE CONSTRAINT "CHK_booking_rbs_status"`,
    );
  }
}
