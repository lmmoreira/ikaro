# BeloAuto — Agent Context (canonical)

**Symlinked as:** `claude.md`, `gemini.md`  
**Audience:** Any AI coding agent (Claude Code, Copilot CLI, Cursor, Aider, etc.)  
**Rule:** Read this file first on every conversation. Then use §10 to load only the docs you need.  
**Last updated:** 2026-05-13

---

## 0. Permission Protocol (non-negotiable)

Before writing or editing ANY file (`.md`, `.ts`, `.tf`, `.yml`, configs):

1. **Discuss** the change with the user.
2. **Summarise** what you intend to write.
3. **Ask:** "May I now create/update `<path>`?"
4. **Write only after** an explicit yes.

Exceptions: read-only ops (`Read`, `grep`, `ls`, `git status`, memory files).

---

## 1. Project Facts

| Fact | Value |
|---|---|
| **Product** | BeloAuto |
| **Type** | Multi-tenant SaaS — car-wash booking & loyalty |
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
| **Auth** | Google OAuth 2.0 · JWT sessions (`tenantId`, `tenantSlug`, `role` in payload) |
| **Storage** | S3-compatible (GCS/S3) · paths: `tenants/<tenant_id>/bookings/<booking_id>/<file>` |
| **Observability** | Prometheus + Grafana + OpenTelemetry + Loki + OTel Collector |
| **Container** | Docker · GCP Cloud Run (MVP) → Kubernetes if needed |
| **IaC** | Terraform (GCP provider MVP; cloud-agnostic adapters) |
| **Secrets** | GCP Secret Manager (MVP) → HashiCorp Vault if multi-cloud |
| **Errors** | RFC 9457 Problem Details on all non-2xx responses |
| **Coverage gate** | ≥ 80% on **changed code** (differential, not global) |
| **Rate limiting** | NestJS `@nestjs/throttler` on all public endpoints |
| **Feature flags** | Environment variables (`FEATURE_FLAG_XYZ=true`) — no external system for MVP |

---

## 2. Multi-Tenancy Invariants (NEVER violate)

Any code that breaks these is a defect regardless of test coverage.

1. Every table has `tenant_id UUID NOT NULL`, indexed first in every composite index.
2. Every query filters `WHERE tenant_id = :tenantId`. No exceptions.
3. Every domain event includes `tenantId`, `eventId` (idempotency key), `occurredAt` (ISO-8601 UTC), `correlationId`.
4. Composite FKs use `(tenant_id, id)` to block cross-tenant references at DB level.
5. **Customers are multi-tenant** — same Google `sub` → multiple `Customer` rows (one per tenant). No unique on `google_oauth_id` alone.
6. **Staff are single-tenant** — `UNIQUE(tenant_id, google_oauth_id)` at DB level.
7. File paths prefixed by tenant (see §1 Storage).
8. Logs, metrics, traces include `tenant_id`. OTel span attrs: `tenant.id`, `user.id`, `correlation.id`.
9. Event consumers are idempotent (at-least-once delivery). Dedup via `eventId`.
10. JWT contains `tenantId`/`tenantSlug`. BFF rejects mismatches.

Raise a doc bug if a UC appears to violate these — do not "make it work."

---

## 3. Bounded Contexts (brief — load `docs/05-BOUNDED_CONTEXTS.md` for detail)

| Context | Type | Aggregates | Publishes |
|---|---|---|---|
| **Booking** | Core | `Booking`, `Service`, `ScheduleClosure` | `BookingRequested/Approved/Rejected/InfoRequested/InfoSubmitted/Completed/Cancelled/Rescheduled` + `BookingReminderDue`, `BookingReminderDueToday`, `AdminDailyScheduleReminder` |
| **Customer** | Supporting | `Customer` (multi-tenant rows) | — |
| **Staff** | Supporting | `Staff` (single-tenant) | — |
| **Loyalty** | Supporting | `LoyaltyEntry` (append-only, earn-only) | `ServicePointsEarned`, `PointsExpiringSoon` |
| **Notification** | Supporting | `NotificationTemplate`, `NotificationLog` | `EmailSent`, `EmailFailed` |
| **Platform** | Foundational | `Tenant`, `HotsiteConfig` | `StaffInvited`, `StaffDeactivated` |

