# M13 — Dashboard Frontend (Staff, Manager, Customer, Guest)

**Phase:** Local Development
**Goal:** Staff have a functional command center to manage bookings, services, schedule, and loyalty. Managers additionally run team, settings, and hotsite administration. Customers have a portal to view bookings, loyalty, and switch tenants. Guests can respond to info requests via a standalone link. All pages connect to the local BFF and are protected by the JWT auth flow from M03.
**Depends on:** M02 (Platform context), M03 (auth/JWT), M04 (staff aggregate), M05 (service aggregate), M08 (booking backend), M09 (cancellation/reschedule backend), M10 (loyalty backend), M12 (hotsite frontend foundation), M115 (production readiness baseline)
**Blocks:** M16 (E2E tests cover dashboard flows)

## Supersession note

This file replaces six previously separate draft milestone files — `M124-LOGIN.md`, `M125-STAFF-DASHBOARD.md`, `M126-CUSTOMER-MINHA-CONTA.md`, `M127-MANAGER-WORKSPACE.md`, `M128-STAFF-LOYALTY.md`, `M129-GUEST-SUBMIT-INFO.md` — plus the original coarse-grained draft of this file. None of the 47 stories across those 7 files had been implemented. They have been consolidated here, renumbered into one dependency-ordered sequence, with one cross-milestone gap closed (`M13-S29`'s loyalty conversion-rate dependency) and a few small AC additions folded in where the journey-prototype audit found a concrete missing piece. Every story below carries a "(formerly M1xx-Sxx)" note for traceability back to the original drafts (recoverable via git history).

**Key reordering decision:** stories with zero frontend-shell dependency (pure backend or BFF work) are pulled into one early "Backend & BFF readiness" wave (Phase 1) regardless of which feature area they originally belonged to. This means no later frontend phase ever blocks waiting on a backend/BFF story that "belonged" to a milestone sequenced after it — the old M126/M128 split, for example, would have shipped the customer loyalty page before the conversion-rate field it displays existed; pulling both BFF stories forward removes that gap entirely instead of patching around it.

---

## Architecture & conventions (apply across every story below)

> Carried forward from the original M13 draft's "Key Architectural Notes" — these are cross-cutting decisions that apply to the whole milestone, not restated per story.

**Two separate API client layers — do not unify them:**
- `apps/web/lib/api/platform.ts` (built in M12-S03) — `fetch()`-based, unauthenticated, ISR-cached (`next: { revalidate: 300 }`), for the **public hotsite manifest**.
- `apps/web/lib/api/bff-client.ts` (built in `M13-S01` below) — Axios instance, JWT cookie + `X-Tenant-Slug` interceptors, client-side, TanStack Query, for the **authenticated dashboard**. Don't route the public hotsite fetch through this client (it would attach auth headers unnecessarily to a cacheable public request).

**TanStack Query conventions:**
- Every `queryKey` array includes `tenantId` (from JWT) to prevent cross-tenant cache pollution.
- `401` response → hook throws `AuthError` → middleware/page redirects to login.
- `403` response → hook throws `ForbiddenError` → page shows "Acesso negado" in pt-BR.
- `QueryClient` configured with `staleTime: 30000` (30s) and `retry: 1`.

**Role-based rendering:** CUSTOMER sees Agendamentos/Fidelidade/Trocar empresa; STAFF sees Agenda/Horários/Serviços/Fidelidade; MANAGER sees all STAFF items + Equipe/Configurações/Hotsite under a "Somente Gerente" sidebar section.

**Phone precondition for CUSTOMER (UC-021 A3):** after login/tenant-selection, a CUSTOMER with `phone === null` is prompted inline (bottom sheet) to complete it before proceeding. STAFF/MANAGER never see this.

**Multi-tenant support:** a login-time `/select-tenant` selection screen was designed but descoped in `M13-S14`'s discovery session — every customer login starts from a specific tenant's hotsite, which always supplies the tenant context directly, so the BFF's multi-tenant OAuth branch is unreachable in practice (see `docs/04-USE_CASES.md` UC-021). Multi-tenant customers are still fully supported — they log into whichever tenant's hotsite they started from, then use `/switch-tenant` (UC-023, built in `M13-S14`) to move between tenants they already belong to, triggered from "Trocar empresa" in `HotsiteAuthBar`'s avatar dropdown.

**Customer account area naming:** the journey prototype folder is `plan/journey/customer/prototypes/minha-conta/` and stays pt-BR — prototypes are conceptual mockups, not code. The production route/file/component names are English: `/{slug}/my-account` (not `/{slug}/minha-conta`), per the code-standards English-only rule (`CLAUDE.md` §7). This was established in `M13-S42` (hotsite auth bar) and carried through `S16`/`S27`–`S30`. UI-facing pt-BR copy ("Minha conta", "Agendamentos", "Fidelidade") is unaffected — only identifiers and paths changed.

**Booking form / calendar reuse:** the guest/customer booking flow (UC-011, M12) still provides the shared availability primitives, but the shipped staff reschedule flow is a dedicated `/dashboard/bookings/[id]/reschedule` route built on `AvailabilityCarousel` + `SlotPicker`. Keep basket/duration-recompute logic out of the staff lifecycle flow.

**`dashboard-shell.html` CSS classes — do not invent new ones, use what's in `shared/tokens.css`:** `.dashboard-topbar`, `.topbar-page-title`, `.topbar-date`, `.dashboard-layout`, `.sidebar`, `.sidebar-header`, `.sidebar-nav`/`.sidebar-nav-item`/`.sidebar-nav-icon`, `.sidebar-section-label`, `.sidebar-footer`, `.main-content`, `.dashboard-body`, `.bottom-nav`, `.auth-avatar` (NOT `.topbar-avatar` — hidden on desktop), `.role-badge`/`.role-badge-manager`, `.status-badge` + `.status-*`.

---

## Build order (42 stories, 12 phases)

| Phase | Stories | Theme |
|---|---|---|
| Pre-0 | M13-S41 | **Playwright E2E infrastructure — implement this first** |
| Pre-0b | M13-S42 | **Hotsite auth bar — implemented out of order, self-contained, no dependencies** |
| 0 | M13-S01 | Frontend foundation (TanStack Query + typed client) |
| 1 | M13-S02–M13-S12 | Backend & BFF readiness (zero frontend dependency) |
| 2 | M13-S13–M13-S14 | Auth frontend |
| 3 | M13-S15–M13-S16 | Dashboard shells |
| 4 | M13-S17–M13-S20 | Staff booking core |
| 5 | M13-S21–M13-S24 | Staff schedule & services |
| 6 | M13-S25–M13-S26 | Staff loyalty frontend |
| 7 | M13-S27–M13-S29 | Customer Minha Conta (`M13-S30` merged into `M13-S14`) |
| 8 | M13-S31–M13-S37 | Manager workspace |
| 9 | M13-S38–M13-S40 | Guest submit-info |

---

## Phase 0 — Frontend foundation

---

### M13-S01 — TanStack Query setup + typed BFF client ✅ Done

*(formerly M13-S01)*

**Agent:** `frontend-ts`
**Complexity:** M
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` § state management + API client

**Description:**
Set up TanStack Query (React Query) as the global data-fetching layer and create typed client functions for every BFF endpoint. This is the foundation all dashboard pages build on — pages import typed hooks, not raw `fetch` calls.

> **Note (M12 follow-up):** `apps/web/lib/api/platform.ts` (M12-S03) already exists — it's a `fetch()`-based, unauthenticated, ISR-cached client for the **public hotsite manifest**. The `bff-client.ts` Axios instance planned here is for the **authenticated dashboard** (JWT cookie + `X-Tenant-Slug` headers, client-side, TanStack Query). Keep these separate — see "Architecture & conventions" above.

**What to create:**
- `apps/web/lib/api/bff-client.ts` — Axios instance with base URL (`NEXT_PUBLIC_BFF_URL`), JWT cookie interceptor (attach `Authorization` header), `X-Tenant-Slug` interceptor, error handling (RFC 9457 Problem Detail → typed `ApiError`)
- `apps/web/lib/api/` — typed function per endpoint group: `bookings.ts`, `services.ts`, `schedule.ts`, `loyalty.ts`, `staff.ts`, `tenants.ts`, `auth.ts`
- `apps/web/lib/hooks/` — TanStack Query wrappers:
  - `useBookings(filters)`, `useBooking(id)`, `useCreateBooking()`, `useUpdateBookingStatus()`
  - `useServices()`, `useCreateService()`, `useUpdateService()`
  - `useAvailability(date, serviceIds)`, `useScheduleClosures()`
  - `useLoyaltyBalance()`, `useLoyaltyEntries()`
  - `useStaff()`, `useInviteStaff()`, `useDeactivateStaff()`
  - `useTenantSettings()`, `useUpdateTenantSettings()`
  - `useHotsiteConfig()`, `useUpdateHotsiteConfig()`
- `apps/web/providers/query-provider.tsx` — wraps the app in `QueryClientProvider`

**Acceptance criteria:**
- [ ] Every BFF endpoint has a corresponding typed function in `lib/api/`
- [ ] All hooks use `queryKey` arrays that include `tenantId` (from JWT) to prevent cross-tenant cache pollution
- [ ] A `401` response from BFF → hook throws `AuthError` → middleware redirects to login
- [ ] A `403` response → hook throws `ForbiddenError` → page shows "Acesso negado" in pt-BR
- [ ] `QueryClient` is configured with `staleTime: 30000` (30s) and `retry: 1`
- [ ] TypeScript: all hook return types are fully typed (no `any`)

**Dependencies:** M00-S05, M03-S06

---

## Phase 1 — Backend & BFF readiness

> Every story in this phase has zero frontend-shell dependency — each depends only on an already-completed backend milestone (M02/M05/M08/M09/M10) or an earlier Phase-1 story. They can be built in any order relative to each other and in parallel with Phase 0; they exist here as one wave purely so Phase 3+ frontend work is never blocked waiting on missing data.

---

### M13-S02 — BFF: fix auth cookie on `POST /auth/token` + `POST /auth/switch-tenant`; fix customer redirect ✅ Done

*(formerly M124-S01)*

**Agent:** `bff-ts`
**Complexity:** S
**Docs to load:** `docs/24-BFF_ARCHITECTURE.md`, `docs/04-USE_CASES.md` § UC-021 UC-023, `plan/M03-AUTHENTICATION_IMPLEMENTATION_DETAILS_IA.md`
**Journey prototypes:** `plan/journey/customer/prototypes/login/` · `plan/journey/staff/prototypes/login/` — reviewed; UC audit done 2026-06-16

**Description:**
Three targeted fixes to `apps/bff/src/auth/auth.controller.ts`. No new endpoints, no schema changes — only behavioural corrections to existing methods. The BFF already has `JWT_COOKIE_OPTIONS` and `res.cookie(...)` usage in other handlers; replicate the same pattern.

> 🔍 **Discover before starting:** Read `apps/bff/src/auth/auth.controller.ts` in full. Confirm the exact signature of `issueToken` and `switchTenant` (no `@Res()` param yet — must add `@Res({ passthrough: true })`). Read `apps/bff/src/auth/cookie-options.ts` to confirm the constant name. Check whether `@ikaro/types` currently exports a type for the `POST /auth/token` response — if yes, that type must be updated here. Run `grep -r "IssueToken\|issueToken" packages/types/` to check.

**Fix 1 — `POST /auth/token` (multi-tenant selection):**

Current:
```ts
async issueToken(@Body() dto: IssueTokenDto): Promise<{ accessToken: string; expiresIn: string }>
```

After fix — set cookie, return tenant slug for frontend redirect:
```ts
async issueToken(
  @Body() dto: IssueTokenDto,
  @Res({ passthrough: true }) res: Response,
): Promise<{ tenantSlug: string; expiresIn: string }> {
  // ... existing match + tenantInfo lookup (unchanged) ...
  const accessToken = this.jwtIssuer.issueToken({ sub: match.customerId, tenantId, tenantSlug, role: 'CUSTOMER' });
  res.cookie('access_token', accessToken, JWT_COOKIE_OPTIONS);
  return { tenantSlug: tenantInfo.slug, expiresIn: this.config.getOrThrow<string>('JWT_EXPIRES_IN') };
}
```

**Fix 2 — `POST /auth/switch-tenant`:**

Same pattern: add `@Res({ passthrough: true }) res: Response`, set cookie, return `{ tenantSlug: string; expiresIn: string }` instead of `{ accessToken, expiresIn }`.

**Fix 3 — customer post-login redirect:**

In `handleTenantLogin` and in the 1-tenant branch of `handleMultiTenantLogin`, change:
```ts
res.redirect(`${frontendUrl}/dashboard`);
```
to:
```ts
res.redirect(`${frontendUrl}/${tenantInfo.slug}`);
```

**`@ikaro/types` changes:**

Add or update `packages/types/src/auth.dto.ts` (create if absent):
```typescript
export interface IssueTokenResponse {
  readonly tenantSlug: string;
  readonly expiresIn: string;
}

export interface SwitchTenantResponse {
  readonly tenantSlug: string;
  readonly expiresIn: string;
}

export interface TenantOption {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly loyaltyPoints: number;   // current_points from loyalty_balances
}
```

`TenantOption` is consumed by the `/select-tenant` page (`M13-S14`). `IssueTokenResponse` and `SwitchTenantResponse` replace the old `{ accessToken, expiresIn }` shape — since neither endpoint has a frontend consumer yet (those pages are built in `M13-S13`/`M13-S14`), this is a safe breaking change.

> **Superseded by `M13-S14`'s discovery session (2026-06-24):** `/select-tenant` and `POST /auth/token` (`issueToken`) were never reachable from any shipped UI — every customer login entry point supplies a `tenantSlug` directly, so `handleMultiTenantLogin`'s 2+-tenant branch never triggers. Both were removed as dead code in `M13-S14`. `TenantOption` survives — it's reused by `M13-S14`'s switch-tenant feature (folded in from the original `M13-S30`). `SwitchTenantResponse` also survives (used by `switch-tenant`). See `docs/04-USE_CASES.md` UC-021 for the corresponding use-case update.

**Tests to update:**

- `apps/bff/src/auth/auth.controller.spec.ts` — update assertions for `issueToken` and `switchTenant`: verify `res.cookie` is called with `'access_token'`, verify returned shape is `{ tenantSlug, expiresIn }`, verify `accessToken` is no longer in the response
- `apps/bff/src/auth/auth.controller.component.spec.ts` — update the `POST /auth/token` and `POST /auth/switch-tenant` integration assertions; add assertions that `Set-Cookie` header is present; add assertion that `handleTenantLogin` redirects to `/${tenantSlug}` not `/dashboard`

**Acceptance criteria:**
- [ ] `POST /auth/token` response body: `{ tenantSlug: string; expiresIn: string }` — no `accessToken` field
- [ ] `POST /auth/token` sets `access_token` httpOnly cookie (same options as other handlers)
- [ ] `POST /auth/switch-tenant` response body: `{ tenantSlug: string; expiresIn: string }` — no `accessToken` field
- [ ] `POST /auth/switch-tenant` sets `access_token` httpOnly cookie
- [ ] `GET /auth/google/callback` for a tenant-scoped customer login redirects to `${frontendUrl}/${tenantSlug}`, not `/dashboard`
- [ ] `GET /auth/google/callback` for multi-tenant customer (auto-selected 1 tenant) redirects to `${frontendUrl}/${tenantSlug}`
- [ ] Staff login redirect unchanged: still redirects to `${frontendUrl}/dashboard`
- [ ] `IssueTokenResponse`, `SwitchTenantResponse`, `TenantOption` exported from `@ikaro/types`
- [ ] `.http` block in `apps/bff/http/auth/auth.http` reflects updated response shape
- [ ] All existing auth controller tests pass; no new TypeScript errors

**Dependencies:** none — first story in Phase 1

---

### M13-S03 — BFF: staff booking list endpoint ✅ Done

*(formerly M125-S02)*

**Agent:** `bff-ts`
**Complexity:** S
**Docs to load:** `docs/14-API_CONTRACTS.md` § Bookings, `docs/24-BFF_ARCHITECTURE.md`

**Description:**
Provide a paginated, filterable booking list endpoint shaped for the booking queue UI. The queue shows a summary card per booking — customer name, services, scheduled time, status badge, total price.

> 🔍 **Discover before starting:** Open `apps/bff/src/bookings/bookings.controller.ts`. There is likely a `GET /v1/bookings` route already (built in M08/M09 for customer-side listing). Read its current shape, query params, and `@Roles` decorator. If it already returns a staff-friendly shape (customer name, service names, status), this story may reduce to adding/adjusting query params only. If it returns a customer-shaped response (own bookings only), a new dedicated staff variant is needed.

**Proposed endpoint (adjust based on discovery):**

> **Queue grouping resolved 2026-06-16** (see `plan/journey/staff/agenda.md` "Queue scope"): the queue is grouped by urgency, not date — "Precisa de ação" (no date filter, ALL pending/info-requested), "Hoje" (approved, today only), "Próximos dias" (approved, future). One endpoint shape serves all three via different query params — no separate routes needed.

```
GET /v1/bookings
Headers: X-Actor-Role: STAFF | MANAGER, X-Tenant-ID: {tenantId}
Query params:
  status?   comma-separated BookingStatus values (default: PENDING,INFO_REQUESTED)
  date?     YYYY-MM-DD — exact-date filter, used for "Hoje" (status=APPROVED&date=today)
  from?     YYYY-MM-DD — range-start filter, used for "Próximos dias" (status=APPROVED&from=tomorrow)
  page?     integer (default: 1)
  limit?    integer (default: 20, max: 100)
```

`date` and `from` are mutually exclusive — "Precisa de ação" sends neither (no date filter at all, sorted by `scheduledAt ASC` regardless of day).

Response shape (new type `StaffBookingCardResponse` in `@ikaro/types`):
```typescript
interface StaffBookingCardResponse {
  bookingId: string;
  status: BookingStatus;
  scheduledAt: string;           // ISO-8601
  contactName: string;           // guest name or customer name
  serviceNames: string[];        // one per line, e.g. ["Lavagem Simples", "Enceramento"]
  totalPrice: MoneyAmount;
  totalDurationMins: number;
  isCustomer: boolean;           // true = authenticated customer; false = guest
}

interface StaffBookingListResponse {
  items: StaffBookingCardResponse[];
  total: number;
  page: number;
  limit: number;
}
```

**Acceptance criteria:**
- [ ] `GET /v1/bookings?status=PENDING,INFO_REQUESTED` (no date) returns ALL matching bookings regardless of date, sorted by `scheduledAt ASC`, scoped to tenant
- [ ] `GET /v1/bookings?status=APPROVED&date=2026-06-16` returns only that exact date's approved bookings
- [ ] `GET /v1/bookings?status=APPROVED&from=2026-06-17` returns approved bookings on/after that date
- [ ] `GET /v1/bookings` with CUSTOMER JWT → `403`
- [ ] `GET /v1/bookings` without auth → `401`
- [ ] Tenant isolation: Tenant A's MANAGER cannot retrieve Tenant B's bookings
- [ ] Empty result → `{ items: [], total: 0, page: 1, limit: 20 }` (not 404)
- [ ] `StaffBookingCardResponse` and `StaffBookingListResponse` added to `packages/types/src/booking.dto.ts`
- [ ] `.http` request block added to `apps/bff/http/bookings/bookings.http`

**Dependencies:** M08

---

### M13-S04 — BFF: booking detail endpoint for staff ✅ Done

*(formerly M125-S04)*

**Agent:** `bff-ts`
**Complexity:** M
**Docs to load:** `docs/14-API_CONTRACTS.md` § Bookings + Loyalty, `docs/24-BFF_ARCHITECTURE.md`, `docs/04-USE_CASES.md` § UC-003

**Description:**
Provide the full booking detail, enriched with the customer's loyalty balance. UC-003 step 1 explicitly says "The dashboard shows the customer's current active-points balance so the admin can decide." This requires BFF orchestration: backend booking detail + loyalty balance lookup.

> 🔍 **Discover before starting:** Open `apps/bff/src/bookings/bookings.controller.ts` and look for `GET /v1/bookings/:id`. It likely exists from M08. Check: (a) whether it already includes `loyaltyBalance`, (b) its `@Roles` guard — does it allow STAFF|MANAGER, or is it customer-only? If it serves both actors, the staff enrichment (loyalty balance) might need to be conditional on role. Verify `GET /v1/loyalty/:customerId/balance` or equivalent exists in the BFF from M10.

**Proposed endpoint (adjust based on discovery):**

```
GET /v1/bookings/:id
Headers: X-Actor-Role: STAFF | MANAGER, X-Tenant-ID, X-Actor-ID
```

Staff-shaped response type `StaffBookingDetailResponse` (add to `packages/types/src/booking.dto.ts`):
```typescript
interface StaffBookingDetailResponse {
  bookingId: string;
  status: BookingStatus;
  scheduledAt: string;
  type: 'GUEST' | 'CUSTOMER';

  // Contact / customer info
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactAddress: Address | null;
  pickupAddress: Address | null;

  // Loyalty (null for guest bookings)
  customerId: string | null;
  loyaltyBalance: number | null;     // current active points
  loyaltyConversionRate: number;     // pointsPerCurrencyUnit (added in M13-S12 — see M13-S26's note)

  // Lines
  lines: StaffBookingLineResponse[];
  totalPrice: MoneyAmount;
  totalDurationMins: number;

  // Media
  beforeServicePhotoUrls: string[];   // signed read URLs

  // Admin-recorded fields
  infoRequestMessage: string | null;  // UC-005: what admin asked
  infoResponseMessage: string | null; // UC-005 A2: what customer answered
  approvedAt: string | null;
  approvedBy: string | null;          // staffId UUID
  rejectionReason: string | null;
}

interface StaffBookingLineResponse {
  lineId: string;
  serviceName: string;
  priceAtBooking: MoneyAmount;
  durationMinsAtBooking: number;
  pointsValueAtBooking: number;
  requiresPickupAddressAtBooking: boolean;
}
```

> **Note (added during consolidation):** `loyaltyConversionRate` is listed here so `M13-S26` (loyalty redemption strip in Mark Complete) doesn't need a second BFF call on mount. It depends on `M13-S12` having landed (which adds `pointsPerCurrencyUnit` enrichment) — since `M13-S12` is also in Phase 1, this is satisfied by construction regardless of which order M13-S04/M13-S12 land in within the phase. If `M13-S04` is implemented before `M13-S12`, add the field as a follow-up patch rather than blocking.

**BFF orchestration:**

When `customerId != null`:
1. `GET /bookings/:id` → backend booking detail
2. `GET /loyalty/balance?customerId=:customerId` (or equivalent loyalty endpoint) → `{ currentPoints }`
3. Compose response with `loyaltyBalance = currentPoints`

When `customerId == null` (guest booking): skip loyalty call, return `loyaltyBalance: null`.

Before-service photo URLs: call `IStorageService.getSignedReadUrl(path)` per photo path (same pattern as M115-S01). Or pass filePaths to frontend and have Next.js image proxy — decide at discovery.

> **Note (resolved during M13-S04 discovery):** No signed-read-URL capability exists anywhere in the codebase yet — M115-S01 only ever added **write**-signed URLs (`IStorageService.generateSignedUrl(..., operation: 'write')`). This story adds `operation: 'read'` to the port + GCS adapter; `GetBookingUseCase` (backend) signs each `beforeServicePhotoUrls`/`afterServicePhotoUrls` path before returning — the BFF just passes the already-signed URLs through. Since the signing happens in the shared backend projection (not BFF-side), it benefits the CUSTOMER passthrough branch too, and also unblocks `M13-S07`, which has the identical gap for customer photo URLs.
>
> Also resolved: `contactAddress`, `approvedAt`, `approvedBy`, `rejectionReason` exist as `Booking` aggregate getters but were never projected by `GetBookingUseCase.toResult()`. This story extends that projection to surface them — no new business logic, just widening an existing read model.
>
> `GET /v1/bookings/:id` stays a single shared route, branched by `X-Actor-Role` inside the existing `getOne()` handler. STAFF/MANAGER get the new `StaffBookingDetailResponse`; CUSTOMER keeps today's unchanged generic `BookingDetailResponse` passthrough — narrowing the route to staff-only would have broken the validated customer "Minha Conta" detail prototype (`plan/journey/customer/prototypes/minha-conta/02-agendamento-detail.html`), which already relies on this route today. `M13-S07` later replaces the CUSTOMER branch with the dedicated `CustomerBookingDetailResponse` shape.

**Acceptance criteria:**
- [ ] `GET /v1/bookings/:id` with STAFF|MANAGER JWT returns `StaffBookingDetailResponse`
- [ ] `loyaltyBalance` is populated for customer bookings; `null` for guest bookings
- [ ] `infoRequestMessage` populated when booking is INFO_REQUESTED or beyond
- [ ] `infoResponseMessage` populated when customer submitted info (UC-005 A2)
- [ ] CUSTOMER JWT → `200`, unchanged generic `BookingDetailResponse` passthrough (no regression to the customer detail prototype); `M13-S07` replaces this branch with `CustomerBookingDetailResponse`
- [ ] Booking not in tenant → `404`
- [ ] Tenant isolation: MANAGER of Tenant A cannot retrieve Tenant B's booking detail
- [ ] `StaffBookingDetailResponse` + `StaffBookingLineResponse` in `packages/types/src/booking.dto.ts`
- [ ] `.http` block added/updated in `apps/bff/http/bookings/bookings.http`

**Dependencies:** M08, M10 (loyalty balance endpoint)

---

### M13-S05 — BFF: staff service management endpoints ✅ Done

*(formerly M125-S07)*

**Agent:** `bff-ts`
**Complexity:** S
**Docs to load:** `docs/14-API_CONTRACTS.md` § Services, `docs/24-BFF_ARCHITECTURE.md`, `docs/04-USE_CASES.md` § UC-012, UC-013

**Description:**
Verify and fill the BFF surface for staff service management. `POST /v1/services`, `PATCH /v1/services/:id`, and `DELETE /v1/services/:id` were implemented in M05 — this story confirms they exist and adds any missing pieces: a staff-authenticated list endpoint that returns **inactive** services (the public hotsite endpoint only returns `isActive: true`), and a single-service fetch for edit pre-fill.

> **Note (resolved during M13-S05):** `@ikaro/types`'s `CreateServiceRequest`/`UpdateServiceRequest` were fixed to the dominant `priceAmount`/`loyaltyPointsValue` convention (matching the backend Zod schema, the BFF Zod schema, and the web fetcher — all three already agreed; `@ikaro/types` was the one out of sync). `apps/web/lib/api/dashboard/services.ts` now imports these (plus the new `StaffServiceResponse`/`StaffServiceListResponse`) from `@ikaro/types` instead of redeclaring them locally. The story's own proposed `priceAmountCents`/`durationMins` shapes below were **not** adopted — `priceAmountCents` would have implied an integer-cents semantic that doesn't match `Money.from(dto.priceAmount, currency)`'s actual decimal usage; almost certainly a leftover from the older `M125-S07` draft. See `td/TD09-WEB-TYPES-DRIFT-VS-IKARO-TYPES.md` for the full writeup (the `services` case there is now resolved; `customers`/`loyalty`/`staff` remain open).
>
> **Also resolved:** the bare `GET /v1/services` already belonged to the public hotsite controller (`ServicesPublicController`), which would have collided with the new staff-guarded list at the same path. Moved the public controller to `public/services` (and, for the same reason, `platform.public.controller.ts` to `public/platform`) — see `docs/24-BFF_ARCHITECTURE.md` § Module & Controller Naming Conventions for the new default rule. `ListServicesUseCase` now branches on `RequestContext.actorRole` (mirroring `GetBookingUseCase` from `M13-S04`) to return inactive services to STAFF/MANAGER only. `DELETE /v1/services/:id` now returns `204` (was `200` + body) to match this story's AC.

> 🔍 **Discover before starting:** Open `apps/bff/src/` and locate the services module (likely `platform/` or `catalog/`). Check: (a) does `GET /v1/services` already exist with a STAFF|MANAGER guard? Does it return `isActive`? (b) does `GET /v1/services/:id` exist for authenticated staff? (c) do `POST`, `PATCH`, `DELETE` endpoints exist with correct `@Roles('STAFF','MANAGER')` guard and `.http` blocks? List every gap — this story fills all of them.
>
> ⚠️ **Backend gap, not just BFF:** `CreateServiceRequest.isActive` below has no backing capability today — `Service.create()` in `apps/backend/src/contexts/booking/domain/service.aggregate.ts` hardcodes `isActive: true` with no override parameter, and `CreateServiceSchema` has no `isActive` field. Passing `isActive: false` through the BFF will not work until the backend's `Service.create()` and DTO/schema are extended to accept it — this is a backend-side change, out of scope for this BFF-only story unless explicitly pulled in.

**Endpoints to verify or add:**

```
GET    /v1/services          X-Actor-Role: STAFF|MANAGER   → StaffServiceListResponse
GET    /v1/services/:id      X-Actor-Role: STAFF|MANAGER   → StaffServiceResponse
POST   /v1/services          X-Actor-Role: STAFF|MANAGER   → StaffServiceResponse   (likely already exists)
PATCH  /v1/services/:id      X-Actor-Role: STAFF|MANAGER   → StaffServiceResponse   (likely already exists)
DELETE /v1/services/:id      X-Actor-Role: STAFF|MANAGER   → 204                    (likely already exists)
```

**`@ikaro/types` additions (new file `packages/types/src/service.dto.ts` or extend existing):**

```typescript
export interface StaffServiceResponse {
  serviceId: string;
  name: string;
  description: string | null;
  price: MoneyAmount;
  durationMins: number;
  loyaltyPointsValue: number;
  requiresPickupAddress: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface StaffServiceListResponse {
  items: StaffServiceResponse[];
  total: number;
}

export interface CreateServiceRequest {
  name: string;                   // max 100 chars, required
  description?: string;           // max 500 chars
  priceAmountCents: number;       // integer, > 0
  durationMins: number;           // integer, > 0
  loyaltyPointsValue?: number;    // integer, ≥ 0, default 0
  requiresPickupAddress?: boolean; // default false
  isActive?: boolean;             // default true
}

export interface UpdateServiceRequest {
  name?: string;
  description?: string;
  priceAmountCents?: number;
  durationMins?: number;
  loyaltyPointsValue?: number;
  requiresPickupAddress?: boolean;
}
```

**Acceptance criteria:**
- [ ] `GET /v1/services` with STAFF|MANAGER returns all services including `isActive: false` ones, scoped to tenant
- [ ] `GET /v1/services` with CUSTOMER JWT → `403`; without auth → `401`
- [ ] `GET /v1/services/:id` with STAFF|MANAGER returns single service (active or inactive)
- [ ] `POST /v1/services` with duplicate name → `409` with RFC 9457 body
- [ ] `DELETE /v1/services/:id` → `204`; subsequent `GET /v1/services/:id` returns `isActive: false`
- [ ] Tenant isolation: MANAGER of Tenant A cannot read/modify Tenant B's services
- [ ] `.http` blocks present in `apps/bff/http/services/` for all 5 operations
- [ ] All types added to `@ikaro/types` and re-exported from `packages/types/src/index.ts`
- [ ] `tsc --noEmit` passes across monorepo

**Dependencies:** M05 (Service aggregate + backend endpoints)

---

### M13-S06 — BFF: customer booking list + loyalty balance endpoints ✅ Done

*(formerly M126-S02)*

**Agent:** `bff-ts`
**Complexity:** S
**Docs to load:** `docs/14-API_CONTRACTS.md` § Bookings + Loyalty, `docs/24-BFF_ARCHITECTURE.md`

**Description:**
Provide the two data endpoints needed for the Minha Conta list page: a customer-scoped booking list and the loyalty balance strip.

> 🔍 **Discover before starting:**
> - Open `apps/bff/src/bookings/bookings.controller.ts`. Look for `GET /v1/bookings`. Check: (a) does it already allow `CUSTOMER` role via `@Roles`? (b) when called with a CUSTOMER JWT, does it filter to `customerId === JWT.sub`? (c) does its response shape include `status`, `scheduledAt`, `lines[].serviceName`, `lines[].priceAtBooking`, `totalPrice`? If yes to all three, this story reduces to adding `CustomerBookingListResponse` to `packages/types/` only.
>
> **Note (resolved during M13-S06 discovery):** an earlier draft of this story's `CustomerBookingListItem` included `notes: string | null` ("booking.notes — what the customer wrote on request"). Removed — the validated UX prototype for this list page (`plan/journey/customer/prototypes/minha-conta/01-minha-conta.html`) has no notes/observations element at all; that section only exists on the *detail* page prototype (`02-agendamento-detail.html`, "Suas observações"). See the note added to `M13-S07` below — the backend has no field to back that section either way, so it's a real gap for whichever story picks up the detail page, not this one.
> - Open `apps/bff/src/loyalty/loyalty.controller.ts` (or similar). Check if `GET /v1/loyalty/balance` exists and is accessible to CUSTOMER role. Response should include `currentPoints`, `nextExpiryDate`, `nextExpiryPoints`.

**`@ikaro/types` additions** (`packages/types/src/booking.dto.ts`):

```typescript
export interface CustomerBookingLineItem {
  lineId: string;
  serviceName: string;
  durationMinsAtBooking: number;  // renamed from durationMins during implementation — matches StaffBookingLineResponse/BookingLineResponse's existing convention
  priceAtBooking: MoneyAmount;
}

export interface CustomerBookingListItem {
  bookingId: string;
  status: BookingStatus;
  scheduledAt: string;             // ISO-8601 — always set; no booking state has a missing slot
  lines: CustomerBookingLineItem[];
  totalPrice: MoneyAmount;
}

export interface CustomerBookingListResponse {
  items: CustomerBookingListItem[];
  total: number;
  page: number;
  limit: number;
}
```

> **Note (resolved during M13-S06 discovery):** `GET /v1/bookings` reuses the exact same `StaffListBookingsQuerySchema` and its defaults for CUSTOMER callers too (no separate customer query schema) — same pagination (`page`/`limit`, default `limit: 20`), same `status` default (`PENDING,INFO_REQUESTED`). Only the **role guard** and the **response mapping** differ per role (mirrors the existing `getOne()` precedent at `bookings.controller.ts:286-302`, which already branches the same path by `user.role`). `CustomerBookingListResponse` therefore carries `page`/`limit` like `StaffBookingListResponse` does — not the unpaginated `{ items, total }` shape an earlier draft of this story proposed.

**`@ikaro/types` additions** (`packages/types/src/loyalty.dto.ts` — extend if exists):

```typescript
export interface CustomerLoyaltyBalanceResponse {
  currentPoints: number;
  nextExpiryDate: string | null;   // ISO-8601 date
  nextExpiryPoints: number | null;
  conversionRate: number;          // pointsPerCurrencyUnit — see M13-S12; 0 = redemption disabled
}
```

**BFF changes (only if not already correct):**
- `GET /v1/bookings` — ensure `@Roles('CUSTOMER')` is included and the handler filters `WHERE customerId = X-Actor-ID AND tenantId = X-Tenant-ID`
- `GET /v1/loyalty/balance` — ensure `@Roles('CUSTOMER')` included; returns `CustomerLoyaltyBalanceResponse` shape (resolves TD09's loyalty case — `apps/bff/src/loyalty/loyalty.controller.ts#getBalance()` currently returns its own internal `loyalty.types.ts#LoyaltyBalanceResponse`, not `@ikaro/types`; `@ikaro/types`'s existing `LoyaltyBalanceResponse` is the dead/stale export TD09 flagged. Point `getBalance()` at the new `CustomerLoyaltyBalanceResponse` instead, and delete or correct the dead export per TD09's own proposed fix)

**Backend change (only if not already correct):**
- `list-bookings.use-case.ts`'s `BookingLineSummary` is missing `lineId` and `durationMinsAtBooking` — both already exist on `BookingLine` and are already exposed in the detail view's `BookingLineDetail` (BFF `bookings.types.ts`), just never projected into the list's slimmer summary. Add both fields to `BookingLineSummary` + `toListItem()`'s mapping.

**Acceptance criteria:**
- [ ] `GET /v1/bookings` with CUSTOMER JWT returns only that customer's bookings for the tenant
- [ ] Response items include `status`, `scheduledAt`, `lines`, `totalPrice`
- [ ] `GET /v1/bookings` with STAFF JWT → still works (no regression to `M13-S03`)
- [ ] `GET /v1/loyalty/balance` with CUSTOMER JWT → `CustomerLoyaltyBalanceResponse`, including `conversionRate` (see `M13-S12`; if `M13-S12` hasn't landed yet within Phase 1, default to `0` and patch when it does)
- [ ] Tenant isolation: Customer A cannot retrieve Customer B's bookings
- [ ] `CustomerBookingListResponse`, `CustomerBookingListItem`, `CustomerLoyaltyBalanceResponse` in `packages/types/`
- [ ] TD09's loyalty case resolved: `@ikaro/types`'s dead `LoyaltyBalanceResponse` deleted/corrected; BFF's `getBalance()` returns `CustomerLoyaltyBalanceResponse` from `@ikaro/types`
- [ ] `.http` request blocks added/updated in `apps/bff/http/bookings/bookings.http` and `apps/bff/http/loyalty/loyalty.http`

**Dependencies:** M08 (booking list backend), M10 (loyalty balance backend)

---

### M13-S07 — BFF: customer booking detail endpoint ✅ Done

*(formerly M126-S04)*

**Agent:** `bff-ts` (+ a small backend addition — see "Backend changes" below)
**Complexity:** M
**Docs to load:** `docs/14-API_CONTRACTS.md` § Bookings, `docs/24-BFF_ARCHITECTURE.md`

**Description:**
Provide the full booking detail for a customer viewing their own booking. Ownership is mandatory: a CUSTOMER may only fetch bookings where `customerId === JWT.sub`.

> ✅ **Resolved during M13-S07 discovery — discover-before-starting checklist:** `GET /v1/bookings/:id` already allows `CUSTOMER` role and the route already exists (`bookings.controller.ts#getOne()`). Ownership is already enforced — but in the backend's `GetBookingUseCase`, not the BFF — and returns `404` (`BookingNotFoundError`), not `403` (see decision below — this story's original AC text and the prototype's `dev-notes.md` were both wrong on this point, not the code). Today's response shape is the **unscoped generic `BookingDetailResponse`**, passed straight through to the customer — including `adminNotes` (staff-internal) and `approvedBy` (a staff UUID), neither of which should reach a customer. So this story is **not** types-only: it needs a real `toCustomerBookingDetail()` mapper (parallel to the existing `toStaffBookingDetail()`, both belong in `bookings.mapper.ts`).
>
> The story's earlier "Before-service/after-service photo URLs: call `IStorageService.getSignedReadUrl()`" bullet is now obsolete — `M13-S04` already moved photo-URL signing into the backend's shared `GetBookingUseCase.toResult()` (the real method is `generateReadSignedUrl()`), so every role's `beforeServicePhotoUrls`/`afterServicePhotoUrls` arrive at the BFF already signed. No BFF-side signing work remains for this story.

> ✅ **Resolved — ownership mismatch stays `404`, not `403`. No backend change.** `get-booking.use-case.spec.ts` already has a test explicitly titled `"returns 404 for another customer booking (security: does not reveal existence)"` — `get-booking.use-case.ts` throwing `BookingNotFoundError` (→ `404`) for the ownership-mismatch branch is a **deliberate, already-documented** security choice (don't confirm a booking's existence to a non-owner), not an oversight. `cancel-booking-as-customer.use-case.ts`/`submit-booking-info.use-case.ts` throwing `BookingForbiddenError` (→ `403`) for their own ownership checks remains the inconsistent pattern between the three — fixing that inconsistency is out of scope here. This story's AC and `dev-notes.md` are corrected to `404` below; no `get-booking.use-case.ts` change needed.

> ✅ **Resolved — `notes` gets a real backend implementation, not dropped.** Decided during discovery: scope in the full field rather than removing the validated "Suas observações" prototype section. **Backend changes required (touches M07's booking-creation path, not just this story's BFF layer):**
> - `booking.aggregate.ts` — add `notes: string | null` to `BookingProps` and `RequestBookingInput`; initialize alongside `adminNotes: null` in `Booking.requestBooking()`; add a `get notes()` getter (same unvalidated-raw-string pattern as `adminNotes` — no VO).
> - `booking.entity.ts` — add `@Column({ name: 'notes', type: 'text', nullable: true })`.
> - New migration (next sequential timestamp after `1748000000015-AddBookingVersion.ts`) — `ALTER TABLE ... ADD COLUMN IF NOT EXISTS "notes" TEXT NULL` / `DROP COLUMN IF EXISTS "notes"` in `down()`. **Register it in `integration-global-setup.ts` in the same commit** (missing registration is a silent integration-test failure — see `docs/ENGINEERING_RULES.md`).
> - `get-booking.use-case.ts` — add `notes: booking.notes` to `GetBookingUseCaseResult` and `toResult()`.
> - `request-booking.dto.ts` and the authenticated-booking equivalent — accept optional `notes` and pass it into `Booking.requestBooking()`'s input.
> - `BookingBuilder` test helper — add `private notes: string | null = null` + `withNotes()`.
> - BFF: add `notes: z.string().trim().min(1).max(1000).optional()` to both `RequestBookingBodySchema` and `AuthenticatedBookingBodySchema` (guest and authenticated creation, kept symmetric; `.min(1)` matches the existing `adminNotes` schema convention elsewhere in this file — an explicit empty string is rejected, omitting the field is how a client says "no notes"); add `notes: string | null` to `BookingDetailResponse` (`bookings.types.ts`) so it flows through to the new customer mapper. The same `notes: z.string().trim().min(1).max(1000).optional()` schema is also added directly on the backend's `RequestBookingSchema`/`RequestAuthenticatedBookingSchema` (defense in depth — the BFF forwards the JSON body as-is, so both layers validate independently).
> - `packages/types` — add `notes?: string` to `CreateBookingRequest` (matches the Zod schemas' `optional()`-only convention — no `.nullable()`).
> - Max length (`1000` chars) is a discovery-time default, not a validated UX/product decision — adjust if product feedback says otherwise.

**`@ikaro/types` additions** (`packages/types/src/booking.dto.ts`):
```typescript
export interface CustomerBookingDetailResponse {
  bookingId: string;
  status: BookingStatus;
  scheduledAt: string | null;
  lines: CustomerBookingLineItem[];   // reuse from M13-S06
  totalPrice: MoneyAmount;
  notes: string | null;               // customer's own notes at time of request

  // UC-005 A2 — present when status is INFO_REQUESTED or beyond
  infoRequestMessage: string | null;  // what the admin asked
  infoResponseMessage: string | null; // what the customer already answered (if any)

  // Photos — empty array if none
  beforeServicePhotoUrls: string[];   // signed read URLs (already signed by backend's GetBookingUseCase — no BFF-side signing needed)
  afterServicePhotoUrls: string[];    // populated only when COMPLETED
}
```

Also add `notes?: string` to `CreateBookingRequest` in the same file, per the backend changes above — matches the Zod schemas' `optional()` (no `.nullable()`) convention. There's no `@ikaro/types` interface for the authenticated-booking request today (the frontend's `AuthenticatedBookingRequest` is a local type in `apps/web/lib/api/dashboard/bookings.ts`, outside this story's scope); only the BFF/backend Zod schemas for `POST /v1/bookings/authenticated` gained `notes`.

**BFF changes:**
- `bookings.mapper.ts` — add `toCustomerBookingDetail(detail: BookingDetailResponse): CustomerBookingDetailResponse`, narrowing out `adminNotes`/`approvedBy`/`rejectionReason`/contact fields and reshaping `lines` to `CustomerBookingLineItem[]`.
- `bookings.controller.ts#getOne()` — CUSTOMER branch now calls `toCustomerBookingDetail()` instead of returning `detail` unchanged.
- `RequestBookingBodySchema` / `AuthenticatedBookingBodySchema` — add optional `notes` (see backend changes above).
- `BookingDetailResponse` (`bookings.types.ts`) — add `notes: string | null`.

**Acceptance criteria:**
- [ ] `GET /v1/bookings/:id` with CUSTOMER JWT (owner) → `200 CustomerBookingDetailResponse`
- [ ] `GET /v1/bookings/:id` with CUSTOMER JWT (not the owner) → `404` (via `BookingNotFoundError` — existing behavior, documented as deliberate in `get-booking.use-case.spec.ts`)
- [ ] `GET /v1/bookings/:id` with STAFF JWT → `200` (no regression to `M13-S04`)
- [ ] `infoRequestMessage` populated when booking is INFO_REQUESTED or beyond
- [ ] `afterServicePhotoUrls` non-empty only when `status === COMPLETED`
- [ ] `notes` provided at booking-request time is persisted and echoed back unchanged on `GET /v1/bookings/:id`; `null` when omitted
- [ ] `POST /v1/bookings` and `POST /v1/bookings/authenticated` both accept optional `notes` (max 1000 chars)
- [ ] New `notes` migration registered in `integration-global-setup.ts`
- [ ] Tenant isolation: `customerId` from Tenant A cannot retrieve Tenant B's bookings
- [ ] `CustomerBookingDetailResponse` in `packages/types/src/booking.dto.ts`
- [ ] `.http` block added/updated in `apps/bff/http/bookings/bookings.http` (detail endpoint + both creation endpoints' new `notes` field)

**Dependencies:** M08 (booking detail backend), M115-S01 (signed URL pattern), M07 (booking creation — `notes` field addition)

---

### M13-S08 — BFF: customer loyalty entries + redemptions ✅ Done

*(formerly M126-S06)*

**Agent:** `bff-ts` (+ a small backend addition — see "Backend changes" below)
**Complexity:** M
**Docs to load:** `docs/14-API_CONTRACTS.md` § Loyalty, `docs/24-BFF_ARCHITECTURE.md`, `plan/M10-COMPLETION-LOYALTY_IMPLEMENTATION_DETAILS_IA.md`

**Description:**
Provide the two paginated endpoints needed for the customer's full loyalty history page: earning entries and redemptions scoped to the authenticated customer.

> ✅ **Resolved during M13-S08 discovery — discover-before-starting checklist:** `GET /v1/loyalty/entries` and `GET /v1/loyalty/redemptions` already exist (`loyalty.controller.ts` in both `apps/backend` and `apps/bff`), already role-guarded `CUSTOMER`, and ownership is already correctly enforced **server-side** via `RequestContext.actorId`/`tenantId` (mirrors the already-shipped `getBalance()` pattern — no `customerId` param on the customer routes, the backend derives it from the JWT). So this story is **not** types-only: backend field names/shapes don't match the story's proposed customer types, and one proposed field (`bookingReference`) has no backing lookup at all.
>
> **Field-mapping gaps (BFF-side, no backend change needed):** backend returns `points` (entries) / `pointsRedeemed` (redemptions) / `isActive` (entries) — story's types want `pointsEarned` / `pointsUsed` / `expired` (inverted boolean: `expired = !isActive`). Add a new `loyalty.mapper.ts` (this is the second+ BFF mapping function appearing for this module, so per the BFF mapper-extraction convention it gets its own file, not inline in the controller) with `toCustomerLoyaltyEntry()` / `toCustomerLoyaltyRedemption()`.
>
> **Pagination shape correction:** the `{ items, total }` shape below (no `page`/`limit`) is the same stale-draft pattern `M13-S06` already hit and resolved for `CustomerBookingListResponse` — this story's own admin-route siblings (`getEntriesAdmin`/`getRedemptionsAdmin`) and every other list response in this codebase carry `page`/`limit`. `CustomerLoyaltyEntriesResponse`/`CustomerLoyaltyRedemptionsResponse` below now include them.
>
> **Pagination default:** keeping the existing shared `PaginationSchema` default of `limit=20` (not the `limit=50` originally noted here) — that schema is also used by the admin/balance routes, and bumping its default has wider blast radius than this story intends. The `50` was an unvalidated draft preference.
>
> ✅ **Resolved — `amountSaved` is computed from the rate stored on the redemption itself, not a live/current one.** An earlier version of this story computed `amountSaved` at **read time** using whatever `pointsPerCurrencyUnit` is *currently* configured (`REDEMPTION_CONVERSION_RATE` hardcoded to `0` in the BFF). This is a real correctness bug, not just an interim placeholder: if a tenant ever changes their rate, every *past* redemption's displayed `amountSaved` would silently get reinterpreted under the new rate, corrupting historical/audit data. The fix captures the rate **at the moment of redemption** instead:
> - `pointsPerCurrencyUnit` didn't exist anywhere in code yet (`docs/21-TENANTS_SETTINGS_SCHEMA.md` marked it "planned — see M13-S11"). Pulled in **only Part A** of `M13-S11` (the `TenantSettingsVO`/`LoyaltySettings` field itself, validated 0–10000, default 0) — not Parts B–D, which move redemption-recording to be triggered by `BookingCompleted` during booking completion; that's a separate, larger architectural change, untouched here.
> - `LoyaltyRedemption` aggregate/entity/migration gain `pointsPerCurrencyUnit: number` — a snapshot, never recomputed after the fact.
> - `LoyaltyController.recordRedemption()` (backend) reads `this.tenantContext.settings.loyalty.pointsPerCurrencyUnit` and passes it into `RedeemPointsUseCase` as a plain DTO field — **deliberately not** injecting `RequestContext` directly into the use case itself, even though that's the pattern used elsewhere (e.g. `GetBookingUseCase`). `RedeemPointsUseCase` is documented in `M13-S11`'s own plan to soon gain a second caller (`BookingCompletedHandler`, an event handler) where `RequestContext` is never populated — keeping the use case invocation-context-agnostic avoids a guaranteed rework when that lands.
> - `GetLoyaltyRedemptionsUseCase` projects the stored `pointsPerCurrencyUnit` (not an externally-supplied one); the BFF mapper computes `amountSaved` from it directly — no `conversionRate` parameter on `toCustomerLoyaltyRedemption()` at all anymore.
> - Out of scope (unchanged): the admin "edit tenant settings" endpoint still can't actually *set* `pointsPerCurrencyUnit` to a non-zero value (`update-tenant-settings.dto.ts`'s `LoyaltySchema` wasn't touched) — that's `M13-S12`'s job. Until then this is `0` everywhere, identical to today's behavior, but now structurally correct. `getBalance()`'s separate `BALANCE_DISPLAY_CONVERSION_RATE` (renamed from `REDEMPTION_CONVERSION_RATE`) is a forward-looking display rate, conceptually different from a historical redemption record, and stays hardcoded pending `M13-S12`.

> ✅ **Resolved — `bookingReference` (redemptions) gets a real backend lookup, not `null`.** `LoyaltyRedemption.bookingId` exists (nullable) but nothing resolves it to a service name today. The prototype (`plan/journey/customer/prototypes/minha-conta/04-fidelidade.html`, "Resgate — Lavagem Completa") confirms this is UX-validated, not speculative. A pickup-requiring service creates its own separate line (`docs/14-API_CONTRACTS.md`'s shared booking response example has a dedicated `"uuid-pickup"` line alongside the wash service line), so resolving only the first line would silently drop services from multi-line bookings. **The backend returns structured data, not a pre-joined display string** — joining into `", "`-separated text is a presentation decision that belongs in the BFF mapper (which already owns customer-facing shaping), not in a cross-context backend port. **Backend changes required (extends an existing cross-context port — does not create a new one, per the cross-context reuse rule):**
> - `loyalty-booking.port.ts` (`ILoyaltyBookingPort`) — add `findBookingServices(tenantId: string, bookingId: string): Promise<ServiceSummary[]>` (reuses the existing `ServiceSummary` shape from `findServicesByIds`; empty array when the booking has no lines or doesn't exist).
> - `loyalty-booking.adapter.ts` (`LoyaltyBookingAdapter`) — inject `BookingQueryService` (already exists in `apps/backend/src/contexts/booking/application/services/booking-query.service.ts`, no new service needed) alongside the existing `ServiceQueryService`; implement via `bookingQueryService.findById(bookingId, tenantId)` → `booking.lines.map(l => ({ serviceId: l.serviceId, serviceName: l.serviceNameAtBooking }))` — **all** lines, not just the first.
> - `get-loyalty-redemptions.use-case.ts` — `LoyaltyRedemptionItem.bookingReference: string | null` becomes `bookingServices: ServiceSummary[]` (empty array when no `bookingId`); the use case stays at the structured-data layer, no string formatting.
> - BFF: `loyalty.types.ts`'s `LoyaltyRedemptionItem` mirrors the backend shape (`bookingServices: LoyaltyBookingServiceSummary[]`); `loyalty.mapper.ts#toCustomerLoyaltyRedemption()` does the actual `", "` join into the customer-facing `bookingReference: string | null` — this is the only place the join happens.
>
> Note: `typeorm-booking.repository.ts`'s `lineRepo.find()` calls have no `ORDER BY`, so `Booking.lines` order is technically undefined. Considered fixing this repo-wide (it also affects line order on `M13-S04`/`M13-S06`/`M13-S07`'s detail/list views) but decided against it: no business rule depends on line order, every total is a sum (order-independent), `CompleteBookingUseCase` matches lines by `lineId` not position, and booking creation is unaffected (it returns the in-memory array before any DB round-trip). The only visible effect is purely cosmetic — two service names in a multi-line booking could swap relative display order between requests — with no functional or correctness impact and nothing in the codebase asserting a specific order. Returning the full `ServiceSummary[]` array (instead of picking "first") already fixed the one real bug (silently dropping a service); deliberately not pursuing a migration + column for the cosmetic ordering on top of that.

**`@ikaro/types` additions** (`packages/types/src/loyalty.dto.ts`):
```typescript
export interface CustomerLoyaltyEntryResponse {
  entryId: string;
  serviceName: string;
  pointsEarned: number;
  earnedAt: string; // ISO-8601
  expiresAt: string; // ISO-8601 — every entry has a real expiry, computed at earn time (corrected during implementation: LoyaltyEntry.expiresAt is never null)
  expired: boolean; // server-computed: expiresAt < now
}

export interface CustomerLoyaltyEntriesResponse {
  items: CustomerLoyaltyEntryResponse[];
  total: number;
  page: number;
  limit: number;
}

export interface CustomerLoyaltyRedemptionResponse {
  redemptionId: string;
  pointsUsed: number;
  amountSaved: string;       // formatted BRL e.g. "R$ 8,50" — computed from the redemption's own stored pointsPerCurrencyUnit, not a live rate; "R$ 0,00" today since the rate can't be set to non-zero via the API yet (M13-S12)
  redeemedAt: string;        // ISO-8601
  bookingReference: string | null; // e.g. "Lavagem Completa" — BFF-mapper joins all of the booking's services with ", "; null if no bookingId
}

export interface CustomerLoyaltyRedemptionsResponse {
  items: CustomerLoyaltyRedemptionResponse[];
  total: number;
  page: number;
  limit: number;
}
```

**BFF changes:**
- New `apps/bff/src/loyalty/loyalty.mapper.ts` — `toCustomerLoyaltyEntry()` (renames `points`→`pointsEarned`, inverts `isActive`→`expired`) and `toCustomerLoyaltyRedemption()` (renames `pointsRedeemed`→`pointsUsed`, formats `amountSaved`, joins `bookingServices[].serviceName` with `", "` into `bookingReference`).
- `loyalty.controller.ts#getEntries()`/`getRedemptions()` — wire the new mappers; response now includes `page`/`limit` (already known from the validated query, same pattern as `bookings.controller.ts#list()`).

**Backend changes:** see the resolved `bookingReference` and `amountSaved` callouts above.

**Acceptance criteria:**
- [ ] `GET /v1/loyalty/entries` with CUSTOMER JWT → only that customer's entries for the tenant, mapped to `CustomerLoyaltyEntryResponse` (`pointsEarned`, `expired`)
- [ ] `GET /v1/loyalty/redemptions` with CUSTOMER JWT → only that customer's redemptions, mapped to `CustomerLoyaltyRedemptionResponse` (`pointsUsed`, `amountSaved`, `bookingReference`)
- [ ] Entries include `expired: true` when `expiresAt < now`
- [ ] Redemptions with a `bookingId` resolve `bookingReference` to all of that booking's line service names joined with `", "` (not just the first line); redemptions with no `bookingId` → `bookingReference: null`
- [ ] `POST /v1/loyalty/redeem` captures `tenants.settings.loyalty.pointsPerCurrencyUnit` at the moment of redemption and persists it on the `LoyaltyRedemption` row; `GET /v1/loyalty/redemptions` computes `amountSaved` from that stored value, not a live setting
- [ ] Tenant isolation: Customer A cannot retrieve Customer B's entries or redemptions
- [ ] STAFF JWT on these endpoints still works (no regression to the existing admin routes)
- [ ] Response includes `page`/`limit` alongside `items`/`total`
- [ ] Types in `packages/types/`
- [ ] `.http` blocks updated in `apps/bff/http/loyalty/loyalty.http`

**Dependencies:** M10 (loyalty entries + redemptions backend), M13-S11 Part A only (`pointsPerCurrencyUnit` on `TenantSettingsVO` — pulled in here; Parts B–D remain M13-S11's own scope)

---

### M13-S09 — Backend: add `GET /tenants/settings` ✅ Done

*(formerly M127-S01)*

**Agent:** `backend-ts`
**Complexity:** S
**Docs to load:** `docs/21-TENANTS_SETTINGS_SCHEMA.md`, `docs/02-DOMAIN_MODEL.md` (Tenant aggregate), `docs/04-USE_CASES.md` § UC-026

**Description:**
Add a read endpoint for tenant settings. Today the only way to read `tenants.settings` is the internal `GET /internal/tenants/:tenantId` route (gated by `InternalApiGuard` + `X-Internal-Key` — wrong audience for a `MANAGER`-authenticated dashboard request). This story adds a tenant-scoped, `MANAGER`-guarded GET mirroring the existing `PATCH`'s shape, so the settings form has something to load before editing.

> 🔍 **Discover before starting:** Read `apps/backend/src/contexts/platform/infrastructure/controllers/tenant-settings.controller.ts` in full. Confirm the exact guard class used by `PATCH` (expected: `ManagerRoleGuard`) and which repository/use case it calls — the new GET use case should reuse the same repository load, not duplicate mapping logic. Check whether the repository already exposes a `findById`/`findByTenantId` that returns the full `TenantSettingsProps` VO; if so this story is a thin read wrapper, not new persistence code.

> ✅ **Resolved during discovery:** `GetTenantByIdUseCase` (`application/use-cases/get-tenant-by-id.use-case.ts`) already performs exactly this read — `findById(tenantId)` → `{ id, slug, name, settings }` — and is already exported from `PlatformModule` (it backs today's `GET /internal/tenants/:tenantId` route and three cross-context adapters: `PlatformTenantSettingsAdapter`, `LoyaltyPlatformAdapter`, `NotificationPlatformAdapter`). No new use case — inject the existing `GetTenantByIdUseCase` into `TenantSettingsController` instead of duplicating its logic. Its result key is `id`, not `tenantId`; the controller renames it inline (`{ tenantId: result.id, name: result.name, slug: result.slug, settings: result.settings }`) so this controller's GET and PATCH responses stay consistent.
>
> ✅ **Resolved during implementation — `name`/`slug` split out of "settings":** `name` and `slug` are separate plain `varchar` columns on `tenants` (`tenant.entity.ts`), structurally independent of the `settings` `jsonb` column — `PATCH /tenants/settings` accepting `name` in its body (pre-existing, not introduced by this story) conflated the two. Fixed as part of this story: `name` updates moved to a new `PATCH /tenants` route on a new `TenantController` (own `RenameTenantUseCase`/`RenameTenantDto`/`RenameTenantSchema`, own `.http` file `apps/backend/http/platform/tenant.http`). `UpdateTenantSettingsSchema`/`UpdateTenantSettingsUseCase` no longer accept/handle `name` — `settings` is now the only (required) body field. `GET /tenants/settings` is **unchanged** — it still returns the combined `{ tenantId, name, slug, settings }` read, since a GET naturally including read-only identity context alongside the JSONB settings isn't the same mismatch as a PATCH silently accepting a non-setting field. This ripples into `M13-S10` below — see its note.
>
> Also corrected during implementation: "No auth → `401`" below doesn't hold — `ManagerRoleGuard` (`shared/guards/manager-role.guard.ts`) throws `403` for *any* non-`MANAGER` role, including a fully absent `X-Actor-Role` header; there is no 401 path on this guard. 401s in this codebase are exclusive to `InternalApiGuard`/`PlatformAdminGuard` on `/internal/*` routes. Verified with a dedicated integration test (absent `X-Actor-Role` → `403`).

**What to create:**
- New route on `tenant-settings.controller.ts`: `GET tenants/settings`, `@UseGuards(ManagerRoleGuard)` (controller-level guard already in place), scoped via `RequestContext.tenantId` (not `X-Internal-Key`/path param) — injects the existing `GetTenantByIdUseCase`
- New `TenantController` (`tenant.controller.ts`): `PATCH tenants`, `@UseGuards(ManagerRoleGuard)`, renames the tenant only (`RenameTenantUseCase`)
- `.http` request blocks in `apps/backend/http/platform/tenant-settings.http` (GET) and `apps/backend/http/platform/tenant.http` (new — rename)

**Acceptance criteria:**
- [ ] `GET /tenants/settings` with `MANAGER` role returns `{ tenantId, name, slug, settings }` — `settings` fields stay snake_case, matching `PATCH`'s existing shape exactly
- [ ] `STAFF` role → `403`
- [ ] No separate-role/no-`X-Actor-Role` request → `403` (not `401` — see resolved note above)
- [ ] Tenant isolation: returns only the requesting tenant's settings (dedicated integration test, per CLAUDE.md §7)
- [ ] Unit + integration test for the new use case
- [ ] `.http` block added in the same commit
- [ ] `PATCH /tenants/settings` no longer accepts `name` (moved to new `PATCH /tenants`); `settings` is now required
- [ ] New `PATCH /tenants` (rename-only) has its own unit + integration + tenant-isolation tests and `.http` block

**Dependencies:** M02

---

### M13-S10 — BFF: proxy `GET`/`PATCH /tenants/settings` + `PATCH /tenants` (camelCase translation layer) ✅ Done

*(formerly M127-S02)*

**Agent:** `bff-ts`
**Complexity:** M
**Docs to load:** `docs/24-BFF_ARCHITECTURE.md`, `docs/14-API_CONTRACTS.md`

**Description:**
Add the BFF module surface that doesn't exist today. At the time this story was drafted, the backend spoke snake_case (`cancellation_window_hours`, `business_hours.monday`, …) while everything `apps/web` consumes elsewhere speaks camelCase — this story was originally the translation layer. Mid-implementation, the backend's `tenants.settings` JSONB was itself normalized to camelCase end-to-end (see the resolved-during-implementation note below), which removed the need for a translation layer entirely — the BFF controller is a thin passthrough, not a mapper.

> ⚠️ **Backend contract changed since this story was drafted (M13-S09):** the backend split tenant identity from settings — `PATCH /tenants` (rename only, `RenameTenantUseCase`/`TenantController`) and `PATCH /tenants/settings` (settings only, no longer accepts `name`). The BFF mirrors this split 1:1 instead of re-combining it into one orchestrated endpoint: **two independent BFF controllers**, each a thin proxy to its one backend counterpart. No fan-out, no multi-call orchestration, no partial-failure semantics to design — each BFF endpoint maps 1:1 to one backend endpoint. If the frontend's settings form needs to save both a renamed tenant and changed settings in one "Salvar" click, that sequencing happens client-side (two API calls), not inside the BFF. `GET /tenants/settings` is unaffected either way — the backend's GET already returns the combined `{ tenantId, name, slug, settings }` shape.
>
> ✅ **Resolved during discovery:** `packages/types/src/tenant.dto.ts`'s existing `TenantSettings`/`UpdateTenantSettingsRequest`/`BusinessHours` are stale placeholders with **zero consumers** anywhere in `apps/bff`/`apps/web` (confirmed by grep) — `loyalty` has 1 of 5 real backend fields, `booking` has 2 of 6, the per-day-hours shape uses `{open,close,closed:boolean}` instead of backend's nullable `{open,close}|null`, and `businessInfo`/`notification` are missing entirely. Safe to fully replace, not merge — see the corrected shapes below. Read `apps/bff/src/platform/hotsite-admin.controller.ts` and `platform.module.ts` to copy the exact registration pattern for new controllers in the same module (per CLAUDE.md's BFF naming rule — this belongs in the `platform` module, not a new one).
>
> ✅ **Resolved during implementation — backend normalized to camelCase too:** after this story shipped its first version (snake_case↔camelCase mapper in `tenant-settings.mapper.ts`), the backend's `TenantSettingsProps`/`update-tenant-settings.dto.ts` were themselves normalized from snake_case to camelCase (no DB migration needed — `tenants.settings` is a plain `jsonb` column with no transformer; local dev DB dropped and reseeded since there's no production data). This made the BFF's translation layer dead code — `tenant-settings.mapper.ts`/`tenant-settings.types.ts` were deleted; `TenantSettingsController` now types its `BackendHttpService` calls directly against `@ikaro/types`, matching the `services`/`customers`/`staff` controller pattern. Backend's GET/PATCH response is `{ tenantId, name, slug, settings: TenantSettings }` (nested under `settings`, not flattened) — `TenantSettingsResponse` must mirror that nesting, not `extend TenantSettings` directly. `UpdateTenantSettingsRequest.settings` is a hand-written per-category partial type (not `Partial<TenantSettings>` or a blind recursive `DeepPartial`) — see `docs/ENGINEERING_RULES.md` § Partial-update types for deeply-nested Zod schemas for why; it also deliberately omits `notification`, since neither backend nor BFF accept it for writes.

**What to create:**

`apps/bff/src/platform/tenant-settings.controller.ts`:
```
GET   tenants/settings   @Roles('MANAGER')  -> thin passthrough: backendHttp.get<TenantSettingsResponse>('/tenants/settings')
PATCH tenants/settings   @Roles('MANAGER')  -> validates UpdateTenantSettingsBodySchema (Zod, camelCase, settings required, .strict()); forwards the validated body as-is to backendHttp.patch<TenantSettingsResponse>('/tenants/settings', body)
```

`apps/bff/src/platform/tenant.controller.ts`:
```
PATCH tenants            @Roles('MANAGER')  -> validates RenameTenantRequest (Zod, { name: string }); calls backend PATCH /tenants, returns RenameTenantResponse
```

Register both controllers in `apps/bff/src/platform/platform.module.ts` alongside `HotsiteAdminController`.

`packages/types/src/tenant.dto.ts` — replace `TenantSettings`/`UpdateTenantSettingsRequest`/`BusinessHours` with a full nested mirror of the backend's `TenantSettingsProps` (`tenant-settings.vo.ts`) for the **read** side (including fields not yet editable via this form, e.g. `pointsPerCurrencyUnit`, `notificationMinPoints`, `localization`, `notification.fromEmail` — GET should reflect full truth even where PATCH doesn't cover it yet); the per-day-hours type is renamed `TenantDayHours` since the old `BusinessHours` name was actually describing one day, not the week. `UpdateTenantSettingsRequest` now mirrors backend's settings-only PATCH exactly — `settings` required, no `name` field (that moved to a separate `RenameTenantRequest`):
```typescript
export interface TenantDayHours {
  open: string;
  close: string;
}

export interface TenantBusinessHours {
  timezone: string;
  monday: TenantDayHours | null;
  tuesday: TenantDayHours | null;
  wednesday: TenantDayHours | null;
  thursday: TenantDayHours | null;
  friday: TenantDayHours | null;
  saturday: TenantDayHours | null;
  sunday: TenantDayHours | null;
}

export interface TenantLoyaltySettings {
  expiryDays: number;
  enableNotifications: boolean;
  expiryWarningDays: number;
  notificationMinPoints: number;
  pointsPerCurrencyUnit: number;
}

export interface TenantBookingSettings {
  cancellationWindowHours: number;
  autoApproveEnabled: boolean;
  minBookingAdvanceHours: number;
  maxBookingAdvanceDays: number;
  serviceBufferMinutes: number;
  slotGranularityMinutes: 15 | 30 | 60;
}

export interface TenantLocalizationSettings {
  countryCode: string;
  currency: string;
  currencySymbol?: string;
  language: string;
  decimalPlaces: number;
}

export interface TenantBusinessInfoAddress {
  street: string | null;
  number: string | null;
  complement?: string;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
}

export interface TenantSocialLinks {
  whatsapp: string | null;
  instagram: string | null;
  facebook: string | null;
}

export interface TenantBusinessInfo {
  phone: string | null;
  email: string | null;
  address: TenantBusinessInfoAddress | null;
  socialLinks: TenantSocialLinks | null;
}

export interface TenantNotificationSettings {
  fromEmail: string | null;
}

export interface TenantSettings {
  loyalty: TenantLoyaltySettings;
  booking: TenantBookingSettings;
  businessHours: TenantBusinessHours;
  localization: TenantLocalizationSettings;
  notification?: TenantNotificationSettings;
  businessInfo?: TenantBusinessInfo;
}

export interface TenantSettingsResponse {
  tenantId: string;
  name: string;
  slug: string;
  settings: TenantSettings;
}

export interface UpdateTenantSettingsRequest {
  settings: {
    loyalty?: Partial<TenantLoyaltySettings>;
    booking?: Partial<TenantBookingSettings>;
    businessHours?: Partial<TenantBusinessHours>;
    localization?: Partial<TenantLocalizationSettings>;
    businessInfo?: {
      phone?: string | null;
      email?: string | null;
      address?: Partial<TenantBusinessInfoAddress> | null;
      socialLinks?: Partial<TenantSocialLinks> | null;
    };
  };
}

export interface RenameTenantRequest {
  name: string;
}

export interface RenameTenantResponse {
  tenantId: string;
  name: string;
}
```

Note: `M13-S12`'s plan already expects to "extend `UpdateTenantSettingsRequest` with `pointsPerCurrencyUnit`" — `settings.loyalty` above is already `Partial<TenantLoyaltySettings>`, which includes `pointsPerCurrencyUnit`, so it's already supported by construction; `M13-S12` likely needs no DTO change at all, only confirm during that story's own discovery.

`.http` blocks in `apps/bff/http/platform/tenant-settings.http` and `apps/bff/http/platform/tenant.http`.

**Acceptance criteria:**
- [ ] `GET /tenants/settings` (BFF) returns camelCase fields matching `TenantSettingsResponse` exactly, including categories not yet editable via PATCH (e.g. `localization`, `notification`)
- [ ] `PATCH /tenants/settings` (BFF) accepts a camelCase body with a required `settings` field and correctly maps every category — including nested per-day `businessHours` objects — to the backend's snake_case DTO
- [ ] `PATCH /tenants` (BFF) accepts `{ name: string }` and proxies directly to backend `PATCH /tenants`, returning `RenameTenantResponse`
- [ ] `STAFF` JWT → `403`; no auth → `401` (both endpoints)
- [ ] Backend `422`/`400`/`409` is forwarded as an RFC 9457 Problem Detail, not swallowed or remapped to a generic 500 (both endpoints)
- [ ] Round-trip integration test: `PATCH /tenants/settings` a field, then `GET /tenants/settings`, confirms the persisted value comes back correctly mapped
- [ ] `.http` blocks added for all three routes
- [ ] `tsc --noEmit` passes across the monorepo (the `packages/types` change touches multiple consumers)

**Dependencies:** M13-S09

---

### M13-S11 — Backend: `pointsPerCurrencyUnit` + `discountByPoints` in booking completion ✅ Done

*(formerly M128-S01)*

**Agent:** `backend-ts`
**Complexity:** M
**Docs to load:** `docs/21-TENANTS_SETTINGS_SCHEMA.md` §1, `docs/04-USE_CASES.md` § UC-009 A6, `docs/ENGINEERING_RULES.md`, `plan/M10-COMPLETION-LOYALTY_IMPLEMENTATION_DETAILS_IA.md`

**Description:**
Three targeted additions across two bounded contexts. No new use cases in the booking context — Part B extends `CompleteBookingUseCase`. The loyalty context gets one new use case (Part C) so the event handler can keep calling exactly one use case.

> 🔍 **Discover before starting:**
> - Read `apps/backend/src/contexts/platform/domain/value-objects/tenant-settings.vo.ts` in full — confirm `LoyaltySettings` interface and Zod schema location.
> - Read `apps/backend/src/contexts/booking/application/dtos/complete-booking.dto.ts` and `apps/backend/src/contexts/booking/domain/booking.aggregate.ts` `complete()` method — understand how `totalActualPrice` is currently computed (it's `Money`-VO based, not raw-number arithmetic — `Money` has no `subtract()` today, see Part B).
> - Read `apps/backend/src/contexts/loyalty/infrastructure/events/booking-completed.handler.ts` — understand the existing earning entry flow before extending it.
> - Read `apps/backend/src/contexts/loyalty/application/use-cases/redeem-points/redeem-points.use-case.ts` — this is the **existing standalone** redemption use case (`RedeemPointsUseCase`), used only by the `POST /loyalty/redeem` admin endpoint. Do not call it, extend it, or compose it from the new booking-completion flow — see the architecture decision below for why.
> - Read `apps/backend/src/contexts/loyalty/application/ports/loyalty-platform.port.ts` and `infrastructure/cross-context/loyalty-platform.adapter.ts` — `LoyaltyTenantSettings` currently only exposes `expiryDays`/`notificationMinPoints`; it needs `pointsPerCurrencyUnit` added, because event handlers can't read `RequestContext` (unlike the `POST /loyalty/redeem` controller, which sources the rate from `RequestContext.settings.loyalty.pointsPerCurrencyUnit`).
>
> **Architecture decision — redemption via event (not BFF orchestration):** The redemption is triggered by the existing `BookingCompleted` domain event, not by the BFF calling `POST /v1/loyalty/redeem` as a second HTTP call. This keeps the BFF thin (one call: `PATCH /complete`) and the redemption idempotent (dedup via `processed_events`). The BFF's `POST /v1/loyalty/redeem` route is unaffected — it keeps serving its existing use case (standalone manual admin redemption, unrelated to booking completion).
>
> **Architecture decision — one self-contained use case, not a use case calling other use cases:** an earlier draft of this story had a new orchestrating use case calling `RecordLoyaltyEntriesUseCase` and `RedeemPointsUseCase` in sequence, each managing its own transaction, glued together with an idempotency check threaded through both. That shape has a real atomicity hole: if the process crashes between the redemption write and marking it processed, a retry double-redeems, because the two writes are in separate transactions. The fix is structural, not parametric — a use case should not orchestrate other use cases that each own their own transaction boundary. The single reaction to `BookingCompleted` is `CompleteBookingLoyaltyEffectsUseCase`: fully self-contained, with the earn-points logic inlined directly (no separate `RecordLoyaltyEntriesUseCase` — delete it, it had no other caller), one idempotency check against the event's `eventId`, and one `txManager.run()` covering entries, balance, the optional redemption, and the processed marker together. `RedeemPointsUseCase` is untouched and keeps serving only the standalone admin endpoint.

---

#### Part A — `pointsPerCurrencyUnit` in `TenantSettingsVO`

> ✅ **Already implemented — landed via `M13-S08`.** `GetLoyaltyRedemptionsUseCase`'s `amountSaved` computation needed this field early (to capture the rate at redemption time rather than recomputing from a live setting later — see `M13-S08`'s resolved `amountSaved` callout), so Part A below was pulled forward. The interface field, Zod schema entry, default, validation, and the prescribed `tenant-settings.spec.ts` test cases are all in place on `main` already — **do not redo them**. Parts B–D (booking-completion-triggered redemption via `BookingCompleted`/`BookingCompletedHandler`) remain this story's own scope, untouched by `M13-S08`. Note: the admin-editable `PATCH /tenants/settings` endpoint (`update-tenant-settings.dto.ts`'s `LoyaltySchema`) was deliberately **not** touched by `M13-S08` — the "Add to the Zod loyalty schema" instruction below refers to *that* file, not `tenant-settings.vo.ts` (which has no Zod schema, only plain `PlatformDomainError` validation) — confirm during this story's own discovery whether `M13-S12` already covers it before duplicating.

**File:** `apps/backend/src/contexts/platform/domain/value-objects/tenant-settings.vo.ts`

Add to `LoyaltySettings` interface:
```typescript
pointsPerCurrencyUnit: number; // 0 = redemption disabled; e.g. 10 = 10 pts → 1 currency unit
```

Add to the Zod loyalty schema:
```typescript
pointsPerCurrencyUnit: z.number().int().min(0).max(10000).default(0),
```

Add to `TenantSettingsDefaults.loyalty`:
```typescript
pointsPerCurrencyUnit: 0,
```

**Tests:** Update `apps/backend/src/contexts/platform/domain/value-objects/tenant-settings.spec.ts` — add cases: valid `pointsPerCurrencyUnit = 10`, zero (disabled), boundary 10000, reject negative, reject > 10000.

---

#### Part B — `discountByPoints` in `CompleteBookingDto` + `Booking.complete()`

**File:** `apps/backend/src/contexts/booking/application/dtos/complete-booking.dto.ts`

Add optional field to `CompleteBookingBodySchema`:
```typescript
discountByPoints: z
  .object({
    pointsUsed: z.number().int().positive(),
    amountDeducted: z.number().positive(),
  })
  .optional(),
```

Add to `CompleteBookingDto`:
```typescript
discountByPoints?: { pointsUsed: number; amountDeducted: number };
```

**Validation in use case** (`CompleteBookingUseCase`):
- If `dto.discountByPoints` is present AND `booking.customerId` is null → throw `BookingDiscountNotAvailableError` (guest bookings cannot redeem points)
- If `dto.discountByPoints` is present AND `settings.loyalty.pointsPerCurrencyUnit === 0` → throw `BookingDiscountDisabledError`
- `amountDeducted` must equal `Math.floor(pointsUsed / pointsPerCurrencyUnit)` within ±0.01 → throw `BookingDiscountMismatchError` if it doesn't reconcile (prevents frontend manipulation)
- `amountDeducted` must not exceed the lines total (`SUM(lines[].actualPriceCharged)`) → throw `BookingDiscountExceedsTotalError` if it does (this check can live here or inside `Booking.complete()` — see below)
- Cap check: `pointsUsed <= currentBalance` is enforced by `RedeemPointsUseCase` (loyalty context, via `LoyaltyBalance.decrement()` → `LoyaltyInsufficientPointsError`) — do not duplicate here

**`Money` VO addition** (`apps/backend/src/shared/value-objects/money.ts`):
`Money` currently only has `add()` — no `subtract()`. Add one, mirroring `add()`'s currency-mismatch guard:

```typescript
subtract(other: Money): Money {
  if (this.currency !== other.currency) {
    throw new Error(`Cannot subtract ${other.currency} from ${this.currency}`);
  }
  return Money.from(this.amount.minus(other.amount), this.currency);
}
```

**`Booking.complete()` signature update** (`booking.aggregate.ts`):

```typescript
complete(
  staffId: string,
  lineActualPrices: Map<string, Money>,
  afterPhotos: string[],
  correlationId: string,
  adminNotes?: string,
  discountByPoints?: { pointsUsed: number; amountDeducted: number },
): void
```

`totalActualPrice` calculation — builds on the existing `Money`-based reduce, then applies the discount via `subtract()`:

```typescript
const linesTotal = this.props.lines.reduce(
  (sum, l) => sum.add(l.actualPriceCharged!),
  Money.zero(this.props.totalPrice.currency),
);

let totalActualPrice = linesTotal;
let discountAmount: Money | null = null;
if (discountByPoints) {
  discountAmount = Money.from(discountByPoints.amountDeducted, this.props.totalPrice.currency);
  if (discountAmount.isGreaterThan(linesTotal)) throw new BookingDiscountExceedsTotalError();
  totalActualPrice = linesTotal.subtract(discountAmount);
}

this.props.totalActualPrice = totalActualPrice;
this.props.discountPointsUsed = discountByPoints?.pointsUsed ?? null;
this.props.discountAmount = discountAmount;
```

**New migration** — add two nullable columns to `booking.bookings` (register in `integration-global-setup.ts` in the same commit):

```sql
ALTER TABLE booking.bookings
  ADD COLUMN discount_points_used INTEGER,
  ADD COLUMN discount_amount NUMERIC(10,2);
```

Both set once at completion alongside `total_actual_price_amount`; remain `NULL` when no discount was applied.

**`booking.entity.ts` + `typeorm-booking.repository.ts`:** add `discountPointsUsed`/`discountAmount` columns and map them in `toDomain()`/`toEntity()`.

**New booking-domain errors** (`apps/backend/src/contexts/booking/domain/errors/booking-domain.error.ts`, all extend `BookingDomainError` — matching every other error in this file; none of these are loyalty-context errors even though they're about a loyalty-adjacent concept, since they're thrown from booking's own use case):

- `BookingDiscountNotAvailableError` — discount attempted on a guest booking
- `BookingDiscountDisabledError` — `pointsPerCurrencyUnit === 0`
- `BookingDiscountMismatchError` — `amountDeducted` doesn't reconcile with `pointsUsed / pointsPerCurrencyUnit`
- `BookingDiscountExceedsTotalError` — `amountDeducted` exceeds the lines total

Add an `instanceof` branch for each to `booking-error.mapper.ts` (→ `422`).

---

#### Part C — `discountByPoints` in `BookingCompleted` event + new loyalty use case

**File:** `apps/backend/src/contexts/booking/domain/events/booking-completed.event.ts`

Add to `BookingCompletedData`:
```typescript
discountByPoints?: { pointsUsed: number; amountDeducted: { amount: string; currency: string } };
```

The `Booking.complete()` method already publishes `BookingCompleted` — update it to include `discountByPoints` in the event data when present.

**File:** `apps/backend/src/contexts/loyalty/application/ports/loyalty-platform.port.ts` + `infrastructure/cross-context/loyalty-platform.adapter.ts`

Add `pointsPerCurrencyUnit: number` to `LoyaltyTenantSettings`, mapped from `result.settings.loyalty.pointsPerCurrencyUnit` in the adapter (default `0` in the existing catch-block fallback, matching `expiryDays`/`notificationMinPoints`).

**New file:** `apps/backend/src/contexts/loyalty/application/use-cases/complete-booking-loyalty-effects/complete-booking-loyalty-effects.use-case.ts`

The single, self-contained reaction to `BookingCompleted`. No calls to other use cases — earning logic is inlined directly (the old `RecordLoyaltyEntriesUseCase` is deleted; it had no other caller), and the optional redemption is inlined too rather than calling `RedeemPointsUseCase`. One idempotency check against the event's `eventId`, one `txManager.run()` covering every write:

```typescript
@Injectable()
export class CompleteBookingLoyaltyEffectsUseCase {
  static readonly CONSUMER_NAME = 'COMPLETE_BOOKING_LOYALTY_EFFECTS';

  constructor(
    @Inject(LOYALTY_ENTRY_REPOSITORY) private readonly entryRepo: ILoyaltyEntryRepository,
    @Inject(LOYALTY_BALANCE_REPOSITORY) private readonly balanceRepo: ILoyaltyBalanceRepository,
    @Inject(LOYALTY_REDEMPTION_REPOSITORY) private readonly redemptionRepo: ILoyaltyRedemptionRepository,
    @Inject(PROCESSED_EVENT_REPOSITORY) private readonly processedEventRepo: IProcessedEventRepository,
    @Inject(LOYALTY_PLATFORM_PORT) private readonly tenantSettingsPort: ILoyaltyPlatformPort,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(dto: CompleteBookingLoyaltyEffectsDto): Promise<CompleteBookingLoyaltyEffectsResult> {
    if (dto.customerId === null) return SKIPPED_RESULT;

    const alreadyProcessed = await this.processedEventRepo.hasBeenProcessed(
      dto.eventId,
      CompleteBookingLoyaltyEffectsUseCase.CONSUMER_NAME,
    );
    if (alreadyProcessed) return SKIPPED_RESULT;

    const { expiryDays, pointsPerCurrencyUnit } = await this.tenantSettingsPort.getLoyaltySettings(dto.tenantId);
    const totalPointsEarned = dto.lines.reduce((sum, l) => sum + l.pointsValueAtBooking, 0);
    const pointsRedeemed = dto.discountByPoints?.pointsUsed ?? 0;

    const balance =
      (await this.balanceRepo.findByCustomer(dto.tenantId, dto.customerId)) ??
      LoyaltyBalance.create(dto.tenantId, dto.customerId);

    const entries = dto.lines.map((line) => LoyaltyEntry.record({ /* ... */ expiryDays }));
    balance.increment(totalPointsEarned);

    let redemption: LoyaltyRedemption | null = null;
    if (pointsRedeemed > 0) {
      balance.decrement(pointsRedeemed); // throws LoyaltyInsufficientPointsError if balance too low
      redemption = LoyaltyRedemption.record({ /* ... */ pointsPerCurrencyUnit, redeemedBy: dto.completedBy });
    }

    await this.txManager.run(async () => {
      for (const entry of entries) await this.entryRepo.save(entry);
      await this.balanceRepo.upsert(balance);
      if (redemption) await this.redemptionRepo.save(redemption);
      await this.processedEventRepo.markProcessed(dto.eventId, CompleteBookingLoyaltyEffectsUseCase.CONSUMER_NAME);
    });

    await this.eventBus.publish(new ServicePointsEarned(/* ... */));
    return { skipped: false, entriesCreated: entries.length, totalPointsEarned, pointsRedeemed };
  }
}
```

**File:** `apps/backend/src/contexts/loyalty/infrastructure/events/booking-completed.handler.ts`

Update `handle()` to call `CompleteBookingLoyaltyEffectsUseCase.execute(...)` — passing `completedBy: event.data.completedBy` and `discountByPoints: event.data.discountByPoints` alongside the existing fields. The handler still calls exactly one use case.

Register `CompleteBookingLoyaltyEffectsUseCase` in `LoyaltyModule` providers. Delete `RecordLoyaltyEntriesUseCase` and its spec entirely.

> **Idempotency note:** earning and redemption commit in the **same** transaction, deduplicated via **one** `processed_events` row keyed by `(eventId, CompleteBookingLoyaltyEffectsUseCase.CONSUMER_NAME)`. There is no separate redemption-side idempotency key — a nack/retry of the whole event either re-runs everything (if the transaction never committed) or skips everything (if it did), never a partial double-write.

---

**HTTP file** (`apps/backend/http/booking/bookings.http`):
Update the `PATCH /bookings/:id/complete` request block to include an example with `discountByPoints`.

**Acceptance criteria:**
- [ ] `TenantSettingsVO` accepts and validates `loyalty.pointsPerCurrencyUnit` (0–10000, default 0) — already covered by M13-S08; confirm tests still pass
- [ ] `PATCH /bookings/:id/complete` with `discountByPoints` → `totalActualPrice = linesTotal - amountDeducted`; `discount_points_used`/`discount_amount` persisted on the booking
- [ ] `PATCH /bookings/:id/complete` with `discountByPoints` on a guest booking → `422` with `booking-discount-not-available`
- [ ] `PATCH /bookings/:id/complete` when `pointsPerCurrencyUnit = 0` → `422` with `booking-discount-disabled`
- [ ] `PATCH /bookings/:id/complete` when `amountDeducted` doesn't reconcile with `pointsUsed/pointsPerCurrencyUnit` → `422` with `booking-discount-mismatch`
- [ ] `PATCH /bookings/:id/complete` when `amountDeducted` exceeds the lines total → `422` with `booking-discount-exceeds-total`
- [ ] `BookingCompleted` event carries `discountByPoints` when present
- [ ] `CompleteBookingLoyaltyEffectsUseCase` always records earning entries and only redeems when `discountByPoints` is present, in one self-contained transaction
- [ ] Redemption is idempotent — replaying the event does not create a duplicate `LoyaltyRedemption` or double-decrement the balance (one idempotency check covers both earning and redemption together)
- [ ] Unit tests for `Booking.complete()` with and without `discountByPoints`, and for `Money.subtract()`
- [ ] Integration test: complete booking with discount → loyalty balance decremented by `pointsUsed`; booking's `discount_points_used`/`discount_amount` persisted
- [ ] Integration test: tenant isolation — cannot apply discount to another tenant's customer
- [ ] New migration registered in `integration-global-setup.ts`

**Dependencies:** M10

---

### M13-S12 — BFF: customer search + balance enrichment + complete body update ✅ Done

*(formerly M128-S02)*

**Agent:** `bff-ts`
**Complexity:** M
**Docs to load:** `docs/24-BFF_ARCHITECTURE.md`, `docs/14-API_CONTRACTS.md`

**Description:**
Three additions to the BFF: a new staff-facing customer search endpoint, enriching the loyalty balance response with the conversion rate, and forwarding `discountByPoints` through the booking completion body. Also fixes the stale `@ikaro/types` loyalty shapes.

> 🔍 **Discover before starting:**
> - Read `apps/bff/src/customers/customers.controller.ts` — confirm there is no `STAFF|MANAGER`-accessible GET route yet. The only routes are `GET /me` and `PATCH /me` (CUSTOMER-only).
> - Check `apps/backend/src/contexts/customer/infrastructure/` for an existing staff-facing customer list/search endpoint. If it exists (`GET /customers?search=`), the BFF just proxies it. If not, this story adds it to the backend as a thin read — check the customer controller in the backend too.
> - Read `apps/bff/src/loyalty/loyalty.types.ts` — confirm `LoyaltyBalanceResponse` shape.
> - Confirm `pointsPerCurrencyUnit` is accessible from `TenantContext` in the BFF after `M13-S11` ships.

---

#### Part A — Customer search endpoint

Add to `apps/bff/src/customers/customers.controller.ts`:

```typescript
@Get()
@Roles('STAFF', 'MANAGER')
searchCustomers(
  @Query('search') search: string,
  @Query('limit') limit?: string,
): Promise<CustomerSearchListResponse> {
  const params = new URLSearchParams({ search });
  if (limit) params.set('limit', limit);
  return this.backendHttp.get<CustomerSearchListResponse>(`/customers?${params}`);
}
```

If the backend `GET /customers` endpoint does not exist, add it in the same commit:
- Backend: `apps/backend/src/contexts/customer/infrastructure/controllers/customer.controller.ts`
- Route: `GET /customers?search=&limit=20`
- Guard: `StaffOrManagerRoleGuard`
- Query: `ILIKE %search%` on `name` + `email`, scoped to `tenantId`, returns `{ customerId, name, email, currentPoints }`
- `currentPoints` requires joining `loyalty_balances` — or calling `ILoyaltyBalanceRepository.findByCustomer()` per result (N+1 acceptable at limit=20 for MVP). Use port, not direct join.

`@ikaro/types` additions (`packages/types/src/customer.dto.ts` or new file):
```typescript
export interface CustomerSearchResult {
  readonly customerId: string;
  readonly name: string;
  readonly email: string;
  readonly currentPoints: number;
}

export interface CustomerSearchListResponse {
  readonly items: CustomerSearchResult[];
  readonly total: number;
}
```

---

#### Part B — Balance response enrichment

Update `apps/bff/src/loyalty/loyalty.controller.ts` `getBalanceAdmin()` (and `getBalance()` for the customer-facing route — feeds `M13-S06`'s `conversionRate` field too):

After fetching balance from backend, read `pointsPerCurrencyUnit` from tenant context and append it:

```typescript
@Get('customers/:customerId/loyalty/balance')
@Roles('MANAGER', 'STAFF')
async getBalanceAdmin(
  @Param('customerId', ParseUUIDPipe) customerId: string,
): Promise<EnrichedLoyaltyBalanceResponse> {
  const balance = await this.backendHttp.get<LoyaltyBalanceResponse>(
    `/customers/${customerId}/loyalty/balance`,
  );
  return {
    ...balance,
    conversionRate: this.tenantContext.settings.loyalty.pointsPerCurrencyUnit,
  };
}
```

Similarly enrich `getBalance()` (customer-own route) — `M13-S06`'s loyalty strip and `M13-S29`'s Fidelidade page both need `conversionRate` there too.

`@ikaro/types` — fix and extend (`packages/types/src/loyalty.dto.ts`):
```typescript
// Replace the stale LoyaltyBalanceResponse:
export interface LoyaltyBalanceResponse {
  readonly currentPoints: number;
  readonly nextExpiryDate: string | null;   // ISO-8601
  readonly nextExpiryPoints: number | null;
}

export interface EnrichedLoyaltyBalanceResponse extends LoyaltyBalanceResponse {
  readonly conversionRate: number; // pointsPerCurrencyUnit; 0 = redemption disabled
}

// Replace the stale LoyaltyEntryResponse:
export interface LoyaltyEntryItem {
  readonly id: string;
  readonly serviceName: string;
  readonly points: number;
  readonly earnedAt: string;  // ISO-8601
  readonly expiresAt: string; // ISO-8601
  readonly isActive: boolean; // expiresAt > now
}

export interface LoyaltyRedemptionItem {
  readonly id: string;
  readonly pointsRedeemed: number;
  readonly amountDeducted: number;
  readonly redeemedAt: string; // ISO-8601
  readonly bookingId: string | null;
  readonly notes: string | null;
}

export interface PaginatedLoyaltyEntriesResponse {
  readonly items: LoyaltyEntryItem[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

export interface PaginatedLoyaltyRedemptionsResponse {
  readonly items: LoyaltyRedemptionItem[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}
```

> **Breaking change:** `LoyaltyBalanceResponse` shape changes. Since no frontend currently consumes it (loyalty frontend doesn't exist yet), this is safe. The BFF's `loyalty.types.ts` local type must also be aligned.

Also extend `UpdateTenantSettingsRequest` (defined in `M13-S10`) with `pointsPerCurrencyUnit?: number` so `M13-S31` (Configurações form) can save it.

---

#### Part C — `discountByPoints` forwarded through completion

Update `apps/bff/src/bookings/bookings.controller.ts` complete route body schema:

```typescript
const CompleteBookingBodySchema = z.object({
  lines: z.array(z.object({
    lineId: z.uuid(),
    actualPriceCharged: z.number().nonnegative(),
  })).min(1),
  afterServicePhotoUrls: z.array(z.string()).optional().default([]),
  adminNotes: z.string().optional(),
  discountByPoints: z.object({
    pointsUsed: z.number().int().positive(),
    amountDeducted: z.number().positive(),
  }).optional(),
});
```

Forward `discountByPoints` to backend in the request body. No BFF-side validation — backend is authoritative.

`@ikaro/types` addition:
```typescript
export interface CompleteBookingRequest {
  readonly lines: CompleteBookingLineInput[];
  readonly afterServicePhotoUrls?: string[];
  readonly adminNotes?: string;
  readonly discountByPoints?: {
    readonly pointsUsed: number;
    readonly amountDeducted: number;
  };
}
```

---

**HTTP files:**
- `apps/bff/http/customers/customers.http` — add `GET /v1/customers?search=` block with STAFF token
- `apps/bff/http/loyalty/loyalty.http` — update balance block to show `conversionRate` in response
- `apps/bff/http/bookings/bookings.http` — update complete block to show `discountByPoints` example

**Acceptance criteria:**
- [ ] `GET /v1/customers?search=jo` with STAFF JWT → list of matching customers with `currentPoints`
- [ ] `GET /v1/customers` with CUSTOMER JWT → `403`
- [ ] `GET /v1/customers/:id/loyalty/balance` response includes `conversionRate` field (0 when disabled)
- [ ] `PATCH /v1/bookings/:id/complete` forwards `discountByPoints` to backend when present
- [ ] `LoyaltyBalanceResponse`, `EnrichedLoyaltyBalanceResponse`, `LoyaltyEntryItem`, `LoyaltyRedemptionItem`, `PaginatedLoyaltyEntriesResponse`, `PaginatedLoyaltyRedemptionsResponse`, `CompleteBookingRequest`, `CustomerSearchResult`, `CustomerSearchListResponse` all exported from `packages/types/src/index.ts`
- [ ] `UpdateTenantSettingsRequest` (from `M13-S10`) extended with `pointsPerCurrencyUnit?: number`
- [ ] `tsc --noEmit` passes across monorepo (breaking type change handled everywhere)

**Dependencies:** M13-S11

---

## Phase 2 — Auth frontend

---

### M13-S13 — Staff auth flow overhaul + login pages ✅ Done

*(formerly M124-S02 — expanded during discovery to full-stack)*

**Agent:** `backend-ts` + `bff-ts` + `frontend-ts`
**Complexity:** M
**Docs to load:** `docs/ENGINEERING_RULES.md`, `docs/CODE_STANDARDS.md`, `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `docs/04-USE_CASES.md` § UC-022 UC-025

**Description:**
Full-stack overhaul of the staff auth flow, driven by three bugs found during discovery: (1) staff was provisioned as `is_active=false` requiring a separate activation step that could be bypassed; (2) a deactivated staff who still had their invite link could re-activate their own account; (3) the global `UNIQUE(google_oauth_id)` constraint prevented the same person from being staff at multiple tenants.

New design: staff is always provisioned as `is_active=true`; the invite link only *links* the Google account (`google_oauth_id`) to the already-active record; deactivated staff hitting login goes to an error page; staff with active records at multiple tenants sees a tenant-selection screen (parallel to the customer flow).

`/auth/first-login` page is **removed** — the only path to it was `is_active=false` via regular login, which is now an error condition.

> 🔍 **Discover before starting:** `apps/web/middleware.ts` already exists and redirects `/dashboard/**` to `/auth/login` (wrong target — fix in this story). `apps/web/app/auth/login/page.tsx` is a 3-line stub to delete. `apps/web/app/dashboard/page.tsx` is a stub — leave it.

**Prototype references:**
- `plan/journey/shared/staff-login.html` → `/dashboard/login`
- `plan/journey/staff/prototypes/login/01b-error.html` and siblings → `/auth/error`

---

#### Layer 1 — DB Migration

Edit `apps/backend/src/contexts/staff/infrastructure/migrations/1716600000002-CreateStaffStaff.ts` directly (not in production — drop and reseed):

```sql
-- Change default:
"is_active" BOOLEAN NOT NULL DEFAULT true   -- was: false

-- Replace global unique with per-tenant unique:
-- REMOVE:
CREATE UNIQUE INDEX "UQ_staff_staff_google_oauth_id"
  ON staff.staff (google_oauth_id) WHERE google_oauth_id IS NOT NULL

-- ADD:
CREATE UNIQUE INDEX "UQ_staff_tenant_google_oauth_id"
  ON staff.staff (tenant_id, google_oauth_id)
  WHERE google_oauth_id IS NOT NULL
```

Also update `staff.entity.ts` `@Index` decorator: replace the global unique on `googleOAuthId` with a composite unique on `['tenantId', 'googleOAuthId']` (partial, where not null).

---

#### Layer 2 — Backend: Domain

**`staff-domain.error.ts`** — add:
```typescript
export class StaffDeactivatedError extends StaffDomainError {
  constructor() {
    super('Staff account is deactivated');
    this.name = 'StaffDeactivatedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
```

**`staff.aggregate.ts`:**
- `Staff.inviteFromProvisioning` → `isActive: true` (was `false`)
- `Staff.invite` (UC-028) → `isActive: true` (was `false`)
- Rename `activate(googleOAuthId, name)` → `linkGoogleAccount(googleOAuthId, name)` — remove `this.props.isActive = true` (staff is already active; this method now only sets `googleOAuthId` and `name`)

**`staff-repository.port.ts`** — change signature:
```typescript
// was: findByGoogleOAuthId(id: string): Promise<Staff | null>
findAllByGoogleOAuthId(id: string): Promise<Staff[]>
```

**`typeorm-staff.repository.ts`** — implement `findAllByGoogleOAuthId` returning `Staff[]` (no `findOne` — use `find({ where: { googleOAuthId } })`).

---

#### Layer 3 — Backend: Application

**`ActivateStaffUseCase` → replaced by `LinkGoogleAccountUseCase`** (new file; delete old):

```
File: application/use-cases/link-google-account.use-case.ts

execute(staffId, dto: { tenantId, googleOAuthId, email, name }):
  1. staffRepo.findById(staffId, dto.tenantId) → not found → StaffNotFoundError
  2. if (!staff.isActive) → throw StaffDeactivatedError        ← guard flipped vs old
  3. if email mismatch → throw StaffEmailMismatchError
  4. staff.linkGoogleAccount(dto.googleOAuthId, dto.name)
  5. txManager.run(() => staffRepo.save(staff))
  6. return { staffId, tenantId, role }
```

**`GetStaffByOAuthIdUseCase`** — returns array, never throws `StaffNotFoundError`:
```typescript
async execute(googleOAuthId: string): Promise<GetStaffByOAuthIdUseCaseResult[]>
// uses findAllByGoogleOAuthId; empty array = valid (not-a-staff-member handled by BFF)
```

Result type:
```typescript
export interface GetStaffByOAuthIdUseCaseResult {
  staffId: string;
  tenantId: string;
  role: StaffRole;
  isActive: boolean;
}
```

---

#### Layer 4 — Backend: Infrastructure

**`internal-staff.controller.ts`:**
- `GET /internal/staff/by-oauth` → returns `GetStaffByOAuthIdUseCaseResult[]` (array, no 404)
- `POST /:staffId/activate` → rename to `POST /:staffId/link-google`; use `LinkGoogleAccountUseCase` and `LinkGoogleAccountDto`/`LinkGoogleAccountSchema`

**`staff-error.mapper.ts`** — add:
```typescript
if (err instanceof StaffDeactivatedError)
  throw new HttpException({ type: 'about:blank', title: 'Forbidden', status: 403, detail: 'Staff account is deactivated' }, HttpStatus.FORBIDDEN);
```

**`activate-staff.dto.ts`** → rename to `link-google-account.dto.ts`; schema/type rename accordingly. Fields unchanged: `{ tenantId, googleOAuthId, email, name }`.

**`staff.module.ts`** — swap `ActivateStaffUseCase` for `LinkGoogleAccountUseCase` in providers.

---

#### Layer 5 — BFF

**`auth.types.ts`:**
```typescript
// StaffInfoResponse — unchanged fields, now returned as array from by-oauth
export interface StaffInfoResponse {
  staffId: string;
  tenantId: string;
  role: 'STAFF' | 'MANAGER';
  isActive: boolean;
}

// ActivateStaffResponse → replaced by:
export interface LinkGoogleAccountResponse {
  staffId: string;
  tenantId: string;
  role: 'STAFF' | 'MANAGER';
}

// New:
export interface StaffTenantOption {
  staffId: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  role: 'STAFF' | 'MANAGER';
}
```

**`packages/types/src/`** — add `StaffTenantOption` and `IssueStaffTokenRequest { selectionToken: string; staffId: string }` to `@ikaro/types`.

**`auth.controller.ts`** — `handleStaffLogin` rewrite:
```
staffList = GET /internal/staff/by-oauth → StaffInfoResponse[]
activeStaff = staffList.filter(s => s.isActive)

activeStaff.length === 0 && staffList.some(s => !s.isActive)
  → redirect /auth/error?reason=staff-deactivated

activeStaff.length === 0
  → redirect /auth/error?reason=not-a-staff-member

activeStaff.length === 1
  → GET /internal/tenants/:tenantId → issue JWT → cookie → redirect /dashboard

activeStaff.length > 1
  → selectionToken = issueSelectionToken(profile.googleOAuthId)
  → redirect /select-staff-tenant?token=<selectionToken>
```

**`auth.controller.ts`** — `handleStaffFirstLogin` rewrite:
```
1. GET /internal/tenants/by-slug/:slug  → not found → tenant-not-found
2. GET /internal/staff/by-email?email&tenantId → not found → invite-not-found
3. if !staffByEmail.isActive → staff-deactivated
4. POST /internal/staff/:staffId/link-google { tenantId, googleOAuthId, email, name }
   catch 422 → email-mismatch
5. issue JWT → cookie → redirect /dashboard
```

**`auth.controller.ts`** — two new `@Public()` endpoints:

`GET /auth/staff-tenants?token=...`:
```
verifySelectionToken(token) → { googleOAuthId }
GET /internal/staff/by-oauth → StaffInfoResponse[]
filter active → for each: GET /internal/tenants/:tenantId
return StaffTenantOption[]
```

`POST /auth/staff-token` (body: `IssueStaffTokenDto { selectionToken, staffId }`):
```
verifySelectionToken → { googleOAuthId }
GET /internal/staff/by-oauth → find matching staffId that isActive
if not found → ForbiddenException
GET /internal/tenants/:tenantId
issue JWT → cookie → return { tenantSlug }
```

Add `IssueStaffTokenDto` / `IssueStaffTokenSchema` (same pattern as `IssueTokenDto`).

---

#### Layer 6 — Frontend

**`apps/web/middleware.ts`** — fix redirect target:
```typescript
// was: new URL('/auth/login', request.url)
new URL('/dashboard/login', request.url)
```

**`apps/web/app/dashboard/login/page.tsx`** — new server component (static):
- Ikaro logomark (coloured square with "I", no new icon library)
- Heading: `"Área da Equipe"`
- Subtext: `"Acesso exclusivo para funcionários e gerentes"`
- Google Sign-In button: `<a href={\`${process.env.NEXT_PUBLIC_BFF_URL}/auth/google?type=staff\`}>` — plain `<a>` (full redirect, not fetch)
- Footer: `"Primeiro acesso? Use o link enviado no e-mail de convite."`
- No inline error banner — all errors go to `/auth/error`

**`apps/web/app/auth/error/page.tsx`** — new server component, `searchParams.reason` drives content:

| `reason` | Heading | Message | CTA label | CTA href |
|---|---|---|---|---|
| `not-a-staff-member` | `"Acesso não autorizado"` | `"Sua conta Google não está cadastrada como funcionário neste estabelecimento."` | `"Voltar ao login"` | `/dashboard/login` |
| `staff-deactivated` | `"Conta desativada"` | `"Sua conta foi desativada. Entre em contato com o gerente."` | `"Voltar ao login"` | `/dashboard/login` |
| `email-mismatch` | `"Acesso não autorizado"` | `"Por favor, use o e-mail para o qual você foi convidado(a)."` | `"Voltar ao login"` | `/dashboard/login` |
| `invite-not-found` | `"Convite não encontrado"` | `"Nenhum convite pendente foi encontrado para este estabelecimento."` | `"Voltar ao login"` | `/dashboard/login` |
| `account-linked-elsewhere` | `"Conta já vinculada"` | `"Esta conta Google já está vinculada a outro funcionário. Entre com a conta original ou peça ajuda ao gerente."` | `"Voltar ao login"` | `/dashboard/login` |
| `tenant-not-found` | `"Estabelecimento não encontrado"` | `"O link de convite é inválido ou o estabelecimento foi removido."` | `"Voltar ao site"` | `/` |
| `tenant-deactivated` | `"Estabelecimento desativado"` | `"Este estabelecimento está temporariamente desativado."` | `"Voltar ao site"` | `/` |
| `no-tenant` | `"Não foi possível entrar"` | `"Nenhum estabelecimento encontrado para sua conta Google."` | `"Voltar ao site"` | `/` |
| _(missing/unknown)_ | `"Erro de autenticação"` | `"Ocorreu um erro inesperado. Tente novamente."` | `"Voltar"` | `/` |

Show reason code in small grey text at bottom: `"Código: <reason>"`.

**`apps/web/app/select-staff-tenant/page.tsx`** — new `'use client'` component:
- Reads `?token=` via `useSearchParams()`
- On mount: `GET ${process.env.NEXT_PUBLIC_BFF_URL}/auth/staff-tenants?token=<token>` → `StaffTenantOption[]`
- Loading state while fetching; error state if fetch fails (show "Tente novamente" link to `/dashboard/login`)
- Renders list: each option shows `tenantName` + `role` badge → clicking calls `POST ${NEXT_PUBLIC_BFF_URL}/auth/staff-token { selectionToken: token, staffId }` → on success `router.push('/dashboard')`
- Heading: `"Selecione o estabelecimento"`

**Delete:**
- `apps/web/app/auth/login/` directory (3-line stub — wrong route)
- `apps/web/app/auth/first-login/` is **not created** (concept removed)

---

#### Layer 7 — Tests

**Backend unit tests:**
- `get-staff-by-oauth-id.use-case.spec.ts` → update for `Staff[]` return; remove `StaffNotFoundError` case; add empty-array case
- `link-google-account.use-case.spec.ts` (renamed from `activate-staff.use-case.spec.ts`):
  - active staff + correct email → links `googleOAuthId`, saves, returns `{ staffId, tenantId, role }`
  - deactivated staff → throws `StaffDeactivatedError`
  - email mismatch → throws `StaffEmailMismatchError`
  - staff not found → throws `StaffNotFoundError`
- `staff.aggregate.spec.ts` → update `activate` tests to `linkGoogleAccount`; add tests that `inviteFromProvisioning` and `invite` create staff with `isActive: true`

**Backend integration tests:**
- `tenant-provisioned.handler.integration.spec.ts` → assert created staff has `isActive: true`
- `internal-staff.controller.integration.spec.ts` → update `by-oauth` to return array; add `link-google` endpoint tests

**BFF unit tests (`auth.controller.spec.ts`):**
- `handleStaffLogin`: 0 results → `not-a-staff-member`; deactivated results → `staff-deactivated`; 1 active → JWT + cookie; 2 active → selection token + redirect
- `handleStaffFirstLogin`: deactivated staff → `staff-deactivated`; email mismatch (BFF catches 422) → `email-mismatch`; success → JWT + redirect `/dashboard`
- `GET /auth/staff-tenants`: valid token → `StaffTenantOption[]`; expired token → 400
- `POST /auth/staff-token`: valid → JWT + `{ tenantSlug }`; staffId not in list → 403

**Update `InMemoryStaffRepository`** (test double): replace `findByGoogleOAuthId` with `findAllByGoogleOAuthId`.

---

**Testing note:** `app/**/page.tsx` server components — no Vitest unit tests. `select-staff-tenant/page.tsx` is a client component but its interaction (fetch + redirect) is best covered by Playwright (future). AC verification is by visual/manual check per the criteria below.

**Acceptance criteria:**
- [ ] `GET /dashboard/login` renders; Google button `href` = `${NEXT_PUBLIC_BFF_URL}/auth/google?state=__staff__`
- [ ] `GET /auth/error?reason=not-a-staff-member` renders correct heading + CTA → `/dashboard/login`
- [ ] `GET /auth/error?reason=staff-deactivated` renders "Conta desativada" + CTA → `/dashboard/login`
- [ ] `GET /auth/error?reason=email-mismatch` renders correct heading + CTA → `/dashboard/login`
- [ ] `GET /auth/error?reason=tenant-not-found` renders correct heading + CTA → `/`
- [ ] `GET /auth/error` (no reason) renders fallback without throwing
- [ ] `GET /select-staff-tenant?token=<valid>` renders tenant list fetched from BFF
- [ ] `apps/web/middleware.ts` redirects unauthenticated `/dashboard/**` to `/dashboard/login`
- [ ] Staff provisioned via `TenantProvisioned` event has `isActive: true` in DB
- [ ] `POST /internal/staff/:id/link-google` links `googleOAuthId` for an active staff; returns 403 for deactivated staff
- [ ] `GET /internal/staff/by-oauth` returns `StaffInfoResponse[]` (array); returns `[]` when not found (no 404)
- [ ] BFF `handleStaffLogin`: single active → JWT cookie + redirect `/dashboard`; 2 active → redirect `/select-staff-tenant?token=...`; all deactivated → redirect `/auth/error?reason=staff-deactivated`
- [ ] BFF `POST /auth/staff-token`: valid `staffId` → JWT cookie + `{ tenantSlug }`; unknown `staffId` → 403
- [ ] `apps/web/app/auth/login/` deleted
- [ ] `tsc --noEmit` passes; `pnpm lint` zero warnings; all unit tests pass

**Dependencies:** M13-S02 (auth cookie fix already merged ✅).

---

### M13-S14 — Customer phone completion, auth proxy-route cleanup, and tenant switch (UC-021 A3, UC-023) ✅ Done

*(formerly M124-S03; scope revised 2026-06-24 after a story-discovery session — see rationale below. Folds in the original `M13-S30`, which is now merged here.)*

**Agent:** `frontend-ts` (frontend) + `bff-ts` (two new/changed BFF endpoints) + `backend-ts` (one new internal endpoint)
**Complexity:** M
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `docs/04-USE_CASES.md` § UC-021 UC-023, `plan/journey/customer/prototypes/login/dev-notes.md`, `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`, `td/TD02-LOCALIZATION.md`

**Scope-change rationale (read before starting):** the story originally planned three deliverables: the tenant-branded login screen, a multi-tenant selection screen (`/select-tenant`, UC-021 Case B), and the phone-completion prompt. A discovery session found:
1. The login screen was already built in `M13-S42` (out of build order) — nothing left to do there.
2. `/select-tenant` and its supporting BFF machinery (`handleMultiTenantLogin`'s 2+-tenant branch, `POST /auth/token`) are **unreachable from any shipped UI** — every customer login entry point supplies a `tenantSlug` directly (`handleTenantLogin`), so the multi-tenant OAuth branch never triggers. Building the page would ship dead UI on top of dead BFF code. **Descoped permanently** — see `docs/04-USE_CASES.md` UC-021's updated text.
3. `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` documents that any client component outside an authenticated shell must reach the BFF only through a same-origin Next.js proxy route (cookies don't reliably travel cross-origin in production). `M13-S13`'s `/select-staff-tenant` violates this — it calls the BFF directly. Fixing it is folded into this story since it's the same architecture this story already has to get right for the items below.
4. The original `M13-S30` (UC-023 tenant switch) reuses the exact same `TenantOption` card pattern this story already needs, and its trigger doesn't actually require the not-yet-built `CustomerShell` (`M13-S16`) — it fits naturally into the already-shipped `HotsiteAuthBar` avatar dropdown. Folded in here rather than left as a separate story waiting on `M13-S16`.

What's actually left to build: the phone-completion prompt, the staff proxy-route fix, and the customer tenant-switch feature.

> 🔍 **Discover before starting:**
> - Confirm `M13-S42` is merged (`/{slug}/login`, `/auth/error`, `HotsiteAuthBar`, `/api/customers/me` GET all exist).
> - Read `apps/web/app/[slug]/layout.tsx` — phone prompt mounts here.
> - Read `apps/web/components/hotsite/HotsiteAuthBar.tsx` — "Trocar empresa" goes in its dropdown, between "Minha conta" and "Sair".
> - Read `apps/web/app/select-staff-tenant/page.tsx` and `apps/bff/src/auth/auth.controller.ts`'s `getStaffTenants`/`issueStaffToken` before writing the staff proxy routes — mirror their request/response shapes exactly, just relocate the call site.
> - Read `apps/web/components/booking/PersonalInfoStep.tsx`'s `buildContactPhone`/`digitsOnly` helpers — extract `buildContactPhone` into `apps/web/lib/utils.ts` (next to the already-shared `digitsOnly`) and reuse it from `InformationCompletionPrompt`, rather than re-deriving the same E.164-assembly logic. (Implementation also extracted a shared `apps/web/lib/phone-format.ts` for mask/truncation logic shared by both files — see §1 below.)
> - Read `packages/i18n/src/country-defaults.ts`'s `CountrySpec` — phone formatting is calling-code-prefix only (`phonePrefix`, e.g. `+55`/`+1`); there is no per-country visual mask anywhere in this codebase. Do not invent a BR-specific `(XX) XXXXX-XXXX` mask — follow the same prefix-label + plain-digit-input pattern `PersonalInfoStep` already uses.
> - Read `apps/bff/src/customers/customers.controller.ts`'s `UpdateCustomerProfileBodySchema` — `phone` must already be E.164 by the time it's sent; a Zod failure returns `400 { violations: [...] }`, not `422 { type: 'invalid-phone' }`.
> - Read `apps/backend/src/contexts/customer/infrastructure/controllers/internal-customer.controller.ts` and any `internal/tenants/**` controller for the exact internal-route conventions (no role guard, called by `BackendHttpService`) before adding the new loyalty-balance internal endpoint — match the existing pattern exactly, don't invent a new one.

**Prototype references:**
- `plan/journey/customer/prototypes/login/02-phone-completion.html` + `02b-validation-error.html` (phone prompt — rendered inline, not as a page)
- `plan/journey/customer/prototypes/minha-conta/05-trocar-empresa.html` (switch-tenant — same visual pattern as the now-descoped `01-select-tenant.html`)

**What to create:**

---

#### 1. Information completion — `apps/web/components/customer/InformationCompletionPrompt.tsx` — `'use client'`

*(Renamed from the original `PhoneCompletionPrompt` during implementation — scope grew from phone-only to phone + address, both mandatory.)*

A **mandatory** inline bottom-sheet prompt shown to customers who are missing `phone` and/or `defaultAddress` (UC-021 A3, expanded) — there is no skip/dismiss option; the prompt stays open until both are saved. Mounts inside `apps/web/app/[slug]/layout.tsx`. Pre-fills whichever piece the customer already has on file (e.g. phone known, address missing → phone field starts filled, only the address blocks submission).

```typescript
// On mount: call the already-existing getHotsiteCustomerProfile() (lib/api/customers.ts)
// If not authenticated (returns null) → render nothing
// If phone == null OR defaultAddress == null → show prompt, non-dismissible
```

Sheet content (per `02-phone-completion.html` / UC-021 A3 for the phone portion — base copy, since address collection was added after the prototype was drawn):
- Heading: `"Complete seu perfil"`
- Subtext: `"Precisamos do seu telefone e endereço para confirmar e organizar seus agendamentos. Você só precisa fazer isso uma vez."`
- Phone input: prefix label showing `manifest.localization.phonePrefix` (e.g. `+55`) + masked digit input via the new `apps/web/lib/phone-format.ts` (`formatPhoneForDisplay`/`maxPhoneDigits`/`phonePlaceholder`/`sanitizePhoneInput`) — a real per-country visual mask (`(11) 99999-9999` for `+55`, `(555) 123-4567` for `+1`), applied identically in `PersonalInfoStep.tsx` (booking flow) for consistency. Built because neither file originally had a mask; both do now.
  - Validation: stripped local digits must be 10 or 11 characters (client-side gate, fast feedback)
- Address section: reuses the existing `AddressFields` component (`apps/web/components/booking/AddressFields.tsx`) and `emptyAddress()`/`isAddressFilled()`/`sanitizeAddress()` helpers (`apps/web/lib/booking/personal-info.ts`) — no new address UI was built, this is the same component the booking flow's optional contact-address uses, just `required` here. Fed by `addressSpec` (`manifest.localization.address`), passed down alongside `phonePrefix`.
- `"Salvar e continuar"` button — **not** proactively disabled by validity (matches `PersonalInfoStep`'s reactive-validation convention: always clickable, invalid submit shows inline errors instead of disabling). No dismiss/"Agora não" link — both fields are mandatory. The `<form>` needs `noValidate` — native HTML `required` constraint validation on the address fields otherwise blocks the `submit` event from ever firing before the custom validation runs.

On submit (client-side validates phone first, then address; only calls the API once both pass):
```
PATCH /api/customers/me { phone, defaultAddress }
→ 200: close prompt
→ 400 { violations: [{ field, message }] }: inspect violations —
    'phone' in fields              → "Digite um número de telefone válido (10 ou 11 dígitos)."
    any field starts with 'defaultAddress' → "Verifique os dados do endereço e tente novamente." + re-highlight address fields
    otherwise                      → "Erro ao salvar. Tente novamente."
→ other error: "Erro ao salvar. Tente novamente."
```

`updateHotsiteCustomerProfile`'s error class (`UpdateHotsiteCustomerProfileError`) carries the parsed `violations` array precisely to support this field-aware routing — a flat "any 400 means phone" assumption (the original draft of this story) breaks once address can also fail validation.

Add `InformationCompletionPrompt` to `apps/web/app/[slug]/layout.tsx`:
```tsx
<InformationCompletionPrompt
  phonePrefix={manifest.localization.phonePrefix}
  addressSpec={manifest.localization.address}
/>
{children}
```

**`apps/web/app/api/customers/me/route.ts`** — extend with a `PATCH` handler, mirroring the existing `GET` handler exactly (read `access_token` cookie, forward to BFF `PATCH /customers/me` with the `Cookie` header, pass through status + body).

**`apps/web/lib/api/customers.ts`** — add `updateHotsiteCustomerProfile(body: { phone: string; defaultAddress: Address }): Promise<CustomerProfileResponse>`, calling `PATCH /api/customers/me`. **Do not** name it `updateCustomerProfile` — that name already exists in `apps/web/lib/api/dashboard/customers.ts` (the Bearer-token `bffClient` version, dashboard-shell-only) and means something different (different transport, different auth). Follow `getHotsiteCustomerProfile`'s existing naming convention.

---

#### 2. Staff proxy-route fix (architecture cleanup, no behavior change)

`apps/web/app/api/auth/staff-tenants/route.ts` — `GET`, reads `?token=`, forwards to BFF `GET /auth/staff-tenants?token=...`, passes through status + body. No cookie involved (selection token is the only credential).

`apps/web/app/api/auth/staff-token/route.ts` — `POST`, reads `{ selectionToken, staffId }` body, forwards to BFF `POST /auth/staff-token`, and **relays the BFF's `Set-Cookie` response header back to the browser** (this is the one that actually needed the proxy — it's what sets the session cookie on the web app's own origin instead of the BFF's).

Update `apps/web/app/select-staff-tenant/page.tsx`: replace the two direct `fetch(`${bffUrl}/auth/...`)` calls with `fetch('/api/auth/staff-tenants?...')` / `fetch('/api/auth/staff-token', ...)`. Behavior is identical from the user's perspective — this is purely an architecture fix.

---

#### 3. Customer tenant switch (UC-023) — folded in from the original `M13-S30`

**Backend — new internal endpoint** (exact route name/shape per the discover note above — match existing `/internal/**` conventions): given a `customerId` + `tenantId`, return that customer's current loyalty balance in that tenant. Needed because the existing JWT-guarded `GET /loyalty/balance` only ever returns the balance for the *currently active* tenant — switching requires seeing balances in tenants the customer isn't currently authenticated against.

**BFF — `GET /v1/customers/tenants`** (add to `apps/bff/src/customers/customers.controller.ts`, `@Roles('CUSTOMER')`):
```typescript
getCustomerTenants(@CurrentUser() user: CurrentUserPayload): Promise<TenantOption[]>
// Calls GET /internal/customers/{user.sub}/tenants (already exists)
// Includes the current tenant (user.tenantId) — the client can't read it from the httpOnly
// JWT cookie, so the switch-tenant page needs it here to render the non-clickable "Atual" card
// Enriches each via GET /internal/tenants/{id} (name, slug) + the new loyalty-balance internal endpoint
```

`SwitchTenantRequest { readonly targetTenantId: string }` — add to `packages/types/src/auth.dto.ts` (the BFF's `SwitchTenantDto`/`SwitchTenantSchema` already exist and are unchanged).

**New proxy routes:**
- `apps/web/app/api/customers/tenants/route.ts` — `GET`, forwards the `access_token` cookie, calls BFF `GET /v1/customers/tenants`.
- `apps/web/app/api/auth/switch-tenant/route.ts` — `POST`, forwards `{ targetTenantId }` + cookie, calls BFF `POST /v1/auth/switch-tenant`, relays the new `Set-Cookie` back.

**`apps/web/lib/api/auth.ts`** (new file):
```typescript
fetchStaffTenants(token: string): Promise<StaffTenantOption[]>       // GET /api/auth/staff-tenants
selectStaffTenant(selectionToken: string, staffId: string): Promise<{ tenantSlug: string }>  // POST /api/auth/staff-token
fetchCustomerTenants(): Promise<TenantOption[]>                       // GET /api/customers/tenants
switchTenant(targetTenantId: string): Promise<SwitchTenantResponse>  // POST /api/auth/switch-tenant
```

**`apps/web/app/switch-tenant/page.tsx`** — `'use client'`:
- Same visual layout as `minha-conta/05-trocar-empresa.html` (centered, full height, Ikaro logo, tenant cards — the same card pattern the now-descoped `/select-tenant` would have used)
- On mount: `fetchCustomerTenants()` — loading: skeleton cards; empty (only 1 tenant): redirect to `/{currentSlug}` (should not reach this page — see trigger visibility below)
- Shows current tenant first, marked "Atual" (non-clickable, read `tenantSlug` from the JWT cookie)
- Other tenant cards: clickable → `switchTenant(targetTenantId)` → on success `router.push('/{newSlug}')`
- `"← Voltar sem trocar"` link → `router.back()`
- Error (network failure on switch): inline alert "Não foi possível trocar de empresa. Tente novamente." + retry — no navigation

**`apps/web/components/hotsite/HotsiteAuthBar.tsx` update:** add a "Trocar empresa" item between "Minha conta" and "Sair" in the avatar dropdown. **Only render when the customer has 2+ tenants** — call `fetchCustomerTenants()` alongside the existing `getHotsiteCustomerProfile()` call on mount; if it returns an empty list, omit the item. Links to `/switch-tenant`.

---

**Testing:**

`app/**/page.tsx` files (`switch-tenant`, `select-staff-tenant`) are not unit-tested per the standing rule. `InformationCompletionPrompt` and the `HotsiteAuthBar` dropdown addition are stateful client components warranting Playwright E2E coverage. The four route handlers (`api/auth/staff-tenants`, `api/auth/staff-token`, `api/customers/tenants`, `api/auth/switch-tenant`, and the `customers/me` `PATCH` addition) each need a `route.spec.ts`, mirroring `apps/web/app/api/revalidate/route.spec.ts`'s structure (Vitest, node environment, mocked `next/headers` + global `fetch`).

**Acceptance criteria:**

*Information completion prompt (renamed from "phone completion" — now phone + address, both mandatory):*
- [x] Prompt does NOT appear when `getHotsiteCustomerProfile()` returns both `phone != null` AND `defaultAddress != null`
- [x] Prompt does NOT appear when unauthenticated (`getHotsiteCustomerProfile()` returns `null`)
- [x] Prompt appears as a non-dismissible overlay when either `phone == null` or `defaultAddress == null` — no skip option anywhere
- [x] Whichever field is already known is pre-filled (e.g. phone present, address missing → phone field starts filled)
- [x] Phone input shows the tenant's `phonePrefix` (e.g. `+1` for a US tenant, `+55` for a BR tenant) **and** a real per-country visual mask (`lib/phone-format.ts`) — applied identically in `PersonalInfoStep.tsx`
- [x] Address section reuses `AddressFields`/`addressSpec` (`manifest.localization.address`), all fields required
- [x] Submit click with an invalid phone → inline phone-specific error, no address highlighting, no API call
- [x] Submit click with a valid phone but incomplete address → address fields highlighted red (`hasError`), no API call
- [x] Valid submit → `PATCH /api/customers/me` with `{ phone, defaultAddress }` → prompt closes
- [x] `400` with a `phone` violation → phone-specific error message; `400` with a `defaultAddress.*` violation → address-specific error message + re-highlighted fields; any other `400`/error → generic message
- [x] Prompt reappears on every route change within `[slug]/**` until both fields are actually saved (no session-level dismissal state exists)

*Staff proxy fix:*
- [ ] `/select-staff-tenant` no longer calls `NEXT_PUBLIC_BFF_URL` directly from client code — both calls go through `/api/auth/staff-tenants` and `/api/auth/staff-token`
- [ ] Staff tenant-selection flow behaves identically end-to-end (manual regression, no behavior change intended)

*Customer tenant switch:*
- [ ] `GET /v1/customers/tenants` (CUSTOMER JWT) returns the customer's full tenant list (current tenant included), each with name, slug, loyaltyPoints
- [ ] Tenant isolation: Customer A cannot retrieve Customer B's tenant list
- [ ] "Trocar empresa" visible in `HotsiteAuthBar`'s dropdown only when the customer has 2+ tenants
- [ ] `GET /switch-tenant` renders current tenant (marked "Atual") + other tenants as cards; skeleton while loading
- [ ] Clicking another tenant calls `POST /api/auth/switch-tenant`; success → redirect to `/{newSlug}`, cookie updated, hotsite renders logged-in as the new tenant's customer
- [ ] Network error on switch → inline alert + retry, no navigation
- [ ] `"← Voltar sem trocar"` navigates back without switching

*General:*
- [ ] `tsc --noEmit` passes across monorepo
- [ ] `pnpm lint` zero warnings
- [ ] No new `any` types introduced
- [ ] `.http` blocks added/updated for `GET /v1/customers/tenants` and the new internal loyalty-balance endpoint

**Dependencies:** M13-S42 (login page, `HotsiteAuthBar`, `/api/customers/me` GET), M13-S02 (cookie fix; `TenantOption`/`SwitchTenantResponse` types)

---

## Phase 3 — Dashboard shells

---

### M13-S15 — Dashboard shell: layout, middleware, auth guard (staff + manager) ✅ Done

*(formerly M125-S01)*

**Agent:** `frontend-ts`
**Complexity:** M
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `docs/REPOSITORY_STRUCTURE.md`
**Journey prototype:** `plan/journey/staff/prototypes/agenda/` — reviewed; UC-003/004/005 audit done 2026-06-16; UC-008/009 audit done same day

**Description:**
Implement the foundational shell that every staff/manager dashboard page will live inside. This is the prerequisite for all Phase 4–8 stories — nothing else can be built until the layout exists.

The shell matches `plan/journey/shared/dashboard-shell.html` and `plan/journey/staff/prototypes/agenda/00-agenda.html`:
- **Mobile (`<1024px`):** sticky topbar (brand + avatar) + `main` + bottom tab nav (Agenda | Horários | Serviços | Fidelidade | + Manager-only tabs)
- **Desktop (`≥1024px`):** fixed left sidebar (logo, nav, manager section, user footer) + topbar (page title + date + avatar) + `main`
- **Role-aware nav:** "Somente Gerente" section in sidebar is only rendered when JWT role = MANAGER

> 🔍 **Discover before starting:** Check `apps/web/app/dashboard/` — there may be a `layout.tsx` stub or middleware already. If `apps/web/middleware.ts` exists, read it in full before adding route protection. Read `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` for canonical folder structure before placing any new files.

**What to create:**

`apps/web/middleware.ts` — **extend** (already exists — created in M13-S13 to fix the `/dashboard/login` redirect; add role-based JWT guard on top):
- Read JWT from `httpOnly` cookie
- If no JWT or JWT role is not `STAFF` | `MANAGER` → redirect to `/dashboard/login`
- If JWT valid → pass through (the existing `x-pathname` propagation for i18n must be preserved)

`apps/web/app/dashboard/layout.tsx` — server component:
- Reads JWT from cookie (server-side, via `cookies()`)
- Extracts `{ tenantSlug, tenantName, userName, role }` from JWT payload
- Renders `<DashboardShell>` with those props

`apps/web/components/dashboard/DashboardShell.tsx` — `'use client'`, the shell wrapper:
- Sidebar (desktop) + topbar + `<main>` + bottom nav (mobile)
- Accepts `role: 'STAFF' | 'MANAGER'` and conditionally renders manager-only nav items

`apps/web/components/dashboard/Sidebar.tsx`:
- Logo block (tenant name + slug)
- Nav items: Agenda, Horários, Serviços, **Fidelidade** (STAFF + MANAGER — links to `/dashboard/loyalty`, see `M13-S25`)
- "Somente Gerente" label + Equipe + Configurações + **Hotsite** (MANAGER only — hidden for STAFF)

> **Fix folded in during consolidation:** the original draft of this story only listed "Equipe + Configurações" under "Somente Gerente", omitting Hotsite — even though `dashboard-shell.html` and every manager prototype include it as a third item (caught during the `M13-S35`–`M13-S37` cross-file audit). Include all three from the start: Equipe, Configurações, Hotsite.

`apps/web/components/dashboard/Topbar.tsx`:
- Back arrow + title (drill-down pages)
- Page title (list pages)
- Status badge slot (optional — used by detail page)
- Avatar + today's date (desktop)

`apps/web/components/dashboard/BottomNav.tsx`:
- Mobile only (`<1024px`)
- Tabs matching sidebar nav items (role-aware)

**`dashboard-shell.html` CSS class reference (do not invent new classes — use what's in `shared/tokens.css`):**

| tokens.css class | Purpose |
|---|---|
| `.dashboard-topbar` | Sticky topbar wrapper |
| `.topbar-page-title` | Page title (hidden mobile) |
| `.topbar-date` | Date string (hidden mobile) |
| `.dashboard-layout` | Sidebar + main grid |
| `.sidebar` | Left sidebar (hidden mobile) |
| `.sidebar-header` | Logo + tenant name block |
| `.sidebar-nav` / `.sidebar-nav-item` / `.sidebar-nav-icon` | Nav items |
| `.sidebar-section-label` | "Somente Gerente" label |
| `.sidebar-footer` | Avatar + name + logout |
| `.main-content` | Right main area |
| `.dashboard-body` | Content padding wrapper |
| `.bottom-nav` | Mobile tab bar (hidden desktop) |
| `.auth-avatar` | Clickable avatar (NOT `.topbar-avatar` — hidden desktop) |
| `.role-badge` / `.role-badge-manager` | Role chip |
| `.status-badge` / `.status-pending` / `.status-approved` / etc. | Status chips |

**Acceptance criteria:**
- [ ] `GET /dashboard` redirects to `/dashboard/bookings` (or first meaningful page) — no blank screen
- [ ] Unauthenticated request to `/dashboard/**` redirects to staff login
- [ ] JWT with role `CUSTOMER` redirects to staff login (not a valid dashboard user)
- [ ] Sidebar visible at `≥1024px`; bottom nav visible at `<1024px`; neither both at once
- [ ] Manager-only nav section visible when role = MANAGER; hidden when role = STAFF; section includes Equipe, Configurações, AND Hotsite
- [ ] `auth-avatar` (not `topbar-avatar`) used for all avatar elements — avatar is visible on both mobile and desktop
- [ ] `tsc --noEmit` passes; `pnpm lint` zero warnings

**Dependencies:** M03 (JWT structure), M13-S13 (staff login sets cookie)

---

### M13-S16 — Customer shell: layout, auth guard, route protection ✅ Done

*(formerly M126-S01)*

**Agent:** `frontend-ts`
**Complexity:** S
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `docs/REPOSITORY_STRUCTURE.md`
**Parallel with:** M13-S06–M13-S08 (already landed in Phase 1, so no actual blocking here)

**Description:**
Implement the foundational shell for the customer area. All `/{slug}/my-account/**` routes require a valid CUSTOMER JWT — unauthenticated users must be redirected to login. The visual shell matches `plan/journey/shared/customer-dashboard.html` and `plan/journey/customer/prototypes/minha-conta/01-minha-conta.html` (prototype folder stays pt-BR — see naming note below; the production route is `my-account`, not `minha-conta`).

> 🔍 **Discover before starting:** Check `apps/web/app/[slug]/` for any existing `my-account/` folder or `layout.tsx`. Check `apps/web/middleware.ts` — read it in full before extending it; the staff guard (added in `M13-S15`) must not be broken. Read `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` for the canonical folder structure before placing any files.

> **Naming note:** the prototype folder/journey doc use the pt-BR concept name `minha-conta` (kept as-is — prototypes are conceptual mockups, not code). All production identifiers — route segment, folder, file, component names — use the English `my-account`, per the code-standards English-only rule. This was established in `M13-S42` (hotsite auth bar), which already links to `/{slug}/my-account` from the logged-in dropdown.

**What to create:**

Extend `apps/web/middleware.ts` — add protection for `/{slug}/my-account/**`:
- Read JWT from `access_token` httpOnly cookie
- If missing or expired → redirect to `/{slug}/login`
- If JWT role is not `CUSTOMER` → redirect to `/{slug}/login` (staff must not reach customer area)
- If valid → pass through; the `tenantSlug` in the JWT must match the `[slug]` path segment

`apps/web/app/[slug]/my-account/layout.tsx` — server component:
- Reads JWT via `cookies()`, decodes with `decodeJwtPayload()` — reads `tenantName`, `tenantSlug`, `userName`, `locale` directly from the JWT payload (same pattern as `dashboard/(protected)/layout.tsx`; M13-S15 enriched all login flows to carry these fields — no separate API call needed)
- Resolves locale via `resolveSupportedLocale(payload.locale ?? 'pt-BR')`
- Renders `<LocaleProvider><CustomerShell tenantName={...} tenantSlug={...} userName={...}>{children}</CustomerShell></LocaleProvider>`

`apps/web/app/[slug]/my-account/page.tsx` — minimal stub server component (net-new; prevents 404 until M13-S27 fills in content):
- Returns a placeholder `<div>` or `null` wrapped by the shell

`apps/web/components/customer/CustomerShell.tsx` — `'use client'`:
- **Pure Tailwind + shadcn + Lucide icons + `cn()` + `usePathname()` — no tokens.css classes, no `--ba-*` variables** (same SaaS fixed palette as DashboardShell)
- Sticky topbar: tenant logo-mark + name (left) + "+ Novo agendamento" desktop button + avatar `<details>` dropdown with user name, "← Site [tenant]" and "Sair" links (right)
- Desktop tab nav (≥1024px, `hidden lg:flex`): horizontal tabs — Início | Agendamentos | Fidelidade; active tab: `border-b-2 border-blue-600 text-blue-600`; inactive: `text-gray-900/40`
- `<main>` content slot with appropriate padding
- Mobile bottom nav (`flex lg:hidden`, `fixed inset-x-0 bottom-0`): 3 tabs — Início | Agendamentos | Fidelidade, same `usePathname()` active detection as `BottomNav.tsx`

`apps/web/components/customer/CustomerShell.spec.tsx` — **mandatory co-located spec** (SonarCloud coverage gate):
- Render smoke test, mobile/desktop nav visibility, active tab detection

**Acceptance criteria:**
- [ ] Unauthenticated `GET /{slug}/my-account` redirects to `/{slug}/login`
- [ ] JWT with role `STAFF` or `MANAGER` redirects to `/{slug}/login`
- [ ] JWT `tenantSlug` mismatch with URL `[slug]` → redirect to `/{slug}/login`
- [ ] Valid CUSTOMER JWT → shell renders; `userName` shown in avatar dropdown
- [ ] Bottom nav visible at `<1024px`; desktop tab nav visible at `≥1024px`; never both at once
- [ ] `tsc --noEmit` passes; `pnpm lint` zero warnings

**Dependencies:** M13-S02 (cookie set on login), M13-S14 (`/{slug}/login` route exists)

---

## Phase 4 — Staff booking core

> **Discovery note (applies to this entire phase):** Several details will only be resolved when implementation begins — particularly what BFF endpoints already exist vs. what needs adding, and which `@ikaro/types` booking types survived M12. Explicit "🔍 Discover before starting" callouts mark every assumption that must be verified before writing code. Do not skip these — acting on a wrong assumption here caused two CI failures in M12. For `M13-S19`/`M13-S20` specifically: the UC-008/UC-009 audit already confirmed `cancel-admin`, `reschedule`, and `complete` backend+BFF endpoints are fully implemented (not just planned) — these two stories are frontend-only.

**Implementation session summary**
- `M13-S18` shipped the booking detail shell and triage flows: approve, reject, request info, localized copy, slot-conflict handling, and topbar status sync.
- `M13-S19` shipped the approved-state lifecycle shell: the detail page now exposes complete, reschedule, and cancel actions, with cancel staying inline and reschedule moving to a dedicated route.
- `M13-S20` shipped the dedicated completion route with per-line charged-price editing, live totals, and success state. After-service photo upload is still missing.
- Playwright coverage for this slice should focus on happy paths, validation errors, 409 conflict retries, status-specific visibility, and stale-list regressions after returning to the bookings queue.

---

### M13-S17 — Booking queue page (`/dashboard/bookings`) ✅ Done

*(formerly M125-S03)*

**Agent:** `frontend-ts`
**Complexity:** S
**Docs to load:** `plan/journey/staff/prototypes/agenda/00-agenda.html` (reference), `plan/journey/staff/agenda.md`

**Description:**
Implement the booking queue — grouped by **urgency, not date** (resolved 2026-06-16, see `plan/journey/staff/agenda.md` "Queue scope"): "Precisa de ação" (all PENDING + INFO_REQUESTED, any date), "Hoje" (today's APPROVED, actionable), "Próximos dias" (future APPROVED, read-only glance). This is the first page a staff member sees after logging in.

> 🔍 **Discover before starting:** Verify the exact path of `fetchStaffBookings` — it must call `GET /v1/bookings` with `X-Actor-*` headers forwarded, three times with different query params (see `M13-S03`). Check whether a `lib/api/dashboard/` directory exists or if fetchers live flat in `lib/api/`. Follow whatever convention is already there.

**Prototype reference:** `plan/journey/staff/prototypes/agenda/00-agenda.html`
**Route:** `/dashboard/bookings`

**What to create:**

`apps/web/lib/api/dashboard/bookings.ts`:
```typescript
fetchStaffBookings(params: { status: string; date?: string; from?: string; page?: number }): Promise<StaffBookingListResponse>
// GET /v1/bookings, sends auth cookie, X-Actor-* headers
```

`apps/web/app/dashboard/bookings/page.tsx` — server component:
- Calls `fetchStaffBookings` three times in parallel: `{ status: 'PENDING,INFO_REQUESTED' }` (no date), `{ status: 'APPROVED', date: today() }`, `{ status: 'APPROVED', from: tomorrow() }`
- Renders `<BookingQueuePage actionNeeded={...} today={...} upcoming={...} />`
- Empty state handled inline, per section

`apps/web/components/dashboard/bookings/BookingQueuePage.tsx`:
- Three sections, each a `<BookingSection title="..." items={...} />`: "Precisa de ação", "Hoje", "Próximos dias"
- Each card in "Precisa de ação" and "Próximos dias" shows its own date inline (e.g. "Hoje · 10:00", "Amanhã · 09:00", "Qui, 18 de junho · 09:00") since these sections span multiple days — "Hoje" cards show time only (date is implied by the section)
- Empty state per section: "Nenhum agendamento precisa de ação." / "Nenhum agendamento confirmado para hoje." / "Nenhum agendamento confirmado nos próximos dias." (pt-BR, not an error)
- Week-strip (`plan/journey/staff/prototypes/agenda/00-agenda.html`'s `.week-strip`) is a visual "this week at a glance" overview, NOT a filter — clicking "Hoje" scrolls to the Hoje section; clicking any future day scrolls to "Próximos dias" (an approximation — see `agenda.md` open question "Week-strip click target for future days"; a future PENDING booking for that day actually lives in "Precisa de ação", not "Próximos dias")

`apps/web/components/dashboard/bookings/BookingCard.tsx`:
- Customer name (truncated with ellipsis if long)
- Service names joined ", "
- Scheduled time, with date prefix when the card is in "Precisa de ação" or "Próximos dias" (see above)
- Total price + duration
- Status badge (`.status-pending` / `.status-info` / `.status-approved`)
- INFO_REQUESTED card has blue left border (matches prototype `border-left: 3px solid var(--ba-primary)`)
- "Hoje" section cards show "Marcar concluído" as the primary quick action (links into `M13-S20`'s flow) instead of "Aprovar"
- "Próximos dias" section cards have **no quick actions at all** — read-only, nothing to do until the day arrives (matches prototype's `opacity: 0.7`, non-link card)
- Entire card is a link → `/dashboard/bookings/:bookingId` (except "Próximos dias" cards, which are not links)

**Acceptance criteria:**
- [ ] Page renders three sections from three `fetchStaffBookings` calls, in the order: Precisa de ação, Hoje, Próximos dias
- [ ] "Precisa de ação" includes bookings from any date, sorted by `scheduledAt ASC`, each showing its date inline
- [ ] PENDING cards rendered with correct badge + no left border accent
- [ ] INFO_REQUESTED cards rendered with blue left border accent (see prototype)
- [ ] "Hoje" section only shows today's APPROVED bookings; primary action is "Marcar concluído"
- [ ] "Próximos dias" cards render with no quick actions and are not clickable links
- [ ] Empty state renders pt-BR message per section (not a JS error)
- [ ] Each actionable card links to `/dashboard/bookings/:bookingId`
- [ ] Customer name with long text is truncated (ellipsis) — does not break card layout
- [ ] Page is protected by `M13-S15` middleware — unauthenticated access redirects
- [ ] No decorative filter tabs (Pendentes/Confirmados/Todos) — removed in the 2026-06-16 redesign; the sections themselves are the filter

**Dependencies:** M13-S15, M13-S03

---

### M13-S18 — Booking detail page + all action flows (`/dashboard/bookings/[id]`) ✅ Done

*(formerly M125-S05)*

**Agent:** `frontend-ts`
**Complexity:** L
**Docs to load:** `docs/04-USE_CASES.md` § UC-003, UC-004, UC-005, `plan/journey/staff/prototypes/agenda/01-booking-detail.html`, `plan/journey/staff/prototypes/agenda/01b-slot-conflict.html`

**Description:**
The booking detail page where staff triage pending requests. The shipped implementation keeps the user on `/dashboard/bookings/[id]`, uses localized copy throughout, and handles approve / reject / request info inline. Approval has an error branch for slot conflict. Later lifecycle actions are split into `M13-S19` and `M13-S20`.

> 🔍 **Discover before starting:** Confirm the BFF action endpoints are wired correctly: `PATCH /v1/bookings/:id/approve`, `PATCH /v1/bookings/:id/reject`, `PATCH /v1/bookings/:id/request-info`. These were built in M08/M09 and should exist. Verify their exact request bodies and error codes (409 for slot conflict, 422 for validation). Also check whether `@ikaro/types` has `ApproveBookingRequest`, `RejectBookingRequest`, `RequestMoreInfoRequest` — M12-S07 explicitly dropped these ("re-added when the dashboard story is built"). They need to be re-added here.

**Prototype references:**
- `plan/journey/staff/prototypes/agenda/01-booking-detail.html` — main detail + action panel + bottom sheets
- `plan/journey/staff/prototypes/agenda/01b-slot-conflict.html` — slot conflict (UC-003 A1)
- `plan/journey/staff/prototypes/agenda/01c-reject-success.html` — rejection confirmed inline state
- `plan/journey/staff/prototypes/agenda/01d-info-success.html` — info request sent inline state

**Route:** `/dashboard/bookings/[id]`

**`@ikaro/types` additions (do first, blocks component work):**
```typescript
// packages/types/src/booking.dto.ts
export interface ApproveBookingRequest { }  // empty body

export interface RejectBookingRequest {
  reason: string;  // max 200 chars, required
}

export interface RequestMoreInfoRequest {
  message: string; // max 200 chars, required
}

export interface ApproveBookingResponse {
  bookingId: string;
  status: 'APPROVED';
  approvedAt: string;
}

export interface SlotConflictSuggestion {
  startsAt: string;  // ISO-8601
  endsAt: string;
}

export interface SlotConflictError {
  error: 'slot-conflict';
  suggestions: SlotConflictSuggestion[];
}
```

**API fetcher additions (`apps/web/lib/api/dashboard/bookings.ts`):**
```typescript
fetchStaffBookingDetail(bookingId: string): Promise<StaffBookingDetailResponse>
approveBooking(bookingId: string): Promise<ApproveBookingResponse>
// 409 → parse body as SlotConflictError
rejectBooking(bookingId: string, reason: string): Promise<void>
requestMoreInfo(bookingId: string, message: string): Promise<void>
```

**Implemented files / current shape:**
- `apps/web/app/dashboard/(protected)/bookings/[id]/page.tsx` fetches the detail payload and renders `<BookingDetailPage />`.
- `apps/web/components/dashboard/bookings/BookingDetailPage.tsx` coordinates triage state, topbar badge sync, and the inline success/error banners.
- `apps/web/components/dashboard/bookings/BookingDetailMain.tsx` renders the read-only booking body.
- `apps/web/components/dashboard/bookings/BookingActionPanel.tsx` provides the pending/info-request action buttons and mobile bottom bar.
- `apps/web/components/dashboard/bookings/RejectBookingSheet.tsx` and `RequestInfoSheet.tsx` handle the two sheet-based actions.
- `apps/web/components/dashboard/bookings/SlotConflictAlert.tsx` handles approve retries when the slot is no longer available.

**Acceptance criteria delivered:**
- [x] `/dashboard/bookings/[id]` renders the detail page from the BFF payload and keeps the flow localized
- [x] Topbar status badge follows the booking state while the page is open and resets when leaving the route
- [x] "Aprovar" calls the approve mutation and shows the inline success state on return
- [x] `409` approval conflicts render slot suggestions and retry with the selected slot
- [x] "Rejeitar" opens the sheet, validates the reason, and shows the rejection success state
- [x] "Pedir info" opens the sheet, validates the message, and shows the info-request success state
- [x] `INFO_REQUESTED` hides the request-info action while keeping approve/reject available
- [x] The page keeps the user on the detail route after action and exposes a back link to the queue

**Dependencies:** M13-S15, M13-S04

---

### M13-S19 — Booking lifecycle: cancel + reschedule (UC-008) ✅ Done

*(formerly M125-S11)*

**Agent:** `frontend-ts`
**Complexity:** M
**Docs to load:** `docs/04-USE_CASES.md` § UC-008, `plan/journey/staff/prototypes/agenda/03-booking-detail-approved.html`, `05-reschedule.html`, `05b-reschedule-conflict.html`, `dev-notes.md`

**Description:**
Approved-booking lifecycle actions. The shipped implementation keeps the same detail shell from `M13-S18`, but when `booking.status === 'APPROVED'` the action panel switches to the lifecycle actions: complete, reschedule, and cancel. Cancel stays inline as a sheet; reschedule is a dedicated route; complete routes to `M13-S20`. Booking stays `APPROVED` after a reschedule — it is not a status transition.

> 🔍 **Implementation note:** the shipped reschedule flow is the nested `/dashboard/bookings/[id]/reschedule` route. It reuses the shared availability primitives (`AvailabilityCarousel` + `SlotPicker`) and `SlotConflictAlert`; do not reintroduce a modal/sheet variant or a separate `AvailabilityCalendar`-based component here.

**Prototype references:**
- `plan/journey/staff/prototypes/agenda/03-booking-detail-approved.html` — APPROVED branch of the detail page + inline cancel sheet
- `plan/journey/staff/prototypes/agenda/03b-cancel-success.html` — cancel success inline state
- `plan/journey/staff/prototypes/agenda/05-reschedule.html` — calendar + "Revisar reagendamento" summary
- `plan/journey/staff/prototypes/agenda/05b-reschedule-conflict.html` — 409 conflict + adjacent slot suggestions
- `plan/journey/staff/prototypes/agenda/05c-reschedule-success.html` — reschedule success inline state (booking stays APPROVED, panel returns)

**Route:** `/dashboard/bookings/[id]` (same route as `M13-S18`, branched by status) + `/dashboard/bookings/[id]/reschedule`

**`@ikaro/types` additions (`packages/types/src/booking.dto.ts`):**
```typescript
export interface CancelBookingAsAdminRequest { bookingId: string; reason?: string; }
export interface CancelBookingAsAdminResponse { id: string; status: 'CANCELLED'; cancelledAt: string; }
export interface RescheduleBookingRequest { bookingId: string; scheduledAt: string; adminNotes?: string; }
export interface RescheduleBookingResponse { id: string; status: 'APPROVED'; scheduledAt: string; }
```

**API fetcher additions (`apps/web/lib/api/dashboard/bookings.ts`):**
```typescript
cancelBookingAsAdmin(bookingId: string, reason?: string): Promise<CancelBookingAsAdminResponse>
rescheduleBooking(bookingId: string, scheduledAt: string, adminNotes?: string): Promise<RescheduleBookingResponse>
// 409 → parse body as SlotConflictError (same shape as approve's 409, reused)
```

**Implemented files / current shape:**
- `apps/web/components/dashboard/bookings/BookingDetailPage.tsx` branches the action panel by status and routes approved actions to the nested pages.
- `apps/web/components/dashboard/bookings/AdminCancelBookingSheet.tsx` handles the optional cancel reason inline.
- `apps/web/components/dashboard/bookings/RescheduleBookingPage.tsx` is the dedicated route-based reschedule flow.
- `apps/web/components/dashboard/bookings/SlotConflictAlert.tsx` is reused for reschedule conflicts as well as approve conflicts.

**Acceptance criteria delivered:**
- [x] Approved bookings expose complete, reschedule, and cancel actions from the same detail shell
- [x] Cancel opens the inline sheet; the reason is optional
- [x] Reschedule uses the dedicated route and shows current slot, new slot picker, notes, and inline success state
- [x] `409` reschedule conflicts fetch alternate slots and retry from the chosen suggestion
- [x] After reschedule, booking remains `APPROVED` and the topbar badge stays synced
- [x] The approved-state actions reuse the same dashboard shell and localization patterns as `M13-S18`

**Dependencies:** M13-S15, M13-S18, M12 (`AvailabilityCarousel` / `SlotPicker` reuse)

---

### M13-S20 — Mark booking complete (UC-009)

*(formerly M125-S12)*

**Agent:** `frontend-ts`
**Complexity:** M
**Docs to load:** `docs/04-USE_CASES.md` § UC-009, `plan/journey/staff/prototypes/agenda/04-mark-complete.html`, `04b-complete-success.html`

**Description:**
The "Marcar concluído" action from the approved booking lifecycle. The shipped implementation uses a dedicated `/dashboard/bookings/[id]/complete` route rather than a popup or sheet. Staff can adjust the actual price charged per line, add notes, and confirm completion. Triggers loyalty point earning server-side (computed from `pointsValueAtBooking`, unaffected by `actualPriceCharged`).

> 🔍 **Discover before starting:** Confirm the after-service photo upload reuses the same GCS signed-URL upload component/pattern as the guest/customer "before" photos (M115-S01), not a new implementation. This is still missing in the current frontend shape.

**Prototype references:**
- `plan/journey/staff/prototypes/agenda/04-mark-complete.html` — per-line price editor + photo upload + notes
- `plan/journey/staff/prototypes/agenda/04b-complete-success.html` — completion success inline state (cotado vs. cobrado summary)

**Route:** `/dashboard/bookings/[id]/complete`

**`@ikaro/types` additions (`packages/types/src/booking.dto.ts`):**
```typescript
export interface CompleteBookingLineInput { lineId: string; actualPriceCharged: number; }
export interface CompleteBookingRequest {
  bookingId: string;
  lines: CompleteBookingLineInput[];   // required, one entry per line, even if unchanged
  afterServicePhotoUrls?: string[];
  adminNotes?: string;
}
export interface CompleteBookingResponse {
  id: string; status: 'COMPLETED'; completedAt: string; totalActualPrice: number;
}
```

> Note: `M13-S12` extends `CompleteBookingRequest` with an optional `discountByPoints` field for the loyalty redemption strip — see `M13-S26`.

**API fetcher additions (`apps/web/lib/api/dashboard/bookings.ts`):**
```typescript
completeBooking(body: CompleteBookingRequest): Promise<CompleteBookingResponse>
// PATCH /v1/bookings/:id/complete
```

**Implemented files / current shape:**
- `apps/web/app/dashboard/(protected)/bookings/[id]/complete/page.tsx` exposes the completion route.
- `apps/web/components/dashboard/bookings/MarkCompleteBookingPage.tsx` handles the per-line charged-price editor, totals, notes, and success state.

**Acceptance criteria delivered:**
- [x] Each line's charged amount defaults to `priceAtBooking` and updates the live total immediately
- [x] Confirming with unchanged values submits every line explicitly, not a partial patch
- [x] The completion route stays localized and uses the shared dashboard shell styling
- [x] `200` shows the inline green completion summary and updates the topbar badge to `COMPLETED`
- [x] Cancel/back navigation returns to the bookings queue without requiring a refresh

**Remaining work:**
- [ ] After-service photo upload is still missing and remains a follow-up for the completion flow

**Validated Playwright coverage (`apps/web/e2e/staff-booking-lifecycle.spec.ts`):**
- Queue card body still opens booking detail
- Queue quick approve keeps the staff on the queue and removes the pending action
- Reject happy path shows the inline rejection summary and the right-side action panel
- Request info happy path shows the inline info-request summary and the right-side action panel
- Complete success shows the centered summary and the right-side action panel
- Reschedule success shows a full De/Para summary and the action panel on the right
- Cancel success keeps the message centered and the back action in the right panel

**Playwright coverage implemented for M13-S20:**

| Scenario | Setup | Assertion |
|---|---|---|
| Approve happy path | Open a pending booking detail page | Clicking approve submits once, shows the inline approved state, and updates the status badge to `APPROVED` |
| Approve 409 conflict | Stub the approve mutation to return a slot conflict | The page shows the conflict card, renders alternate slots, and retrying with a suggestion succeeds |
| Reject happy path | Open a pending booking detail page | Reject sheet submits the reason, then shows the rejected success state and badge |
| Reject validation error | Return `400` with `violations` for `reason` | The inline validation message is shown and the sheet stays open |
| Request info happy path | Open a pending booking detail page | Request-info sheet submits, then shows the info-requested success state and badge |
| Request info validation error | Return `400` with `violations` for `message` | The inline validation message is shown and the sheet stays open |
| INFO_REQUESTED visibility | Open a booking already in `INFO_REQUESTED` | The request-info button is hidden; approve and reject remain visible |
| Approved actions visible | Open an approved booking detail page | The lifecycle actions are visible and the complete/reschedule routes are reachable |
| Cancel happy path | Open an approved booking detail page | Cancel sheet submits and shows the cancelled success state |
| Reschedule happy path | Open the reschedule route from an approved booking | Picking a new slot and confirming shows the rescheduled success state, and status remains `APPROVED` |
| Reschedule 409 conflict | Force a slot conflict during reschedule | The page fetches alternate slots, shows the conflict alert, and retrying with a suggestion succeeds |
| Complete happy path | Open the complete route from an approved booking | Editing one or more line prices then confirming shows the completion success state |
| Complete unchanged prices | Leave all line prices untouched | The request still sends every line with the original value and completes successfully |
| Complete validation error | Stub a backend validation failure | The error message is shown and the form remains editable |
| Queue quick approve happy path | Open `/dashboard/bookings` and click `Aprovar` on an action-needed card | The mutation runs directly from the queue, the card no longer opens detail for that action, and the booking disappears from the action-needed section after refresh/invalidation |
| Queue card still opens detail | Open `/dashboard/bookings` and click the card body, not the button | The card continues to navigate to `/dashboard/bookings/[id]` so the shortcut does not replace the existing detail path |
| Queue refresh regression | Approve/reschedule/complete a booking, then navigate back to `/dashboard/bookings` | The queue reflects the new status without requiring an F5 refresh |
| Localization smoke | Open each route in pt-BR | The page copy and action labels remain localized; no hardcoded dashboard strings appear |

**Dependencies:** M13-S15, M13-S18, M13-S19 (entry point), M115-S01 (photo upload pattern)

---

## Phase 5 — Staff schedule & services

---

### M13-S21 — Horários: schedule management page + closure/opening flows

*(formerly M125-S06)*

**Agent:** `frontend-ts`
**Complexity:** L
**Docs to load:** `docs/04-USE_CASES.md` § UC-010, `plan/journey/staff/prototypes/horarios/dev-notes.md`, `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`

**Description:**
Implement the Horários section of the staff dashboard — a weekly schedule view where staff can see approved bookings on a time grid and manage schedule closures (UC-010a, UC-010b) and special openings (UC-010c, UC-010d). All backend and BFF endpoints for this section are already implemented; this is a **frontend-only story**.

> 🔍 **Discover before starting:** Verify that `GET /v1/schedule/closures`, `POST /v1/schedule/closures`, `DELETE /v1/schedule/closures/:id`, `GET /v1/schedule/openings`, `POST /v1/schedule/openings`, and `DELETE /v1/schedule/openings/:id` exist in `apps/bff/src/` and return the shapes described below. Check `GET /v1/bookings?status=APPROVED&from=...&to=...` — this likely exists from `M13-S03`; confirm the `from`/`to` filter params work for a date range. Verify `apps/bff/http/schedule/` exists; if `schedule-openings.http` or `availability.http` are missing, create them as part of this story.

**Prototype reference:** `plan/journey/staff/prototypes/horarios/` (10 screens — `00-schedule.html` through `06-remove-opening.html`)
**Route:** `/dashboard/schedule`

**What to create:**

`apps/web/app/dashboard/schedule/page.tsx` — server component:
- Fetches closures, openings, and approved bookings for current week (Mon–Sun)
- Reads `businessHours` from tenant settings
- Renders `<ScheduleView initialClosures={...} initialOpenings={...} initialBookings={...} businessHours={...} tenantSlug={...} />`

`apps/web/components/schedule/ScheduleView.tsx` — `'use client'`:
- Holds `ScheduleState` (see below)
- Renders `<WeekNav>` (imported from `components/dashboard/WeekNav.tsx` — created in `M13-S17`) above the week strip
- Week strip: Mon–Sun day buttons; selected day shown in time grid below
- Time grid: slots from `businessHours[dayOfWeek].open` to `.close`; closed days → empty state + "Abrir dia especial" CTA
- Booking blocks: blue left border + `--ba-secondary` bg; link to `/dashboard/bookings/[id]`
- Closure blocks: grey hatch (`repeating-linear-gradient 135deg`); click opens `RemoveClosureDialog`
- Booking inside a closure window: orange tint + warning icon (UC-010a A4)
- Open days: FAB `+ Bloquear período` → opens `ClosureFormSheet`
- Closed (business-hours) days: FAB replaced with "Abrir dia especial" CTA → opens `OpeningFormSheet`
- Week strip dots: green dot per day with ≥1 approved booking or a ScheduleOpening; closed days at 40% opacity
- Advancing a week: set `startOfWeek + 7 days`, re-fetch all three lists via client-side BFF calls

```ts
type ScheduleState = {
  startOfWeek: Date;
  selectedDate: Date;
  closureSheet: 'closed' | 'open' | 'submitting' | 'conflict' | 'warning';
  openingSheet: 'closed' | 'open' | 'submitting' | 'conflict';
  removeClosureTarget: ScheduleClosure | null;
  removeOpeningTarget: ScheduleOpening | null;
}
```

`apps/web/components/schedule/ClosureFormSheet.tsx` — shadcn `<Sheet side="bottom">` (desktop: `side="right"`):

| Field | Component | Validation |
|---|---|---|
| `date` | `<Input type="date">` | required; not in the past |
| `reason` | `<Select>` | required; `STAFF_DAY_OFF` / `MAINTENANCE` / `HOLIDAY` |
| `startTime` | `<Input type="time">` | optional; if set, `endTime` required |
| `endTime` | `<Input type="time">` | optional; must be > `startTime` |
| `notes` | `<Textarea>` | optional; max 200 chars |

pt-BR labels: `STAFF_DAY_OFF` → "Folga da equipe", `MAINTENANCE` → "Manutenção", `HOLIDAY` → "Feriado". Empty start/end = full-day (hint: "Vazio = bloqueio do dia inteiro").

Error messages (pt-BR):
- 409 overlap → "Já existe um bloqueio nesse período."
- 409 full-day vs partial → "Conflito com bloqueio parcial existente na mesma data."
- 422 past date → "Não é possível bloquear datas passadas."
- 201 + bookings exist (UC-010a A4) → non-blocking inline warning banner after close: "X agendamento(s) aprovado(s) existe(m) nesse período. Reagende ou cancele manualmente."

`apps/web/components/schedule/RemoveClosureDialog.tsx` — shadcn `<Sheet side="bottom">`, compact confirmation:
- Shows: reason label + formatted date + time range
- "Remover bloqueio" button — destructive red
- `DELETE /v1/schedule/closures/:id` → 204 → close sheet, remove from local state

`apps/web/components/schedule/OpeningFormSheet.tsx` — UC-010c:

| Field | Component | Validation |
|---|---|---|
| `date` | `<Input type="date" readOnly>` | pre-filled from selected closed day |
| `startTime` | `<Input type="time">` | required |
| `endTime` | `<Input type="time">` | required; must be > `startTime` |
| `notes` | `<Textarea>` | optional; max 200 chars |

Error messages (pt-BR):
- 409 → "Já existe uma abertura para esta data."
- 422 past date → "Não é possível abrir datas passadas."
- 422 day already open → "Esse dia já está aberto nas configurações regulares. Ajuste os horários de funcionamento."

`apps/web/components/schedule/RemoveOpeningDialog.tsx` — same pattern as `RemoveClosureDialog`. "Remover abertura" — destructive. 204 → revert day to closed state.

`apps/web/lib/api/schedule.ts`:
```typescript
fetchClosures(params: { from: string; to: string }): Promise<{ closures: ScheduleClosure[] }>
createClosure(body: CreateClosureRequest): Promise<ScheduleClosure>
deleteClosure(id: string): Promise<void>
fetchOpenings(params: { from: string; to: string }): Promise<{ openings: ScheduleOpening[] }>
createOpening(body: CreateOpeningRequest): Promise<ScheduleOpening>
deleteOpening(id: string): Promise<void>
```
Approved bookings for the schedule grid reuse `fetchStaffBookings({ status: 'APPROVED', from, to })` from `lib/api/bookings-staff.ts` (`M13-S03`).

**BFF `.http` gaps (create in this story if missing):**
- `apps/bff/http/schedule/schedule-openings.http` — `POST` and `DELETE /v1/schedule/openings` request blocks
- `apps/bff/http/schedule/availability.http` — `GET /v1/schedule/availability/summary` request block

**`@ikaro/types` additions (new file or extend existing):**
```typescript
export interface ScheduleClosure {
  id: string;
  date: string;
  reason: 'STAFF_DAY_OFF' | 'MAINTENANCE' | 'HOLIDAY';
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
}
export interface ScheduleOpening {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  notes: string | null;
}
export interface CreateClosureRequest {
  date: string;
  reason: 'STAFF_DAY_OFF' | 'MAINTENANCE' | 'HOLIDAY';
  startTime?: string;
  endTime?: string;
  notes?: string;
}
export interface CreateOpeningRequest {
  date: string;
  startTime: string;
  endTime: string;
  notes?: string;
}
```

**Acceptance criteria:**

*View (UC-010):*
- [ ] `/dashboard/schedule` loads with current week's data pre-fetched server-side
- [ ] Week strip shows Mon–Sun; today highlighted; selected day shown in time grid
- [ ] `WeekNav` `‹ junho 2026 ›` above strip; `‹` disabled on current week; `›` advances one week and re-fetches
- [ ] Open days: time grid slots per `businessHours`; closed days: empty state + "Abrir dia especial" CTA
- [ ] Green dot on days with ≥1 approved booking or ScheduleOpening; closed days at 40% opacity

*Create closure (UC-010a):*
- [ ] FAB → `ClosureFormSheet`; date pre-filled from selected day
- [ ] 201 → sheet closes; closure block appears in grid; warning banner if bookings exist (non-blocking)
- [ ] 409 overlap → "Já existe um bloqueio nesse período." inline in sheet
- [ ] 422 past → "Não é possível bloquear datas passadas." inline in sheet

*Remove closure (UC-010b):*
- [ ] Clicking closure block → `RemoveClosureDialog` with reason + date
- [ ] "Remover bloqueio" → 204 → block removed from grid

*Create opening (UC-010c):*
- [ ] "Abrir dia especial" on a closed day → `OpeningFormSheet` with date read-only
- [ ] 201 → day shows opening window in grid
- [ ] 409/422 → pt-BR inline errors

*Remove opening (UC-010d):*
- [ ] Clicking opening block → `RemoveOpeningDialog`
- [ ] "Remover abertura" → 204 → day reverts to closed

*Layout:*
- [ ] BottomNav visible (top-level page)
- [ ] Horários item active in sidebar and bottom nav
- [ ] `tsc --noEmit` passes; `pnpm lint` zero warnings

**Dependencies:** M13-S15 (shell), M13-S03 (`fetchStaffBookings` with APPROVED filter), M13-S17 (`WeekNav` component)

---

### M13-S22 — Serviços: service list page (`/dashboard/services`)

*(formerly M125-S08)*

**Agent:** `frontend-ts`
**Complexity:** S
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `plan/journey/staff/prototypes/servicos/01-servicos-list.html` (reference)

**Description:**
The main service management page — a filterable list of all services (active + inactive) with quick visual indicators and entry points to create or edit.

> 🔍 **Discover before starting:** Check whether a `lib/api/dashboard/services.ts` fetcher file exists. If not, create it. Verify `apps/web/app/dashboard/` folder structure matches `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` — place the route at `/dashboard/services`.

**Prototype reference:** `plan/journey/staff/prototypes/servicos/01-servicos-list.html`
**Route:** `/dashboard/services`

**What to create:**

`apps/web/lib/api/dashboard/services.ts`:
```typescript
fetchStaffServices(): Promise<StaffServiceListResponse>
// GET /v1/services, X-Actor-* headers forwarded, auth cookie
```

`apps/web/app/dashboard/services/page.tsx` — server component:
- Calls `fetchStaffServices()`
- Renders `<ServiceListPage services={data.items} />`

`apps/web/components/dashboard/services/ServiceListPage.tsx` — `'use client'`:
- Filter tabs: **Todos** (N) | **Ativos** (N) | **Inativos** (N) — client-side filter, no re-fetch
- Service cards via `<ServiceCard>` — full list at mount; filtered array on tab change
- Empty state per tab: "Nenhum serviço cadastrado." / "Nenhum serviço ativo." / "Nenhum serviço inativo." (pt-BR)
- FAB (mobile `<1024px`): `+ Criar` → `/dashboard/services/new`; `bottom: 5rem` to clear bottom nav
- Desktop create button (`.topbar-create-btn` pattern — CSS `display:none` / `≥1024px display:inline-flex`): in topbar right area → `/dashboard/services/new`
- Sidebar/bottom-nav cross-links to Agenda/Horários/Fidelidade must point to their real routes (`/dashboard/bookings`, `/dashboard/schedule`, `/dashboard/loyalty`) — the journey-prototype audit found this is the one staff page whose sidebar links were already fully correct; keep it that way.

`apps/web/components/dashboard/services/ServiceCard.tsx`:
- Service name (bold)
- Meta row: duration · price (R$ formatted) · points (pts)
- Pickup badge (`🚗 Coleta`) when `requiresPickupAddress: true`
- Inactive service: `opacity: 0.55`; status chip "Inativo"
- Entire card is a link → `/dashboard/services/[id]/edit`

**Acceptance criteria:**
- [ ] Page renders full list from `fetchStaffServices()`
- [ ] "Todos" tab shows all; "Ativos" shows only `isActive: true`; "Inativos" shows only `isActive: false`
- [ ] Tab counts update correctly when a service was just deactivated (stale data handled by Next.js `revalidatePath` from edit page)
- [ ] Inactive cards render at 55% opacity with "Inativo" chip
- [ ] Pickup badge visible only when `requiresPickupAddress: true`
- [ ] Empty state (zero services) shows pt-BR message, no JS error
- [ ] FAB visible on mobile, hidden on desktop; desktop create button visible on desktop, hidden on mobile
- [ ] Both entry points link to `/dashboard/services/new`
- [ ] Serviços item active in sidebar and bottom nav
- [ ] `tsc --noEmit` passes; `pnpm lint` zero warnings

**Dependencies:** M13-S15 (shell), M13-S05 (BFF endpoints + types)

---

### M13-S23 — Serviços: create service page (`/dashboard/services/new`)

*(formerly M125-S09)*

**Agent:** `frontend-ts`
**Complexity:** S
**Docs to load:** `docs/04-USE_CASES.md` § UC-012, `plan/journey/staff/prototypes/servicos/02-service-create.html`, `plan/journey/staff/prototypes/servicos/02b-service-create-error.html`, `plan/journey/staff/prototypes/servicos/02c-service-create-success.html`

**Description:**
The service creation form. The prototype shows a clean single-page form with two toggles and inline validation for the duplicate-name 409 error, followed by a confirmation state on the list page.

**Prototype references:**
- `plan/journey/staff/prototypes/servicos/02-service-create.html` — happy path
- `plan/journey/staff/prototypes/servicos/02b-service-create-error.html` — 409 duplicate name error state
- `plan/journey/staff/prototypes/servicos/02c-service-create-success.html` — post-create success state on the list page

> **AC addition folded in during consolidation:** the original draft of this story specified the redirect-to-list behavior but no explicit confirmation that creation succeeded — the journey-prototype audit found the list page had no success state at all. The prototype now has `02c-service-create-success.html` (list page + inline green banner confirming the new service); replicate that exact pattern below rather than a bare redirect.

**Route:** `/dashboard/services/new`

**`apps/web/lib/api/dashboard/services.ts` additions:**
```typescript
createService(body: CreateServiceRequest): Promise<StaffServiceResponse>
// POST /v1/services → 201; 409 → duplicate name
```

**What to create:**

`apps/web/app/dashboard/services/new/page.tsx` — server component wrapper, renders `<ServiceCreatePage />`.

`apps/web/components/dashboard/services/ServiceCreatePage.tsx` — `'use client'`:

| Field | Input | Validation |
|---|---|---|
| Nome do serviço | `<input type="text">` | required; max 100 chars |
| Descrição | `<textarea>` | optional; max 500 chars |
| Preço | `<input type="number">` with R$ prefix | required; > 0 |
| Duração | `<input type="number">` with "min" suffix | required; integer > 0 |
| Pontos de fidelidade | `<input type="number">` | optional; integer ≥ 0; default 0 |
| Coleta e entrega | toggle (OFF by default) | maps to `requiresPickupAddress` |
| Criar como ativo | toggle (ON by default) | maps to `isActive` |

- Topbar: back arrow → `/dashboard/services` + title "Criar serviço"
- On submit: calls `createService()`
  - `201` → `router.push('/dashboard/services?created=1')` + `revalidatePath('/dashboard/services')` — the list page reads `?created=1` and renders the inline green success banner (per `02c-service-create-success.html`): "Serviço criado com sucesso!" above the list, with the new service visible in it
  - `409` duplicate name → name field gets error state (red border + `#fef2f2` bg) + error message "Já existe um serviço com este nome. Escolha outro nome." (exact text from prototype)
  - Other error → toast "Erro ao criar serviço. Tente novamente."
- Submit button disabled while submitting

**Acceptance criteria:**
- [ ] All 5 fields + 2 toggles render; price shows R$ prefix, duration shows "min" suffix
- [ ] Validation: name required; price and duration must be > 0
- [ ] 201 → redirects to `/dashboard/services?created=1`; new service visible in list; inline green success banner shown once, matching `02c-service-create-success.html`
- [ ] 409 → name field highlighted (red border + light red bg); error message shown inline below field; other fields unchanged
- [ ] "Criar como ativo" toggle defaults to ON; "Coleta e entrega" defaults to OFF
- [ ] Submit button disabled during in-flight request
- [ ] Topbar back arrow returns to `/dashboard/services` without submit
- [ ] Bottom nav visible (mobile); Serviços item active
- [ ] `tsc --noEmit` passes; `pnpm lint` zero warnings

**Dependencies:** M13-S15 (shell), M13-S05 (BFF endpoints + `CreateServiceRequest` type)

---

### M13-S24 — Serviços: edit + deactivate service (`/dashboard/services/[id]/edit`)

*(formerly M125-S10)*

**Agent:** `frontend-ts`
**Complexity:** M
**Docs to load:** `docs/04-USE_CASES.md` § UC-013, `plan/journey/staff/prototypes/servicos/03-service-edit.html`, `plan/journey/staff/prototypes/servicos/03b-deactivate-confirm.html`

**Description:**
The service edit form (pre-filled, price-change warning, status badge in topbar) and the deactivation flow (danger zone → confirmation page → `DELETE /v1/services/:id`).

**Prototype references:**
- `plan/journey/staff/prototypes/servicos/03-service-edit.html` — edit form
- `plan/journey/staff/prototypes/servicos/03b-deactivate-confirm.html` — deactivation confirmation

**Routes:** `/dashboard/services/[id]/edit` and `/dashboard/services/[id]/deactivate`

**`apps/web/lib/api/dashboard/services.ts` additions:**
```typescript
fetchStaffService(serviceId: string): Promise<StaffServiceResponse>
// GET /v1/services/:id

updateService(serviceId: string, body: UpdateServiceRequest): Promise<StaffServiceResponse>
// PATCH /v1/services/:id → 200; 409 → duplicate name

deactivateService(serviceId: string): Promise<void>
// DELETE /v1/services/:id → 204
```

**What to create:**

`apps/web/app/dashboard/services/[id]/edit/page.tsx` — server component:
- Calls `fetchStaffService(id)`; if not found → `notFound()`
- Renders `<ServiceEditPage service={data} />`

`apps/web/components/dashboard/services/ServiceEditPage.tsx` — `'use client'`:
- Topbar: back arrow → `/dashboard/services` + breadcrumb "Serviços" + title "Editar serviço" + status badge ("Ativo" green / "Inativo" grey)
- Same 5 fields as create, pre-filled from `service` prop; **no** `isActive` toggle — status is managed via deactivation flow only
- Price field shows inline warning `.form-warn`: "Só afeta novos agendamentos" (triangle icon, amber colour — exact text from prototype)
- On submit: calls `updateService()`
  - `200` → `router.push('/dashboard/services')` + `revalidatePath`
  - `409` → name field error state (same pattern as `M13-S23`)
  - Other error → toast
- **Danger zone** section (bottom of form, separated by red border-top):
  - Heading: "Zona de perigo"
  - Description: "Desativar este serviço impede novos agendamentos. Agendamentos existentes não são afetados."
  - Button: "Desativar serviço" (destructive style) → navigates to `/dashboard/services/[id]/deactivate`
  - Only shown when `service.isActive === true`

`apps/web/app/dashboard/services/[id]/deactivate/page.tsx` — server component:
- Calls `fetchStaffService(id)` to populate the confirmation card; `notFound()` if missing or already inactive
- Renders `<ServiceDeactivatePage service={data} />`

`apps/web/components/dashboard/services/ServiceDeactivatePage.tsx` — `'use client'`:
- Topbar: back arrow → `/dashboard/services/[id]/edit` + "Editar serviço" breadcrumb + title "Desativar serviço"
- Service summary card: name + meta (duration · price · points)
- Warning box (amber border): three bullet impacts (hides from booking form / existing bookings unaffected / can be reactivated)
- "Confirmar desativação" button (red/destructive): calls `deactivateService()`
  - `204` → `router.push('/dashboard/services')` + `revalidatePath('/dashboard/services')`
  - Error → toast "Erro ao desativar. Tente novamente."
- "Cancelar" button → `router.back()`
- Bottom nav visible; Serviços item active

**Acceptance criteria:**

*Edit (UC-013 main flow):*
- [ ] Form pre-filled with current service data
- [ ] Price field shows amber inline warning "Só afeta novos agendamentos"
- [ ] `200` → redirects to list; updated service visible
- [ ] `409` → name field error inline; other fields unchanged
- [ ] Status badge in topbar reflects `isActive`

*Deactivate (UC-013 A1):*
- [ ] Danger zone visible only when `isActive: true`
- [ ] "Desativar serviço" navigates to `/dashboard/services/[id]/deactivate`
- [ ] Deactivation confirmation page shows service card + impact bullets
- [ ] `204` → redirects to list; service shown at 55% opacity with "Inativo" chip
- [ ] "Cancelar" returns to edit page without changes

*Layout:*
- [ ] Both pages: back arrow in topbar; bottom nav visible; Serviços active in nav
- [ ] `tsc --noEmit` passes; `pnpm lint` zero warnings

**Dependencies:** M13-S15 (shell), M13-S05 (BFF endpoints + types), M13-S22 (`revalidatePath` target)

---

## Phase 6 — Staff loyalty frontend

---

### M13-S25 — Frontend: `/dashboard/loyalty` — customer search + loyalty detail pages

*(formerly M128-S03)*

**Agent:** `frontend-ts`
**Complexity:** M
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `plan/journey/staff/fidelidade.md`, `plan/journey/staff/prototypes/fidelidade/dev-notes.md`

**Description:**
Two pages under a new `/dashboard/loyalty` route. The search page lets staff find any customer by name/email; the detail page shows their active balance (with currency equivalent), earning history tab (active vs. expired entries), and redemption history tab.

> 🔍 **Discover before starting:**
> - Confirm `M13-S12` has shipped: `GET /v1/customers?search=` and enriched balance response exist.
> - Check `apps/web/app/dashboard/` structure — place new route at `loyalty/`.
> - Confirm `apps/web/lib/api/dashboard/` convention (flat files or per-module folders).
> - `apps/web/lib/api/dashboard/loyalty.ts`'s local `LoyaltyBalanceResponse` (`currentPoints`/`nextExpiryDate`) does **not** match `@ikaro/types`'s same-named export (`tenantId`/`activePoints`/`entries` — verified dead, zero real consumers). Fix `@ikaro/types` first, don't blindly import it — see `td/TD09-WEB-TYPES-DRIFT-VS-IKARO-TYPES.md`.

**Prototype references:**
- `plan/journey/staff/prototypes/fidelidade/00-customer-search.html`
- `plan/journey/staff/prototypes/fidelidade/01-customer-loyalty.html`
- `plan/journey/staff/prototypes/fidelidade/01b-no-entries.html`
- `plan/journey/staff/prototypes/fidelidade/01c-no-results.html`

---

**`apps/web/lib/api/dashboard/loyalty.ts`:**
```typescript
searchCustomers(term: string): Promise<CustomerSearchListResponse>
// GET /v1/customers?search=:term&limit=20

fetchCustomerLoyaltyBalance(customerId: string): Promise<EnrichedLoyaltyBalanceResponse>
// GET /v1/customers/:customerId/loyalty/balance

fetchCustomerLoyaltyEntries(customerId: string, page?: number): Promise<PaginatedLoyaltyEntriesResponse>
// GET /v1/customers/:customerId/loyalty/entries?page=:page&limit=20

fetchCustomerLoyaltyRedemptions(customerId: string, page?: number): Promise<PaginatedLoyaltyRedemptionsResponse>
// GET /v1/customers/:customerId/loyalty/redemptions?page=:page&limit=20
```

---

**`apps/web/app/dashboard/loyalty/page.tsx`** — server component:
- Reads `searchParams.customerId` (optional)
- If no `customerId`: renders `<LoyaltySearchPage />`
- If `customerId` present: fetches balance + entries + redemptions in parallel (`Promise.all`), renders `<CustomerLoyaltyPage balance={...} entries={...} redemptions={...} />`
- 404 if `customerId` given but backend returns 404

**`apps/web/components/dashboard/loyalty/LoyaltySearchPage.tsx`** — `'use client'`:
- Search input with debounce (300ms)
- On empty: "Clientes recentes" — `GET /v1/customers?search=&limit=5` (most recent, sorted by last booking date)
- On search: live results as user types
- Each result row: avatar (initials), name, email, `currentPoints` badge; entire row → `router.push('/dashboard/loyalty?customerId=:id')`
- No results state (per `01c-no-results.html`)

**`apps/web/components/dashboard/loyalty/CustomerLoyaltyPage.tsx`** — `'use client'` (manages tab state):
- Customer header: avatar + name + email
- **Balance card** (blue gradient per prototype):
  - `currentPoints` (large number)
  - If `nextExpiryDate`: amber inline strip "X pts expiram em DD MMM YYYY"
  - `conversionRate > 0`: "N pts = R$1 · Valor total: R$ X"
  - `conversionRate === 0`: no conversion line (feature disabled)
- **Tab bar**: "Histórico de ganhos" | "Resgates"
- **Earnings tab** (`LoyaltyEntryItem[]`): sorted `earnedAt DESC`; active entries normal weight; expired entries `opacity: 0.45` with "expirado" badge; "+N pts" right-aligned in green
- **Redemptions tab** (`LoyaltyRedemptionItem[]`): `redeemedAt DESC`; each row shows pts redeemed, amount saved, linked booking ref when `bookingId` present; "−N pts" right-aligned in red
- "Carregar mais" button per tab when `total > items.length` (calls fetcher with `page + 1`, appends results)
- **Zero entries state** (per `01b-no-entries.html`): muted balance card (grey) + "Nenhum ponto acumulado ainda"

**Validation (per SonarCloud rules):**
```typescript
interface Props {
  readonly balance: EnrichedLoyaltyBalanceResponse;
  readonly entries: PaginatedLoyaltyEntriesResponse;
  readonly redemptions: PaginatedLoyaltyRedemptionsResponse;
}
```

**Testing:** `app/**/page.tsx` — no unit tests (Playwright E2E). No Vitest tests needed for this story.

**Acceptance criteria:**
- [ ] `GET /dashboard/loyalty` renders search input + "Clientes recentes" list
- [ ] Typing in search field debounces 300ms and updates results
- [ ] No results for unknown term → "Nenhum cliente encontrado" empty state
- [ ] Clicking a customer row navigates to `/dashboard/loyalty?customerId=:id`
- [ ] Balance card shows `currentPoints`, expiry strip (when `nextExpiryDate != null`), conversion line (when `conversionRate > 0`)
- [ ] "Histórico de ganhos" tab: active entries normal, expired at 45% opacity with badge
- [ ] "Resgates" tab: each redemption shows pts, amount saved, booking ref (when present)
- [ ] "Carregar mais" appends next page without replacing current results
- [ ] Zero entries state renders without JS error
- [ ] Fidelidade item active in sidebar navigation
- [ ] `tsc --noEmit` passes; `pnpm lint` zero warnings

**Dependencies:** M13-S12, M13-S15 (dashboard shell + sidebar Fidelidade nav item — already included from the start per `M13-S15`'s fix note)

---

### M13-S26 — Frontend: loyalty strip in completion route (UC-009 A6)

*(formerly M128-S04)*

**Agent:** `frontend-ts`
**Complexity:** S
**Docs to load:** `docs/04-USE_CASES.md` § UC-009 A6, `plan/journey/staff/prototypes/agenda/04-mark-complete.html`

**Description:**
Extends the `MarkCompleteBookingPage` component (built in `M13-S20`) with the loyalty redemption strip. Visible only when `booking.customerId != null` AND `conversionRate > 0`. Staff enters points to use (or clicks "Usar todos"), sees the BRL discount live, and the discount is included in the completion request body.

> 🔍 **Discover before starting:**
> - Confirm `M13-S20` shipped `MarkCompleteBookingPage`. Read it in full before adding anything.
> - Confirm `StaffBookingDetailResponse` (from `M13-S04`) includes `loyaltyBalance: number | null` and `loyaltyConversionRate: number` (added per `M13-S04`'s note, sourced from `M13-S12`).
> - Read `apps/web/lib/api/dashboard/bookings.ts` `completeBooking()` fetcher — confirm it accepts `CompleteBookingRequest` from `@ikaro/types` and that `discountByPoints` is now in the type (added in `M13-S12`).

**Prototype reference:** `plan/journey/staff/prototypes/agenda/04-mark-complete.html` (loyalty strip section)

**What to add to `MarkCompleteBookingPage`:**

Condition: `props.loyaltyBalance !== null && props.loyaltyBalance > 0 && props.conversionRate > 0`

If condition is false (guest booking or feature disabled): loyalty strip not rendered.

**`LoyaltyRedemptionStrip` component** (inline or separate file):

```
Props:
  availablePoints: number          // booking.loyaltyBalance
  conversionRate: number           // pointsPerCurrencyUnit
  linesTotalAmount: number         // live sum of actualPriceCharged across lines
  onChange: (discount: { pointsUsed: number; amountDeducted: number } | null) => void
```

Layout (per prototype):
- Blue-tinted card section
- Header: "João tem N pontos disponíveis" + pts badge + "= R$X" hint
- Input: `[____] pts = R$ X` (live conversion as user types) + "Usar todos" button
- Validation:
  - `pointsUsed ≤ availablePoints`
  - `amountDeducted = Math.floor(pointsUsed / conversionRate)`
  - Cap: `amountDeducted` cannot exceed `linesTotalAmount` (discount ≤ booking total)
- When `pointsUsed > 0`: discount row appears below the lines total: "Desconto fidelidade (N pts): − R$X"
- Final total = `linesTotalAmount - amountDeducted`

**`MarkCompleteBookingPage` state additions:**
```typescript
discountByPoints: { pointsUsed: number; amountDeducted: number } | null
```

On confirm: pass `discountByPoints` to `completeBooking()` fetcher.

**Acceptance criteria:**
- [ ] Loyalty strip not rendered for guest bookings (`loyaltyBalance === null`)
- [ ] Loyalty strip not rendered when `conversionRate === 0`
- [ ] Points input accepts integer values; "Usar todos" fills maximum valid amount
- [ ] `amountDeducted` live-updates as user types points
- [ ] Discount is capped at lines total (cannot go below R$0)
- [ ] Discount row appears in the totals section when `pointsUsed > 0`
- [ ] On confirm: `completeBooking()` called with `discountByPoints` when points are applied
- [ ] On confirm: `completeBooking()` called without `discountByPoints` when strip is unused
- [ ] Completion success banner shows loyalty discount row when discount was applied
- [ ] `tsc --noEmit` passes; `pnpm lint` zero warnings

**Dependencies:** M13-S20 (base `MarkCompleteBookingPage`), M13-S12 (`CompleteBookingRequest` type with `discountByPoints`)

---

## Phase 7 — Customer Minha Conta

> **Discovery note (applies to this entire phase):** Several BFF endpoints were built in M08/M09 for guest/admin flows and may already serve the CUSTOMER role. Every story that touches the BFF (already covered in Phase 1's `M13-S06`–`M13-S08`) had a "🔍 Discover before starting" callout. Read the existing controller before writing new code — the story scope may have shrunk to type additions only.

---

### M13-S27 — Minha Conta home + booking list page (`/{slug}/my-account`)

*(formerly M126-S03)*

**Agent:** `frontend-ts`
**Complexity:** M
**Docs to load:** `docs/04-USE_CASES.md` § UC-006, UC-016
**Prototype references:**
- `plan/journey/shared/customer-dashboard.html` — Início tab (stat cards + upcoming preview)
- `plan/journey/customer/prototypes/minha-conta/01-minha-conta.html` — Agendamentos tab (3 sections)
- `plan/journey/customer/prototypes/minha-conta/01b-minha-conta-empty.html` — empty state

> **Naming note:** prototypes above stay pt-BR (`minha-conta`, conceptual mockups). All production identifiers below — route, files, components — use the English `my-account`, per the code-standards English-only rule, established in `M13-S42`.

**Description:**
The customer's home — a single route with two tab views. The "Início" tab shows summary stats and a preview of upcoming/pending bookings. The "Agendamentos" tab shows the full sectioned list. Both views are rendered client-side from the same server-fetched data.

> 🔍 **Discover before starting:** Confirm that `CustomerBookingListResponse` and `CustomerLoyaltyBalanceResponse` from `M13-S06` are available in `packages/types/`. Verify `apps/web/lib/api/` — check whether a customer fetcher file already exists (`customer.ts`, `my-account.ts`). Follow the convention already in place.

**What to create:**

`apps/web/lib/api/my-account.ts`:
```typescript
fetchCustomerBookings(): Promise<CustomerBookingListResponse>
// GET /v1/bookings — no status filter; all statuses returned, split client-side
// Sends auth cookie + X-Actor-* headers

fetchLoyaltyBalance(): Promise<CustomerLoyaltyBalanceResponse>
// GET /v1/loyalty/balance
```

`apps/web/app/[slug]/my-account/page.tsx` — server component:
- Calls `fetchCustomerBookings()` and `fetchLoyaltyBalance()` in parallel (`Promise.all`)
- On fetch error → render error boundary (not a crash)
- Renders `<MyAccountPage bookings={items} loyaltyBalance={balance} />`

`apps/web/components/customer/my-account/MyAccountPage.tsx` — `'use client'`:
- Manages `activeTab: 'home' | 'bookings'` state (default: `'home'`)
- Syncs active tab to the shell's tab nav + bottom nav (via props or context)
- Renders `<HomeDashboard>` or `<BookingsList>` based on active tab

`apps/web/components/customer/my-account/HomeDashboard.tsx`:
- Greeting: "Olá, {userName}"
- Stat cards: **Pontos** (`currentPoints`) + **Agendamentos** (`total`)
- Loyalty expiry strip: "X pontos expiram em {nextExpiryDate}" — hidden when `nextExpiryDate` is null
- Upcoming preview: up to 3 most recent APPROVED or PENDING/INFO_REQUESTED bookings as `<BookingListItem>` rows
- "Ver todos os agendamentos →" link → switches to `'bookings'` tab
- "+ Novo agendamento" CTA (mobile) → `/{slug}/booking`

`apps/web/components/customer/my-account/BookingsList.tsx`:
- **Client-side section split** (from one `items` array):
  ```ts
  const upcoming = items.filter(b => b.status === 'APPROVED' && new Date(b.scheduledAt!) >= today);
  const pending  = items.filter(b => b.status === 'PENDING' || b.status === 'INFO_REQUESTED');
  const history  = items.filter(b => ['COMPLETED','CANCELLED','REJECTED'].includes(b.status));
  ```
- Loyalty compact strip at top (points + expiry)
- Three labeled sections with section count badges
- Each section: list of `<BookingListItem>` rows; empty section → section hidden (not empty state)
- All sections empty → `<BookingEmptyState>` (UC-006 A1)

`apps/web/components/customer/my-account/BookingListItem.tsx`:
- Service name(s), date + time, total price, status badge
- For APPROVED: "Cancelar" text link (visible only within cancellation window — UC-006 A2) + links to detail page
- For INFO_REQUESTED: "Responder" text link + status badge (blue)
- For PENDING: "Cancelar solicitação" text link + status badge (yellow)
- For COMPLETED/CANCELLED/REJECTED: read-only, badge only, no action links

**Cancellation window check (UC-006 A2) — client-side:**
```ts
// tenantSettings.booking.cancellationWindowHours loaded from JWT or BFF
const deadline = new Date(booking.scheduledAt!);
deadline.setHours(deadline.getHours() - cancellationWindowHours);
const canCancel = new Date() < deadline;
// canCancel === false → hide "Cancelar" link; show note "Prazo encerrado"
```

`apps/web/components/customer/my-account/BookingEmptyState.tsx` — UC-006 A1:
- Icon + "Nenhum agendamento ainda"
- CTA "Fazer agendamento" → `/{slug}/booking`

**Acceptance criteria:**
- [ ] Page fetches both endpoints in parallel; renders within 2 network round trips
- [ ] Início tab: stat cards show `currentPoints` and `total`; loyalty expiry strip visible when `nextExpiryDate != null`
- [ ] Agendamentos tab: Próximos / Pendentes / Histórico sections contain correct items per status logic
- [ ] Empty sections are hidden; all three empty → `<BookingEmptyState>` shown
- [ ] "Cancelar" on APPROVED item: visible when `now < scheduledAt − windowHours`; hidden with "Prazo encerrado" note otherwise
- [ ] INFO_REQUESTED item shows "Responder" link (not "Cancelar")
- [ ] Status badges match tokens.css: `.status-approved`, `.status-pending`, `.status-info`, `.status-cancelled`
- [ ] Completed items: no action links
- [ ] `tsc --noEmit` passes; `pnpm lint` zero warnings
- [ ] Vitest unit test for the client-side section-split logic (pure function)

**Dependencies:** M13-S16, M13-S06

---

### M13-S28 — Booking detail page + cancel flow + info submit (`/{slug}/my-account/bookings/[id]`)

*(formerly M126-S05)*

**Agent:** `frontend-ts`
**Complexity:** M
**Docs to load:** `docs/04-USE_CASES.md` § UC-006 step 5, UC-007, UC-005 A2
**Prototype references:**
- `plan/journey/customer/prototypes/minha-conta/02-agendamento-detail.html` — APPROVED detail
- `plan/journey/customer/prototypes/minha-conta/02b-agendamento-info-requested.html` — INFO_REQUESTED + response form
- `plan/journey/customer/prototypes/minha-conta/02c-agendamento-historico.html` — COMPLETED read-only
- `plan/journey/customer/prototypes/minha-conta/03-cancel-confirm.html` — cancel confirmation page
- `plan/journey/customer/prototypes/minha-conta/03b-cancel-error.html` — outside window error

> **Naming note:** prototypes above stay pt-BR (`minha-conta`/`agendamento`/`cancelar`, conceptual mockups). All production identifiers below use English (`my-account`, `bookings`, `cancel`), per the code-standards English-only rule, established in `M13-S42`.

**Description:**
The booking detail page for a customer. The page adapts based on status: APPROVED/PENDING show a cancel action; INFO_REQUESTED shows an info-submit form; COMPLETED/CANCELLED/REJECTED are read-only. Cancel confirmation is a dedicated sub-page (not a JS overlay — static prototype informed this decision).

> 🔍 **Discover before starting:** Confirm `CustomerBookingDetailResponse` from `M13-S07` is available in types. Check `apps/bff/src/bookings/bookings.controller.ts` for `PATCH /v1/bookings/:id/cancel` and `PATCH /v1/bookings/:id/submit-info` — verify both accept CUSTOMER role and return the expected shapes. Check `tenants.settings.booking.cancellationWindowHours` is accessible from the JWT or a BFF settings endpoint; if not, default to `48`.

**What to create:**

`apps/web/lib/api/my-account.ts` (extend from `M13-S27`):
```typescript
fetchCustomerBookingDetail(bookingId: string): Promise<CustomerBookingDetailResponse>
// GET /v1/bookings/:id

cancelBooking(bookingId: string): Promise<void>
// PATCH /v1/bookings/:id/cancel
// 200 → booking now CANCELLED
// 422 → outside window (UC-007 A1)

submitInfo(bookingId: string, message: string): Promise<void>
// PATCH /v1/bookings/:id/submit-info  { message }
// 200 → booking status returns to PENDING
```

`apps/web/app/[slug]/my-account/bookings/[id]/page.tsx` — server component:
- Calls `fetchCustomerBookingDetail(id)`
- `notFound()` on 404; `redirect('/{slug}/login')` on 401/403
- Renders `<BookingDetailPage booking={data} cancellationWindowHours={windowHours} />`

`apps/web/components/customer/my-account/BookingDetailPage.tsx` — `'use client'`:
- Topbar: `← Agendamentos` back link + status badge (updates after action)
- Renders `<BookingDetailMain>` (read-only booking info)
- Conditionally renders:
  - `<CancelAction>` when status is APPROVED (within window) or PENDING/INFO_REQUESTED
  - `<InfoSubmitForm>` when status is INFO_REQUESTED and no `infoResponseMessage` yet
  - Nothing extra when COMPLETED/CANCELLED/REJECTED

`apps/web/components/customer/my-account/BookingDetailMain.tsx` — read-only body:
- Date + time section
- Service lines table: name | duration | price; totals row
- "Suas observações" section: `booking.notes` — hidden when null
- Before-service photos grid (lazy loaded) — hidden when empty array
- After-service photos grid (COMPLETED only) — hidden when empty
- Loyalty points earned banner (COMPLETED only — show if `afterServicePhotoUrls.length > 0` or status COMPLETED)

`apps/web/components/customer/my-account/CancelAction.tsx`:
- "Cancelar agendamento" button → navigates to `/{slug}/my-account/bookings/[id]/cancel`
- Window note: "Cancelamento gratuito até {deadline}" — shown for APPROVED within window

`apps/web/app/[slug]/my-account/bookings/[id]/cancel/page.tsx` — server component:
- Renders `<CancelConfirmPage booking={...} />`

`apps/web/components/customer/my-account/CancelConfirmPage.tsx` — `'use client'`:
- Shows booking summary + warning
- "Confirmar cancelamento" → calls `cancelBooking()`
  - 200 → redirect to `/{slug}/my-account` (booking will appear as CANCELLED in Histórico)
  - 422 → redirect to `/{slug}/my-account/bookings/[id]/cancel/error` (UC-007 A1)
- "Voltar" → `router.back()`

`apps/web/app/[slug]/my-account/bookings/[id]/cancel/error/page.tsx`:
- Renders `<CancelErrorPage>` — static (no action needed, just shows error + "Voltar" + a real `wa.me` WhatsApp contact link, not a placeholder `href="#"` — see `plan/journey/customer/prototypes/minha-conta/03b-cancel-error.html`, fixed during the journey-prototype audit to use the tenant's contact number)

`apps/web/components/customer/my-account/InfoSubmitForm.tsx` — UC-005 A2:
- Shows `infoRequestMessage` (admin's question) in a blue info box
- Textarea for response (required) — error message "Informe sua resposta antes de enviar." when empty
- "Enviar resposta" → calls `submitInfo()`
  - 200 → local state update: hide form, show "Resposta enviada" confirmation, status badge → PENDING
  - Error → inline error message; form stays open

**Bottom nav:** hidden on all detail and cancelar pages (drill-down pages — add `<style>.bottom-nav { display: none !important; }</style>` in layout or `page.tsx`).

**Acceptance criteria:**

*Detail page:*
- [ ] APPROVED detail: shows date, services, notes, cancel button (when within window), before-photos
- [ ] INFO_REQUESTED detail: shows admin's question + `<InfoSubmitForm>`
- [ ] COMPLETED detail: shows after-photos, loyalty points banner, "Fazer novo agendamento" CTA; no cancel button
- [ ] CANCELLED/REJECTED detail: read-only, no action buttons
- [ ] Bottom nav hidden (drill-down)

*Cancel flow (UC-007):*
- [ ] "Cancelar" → navigates to `/cancel` page showing booking summary + warning
- [ ] "Confirmar cancelamento" → `PATCH /cancel` → 200 → redirect to my-account list
- [ ] `PATCH /cancel` 422 → redirect to `/cancel/error` with "Prazo encerrado" message + working WhatsApp contact link

*Info submit (UC-005 A2):*
- [ ] INFO_REQUESTED booking shows `infoRequestMessage` + textarea form
- [ ] Submit disabled when textarea empty
- [ ] 200 → form replaced with "Resposta enviada" confirmation; status badge updates to PENDING
- [ ] Network error → inline error; form remains usable

*Types:*
- [ ] `cancelBooking`, `submitInfo` fetchers in `apps/web/lib/api/my-account.ts`
- [ ] `tsc --noEmit` passes; `pnpm lint` zero warnings

**Dependencies:** M13-S16, M13-S27, M13-S07

---

### M13-S29 — Frontend: Fidelidade page (`/{slug}/my-account/loyalty`)

*(formerly M126-S07)*

**Agent:** `frontend-ts`
**Complexity:** M
**Docs to load:** `docs/04-USE_CASES.md` § UC-016, `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`
**Prototype references:**
- `plan/journey/customer/prototypes/minha-conta/04-fidelidade.html` — full view with tabs
- `plan/journey/customer/prototypes/minha-conta/04b-fidelidade-empty.html` — 0 pts empty state

> **Naming note:** prototypes above stay pt-BR (`minha-conta`/`fidelidade`, conceptual mockups). All production identifiers below use English (`my-account`, `loyalty`), per the code-standards English-only rule, established in `M13-S42`.

**Description:**
The customer's own loyalty history page — a full view of their balance, earning entries, and redemption history. Accessed by tapping the loyalty strip on the Minha Conta home page or the "Fidelidade" tab in the nav bar.

> **Dependency fix applied during consolidation:** the original draft listed this story's data dependencies as just the balance + entries/redemptions BFF calls (`M13-S06`, `M13-S08`), which would have let it ship before the loyalty conversion-rate field existed — its own "10 pts = R$ 1,00" conversion row would have had nothing real to read. `M13-S12` (which adds `conversionRate` to the balance response) is now an explicit dependency; since `M13-S12` is in Phase 1, it's already satisfied by the time this phase starts.

> 🔍 **Discover before starting:**
> - Confirm `M13-S08` types (`CustomerLoyaltyEntriesResponse`, `CustomerLoyaltyRedemptionsResponse`) are in `packages/types/`.
> - Confirm `CustomerLoyaltyBalanceResponse` from `M13-S06` (including `conversionRate` from `M13-S12`) is available.
> - Check `apps/web/lib/api/my-account.ts` — extend it rather than creating a new file.
> - The "10 pts = R$ 1,00" conversion row's UI was carried over from the prototype with only an inline comment caveat — the journey-prototype audit flagged it should be explicitly verified against UC-016's actual MVP scope (CLAUDE.md describes the loyalty MVP as points-balance only). Confirm with product before shipping the conversion row as-is; it is gated on `conversionRate > 0` either way, so tenants with redemption disabled never see it.

**What to create:**

`apps/web/lib/api/my-account.ts` (extend from `M13-S27`):
```typescript
fetchLoyaltyEntries(limit?: number): Promise<CustomerLoyaltyEntriesResponse>
// GET /v1/loyalty/entries?limit=50

fetchLoyaltyRedemptions(limit?: number): Promise<CustomerLoyaltyRedemptionsResponse>
// GET /v1/loyalty/redemptions?limit=50
```

`apps/web/app/[slug]/my-account/loyalty/page.tsx` — server component:
- Calls `fetchLoyaltyBalance()`, `fetchLoyaltyEntries()`, `fetchLoyaltyRedemptions()` in parallel
- Renders `<LoyaltyPage balance={...} entries={...} redemptions={...} conversionRate={...} />`

`apps/web/components/customer/my-account/LoyaltyPage.tsx` — `'use client'`:
- **Balance card** (gradient blue — same pattern as `04-fidelidade.html`):
  - `currentPoints` (large bold number)
  - "pontos ativos" label
  - Expiry strip: "X pts expiram em {date}" — hidden when `nextExpiryDate === null`
  - Conversion row: "10 pts = R$ 1,00 · Valor total: R$ {currentPoints / rate}" — hidden when `conversionRate === 0`
- **Tab bar**: "Histórico de ganhos" | "Resgates"
- **Ganhos tab**: list of `CustomerLoyaltyEntryResponse` rows
  - Service name + date + `+N pts` (green)
  - Expired entries: `opacity: 0.4`, "Expirado" badge, `+N pts` grey
- **Resgates tab**: list of `CustomerLoyaltyRedemptionResponse` rows
  - Description + date + `−N pts` (red) + "Economia: R$ X,XX"
  - Empty resgates: "Nenhum resgate realizado ainda"
- **Empty state** (when `currentPoints === 0 && entries.total === 0`):
  - Muted balance card (0, low opacity)
  - "Nenhum ponto acumulado ainda" + CTA "Agendar agora" → `/{slug}/booking`
- Vitest unit test: `LoyaltyPage.spec.tsx` — key cases: renders balance, tabs switch correctly, empty state shown when both entries and balance are zero

**`CustomerShell` update** (`M13-S16`):
- "Fidelidade" tab nav link (desktop) and bottom-nav item (mobile) must link to `/{slug}/my-account/loyalty`
- Loyalty strip on Minha Conta home (`01-minha-conta.html`) is a link → this page

**Acceptance criteria:**
- [ ] `GET /{slug}/my-account/loyalty` renders balance card with `currentPoints`
- [ ] Expiry strip visible when `nextExpiryDate != null`; hidden otherwise
- [ ] Conversion row visible when `conversionRate > 0`; hidden otherwise
- [ ] Ganhos tab: entries shown with service name, date, green `+N pts`; expired entries faded
- [ ] Resgates tab: redemptions shown with `−N pts` and savings amount; empty message when list is empty
- [ ] Empty state (0 pts, no entries): muted balance card + "Agendar agora" CTA
- [ ] "Fidelidade" nav tab active on this page (both desktop and mobile)
- [ ] `tsc --noEmit` passes; `pnpm lint` zero warnings
- [ ] Vitest unit tests pass

**Dependencies:** M13-S16 (shell), M13-S06 (`fetchLoyaltyBalance`), M13-S08 (entries + redemptions BFF), M13-S12 (`conversionRate` enrichment)

---

### M13-S30 — ~~Frontend: UC-023 tenant switch trigger + page~~ — Merged into `M13-S14`

*(formerly M126-S08)*

**Merged into `M13-S14` on 2026-06-24.** During `M13-S14`'s story-discovery session it became clear this story's trigger doesn't need `CustomerShell` (`M13-S16`, not yet built) — it fits into the already-shipped `HotsiteAuthBar` avatar dropdown instead — and it reuses the exact same `TenantOption` card pattern `M13-S14` already needed once `/select-tenant` was descoped. Rather than leave this waiting on `M13-S16` for no real reason, its full scope (BFF `GET /v1/customers/tenants`, the loyalty-balance internal endpoint, `/switch-tenant` page, `HotsiteAuthBar` trigger) was folded into `M13-S14` directly. See that story for the current spec and acceptance criteria.

---

## Phase 8 — Manager workspace

> **Discovery note (applies to this entire phase):** Equipe and Hotsite were confirmed fully backend+BFF-ready by direct code inspection on 2026-06-16 — `GET /staff` already returns active+inactive members, and Hotsite already has every CRUD/publish/image-upload route it needs. Configurações was the exception (no GET endpoint existed for tenant settings) — that gap is already closed by `M13-S09`/`M13-S10` in Phase 1, so by the time this phase starts, all three sub-areas have their backend/BFF readiness in place.

---

### M13-S31 — Configurações: settings form page (`/dashboard/settings`)

*(formerly M127-S03, folds in M128-S05)*

**Agent:** `frontend-ts`
**Complexity:** L
**Docs to load:** `docs/04-USE_CASES.md` § UC-026, `plan/journey/manager/configuracoes.md`, `plan/journey/manager/prototypes/configuracoes/dev-notes.md`

**Description:**
The settings form — five sections matching the prototype: Geral, Agendamento, Fidelidade, Horário de funcionamento, Contato. Scope is exactly what's in the prototype and UC-026 — the backend supports additional fields (`autoApproveEnabled`, `slotGranularityMinutes`, `localization`, etc.) that are **explicitly out of scope** here; see the consolidated open-questions section at the end of this file.

> 🔍 **Discover before starting:** Confirm the exact `TenantSettingsResponse`/`UpdateTenantSettingsRequest` field names against what `M13-S10`/`M13-S12` actually shipped — don't build the form against the UC text or this plan's draft shape, the landed BFF types are the source of truth.

**Prototype reference:** `plan/journey/manager/prototypes/configuracoes/01-settings-form.html` (happy path), `01b-validation-error.html`, `01c-saved-success.html`

**What to create:**

`apps/web/lib/api/dashboard/settings.ts`:
```typescript
fetchTenantSettings(): Promise<TenantSettingsResponse>
updateTenantSettings(body: UpdateTenantSettingsRequest): Promise<TenantSettingsResponse>
```

`apps/web/app/dashboard/settings/page.tsx` — server component: calls `fetchTenantSettings()`, renders `<SettingsForm initial={data} />`.

`apps/web/components/dashboard/settings/SettingsForm.tsx` — `'use client'`, five section cards per the prototype:

| Section | Fields |
|---|---|
| Geral | `name` (editable), `slug` (read-only — gray background, `disabled` input) |
| Agendamento | `cancellationWindowHours` (0–720, suffix "horas"), `serviceBufferMinutes` (0–120, suffix "min") |
| Fidelidade | `loyaltyExpiryDays` (1–3650, suffix "dias"), **`pointsPerCurrencyUnit`** (integer 0–10000, label "Pontos por unidade monetária" — see note below) |
| Horário de funcionamento | `timezone` select + 7 day-rows (open/close time pickers + "Fechado" checkbox per day) |
| Contato | `phone`, `email`, `address` (street/number/complement/neighborhood/city/state/zipCode) — all optional |

> **Field folded in during consolidation (formerly a separate story, M128-S05):** `pointsPerCurrencyUnit` is added directly to the Fidelidade section here rather than as a follow-up story that would touch this same file again right after it ships. Hint text: "Quantos pontos equivalem a 1 unidade monetária (ex: 10 = 10 pts → R$1). Zero desativa o desconto por pontos." Value `0` is accepted (disables the feature); `> 10000` shows inline validation error "Máximo 10000". The field is included in `UpdateTenantSettingsRequest` as of `M13-S12`.

- `SettingsFormSchema` (Zod) mirrors the backend's validation ranges exactly (see table in dev-notes.md)
- On submit: `200` → inline toast "Configurações salvas com sucesso." (stays on page, no redirect — matches `01c-saved-success.html`); `422` → the offending field gets `has-error` styling + inline message, other fields keep their values (matches `01b-validation-error.html`)

**Acceptance criteria:**
- [ ] Form loads pre-filled from `fetchTenantSettings()`
- [ ] `slug` is read-only and visually distinct from editable fields
- [ ] All five sections render with exactly the fields listed above (including `pointsPerCurrencyUnit`) — no more, no less
- [ ] Submitting `cancellationWindowHours > 720` shows an inline error on that field only; other field values are preserved
- [ ] `pointsPerCurrencyUnit` accepts `0`; rejects `> 10000` with inline error "Máximo 10000"; save sends it in the PATCH body
- [ ] Successful save shows a toast and the user stays on `/dashboard/settings`
- [ ] `tsc --noEmit` passes; `pnpm lint` zero warnings

**Dependencies:** M13-S10, M13-S15 (shell + manager-only route guard — see `M13-S32`'s note on extending the middleware), M13-S12 (`pointsPerCurrencyUnit` in `UpdateTenantSettingsRequest`)

---

### M13-S32 — Equipe: team list page (`/dashboard/team`)

*(formerly M127-S04)*

**Agent:** `frontend-ts`
**Complexity:** M
**Docs to load:** `docs/04-USE_CASES.md` § UC-028, UC-029; `plan/journey/manager/equipe.md`; `plan/journey/manager/prototypes/equipe/dev-notes.md`

**Description:**
The team list with Ativo / Convite pendente / Inativo filter tabs. The data model has no dedicated "pending invite" status — both a never-activated invitee and a deactivated former member have `isActive: false`. The list must derive the displayed status client-side.

> 🔍 **Discover before starting:** `GET /staff` (BFF) already exists and returns a `StaffListResponse` (`apps/bff/src/staff/staff.controller.ts`) — confirm via `apps/bff/src/staff/staff.types.ts` whether each list item exposes `googleOAuthId` or `deactivatedBy`. If neither is exposed, this story must add one of them to the BFF response (a small addition here, not a new story) — without it, "Convite pendente" vs. "Inativo" cannot be computed. Also reconcile: `packages/types/src/staff.dto.ts`'s `StaffResponse` differs slightly from the BFF's local `staff.types.ts` shapes — per CLAUDE.md's `@ikaro/types` scope rule (BFF→Frontend contract only), confirm `apps/web` should import from `@ikaro/types`, and align the BFF's local type with it if they've drifted.
>
> **Additionally (found during `M13-S04`):** `apps/web/lib/api/dashboard/staff.ts` *already exists* (from earlier scaffolding) with its own locally-declared `StaffResponse`/`StaffListResponse`/`StaffRole`/`InviteStaffRequest` — don't create a third parallel set of types in the new `team.ts`. Its `InviteStaffRequest` (`firstName`/`lastName`) is the one that actually matches the live `InviteStaffBodySchema`; `@ikaro/types`'s `InviteStaffRequest` (`name`) does not — fix `@ikaro/types` to match the real schema before pointing anything at it. Full writeup: `td/TD09-WEB-TYPES-DRIFT-VS-IKARO-TYPES.md`.

**Prototype reference:** `plan/journey/manager/prototypes/equipe/01-team-list.html`
**Route:** `/dashboard/team`

**What to create:**

`apps/web/lib/api/dashboard/team.ts`:
```typescript
fetchTeam(): Promise<StaffListResponse>
// GET /staff, auth cookie + X-Actor-* headers
```

`apps/web/app/dashboard/team/page.tsx` — server component: calls `fetchTeam()`, renders `<TeamListPage members={data.items} currentStaffId={jwt.sub} />`.

`apps/web/components/dashboard/team/TeamListPage.tsx` — `'use client'`:
- Filter tabs: **Todos** | **Ativos** | **Convites pendentes** | **Inativos** — client-side filter on the derived status, no re-fetch
- `memberStatus(member)` helper (per dev-notes.md):
  ```typescript
  function memberStatus(m: StaffListItem): 'active' | 'pending' | 'deactivated' {
    if (m.isActive) return 'active';
    return m.googleOAuthId === null ? 'pending' : 'deactivated';
  }
  ```
- The logged-in admin's own row (`member.staffId === currentStaffId`) never renders a "Desativar" action (server-side guard already exists via `StaffSelfDeactivationError`; this is the UX nicety, not the safety net)
- A `pending` row shows "Reenviar convite" instead of "Desativar" — reopens the invite form (`M13-S33`) pre-filled with the same email
- Desktop create button + mobile FAB → `/dashboard/team/invite`

`apps/web/components/dashboard/team/MemberRow.tsx`:
- Avatar (initials) + name + email
- Role badge (`Gerente` / `Equipe`)
- Status badge (`Ativo` green / `Convite pendente` yellow / `Inativo` red)
- Action: "Desativar" → `/dashboard/team/[id]/deactivate`, or "Reenviar convite" for pending rows, or nothing for the current user's own row

**Acceptance criteria:**
- [ ] List loads from `fetchTeam()`, renders all four filter tabs with correct counts
- [ ] Status badge correctly distinguishes Ativo / Convite pendente / Inativo using the `memberStatus()` heuristic
- [ ] The current admin's own row has no "Desativar" action
- [ ] A pending row's action is "Reenviar convite", not "Desativar"
- [ ] Create entry points (FAB mobile, button desktop) link to `/dashboard/team/invite`
- [ ] Page is `MANAGER`-only — `STAFF` role hitting `/dashboard/team` redirects (extend `M13-S15`'s middleware: add `/dashboard/team`, `/dashboard/settings`, `/dashboard/hotsite` to the manager-only route list — coordinate this as one shared middleware change across `M13-S31`/`M13-S32`/`M13-S35`, not three separate edits)
- [ ] `tsc --noEmit` passes; `pnpm lint` zero warnings

**Dependencies:** M13-S15

---

### M13-S33 — Equipe: invite member form (`/dashboard/team/invite`)

*(formerly M127-S05)*

**Agent:** `frontend-ts`
**Complexity:** S
**Docs to load:** `docs/04-USE_CASES.md` § UC-028, `plan/journey/manager/prototypes/equipe/02-invite-form.html`, `02b-invite-error.html`

**Description:**
The invite form — name, email, role selector. `POST /staff/invite` already exists and is fully guarded; this is a frontend-only story.

**Route:** `/dashboard/team/invite`

**`apps/web/lib/api/dashboard/team.ts` additions:**
```typescript
inviteStaff(body: InviteStaffRequest): Promise<InviteStaffResponse>
// POST /staff/invite -> 201; 409 -> email already has an active record
```

**What to create:**

`apps/web/app/dashboard/team/invite/page.tsx` — server component wrapper, renders `<InviteForm />`.

`apps/web/components/dashboard/team/InviteForm.tsx` — `'use client'`:

| Field | Input | Validation |
|---|---|---|
| Nome | `<input>` | required |
| Sobrenome | `<input>` | required |
| E-mail | `<input type="email">` | `z.email()` |
| Função | card-select: Equipe / Gerente | required, defaults to "Equipe" |

- Topbar: back arrow → `/dashboard/team`
- On submit: `inviteStaff({ firstName, lastName, email, role })`
  - `201` → `router.push('/dashboard/team')` + `revalidatePath('/dashboard/team')` + toast "Convite enviado para [email]."
  - `409` → email field gets `has-error` styling + "Este e-mail já está cadastrado na sua equipe." (matches `02b-invite-error.html`); other fields unchanged
  - Inactive record with same email (UC-028 A2) → backend reactivates silently; same `201` success path, no special handling needed client-side
- Submit disabled while in flight

**Acceptance criteria:**
- [ ] All 4 fields render; role selector defaults to "Equipe"
- [ ] `201` → redirects to `/dashboard/team`; new member visible with "Convite pendente" status
- [ ] `409` → email field shows inline error; first/last name and role selection are preserved
- [ ] Back arrow returns to `/dashboard/team` without submitting
- [ ] `tsc --noEmit` passes; `pnpm lint` zero warnings

**Dependencies:** M13-S32

---

### M13-S34 — Equipe: deactivate member flow

*(formerly M127-S06)*

**Agent:** `frontend-ts`
**Complexity:** M
**Docs to load:** `docs/04-USE_CASES.md` § UC-029, `plan/journey/manager/prototypes/equipe/03-deactivate-confirm.html`, `03b-deactivate-self-error.html`, `03c-deactivate-lastmanager-error.html`

**Description:**
The deactivation confirmation flow, including the two business-rule error states already enforced server-side: self-deactivation (`403`) and last-active-MANAGER (`409`). `PATCH /staff/:id/deactivate` already exists with both guards implemented in `DeactivateStaffUseCase` — frontend-only story.

**Route:** `/dashboard/team/[id]/deactivate`

**`apps/web/lib/api/dashboard/team.ts` additions:**
```typescript
deactivateStaff(staffId: string): Promise<DeactivateStaffResponse>
// PATCH /staff/:id/deactivate -> 200; 403 self; 409 last manager
```

**What to create:**

`apps/web/app/dashboard/team/[id]/deactivate/page.tsx` — server component: looks up the member from the already-fetched team list (or a single `GET /staff/:id` call — confirm which is cheaper at discovery), renders `<DeactivateConfirmPage member={data} />`.

`apps/web/components/dashboard/team/DeactivateConfirmPage.tsx` — `'use client'`:
- Member summary card: avatar + name + email + role
- Warning box: 3 bullets (loses access immediately / past actions stay in history / can be re-invited later) — matches `03-deactivate-confirm.html`
- "Confirmar desativação" (`btn-danger`) → calls `deactivateStaff()`
  - `200` → `router.push('/dashboard/team')` + `revalidatePath('/dashboard/team')`; member now shows "Inativo"
  - `403` → render `<SelfDeactivationError>` inline (matches `03b-deactivate-self-error.html`, using the `detail-layout`/`detail-aside` grid like `03-deactivate-confirm.html` for visual consistency) — should be unreachable via normal navigation since `M13-S32` hides the action on the admin's own row, but the page must still handle it defensively
  - `409` → render `<LastManagerError>` inline (matches `03c-deactivate-lastmanager-error.html`, same grid pattern)
- "Cancelar" → `router.back()`

**Acceptance criteria:**
- [ ] Confirmation page shows the correct member's summary card
- [ ] `200` → redirects to `/dashboard/team`; member now shows "Inativo" status
- [ ] `403` → inline error matching `03b-deactivate-self-error.html`'s copy exactly: "Você não pode desativar sua própria conta."
- [ ] `409` → inline error matching `03c-deactivate-lastmanager-error.html`'s copy exactly: "O estabelecimento precisa de pelo menos um gerente ativo."
- [ ] "Cancelar" returns to the previous page without calling the API
- [ ] `tsc --noEmit` passes; `pnpm lint` zero warnings

**Dependencies:** M13-S32

---

### M13-S35 — Hotsite: editor shell + Branding tab

*(formerly M127-S07)*

**Agent:** `frontend-ts`
**Complexity:** L
**Docs to load:** `docs/04-USE_CASES.md` § UC-027, `plan/journey/manager/hotsite.md`, `plan/journey/manager/prototypes/hotsite/dev-notes.md`

**Description:**
The Hotsite editor page itself — tabbed shell (Branding / Layout / SEO, client-side tab state, no separate routes, matching the prototype) — plus the Branding tab's full field set. `GET`/`PATCH /tenants/hotsite` and the image signed-URL endpoint already exist and are fully typed in `@ikaro/types` (`packages/types/src/hotsite.ts`) — frontend-only story. Branding scope is the 13-field set agreed during the audit (2026-06-16), not the original 4-field UC-027 text.

> 🔍 **Discover before starting:** Confirm `HotsiteAdminContentResponse`'s exact branding field names in `packages/types/src/hotsite.ts` before building the form. Confirm whether an `UpdateHotsiteContentRequest` TS interface already exists alongside the BFF's `UpdateHotsiteContentBodySchema` Zod schema, or only the Zod schema exists on the BFF side — if the frontend has nothing to import, add the missing TS interface to `packages/types/src/hotsite.ts` as part of this story (small addition, not a new story). Also check `POST /tenants/hotsite/images/signed-url`'s exact request/response shape (`GenerateHotsiteImageSignedUrlResponse`) before wiring the logo upload.

**Prototype references:**
- `plan/journey/manager/prototypes/hotsite/01-hotsite-editor.html` — shell + Branding tab
- `plan/journey/manager/prototypes/hotsite/01b-color-error.html` — invalid hex color (UC-027 A1)
- `plan/journey/manager/prototypes/hotsite/01c-image-upload-fallback.html` — upload failure → URL fallback (UC-027 A2)

**Route:** `/dashboard/hotsite`

**What to create:**

`apps/web/lib/api/dashboard/hotsite.ts`:
```typescript
fetchHotsiteConfig(): Promise<HotsiteAdminContentResponse>
updateHotsiteConfig(body: UpdateHotsiteContentRequest): Promise<HotsiteAdminContentResponse>
requestImageUploadUrl(fileName: string, contentType: string): Promise<GenerateHotsiteImageSignedUrlResponse>
```

`apps/web/app/dashboard/hotsite/page.tsx` — server component: calls `fetchHotsiteConfig()`, renders `<HotsiteEditor initial={data} />`.

`apps/web/components/dashboard/hotsite/HotsiteEditor.tsx` — `'use client'`:
- Tab state: `'branding' | 'layout' | 'seo'` (client-side only, matches prototype's `showTab()`)
- Holds the full draft config in local state; `M13-S36`/`M13-S37` extend this same component with the Layout/SEO tab bodies and the Preview/Publish actions
- "Publicar alterações" button always visible regardless of active tab — calls `updateHotsiteConfig()` then `POST /tenants/hotsite/publish` (full publish flow wired in `M13-S37`; this story stubs the button disabled until `M13-S37` lands, or implements just the `PATCH` half — confirm sequencing at discovery)

`apps/web/components/dashboard/hotsite/BrandingTab.tsx` — grouped into 4 sub-sections (Cores, Logo, Tipografia, Forma e estilo), per the prototype:

| Sub-section | Fields |
|---|---|
| Cores | `primaryColor`, `secondaryColor`, `backgroundColor`, `textColor` (hex inputs + swatch), `buttonBackgroundColor`, `buttonTextColor` (optional) |
| Logo | upload area → `requestImageUploadUrl()` + direct PUT to signed URL; on failure, falls back to a plain URL text input (UC-027 A2) |
| Tipografia | `headingFontFamily`, `bodyFontFamily` (select) |
| Forma e estilo | `borderRadius` (sharp/rounded/pill), `buttonStyle` (filled/outline/ghost), `spacing` (compact/comfortable/spacious), `shadowStyle` (none/subtle/strong) — pill-button selects |

- Hex color fields validate client-side (`/^#[0-9A-Fa-f]{6}$/`) before allowing save; invalid → inline error "Cor inválida. Use o formato hexadecimal, ex: #2563eb." (matches `01b-color-error.html`)
- Group the four sub-sections' container styling into a shared `.section-card`/`.section-card-title`/`.section-card-sub` pattern — these are now promoted to `plan/journey/shared/tokens.css` (the journey-prototype audit found this exact pattern duplicated identically across the Configurações and Hotsite prototypes and promoted it), so the frontend implementation should mirror that with one reusable component/style block rather than per-field bespoke styling.

**Acceptance criteria:**
- [ ] Editor loads with 3 tabs; Branding active by default; switching tabs doesn't trigger a network request
- [ ] All 13 branding fields render, grouped into the 4 sub-sections above
- [ ] Invalid hex color shows inline error and blocks save
- [ ] Logo upload failure shows the URL fallback input (simulate by forcing the upload call to reject)
- [ ] `tsc --noEmit` passes; `pnpm lint` zero warnings

**Dependencies:** M13-S15, M13-S32 (shared middleware extension for manager-only routes — or land independently if `M13-S32` hasn't merged yet; confirm at discovery to avoid a circular dependency)

---

### M13-S36 — Hotsite: Layout tab (module toggle/reorder + Hero config)

*(formerly M127-S08)*

**Agent:** `frontend-ts`
**Complexity:** M
**Docs to load:** `docs/04-USE_CASES.md` § UC-027 Section B, `plan/journey/manager/prototypes/hotsite/01-hotsite-editor.html` (Layout tab), `01d-module-config-hero.html`

**Description:**
Extends `HotsiteEditor` (`M13-S35`) with the Layout tab — the 7-module toggle/reorder list, plus a per-module config drill-down. **Only the HERO module's config panel is in scope here**; the other 6 (`SERVICE_LIST`, `GALLERY`, `BOOKING_CTA`, `TESTIMONIALS`, `ABOUT`, `CONTACT`) are explicitly deferred — see the consolidated open-questions section at the end of this file.

> 🔍 **Discover before starting:** Decide how "Configurar" should present the per-module panel — modal, slide-over, or a full route. The prototype doesn't mandate one; pick whichever the rest of the dashboard already establishes a precedent for (check if Phase 4/5 introduced a `Sheet`/`Dialog` pattern) and reuse it rather than inventing a new interaction.

**What to create:**

`apps/web/components/dashboard/hotsite/LayoutTab.tsx`:
- Renders the 7 modules in `layout` array order, each row: drag handle, module name (pt-BR label), "Configurar" link, enabled/disabled toggle
- Drag-to-reorder updates the local `layout` array order (no network call until "Publicar alterações")
- "Configurar" is only wired for HERO in this story; for the other 6 modules render the link disabled with a tooltip "Em breve" rather than a broken link

`apps/web/components/dashboard/hotsite/modules/HeroConfigPanel.tsx`:
- Fields: `title` (required), `subtitle` (optional), layout (`centered`/`left-aligned`), CTA target (`booking`/`service-list`), optional background image (reuses the same signed-URL upload pattern as the Logo field in `M13-S35`)
- "Aplicar" commits the draft back into `HotsiteEditor`'s local state (no network call — persisted only on "Publicar alterações")

**Acceptance criteria:**
- [ ] Layout tab renders all 7 modules in their current order with working enabled/disabled toggles
- [ ] Drag-to-reorder changes the local order (verify via a subsequent publish round-trip, not just visually)
- [ ] "Configurar" on Hero opens `HeroConfigPanel` pre-filled with current values
- [ ] "Configurar" on the other 6 modules is visibly disabled, not a dead link
- [ ] `tsc --noEmit` passes; `pnpm lint` zero warnings

**Dependencies:** M13-S35

---

### M13-S37 — Hotsite: SEO tab + Preview + Publish/Unpublish

*(formerly M127-S09)*

**Agent:** `frontend-ts`
**Complexity:** M
**Docs to load:** `docs/04-USE_CASES.md` § UC-027 Section C, `plan/journey/manager/prototypes/hotsite/02-preview.html`, `03-publish-success.html`, `03b-unpublish-success.html`

**Description:**
Closes out the Hotsite editor: the SEO tab, the Preview action, and the Publish/Unpublish actions.

> **Preview fidelity note (validated in the journey-prototype pass):** the prototype originally rendered its preview mock with a hardcoded `--ba-primary` value regardless of the form's edited color — meaning the "preview" never actually reflected what was being edited. This was fixed at the prototype level with a lightweight `localStorage`-based live-binding (`01-hotsite-editor.html` writes the draft color on input/navigate; `02-preview.html` reads it on load) purely to validate the UX. **The production implementation must not reuse that mechanism** — bind the preview to actual component state (the same `draft` object `HotsiteEditor` already holds in memory), not `localStorage`. The underlying engineering question (does the preview need a BFF preview-token for a pixel-exact production-path render, or is a client-side draft render sufficient?) is still open — this story picks the pragmatic v1 answer (client-side render of the draft state) rather than building the more involved BFF preview-token approach; revisit if stakeholders need a pixel-exact production-path preview.

> 🔍 **Discover before starting:** Confirm whether the hotsite's public-facing render components (`HeroModule`, `ServiceListModule`, etc. from M12) can be imported directly into the dashboard bundle to render the draft preview, or whether they have server-only dependencies that block client-side reuse. If they can't be reused directly, scope down to a simplified mock preview for v1 and flag the gap rather than building a parallel render path.

**What to create:**

`apps/web/components/dashboard/hotsite/SeoTab.tsx`:
- `title` (text, maxlength 70, optional) — hint: "Deixe em branco para usar o título gerado automaticamente"
- `description` (textarea, maxlength 160, optional) — same fallback hint

`apps/web/components/dashboard/hotsite/HotsitePreview.tsx`:
- Renders the draft config using the M12 hotsite module components directly (if reusable per discovery) with a sticky banner: "Visualizando alterações não publicadas" + "Voltar a editar" / "Publicar agora" actions
- Reads color/branding values directly from `HotsiteEditor`'s in-memory `draft` state (passed as a prop) — NOT from `localStorage` or any other out-of-band channel (see preview fidelity note above)
- Opened from the editor's "Preview" button — overlay or new route, confirm at discovery

**`HotsiteEditor` (`M13-S35`) additions:**
- "Publicar alterações": `updateHotsiteConfig(draft)` → `200` → `POST /tenants/hotsite/publish` → `200` → toast "Hotsite atualizado e no ar." (matches `03-publish-success.html`)
- Danger-zone "Despublicar hotsite": `POST /tenants/hotsite/unpublish` → `200` → toast confirming the hotsite is offline (matches `03b-unpublish-success.html`)

**Acceptance criteria:**
- [ ] SEO fields enforce their max lengths and show a live character counter
- [ ] "Preview" renders the draft state (not the last-published state) without requiring a save first, sourced from in-memory state
- [ ] "Publicar alterações" persists the draft, publishes, and shows the success toast
- [ ] "Despublicar hotsite" is visually separated in a danger-zone section and requires no extra confirmation step beyond the click itself (matches prototype — no confirmation dialog was prototyped for this action; flag if product wants one added)
- [ ] `tsc --noEmit` passes; `pnpm lint` zero warnings

**Dependencies:** M13-S35, M13-S36

---

## Phase 9 — Guest submit-info

> This phase is a fully independent vertical slice — it touches no dashboard code and could in principle be built anytime after M08. It's sequenced last purely because it's the smallest, most isolated piece, not because anything in Phases 1–8 blocks it.

> **Deployment constraint — `M13-S38` must ship in the same deployment as `M13-S40`:** `M13-S38` renames the email link from `/bookings/:id/responder` to `/bookings/:id/submit-info`. If `M13-S38` ships without `M13-S40`, new emails will link to a 404. If `M13-S40` ships without `M13-S38`, the page exists but no email links to it. Ship them together. Existing emails (already sent, pointing to `/responder`) will 404 after `M13-S38` — acceptable given the 7-day token TTL.

---

### M13-S38 — Backend: rename email link URL (`responder` → `submit-info`)

*(formerly M129-S01)*

**Agent:** `backend-ts`
**Complexity:** XS (2 files, ~3 line changes)
**Must co-deploy with:** M13-S40
**Docs to load:** none beyond this file

**Description:**
The info-request email currently links guests to `/bookings/:id/responder?token=`. The new frontend page lives at `/bookings/:id/submit-info`. Update the link builder and its spec.

> 🔍 **Discover before starting:**
> Read `apps/backend/src/contexts/notification/application/use-cases/send-booking-info-requested-notification/send-booking-info-requested-notification.use-case.ts` in full.
> Confirm `buildRespondLink()` is the only place this path is constructed — grep the entire `apps/backend/` for `responder` to find any other occurrences.

**File 1:** `apps/backend/src/contexts/notification/application/use-cases/send-booking-info-requested-notification/send-booking-info-requested-notification.use-case.ts`

Change in `buildRespondLink()`:
```ts
// Before:
return `${frontendUrl}/bookings/${dto.bookingId}/responder?token=${token}`;
// After:
return `${frontendUrl}/bookings/${dto.bookingId}/submit-info?token=${token}`;
```

**File 2:** `apps/backend/src/contexts/notification/application/use-cases/send-booking-info-requested-notification/send-booking-info-requested-notification.use-case.spec.ts`

Update the assertion that checks the constructed link. Grep for `responder` in the spec — replace with `submit-info`.

**Acceptance criteria:**
- [ ] `buildRespondLink()` emits `/submit-info` for guest path; authenticated path unchanged (`/dashboard/bookings/${id}`)
- [ ] All existing spec assertions pass with updated URL expectation
- [ ] `grep -r "responder" apps/backend/src/contexts/notification/` returns zero matches

**Dependencies:** M08

---

### M13-S39 — BFF: guest booking read endpoint (optional — enhances M13-S40)

*(formerly M129-S02)*

**Agent:** `bff-ts`
**Complexity:** S
**Optional:** `M13-S40` can ship without this. Without it, the form shows no booking summary card (graceful degradation). Implement if time allows — it meaningfully improves UX.
**Docs to load:** `docs/24-BFF_ARCHITECTURE.md`, `docs/14-API_CONTRACTS.md` (bookings section), `plan/M08-BOOKING-APPROVAL_IMPLEMENTATION_DETAILS_IA.md`

**Description:**
Add `GET /v1/bookings/:id/guest?token=` to the BFF — a `@Public()` endpoint that validates the guest token and returns the minimal booking fields needed to pre-fill the form (service name, date, info request message). Without this, the frontend form has no way to show a booking summary to the guest.

> 🔍 **Discover before starting:**
> Read `apps/bff/src/bookings/bookings.controller.ts` — locate `submitInfoGuest()` (the existing `@Public()` PATCH handler). **Understand how it derives tenant context** without a `X-Tenant-Slug` header (TenantGuard is bypassed by `@Public()`). Whatever mechanism it uses to call the backend with the correct tenant must be replicated for this GET endpoint. Read `apps/bff/src/shared/http/backend-http.service.ts` to understand how the BFF passes headers to the backend.
>
> Also check: does `apps/backend/src/contexts/booking/infrastructure/controllers/booking.controller.ts` have a guest-accessible `GET /bookings/:id` variant? Or does the existing `GET /bookings/:id` work without authentication at the backend level (since the BFF validates the token and the backend relies on `X-Internal-Key`)?

**Endpoint:**
```
GET /v1/bookings/:id/guest?token=<JWT>
@Public()

Response 200:
{
  bookingId: string;
  status: "INFO_REQUESTED";           // if not INFO_REQUESTED → 409
  serviceSummary: string;             // e.g. "Lavagem Simples"
  scheduledAt: string;                // ISO-8601
  infoRequestMessage: string;         // what the admin asked for
  contactName: string;
}

Response 400: token missing or invalid JWT
Response 401: token bookingId ≠ path :id (mismatch)
Response 409: booking is not INFO_REQUESTED (already processed)
Response 404: booking not found
```

**Token validation:** reuse the existing `verifyGuestToken()` function already in the BFF bookings controller. Do not duplicate logic.

**Zod schema (response):**
```ts
export const GuestBookingReadResponseSchema = z.object({
  bookingId: z.uuid(),
  status: z.literal('INFO_REQUESTED'),
  serviceSummary: z.string(),
  scheduledAt: z.string(),
  infoRequestMessage: z.string(),
  contactName: z.string(),
});
export type GuestBookingReadResponse = z.infer<typeof GuestBookingReadResponseSchema>;
```

**`.http` file:** add a request block to `apps/bff/http/bookings/bookings.http`:
```http
### UC-005 A2 — Guest reads booking summary before submitting info
GET {{bffUrl}}/v1/bookings/{{bookingId}}/guest?token={{guestToken}}
```

**Acceptance criteria:**
- [ ] Returns 200 with booking summary fields when token is valid and booking is `INFO_REQUESTED`
- [ ] Returns 400 when `?token=` is absent or JWT signature is invalid
- [ ] Returns 401 when token `bookingId` ≠ path `:id`
- [ ] Returns 409 when booking status ≠ `INFO_REQUESTED`
- [ ] No `X-Tenant-Slug` or JWT auth cookie required
- [ ] `.http` block added
- [ ] Unit test covers: valid token, invalid token, mismatched bookingId, wrong status

**Dependencies:** M08

---

### M13-S40 — Frontend: `SubmitInfoPage` + `SubmitInfoForm`

*(formerly M129-S03)*

**Agent:** `web-ts`
**Complexity:** M
**Must co-deploy with:** M13-S38; M13-S39 optional (degrade gracefully if absent)
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `plan/M12-HOTSITE-FRONTEND_IMPLEMENTATION_DETAILS_IA.md`
**Prototype:** `plan/journey/guest/prototypes/submit-info/` — read `dev-notes.md` in full before starting

**Description:**
Create the standalone public page that guests arrive at via the info-request email link. No authentication required. The page validates the guest token server-side, optionally fetches the booking summary, and renders a form for the guest to type their response and optionally upload photos.

> 🔍 **Discover before starting:**
> - Confirm `apps/web/app/bookings/` does NOT exist yet — this is a new top-level Next.js route.
> - Read `apps/web/app/[slug]/booking/page.tsx` to understand the existing public booking page pattern (auth bar, fetch pattern, error states).
> - Confirm that `jsonwebtoken` is already a dependency in `apps/web/package.json`. If not, add `jose` instead (Web Crypto API, works in Edge Runtime — `jsonwebtoken` requires Node.js runtime).
> - Read `apps/bff/src/bookings/bookings.controller.ts` — locate `SubmitGuestBookingInfoBodySchema` (lines ~109–121) to confirm the exact body shape: `{ response: string, photoUrls?: string[] }`.
> - Check if `POST /v1/bookings/:id/presigned-url/guest?token=` exists in the BFF. If it does not exist, **omit photo upload from this story** — text-only response is sufficient for MVP. Document the gap in a comment.

**New files to create:**

| File | Notes |
|---|---|
| `apps/web/app/bookings/[id]/submit-info/page.tsx` | Server component — token validation + data fetch |
| `apps/web/components/booking/SubmitInfoForm.tsx` | Client component — form state machine |
| `apps/web/components/booking/SubmitInfoForm.spec.tsx` | Vitest + `@testing-library/react` unit tests |

---

#### `apps/web/app/bookings/[id]/submit-info/page.tsx` (server component)

```ts
// @vitest-environment jsdom  ← NOT here (this is a server component, not tested directly)
import { SubmitInfoForm } from '@/components/booking/SubmitInfoForm';

interface Props {
  params: { id: string };
  searchParams: { token?: string };
}

export default async function SubmitInfoPage({ params, searchParams }: Props) {
  const { token } = searchParams;

  // 1. Token presence check
  if (!token) {
    return <InvalidLinkView reason="missing" />;
  }

  // 2. Token signature + expiry validation (server-side)
  const payload = verifyGuestToken(token); // returns null on failure
  if (!payload || payload.bookingId !== params.id) {
    return <InvalidLinkView reason="invalid" />;
  }

  // 3. Optional: fetch booking summary (if M13-S39 shipped)
  const summary = await fetchGuestBookingSummary(params.id, token).catch(() => null);
  // If summary?.status is not INFO_REQUESTED → render InvalidLinkView with reason="processed"

  return (
    <SubmitInfoForm
      bookingId={params.id}
      token={token}
      summary={summary}  // null if M13-S39 not available
    />
  );
}
```

**`verifyGuestToken(token: string)`** — implement inline or as a shared util in `apps/web/lib/auth/guest-token.ts`:
- Use `jose` (`jwtVerify`) or `jsonwebtoken` (`jwt.verify`) with `process.env.JWT_SECRET`
- Payload shape: `{ bookingId: string, tenantId: string, contactEmail: string }`
- Return `null` on any error (expired, invalid signature, malformed)

**`fetchGuestBookingSummary(id, token)`** — in `apps/web/lib/api/bookings.ts`:
```ts
// GET /v1/bookings/:id/guest?token=
// Returns GuestBookingReadResponse | null (null if endpoint not found or 409)
```

---

#### `apps/web/components/booking/SubmitInfoForm.tsx` (client component)

**Props:**
```ts
interface SubmitInfoFormProps {
  readonly bookingId: string;
  readonly token: string;
  readonly summary: {
    readonly serviceSummary: string;
    readonly scheduledAt: string;
    readonly infoRequestMessage: string;
    readonly contactName: string;
  } | null;
}
```

**State machine:**
```
idle → submitting → success
              └──→ error (retry available, form values preserved)
```

**BFF call (submission):**
```
PATCH /v1/bookings/:id/submit-info/guest?token=<token>
  Body: { response: string, photoUrls?: string[] }
  No Authorization header, no X-Tenant-Slug
  Response 200: { bookingId, status: "PENDING", infoSubmittedAt }
```

**Validation (client-side before submit):**
| Field | Rule | Error message |
|---|---|---|
| `response` | `trim().length >= 1` | "Informe sua resposta antes de enviar." |

**Screens to implement** (from prototype):
| Screen | File | State |
|---|---|---|
| Form (idle) | `01-submit-form.html` | default render |
| Submitting | `01c-submitting.html` | button disabled + spinner |
| Validation error | `01d-validation-error.html` | field red border + inline error |
| Submit error | `01e-submit-error.html` | red alert + retry button, values preserved; also covers the token-expired-mid-flow case (a 401 from the `PATCH` after the page already rendered the form) — the journey-prototype dev-notes call out this specific path: swap the retry CTA for a link back to the invalid-link state instead, since retrying an expired token just 401s again |
| Success | `02-success.html` | replaces form in-place (no navigation) |
| Invalid link | `01b-invalid-link.html` | rendered by page.tsx before form mounts |

**Photo upload (MVP scope: text-only):**
```ts
// TODO: photo upload requires presigned-url endpoint for guests
// POST /v1/bookings/:id/presigned-url/guest?token= — verify this exists before implementing
// If missing: omit the upload zone; add a comment explaining the gap
```
If the presigned-URL endpoint does not exist, render a static note: _"Para enviar fotos, responda diretamente a este email com os arquivos em anexo."_

**Routing note (add as code comment):**
```ts
// This page lives at apps/web/app/bookings/[id]/submit-info/page.tsx
// Next.js static segment 'bookings/' takes priority over [slug]/ — no conflict.
// No auth required: page is fully public, token is the only access control.
```

---

#### `apps/web/components/booking/SubmitInfoForm.spec.tsx`

```ts
// @vitest-environment jsdom
```

**Minimum test cases:**
| Test | What to assert |
|---|---|
| renders form with summary card | `serviceSummary` and `infoRequestMessage` appear in DOM |
| renders form without summary | no summary card, form still functional |
| submit with empty response | field error message appears; no fetch called |
| submit success | success banner appears; form hidden |
| submit network error | error alert appears; retry button visible; response field value preserved |
| submit in progress | button disabled; spinner present |

Use `vi.mock` for `fetch`. Do NOT test `page.tsx` — server component, Playwright only.

---

**Acceptance criteria:**
- [ ] `GET /bookings/[id]/submit-info?token=<valid>` renders the form (with or without summary)
- [ ] `GET /bookings/[id]/submit-info` (no token) renders the invalid-link screen
- [ ] `GET /bookings/[id]/submit-info?token=<expired>` renders the invalid-link screen
- [ ] Empty response field shows inline validation error; no API call made
- [ ] Successful submit shows success screen in-place; does not navigate
- [ ] Network error shows retry alert; form values preserved
- [ ] A 401 mid-submission (expired token detected only after the PATCH) shows the same submit-error layout but swaps the CTA to point back to the invalid-link state, not a same-token retry
- [ ] Button disabled + spinner during submission
- [ ] All tests pass (`pnpm test --filter apps/web`)
- [ ] `tsc --noEmit` zero errors
- [ ] No `[slug]/` route captures `/bookings/` — verify by opening `localhost:3000/bookings/some-id/submit-info?token=test` and confirming it does not render the hotsite

**Dependencies:** M13-S38 (must co-deploy), M13-S39 (optional)

---

## Phase Pre-0 — Playwright E2E infrastructure

---

### M13-S41 — Playwright E2E infrastructure + guest booking golden path ✅ Done

> **Implement this story first** — before M13-S01. Every other M13 story that builds a `page.tsx` route must add an E2E test file alongside it (`apps/web/e2e/<feature>.spec.ts`). This scaffolding must exist before those stories start.

**Goal:** Install Playwright in `apps/web`; write the first E2E test for the UC-001 guest booking golden path (M12-S07 already built the code — this adds the test). Establish the convention: every `app/**/page.tsx` route added in M13 ships with a Playwright test in the same story.

**Convention for the rest of M13:**
Server component pages (`app/**/page.tsx`) cannot be Vitest-tested. From this story forward, every M13 story that ships a page must include a corresponding `apps/web/e2e/<feature>.spec.ts` covering the happy path. The guest booking test below is the template.

---

**Files to create/modify:**
- `apps/web/package.json` — add `@playwright/test` devDep + `e2e` / `e2e:ui` / `e2e:ci` scripts
- `apps/web/playwright.config.ts`
- `apps/web/e2e/guest-booking.spec.ts`
- Booking form components (M12-S07) — add `data-testid` attributes where missing (see below)
- `sonar-project.properties` — add `apps/web/e2e/**` to `sonar.exclusions`
- `.gitignore` — add `apps/web/playwright-report/` and `apps/web/test-results/`

---

**`apps/web/playwright.config.ts`:**
```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // webServer intentionally omitted — tests run against the already-running dev stack
  // (docker-compose up + pnpm dev). CI startup is M16-S06's scope.
});
```

---

**`data-testid` attributes** — add to M12-S07 booking form components if not already present:

| Element | Locator strategy |
|---|---|
| Service card (Step 1) | `data-testid="service-card"` |
| Day button in availability carousel | `data-testid="day-option"` + native `disabled` attr when unavailable |
| Time slot button | `data-testid="time-slot"` |
| Name input | `getByLabel(/nome/i)` — label already exists, no testid needed |
| Phone input | `getByLabel(/telefone/i)` — label already exists, no testid needed |
| Submit button (Step 4) | `getByRole('button', { name: /confirmar/i })` |
| Success message container | `data-testid="booking-success"` |

---

**`apps/web/e2e/guest-booking.spec.ts`:**
```ts
import { test, expect } from '@playwright/test';

test.describe('UC-001 — Guest booking golden path', () => {
  test('guest navigates from hotsite to booking form and submits successfully', async ({ page }) => {
    // Hotsite renders
    await page.goto('/ikaro');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('#service-list')).toBeVisible();

    // Navigate to booking form
    await page.goto('/ikaro/booking');
    await expect(page.locator('#booking-form')).toBeVisible();

    // Step 1 — select first available service
    await page.locator('[data-testid="service-card"]').first().click();
    await page.getByRole('button', { name: /próximo/i }).click();

    // Step 2 — pick first available day then first slot
    await page.locator('[data-testid="day-option"]:not([disabled])').first().click();
    await page.locator('[data-testid="time-slot"]').first().click();
    await page.getByRole('button', { name: /próximo/i }).click();

    // Step 3 — personal info
    await page.getByLabel(/nome/i).fill('E2E Teste');
    await page.getByLabel(/telefone/i).fill('11999999999');
    await page.getByRole('button', { name: /próximo/i }).click();

    // Step 4 — submit
    await page.getByRole('button', { name: /confirmar/i }).click();
    await expect(page.locator('[data-testid="booking-success"]')).toBeVisible();
  });
});
```

**Precondition (dev only):** `docker-compose up` + `pnpm dev` in `apps/web`. The seeded `ikaro` tenant must have at least one active service and available slots on future dates. If seeds don't cover this, add the missing rows in `seed.ts`.

---

**`pnpm` scripts to add to `apps/web/package.json`:**
```json
"e2e": "playwright test",
"e2e:ui": "playwright test --ui",
"e2e:ci": "playwright test --reporter=list"
```

---

**SonarCloud — `sonar-project.properties`:**
Add `apps/web/e2e/**` to the existing `sonar.exclusions` line.

**`.gitignore` additions:**
```
apps/web/playwright-report/
apps/web/test-results/
```

---

**Acceptance criteria:**
- [ ] `@playwright/test` added to `apps/web` devDependencies; `npx playwright install chromium` run once locally
- [ ] `apps/web/playwright.config.ts` created as above
- [ ] `apps/web/e2e/guest-booking.spec.ts` created; test passes locally against running dev stack and seeded `ikaro` tenant
- [ ] Booking form components have `data-testid` attributes as listed above
- [ ] `pnpm e2e` from `apps/web/` executes and the guest booking test passes
- [ ] `sonar-project.properties` updated: `apps/web/e2e/**` added to `sonar.exclusions`
- [ ] `.gitignore` updated with Playwright artifact paths
- [ ] `tsc --noEmit` zero errors (Playwright types resolve correctly)
- [ ] Seeded `ikaro` tenant has an active service with available future slots (verify or patch `seed.ts`)

**Dependencies:** M12-S07 (guest booking form already built), M06-S04 (public services endpoint), M07-S04 (availability endpoint)

**Estimated size:** S

---

## Phase Pre-0b — Hotsite auth bar

---

### M13-S42 — Hotsite auth bar (logged-out "Entrar" / logged-in avatar dropdown) ✅ Done

> **Implemented out of build order** — pulled forward of `S13`/`S14`/`S15`/`S16`/`S27` because the public hotsite currently has no way for a returning customer to log in or see their session state at all (confirmed gap — `[slug]/layout.tsx` and `[slug]/page.tsx` have zero auth logic today). This story is deliberately self-contained: it does not wait for the full customer-login flow (`S14`) or the Minha Conta area (`S27`) to exist.

**Agent:** `frontend-ts` (frontend + a small BFF addition)
**Complexity:** M
**Docs to load:** `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`, `docs/04-USE_CASES.md` § UC-021, `docs/24-BFF_ARCHITECTURE.md`
**Prototype references:**
- `plan/journey/shared/hotsite.html` — logged-out auth bar ("Entrar" link; "Área da Equipe" is prototype-only, never built in production)
- `plan/journey/shared/hotsite-logged-in.html` — logged-in auth bar (avatar + dropdown: "Minha conta" | "Sair")
- `plan/journey/shared/login.html` — tenant-branded login screen

**Description:**
Adds the persistent top auth bar to the public hotsite (`/{slug}` and `/{slug}/booking`), matching the prototypes: unauthenticated visitors see an "Entrar" link; authenticated customers see their initials avatar + name with a dropdown ("Minha conta" / "Sair"). Also adds the minimal tenant-branded login page the bar's "Entrar" link needs, and the BFF logout endpoint the dropdown's "Sair" needs — neither existed before this story.

**Scope decisions (already discussed and agreed):**
- "Entrar" links to a new minimal `/{slug}/login` page (not directly to the BFF OAuth URL) — matches the prototype's branded login screen exactly. Multi-tenant selection (`/select-tenant`) stays out of scope — `M13-S14`'s discovery session found this BFF branch is unreachable from any shipped UI and descoped it permanently rather than building it (see `docs/04-USE_CASES.md` UC-021).
- The avatar dropdown's "Minha conta" links to `/{slug}/my-account`, which will 404 until `M13-S27` ships. Accepted — see the naming-convention note in "Architecture & conventions" above.
- The bar must not break the existing `revalidate = 300` ISR on `[slug]/page.tsx` / `[slug]/booking/page.tsx`. It is rendered as a `'use client'` component that fetches its own auth state after hydration via a Next.js API proxy route — it does **not** call `cookies()` inside the statically-rendered page tree.
- The JWT cookie carries no display name (`JwtPayload` is `{ sub, tenantId, tenantSlug, role }` only — see `apps/bff/src/auth/jwt-issuer.service.ts`). The customer's name is fetched from the already-existing `GET /v1/customers/me` BFF endpoint, via a new same-origin proxy route (`/api/customers/me`) that `M13-S14`'s `InformationCompletionPrompt` will also reuse — built once, here.
- No logout endpoint exists yet anywhere in the codebase. This story adds the smallest functional one: a `GET /v1/auth/logout` BFF route that clears the cookie and redirects back to the hotsite.

> 🔍 **Discover before starting:**
> - Confirm `apps/web/app/[slug]/login/` does not exist yet.
> - Confirm `apps/web/app/api/customers/me/` and `apps/bff/.../auth.controller.ts`'s `logout` handler do not exist yet.
> - Re-check `apps/bff/src/auth/oauth-state.ts` exports `isValidSlug` — reuse it for the logout redirect's `tenantSlug` validation rather than writing a new regex.
> - Re-check `CustomerProfileResponse` shape in `apps/bff/src/customers/customers.types.ts` (`{ customerId, email, name, phone, defaultAddress }`) before adding the mirrored type to `@ikaro/types`.

**What to create:**

---

#### BFF: `GET /v1/auth/logout` — `apps/bff/src/auth/auth.controller.ts`

```typescript
@Public()
@Get('logout')
logout(@Query('tenantSlug') tenantSlug: string | undefined, @Res() res: Response): void {
  res.clearCookie('access_token', JWT_COOKIE_OPTIONS);
  const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
  const path = tenantSlug && isValidSlug(tenantSlug) ? `/${tenantSlug}` : '';
  res.redirect(`${frontendUrl}${path}`);
}
```

Add a request block to `apps/bff/http/auth/auth.http` documenting the browser URL (logout cannot be exercised via REST Client — it's a full-page redirect, same as `google`/`google/callback`).

Unit tests in `auth.controller.spec.ts`:
- clears the `access_token` cookie and redirects to `${frontendUrl}/{tenantSlug}` when `tenantSlug` is valid
- redirects to bare `frontendUrl` when `tenantSlug` is missing or fails `isValidSlug`

---

#### `packages/types/src/customer.dto.ts` (new file)

```typescript
import type { Address } from './address';

export interface CustomerProfileResponse {
  customerId: string;
  email: string;
  name: string;
  phone: string | null;
  defaultAddress: Address | null;
}
```

Reuses the existing shared `Address` type (`packages/types/src/address.ts`) rather than duplicating it — its `complement` field was widened to `string | null` to match the BFF's `AddressResponse` exactly (`apps/bff/src/customers/customers.types.ts`). Export `CustomerProfileResponse` from `packages/types/src/index.ts`. This mirrors the BFF's existing local `CustomerProfileResponse` — the BFF keeps its own local type; this shared one is for `apps/web` consumers only.

---

#### `apps/web/app/api/customers/me/route.ts` (new) — same-origin proxy

```typescript
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
  const token = (await cookies()).get('access_token')?.value;
  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const res = await fetch(`${process.env.NEXT_PUBLIC_BFF_URL}/customers/me`, {
    headers: { Cookie: `access_token=${token}` },
    cache: 'no-store',
  });

  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}
```

Transparent pass-through (status + body) so `M13-S14`'s `InformationCompletionPrompt` can reuse it unchanged. Add `route.spec.ts` (Vitest, node environment, mocking `next/headers` and global `fetch`) — mirror the structure of `apps/web/app/api/revalidate/route.spec.ts`.

---

#### `apps/web/lib/api/customers.ts` (new)

> **Naming note:** `M13-S01` (merged ahead of this story) already added `apps/web/lib/api/dashboard/customers.ts` with its own `getCustomerProfile()` — but that one calls the Bearer-token `bffClient`, which is only configured inside an authenticated dashboard shell (`configureBffClient()`). The public hotsite has no such shell and the JWT is httpOnly (never exposed to client JS), so this story's fetcher needs the cookie-forwarding proxy below instead. Named `getHotsiteCustomerProfile` to avoid colliding with S01's function of the same conceptual purpose but different transport.

```typescript
import type { CustomerProfileResponse } from '@ikaro/types';

export async function getHotsiteCustomerProfile(): Promise<CustomerProfileResponse | null> {
  const res = await fetch('/api/customers/me');
  if (!res.ok) return null;
  return (await res.json()) as CustomerProfileResponse;
}
```

---

#### `apps/web/components/hotsite/HotsiteAuthBar.tsx` (new) — `'use client'`

- On mount: calls `getHotsiteCustomerProfile()`. While pending, render an empty `<div>` (no flash of "Entrar" before the authenticated state resolves — acceptable brief blank, same tradeoff `InformationCompletionPrompt` will use in `S14`).
- `null` → unauthenticated: right-aligned "Entrar" link → `/{slug}/login`.
- Profile returned → authenticated: initials avatar (derived from `name`, e.g. "João Silva" → "JS") + `name`, native `<details>/<summary>` dropdown (no client JS needed for the toggle itself) with two links: "Minha conta" → `/{slug}/my-account`, "Sair" → `${process.env.NEXT_PUBLIC_BFF_URL}/auth/logout?tenantSlug={slug}`.
- Styled with Tailwind utility classes + `var(--ba-*)` branding tokens, matching `HeroModule.tsx`'s conventions — do **not** use the prototype's bespoke `.auth-bar`/`.auth-avatar` CSS classes (those exist only in `plan/journey/shared/tokens.css`, not in the production app).
- Props: `{ readonly slug: string }`.

Add `HotsiteAuthBar.spec.tsx` (`@vitest-environment jsdom`, `@testing-library/react`) covering: unauthenticated renders "Entrar" with correct `href`; authenticated renders initials + name; clicking the summary opens the dropdown (native `<details>` toggles in jsdom); "Minha conta" and "Sair" hrefs are correct.

---

#### `apps/web/app/[slug]/login/page.tsx` (new) — server component

- Fetches tenant branding via the existing `fetchManifest(slug)` (unauthenticated, ISR-cached — same as `[slug]/page.tsx`). `revalidate = 300`, no `cookies()` call.
- Renders tenant logo (or initial-letter fallback) + `"Entrar na {tenantName}"` heading + `"Entre com sua conta Google para agendar"` subtext + Google button: `<a href={`${process.env.NEXT_PUBLIC_BFF_URL}/auth/google?tenantSlug=${slug}`}>`.
- `searchParams.error` present → inline red alert: `"Erro ao entrar. Tente novamente."`
- Unknown slug → `notFound()`.
- `generateMetadata`: `title: "Entrar — {tenantName}"`.

---

#### Wire into existing pages

`apps/web/app/[slug]/page.tsx` and `apps/web/app/[slug]/booking/page.tsx` — render `<HotsiteAuthBar slug={slug} />` once, near the top of the returned JSX (above `<main>`'s modules / above `<BookingForm>`). Do **not** add it to `[slug]/layout.tsx` or to the new `/{slug}/login/page.tsx` (a login page should never show its own "Entrar" link).

**Acceptance criteria:**

*Logout (BFF):*
- [ ] `GET /v1/auth/logout?tenantSlug=<valid>` clears `access_token` cookie, redirects to `${frontendUrl}/<slug>`
- [ ] `GET /v1/auth/logout` (no `tenantSlug`) redirects to bare `frontendUrl`
- [ ] `.http` block added

*Proxy route:*
- [ ] `GET /api/customers/me` with no `access_token` cookie → 401
- [ ] `GET /api/customers/me` with a valid cookie → 200 + the BFF's profile body, status/body passed through unchanged

*Auth bar:*
- [ ] Unauthenticated visitor sees "Entrar" linking to `/{slug}/login`
- [ ] Authenticated customer sees initials + name; dropdown shows "Minha conta" (→ `/{slug}/my-account`) and "Sair" (→ BFF logout URL with correct `tenantSlug`)
- [ ] Bar renders on both `/{slug}` and `/{slug}/booking`
- [ ] `[slug]/page.tsx` and `[slug]/booking/page.tsx` keep `revalidate = 300`; no `cookies()` call added to either file

*Login page:*
- [ ] `GET /{slug}/login` renders tenant name + logo (or initial fallback)
- [ ] Google button href is `${NEXT_PUBLIC_BFF_URL}/auth/google?tenantSlug={slug}`
- [ ] `?error=anything` shows the inline alert
- [ ] Unknown slug → `notFound()`

*General:*
- [ ] `tsc --noEmit` passes across the monorepo; `pnpm lint` zero warnings
- [ ] Vitest unit tests pass for all new files listed above

**Dependencies:** none (deliberately self-contained — see scope decisions above)

**Known gaps, intentionally deferred:**
- ~~Multi-tenant customer login still 404s at `/select-tenant` until `M13-S14`.~~ Resolved by `M13-S14`'s discovery session: `/select-tenant` was descoped entirely, not built. See `docs/04-USE_CASES.md` UC-021.
- "Minha conta" 404s until `M13-S27`.
- `InformationCompletionPrompt` (the other consumer of `/api/customers/me`) is still `M13-S14`'s job.

---

## Open questions & future discovery

> Consolidated from all 7 source files' "Open questions" and "Future discovery" sections. Items already resolved by a decision made during this consolidation (or that turned out to already be in scope) are marked `[x]` with a one-line resolution; genuinely open items are marked `[ ]` and reference the story they block.

### Auth (Phase 1–2, M13-S02/M13-S13/M13-S14)

- [x] **BFF API route prefix in `apps/web`:** resolved in `M13-S14`'s discovery session — full-page navigations (OAuth, logout) go directly to the BFF (`${NEXT_PUBLIC_BFF_URL}/auth/...`); any client-side JSON exchange that needs the session cookie must go through a same-origin Next.js proxy route (`apps/web/app/api/...`), per `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`'s documented rule. `M13-S13`'s `/select-staff-tenant` violated this (called the BFF directly cross-origin) and was refactored to match in `M13-S14`.
- [x] **Selection token decode strategy:** moot — `/select-tenant` was descoped entirely in `M13-S14` (no UI ever reaches the multi-tenant OAuth branch). See `docs/04-USE_CASES.md` UC-021.
- [x] **`TenantOption.primaryColor`:** not carried by the BFF today; `/select-tenant` is moot (see above). The switch-tenant feature (folded into `M13-S14` from the original `M13-S30`) also still reuses `TenantOption` and uses the same neutral `--ba-primary` placeholder for the avatar background.
- [x] **Post-login redirect from customer area:** confirmed — the customer lands on `/{slug}` (the hotsite), which already reads the `access_token` cookie server-side (M12) and shows the logged-in nav bar. No follow-up story needed.
- [x] **Staff login Google button href prefix:** resolved in M13-S13 — uses `${NEXT_PUBLIC_BFF_URL}/auth/google?state=__staff__` (absolute BFF URL, same pattern as the customer login page). `NEXT_PUBLIC_BFF_URL` includes the `/v1` prefix (`http://localhost:3002/v1` in dev).
- [ ] **Staff logout:** no logout endpoint designed yet. Current MVP behavior: JWT expiry → redirect to `/dashboard/login`. An explicit logout button is post-MVP — not scoped in any story above.
- [ ] **"Bem-vindo(a)!" first-login banner (UC-025 step 8):** ⚠️ auth flow redesigned in M13-S13 — `link-google` now redirects straight to `/dashboard` with no distinguishable "first login" moment. To implement the banner, the BFF would need to detect that `google_oauth_id` was just set (i.e. call `link-google` succeeded where it previously returned 200 without a cookie) and append `?welcome=1` to the `/dashboard` redirect — this logic does not exist today. Post-MVP; fold into a follow-up patch if product wants it.
- [x] **Playwright E2E suite for auth flows:** this note assumed full auth E2E coverage was blocked on a not-yet-built "Google OAuth test-bypass endpoint" deferred to M16-S06. That assumption was stale — `ENABLE_DEV_AUTH`'s `POST /v1/auth/dev-login` already serves exactly that purpose (mints a real JWT cookie without driving Google's consent screen) and was already wired into `pr-e2e.yml`'s CI job. Built in M13-S14 follow-up: `apps/web/e2e/helpers/auth.ts` (`loginAsCustomer`, `completeCustomerProfile`) plus E2E specs for authenticated hotsite-auth-bar states, `InformationCompletionPrompt`, `/switch-tenant`, and the staff-login middleware regression. No remaining blocker for auth-flow E2E coverage.
- [x] **Staff invite email `activationLink` broken (TD13):** link itself is still broken (unchanged — still tracked, now Low priority since the workaround below is no longer the only path). M13-S14 follow-up closed the underlying gap a different way: `handleStaffLogin` (the generic `/dashboard/login` path) now falls back to matching by Google's verified email across all tenants when the OAuth-ID lookup finds nothing, then links and proceeds — so a never-linked invited staff member can just use the normal "Entrar com Google" button instead of needing the (broken) tenant-scoped invite link at all. Fixing the link itself is still worth doing for UX polish (skips an extra step) but no longer blocks anyone.

### Staff booking core (Phase 4, M13-S17–M13-S20)

- [x] **Does the admin stay on the detail page after approve, or navigate back to the queue?** Resolved — stays, inline banner, manual "Voltar à agenda" link. Confirmed as the system-wide convention for approve/reject/info/cancel/complete/reschedule alike (see `M13-S18`/`M13-S19`/`M13-S20`'s descriptions).
- [x] **Slot conflict suggestions source:** resolved — the frontend/BFF fetches availability separately and feeds the returned slots into `SlotConflictAlert`; the `409` response itself only signals the conflict.
- [ ] **Photo URL strategy:** GCS signed read URLs generated by the BFF at detail-fetch time, or a Next.js image proxy? M115-S01's pattern used signed URLs — recommend the same here (already assumed in `M13-S04`/`M13-S18`/`M13-S20`).
- [ ] **Real-time queue updates:** polling interval vs. WebSocket — two staff members might view the same booking simultaneously. Not scoped in `M13-S17`; decide at a Phase-4 retrospective, don't add silently.

### Customer Minha Conta (Phase 7, M13-S27–M13-S29; `M13-S30` merged into `M13-S14`)

- [ ] **`cancellationWindowHours` availability:** is this value accessible to the frontend without a dedicated settings endpoint? MVP default is to hardcode `48` and read from real settings later (used by `M13-S27`/`M13-S28`).
- [ ] **"Total washes completed" stat (UC-006 step 6):** not available from `GET /v1/loyalty/balance`. Drop from MVP Minha Conta, or derive client-side from `items.filter(b => b.status === 'COMPLETED').length`? Decide before `M13-S27`.
- [x] **After-cancel destination (UC-007):** resolved — redirect to `/{slug}/my-account` list after successful cancel; booking appears in Histórico as CANCELLED on next load. Implemented in `M13-S28`.
- [ ] **`infoResponseMessage` already filled:** if the customer already responded to an info request once (status returned to PENDING, then re-requested), should `InfoSubmitForm` show again or just display the previous response? Recommendation carried into `M13-S28`: hide the form when `infoResponseMessage != null`.
- [x] **`GET /v1/bookings` pagination for MVP:** resolved — load all bookings with `limit=50`, display all, no infinite scroll. Implemented in `M13-S27`.
- [ ] **Loyalty conversion-rate UI scope (verify against UC-016):** `M13-S29`'s "10 pts = R$ 1,00" conversion row was carried over from the prototype with only an inline-comment caveat in the original draft. CLAUDE.md describes the loyalty MVP as points-balance only — confirm with product whether the conversion display is actually in scope before shipping `M13-S29`'s conversion row, even though it's gated behind `conversionRate > 0`.

### Manager workspace (Phase 8, M13-S31–M13-S37)

- [ ] **Extra tenant-settings fields** (`autoApproveEnabled`, `maxBookingAdvanceDays`, `minBookingAdvanceHours`, `slotGranularityMinutes`, `localization` currency/language, `notification.fromEmail`, `businessInfo.socialLinks`): the backend already supports these, but neither UC-026 nor the Configurações prototype mention them. Needs an explicit scope decision before a story is written for them — don't add silently to `M13-S31`.
- [ ] **Per-module config panels for `SERVICE_LIST`, `GALLERY`, `BOOKING_CTA`, `TESTIMONIALS`, `ABOUT`, `CONTACT`:** only HERO was prototyped as a representative example (`M13-S36`). Each of the other 6 needs its own UX pass — `GALLERY` in particular already has a `feature-booking-photo` BFF endpoint wired that none of the stories above use yet.
- [ ] **BFF-token-based hotsite preview (pixel-exact production-path render):** `M13-S37` ships a pragmatic client-side render instead. Revisit only if the simplified preview proves insufficient in practice.
- [x] **Sidebar "Fidelidade" and "Hotsite" nav items:** both confirmed included from the start in `M13-S15` (the original M125 draft's sidebar spec omitted Hotsite — caught during the manager-workspace cross-file audit and folded into `M13-S15` directly rather than a separate patch).
- [ ] **Per-module "Configurar" UX:** modal, slide-over, or full route? Pick whichever precedent Phase 4/5 already established (`M13-S36` discovery).
- [ ] **`GET /staff` exposing `googleOAuthId`/`deactivatedBy`:** confirm at `M13-S32` discovery; add whichever is missing.
- [x] **Coordinating `/dashboard/settings`, `/dashboard/team`, `/dashboard/hotsite` middleware additions:** resolved by sequencing — `M13-S32` is the first manager-only route story and owns the middleware extension; `M13-S31`/`M13-S35` land after and reuse it rather than each editing `middleware.ts` independently (see `M13-S32`'s AC note).

### Staff loyalty (Phase 1 + Phase 6, M13-S11/M13-S12/M13-S25/M13-S26)

- [x] **`loyaltyConversionRate` in booking detail response:** resolved — added to `StaffBookingDetailResponse` (`M13-S04`'s note), sourced from `M13-S12`, so `M13-S26`'s completion route doesn't need a second BFF call on mount.
- [ ] **"Clientes recentes" query:** does `GET /v1/customers?search=&limit=5` with empty `search` return the 5 most recently active customers (sorted by last booking `completedAt`)? Confirm the backend query plan at `M13-S25`, or simplify to alphabetical sort for MVP.
- [ ] **Redemption notes field in UI:** `LoyaltyRedemption.notes` is optional; `M13-S11`'s `CompleteBookingLoyaltyEffectsUseCase` deliberately leaves it `null` for booking-completion-triggered redemptions — hardcoding a pt-BR string like "Desconto na conclusão do agendamento" server-side would violate the English-only-code/tenant-locale rule (a non-BR tenant's customer would see Portuguese), and `bookingId` already links the redemption to its booking without needing free text. Still open for `M13-S26`: does the UI need a note at all, and if so, is it staff-entered free text or a locale-aware label generated client-side (where i18n already lives)?
- [x] **`conversionRate` in the customer-facing balance route too:** resolved — `M13-S12` enriches both the staff (`getBalanceAdmin`) and customer (`getBalance`) routes, so `M13-S29` (customer Fidelidade page) can use the field once it ships.

### Guest submit-info (Phase 9, M13-S38–M13-S40)

- [ ] **`jsonwebtoken` vs. `jose`:** does `jsonwebtoken` work server-side in Next.js 16 (Node.js runtime only, not Edge)? Or should `jose` (Web Crypto API, Edge-compatible) be used for `verifyGuestToken()`? Resolve before `M13-S40`.
- [ ] **Presigned-URL BFF endpoint for unauthenticated guests:** does it exist? Determines whether photo upload is in scope for `M13-S40` (MVP default: text-only, omit upload zone if missing).
- [ ] **Tenant branding on the submit-info page:** the guest token contains `tenantId` but not `tenantSlug`; adding `tenantSlug` to the JWT payload would let the page call `GET /[slug]` for branding. Cosmetic, affects guest trust — not scoped in `M13-S40`, tracked as a post-MVP enhancement.
- [x] **What happens if the guest opens the link after the booking was already approved/rejected/cancelled:** resolved — the API returns `409`/non-`INFO_REQUESTED`, and `M13-S40`'s invalid-link view gets a `reason="processed"` variant with copy "este agendamento já foi processado."

### Non-goals confirmed out of scope for this milestone

- Photo upload on the guest submit-info form, unless the presigned-URL guest endpoint is confirmed to exist (`M13-S39`/`M13-S40`)
- Email template changes — only the link URL changes (`M13-S38`), not the email body
- A BFF preview-token for pixel-exact hotsite preview (`M13-S37` ships the simpler client-side version)
- Per-module config panels for the 6 non-HERO hotsite modules (`M13-S36`)
- Staff explicit logout button, "Bem-vindo" first-login banner, real-time queue updates (all noted above as deferred, not silently dropped)
