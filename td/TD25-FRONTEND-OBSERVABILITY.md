# TD25 — Frontend Observability (`apps/web` has no logging/error-reporting)

## Status
- **State**: Open — not yet scoped, placeholder only
- **Type**: Technical Debt / Observability
- **Priority**: Low — no current incident, nothing broken today
- **Context**: `apps/web` (all of it)
- **Created**: 2026-07-13
- **Found during**: TD23 Story 12, adding `resolveErrorMessage`'s dev-mode/fallback `console.warn` calls (`apps/web/shared/lib/i18n/resolve-error-message.ts`) — the first `console.*` usage anywhere in `apps/web`. `scripts/pre-pr.sh`'s no-console check needed a one-off file exception since there's no established logging pattern to route through instead.

---

## Problem

Backend and BFF have `AppLogger` (structured JSON, OTel-integrated — `docs/10-OBSERVABILITY_STRATEGY.md`). `apps/web` has no equivalent: no structured client-side logging, no error-reporting/telemetry service. Any frontend code that needs to signal a runtime gap has nowhere real to send it — raw `console.*` is the only option, and it's banned in production code by `scripts/pre-pr.sh` check 17 everywhere except the single exception carved out for TD23-S12.

## Not yet scoped

No design/discovery has been done. When this is picked up, cover at minimum:
- Third-party error-reporting SDK (e.g. Sentry) vs. a lightweight custom client→BFF telemetry endpoint
- Whether it replaces `scripts/pre-pr.sh`'s per-file exception for `resolve-error-message.ts` (that exception should be removed once a real logging path exists)
- Whether it also covers React error boundaries, not just explicit `console.warn` call sites
