import { z } from 'zod';
import { GenericErrorCode } from '@ikaro/types';

// Shared by the backend (submit-lead-form.dto.ts) and BFF (platform.public.schemas.ts) — both
// need the identical outer-sanity-bounds shape for the fields a submitter actually types, so this
// lives here directly rather than duplicated (M20-S05 PR #423 review discussion, 2026-08-25:
// caught as the exact same "BFF schema silently drifts from backend DTO on shared fields" pattern
// hotsite.ts's own LeadFormQuestionSchema/LeadFormAudienceModeSchema already solved for the
// admin-config side of this same feature).
//
// VO validation (Email/PhoneNumber format, name required) happens domain-side in
// LeadFormSubmission.create() — this schema only checks shape. answers[].questionId existence and
// required-question completeness are re-validated against the tenant's live LeadFormConfig
// catalog inside CreateLeadFormSubmissionUseCase, never here.
//
// Each app layer `.extend()`s this with its own fields:
// - BFF adds `turnstileToken` (the field the web client sends; verification itself moved
//   backend-side in M20-S14 — see below).
// - Backend adds `customerId`/`ipAddress` (resolved by the BFF from the decoded JWT / real
//   client connection — the backend can't derive either from its own request object, since it
//   only ever sees the BFF's own connection) and, since M20-S14, `turnstileToken` too — the BFF
//   now forwards it unverified, and CreateLeadFormSubmissionUseCase verifies it as its first
//   step (relocated from the BFF's own TurnstileService; see plan/M20-LEAD-FORM-MODULE.md
//   § M20-S14 for why).
// Generous but bounded — a free-text answer or a single choice option realistically never
// approaches 2000 chars; MULTIPLE_CHOICE selections realistically never approach 50 options.
// Without this, an unbounded string (or array of them) here is what makes the raw request body
// itself unbounded, ahead of even reaching this schema (Codex finding, PR #433 round 10 — see
// the web Route Handler's own Content-Length guard for the complementary fix at that boundary).
export const LeadFormSubmissionAnswerSchema = z.object({
  questionId: z.uuid(),
  value: z.union([z.string().max(2000), z.array(z.string().max(2000)).max(50)]),
});

export const LeadFormSubmissionFieldsSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().min(1).max(320),
  phone: z.string().min(1).max(30),
  answers: z.array(LeadFormSubmissionAnswerSchema).max(20),
});

// M20-S12 — advanced-filter entry, one per question. `questionLabel` is dropdown-sourced (never
// free-typed — see the filter-options endpoint), so it only needs non-empty; `value` only needs
// non-empty too (M20-S13 story feedback, 2026-08-27 — see ListLeadFormSubmissionsSchema below for
// why the earlier 3-character minimum was dropped). `.trim()` before `.min(1)` so a
// whitespace-only value (e.g. "  ") isn't accepted as non-empty — the UI's own isSearchTermValid
// already trims before treating a value as active; the API contract must match, not accept a
// request the UI itself would never send (Codex PR #436 round 3 finding, 2026-08-27).
export const LeadFormSubmissionFilterEntrySchema = z.object({
  questionLabel: z.string().min(1),
  value: z.string().trim().min(1),
});

// `filters` arrives as a URL-encoded JSON array string (query params are always strings) — parse
// then validate its shape. A malformed JSON string surfaces as GENERIC_FORMAT_INVALID rather than
// an uncaught exception; `payload.issues.push` is the documented Zod v4 low-level API `.transform()`
// exposes for this (the public `ctx.addIssue()` wrapper is only available inside `.superRefine()`/
// `.check()`, per zod/v4/core/api.d.ts's `$RefinementCtx`).
const LeadFormSubmissionFiltersQuerySchema = z
  .string()
  .transform((val, ctx) => {
    try {
      return JSON.parse(val) as unknown;
    } catch {
      ctx.issues.push({
        code: 'custom',
        input: val,
        message: 'filters must be a valid JSON array',
        params: { code: GenericErrorCode.FORMAT_INVALID },
      });
      return z.NEVER;
    }
  })
  .pipe(z.array(LeadFormSubmissionFilterEntrySchema).max(5));

