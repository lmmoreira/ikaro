import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

// M20-S12 — search-only projection derived from lead_form_submissions.answers at write time.
// Never queried/rendered directly outside search (docs/13-DATABASE_SCHEMA.md § lead_form_answers).
@Entity('lead_form_answers', { schema: 'platform' })
@Index('IDX_platform_lead_form_answers_tenant_submission_label', [
  'tenantId',
  'submissionId',
  'questionLabel',
])
@Index('IDX_platform_lead_form_answers_tenant_label', ['tenantId', 'questionLabel'])
export class LeadFormAnswerEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'submission_id', type: 'uuid' })
  submissionId!: string;

  @Column({ name: 'question_id', type: 'uuid' })
  questionId!: string;

  @Column({ name: 'question_label', type: 'text' })
  questionLabel!: string;

  @Column({ name: 'answer_value', type: 'text' })
  answerValue!: string;
}
