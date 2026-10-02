import { MigrationInterface, QueryRunner } from 'typeorm';

// M23 Cluster 3 (UC-074) — docs/13-DATABASE_SCHEMA.md § booking.booking_status_transitions.
// Wholly new, additive table — no existing table modified (bookings.status has no CHECK, so
// NO_SHOW needs no constraint change) and no backfill: no booking was ever a no-show.
export class CreateBookingStatusTransitions1748500000023 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "booking"."booking_status_transitions" (
        "tenant_id"       UUID         NOT NULL,
        "id"              UUID         NOT NULL,
        "booking_id"      UUID         NOT NULL,
        "from_status"     VARCHAR(30)  NOT NULL,
        "to_status"       VARCHAR(30)  NOT NULL,
        "reason"          VARCHAR(500),
        "actor_type"      VARCHAR(20)  NOT NULL,
        "actor_id"        UUID,
        "occurred_at"     TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "correlation_id"  UUID         NOT NULL,
        CONSTRAINT "PK_booking_booking_status_transitions" PRIMARY KEY ("tenant_id", "id"),
        CONSTRAINT "FK_booking_bkg_status_transitions_booking"
          FOREIGN KEY ("tenant_id", "booking_id")
          REFERENCES "booking"."bookings" ("tenant_id", "id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_booking_bkg_status_transitions_booking"
        ON "booking"."booking_status_transitions" ("tenant_id", "booking_id", "occurred_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "booking"."booking_status_transitions"`);
  }
}
