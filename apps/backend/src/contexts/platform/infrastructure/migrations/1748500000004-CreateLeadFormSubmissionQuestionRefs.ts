import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Keeps the immutable answer snapshot in JSONB for the lead detail view while materialising its
 * question IDs in a tenant-scoped relation. Manager config reads use this indexed relation to
 * decide whether a question has historical answers; they must not expand every retained JSONB
 * array for a tenant on each GET/PATCH.
 *
 * Backfills existing submissions. An earlier version of this migration shipped with no backfill,
 * reasoning that no public submission UI existed yet at deploy time — that reasoning was wrong:
 * the public submission endpoint (`lead-form-public.controller.ts`) shipped in an earlier,
 * already-merged story (M20-S02/S05/S06), so real submissions can already exist via direct API
 * calls even without M20-S09's dedicated page. Without a backfill, a pre-existing submission has
 * answers in `lead_form_submissions.answers` but no row here, so `GetLeadFormConfigUseCase`
 * reports `hasSubmissions: false` and a manager can remove that question without the required
 * confirmation dialog (UC-037 A4) — a real correctness gap, not just a cosmetic one (Codex review
 * finding, M20-S08 PR #429, 2026-08-26, correcting the earlier, incorrect removal). A plain
 * one-shot backfill (not batched/resumable) is the right amount of engineering here: this table's
 * real row count at this stage of the feature's rollout is small, so the "unbounded backfill"
 * risk this migration originally tried to avoid was more theoretical than actual.
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
    await queryRunner.query(`
      INSERT INTO "platform"."lead_form_submission_question_refs"
        ("tenant_id", "submission_id", "question_id")
      SELECT submission."tenant_id", submission."id", (answer ->> 'questionId')::uuid
      FROM "platform"."lead_form_submissions" AS submission
      CROSS JOIN LATERAL jsonb_array_elements(submission."answers") AS answer
      WHERE answer ? 'questionId' AND answer ->> 'questionId' IS NOT NULL
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "platform"."lead_form_submission_question_refs"');
  }
}
