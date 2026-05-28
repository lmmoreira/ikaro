import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLoyaltyLoyaltyEntries1748000000016 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "loyalty"`);
    await queryRunner.query(`
      CREATE TABLE "loyalty"."loyalty_entries" (
        "id"               UUID        NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"        UUID        NOT NULL,
        "customer_id"      UUID        NOT NULL,
        "booking_id"       UUID        NOT NULL,
        "booking_line_id"  UUID        NOT NULL,
        "service_id"       UUID        NOT NULL,
        "points"           INTEGER     NOT NULL CHECK (points > 0),
        "earned_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        "expires_at"       TIMESTAMPTZ NOT NULL,
        CONSTRAINT "PK_loyalty_entries" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_loyalty_entries_tenant_booking_line"
          UNIQUE ("tenant_id", "booking_line_id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_loyalty_entries_tenant_id"
        ON "loyalty"."loyalty_entries" ("tenant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_loyalty_entries_tenant_customer"
        ON "loyalty"."loyalty_entries" ("tenant_id", "customer_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_loyalty_entries_tenant_customer_expires"
        ON "loyalty"."loyalty_entries" ("tenant_id", "customer_id", "expires_at")
    `);
    await queryRunner.query(`
      CREATE TABLE "loyalty"."processed_events" (
        "event_id"      UUID         NOT NULL,
        "consumer_name" VARCHAR(100) NOT NULL,
        "processed_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_loyalty_processed_events" PRIMARY KEY ("event_id", "consumer_name"),
        CONSTRAINT "UQ_loyalty_processed_events" UNIQUE ("event_id", "consumer_name")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "loyalty"."processed_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "loyalty"."loyalty_entries"`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS "loyalty"`);
  }
}
