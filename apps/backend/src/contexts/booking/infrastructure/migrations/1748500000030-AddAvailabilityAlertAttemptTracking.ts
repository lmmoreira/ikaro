import { MigrationInterface, QueryRunner } from 'typeorm';

// M23-S38 — the Notification context reports how each availability-alert email went:
// `attempt_count` (tries made) and `last_error` (redacted reason of the last failure), next to the
// existing `outcome`, whose new values SENT and FAILED need no migration (no CHECK, docs/13).
//
// Expand-only and backward compatible: a constant default makes the ADD COLUMN a metadata-only
// change in PostgreSQL 11+, so there is no table rewrite, and old code that never writes the
// columns keeps working.
export class AddAvailabilityAlertAttemptTracking1748500000030 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "booking"."availability_alert_notification_attempts"
        ADD COLUMN "attempt_count" INT NOT NULL DEFAULT 0,
        ADD COLUMN "last_error" VARCHAR(500) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "booking"."availability_alert_notification_attempts"
        DROP COLUMN "last_error",
        DROP COLUMN "attempt_count"
    `);
  }
}
