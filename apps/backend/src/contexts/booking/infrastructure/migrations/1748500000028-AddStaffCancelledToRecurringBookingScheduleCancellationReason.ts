import { MigrationInterface, QueryRunner } from 'typeorm';

// M23-S28 — a schedule ended by staff on the customer's behalf is recorded as STAFF_CANCELLED
// instead of CUSTOMER_CANCELLED (docs/04-USE_CASES.md UC-070 A2), so the cancellation reason and
// the `endedBy` of RecurringBookingScheduleEnded agree.
//
// Existing rows are left as they are: a CANCELLED/CUSTOMER_CANCELLED row cannot be told apart
// from one staff ended, and the old value stays valid in the widened constraint.
//
// A separate migration rather than an edit of 1748500000017, which has already run in staging.
// The constraint is replaced as NOT VALID + a separate VALIDATE CONSTRAINT (docs/ANTI_PATTERNS.md
// § A plain ALTER TABLE): a plain ADD CONSTRAINT would hold ACCESS EXCLUSIVE while it scans the
// table; NOT VALID takes only a brief lock and VALIDATE runs under SHARE UPDATE EXCLUSIVE.
export class AddStaffCancelledToRecurringBookingScheduleCancellationReason1748500000028 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "booking"."recurring_booking_schedules" DROP CONSTRAINT "CHK_booking_rbs_cancellation_reason"`,
    );
    await queryRunner.query(`
      ALTER TABLE "booking"."recurring_booking_schedules"
        ADD CONSTRAINT "CHK_booking_rbs_cancellation_reason"
        CHECK (
          "cancellation_reason" IS NULL OR "cancellation_reason" IN (
            'CUSTOMER_CANCELLED', 'STAFF_CANCELLED', 'APPROVAL_REJECTED', 'APPROVAL_EXPIRED'
          )
        ) NOT VALID
    `);
    await queryRunner.query(
      `ALTER TABLE "booking"."recurring_booking_schedules" VALIDATE CONSTRAINT "CHK_booking_rbs_cancellation_reason"`,
    );
  }

  // Rows already holding STAFF_CANCELLED are folded back to CUSTOMER_CANCELLED first so the
  // narrower constraint never meets a value it does not know.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "booking"."recurring_booking_schedules"
         SET "cancellation_reason" = 'CUSTOMER_CANCELLED'
       WHERE "cancellation_reason" = 'STAFF_CANCELLED'
    `);
    await queryRunner.query(
      `ALTER TABLE "booking"."recurring_booking_schedules" DROP CONSTRAINT "CHK_booking_rbs_cancellation_reason"`,
    );
    await queryRunner.query(`
      ALTER TABLE "booking"."recurring_booking_schedules"
        ADD CONSTRAINT "CHK_booking_rbs_cancellation_reason"
        CHECK (
          "cancellation_reason" IS NULL OR "cancellation_reason" IN (
            'CUSTOMER_CANCELLED', 'APPROVAL_REJECTED', 'APPROVAL_EXPIRED'
          )
        ) NOT VALID
    `);
    await queryRunner.query(
      `ALTER TABLE "booking"."recurring_booking_schedules" VALIDATE CONSTRAINT "CHK_booking_rbs_cancellation_reason"`,
    );
  }
}
