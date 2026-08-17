# Dev Notes — GUEST: Ask Chatbot

## Overview

Built end to end by M19-S11 (2026-08-17) — the widget, its client fetchers, the fake/noop LLM
adapter, and page.tsx registration all ship in that story; see the File map below for exact
status per file. Promoted from `docs/discovery/CHATBOT/CHATBOT.md` into canonical docs
(`docs/04-USE_CASES.md` UC-033/UC-034, `docs/05-BOUNDED_CONTEXTS.md`, `docs/13-DATABASE_SCHEMA.md`,
`docs/14-API_CONTRACTS.md`, `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` § CHATBOT,
`docs/21-TENANTS_SETTINGS_SCHEMA.md` §7) via `/discovery-to-milestone` on 2026-08-08.

---

## File map

Paths below follow this repo's domain-slice conventions (`docs/24-BFF_ARCHITECTURE.md`,
`docs/REPOSITORY_STRUCTURE.md`). All rows are now built — kept for the implementation-decision
context each row's Action column records.

| File | Status | Action |
|---|---|---|
| `apps/web/shells/hotsite/components/ChatbotWidget.tsx` | ✅ Done (M19-S11) | Bubble/inline widget, owns pre-flight check + conversation state (checking/idle/sending/interrupted) |
| `apps/web/shells/hotsite/components/ChatbotWidget.spec.tsx` | ✅ Done (M19-S11) | Shipped in the same commit (CLAUDE.md §7 — every new `shells/hotsite/components/**` ships its spec) |
| `apps/web/features/platform/hotsite/api/chatbot.ts` | ✅ Done (M19-S11) | Client-only fetchers using `bffClient` with an explicit `X-Tenant-Slug` header, mirroring `apps/web/features/platform/hotsite/api/services.ts`'s existing `fetchServicesClient()` pattern exactly. Story-discovery's first pass proposed two new Route Handler proxies (neither `bffPublicFetch` nor `bffClient` looked like an exact fit against `docs/24`'s abstract decision table); corrected during implementation once `fetchServicesClient()` was found as a working precedent for this exact case — `bffClient`'s `/v1` baseURL already reaches `/public/...` BFF routes via the existing generic same-origin gateway (`apps/web/app/v1/[...path]/route.ts`, since the BFF's `setGlobalPrefix('v1')` makes them live at `/v1/public/...`). No new Route Handlers needed. |
| `apps/web/features/platform/hotsite/module-schemas.ts` | ✅ Done (M19-S11) | Added `ChatbotModuleDataSchema`, registered in `MODULE_DATA_SCHEMAS.CHATBOT` (`docs/15` §7 step 3 — mandatory before any module type ships) |
| `apps/bff/src/features/platform/platform.public.controller.ts` | ✅ Done (M19-S09) | `GET chatbot/status` / `POST chatbot/messages` added directly to the existing `PlatformPublicController` — **not** a new nested `chatbot/public/chatbot.public.controller.ts` as originally predicted below; no domain nests controllers below the domain folder |
| `apps/bff/src/features/platform/chatbot.mapper.ts` | ✅ Done (M19-S09) | `buildSystemPrompt()` (CHATBOT.md §6) — flat file directly in `features/platform/`, not under a `chatbot/` subfolder as originally predicted |
| `apps/bff/src/features/platform/chatbot-context.ts` | ✅ Done (M19-S09) | Merged `getBusinessContext()` (services + business info + hours in one call) — flat file, not under a `chatbot/` subfolder; the original two-function split (`getBusinessInfoContext`/`getKnowledgeTextContext`) was consolidated during S09 to avoid a redundant duplicate fetch (PR #373 review) |
| `apps/backend/src/contexts/platform/application/ports/llm-provider.port.ts` | ✅ Done (M19-S02) | `ILlmProvider`, `ChatCompletionRequest`/`Result` (CHATBOT.md §4) |
| `apps/backend/src/contexts/platform/infrastructure/llm/openrouter-llm.adapter.ts` | ✅ Done (M19-S02) | Primary, DeepSeek V4 Flash 0731, always `reasoning: { effort: "none" }` |
| `apps/backend/src/contexts/platform/infrastructure/llm/anthropic-llm.adapter.ts` | ✅ Done (M19-S03) | — |
| `apps/backend/src/contexts/platform/infrastructure/llm/openai-llm.adapter.ts` | ✅ Done (M19-S03) | — |
| `apps/backend/src/contexts/platform/infrastructure/llm/fake-llm.adapter.ts` | ✅ Done (M19-S11) | DI-registered fake/noop `ILlmProvider`, selectable via `CHATBOT_LLM_PROVIDER=fake`, registered in `LlmProviderRegistry`. Resolved at M19-S11 story-discovery: the AC requiring a real Playwright E2E flow (widget → BFF → backend → adapter) against a non-billed response has no existing infrastructure to satisfy it — the existing `FakeLlmProviderBuilder` is Jest-only, not DI-registered. Mirrors the `EMAIL_ADAPTER=mailhog` precedent (a real, free, safe local adapter, never the production default) — including an `APP_ENV`-gated guard added during PR #385 review rejecting `fake` outside `local`, mirroring `EMAIL_ADAPTER=mailhog`'s own guard exactly (`apps/backend/src/config/env.validation.ts`) |
| Chatbot backend controller | ✅ Done (M19-S05) | Cap enforcement, persistence, calls `ILlmProvider.complete()` |
| Migration for `platform.chatbot_sessions`/`platform.chatbot_messages`/`platform.chatbot_provider_balance` | ✅ Done (M19-S01) | See `docs/13-DATABASE_SCHEMA.md` |

**Resolved at M19-S11 story-discovery (2026-08-17):** `ChatbotWidget.tsx` stays one file (no bubble/panel/inline
split); `sessionId` **and** the visible `messages` transcript both persist to `sessionStorage`, so a reload
restores the visible conversation client-side — closes the "reload/F5 behavior" open question below in favor
of client-side caching (no new backend read endpoint). `CHATBOT` renders with no divider before/after it in
`page.tsx`'s render loop, matching the existing `FOOTER` special-case (the `bubble` variant is `position:
fixed`, outside document flow).

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

**Internal state:** `sessionId: string | null` and `messages: ChatTurn[]` (each `ChatTurn` also
carries a stable `id` for React's key prop, added during PR #385 review — SonarCloud S6479) are
both held in `sessionStorage`, not just component state, so a page reload restores the full
visible transcript, not only the underlying session (resolved during M19-S11 story-discovery —
see "Known open questions" below). `status: 'checking' | 'unavailable' | 'idle' | 'sending' |
'interrupted'`.

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

## Known open questions

All resolved at M19-S11 story-discovery (2026-08-17):

- **Component split:** `ChatbotWidget.tsx` stays one file — no bubble/panel/inline split.
- **`sessionId` persistence:** `sessionStorage`, confirmed against the real story AC.
- **Reload/F5 behavior:** resolved as (b) client-side cache — `messages` persists to
  `sessionStorage` alongside `sessionId`, so the visible transcript survives a reload with no new
  backend read endpoint. (Option (a), fetch-on-mount, was ruled out since it would've pulled a new
  backend/BFF endpoint into what's otherwise a frontend-scoped story.)
- **E2E test infrastructure:** no fake/stubbed `ILlmProvider` existed anywhere that a real running
  backend process could select — folded into M19-S11's own scope as a DI-registered fake adapter
  selectable via `CHATBOT_LLM_PROVIDER=fake` (see File map above).
- **Client transport:** resolved via `bffClient` with an explicit `X-Tenant-Slug` header — the
  same pattern `fetchServicesClient()` (`apps/web/features/platform/hotsite/api/services.ts`)
  already uses for the identical case (see File map above).
