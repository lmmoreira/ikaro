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
// Each app layer `.extend()`s this with its own fields that only IT can resolve:
// - BFF adds `turnstileToken` (verified BFF-side, before the backend hop).
// - Backend adds `customerId`/`ipAddress` (resolved by the BFF from the decoded JWT / real
//   client connection — the backend can't derive either from its own request object, since it
//   only ever sees the BFF's own connection).
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
// free-typed — see the filter-options endpoint), so it only needs non-empty; `value` shares the
// same 3-character minimum as `search` (docs/14-API_CONTRACTS.md § Leads Submissions).
export const LeadFormSubmissionFilterEntrySchema = z.object({
  questionLabel: z.string().min(1),
  value: z.string().min(3),
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
// `submittedFrom`/`submittedTo` (orthogonal date range — UC-041 step 5). `search` and each
// `filters[].value` share the same 3-character minimum, backed by the `pg_trgm` GIN index's own
// "no extractable trigrams below 3 chars" limitation (docs/13-DATABASE_SCHEMA.md §
// platform.lead_form_answers) — a plain Zod `.min()` derives GENERIC_VALUE_TOO_SHORT automatically
// (zod-violation.ts), no bespoke code needed. `filters` capped at 5 entries derives
// GENERIC_VALUE_OUT_OF_RANGE the same way. The two cross-field rules below have no VO behind them
// either, so each reuses GenericErrorCode via `.refine()` + `params.code`, mirroring
// tenant-settings.ts's `buildUpdateTenantSettingsSchema` empty-update `.refine()`.
export const ListLeadFormSubmissionsSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().min(3).optional(),
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
