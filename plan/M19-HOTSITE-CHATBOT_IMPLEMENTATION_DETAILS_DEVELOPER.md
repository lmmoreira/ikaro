# M19 — Hotsite Chatbot: Implementation Details (Developer)

This document explains every concept, decision, and pattern introduced in M19. It's written so a developer can understand the "why" behind each choice — covering the port+adapter pattern for a swappable LLM provider, multi-layer cost/abuse controls, transaction boundaries around cross-service network I/O, and the cron-job pattern for scheduled maintenance work.

---

## 1. Overview

M19 adds an LLM-backed FAQ chatbot widget to the public hotsite. A visitor on `https://<slug>.ikaro.online` can ask "what are your hours?" or "how much does an interior wash cost?" and get an answer grounded in that tenant's own business data — services, prices, hours, address, and a free-text "knowledge" field the tenant can fill in. The bot is **informational only**: it never books, cancels, or looks at another customer's data. It can't, structurally — the system prompt it's given contains business data only, never write access to anything.

The interesting engineering problem in this milestone isn't the chat UI — it's that every message costs real money (an LLM API call), and a public, unauthenticated endpoint is exactly the kind of surface abuse targets. Most of M19's design is a ten-layer defense against "this either gets abused into a huge bill, or a legitimate spike in visitors takes the whole platform's LLM budget down for everyone."

Three new domain entities, three swappable LLM adapters (plus a fourth for tests), one core use case with the ten cap layers, two cron jobs, new BFF public endpoints, and a hotsite widget component — 14 stories, sequenced backend-foundation → backend-use-cases → BFF → frontend.

---

## 2. The Port+Adapter Pattern for LLM Providers

This is the cleanest illustration of why hexagonal architecture earns its keep in this codebase. The port:

```ts
// application/ports/llm-provider.port.ts
interface ChatTurn { role: 'user' | 'assistant'; content: string; }

interface ChatCompletionRequest {
  systemPrompt: string;
  history: ChatTurn[];
  userMessage: string;
  maxOutputTokens: number;
  model?: string;   // tenant override slot
}

interface ChatCompletionResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  modelId: string;
  costUsd: Decimal;   // never a plain number — float precision loss on dollar amounts
}

interface ILlmProvider {
  complete(request: ChatCompletionRequest): Promise<ChatCompletionResult>;
}
```

Four adapters implement it: `OpenRouterLlmAdapter` (the default — `deepseek/deepseek-v4-flash-0731`, a cheap, "deliberately not smart" FAQ-bot-tier model), `AnthropicLlmAdapter` (`claude-haiku-4-5`), `OpenAiLlmAdapter` (`gpt-5.6-luna`), and `FakeLlmAdapter` (echoes the input back, zero cost, `local`-only — this is the entire reason chatbot E2E tests exist without billing a real API on every CI run).

`LlmProviderRegistry` is a `Map<string, ILlmProvider>` keyed by provider name, resolved as:

```ts
tenant.settings.chatbot?.llmProvider ?? process.env.CHATBOT_LLM_PROVIDER ?? 'openrouter'
```

Adding OpenAI and Anthropic (S03) took zero interface changes — that's the actual payoff of the port existing at all, not a hypothetical one. Each adapter maps its own provider's very different response shape into the same `ChatCompletionResult`.

### The reasoning-tokens trap (OpenRouter)

This is the single most expensive bug this milestone could have shipped with, and it was caught empirically, not by reading the API docs carefully enough:

```ts
// openrouter-llm.adapter.ts
// reasoning.effort must always be sent explicitly as "none" — the API defaults to "high" if
// unset, and reasoning tokens bill as output tokens whether or not they're returned.
```

DeepSeek V4 (and similar reasoning-capable models routed through OpenRouter) can spend its entire output-token budget on invisible "thinking" before ever producing a visible answer — and OpenRouter bills those hidden tokens as regular output tokens. Worse: even `effort: "low"` isn't safe. During the real eval run (`CHATBOT/eval/`, 19 questions), `low` effort consumed the entire response budget on 8 of 19 questions, returning `null` with `finish_reason: "length"` — the bot silently failed to answer 42% of real questions while still being billed. Only `"none"` (confirmed 0 reasoning tokens) avoids both the cost and the failure mode. There's a regression test that fails if this field is ever omitted or defaulted.

