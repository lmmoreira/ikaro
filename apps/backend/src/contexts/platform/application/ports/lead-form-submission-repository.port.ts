import { LeadFormSubmission } from '../../domain/lead-form-submission.aggregate';

export const LEAD_FORM_SUBMISSION_REPOSITORY = Symbol('ILeadFormSubmissionRepository');

export interface PaginatedLeadFormSubmissions {
  items: LeadFormSubmission[];
  total: number;
}

// M20-S12 — UC-041 steps 3-5. `search` (basic) and `filters` (advanced) are mutually exclusive
// (enforced at the Zod boundary, packages/validation/src/lead-form-submission.ts — the repository
// itself doesn't re-validate this). `submittedFrom`/`submittedTo` are already-resolved UTC instant
// boundaries (half-open `[from, to)`, tenant-local calendar days converted by the use case via
// `localDateTimeToUTCIso` — same "resolve to real Date boundaries at the use-case layer, not
// inside the adapter" discipline `countByTenantAndDate`'s own docstring above already establishes).
export interface LeadFormSubmissionSearchOptions {
  search?: string;
  filters?: { questionLabel: string; value: string }[];
  submittedFrom?: Date;
  submittedTo?: Date;
}

export interface ILeadFormSubmissionRepository {
  save(submission: LeadFormSubmission): Promise<void>;
  /** UC-041 main flow steps 1, 3-5 — paginated admin list, ordered `submittedAt DESC`, seeking the
   * `(tenant_id, submitted_at DESC)` index (mirrors `TypeOrmLoyaltyEntryRepository`'s own
   * `findAndCount`/`take`/`skip` pagination precedent). `page` is 1-indexed. `options` (M20-S12)
   * layers optional basic search / advanced filters / date range on top of the same paginated
   * query — see `LeadFormSubmissionSearchOptions`. */
  findByTenantPaginated(
    tenantId: string,
    page: number,
    pageSize: number,
    options?: LeadFormSubmissionSearchOptions,
  ): Promise<PaginatedLeadFormSubmissions>;
  /** UC-041 step 4's filter dropdown (M20-S12) — every distinct `question_label` this tenant has
   * ever recorded in `platform.lead_form_answers`, alphabetically ordered, via the
   * `(tenant_id, question_label)` index. Deliberately includes labels from questions since edited
   * or removed from the live `LeadFormConfig` — the filter matches a submission's own snapshot,
   * not the current config. */
  findDistinctQuestionLabels(tenantId: string): Promise<string[]>;
  /** UC-041 main flow step 6 — tenant-scoped lookup for the detail view. Returns `null` (never
   * throws) for a nonexistent id OR one belonging to a different tenant — the same "404, not 403"
   * cross-tenant-probing shape `GetBookingByIdUseCase` already establishes; the use case throws
   * `LeadFormSubmissionNotFoundError` on a `null` result. */
  findById(id: string, tenantId: string): Promise<LeadFormSubmission | null>;
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
  findQuestionIdsWithSubmissions(
    tenantId: string,
    questionIds: readonly string[],
  ): Promise<readonly string[]>;
  /** UC-043 daily retention purge: deletes every row whose `expires_at` is strictly before
   * `now`, across every tenant in one pass (no tenant_id predicate — matches
   * ExpirePointsJob/ChatbotRetentionPurgeJob's own cross-tenant precedent), using the
   * standalone `(expires_at)` index — the `(tenant_id, expires_at)` composite index can't be
   * seeked by this unscoped query. Returns the number of rows actually deleted.
   * `platform.lead_form_answers`' FK carries `ON DELETE CASCADE` (M20-S12) — Postgres removes
   * each expiring submission's answer rows automatically, no separate child delete needed. */
  deleteExpired(now: Date): Promise<number>;
}
