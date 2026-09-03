# API Contracts - Ikaro

## Overview

Ikaro follows a **RESTful API** standard using **JSON** for all payloads. All communication must be encrypted over **HTTPS**.

**Error Response Standard:** [RFC 9457 Problem Details](https://tools.ietf.org/html/rfc9457) — see [25-ERROR_CATALOG.md](25-ERROR_CATALOG.md) for complete error reference.

> ⚠️ **PLANNED, NOT YET BUILT:** every endpoint/param tagged `(M21)` / `(M21 Cluster N)` throughout this doc (Service Extensions §1, Recurring Reservations/Availability Alerts/Future Commitment Exceptions §4, Classes & Sessions §4b, and the M21-tagged extensions to Reschedule/Availability/Services) belongs to the Multi-Vertical Scheduling epic — none of it exists in code yet. See `plan/M21-MULTIVERTICAL-FOUNDATION.md` through `plan/M24-MULTIVERTICAL-CLASSES-SESSIONS.md`. **Exception: Resource Management §4 (UC-044–UC-049) shipped in M21-S01 (backend/BFF) and M21-S04 (manager dashboard frontend)** — fully live. Untagged content in this doc is live MVP behavior.

---

## Base Standards

### 1. **Base URL**
All endpoints are served by the **BFF** (`apps/bff/`) — the frontend never calls the backend directly.

- **Production:** `https://bff.<ikaro-domain>/v1`
- **Staging:** `https://ikaro-bff-staging-<hash>-uc.a.run.app/v1` (get URL from `terraform output bff_url`)
- **Local:** `http://localhost:3002/v1`

> The backend (`apps/backend/`) is an internal Cloud Run service. It is not publicly reachable. Only the BFF calls it, via `BACKEND_INTERNAL_URL`.

### 2. **Tenant Scoping (Mandatory)**
- **Public/Guest Endpoints:** Must include `X-Tenant-Slug` header (e.g., `autowash-pro`).
- **Authenticated Endpoints:** Must include `Authorization: Bearer <JWT>`.
- **Validation:** The BFF will reject any request where the `X-Tenant-Slug` does not match the `tenantId/slug` context in the JWT (for authenticated requests).

### 3. **Pagination Strategy — Three Incompatible Shapes (Known Inconsistency)**

> ⚠️ **Known inconsistency — tech debt, not a typo.** List endpoints were originally designed around one universal `{ data, pagination }` shape. In practice, three different shapes were implemented across BFF modules, and a fourth endpoint returns no pagination wrapper at all. This section documents what each endpoint **actually** returns today. Do not "fix" one example to match another without a coordinated cross-module change — see the callout at the end of this section before unifying them.

#### **Pattern A — Offset-based, `items` key, no `nextOffset`**

Used by `GET /bookings` (`BookingListResponse`, `apps/bff/src/features/booking/bookings.types.ts`).

```
GET /bookings?status=APPROVED&limit=10&offset=0
Response:
{
  "items": [ /* 10 bookings */ ],
  "pagination": { "limit": 10, "offset": 0, "total": 45, "hasMore": true }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `items` | array | Array of items for this page |
| `pagination.limit` | integer | Requested limit |
| `pagination.offset` | integer | Requested offset |
| `pagination.total` | integer | Total count of all items |
| `pagination.hasMore` | boolean | true = more items beyond this page |

#### **Pattern B — Offset-based, `items` key, with `nextOffset`**

Used by `GET /staff` (`StaffListResponse`, `apps/bff/src/features/staff/staff.types.ts`).

```
GET /staff?limit=25&offset=0
Response:
{
  "items": [ /* 25 staff members */ ],
  "pagination": { "limit": 25, "offset": 0, "total": 8, "hasMore": false, "nextOffset": 25 }
}
```

Same fields as Pattern A, plus `pagination.nextOffset` (convenience: `offset + limit`).

#### **Pattern C — Page-based, custom item key, no `hasMore`/`nextOffset`**

Used by `GET /loyalty/entries` and `GET /loyalty/redemptions` (`BackendLoyaltyEntriesResponse` / `BackendLoyaltyRedemptionsResponse`, `apps/bff/src/features/loyalty/loyalty.types.ts`). The item array key matches the resource name (`entries`, `redemptions`) rather than a generic `items`/`data`.

```
GET /customers/:id/loyalty/entries?page=1&limit=20
Response:
{
  "entries": [ /* 20 entries */ ],
  "pagination": { "page": 1, "limit": 20, "total": 83 }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `entries` | array | Array of items for this page (named after the resource — `redemptions` for the redemptions endpoint) |
| `pagination.page` | integer | 1-indexed page number (not an offset) |
| `pagination.limit` | integer | Requested page size |
| `pagination.total` | integer | Total count of all items |

#### **Pattern D — Unpaginated (full list)**

Used by `GET /public/services` (`HotsiteServiceListResponse`, `packages/types/src/hotsite.ts`) — see "Services List" example below. No `limit`/`offset`/`page` query params accepted; no pagination wrapper in the response. **Corrected 2026-08-08:** this was previously documented as the bare `GET /services` — that path is actually the `STAFF`|`MANAGER`-authenticated staff list endpoint (see § below); the public, unauthenticated list moved to `/public/services` in `M13-S05` (`docs/24-BFF_ARCHITECTURE.md`'s `.public.controller.ts` → `public/<resource>` convention).

```
GET /public/services
Response:
{ "items": [ /* all active services for the tenant */ ] }
```

#### **Important Notes:**

1. **Total Count**: Computing `total` requires a COUNT query. For performance-sensitive endpoints, consider caching or omitting `total` on subsequent pages.
2. **Validation** (Patterns A/B): `limit` must be 1–100 (`400` if not); `offset` must be ≥ 0 (`400` if not).
3. **Validation** (Pattern C): `page` must be ≥ 1; `limit` must be 1–100.
4. **New endpoints:** pick whichever existing pattern is closest to the consuming module's other endpoints — do not introduce a fifth shape.

> ⚠️ **Known inconsistency — worth unifying later.** Having three paginated shapes (plus one unpaginated endpoint) is tech debt: frontend fetchers cannot share a single generic pagination hook/type today. This is intentionally **not** silently merged into one "corrected" shape in this doc, because doing so would misrepresent what the code returns. If/when this is unified, update this section, the affected BFF response types, and every frontend consumer in the same change.

#### **Future: Cursor-Based Pagination**

For even better performance with large datasets (Phase 2), consider cursor-based pagination:
- Use `after` cursor instead of `offset`
- Cursor encodes the last item's ID and sort value
- More efficient, no deep scanning needed
- Can be introduced non-breaking: keep limit/offset, add `after` as alternative

---

## 1. Authentication & Multi-Tenancy

### **Auth Flow (UC-021, UC-022, UC-023)**
- `GET /auth/google` -> Redirects to Google OAuth.
- `GET /auth/google/callback` -> Sets `access_token` httpOnly cookie directly and redirects; no intermediate temporary-code step for the flows that ship today.
- `GET /auth/logout` -> Clears the `access_token` cookie, redirects to the hotsite (or bare frontend URL if `tenantSlug` is absent/invalid).
- `POST /auth/switch-tenant` -> (UC-023, customer) `{ targetTenantId: uuid }` — sets `access_token` httpOnly cookie with new tenant scope; returns `{ tenantSlug: string; expiresIn: string }`. No JWT in response body.
- `GET /auth/staff-tenants` -> (UC-022, staff, authenticated) Lists every active tenant the current Google account is staff at.
- `POST /auth/switch-staff-tenant` -> (UC-022, staff) Same shape as the customer switch, staff-scoped.

> **Removed (`M13-S14`):** `POST /auth/token` and `GET /auth/tenants` — the pre-login `/select-tenant` customer flow they backed was descoped as unreachable from any shipped UI (every customer login starts from a specific tenant's hotsite, which always supplies the tenant slug directly). Do not resurrect these without a real requirement driving them — see `docs/04-USE_CASES.md` UC-021's note.

### **JWT Structure**
```json
{
  "sub":        "user-uuid-v7",
  "tenantId":   "tenant-uuid-v7",
  "tenantSlug": "autowash-pro",
  "tenantName": "AutoWash Pro",
  "userName":   "Maria Silva",
  "role":       "CUSTOMER | STAFF | MANAGER",
  "locale":     "pt-BR",
  "iat":        123456789,
  "exp":        123456789
}
```
`tenantName`/`userName`/`locale` were added in `M13-S15` specifically so the dashboard/customer shells never need a separate profile fetch just to render a greeting/name.

| Role | Who | Access |
|---|---|---|
| `CUSTOMER` | Authenticated customer | Own bookings, loyalty, profile |
| `STAFF` | Regular employee | All bookings, services, schedule |
| `MANAGER` | Admin/owner (MANAGER role) | Everything STAFF can do + tenant settings, staff management, hotsite |

> **Guest bookings** (UC-001) carry no JWT. The BFF identifies them by the absence of an `Authorization` header. Tenant context comes from the `X-Tenant-Slug` header.

---

## 2. Tenant & Service Discovery

### **Tenant Hotsite Manifest (Public — UC-001, UC-011, M12-S01)**
Used by the Next.js hotsite renderer to fetch full branding and layout for a tenant slug.
- `GET /platform/manifest/:slug`
- **Public** — no auth required; no `X-Tenant-Slug` header needed (slug is the path param)
- **Response headers:** `Cache-Control: public, max-age=300` (Next.js ISR respects this)
- **Response:** `200 OK` with **Hotsite Manifest**:
  ```json
  {
    "tenant": { "id": "uuid-v7", "name": "Lavacar BeloAuto", "slug": "lavacar-beloauto" },
    "branding": {
      "primaryColor": "#f97316",
      "secondaryColor": "#fff7ed",
      "backgroundColor": "#ffffff",
      "textColor": "#111827",
      "headingFontFamily": "Inter, sans-serif",
      "bodyFontFamily": "Inter, sans-serif",
      "logoUrl": "https://storage.googleapis.com/tenants/.../logo.png",
      "borderRadius": "rounded",
      "buttonStyle": "filled",
      "spacing": "comfortable",
      "shadowStyle": "subtle",
      "buttonBackgroundColor": "#fbbf24",
      "buttonTextColor": "#0f172a"
    },
    "layout": [
      { "type": "HERO",         "enabled": true,  "data": { "variant": "centered", "title": "Bem-vindo", "ctaLabel": "Agendar agora", "ctaTarget": "booking" } },
      { "type": "SERVICE_LIST", "enabled": true,  "data": { "showPrices": true, "showPoints": true, "layout": "grid" } },
      { "type": "GALLERY",      "enabled": false, "data": { "images": [], "layout": "grid", "maxVisible": 6 } }
    ],
    "isPublished": true,
    "business": {
      "phone": "31999999999",
      "email": "contato@lavacar.com.br",
      "address": {
        "street": "Rua das Flores", "number": "123", "complement": "Loja 2",
        "neighborhood": "Centro", "city": "Belo Horizonte", "state": "MG", "zipCode": "30130000"
      }
    },
    "localization": { "language": "pt-BR" },
    "seo": { "title": null, "description": null, "ogImageUrl": "" }
  }
  ```

- **Module types:** `HERO | SERVICE_LIST | GALLERY | TESTIMONIALS | BOOKING_CTA | ABOUT | CONTACT`
- **`enabled: false`** modules are included in the response; the frontend decides to skip them
- **`business`** (M12-S06) — resolved from `tenants.settings.businessInfo` (`docs/21-TENANTS_SETTINGS_SCHEMA.md` §6), camelCased. Always present; any of `phone`/`email`/`address` may be `null` if the admin hasn't filled them in. Consumed by the `CONTACT` module — see `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` §4 CONTACT.
- **`localization`** (M12-S09) — `language` resolved from `tenants.settings.localization.language` (`docs/21-TENANTS_SETTINGS_SCHEMA.md` §5), e.g. `"pt-BR"`. Always present, falling back to `"pt-BR"` when `isPublished: false`. Drives the hotsite's `og:locale` (converted to `pt_BR` format).
- **`seo`** (M12-S09; `ogImageUrl` added M18-S03) — tenant-configured overrides, edited via `PATCH /v1/tenants/hotsite` (see "Hotsite Admin Management" below). `title`/`description` are `string | null`; `null` means the admin hasn't set an override, and the frontend (`buildHotsiteMetadata()`) falls back to a generated `<title>`/meta description derived from `tenant.name` and `business.address` (city/state). `ogImageUrl` is `string` (never `null` — empty string means unset), a **permanent public address** like `branding.logoUrl`, resolved the same way; it's the source for the Open Graph share-image card and is intentionally separate from `branding.logoUrl` (small/square brand mark) — see `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` §11.
- **`isPublished: false`** — still a `200`, not a `404`. Minimal payload: `branding` reflects the admin's configured (but unpublished) branding — needed so the "Em breve" placeholder (M12-S08) can render with the tenant's `var(--ba-*)` tokens. `layout: []` and `business` (all fields `null`) are stubbed — this public, unauthenticated endpoint never exposes a tenant's draft layout/services/gallery/contact info before they publish. (The admin's full draft state remains available via the authenticated `GET /v1/tenants/hotsite` below.)
- `404` — tenant slug not found (no `HotsiteConfig` reachable for this slug at all)

### **Published Hotsites Listing (Public — M12-S09)**
Used by `app/sitemap.ts` to enumerate every published tenant hotsite for search-engine discovery.
- `GET /platform/published-hotsites`
- **Public** — no auth required
- **Response:** `200 OK`
  ```json
  {
    "items": [
      { "slug": "lavacar-beloauto", "updatedAt": "2026-06-10T12:00:00.000Z" }
    ]
  }
  ```
- Only includes tenants where `tenants.is_active = true` AND `hotsite_configs.is_published = true`
- `updatedAt` is `hotsite_configs.updated_at` (ISO-8601 UTC) — used as `lastmod` in the sitemap
- Backed by `GET /internal/tenants/published-hotsites` (Platform context, gated by the global `InternalApiGuard`)

### **Chatbot Widget (Public — UC-033, UC-034)**
The `CHATBOT` hotsite module's own endpoints — never part of the cached manifest (§ above), since availability and message content are visitor-specific/live, not static per-tenant data. Full design: `docs/discovery/CHATBOT/CHATBOT.md`.

- `GET /public/platform/chatbot/status`
  - **Public** — `X-Tenant-Slug` header required (same convention as `GET /public/services`, not a query param; `.public.controller.ts` routes always carry the `public/` prefix — `docs/24-BFF_ARCHITECTURE.md`)
  - Never cached — always evaluates live state, unlike the 5-minute-cached manifest
  - **Response:** `200 OK` — `{ "available": boolean }`
  - Evaluates, for the tenant resolved from the header (and that tenant's resolved LLM provider — `tenant override ?? platform default`): tenant daily cap already exhausted, tenant concurrency cap already exhausted, resolved provider failing a health check, platform-wide daily spend circuit breaker tripped, resolved provider's balance floor tripped (`platform.chatbot_provider_balance`, a local lookup — never a live external call here)
  - `404` — tenant slug not found

- `POST /public/platform/chatbot/messages`
  - **Public** — `X-Tenant-Slug` header required
  - **Request body:** `{ "sessionId"?: "uuid-v7", "message": "string, max 5000 chars" }` — `sessionId` omitted on the first message of a conversation
  - **Response `200 OK`:** `{ "sessionId": "uuid-v7", "reply": "string" }`
  - `400` — `message` exceeds 5000 chars (BFF-side absurd-payload outer bound) **or** the tenant's real, resolved `maxMessageLengthChars` (default 1000, an Ikaro-only override never exposed to the BFF — `docs/21-TENANTS_SETTINGS_SCHEMA.md` §7), enforced backend-only in `SendChatMessageUseCase`, still before any LLM call
  - `429` — a volume cap rejected the request: new-session caps (daily/per-IP/concurrency), existing-session cap (`maxMessagesPerConversation`), **or** either platform-wide backstop (global daily spend circuit breaker, provider balance floor — `CHATBOT.md` §8 layers 9-10; decided during M19-S05 story-discovery, 2026-08-12, that these map to the same status as the per-tenant caps, not `503`) — a specific error code per layer, see `docs/discovery/CHATBOT/CHATBOT.md` §8 for the full list. **The platform-wide backstops are evaluated on new-session creation only** — `CHATBOT.md` §8.9: "already-open conversations remain bounded by their own per-session caps regardless"; an existing session is never rejected by either backstop mid-conversation (PR #360 review)
  - `503` — LLM provider call failed (timeout, upstream error, insufficient credits) — widget shows the interrupted state, phone/WhatsApp fallback offered
  - `404` — tenant slug not found, or `sessionId` doesn't belong to this tenant

### **Lead Form Widget (Public — UC-038, UC-039, UC-040)**
The `LEAD_FORM` hotsite module's own endpoints — extends the existing `platform.public.controller.ts` (`.public.controller.ts` under `public/`, `docs/24-BFF_ARCHITECTURE.md`), never part of the cached manifest, since the question catalog and submission are live/write data, not static per-tenant data. Full design: `docs/discovery/lead-form-module/lead-form-module.md`. Backend surface: a new bare, guest-reachable `platform/lead-form` controller (mirrors `platform/chatbot`'s `ChatbotController` shape exactly — no `/public/` prefix, that convention is BFF-only) — resolved during M20-S05's own story-discovery, 2026-08-25, since M20-S02 deferred all HTTP wiring to S05.

- `GET /public/platform/lead-form/:slug`
  - **Public** — `X-Tenant-Slug` header required (same convention as the Chatbot Widget above). The header is the authoritative tenant resolver; the `:slug` path segment must match it exactly (`400 GENERIC_VALUE_INVALID`, `field: slug`, if they disagree — a caller-side inconsistency, not "tenant doesn't exist," so `400` rather than `404`)
  - **Response:** `200 OK` — `{ "audienceMode": "GUEST_AND_CUSTOMER" | "CUSTOMER_ONLY", "questions": [{ "id", "label", "type", "required", "options"? }] }` — `options` present only for `SINGLE_CHOICE`/`MULTIPLE_CHOICE`
  - `404` — tenant slug not found (`withPublicTenant`), or the `LEAD_FORM` module isn't `enabled` in the tenant's layout (backend `LeadFormNotEnabledError`, `PLATFORM_LEAD_FORM_NOT_ENABLED`)

- `POST /public/platform/lead-form/:slug/submissions`
  - **Public** — `X-Tenant-Slug` header required. Route stays `@Public()` even for an authenticated customer — see the 401 row below for how customer identity is resolved without a guard
  - **Request body:** `{ "name": "string", "email": "string", "phone": "string", "answers": [{ "questionId": "uuid", "value": "string | string[]" }], "turnstileToken": "string" }`
  - **Response `200 OK`:** `{ "submissionId": "uuid-v7" }`
  - BFF forwards `turnstileToken` unverified; the **backend** verifies it via Cloudflare `siteverify` as the first step of `CreateLeadFormSubmissionUseCase.execute()`, before even reading the tenant's `LeadFormConfig` (relocated here from the BFF in M20-S14 — the BFF's `ALL_TRAFFIC` egress has no Cloud NAT, so its own outbound call to Cloudflare had no route out; the backend's `PRIVATE_RANGES_ONLY` egress already reaches third parties unconditionally)
  - BFF optionally decodes a customer session from the `Authorization: Bearer <jwt>` header via the existing `decodeUserJwt()` helper (`apps/bff/src/shared/auth/decode-user-jwt.ts` — the established pattern for a `@Public()` route that needs to identify an authenticated user manually, already used by the attachment-upload flow) and forwards `customerId: user.sub` only when the decoded token is both a genuine `CUSTOMER` role **and** scoped to the resolved tenant (`user.tenantId === tenantId`) — any other case (STAFF/MANAGER token, or a customer of a different tenant) forwards `customerId: null` instead of rejecting outright, since browsing another tenant's public hotsite while logged in elsewhere is a normal, benign scenario. This is identification only, never an auth requirement at the BFF layer
  - `400` — the `:slug` path segment doesn't match the `X-Tenant-Slug` header (`GENERIC_VALUE_INVALID`, `field: slug` — same rule as the `GET` row above; checked at the BFF, independent of Turnstile), missing/invalid `name`/`email`/`phone` (`EMAIL_FORMAT_INVALID`/`PHONE_FORMAT_INVALID`/`GENERIC_FIELD_REQUIRED`), a `required: true` question left unanswered (`GENERIC_FIELD_REQUIRED`), an answer referencing a `questionId` not in the tenant's current question catalog (`GENERIC_VALUE_INVALID` — whole submission rejected, not silently dropped), **or** Turnstile verification failed/expired — checked backend-side, as the very first step, before any of the other `400` checks above (`PLATFORM_LEAD_FORM_TURNSTILE_VERIFICATION_FAILED`, M20-S14 — was `BFF_TURNSTILE_VERIFICATION_FAILED` before relocation)
  - `401 AUTH_UNAUTHORIZED` — `audienceMode === 'CUSTOMER_ONLY'` and no customer session was decoded. Thrown **backend-side**, inside `CreateLeadFormSubmissionUseCase` (which already reads `LeadFormConfig` once for answer enrichment below, so this reuses that same read rather than costing a second BFF→backend round-trip) — the error's `code` is the existing `AuthErrorCode.UNAUTHORIZED`, not a new code
  - `429 PLATFORM_LEAD_FORM_DAILY_CAP_REACHED` — tenant-wide or per-IP daily submission cap reached, enforced backend-side via `lead_form_submissions` count queries (mirrors `POST /public/platform/chatbot/messages`'s cap-enforcement pattern exactly — never a BFF-layer check)
  - `404` — tenant slug not found, or the `LEAD_FORM` module isn't `enabled`
  - Every answer that passes validation is enriched backend-side from the tenant's own live question catalog into the full `{questionId, questionLabel, questionType, answerValue}` snapshot shape `LeadFormSubmission.create()` requires — the backend is the only trusted source for `questionLabel`/`questionType`, client-supplied values for those fields are never used even if present

### **Tenant Settings (Admin — UC-026)**
First documented entry for this route — it existed and was implemented (`M13-S31`) before it had a dedicated API contract entry; see `docs/04-USE_CASES.md` UC-026 and `docs/21-TENANTS_SETTINGS_SCHEMA.md` for the full field-level rules this section doesn't repeat.

- `GET /v1/tenants/settings` → `200 { tenantId, name, slug, settings: { loyalty, booking, businessHours, notification, localization, businessInfo, chatbot, leadForm } }` — `STAFF`|`MANAGER` (read allowed to both roles)
- `PATCH /v1/tenants/settings` → body `{ settings: { <category>?: {...}, ... } }` — partial update, any subset of the category keys nested under `settings` (unspecified categories/fields unchanged); `200` returns updated state — `MANAGER` only, `STAFF` gets `403`
  - Request body is validated against a `.strict()` schema with a fixed category key list on both the BFF (`UpdateTenantSettingsBodySchema`, `apps/bff/src/features/platform/tenant-settings.schemas.ts`) and backend DTO layers (`UpdateTenantSettingsSchema`, `apps/backend/src/contexts/platform/application/dtos/update-tenant-settings.dto.ts`) — an unrecognized top-level key under `settings` is rejected as `400`, not silently ignored. `chatbot` and `leadForm` are categories in that fixed list alongside the six pre-existing ones.
  - `chatbot.knowledgeText` (`docs/21-TENANTS_SETTINGS_SCHEMA.md` §7): optional string, no hardcoded length bound at the Zod layer — the resolved `maxKnowledgeTextLength` cap (default 4000, or a tenant's own Ikaro-granted override) is enforced solely by the domain-layer `ChatbotSettingsValidator`, `400 PLATFORM_SETTINGS_CHATBOT_KNOWLEDGE_TEXT_TOO_LONG` if exceeded (a static Zod max would make an above-4000 override unenforceable, since Zod would reject the request before the domain layer's resolved check ever ran — decided during M19-S04 `/story-discovery`, 2026-08-11). This is the **only** tenant-editable field in the `chatbot` settings category; the 8 volume/cost caps and `llmProvider`/`llmModel` are never accepted in this body — a request including any of them is rejected `400` (not silently stripped), same as any other unrecognized key under `chatbot`, since `chatbot` accepts only `knowledgeText` at the Zod layer (see `docs/discovery/CHATBOT/CHATBOT.md` §5 for why these stay Ikaro-only overrides)
- `400 PLATFORM_SETTINGS_UPDATE_EMPTY` — body has no recognized fields at all
- `leadForm` (`docs/21-TENANTS_SETTINGS_SCHEMA.md` §8, UC-042): `leadForm` is a category in the fixed key list (added by M20) alongside the seven pre-existing ones. **All three fields are tenant-editable — unlike `chatbot`, this category has no Ikaro-only deviation** (these caps are abuse protection, not shared-cost protection, so there's no reason to deny a tenant control over their own value):
  - `retentionMonths`: integer 1-24, default 6 — `400 PLATFORM_SETTINGS_LEAD_FORM_RETENTION_MONTHS_INVALID` if out of range
  - `maxSubmissionsPerDay`: integer 1-1000, default 100 — `400 PLATFORM_SETTINGS_LEAD_FORM_MAX_SUBMISSIONS_PER_DAY_INVALID` if out of range
  - `maxSubmissionsPerIpPerDay`: integer 1-100, default 3 — `400 PLATFORM_SETTINGS_LEAD_FORM_MAX_SUBMISSIONS_PER_IP_PER_DAY_INVALID` if out of range. Raising this is the documented mitigation for a tenant seeing false-positive blocks from legitimate visitors sharing one carrier-assigned IP (common on Brazilian mobile networks)
  - All three validated by the domain-layer `LeadFormSettingsValidator` (mirrors `BookingSettingsValidator`'s per-field dedicated-code pattern)

### **Hotsite Admin Management (Admin — UC-027, M12-S02)**
Lets a `MANAGER` configure branding, layout modules, and publish status. Mirrors the public manifest's `branding`/`layout`/`isPublished` shape, but `GET` always returns the full draft state regardless of publish status — unlike the public endpoint, which stubs `layout: []` and `business` (all fields `null`) when `isPublished: false` (see §1 above).

- `GET /v1/tenants/hotsite` → `200 { branding, layout, seo, isPublished, updatedAt }` — `MANAGER` only
- `PATCH /v1/tenants/hotsite` → body `{ branding?, layout?, seo?, audienceMode?, questions? }` (partial update — unspecified fields unchanged); `200` returns updated state
  - Validation: hex colors must be `#rrggbb` · `borderRadius/buttonStyle/spacing/shadowStyle` must be known enum values · layout module `type` must be a known `HotsiteModuleType` — any violation → `400`
  - `audienceMode?`/`questions?` (M20-S01, folded into this endpoint at M20-S08 — see "Lead Form Admin Config" below) write the separate `LeadFormConfig` aggregate, not `HotsiteConfig` — both saved in the same transaction when either is present. `layout[]`'s own `LEAD_FORM` entry must never carry `audienceMode`/`questions` inside its `data`; only these two top-level fields do
    - `400 PLATFORM_LEAD_FORM_QUESTION_LIMIT_REACHED` — more than 20 questions
    - `400 PLATFORM_LEAD_FORM_QUESTION_OPTIONS_INVALID` — a `SINGLE_CHOICE`/`MULTIPLE_CHOICE` question with < 2 or > 10 options
    - `400 GENERIC_FIELD_REQUIRED` — a question with an empty `label`
  - `branding.buttonBackgroundColor`/`branding.buttonTextColor` (M12-S11) are optional hex overrides for CTA button colors — see `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` §2 "Button Color Tokens" for `filled`/`outline`/`ghost` semantics
  - Image promotion (TD22): every non-empty image path submitted (`branding.logoUrl`, `seo.ogImageUrl` (M18-S03), module `backgroundImageUrl`/`imageUrl`/`avatarUrl`, `GALLERY` images with `source: 'upload'`) is either a `tmp/<tenantId>/...` staging path — validated (tenant-owned, exists in the private bucket), promoted to a permanent `tenants/<tenantId>/hotsite/<purpose>/<uuid>/<fileName>` object in the public bucket, then rewritten and the tmp original deleted — or an already-permanent `tenants/<tenantId>/hotsite/...` path, validated as still existing and left untouched. A path matching neither shape, a cross-tenant `tmp/` path, or a nonexistent object → `400 hotsite-image-not-uploaded`. A field that changed from one permanent object to another also deletes the superseded object from the public bucket (delete-previous-on-replace); an untouched field is never re-promoted or deleted. See "Hotsite Image Upload" below for the full contract.
  - `seo.title`/`seo.description` (M12-S09) are optional `string | null` overrides for the public hotsite's `<title>`/meta description — `title` max 70 chars, `description` max 160 chars; exceeding either → `400`
  - `seo.ogImageUrl` (M18-S03) is an optional `string` — same path-shape validation as `branding.logoUrl` (empty, a permanent `tenants/<id>/hotsite/...` path, or a `tmp/<id>/...` staging path); goes through the same promotion/existence-check flow above. Uploaded via the `'seo-og-image'` purpose (see "Hotsite Image Upload" below), auto center-cropped client-side to 1200×630 before upload — unlike `branding.logoUrl` (auto-cropped to 1:1), since it's a landscape share-image card, not a small brand mark.
- `POST /v1/tenants/hotsite/publish` → `200 { isPublished: true }`; `400 publish-requires-enabled-module` if the layout has no `enabled: true` modules
- `POST /v1/tenants/hotsite/unpublish` → `200 { isPublished: false }`
- All four require JWT + `MANAGER` role — `STAFF` gets `403`

### **Chatbot Cap Status (Admin — UC-027 A5)**
Powers the red banner on the `CHATBOT` module's own config screen only (not shown for any other module type, and not shown on the visitor-facing widget — that's `GET /public/platform/chatbot/status` above).

- `GET /v1/tenants/chatbot/cap-status` → `200 { dailyCapReachedToday: boolean }` — `MANAGER` only (matches Hotsite Admin Management's all-MANAGER convention, since this reads out inside `/dashboard/hotsite`)
  - Reuses the identical per-tenant daily-cap `COUNT` query `POST /public/platform/chatbot/messages` already runs for cap enforcement (`docs/13-DATABASE_SCHEMA.md`'s `platform.chatbot_sessions` index on `(tenant_id, conversation_date)`) — not a new counting mechanism
  - Deliberately narrow: only reports the daily-cap condition. Concurrency cap, platform-wide spend breaker, and provider balance floor are not surfaced here — they stay covered by the visitor-facing "not available" state only, since they aren't specific to or actionable by one tenant

### **Lead Form Admin Config (Admin — UC-037)**

**One read endpoint; writes go through the generic hotsite endpoint.** The teaser fields (`title`/`subtitle`/`eyebrow`/`ctaLabel`/`variant`/`backgroundImageUrl`/`backgroundImagePosition`/`bgStyle`) live in `HotsiteConfig`'s `layout[]` entry for this module (same as every other module type), while `audienceMode`/`questions[]` live in the separate `LeadFormConfig` aggregate (deliberately — see `docs/13-DATABASE_SCHEMA.md` § `platform.lead_form_configs` for why: embedding up to 20 questions in the publicly-cached manifest would bloat it for every visitor who never opens the form). That split is correct and stays.

An earlier design (M20-S01–S08) gave this its own parallel `PATCH /v1/tenants/lead-form/config`, accepting `branding`/`layout`/`seo` as a redundant second copy of the same fields `PATCH /v1/tenants/hotsite` already accepted, purely so both aggregates could save in one transaction. That duplicated `UpdateHotsiteContentUseCase`'s own image-promotion/persist logic near-completely in a second use case, and the frontend had to special-case which endpoint to call depending on whether the manager was editing `LEAD_FORM`. M20-S08 folded `audienceMode`/`questions` into `PATCH /v1/tenants/hotsite` as two additional optional fields instead (see that endpoint's own doc above) — one use case, one endpoint, one transaction, no redundant field duplication. The panel's "Aplicar" button still only commits to the hotsite editor's temporary local draft; "Publicar" is still the persistence boundary, now always through the one generic mutation.

**The module's `enabled` on/off toggle** is also just `layout[].enabled` on that same generic `PATCH /v1/tenants/hotsite` call, exactly like every other module type — nothing special about it.

- `GET /v1/tenants/lead-form/config` → `200 { title, subtitle, eyebrow, ctaLabel, variant, backgroundImageUrl, backgroundImagePosition, bgStyle, audienceMode, questions: [{id,label,type,required,options?,order,hasSubmissions}] }` — `MANAGER` only. Teaser fields resolved from `HotsiteConfig`'s current layout entry, `audienceMode`/`questions` from `LeadFormConfig` — one read, two sources, merged before responding. `hasSubmissions` is computed with one tenant-scoped lookup of distinct question IDs from submission snapshots, so the config panel can decide whether removal needs confirmation without one request per question. This is a genuinely distinct read shape from `GET /v1/tenants/hotsite` (the `hasSubmissions` computation, the merge of two aggregates into one config-panel-shaped response), which is why it stays its own endpoint even though the write side folded away.
- Writes: see `PATCH /v1/tenants/hotsite` above — no separate PATCH here.

### **Lead Form Status (Admin, nav-gating — UC-041)**
Powers the dashboard's "Leads" sidebar item, which is **gated**, not always shown — a tenant that has never enabled the `LEAD_FORM` module gets no nav item pointing at a screen that would be permanently empty. Deliberately separate from `GET /v1/tenants/lead-form/config` above (which is `MANAGER`-only and returns far more than a boolean) because both `STAFF` and `MANAGER` need to know whether to render this nav item — mirrors `GET /public/platform/chatbot/status`'s own shape, admin-side instead of public-side.

- `GET /v1/tenants/lead-form/status` → `200 { enabled: boolean }` — `STAFF`\|`MANAGER`. Reads the `LEAD_FORM` module's `enabled` flag from `HotsiteConfig`'s layout array only — no `audienceMode`/`questions` exposed. Called server-side by `loadDashboardShellContext()` (`apps/web/shells/dashboard/model/dashboard-shell-context.ts`, called independently by every top-level dashboard section's own `layout.tsx` — there is no single shared layout) on every dashboard page load (cheap, single boolean) to decide whether to render the "Leads" item for `Sidebar`/`BottomNav`/`MoreSheet`

### **Leads Submissions (Admin — UC-041)**

- `GET /v1/tenants/lead-form/submissions?page=&pageSize=&search=&filters=&submittedFrom=&submittedTo=` → `200 { items: [{id, name, email, phone, submittedAt}], page, pageSize, total }` — `STAFF`\|`MANAGER`, ordered `submittedAt DESC`
  - `search` (optional, M20-S12) — **basic** free-text search: case-insensitive partial match against `name`, `email`, or any `platform.lead_form_answers` row's `question_label`/`answer_value` for that submission (`docs/13-DATABASE_SCHEMA.md`). **Non-empty required, no minimum length beyond that** (revised M20-S13, 2026-08-27 — the original M20-S12 design rejected anything under 3 characters, reasoning the backing `pg_trgm` GIN index can't accelerate a pattern with no extractable trigram; that reasoning about the index is still correct, but rejecting the request outright was reconsidered after a more precise cost estimate: the per-question match is an `EXISTS` correlated on `(tenant_id, submission_id)`, which `lead_form_answers`'s own `(tenant_id, submission_id, question_label)` index covers, so the unindexed fallback only costs a short ILIKE over one submission's own ≤20 answer rows — the real bound scales with a tenant's own submission count (up to ~730,000 at this feature's absolute configured ceiling), not the much larger cross-submission answer-row total. Rejecting a real short search (an age, "25") outright was judged the worse trade-off — full reasoning: `packages/validation/src/lead-form-submission.ts`). An empty `search` is rejected `400 GENERIC_VALUE_TOO_SHORT`. `search` and `filters` are mutually exclusive in one request — pass one or the other, never both (the UI's basic/advanced modes are alternatives, not combinable in M20). Sending both is rejected `400 GENERIC_VALUE_INVALID` before the query runs (story-discovery decision, M20-S12, 2026-08-27).
  - `filters` (optional, M20-S12) — **advanced**, structured, ANDed per-question search: a URL-encoded JSON array, `[{"questionLabel": "Qual seu estado civil?", "value": "casado"}, {"questionLabel": "Onde você mora?", "value": "São Paulo"}]`. Each entry becomes one `EXISTS (... WHERE question_label = :questionLabel AND answer_value ILIKE '%'||:value||'%')`, ANDed together — matches only a submission satisfying *every* filter. `questionLabel` matches by **exact equality** (populated from a dropdown — see the filter-options endpoint below — never free-typed), `value` by the same non-empty-only rule as `search` (M20-S13). Capped at 5 filters per request (`400 GENERIC_VALUE_OUT_OF_RANGE` beyond that) — a deliberate small bound, not a real usage limit, purely to keep one request's `EXISTS` chain bounded.
  - `submittedFrom`/`submittedTo` (optional, M20-S12) — a **date range**, each `YYYY-MM-DD`, expressed in the tenant's own `settings.businessHours.timezone`, both inclusive from the caller's perspective. Orthogonal to `search`/`filters` — combines with either (or neither) via `AND`, never a third mutually-exclusive mode; "leads from Aug 1–15" works standalone or narrowed further by a search term. Resolved server-side to a half-open UTC instant range `[submittedFrom's tenant-local midnight, day-after-submittedTo's tenant-local midnight)` via `localDateTimeToUTCIso()` (`apps/backend/src/shared/utils/calendar-date.ts` — the same real utility Chatbot's own tenant-timezone-aware `conversationDate` bucketing uses, not the UTC-naive `todayUTC()`/`startOfDayUTC()` pair that exists only for the platform-wide, not-tenant-scoped spend breaker). `submittedFrom > submittedTo` (when both given) → `400 GENERIC_VALUE_OUT_OF_RANGE`. Uses the existing `(tenant_id, submitted_at DESC)` index directly — no new index needed.
  - Empty/omitted `search`/`filters`/`submittedFrom`/`submittedTo` behaves exactly as before this addition. A result set of zero matches is `200 { items: [], total: 0 }`, never `404`.
- `GET /v1/tenants/lead-form/submissions/filter-options` → `200 { questionLabels: string[] }` — `STAFF`\|`MANAGER`. Distinct `question_label` values ever recorded for this tenant in `platform.lead_form_answers`, alphabetically ordered — **includes labels from questions since edited or removed from the live `LeadFormConfig`** (decided explicitly during design: a manager can still filter by an old question's answers even after changing the live form, since the filter matches the submission's own snapshot, not the current config). Powers the advanced filter's "pergunta" dropdown; not paginated (bounded by how many distinct questions a tenant has ever asked, not by submission volume).
- `GET /v1/tenants/lead-form/submissions/:id` → `200 { id, name, email, phone, answers: [{questionLabel, questionType, answerValue}], submittedAt, customerId: string | null }` — `STAFF`\|`MANAGER`. `customerId` is set when the submitter was an authenticated customer at submission time, `null` for a guest — powers the detail page's guest/customer indicator (M20-S10, story-discovery 2026-08-27)
  - `404` — submission doesn't exist in this tenant
- **Not implemented:** no CSV export endpoint — removed from this milestone's scope entirely (see `plan/M20-LEAD-FORM-MODULE.md` Non-Goals for the accepted-risk note this implies alongside UC-043's retention purge). Do not assume `GET .../submissions/export` exists.

### **Hotsite Image Upload (Admin — UC-027, M12-S02 + M12-S10; tmp/ staging — TD22)**
Generates a GCS signed **upload** URL for hotsite images (logo, hero/CTA backgrounds, gallery, about photos). Reuses the same `IStorageService`/`GcsSignedUrlAdapter` and upload constraints introduced for booking attachments in M115-S01 (15-minute *upload*-URL expiry, content-type lock, 10 MB cap) — no new upload mechanics.

> **Staging, not final placement (TD22):** the signed URL targets a `tmp/<tenantId>/<purpose>/<uuid>/<fileName>` path in the **private** media bucket — not the public hotsite bucket. Nothing uploaded here is public or permanent yet. The object only becomes a real, publicly-addressable hotsite asset once `PATCH /v1/tenants/hotsite` promotes it (see below). This closes three leaks the previous "upload straight to the public bucket" design had: an abandoned upload, an explicit "Remove" before save, and a superseded upload all used to leave an orphaned object in the public bucket forever — see `td/TD22-ORPHANED-UPLOAD-CLEANUP.md`.

**BFF:** `POST /v1/tenants/hotsite/images/signed-url`
- Requires JWT + `MANAGER` role

- **Request body:**
  ```json
  {
    "fileName":    "logo.png",
    "contentType": "image/png",
    "purpose":     "branding"
  }
  ```
  `purpose`: one of `branding | hero | gallery | about | booking-cta | testimonials | seo-og-image | lead-form` (M18-S03, extended M20-S08) — groups uploaded assets by what they're for; also encoded into the staging path so promotion can rebuild the permanent path without a second lookup.

- **Response (201 Created):**
  ```json
  {
    "signedUrl": "http://localhost:4443/ikaro-local/tmp/.../logo.png?X-Goog-Signature=...",
    "filePath":  "tmp/<tenantId>/<purpose>/<uuid>/logo.png",
    "expiresAt": "2026-05-12T00:08:44Z"
  }
  ```

**Storage path rule:** `tmp/<tenantId>/<purpose>/<uuid>/<fileName>` — staged in the **private** media bucket. Not public, not permanent, not yet referenced by anything durable.

`filePath` is what the frontend holds as the field's draft value until the next save. **`PATCH /v1/tenants/hotsite` promotes every `tmp/`-referenced field**: validates the tmp object exists in the private bucket and belongs to the caller's tenant, copies it to `tenants/<tenantId>/hotsite/<purpose>/<uuid>/<fileName>` in the **public** hotsite bucket, rewrites the stored reference to that permanent path, and deletes the tmp original. If the field previously pointed at a different permanent object, that old object is deleted too (delete-previous-on-replace); a field left untouched (still pointing at its existing permanent object) is neither re-promoted nor deleted. **Reading hotsite images back** (post-promotion) works differently from booking attachments: because the object lives in a public bucket, `GetHotsiteManifestUseCase`/`GetHotsiteContentUseCase` resolve `filePath` to a **permanent public URL** via `IStorageService.getPublicUrl()` — a pure string template, no signed URL, no expiry, nothing to regenerate. The admin endpoint (`GET /v1/tenants/hotsite`) and the public manifest (`GET /v1/platform/manifest/:slug`) both return this same resolved address. This is what makes the manifest safely cacheable (`Cache-Control: public, max-age=300`, ISR, future CDN) — an expiring signed URL embedded in cached content would eventually serve a broken image.

(Contrast with booking attachments below, where the bucket is private and a fresh *read*-signed URL genuinely must be minted per display.)

**Error responses:** same constraint set as booking attachments (`400 invalid-file-name`, `400 unsupported-media-type`, plus `400` for an unknown `purpose`) — see §3 Media Upload below for the shared validation table. `PATCH /v1/tenants/hotsite` additionally returns `400 hotsite-image-not-uploaded` for a `tmp/` path that doesn't exist or belongs to another tenant.

### **Hotsite Image Preview — Private Read Signed URL (Admin — TD22)**
A not-yet-promoted `tmp/` image lives in the private bucket, so it can't resolve via the public-bucket string template the admin editor otherwise uses for hotsite images. This endpoint mints a fresh private *read*-signed URL for previewing one — used whenever the editor re-mounts a field showing a `tmp/`-prefixed value with no local blob preview left (e.g. switching tabs before the first save).

**BFF:** `POST /v1/tenants/hotsite/images/read-signed-url`
- Requires JWT + `MANAGER` role

- **Request body:**
  ```json
  { "filePath": "tmp/<tenantId>/<purpose>/<uuid>/logo.png" }
  ```

- **Response (201 Created):**
  ```json
  {
    "signedUrl": "http://localhost:4443/ikaro-local/tmp/.../logo.png?X-Goog-Signature=...",
    "expiresAt": "2026-05-12T00:08:44Z"
  }
  ```

**Error responses:** `400 hotsite-image-not-uploaded` — `filePath` isn't a `tmp/<callerTenantId>/...` path.

### **Hotsite Gallery — Feature a Booking Photo (Admin — UC-027, M12-S02 + M12-S10)**
Lets the admin curate the GALLERY module's "before/after" showcase by selecting a photo straight from one of the tenant's own bookings — guest or authenticated-customer, it makes no difference; `tenantId` is the only check that matters.

**BFF:** `POST /v1/tenants/hotsite/gallery/feature-booking-photo`
- Requires JWT + `MANAGER` role

- **Request body:**
  ```json
  { "bookingId": "uuid", "photoUrl": "tenants/<tenantId>/bookings/<bookingId>/car-front.jpg" }
  ```

- **Response (201 Created):**
  ```json
  {
    "filePath":  "tenants/<tenantId>/hotsite/gallery/<uuid>/car-front.jpg",
    "url":       "https://storage.googleapis.com/ikaro-hotsite-public-prod/tenants/.../car-front.jpg",
    "photoType": "before"
  }
  ```

**What happens server-side:**
1. Loads the `Booking` by `(tenantId, bookingId)` — `404` if it doesn't belong to the caller's tenant
2. Derives `photoType` by checking whether `photoUrl` is present in `booking.beforeServicePhotoUrls` (→ `"before"`) or `booking.afterServicePhotoUrls` (→ `"after"`) — **never** trusts a client-supplied type. A `photoUrl` absent from both → `400` (this is also the integrity check confirming the photo genuinely belongs to that booking)
3. Copies the object from the private booking-photos path to `tenants/<tenantId>/hotsite/gallery/<uuid>/<fileName>` in the **public** hotsite bucket via `IStorageService.copy()` — a copy, not a live reference, so the featured image survives independently of whatever later happens to the source booking (archival, an LGPD erasure request, a dispute, etc.)

The frontend then includes the returned `{ url, photoType }` (plus `bookingId` and an optional `caption`) as a `GalleryImage` entry in the next `PATCH /v1/tenants/hotsite` call — see `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` §4.

**Error responses:**
- `400` — `photoUrl` not found in either of the booking's photo lists
- `404` — booking not found for the caller's tenant
- `403` — caller is `STAFF`, not `MANAGER`

### **Service Management (Admin - UC-012, UC-013)**
- `GET /public/services` -> List **active-only** services for the hotsite (Public, no JWT — `X-Tenant-Slug` header). **Unpaginated** — no `limit`/`offset` query params accepted; returns `{ items: [...] }` (`HotsiteServiceListResponse`, see Pagination Strategy Pattern D above). Each item includes:
  ```json
  {
    "id": "uuid", "name": "Coleta e Entrega", "description": "...",
    "price": { "amount": 20.00, "currency": "BRL", "formatted": "R$ 20,00" },
    "durationMinutes": 15, "loyaltyPointsValue": 1,
    "requiresPickupAddress": true,
    "isActive": true, "createdAt": "2026-01-01T00:00:00.000Z"
  }
  ```
  Response shape: `{ "items": [ { ...above... }, ... ] }`. The frontend uses `requiresPickupAddress` to show/hide the address field as services are added to the basket.
- `GET /services` -> List **all** services for the tenant, including `isActive: false` (STAFF|MANAGER). Returns `{ items: [...], total: number }` (`StaffServiceListResponse`) — each item uses `serviceId` (not `id`) and `price: { amount, currency }` (no `formatted`); see `StaffServiceResponse` in `service.dto.ts`. Lives on the bare `/services` path — see `docs/24-BFF_ARCHITECTURE.md` for why the public list moved to `/public/services` (`M13-S05`).
- `GET /services/:id` -> Single service by id, active or inactive (STAFF|MANAGER). `StaffServiceResponse`. `404` if not found or wrong tenant.
- `POST /services` -> Create service (STAFF|MANAGER). Body includes `requiresPickupAddress: boolean` (default `false`), and, from M21 Cluster 2, `bookingModel: 'APPOINTMENT'|'SESSION'` (UC-056, default `APPOINTMENT`).
- `PATCH /services/:id` -> Update service details/price/duration/`requiresPickupAddress` (STAFF|MANAGER). From M21 Cluster 2, also accepts `bufferAfterMinutes` (UC-053).
- `DELETE /services/:id` -> Deactivate service (STAFF|MANAGER). Returns `204 No Content`.

### **Service Extensions — M21 Cluster 2 (UC-050–056)**

> Auth: JWT + `MANAGER|STAFF` on every endpoint below (same as UC-012/013 — this stays a Service management surface, not the MANAGER-only Resource Management restriction M21 Cluster 1 introduced).

- `PATCH /services/:id/resource-requirements` -> Set/replace a flat (non-legged) service's resource requirements (UC-050 create/edit, UC-051 for a bundle). Body:
  ```json
  {
    "resourceRequirements": [
      { "type": "STAFF", "selectionMode": "CUSTOMER_CHOICE", "resourcePoolIds": ["uuid", "uuid"], "requiredQuantity": 1 },
      { "type": "EQUIPMENT", "selectionMode": "AUTO_ANY" }
    ]
  }
  ```
  - `200` on success
  - `422` if no active resource of a chosen type exists (UC-050 A1)
  - `409` if the service has `legs` set (UC-050 A2)

- `PUT /services/:id/legs` -> Set/replace a service's sequential legs (UC-052). Clears `resourceRequirements`/`bufferAfterMinutes` on save. Body:
  ```json
  {
    "legs": [
      { "legIndex": 0, "name": "Sauna", "durationMinutes": 20, "resourceRequirements": [{ "type": "ROOM", "selectionMode": "AUTO_ANY" }], "transitionGapAfterMinutes": 10 },
      { "legIndex": 1, "name": "Massagem", "durationMinutes": 50, "resourceRequirements": [{ "type": "STAFF", "selectionMode": "CUSTOMER_CHOICE" }, { "type": "ROOM", "selectionMode": "AUTO_ANY" }], "transitionGapAfterMinutes": 5 }
    ]
  }
  ```
  - `200` on success; response includes the computed total span
  - `422` if fewer than 2 legs (UC-052 A1)

- `POST /services/:id/intake-schema` -> Publish a new booking-intake schema version (UC-054). Body:
  ```json
  {
    "questions": [{ "fieldKey": "accessNeeds", "label": "Necessidades de acesso", "type": "FREE_TEXT", "required": false }],
    "consentText": "...", "requiresNamedAttendees": true, "participantCountRequired": true
  }
  ```
  - `201` on success — new version `is_active = true`, previous version `is_active = false`

- `PATCH /services/:id/booking-policy` -> Set an appointment service's booking policy (UC-055). Body:
  ```json
  {
    "defaultApprovalMode": "MANUAL_APPROVAL", "manualHoldMinutes": 30,
    "cancellationWindowHoursOverride": null, "rescheduleWindowHoursOverride": null,
    "minBookingAdvanceHoursOverride": null, "maxBookingAdvanceDaysOverride": null,
    "recurrenceEligible": true, "availabilityAlertEligible": true,
    "durationPolicy": "CUSTOMER_SELECTED", "durationMinMinutes": 60, "durationMaxMinutes": 480, "durationIncrementMinutes": 30,
    "pricingPolicy": "PER_TIME_INCREMENT", "pricingIncrementMinutes": 60, "pricePerIncrementAmount": 50.00
  }
  ```
  - `200` on success
  - `422` if `durationPolicy = CUSTOMER_SELECTED` with no `pricingPolicy` (UC-055 A2)

- `GET /schedule/day-grid?date=` -> Combined multi-resource day grid (UC-057). MANAGER only.
  ```json
  { "date": "2026-08-04", "columns": [{ "resourceId": "uuid", "name": "Camila Duarte", "type": "STAFF", "blocks": [{ "startsAt": "...", "endsAt": "...", "kind": "BOOKING"|"CLASS_SESSION", "refId": "uuid" }] }] }
  ```

**`GET /schedule/availability` (UC-011) — extended by M21 Cluster 2 (UC-058, UC-059):** the existing endpoint's response is unchanged in shape; internally, once a queried service has non-default `resourceRequirements`/`legs`, the backend scopes the query to the relevant `resourceId(s)` via `IBookingAvailabilityPort` against `booking.resource_occupancy` instead of the whole tenant — see `docs/02-DOMAIN_MODEL.md`. No new query params for this cluster.

---

## 3. Booking Lifecycle

### **Media Upload (UC-001, UC-002, UC-005b, UC-009)**
Used to upload photos before creating a booking (UC-001/UC-002), when submitting more info as a guest (UC-005b), or when marking a booking complete (UC-009).

**BFF:** `POST /v1/bookings/attachments/signed-url`

Single endpoint covering four authentication scenarios — all four now upload to the exact same `tmp/` staging shape regardless of who's calling or what the photo will eventually be attached to (TD22):

| Scenario | Who | Auth |
|---|---|---|
| 1 | Authenticated customer | CUSTOMER JWT |
| 2 | Guest — anonymous | None; `tenantSlug` in body |
| 3 | Guest — with guest token | `guestToken` in body (`@Public`) |
| 4 | Staff / Manager | STAFF/MANAGER JWT |

- **Request body:**
  ```json
  {
    "fileName":    "car-front.jpg",
    "contentType": "image/jpeg",
    "tenantSlug":  "lavacar-bh",  // optional — scenario 2 only
    "guestToken":  "eyJ..."       // optional — scenario 3 only
  }
  ```
  (`bookingId` is no longer part of this request — the booking the photo will end up on may not even exist yet at upload time, and the upload destination no longer depends on it. If a caller sends one anyway, it's silently stripped by the Zod schema.)

- **Response (201 Created):**
  ```json
  {
    "signedUrl": "http://localhost:4443/ikaro-local/tmp/.../car-front.jpg?X-Goog-Signature=...",
    "filePath":  "tmp/<tenantId>/<uuid>/car-front.jpg",
    "expiresAt": "2026-05-12T00:08:44Z"
  }
  ```

**Storage path rule:** `tmp/<tenantId>/<uuid>/<fileName>` — staged in the **private** media bucket, unconditionally, for every scenario. `filePath` is what the backend stores and returns until the surrounding record is actually persisted.

`filePath` is a **staging** path, not the final one. The backend promotes it to `tenants/<tenantId>/bookings/<bookingId>/<fileName>` — still in the same **private** bucket — the moment the surrounding booking record is actually saved: booking creation (UC-001/UC-002, `bookingId` generated up front for exactly this reason), submitting requested info (UC-005b, guest or customer), or completing a booking (UC-009). Booking photos are genuinely private — only the customer and the tenant's staff should ever see a customer's car — so the bucket stays private throughout, and **fresh read-signed URLs are generated at display time; `signedUrl` is never stored.** (This is the opposite of how hotsite images work post-TD22 — see "Hotsite Image Upload" above. Hotsite images are public marketing assets with no privacy requirement, so promotion moves them into a separate public bucket with permanent addresses instead. Don't generalize this section's pattern to hotsite media.) Anything left in `tmp/` — abandoned, or superseded before the surrounding record is saved — ages out via a GCS lifecycle rule (`M17-S14`, `plan/M17-CLOUD-DEPLOY.md`); unlike hotsite, there's no delete-previous-on-replace here, since booking photo arrays are append-only in every current use case.

**Signed URL expiration:** 15 minutes.

#### **Upload Constraints (MVP):**
| Constraint | Value | Notes |
|---|---|---|
| Accepted MIME types | `image/jpeg`, `image/png` | Others return `400`; also enforced by GCS at `PUT` time |
| Max file size | 10 MB | Enforced by GCS via `content-length-range` condition embedded in the signed URL — backend never sees the upload |
| `fileName` | 1–255 chars, no path separators | `../` or `/` returns `400` |
| URL expiration | 15 minutes | `signedUrl` expires 15 min after issuance |
| Rate limit | 10 requests / minute per IP | `429` on the 11th request — protects the public guest path |

#### **Error Responses:**
- `400 invalid-file-name` — `fileName` contains `../` or `/`, or is empty
- `400 unsupported-media-type` — `contentType` not `image/jpeg` or `image/png`
- `400 missing-tenant` — scenario 2 called without `tenantSlug`
- `401 invalid-guest-token` — scenario 3: `guestToken` missing, expired, or invalid
- `429 too-many-requests` — rate limit exceeded

(Promotion — not this endpoint — is what can return `400 booking-photo-not-uploaded` for a `tmp/` path that doesn't exist or belongs to another tenant; see the booking create/submit-info/complete endpoints.)

#### **3-step upload contract (frontend):**
```
1. POST /v1/bookings/attachments/signed-url
   → receive { signedUrl, filePath, expiresAt }

2. PUT <signedUrl>                         (browser → GCS directly, no backend involved)
   Content-Type: image/jpeg
   Body: <binary file>

3. Include filePath (not signedUrl) in the booking body — still a tmp/ staging path;
   the backend promotes it to its permanent tenants/.../bookings/<bookingId>/... path
   on save:
   beforeServicePhotoUrls: ["tmp/<tid>/<uuid>/car-front.jpg"]
   afterServicePhotoUrls:  ["tmp/<tid>/<uuid>/after.jpg"]
```

#### **Example flows:**

**UC-001 / UC-002 — before-photos (guest or authenticated customer):**
```
// Authenticated customer
POST /v1/bookings/attachments/signed-url
Authorization: Bearer <customerJwt>
{ "fileName": "car-front.jpg", "contentType": "image/jpeg" }
→ { signedUrl, filePath: "tmp/<tid>/<uuid>/car-front.jpg", expiresAt }

// Guest (no JWT)
POST /v1/bookings/attachments/signed-url
{ "fileName": "car-front.jpg", "contentType": "image/jpeg", "tenantSlug": "lavacar-bh" }
→ { signedUrl, filePath: "tmp/<tid>/<uuid>/car-front.jpg", expiresAt }
```

**UC-009 — after-photos (staff):**
```
POST /v1/bookings/attachments/signed-url
Authorization: Bearer <staffJwt>
{ "fileName": "after.jpg", "contentType": "image/jpeg" }
→ { signedUrl, filePath: "tmp/<tid>/<uuid>/after.jpg", expiresAt }
```
(No `bookingId` in the request — the destination is only known once the booking is actually persisted.)

### **Booking Requests**

A booking has **1..N service lines**. Order in the `serviceIds` array is preserved (so the customer sees the lines in the order they added them); duplicates are allowed (two `Basic Wash` lines = two cars).

#### **Guest Booking (UC-001) — `POST /bookings`**

Public — requires only `X-Tenant-Slug` header. No authentication.

- **Body:**
  ```json
  {
    "serviceIds":            ["uuid-basic-wash", "uuid-pickup"],
    "scheduledAt":           "ISO8601",
    "contactEmail":            "joao@example.com",
    "contactName":             "João Silva",
    "contactPhone":            "31999999999",
    "contactAddress": {
      "street": "Rua das Acácias", "number": "45", "complement": null,
      "neighborhood": "Jardim América", "city": "Belo Horizonte", "state": "MG", "zipCode": "30130020"
    },
    "pickupAddress": {
      "street": "Rua das Flores", "number": "123", "complement": "Apto 4B",
      "neighborhood": "Centro", "city": "Belo Horizonte", "state": "MG", "zipCode": "30130010"
    },
    "beforeServicePhotoUrls": ["https://..."]
  }
  ```
  - `pickupAddress` **required** when any `serviceId` has `requiresPickupAddress = true`; omit otherwise.
  - `contactAddress` optional (general home address for the guest).
  - `beforeServicePhotoUrls` optional, defaults to `[]`.

- **Response (`201 Created`):** see [Shared Response Shape](#shared-booking-201-response-shape) below.

- **Errors (RFC 9457 Problem Details):**
  - `400 invalid-services-empty` — `serviceIds` is empty.
  - `404 service-not-found` — one or more `serviceId` does not exist in the tenant's catalog.
  - `400 service-not-in-tenant` — one or more `serviceId` exists globally but does not belong to this tenant.
  - `400 invalid-services-inactive` — one or more service has `is_active = false`.
  - `400 missing-pickup-address` — one or more selected services require a pickup address but none was provided.
  - `400 invalid-pickup-address` — `pickupAddress` fields fail validation (e.g. `zipCode` not 8 digits, `state` not a valid UF).
  - `400 photo-not-uploaded` — one or more `beforeServicePhotoUrls` paths were never confirmed as uploaded to GCS (the backend calls `IStorageService.exists()` on each path before persisting — a stale, never-uploaded, or hand-crafted path is rejected rather than stored).
  - `409 slot-unavailable` — the requested `scheduledAt + totalDurationMins` window overlaps another APPROVED booking or a `ScheduleClosure`.

#### **Authenticated Customer Booking (UC-002) — `POST /bookings/authenticated`**

Requires JWT with `role: CUSTOMER`. Tenant resolved from JWT `tenantId` — no `X-Tenant-Slug` needed.

- **Body:**
  ```json
  {
    "serviceIds":            ["uuid-basic-wash", "uuid-pickup"],
    "scheduledAt":           "ISO8601",
    "pickupAddress": {
      "street": "Rua das Flores", "number": "123", "complement": "Apto 4B",
      "neighborhood": "Centro", "city": "Belo Horizonte", "state": "MG", "zipCode": "30130010"
    },
    "beforeServicePhotoUrls": ["https://..."]
  }
  ```
  - Guest fields (`contactEmail`, `contactName`, `contactPhone`, `contactAddress`) are **not accepted** — the backend reads them from the Customer record identified by the JWT `sub`.
  - `pickupAddress` **required** when any service has `requiresPickupAddress = true`. If omitted, falls back to `Customer.defaultAddress` when set; if that is also absent, returns `400 missing-pickup-address`.
  - `beforeServicePhotoUrls` optional, defaults to `[]`.

- **Response (`201 Created`):** see [Shared Response Shape](#shared-booking-201-response-shape) below.

- **Errors (RFC 9457 Problem Details):**
  - All errors from guest booking apply (`400`, `404`, `409`).
  - `401 Unauthorized` — no valid JWT.
  - `403 Forbidden` — JWT role is not `CUSTOMER`.
  - `422 customer-phone-not-set` — the customer has not set a phone number on their profile; update via `PATCH /customers/me` before booking.

#### **Shared Booking `201` Response Shape** {#shared-booking-201-response-shape}

```json
{
  "bookingId":              "uuid",
  "status":                 "PENDING",
  "scheduledAt":            "ISO8601",
  "totalPrice":             { "amount": 120.00, "currency": "BRL" },
  "totalDurationMins":      85,
  "pickupAddress": {
    "street": "Rua das Flores", "number": "123", "complement": "Apto 4B",
    "neighborhood": "Centro", "city": "Belo Horizonte", "state": "MG", "zipCode": "30130010"
  },
  "beforeServicePhotoUrls": ["https://..."],
  "lines": [
    {
      "lineId":                         "uuid",
      "serviceId":                      "uuid-basic-wash",
      "priceAtBooking":                 { "amount": 100.00, "currency": "BRL" },
      "durationMinsAtBooking":          30,
      "pointsValueAtBooking":           1,
      "requiresPickupAddressAtBooking": false
    },
    {
      "lineId":                         "uuid",
      "serviceId":                      "uuid-pickup",
      "priceAtBooking":                 { "amount": 20.00, "currency": "BRL" },
      "durationMinsAtBooking":          15,
      "pointsValueAtBooking":           1,
      "requiresPickupAddressAtBooking": true
    }
  ]
}
```
(`pickupAddress` omitted when null. `serviceNameAtBooking` stored on the line but not returned.)

### **Booking Management (UC-003 - UC-008)**
- `GET /bookings` → List bookings. Query params (`M13-S03`): `status` (comma-separated), `date`, `from`, `to`, `page`, `limit`. **No `customerId` filter param** — for a CUSTOMER caller, scoping to their own bookings is role-derived server-side, not a query filter. Each list item includes `totalPrice`, `totalDurationMins`, and a compact `lineSummary: [{ lineId, serviceId, serviceNameAtBooking, durationMinsAtBooking, priceAtBooking }, …]`.
- `GET /bookings/:id` → Detailed view, response shape branches by caller role in one shared handler: STAFF/MANAGER get `StaffBookingDetailResponse` (loyalty balance, signed before/after-service photo read-URLs, `contactAddress`/`approvedAt`/`approvedBy`/`rejectionReason`, and — once `COMPLETED` — `totalActualPrice`/`discountAmount`/`discountPointsUsed`/`completedAt`); CUSTOMER gets `CustomerBookingDetailResponse` (same completion fields, plus `notes`, minus staff-only fields like `adminNotes`/`approvedBy`/`rejectionReason`/contact info). A CUSTOMER requesting a booking they don't own gets `404`, not `403` (deliberate — avoids confirming the booking's existence to a non-owner).

> **BFF note (M13-S03/S04/S06/S07):** `GET /v1/bookings` and `GET /v1/bookings/:id` are both accessible to STAFF, MANAGER, and CUSTOMER — same routes, same query schema/defaults, but the BFF maps the response differently per role: `StaffBookingCard/ListResponse`/`StaffBookingDetailResponse` for STAFF/MANAGER, `CustomerBookingListItem/Response`/`CustomerBookingDetailResponse` for CUSTOMER (no contact info, no staff-only fields).

**Admin approval workflow** (JWT + `MANAGER|STAFF` role required):
- `PATCH /bookings/:id/approve` → (UC-003) Approve a PENDING or INFO_REQUESTED booking. Re-checks slot availability. Returns `200 { bookingId, status: 'APPROVED', approvedAt }`. Returns `409 slot-unavailable` if slot is taken.
- `PATCH /bookings/:id/reject` → (UC-004) Reject a PENDING or INFO_REQUESTED booking. Body: `{ reason: string }` (required, min 10 chars). Returns `200 { bookingId, status: 'REJECTED' }`.
- `PATCH /bookings/:id/request-info` → (UC-005a) Transition PENDING → INFO_REQUESTED. Body: `{ message: string }` (required, min 20 chars). Returns `200 { bookingId, status: 'INFO_REQUESTED' }`.

**Customer info submission** (JWT + `CUSTOMER` role required):
- `PATCH /bookings/:id/submit-info` → (UC-005b) Transition INFO_REQUESTED → PENDING. Body: `{ response: string, photoUrls?: string[] }`. Returns `200 { bookingId, status: 'PENDING' }`. Any provided `photoUrls` are appended to `booking.beforeServicePhotoUrls`. Each path is verified via `IStorageService.exists()` before persisting — an unresolvable path returns `400 photo-not-uploaded`.
- `PATCH /bookings/:id/submit-info/guest?token=<guestToken>` → (UC-005b, guest flow) Same transition for a guest booking. No JWT — identity comes from the signed `guestToken` query param (issued when the booking was put into `INFO_REQUESTED`); the token's `bookingId` must match the route `:id`. Body: same shape as the authenticated variant. Returns `200 { bookingId, status, infoSubmittedAt }`.
- `GET /bookings/:id/guest?token=<guestToken>` → (UC-005 A2, M13-S39) Guest reads a booking summary before submitting info — the standalone `/bookings/:id/submit-info` page (M13-S40) uses this to pre-fill a summary card. Same guest-token identity as the PATCH variant above. Returns `200 GuestBookingReadResponse { bookingId, status: 'INFO_REQUESTED', serviceSummary, scheduledAt, infoRequestMessage, contactName }`. Returns `400` when the token is missing or its `bookingId` doesn't match the route; `401` when the JWT signature is invalid or expired; `409` when the booking is no longer `INFO_REQUESTED`; `404` when the booking belongs to a different tenant than the token's `tenantId`.

> **No generic `PATCH /bookings/:id` or `PATCH /bookings/:id/status` endpoint exists.** Every booking state transition and field update is its own action-specific route: `/cancel`, `/approve`, `/reject`, `/request-info`, `/submit-info`, `/submit-info/guest`, `/reschedule`, `/complete`. Lines cannot be edited after `APPROVED` (returns `409 booking-lines-frozen`).

**Cancel** (JWT + `CUSTOMER|MANAGER|STAFF` role required):
- `PATCH /bookings/:id/cancel` → (UC-007, UC-008) Cancel a booking. The BFF dispatches to a different backend route depending on the caller's role: `CUSTOMER` → `cancel-customer` (no body), `MANAGER`/`STAFF` → `cancel-admin` (body: `{ reason?: string }`). Returns `200 { bookingId, status: 'CANCELLED' }`.

### **Reschedule (UC-008, extended by M21 Cluster 3 UC-069)**
- `PATCH /bookings/:id/reschedule`
- **Body (UC-008, staff-only):** `{ "scheduledAt": "ISO8601", "adminNotes": "..." }`
- **Body (UC-069, customer-initiated, M21 Cluster 3):** `{ "scheduledAt": "ISO8601", "resourceSelections": {...}, "durationMinutes": number }` — `resourceSelections`/`durationMinutes` only relevant for a bundle/leg/variable-duration service; validated and locked atomically before the original resource(s) are released.
- **Validation:** New window must be free for every required resource. Returns `409 slot-unavailable` if not (UC-069 A1). A bundle/journey revalidates every resource/leg as one atomic change (UC-069 A2).
- **Response, M21 Cluster 3 addition:** if the reschedule changes the price (e.g. a variable-duration service), a `booking_quote_revisions` row is recorded and the response includes `{ "quoteRevision": { "revisionNo": number, "amount": {...} } }`.
- **Event:** Publishes `BookingRescheduled` (extended scope, see `docs/03-DOMAIN_EVENTS.md`) → Notification sends customer email.

### **No-Show (UC-074, M21 Cluster 3)**
- `POST /bookings/:id/no-show` -> Mark an appointment as a no-show (STAFF|MANAGER). `422` if the scheduled end time hasn't passed; `409` if already terminal.
- `POST /bookings/:id/no-show/correct` -> Manager correction (append-only audit transition). Body: `{ "correctedStatus": "COMPLETED"|..., "reason": "..." }`. Loyalty is awarded only if `correctedStatus = COMPLETED`.

### **Information Workflow (UC-005)**
See `PATCH /bookings/:id/submit-info` in the Booking Management section above.

### **Completion (UC-009)**
- `PATCH /bookings/:id/complete`
- **Body:**
  ```json
  {
    "lines": [
      { "lineId": "uuid-line-1", "actualPriceCharged": 80.00 },
      { "lineId": "uuid-line-2", "actualPriceCharged": 0.00 }
    ],
    "afterServicePhotoUrls": ["tenants/<tenantId>/bookings/<bookingId>/after.jpg"],
    "adminNotes": "Extra shine applied"
  }
  ```
  - `lines` is **required**, minimum 1 entry — every line on the booking must be listed with its actual charged price (`CompleteBookingBodySchema`, `apps/bff/src/features/booking/bookings.controller.ts`). There is no "omit lines charged at full price" shortcut.
  - `actualPriceCharged` must be `>= 0`. Zero is valid (waived service).
  - `afterServicePhotoUrls` optional, defaults to `[]`. Paths must match `tenants/<tenantId>/bookings/<bookingId>/...`.
  - `adminNotes` optional, 1–500 chars.

- **Response (`200 OK`):**
  ```json
  {
    "bookingId": "uuid",
    "status": "COMPLETED",
    "completedAt": "2026-05-29T14:00:00.000Z",
    "totalActualPrice": { "amount": 80.00, "currency": "BRL" }
  }
  ```
  The response is flat — no per-line breakdown (`CompleteBookingResponse`, `apps/bff/src/features/booking/bookings.types.ts`). Per-line `actualPriceCharged` is persisted but only surfaced later via `GET /bookings/:id` (`BookingLineDetail`).

- **Errors:**
  - `400 invalid-line-id` — a `lineId` in `lines` does not belong to this booking.
  - `400 invalid-actual-price` — `actualPriceCharged` is negative.
  - `400 photo-not-uploaded` — one or more `afterServicePhotoUrls` paths were never confirmed as uploaded to GCS (verified via `IStorageService.exists()` before persisting).

---

## 4. Schedule & Availability

### **Customer Availability (UC-011)**

Availability is a **two-phase API** — one call for calendar navigation, one for slot detail. Both are public endpoints (no JWT, only `X-Tenant-Slug` header).

**Phase 1 — Calendar overview (range summary)**

Loads all data for the date range in 3 DB queries. Use for week/month calendar rendering.

```
GET /v1/schedule/availability/summary?from=YYYY-MM-DD&to=YYYY-MM-DD&serviceIds=uuid1,uuid2
X-Tenant-Slug: lavacar-test
```

Response `200`:
```json
[
  { "date": "2026-06-01", "available": true,  "slotCount": 12 },
  { "date": "2026-06-02", "available": false, "slotCount": 0  },
  { "date": "2026-06-03", "available": true,  "slotCount": 5  }
]
```

Errors:
- `400` — serviceId not found, inactive, or from wrong tenant
- `422` — `from > to`, or range exceeds `maxBookingAdvanceDays` (default 90 days)

Constraints: past dates return `{ available: false, slotCount: 0 }` without an error (for seamless calendar rendering).

**Phase 2 — Day detail (single-date slots)**

Called when user clicks a specific day. Returns full slot list with UTC timestamps.

```
GET /v1/schedule/availability?date=YYYY-MM-DD&serviceIds=uuid1,uuid2
X-Tenant-Slug: lavacar-test
```

Response `200`:
```json
{
  "date": "2026-06-01",
  "available": true,
  "slots": [
    { "startsAt": "2026-06-01T12:00:00.000Z", "endsAt": "2026-06-01T13:15:00.000Z" },
    { "startsAt": "2026-06-01T12:30:00.000Z", "endsAt": "2026-06-01T13:45:00.000Z" }
  ]
}
```

Errors:
- `400` — serviceId not found, inactive, or from wrong tenant
- `422` — date is in the past

### **Schedule Closures (UC-010a, UC-010b, UC-010e)**
Auth: JWT + `MANAGER|STAFF` on all write endpoints. **Exception (M21 Cluster 1):** a request body with `resourceId` set requires `MANAGER` specifically — `resourceId` omitted (tenant-wide, today's behavior) stays open to `MANAGER|STAFF`.

- `GET /schedule/closures?from=YYYY-MM-DD&to=YYYY-MM-DD&resourceId=` → list closures in range (sorted by date ASC). `resourceId` optional — omit for tenant-wide only.
- `POST /schedule/closures` → create closure (full-day or partial)
  ```json
  {
    "date":       "2026-12-26",
    "reason":     "HOLIDAY",
    "startTime":  "10:00",   // optional — omit for full-day
    "endTime":    "12:00",   // optional — omit for full-day
    "resourceId": "uuid",    // optional (M21 Cluster 1) — omit for tenant-wide, matching today's behavior
    "notes":      "..."      // optional
  }
  ```
  - `201` on success; response body includes the created closure `id`
  - `422` if date is in the past
  - `409` if an overlapping closure already exists for that `(date, resourceId)`
  - `404` if `resourceId` is set and does not exist or belongs to another tenant (UC-010e)

- `DELETE /schedule/closures/:id` → remove closure
  - `204` on success
  - `404` if not found or belongs to another tenant

### **Schedule Openings (UC-010c, UC-010d, UC-010f)**
Auth: JWT + `MANAGER|STAFF` on all write endpoints. **Exception (M21 Cluster 1):** a request body with `resourceId` set requires `MANAGER` specifically — `resourceId` omitted (tenant-wide, today's behavior) stays open to `MANAGER|STAFF`.

- `GET /schedule/openings?from=YYYY-MM-DD&to=YYYY-MM-DD&resourceId=` → list openings in range. `resourceId` optional — omit for tenant-wide only.
- `POST /schedule/openings` → open a normally-closed day
  ```json
  {
    "date":       "2026-12-28",
    "startTime":  "09:00",
    "endTime":    "14:00",
    "resourceId": "uuid",   // optional (M21 Cluster 1) — omit for tenant-wide, matching today's behavior
    "notes":      "..."     // optional
  }
  ```
  - `201` on success
  - `422` if date is past, OR day-of-week is already open in the effective hours source (tenant `businessHours` for a tenant-wide opening; the resource's own `workingHours[day]` when `resourceId` is set and the resource has a non-null `workingHours`, else falling back to `businessHours` — M21 Cluster 1), OR (`resourceId` set only) the requested window extends beyond an existing tenant-wide opening for the same date (`BOOKING_OPENING_EXCEEDS_TENANT_WINDOW`; no bound applies when no tenant-wide opening exists for that date)
  - `409` if an opening already exists for that `(date, resourceId)`
  - `404` if `resourceId` is set and does not exist or belongs to another tenant (UC-010f)

- `DELETE /schedule/openings/:id` → remove opening; day reverts to default-closed
  - `204` on success
  - `404` if not found or belongs to another tenant

### **Resource Management (UC-044–UC-049)**

> Introduced by M21 — Multi-Vertical Scheduling, Cluster 1 (Foundation). **Shipped in M21-S01** (backend + BFF); the `GET /resources/:id` single-item read below was added in M21-S04 (needed by the resource edit page — missed in S01, mirrors Staff's/Services' existing `GET /:id` pattern).

Auth: JWT + `MANAGER` only on every endpoint — a deliberate, self-consistent restriction distinct from every other Booking-context admin surface (`MANAGER|STAFF`), per the discovery's own review call (dev-notes.md item 1) with no existing precedent to derive it from.

- `GET /resources?type=&isActive=` → list resources (UC-044). `type` optional — `LOCATION | STAFF | ROOM | EQUIPMENT`. `isActive` optional boolean.
  ```json
  { "items": [ { "id": "uuid", "type": "STAFF", "refId": "uuid", "name": "Camila Duarte", "workingHours": null, "turnoverMinutes": 15, "maxCapacity": null, "isActive": true } ] }
  ```
- `GET /resources/:id` → get a single resource (added M21-S04, powers the edit page). Same response shape as one list item above.
  - `200` on success
  - `404` if not found or belongs to another tenant
- `GET /resources/staff-options?excludeResourceId=` → **BFF-only, no backend route** (added M21-S04). Merges a `GET /staff` read with a `GET /resources?type=STAFF` read server-side and returns each staff member annotated with whether they're already wrapped by a *different* `Resource` — the STAFF-picker's underlying data source on the create/edit forms, kept out of `apps/web` per `docs/24-BFF_ARCHITECTURE.md` § Web-facing composite views. `excludeResourceId` (optional) excludes one resource from the wrap check — the resource currently being edited, so its own already-wrapped staff member isn't marked as taken.
  ```json
  { "items": [ { "id": "uuid", "name": "Camila Duarte", "email": "camila@lavacar.com.br", "isActive": true, "isWrapped": false } ] }
  ```
  - `200` on success
- `POST /resources` → create a resource (UC-045)
  ```json
  {
    "type":            "STAFF",           // "STAFF" | "ROOM" | "EQUIPMENT" — never "LOCATION" (backfilled only)
    "refId":           "uuid",            // required iff type = "STAFF" — an existing Staff id
    "name":            "Camila Duarte",   // required for ROOM/EQUIPMENT; denormalized display name for STAFF too
    "workingHours":    { "monday": { "open": "09:00", "close": "18:00" }, "...": "..." }, // optional — omit to inherit tenant hours
    "turnoverMinutes": 15,                // optional, default 0
    "maxCapacity":     null               // optional, ROOM/EQUIPMENT/LOCATION only
  }
  ```
  - `201` on success
  - `409` if `type = STAFF` and that staff member is already wrapped by a `Resource` (A1)
  - `422` if `type = LOCATION` — never manually created, only the M21-S02 backfill migration creates it
  - `422` if no working hours are set and the tenant has no `businessHours` either (A2)
- `PATCH /resources/:id` → edit a resource (UC-046). Body: every field independently optional (unsent = unchanged) — `{ "name"?, "type"?, "refId"?: "uuid" | null, "workingHours"?: { ... } | null, "turnoverMinutes"?, "maxCapacity"?: number | null }`. An empty body `{}` is valid and changes nothing. **UC-046 A1's "warn before saving hours that put existing appointments outside them" is not implemented in M21-S01 and saves directly** — no `Service`/`Booking` references a `Resource` yet (Cluster 2's `resourceRequirements` wiring), so no appointment can exist to check against; same Cluster-1-scope deferral as UC-047's own "empty worklist for a Cluster-1-only tenant" (`docs/04-USE_CASES.md`).
  - `200` on success
  - `404` if not found, belongs to another tenant, or (when `type` is changing to `STAFF`) the target staff member is not found/inactive (mirrors `POST /resources`' A1 staff-lookup semantics — UC-045)
  - `409` if `type = STAFF` and the target staff member is already wrapped by a *different* `Resource` — re-saving the same `refId` this resource already holds is not a conflict
  - `409` if `type` is changing to or from `LOCATION` — a tenant's `LOCATION` resource can never change type, and no other resource can become `LOCATION`
  - `409` if `workingHours` is set (non-null) while `type` is (or is being changed to) `LOCATION` — a `LOCATION` resource always inherits the tenant's business hours and can never carry a custom schedule
  - `400`/`422` if `type` is changing away from `STAFF` without the request also explicitly sending `refId: null`
  - `422` if no working hours are set (after the update) and the tenant has no `businessHours` either
- `DELETE /resources/:id` → deactivate a resource (UC-047)
  - `204` on success
  - `404` if not found or belongs to another tenant
  - `409` if `type = LOCATION` — a tenant must always retain exactly one active LOCATION resource
- `POST /resources/:id/reactivate` → reactivate a deactivated resource (UC-049)
  - `200` on success
  - `404` if not found, belongs to another tenant, or (for a `type = STAFF` resource) the wrapped staff member is still inactive
  - `409` if already active

### **Recurring Private Reservation Schedules — M21 Cluster 3 (UC-070, UC-071)**

Auth: JWT + Customer (create/manage own) or STAFF|MANAGER (approve/reject, or create on a customer's behalf).

- `POST /recurring-booking-schedules` → create (UC-070). Body: `{ "serviceId", "recurrence": {...}, "assignmentPolicy": "FIXED_ASSIGNMENT"|"RESOLVE_PER_OCCURRENCE", "resourceIds"?: string[], "startsOn", "endsOn"? }`
  - `201` — `{ "status": "ACTIVE" }` (AUTO_CONFIRM) or `{ "status": "PENDING_APPROVAL", "approvalHoldExpiresAt": "..." }` (MANUAL_APPROVAL)
  - `409` on a future-pattern conflict (A1) or at the `MAX_ACTIVE_*` cap (A4)
- `GET /recurring-booking-schedules` → list the caller's own (Customer) or all for the tenant (STAFF|MANAGER, approval queue)
- `PATCH /recurring-booking-schedules/:id/occurrences/:occurrenceStart` → skip or reschedule one occurrence (UC-070 A2). Body: `{ "action": "SKIP"|"RESCHEDULE", "replacementBookingId"? }`
- `POST /recurring-booking-schedules/:id/pause` / `POST /recurring-booking-schedules/:id/end`
- `POST /recurring-booking-schedules/:id/approve` / `POST /recurring-booking-schedules/:id/reject` → UC-071. STAFF|MANAGER only.
  - `409` if already resolved (A1) or past `approvalHoldExpiresAt` (A2)

### **Availability Alerts — M21 Cluster 3 (UC-072, UC-076)**

Auth: JWT + Customer only — unauthenticated visitors are redirected to login (UC-072 A1).

- `POST /availability-alerts` → create (UC-072). Body: `{ "serviceId", "preferredResourceId"?, "criteriaType": "ONE_TIME_RANGE"|"WEEKLY_PREFERENCE", "acceptableStartAt"?, "acceptableEndAt"?, "weekdays"?, "localStartTime"?, "localEndTime"?, "durationMinutes"?, "participantCount"? }`
- `GET /availability-alerts` → list the caller's own (UC-076)
- `PATCH /availability-alerts/:id` → edit criteria/expiry (UC-076)
- `DELETE /availability-alerts/:id` → cancel (UC-076)

### **Future Commitment Exceptions — M21 Cluster 3 (UC-077)**

Auth: JWT + MANAGER only.

- `GET /scheduling-exceptions?status=OPEN` → list open worklist items (UC-073's output)
- `POST /scheduling-exceptions/:id/resolve` → Body: `{ "resolutionType": "KEEP"|"REASSIGN"|"RESCHEDULE"|"CANCEL", "reason"? }`
- `POST /scheduling-exceptions/:id/dismiss` → Body: `{ "reason" }`

### **Tenant Onboarding Bootstrap — M21 Cluster 3 (UC-075)**

Auth: JWT + MANAGER only.

- `POST /onboarding/bootstrap` → Body: `{ "presetId": "AUTO_ESTETICA"|"SALAO_BARBEARIA"|..., "answers": {...} }` (per-preset minimum-answer shape, see `docs/discovery/multivertical-booking/multivertical-booking_ONBOARDING_PRESETS.md`)
  - `201` — generated configuration as an editable review; whole bootstrap rolls back atomically on any failure (A3)
  - `422` on invalid minimum answers (A2)
  - **M21 Cluster 4 completion:** for a SESSION preset (D/E/F), step 4 also creates the first `ClassScheduleTemplate`(s) — inert until this cluster ships (Cluster 3 alone only completes Presets A/B/C/G).

---

## 4b. Classes & Sessions — M21 Cluster 4

> Auth: STAFF|MANAGER on every staff-facing endpoint below unless noted; Customer/Guest on the booking endpoints, matching UC-085–107's own actor fields.

### **Session Templates (UC-078–080)**

- `PATCH /services/:id/guest-access-policy` → Body: `{ "guestAccessEnabled": boolean, "guestTrialPolicy": "NONE"|"FIRST_FREE_PER_EMAIL" }` (UC-078)
- `POST /class-schedule-templates` → Body: `{ "serviceId", "resourceIds": string[], "recurrence": {...}, "capacity": number, "trialSlots"?: number }`
  - `201` on success
  - `409` on resource conflict (A1/A2) or `MAX_ACTIVE_TEMPLATES_PER_RESOURCE` cap (A4)
  - `422` if capacity exceeds a resource's `maxCapacity` ceiling (A3)
- `PATCH /class-schedule-templates/:id` → edit (UC-080). `409` if new default capacity < an in-flight session's `reservedCount` (A2).
- `DELETE /class-schedule-templates/:id` → deactivate (UC-080)
- `POST /class-schedule-templates/:id/cancel-range` → Body: `{ "rangeStart": "date", "rangeEnd": "date"|null }` (UC-096). `422` if entirely in the past (A1).

### **Sessions (UC-081–085, UC-101)**

- `GET /class-sessions?scope=mine|all&from=&to=` → list (UC-082)
- `GET /class-sessions?serviceId=&from=` → customer/guest browse (UC-085) — public/authenticated variant of the same read model
- `PATCH /class-sessions/:id` → override capacity/resources (UC-083). `409` if new capacity < `reservedCount` (A1); `422` if it exceeds a resource ceiling (A2).
- `POST /class-sessions/:id/cancel` → UC-084
- `POST /class-sessions/:id/close` → Body: `{ "attendeeOutcomes": [{ "attendeeId", "attendance": "PRESENT"|"NO_SHOW" }] }` (UC-101). `409` if already `CLOSED` (A1); `422` if before `endTime` (A2).

### **Class Session Bookings (UC-086–090, UC-097–098, UC-105)**

- `POST /class-session-bookings` → create (UC-086 contract / UC-087 pay-per-class / UC-088 guest group). Body varies by path — see each UC's Main Flow.
  - `201` — `CONFIRMED`, `PENDING_APPROVAL`, or falls through to waitlist per the trialSlots threshold
  - `409` if session fills at write time (A1) or no qualifying contract (A2, UC-086)
- `POST /class-session-bookings/guest-verification` → Body: `{ serviceId, sessionId, quantity, attendees: [{ name }], contactEmail, contactName, contactPhone }` (UC-097 step 1)
- `POST /class-session-bookings/guest-verification/:token/confirm` → UC-097 step 2–3
- `POST /class-session-bookings/:id/cancel` → UC-089. `422` inside the cancellation window (A1).
- `POST /class-sessions/:id/waitlist` → UC-090. `409` on a duplicate entry (A1).
- `POST /class-session-bookings/:id/approve` / `POST /class-session-bookings/:id/reject` → UC-098, STAFF|MANAGER
- `PATCH /class-session-bookings/:id/attendees` → Body: `{ "removeAttendeeIds": string[], "reason" }` (UC-105). `422` if it would leave zero attendees (A2) or past cutoff (A3).
- `POST /class-session-bookings/:id/waitlist-offer/accept` / `.../decline` → UC-091's offer acceptance

### **Recurring Enrollments (UC-093–095, UC-102–104)**

- `POST /recurring-enrollments` → Body: `{ "templateId", "startDate" }` (UC-093)
- `PATCH /recurring-enrollments/:id/occurrences/:sessionId` → Body: `{ "action": "SKIP" }` (UC-094). `422` inside the skip window (A3) or if the occurrence already passed (A2).
- `POST /recurring-enrollments/:id/occurrences/:sessionId/reschedule` → Body: `{ "replacementSessionId" }` (UC-102)
- `POST /recurring-enrollments/:id/cancel` → UC-095
- `GET /class-schedule-templates/:serviceId/enrollments?status=&type=` → UC-103, STAFF|MANAGER
- `POST /class-session-bookings` / `POST /recurring-enrollments` with `createdByStaff: true` → UC-104, STAFF|MANAGER. `409` if the customer has no qualifying access (A1).

### **Class Access Contracts (UC-099)**

- `POST /class-access-contracts` → Body: `{ "customerId", "startsOn", "endsOn", "eligibleServiceIds": string[] }`
  - `409` if an eligible service overlaps an existing active contract's period (A2)
- `POST /class-access-contracts/:id/cancel` → UC-099 step 4

### **Payments — In-Person Record (UC-107)**

- `POST /class-session-bookings/:id/payment` → Body: `{ "amount"?, "method", "outcome": "PAID"|"UNPAID"|"WAIVED" }`
- `POST /class-session-bookings/:id/payment/:paymentId/reverse` → Body: `{ "correctionReason" }`

---

## 5. Customer & Loyalty

### **Customer Management (UC-002, UC-006, UC-007)**
- `GET /customers?search=&limit=20` -> (Admin) Search customers in tenant by name or email.
  - Requires JWT with `MANAGER|STAFF` role.
  - Query params:
    - `search` (optional, string, min 5 chars when present) — case-insensitive `ILIKE %search%` match on `name` and `email`. When omitted, returns all customers up to `limit`.
    - `limit` (optional, integer, default 20) — max results to return.
  - Response:
    ```json
    {
      "items": [
        { "customerId": "uuid", "name": "João Silva", "email": "joao@example.com", "currentPoints": 150 }
      ],
      "total": 1
    }
    ```
  - `currentPoints` is read from `loyalty_balances.current_points` for the customer (`0` if no balance row).
  - Results are scoped to the caller's tenant — no cross-tenant leakage possible.
  - `CUSTOMER` role → `403`.
- `GET /customers/:id` -> (Admin/Self) Detailed profile. Response includes `defaultAddress` (nullable).
- `GET /customers/me` -> (Self) Current authenticated customer profile.
  - Requires JWT with `role: CUSTOMER`.
  - Response:
    ```json
    {
      "customerId": "uuid",
      "email": "cliente@example.com",
      "name": "João Silva",
      "phone": "31999999999",
      "defaultAddress": {
        "street": "Av. Afonso Pena", "number": "1000", "complement": null,
        "neighborhood": "Centro", "city": "Belo Horizonte", "state": "MG", "zipCode": "30130921"
      }
    }
    ```
  - `phone` is digits only (10–11 digits, no country prefix). `null` when not set.
  - `defaultAddress` is `null` when not set.
- `PATCH /customers/me` -> (Self) Update own profile.
  - Requires JWT with `role: CUSTOMER`.
  - All fields optional (partial update — omitted fields are left unchanged).
  - Body:
    ```json
    {
      "name": "João Silva",
      "phone": "31999999999",
      "defaultAddress": {
        "street": "Av. Afonso Pena", "number": "1000", "complement": null,
        "neighborhood": "Centro", "city": "Belo Horizonte", "state": "MG", "zipCode": "30130921"
      }
    }
    ```
  - Set `defaultAddress` to `null` to clear it. Set `phone` to `null` to clear it.
  - `phone` must be 10–11 digits (digits only, no country prefix e.g. `31999999999`).
  - `zipCode` must be 8 digits; hyphen is accepted and normalised (`"30130-921"` → `"30130921"`).
  - Returns the full updated profile (same shape as `GET /customers/me`).

### **Loyalty Metrics — Customer (UC-016)**

All three endpoints require JWT with `CUSTOMER` role. The `customerId` is inferred from the JWT `sub` (`X-Actor-ID`). Staff calling these endpoints → `403`.

- `GET /loyalty/balance`
  - Response:
    ```json
    { "currentPoints": 150, "nextExpiryDate": "2026-11-15T00:00:00.000Z", "nextExpiryPoints": 30 }
    ```
  - **BFF note (M13-S06/M13-S12):** `GET /v1/loyalty/balance` returns `CustomerLoyaltyBalanceResponse`, which extends the backend response with `conversionRate: number` — the live `pointsPerCurrencyUnit` from tenant settings (`0` = redemption disabled).
  - `currentPoints`: read from `loyalty_balances.current_points` (O(1) — no SUM).
  - `nextExpiryDate`: ISO-8601 datetime string (`Date.toISOString()`) of the earliest `expires_at` among active entries; `null` if no active entries.
  - `nextExpiryPoints`: sum of points expiring on `nextExpiryDate`; `null` if no active entries.
  - Returns `{ currentPoints: 0, nextExpiryDate: null, nextExpiryPoints: null }` when customer has no balance row.
  - **Cross-tenant switch (TD20):** accepts optional `?tenantId=X`. When present and different from the JWT's own tenant, the backend resolves the calling customer's record in tenant X itself (via `ILoyaltyCustomerPort`, matched by Google OAuth ID) — the client never supplies a `customerId` for this path. Returns `404` (`LOYALTY_CUSTOMER_NOT_FOUND_IN_TENANT`) if the customer has no record in tenant X. Used by the BFF's `GET /customers/tenants` (switch-tenant screen, UC-023) — one call per tenant the customer belongs to.

- `GET /loyalty/entries?page=1&limit=20`
  - Returns paginated earning history, most recent first. **Response below is the raw backend shape** — the BFF (`M13-S08`) reshapes this into `CustomerLoyaltyEntriesResponse` before it reaches the browser: `entries[]` → `items[]`, `points` → `pointsEarned`, `isActive` → `expired` (inverted), and `pagination: {page,limit,total}` flattened to top-level `page`/`limit`/`total` alongside `items`. Do not assume the browser sees the shape below verbatim.
  - Backend response:
    ```json
    {
      "entries": [{
        "entryId": "uuid",
        "serviceId": "uuid",
        "serviceName": "Lavagem Completa",
        "points": 10,
        "earnedAt": "2026-05-28T14:00:00.000Z",
        "expiresAt": "2026-11-24T14:00:00.000Z",
        "isActive": true
      }],
      "pagination": { "page": 1, "limit": 20, "total": 45 }
    }
    ```
  - `isActive`: `true` when `expiresAt > now()`.
  - `serviceName`: resolved via `IServiceCatalogPort` (cross-context adapter queries `booking.services`).

- `GET /loyalty/redemptions?page=1&limit=20`
  - Returns paginated redemption history, most recent first. **Response below is the raw backend shape** — the BFF reshapes this into `CustomerLoyaltyRedemptionsResponse`: `redemptions[]` → `items[]`, `pointsRedeemed` → `pointsUsed`, adds `amountSaved` (computed from the redemption's own **snapshotted** `pointsPerCurrencyUnit`, never today's rate — see `M13-S11`) and `bookingReference` (resolved via `ILoyaltyBookingPort.findBookingServices()`), and flattens pagination the same way as entries.
  - Backend response:
    ```json
    {
      "redemptions": [{
        "redemptionId": "uuid",
        "pointsRedeemed": 50,
        "redeemedAt": "2026-05-28T10:00:00.000Z",
        "notes": "Free basic wash"
      }],
      "pagination": { "page": 1, "limit": 20, "total": 3 }
    }
    ```

### **Loyalty Metrics — Admin (UC-016, Admin variant)**

All endpoints require JWT with `MANAGER|STAFF` role. The `customerId` is taken from the URL path. Returns `404` if `customerId` does not belong to the caller's tenant.

- `GET /customers/:customerId/loyalty/balance` — returns `EnrichedLoyaltyBalanceResponse` (same fields as `CustomerLoyaltyBalanceResponse` including `conversionRate`).
- `GET /customers/:customerId/loyalty/entries?page=1&limit=20` — same response shape as customer entries endpoint.
- `GET /customers/:customerId/loyalty/redemptions?page=1&limit=20` — same response shape as customer redemptions endpoint.

### **Loyalty Redemption — Admin (M10-S07)**

Records a point redemption for a customer. Decrements `LoyaltyBalance.current_points` and inserts a `LoyaltyRedemption` audit row atomically.

**Backend:** `POST /loyalty/redeem`  
**BFF:** `POST /v1/loyalty/redeem`  
Requires JWT with `MANAGER|STAFF` role.

Request body:
```json
{
  "customerId": "uuid",
  "pointsToRedeem": 50,
  "notes": "Free basic wash applied",
  "bookingId": "uuid"
}
```
- `notes`: optional string
- `bookingId`: optional UUID — the booking the redemption is tied to

Response `201`:
```json
{
  "redemptionId": "uuid",
  "customerId": "uuid",
  "pointsRedeemed": 50,
  "newBalance": 25,
  "redeemedAt": "2026-05-29T14:00:00.000Z"
}
```

Errors:
- `404` — customer has no loyalty balance row (has never earned points)
- `422` — `pointsToRedeem` exceeds `current_points`
- `403` — caller has `CUSTOMER` role

---

## 6. System & Future

### **Analytics (UC-017)**
- `GET /analytics/summary` -> Dashboard stats for admins.

### **Notifications (Audit)**
- `GET /notifications/logs` -> View status of emails sent (UC-018, 019, 020 verification).

---

## Internal Platform API (Operator Only)

> These endpoints are **not reachable from the public internet** in production. Four independent layers protect them (M17):
> 1. **Cloud Run internal ingress** — the backend is not publicly reachable.
> 2. **IAP relay VM + IAM identity** — the operator reaches the VM through IAP; the relay service account reaches the internal backend with a metadata-server identity token and `roles/run.invoker`.
> 3. **`INTERNAL_API_KEY`** — global `InternalApiGuard` validates `X-Internal-Key`.
> 4. **`PLATFORM_ADMIN_KEY`** — `PlatformAdminGuard` validates `X-Platform-Admin-Key` with `crypto.timingSafeEqual`.
>
> All four layers must pass. The `RequestInterceptor` skips `/internal/*` — no `X-Tenant-ID` header is expected.

---

### `POST /internal/tenants` — Provision new tenant (UC-024)

Provisions a new car-wash company on the platform. Creates `Tenant` + default `HotsiteConfig`. First MANAGER staff creation and invitation email happen asynchronously via events (see M04-S06, M11).

**Request headers:**
```
X-Platform-Admin-Key: <PLATFORM_ADMIN_KEY>
X-Internal-Key: <INTERNAL_API_KEY>
Content-Type: application/json
```

**Request body:**
```json
{
  "name":        "AutoWash Pro",
  "slug":        "autowash-pro",
  "adminEmail":  "owner@autowashpro.com.br",
  "country_code": "BR",
  "timezone":    "America/Sao_Paulo"
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `name` | string | ✓ | Non-empty |
| `slug` | string | ✓ | `/^[a-z0-9-]+$/`, globally unique |
| `adminEmail` | string | ✓ | Valid email format |
| `country_code` | string | ✓ | Exactly two letters in ISO format and supported by the platform; `BR` for the current Brazil deployment |
| `timezone` | string | — | Valid IANA timezone (default: `America/Sao_Paulo`) |

**Response `201 Created`:**
```json
{
  "tenantId": "uuid-v7",
  "name":     "AutoWash Pro",
  "slug":     "autowash-pro"
}
```

**Error responses:**

| Status | Condition |
|---|---|
| `401` | Missing or invalid Cloud Run IAM identity token in `Authorization`, invalid `X-Internal-Key`, or invalid `X-Platform-Admin-Key` |
| `400` | Validation failure (invalid slug format, invalid email, invalid or unsupported `country_code`, invalid timezone) |
| `409` | Slug already in use |

---

### `POST /cron/loyalty-expiry` — Publish the daily points-expiry trigger (M10-S08, transport updated M17-S03)

Publishes the `cron-loyalty-expiry` trigger onto the event bus's trigger channel (`ITriggerBus`) — the same channel Cloud Scheduler publishes to directly in prod via the `ikaro-cron-loyalty-expiry` Pub/Sub topic (daily, 02:00 UTC). `ExpirePointsTriggerHandler`, subscribed to that trigger, calls `ExpirePointsJob.run()`, which decrements `loyalty_balances.current_points` for all `loyalty_entries` whose `expires_at` has passed. Fully idempotent — safe to call multiple times; already-processed entries are skipped via `balance_expiry_log`.

**Why a Pub/Sub trigger (not `@Cron` or a direct HTTP call):** Cloud Run scales to zero and multi-pod deployments would execute a `@Cron` on every pod simultaneously. The backend is internal-ingress only with no public URL, so Cloud Scheduler cannot call it directly either — Scheduler publishes to Pub/Sub, whose push subscription reaches the internal-ingress backend at `/pubsub/push` (D2/D3, `plan/M17-CLOUD-DEPLOY.md`). This `POST /cron/loyalty-expiry` endpoint is the local/manual trigger path only, protected by `InternalApiGuard` (not `PubSubPushGuard`) — it is not the endpoint Scheduler calls in prod.

**Request headers:** `X-Internal-Key` required — protected by the global `InternalApiGuard`, same as any other internal endpoint. No `PubSubPushGuard`/OIDC on this endpoint; that guard sits on the shared `/pubsub/push` receiver instead.

**Request body:** none

**Response `200 OK`:**

```json
{ "ok": true }
```

Returned once the trigger is published — not once `ExpirePointsJob` finishes running (dispatch is asynchronous in prod; the local pull-mode consumer processes it moments later).

**GCP Cloud Scheduler resource (Terraform — `modules/scheduler`, M17-S21):**

```hcl
resource "google_cloud_scheduler_job" "loyalty_expire_points" {
  name      = "loyalty-expire-points"
  schedule  = "0 2 * * *"
  time_zone = "UTC"
  pubsub_target {
    topic_name = google_pubsub_topic.cron_loyalty_expiry.id
    data       = base64encode("{}")
  }
}
```

---

### `POST /cron/chatbot-retention-purge` — Publish the daily chatbot-retention-purge trigger (UC-035)

Same shape as `POST /cron/loyalty-expiry` above — local/manual trigger path only, `InternalApiGuard`-protected, not the endpoint Cloud Scheduler calls in prod (Scheduler publishes to the `ikaro-cron-chatbot-retention-purge` Pub/Sub topic directly). The trigger handler deletes every `chatbot_messages` row older than 180 days, then every now-orphaned `chatbot_sessions` row past the same window.

**Request headers:** `X-Internal-Key` required.

**Request body:** none

**Response `200 OK`:** `{ "ok": true }` — returned once the trigger is published, not once the purge job finishes.

**GCP Cloud Scheduler resource (Terraform — `modules/scheduler`):**
```hcl
resource "google_cloud_scheduler_job" "chatbot_retention_purge" {
  name      = "chatbot-retention-purge"
  schedule  = "0 3 * * *"
  time_zone = "UTC"
  pubsub_target {
    topic_name = google_pubsub_topic.cron_chatbot_retention_purge.id
    data       = base64encode("{}")
  }
}
```

---

### `POST /cron/chatbot-balance-poll` — Publish the LLM provider balance-poll trigger (UC-036)

Same shape as `POST /cron/loyalty-expiry` above. The trigger handler calls OpenRouter's `GET /api/v1/credits` and upserts `platform.chatbot_provider_balance`.

**Request headers:** `X-Internal-Key` required.

**Request body:** none

**Response `200 OK`:** `{ "ok": true }`

**GCP Cloud Scheduler resource (Terraform — `modules/scheduler`):**
```hcl
resource "google_cloud_scheduler_job" "chatbot_balance_poll" {
  name      = "chatbot-balance-poll"
  schedule  = "*/15 * * * *"
  time_zone = "UTC"
  pubsub_target {
    topic_name = google_pubsub_topic.cron_chatbot_balance_poll.id
    data       = base64encode("{}")
  }
}
```

---

### `POST /cron/lead-form-retention` — Publish the daily lead-form-retention trigger (UC-043)

Same shape as `POST /cron/loyalty-expiry` above — local/manual trigger path only, `InternalApiGuard`-protected, not the endpoint Cloud Scheduler calls in prod (Scheduler publishes to the `ikaro-cron-lead-form-retention` Pub/Sub topic directly). The trigger handler deletes every `lead_form_submissions` row where `expires_at < now()`, a cross-tenant scan using the standalone `(expires_at)` index (not the `(tenant_id, expires_at)` composite, which this unscoped query can't seek — `docs/13-DATABASE_SCHEMA.md`).

**Request headers:** `X-Internal-Key` required.

**Request body:** none

**Response `200 OK`:** `{ "ok": true }` — returned once the trigger is published, not once the purge job finishes.

**GCP Cloud Scheduler resource (Terraform — `modules/scheduler`):**
```hcl
resource "google_cloud_scheduler_job" "lead_form_retention" {
  name      = "lead-form-retention"
  schedule  = "0 3 * * *"
  time_zone = "UTC"
  pubsub_target {
    topic_name = google_pubsub_topic.cron_lead_form_retention.id
    data       = base64encode("{}")
  }
}
```

---

## Error Handling (RFC 9457)

All non-2xx responses follow the **Problem Details for HTTP APIs** standard. `type` is always the literal string `'about:blank'` — it is **not** a machine-readable identifier. `code` is the machine-readable identifier. See `docs/25-ERROR_CATALOG.md` for the full error reference and `docs/ENGINEERING_RULES.md` § Exception handling & i18n pattern for the end-to-end pattern (code catalog, naming convention, frontend resolver).

Single-cause error:

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

Batch validation failure (Zod pipes) — `violations[]` instead of top-level `code`/`field`:

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
| `type` | string | Always `'about:blank'` |
| `status` | integer | HTTP status code |
| `code` | string (optional) | Machine-readable error identifier, single-cause errors only — the only field a client branches on to select a message |
| `field` | string (optional) | Which request field is at fault, single-cause errors only — routing use (e.g. highlight a field), never message selection |
| `params` | object (optional) | Interpolation values for the resolved message template (e.g. `{ hours: 48 }`) |
| `violations` | array (optional) | Batch validation failures — `{ field, code, params? }[]`. Mutually exclusive with top-level `code`/`field` |
| `detail` | string | Backend-internal/debug text — never rendered to a user |
| `correlationId` | UUID | Trace ID for debugging |

| Code | Meaning | Usage |
|------|---------|-------|
| **400** | Bad Request | Validation errors or business rule violation (e.g., 48h cancel). |
| **401** | Unauthorized | Invalid/Expired JWT. |
| **403** | Forbidden | Tenant mismatch or insufficient role. |
| **404** | Not Found | Resource does not exist in the current tenant. |

---

**Status:** Phase 2 - Technical Architecture (Full UC Coverage)  
**Next:** `15-HOTSITE_DYNAMIC_ARCHITECTURE.md`
