import { MigrationInterface, QueryRunner } from 'typeorm';

// UC-043 retention purge (M20-S04): supports LeadFormRetentionPurgeJob's cross-tenant
// `WHERE expires_at < $1` predicate — without this, that daily, unscoped scan degrades to a
// full table scan as lead_form_submissions grows, since the existing composite index
// (IDX_platform_lead_form_submissions_tenant_expires_at) is led by tenant_id and can't be
// seeked without a tenant_id predicate (Codex review finding, PR #422). Mirrors
// AddStartedAtIndexToChatbotSessions's identical fix for the same class of gap on
// chatbot_sessions/ChatbotRetentionPurgeJob.
//
// Plain CREATE INDEX, not CONCURRENTLY, same reasoning as that migration: lead_form_submissions
// is brand new this same milestone (M20) and carries no production traffic yet, so the
// write-blocking lock a plain index build takes has no real cost to mitigate here.
export class AddExpiresAtIndexToLeadFormSubmissions1748500000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX "IDX_platform_lead_form_submissions_expires_at"
        ON "platform"."lead_form_submissions" ("expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "platform"."IDX_platform_lead_form_submissions_expires_at"
    `);
  }
}
