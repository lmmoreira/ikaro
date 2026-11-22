import { MigrationInterface, QueryRunner } from 'typeorm';

// M26-S08 (UC-140): the instant self-heal last re-enabled a provider's webhook queue. A processed
// webhook delivery received after it is what closes the alert. It is its own column because
// `updated_at` is also written by reconcile every hour, which would keep moving the instant a
// delivery has to post-date and leave the alert raised on a quiet account after real recovery.
//
// Expand only: one nullable column with no default (a catalog change, no table rewrite, no
// backfill: an absent instant means no re-enable has happened).
export class AddWebhookReenabledAtToProviderHealth1748500000049 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "billing"."provider_health" ADD COLUMN "webhook_reenabled_at" timestamptz NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "billing"."provider_health" DROP COLUMN "webhook_reenabled_at"`,
    );
  }
}
