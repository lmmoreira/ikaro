import { MigrationInterface, QueryRunner } from 'typeorm';

// M26-S08 (UC-140): the count of consecutive failed provider health reads. The self-heal job is
// stateless between runs and the table had no field that could carry "two failed reads in a row",
// the second trigger of the suspension freeze.
//
// Expand only: one new column with a constant default (a catalog change on Postgres 11+, no table
// rewrite, no backfill: an absent count is 0).
export class AddHealthReadFailuresToProviderHealth1748500000048 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "billing"."provider_health" ADD COLUMN "health_read_failures" smallint NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "billing"."provider_health" DROP COLUMN "health_read_failures"`,
    );
  }
}
