import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M20-S12 (UC-041) — a denormalized, repository-maintained search projection over
 * `lead_form_submissions.answers` (one row per question per submission, MULTIPLE_CHOICE's
 * `string[]` flattened to one row per selected option). Never a domain aggregate of its own;
 * `lead_form_submissions.answers` stays the sole source for the detail view.
 *
 * `ON DELETE CASCADE` on the FK to `lead_form_submissions` — unlike `chatbot_messages`/
 * `chatbot_sessions`' own no-cascade precedent, this table's rows have no lifecycle independent
 * of their parent submission (no separate age-based retention of their own), so cascade is a
 * genuine simplification here rather than the functionally-inert no-op it would be for chatbot's
 * own already-decoupled, message-age-driven retention. `LeadFormRetentionPurgeJob` only needs to
 * delete the parent `lead_form_submissions` row; Postgres removes the matching answer rows.
 *
 * Backfills existing submissions — the public submission endpoint has been live since an earlier,
 * already-merged story (M20-S02/S05/S06), so real submissions can already exist via direct API
 * calls even without a dedicated frontend page (see `1748500000004-CreateLeadFormSubmissionQuestionRefs`'s
 * own backfill for the identical precedent/reasoning on this same table's sibling projection).
 */
export class CreateLeadFormAnswers1748500000006 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');

    await queryRunner.query(`
      CREATE TABLE "platform"."lead_form_answers" (
        "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"       UUID NOT NULL,
        "submission_id"   UUID NOT NULL,
        "question_id"     UUID NOT NULL,
        "question_label"  TEXT NOT NULL,
        "answer_value"    TEXT NOT NULL,
        CONSTRAINT "PK_platform_lead_form_answers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_platform_lead_form_answers_submission"
          FOREIGN KEY ("tenant_id", "submission_id")
          REFERENCES "platform"."lead_form_submissions" ("tenant_id", "id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_platform_lead_form_answers_tenant_submission_label"
        ON "platform"."lead_form_answers" ("tenant_id", "submission_id", "question_label")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_platform_lead_form_answers_tenant_label"
        ON "platform"."lead_form_answers" ("tenant_id", "question_label")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_platform_lead_form_answers_value_trgm"
        ON "platform"."lead_form_answers" USING GIN ("answer_value" gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_platform_lead_form_answers_label_trgm"
        ON "platform"."lead_form_answers" USING GIN ("question_label" gin_trgm_ops)
    `);

    await queryRunner.query(`
      INSERT INTO "platform"."lead_form_answers"
        ("tenant_id", "submission_id", "question_id", "question_label", "answer_value")
      SELECT
        submission."tenant_id",
        submission."id",
        (answer ->> 'questionId')::uuid,
        answer ->> 'questionLabel',
        value_item.value
      FROM "platform"."lead_form_submissions" AS submission
      CROSS JOIN LATERAL jsonb_array_elements(submission."answers") AS answer
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(answer -> 'answerValue') = 'array' THEN answer -> 'answerValue'
          ELSE jsonb_build_array(answer -> 'answerValue')
        END
      ) AS value_item(value)
      WHERE answer ? 'questionId' AND answer ->> 'questionId' IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "platform"."lead_form_answers"');
  }
}
