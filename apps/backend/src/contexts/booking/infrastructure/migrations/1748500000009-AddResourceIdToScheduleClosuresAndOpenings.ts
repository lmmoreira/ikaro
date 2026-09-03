import { MigrationInterface, QueryRunner } from 'typeorm';

// M21-S03 — adds an optional resource_id to schedule_closures/schedule_openings, scoping a
// closure/opening to one Resource instead of the whole tenant. NULL = tenant-wide, today's
// exact unchanged behavior — see docs/02-DOMAIN_MODEL.md § ScheduleClosure/ScheduleOpening.
//
// Constraint fix (schedule_openings): the original plain UNIQUE(tenant_id, date) would
// silently stop enforcing "one opening per date" the moment resource_id became nullable
// (Postgres treats NULL <> NULL). Replaced with two partial unique indexes so a tenant-wide
// opening and a resource-scoped opening for the same date never collide with each other, while
// two tenant-wide (or two same-resource) openings for the same date still do.
export class AddResourceIdToScheduleClosuresAndOpenings1748500000009 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "booking"."schedule_closures"
        ADD COLUMN "resource_id" UUID
    `);
    await queryRunner.query(`
      ALTER TABLE "booking"."schedule_closures"
        ADD CONSTRAINT "FK_booking_schedule_closures_resource"
        FOREIGN KEY ("tenant_id", "resource_id")
        REFERENCES "booking"."resources" ("tenant_id", "id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_booking_schedule_closures_tenant_resource_date"
        ON "booking"."schedule_closures" ("tenant_id", "resource_id", "date")
    `);

    await queryRunner.query(`
      ALTER TABLE "booking"."schedule_openings"
        ADD COLUMN "resource_id" UUID
    `);
    await queryRunner.query(`
      ALTER TABLE "booking"."schedule_openings"
        ADD CONSTRAINT "FK_booking_schedule_openings_resource"
        FOREIGN KEY ("tenant_id", "resource_id")
        REFERENCES "booking"."resources" ("tenant_id", "id")
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "booking"."UQ_booking_schedule_openings_tenant_date"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_booking_schedule_openings_tenant_date_no_resource"
        ON "booking"."schedule_openings" ("tenant_id", "date")
        WHERE "resource_id" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_booking_schedule_openings_tenant_resource_date"
        ON "booking"."schedule_openings" ("tenant_id", "resource_id", "date")
        WHERE "resource_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "booking"."UQ_booking_schedule_openings_tenant_resource_date"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "booking"."UQ_booking_schedule_openings_tenant_date_no_resource"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_booking_schedule_openings_tenant_date"
        ON "booking"."schedule_openings" ("tenant_id", "date")
    `);
    await queryRunner.query(`
      ALTER TABLE "booking"."schedule_openings"
        DROP CONSTRAINT IF EXISTS "FK_booking_schedule_openings_resource"
    `);
    await queryRunner.query(`
      ALTER TABLE "booking"."schedule_openings"
        DROP COLUMN IF EXISTS "resource_id"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "booking"."IDX_booking_schedule_closures_tenant_resource_date"
    `);
    await queryRunner.query(`
      ALTER TABLE "booking"."schedule_closures"
        DROP CONSTRAINT IF EXISTS "FK_booking_schedule_closures_resource"
    `);
    await queryRunner.query(`
      ALTER TABLE "booking"."schedule_closures"
        DROP COLUMN IF EXISTS "resource_id"
    `);
  }
}
