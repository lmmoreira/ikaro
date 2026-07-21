# TD28 — Distributed Trace Propagation Through Pub/Sub Push Delivery

## Status
- **State**: Ready for implementation — scope and design finalized via `/story-discovery` (2026-07-21), see resolved Open Decisions and Design sections below
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

## Open Decisions — resolved at story-discovery (2026-07-21)

| # | Question | Decision |
|---|---|---|
| 1 | **Scope** | **Full correctness.** Persist trace context on the outbox row at event-creation time, re-inject at actual-publish time regardless of dispatch path (inline or swept). Correction from the original framing: this does **not** require a migration or a new outbox column — `shared.outbox.payload` is already `jsonb`, storing `JSON.stringify(event)` verbatim (`typeorm-outbox.repository.ts:95`), so a new field on `Envelope` is captured automatically. |
| 2 | **Where inject/extract calls live** | **Extend `ITracingPort`** with `injectContext(carrier)` / `runWithExtractedContext(carrier, fn)`. The ESLint-exception alternative was based on a precedent that doesn't actually exist — checked `apps/backend/eslint.config.js`, `apps/bff/eslint.config.js`, `packages/config/eslint-base.js`, `docs/ENGINEERING_RULES.md`, `docs/AGENT_PATTERNS.md`: there is no existing file-specific carve-out for any adapter to import a raw vendor SDK, and no ban on `@google-cloud/*` imports to begin with (only `@opentelemetry/*` is restricted). With the chosen design (see below), neither `gcp-pubsub-event-bus.adapter.ts` nor `pubsub-push.controller.ts` ends up needing a raw `@opentelemetry/api` import at all — both call `ITracingPort` methods only. |
| 3 | **`/pubsub/push` span exclusion** | **Remove entirely.** Every push delivery gets a real span like any other HTTP endpoint. Production sampling stays at the existing 10% (D12), bounding volume growth. |
| 4 | **Trace volume/cost** | **Accept default sampling, monitor post-deploy.** No pre-emptive sampling change; revisit only if Cloud Trace volume proves to be a problem after this ships. |

---

## Design (finalized at story-discovery, 2026-07-21)

**Why capture at `OutboxPublisher.publish()`, not at `Envelope` construction or at actual-publish time:** aggregate methods construct these events and are domain layer (`domain/` — zero framework deps per CLAUDE.md §7), so they can't call `ITracingPort` themselves. `OutboxPublisher.publish()` (`outbox-publisher.ts`, infrastructure layer) is the one method every event passes through before entering `shared.outbox` — whether drained from an aggregate via `drainDomainEvents()` or published directly by a cron job/consumer re-emit — so capturing there, once, covers every path with a single change site and needs no change to `drain-domain-events.ts` itself.

1. **`ITracingPort`** (`packages/observability/src/tracing-port.ts`) gains two methods:
   ```ts
   injectContext(carrier: Record<string, string>): void;
   runWithExtractedContext<T>(carrier: Record<string, string>, fn: () => T): T;
   ```
   `OtelTracingAdapter` implements them with `propagation.inject(context.active(), carrier)` and `context.with(propagation.extract(ROOT_CONTEXT, carrier), fn)` respectively — both OTel-specific calls stay inside `packages/observability`, same as every other `ITracingPort` method.

