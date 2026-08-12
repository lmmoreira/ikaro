import { z } from 'zod';

// message's real, tenant-resolved cap (maxMessageLengthChars, default 1000) is enforced twice:
// the BFF DTO layer (S09) rejects it before any network hop to this endpoint, and
// SendChatMessageUseCase re-enforces the same resolved cap as the real backstop (PR #360 review
// — a generous static bound here alone left the tenant's real, often-smaller cap unenforced for
// any caller reaching this endpoint directly, bypassing the BFF's check). This schema's own
// 5000-char ceiling stays deliberately generous and non-tenant-resolved — an outer bound against
// an absurd payload before the request even reaches the use case, never the tenant's real cap
// (docs/discovery/CHATBOT/CHATBOT.md §8 layer 5; same reasoning docs/21-TENANTS_SETTINGS_SCHEMA.md
// §7 already applies to knowledgeText — a static bound here must never be the tenant's real cap,
// or an Ikaro-granted override above this ceiling would be silently unenforceable).
export const SendChatMessageSchema = z.object({
  sessionId: z.uuid().optional(),
  systemPrompt: z.string().min(1),
  message: z.string().min(1).max(5000),
  // Real visitor IP as resolved by the BFF (getClientIp()) — the backend only ever sees the BFF's
  // own connection, so this can't be derived from the backend's own request object; it must be
  // forwarded explicitly. Used for cap layer 2 (per-IP daily conversation cap).
  clientIp: z.string().min(1),
});

export type SendChatMessageDto = z.infer<typeof SendChatMessageSchema>;
