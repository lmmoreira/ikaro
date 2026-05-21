import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBookingServices1748000000011 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "booking"`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "booking"."services" (
        "id"                      UUID           NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"               UUID           NOT NULL,
        "name"                    VARCHAR(255)   NOT NULL,
        "description"             TEXT,
        "price_amount"            NUMERIC(10,2)  NOT NULL,
        "duration_minutes"        INTEGER        NOT NULL CHECK (duration_minutes > 0),
        "loyalty_points_value"    INTEGER        NOT NULL DEFAULT 0 CHECK (loyalty_points_value >= 0),
        "requires_pickup_address" BOOLEAN        NOT NULL DEFAULT false,
        "is_active"               BOOLEAN        NOT NULL DEFAULT true,
        "created_at"              TIMESTAMPTZ    NOT NULL DEFAULT now(),
        "updated_at"              TIMESTAMPTZ    NOT NULL DEFAULT now(),
        CONSTRAINT "PK_booking_services" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_booking_services_tenant_id"
        ON "booking"."services" ("tenant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_booking_services_tenant_active"
        ON "booking"."services" ("tenant_id", "is_active")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "booking"."services"`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS "booking"`);
  }
}
