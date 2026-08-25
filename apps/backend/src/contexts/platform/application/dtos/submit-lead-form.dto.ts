import { z } from 'zod';

// Outer sanity bounds only — VO validation (Email/PhoneNumber format, name required) happens
// domain-side in LeadFormSubmission.create() (SendChatMessageSchema's own precedent for this
// split: a static Zod ceiling here must never be the actual business rule). answers[].questionId
// existence and required-question completeness are re-validated against the tenant's live
// LeadFormConfig catalog inside SubmitLeadFormUseCase, not here — this schema only checks shape.
export const SubmitLeadFormSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().min(1).max(320),
  phone: z.string().min(1).max(30),
  answers: z
    .array(
      z.object({
        questionId: z.uuid(),
        value: z.union([z.string(), z.array(z.string())]),
      }),
    )
    .max(20),
  // Resolved by the BFF from an optionally-decoded JWT (decodeUserJwt) — null for a guest.
  customerId: z.string().nullable(),
  // Real visitor IP as resolved by the BFF (getClientIp()) — the backend only ever sees the BFF's
  // own connection, so this can't be derived from the backend's own request object.
  ipAddress: z.string().min(1),
});

export type SubmitLeadFormDto = z.infer<typeof SubmitLeadFormSchema>;
