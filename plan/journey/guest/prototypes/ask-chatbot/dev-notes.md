# Dev Notes — GUEST: Ask Chatbot

## Overview

Nothing in this journey is built yet. Promoted from `docs/discovery/CHATBOT/CHATBOT.md` into
canonical docs (`docs/04-USE_CASES.md` UC-033/UC-034, `docs/05-BOUNDED_CONTEXTS.md`,
`docs/13-DATABASE_SCHEMA.md`, `docs/14-API_CONTRACTS.md`, `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`
§ CHATBOT, `docs/21-TENANTS_SETTINGS_SCHEMA.md` §7) via `/discovery-to-milestone` on 2026-08-08.
No milestone/story number is assigned yet — confirm at `/story-discovery` before implementing.

---

## File map

Paths below follow this repo's domain-slice conventions (`docs/24-BFF_ARCHITECTURE.md`,
`docs/REPOSITORY_STRUCTURE.md`). All rows are GAP — nothing exists today.

| File | Status | Action |
|---|---|---|
| `apps/web/shells/hotsite/components/ChatbotWidget.tsx` | ❌ Gap | Create — bubble/inline widget, owns pre-flight check + conversation state (idle/active/interrupted) |
| `apps/web/shells/hotsite/components/ChatbotWidget.spec.tsx` | ❌ Gap | Create in the same commit (CLAUDE.md §7 — every new `shells/hotsite/components/**` ships its spec) |
| `apps/web/features/platform/hotsite/api/chatbot.ts` (or similar) | ❌ Gap | Create — TBD, confirm exact fetcher location at story-discovery; must use `bffPublicFetch` per `docs/24-BFF_ARCHITECTURE.md` § Web → BFF Transport Layer, never a raw `fetch()` |
| `apps/bff/src/features/platform/chatbot/public/chatbot.public.controller.ts` | ❌ Gap | Create — `GET /public/platform/chatbot/status`, `POST /public/platform/chatbot/messages`, per the `.public.controller.ts` under `public/` convention (`docs/24-BFF_ARCHITECTURE.md` § Module & Controller Naming Conventions) |
| `apps/bff/src/features/platform/chatbot/chatbot.mapper.ts` | ❌ Gap | Create — `buildSystemPrompt()` (CHATBOT.md §6) |
| `apps/bff/src/features/platform/chatbot/chatbot-context.ts` | ❌ Gap | Create — `getServicesContext()`, `getBusinessInfoContext()`, `getKnowledgeTextContext()` (CHATBOT.md §6) |
| `apps/bff/src/features/platform/chatbot/chatbot.types.ts` | ❌ Gap | Create — BFF-side request/response DTOs |
| `apps/backend/src/contexts/platform/application/ports/llm-provider.port.ts` | ❌ Gap | Create — `ILlmProvider`, `ChatCompletionRequest`/`Result` (CHATBOT.md §4) |
| `apps/backend/src/contexts/platform/infrastructure/llm/openrouter-llm.adapter.ts` | ❌ Gap | Create — primary, DeepSeek V4 Flash 0731, always `reasoning: { effort: "none" }` |
| `apps/backend/src/contexts/platform/infrastructure/llm/anthropic-llm.adapter.ts` | ❌ Gap | Create |
| `apps/backend/src/contexts/platform/infrastructure/llm/openai-llm.adapter.ts` | ❌ Gap | Create |
| `apps/backend/src/contexts/platform/infrastructure/controllers/chatbot.controller.ts` (name TBD) | ❌ Gap | Create — cap enforcement (UC-033 steps 2-3), persistence, calls `ILlmProvider.complete()` |
| Migration for `platform.chatbot_sessions`/`platform.chatbot_messages`/`platform.chatbot_provider_balance` | ❌ Gap | Create — see `docs/13-DATABASE_SCHEMA.md` |

**TBD, confirm at story-discovery:** exact BFF fetcher file name/location, exact backend controller
class name, and whether `ChatbotWidget.tsx` splits into separate bubble/panel/inline components or
stays one file — none of this is decided yet, don't guess a precise shape into a story.

---

## Screens

### 00-hotsite.html → `shared/hotsite.html`

