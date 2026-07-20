# API Error Catalog - Ikaro

**Status:** Live — reflects the shipped `code`-driven pattern (TD23)
**Audience:** Frontend developers, API consumers, AI agents
**Standard:** RFC 9457 Problem Details for HTTP APIs
**Last Updated:** 2026-07-20

---

## Overview

Every non-2xx response from the BFF is an RFC 9457 Problem Details object. `type` is always the literal string `'about:blank'` — it is **not** a machine-readable identifier. The machine-readable identifier is `code`.

An earlier version of this document specified a `type: 'https://api.<ikaro-domain>/errors#error-code'` URI-fragment scheme with frontend guidance to branch on `type`. That scheme was **never implemented** anywhere in the codebase — this document now describes the pattern actually shipped (`td/TD23-EXCEPTION-HANDLING-I18N-PATTERN.md` Story 17).

This document is the error-response *reference*. The canonical code catalog is `packages/types/src/error-codes.ts`, and translations live in `packages/i18n/locales/{locale}/errors.json` — both are the actual source of truth and are **not** duplicated inline here, since a copy would drift the moment either file changes. Full pattern detail (envelope shape, naming convention, frontend resolver, "adding a new error" checklist): `docs/ENGINEERING_RULES.md` § Exception handling & i18n pattern.

---

## Error Response Format

### Single-cause errors (most errors)

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "code": "BOOKING_PICKUP_ADDRESS_REQUIRED",
  "field": "pickupAddress",
  "detail": "pickupAddress is required when a pickup service is selected",
  "correlationId": "uuid-v7"
}
```

`detail` is backend-internal/debug text only — **never** rendered to a user (enforced by `docs/ANTI_PATTERNS.md`'s raw-error-text rule). `code` is the only field a client should branch on to select a user-facing message; `field` is for routing (e.g. highlighting the invalid input), never for message selection.

### Batch validation errors (Zod pipes, multi-field)

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "Validation failed",
  "violations": [
    { "field": "email", "code": "GENERIC_FORMAT_INVALID" },
    { "field": "zipCode", "code": "ADDRESS_FIELD_REQUIRED" }
  ],
  "correlationId": "uuid-v7"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Always `'about:blank'` — not a machine-readable identifier |
| `status` | integer | HTTP status code |
| `title` | string | Short error summary, derived from `status` |
| `code` | string (optional) | Machine-readable error identifier — single-cause errors only. Full catalog: `packages/types/src/error-codes.ts` |
| `field` | string (optional) | Which request field is at fault — single-cause errors only, routing use, never message selection |
| `params` | object (optional) | Interpolation values for the resolved message template (e.g. `{ hours: 48 }`) |
| `violations` | array (optional) | Batch validation failures — `{ field, code, params? }[]`. Mutually exclusive with top-level `code`/`field` |
| `detail` | string | Backend-internal/debug text — never rendered to a user |
| `correlationId` | UUID | Trace ID for debugging |

`correlationId` is also echoed as the `X-Correlation-ID` response header, and every non-2xx response is served with `Content-Type: application/problem+json` (not `application/json`) — both closed by M17-S31 (2026-07-20); previously the header was `application/json` and `correlationId` only reached the header on a lucky subset of requests (see that story for the guard-vs-middleware root cause).

---

## HTTP Status Usage

`status` is transport/routing only — it never selects the message shown to a user. `code` does that.

| Code | Meaning | Usage |
|------|---------|-------|
| **400** | Bad Request | Validation errors, single-field or business rule violation |
| **401** | Unauthorized | Missing/invalid/expired JWT |
| **403** | Forbidden | Tenant mismatch or insufficient role |
| **404** | Not Found | Resource does not exist in the current tenant |
| **409** | Conflict | Slot/state conflict — e.g. overlapping booking, invalid state transition |
| **413** | Payload Too Large | File upload exceeds size limit |
| **429** | Too Many Requests | Rate limit / per-session quota exceeded |
| **500** | Internal Server Error | Unhandled exception |
| **503** | Service Unavailable | Backend unreachable or timed out (BFF-originated) |

---

## Code Origins

Every code is namespaced `<ORIGIN>_<REASON>` (upper snake case). Full catalog: `packages/types/src/error-codes.ts` — each origin is exported as an `as const` object + derived literal union type (e.g. `BookingErrorCode`).

| Origin prefix | Where it's thrown |
|---|---|
| `BOOKING_*` | `apps/backend/src/contexts/booking/` |
| `CUSTOMER_*` | `apps/backend/src/contexts/customer/` |
| `STAFF_*` | `apps/backend/src/contexts/staff/` |
| `LOYALTY_*` | `apps/backend/src/contexts/loyalty/` |
| `PLATFORM_*` | `apps/backend/src/contexts/platform/` |
| `ADDRESS_*`, `COUNTRY_CODE_*`, `PHONE_*`, `MONEY_*`, `SEO_*`, `SLUG_*`, `HEX_COLOR_*`, `TIMEZONE_*`, `TIME_OF_DAY_*`, `EMAIL_*` | Shared value objects, `apps/backend/src/shared/value-objects/` — reused by whichever context calls the VO |
| `BFF_*` | BFF-originated conditions (guest-token failures, guard rejections, tenant-not-registered checks) — `apps/bff/src/shared/` |
| `AUTH_*` | Auth/role framework fallback, shared by backend and BFF |
| `GENERIC_*` | VO-less Zod validation rules (no domain VO behind the rule) |

---

## For Frontend Developers

1. **Branch on `code`, never `type`, `status`, or raw text.** Resolve the message via `resolveErrorMessage(code, locale, params?)` (`apps/web/shared/lib/i18n/resolve-error-message.ts`) — see `docs/ANTI_PATTERNS.md` for the anti-pattern this prevents.
2. **Use `field` for routing** (e.g. highlight the invalid input, or pick which of two address forms a 400 is about), never for message selection.
3. **Log `correlationId`** for debugging — never surface `detail` in the UI.
4. **`status` picks the UI shape, not the message:** 401 → redirect to login, 403 → forbidden screen, 404 → `notFound()`, 409 → conflict-specific UI state, 5xx → generic retry copy.
5. **Retry logic:** 409 — don't retry (business conflict); 429 — retry with exponential backoff; 5xx — retry with exponential backoff (bounded attempts).

## For API Developers (Backend/BFF, AI Agents)

Adding a new error is a 3-step checklist — full detail in `docs/ENGINEERING_RULES.md` § Exception handling & i18n pattern:

1. Add the code to the relevant literal union in `packages/types/src/error-codes.ts`.
2. Add a translation entry to **both** `packages/i18n/locales/pt-BR/errors.json` and `.../en/errors.json` — CI-enforced by `apps/web/shared/lib/i18n/error-codes-exhaustiveness.spec.ts`.
3. Throw it via the typed constructor — `throwProblemDetail(status, BookingErrorCode.XXX, detail, field?)` (`packages/nestjs-http/src/problem-detail.ts`, or the BFF's narrower `apps/bff/src/shared/http/problem-detail.ts` wrapper) — or a named domain error class implementing `DomainErrorShape`.

Codes are additive-only once shipped: never renamed or repurposed. Retiring a code means removing every throw site first, then leaving the catalog entry + translation in place for at least one release cycle before deleting both together (a released frontend bundle may hold a cached reference to a code during a rolling deploy).

---

**Status:** Live
**Reference:** RFC 9457 (https://tools.ietf.org/html/rfc9457)
**Full pattern & discovery history:** `docs/ENGINEERING_RULES.md` § Exception handling & i18n pattern, `td/TD23-EXCEPTION-HANDLING-I18N-PATTERN.md`
