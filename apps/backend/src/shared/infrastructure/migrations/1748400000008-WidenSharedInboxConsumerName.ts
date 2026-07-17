import { MigrationInterface, QueryRunner } from 'typeorm';

// AUD-004 item 3 (TD08): notification's multi-recipient dispatch now claims one inbox row per
// (eventId, notificationType:channel:recipientEmail) instead of one per (eventId,
// notificationType:channel) for the whole recipient batch — so a partial-failure retry only
// re-sends to the recipient that actually failed. VARCHAR(150) was sized for
// "notificationType:channel" only; widened to fit an appended email (RFC 5321 max 254 chars).
// Pre-production (no environment has run CreateSharedInbox1748400000007's original width), so a
// plain ALTER is used rather than an expand/contract migration.
export class WidenSharedInboxConsumerName1748400000008 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shared"."inbox" ALTER COLUMN "consumer_name" TYPE VARCHAR(400)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "shared"."inbox" ALTER COLUMN "consumer_name" TYPE VARCHAR(150)
    `);
  }
}
