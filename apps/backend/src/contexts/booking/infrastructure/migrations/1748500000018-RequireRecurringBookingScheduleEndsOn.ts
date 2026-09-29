import { MigrationInterface, QueryRunner } from 'typeorm';

// M23-S18 — a recurring schedule is a fixed term, never open-ended: `ends_on` becomes NOT NULL
// (docs/13-DATABASE_SCHEMA.md § booking.recurring_booking_schedules). No backfill: no schedule row
// exists in any environment yet (confirmed at story discovery, 2026-09-29), so nothing holds a
// NULL. A separate migration rather than an edit of 1748500000017, which has already run in
// staging. If a NULL row ever did exist, SET NOT NULL fails loudly instead of inventing an end
// date for a customer's commitment.
export class RequireRecurringBookingScheduleEndsOn1748500000018 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "booking"."recurring_booking_schedules" ALTER COLUMN "ends_on" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "booking"."recurring_booking_schedules" ALTER COLUMN "ends_on" DROP NOT NULL`,
    );
  }
}
