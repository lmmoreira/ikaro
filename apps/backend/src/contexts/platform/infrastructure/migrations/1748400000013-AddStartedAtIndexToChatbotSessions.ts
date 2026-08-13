import { MigrationInterface, QueryRunner } from 'typeorm';

// UC-035 retention purge (M19-S07): supports ChatbotRetentionPurgeJob's
// `WHERE started_at < $1 AND last_message_at < $1` predicate — without it, that daily,
// cross-tenant scan degrades to a full table scan as chatbot_sessions grows (PR #365 review
// finding). Composite over both columns, not just started_at alone, since the purge query
// filters both.
export class AddStartedAtIndexToChatbotSessions1748400000013 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX "IDX_chatbot_sessions_started_at_last_message_at"
        ON "platform"."chatbot_sessions" ("started_at", "last_message_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "platform"."IDX_chatbot_sessions_started_at_last_message_at"
    `);
  }
}
