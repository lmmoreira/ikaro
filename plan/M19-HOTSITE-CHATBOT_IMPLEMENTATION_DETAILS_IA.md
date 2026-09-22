# M19 — Hotsite Chatbot: Implementation Details (IA)

## Artifacts

### Backend — domain

| Artifact | Path |
|---|---|
| `ChatbotSession` aggregate | `apps/backend/src/contexts/platform/domain/chatbot-session.aggregate.ts` |
| `ChatbotMessage` aggregate | `apps/backend/src/contexts/platform/domain/chatbot-message.aggregate.ts` |
| `ChatbotProviderBalance` aggregate | `apps/backend/src/contexts/platform/domain/chatbot-provider-balance.aggregate.ts` |
| Domain errors | `apps/backend/src/contexts/platform/domain/errors/chatbot-domain.error.ts` |
| `ChatbotSettingsValidator` (VO validator — `maxKnowledgeTextLength`) | `apps/backend/src/contexts/platform/domain/value-objects/validators/chatbot-settings.validator.ts` |
| Cap defaults + platform-backstop env-var doc comment | `apps/backend/src/contexts/platform/chatbot.constants.ts` |

### Backend — application

| Artifact | Path |
|---|---|
| `ILlmProvider` port | `apps/backend/src/contexts/platform/application/ports/llm-provider.port.ts` |
| `IChatbotSessionRepository` port | `apps/backend/src/contexts/platform/application/ports/chatbot-session-repository.port.ts` |
| `IChatbotMessageRepository` port | `apps/backend/src/contexts/platform/application/ports/chatbot-message-repository.port.ts` |
| `IChatbotProviderBalanceRepository` port | `apps/backend/src/contexts/platform/application/ports/chatbot-provider-balance-repository.port.ts` |
| `SendChatMessageUseCase` (UC-033) | `apps/backend/src/contexts/platform/application/use-cases/send-chat-message.use-case.ts` |
| `GetChatbotStatusUseCase` (UC-034) | `apps/backend/src/contexts/platform/application/use-cases/get-chatbot-status.use-case.ts` |
| `GetChatbotCapStatusUseCase` (UC-027 A5) | `apps/backend/src/contexts/platform/application/use-cases/get-chatbot-cap-status.use-case.ts` |
| Session resolution / cap-check shared helpers | `apps/backend/src/contexts/platform/application/use-cases/chatbot-session-resolution.helpers.ts`, `chatbot-cap-check.types.ts` |

### Backend — infrastructure (LLM adapters)

| Artifact | Path |
|---|---|
| `LlmProviderRegistry` | `apps/backend/src/contexts/platform/infrastructure/llm/` (registered in `platform.module.ts`) |
| `OpenRouterLlmAdapter` (default, `deepseek/deepseek-v4-flash-0731`) | `apps/backend/src/contexts/platform/infrastructure/llm/openrouter-llm.adapter.ts` |
| `AnthropicLlmAdapter` (`claude-haiku-4-5`) | `apps/backend/src/contexts/platform/infrastructure/llm/anthropic-llm.adapter.ts` |
| `OpenAiLlmAdapter` (`gpt-5.6-luna`) | `apps/backend/src/contexts/platform/infrastructure/llm/openai-llm.adapter.ts` |
| `FakeLlmAdapter` (`CHATBOT_LLM_PROVIDER=fake`, local/E2E only) | `apps/backend/src/contexts/platform/infrastructure/llm/fake-llm.adapter.ts` |
| `OpenRouterCreditsClient` (management-key balance poll) | `apps/backend/src/contexts/platform/infrastructure/llm/openrouter-credits.client.ts` |

### Backend — infrastructure (persistence, controllers, cron)

