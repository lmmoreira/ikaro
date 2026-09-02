import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBookingResources1748500000007 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "booking"."resources" (
        "id"                UUID          NOT NULL,
        "tenant_id"         UUID          NOT NULL,
        "type"              VARCHAR(20)   NOT NULL CHECK (type IN ('LOCATION','STAFF','ROOM','EQUIPMENT')),
        "ref_id"            UUID,
        "name"              VARCHAR(255)  NOT NULL,
        "working_hours"     JSONB,
        "turnover_minutes"  INTEGER       NOT NULL DEFAULT 0 CHECK (turnover_minutes >= 0),
        "max_capacity"      INTEGER       CHECK (max_capacity IS NULL OR max_capacity > 0),
        "is_active"         BOOLEAN       NOT NULL DEFAULT true,
        "created_at"        TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_booking_resources" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_booking_resources_tenant_id" UNIQUE ("tenant_id", "id"),
        CONSTRAINT "UQ_booking_resources_tenant_id_type" UNIQUE ("tenant_id", "id", "type"),
        CONSTRAINT "CHK_booking_resources_type_ref_id"
          CHECK ((type = 'STAFF') = (ref_id IS NOT NULL)),
        CONSTRAINT "CHK_booking_resources_staff_no_max_capacity"
          CHECK (type != 'STAFF' OR max_capacity IS NULL)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_booking_resources_tenant_id"
        ON "booking"."resources" ("tenant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_booking_resources_tenant_type_active"
        ON "booking"."resources" ("tenant_id", "type", "is_active")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_booking_resources_tenant_ref_id"
        ON "booking"."resources" ("tenant_id", "ref_id")
        WHERE "type" = 'STAFF' AND "ref_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_booking_resources_tenant_location"
        ON "booking"."resources" ("tenant_id")
        WHERE "type" = 'LOCATION' AND "is_active"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "booking"."resources"`);
  }
}
