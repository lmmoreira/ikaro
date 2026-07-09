import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLoyaltyCronRunLog1748400000006 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "loyalty"."cron_run_log" (
        "tenant_id"      UUID        NOT NULL,
        "cron_date"      DATE        NOT NULL,
        "reminder_type"  VARCHAR     NOT NULL,
        "processed_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_loyalty_cron_run_log" PRIMARY KEY ("tenant_id", "cron_date", "reminder_type")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "loyalty"."cron_run_log"`);
  }
}
