import { MigrationInterface, QueryRunner } from 'typeorm';

// M23 Cluster 3 (UC-070) — docs/13-DATABASE_SCHEMA.md § booking.recurring_booking_schedules /
// assignments / exceptions. Also adds bookings.recurring_schedule_id (nullable — set only once
// M23-S05's generation job exists) and services.recurring_horizon_days (nullable — null inherits
// the 90-day platform default, DEFAULT_RECURRING_HORIZON_DAYS).
export class CreateRecurringBookingSchedules1748500000017 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "booking"."recurring_booking_schedules" (
        "id"                        UUID          NOT NULL,
        "tenant_id"                 UUID          NOT NULL,
        "customer_id"               UUID          NOT NULL,
        "service_id"                UUID          NOT NULL,
        "recurrence"                JSONB         NOT NULL,
        "starts_on"                 DATE          NOT NULL,
        "ends_on"                   DATE,
        "status"                    VARCHAR(20)   NOT NULL,
        "assignment_policy"         VARCHAR(30)   NOT NULL,
        "approval_hold_expires_at"  TIMESTAMPTZ,
        "approved_by_staff_id"      UUID,
        "approved_at"               TIMESTAMPTZ,
        "cancellation_reason"       VARCHAR(30),
        "created_by_staff_id"       UUID,
        "created_at"                TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"                TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "version"                   INTEGER       NOT NULL DEFAULT 1,
        CONSTRAINT "PK_booking_recurring_booking_schedules" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_booking_recurring_booking_schedules_tenant_id" UNIQUE ("tenant_id", "id"),
        CONSTRAINT "FK_booking_rbs_service"
          FOREIGN KEY ("tenant_id", "service_id")
          REFERENCES "booking"."services" ("tenant_id", "id"),
        CONSTRAINT "CHK_booking_rbs_status" CHECK (
          "status" IN ('PENDING_APPROVAL', 'ACTIVE', 'PAUSED', 'CANCELLED')
        ),
        CONSTRAINT "CHK_booking_rbs_assignment_policy" CHECK (
          "assignment_policy" IN ('FIXED_ASSIGNMENT', 'RESOLVE_PER_OCCURRENCE')
        ),
        CONSTRAINT "CHK_booking_rbs_cancellation_reason" CHECK (
          "cancellation_reason" IS NULL OR "cancellation_reason" IN (
            'CUSTOMER_CANCELLED', 'APPROVAL_REJECTED', 'APPROVAL_EXPIRED'
          )
        ),
        CONSTRAINT "CHK_booking_rbs_approval_hold" CHECK (
          ("status" = 'PENDING_APPROVAL') = ("approval_hold_expires_at" IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_booking_rbs_tenant"
        ON "booking"."recurring_booking_schedules" ("tenant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_booking_rbs_tenant_customer_status"
        ON "booking"."recurring_booking_schedules" ("tenant_id", "customer_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_booking_rbs_tenant_service_status"
        ON "booking"."recurring_booking_schedules" ("tenant_id", "service_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_booking_rbs_tenant_status_hold_expiry"
        ON "booking"."recurring_booking_schedules" ("tenant_id", "status", "approval_hold_expires_at")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "booking"."recurring_booking_schedule_resource_assignments" (
        "tenant_id"                    UUID        NOT NULL,
        "recurring_schedule_id"        UUID        NOT NULL,
        "resource_id"                  UUID        NOT NULL,
        "requirement_id"               UUID,
        "resource_type"                VARCHAR(20) NOT NULL,
        "required_quantity_position"   INT,
        "assigned_at"                  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_booking_rbs_resource_assignments" PRIMARY KEY (
          "tenant_id", "recurring_schedule_id", "resource_id"
        ),
        CONSTRAINT "FK_booking_rbs_resource_assignments_schedule"
          FOREIGN KEY ("tenant_id", "recurring_schedule_id")
          REFERENCES "booking"."recurring_booking_schedules" ("tenant_id", "id"),
        CONSTRAINT "FK_booking_rbs_resource_assignments_resource"
          FOREIGN KEY ("tenant_id", "resource_id", "resource_type")
          REFERENCES "booking"."resources" ("tenant_id", "id", "type"),
        CONSTRAINT "FK_booking_rbs_resource_assignments_requirement"
          FOREIGN KEY ("tenant_id", "requirement_id")
          REFERENCES "booking"."service_resource_requirements" ("tenant_id", "id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "booking"."recurring_booking_schedule_exceptions" (
        "id"                        UUID          NOT NULL,
        "tenant_id"                 UUID          NOT NULL,
        "recurring_schedule_id"     UUID          NOT NULL,
        "occurrence_start"          TIMESTAMPTZ   NOT NULL,
        "kind"                      VARCHAR(20)   NOT NULL,
        "replacement_booking_id"    UUID,
        "actor_type"                VARCHAR(20)   NOT NULL,
        "actor_id"                  UUID,
        "reason"                    VARCHAR(255),
        "created_at"                TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_booking_rbs_exceptions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_booking_rbs_exceptions_schedule"
          FOREIGN KEY ("tenant_id", "recurring_schedule_id")
          REFERENCES "booking"."recurring_booking_schedules" ("tenant_id", "id"),
        CONSTRAINT "FK_booking_rbs_exceptions_replacement_booking"
          FOREIGN KEY ("tenant_id", "replacement_booking_id")
          REFERENCES "booking"."bookings" ("tenant_id", "id"),
        CONSTRAINT "CHK_booking_rbs_exceptions_kind" CHECK ("kind" IN ('SKIPPED', 'RESCHEDULED')),
        CONSTRAINT "CHK_booking_rbs_exceptions_replacement" CHECK (
          ("kind" = 'RESCHEDULED') = ("replacement_booking_id" IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_booking_rbs_exceptions_schedule_occurrence"
        ON "booking"."recurring_booking_schedule_exceptions"
        ("tenant_id", "recurring_schedule_id", "occurrence_start")
    `);

    await queryRunner.query(`
      ALTER TABLE "booking"."bookings"
        ADD COLUMN IF NOT EXISTS "recurring_schedule_id" UUID
    `);
    await queryRunner.query(`
      ALTER TABLE "booking"."bookings"
        ADD CONSTRAINT "FK_booking_bookings_recurring_schedule"
          FOREIGN KEY ("tenant_id", "recurring_schedule_id")
          REFERENCES "booking"."recurring_booking_schedules" ("tenant_id", "id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_booking_bookings_recurring_schedule_occurrence"
        ON "booking"."bookings" ("tenant_id", "recurring_schedule_id", "scheduled_at")
        WHERE "recurring_schedule_id" IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "booking"."services"
        ADD COLUMN IF NOT EXISTS "recurring_horizon_days" INT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "booking"."services" DROP COLUMN IF EXISTS "recurring_horizon_days"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "booking"."UQ_booking_bookings_recurring_schedule_occurrence"
    `);
    await queryRunner.query(`
      ALTER TABLE "booking"."bookings" DROP CONSTRAINT IF EXISTS "FK_booking_bookings_recurring_schedule"
    `);
    await queryRunner.query(`
      ALTER TABLE "booking"."bookings" DROP COLUMN IF EXISTS "recurring_schedule_id"
    `);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "booking"."recurring_booking_schedule_exceptions"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "booking"."recurring_booking_schedule_resource_assignments"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "booking"."recurring_booking_schedules"`);
  }
}