| Artifact | Path |
|---|---|
| `TypeOrmChatbotSessionRepository` | `apps/backend/src/contexts/platform/infrastructure/repositories/typeorm-chatbot-session.repository.ts` |
| `TypeOrmChatbotMessageRepository` | `apps/backend/src/contexts/platform/infrastructure/repositories/typeorm-chatbot-message.repository.ts` |
| `TypeOrmChatbotProviderBalanceRepository` (`recordCallOutcome()`, `saveBalance()`) | `apps/backend/src/contexts/platform/infrastructure/repositories/typeorm-chatbot-provider-balance.repository.ts` |
| `ChatbotController` (`platform/chatbot`, no `/public/` prefix, no guard — bare route) | `apps/backend/src/contexts/platform/infrastructure/controllers/chatbot.controller.ts` |
| `CronChatbotController` (`POST /cron/chatbot-retention-purge`, `POST /cron/chatbot-balance-poll`, `InternalApiGuard`) | `apps/backend/src/contexts/platform/infrastructure/controllers/cron-chatbot.controller.ts` |
| `ChatbotRetentionPurgeTriggerHandler` | `apps/backend/src/contexts/platform/infrastructure/events/chatbot-retention-purge-trigger.handler.ts` |
| `ChatbotBalancePollTriggerHandler` | `apps/backend/src/contexts/platform/infrastructure/events/chatbot-balance-poll-trigger.handler.ts` |
| Cron trigger name constants | `apps/backend/src/contexts/platform/infrastructure/events/cron-trigger-names.constants.ts` |
| Migrations (4, in order) | `1748400000010-CreateChatbotTables.ts`, `1748400000011-AddCostUsdToChatbotMessages.ts`, `1748400000012-AddHealthColumnsToChatbotProviderBalance.ts`, `1748400000013-AddStartedAtIndexToChatbotSessions.ts` — all in `apps/backend/src/contexts/platform/infrastructure/migrations/` |

### BFF

| Artifact | Path |
|---|---|
| Public routes (`GET status`, `POST messages`) | added to `apps/bff/src/features/platform/platform.public.controller.ts` (no separate controller — see Structural Decisions) |
| Cap-status route (`GET chatbot/cap-status`, `MANAGER`-only) | added to `apps/bff/src/features/platform/tenant-settings.controller.ts` |
| `chatbot-context.ts` (`getBusinessContext()` — one call, no per-field re-fetch) | `apps/bff/src/features/platform/chatbot-context.ts` |
| `chatbot.mapper.ts` (`buildSystemPrompt()`, `buildAssistantRules()`) | `apps/bff/src/features/platform/chatbot.mapper.ts` |

### Web

| Artifact | Path |
|---|---|
| `ChatbotWidget.tsx` (bubble/inline, 3 states) | `apps/web/shells/hotsite/components/ChatbotWidget.tsx` |
| `ChatbotPanel.tsx`, `chatbot-icons.tsx` | `apps/web/shells/hotsite/components/` |
| `chatbot-widget-storage.ts` (`sessionStorage` read/write, `isStoredChatTurn()` guard) | `apps/web/shells/hotsite/components/chatbot-widget-storage.ts` |
| Client fetchers (`bffClient` + `X-Tenant-Slug`) | `apps/web/features/platform/hotsite/api/chatbot.ts` |
| `ChatbotConfigPanel.tsx` (module config panel) | `apps/web/features/platform/components/hotsite/modules/ChatbotConfigPanel.tsx` |
| `SettingsChatbotSection.tsx` (tenant settings form) | `apps/web/features/platform/components/settings/SettingsChatbotSection.tsx` |
| Cap-status fetch + hook | `apps/web/features/platform/api/tenant-settings.ts` (`getChatbotCapStatus()`), `apps/web/features/platform/hotsite/useHotsite.ts` (`useChatbotCapStatus()`) |
| `page.tsx` `CHATBOT` branch + no-divider logic | `apps/web/app/[slug]/page.tsx`, `shouldSkipDivider()` in `page-model.ts` |
| `default-layout.ts` (`MODULE_ORDER`, `DEFAULT_MODULE_DATA.CHATBOT = {}`) | `apps/web/features/platform/hotsite/default-layout.ts` |
| `module-schemas.ts` (`ChatbotModuleDataSchema`) | `apps/web/features/platform/hotsite/module-schemas.ts` |
| E2E flow (widget → BFF → backend → `FakeLlmAdapter`) | `apps/web/e2e/chatbot-widget.spec.ts` |

