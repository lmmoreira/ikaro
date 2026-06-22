# Ikaro — Agent Context (canonical)

> **AGENT EDITING NOTICE:** `CLAUDE.md`, `claude.md`, and `gemini.md` are all symlinks to **`.copilot/context.md`**. If you need to edit this file, always write to `.copilot/context.md` directly — never attempt to write through the symlinks.

**Symlinked as:** `claude.md`, `gemini.md`  
**Audience:** Any AI coding agent (Claude Code, Copilot CLI, Cursor, Aider, etc.)  
**Rule:** Read this file first on every conversation. Then use §10 to load only the docs you need.  
**Last updated:** 2026-06-22 (added two items surfaced by the M13-S05 PR: §8's anti-patterns table now flags a second, independent `fetch(...)` call building the same BFF route URL outside its canonical `lib/api/<name>.ts` fetcher — `lib/i18n/resolve-locale.ts` had its own copy of `lib/api/platform.ts`'s manifest URL, which silently went stale after a route rename and was only caught by Playwright (the duplicate's own unit test asserted the same stale URL, so it couldn't catch it); the fix pattern is a shared low-level `fetch<X>Response()` raw-`Response` helper that each caller layers its own error handling on top of — also added to `docs/ANTI_PATTERNS.md`, which was also backfilled with two M13-S04-era entries (`@ikaro/types` collision check, BFF mapper extraction) that had only ever made it into this file's §8 table. And §9 Step 9's "verify a bot's suggestion" rule now also covers severity/security claims, not just logic suggestions — CodeRabbit's "Critical" info-disclosure label on `BackendHttpService`'s catch-all re-throw didn't hold up against the actual installed `@nestjs/core`'s default exception filter behavior (verified by reading `node_modules` directly); tracked as `td/TD10-BFF-BACKEND-UNREACHABLE-GENERIC-500.md` instead at Low priority. Previously: added two items surfaced by the M13-S04 PR: §7's BFF naming section now says to grep `@ikaro/types` for a same-named export before declaring a new request/response interface in `apps/web/lib/api/**` — `td/TD09-WEB-TYPES-DRIFT-VS-IKARO-TYPES.md` documents 5 BFF modules where this had already silently drifted, in both directions (web stale vs. `@ikaro/types` stale); and a rule that a BFF controller's second pure response-mapping function should be extracted into a sibling `<module>.mapper.ts` of plain functions — not a class — matching `booking-error.mapper.ts`'s precedent, with `bookings.mapper.ts` as the new reference example. Both also added to §8's anti-patterns table. Previously: added two new `docs/ENGINEERING_RULES.md` sections surfaced by the TD02-S10 PR: "Adding a new notification type" — the full 7-step file checklist (enum → mapping → both locale JSON files → migration → use case → handler → tests) plus a gotcha that's easy to miss: `copyGlobalDefaultsForTenant` only runs once at tenant-provisioning time, so a new notification key never reaches tenants provisioned *before* the migration that added it, with no backfill mechanism today; and "Authoring new i18n UI copy keys" — always touch both locale files together, namespace by existing UI area, use ICU placeholders. Routed both from §10's table. Previously: added the `next-intl` Server-vs-Client-Component rule surfaced during the TD02-S09 PR: `useTranslations()` works in Server Components, only add `'use client'` for real interactivity or a Context-based hook like `useFormatting()` — see §7, `docs/CODE_STANDARDS.md`. Also added: a mandatory "actually run the Playwright suite, don't just curl-inspect HTML" rule and a sharpened E2E selector rule (translated text may be asserted as content, never used as the selector) — see `docs/08-TESTING_STRATEGY.md`; a note on verifying a bot-suggested PR fix against the real implementation before applying it (a suggestion can itself be wrong) — see §9 Step 9; and a clarification that Playwright/E2E coverage does not feed SonarCloud's coverage gate in this repo — see `docs/08-TESTING_STRATEGY.md`. Previously: added the RequestContext eager-load pattern and its invocation-context constraint surfaced during the TD02-S04 PR's RequestContext/settings refactor: prefer eager-loading per-request-shared data into `RequestContext` over a new Port+Adapter when many contexts need it; shared infrastructure called from more than one invocation context — repositories especially — must never read `RequestContext` directly, since cron jobs and event handlers run outside the HTTP interceptor that populates it. Also added a short note on reading non-TypeScript static files from a workspace package (`packages/i18n/locales/**`) via `require.resolve` — see `docs/ENGINEERING_RULES.md`, `docs/ANTI_PATTERNS.md`. Previously: added two anti-patterns surfaced during TD02-S04 review: duplicate cross-context Port+Adapter pairs for the same context pair, and shared-VO validation errors leaking as unmapped 500s — see §7, §8, `docs/ANTI_PATTERNS.md`, `docs/ENGINEERING_RULES.md`. Previously: rebranded the SaaS/product/repo from BeloAuto to Ikaro — see td/TD04-REBRAND-IKARO.md; BeloAuto remains a valid sample tenant. Removed the resolved CVE-2026-45447 §18 Dockerfile workaround — node:22-alpine now ships the patched libcrypto3/libssl3. Also corrected the product framing from car-wash-specific to vertical-agnostic, and added a Business Context note to §1.)

---

## 0. Permission Protocol (non-negotiable)

Before writing or editing any **documentation or architecture file** (`.md`, `.tf`, `.yml`, configs):

1. **Discuss** the change with the user.
2. **Summarise** what you intend to write.
3. **Ask:** "May I now create/update `<path>`?"
4. **Write only after** an explicit yes.

**Exception — code files within an approved story:** Once a story spec has been discussed and agreed, create all its `.ts` source and test files autonomously without asking per-file. The permission gate applies to `.md` docs, architecture docs, Terraform, and CI/CD config — not to code within an approved implementation.

Exceptions always: read-only ops (`Read`, `grep`, `ls`, `git status`, memory files).

**Commit & push gate (non-negotiable):** Before every `git commit` and every `git push`, stop and ask the user: *"Ready to commit [files]. Anything else to do first, or shall I commit and push?"* The pre-push hook runs `ci:fast` (~15 s) on every push — unnecessary pushes are expensive. Batch all changes, then ask once. Never commit or push autonomously.

**The same gate applies before `/pre-pr` and before `gh pr create` — never chain them automatically.** Both are expensive (`/pre-pr` re-runs full verification + integration tests; opening a PR is a visible, shared action). When an implementation/edit phase is finished, say so explicitly and ask: *"Implementation finished — anything else to commit, or shall I run `/pre-pr` and open the PR?"* Wait for explicit yes before running `/pre-pr`, and again before `gh pr create`, even if the underlying work was already approved earlier in the conversation.

**Branch-or-main choice for small doc-only edits:** If the change is doc-only (this file, a `CI_TRAPS.md` entry, a TD note — no code) and you're starting from `main`, don't automatically create a feature branch and run the full PR cycle. Ask first: *"Small doc-only change — want this on a new branch with a full PR, or should I just commit it directly to main?"* `git push`'s pre-push hook runs the full `ci:fast` suite every time, and `gh pr create` triggers CodeRabbit/Copilot review bots that bill per PR — disproportionate cost for a one-line markdown edit. Does not apply to any code change, which always needs a feature branch per §9 Step 1.

---

## 1. Project Facts

