import { MigrationInterface, QueryRunner } from 'typeorm';

// TD24-S04: replaces loyalty.processed_events and notification.processed_events with one shared
// consumer-dedup table. Pre-production migration — copies existing rows, then drops both old
// tables in the same migration (no dual-write/backfill choreography needed).
export class CreateSharedInbox1748400000007 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "shared"."inbox" (
        "event_id"      UUID         NOT NULL,
        "consumer_name" VARCHAR(150) NOT NULL,
        "processed_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shared_inbox" PRIMARY KEY ("event_id", "consumer_name")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_shared_inbox_processed_at" ON "shared"."inbox" ("processed_at")
    `);

    await queryRunner.query(`
      INSERT INTO "shared"."inbox" ("event_id", "consumer_name", "processed_at")
      SELECT "event_id", "consumer_name", "processed_at" FROM "loyalty"."processed_events"
    `);

    await queryRunner.query(`
      INSERT INTO "shared"."inbox" ("event_id", "consumer_name", "processed_at")
      SELECT "event_id", "notification_type" || ':' || "channel", "processed_at"
      FROM "notification"."processed_events"
    `);

    await queryRunner.query(`DROP TABLE "loyalty"."processed_events"`);
    await queryRunner.query(`DROP TABLE "notification"."processed_events"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "loyalty"."processed_events" (
        "event_id"      UUID         NOT NULL,
        "consumer_name" VARCHAR(100) NOT NULL,
        "processed_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_loyalty_processed_events" PRIMARY KEY ("event_id", "consumer_name"),
        CONSTRAINT "UQ_loyalty_processed_events" UNIQUE ("event_id", "consumer_name")
      )
    `);

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

    await queryRunner.query(`DROP TABLE "shared"."inbox"`);
  }
}
