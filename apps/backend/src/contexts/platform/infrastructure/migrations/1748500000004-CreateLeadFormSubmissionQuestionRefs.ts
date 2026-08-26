import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Keeps the immutable answer snapshot in JSONB for the lead detail view while materialising its
 * question IDs in a tenant-scoped relation. Manager config reads use this indexed relation to
 * decide whether a question has historical answers; they must not expand every retained JSONB
 * array for a tenant on each GET/PATCH.
 *
 * No backfill INSERT — deliberately, matching this milestone's own Wave-1 "no risky backfill"
 * assumption (plan/M20-LEAD-FORM-MODULE.md). `lead_form_submissions` is itself a brand-new table
 * introduced earlier in this same milestone, and no public submission UI exists yet at this
 * migration's deploy point (M20-S09, the guest-facing page, ships later) — so there is nothing of
 * consequence to backfill in practice. A row this table doesn't yet have simply means
 * `hasSubmissions` under-reports for that one question until a fresh submission references it
 * going forward; the original answer snapshot in `lead_form_submissions.answers` is untouched
 * either way, since this table is a derived lookup index, never the source of truth (Codex review
 * finding, M20-S08 PR #429, 2026-08-26 — an earlier unbounded `INSERT ... SELECT
 * jsonb_array_elements(...)` full-table backfill was removed here rather than made
 * batched/resumable, since there was realistically nothing for it to backfill).
 */
export class CreateLeadFormSubmissionQuestionRefs1748500000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "platform"."lead_form_submission_question_refs" (
        "tenant_id" UUID NOT NULL,
        "submission_id" UUID NOT NULL,
        "question_id" UUID NOT NULL,
        CONSTRAINT "PK_platform_lead_form_submission_question_refs"
          PRIMARY KEY ("tenant_id", "submission_id", "question_id"),
        CONSTRAINT "FK_platform_lead_form_submission_question_refs_submission"
          FOREIGN KEY ("tenant_id", "submission_id")
          REFERENCES "platform"."lead_form_submissions" ("tenant_id", "id")
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_platform_lead_form_submission_question_refs_tenant_question"
        ON "platform"."lead_form_submission_question_refs" ("tenant_id", "question_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "platform"."lead_form_submission_question_refs"');
  }
}
