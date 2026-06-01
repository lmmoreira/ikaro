import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationProcessedEvents1748200000020 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notification"."processed_events" (
        "event_id"          UUID         NOT NULL,
        "notification_type" VARCHAR(100) NOT NULL,
        "channel"           VARCHAR(32)  NOT NULL,
        "processed_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_processed_events"
          PRIMARY KEY ("event_id", "notification_type", "channel")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification"."processed_events"`);
  }
}
