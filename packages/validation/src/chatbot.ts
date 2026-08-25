import { z } from 'zod';

// Shared by the backend (send-chat-message.dto.ts) and BFF (platform.public.schemas.ts) — both
// need the identical outer-sanity-bounds shape for `sessionId`/`message`, so this lives here
// directly rather than duplicated (M20-S05 PR #423 review discussion, 2026-08-25: the same
// BFF/backend schema-drift pattern found on the Lead Form submission schema — see
// lead-form-submission.ts — also existed here).
//
// `message`'s real, tenant-resolved cap (maxMessageLengthChars, default 1000) is enforced twice
// downstream regardless — the BFF DTO layer rejects it before any network hop, and
// SendChatMessageUseCase re-enforces the same resolved cap as the real backstop (PR #360 review).
// This schema's own 5000-char ceiling stays deliberately generous and non-tenant-resolved — an
// outer bound against an absurd payload, never the tenant's real cap.
//
// The backend `.extend()`s this with `systemPrompt`/`clientIp` — both resolved server-side (the
// BFF forwards the real visitor IP via getClientIp(); the backend never has its own view of it).
// The BFF has no fields beyond this shared shape, so it reuses it as-is with no `.extend()`.
export const ChatbotMessageFieldsSchema = z.object({
  sessionId: z.uuid().optional(),
  message: z.string().min(1).max(5000),
});