| Fact | Value |
|---|---|
| **Product** | Ikaro |
| **Type** | Multi-tenant SaaS — booking & loyalty platform for local service businesses (car wash is the flagship example vertical) |
| **Market** | Brazil 🇧🇷 |
| **Currency** | BRL (R$) — `Money` value object must carry currency code |
| **Locale** | pt-BR (email templates, UI copy, date/number formats) |
| **Default TZ** | `America/Sao_Paulo` (UTC-3); one timezone per tenant via `settings.business_hours.timezone` |
| **Branch** | `main` · Trunk-Based Development · short-lived `feat/UC-xxx` / `fix/xxx` branches |
| **Commits** | Conventional Commits (`feat(booking):`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`) |
| **Languages** | TypeScript strict mode — backend + frontend |
| **Backend** | NestJS v11 modular monolith |
| **BFF** | Separate NestJS v11 service (`apps/bff/`) |
| **Frontend** | Next.js 16 + React 19 |
| **Monorepo** | pnpm workspaces (`apps/`, `packages/`) |
| **ORM** | TypeORM v0.3+ |
| **DB** | PostgreSQL 15 — single shared schema, `tenant_id` everywhere |
| **DB migrations** | TypeORM migrations; run via **separate CI job** before deploy — app never auto-migrates at startup |
| **Event bus** | GCP Pub/Sub (prod) · GCP Pub/Sub Emulator (local dev docker-compose) · behind `IEventBus` port |
| **Auth** | Google OAuth 2.0 · JWT sessions (`sub` = backend entity UUID, `tenantId`, `tenantSlug`, `role` in payload) · BFF forwards `X-Actor-ID` / `X-Actor-Type` / `X-Actor-Role` headers to backend |
| **Storage** | S3-compatible (GCS/S3) · paths: `tenants/<tenant_id>/bookings/<booking_id>/<file>` |
| **Observability** | Prometheus + Grafana + OpenTelemetry + Loki + OTel Collector |
| **Container** | Docker · GCP Cloud Run (MVP) → Kubernetes if needed |
| **IaC** | Terraform (GCP provider MVP; cloud-agnostic adapters) |
| **Secrets** | GCP Secret Manager (MVP) → HashiCorp Vault if multi-cloud · `PLATFORM_ADMIN_KEY` (min 32 chars) protects `POST /internal/tenants` |
| **Errors** | RFC 9457 Problem Details on all non-2xx responses |
| **Coverage gate** | ≥ 80% on **changed code** (differential, not global) |
| **Rate limiting** | NestJS `@nestjs/throttler` on all public endpoints |
| **Feature flags** | Environment variables (`FEATURE_FLAG_XYZ=true`) — no external system for MVP |

**Business context:** Ikaro is the SaaS half of a two-part business — a sister **Ikaro Consulting** offering (coaching, content, growth strategy) serves the same local-service-business customer at a higher tier; this repo only implements the Platform. Long-term, the platform is meant to grow into a business-intelligence layer over the data it collects (bookings, loyalty, customer activity) — keep that direction in mind when shaping schemas/events, rather than assuming today's MVP scope is final. (See `UC-017 | Booking analytics | Future — out of MVP` in §6.)

---

## 2. Multi-Tenancy Invariants (NEVER violate)

Any code that breaks these is a defect regardless of test coverage.

1. Every table has `tenant_id UUID NOT NULL`, indexed first in every composite index.
2. Every query filters `WHERE tenant_id = :tenantId`. No exceptions.
3. Every domain event includes `tenantId`, `eventId` (idempotency key), `occurredAt` (ISO-8601 UTC), `correlationId`.
4. Composite FKs use `(tenant_id, id)` to block cross-tenant references at DB level.
5. **Customers are multi-tenant** — same Google `sub` → multiple `Customer` rows (one per tenant). No unique on `google_oauth_id` alone.
6. **Staff are single-tenant** — global `UNIQUE(google_oauth_id)` at DB level (not composite with `tenant_id` — the same Google account cannot be staff at two different tenants).
7. File paths prefixed by tenant (see §1 Storage).
8. Logs, metrics, traces include `tenant_id`. OTel span attrs: `tenant.id`, `user.id`, `correlation.id`.
9. Event consumers are idempotent (at-least-once delivery). Dedup via `eventId`.
10. JWT contains `tenantId`/`tenantSlug`. BFF rejects mismatches.
11. JWT `sub` is always the **backend entity UUID** — `staffId` for STAFF/MANAGER, `customerId` for CUSTOMER (never Google's OAuth `sub`). BFF forwards it as `X-Actor-ID`, along with `X-Actor-Type` (`STAFF`|`CUSTOMER`) and `X-Actor-Role` (`STAFF`|`MANAGER`|`CUSTOMER`). Guest requests carry none of the `X-Actor-*` headers. Backend reads these from `RequestContext`.

Raise a doc bug if a UC appears to violate these — do not "make it work."

---

## 3. Bounded Contexts (brief — load `docs/05-BOUNDED_CONTEXTS.md` for detail)

| Context | Type | Aggregates | Publishes |
|---|---|---|---|
| **Booking** | Core | `Booking`, `Service`, `ScheduleClosure` | `BookingRequested/Approved/Rejected/InfoRequested/InfoSubmitted/Completed/Cancelled/Rescheduled` + `BookingReminderDue`, `BookingReminderDueToday`, `AdminDailyScheduleReminder` |
| **Customer** | Supporting | `Customer` (multi-tenant rows) | — |
| **Staff** | Supporting | `Staff` (single-tenant) | `StaffInvited`, `StaffDeactivated` |
| **Loyalty** | Supporting | `LoyaltyEntry` (append-only), `LoyaltyBalance` (running total), `LoyaltyRedemption` (append-only) | `ServicePointsEarned`, `PointsExpiringSoon` |
| **Notification** | Supporting | `NotificationTemplate`, `NotificationLog` | `EmailSent`, `EmailFailed` |
| **Platform** | Foundational | `Tenant`, `HotsiteConfig` | `TenantProvisioned` |

**Loyalty MVP rules:** One immutable `LoyaltyEntry` per `BookingLine` completed. Idempotent via `UNIQUE(tenant_id, booking_line_id)`. Active balance stored in `loyalty_balances.current_points` (O(1) — not a SUM). Incremented on earn, decremented on redemption or daily expiry cron (idempotent via `balance_expiry_log`). Admins record redemptions via `POST /v1/loyalty/redeem`. No tiers, no manual bonus adjustments.

---

## 4. Event Envelope (every event)

```json
{
  "eventId": "uuid-v7",
  "tenantId": "uuid-v7",
  "occurredAt": "2026-05-11T14:23:45.123Z",
  "correlationId": "uuid-v7",
  "eventName": "BookingCompleted",
  "eventVersion": 1,
  "data": { }
}
```

For full payload definitions → `docs/03-DOMAIN_EVENTS.md`

---

## 5. Booking State Machine

```
PENDING        → INFO_REQUESTED | APPROVED | REJECTED | CANCELLED
INFO_REQUESTED → PENDING (customer responded) | APPROVED | REJECTED | CANCELLED
APPROVED       → COMPLETED | CANCELLED
COMPLETED      (terminal)
REJECTED       (terminal)
CANCELLED      (terminal)
```

`NO_SHOW` is **not** in MVP. UC-014 and UC-015 are **superseded** by UC-021/UC-022 — do not implement.

---

## 6. Use Cases Index (load `docs/04-USE_CASES.md` for detail)

| UC | Title | Status |
|---|---|---|
| UC-001 | Guest requests booking | Active |
| UC-002 | Authenticated customer requests booking | Active |
| UC-003 | Admin approves booking | Active |
| UC-004 | Admin rejects booking | Active |
| UC-005 | Admin requests more info | Active |
| UC-006 | Customer views & manages bookings | Active |
| UC-007 | Customer cancels booking (48 h window from `settings`) | Active |
| UC-008 | Admin cancels / reschedules booking | Active |
| UC-009 | Admin marks booking complete + after-photos | Active |
| UC-010 | Staff manages schedule closures and openings | Active |
| UC-011 | Guest views calendar availability | Active |
| UC-012 | Admin creates service | Active |
| UC-013 | Admin edits / deactivates service | Active |
| UC-014 | Customer login | **SUPERSEDED by UC-021** |
| UC-015 | Staff login | **SUPERSEDED by UC-022** |
| UC-016 | View customer loyalty metrics | Active |
| UC-017 | Booking analytics | Future — out of MVP |
| UC-018 | Admin daily schedule reminder (6 AM) | Active |
| UC-019 | Customer reminder day-before (6 AM) | Active |
| UC-020 | Customer reminder day-of (6 AM) | Active |
| UC-021 | Customer login + tenant selection | Active (canonical) |
| UC-022 | Staff login — single tenant | Active (canonical) |
| UC-023 | Customer switches tenant | Active |
| UC-024 | Platform operator provisions new tenant (REST API) | Active |
| UC-025 | Admin first login / accepts invite | Active |
| UC-026 | Admin edits tenant settings | Active |
| UC-027 | Admin manages hotsite content | Active |
| UC-028 | Admin invites new staff member | Active |
| UC-029 | Admin deactivates staff member | Active |

**Missing UCs (do not implement until documented):** Customer profile edit beyond the minimal phone-collection step (UC-021 A3 / M13-S02), audit log view, notification template management, failed-notification retry.

---

## 7. Engineering Rules

→ Full detail on VOs, transactions, event handlers, and test patterns: `docs/ENGINEERING_RULES.md` (load when writing any code).

### Hexagonal layers (per context)
```
src/contexts/<context>/
├── domain/           # entities, value objects, domain events, domain services — zero framework deps
├── application/      # use cases, ports (interfaces), DTOs
└── infrastructure/   # adapters: persistence, REST controllers, event publishers, HTTP clients
```
Shared cross-cutting code → `src/shared/` (logger, OTel, `IEventBus` port, tenant-context).

### Value objects
Domain-validated fields → `src/shared/value-objects/` (never plain primitives). Aggregate props use VO types (Option A): getters return VOs; `create()` constructs from raw strings; `reconstitute()` skips validation.
→ Full VO catalogue + mapper patterns: `docs/ENGINEERING_RULES.md`.

### Code standards

→ Full mandatory rules: `docs/CODE_STANDARDS.md`. Critical invariants always active:

- `strict: true` — no `any`, no `@ts-ignore`, no `// eslint-disable`. Functions ≤ 20 lines, classes ≤ 200.
- Controllers call use cases only. No business logic in controllers.
- Domain errors thrown by use cases; `mapXxxError(err: unknown): never` at HTTP layer; controller = `return this.useCase.execute(dto).catch(mapXxxError)`. Never throw `HttpException` from a use case.
- Use case result: `{UseCaseClassName}Result`. DTO: `{Action}Dto`. Zod schema: `{Action}Schema`.
- **Aggregate-driven events:** `this.addDomainEvent()` in aggregate method; flush `clearDomainEvents()` **after** `txManager.run()`. Never publish events directly from a use case.
- `correlationId` from `RequestContext.correlationId` (not `uuidv7()`). Domain error base class needs `Object.setPrototypeOf(this, new.target.prototype)` after `super()`.
- Zod v4: `z.uuid()` / `z.email()` — never `z.string().uuid()` / `z.string().email()`.
- `/internal` routes skip `RequestInterceptor`. `RequestModule` is not `@Global()` — import explicitly in every module whose controller injects `RequestContext`.
- Domain events belong in the publishing context (`StaffInvited` in `staff/domain/events/`, not `platform/`).
- **All code is English-only** — identifiers, comments, file names, commit messages, and domain error messages. Only literal strings rendered to the end user (UI copy, validation/error text, email templates) follow the tenant's locale — pt-BR for BR tenants. This applies everywhere, including milestone/story specs in `plan/` — a story's field labels and error copy are pt-BR because that's what ships in the UI, not an exception to the rule.
- Default params must come after required params (SonarCloud S1788).
- No barrel `index.ts` in `ports/` or `shared/domain/` — ESLint enforces. Every new REST endpoint → `.http` file.
- `next-intl`'s `useTranslations()` works in Server Components — no `'use client'` needed, it ships a dedicated `react-server` build. Only add `'use client'` for real interactivity (state/effects/DOM APIs) or a Context-based hook like `useFormatting()`. Default hotsite/SEO-facing components to Server Components. → `docs/CODE_STANDARDS.md`.

### Cross-context data access (priority order — follow strictly)

When Context A needs data owned by Context B, choose the **first** option that applies:

1. **Domain events (preferred — async):** Context B publishes; Context A subscribes and projects into its own read model.
2. **BFF orchestration (preferred — sync read):** BFF calls both contexts independently. No context knows the other.
3. **Port + adapter (last resort — sync, same process):** Interface in Context A's `application/ports/`. Adapter injects Context B's **service** (never its repository token). Before adding a new port, grep `infrastructure/cross-context/` for an existing adapter between the same two contexts — extend it with a new method rather than creating a parallel one (TD02-S02 created `ITenantLocalizationPort` alongside the already-existing `IBookingPlatformPort`, both booking→platform — found and merged in TD02-S04).

**Never** a direct SQL JOIN across contexts inside a repository. A repository queries its own schema only.

### BFF module & controller naming
BFF modules are named after their **bounded context** (§3), never an aggregate (`platform/`, not `tenants/` — `Tenant` is one aggregate inside the Platform context). Within a module: `<context>.controller.ts` = authenticated/role-guarded (dashboard); `<context>.public.controller.ts` = `@Public()` unauthenticated (hotsite) — both may share `@Controller('<path>')` if method+path combos don't collide, and one `.public.controller.ts` may serve multiple hotsite module types. Public response types live in `@ikaro/types` as `Hotsite<Resource>Response` / `Hotsite<Resource>ListResponse`. Frontend fetchers `apps/web/lib/api/<name>.ts` mirror the BFF module name they call. Before declaring a new request/response interface in `apps/web/lib/api/**`, grep `@ikaro/types` for an export of the same or a similar name first — if one already exists but the shape looks different, verify against the live BFF schema which side is actually correct before assuming the shared package wins (`@ikaro/types` itself was the stale side in several cases found in `td/TD09-WEB-TYPES-DRIFT-VS-IKARO-TYPES.md`).

Once a controller needs a **second** pure response-mapping function (e.g. shaping the same backend data differently per actor role), extract them into a sibling `<module>.mapper.ts` as plain exported functions — never a class, matching `booking-error.mapper.ts`'s precedent — instead of letting them accumulate inline in the controller. `bookings.mapper.ts` (extracted from `bookings.controller.ts` in `M13-S04`) is the reference example; its own `.mapper.spec.ts` tests the mapping logic directly, without NestJS/HTTP mocking.
→ Full detail: `docs/24-BFF_ARCHITECTURE.md` § Module & Controller Naming Conventions.

### Transactions
Every `save()` must be wrapped in `ITransactionManager.run()` — single-aggregate writes too. Scope: reads/validations/mutations happen *before* `txManager.run()` opens; wrap only the `save()` call(s).
→ Artifact locations, test wiring, multi-aggregate rules: `docs/ENGINEERING_RULES.md`.

### Event handlers
- **Thin by law:** `handle()` calls exactly one use case and rethrows. Zero domain logic.
- **Idempotency in the use case** — DB check via `findByXxx`. No in-memory sets (lost on restart).
- Pass `event.correlationId` into the DTO — never generate a new UUID in the handler.
→ Pub/Sub naming, subscribe pattern, test wiring tables: `docs/ENGINEERING_RULES.md`.

### Testing (backend + BFF)
Three layers: **Unit** (`.spec.ts`) · **Integration** (`.integration.spec.ts`) · **E2E** (Playwright). Full patterns → `docs/08-TESTING_STRATEGY.md` + `docs/ENGINEERING_RULES.md`.

- Every UC: ≥1 unit + ≥1 integration + ≥1 tenant-isolation test. SonarCloud ingests unit only — every controller/use case needs `.spec.ts`.
- **Builders mandatory** — class + `withXxx()` / `build()`. Never factory functions. **InMemory doubles** over `jest.fn()`.
- No `.skip()`, `.only()`, `setTimeout`. Integration DB isolation: unique inline tenant UUID for count assertions.
- New migration/entity → register in `integration-global-setup.ts` in the **same commit**. Missing = silent integration test failure.
- Integration app helpers must default-override network-calling adapters (e.g. `STORAGE_SERVICE`). Use `useClass` not `useExisting` in module providers.

### Testing (apps/web)
Test runner: **Vitest** (not Jest) — config at `apps/web/vitest.config.ts`. Scripts: `test`, `test:cov`, `test:watch`.

#### What to test and how

**`lib/**` — pure functions, fetchers, route handlers:** Vitest in `node` environment. This is the original scope.

**`components/hotsite/**` — module components:** Vitest + `@testing-library/react` in `jsdom` environment. See infrastructure and per-component test table below.

**`app/**/page.tsx`, `app/**/layout.tsx` — server component pages/layouts:** **Do NOT unit-test.** These require the full Next.js runtime (`notFound()`, `generateMetadata`, ISR, `cookies()`, `headers()`). Tested by Playwright E2E only.

**Interactive client components with complex stateful flows** (e.g. multi-step booking form): Playwright E2E. Simple `'use client'` leaf components with no async Next.js API calls are testable with `@testing-library/react`.

#### Why module components are different from pages/layouts

Hotsite module components (`HeroModule`, `ServiceListModule`, etc.) are **synchronous functions that receive fully-resolved props and return JSX** — no Next.js runtime APIs, no `async`, no `fetch`. The "do not test" rule applies to pages and layouts specifically because they call Next.js functions unavailable in jsdom. Module components carry none of those dependencies; they are as testable as any pure React component.

#### Module component testing infrastructure (established in M12-S04)

**Dependencies (`apps/web` devDependencies):**
- `@testing-library/react` — component rendering in jsdom
- `@testing-library/jest-dom` — DOM matchers (`toBeInTheDocument`, `toHaveAttribute`, etc.)
- `@testing-library/user-event` — user interaction simulation (required for M12-S07 booking form)

**`vitest.config.ts` additions:**
```ts
// resolve.alias — module-level side effects that must be globally swapped
resolve: {
  alias: {
    'next/font/google': path.resolve(__dirname, '__mocks__/next-font-google.ts'),
    'next/image':       path.resolve(__dirname, '__mocks__/next-image.ts'),  // LCP images; has same module-eval problem
  },
},
```

**Per-file environment declaration:** `environmentMatchGlobs` is not available in Vitest v4's TypeScript types (and did not function in testing). Each component spec file must declare its environment explicitly at line 1:
```ts
// @vitest-environment jsdom
```
`lib/**` stays in the default `node` environment — no change, no annotation needed.

**`apps/web/__mocks__/next-image.ts`** (same pattern as `next-font-google.ts` — global alias, not per-file mock):
```ts
import React from 'react';
const MockImage = ({
  src, alt, fill: _, priority: __, sizes: ___, ...rest
}: React.ImgHTMLAttributes<HTMLImageElement> & {
  src: string; alt: string; fill?: boolean; priority?: boolean; sizes?: string;
}) => React.createElement('img', { src, alt, ...rest });
export default MockImage;
```

**`vitest.setup.ts`:**
```ts
import '@testing-library/jest-dom/vitest';
// Global test setup — /vitest entrypoint registers types for Vitest's expect();
// bare @testing-library/jest-dom leaves toBeInTheDocument() etc. untyped in strict mode.
```

**`next/navigation`** (`useRouter`, `usePathname`, etc.) and **`next/cache`** (`revalidatePath`) still use per-file `vi.mock()` when needed — they do not have the module-eval side-effect that requires a global alias.

#### Per-component test focus (S04–S07)

Every hotsite module component requires a `*.spec.tsx` alongside it. Minimum coverage per component:

| Component | Key test cases |
|---|---|
| `HeroModule` | `variant: 'centered'` and `'left-aligned'` both render; title and optional subtitle present; `ctaTarget: 'booking'` → `href="#booking-form"`; `ctaTarget: 'service-list'` → `href="#service-list"`; no `backgroundImageUrl` → no `<img>`, primary bg applied; with `backgroundImageUrl` → `<img>` with correct `src`; `subtitle` absent → no subtitle element |
| `ServiceListModule` | Cards rendered from mocked data; `showPrices: false` → price badge absent; `showPoints: false` → points badge absent; zero services → pt-BR empty-state message; section has `id="service-list"` |
| `GalleryModule` | 8 images + `maxVisible: 6` → all 8 images in DOM (extras marked `data-gallery-extra`), "Ver mais" button present; clicking "Ver mais" sets `data-gallery-expanded="true"` on wrapper; `images: []` → section not rendered; `source: 'booking'` + `photoType: 'before'` → "Antes" badge; `source: 'booking'` + `photoType: 'after'` → "Depois" badge; images rendered with `loading="lazy"` |
| `TestimonialsModule` | Items render with author name and text; `rating: 4` → 4 filled stars; no `rating` → no star elements; `layout: 'carousel'` → carousel structure present |
| `AboutModule` | `imagePosition: 'left'` → image before text in DOM; `imagePosition: 'right'` → image after text in DOM; `imageUrl` absent → no `<img>`; markdown `body` rendered as HTML; `<script>` tag in `body` stripped (XSS) |
| `ContactModule` | `showMap: false` → no `<iframe>`; `showWhatsapp: false` → no WhatsApp link; `showAddress: false` → no address block; WhatsApp link opens `wa.me/` with correct number |
| `BookingCtaModule` | CTA links to `/<slug>/booking`; section has `id="booking-form"` |

**Every hotsite module component spec must also include a `has no axe violations` assertion** using `jest-axe`:
```ts
it('has no axe violations', async () => {
  const { container } = render(<HeroModule data={makeData()} slug="tenant" />);
  expect(await axe(container)).toHaveNoViolations();
});
```
- `toHaveNoViolations` is registered globally in `vitest.setup.ts` via `expect.extend(toHaveNoViolations)` — no per-file setup needed.
- The `color-contrast` axe rule is **disabled globally** in `vitest.setup.ts` (`configureAxe({ rules: { 'color-contrast': { enabled: false } } })`). Reason: jsdom cannot resolve CSS custom properties (`--ba-primary`, `--ba-hero-bg`, etc.) so the rule always false-positives on branding tokens. WCAG AA contrast correctness is covered instead by the `contrastRatio` unit tests in `apply-branding.spec.ts`.
- `ContactModule` passes `{ iframes: false }` to `axe()` because jsdom cannot scan cross-origin `<iframe>` content (Google Maps embed) via `postMessage`.
- This colour-contrast caveat is **hotsite-specific**. Dashboard and account components use Ikaro's fixed design system (no CSS custom property branding tokens) — their axe assertions should use the full default ruleset including `color-contrast`.

#### SonarCloud configuration
- `sonar.coverage.exclusions`: `apps/web/app/**/page.tsx`, `apps/web/app/**/layout.tsx` — **`apps/web/components/**` is NOT excluded** because module components now have Vitest tests and must contribute to the coverage gate.
- `sonar.exclusions`: `**/vitest.config.ts`, `**/__mocks__/**`, `**/vitest.setup.ts`.

#### Other standards
- `next/font/google` calls font-loader functions at module-evaluation time — a module-level side effect. Per-file `vi.mock()` is too late. Use a **global `resolve.alias`** in `vitest.config.ts` pointing to `apps/web/__mocks__/next-font-google.ts`. Modules with runtime-only deps (`next/cache`, `next/navigation`) can use per-file `vi.mock()` normally.
- React component props interfaces: every field must be **`readonly`** (SonarCloud S6759 — fires on every new component).
- Import Node.js built-ins with the `node:` prefix (`node:path`, `node:fs`) — bare names are flagged by SonarCloud.
- Functions returning CSS custom properties: declare return type as `React.CSSProperties & Record<\`--ba-${string}\`, string>` — never use `as React.CSSProperties` assertion (SonarCloud smell).

### CI gates (block merge)
- ESLint + Prettier — zero warnings
- `tsc --noEmit` — zero errors
- All tests pass — 100%
- Coverage ≥ 80% on changed code
- SonarCloud Quality Gate GREEN
- Snyk SCA — zero high/critical vulns
- Gitleaks — zero secrets detected
- Trivy image scan — zero high/critical
- Checkov/Tfsec IaC scan — zero high

### Definition of Done
- [ ] Matches cited UC's main + alt flows
- [ ] Unit + integration + tenant-isolation tests pass
- [ ] Coverage delta ≥ 80% on changed code
- [ ] All queries filter by `tenant_id`
- [ ] All events use standard envelope with `tenantId`, `eventId`, `correlationId`
- [ ] No hardcoded config values — read from `tenants.settings`
- [ ] No secrets in code
- [ ] Migration is backward-compatible (expand/contract)
- [ ] CI passes locally: `pnpm lint`, `pnpm test`, `pnpm type-check`
- [ ] API change reflected in `docs/14-API_CONTRACTS.md` (with permission)
- [ ] Conventional Commit + PR description links the UC

---

## 8. Anti-Patterns (BLOCK MERGE)

Full list in `docs/ANTI_PATTERNS.md` (checked by `/pre-pr`). Silent-failure patterns — highest risk:

| Pattern | Problem | Fix |
|---|---|---|
| `WHERE id = ?` without `tenant_id` | Cross-tenant data leak | Add `AND tenant_id = ?` |
| Event missing `tenantId` in envelope | Can't isolate per tenant | Include in every event |
| Throwing `HttpException` directly from a use case | Couples app layer to HTTP | Throw domain errors only; `mapXxxError` converts them |
| Publishing events directly from a use case | Bypasses aggregate encapsulation; wrong `correlationId` | Record via `addDomainEvent()`; flush after `txManager.run()` |
| Missing `Object.setPrototypeOf(this, new.target.prototype)` in domain error base class | `instanceof` fails silently — every error mapper falls through to 500 | Add immediately after `super()` in every `XxxDomainError extends Error` base class |
| `RequestModule` missing from a module that injects `RequestContext` | NestJS DI fails — integration tests crash with `TypeError: Cannot read properties of undefined` | Every module with a controller injecting `RequestContext` must import `RequestModule` |
| `useExisting` registering adapter as standalone class: `providers: [GcsSignedUrlAdapter, { provide: STORAGE_SERVICE, useExisting: GcsSignedUrlAdapter }]` | Class instantiated even when token overridden in tests — `onApplicationBootstrap` network calls run → `ECONNREFUSED` | Use `useClass`: `providers: [{ provide: STORAGE_SERVICE, useClass: GcsSignedUrlAdapter }]`; integration app helpers must also default-override the token |
| Creating a new cross-context Port+Adapter when one already exists for the same context pair | Duplicate adapters drift apart; the new one often ships without its own `.spec.ts` | Grep `infrastructure/cross-context/` for an existing adapter between the same two contexts first; add a method to it instead |
| Shared VO's `create()` throws a plain `Error` for a rule the DTO's Zod schema can't fully replicate (e.g. country-specific format) | `mapXxxError`'s `if (err instanceof Error) throw err` fallthrough turns it into an unhandled 500 instead of a 400 | Give the VO a typed error class; add an `instanceof` branch to every calling context's error mapper |
| Declaring a new request/response interface in `apps/web/lib/api/**` without checking `@ikaro/types` first | Either duplicates a correct shared type (drifts silently — found in 5 BFF modules, `td/TD09-WEB-TYPES-DRIFT-VS-IKARO-TYPES.md`) or, if `@ikaro/types` is itself stale, blindly importing it ships a wrong contract | Grep `@ikaro/types` for the same/similar name; if shapes differ, verify against the live BFF schema which side is correct before picking one |
| Inline `to*` response-mapping functions accumulating in a BFF `*.controller.ts` | Controller grows untestable in isolation — mapping logic can only be exercised through full HTTP-mock setup | Once a second mapper function appears, extract both into a sibling `<module>.mapper.ts` (plain functions, not a class) with its own direct-call spec |
| A second, independent `fetch(...)` call building the same BFF route URL outside the canonical `lib/api/<name>.ts` fetcher | Renaming/moving the route updates the canonical fetcher but silently misses the duplicate; the stale URL 404s and falls back to a default, masked because the duplicate's own unit test asserts `fetch` was called with the same stale URL — only caught by Playwright hitting the real BFF (M13-S05) | Extract a shared low-level `fetch<X>Response()` raw-`Response` helper in the canonical fetcher file; each caller layers its own error handling on top instead of building the URL independently |

---

## 9. Story Implementation Workflow (mandatory — every story, no exceptions)

> ❗ **NON-NEGOTIABLE PR GATE — READ THIS BEFORE TOUCHING `gh pr create`**
>
> **`gh pr create` is FORBIDDEN until `/pre-pr` is complete.**
> The sequence is always:
> 1. `git push` → ci:fast pre-push hook runs (unit tests only — NOT sufficient alone)
> 2. `/pre-pr` → all 4 steps in order — Step 4 is a hard stop: ask the user to run integration tests and wait for their pasted output
> 3. Only after Step 4 clears → `gh pr create`
>
> ci:fast passing does NOT mean integration tests passed. SonarCloud issues, missing .http files, VO violations, and cross-tenant leaks are only caught by `/pre-pr`. Skipping it has caused repeated CI failures and user frustration.

**Before the first story of a new milestone:** ask the user whether to run `/docs-audit M0X` first, scoped to that milestone, to catch stale/inconsistent docs before implementation starts. This is an offer, not a forced block like the journey hard-stop above — proceed either way based on their answer.

### Step 1 — Create feature branch (BEFORE writing any code)
`git checkout -b feat/M0X-SYY-<short-description>`

Never write code on `main`. If already on `main` with uncommitted changes, stash first.

### Step 2 — Implement the story
Write all files defined in the story spec. See §0 for permission rules.

### Step 3 — Verify locally before committing
Run type-check, lint, and jest for the changed context — zero errors and warnings required.

### Step 4 — Commit with Conventional Commit
> ⚠️ **ASK BEFORE COMMITTING.** Tell the user what files will be staged and ask: *"Anything else to add before I commit and push?"* Wait for explicit go-ahead. Never commit autonomously.

Stage specific files only (never `git add -A` or `git add .`). Message format:
```
feat(<context>): <description> (M0X-SYY)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

### Step 5 — Push (pre-push hook runs `ci:fast` automatically)
> ⚠️ **ASK BEFORE PUSHING** (if not already covered by the Step 4 ask). The pre-push hook runs `ci:fast` (lint + prettier + type-check + unit tests, ~15 s) — every unnecessary push costs time. Batch all commits first, then push once with user approval.

`git push -u origin feat/M0X-SYY-<short-description>`

`ci:fast` = lint + prettier + type-check + unit tests (~15 s). If it fails the push is blocked. Fix, re-commit, re-push.

### Step 6 — Run `ci:local` (optional)
`pnpm ci:local` (~5 min, Docker required). Run only when touching Dockerfiles, infra, or integration-test paths.

### Step 7 — Self-review the full diff (MANDATORY — before every PR)
**Stop and ask before starting this step** — per §0's commit & push gate, `/pre-pr` never runs automatically after a push. Confirm with the user first.

Run `/pre-pr` — must report **zero issues** before the PR is opened.

> **AGENT HARD RULE — NO EXCEPTIONS:**
> You MUST run `/pre-pr` and wait for it to report zero issues AND receive the user's integration test output (Step 4 of the `/pre-pr` skill) before calling `gh pr create`. Skipping or reordering these steps is a critical workflow violation. The pre-push hook only runs unit tests; integration tests are only caught here. Even if ci:fast passes, even if all unit tests pass — **do not open the PR until `/pre-pr` Step 4 is complete and the user has pasted passing integration test output.**

### Step 8 — Open the PR
```bash
gh pr create --title "feat(<context>): <description> (M0X-SYY)" \
  --body "## Summary\n- <bullet>\n\n## Story\nM0X-SYY — <title>\n\n## Test plan\n- [ ] Unit tests pass\n- [ ] Type-check clean\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)" \
  --repo lmmoreira/ikaro
```

### Step 9 — Monitor CI; self-fix any failure
`gh pr checks <PR-number> --repo lmmoreira/ikaro` — fix → commit → push → re-check until all green.

Also check Copilot/CodeRabbit inline review comments — they don't block merge via `gh pr checks` and won't show up there, so nothing forces you to look. Fetch them with `gh api repos/lmmoreira/ikaro/pulls/<PR-number>/comments` (inline) and `gh api repos/lmmoreira/ikaro/pulls/<PR-number>/reviews` (review bodies). Triage each: fix what's valid and in scope, skip with a stated reason what isn't (e.g. findings on a file from an unrelated commit on the same branch).

**Verify a bot's suggested fix against the actual implementation before applying it — the suggestion itself can be wrong.** TD02-S09: CodeRabbit flagged a real inconsistency (two date-parsing calls in an E2E spec used different timezone handling) and suggested making both explicit UTC — but the underlying app code (`dayCarouselLabel()` vs `formatDateLong()`) deliberately uses different conventions (local time vs explicit UTC) in those two functions. Applying the suggestion as written would have "fixed" the inconsistency by making the test wrong in a different way. Read the actual source the test exercises before accepting a bot's diff, especially for anything touching dates/timezones, locale, or async ordering.

This applies to severity/security claims too, not just logic suggestions — a bot's confidence label is not evidence. M13-S05: CodeRabbit flagged `BackendHttpService`'s catch-all re-throw as "Critical" info-disclosure (raw error messages/stack traces reaching API consumers). Reading the actual installed `@nestjs/core` source (`BaseExceptionFilter.handleUnknownError`) showed Nest's built-in filter — present even with zero custom filters registered — already returns a fixed generic `{"statusCode":500,"message":"Internal server error"}` for any non-`HttpException` error and logs the real exception server-side only. The finding wasn't fabricated (a `502` would be clearer than a generic `500`), but "Critical"/"exposes internal details to consumers" did not hold up against the framework's actual default behavior — tracked instead as `td/TD10-BFF-BACKEND-UNREACHABLE-GENERIC-500.md` at Low priority. Check the framework's own source (`node_modules/.pnpm/...`) before accepting a security severity label at face value.

### Step 10 — Ask user before merging (MANDATORY)
Once all CI checks are green, ask: *"All checks are green on PR #N. Have you reviewed it and are you happy to merge?"*

**Never merge without explicit user confirmation.** Then: `gh pr merge <PR-number> --repo lmmoreira/ikaro --squash --delete-branch && git checkout main && git pull origin main && git branch -D <branch-name>`

`--delete-branch` only deletes the **remote** branch — always also delete the local branch (`git branch -D <branch-name>`, not `-d`: squash merges aren't recognized as "fully merged" by git's safe-delete check, so `-d` will refuse). Do this for every merged PR, no exceptions.

### Step 11 — Mark story done (only after the squash commit is on `main`)
Run `/mark-done M0X-SYY`. The skill updates the plan file, commits to main, and alerts if all stories in the milestone are now done.

### Step 12 — Milestone complete? Create wrap-up docs
If every story in the milestone is now `✅ Done`, see §15 item 9 for the two wrap-up files to create.

---

## 10. Dynamic Context Loading — Load Only What You Need

**Always start with this file.** Then use the table below to load only the docs relevant to your task.

| Task | Docs to load | ~KB |
|---|---|---|
| Quick clarification | This file only | 0 |
| Writing any code | `docs/CODE_STANDARDS.md` + `docs/AGENT_PATTERNS.md` + `docs/ENGINEERING_RULES.md` | 8 |
| CI failure / pre-PR debugging | `docs/CI_TRAPS.md` | 1 |
| Implement a UC | `docs/04-USE_CASES.md` (that UC's section) + `docs/02-DOMAIN_MODEL.md` (relevant aggregate) + `docs/03-DOMAIN_EVENTS.md` (relevant events) | 4–6 |
| Database / migration | `docs/13-DATABASE_SCHEMA.md` + `docs/02-DOMAIN_MODEL.md` (relevant aggregate) | 4 |
| API endpoint | `docs/14-API_CONTRACTS.md` + the cited UC | 3–5 |
| Event handler | `docs/03-DOMAIN_EVENTS.md` (event) + `docs/05-BOUNDED_CONTEXTS.md` (context) + `docs/ENGINEERING_RULES.md` | 4 |
| New notification type / email template | `docs/ENGINEERING_RULES.md` § Adding a new notification type (full file checklist + the existing-tenant backfill gotcha) | 1 |
| New UI copy / locale key (`apps/web`) | `docs/ENGINEERING_RULES.md` § Authoring new i18n UI copy keys + `docs/CODE_STANDARDS.md` (next-intl Server/Client rule) | 1 |
| Hotsite / public frontend | `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` + `docs/14-API_CONTRACTS.md` (tenants section) + `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` (folder structure) | 4 |
| Dashboard / admin frontend | `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` + `docs/14-API_CONTRACTS.md` | 3 |
| BFF implementation | `docs/24-BFF_ARCHITECTURE.md` + `docs/14-API_CONTRACTS.md` | 4 |
| Architecture question | `docs/11-ARCHITECTURE.md` + `docs/05-BOUNDED_CONTEXTS.md` + `docs/REPOSITORY_STRUCTURE.md` | 6 |
| Repo layout / new file location | `docs/REPOSITORY_STRUCTURE.md` | 1 |
| Multi-tenancy / isolation | `docs/06-TENANT_ISOLATION_STRATEGY.md` | 2 |
| Testing patterns | `docs/08-TESTING_STRATEGY.md` + `docs/ENGINEERING_RULES.md` | 4 |
| Value objects / aggregate mappers | `docs/VALUE_OBJECTS_REFERENCE.md` + `docs/ENGINEERING_RULES.md` | 2 |
| CI / pipelines | `docs/09-CI_CD_PIPELINE.md` + `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md` | 4 |
| Deployment / infra | `docs/12-DEPLOYMENT_STRATEGY.md` + `docs/22-TECH_STACK_DECISIONS.md` | 5 |
| Observability | `docs/10-OBSERVABILITY_STRATEGY.md` | 2 |
| Full feature (UC + API + DB + tests) | All of the above relevant rows | 12–18 |
| Working on M01+ (any backend/BFF/web task) | `plan/M00-MONOREPO-FOUNDATION_IMPLEMENTATION_DETAILS_IA.md` | 3 |
| Working on M02+ (CI, Dockerfiles, deployment) | `plan/M01-CI-QUALITY-GATES_IMPLEMENTATION_DETAILS_IA.md` | 2 |
| Working on M03+ (Platform context, TenantContext, TypeORM setup, settings, deepMerge) | `plan/M02-PLATFORM-CONTEXT_IMPLEMENTATION_DETAILS_IA.md` | 3 |
| Working on M04+ (auth, BFF guards, OAuth flow, JWT, tenant switching, Zod validation) | `plan/M03-AUTHENTICATION_IMPLEMENTATION_DETAILS_IA.md` | 3 |
| Working on M05+ (Staff aggregate, Notification context, staff invite/deactivate, IDeliveryChannel) | `plan/M04-STAFF-MANAGEMENT_IMPLEMENTATION_DETAILS_IA.md` | 4 |
| Working on M06+ (Service aggregate, PATCH partial-update, public BFF endpoints, TenantContextBuilder) | `plan/M05-SERVICE-CATALOG_IMPLEMENTATION_DETAILS_IA.md` | 3 |
| Working on M07+ (ScheduleClosure, availability algorithm, `time` columns, calendar-date utils) | `plan/M06-CALENDAR-SCHEDULE_IMPLEMENTATION_DETAILS_IA.md` | 4 |
| Working on M08+ (Booking aggregate, BookingLine, RequestBookingUseCase, postForPublic(), linesModified) | `plan/M07-BOOKING-CREATION_IMPLEMENTATION_DETAILS_IA.md` | 4 |
| Working on M09+ (booking approval, slot conflict, guest info token, paginated list, role-based filtering) | `plan/M08-BOOKING-APPROVAL_IMPLEMENTATION_DETAILS_IA.md` | 4 |
| Working on M10+ (customer/admin cancel, reschedule, BookingCancelled/Rescheduled events, BaseNotificationUseCase) | `plan/M09-CANCELLATION-RESCHEDULING_IMPLEMENTATION_DETAILS_IA.md` | 4 |
| Working on M11+ (LoyaltyEntry/Balance/Redemption, balance expiry HTTP trigger, ILoyaltyTenantSettingsPort) | `plan/M10-COMPLETION-LOYALTY_IMPLEMENTATION_DETAILS_IA.md` | 5 |
| Working on M12+ (NotificationTemplate/Log, Pub/Sub DLQ, cron reminders, processed_events) | `plan/M11-NOTIFICATIONS-CRON_IMPLEMENTATION_DETAILS_IA.md` | 5 |
| Working on M13+ (dashboard frontend; hotsite module system, branding tokens, ISR/revalidation, booking form, SEO, public/private storage) | `plan/M12-HOTSITE-FRONTEND_IMPLEMENTATION_DETAILS_IA.md` | 11 |
| Working on M115 (GCS signed-URL, dev-login, InternalApiGuard, `contact*` rename) | `plan/M115-PRODUCTION-READINESS_IMPLEMENTATION_DETAILS_IA.md` | 3 |
| Working on TD02 (localization — CountrySpec registry, Money VO, PhoneNumber E.164, address validation, next-intl, i18n locale files) | `td/TD02-LOCALIZATION.md` | 6 |
| Writing new journeys or prototypes (`plan/journey/`) | `plan/journey/README.md` | 3 |

**Anti-patterns reference:** `docs/ANTI_PATTERNS.md` — full table; loaded automatically by `/pre-pr`.

**Never load:** anything under `docs/archive/` — superseded content.  
**Never load:** `plan/*_DEVELOPER.md` files — written for the human developer, not for agents.

**Drafting a new milestone:**
- If a milestone's stories are easier to author split across multiple working files (e.g. one per feature area), that's fine during drafting — but consolidate them into the single canonical `plan/M0X-<NAME>.md` file and add it to the table above before any story is implemented. Don't leave the split files as the permanent record; `M124`–`M129` existed as untracked drafts for weeks before being folded back into `M13`, and nobody could tell during that window that they'd superseded the original M13 draft.
- When sequencing a full-stack milestone's stories, pull every backend/BFF-only story (no frontend-shell dependency) into one early wave regardless of which feature area it belongs to. This prevents a later frontend story from shipping before a field/endpoint it needs exists — exactly the kind of gap that ordering stories strictly within each feature area would hide.

---

## 11. Repository Layout

→ Full directory trees, context isolation rule, guard placement: `docs/REPOSITORY_STRUCTURE.md` (load when creating files in new locations or answering architecture questions).

Key paths:
- Backend contexts: `apps/backend/src/contexts/<context>/{domain,application,infrastructure}/`
- Shared utilities: `apps/backend/src/shared/` — cross-cutting only, no domain objects
- BFF: `apps/bff/` · Frontend: `apps/web/`
- Migrations: per-context `infrastructure/migrations/`
- Test helpers: `apps/backend/src/test/utils/` + `src/test/infrastructure/`

---

## 12. Open Decisions (stop and ask before implementing)

1. **Multi-location (post-MVP):** Multiple locations per tenant = separate tenants or sub-tenant model?

---

## 15. Self-Check Before Submitting

> **BEFORE WRITING ANY CODE:** Create a feature branch first — `git checkout -b feat/M0X-SYY-<description>`. Never code directly on `main`. See §9 for the full workflow.

1. Did I read this file at the start of the conversation? ✓
2. Did I get permission before writing any doc/config file? ✓
3. **Did I ask the user before every `git commit` and `git push`?** The pre-push hook runs `ci:fast` (~15 s) — never commit or push autonomously. ✓
4. Does every query / event / log include `tenant_id`? ✓
5. Is the change scoped to one UC cited in the PR? ✓
6. Does the integration test include a tenant-isolation assertion? ✓
7. Did I follow §9 workflow? (branch → implement → ci:fast → /pre-pr → PR → CI all-green → user approval → merge → /mark-done) ✓
8. **Did I run `/pre-pr` AND wait for the user to paste passing integration test output BEFORE calling `gh pr create`?** If the answer is no — do not open the PR. Go back and run `/pre-pr` first. ✓
9. Are ALL stories in this milestone now `✅ Done`? If yes — create `plan/MXX-<NAME>_IMPLEMENTATION_DETAILS_IA.md` + `_DEVELOPER.md`; add IA file to §10 of this file. ✓

---

## 17. Project Slash Commands (Claude Code)

Commands live in `.claude/commands/`. Claude Code auto-discovers them — type `/` to see the list.

| Command | File | When to use |
|---|---|---|
| `/pre-pr` | `.claude/commands/pre-pr.md` | **Before every PR** — runs all checks + bad-smell-audit. Must report zero issues. |
| `/bad-smell-audit [backend\|bff\|web]` | `.claude/commands/bad-smell-audit.md` | Full-stack bad-smell scan — backend VOs/builders, BFF structure, web security/props. Run on demand or scoped to one layer. |
| `/mark-done M0X-SYY` | `.claude/commands/mark-done.md` | **After merge to main** — marks story done, commits, alerts if milestone complete. |
| `/story-discovery M0X-SYY` | `.claude/commands/story-discovery.md` | **Before starting a story** — checks doc clarity, dep symbols, and consistency; asks targeted questions; proposes doc patches; emits READY / NOT READY verdict. |
| `/docs-audit [UC-XXX\|M0X\|actor/slug\|doc-path]` | `.claude/commands/docs-audit.md` | **Before drafting any `plan/journey/` file, before starting a new milestone, or any time docs may have drifted** — audits `docs/`, `plan/M0X-*.md`, `plan/journey/` (journeys + prototypes), and `CLAUDE.md` itself for staleness vs. code, internal inconsistency, and confusing/missing info; proposes doc fixes; lists IA gaps. Scope by UC, milestone, journey, or single doc to keep cost proportional — blank scope audits everything and is expensive, use deliberately. |

**Adding new commands:** create `.claude/commands/<name>.md`. Use `$ARGUMENTS` for optional user-typed arguments. Document it in this table.

---

## 19. Journey & Prototype Workflow Rules

> **Full rules, conventions, and pitfall list:** `plan/journey/README.md` — load it whenever working on any journey `.md` file or prototype folder. §10 already lists it under "Writing new journeys or prototypes."

> ❗ **NON-NEGOTIABLE HARD STOP — READ BEFORE TOUCHING ANY `plan/journey/` FILE**
>
> **`/docs-audit` MUST run and report a clean baseline BEFORE writing any journey `.md` file or prototype HTML.**
> The sequence is always:
> 1. `/docs-audit <UC-XXX>` (or `/docs-audit <actor>/<slug>` once the journey already exists) → resolve every stale/conflicting finding → confirmed baseline
> 2. Write `<actor>/<slug>.md` — mermaid flow, pages table, open questions
> 3. Update `<actor>/use-cases.md` journey column
> 4. Update `plan/journey/README.md` index table
> 5. **Only then** create any file under `<actor>/prototypes/<slug>/`
>
> Skipping `/docs-audit` and going straight to the journey file (or worse, straight to HTML) is a workflow violation. A journey built on stale UC text causes rework in both the prototype and the eventual implementation story.

### Folder structure

```
plan/journey/<actor>/
├── use-cases.md            ← UC inventory
├── <slug>.md               ← journey spec (mermaid, pages table, gaps)
└── prototypes/
    └── <slug>/
        ├── index.html      ← navigation hub + dry-run checklist
        ├── 00-*.html … 01-*.html …
        └── dev-notes.md    ← implementation handoff
```

Prototype files **always** reference `../../../shared/tokens.css` — never a local copy.

### `dashboard-shell.html` CSS gotchas (applies to any dashboard prototype)

| Class / pattern | Behaviour in `tokens.css` | Fix when needed |
|---|---|---|
| `.topbar-avatar` | Hidden at `≥1024px` (sidebar takes over) | Use `.auth-avatar` instead for clickable avatars |
| `.topbar-brand` | Hidden at `≥1024px` (sidebar replaces it) | Add `@media (min-width: 1024px) { .topbar-brand { display: flex !important; } }` for non-sidebar layouts |
| `.bottom-nav` | Always visible by default | Keep it on **all** pages (list and form/drill-down alike). Only hide it on full-screen detail pages that need all the vertical space (e.g. booking detail with many action buttons). Always include the `<nav class="bottom-nav">` element in HTML — tokens.css styles it but does not inject it. |
| `<nav class="bottom-nav">` | **Must be in HTML body** — tokens.css only styles it, does not inject it | Every dashboard page (list and form) must include the `<nav class="bottom-nav">` element explicitly; the manager "Mais" button + `openSheet()`/`closeSheet()` JS must also be present on every page that has it. |
| `.week-nav` (week navigation row) | Not in tokens.css — prototype-local pattern | Add `‹ month ›` nav row above every week strip; `›` links to the next-week page; `‹` disabled on current week. FAB needs `@media (max-width:1023px) { .fab { bottom: 5rem; } }` to clear the bottom nav |
| `.topbar-user-name` | Hidden at `≥1024px` | Add `@media (min-width: 1024px) { .topbar-user-name { display: inline !important; } }` when needed |
| Full-width `.form-actions` on desktop | `flex: 1` buttons stretch across the full content column on wide screens | Use `detail-layout` / `detail-aside` grid: form fields left, sticky action card right. Hide `.form-actions` on desktop: `@media (min-width: 1024px) { .form-actions { display: none !important; } }`. Applies to all form, confirmation, and focused-action pages. |
| `.bottom-sheet` on desktop | Slides up full-width from bottom — broken on wide screens | Already handled globally in `shared/tokens.css` (auto-converts to centered modal ≥1024px). Do NOT add per-file overrides. |
| `padding-bottom` on `main-content` with bottom nav | Content scrolls behind fixed bottom nav — last form field/button hidden | Pages with bottom nav only: `padding-bottom: 5.5rem`. Pages with bottom nav **and** a fixed action bar: `padding-bottom: 9rem` (nav ~3.75rem + bar ~4.5rem). |
| Floating toast for success states | `position: fixed; top: 1rem` overlaps the prototype banner; not the system pattern | Use the inline green banner (`background:#f0fdf4; border:1px solid #86efac`) in the page flow — same pattern used by all booking detail success states. Never use a floating toast. |
