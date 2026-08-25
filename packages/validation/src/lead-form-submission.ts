import { z } from 'zod';

// Shared by the backend (submit-lead-form.dto.ts) and BFF (platform.public.schemas.ts) — both
// need the identical outer-sanity-bounds shape for the fields a submitter actually types, so this
// lives here directly rather than duplicated (M20-S05 PR #423 review discussion, 2026-08-25:
// caught as the exact same "BFF schema silently drifts from backend DTO on shared fields" pattern
// UpdateLeadFormConfigSchema above already solved for the admin-config side of this same feature).
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
export const LeadFormSubmissionAnswerSchema = z.object({
  questionId: z.uuid(),
  value: z.union([z.string(), z.array(z.string())]),
});

export const LeadFormSubmissionFieldsSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().min(1).max(320),
  phone: z.string().min(1).max(30),
  answers: z.array(LeadFormSubmissionAnswerSchema).max(20),
});
