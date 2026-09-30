import { MigrationInterface, QueryRunner } from 'typeorm';

// M23 Cluster 3 (UC-073, UC-077) — docs/13-DATABASE_SCHEMA.md § booking.future_commitment_exceptions.
// source_id / affected_id are polymorphic (a resource today, a class session from M24), so they
// carry no foreign key. The partial unique index is the DB-level guarantee that a repeated raise
// for the same unresolved impact updates the open row instead of duplicating manager work.
export class CreateFutureCommitmentExceptions1748500000020 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "booking"."future_commitment_exceptions" (
        "id"                     UUID          NOT NULL,
        "tenant_id"              UUID          NOT NULL,
        "source_type"            VARCHAR(30)   NOT NULL,
        "source_id"              UUID          NOT NULL,
        "affected_type"          VARCHAR(20)   NOT NULL,
        "affected_id"            UUID          NOT NULL,
        "status"                 VARCHAR(20)   NOT NULL DEFAULT 'OPEN',
        "owner_staff_id"         UUID,
        "resolution_type"        VARCHAR(20),
        "resolution_reason"      TEXT,
        "resolved_by_staff_id"   UUID,
        "resolved_at"            TIMESTAMPTZ,
        "notification_outcome"   VARCHAR(30),
        "alternatives"           JSONB         NOT NULL DEFAULT '[]',
        "created_at"             TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_booking_future_commitment_exceptions" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_booking_fce_status" CHECK ("status" IN ('OPEN', 'RESOLVED', 'DISMISSED')),
        CONSTRAINT "CHK_booking_fce_resolution_type" CHECK (
          "resolution_type" IS NULL
          OR "resolution_type" IN ('KEEP', 'REASSIGN', 'RESCHEDULE', 'CANCEL')
        )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_booking_fce_tenant_affected"
        ON "booking"."future_commitment_exceptions" ("tenant_id", "affected_type", "affected_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_booking_fce_tenant_owner_status"
        ON "booking"."future_commitment_exceptions" ("tenant_id", "owner_staff_id", "status")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_booking_fce_open_impact"
        ON "booking"."future_commitment_exceptions"
        ("tenant_id", "source_type", "source_id", "affected_type", "affected_id")
        WHERE "status" = 'OPEN'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "booking"."future_commitment_exceptions"`);
  }
}
