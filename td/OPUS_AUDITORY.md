# OPUS_AUDITORY.md — Senior Engineering Audit of Ikaro

> **Reviewer:** Opus 4.8, acting as a senior engineer (Node/NestJS, DDD, concurrency, security, distributed systems).
> **Date:** 2026-06-21
> **Scope:** `apps/backend`, `apps/bff`, `apps/web`, `packages/*` — ~921 TS files, ~72k LOC.
> **Method:** Structural read of the hexagonal core (aggregates, use cases, ports/adapters, repositories), the transaction + event infrastructure, the BFF auth/trust boundary, and the web security surface. Findings cite `file:line` evidence.

This document is intentionally direct. The codebase is **above the bar for most SaaS at this stage** — the architecture is genuinely good. The findings below are where a globally-scaled, high-load deployment will hurt if not addressed, ordered by impact.

---

## 1. Executive Summary

| Dimension | Rating | One-line verdict |
|---|---|---|
| Architecture & DDD | 🟢 Strong | Clean hexagonal layering, real aggregates, disciplined ports/adapters. |
| Multi-tenancy | 🟢 Strong | `tenant_id` everywhere, composite indexes, enforced trust boundary. |
| Domain modeling | 🟢 Strong | Value objects, factory/reconstitute split, aggregate-driven events. |
| Security (boundary/authz) | 🟢 Strong | Timing-safe internal-key guard, sanitized markdown, JSON-LD escaping. |
| **Reliability (events)** | 🔴 **Gap** | **No transactional outbox — dual-write to DB + Pub/Sub can silently lose events.** |
| **Concurrency (booking)** | 🔴 **Gap** | **Slot-conflict check is TOCTOU — concurrent approvals can double-book.** |
| Performance | 🟡 Watch | No caching of per-request tenant settings; repeated DB reads on every hot path. |
| Operability | 🟡 Watch | No graceful shutdown hooks; Pub/Sub drain not guaranteed on scale-down. |
| Code organization | 🟢 Good | A few oversized aggregates breach the project's own size rule. |
| Testing & CI | 🟢 Strong | Builders, in-memory doubles, tenant-isolation tests, strict gates. |

**The two things to fix before "global, high-load" is a true statement:** the **event outbox** (§4.1) and the **slot-conflict race** (§4.2). Everything else is optimization or hardening.

---

## 2. What Is Genuinely Well Done

These are not throwaway compliments — they are load-bearing strengths worth protecting during refactors.

1. **Textbook hexagonal architecture.** `domain/` has zero framework deps; `application/` owns ports and use cases; `infrastructure/` holds adapters. The dependency direction is correct and consistent across all six contexts.

2. **Real aggregates, not anemic entities.** `Booking` (`booking.aggregate.ts`) encapsulates state transitions (`approve`, `reject`, `complete`, `cancel`, `reschedule`) with invariant checks and a private `props`. Getters return value objects; raw primitives never leak. The `requestBooking()` factory vs `reconstitute()` split (validate-on-create, skip-on-rehydrate) is exactly right.

3. **Money is done correctly.** `money.ts` uses `decimal.js`, stores amount as a string to survive serialization, enforces ISO-4217, and refuses cross-currency addition. This eliminates an entire class of float-rounding money bugs that plague most billing code.

