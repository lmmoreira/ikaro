import { LeadFormSubmission } from '../../domain/lead-form-submission.aggregate';

export const LEAD_FORM_SUBMISSION_REPOSITORY = Symbol('ILeadFormSubmissionRepository');

export interface ILeadFormSubmissionRepository {
  save(submission: LeadFormSubmission): Promise<void>;
  /** Rate-limit cap layer 1 (tenant-wide daily count), counted against the
   * `(tenant_id, submitted_at DESC)` index. `from`/`to` are real UTC instant boundaries —
   * resolve them via `localDayBoundsUTC()` (shared/utils/calendar-date.ts) for the tenant's own
   * local calendar day. Passing a bare date string here and re-deriving UTC-day boundaries
   * inside the adapter was the actual bug this signature replaces (PR #417 review finding,
   * M20-S02): a tenant-local date is not the same day as its UTC-midnight-to-midnight window. */
  countByTenantAndDate(tenantId: string, from: Date, to: Date): Promise<number>;
  /** Rate-limit cap layer 2 (per-IP daily count), same table + an added ip_address filter,
   * counted against the `(tenant_id, ip_address, submitted_at)` index. Same `from`/`to` contract
   * as `countByTenantAndDate`. */
  countByTenantIpAndDate(
    tenantId: string,
    ipAddress: string,
    from: Date,
    to: Date,
  ): Promise<number>;
  /** UC-043 daily retention purge: deletes every row whose `expires_at` is strictly before
   * `now`, across every tenant in one pass, using the `(tenant_id, expires_at)` index. Returns
   * the number of rows actually deleted. */
  deleteExpired(now: Date): Promise<number>;
}
