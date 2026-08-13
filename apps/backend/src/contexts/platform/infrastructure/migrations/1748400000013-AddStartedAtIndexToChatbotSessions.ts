import { MigrationInterface, QueryRunner } from 'typeorm';

// UC-035 retention purge (M19-S07): supports ChatbotRetentionPurgeJob's
// `WHERE started_at < $1 AND last_message_at < $1` predicate — without it, that daily,
// cross-tenant scan degrades to a full table scan as chatbot_sessions grows (PR #365 review
// finding). Composite over both columns, not just started_at alone, since the purge query
// filters both.
//
// Plain CREATE INDEX, not CONCURRENTLY (CodeRabbit review, PR #365, considered and rejected):
// a plain index build takes a lock that blocks writes to chatbot_sessions for its duration —
// a real concern on a live, populated table, but chatbot_sessions is brand new this same
// milestone (M19) and carries no production traffic yet, the same reasoning
// AddHealthColumnsToChatbotProviderBalance's own migration already documents for this table
// family. CONCURRENTLY can't run inside a transaction, and TypeORM only allows a per-migration
// transaction override when the global migrationsTransactionMode is "each"/"none" (this
// codebase's default is "all", shared by every other migration) — changing that mode would
// alter every migration's atomicity guarantees to accommodate one index build with no current
// real risk to mitigate. Revisit with CONCURRENTLY once this table carries real traffic.
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
