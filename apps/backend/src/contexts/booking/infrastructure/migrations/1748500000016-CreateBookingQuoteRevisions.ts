import { MigrationInterface, QueryRunner } from 'typeorm';

// M23 Cluster 3 (UC-069) — docs/13-DATABASE_SCHEMA.md § booking.booking_quote_revisions. Wholly
// new, additive table — no existing table modified, no backfill needed. class_session_booking_id
// stays unreachable (no FK target table exists) until M24 creates class_session_bookings.
export class CreateBookingQuoteRevisions1748500000016 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "booking"."booking_quote_revisions" (
        "id"                        UUID          NOT NULL,
        "tenant_id"                 UUID          NOT NULL,
        "booking_id"                UUID,
        "class_session_booking_id"  UUID,
        "revision_no"               INTEGER       NOT NULL,
        "amount"                    NUMERIC(10,2) NOT NULL,
        "currency"                  VARCHAR(3)    NOT NULL DEFAULT 'BRL',
        "reason"                    VARCHAR(30)   NOT NULL,
        "actor_type"                VARCHAR(20)   NOT NULL,
        "actor_id"                  UUID,
        "occurred_at"               TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_booking_booking_quote_revisions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_booking_bkg_quote_revisions_booking"
          FOREIGN KEY ("tenant_id", "booking_id")
          REFERENCES "booking"."bookings" ("tenant_id", "id"),
        CONSTRAINT "CHK_booking_bkg_quote_revisions_source_exclusive" CHECK (
          (booking_id IS NOT NULL AND class_session_booking_id IS NULL)
          OR
          (booking_id IS NULL AND class_session_booking_id IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_booking_bkg_quote_revisions_tenant"
        ON "booking"."booking_quote_revisions" ("tenant_id")
    `);
    // Partial unique index (not a plain UNIQUE column constraint) — the source-exclusive CHECK
    // above means booking_id is NULL for a future class-session-sourced row, and Postgres treats
    // NULL <> NULL, so a plain UNIQUE(tenant_id, booking_id, revision_no) would never actually
    // dedupe two such NULL-booking_id rows against each other; scoping to WHERE booking_id IS NOT
    // NULL makes the intent explicit rather than relying on that NULL behavior implicitly.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_booking_bkg_quote_revisions_booking_revision"
        ON "booking"."booking_quote_revisions" ("tenant_id", "booking_id", "revision_no")
        WHERE "booking_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "booking"."booking_quote_revisions"`);
  }
}
