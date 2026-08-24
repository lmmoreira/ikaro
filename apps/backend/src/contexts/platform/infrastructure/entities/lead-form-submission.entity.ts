import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';
import { LeadFormAnswer } from '../../domain/lead-form-submission.aggregate';

@Entity('lead_form_submissions', { schema: 'platform' })
@Unique('UQ_platform_lead_form_submissions_tenant_id', ['tenantId', 'id'])
@Index('IDX_platform_lead_form_submissions_tenant_submitted_at', ['tenantId', 'submittedAt'])
@Index('IDX_platform_lead_form_submissions_tenant_ip_submitted_at', [
  'tenantId',
  'ipAddress',
  'submittedAt',
])
@Index('IDX_platform_lead_form_submissions_tenant_expires_at', ['tenantId', 'expiresAt'])
export class LeadFormSubmissionEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId!: string | null;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'varchar' })
  email!: string;

  @Column({ type: 'varchar' })
  phone!: string;

  @Column({ type: 'jsonb' })
  answers!: LeadFormAnswer[];

  @Column({ name: 'submitted_at', type: 'timestamptz' })
  submittedAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'ip_address', type: 'varchar', length: 45 })
  ipAddress!: string;
}
