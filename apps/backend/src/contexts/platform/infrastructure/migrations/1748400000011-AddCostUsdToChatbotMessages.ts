import { MigrationInterface, QueryRunner } from 'typeorm';

// Additive-only — S01's CreateChatbotTables migration (1748400000010) is already applied on
// staging, so this must be a new migration rather than editing/squashing into the original.
// NUMERIC(12,8), not a float column — matches the precedent set by
// chatbot_provider_balance.remaining_usd (NUMERIC(10,4)), scaled up since a single message's
// cost is routinely a small fraction of a cent (e.g. DeepSeek V4 Flash at $0.09/1M input tokens
// is $0.00000009/token) and NUMERIC(10,4) would round that to zero.
export class AddCostUsdToChatbotMessages1748400000011 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "platform"."chatbot_messages"
        ADD COLUMN "cost_usd" NUMERIC(12,8) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "platform"."chatbot_messages"
        ADD CONSTRAINT "CHK_platform_chatbot_messages_cost_usd_non_negative"
        CHECK ("cost_usd" >= 0)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "platform"."chatbot_messages"
        DROP CONSTRAINT "CHK_platform_chatbot_messages_cost_usd_non_negative"
    `);
    await queryRunner.query(`
      ALTER TABLE "platform"."chatbot_messages" DROP COLUMN "cost_usd"
    `);
  }
}
