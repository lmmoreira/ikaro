import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBookingBookings1748000000014 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable composite FK from booking_lines → booking.services(tenant_id, id)
    await queryRunner.query(`
      ALTER TABLE "booking"."services"
        ADD CONSTRAINT "UQ_booking_services_tenant_id"
          UNIQUE ("tenant_id", "id")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "booking"."bookings" (
        "id"                          UUID          NOT NULL,
        "tenant_id"                   UUID          NOT NULL,
        "status"                      VARCHAR(30)   NOT NULL DEFAULT 'PENDING',
        "type"                        VARCHAR(20)   NOT NULL,
        "customer_id"                 UUID,
        "contact_email"               VARCHAR(255)  NOT NULL,
        "contact_name"                VARCHAR(255)  NOT NULL,
        "contact_phone"               VARCHAR(30)   NOT NULL,
        "contact_address"             JSONB,
        "pickup_address"              JSONB,
        "scheduled_at"                TIMESTAMPTZ   NOT NULL,
        "total_duration_mins"         INTEGER       NOT NULL,
        "total_price_amount"          NUMERIC(10,2) NOT NULL,
        "total_actual_price_amount"   NUMERIC(10,2),
        "before_service_photo_urls"   TEXT[]        NOT NULL DEFAULT '{}',
        "after_service_photo_urls"    TEXT[]        NOT NULL DEFAULT '{}',
        "admin_notes"                 TEXT,
        "info_request_message"        TEXT,
        "info_requested_at"           TIMESTAMPTZ,
        "info_requested_by"           UUID,
        "info_response_message"       TEXT,
        "info_submitted_at"           TIMESTAMPTZ,
        "approved_at"                 TIMESTAMPTZ,
        "approved_by"                 UUID,
        "completed_at"                TIMESTAMPTZ,
        "completed_by"                UUID,
        "cancelled_at"                TIMESTAMPTZ,
        "cancelled_by"                UUID,
        "cancellation_reason"         TEXT,
        "rejected_at"                 TIMESTAMPTZ,
        "rejected_by"                 UUID,
        "rejection_reason"            TEXT,
        "created_at"                  TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"                  TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_booking_bookings" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_booking_bookings_type" CHECK (type IN ('GUEST', 'CUSTOMER')),
        CONSTRAINT "UQ_booking_bookings_tenant_id" UNIQUE ("tenant_id", "id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_booking_bookings_tenant_id"
        ON "booking"."bookings" ("tenant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_booking_bookings_tenant_status"
        ON "booking"."bookings" ("tenant_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_booking_bookings_tenant_customer"
        ON "booking"."bookings" ("tenant_id", "customer_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_booking_bookings_tenant_scheduled"
        ON "booking"."bookings" ("tenant_id", "scheduled_at")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "booking"."booking_lines" (
        "line_id"                            UUID          NOT NULL,
        "booking_id"                         UUID          NOT NULL,
        "tenant_id"                          UUID          NOT NULL,
        "service_id"                         UUID          NOT NULL,
        "service_name_at_booking"            VARCHAR(255)  NOT NULL,
        "price_at_booking_amount"            NUMERIC(10,2) NOT NULL,
        "duration_mins_at_booking"           INTEGER       NOT NULL,
        "points_value_at_booking"            INTEGER       NOT NULL DEFAULT 0,
        "requires_pickup_address_at_booking" BOOLEAN       NOT NULL DEFAULT false,
        "actual_price_charged_amount"        NUMERIC(10,2),
        CONSTRAINT "PK_booking_booking_lines" PRIMARY KEY ("line_id"),
        CONSTRAINT "FK_booking_lines_tenant_booking"
          FOREIGN KEY ("tenant_id", "booking_id")
          REFERENCES "booking"."bookings" ("tenant_id", "id"),
        CONSTRAINT "FK_booking_lines_tenant_service"
          FOREIGN KEY ("tenant_id", "service_id")
          REFERENCES "booking"."services" ("tenant_id", "id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_booking_booking_lines_tenant_id"
        ON "booking"."booking_lines" ("tenant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_booking_booking_lines_tenant_booking"
        ON "booking"."booking_lines" ("tenant_id", "booking_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_booking_booking_lines_tenant_service"
        ON "booking"."booking_lines" ("tenant_id", "service_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "booking"."booking_lines"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "booking"."bookings"`);
    await queryRunner.query(`
      ALTER TABLE "booking"."services"
        DROP CONSTRAINT IF EXISTS "UQ_booking_services_tenant_id"
    `);
  }
}