**Loyalty MVP rules (strict):** One immutable `LoyaltyEntry` per `BookingLine` completed. Idempotent via `UNIQUE(tenant_id, booking_line_id)`. Active balance = `SUM(points) WHERE expires_at > now()`. No redemption, no tiers, no manual adjustments.

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
| UC-010 | Admin closes schedule | Active |
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
| UC-024 | Developer provisions new tenant (CLI) | Active |
| UC-025 | Admin first login / accepts invite | Active |
| UC-026 | Admin edits tenant settings | Active |
| UC-027 | Admin manages hotsite content | Active |
| UC-028 | Admin invites new staff member | Active |
| UC-029 | Admin deactivates staff member | Active |

**Missing UCs (do not implement until documented):** Customer profile edit, audit log view, notification template management, failed-notification retry.

---

## 7. Engineering Rules

### Hexagonal layers (per context)
```
src/contexts/<context>/
├── domain/           # entities, value objects, domain events, domain services — zero framework deps
├── application/      # use cases, ports (interfaces), DTOs
└── infrastructure/   # adapters: persistence, REST controllers, event publishers, HTTP clients
```
Shared cross-cutting code → `src/shared/` (logger, OTel, `IEventBus` port, tenant-context).

### Code standards
- `strict: true` TypeScript — no `any`, no `@ts-ignore`, no `// eslint-disable`
- Functions ≤ 20 lines, classes ≤ 200 lines
- Repository signature: `findByTenant(id, tenantId)`, `findAllByTenant(tenantId, filters)`, `save(entity, tenantId)`
- No raw SQL outside repository adapters
- No business logic in controllers — controllers call use cases only
- No synchronous cross-context calls — use events. BFF is the only allowed orchestrator
- DI everywhere — no `new SomeRepository()` in services
- All configurable values (48 h window, 180 d expiry) read from `tenants.settings`, never hardcoded
- Email templates in pt-BR; Money display as `R$ 1.234,56`

### Testing
- TDD for domain logic (red-green-refactor)
- Every UC: ≥1 unit test, ≥1 integration test (real Testcontainers DB + Pub/Sub emulator), ≥1 tenant-isolation test
- Tenant-isolation test pattern: create data for Tenant A, attempt access as Tenant B → expect 404 or 403
- E2E (Playwright): happy paths only
- No `.skip()`, `.only()`, `setTimeout` in tests

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

| Pattern | Problem | Fix |
|---|---|---|
| `WHERE id = ?` without `tenant_id` | Cross-tenant data leak | Add `AND tenant_id = ?` |
| Event missing `tenantId` in envelope | Can't isolate per tenant | Include in every event |
| Hardcoded `48`, `180`, `7` for business rules | Breaks per-tenant config | Read from `tenants.settings` |
| `@ts-ignore`, `any`, `eslint-disable` | Defeats static analysis | Fix the type/lint error |
| `.skip()` / `.only()` in tests | Hides failures in CI | Remove before commit |
| Synchronous call from Loyalty → Booking | Tight coupling | Subscribe to `BookingCompleted` event |
| `new XRepository()` inside a service | Untestable | Inject via DI |
| Same template body for all tenants | Breaks branding | Templates are per-tenant aggregates |
| Photo stored at `bookings/<id>/` without tenant prefix | No isolation | Path: `tenants/<tid>/bookings/<bid>/<file>` |
| Logging without `tenant_id` | Can't slice per-tenant | Add to structured log context |
| Running migrations at app startup | Unsafe for rolling deploys | Run as separate CI job before deploy |
| English copy in email templates | Wrong locale | All customer-facing text in pt-BR |
| Money as plain `number` | Loses currency | Use `Money { amount: Decimal, currency: 'BRL' }` |
| Import from `src/contexts/<B>/` inside Context A | Breaks context isolation | Only import from `src/shared/` or own context |
| Cross-schema DB FK between contexts | Tight schema coupling | Store UUID only; no FK constraint across schemas |
| Event consumer querying another context to fill missing data | Defeats self-contained events | Add the needed data to the event payload |
| Placing a domain entity or use case in `src/shared/` | Blurs context ownership | Only ports, base classes, and multi-context VOs in shared |

---

## 10. Dynamic Context Loading — Load Only What You Need

