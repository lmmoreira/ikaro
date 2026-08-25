import { z } from 'zod';

// Request Zod schema and its inferred body type — split out of platform.public.controller.ts
// so request-side shapes never live inline in the controller (mirrors
// booking/bookings.schemas.ts's existing split).
//
// `maxMessageLengthChars` (default 1000) is an Ikaro-only override (docs/21-TENANTS_SETTINGS_SCHEMA.md
// §7 — "No" tenant-editable, set only via a direct DB update, never returned by any BFF-reachable
// read) — the BFF has no way to know a tenant's real resolved value, so it must never guess at a
// business-rule ceiling here (same reasoning §7 already applies to knowledgeText/maxKnowledgeTextLength:
// a static bound at this layer must never be the tenant's real cap, or an above-default override
// would be silently unenforceable). This 5000 mirrors the backend's own SendChatMessageSchema outer
// bound — an absurd-payload sanity guard only. The real, tenant-resolved rejection happens
// backend-side in SendChatMessageUseCase, still before any LLM call (PR #373 review, Codex).
export const ChatbotMessageBodySchema = z.object({
  sessionId: z.uuid().optional(),
  message: z.string().min(1).max(5000),
});

export type ChatbotMessageBody = z.infer<typeof ChatbotMessageBodySchema>;

// M20-S05 — outer shape/sanity bounds only, mirrors ChatbotMessageBodySchema's own split: VO
// validation (Email/PhoneNumber format, name required) and the answers[]/required-question
// business rules all happen backend-side, against the tenant's live LeadFormConfig catalog
// (SubmitLeadFormUseCase) — never duplicated here.
export const SubmitLeadFormBodySchema = z.object({
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
  turnstileToken: z.string().min(1),
});

export type SubmitLeadFormBody = z.infer<typeof SubmitLeadFormBodySchema>;
