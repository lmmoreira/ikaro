import { MigrationInterface, QueryRunner } from 'typeorm';

// Additive/relaxing only — safe even though S08 (the balance-poll cron that will eventually
// write remaining_usd/checked_at) isn't built yet, so no real poll data exists in any
// environment to migrate. remaining_usd/checked_at become nullable because a health-only row
// (written by SendChatMessageUseCase on real chat traffic, before any balance poll has ever run
// for that provider — always true for Anthropic/OpenAI, which have no prepaid-balance concept at
// all) has no balance value yet. checked_at's DEFAULT now() is also dropped, not just its NOT
// NULL — otherwise Postgres would silently substitute now() for an INSERT that deliberately
// omits checked_at (the health-only write path), producing a checked_at value that misleadingly
// implies a balance poll happened when it didn't. down() intentionally does not restore the NOT
// NULL/DEFAULT: re-tightening NOT NULL would fail against any health-only row already inserted
// by that point, and undoing that data-dependent state isn't this rollback's job — see
// docs/13-DATABASE_SCHEMA.md's chatbot_provider_balance section for the full read/write design.
export class AddHealthColumnsToChatbotProviderBalance1748400000012 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "platform"."chatbot_provider_balance"
        ALTER COLUMN "remaining_usd" DROP NOT NULL,
        ALTER COLUMN "checked_at" DROP NOT NULL,
        ALTER COLUMN "checked_at" DROP DEFAULT,
        ADD COLUMN "last_success_at" TIMESTAMPTZ NULL,
        ADD COLUMN "last_failure_at" TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "platform"."chatbot_provider_balance"
        DROP COLUMN "last_failure_at",
        DROP COLUMN "last_success_at"
    `);
  }
}
