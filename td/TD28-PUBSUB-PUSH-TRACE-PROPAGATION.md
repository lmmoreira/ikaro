# TD28 — Distributed Trace Propagation Through Pub/Sub Push Delivery

## Status
- **State**: Open — not yet scoped into stories, design sketch only
- **Type**: Observability / Architecture
- **Priority**: Low-Medium — no incident, nothing broken; a completeness gap in distributed tracing, not a correctness bug. Backend/BFF logs are already correlated across this same boundary via `correlationId` (a separate, already-working mechanism) — this TD is about getting a genuine linked trace *tree* (span timing, per-hop latency) in Cloud Trace, not restoring lost debuggability.
- **Context**: `shared` (event-bus infrastructure) — `apps/backend/src/shared/infrastructure/event-bus/gcp-pubsub-event-bus.adapter.ts`, `apps/backend/src/shared/infrastructure/event-bus/pubsub-push.controller.ts`, `apps/backend/src/shared/guards/pubsub-push.guard.ts`, `packages/observability` (`ITracingPort`/`otel-tracing.ts`), `shared/domain/envelope.ts`
- **Created**: 2026-07-21
- **Found during**: M17-S33 (OTel SDK bootstrap) security-review follow-up discussion — asked whether tracing extends web → backend → Pub/Sub. Investigation found BFF↔backend HTTP calls already link correctly via auto-instrumentation, but the trace breaks completely at any Pub/Sub hop.

---

## Problem

M17-S33 wired OTel auto-instrumentation (`@opentelemetry/instrumentation-http`) into both backend and BFF. Because both ends of a BFF→backend call are instrumented, W3C trace context (`traceparent`) propagates automatically over that HTTP hop — a request that enters the BFF and triggers a backend call already shows up as **one continuous trace** in Cloud Trace today, with `tenant.id`/`correlation.id` span attributes on both sides.

That continuity **does not extend through Pub/Sub**. A domain event published as part of handling a request (e.g. `BookingApproved` → a notification handler sending an email) currently produces no linked span at all for the consumer side — either no span (see below) or a disconnected new root, never a child of the original request's trace. There is no way to look at one trace in Cloud Trace and see "this HTTP request → this event publish → this async handler processing it, with per-hop timing."

This is not automatic because W3C trace context is designed to travel as an **HTTP header**. Pub/Sub push delivery POSTs a JSON body shaped like:

```json
{ "message": { "data": "...", "attributes": {...}, "messageId": "...", "publishTime": "..." }, "subscription": "..." }
```

`traceparent`, if it exists at all, would have to live inside `message.attributes` — inside the JSON *body*. Generic HTTP instrumentation only auto-extracts context from incoming *headers*, so it cannot see anything placed in a Pub/Sub message attribute. Nothing wires this up today.

Compounding this: `otel-tracing.ts`'s `ignoreIncomingRequestHook` currently excludes `/pubsub/push` from tracing entirely (grouped with `/health/*` as noise) — so right now there is no span produced for a push delivery at all, correct or otherwise.

---

## Investigation — verified facts (2026-07-21, M17-S33 branch)

1. **`ignoreIncomingRequestHook`** (`packages/observability/src/otel-tracing.ts`) excludes both `req.url?.startsWith('/health/')` and `req.url?.startsWith('/pubsub/push')` from ever getting a span. The health exclusion is correct (pure liveness/readiness noise). The `/pubsub/push` exclusion needs reconsidering as part of this TD — it currently throws away exactly the span this TD wants to create.

2. **Publish side** — `GcpPubSubEventBusAdapter.publish()` (`apps/backend/src/shared/infrastructure/event-bus/gcp-pubsub-event-bus.adapter.ts`) is the single call site where a message actually goes to Pub/Sub (`topic.publishMessage()`). This is where trace context would need to be serialized into the message's `attributes` map via `propagation.inject(context.active(), attributesCarrier)`.