A second, later-discovered wrinkle: not every provider OpenRouter can route a model through actually honors `effort: "none"` correctly, even with `provider.require_parameters: true` set. One specific provider was caught burning its whole token budget on hidden reasoning anyway, in production traffic. The fix was an explicit `provider.ignore: [...]` for that one provider — a targeted exclusion, not a general defense, because the general defense had already failed once.

### Anthropic's `thinking` trap — the same bug, different provider

Anthropic's newer models (Opus 5, Sonnet 5, Fable 5) run adaptive "thinking" **on by default** when the `thinking` parameter is omitted — sharing the same `max_tokens` budget as the visible answer, the exact same silent-cost/truncation shape as OpenRouter's reasoning tokens. `AnthropicLlmAdapter` defaults to `claude-haiku-4-5` specifically because Haiku doesn't think unless explicitly enabled — the adapter deliberately leaves `thinking` unset, which is safe *only* because of that model choice. If a tenant's `llmModel` override ever points at one of the thinking-by-default models, this adapter doesn't protect against it — a known, flagged gap for whoever builds tenant-facing model selection later.

---

## 3. Cost Attribution: Store It Once, At Send-Time

Every `chatbot_messages` row carries `cost_usd`. The design that shipped is simpler than the one originally planned, and it's worth understanding why the original plan was wrong.

**Original plan:** a shared `MODEL_PRICING` lookup table; cost computed at *query time* by multiplying stored token counts by the model's current rate.

**What shipped instead:** each adapter computes (or, for OpenRouter, reads) the real cost **once**, at send-time, and stores it directly on the message row.

```ts
// OpenRouter: the API already tells you the real cost
costUsd: new Decimal(response.usage.cost)   // authoritative, provider-confirmed

// Anthropic / OpenAI: neither returns cost, so each adapter computes it
// from its own private pricing constant
function computeCostUsd(inputTokens: number, outputTokens: number): Decimal {
  return new Decimal(inputTokens).div(1_000_000).mul(ANTHROPIC_PRICING.inputPerMillionTokensUsd)
    .plus(new Decimal(outputTokens).div(1_000_000).mul(ANTHROPIC_PRICING.outputPerMillionTokensUsd));
}
```

Why this matters beyond simplicity: if pricing changed mid-day under the "reconstruct at query time" design, *every message sent earlier that same day* would silently get re-priced under the new rate the next time the daily-spend query ran. Storing the real cost once, at the moment it's known, makes the platform-wide spend breaker a flat, cheap aggregate:

```sql
SELECT COALESCE(SUM(cost_usd), 0) AS total_spend_usd
FROM chatbot_messages
WHERE created_at >= CURRENT_DATE;
```

This runs on the hot path (every new-session request, platform-wide) — which is exactly why `chatbot_messages.created_at` has its own index. Without it, this query full-table-scans on every visitor's first message, platform-wide, as the table grows over months.

---

## 4. The Ten Cap Layers

`SendChatMessageUseCase` (UC-033) is the core of this milestone. It's worth walking through in the order the checks actually run, because the ordering itself encodes a decision: cheap, structural checks first; the expensive network call (the LLM) last, and only after every check that could avoid it has already passed.

```
1. maxConversationsPerDay        (new session only, per tenant)
2. maxConversationsPerIpPerDay   (new session only, per tenant+IP)
3. maxConcurrentConversations    (new session only, per tenant)
4. maxMessagesPerConversation    (existing session, per session)
5. maxMessageLengthChars         (every message)
6. maxOutputTokensPerResponse    (hard ceiling passed to the LLM call itself)
7. Per-IP burst throttling       (AppThrottlerGuard, BFF layer)
8. maxHistoryMessagesSentToLlm   (shaping, not a reject — truncates history sent to the LLM)
9. CHATBOT_GLOBAL_DAILY_SPEND_LIMIT_USD   (platform-wide, new session only)
10. CHATBOT_MIN_PROVIDER_BALANCE_USD       (platform-wide, new session only, per resolved provider)
```

Layers 1–3 and 9–10 only fire on a **new** conversation — once a conversation is open, `CHATBOT.md` §8.9 is explicit that it stays bounded by its own per-session caps (layer 4) regardless of what the platform-wide breakers are doing. This was actually implemented wrong once (checking 9-10 on every message) and caught in a PR review — a misreading of the design doc during the story's own discovery session, fixed before merge.

### Why every count is a direct Postgres query, never cached

