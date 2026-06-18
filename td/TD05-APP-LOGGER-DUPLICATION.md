# TD05 — Duplicated `AppLogger` implementation (backend + bff)

## Status
- **Type**: Technical Debt / Code Duplication
- **Priority**: Low (no functional defect; currently surfaces only as a SonarCloud friction point)
- **Context**: `apps/backend/src/shared/observability/app-logger.ts` and `apps/bff/src/shared/observability/app-logger.ts`
- **Created**: 2026-06-18
- **Updated**: 2026-06-18

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

## Acceptance criteria (when this is picked up)

- [ ] Single `AppLogger` implementation shared by both apps (exact package/location TBD by whoever scopes the story)
- [ ] Backend's tenant-context auto-enrichment behavior preserved exactly (verify via existing `app-logger.spec.ts` assertions)
- [ ] `service: 'backend'` / `service: 'bff'` still appears correctly per app
- [ ] SonarCloud duplication for these two files drops to 0%
- [ ] No other call sites broken (`AppLogger` is constructed via plain `new AppLogger(context)` in both apps — check DI wiring in both `*.module.ts` trees)

## Open Questions

1. Is a brand-new `packages/observability` package worth it for ~70 lines, or should this live inside `packages/config` (currently ESLint/TS/Prettier config only — would be a scope change for that package) or `packages/types` (currently DTOs only — also a scope mismatch)? Resolve at story-discovery time.
