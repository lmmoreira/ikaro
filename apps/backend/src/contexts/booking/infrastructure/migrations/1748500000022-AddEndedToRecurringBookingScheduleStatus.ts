import { MigrationInterface, QueryRunner } from 'typeorm';

// M23-S05 — a fixed-term schedule whose last day has passed is moved to ENDED by the expiry job,
// so the `status = 'ACTIVE'` cap and list queries never count an expired schedule.
//
// A separate migration rather than an edit of 1748500000019, which has already run in staging. The
// constraint is replaced as NOT VALID + a separate VALIDATE CONSTRAINT (docs/ANTI_PATTERNS.md § A
// plain ALTER TABLE): a plain ADD CONSTRAINT would hold ACCESS EXCLUSIVE while it scans the table.
export class AddEndedToRecurringBookingScheduleStatus1748500000022 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "booking"."recurring_booking_schedules" DROP CONSTRAINT "CHK_booking_rbs_status"`,
    );
    await queryRunner.query(`
      ALTER TABLE "booking"."recurring_booking_schedules"
        ADD CONSTRAINT "CHK_booking_rbs_status"
        CHECK ("status" IN ('PENDING_APPROVAL', 'ACTIVE', 'CANCELLED', 'ENDED')) NOT VALID
    `);
    await queryRunner.query(
      `ALTER TABLE "booking"."recurring_booking_schedules" VALIDATE CONSTRAINT "CHK_booking_rbs_status"`,
    );
  }

  // A schedule that was ENDED goes back to ACTIVE (its state before the job existed) so the
  // restored constraint never meets a value it does not know.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "booking"."recurring_booking_schedules"
         SET "status" = 'ACTIVE', "updated_at" = now(), "version" = "version" + 1
       WHERE "status" = 'ENDED'
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
}
