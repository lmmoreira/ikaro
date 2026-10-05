import { MigrationInterface, QueryRunner } from 'typeorm';

// M18-S10 — the gap a resource stays blocked after a booking line ends is
// max(service.bufferAfterMinutes, resource.turnoverMinutes) and was folded straight into
// `ends_at`, losing why. Persist the minutes and their origin at write time so the manager's
// Day-view columns board can say who is held and why (recomputing from current service/resource
// config would be wrong after any later edit).
//
// Additive and backward compatible: both columns nullable, NULL/NULL = "no gap, or a row written
// before this migration" (no backfill — the origin of an already-folded gap cannot be
// reconstructed exactly). The explicit IS NOT NULLs matter: a CHECK passes on NULL, so without
// them a lone source or lone minutes value would slip through. The CHECK is added NOT VALID and validated separately so a plain ADD
// CONSTRAINT never takes ACCESS EXCLUSIVE on a live table (docs/ANTI_PATTERNS.md § A plain
// ALTER TABLE).
export class AddGapToResourceOccupancy1748500000025 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "booking"."resource_occupancy"
        ADD COLUMN "gap_minutes" INT NULL,
        ADD COLUMN "gap_source" VARCHAR(20) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "booking"."resource_occupancy"
        ADD CONSTRAINT "CHK_booking_resource_occupancy_gap" CHECK (
          ("gap_source" IS NULL AND "gap_minutes" IS NULL)
          OR (
            "gap_source" IS NOT NULL AND "gap_minutes" IS NOT NULL
            AND "gap_source" IN ('SERVICE_BUFFER', 'RESOURCE_TURNOVER') AND "gap_minutes" > 0
          )
        ) NOT VALID
    `);
    await queryRunner.query(`
      ALTER TABLE "booking"."resource_occupancy"
        VALIDATE CONSTRAINT "CHK_booking_resource_occupancy_gap"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "booking"."resource_occupancy"
        DROP CONSTRAINT "CHK_booking_resource_occupancy_gap"
    `);
    await queryRunner.query(`
      ALTER TABLE "booking"."resource_occupancy"
        DROP COLUMN "gap_source",
        DROP COLUMN "gap_minutes"
    `);
  }
}