**Always start with this file.** Then use the table below to load only the docs relevant to your task.

| Task | Docs to load | ~KB |
|---|---|---|
| Quick clarification | This file only | 0 |
| Implement a UC | `docs/04-USE_CASES.md` (that UC's section) + `docs/02-DOMAIN_MODEL.md` (relevant aggregate) + `docs/03-DOMAIN_EVENTS.md` (relevant events) | 4–6 |
| Database / migration | `docs/13-DATABASE_SCHEMA.md` + `docs/02-DOMAIN_MODEL.md` (relevant aggregate) | 4 |
| API endpoint | `docs/14-API_CONTRACTS.md` + the cited UC | 3–5 |
| Event handler | `docs/03-DOMAIN_EVENTS.md` (event) + `docs/05-BOUNDED_CONTEXTS.md` (context) | 3 |
| Hotsite / public frontend | `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` + `docs/14-API_CONTRACTS.md` (tenants section) + `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` (folder structure) | 4 |
| Dashboard / admin frontend | `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` + `docs/14-API_CONTRACTS.md` | 3 |
| BFF implementation | `docs/24-BFF_ARCHITECTURE.md` + `docs/14-API_CONTRACTS.md` | 4 |
| Architecture question | `docs/11-ARCHITECTURE.md` + `docs/05-BOUNDED_CONTEXTS.md` | 5 |
| Multi-tenancy / isolation | `docs/06-TENANT_ISOLATION_STRATEGY.md` | 2 |
| Testing patterns | `docs/08-TESTING_STRATEGY.md` | 3 |
| CI / pipelines | `docs/09-CI_CD_PIPELINE.md` + `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md` | 4 |
| Deployment / infra | `docs/12-DEPLOYMENT_STRATEGY.md` + `docs/22-TECH_STACK_DECISIONS.md` | 5 |
| Observability | `docs/10-OBSERVABILITY_STRATEGY.md` | 2 |
| Full feature (UC + API + DB + tests) | All of the above relevant rows | 12–18 |
| Working on M01+ (any backend/BFF/web task) | `plan/M00-MONOREPO-FOUNDATION_IMPLEMENTATION_DETAILS_IA.md` — version gotchas, stubs, CJS/ESM decisions, seed UUIDs, testing setup | 3 |
| Working on M02+ (any task touching CI, Dockerfiles, or deployment) | `plan/M01-CI-QUALITY-GATES_IMPLEMENTATION_DETAILS_IA.md` — workflow job map, Dockerfile gotchas (pnpm deploy, --ignore-scripts, npm removal, .next/.dist copy), Checkov path-filter, local vs CI gate coverage, required GitHub Secrets | 2 |

**Never load:** anything under `docs/archive/` — superseded content.  
**Never load:** `plan/*_DEVELOPER.md` files — written for the human developer, not for agents.

---

## 11. Repository Layout

### Monorepo (pnpm workspaces)
```
.
├── apps/
│   ├── backend/          # NestJS modular monolith
│   │   └── src/contexts/ # booking/ customer/ staff/ loyalty/ notification/ platform/
│   ├── bff/              # NestJS BFF (separate service, own container)
│   └── web/              # Next.js 14 (hotsite + dashboard)
├── packages/
│   ├── types/            # shared TypeScript types / DTOs
│   └── config/           # shared ESLint, tsconfig, Prettier configs
├── infrastructure/
│   └── terraform/        # GCP resources (Cloud Run, Cloud SQL, Pub/Sub, Secret Manager)
├── .github/workflows/    # CI/CD pipeline YAML files
├── docker/               # Dockerfiles + docker-compose.yml (local dev)
├── .copilot/context.md   # THIS FILE
├── claude.md             # → symlink to .copilot/context.md
├── CLAUDE.md             # Claude Code project instructions
└── docs/                 # source of truth documentation (see §10)
```

### Per-context structure (inside `apps/backend/src/contexts/<context>/`)
```
├── domain/           # entities, value objects, events, domain services (no framework)
├── application/      # use cases, port interfaces, DTOs
└── infrastructure/   # adapters: TypeORM repos, REST controllers, Pub/Sub publishers, HTTP clients
    └── migrations/   # TypeORM migrations scoped to this context's schema
```

### Shared folder — cross-cutting concerns ONLY (`apps/backend/src/shared/`)
```
src/shared/
├── ports/            # IEventBus, IEmailSender, IRepository<T>
├── domain/           # AggregateRoot, DomainEvent, ValueObject (base classes)
├── value-objects/    # Money, Address (used by multiple contexts)
├── tenant/           # TenantContext (request-scoped), TenantInterceptor
├── observability/    # Logger, OTel tracer, structured log helpers
└── http/             # Pagination DTOs, RFC 9457 ProblemDetail base type
```

**Rule:** A context module MUST NOT import from another context's path. Only `src/shared/` is importable across contexts. Domain objects (entities, aggregates, use cases, repositories) are NEVER in shared.

---

## 12. Open Decisions (stop and ask before implementing)

Only truly unresolved items remain here:

1. **Multi-location (post-MVP):** Multiple locations per tenant = separate tenants or sub-tenant model?

---

## 13. Doc Contradictions — This File Overrides Until Fixed

| # | Topic | Canonical answer | Fix status |
|---|---|---|---|
| 1 | Event bus | GCP Pub/Sub + emulator locally | ✅ Fixed in docs 05, 11, 18 |
| 2 | DB migrations | Separate CI job (Stage 4.5), never at app startup | ✅ Fixed in doc 09 |
| 3 | Brazil/BRL/pt-BR | Currency BRL, locale pt-BR, America/Sao_Paulo | ✅ Fixed in docs 01, 07, 21 |
| 4 | Coverage threshold | ≥80% on **changed code** | ✅ Fixed in docs 07, 08, 09 |
| 5 | Cancellation window | Read from `tenants.settings.booking.cancellation_window_hours` | ✅ Fixed |
| 6 | Booking status enum | `PENDING/INFO_REQUESTED/APPROVED/REJECTED/COMPLETED/CANCELLED` | ✅ Resolved |
| 7 | Event envelope | Standard 7-field envelope (see §4) | ✅ Resolved |
| 8 | BFF | Separate NestJS service in `apps/bff/` | ✅ Fixed in doc 22 |
| 9 | Monorepo paths | `apps/backend/src/contexts/` canonical | ✅ Fixed in docs 22, 11 |
| 10 | UC-014/UC-015 | Superseded by UC-021/UC-022 | ✅ Noted clearly in doc 04 |
| 11 | Loyalty expiry | Read from `tenants.settings.loyalty.expiry_days` | ✅ Fixed in doc 21 |
| 12 | Platform context | 6th context: `Tenant`, `HotsiteConfig`; UC-024–029 | ✅ Fixed in docs 02, 03, 04, 05 |
| 13 | Component library | **shadcn/ui** (Radix UI + Tailwind) | ✅ Fixed in docs 16, 22 |
| 14 | Email service | **SendGrid** (default adapter); `IEmailSender` port for swappability | ✅ Fixed in docs 05, 10, 22 |
| 15 | Reminder events | `BookingReminderDue` / `BookingReminderDueToday`; cron emits, Notification sends | ✅ Fixed in docs 03, 04, 05 |
| 16 | Loyalty idempotency key | `UNIQUE(tenant_id, booking_line_id)` — not `booking_id` | ✅ Fixed in doc 05 |
| 17 | Reschedule event | `BookingRescheduled` event added; Notification sends email | ✅ Fixed in docs 03, 04, 05, 14 |
| 18 | Error tracking | No Sentry in MVP; Loki + Grafana | ✅ Fixed in docs 10, 18 |

---

## 14. Glossary

| Term | Definition |
|---|---|
| **Tenant** | A car-wash company on the platform. Unit of isolation. |
| **Slug** | URL-safe tenant identifier (e.g. `lavacar-belo`). Globally unique. |
| **BFF** | Backend-for-Frontend — separate NestJS service, sole entry point for the web layer. |
| **Hotsite** | Public unauthenticated tenant-branded marketing + booking page. |
| **Hotsite Manifest** | JSON with branding + module layout served to the frontend per tenant slug. |
| **Port** | Interface owned by the application layer (e.g. `IBookingRepository`). |
| **Adapter** | Infrastructure implementation of a port (e.g. `TypeOrmBookingRepository`). |
| **Tenant Context** | Request-scoped object holding active `tenantId`, injected by `TenantInterceptor`. |
| **Idempotent consumer** | Event handler whose effect is identical whether the message arrives 1 or N times. |
| **Composite FK** | Multi-column FK `(tenant_id, id)` blocking cross-tenant DB references. |
| **Expand/Contract** | Two-phase migration pattern safe for rolling deploys. |

---

## 15. Self-Check Before Submitting

1. Did I read this file at the start of the conversation? ✓
2. Did I get permission before writing any file? ✓
3. Does every query / event / log include `tenant_id`? ✓
4. Is the change scoped to one UC cited in the PR? ✓
5. Does coverage delta stay ≥ 80% on changed code? ✓
6. Did I follow Conventional Commits? ✓
7. Did I check §13 for overrides before trusting individual docs? ✓
8. For any item in §12 (Open Decisions), did I stop and ask instead of guessing? ✓
9. Are functions ≤ 20 lines, no `any`, no hardcoded config values? ✓
10. Is all customer-facing text in pt-BR, money in BRL? ✓
11. Does the integration test include a tenant-isolation assertion? ✓
12. Did I run `pnpm ci:fast` before pushing? (lint + prettier + type-check + unit tests — auto-runs via pre-push hook if `git config core.hooksPath .githooks` is set) ✓
13. Did I run `pnpm ci:local` before opening the PR? (adds integration tests + gitleaks + docker builds + trivy — all via Docker, zero tokens needed) ✓
14. After opening the PR, did I verify all CI checks passed (`gh pr checks <N> --repo lmmoreira/beloauto`)? If any failed — fix, commit, push, re-verify. Once all checks are green, merge: `gh pr merge <N> --repo lmmoreira/beloauto --squash --delete-branch`. Do not report done until the squash commit is on `main`. ✓
15. After merging, did I mark the story as `✅ Done` in `plan/<milestone>.md`? (heading: `### MXX-SYY — title ✅ Done`) ✓
16. Are ALL stories in this milestone now `✅ Done`? If yes — the milestone is complete. Before reporting done, create both wrap-up files:
    - `plan/MXX-<NAME>_IMPLEMENTATION_DETAILS_IA.md` — token-efficient: artifacts table, critical gotchas, version facts, structural decisions, common commands. For AI agents only.
    - `plan/MXX-<NAME>_IMPLEMENTATION_DETAILS_DEVELOPER.md` — detailed: concepts explained with rationale, code examples from the actual codebase. For the human developer only.
    - Add the IA file to §10 of this file (Dynamic Context Loading table) so future agents know to load it. ✓

---

## 16. Changelog

| Date | Change |
|---|---|
| 2026-05-12 (wave 3) | **Platform Context added + LGPD removed.** Added Platform Context (UC-024 to UC-029, aggregates, events `StaffInvited`/`StaffDeactivated`) across docs 02, 03, 04, 05. Removed LGPD scope (localization only: BRL, pt-BR). Fixed UC-024/025/026 for Google OAuth-only auth and BRL currency. Added UC-028 (invite staff) and UC-029 (deactivate staff). CLAUDE.md now symlinks to this file. |
| 2026-05-12 (wave 2) | **Doc fixes propagated.** Event bus (05, 11, 18) → GCP Pub/Sub; CI/CD (09) → Stage 4.5 migrations, coverage "changed code"; use cases (04) → cancellation window from settings; docs 01/07 → Brazil/BRL/pt-BR. All agent files (CLAUDE.md, claude.md, gemini.md) symlink to this file. |
| 2026-05-12 (wave 1) | **Full rewrite of this file.** Resolved: event bus → GCP Pub/Sub + emulator; BFF → separate NestJS service; monorepo → pnpm workspaces; DB migrations → separate CI job; feature flags → env vars; rate limiting → NestJS ThrottlerModule. Added: Brazil market, BRL currency, pt-BR locale, LGPD. Archived root-level audit files. Rewrote for dynamic-loading-first structure. |
| 2026-05-11 (pm) | Wave 1: branch `main`, `INFO_REQUESTED` state, 80% coverage on changed code, event envelope, `LoyaltyEntry` model, photo fields plural. |
| 2026-05-11 (am) | First CLI-agnostic rewrite. Added permission protocol, invariants, anti-patterns, self-check. |
