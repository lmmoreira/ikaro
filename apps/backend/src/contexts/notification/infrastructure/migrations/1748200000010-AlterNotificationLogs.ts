import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterNotificationLogs1748200000010 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "notification"."notification_logs"
        ADD COLUMN "recipient_email" VARCHAR(255)  NOT NULL DEFAULT '',
        ADD COLUMN "status"          VARCHAR(20)   NOT NULL DEFAULT 'PENDING'
                                       CONSTRAINT "CHK_notification_logs_status"
                                       CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
        ADD COLUMN "retry_count"     SMALLINT      NOT NULL DEFAULT 0,
        ADD COLUMN "error_message"   TEXT,
        ADD COLUMN "sent_at"         TIMESTAMPTZ
    `);

    await queryRunner.query(`
      ALTER TABLE "notification"."notification_logs"
        DROP CONSTRAINT IF EXISTS "UQ_notification_logs_event_channel"
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notification_logs_tenant_status"
        ON "notification"."notification_logs" ("tenant_id", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notification_logs_tenant_recipient"
        ON "notification"."notification_logs" ("tenant_id", "recipient_email")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "notification"."IDX_notification_logs_tenant_recipient"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "notification"."IDX_notification_logs_tenant_status"`,
    );

    await queryRunner.query(`
      ALTER TABLE "notification"."notification_logs"
        ADD CONSTRAINT "UQ_notification_logs_event_channel"
          UNIQUE ("tenant_id", "event_id", "notification_type", "channel")
    `);

    await queryRunner.query(`
      ALTER TABLE "notification"."notification_logs"
        DROP COLUMN "sent_at",
        DROP COLUMN "error_message",
        DROP COLUMN "retry_count",
        DROP COLUMN "status",
        DROP COLUMN "recipient_email"
    `);
  }
}