```ts
// NOT this:
const count = await cache.get(`tenant:${tenantId}:daily-conversations`);

// This:
const count = await sessionRepo.countByTenantAndDate(tenantId, today);
```

Cloud Run can run multiple replicas of the backend simultaneously. A per-instance cache (`CachePort`) would count independently on each replica — a tenant's real limit of "30 conversations/day" silently becomes "30 × however many replicas happen to be running" if each replica thinks it's starting from zero. This is a correctness bug that would only show up under real production load, never in a single-instance local dev environment — exactly the kind of thing worth writing down so nobody reintroduces it later.

### The concurrency-cap race, and why the session gets saved before the LLM call

This is a genuinely subtle one, caught during code review, not story-discovery:

```ts
// send-chat-message.use-case.ts
session.recordMessages(2); // USER + ASSISTANT rows for this turn, recorded as one instant
await this.txManager.run(() => this.sessionRepo.save(session));

const result = await this.completeOrHandleFailure(/* ... */);  // the LLM call — seconds, not ms
```

The first version of this use case didn't persist the session (and its updated `messageCount`) until *after* the LLM call returned. That meant `countActiveSince()` — the query layer 3 (concurrency cap) runs — couldn't see an in-flight conversation for the entire duration of the LLM call, which can take several seconds. A burst of concurrent requests within that window could all pass the concurrency check simultaneously, each thinking it's the only one. The design doc explicitly accepts *a* race window (the size of one DB round-trip, for layers 1–2) — but this bug widened that window from milliseconds to seconds. The fix: reserve the session's row (and the message-count increment for this turn) in its own short transaction, immediately after the cheap checks pass, *before* the network call — narrowing the race back to what was actually intended.

### Never inside `txManager.run()`

