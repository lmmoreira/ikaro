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

  // The table is an append-only audit record, so a rollback must not silently cut reason text.
  public async down(queryRunner: QueryRunner): Promise<void> {
    const tooLong: unknown[] = await queryRunner.query(`
      SELECT 1 FROM "booking"."booking_status_transitions" WHERE char_length("reason") > 500 LIMIT 1
    `);
    if (tooLong.length > 0) {
      throw new Error(
        'Cannot revert booking_status_transitions.reason to VARCHAR(500): rows hold a longer reason',
      );
    }
    await queryRunner.query(`
      ALTER TABLE "booking"."booking_status_transitions" ALTER COLUMN "reason" TYPE VARCHAR(500)
    `);
  }
}