// M20-S06 — shared by the backend (list-lead-form-submissions.dto.ts) and BFF
// (lead-form.schemas.ts) admin submissions-list query params. Same "BFF schema silently drifts
// from backend DTO" pattern the two schemas above already solve — found by /bad-smell-audit
// (BFF-5) rather than authored duplicated from the start.
//
// M20-S12 adds `search`/`filters` (mutually exclusive — UC-041 steps 3-4) and
// `submittedFrom`/`submittedTo` (orthogonal date range — UC-041 step 5). `filters` capped at 5
// entries derives GENERIC_VALUE_OUT_OF_RANGE via a plain Zod `.max()` (zod-violation.ts), no
// bespoke code needed. The two cross-field rules below have no VO behind them either, so each
// reuses GenericErrorCode via `.refine()` + `params.code`, mirroring tenant-settings.ts's
// `buildUpdateTenantSettingsSchema` empty-update `.refine()`.
//
// `search`/`filters[].value` only require non-empty — NOT a 3-character minimum. The original
// M20-S12 design rejected anything under 3 characters because `pg_trgm`'s GIN index can't
// accelerate a pattern with no extractable trigram (verified against PostgreSQL's own pgtrgm
// docs) — that part is still true. What changed is the cost estimate of accepting the fallback
// scan anyway (M20-S13 story feedback, 2026-08-27, revised twice: an initial "tens of thousands
// of rows" estimate conflated realistic typical volume with this system's own configured
// ceiling, corrected after a live query-plan review — TypeOrmLeadFormSubmissionRepository's
// `applySearch()` correlates its per-question `EXISTS` on `(tenant_id, submission_id)`, which
// `lead_form_answers`'s own `(tenant_id, submission_id, question_label)` index covers, so
// finding one submission's own ≤20 answer rows is an indexed lookup — only the ILIKE against
// those few rows (plus name/email on the outer row) is unindexed. The real unindexed cost
// therefore scales with a tenant's own submission count (bounded by its own
// maxSubmissionsPerDay×retentionMonths caps, up to ~730,000 at the system's absolute configured
// ceiling), not the cross-submission answer-row total (up to ~14.6M at that same ceiling, since
// each submission contributes up to 20 rows) — a bot-review round correctly caught the first
// estimate's imprecision but then overstated the fix by citing the larger, wrong bound too.
// At the real (submission-count) ceiling this is tens of millions of short string comparisons,
// estimated — not benchmarked — at low single-digit seconds, for a tenant that would have to
// deliberately sustain the maximum caps for the full 24-month retention window to hit it.
// Rejecting a real short search (an age, "25") outright was judged the worse trade-off against
// that bounded, unlikely worst case — confirmed with the user after presenting the corrected
// numbers).
export const ListLeadFormSubmissionsSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    // .trim() before .min(1) — see LeadFormSubmissionFilterEntrySchema's own comment above for
    // why a whitespace-only value must not pass as non-empty (Codex PR #436 round 3 finding,
    // 2026-08-27).
    search: z.string().trim().min(1).optional(),
    filters: LeadFormSubmissionFiltersQuerySchema.optional(),
    submittedFrom: z.iso.date().optional(),
    submittedTo: z.iso.date().optional(),
  })
  .refine((data) => !(data.search !== undefined && data.filters !== undefined), {
    error: 'search and filters are mutually exclusive',
    params: { code: GenericErrorCode.VALUE_INVALID },
  })
  .refine(
    (data) =>
      data.submittedFrom === undefined ||
      data.submittedTo === undefined ||
      data.submittedFrom <= data.submittedTo,
    {
      error: 'submittedFrom must not be after submittedTo',
      params: { code: GenericErrorCode.VALUE_OUT_OF_RANGE },
    },
  );
