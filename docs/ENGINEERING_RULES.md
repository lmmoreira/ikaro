# Ikaro — Engineering Rules (index)

> **This file no longer holds the rules directly.** Split into 5 topic-focused files (TD41-S4, 2026-09-23) so a session only loads what its task actually needs — see `CLAUDE.md §10` for which file(s) a given task type loads. Every original heading is listed below with the file it moved to, so an old citation (`docs/ENGINEERING_RULES.md § <heading>`) always resolves to a real line here.

---

## `docs/ENGINEERING_RULES_SHARED.md` — cross-cutting (2+ layers)

- Repository slice ownership
- Value Objects
  - Option A — aggregate props typed as VOs (mandatory)
  - VO validation errors must be mapped with a typed `code` (`DomainErrorShape`)
  - Single source of truth for a validation rule's code
- Partial-update types for deeply-nested Zod schemas
- Schema-level enforcement of "never persisted here" invariants
- RequestContext (per-request shared state)
- Observability ports (logging + tracing)
- Controller, Route, and Shared-UI Boundaries
- Static locale/config files in workspace packages
- Authoring new i18n UI copy keys (`packages/i18n/locales/*/web.json`)
- Exception handling & i18n pattern (`code`-driven, TD23)
  - The envelope
  - Code naming convention
  - Shared translation catalog
  - Frontend resolver
  - `status` vs `code`
  - Code lifecycle
  - Adding a new error — checklist
  - Security-sensitive errors: specificity is a per-case decision
- `no-restricted-syntax` selectors must be checked against every already-documented bypass shape in the same config file, not just the one form the target code currently uses
- Before a blind `Write` on a file believed to be new, grep for its expected exported symbols first
- Re-check a same-file documented invariant when extending an existing algorithm to a new dimension mid-PR

## `docs/ENGINEERING_RULES_BACKEND.md` — backend, database, BFF

- Transactions
  - Cross-row invariants: transaction scope is necessary, database enforcement is authoritative
  - Choosing a race-condition primitive, and where its lock port should live
  - TypeORM optimistic locking on detached entities
  - TypeORM upsert internals — partial-column upserts, `orUpdate()`, and column-name resolution
- Migration backfills
- Migration-driven privilege grants to infrastructure-created roles
- Adding a CHECK constraint to an existing table with live rows
- LIKE/ILIKE pattern escaping for user-supplied search terms
- Aggregate domain events → outbox (repo auto-flush)
- Express `Request.user` typing (BFF) — the `skipLibCheck` trap
- OpenRouter chatbot outbound HTTP resilience — connect-timeout, retry classification, and provider selection (M19-S13)
- Backend read use cases for cross-context access
- Adding a new notification type
- Staff OAuth login URL format (BFF `GoogleAuthGuard`)
- `/internal/` routes are pre-auth only
- Event Handlers (Pub/Sub consumers)
- A lock only orders callers who both acquire it — it does not bypass an independent cache sitting behind the read it's protecting
- `architecture-check`'s `transactional-save` detector requires `save()` to be textually inside `txManager.run()` — not merely reachable through it
- A wholesale-replaced child collection needs a dirty flag on the aggregate — resyncing it on every `save()` is a real, silent perf cost
- A child table with only a composite PK cannot represent "declared but empty" — reject that state at the aggregate boundary, don't rely on storage to preserve it
- A versioned, append-only child concept ("new version supersedes, never edits the previous one") is an independent aggregate root with its own repository, not a `Service`-owned child collection

## `docs/ENGINEERING_RULES_INFRA.md` — infra / Cloud Run

- Cloud Run CPU throttling — timer/async work can be silently starved (sidecars included)
- Cloud Run `vpc_egress` mode determines third-party outbound reachability — check before adding network infrastructure

## `docs/ENGINEERING_RULES_FRONTEND.md` — apps/web

- Web — Shared Helpers (`apps/web`)
  - Shared format functions belong in `shared/lib/formatting/`
  - Other shared web helpers
  - `DateFormat` and `TimeFormat` types — use `@ikaro/i18n`
  - NBSP normalization in `Intl.NumberFormat` output
  - `reconstitute()` skips domain validation — guard at the web boundary
- CSP allowances for a new external UI resource must be scoped to what a fresh document load can carry, not to the one page that uses it
- Hotsite full-page components must explicitly paint `--ba-background`

## `docs/ENGINEERING_RULES_TESTING.md` — testing patterns

- Testing Patterns (detail)
  - Builder pattern (mandatory)
  - InMemory doubles
  - Caching decorator repositories — DI wiring
  - Platform tenant cache — adapter boundary and invalidation timing
  - Integration test DB isolation
  - Shared test-builder date defaults
  - Integration app helpers — mandatory default overrides
  - Reuse the shared Nest cache test module
  - NestJS module provider pattern (useClass not useExisting)
  - Notification spec setup
  - Migration / entity registration
  - Standalone index for a cross-tenant system job
  - BFF tests
- Cloudflare Turnstile's test sitekey never renders an interactive iframe
- SonarCloud's duplicate-test rule (`S5976`) can retroactively flag pre-existing tests once a new similarly-shaped test is added
- Node's default V8 heap limit is unrelated to actual host/container RAM — a Jest OOM kill on a host with plenty of free memory is the default ceiling, not a leak
- An integration test seeding fixtures under fixed/hardcoded tenant UUIDs needs symmetric, complete setup/teardown — CI's Testcontainers reuse can carry a prior run's corruption into an unrelated later run