### Shared types / infra

| Artifact | Path |
|---|---|
| `HotsiteModuleType` union + `ChatbotModuleData` + widget response types | `packages/types/src/hotsite.ts` |
| `TenantChatbotSettings`, `ChatbotCapStatusResponse` | `packages/types/src/tenant.dto.ts` |
| Error codes (9 chatbot-prefixed + 1 settings-prefixed) | `packages/types/src/error-codes.ts` |
| Backend/BFF `HotsiteModuleSchema` (shared Zod enum incl. `CHATBOT`) | `packages/validation/src/hotsite.ts` |
| Backend aggregate's own module-type union/set | `apps/backend/src/contexts/platform/domain/hotsite-config.aggregate.ts` |
| Pub/Sub catalog entries (2 cron topics) | `infra/terraform/pubsub-catalog.json` |
| Cloud Scheduler jobs (`modules/scheduler/main.tf` `locals.jobs`) | `infra/terraform/modules/scheduler/main.tf` |
| Secret containers (`openrouter-api-key`, `anthropic-api-key`, `openai-api-key`, `openrouter-management-api-key`) | `infra/terraform/envs/{staging,prod}/main.tf` via `module.secrets` |
| Foundation IAM grants (accessor + scheduler-publisher, both cron events) | `infra/terraform/foundation/envs/{staging,prod}/main.tf` |

### Test infrastructure

| Double | Path |
|---|---|
| `InMemoryChatbotSessionRepository` / `-MessageRepository` / `-ProviderBalanceRepository` | `apps/backend/src/test/repositories/platform/in-memory-chatbot-*.repository.ts` |
| `ChatbotSessionBuilder` / `ChatbotMessageBuilder` / `ChatbotProviderBalanceBuilder` (aggregate) + `-Entity` variants (TypeORM row) | `apps/backend/src/test/builders/platform/chatbot-*.builder.ts` |
| `FakeLlmProviderBuilder` (`withText()`/`withInputTokens()`/`withOutputTokens()`/`withCostUsd()`) | `apps/backend/src/test/builders/platform/fake-llm-provider.builder.ts` |
| Shared chatbot spec helpers (`fakeConfig()`, `todayInSaoPaulo()`, `staleSession()`) | `apps/backend/src/test/utils/chatbot-test-helpers.ts` |

---

## DB Schema (`platform` schema)

### `platform.chatbot_sessions`
```sql
id                  UUID PRIMARY KEY
tenant_id           UUID NOT NULL, FK -> platform.tenants(id)
client_ip           VARCHAR(45) NOT NULL
started_at          TIMESTAMPTZ NOT NULL DEFAULT now()
last_message_at     TIMESTAMPTZ NOT NULL DEFAULT now()
conversation_date   DATE NOT NULL          -- tenant-timezone bucket, per-day caps
message_count       SMALLINT NOT NULL DEFAULT 0
status              VARCHAR(10) NOT NULL DEFAULT 'ACTIVE'   -- ACTIVE | CLOSED | CAPPED
UNIQUE (tenant_id, id)                                       -- composite FK target
INDEX (tenant_id, conversation_date)                          -- cap 1: daily/tenant
INDEX (tenant_id, client_ip, conversation_date)                -- cap 2: daily/tenant+IP
INDEX (tenant_id, status, last_message_at)                     -- cap 3: concurrency
INDEX (started_at, last_message_at)                            -- UC-035 retention scan
```