2. **`Envelope`** (`shared/domain/envelope.ts`) gains one new field, not `readonly` (the rest of the class's fields are — this one is set after construction):
   ```ts
   traceContext?: Record<string, string>;
   ```
   Plain data, no framework dependency — domain-layer purity is preserved.

3. **`OutboxPublisher.publish()`** (`outbox-publisher.ts`) — immediately before `outboxRepo.insert(event, dedupKey)`:
   ```ts
   const carrier: Record<string, string> = {};
   this.tracingPort.injectContext(carrier);
   event.traceContext = carrier;
   ```
   `tracingPort: ITracingPort = defaultTracingPort` as a constructor parameter with `@Optional()` — same NestJS-DI-managed-with-default pattern as `CorrelationMiddleware`/`RequestInterceptor` (`docs/ENGINEERING_RULES.md`'s port-wiring rule).

4. **No outbox column, no migration.** `TypeOrmOutboxRepository.insert()` already does `JSON.stringify(event)` into the `jsonb payload` column (`typeorm-outbox.repository.ts:95`) — `traceContext` rides along automatically, for both the inline-dispatch row (`OutboxPublisher`'s own `scheduleAfterCommit` → `OutboxRelayService.publishAndMarkOne()`) and the swept row (`OutboxRelayService.sweep()`). Both already deserialize via `asStoredEvent(row.payload)` before calling `eventBus.publish(event)`.

5. **Publish side** (`GcpPubSubEventBusAdapter.publish()`) — no OTel API call needed at all, just forwards the already-captured carrier:
   ```ts
   await topic.publishMessage({
     data: ...,
     attributes: { ...existingAttributes, ...(event.traceContext ?? {}) },
   });
   ```

6. **Push-receive side** (`PubSubPushController`, after OIDC validation):
   ```ts
   await this.tracingPort.runWithExtractedContext(
     req.body.message.attributes,
     () => dispatchMessage(req.body.message),
   );
   ```

7. **`ignoreIncomingRequestHook`** (`packages/observability/src/otel-tracing.ts`) drops the `/pubsub/push` branch entirely — only the `/health/` exclusion remains.

8. **`RequestInterceptor`'s global tenant-header check** (`apps/backend/src/shared/request/request.interceptor.ts`) needs `/pubsub` added to its `/health`/`/internal`/`/cron` bypass list (found in PR review, 2026-07-21) — Pub/Sub push delivery never sends `X-Tenant-ID`, so without this, every request to `/pubsub/push` 400s before `PubSubPushController` is ever reached, making all of this TD's code unreachable in the real deployed pipeline. Pre-existing gap (unrelated to this TD's own design), but blocking for it to run end-to-end.

9. **An explicit consumer span** — `GcpPubSubEventBusAdapter.dispatchPushMessage()` wraps the domain-event handler call in `this.tracingPort.startActiveSpan(`pubsub.event.${eventName}`, () => config.handler(event))` (found in PR review, 2026-07-21). Without this, `runWithExtractedContext` correctly makes the extracted context active but nothing marks "this is where the Pub/Sub consumer's processing began" — only whatever auto-instrumented I/O the handler happens to trigger would show up, with no span identifying the hop itself, missing this TD's own stated "per-hop timing" goal. `ITracingPort` gains a third method for this:
   ```ts
   startActiveSpan<T>(name: string, fn: () => T): T;
   ```
   This is a transport-layer span at the dispatch boundary, not a manual business span inside a use case — it doesn't reopen the M17-S33/Non-Goals deferral below. Scoped to the domain-event path only, not the trigger path (§Non-Goals: cron triggers).

10. **Pull-mode symmetry** (full-solution follow-up, 2026-07-21) — `dispatch()` (`GcpPubSubEventBusAdapter`, the streaming-pull message handler used when `PUBSUB_CONSUMER_MODE=pull`) gets the identical treatment as `dispatchPushMessage()`:
    ```ts
    await this.tracingPort.runWithExtractedContext(message.attributes ?? {}, () =>
      this.tracingPort.startActiveSpan(`pubsub.event.${eventName}`, () => handler(event)),
    );
    ```
    The pull-mode `Message` object already carries `.attributes` in the identical shape to the push body's `message.attributes` (both originate from the same Pub/Sub message envelope) — no new plumbing needed, just the same wrapping. Scoped to `dispatch()` only, not `dispatchTrigger()` (§Non-Goals: cron triggers) or `publishToDlq()` (a republish, not a consumer dispatch — out of scope for this TD).

---

## Non-Goals

- **Manual business spans inside use cases** — explicitly deferred by M17-S33 itself ("Manual business spans... explicitly deferred until debugging actually demands that level of granularity"); this TD doesn't reopen that.
- ~~Pull-mode Pub/Sub tracing~~ — **no longer a Non-Goal** (added, 2026-07-21, full-solution follow-up): `dispatch()` (the streaming-pull path, `GcpPubSubEventBusAdapter`) now extracts/wraps identically to `dispatchPushMessage()` — see Design item 10. Kept as a documented decision only for what's still genuinely out of scope: instrumenting the `@google-cloud/pubsub` client library's own streaming-pull internals (e.g. via `@opentelemetry/instrumentation-google-cloud-pubsub`) — this TD only wraps *this codebase's* message-handling call, not the vendor SDK's subscription machinery. Pull mode itself is still not used in cloud deployment (D2) — this closes the gap for local dev/testing, where it's the default consumer mode.
- **Web/frontend trace propagation** — D9 already explicitly excludes `apps/web` from OTel at launch ("web ships no OTel at launch — its observability is Cloud Run built-in metrics + structured logs"). A trace can only start where instrumentation exists; today that's the BFF. Extending tracing into the browser is a separate, larger decision this TD does not revisit.
- **Cron trigger channel tracing** (`ITriggerBus`/`/cron/*`) — triggers are not domain events (D3) and carry no real per-tenant business context; not addressed here unless a future need surfaces.

---

## Acceptance Criteria

- [ ] A domain event published via **inline dispatch** produces a consumer-side span that is a genuine child of the original HTTP request's trace, visible as one connected trace in Cloud Trace **when that trace is sampled** — production keeps its existing 10% head-based sampling (§Open Decision #4), so an unsampled request's downstream event never gets a Cloud Trace entry to link to regardless of this TD; linkage tests use an always-on setup (`BasicTracerProvider` + `SimpleSpanProcessor`, no sampler in the loop) so the assertion is deterministic rather than sampling-dependent.
- [ ] A domain event published via the **swept/scheduled dispatch** path (`OutboxRelayService.sweep()`) produces a consumer-side span that is a genuine child of the *original* HTTP request's trace, not the sweep's own trace — proving the stored `traceContext` on the outbox row, not `context.active()` at actual-publish time, is what gets used.
- [ ] `/pubsub/push` is no longer blanket-excluded from tracing — `ignoreIncomingRequestHook` only excludes `/health/`.
- [ ] Query-string/attribute redaction (`otel-query-redaction.ts`'s `SENSITIVE_QUERY_PARAMS`) is reconsidered for Pub/Sub message attributes too — checked at story time: no published event payload currently carries anything secret as a message attribute (only `traceContext`, `correlationId`, `tenantId`), so no redaction gap exists today; re-verify if a future event adds one.
- [ ] Tests prove inject→extract actually links contexts correctly, using a real span/context-manager setup (same pattern as `packages/observability/src/otel-tracing-adapter.spec.ts` — `AsyncHooksContextManager` + `InMemorySpanExporter` from `@opentelemetry/sdk-trace-base`, not a trust-it-works assertion).
- [ ] `RequestInterceptor` bypasses `/pubsub` — a request to `/pubsub/push` with no `X-Tenant-ID` header reaches `PubSubPushController`, not a 400.
- [ ] `dispatchPushMessage()` starts an explicit `pubsub.event.<eventName>` span (via `ITracingPort.startActiveSpan`) as a child of the extracted context, for the domain-event path only — not the trigger path.
- [ ] `dispatch()` (pull mode) extracts trace context from `message.attributes` and starts the identical `pubsub.event.<eventName>` span, so a pull-mode consumer's processing links to the original request's trace exactly like push mode does.
- [ ] `docs/10-OBSERVABILITY_STRATEGY.md` updated to document the propagation mechanism (full inline + swept correctness) and to correct its "Full Telemetry Flow" diagram, which currently describes this as already working.

---

## Estimate

Sized as **S-M complexity** — smaller than originally estimated. Story-discovery (2026-07-21) found the full-correctness scope does **not** require an `Envelope`/outbox schema change or migration (§Open Decision #1) — `shared.outbox.payload` is already `jsonb`, so a new `Envelope.traceContext` field is captured automatically. The actual work is: 2 new `ITracingPort` methods + adapter implementation, one field on `Envelope`, one call site in `OutboxPublisher.publish()`, the publish-side attribute copy in `GcpPubSubEventBusAdapter`, the extract-and-wrap in `PubSubPushController`, removing the `/pubsub/push` tracing exclusion, and tests per the `otel-tracing-adapter.spec.ts` pattern covering both inline and swept dispatch linkage.
