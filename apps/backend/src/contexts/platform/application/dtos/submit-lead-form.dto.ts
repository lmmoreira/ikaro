import { z } from 'zod';
import { LeadFormSubmissionFieldsSchema } from '@ikaro/validation';

// name/email/phone/answers shape is shared with the BFF's own SubmitLeadFormBodySchema — see
// LeadFormSubmissionFieldsSchema's own docstring in @ikaro/validation for why this is a single
// source of truth rather than a duplicated schema (M20-S05 PR #423 review discussion).
export const SubmitLeadFormSchema = LeadFormSubmissionFieldsSchema.extend({
  // Resolved by the BFF from an optionally-decoded JWT (decodeUserJwt) — null for a guest.
  customerId: z.string().nullable(),
  // Real visitor IP as resolved by the BFF (getClientIp()) — the backend only ever sees the BFF's
  // own connection, so this can't be derived from the backend's own request object.
  ipAddress: z.string().min(1),
  // M20-S14 — forwarded unverified by the BFF; CreateLeadFormSubmissionUseCase verifies it via
  // ITurnstileVerifierPort as its first step (relocated from the BFF's own TurnstileService).
  turnstileToken: z.string().min(1),
});

export type SubmitLeadFormDto = z.infer<typeof SubmitLeadFormSchema>;