### `platform.chatbot_messages`
```sql
id             UUID PRIMARY KEY
session_id     UUID NOT NULL
tenant_id      UUID NOT NULL, FK -> platform.tenants(id)
role           VARCHAR(9) NOT NULL         -- USER | ASSISTANT
content        TEXT NOT NULL
input_tokens   INTEGER NOT NULL DEFAULT 0
output_tokens  INTEGER NOT NULL DEFAULT 0
model_id       VARCHAR(100) NOT NULL
cost_usd       NUMERIC(12,8) NOT NULL DEFAULT 0, CHECK (cost_usd >= 0)   -- added by 1748400000011
created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
FK (composite) (tenant_id, session_id) -> platform.chatbot_sessions(tenant_id, id)
INDEX (tenant_id, session_id)          -- history reassembly
INDEX (created_at)                     -- global daily-spend breaker's WHERE created_at >= CURRENT_DATE
```

### `platform.chatbot_provider_balance`
```sql
provider          VARCHAR(32) PRIMARY KEY     -- e.g. 'openrouter'
remaining_usd     NUMERIC(10,4) NULL          -- absent until S08's first poll; N/A for Anthropic/OpenAI
checked_at        TIMESTAMPTZ NULL            -- no DEFAULT (would fake a poll on a health-only insert)
last_success_at   TIMESTAMPTZ NULL            -- most recent real complete() success, any tenant
last_failure_at   TIMESTAMPTZ NULL            -- most recent real complete() failure; never set by a cap rejection
```
**Two independent writers, partial-column upsert only** (`repository.upsert(entityLike, ['provider'])` — never `Repository.save()` on a fully-populated entity):
- `remaining_usd`/`checked_at` ← `ChatbotBalancePollTriggerHandler` (S08, every 15 min)
- `last_success_at`/`last_failure_at` ← `SendChatMessageUseCase`'s `provider.complete()` `catch`/success paths (S05/S06), via `recordCallOutcome()`

`recordCallOutcome()` additionally guards against **out-of-order concurrent writes** — each column updates only `WHERE <column> IS NULL OR <column> < EXCLUDED.<column>` (TypeORM `orUpdate()` `overwriteCondition`), so a slow, older write can never clobber a newer one that already landed.

---

## Structural Decisions

### Cost stored per-message at send-time, never reconstructed
`chatbot_messages.cost_usd` is written once, by whichever adapter produced that message — OpenRouter reads its own authoritative `usage.cost`; Anthropic/OpenAI compute it from `input_tokens`/`output_tokens` against a private per-adapter pricing constant (`ANTHROPIC_PRICING`/`OPENAI_PRICING`). No shared `MODEL_PRICING` table. The platform-wide daily-spend breaker is a flat `SUM(cost_usd) WHERE created_at >= CURRENT_DATE` — never a token-count-times-current-rate reconstruction, which would let a same-day pricing-constant change retroactively re-price already-sent messages.

### `ILlmProvider` port — one interface, three billed adapters + one fake
```ts
interface ChatCompletionResult { text: string; inputTokens: number; outputTokens: number; modelId: string; costUsd: Decimal; }
interface ILlmProvider { complete(request: ChatCompletionRequest): Promise<ChatCompletionResult>; }
```
`LlmProviderRegistry` resolves `tenant.settings.chatbot?.llmProvider ?? CHATBOT_LLM_PROVIDER ?? 'openrouter'`; `tenant.settings.chatbot?.llmModel` forwards as `ChatCompletionRequest.model` (`request.model ?? DEFAULT_X_MODEL` in each adapter). `fake` is rejected by `env.validation.ts`'s `validateChatbotConfig()` whenever `APP_ENV !== 'local'` — never reachable in staging/prod, same guard shape as `EMAIL_ADAPTER=mailhog`.

