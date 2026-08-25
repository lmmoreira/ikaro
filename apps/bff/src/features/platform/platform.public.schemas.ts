import { z } from 'zod';
import { ChatbotMessageFieldsSchema, LeadFormSubmissionFieldsSchema } from '@ikaro/validation';

// Request Zod schema and its inferred body type — split out of platform.public.controller.ts
// so request-side shapes never live inline in the controller (mirrors
// booking/bookings.schemas.ts's existing split).
//
// sessionId/message shape is shared with the backend's own SendChatMessageSchema — see
// ChatbotMessageFieldsSchema's own docstring in @ikaro/validation (M20-S05 PR #423 review
// discussion: this schema previously duplicated those two fields verbatim). The BFF has no
// fields beyond this shared shape, so it's reused as-is with no `.extend()`.
//
// `maxMessageLengthChars` (default 1000) is an Ikaro-only override (docs/21-TENANTS_SETTINGS_SCHEMA.md
// §7 — "No" tenant-editable, set only via a direct DB update, never returned by any BFF-reachable
// read) — the BFF has no way to know a tenant's real resolved value, so it must never guess at a
// business-rule ceiling here (same reasoning §7 already applies to knowledgeText/maxKnowledgeTextLength:
// a static bound at this layer must never be the tenant's real cap, or an above-default override
// would be silently unenforceable). This 5000 mirrors the backend's own SendChatMessageSchema outer
// bound — an absurd-payload sanity guard only. The real, tenant-resolved rejection happens
// backend-side in SendChatMessageUseCase, still before any LLM call (PR #373 review, Codex).
export const ChatbotMessageBodySchema = ChatbotMessageFieldsSchema;

export type ChatbotMessageBody = z.infer<typeof ChatbotMessageBodySchema>;

// name/email/phone/answers shape is shared with the backend's own SubmitLeadFormSchema — see
// LeadFormSubmissionFieldsSchema's own docstring in @ikaro/validation (M20-S05 PR #423 review
// discussion: this schema previously duplicated those four fields verbatim). VO validation
// (Email/PhoneNumber format, name required) and the answers[]/required-question business rules
// all happen backend-side, against the tenant's live LeadFormConfig catalog
// (CreateLeadFormSubmissionUseCase) — never duplicated here.
export const SubmitLeadFormBodySchema = LeadFormSubmissionFieldsSchema.extend({
  turnstileToken: z.string().min(1),
});

export type SubmitLeadFormBody = z.infer<typeof SubmitLeadFormBodySchema>;
