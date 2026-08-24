import { LeadFormSubmission } from '../../domain/lead-form-submission.aggregate';

export const LEAD_FORM_SUBMISSION_REPOSITORY = Symbol('ILeadFormSubmissionRepository');

export interface ILeadFormSubmissionRepository {
  save(submission: LeadFormSubmission): Promise<void>;
  /** Rate-limit cap layer 1 (tenant-wide daily count) — `date` is a YYYY-MM-DD UTC calendar-day
   * string, counted against the `(tenant_id, submitted_at DESC)` index. */
  countByTenantAndDate(tenantId: string, date: string): Promise<number>;
  /** Rate-limit cap layer 2 (per-IP daily count), same table + an added ip_address filter,
   * counted against the `(tenant_id, ip_address, submitted_at)` index. */
  countByTenantIpAndDate(tenantId: string, ipAddress: string, date: string): Promise<number>;
}