3. **Push-receive side** — `PubSubPushController` (`apps/backend/src/shared/infrastructure/event-bus/pubsub-push.controller.ts`) and `PubSubPushGuard` (`apps/backend/src/shared/guards/pubsub-push.guard.ts`) are where the push body arrives and gets validated (OIDC token check) before dispatch. This is where `propagation.extract(ROOT_CONTEXT, carrier)` would need to run against `message.attributes`, and where the reconstructed `Context` would need to wrap whatever handles the actual message (`context.with(extracted, () => ...)`).

4. **The transactional outbox (TD24) makes "inject whatever's active right now" ambiguous — the core design problem.** Per TD24, a domain event's actual `eventBus.publish()` call (i.e. the real Pub/Sub API call inside `GcpPubSubEventBusAdapter`) happens in one of two ways:
   - **Inline dispatch** — same request, shortly after the business transaction commits. The original request's span genuinely *is* still active at `publish()` time. Injecting `context.active()` here is correct.
   - **Swept dispatch** — `OutboxRelayService`'s scheduled sweep (a separate cron-triggered request, potentially minutes later) picks up an unpublished row and calls `publish()` itself. At that moment, `context.active()` is the **sweep's own** trace context, not the original business request that created the event. Naively injecting "whatever's active" would link the consumer span to the sweep's trace instead of the real originating request — wrong, and arguably worse than no link at all (looks connected, isn't).

   Getting the swept case right requires persisting the *original* trace context (e.g. `traceId`/`spanId`, or a serialized carrier) alongside the outbox row/`Envelope` at the point the event is first created — not at actual-publish time — then re-injecting from that stored value when `OutboxRelayService` eventually calls `publish()`. This is a real schema/`Envelope` change (`shared/domain/envelope.ts`), not just a code change at the two boundary points.

5. **`Envelope`** (`shared/domain/envelope.ts`) is the base class every published `DomainEvent`/`Command` extends — already carries `eventId`, `tenantId`, `occurredAt`, `correlationId`, `eventName`, `eventVersion`. It does not currently carry any trace-context fields. If full (inline + swept) correctness is in scope, this is the natural place to add them.

6. **`ITracingPort`/`OtelTracingAdapter`** (`packages/observability`, this same M17-S33 branch) is the existing port over `@opentelemetry/api`, plus a repo-wide ESLint rule confining raw `@opentelemetry/*` imports to `packages/observability`. `GcpPubSubEventBusAdapter` and `PubSubPushController` both live in `apps/backend`, outside that boundary — so this work needs either (a) `ITracingPort` extended with `injectContext`/`extractContext` methods, or (b) an ESLint exception for these two files specifically, on the reasoning that they're already blessed infrastructure adapters importing `@google-cloud/pubsub` directly (the existing D9 guardrail precedent: "the Pub/Sub and GCS adapters are the only existing cases" allowed to import vendor SDKs directly). Not yet decided — see Open Decisions.

---

## Open Decisions (resolve at story-discovery time — none of these are settled yet)

| # | Question | Cheaper option | Fuller option |
|---|---|---|---|
| 1 | **Scope** | Inline-dispatch only — correct linkage for the common/fast path, explicitly document "swept/async-dispatched events link to the sweep's trace, not the original request" as a known limitation. No `Envelope`/schema change. | Full correctness — persist trace context on the outbox row/`Envelope` at event-creation time, re-inject at actual-publish time regardless of dispatch path. Requires an `Envelope` field + outbox column + `OutboxRelayService` changes. |
| 2 | **Where inject/extract calls live** | ESLint exception for `gcp-pubsub-event-bus.adapter.ts` and `pubsub-push.controller.ts` to import `@opentelemetry/api` directly (matches the existing `@google-cloud/pubsub` adapter-exception precedent). | Extend `ITracingPort` with `injectContext(carrier)`/`extractContext(carrier)`, keep the "no raw OTel imports outside `packages/observability`" rule with zero exceptions. |
| 3 | **`/pubsub/push` span exclusion** | Remove the exclusion entirely — every push delivery gets a real span, same as any other HTTP endpoint. | Keep the exclusion (avoid a span for the guard/parsing layer itself) but wrap just the actual message-dispatch logic in a manually-created span using the extracted context. |
| 4 | **Trace volume/cost** | N/A — needs a number. Prod sampling is 10% (D12 budget target); estimate added span volume from un-excluding `/pubsub/push` before deciding whether sampling needs adjusting for this path specifically. | |