Redirect stub only (per `README.md`'s shared-asset convention) — the actual entry point is the one
shared hotsite file, now additionally showing the collapsed chat bubble (bottom-right). See
`plan/journey/shared/hotsite.html`.

### 01-active-chat.html — `ChatbotWidget` (variant: bubble, state: active)

**Props:** `variant: 'bubble' | 'inline'`, `accentColor: 'primary' | 'secondary'`, `botName?: string`,
`welcomeMessage?: string`, `tenantSlug: string` — the first four come straight off
`ChatbotModuleData` (`docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` § CHATBOT), read from the cached
hotsite manifest; `tenantSlug` is ambient (`useTenant()`/route param), not part of the module data.

**Internal state:** `sessionId: string | null` (held in `sessionStorage`, not component state, so a
page reload doesn't lose the conversation mid-session), `messages: ChatTurn[]`, `status: 'idle' |
'sending' | 'interrupted'`.

**BFF call — send message:**
```
POST /public/platform/chatbot/messages
  Header: X-Tenant-Slug: {slug}
  Body: { sessionId?: string, message: string }   // sessionId omitted on first message
  Response 200: { sessionId: string, reply: string }
  400: message exceeds maxMessageLengthChars — inline validation, input stays enabled
  429: a volume cap rejected the request — widget moves to 'interrupted' (01b)
  503: LLM provider call failed mid-conversation — widget moves to 'interrupted' (01b)
  404: tenant slug not found, or sessionId doesn't belong to this tenant
```
Full contract: `docs/14-API_CONTRACTS.md` § Chatbot Widget.

### 01b-interrupted.html — `ChatbotWidget` (state: interrupted)

Same component, `status: 'interrupted'`. Triggered by a `429` (cap exceeded — UC-033 A1/A2) or a
`503` (provider failure mid-conversation — UC-033 A4) on the send-message call. Input and send
button disable; a WhatsApp/phone fallback CTA appears, sourced from the manifest's already-resolved
`business.phone`/`socialLinks.whatsapp` (no new field).

### 01c-not-available.html — `ChatbotWidget` (renders `null`)

**Props:** same as above, plus the pre-flight result.

**BFF call — availability pre-flight, on mount:**
```
GET /public/platform/chatbot/status
  Header: X-Tenant-Slug: {slug}
  Response 200: { available: boolean }
  404: tenant slug not found
```
Never cached (unlike the 5-minute-cached manifest) — always evaluates live state. If
`available: false`, the widget renders nothing — no bubble, no placeholder. If the module itself is
`enabled: false` on the manifest, this call never even happens — the generic module-render filter
(`buildHotsiteModuleRenderPlan()`) already excludes it before `ChatbotWidget` mounts.

### 01d-inline-variant.html — `ChatbotWidget` (variant: inline)

Same component and same two BFF calls as 01-active-chat.html — only `variant: 'inline'` differs.
Renders as its own section in manifest layout order instead of a fixed floating bubble.

---

## Validation

| Field | Rule | Enforced where | Error |
|---|---|---|---|
| `message` (per send) | max `maxMessageLengthChars` (default 1000, tenant-overridable) | BFF, before backend/LLM | `400` — inline, input stays enabled |
| new session — tenant-wide | `maxConversationsPerDay` (default 30) | Backend, `COUNT` on `chatbot_sessions` | `429` — widget interrupts |
| new session — per visitor | `maxConversationsPerIpPerDay` (default 5) | Backend, same table + `client_ip` | `429` — widget interrupts |
| new session — concurrency | `maxConcurrentConversations` (default 5, live-ness proxy `last_message_at` within 2 min) | Backend | `429` — widget interrupts |
| existing session | `maxMessagesPerConversation` (default 20 = 10 exchanges, both roles) | Backend, `COUNT` on `chatbot_messages` | `429` — widget interrupts |
| history sent to LLM | `maxHistoryMessagesSentToLlm` (default 10 = last 5 exchanges) — shaping, never rejects | BFF, before forwarding to backend | n/a (silent truncation) |
| LLM response | `maxOutputTokensPerResponse` (default 300) hard ceiling | Backend, passed to `ILlmProvider.complete()` | n/a (model-side cap) |
| `settings.chatbot.knowledgeText` (tenant settings, not this widget) | max `maxKnowledgeTextLength` (default 4000) | BFF/backend, `PATCH /v1/tenants/settings` | `400` — see `manager/prototypes/configuracoes/dev-notes.md` |

All defaults above are fixed platform constants, individually overridable per tenant
(`tenant.settings.chatbot?.X ?? DEFAULT_X`) — never tenant-editable through this widget or any admin
form. Full values and rationale: `docs/21-TENANTS_SETTINGS_SCHEMA.md` §7.

---

## State machine

```
not-available ──(GET /chatbot/status → available:true)──> active
active ──(429 cap exceeded | 503 provider failure)──> interrupted
active ──(reply received)──> active                    // stays active, message appended
interrupted                                              // terminal for this session — no
                                                           // resume action, only the phone/
                                                           // WhatsApp fallback
```

- **not-available** (01c): pre-flight `GET /chatbot/status` returned `available: false`, or the
  module is `enabled: false` on the manifest (never even calls the status endpoint). Widget renders
  nothing.
- **active** (01-active-chat, 01d-inline-variant): normal send/receive loop. Same state for both
  `variant` values — only layout differs.
- **interrupted** (01b): terminal for the current session. A fresh page load re-runs the pre-flight
  check and may start a brand-new session if caps have since cleared (e.g. next day for the daily
  cap), but there is no in-widget "retry" action.

Per `docs/04-USE_CASES.md` UC-033/UC-034 — full detail (five pre-flight conditions, cap-rejection
error codes) in the UC text and `docs/14-API_CONTRACTS.md` § Chatbot Widget.

---

## Known open questions (not yet resolved — flag at story-discovery)

- Exact split of `ChatbotWidget.tsx` into sub-components (bubble trigger vs. panel vs. inline card)
  — not decided, this dev-notes file intentionally treats it as one logical component.
- Whether `sessionId` persistence uses `sessionStorage` (survives reload, not tab close) or
  in-memory only — CHATBOT.md §8 says `sessionStorage`, not yet confirmed against a real story AC.
- No E2E/component test file paths chosen yet — will follow `docs/08-TESTING_STRATEGY.md` once a
  story exists.
