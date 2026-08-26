import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Keeps the immutable answer snapshot in JSONB for the lead detail view while materialising its
 * question IDs in a tenant-scoped relation. Manager config reads use this indexed relation to
 * decide whether a question has historical answers; they must not expand every retained JSONB
 * array for a tenant on each GET/PATCH.
 */
export class CreateLeadFormSubmissionQuestionRefs1748500000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "platform"."lead_form_submission_question_refs" (
        "tenant_id" UUID NOT NULL,
        "submission_id" UUID NOT NULL,
        "question_id" TEXT NOT NULL,
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
      SELECT submission."tenant_id", submission."id", answer ->> 'questionId'
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
