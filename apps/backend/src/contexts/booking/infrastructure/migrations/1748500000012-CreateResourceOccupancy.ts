import { MigrationInterface, QueryRunner } from 'typeorm';

// Expand phase (1 of 3) — docs/13-DATABASE_SCHEMA.md § booking.booking_line_resource_assignments
// / booking.resource_occupancy. Creates every new table + the booking_lines UNIQUE(tenant_id,
// line_id) the new composite FKs depend on. Does NOT drop EX_booking_bookings_approved_slot —
// that's the contract phase (1748500000014), only after the backfill (1748500000013) and this
// milestone's own validate step both pass.
export class CreateResourceOccupancy1748500000012 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Required so booking_line_resource_assignments/resource_occupancy's composite FKs to this
    // table are expressible (today only PRIMARY KEY (line_id) exists) — pre-production, no real
    // load, plain ADD CONSTRAINT (no CONCURRENTLY staging) confirmed during story-discovery.
    await queryRunner.query(`
      ALTER TABLE "booking"."booking_lines"
        ADD CONSTRAINT "UQ_booking_booking_lines_tenant_line" UNIQUE ("tenant_id", "line_id")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "booking"."booking_line_resource_assignments" (
        "id"                          UUID          NOT NULL,
        "tenant_id"                   UUID          NOT NULL,
        "booking_line_id"             UUID          NOT NULL,
        "resource_id"                 UUID          NOT NULL,
        "resource_type"               VARCHAR(20)   NOT NULL CHECK (resource_type IN ('LOCATION','STAFF','ROOM','EQUIPMENT')),
        "leg_index"                   INTEGER,
        "quantity_position"           INTEGER,
        "resource_name_at_assignment" VARCHAR(255)  NOT NULL,
        "assigned_at"                 TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_booking_booking_line_resource_assignments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_booking_booking_line_resource_assignments_tenant_id" UNIQUE ("tenant_id", "id"),
        CONSTRAINT "FK_booking_bkg_line_res_assign_booking_line"
          FOREIGN KEY ("tenant_id", "booking_line_id")
          REFERENCES "booking"."booking_lines" ("tenant_id", "line_id"),
        CONSTRAINT "FK_booking_bkg_line_res_assign_resource"
          FOREIGN KEY ("tenant_id", "resource_id", "resource_type")
          REFERENCES "booking"."resources" ("tenant_id", "id", "type")
      )
    `);
    // A plain UNIQUE(tenant_id, booking_line_id, resource_id, leg_index, quantity_position) column
    // constraint would silently fail to dedupe the flat/non-legged/single-unit degenerate case
    // (leg_index and quantity_position both null — nearly every row in M22), since Postgres
    // treats NULL <> NULL. A unique index on the COALESCE'd values is the null-safe substitute
    // this table's own docs/13-DATABASE_SCHEMA.md note calls for.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_booking_bkg_line_res_assign_null_safe"
        ON "booking"."booking_line_resource_assignments"
        ("tenant_id", "booking_line_id", "resource_id", COALESCE("leg_index", -1), COALESCE("quantity_position", -1))
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_booking_bkg_line_res_assign_tenant_resource"
        ON "booking"."booking_line_resource_assignments" ("tenant_id", "resource_id")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "booking"."resource_occupancy" (
        "id"                                   UUID          NOT NULL,
        "tenant_id"                            UUID          NOT NULL,
        "resource_id"                          UUID          NOT NULL,
        "resource_type"                        VARCHAR(20)   NOT NULL CHECK (resource_type IN ('LOCATION','STAFF','ROOM','EQUIPMENT')),
        "source_type"                          VARCHAR(20)   NOT NULL CHECK (source_type IN ('BOOKING_LINE','CLASS_SESSION')),
        "booking_line_resource_assignment_id"  UUID,
        "leg_index"                            INTEGER,
        "class_session_id"                     UUID,
        "resource_name_at_assignment"          VARCHAR(255)  NOT NULL,
        "starts_at"                            TIMESTAMPTZ   NOT NULL,
        "ends_at"                              TIMESTAMPTZ   NOT NULL,
        "lock_state"                           VARCHAR(20)   NOT NULL CHECK (lock_state IN ('REQUESTED','HOLD','COMMITTED')),
        "hold_expires_at"                      TIMESTAMPTZ,
        "created_at"                           TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_booking_resource_occupancy" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_booking_resource_occupancy_tenant_id" UNIQUE ("tenant_id", "id"),
        CONSTRAINT "FK_booking_resource_occupancy_resource"
          FOREIGN KEY ("tenant_id", "resource_id", "resource_type")
          REFERENCES "booking"."resources" ("tenant_id", "id", "type"),
        CONSTRAINT "FK_booking_resource_occupancy_assignment"
          FOREIGN KEY ("tenant_id", "booking_line_resource_assignment_id")
          REFERENCES "booking"."booking_line_resource_assignments" ("tenant_id", "id"),
        CONSTRAINT "CHK_booking_resource_occupancy_source_exclusive" CHECK (
          (source_type = 'BOOKING_LINE' AND booking_line_resource_assignment_id IS NOT NULL AND class_session_id IS NULL)
          OR
          (source_type = 'CLASS_SESSION' AND class_session_id IS NOT NULL AND booking_line_resource_assignment_id IS NULL)
        ),
        CONSTRAINT "CHK_booking_resource_occupancy_hold_expiry" CHECK (
          (lock_state = 'HOLD' AND hold_expires_at IS NOT NULL)
          OR
          (lock_state IN ('COMMITTED','REQUESTED') AND hold_expires_at IS NULL)
        ),
        CONSTRAINT "CHK_booking_resource_occupancy_window" CHECK ("ends_at" > "starts_at"),
        CONSTRAINT "EX_booking_resource_occupancy_locked_window"
          EXCLUDE USING gist (
            "tenant_id" WITH =,
            "resource_id" WITH =,
            tstzrange("starts_at", "ends_at", '[)') WITH &&
          )
          WHERE ("lock_state" IN ('HOLD', 'COMMITTED'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_booking_resource_occupancy_tenant_resource_starts"
        ON "booking"."resource_occupancy" ("tenant_id", "resource_id", "starts_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "booking"."resource_occupancy"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "booking"."booking_line_resource_assignments"`);
    await queryRunner.query(`
      ALTER TABLE "booking"."booking_lines"
        DROP CONSTRAINT IF EXISTS "UQ_booking_booking_lines_tenant_line"
    `);
  }
}
