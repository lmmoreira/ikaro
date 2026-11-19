import { MigrationInterface, QueryRunner } from 'typeorm';

// M26-S02 — the charge's optimistic-concurrency version. `Charge` is written by several paths (the
// webhook, reconcile, the sweep, and the short transactions that follow a provider call), so
// `save()` is guarded by `version` as the second line of defence next to the charge row lock B-C1,
// the same shape as `subscriptions.version` next to B-R1 (docs/LOCK_CATALOG.md § Billing locks).
//
// A separate migration rather than an edit of 1748500000039, which may already have run.
// Expand only: a new column with a constant default. Postgres 11+ adds it as a catalog change (no
// table rewrite, no long lock), and every existing row starts at 0.
export class AddChargeVersion1748500000046 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "billing"."charges" ADD COLUMN "version" integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "billing"."charges" DROP COLUMN "version"`);
  }
}
