# Ikaro — Engineering Rules (index)

> **This file no longer holds the rules directly.** Split into 5 topic-focused files (TD41-S4, 2026-09-23) so a session only loads what its task actually needs — see `CLAUDE.md §10` for which file(s) a given task type loads. This page is kept as a redirect index so old citations (`docs/ENGINEERING_RULES.md § <heading>`) still resolve to *something*: find the heading below and open the file it names.

---

## `docs/ENGINEERING_RULES_SHARED.md` — cross-cutting (2+ layers)

- Repository slice ownership
- Value Objects (Option A — aggregate props; VO validation errors must be mapped with a typed `code`; Single source of truth for a validation rule's code)
- Partial-update types for deeply-nested Zod schemas
- Schema-level enforcement of "never persisted here" invariants
- RequestContext (per-request shared state)
- Observability ports (logging + tracing)
- Controller, Route, and Shared-UI Boundaries
- Static locale/config files in workspace packages
- Authoring new i18n UI copy keys (`packages/i18n/locales/*/web.json`)
- Exception handling & i18n pattern (`code`-driven, TD23) — envelope, code naming convention, shared translation catalog, frontend resolver, `status` vs `code`, code lifecycle, adding a new error checklist, security-sensitive errors
- `no-restricted-syntax` selectors must be checked against every already-documented bypass shape
- Before a blind `Write` on a file believed to be new, grep for its expected exported symbols first
- Re-check a same-file documented invariant when extending an existing algorithm to a new dimension mid-PR

## `docs/ENGINEERING_RULES_BACKEND.md` — backend, database, BFF

- Transactions (cross-row invariants; choosing a race-condition primitive; TypeORM optimistic locking; TypeORM upsert internals)
- Migration backfills
- Migration-driven privilege grants to infrastructure-created roles
- Adding a CHECK constraint to an existing table with live rows
- LIKE/ILIKE pattern escaping for user-supplied search terms
- Aggregate domain events → outbox (repo auto-flush)
- Express `Request.user` typing (BFF) — the `skipLibCheck` trap
- OpenRouter chatbot outbound HTTP resilience
- Backend read use cases for cross-context access
- Adding a new notification type
- Staff OAuth login URL format (BFF `GoogleAuthGuard`)
- `/internal/` routes are pre-auth only
- Event Handlers (Pub/Sub consumers)
- A lock only orders callers who both acquire it
- `architecture-check`'s `transactional-save` detector
- A wholesale-replaced child collection needs a dirty flag on the aggregate
- A child table with only a composite PK cannot represent "declared but empty"
- A versioned, append-only child concept is an independent aggregate root

## `docs/ENGINEERING_RULES_INFRA.md` — infra / Cloud Run

- Cloud Run CPU throttling — timer/async work can be silently starved
- Cloud Run `vpc_egress` mode determines third-party outbound reachability

## `docs/ENGINEERING_RULES_FRONTEND.md` — apps/web

- Web — Shared Helpers (`apps/web`) — shared format functions, other shared web helpers, `DateFormat`/`TimeFormat` types, NBSP normalization, `reconstitute()` skips domain validation
- CSP allowances for a new external UI resource
- Hotsite full-page components must explicitly paint `--ba-background`

## `docs/ENGINEERING_RULES_TESTING.md` — testing patterns

- Testing Patterns (detail) — builder pattern, InMemory doubles, caching decorator repositories, platform tenant cache, integration test DB isolation, shared test-builder date defaults, integration app helpers, shared Nest cache test module, NestJS module provider pattern, notification spec setup, migration/entity registration, standalone index for a cross-tenant system job, BFF tests
- Cloudflare Turnstile's test sitekey never renders an interactive iframe
- SonarCloud's duplicate-test rule (`S5976`)
- Node's default V8 heap limit
- An integration test seeding fixtures under fixed/hardcoded tenant UUIDs
