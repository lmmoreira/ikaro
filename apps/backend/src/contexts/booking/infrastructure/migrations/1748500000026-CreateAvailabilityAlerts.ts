import { MigrationInterface, QueryRunner } from 'typeorm';

// M23 Cluster 3 (UC-072, UC-076) — docs/13-DATABASE_SCHEMA.md § booking.availability_alerts /
// availability_alert_notification_attempts. Both tables are created here; the attempts table is
// only written by M23-S07's matching worker. `customer_id` carries no FK (cross-context), exactly
// like recurring_booking_schedules. Brand-new tables, so the CHECKs are part of CREATE TABLE.
export class CreateAvailabilityAlerts1748500000026 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "booking"."availability_alerts" (
        "id"                      UUID          NOT NULL,
        "tenant_id"               UUID          NOT NULL,
        "service_id"              UUID          NOT NULL,
        "customer_id"             UUID          NOT NULL,
        "preferred_resource_id"   UUID,
        "criteria_type"           VARCHAR(20)   NOT NULL,
        "timezone"                VARCHAR(50)   NOT NULL,
        "acceptable_start_at"     TIMESTAMPTZ,
        "acceptable_end_at"       TIMESTAMPTZ,
        "weekdays"                JSONB,
        "local_start_time"        TIME,
        "local_end_time"          TIME,
        "duration_minutes"        INT,
        "participant_count"       INT,
        "status"                  VARCHAR(20)   NOT NULL DEFAULT 'ACTIVE',
        "expires_at"              TIMESTAMPTZ   NOT NULL,
        "created_at"              TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "version"                 INTEGER       NOT NULL DEFAULT 1,
        CONSTRAINT "PK_booking_availability_alerts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_booking_availability_alerts_tenant_id" UNIQUE ("tenant_id", "id"),
        CONSTRAINT "FK_booking_availability_alerts_service"
          FOREIGN KEY ("tenant_id", "service_id")
          REFERENCES "booking"."services" ("tenant_id", "id"),
        CONSTRAINT "FK_booking_availability_alerts_resource"
          FOREIGN KEY ("tenant_id", "preferred_resource_id")
          REFERENCES "booking"."resources" ("tenant_id", "id"),
        CONSTRAINT "CHK_booking_availability_alerts_criteria_type" CHECK (
          "criteria_type" IN ('ONE_TIME_RANGE', 'WEEKLY_PREFERENCE')
        ),
        CONSTRAINT "CHK_booking_availability_alerts_status" CHECK (
          "status" IN ('ACTIVE', 'NOTIFIED', 'CANCELLED', 'EXPIRED')
        ),
        CONSTRAINT "CHK_booking_availability_alerts_duration" CHECK (
          "duration_minutes" IS NULL OR "duration_minutes" > 0
        ),
        CONSTRAINT "CHK_booking_availability_alerts_participants" CHECK (
          "participant_count" IS NULL OR "participant_count" > 0
        ),
        CONSTRAINT "CHK_booking_availability_alerts_one_criteria" CHECK (
          (
            "criteria_type" = 'ONE_TIME_RANGE'
            AND "acceptable_start_at" IS NOT NULL
            AND "acceptable_end_at" IS NOT NULL
            AND "acceptable_end_at" > "acceptable_start_at"
            AND "weekdays" IS NULL
            AND "local_start_time" IS NULL
            AND "local_end_time" IS NULL
          ) OR (
            "criteria_type" = 'WEEKLY_PREFERENCE'
            AND "weekdays" IS NOT NULL
            AND "local_start_time" IS NOT NULL
            AND "local_end_time" IS NOT NULL
            AND "local_end_time" > "local_start_time"
            AND "acceptable_start_at" IS NULL
            AND "acceptable_end_at" IS NULL
          )
        )
      )
    `);
    // Matched by the release-time scan (M23-S07).
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_booking_availability_alerts_tenant_service_status"
        ON "booking"."availability_alerts" ("tenant_id", "service_id", "status")
    `);
    // Serves "my alerts" and the per-customer active-alert cap.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_booking_availability_alerts_tenant_customer_status"
        ON "booking"."availability_alerts" ("tenant_id", "customer_id", "status")
    `);
    // Serves the expiry job's per-tenant scan.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_booking_availability_alerts_tenant_status_expires"
        ON "booking"."availability_alerts" ("tenant_id", "status", "expires_at")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "booking"."availability_alert_notification_attempts" (
        "id"                UUID          NOT NULL,
        "tenant_id"         UUID          NOT NULL,
        "alert_id"          UUID          NOT NULL,
        "matching_window"   TSTZRANGE     NOT NULL,
        "channel"           VARCHAR(20)   NOT NULL,
        "attempted_at"      TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "outcome"           VARCHAR(20)   NOT NULL,
        CONSTRAINT "PK_booking_availability_alert_notification_attempts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_booking_availability_alert_attempts_alert"
          FOREIGN KEY ("tenant_id", "alert_id")
          REFERENCES "booking"."availability_alerts" ("tenant_id", "id"),
        CONSTRAINT "CHK_booking_availability_alert_attempts_channel" CHECK (
          "channel" IN ('EMAIL', 'IN_APP')
        ),
        CONSTRAINT "UQ_booking_availability_alert_attempts_window_channel"
          UNIQUE ("tenant_id", "alert_id", "matching_window", "channel")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "booking"."availability_alert_notification_attempts"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "booking"."availability_alerts"`);
  }
}