### 10-layer cap enforcement, only 2 platform-wide
Layers 1-8 (`SendChatMessageUseCase`) are per-tenant/per-IP, using `chatbot.constants.ts` defaults overridable via `tenant.settings.chatbot?.X`. Layers 9-10 are flat env vars (`CHATBOT_GLOBAL_DAILY_SPEND_LIMIT_USD`, `CHATBOT_MIN_PROVIDER_BALANCE_USD`) — deliberately **not** `tenants.settings` fields (no tenant can opt out), checked **only on new-session creation**, never on every message of an already-open conversation. All cap/count queries hit Postgres directly — **never** `CachePort` (would undercount independently per Cloud Run replica, turning a platform-wide limit into limit × replica-count).

| # | Layer | Scope | New-session only? |
|---|---|---|---|
| 1 | `maxConversationsPerDay` | tenant | yes |
| 2 | `maxConversationsPerIpPerDay` | tenant+IP | yes |
| 3 | `maxConcurrentConversations` | tenant | yes |
| 4 | `maxMessagesPerConversation` | session | no — `session.messageCount + 2 > max` |
| 5 | `maxMessageLengthChars` | message | no (also re-enforced backend-side, not just BFF Zod) |
| 6 | `maxOutputTokensPerResponse` | LLM call ceiling | no |
| 7 | Per-IP burst throttling | `AppThrottlerGuard` | n/a (BFF-level) |
| 8 | `maxHistoryMessagesSentToLlm` | shaping, not a reject | no |
| 9 | `CHATBOT_GLOBAL_DAILY_SPEND_LIMIT_USD` (default `1`) | platform | yes |
| 10 | `CHATBOT_MIN_PROVIDER_BALANCE_USD` (default `2`) | platform, per resolved provider | yes |

### Provider health — half-open cooldown, not "last event wins"
UC-034 condition (c): unhealthy only if `last_failure_at` is more recent than `last_success_at` **and** within `CHATBOT_PROVIDER_HEALTH_COOLDOWN_MINUTES` (default `5`) of now. A plain "most recent wins" rule was rejected — `available: false` means the widget never renders (UC-034 A1), so a single transient failure with no cooldown would permanently dark the widget with no visitor ever able to produce the success that clears it. Health writes happen **only** in `provider.complete()`'s own `catch`/success paths — never from any of the 8 per-tenant cap-rejection branches, which all throw earlier in `SendChatMessageUseCase`, before that `try` is ever reached.