This repo has a documented, named incident (PR #267) about exactly this mistake: cross-service network I/O inside a database transaction risks connection-pool exhaustion and couples write durability to an unrelated system's uptime. `SendChatMessageUseCase` structures around it deliberately:

```ts
// 1. Short transaction: reserve the session row
await this.txManager.run(() => this.sessionRepo.save(session));

// 2. Outside any transaction: the actual LLM call (this can take seconds, or fail)
const result = await this.completeOrHandleFailure(/* ... */);

// 3. Short transaction: persist both message rows + the health-outcome write
await this.txManager.run(async () => {
  await this.messageRepo.save(userMessageRow);
  await this.messageRepo.save(assistantMessageRow);
  await this.balanceRepo.recordCallOutcome(resolvedProviderName, 'SUCCESS', new Date());
});
```

Three short, focused operations instead of one long transaction wrapping the whole turn. If the LLM call fails, nothing in the database is left half-written — the reservation from step 1 already committed independently, and step 3 (with a `FAILURE` outcome instead of `SUCCESS`) still runs to record the health signal.

---

## 5. Provider Health: A Half-Open Circuit Breaker, Not "Last Event Wins"

UC-034 (`GetChatbotStatusUseCase`) is the pre-flight check the widget calls before it even renders a chat button — five independent conditions, any one of which makes the whole widget invisible (`available: false`). Four of the five self-heal on a clock with no visitor involvement: the volume caps reset on a rolling window or at UTC midnight, and the balance floor recovers whenever S08's poll (or a manual trigger) next runs. The fifth — "is the resolved provider currently healthy?" — has no independent signal source, which turns out to matter a lot for how it has to be designed.

The naive design ("show unhealthy if the last event for this provider was a failure") has a fatal flaw: if `available: false` means the widget doesn't render at all, then a single transient failure — a momentary network blip, one bad response — permanently darkens the widget. No visitor can ever click a button that isn't there, so no visitor can ever produce the success event that would clear the failure. The bot would be down forever after one hiccup.

The fix is a cooldown — structurally the same idea as a circuit breaker's half-open state:

```
unhealthy = (last_failure_at > last_success_at) AND (now - last_failure_at < COOLDOWN_MINUTES)
```

Once the cooldown window elapses, the widget optimistically shows as available again — giving the *next* real visitor's attempt the chance to either confirm recovery (writes a fresh `last_success_at`) or restart the wait (writes a fresh `last_failure_at`). This is exactly a circuit breaker's half-open state, just without formal state-machine machinery — two timestamp columns and a window comparison get the same behavior.

**Where the health signal comes from** matters just as much as the cooldown logic. It's written as a passive side effect of real chat traffic — inside `SendChatMessageUseCase`'s own `try`/`catch` around `provider.complete()` — never from any of the cap-rejection paths:

```ts
try {
  return await provider.complete({ /* ... */ });
} catch (err) {
  await this.balanceRepo.recordCallOutcome(resolvedProviderName, 'FAILURE', new Date());
  throw new ChatbotProviderUnavailableError(/* generic message — see §7 below */);
}
```

A tenant hitting their own daily cap (layer 1) throws *before* this `try` block is ever reached — it structurally cannot land in this `catch`. This matters: without that separation, one tenant maxing out their own daily limit would flip the availability status dark for every other tenant on the platform, which would be a much worse bug than the one this design prevents.

### Concurrent writes can arrive out of order

Two `recordCallOutcome()` calls can reach Postgres in the opposite order they were issued — a slow FAILURE request's write landing *after* a newer SUCCESS write already committed. A plain upsert would let the older write silently overwrite the newer timestamp, corrupting the cooldown calculation. The real fix uses TypeORM's `orUpdate()` with a conditional `overwriteCondition` per column:

```sql
INSERT INTO chatbot_provider_balance (provider, last_success_at) VALUES ($1, $2)
ON CONFLICT (provider) DO UPDATE SET last_success_at = EXCLUDED.last_success_at
WHERE chatbot_provider_balance.last_success_at IS NULL
   OR chatbot_provider_balance.last_success_at < EXCLUDED.last_success_at
```

Each column only updates if it's never been set or the incoming value is strictly newer — an incoming, already-stale write becomes a no-op instead of corrupting state.

### Two writers, one row, never a full-row save

`chatbot_provider_balance` has exactly one row per provider, and two completely independent processes write to different columns on it: S08's 15-minute balance poll writes `remaining_usd`/`checked_at`; `SendChatMessageUseCase`'s health signal writes `last_success_at`/`last_failure_at`. If either writer used `Repository.save()` on a fully-populated entity instead of a partial-column upsert, it would silently null out the other writer's columns on every write. This is documented three separate times in this codebase (schema doc, IA doc, this doc) because it's exactly the kind of bug that passes every test that doesn't specifically check for it.

---

## 6. Cron Jobs: Mirroring an Existing Pattern, Not Inventing One

Two scheduled jobs — retention purge (daily) and balance poll (every 15 minutes) — and both deliberately copy the shape of the pre-existing loyalty-expiry cron rather than doing anything novel.

**Why Cloud Scheduler → Pub/Sub → HTTP, not `@Cron`:** Cloud Run scales to zero, so an in-process `@Cron` decorator never fires if there's no traffic to keep an instance warm. Multi-instance deployments would also fire an in-process cron on *every* running instance simultaneously — duplicate work, or worse, duplicate side effects. The fix already used elsewhere in this codebase: Cloud Scheduler publishes to a Pub/Sub topic; a push subscription delivers it to the backend's `/pubsub/push` endpoint; a trigger handler processes it. Locally, or for manual ops, the same trigger handler is reachable via a direct HTTP route (`POST /cron/chatbot-retention-purge`, `POST /cron/chatbot-balance-poll`), guarded by `InternalApiGuard` — this is *not* the endpoint Cloud Scheduler calls in production, just a convenience for local dev and manual re-runs.

**Retention purge (UC-035):** deletes `chatbot_messages` rows older than 180 days, then deletes any now-orphaned `chatbot_sessions` rows (zero remaining messages, both timestamps past the same window) — never a session that still has messages, even an old one. Idempotent by construction: running it twice in a row deletes nothing the second time.

**Balance poll (UC-036):** calls OpenRouter's `GET /api/v1/credits` and upserts `remaining_usd`/`checked_at`. On a failed API call, it logs a warning and leaves the existing row untouched — never throws, never crashes the job. Staleness in either direction is acceptable at this cost scale (per `CHATBOT.md` §8.10): a stale "still fine" reading costs a few extra minutes of normal spend; a stale "still broken" reading after a top-up costs a few extra minutes of unnecessary downtime.

This job needed a genuinely new secret partway through implementation, discovered only once the real API was checked: OpenRouter's `/api/v1/credits` requires a **Management (Provisioning) API key** — a distinct credential type from the `OPENROUTER_API_KEY` used for chat completions. Neither key can do the other's job. This is exactly the kind of gap that only shows up when you read the real API reference instead of assuming "we already have an OpenRouter key."

**Both jobs' infra rollout followed the same two-PR-minimum pattern this codebase enforces for a reason (`infra/terraform/README.md`'s PR-sequencing playbook):** `foundation/**` (which grants IAM) can never land in the same PR as the resource it's granting access to, because Foundation's IAM-member resources do a *live* read of the target's current IAM policy — even at `terraform plan` time — which 404s if the target doesn't exist yet in the real cloud project. The topic/scheduler-job PR merges and deploys first; the Foundation IAM grant follows in a second PR once the target is live. Getting this wrong once (M19-S07/PR #365) produced a live deploy deadlock between two separate Terraform states, documented in full as TD39.

---

## 7. Not Leaking Vendor Errors to the Public

One review finding worth understanding, not just fixing: an early version of the 503 response ("provider unavailable") embedded the raw upstream error message — whatever OpenRouter/Anthropic/OpenAI actually returned — directly in the public-facing Problem Details `detail` field. Once a real adapter's error message could contain vendor-specific diagnostic text (rate-limit internals, model-routing details, anything), that became a genuine information-disclosure gap: an anonymous hotsite visitor could see backend diagnostic information that has nothing to do with them.

```ts
// Before: leaks whatever the vendor said
throw new ChatbotProviderUnavailableError(vendorErrorMessage);

// After: fixed, generic public message; real cause logged server-side only
this.logger.error('Chatbot LLM provider call failed', { cause: vendorError, sessionId });
throw new ChatbotProviderUnavailableError();  // no vendor detail in the constructor at all
```

The general lesson: any error message that might eventually wrap a third-party vendor's own error text needs to draw a hard line between "what the operator needs to debug this" (goes to structured logs) and "what a public, unauthenticated caller is allowed to see" (a fixed, generic string). This is easy to get right by default and easy to get wrong by accident once an adapter's real error handling gets fleshed out.

---

## 8. The BFF Layer: Context, Mapper, and One Fewer File Than Planned

The BFF's job here is thin by design: fetch the tenant's business data, build a system prompt from it, forward the chat turn to the backend. Two files do all of it:

**`chatbot-context.ts`** — fetches raw data only, no formatting:
```ts
async function getBusinessContext(tenantId: string) {
  return backendHttp.get<GetTenantByIdUseCaseResult>(`/internal/tenants/${tenantId}`);
  // returns { settings: { businessInfo, businessHours, chatbot: { knowledgeText } }, locale, ... }
}
```

**`chatbot.mapper.ts`** — turns that raw data into a prompt, and owns the one piece of text in this whole milestone that must never become tenant-editable:
```ts
function buildSystemPrompt({ businessInfo, services, knowledgeText, locale }): string {
  return [
    `## Informações do negócio\n${formatBusinessInfo(businessInfo)}`,
    `## Serviços\n${formatServices(services)}`,
    knowledgeText && `## Observações adicionais\n${knowledgeText}`,
    `## Regras do assistente\n${buildAssistantRules(locale)}`,
  ].filter(Boolean).join('\n\n');
}