4. **Multi-tenancy is enforced, not hoped for.** Every query filters `tenantId`; entities carry composite `(tenantId, …)` indexes (`booking.entity.ts:4-7`); the trust boundary is real (see #6).

5. **Clean request-context propagation.** `RequestContext` over `AsyncLocalStorage` (`request-context.ts`) avoids threading context through every signature — idiomatic and correct.

6. **The BFF→backend trust boundary is properly closed.** `InternalApiGuard` is a global `APP_GUARD` (`app.module.ts`) and uses **SHA-256 + `crypto.timingSafeEqual`** (`internal-api.guard.ts`) — constant-time, length-leak-resistant. The backend never trusts `X-Actor-*` headers without first validating the internal key. This is the single most commonly botched thing in BFF architectures, and it's right here.

7. **Event infrastructure has the hard parts.** The Pub/Sub adapter (`gcp-pubsub-event-bus.adapter.ts`) has DLQ routing after max delivery attempts, ack-on-unparseable to avoid poison-message loops, idempotent topic/subscription creation handling gRPC `ALREADY_EXISTS`, and per-consumer subscription keying. Consumers are idempotent via a `processed_events` table (loyalty + notification).

8. **XSS is handled at both injection points.** Markdown renders through `rehype-sanitize` (`AboutModule.tsx:54`); JSON-LD escapes `<` to `<` with a regression test (`lib/hotsite/seo.ts:92`, `seo.spec.ts:272`). Most teams miss the `</script>` breakout — this one has a test for it.

9. **Engineering hygiene.** Strict TS, SonarCloud gate, Snyk/Trivy/Gitleaks/Checkov, conventional commits, builders + in-memory doubles, mandatory tenant-isolation tests, and unusually disciplined documentation (`CLAUDE.md` + `docs/`).

---

## 3. Severity Legend

🔴 **Critical** — can cause data loss, corruption, or money/booking errors under normal production concurrency. Fix before scaling.
🟠 **High** — meaningful reliability/perf/security risk at load; schedule soon.
🟡 **Medium** — will bite at scale or is a latent footgun; plan it.
🔵 **Low** — polish, defense-in-depth, or consistency.

---

## 4. Critical Findings

### 🔴 4.1 — No transactional outbox: events are dual-written and can be silently lost

**Evidence:** `approve-booking.use-case.ts:56-62` (and the same pattern in every write use case):

```ts
await this.txManager.run(async () => {
  await this.bookingRepo.save(booking);
});

for (const event of booking.clearDomainEvents()) {
  await this.eventBus.publish(event);   // <-- outside the transaction
}
```

**Problem.** The DB commit and the Pub/Sub publish are **two independent writes with no atomicity**. If the process crashes, the pod is killed (Cloud Run scale-down), or Pub/Sub is briefly unavailable *after* the commit but *before*/*during* the publish loop, the event is **lost forever** — with no error surfaced to the user, because their booking already committed. On multi-event flows, you can also get **partial publication** (event 1 sent, event 2 lost).

**Why it matters here specifically.** Loyalty points, customer/admin notifications, and reminder scheduling are all driven *exclusively* by these events. A lost `BookingCompleted` means the customer silently never earns points and never gets a confirmation email. The consumer side is carefully built for at-least-once (DLQ, idempotency) — but the **producer side is effectively at-most-once**, which quietly defeats all of that downstream rigor. For a platform whose stated future is "a BI layer over the data it collects," silently dropped domain events are a corruption of the source of truth.

**Recommendation (transactional outbox).**
1. Add an `outbox_events` table (per context or shared) with the full event envelope + `tenant_id`, `published_at NULL`.
2. In the use case, write the event rows **inside the same `txManager.run()`** as the aggregate save. One atomic commit.
3. A relay (a `setInterval` poller, or Postgres `LISTEN/NOTIFY`, or CDC/Debezium later) reads unpublished rows, publishes to Pub/Sub, and marks `published_at`. At-least-once to the bus; consumers already dedupe by `eventId`.
4. This is a contained change: the use-case shape barely changes (swap `eventBus.publish` for an `outboxRepo.enqueue` call inside the txn), and a single relay service handles delivery.

This is the highest-leverage fix in the codebase.

---

### 🔴 4.2 — Slot-conflict check is a TOCTOU race → double-booking under concurrency

**Evidence:** `booking-slot-conflict.service.ts:18-34` reads existing approved bookings and throws if overlap. It is called from the use case (`approve-booking.use-case.ts:48-52`) **before** and **outside** `txManager.run()`:

```ts
await this.slotConflictService.assertSlotFree(tenantId, booking.scheduledAt, booking.totalDurationMins);
booking.approve(staffId, correlationId);
await this.txManager.run(async () => { await this.bookingRepo.save(booking); });
```

**Problem.** Classic check-then-act race. Two staff approving two different pending bookings for overlapping times (or an auto-approve path + a manual approve) can **both** pass `assertSlotFree` concurrently — neither sees the other because neither has committed yet — and **both** commit. Result: a double-booked slot, which for a physical service business (one wash bay) is a real-world operational failure, not a cosmetic one.

The `@VersionColumn` on `BookingEntity` does **not** protect this: optimistic locking guards a *single row's* lost-update, not a *cross-row invariant* ("no two approved bookings overlap"). Moving the check inside the transaction is necessary but **still insufficient** at `READ COMMITTED` (Postgres default) — the conflicting row simply isn't visible until it commits.

**Recommendation (pick one, in order of robustness):**
- **Best — DB-enforced exclusion constraint.** A Postgres `EXCLUDE USING gist (tenant_id WITH =, tstzrange(scheduled_at, scheduled_at + duration) WITH &&) WHERE (status = 'APPROVED')`. The database makes overlap *impossible*; the app just catches the violation and maps it to `BookingSlotUnavailableError`. This is the correct primitive for "no overlapping intervals."
- **Good — serialize per (tenant, day).** `SELECT pg_advisory_xact_lock(hashtext(tenant_id || date))` at the top of the transaction, then re-check inside it. Cheap, no schema change.
- **Acceptable — `SERIALIZABLE` isolation** on this transaction with retry-on-serialization-failure.

Whatever you choose, the conflict re-check must move **inside** the transaction. Add an integration test that fires two concurrent approvals at the same slot and asserts exactly one succeeds.

---

### 🔴/🟠 4.3 — Verify optimistic locking actually fires (detached-entity save)

**Evidence:** `typeorm-booking.repository.ts:215-258` builds a fresh `new BookingEntity()`, manually copies `entity.version = booking.version`, and calls `manager.save(BookingEntity, bookingEntity)`.

**Problem.** TypeORM's `@VersionColumn` optimistic check is reliable when you `save()` an entity that was **loaded** by that same manager (it adds `AND version = :v` to the UPDATE and throws `OptimisticLockVersionMismatchError` on a 0-row update). When you `save()` a **detached, hand-constructed** entity with the PK set, the path is subtler: `save()` may resolve to an upsert that increments the version without a version-guarded WHERE — i.e., the lost-update protection you think you have may not actually be engaged. This needs to be *proven*, not assumed.

**Recommendation.** Add an integration test: load a booking twice, mutate and save copy A, then save copy B; assert copy B throws `OptimisticLockVersionMismatchError`. If it doesn't throw, switch the write to an explicit `manager.update(BookingEntity, { id, tenantId, version }, …)` and check `affected === 1`, or use `manager.findOne(..., { lock: { mode: 'optimistic', version } })` before save. (Note: even with optimistic locking working, it does not solve §4.2 — different invariant.)

---

## 5. High / Medium Findings

### 🟡 5.1 — Tenant settings are re-read from the DB on every hot path (no cache)

**Evidence:**
- `request.interceptor.ts:49` loads settings once per request via `settingsPort.getSettings(tenantId)`.
- `platform-tenant-settings.adapter.ts:10` → `GetTenantByIdUseCase` → `tenantRepo.findById` — a **raw, uncached** DB read.
- Repositories then call it **again**: `typeorm-booking.repository.ts:38,69,109` and `typeorm-service.repository.ts:25,32,39`.

So a single "list bookings" request hits the `tenants` table **at least twice** (interceptor + repository), every time, for data that changes rarely. At global scale this is pure, avoidable load on a single hot table, and it sits on the critical path of *every* authenticated request.

**Recommendation.**
- Put a cache in front of `ITenantSettingsPort`: in-process LRU + short TTL for a single instance, or Redis for multi-instance coherence. Key by `tenantId`.
- Invalidate on the settings-update path (you already emit/handle settings changes; piggyback an eviction, or just rely on a 30–60s TTL).
- Within an HTTP request, the repository could read currency from `RequestContext.settings` (already loaded by the interceptor) instead of re-fetching — **but** keep the port path for cron/event contexts where `RequestContext` is unpopulated (per your own `CLAUDE.md` rule). A cached port gets you the win without that branching.

### 🟡 5.2 — No graceful shutdown → Pub/Sub drain not guaranteed

**Evidence:** `apps/backend/src/main.ts` calls `app.listen(port)` with no `app.enableShutdownHooks()`. The Pub/Sub adapter's `onModuleDestroy()` (`gcp-pubsub-event-bus.adapter.ts:77`) closes subscriptions — but **Nest only invokes lifecycle destroy hooks if shutdown hooks are enabled**.

**Problem.** On Cloud Run scale-in / SIGTERM, subscriptions won't be closed cleanly, in-flight message handlers may be torn down mid-execution, and the HTTP server won't drain. This amplifies the §4.1 loss window and causes redundant redeliveries.

**Recommendation.** Add `app.enableShutdownHooks()` in both `main.ts` files; ensure SIGTERM triggers server drain before process exit. Same omission should be checked in the BFF.

### 🟡 5.3 — Booking aggregate violates the project's own size rule and mixes concerns

**Evidence:** `booking.aggregate.ts` is 615 lines (largest source file). The class is well above the documented "classes ≤ 200 lines" rule (`CLAUDE.md §7`). Much of the bulk is **event-payload serialization** inline in domain methods (`lineSummaryPayload`, `totalPricePayload`, `toAddressPayload`, and large literal payloads inside `complete()`/`approve()`).

**Recommendation.** Extract event-payload assembly into dedicated factories/mappers (e.g. `BookingEventPayloadFactory`) so the aggregate keeps state-transition logic and delegates serialization. This restores the size budget and separates "how the booking changes state" from "how we shape the wire event."

### 🟡 5.4 — `BackendHttpService` is `Scope.REQUEST`, which propagates request scope upward

**Evidence:** `backend-http.service.ts:10` `@Injectable({ scope: Scope.REQUEST })`.

**Problem.** Any controller/provider that injects it becomes request-scoped too (Nest scope bubbling), meaning per-request instantiation of a chunk of the BFF DI graph. At high RPS this adds GC/instantiation overhead. It's request-scoped only to read `@Inject(REQUEST)` for header forwarding.

**Recommendation.** Consider a singleton service that takes the request/headers as an argument (or reads them from an `AsyncLocalStorage` correlation context like the backend does), removing request scope from the hot HTTP client. Measure first — this is a known-cost tradeoff, not a bug.

### 🟡 5.5 — Booking lines are delete-all-then-reinsert on every modifying save

**Evidence:** `typeorm-booking.repository.ts:122-131` — when `linesModified`, it `delete`s all lines for the booking and re-`save`s them.

**Problem.** Write amplification and index churn; also discards line identity/history. Fine at MVP volumes, but a booking with many lines saved repeatedly is wasteful, and it forecloses any future per-line audit.

**Recommendation.** Diff-and-upsert (insert new, update changed, delete removed) when line counts grow, or keep the simple path but gate it behind a real need. Low urgency.

### 🟠 5.6 — No security headers (Helmet) on the internet-facing BFF

**Evidence:** `apps/bff/src/main.ts` sets CORS, body limits, and global prefix, but there is no `helmet()` (grep for `helmet` across both apps returns nothing). The web is Next.js (some defaults), but the BFF is a public API with none.

**Recommendation.** Add `helmet()` to the BFF bootstrap (HSTS, `X-Content-Type-Options`, frame options, etc.). Cheap defense-in-depth.

### 🔵 5.7 — `deepMerge` of admin-editable settings relies on library prototype-pollution behavior

**Evidence:** `deep-merge.ts` wraps the `deepmerge` package; it merges admin-supplied JSON (`override`) into base settings. Tenant settings are admin-editable (UC-026).

**Problem.** Merging attacker-influenced keys (`__proto__`, `constructor`, `prototype`) into objects is the canonical prototype-pollution vector. The `deepmerge` library has historically mitigated this, but you're trusting its internals on a user-controlled merge.

**Recommendation.** Add an explicit guard that strips/rejects `__proto__`/`constructor`/`prototype` keys from `override` before merging (one small function, fully under your control + a test). Belt-and-suspenders for a multi-tenant boundary.

### 🔵 5.8 — Global `InternalApiGuard` and health probes

**Evidence:** `InternalApiGuard` is registered as a global `APP_GUARD` (`app.module.ts`) with no metadata-based bypass; the `RequestInterceptor` skips `/health`/`/internal`/`/cron`, but the **guard** does not.

**Problem/Question.** Liveness/readiness probes (Cloud Run / k8s) won't send `X-Internal-Key`, so `/health` would 401 unless probes are configured to send it. Verify this — a 401'd health check causes restart loops.

**Recommendation.** Confirm probe config, or add a `@Public()`-style reflector bypass for `/health` in the guard.

---

## 6. Smaller Notes & Polish (🔵)

- **JWT is HS256 (symmetric, shared `JWT_SECRET`)** — `jwt.strategy.ts:22`. Fine for a single issuer (the BFF). If more services begin verifying tokens independently, move to RS256/EdDSA + JWKS so the signing key isn't shared.
- **Sequential event publish loop** (`for … await eventBus.publish`) adds latency proportional to event count; once §4.1's outbox exists this becomes a non-issue (relay handles delivery).
- **Plain `Error` throws in value objects** (`money.ts:18,23,41`) — your own `CLAUDE.md §8` flags that a shared VO throwing plain `Error` can fall through an error mapper to a 500. Audit that every calling context maps these to 400s (the docs say `PhoneNumber`/`Address` already learned this lesson; confirm `Money`).
- **`findById` does 2 queries + a settings read** (`typeorm-booking.repository.ts:34-39`); the list path correctly batches lines into one query (good) — just confirming the single-read path is intentional and not used in loops anywhere.
- **`structuredClone` in DLQ path** (`gcp-pubsub-event-bus.adapter.ts:125`) requires Node ≥17; `engines` says `>=20`, so fine — noting the coupling.

---

## 7. Prioritized Roadmap

| # | Action | Severity | Effort | Why now |
|---|---|---|---|---|
| 1 | **Transactional outbox** (write events in-txn, relay to Pub/Sub) | 🔴 | M | Stops silent event loss — foundation of every downstream feature |
| 2 | **DB-enforced slot exclusion** (gist `EXCLUDE` or advisory lock) + in-txn re-check | 🔴 | S–M | Eliminates double-booking, the worst user-visible failure |
| 3 | **Prove/repair optimistic locking** on booking writes (concurrency test) | 🔴/🟠 | S | Confirms lost-update protection is real |
| 4 | **Cache tenant settings** behind `ITenantSettingsPort` (LRU/Redis + TTL) | 🟡 | S | Removes per-request DB amplification on the hottest path |
| 5 | **`enableShutdownHooks()`** + drain in both apps | 🟡 | XS | Clean Pub/Sub drain; shrinks the §1 loss window |
| 6 | **Helmet on BFF** | 🟠 | XS | Standard public-API hardening |
| 7 | **Prototype-pollution guard** in `deepMerge` | 🔵 | XS | Closes a tenant-boundary footgun |
| 8 | **Slim the `Booking` aggregate** via event-payload factories | 🟡 | M | Restores the size budget; separates serialization from domain |
| 9 | Reconsider `Scope.REQUEST` on `BackendHttpService` | 🟡 | M | Per-request instantiation cost at high RPS (measure first) |

**Items 1–3 are the line between "well-architected MVP" and "safe to run globally at load."** They are all contained, well-scoped changes — the architecture is already shaped to absorb them cleanly (ports, txn manager, and an idempotent consumer side are all in place).

---

## 8. Frontend / Web (`apps/web`) — Next.js 16, Hotsite + Dashboard

> Reviewed as a frontend/UX/web-performance specialist. The **hotsite is the built, production-facing surface**; the **dashboard is still a stub** (`app/dashboard/page.tsx` renders `<p>Dashboard</p>`, and `configureBffClient` has no production caller). So this section is mostly a hotsite audit plus an assessment of the dashboard *foundation* that's already laid.

### 8.0 What's well done on the web side

1. **Correct Server/Client split.** Hotsite module components (`HeroModule`, `ServiceListModule`, `AboutModule`, …) are synchronous Server Components; `'use client'` is reserved for genuine interactivity (`BookingForm`, `HotsiteAuthBar`, `PhotoUpload`). This is exactly the React 19 / Next 16 model done right — minimal JS shipped, SEO-friendly HTML, client islands only where needed.

2. **Accessibility-aware theming is genuinely sophisticated.** `apply-branding.ts` computes **WCAG 2.1 relative luminance and contrast ratio** to auto-select a legible hero text color (`deriveHeroTextColor`). Most "white-label" systems just trust the admin's color picks and ship unreadable text; this one defends legibility mathematically.

3. **Branding as server-rendered CSS custom properties** (`applyBranding` → `--ba-*` on `#hotsite-root`). No theme flash / FOUC, no client-side re-paint, and module components read tokens via inline styles/Tailwind arbitrary values. Clean and fast.

4. **ISR + fetch caching.** `revalidate = 300` on the hotsite page; `fetchManifest` uses `next: { revalidate }`. Next request-memoizes the manifest `fetch` across the layout and page in one render pass, so the double call (`[slug]/layout.tsx:19` + `[slug]/page.tsx:59`) is deduped — correctly relying on the framework rather than hand-rolling.

5. **Defensive manifest handling.** Module data (admin-authored, from DB) is validated with Zod (`isValidModuleData` filter + per-module `Schema.parse`) before render — the page won't trust arbitrary JSON shape.

6. **SEO is thorough.** `generateMetadata`, `robots.ts`, `sitemap.ts`, JSON-LD `LocalBusiness` structured data, `robots:{index:false}` on unpublished tenants. Strong for a discovery-driven local-business product.

7. **Fonts are self-hosted at build** via `next/font/google` with `subsets:['latin']` — no render-blocking request to `fonts.googleapis.com`, good privacy posture (no Google font CDN beacon from EU visitors).

8. **i18n + locale-aware formatting** (`next-intl`, `FormattingProvider` carrying locale/currency/timezone/date-format) is structured for the multi-locale, worldwide ambition rather than hardcoding pt-BR.

### 8.1 🟠 Eight font families are downloaded on **every** hotsite, but each tenant uses two

**Evidence:** `font-config.ts` instantiates all 8 families (Inter, Poppins, Playfair, Montserrat, Raleway, Oswald, Lato, Roboto), and `[slug]/layout.tsx:38` attaches **all** of `FONT_VARIABLES` to the root element. A tenant's branding only references two (`headingFontFamily` + `bodyFontFamily`).

**Problem.** Because every font variable is applied to the rendered tree, Next treats them all as used and emits/preloads font assets for **all eight** — several with multiple weights. For a worldwide audience on mobile/3G, that's a large, avoidable chunk of the critical path and a direct **LCP / Web Vitals** regression on the single most performance-sensitive page in the product (a public landing page whose whole job is to convert).

**Recommendation.** Load only the fonts the tenant actually selected. Options: (a) a small dynamic-import map keyed by `branding.headingFontFamily`/`bodyFontFamily` so only 1–2 families are loaded per render; or (b) keep the static set but split into per-font modules and select at the layout level. At minimum, set `preload: false` on the non-selected families so they don't enter the preload set. This is the highest-impact frontend perf fix.

### 8.2 🟠 No CDN / edge strategy for a "worldwide" hotsite

**Evidence:** ISR renders on the Next server (Cloud Run, presumably single-region per the GCP MVP stack). No `Cache-Control` / `s-maxage` / CDN configuration is present in `next.config.ts` or middleware.

**Problem.** "These hotsites are going to be worldwide." ISR makes the HTML *cacheable*, but nothing in the repo puts a cache *in front* of the origin. A visitor in Jakarta hitting a São Paulo Cloud Run instance pays full cross-globe RTT for TTFB on every cold-ISR or dynamic asset. That's the difference between a ~600ms and a ~60ms first byte.

**Recommendation.** Front the web tier with a CDN that honors Next's `s-maxage`/`stale-while-revalidate` (Cloud CDN, Cloudflare, or Fastly), and/or deploy the web app multi-region. Serve `/_next/static` and hotsite images from CDN edge. This is *the* throughput lever for the worldwide goal — bigger than any code change.

### 8.3 🟠 No security headers / Content-Security-Policy on public hotsites

**Evidence:** `next.config.ts` has no `headers()`; no CSP, HSTS, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, or `Referrer-Policy` anywhere. The hotsite renders **tenant-controlled** content (markdown bodies, image URLs, contact/WhatsApp data, an inline JSON-LD `<script>`).

**Problem.** Public, internet-facing, tenant-themed pages with zero response-header hardening. Even though XSS is mitigated at the React layer (`rehype-sanitize`, JSON-LD `<` escaping — both good), CSP is the defense-in-depth that catches the *next* injection bug, plus clickjacking (`frame-ancestors`) and MIME-sniffing.

**Recommendation.** Add a `headers()` block (or middleware) with a CSP. The inline JSON-LD script and inline branding styles mean you'll need `'unsafe-inline'` for styles (acceptable) and either a nonce or a hash for the one JSON-LD script (Next supports nonce via middleware). Add HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `frame-ancestors 'none'`. Cheap, high-value for a worldwide public surface.

### 8.4 🟡 Module-level mutable auth state in the dashboard HTTP client (latent cross-request leak)

**Evidence:** `lib/api/bff-client.ts` holds `_token` / `_tenantId` / `_tenantSlug` in **module scope**, set via `configureBffClient`, and a request interceptor reads `_token` to attach `Authorization`. All `lib/api/dashboard/*` fetchers use this singleton.

**Problem.** In a Node server process, module scope is shared across **all concurrent requests**. If a dashboard fetcher is ever called from a Server Component / route handler (RSC), two simultaneous users race on `_token` → User B's request can execute with User A's bearer token: a **cross-tenant data leak**. Today it's latent (the dashboard is a stub; `configureBffClient` has no caller; the providers — `query-provider.tsx` — are `'use client'`, implying a client-rendered dashboard where module scope is per-browser-tab and safe). But this is a loaded gun pointed at the moment someone "just fetches dashboard data in a server component."

**Recommendation.** Before building the dashboard: either (a) add `import 'client-only'` to `bff-client.ts` so any accidental server import fails the build, or (b) make the client per-call/per-request (pass token in, or read from `cookies()` inside each server fetcher and construct a request-scoped client). Given the React Query direction, (a) is the cheap lock. Document the rule in `CLAUDE.md`.

### 8.5 🟡 Image delivery for worldwide tenants

**Evidence:** `next.config.ts` allows a single `remotePatterns` host (`NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL`); booking/hotsite photos come from GCS, and the dashboard generates **signed URLs** (`generateHotsiteImageSignedUrl`).

**Problem/Question.** Signed URLs are per-request and time-limited, which defeats both the Next image optimizer's cache and CDN caching (the URL keeps changing). For *public* hotsite imagery (hero/gallery/about), that's wasted optimization and slower worldwide loads. Signed URLs are correct for *private* booking photos, not for public marketing images.

**Recommendation.** Serve public hotsite images from a **public, CDN-backed bucket with stable URLs** (so Next/CDN can cache and optimize), and reserve signed URLs strictly for private/after-service booking photos. Confirm which path the gallery/hero use.

### 8.6 🟡 Manifest module parsing can hard-crash the page

**Evidence:** `[slug]/page.tsx` pre-filters with `isValidModuleData(...)` then calls `HeroModuleDataSchema.parse(...)` etc. inside the render.

**Problem.** The pre-filter and the per-type `.parse()` are two separate validations; if they ever diverge (a schema tightens, a module passes the loose filter but fails the strict parse), `.parse()` **throws inside render** and the entire hotsite 500s instead of degrading by dropping one section. For a page whose availability is the product, fail-soft is preferable.

**Recommendation.** Use `safeParse` per module and skip (or render a fallback for) any module that fails, rather than letting one bad section take down the whole page. Log it for the admin.

### 8.7 🔵 Smaller web notes

- **Middleware auth gate** (`middleware.ts`) only checks cookie *presence*, not validity — correct as a cheap redirect (real verification is server-side), just be sure dashboard server code never treats "passed middleware" as "authenticated."
- **`bffClient` 4xx error mapping** (`bff-client.ts`) leaks `detail` to the client for all 4xx — fine, but ensure backend Problem-Details `detail` never contains internal specifics for authz failures.
- **Dashboard UX is unassessable** (stub). When it's built, the prototype/`tokens.css` discipline documented in `CLAUDE.md §19` is a strong starting point; the bottom-nav / detail-aside conventions there are well thought through.
- **`reactStrictMode: true`** — good.

---

## 9. CI/CD (GitHub Actions, SonarCloud, Security Scans)

> Reviewed as a CI/CD specialist. The pipeline is **broad and security-conscious** — among the more complete PR gauntlets I've seen at this stage. The gaps are supply-chain hardening, cost/efficiency, and one notable coverage hole (E2E).

### 9.0 What's well done

1. **Genuinely comprehensive PR gate:** ESLint, Prettier, `tsc`, backend unit + integration (Testcontainers), BFF unit + component, web unit, SonarCloud, Gitleaks, Snyk SCA, Trivy (matrix per service), Checkov (conditional). This maps cleanly to the "CI gates block merge" list in `CLAUDE.md §7`.
2. **The boot smoke test is excellent and uncommon** (`pr-security.yml`). Building an image and asserting `docker run` *stays up* catches `require()`-graph / module-resolution crashes that a clean Trivy scan and a green `docker build` both miss. That's hard-won wisdom (TD06) encoded as a gate.
3. **Custom SonarCloud "fail on any new issue" step** queries the issues API and fails on `total > 0` — stricter and more transparent than relying solely on the quality-gate, with a readable per-issue printout.
4. **Differential coverage** (`sonar.newCode.referenceBranch=main`) — the ≥80%-on-changed-code rule is actually enforced, not aspirational.
5. **Checkov is change-gated** via `paths-filter` (only runs when Terraform changes) and uploads SARIF to the Security tab — efficient and integrated.
6. **`--frozen-lockfile`** everywhere — reproducible installs.

### 9.1 🟠 Third-party actions pinned to `@master` — supply-chain exposure

**Evidence:** `sonarcloud-github-action@master`, `aquasecurity/trivy-action@master`, `bridgecrewio/checkov-action@master`, `snyk/actions/node@master`.

**Problem.** Pinning third-party actions to a moving ref means **whatever they push to `master` runs in your CI with access to `SONAR_TOKEN`, `SNYK_TOKEN`, and `GITHUB_TOKEN`**. A compromised upstream (or a breaking change) lands silently in your pipeline. This is exactly the supply-chain risk the repo otherwise takes seriously (Snyk, Gitleaks, Trivy) — inconsistent to then run the scanners themselves off `@master`.

**Recommendation.** Pin every third-party action to a **full commit SHA** (with a comment noting the version), and use Dependabot's `github-actions` ecosystem to bump them deliberately. First-party `actions/*` on major tags (`@v4`) is acceptable; the third-party `@master` ones are the priority.

### 9.2 🟠 No `concurrency` control — redundant runs burn minutes and money

**Evidence:** None of the PR workflows declare a `concurrency:` group.

**Problem.** Push three times to a PR in quick succession and you get three full overlapping runs of the entire matrix (including 3× Docker builds + Trivy). At "global SaaS" team size this is real wasted spend and slower feedback.

**Recommendation.** Add to each PR workflow:
```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

### 9.3 🟡 The backend test suite runs twice per PR

**Evidence:** `pr-tests.yml` runs `@ikaro/backend test:cov` (job `backend-unit`); `pr-quality.yml`'s `sonarcloud` job *also* runs `@ikaro/backend test:cov` (plus bff/web/packages) to generate coverage. Same for bff/web.

**Problem.** Every coverage suite executes twice per PR — once for the test gate, once to feed Sonar. Wasted CI minutes and longer wall-clock.

**Recommendation.** Generate coverage once, upload `lcov.info` as an artifact (you already upload some), and have the Sonar job **download** the artifacts instead of re-running. Or consolidate coverage generation into the test jobs and pass it forward.

### 9.4 🟡 Playwright E2E is not gated in CI

**Evidence:** `apps/web` has an `e2e` / `e2e:ci` script and an `e2e/` suite, but **no workflow runs Playwright**. `CLAUDE.md` even notes E2E doesn't feed Sonar coverage.

**Problem.** For a booking platform, the multi-step booking flow (`BookingForm`, slot picking, guest vs auth) is the revenue path and is *only* covered by E2E — which never runs in CI. A regression there merges green.

**Recommendation.** Add a Playwright job (it can be a separate workflow, sharded, or nightly + on-demand-label if runtime is a concern). Even a smoke-level "guest can complete a booking" E2E on every PR would close the biggest coverage gap.

### 9.5 🟡 No least-privilege `permissions:` on most workflows

**Evidence:** Only the `checkov` job sets `permissions:`. The others inherit the repo/org default `GITHUB_TOKEN` scope.

**Recommendation.** Set `permissions: { contents: read }` at the top of each workflow (elevating per-job only where needed, e.g. `security-events: write` for SARIF). Standard hardening, especially with third-party actions in the graph (compounds §9.1).

### 9.6 🔵 Smaller CI notes

- **No CD pipeline in-repo.** `.github/workflows` contains only CI (PR gates + main Sonar). There's no deploy-to-Cloud-Run workflow and no separate **migration job** (which `CLAUDE.md §1` says must run before deploy). If CD lives elsewhere, fine; if not, the "migrations run via separate CI job" guarantee isn't actually wired yet — verify.
- **`trivy ignore-unfixed: true`** silently ships HIGH/CRITICAL vulns that have no patch yet. Pragmatic, but track them (e.g. scheduled re-scan) so they aren't forgotten.
- **No Docker layer caching** in the Trivy build (3 images built from scratch each PR). `docker/build-push-action` + `cache-from: type=gha` would cut minutes.
- **`ps=50` on the Sonar issue query** truncates the *listing* above 50 issues (gating is still correct since any `>0` fails) — fine, just know the printout caps.
- **Node/pnpm version drift:** root `engines` says node `>=20` / pnpm `>=9`; CI pins node `22` / pnpm `11.1.1`. Harmless, but pin once (e.g. `.nvmrc` + `packageManager` field) to keep local and CI identical.

---

## 10. Supply-Chain Security (whole repo)

> Reviewed as an application-security specialist focused on the software supply chain — install-time code execution, dependency provenance, base images, CI action trust, and artifact integrity.

### 10.0 What's already strong (genuinely good supply-chain hygiene)

1. **`--ignore-scripts` on every Docker install** (`apps/*/Dockerfile`). This is the single most effective supply-chain control most teams miss: a malicious `postinstall` in any transitive dependency cannot execute during the image build. Excellent.
2. **pnpm `allowBuilds` allowlist** (`pnpm-workspace.yaml`) — a **default-deny** policy on native build scripts; only 8 named packages (`sharp`, `@swc/core`, `protobufjs`, …) may run install-time builds. This is exactly the right posture and the modern pnpm best practice.
3. **`--frozen-lockfile` everywhere** — installs are reproducible; no silent lockfile drift in CI or Docker.
4. **`overrides` pinning vulnerable transitives** (`form-data 4.0.6`, `multer 2.2.0`, `@grpc/grpc-js`, `@opentelemetry/core`) — evidence of active CVE remediation.
5. **Hardened runtime images:** non-root user (`uid 1001`), **npm/npx removed** from the runner (eliminates npm's bundled CVEs), multi-stage build, slim Alpine, healthchecks.
6. **CI scanners:** Gitleaks (secrets), Snyk SCA (deps), Trivy (image) — plus a Gitleaks allowlist scoped to genuine fixtures only.
7. **Fail-fast env validation** (`@ikaro/env-validation`) — misconfigured secrets crash at boot, not at first use.

### 10.1 🟠 No Dependabot / Renovate — dependency & action updates are entirely manual

**Evidence:** No `.github/dependabot.yml`, no `renovate.json`. The `overrides` block shows remediation happened **reactively** (hand-pinned after the fact).

**Problem.** Nothing proposes upgrades or surfaces new advisories outside the per-PR Snyk scan — and Snyk only blocks **newly introduced** high/criticals on code-touching PRs. Dependencies that rot in place (a CVE disclosed against an already-installed version) are invisible until someone happens to bump them. For a globally-deployed SaaS this guarantees CVE backlog accumulation.

**Recommendation.** Add Dependabot (or Renovate) for **three** ecosystems: `npm` (grouped, weekly), `docker` (base-image bumps), and **`github-actions`** — the last one directly fixes §10.3. Renovate additionally enables a release-cooldown (see §10.4).

### 10.2 🟠 Base images use floating tags, not digests

**Evidence:** `FROM node:22-alpine` in all three Dockerfiles.

**Problem.** `node:22-alpine` is a **mutable** tag — it's re-pushed regularly. Builds are therefore not reproducible, and a compromised or regressed upstream image is pulled silently on the next build. Trivy scans the result but can't prevent the swap.

**Recommendation.** Pin to a digest: `FROM node:22-alpine@sha256:<digest>` (builder and runner), and let Dependabot's docker ecosystem bump the digest deliberately. Reproducible + reviewable.

### 10.3 🟠 Third-party CI actions pinned to `@master` (supply-chain, restated in this lens)

**Evidence:** `sonarcloud-github-action@master`, `trivy-action@master`, `checkov-action@master`, `snyk/actions/node@master`, plus `gitleaks-action@v2` / `paths-filter@v3` on major tags.

**Problem.** Each runs in CI with `SONAR_TOKEN`, `SNYK_TOKEN`, and `GITHUB_TOKEN`. `@master` = you execute whatever the upstream pushes, the moment they push it. This is the highest-probability supply-chain entry point in the whole repo (CI has secrets and write-capable tokens).

**Recommendation.** Pin **every third-party action to a full commit SHA** (comment the version), managed by Dependabot's `github-actions` ecosystem. Pair with §10.7 (least-privilege `permissions:`).

### 10.4 🟡 No defense against a *newly-published* malicious version

**Problem.** The frozen lockfile protects you until someone updates it; at that moment there's no cooldown. The dominant modern attack (hijack a popular package, publish a malicious patch) is caught by a **release-age gate**, not by frozen installs.

**Recommendation.** Adopt Renovate's `minimumReleaseAge` (e.g. 3–5 days) and/or Socket.dev to quarantine just-published versions and flag install-script/network/obfuscation changes that Snyk's CVE-based scan won't.

### 10.5 🟡 No SBOM and no artifact signing / provenance

**Problem.** There's no SBOM (CycloneDX/SPDX) and deployed images are unsigned with no provenance attestation. B2B and global-compliance buyers increasingly *require* an SBOM, and unsigned images mean the deploy target can't verify that what runs is what CI built.

**Recommendation.** Emit an SBOM in CI (Trivy/syft) and attach it to releases; sign images with **cosign/Sigstore** and verify the signature at deploy (Cloud Run admission / Binary Authorization). Consider npm provenance for any published packages.

### 10.6 🟡 The `rm -rf …/multer@2.1.1` in the Dockerfiles is a red flag

**Evidence:** Both backend and BFF Dockerfiles `rm -rf /standalone/node_modules/.pnpm/multer@2.1.1` after `pnpm deploy`, despite `overrides` pinning `multer 2.2.0`.

**Problem.** If the override fully took effect, `2.1.1` wouldn't be in the deploy tree at all. The hand-delete means some resolution path **still pulls the vulnerable `2.1.1`**, and the only thing keeping it out of the image is a hardcoded path string. A future version bump silently breaks the `rm` (path changes) and **re-ships the known-vulnerable multer** with no error.

**Recommendation.** Find why `2.1.1` resolves (`pnpm why multer`), fix the override so it genuinely dedupes to one safe version, and delete the brittle `rm`. Don't rely on a string-matched cleanup for a known CVE.

### 10.7 🔵 Smaller supply-chain notes

- **No least-privilege `permissions:`** on most workflows — default `GITHUB_TOKEN` scope is broad; set `contents: read` at the top of each (compounds §10.3).
- **No `CODEOWNERS`** and no visible branch-protection requiring review on `.github/workflows/**`, the lockfile, or Dockerfiles — the files an attacker most wants to touch should require review.
- **`ENABLE_DEV_AUTH` dev-login bypass** exists (seen in CI env). Verify env validation makes it **impossible to enable when `NODE_ENV=production`** — a single misconfigured env var is otherwise an auth bypass.
- **`.npmrc`** doesn't pin a registry or enforce audit/provenance — consider locking `registry=` for defense against registry-substitution.
- **Trivy `ignore-unfixed: true`** ships unpatched HIGH/CRITICALs silently — track them on a schedule so they're not forgotten.

---

## 11. QA / Test Coverage (backend, BFF, web)

> Reviewed as a QA specialist: not "is there a test," but "do the tests exercise the paths that actually break." The **test culture here is strong** — builders, in-memory doubles, Testcontainers, per-UC unit+integration+isolation discipline. The gaps are concentrated in **adversarial/concurrency paths, failure modes, contract seams, and end-to-end depth.**

### 11.0 What's well covered

- **Backend:** 473 source files / **190 unit** + **34 integration** specs; **26** integration specs carry explicit tenant-isolation assertions. Real Postgres via Testcontainers. Per-UC unit+integration+isolation is largely honored.
- **BFF security surface is thoroughly tested** — **every** guard (`jwt-auth`, `roles`, `tenant`, `active-staff`) and **every** auth piece (`google.strategy`, `jwt.strategy`, `jwt-issuer`, `oauth-state`, `selection-token`) has a spec, plus 12 controller **component** tests. For an auth/BFF layer this is better than most.
- **Platform provisioning** (the `PLATFORM_ADMIN_KEY`-gated path) has integration coverage (`internal-tenant.controller.integration.spec.ts`).
- **Web:** 66 unit specs including a spec for **every hotsite module component** (jsdom + Testing Library), matching the per-component test table in `CLAUDE.md`.

### 11.1 🔴 No concurrency / adversarial tests for the two critical backend hazards

**Evidence:** Grep for concurrent execution, `OptimisticLock*`, or double-booking races returns only **single-threaded logic** specs (`booking-slot-conflict.service.spec.ts` tests overlap math, not a race). No spec fires two operations with `Promise.all` against the same slot; none asserts `OptimisticLockVersionMismatchError`.

**Problem.** §4.2 (double-booking race) and §4.3 (optimistic lock may not fire) are the audit's top correctness risks — and they have **zero** test coverage. The code most likely to corrupt real-world state under production concurrency is exactly the code with no adversarial test.

**Recommendation.** Add integration tests that (a) fire two concurrent `approve`/`requestBooking` calls for the same slot and assert **exactly one** succeeds (drives the §4.2 fix), and (b) save a stale aggregate and assert an optimistic-lock failure (proves §4.3). These tests should be written *first*, as the executable spec for those fixes.

### 11.2 🟠 No event-delivery failure-mode tests (the §4.1 outbox gap)

**Evidence:** No spec exercises `eventBus.publish` **throwing after commit**, partial multi-event publication, or consumer idempotency under a *genuine* duplicate delivery (the `processed_events` dedup is structurally present but not asserted under replay).

**Problem.** The reliability-critical path is tested only for the happy "event is published" case. The failure modes that cause silent lost points/notifications are unverified.

**Recommendation.** Test: publish-throws-after-commit (asserts the outbox/retry behavior once §4.1 lands); deliver the same `eventId` twice and assert exactly one `LoyaltyEntry`/one email; DLQ routing after max attempts.

### 11.3 🟠 No coverage floor in the test runners — Sonar is the *only* gate

**Evidence:** Neither `apps/backend/jest.config.ts` (`coverageThreshold` absent) nor `apps/web/vitest.config.ts` (`coverage.thresholds` absent) sets a floor. Enforcement is **solely** SonarCloud's 80%-on-changed-code.

**Problem.** A Sonar outage/misconfig, a PR that touches little measured code, or slow erosion of untouched modules all pass with no local/CI floor. Differential-only coverage never catches *global* decay.

**Recommendation.** Add a `coverageThreshold`/`thresholds` block (e.g. 80/75/80/80) to jest and vitest as a hard, Sonar-independent floor. Cheap defense-in-depth.

### 11.4 🟠 Web E2E is a single golden path

**Evidence:** 4 E2E specs; `guest-booking.spec.ts` is 37 lines covering only a successful submit. Pages/layouts are (correctly) excluded from unit coverage — meaning a large slice of web code is reachable **only** by E2E, which is thin.

**Problem.** The booking flow is the revenue path. Unit tests cover sub-components in isolation, but the assembled multi-step form + server round-trip has one happy-path E2E and no coverage of: validation errors, the required-pickup-address branch, authenticated booking (UC-002), slot-becomes-unavailable mid-flow, photo upload, back-navigation/state retention, or the login + tenant-selection flows (UC-021/022/023).

**Recommendation.** Expand Playwright to cover the booking error/edge branches and the auth/tenant-selection journeys, and **gate it in CI** (§9.4). The exclusion of pages/layouts from unit coverage is the right call *only if* compensated by real E2E breadth.

### 11.5 🟡 No contract tests at the BFF↔backend seam

**Evidence:** BFF component tests **mock** the backend HTTP; backend tests are unaware of the BFF. The only shared truth is the compile-time `@ikaro/types` package.

**Problem.** Shared types catch *compile-time* shape mismatches, not *runtime* drift — a backend controller mapping that diverges from the typed contract (renamed field, changed nullability, different error envelope) passes both suites and breaks in integration. In a 3-service split, this seam is the most likely silent break.

**Recommendation.** Add consumer-driven contract tests (Pact) or, lighter, shared response-shape fixtures validated on **both** sides (backend asserts it produces them; BFF asserts it consumes them). Especially for the Problem-Details error envelope and money/date shapes.

### 11.6 🟡 No load / throughput / performance regression tests

**Evidence:** No `k6` / `artillery` / `autocannon` tooling anywhere.

**Problem.** For a "high-load, worldwide" product, there's no baseline for latency/throughput and nothing to catch N+1 regressions — e.g. the per-request settings amplification (§5.1) is **invisible** to the current suite; a future query in a loop would be too.

**Recommendation.** A small k6 smoke suite over the hot read paths (hotsite manifest, availability summary, booking list) with p95 latency + query-count budgets, run nightly. Doesn't need to be exhaustive to catch the cliff-edge regressions.

### 11.7 🟡 No runtime accessibility testing

**Evidence:** `eslint-plugin-jsx-a11y` is present (static) but there's no `jest-axe`/axe-core in component specs and no Playwright a11y scan.

**Problem.** Static lint catches missing `alt`/roles; it does not catch contrast failures, focus-order, or ARIA-state bugs at runtime — relevant precisely because the branding system lets tenants pick colors (the WCAG math in `apply-branding.ts` should be *verified by tests*, not just computed).

**Recommendation.** Add `jest-axe` assertions to the hotsite module-component specs and an axe scan to the booking E2E. Assert the contrast-derivation logic against known good/bad color pairs.

### 11.8 🟡 Edge-case depth in time, money, and idempotency

**Recommendation — add explicit cases for:**
- **Timezone/DST boundaries** in availability and slot math for **non-Brazil** tenants (Brazil dropped DST in 2019, but "worldwide" tenants will hit DST transitions — slot generation across a spring-forward/fall-back is a classic booking bug).
- **Cancellation-window exact boundary** (`Date.now()` exactly at `scheduledAt − window`) — off-by-one on the 48h rule.
- **Money precision** when summing many lines / rounding at the `numeric(10,2)` boundary.
- **Customer & Notification contexts** are integration-light (3 specs each vs booking's 10); notification senders are the consumer side of *every* event — their template-render, idempotency, and delivery-channel-failure behavior deserves integration coverage, not unit-only.

### 11.9 🔵 Optional: mutation testing

Coverage % proves lines *ran*, not that an assertion would *catch a regression*. For a team this quality-focused, a periodic **Stryker** run on the domain layer (aggregates, VOs, availability service) would surface assertion-free "coverage theater" — high signal, run occasionally rather than per-PR.

---

## 12. Event-Driven Integrity — Idempotency, Failures, Concurrency (full publish/consume audit)

> Reviewed as a distributed-systems specialist, tracing **every** publish and consume site. This is the area the user flagged for deep attention, so it gets the most detail. **Verdict: the consumer side is thoughtfully built for at-least-once; the producer side and the consumer→follow-on-event seam have integrity gaps that *will* drop or duplicate events in production.** The most dangerous finding (§12.3) is an idempotency guard that makes a lost event **permanently unrecoverable**.

### 12.0 The map

**Producers — domain events via aggregate (`addDomainEvent` → flush after commit):** 14 use cases across booking (10), staff (3: invite/deactivate/create-initial-manager), platform (provision-tenant). Pattern: `txManager.run(save)` then `for (e of clearDomainEvents()) eventBus.publish(e)`.

**Producers — direct publish from jobs/consumers (no aggregate, no txn):**
- `booking-reminder.job.ts` (`BookingReminderDue`, `BookingReminderDueToday`)
- `admin-schedule-reminder.job.ts` (`AdminDailyScheduleReminder`)
- `notify-expiring-points.use-case.ts` (`PointsExpiringSoon`)
- `record-loyalty-entries.use-case.ts` (`ServicePointsEarned`) — **publishes from inside a consumer**

**Consumers (17 handlers):** loyalty `BookingCompleted`; staff `TenantProvisioned`; notification subscribes to 14 events + a `dead-letter` monitor. All handlers are thin (`handle()` → one use case → rethrow).

**Idempotency stores:** `loyalty.processed_events` (PK `event_id, consumer_name`) and `notification.processed_events` (PK `event_id, notification_type, channel`). Plus domain-level uniqueness: `loyalty_entries UNIQUE(tenant_id, booking_line_id)`.

### 12.1 ✅ What is correct (and genuinely good)

- **Consumer at-least-once is right:** handler throws → `dispatch()` nacks (`gcp-pubsub-event-bus.adapter.ts`); ack only on success; DLQ after `PUBSUB_MAX_DELIVERY_ATTEMPTS`; unparseable messages are ack'd to avoid poison loops.
- **DB-backed idempotency with composite PKs** — survives restarts (no in-memory sets), exactly as `CLAUDE.md` mandates.
- **Marker committed *with* the work:** in `record-loyalty-entries`, `markProcessed` is inside the same `txManager.run()` as the entry/balance writes — so the dedup marker and the state change are atomic. Correct.
- **`correlationId` propagated** from event into the use-case DTO (not regenerated) — traceability preserved across hops.
- **Thin handlers** — zero domain logic, just rethrow. Textbook.

### 12.2 🔴 Producer dual-write — lost events at the source (use cases *and* crons)

Already raised as §4.1 for use cases; the **cron/direct publishers are worse** because they have neither a transaction nor an aggregate. `booking-reminder.job.ts:70-101` publishes events one-by-one in a `for` loop with `await`. A crash (or Cloud Run SIGTERM) at item 50 of 100 **silently loses items 51–100** — and there is no record that they were due, so nothing ever retries them. Same shape in `admin-schedule-reminder.job` and `notify-expiring-points`. **Fix:** route all publishes (use-case and cron) through the §4.1 transactional outbox; the relay handles partial-failure recovery.

### 12.3 🔴 The idempotency guard makes a lost follow-on event **permanently unrecoverable**

This is the sharpest event-integrity bug in the codebase. In `record-loyalty-entries.use-case.ts`:

```ts
await this.txManager.run(async () => {
  ...save entries... upsert balance...
  await this.processedEventRepo.markProcessed(eventId, CONSUMER_NAME);   // committed
});
await this.eventBus.publish(new ServicePointsEarned(...));               // AFTER commit
```

If the process dies **after** the transaction commits but **before** `ServicePointsEarned` publishes:
1. The event is lost (producer dual-write, §12.2).
2. Pub/Sub redelivers `BookingCompleted` → the handler runs again → but `hasBeenProcessed(eventId)` now returns **true** → the use case **returns early at line 67** and **never re-publishes `ServicePointsEarned`**.

So the "you earned points" notification is lost **forever** — the very idempotency mechanism that protects the DB write *guarantees* the downstream event can never be recovered by retry. Points exist; the customer is never told. This pattern recurs anywhere a consumer both marks-processed and emits a follow-on event. **Fix:** the follow-on event must be written to the outbox **inside the same transaction** as `markProcessed`, so it commits-or-fails atomically and the relay delivers it.

### 12.4 🟠 Cron reminders have no per-booking idempotency → duplicate emails

`BookingReminderJob` generates a fresh `correlationId`/`eventId` per run and self-gates on a local `06:00–06:29` window (`booking-reminder.job.ts:13-14,30`). There is **no per-(booking, reminderType, date) sent-marker.** The notification consumer dedups on `eventId` — but every cron run mints **new** eventIds, so consumer dedup cannot catch a re-run.

Consequences:
- **Cloud Scheduler retries** (it retries failed/timed-out invocations by default) re-run the whole job → everything already published before the failure is **published again** → duplicate reminder emails.
- If the scheduler fires more than once inside any tenant's 30-minute local window (the usual setup — run every 10–15 min so every timezone's 6 AM is hit), the window guard passes **twice** → **duplicate reminders**.

**Fix:** persist a reminder-sent marker keyed by `(tenantId, bookingId, reminderType, localDate)` and skip already-sent ones; or make the event's `eventId` **deterministic** (e.g. `uuidv5(bookingId + reminderType + localDate)`) so the existing consumer dedup absorbs re-runs. The deterministic-id approach is the smaller change and reuses the machinery already there.

### 12.5 🟠 Notification dispatch-then-mark → duplicate sends on crash, concurrency, or partial failure

`base-notification.use-case.ts:94-107`: for each template, `isAlreadySent?` → **dispatch email** → **then** `saveLog`/`markProcessed`. The side effect precedes the commit:
- **Crash after dispatch, before `saveLog`** → marker never written → redelivery re-dispatches → **duplicate email.**
- **Concurrent delivery** of the same event to two instances: both pass `isAlreadySent` (false), both dispatch → **two emails**, then one `markProcessed` wins (composite PK / upsert). The DB ends consistent; the customer got two emails.
- **`dispatchTemplatesToMany` with `Promise.all`** (`:134-145`): if one recipient's send rejects, `Promise.all` rejects, no `saveLog` runs, the whole thing nacks → on retry **every** recipient (including those who already received it) is emailed again. Admin daily-schedule reminders to many staff are exactly this path.

This is a deliberate "favor delivery over loss" choice (reasonable for email), but the **duplicate-send blast radius is larger than it needs to be**, and SMTP/dispatch is not idempotent. **Fix:** pass a provider-level idempotency key (most ESPs support one) derived from `(eventId, notificationType, channel, recipient)`; and in the multi-recipient path, track per-recipient success so a retry only re-sends the failures.

### 12.6 🟡 No Pub/Sub ordering → events can be processed out of order

`publishMessage` sets no `orderingKey` and the subscriptions don't enable message ordering (grep confirms none). For a fast sequence on one booking (e.g. approve → reschedule, or approve → complete within seconds), the notification consumer can process them out of order and email "approved" *after* "completed/rescheduled." Low frequency, real. **Fix (if/when it matters):** publish with `orderingKey = bookingId` and enable ordered delivery on the booking-related subscriptions; accept the throughput tradeoff per key.

### 12.7 🟡 DLQ is monitored but has no replay path

`dead-letter.handler.ts` subscribes to the `dead-letter` topic as consumer `monitor` (logging). Dead-lettered events — i.e. the ones that already failed `MAX_DELIVERY_ATTEMPTS` — have **no operational path back into processing**. Once an event hits the DLQ, recovering it is a manual database/Pub/Sub exercise. **Fix:** a guarded admin/cron endpoint to re-drive DLQ messages after a fix is deployed (replay by re-publishing to the original topic), plus an alert on DLQ depth.

### 12.8 🟡 Concurrency note — idempotency is safe for *state*, not for *side-effects*

The `hasBeenProcessed → … → markProcessed` sequence is **check-then-act**. It is safe for **database state** because the composite PK on `processed_events` and the `UNIQUE(tenant_id, booking_line_id)` on `loyalty_entries` make a concurrent double-write fail and retry into the idempotent skip. It is **not** safe for **external side-effects** committed before the marker (emails — §12.5) or for follow-on events published after the marker (§12.3). The mental model to hold: *DB-level uniqueness gives you idempotent persistence; only the outbox gives you idempotent side-effects.*

### 12.9 🔵 Smaller event notes

- **`eventVersion: 1` is in the envelope but no consumer reads it** — there's no schema-evolution strategy. A future payload change can break in-flight or DLQ'd events with no version branch. Decide now whether to upcast or reject-on-version.
- **`/cron` endpoints** rely on the global `InternalApiGuard` (the in-file comment "no auth guard" is misleading — the X-Internal-Key guard still applies); the planned `CronAuthGuard`/OIDC (M115-S03) is still the right hardening so Cloud Scheduler authenticates with a verifiable token, not a shared key.
- **Sequential `await` publish loops** add latency but, once the outbox exists, become irrelevant (the relay batches).

### 12.10 What to keep on watch (focused checklist)

1. **No event leaves a state change except through an outbox written in the same transaction.** This single rule fixes §12.2, §12.3, and §4.1 at once. Make it the law for use cases, crons, and consumers that re-emit.
2. **Every cron-generated event needs a deterministic id or a sent-marker** so scheduler retries and overlapping windows can't duplicate (§12.4).
3. **Treat email/SMS as non-idempotent** — provider idempotency keys + per-recipient success tracking (§12.5).
4. **DLQ needs a replay runbook and a depth alert** (§12.7), and **at least one test** that drives an event to the DLQ and back.
5. **Decide on ordering** per booking (§12.6) and on **event versioning** before the first payload change (§12.9).
6. **Add the adversarial tests** from §11.1–11.2 specifically for these paths: concurrent duplicate delivery, crash-between-commit-and-publish, cron re-run, multi-recipient partial failure.

---

## 13. Operability, Scale & Compliance (the run-it-globally gaps)

> ⏸️ **PRIORITY: DEFERRED — revisit during the GCP infrastructure / deploy phase (not urgent now).**
> Ikaro is **pre-deploy**, so most of this section is intentionally parked: connection pooling, PgBouncer, readiness probes, OTel wiring, rate-limit storage, CD/migration jobs, IaC, and DR are naturally addressed when the GCP infrastructure is stood up. Keep this list as the **infra-phase checklist** — when deployment work begins, §13.11 is the starting point. Two caveats that are *not* purely infra and worth keeping in mind earlier: **§13.5 (LGPD/PII)** is cheaper to design for while the data footprint is small, and **§13.9 (API idempotency)** / **§13.1 (pool sizing)** influence application code, so a one-line config seam now saves rework later. Severity badges (🔴/🟠) below reflect *production* impact, not *current* urgency.

> Added after the code/architecture passes to cover the **horizontal domains** the earlier sections didn't open. These are the concerns that fail *specifically* under the high-load, multi-instance, worldwide, Brazil-regulated conditions Ikaro is designed for — and most of them are invisible to the current test suite. Every claim below was verified against the repo.

### 13.1 🔴 Database connection pool is unbounded-by-default → exhaustion under autoscaling

**Evidence:** `app.module.ts`'s `TypeOrmModule.forRootAsync` sets host/port/credentials but **no `extra.max` / `poolSize`**, no `ssl`, and there's no PgBouncer/pooler anywhere. `data-source.ts` likewise has no pool or SSL config.

**Problem.** node-postgres defaults to **10 connections per process**. Cloud Run autoscales to N instances, so the backend opens `~10 × N` connections to a Postgres whose default `max_connections` is ~100. **At ~10 instances the database refuses new connections** — and that threshold is hit during exactly the traffic spike you scaled up for, so new instances boot and immediately fail their first query. This is the single most common Cloud-Run-plus-managed-Postgres outage, and nothing in the repo guards against it. (Secondary: no `ssl` means a managed Postgres requiring TLS won't connect, or connects unencrypted.)

**Recommendation.** Set an explicit, *small* per-instance pool (`extra: { max: 5, ... }`), put **PgBouncer** (or Cloud SQL's built-in pooler / a Cloud SQL connector with pooling) in front, cap Cloud Run `max-instances` to a value where `max × poolSize < Postgres max_connections × safety`, and enable `ssl`. Load-test to the cap (ties to §11.6).

### 13.2 🟠 Rate limiting is in-memory and IP-keyed without a trusted proxy — ineffective at scale

**Evidence:** `apps/bff/src/app.module.ts` uses `ThrottlerModule.forRoot([...])` with the **default in-memory store** (no Redis storage), limits `public: 60/min`, `authenticated: 300/min`. `apps/bff/src/main.ts` does **not** set `app.set('trust proxy', …)`.

**Problem.** Two compounding failures: (1) in-memory means **each Cloud Run instance keeps its own counter**, so the effective limit is `limit × instanceCount` and a client spread across instances is barely throttled — useless as abuse protection at scale; (2) without `trust proxy`, `@nestjs/throttler`'s IP key is the **immediate hop** (the load balancer), so all traffic may share one bucket (false positives) or be mis-attributed. There's also **no per-tenant limit** — on a shared schema, one tenant can exhaust capacity for all.

**Recommendation.** Move throttling to a **shared store** (`@nest-lab/throttler-storage-redis`), enable `trust proxy` and key on the real client IP from `X-Forwarded-For`, and add a **per-tenant** throttle tier. This requires the Redis that's currently absent (see also §13.3, §5.1).

### 13.3 🟠 Readiness probe doesn't check dependencies

**Evidence:** `health.controller.ts` — `/health/ready` returns a static `{ status: 'ok' }`; it never checks Postgres or Pub/Sub.

**Problem.** Cloud Run/k8s will mark an instance **ready and route traffic to it even when its database is down or its connection pool is exhausted** (§13.1), turning a recoverable dependency blip into served 500s. Liveness can stay shallow; readiness must reflect dependency health.

**Recommendation.** Use `@nestjs/terminus` (or a manual check) so `/ready` verifies a DB `SELECT 1` and Pub/Sub reachability, with a short timeout. Keep `/live` shallow so a slow dependency doesn't cause restart loops.

### 13.4 🟠 Observability is logging-only — tracing/metrics are documented but not wired

**Evidence:** `CLAUDE.md` advertises "Prometheus + Grafana + OpenTelemetry + Loki + OTel Collector," but `packages/observability/src` exports **only `BaseAppLogger`**, and there is **no `NodeSDK` / `registerInstrumentations` / OTLP exporter / tracer bootstrap** anywhere in `apps/` or `packages/`.

**Problem.** For a distributed, event-driven system the single most valuable debugging tool is a **trace that follows a request from BFF → backend → Pub/Sub → consumer**. Right now you have structured logs with `correlationId` (good, and a decent fallback) but **no distributed tracing and no app metrics** (RED/USE, queue depth, handler latency, DLQ rate). At high load, "why is p99 booking-approval 4s and why are points delayed" is very hard to answer from logs alone.

**Recommendation.** Actually initialize the OTel Node SDK (auto-instrument HTTP/PG/Pub/Sub) with an OTLP exporter to the Collector the docs describe; emit metrics for handler latency, **Pub/Sub backlog and DLQ depth** (§12.7), DB pool utilization (§13.1), and per-tenant request rates. Until this exists, treat the observability claims in the docs as aspirational.

### 13.5 🟠 LGPD / PII handling — personal data sprawls through events, DLQ, and logs

**Evidence:** Domain event payloads carry raw PII — `contactEmail`, `contactName`, `contactPhone`, and full addresses (`booking.aggregate.ts`); these are serialized into Pub/Sub messages, **enriched and re-published into the `dead-letter` topic** (`gcp-pubsub-event-bus.adapter.ts:117-143`), and flow into logs. Customer photos live in GCS. Loyalty entries are **append-only**.

**Problem.** You operate in Brazil under **LGPD**, and there's no visible data-protection posture: PII is duplicated across the event bus, the DLQ (where it can sit indefinitely), and log aggregation, with **no scrubbing, no retention policy, and no encryption-of-PII story**. **Right-to-erasure** is especially hard here — a customer's data is smeared across append-only loyalty rows, immutable event/notification logs, DLQ messages, and object storage, with no deletion workflow. This is a compliance liability, not just a tech-debt item.

**Recommendation.** Define a PII inventory and a data-protection plan: minimize PII in event payloads (reference IDs + a lookup, or field-level encryption), set **retention/TTL** on the DLQ and notification/event logs, scrub PII from logs, encrypt sensitive columns at rest, and design an **erasure workflow** (tombstoning/anonymization that respects the append-only invariants). Add a DPA/processor list for sub-processors (email provider, GCP).

### 13.6 🟡 No resilience patterns at the BFF↔backend seam

**Evidence:** `backend-http.service.ts` sets a 10s timeout (good) but has **no retry/backoff, no circuit breaker, no bulkhead**.

**Problem.** A transient backend blip or a slow dependency turns into user-facing 5xx with no automatic recovery, and a slow backend can exhaust the BFF's request capacity (head-of-line blocking) with nothing to shed load. For a worldwide front door this is fragile.

**Recommendation.** Add bounded retries with jittered backoff for idempotent GETs, a circuit breaker (e.g. `opossum`) around the backend client, and a fallback for the hotsite read path so a backend hiccup degrades gracefully rather than blanking the public site.

### 13.7 🟡 Auth lifecycle: JWTs can't be revoked; rotation and dev-bypass need a plan

**Evidence:** Stateless HS256 JWTs (`jwt.strategy.ts`); no refresh-token rotation or revocation/denylist seen; `ENABLE_DEV_AUTH` exists.

**Problem.** A leaked or post-logout token is valid until expiry (no server-side revocation). Rotating `JWT_SECRET` (incident response) **invalidates every session at once** — no key-ID/rotation scheme. And `ENABLE_DEV_AUTH` is an auth bypass that must be provably impossible in production.

**Recommendation.** Add a refresh-token + short-lived-access-token model with a revocation list (needs the absent Redis), support `kid`-based key rotation, and make env validation **hard-fail if `ENABLE_DEV_AUTH` is set while `NODE_ENV=production`**.

### 13.8 🟡 Release, migrations & DR are documented but not wired in the repo

**Evidence:** No CD workflow and **no migration job** in `.github/workflows` (grep finds none), despite `CLAUDE.md` stating "migrations run via a separate CI job before deploy." The Checkov job scans `infrastructure/terraform/**` — **but that directory does not exist**, so the IaC scan silently never runs and there is no IaC in the repo. Backups/DR are mentioned only in `docs/`.

**Problem.** The deploy-time guarantees the docs promise (gated migrations, IaC scanning, expand/contract safety) aren't actually enforced anywhere executable. Zero-downtime deploys depend on expand/contract migration discipline that nothing verifies; rollback/canary strategy is unstated; backups/RTO/RPO/restore-testing are doc-only.

**Recommendation.** Add the migration CI job (run before deploy, fail the deploy if it fails), commit the Terraform the Checkov job already expects (or remove the dead scan), and document+test a rollback path and a restore drill. Verify migrations are genuinely additive (expand/contract) with a check or review rule.

### 13.9 🟡 No API-level idempotency on mutating endpoints

**Evidence:** No `Idempotency-Key` handling on `POST /bookings` (or other mutations) in BFF or backend (grep finds none).

**Problem.** A guest double-clicking "Book," a flaky mobile network retrying a POST, or a client-side retry creates **duplicate bookings** — distinct from the §4.2 slot race; this is request-level duplication. The booking aggregate has no natural dedup for "same guest, same intent, twice."

**Recommendation.** Accept a client-supplied `Idempotency-Key` on mutations, persist first-seen key→result, and return the original result on replay (storage: the same Redis). Standard for payment/booking-style POSTs.

### 13.10 🔵 Smaller operability notes

- **Abuse/bot protection** on the public guest-booking endpoint — no CAPTCHA/Turnstile/bot mitigation; booking spam is trivial once the URL is known (compounds §13.2).
- **Cold starts / cost:** Node+Nest cold-start latency directly hurts worldwide TTFB; no `min-instances` or per-instance concurrency tuning examined — set these deliberately (cost vs latency).
- **RUM / Core Web Vitals:** §8 covered build-time perf; there's no field-data (real-user-monitoring) on the worldwide hotsites to know actual LCP/INP by region.
- **`/cron` self-trigger safety:** ties to §12.4 — until `CronAuthGuard`/OIDC lands, the X-Internal-Key is the only gate; an accidental double-invoke duplicates reminders.

### 13.11 What to keep on watch (operability checklist)

1. **Cap and pool DB connections, then load-test to the cap** (§13.1) — the most likely first production outage.
2. **Introduce Redis** — it unlocks distributed rate limiting (§13.2), the settings cache (§5.1), token revocation (§13.7), and API idempotency (§13.9) in one stroke.
3. **Make `/ready` honest** and **wire real OTel tracing + metrics** (§13.3–13.4) before you need them at 2 a.m.
4. **Write the LGPD/PII plan now** (§13.5) — retention, scrubbing, erasure — while the data footprint is still small.
5. **Wire the migration/CD job and commit (or delete) the Terraform** the CI already expects (§13.8).

---

## 14. Closing Assessment

This is a **mature, well-reasoned codebase** across all three tiers, with architectural discipline most teams never reach: hexagonal boundaries and real aggregates on the backend; a correct Server/Client split, contrast-aware theming, and ISR/SEO rigor on the frontend; genuinely strong supply-chain *defaults* (`--ignore-scripts`, pnpm build allowlist, hardened images); and a test culture (builders, Testcontainers, fully-tested auth guards) that is well above average.

The problems are not sprawl or sloppiness — they cluster into a few **specific, well-understood hazards** that only bite at real scale, concurrency, and adversarial conditions:

- **Backend correctness/reliability:** dual-write event loss (no outbox, §4.1) and the check-then-act booking race (§4.2) — the two true blockers for "global, high-load" — and, tellingly, **both are completely untested** (§11.1–11.2).
- **Event-driven integrity (the deepest finding):** the consumer side is built correctly for at-least-once, but the producer side loses events (§12.2) and — most dangerously — an idempotency guard makes a lost follow-on event **permanently unrecoverable** (§12.3), while crons (§12.4) and notifications (§12.5) duplicate. The unifying fix is one rule: *no event leaves a state change except through an outbox written in the same transaction* (§12.10).
- **Worldwide frontend throughput:** eight fonts per page (§8.1) and no CDN/edge strategy (§8.2) — the levers that decide whether a hotsite feels fast in Jakarta or only in São Paulo.
- **Supply-chain process:** the *defaults* are excellent but the *automation* is missing — no Dependabot/Renovate (§10.1), `@master`-pinned CI actions with secret access (§10.3), unpinned base images (§10.2), and a brittle hand-deleted multer CVE (§10.6).
- **QA depth:** the *breadth* is good but the *adversarial* layer is thin — no concurrency tests, no failure-mode tests, no coverage floor, one-path E2E, and no contract tests at the service seam.
- **Operability, scale & compliance (the run-it-globally layer) — ⏸️ deferred to the GCP infra/deploy phase:** the genuinely *missing* domains, not just weak ones — an **unbounded DB connection pool** that will exhaust Postgres under autoscale (§13.1), **in-memory rate limiting** that doesn't limit across instances (§13.2), a **readiness probe that ignores dependencies** (§13.3), **OTel tracing/metrics documented but never wired** (§13.4), and **no LGPD/PII posture** despite serving Brazil (§13.5). Most are unlocked by introducing the one piece of infrastructure the whole system currently lacks: **Redis**. These are correctly parked until deployment — surfaced here so they're not forgotten, with §13.11 as the infra-phase checklist.

None of this requires re-architecting — each item drops into a seam the design already provides, and most fixes are small. Three sequencing insights stand out: **(1)** write the concurrency and event-failure tests (§11.1–11.2) *first*, because they are the executable specification for the backend blockers (§4.1–4.2, §12.3); **(2)** the **transactional outbox** is the highest-leverage single change — it closes §4.1, §12.2, and §12.3 together; **(3)** **introducing Redis + bounding the DB pool** is the highest-leverage *operability* change — it unblocks distributed rate limiting, the settings cache, token revocation, and API idempotency at once, and prevents the most likely first production outage.

Fix the backend §4/§12 integrity items, cap the connection pool (§13.1), put a CDN in front of the hotsite (§8.2), automate the supply chain (§10.1–10.3), and write the LGPD plan (§13.5) — and the "mature SaaS to run globally" description stops being aspirational and becomes accurate. The foundation is unquestionably strong enough to carry it; what remains is the operational and adversarial hardening that turns a well-built system into a globally-operable one.
