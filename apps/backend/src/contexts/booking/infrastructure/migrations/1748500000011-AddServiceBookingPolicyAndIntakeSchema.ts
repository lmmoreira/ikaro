import { MigrationInterface, QueryRunner } from 'typeorm';

// M22-S02 — Service booking-policy/duration/pricing columns (UC-055), the versioned
// service_booking_intake_schema + booking_attendees tables (UC-054), and the matching
// schema-versioning columns on bookings (nothing writes them until M23's booking flow exists —
// see docs/13-DATABASE_SCHEMA.md's own note on this). Sequenced after S01's migration (both
// modify services).
export class AddServiceBookingPolicyAndIntakeSchema1748500000011 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "booking"."services"
        ADD COLUMN IF NOT EXISTS "default_approval_mode" VARCHAR(20)
          CHECK ("default_approval_mode" IN ('AUTO_CONFIRM', 'MANUAL_APPROVAL')),
        ADD COLUMN IF NOT EXISTS "manual_hold_minutes" INTEGER,
        ADD COLUMN IF NOT EXISTS "cancellation_window_hours_override" INTEGER,
        ADD COLUMN IF NOT EXISTS "reschedule_window_hours_override" INTEGER,
        ADD COLUMN IF NOT EXISTS "min_booking_advance_hours_override" INTEGER,
        ADD COLUMN IF NOT EXISTS "max_booking_advance_days_override" INTEGER,
        ADD COLUMN IF NOT EXISTS "recurrence_eligible" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "availability_alert_eligible" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "duration_policy" VARCHAR(20) NOT NULL DEFAULT 'FIXED'
          CHECK ("duration_policy" IN ('FIXED', 'CUSTOMER_SELECTED')),
        ADD COLUMN IF NOT EXISTS "duration_min_minutes" INTEGER
          CHECK ("duration_min_minutes" IS NULL OR "duration_min_minutes" > 0),
        ADD COLUMN IF NOT EXISTS "duration_max_minutes" INTEGER
          CHECK (
            "duration_max_minutes" IS NULL OR "duration_min_minutes" IS NULL
            OR "duration_max_minutes" >= "duration_min_minutes"
          ),
        ADD COLUMN IF NOT EXISTS "duration_increment_minutes" INTEGER
          CHECK ("duration_increment_minutes" IS NULL OR "duration_increment_minutes" > 0),
        ADD COLUMN IF NOT EXISTS "pricing_policy" VARCHAR(20) NOT NULL DEFAULT 'FIXED'
          CHECK ("pricing_policy" IN ('FIXED', 'PER_TIME_INCREMENT')),
        ADD COLUMN IF NOT EXISTS "pricing_increment_minutes" INTEGER
          CHECK ("pricing_increment_minutes" IS NULL OR "pricing_increment_minutes" > 0),
        ADD COLUMN IF NOT EXISTS "price_per_increment_amount" NUMERIC(10,2),
        ADD COLUMN IF NOT EXISTS "minimum_charge_amount" NUMERIC(10,2)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "booking"."service_booking_intake_schema" (
        "id"                          UUID          NOT NULL,
        "tenant_id"                   UUID          NOT NULL,
        "service_id"                  UUID          NOT NULL,
        "version"                     INTEGER       NOT NULL,
        "questions"                   JSONB         NOT NULL,
        "consent_text"                TEXT          NOT NULL,
        "consent_version"             INTEGER       NOT NULL,
        "requires_named_attendees"    BOOLEAN       NOT NULL DEFAULT false,
        "participant_count_required"  BOOLEAN       NOT NULL DEFAULT false,
        "is_active"                   BOOLEAN       NOT NULL DEFAULT true,
        "created_at"                  TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_service_booking_intake_schema" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_service_booking_intake_schema_version"
          UNIQUE ("tenant_id", "service_id", "version"),
        CONSTRAINT "FK_service_booking_intake_schema_service"
          FOREIGN KEY ("tenant_id", "service_id") REFERENCES "booking"."services" ("tenant_id", "id")
      )
    `);
    // At most one active schema version per service — a partial unique index, not a table
    // CONSTRAINT (Postgres UNIQUE constraints don't support a WHERE clause).
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_service_booking_intake_schema_active"
        ON "booking"."service_booking_intake_schema" ("tenant_id", "service_id")
        WHERE "is_active"
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "booking"."booking_attendees" (
        "id"          UUID          NOT NULL,
        "tenant_id"   UUID          NOT NULL,
        "booking_id"  UUID          NOT NULL,
        "name"        VARCHAR(255)  NOT NULL,
        "customer_id" UUID,
        "is_minor"    BOOLEAN       NOT NULL DEFAULT false,
        CONSTRAINT "PK_booking_attendees" PRIMARY KEY ("id"),
        CONSTRAINT "FK_booking_attendees_booking"
          FOREIGN KEY ("tenant_id", "booking_id") REFERENCES "booking"."bookings" ("tenant_id", "id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_booking_attendees_tenant_booking"
        ON "booking"."booking_attendees" ("tenant_id", "booking_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "booking"."bookings"
        ADD COLUMN IF NOT EXISTS "intake_schema_version" INTEGER,
        ADD COLUMN IF NOT EXISTS "intake_answers" JSONB,
        ADD COLUMN IF NOT EXISTS "participant_count" INTEGER
          CHECK ("participant_count" IS NULL OR "participant_count" > 0),
        ADD COLUMN IF NOT EXISTS "consent_accepted_at" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "consent_version" INTEGER
    `);
    // NOT VALID + a separate VALIDATE CONSTRAINT (expand/contract, docs/13-DATABASE_SCHEMA.md) —
    // ADD CONSTRAINT alone takes ACCESS EXCLUSIVE for the full existing-row scan; NOT VALID skips
    // that scan (ACCESS EXCLUSIVE held only for the instant catalog change), and the follow-up
    // VALIDATE CONSTRAINT takes the much weaker SHARE UPDATE EXCLUSIVE, which still allows
    // concurrent reads/writes on a `bookings` table that — unlike this migration's other new
    // tables — already carries production rows.
    await queryRunner.query(`
      ALTER TABLE "booking"."bookings"
        ADD CONSTRAINT "CHK_booking_bookings_intake_schema_pair" CHECK (
          ("intake_schema_version" IS NULL) = ("intake_answers" IS NULL)
        ) NOT VALID
    `);
    await queryRunner.query(`
      ALTER TABLE "booking"."bookings"
        VALIDATE CONSTRAINT "CHK_booking_bookings_intake_schema_pair"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "booking"."bookings"
        DROP CONSTRAINT IF EXISTS "CHK_booking_bookings_intake_schema_pair",
        DROP COLUMN IF EXISTS "intake_schema_version",
        DROP COLUMN IF EXISTS "intake_answers",
        DROP COLUMN IF EXISTS "participant_count",
        DROP COLUMN IF EXISTS "consent_accepted_at",
        DROP COLUMN IF EXISTS "consent_version"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "booking"."booking_attendees"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "booking"."service_booking_intake_schema"`);
    await queryRunner.query(`
      ALTER TABLE "booking"."services"
        DROP COLUMN IF EXISTS "default_approval_mode",
        DROP COLUMN IF EXISTS "manual_hold_minutes",
        DROP COLUMN IF EXISTS "cancellation_window_hours_override",
        DROP COLUMN IF EXISTS "reschedule_window_hours_override",
        DROP COLUMN IF EXISTS "min_booking_advance_hours_override",
        DROP COLUMN IF EXISTS "max_booking_advance_days_override",
        DROP COLUMN IF EXISTS "recurrence_eligible",
        DROP COLUMN IF EXISTS "availability_alert_eligible",
        DROP COLUMN IF EXISTS "duration_policy",
        DROP COLUMN IF EXISTS "duration_min_minutes",
        DROP COLUMN IF EXISTS "duration_max_minutes",
        DROP COLUMN IF EXISTS "duration_increment_minutes",
        DROP COLUMN IF EXISTS "pricing_policy",
        DROP COLUMN IF EXISTS "pricing_increment_minutes",
        DROP COLUMN IF EXISTS "price_per_increment_amount",
        DROP COLUMN IF EXISTS "minimum_charge_amount"
    `);
  }
}
