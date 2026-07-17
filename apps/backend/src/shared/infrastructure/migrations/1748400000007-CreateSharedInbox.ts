import { MigrationInterface, QueryRunner } from 'typeorm';

// TD24-S04: shared consumer-dedup table for loyalty, notification, and staff. Pre-production —
// migration history was squashed so loyalty.processed_events/notification.processed_events never
// existed (see CreateLoyaltyLoyaltyEntries1748000000016, CreateNotificationProcessedEvents
// deleted) rather than creating this table via copy-then-drop from them.
// consumer_name sized VARCHAR(400) from the start (squashed again, same pre-production rationale,
// AUD-004 item 3/TD24-D17): wide enough for notification's multi-recipient dispatch composing
// `${notificationType}:${channel}:${recipientEmail}`, not just `${notificationType}:${channel}`.
export class CreateSharedInbox1748400000007 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "shared"."inbox" (
        "event_id"      UUID         NOT NULL,
        "consumer_name" VARCHAR(400) NOT NULL,
        "processed_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shared_inbox" PRIMARY KEY ("event_id", "consumer_name")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_shared_inbox_processed_at" ON "shared"."inbox" ("processed_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "shared"."inbox"`);
  }
}
