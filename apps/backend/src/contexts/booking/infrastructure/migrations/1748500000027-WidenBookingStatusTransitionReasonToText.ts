import { MigrationInterface, QueryRunner } from 'typeorm';

// M23-S26 — every status change now writes an audit row, including a reject or cancel whose reason
// has no length cap (the DTOs are uncapped and bookings.rejection_reason / cancellation_reason are
// TEXT). A VARCHAR(500) audit column would fail the insert for a long reason, after the booking
// itself saved. varchar(n) -> text is a metadata-only change in PostgreSQL (no table rewrite) and
// every existing value fits, so it is backward compatible.
export class WidenBookingStatusTransitionReasonToText1748500000027 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "booking"."booking_status_transitions" ALTER COLUMN "reason" TYPE TEXT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "booking"."booking_status_transitions"
        ALTER COLUMN "reason" TYPE VARCHAR(500) USING LEFT("reason", 500)
    `);
  }
}
