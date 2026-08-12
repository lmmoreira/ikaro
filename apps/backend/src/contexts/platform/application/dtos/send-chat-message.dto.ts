import { z } from 'zod';

// message's real, tenant-resolved cap (maxMessageLengthChars, default 1000) is enforced upstream
// at the BFF DTO layer (S09), which is the caller this endpoint actually serves — this schema's
// own 5000-char ceiling is a defense-in-depth backstop only, deliberately generous rather than
// tenant-resolved, so this route is never reachable with an unbounded string from any caller
// (docs/discovery/CHATBOT/CHATBOT.md §8 layer 5). Mirrors the reasoning docs/21-TENANTS_SETTINGS_SCHEMA.md
// §7 already applies to knowledgeText: a static bound here must never be the tenant's real cap,
// or an Ikaro-granted override above this ceiling would be silently unenforceable.
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
