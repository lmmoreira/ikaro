import { MigrationInterface, QueryRunner } from 'typeorm';

// TD60-S01 — the expiry sweep stops re-reading its whole history.
//
// expiry_sweep_state holds one row, the sweep's watermark: every entry due up to
// processed_through is already in balance_expiry_log. The sweep reads only what became due after
// it and moves it forward after a run in which every customer succeeded. The table has no
// tenant_id (the sweep is system-wide, like balance_expiry_log) and a CHECK keeps it to one row.
//
// IDX_loyalty_entries_expires_at is the standalone index the cross-tenant range reads need (the
// sweep's slice and the weekly warning job's seven-day window): the existing composite indexes
// lead with tenant_id, which neither query filters on. Plain CREATE INDEX, not CONCURRENTLY, same
// reasoning as 1748500000037-AddResourceOccupancyHoldExpiryIndex: nothing is in production yet.
export class AddLoyaltyExpirySweepStateAndEntriesExpiresAtIndex1748500000045 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "loyalty"."expiry_sweep_state" (
        "id"                SMALLINT    NOT NULL DEFAULT 1,
        "processed_through" TIMESTAMPTZ NOT NULL,
        "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_expiry_sweep_state" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_expiry_sweep_state_single_row" CHECK ("id" = 1)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_loyalty_entries_expires_at"
        ON "loyalty"."loyalty_entries" ("expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "loyalty"."IDX_loyalty_entries_expires_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "loyalty"."expiry_sweep_state"`);
  }
}