function buildAssistantRules(locale: string): string {
  // Hardcoded. Security-critical. Never sourced from tenants.settings.chatbot or any
  // admin-editable field. This exact wording passed a 7/7 adversarial eval — changing it
  // requires re-running that eval before shipping, not a casual copy edit.
}
```

Why the split matters: `buildSystemPrompt()` needs to be testable as a pure function (empty knowledge text, missing business fields, services-list formatting, locale substitution — all deterministic, no network I/O in the test). If `chatbot-context.ts`'s fetch functions did their own formatting inline (which an early draft of `CHATBOT.md`'s sample code actually showed), none of that would be unit-testable without mocking HTTP calls. Context fetches, mapper formats — the same "mapper owns shaping, context owns fetching" split `docs/24-BFF_ARCHITECTURE.md` already establishes for every other BFF domain.

The system prompt is rebuilt **fresh on every message**, not cached at session start. If a tenant edits a price mid-conversation, the bot's very next answer reflects it — no stale-prompt bug, at the cost of one extra internal HTTP call per message (acceptable, since it's an internal call, not a billed external one).

### One controller, not two

The story as originally drafted planned a nested `public/chatbot.public.controller.ts` — a new file, a new subfolder. What shipped instead: `GET /public/platform/chatbot/status` and `POST /public/platform/chatbot/messages` were added directly to the *existing* `platform.public.controller.ts`. This BFF architecture allows exactly one `.public.controller.ts` per domain family, serving every module type under it — chatbot didn't need its own.

### The bug that silently defaulted every tenant's overrides

Worth calling out on its own, because it's a good example of a bug that every existing test suite was structurally blind to. `PlatformTenantSettingsAdapter` is the single production code path that populates `RequestContext.settings` for every guest request — every chatbot use case reads a tenant's overrides (`llmProvider`, caps, everything) through it. It was built by reusing `GetTenantByIdUseCase`'s result, which is *correct* for that use case's other caller (the admin-facing `GET /tenants/settings` endpoint, which must strip Ikaro-only fields like `maxConversationsPerDay` before returning them to a tenant) — and *silently wrong* for this port's contract, which needs the *unstripped* values.

Every chatbot integration test up to that point swapped in an in-memory fake for the tenant-settings port, which bypassed this adapter entirely — so the bug shipped, merged, and sat in production for two stories (S05, S06) before a *third* story's integration test happened to be the first one to exercise the real adapter against a tenant with an actual configured override. The fix — read `ITenantRepository` directly instead of reusing the admin-projected use case — is a small diff. The lesson is bigger: a port with two different callers that need two different views of the same underlying data can't safely share one implementation between them, even when reusing looks like the DRY thing to do.

---

## 9. The Frontend Widget: Three States, One Component

`ChatbotWidget.tsx` covers exactly three states, matched to the validated UX prototype:

1. **Not available** — renders nothing at all. A pre-flight `GET /public/platform/chatbot/status` call on mount decides this before any chat UI is ever shown. The design principle here: a visitor should never see a chat button that then fails when clicked — if the bot can't actually respond right now, there's no button.
2. **Active chat** — the real conversation, in `bubble` (floating, fixed-position) or `inline` (embedded in page flow) variant.
3. **Interrupted** — a cap was hit or a call failed mid-conversation. Input disables; the tenant's phone/WhatsApp (already resolved onto the hotsite manifest) is offered as a fallback contact.

### Session persistence without a new backend endpoint

Both the `sessionId` and the full visible `messages` transcript live in `sessionStorage`:

```ts
// chatbot-widget-storage.ts
function isStoredChatTurn(value: unknown): value is ChatTurn {
  // discards a malformed entry instead of letting it reach JSX and crash the widget
}
```

A page reload restores the visible conversation client-side — no new "fetch conversation history" backend route was needed, which kept this story frontend-scoped. The type guard matters because `sessionStorage` content is just a string a browser extension, a previous app version, or manual tampering could have corrupted; trusting "syntactically valid JSON" without shape-checking it was an actual review finding, not a hypothetical one.

### No divider next to a `position: fixed` widget

Every other hotsite module gets a visual divider rendered before/after it in `page.tsx`'s render loop. The `bubble` variant of the chatbot widget is `position: fixed` — outside normal document flow — so a generic divider next to it would render as a stray orphaned line with nothing on either side of it. `CHATBOT` gets the same no-divider special case `FOOTER` already had. The first version of this fix only checked the *current* module being rendered; a module immediately *after* `CHATBOT` (e.g. `HERO → CHATBOT → CONTACT`) still incorrectly rendered its own leading divider, because the check needed to look at the *previous* module's type too, not just the current one — fixed by extracting a small `shouldSkipDivider(index, type, previousType)` helper that checks both.

### The fake LLM provider — the only reason E2E coverage exists

Playwright drives a real, running backend/BFF stack with no mocked network layer. Before this milestone, `LlmProviderRegistry` only ever offered three real, billed adapters — meaningless for CI. `FakeLlmAdapter` plus `CHATBOT_LLM_PROVIDER=fake` (set only in the E2E environment, and rejected by a Zod refinement whenever `APP_ENV !== 'local'`) is what makes a real widget → BFF → backend → adapter round trip possible in CI without ever billing a real API call. This mirrors an existing precedent in the codebase exactly: `EMAIL_ADAPTER=mailhog` does the same job for notification email in local/E2E.

### Registering a brand-new module type touches more layers than it looks like

Adding `'CHATBOT'` to `HotsiteModuleType` looked like a one-file change and wasn't. The full list of places a new module type has to be registered before it actually works end-to-end, discovered incrementally across three stories (S11, S12, and a same-story fix):

- `packages/types/src/hotsite.ts` — the type union itself
- `apps/web/features/platform/hotsite/module-schemas.ts` — a Zod schema in `MODULE_DATA_SCHEMAS`, or `isValidModuleData()` silently accepts any malformed payload for the new type
- `packages/validation/src/hotsite.ts` — the *shared* Zod enum the BFF's `PATCH /v1/tenants/hotsite` body schema uses
- `apps/backend/src/contexts/platform/domain/hotsite-config.aggregate.ts` — the backend aggregate's own independent module-type union/set, enforced in `validateLayout()`
- `apps/web/features/platform/hotsite/default-layout.ts` — `MODULE_ORDER` (or the Layout tab never shows a row for it) and `DEFAULT_MODULE_DATA` (or the Manifesto tab's cap/validation, both derived from `MODULE_ORDER.length`, keeps rejecting it)

Two of these (the backend aggregate's own type set, and `default-layout.ts`) were each discovered only when a real end-to-end test tried to actually persist a `CHATBOT` module and got rejected — not caught by story-discovery reading the docs, because nothing in the docs cross-referenced all five call sites in one place. This doc is that cross-reference, for the next new module type.

---

## 10. Testing Strategy

**Backend unit tests** use `FakeLlmProviderBuilder` (`withText()`/`withInputTokens()`/`withOutputTokens()`/`withCostUsd()`/`build()`) — deterministic, zero network calls, ever, in any automated test. Every adapter's own unit tests stub the HTTP layer directly rather than hitting a real API.

**Backend integration tests** run against a real Postgres test database (testcontainers) with only the LLM call itself stubbed — proving the cap-counting SQL, the transaction boundaries, and the composite-FK tenant isolation for real, not against an in-memory fake that can silently diverge from what Postgres actually enforces (this is exactly how the `PlatformTenantSettingsAdapter` bug in §8 escaped detection for two stories).

**E2E** (`apps/web/e2e/chatbot-widget.spec.ts`) drives a real browser against the real running stack, with `CHATBOT_LLM_PROVIDER=fake` — the only way a genuine widget → BFF → backend → adapter round trip is possible without a billed API call in CI.

---

## 11. Infra: Secrets, Topics, and a Lesson About Stale Values

Provisioning followed this codebase's established Terraform sequencing rules throughout — never mixing `foundation/**` with any other `infra/terraform/**` path in the same PR (a live IAM-policy read at `plan` time 404s against a target that doesn't exist yet), and treating a new secret's real-value population as its own explicit, ordered step rather than an assumption.

Four Secret Manager containers (`openrouter-api-key`, `anthropic-api-key`, `openai-api-key`, `openrouter-management-api-key`), two Pub/Sub topics, two Cloud Scheduler jobs, and four env vars ended up wired in progressively — mostly pulled forward into earlier stories (S02, S06, S07, S08) rather than deferred to a dedicated infra story at the end, because each one turned out to be a hard prerequisite for the story that needed it to actually run, not genuinely deferrable.

**The milestone's last story ended up being a one-line value fix, not new infra work — and it's worth understanding how that drift happened.** `CHATBOT_GLOBAL_DAILY_SPEND_LIMIT_USD`'s default was deliberately lowered from `25` to `1` during a later story's discovery session (M19-S12, 2026-08-18) — a documented, conscious decision, not a bug fix. But that decision only updated the *documentation* (`docs/discovery/CHATBOT/CHATBOT.md` §9) and the *application-level Zod default* (`env.validation.ts`'s `.default(1)`, which only matters when the env var is genuinely unset). It never touched the two Terraform files that had already set the variable *explicitly* to `25` weeks earlier. An explicit Terraform value always wins over an application-level default — so the real, live circuit breaker stayed at 25× looser than the team believed it to be, in both staging and production, for a full day, until the discrepancy was caught (M19-S14) by cross-checking the plan file's own text against a live `gcloud run services describe` call rather than trusting either the docs or the code in isolation. Neither the docs nor the app-level default were wrong — they just weren't the whole picture, and nothing forced anyone to check the third place the same fact lived.

The general lesson: a value with a documented default, an application-level default, *and* an infra-level override needs all three kept in sync by hand — there's no single source of truth once a real value lives in three files, and a change to one doesn't propagate to the others automatically.