### LLM call never inside `txManager.run()`
Cross-service network I/O (PR #267 precedent). The session (and, for an existing session, `messageCount`) is persisted via its own `txManager.run()` immediately after cap checks pass and **before** calling the LLM — this narrows the concurrency-cap race back to the accepted DB-round-trip window (fixed during PR #360 review; the original shape didn't persist the session until after the LLM call returned, widening the race to the full LLM-latency window).

### Tracing — ambient span attributes, not a new manual span
`setActiveSpanAttributes()` on the existing request span (`chatbot.session_id`, `chatbot.model_id`, `chatbot.provider`, `chatbot.input_tokens`, `chatbot.output_tokens`, `chatbot.cap_rejected`) — never `startActiveSpan()`, which M17-S33/TD28 already scopes to transport-layer dispatch boundaries only. The outbound LLM HTTP call gets its own auto-instrumented span for free via `@opentelemetry/instrumentation-undici`.

### BFF: no dedicated `.public.controller.ts` file for chatbot
`GET /public/platform/chatbot/status` and `POST /public/platform/chatbot/messages` were added directly to the existing `platform.public.controller.ts` — `docs/24-BFF_ARCHITECTURE.md` allows one `.public.controller.ts` per module family, and no BFF domain nests controllers below its own folder. `chatbot-context.ts`/`chatbot.mapper.ts` are flat sibling files, not a `chatbot/` subfolder.

### BFF business-context fetch: one internal call, not per-field
`getBusinessContext()` calls `backendHttp.get('/internal/tenants/' + tenantId)` (`InternalTenantReadController`, unguarded, already used for slug resolution) exactly once — returns `settings.businessInfo`, `settings.businessHours`, `settings.chatbot.knowledgeText`, and `locale` in one payload. `GET /tenants/settings` (`StaffOrManagerRoleGuard`) is unreachable for a guest and was never a candidate. `chatbot-context.ts` returns raw typed data only; all text formatting (including the hardcoded, non-tenant-editable assistant guardrail text) lives in `chatbot.mapper.ts`'s `buildSystemPrompt()`/`buildAssistantRules()`.

### `PlatformTenantSettingsAdapter` bug (found M19-S10, fixed retroactively for S05/S06)
The port that feeds `RequestContext.settings` for every request (`RequestInterceptor`'s sole production populator) used to reuse `GetTenantByIdUseCase`'s result — correct for the admin `GET /tenants/settings` HTTP response (which must strip Ikaro-only fields like `maxConversationsPerDay`/`llmProvider`), **wrong** for this port's own contract, which every chatbot use case resolves overrides from. Any tenant with a real Ikaro-granted override silently got platform defaults, with no error. Fixed by reading `ITenantRepository` directly instead. Every chatbot integration test up to that point used an in-memory fake for `TENANT_SETTINGS_PORT`, bypassing this exact code path — the bug only surfaced once a real-adapter integration test exercised a configured override.

### Web: client-side session cache, no new backend read endpoint
`sessionId` **and** the full `messages` transcript live in `sessionStorage` (`chatbot-widget-storage.ts`, with an `isStoredChatTurn()` type guard discarding malformed entries) — a page reload restores the visible conversation without a new "get conversation history" backend route. System prompt is rebuilt fresh on every message (not frozen at session start), so a mid-conversation tenant edit (e.g. a price change) shows up in the bot's next answer.

### Fake LLM provider — the only way chatbot E2E exists at all
Playwright has no mocked network layer and `LlmProviderRegistry` only ever offered 3 real, billed adapters. `FakeLlmAdapter` + `CHATBOT_LLM_PROVIDER=fake` (env-guarded to `APP_ENV === 'local'` only) is what makes `chatbot-widget.spec.ts` possible without a real billed call in CI — mirrors the `EMAIL_ADAPTER=mailhog` precedent exactly.

---

## Port + Adapter Summary

| Port | Adapter(s) | What it does |
|---|---|---|
| `ILlmProvider` | `OpenRouterLlmAdapter`, `AnthropicLlmAdapter`, `OpenAiLlmAdapter`, `FakeLlmAdapter` | One chat-completion call, returns text + token counts + `costUsd` |
| `IChatbotSessionRepository` | `TypeOrmChatbotSessionRepository` | Session CRUD + cap-count queries (`countByTenantAndDate`, `countActiveSince`, etc.) |
| `IChatbotMessageRepository` | `TypeOrmChatbotMessageRepository` | Message save + `findRecentBySession()` (SQL `LIMIT`, not fetch-all-then-slice) |
| `IChatbotProviderBalanceRepository` | `TypeOrmChatbotProviderBalanceRepository` | `saveBalance()` (poll writer), `recordCallOutcome()` (health writer, ordering-guarded) |

---

## Error Mapping

| Error code | HTTP status | Trigger |
|---|---|---|
| `PLATFORM_CHATBOT_DAILY_CAP_REACHED` | 429 | Layer 1 |
| `PLATFORM_CHATBOT_CONCURRENCY_CAP_REACHED` | 429 | Layer 3 |
| `PLATFORM_CHATBOT_MESSAGE_CAP_REACHED` | 429 | Layer 4 |
| `PLATFORM_CHATBOT_GLOBAL_SPEND_LIMIT_REACHED` | 429 | Layer 9 |
| `PLATFORM_CHATBOT_PROVIDER_BALANCE_LOW` | 429 | Layer 10 |
| `PLATFORM_CHATBOT_PROVIDER_UNAVAILABLE` | 503 | Real `provider.complete()` failure |
| `PLATFORM_CHATBOT_MESSAGE_TOO_LONG` | 400 | Layer 5 (backend re-check) |
| `PLATFORM_CHATBOT_SESSION_NOT_FOUND` | 404 | Stale/unknown `sessionId` on an existing-session request |
| `PLATFORM_SETTINGS_CHATBOT_KNOWLEDGE_TEXT_TOO_LONG` | 400 | `knowledgeText` exceeds resolved `maxKnowledgeTextLength` |

All 5 cap/backstop codes (429) share one status by deliberate decision (story-discovery, 2026-08-12) — "try again later" applies uniformly to per-tenant volume caps and the 2 platform-wide backstops alike.

---

## Pub/Sub Topics / Scheduler Jobs

| Trigger | Topic | Schedule | Handler |
|---|---|---|---|
| Retention purge (UC-035) | `ikaro-cron-chatbot-retention-purge` | daily `0 3 * * *` | `ChatbotRetentionPurgeTriggerHandler` |
| Balance poll (UC-036) | `ikaro-cron-chatbot-balance-poll` | every 15 min `*/15 * * * *` | `ChatbotBalancePollTriggerHandler` |

Both: local/manual trigger via `POST /cron/chatbot-retention-purge` / `POST /cron/chatbot-balance-poll` (`InternalApiGuard`). Both dispatched through the same `GcpPubSubEventBusAdapter`/`ITriggerBus` mechanism the pre-existing loyalty-expiry cron uses — each has its own dedicated tracing-span regression test (M17-S34 sibling-branch precedent).

---

## Env Vars

| Var | Default | Notes |
|---|---|---|
| `CHATBOT_LLM_PROVIDER` | `openrouter` | `openrouter` \| `anthropic` \| `openai` \| `fake` (local only) |
| `CHATBOT_GLOBAL_DAILY_SPEND_LIMIT_USD` | `1` | Revised down from `25` on 2026-08-18 (M19-S12 discovery); live-drift-corrected in Terraform by M19-S14 on 2026-08-19 |
| `CHATBOT_MIN_PROVIDER_BALANCE_USD` | `2` | |
| `CHATBOT_PROVIDER_HEALTH_COOLDOWN_MINUTES` | `5` | |
| `OPENROUTER_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | — | Secret Manager, `secret_env_vars` on `cloudrun_backend` |
| `OPENROUTER_MANAGEMENT_API_KEY` | — | Distinct credential type from `OPENROUTER_API_KEY` — required by `GET /api/v1/credits`, cannot call chat completions |

---

## Key Config (`tenants.settings.chatbot`)

| Field | Default (unset → `chatbot.constants.ts`) | Tenant-writable via `PATCH /v1/tenants/settings`? |
|---|---|---|
| `knowledgeText` | `""` | yes (only field the schema accepts) |
| `llmProvider` / `llmModel` | `undefined` (falls through to `CHATBOT_LLM_PROVIDER` / adapter default) | no — Ikaro-only |
| `maxConversationsPerDay` = 30, `maxConversationsPerIpPerDay` = 5, `maxConcurrentConversations` = 5, `maxMessagesPerConversation` = 20, `maxMessageLengthChars` = 1000, `maxHistoryMessagesSentToLlm` = 10, `maxOutputTokensPerResponse` = 300, `maxKnowledgeTextLength` = 4000 | see left | no — Ikaro-only |

`TenantSettings.default()` writes only `{ knowledgeText: "" }` for the `chatbot` category — every other field resolves at read time, never written into a tenant's row by default.

---

## Test Infrastructure

See Artifacts table above. All chatbot in-memory repos live in `apps/backend/src/test/repositories/platform/`, builders in `apps/backend/src/test/builders/platform/` — not co-located with the older per-context `src/test/infrastructure/` layout other milestones used.
