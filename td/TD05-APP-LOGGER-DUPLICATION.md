# TD05 — Duplicated `AppLogger` implementation (backend + bff)

## Status
- **Type**: Technical Debt / Code Duplication
- **Priority**: Low (no functional defect; currently surfaces only as a SonarCloud friction point)
- **Context**: `apps/backend/src/shared/observability/app-logger.ts` and `apps/bff/src/shared/observability/app-logger.ts`
- **Created**: 2026-06-18
- **Updated**: 2026-06-18
- **Resolved**: 2026-06-18 — extracted `BaseAppLogger` to a new `packages/observability` workspace package (option 1). Both apps now hold a 9-line subclass each: `super('backend'|'bff', context)` plus backend's `enrich()` override for tenant-context auto-enrichment. `packages/` is outside `sonar.sources` (same as `packages/types`/`packages/config` today), so the shared implementation is no longer subject to the duplication gate at all.

---

## Problem

`AppLogger` is implemented twice — once in `apps/backend/src/shared/observability/app-logger.ts`, once in `apps/bff/src/shared/observability/app-logger.ts`. The two files are near-identical: same `LogContext` interface, same constructor, same `log`/`warn`/`error`/`debug`/`verbose`/`setLogLevels` methods, same `write()` structured-log assembly — the only difference is the hardcoded `service: 'backend'` vs `service: 'bff'` literal (and the backend variant additionally auto-enriches with tenant context via `AsyncLocalStorage`, which the bff variant doesn't need).

This was discovered via SonarCloud's `api/duplications/show` endpoint while fixing PR #6 (SonarCloud findings on `main`): a routine `readonly` fix (S2933) to one field in each file was enough to trip the PR's `new_duplicated_lines_density` gate, because the touched line fell inside a **48-line duplicate block** spanning nearly the entire file. The `readonly` fix was reverted in that PR rather than force a logger-consolidation refactor into an unrelated cleanup PR — see PR #6 discussion.

## Why this matters

Any future innocuous one-line edit to either file (a lint fix, a new log field, a type tweak) risks tripping the same `new_duplicated_lines_density` gate again, for the same reason, requiring either:
- reverting the edit (as PR #6 did), or
- finally doing the consolidation, or
- accepting the gate hit and asking a human to override it in SonarCloud.

None of those are good defaults to keep re-deriving from scratch — hence this TD.

## Proposed fix (not yet scoped as a story)

Extract a shared base implementation that both apps can depend on. Candidate approaches, in rough order of preference:

1. **Shared package** — add an `AppLogger` (or a `BaseAppLogger` parameterized by `service` name) to `packages/types` or a new lightweight `packages/observability` package that both `apps/backend` and `apps/bff` depend on via `workspace:*`. Keeps backend's tenant-context enrichment as a subclass/wrapper specific to backend, since bff doesn't have `TenantContext` in the same form.
2. **Accept the duplication, suppress at the tool level** — mark the `write()` method (or the whole file) with a SonarCloud duplication exclusion if a shared package is judged not worth it for ~70 lines. Lower effort, but means the gate can never catch *real* future drift between the two copies (e.g. one gets a bug fix the other doesn't).

Recommendation: option 1, since `packages/config` already establishes the precedent of sharing cross-app infra via a workspace package, and the two loggers are conceptually one thing (a structured JSON logger emitting `{timestamp, level, service, context, message, ...}`) with a tiny per-service parameter, not two genuinely different implementations.

## Acceptance criteria

- [x] Single `BaseAppLogger` implementation shared by both apps — `packages/observability/src/app-logger.ts`
- [x] Backend's tenant-context auto-enrichment behavior preserved exactly — `BaseAppLogger.enrich()` hook, overridden in `apps/backend/.../app-logger.ts`; all 4 backend-specific assertions kept passing in `app-logger.spec.ts`
- [x] `service: 'backend'` / `service: 'bff'` still appears correctly per app — passed via `super(service, context)` from each subclass's constructor
- [x] SonarCloud duplication for these two files drops to 0% — the duplicated logic no longer exists in two `apps/` files; it lives once in `packages/observability`, outside `sonar.sources`
- [x] No other call sites broken — confirmed `AppLogger` is constructed via plain `new AppLogger(context)` everywhere in both apps (20+ backend call sites, 1 bff call site in `main.ts`); none use NestJS DI injection, so no module wiring needed updating

## Resolution notes

- `packages/observability` mirrors `packages/types`'s minimal package.json/tsconfig shape, plus its own `jest.config.ts` (ts-jest, same pattern as `apps/backend`) since this package needed real unit tests, unlike the DTO-only `packages/types`.
- The shared package's own spec (`packages/observability/src/app-logger.spec.ts`) covers all generic behavior (log levels, JSON shape, context-field merge, the `enrich()` hook default and override) via a local `TestLogger`/`EnrichingTestLogger`. Each app's spec now only asserts its app-specific piece: backend's tenant enrichment (4 tests), bff's `service: 'bff'` tag and lack of enrichment (2 tests, file didn't exist before).
- `@nestjs/common` is a `peerDependency` of the new package (not a bundled dependency) so it resolves to whichever copy the consuming app already installed, rather than risking two NestJS instances in the tree.
- Did not touch `docs/10-OBSERVABILITY_STRATEGY.md`'s `AppLogger` code sketch (around line 336) — it already described a `withContext()` API that never matched the real implementation, pre-dating this change. Out of scope here; flagged for a future `/docs-audit` pass, not fixed as a drive-by.
