import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds an optional resource_id to schedule_closures/schedule_openings, scoping a
// closure/opening to one Resource instead of the whole tenant. NULL = tenant-wide, today's
// exact unchanged behavior — see docs/02-DOMAIN_MODEL.md § ScheduleClosure/ScheduleOpening.
//
// Constraint fix (schedule_openings): the original plain UNIQUE(tenant_id, date) would
// silently stop enforcing "one opening per date" the moment resource_id became nullable
// (Postgres treats NULL <> NULL). Replaced with two partial unique indexes so a tenant-wide
// opening and a resource-scoped opening for the same date never collide with each other, while
// two tenant-wide (or two same-resource) openings for the same date still do.
//
// Plain CREATE INDEX, not CONCURRENTLY (considered and rejected, same reasoning as
// AddStartedAtIndexToChatbotSessions and AddExpiresAtIndexToLeadFormSubmissions): CONCURRENTLY
// can't run inside a transaction, and this codebase's migrations all run under the global
// migrationsTransactionMode "all" — changing that to accommodate one index build would alter
// every migration's atomicity guarantees with no current real risk to mitigate. No production
// traffic exists anywhere in this system yet (plan/M17-CLOUD-DEPLOY.md — go-live is still a
// future wave), so the write-blocking lock a plain index build takes has no real cost to
// mitigate here — an even stronger case than either precedent migration, which only argued their
// own specific table was new this milestone. Revisit with CONCURRENTLY once real traffic exists.
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

  // DESTRUCTIVE beyond a plain column drop — accepted risk, decided explicitly, not an
  // oversight, mirroring BackfillLocationResources1748500000008's own documented precedent for
  // this class of risk. The old schema's UNIQUE(tenant_id, date)
  // can only be restored if at most one row exists per (tenant_id, date); this migration's
  // own forward path lets a tenant-wide and one-or-more resource-scoped openings coexist for
  // the same date, which is the intended, common-case state UC-010f creates — not an edge
  // case. There is no data-preserving way to collapse those rows back into the old
  // one-row-per-date shape, so down() deletes every resource-scoped opening
  // (resource_id IS NOT NULL) before recreating the plain unique index. Safe ONLY as an
  // immediate emergency rollback run before any resource-scoped opening could have been
  // created in a live environment — never run this against a database that has been live for
  // any meaningful window after this migration applied.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "booking"."schedule_openings" WHERE "resource_id" IS NOT NULL
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "booking"."UQ_booking_schedule_openings_tenant_resource_date"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "booking"."UQ_booking_schedule_openings_tenant_date_no_resource"
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
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_booking_schedule_openings_tenant_date"
        ON "booking"."schedule_openings" ("tenant_id", "date")
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