---

## Design (sketch — to be finalized once Open Decisions are resolved)

**Publish side** (`GcpPubSubEventBusAdapter.publish()`):
```ts
const carrier: Record<string, string> = {};
propagation.inject(context.active(), carrier); // or context reconstructed from a stored Envelope field, if scope #1 goes with the fuller option
await topic.publishMessage({ data: ..., attributes: { ...existingAttributes, ...carrier } });
```

**Push-receive side** (`PubSubPushController`, after OIDC validation):
```ts
const extractedContext = propagation.extract(ROOT_CONTEXT, req.body.message.attributes);
await context.with(extractedContext, () => dispatchMessage(req.body.message));
```

**If scope decision #1 goes with the fuller option** — `Envelope` gains a field (e.g. `traceContext?: Record<string, string>`) populated at event-creation time (wherever `Envelope`'s constructor runs, before the aggregate's `save()` drains it to the outbox), stored on the outbox row, and read back by `OutboxRelayService` to re-inject at actual-publish time instead of using `context.active()`.

---

## Non-Goals

- **Manual business spans inside use cases** — explicitly deferred by M17-S33 itself ("Manual business spans... explicitly deferred until debugging actually demands that level of granularity"); this TD doesn't reopen that.
- **Pull-mode Pub/Sub tracing** — this codebase uses push delivery exclusively in cloud environments (D2, `plan/M17-CLOUD-DEPLOY.md`); pull-mode-specific instrumentation packages (`@opentelemetry/instrumentation-google-cloud-pubsub` or similar) are not relevant here.
- **Web/frontend trace propagation** — D9 already explicitly excludes `apps/web` from OTel at launch ("web ships no OTel at launch — its observability is Cloud Run built-in metrics + structured logs"). A trace can only start where instrumentation exists; today that's the BFF. Extending tracing into the browser is a separate, larger decision this TD does not revisit.
- **Cron trigger channel tracing** (`ITriggerBus`/`/cron/*`) — triggers are not domain events (D3) and carry no real per-tenant business context; not addressed here unless a future need surfaces.

---

## Draft Acceptance Criteria (refine during story-discovery)

- [ ] A domain event published via **inline dispatch** produces a consumer-side span that is a genuine child of the original HTTP request's trace, visible as one connected trace in Cloud Trace.
- [ ] `/pubsub/push` is no longer blanket-excluded from tracing (per whichever Open Decision #3 option is chosen).
- [ ] Query-string/attribute redaction (`otel-query-redaction.ts`'s `SENSITIVE_QUERY_PARAMS`) is reconsidered for Pub/Sub message attributes too, if any published event payload could ever carry something sensitive as an attribute (not currently the case, but worth an explicit check before shipping).
- [ ] Tests prove inject→extract actually links contexts correctly, using a real span/context-manager setup (same pattern as `packages/observability/src/otel-tracing-adapter.spec.ts` — `AsyncHooksContextManager` + `InMemorySpanExporter`, not a trust-it-works assertion).
- [ ] If the fuller (Open Decision #1) scope is chosen: `Envelope` change registered in `integration-global-setup.ts`/wherever else new fields on shared entities need registration, per the repo's standard migration/entity checklist.
- [ ] `docs/10-OBSERVABILITY_STRATEGY.md` updated to document the propagation mechanism and its scope (inline-only vs. full) once built.

---

## Estimate

Sized as **M complexity**, not a quick add — comparable to a small-to-medium M17 story. The inline-only (cheaper) scope is roughly half a day of focused work including proper tests; the fuller scope (correct linkage across swept/async dispatch too) is more, given the `Envelope`/outbox schema change and `OutboxRelayService` changes it requires. Run `/story-discovery` against whichever scope is chosen before implementation, per this repo's standard workflow.
