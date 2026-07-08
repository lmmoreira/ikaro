# M13 — Dashboard Frontend: Implementation Details (AI Agent Reference)

> Token-efficient reference. No prose. Load only when working on M14+ tasks that touch the staff/manager dashboard (`apps/web/app/dashboard/**`), the customer account area (`apps/web/app/[slug]/my-account/**`), the hotsite editor (`apps/web/app/dashboard/hotsite/**`), the BFF's booking/service/loyalty/staff/platform modules, or the Playwright E2E suite.

---

## Artifacts Table

### Backend — new/changed by context

| Context | Artifact | Path |
|---|---|---|
| Platform | `TenantSettingsController` (`GET`/`PATCH tenants/settings`) | `contexts/platform/infrastructure/controllers/tenant-settings.controller.ts` |
| Platform | `TenantController` (`PATCH tenants` — rename only) | `contexts/platform/infrastructure/controllers/tenant.controller.ts` |
| Platform | `RenameTenantUseCase` | `contexts/platform/application/use-cases/rename-tenant.use-case.ts` |
| Booking | `Money.subtract()` | `shared/value-objects/money.ts` |
| Booking | `BookingDiscount{NotAvailable,Disabled,Mismatch,ExceedsTotal}Error` | `contexts/booking/domain/errors/booking-domain.error.ts` |
| Booking | `Booking.complete()` (now accepts `discountByPoints`) | `contexts/booking/domain/booking.aggregate.ts` |
| Booking | `Booking.cancellableUntil()` / `cancellableUntilIso()` / `isEligibleForCancellation()` / `pointsEarned()` | `contexts/booking/domain/booking.aggregate.ts:648-667` |
| Booking | `Service.activate()` (new, mirrors `deactivate()`) | `contexts/booking/domain/service.aggregate.ts` |
| Booking | `ActivateServiceUseCase` | `contexts/booking/application/use-cases/activate-service.use-case.ts` |
| Loyalty | `CompleteBookingLoyaltyEffectsUseCase` (replaces deleted `RecordLoyaltyEntriesUseCase`) | `contexts/loyalty/application/use-cases/complete-booking-loyalty-effects/` |
| Loyalty | `LoyaltyRedemption.pointsPerCurrencyUnit` (snapshot at redemption time) | `contexts/loyalty/domain/loyalty-redemption.aggregate.ts` |
| Staff | `LinkGoogleAccountUseCase` (replaces `ActivateStaffUseCase`) | `contexts/staff/application/use-cases/link-google-account.use-case.ts` |
| Staff | `Staff.activate()` (new, mirrors `deactivate()`) | `contexts/staff/domain/staff.aggregate.ts` |
| Staff | `ActivateStaffUseCase`, `UpdateStaffProfileUseCase` | `contexts/staff/application/use-cases/{activate-staff,update-staff-profile}.use-case.ts` |
| Staff | `StaffSelfReactivationError`, `StaffAlreadyActiveError`, `LastActiveManagerError` (shared with deactivate) | `contexts/staff/domain/errors/staff-domain.error.ts` |
| Notification | `buildRespondLink()` → `/bookings/:id/submit-info` (was `/responder`) | `contexts/notification/application/use-cases/send-booking-info-requested-notification/` |

### BFF — by module (`apps/bff/src/features/`)

| Module | Artifact | Path |
|---|---|---|
| `auth/` | `auth.controller.ts`, `auth-controller-flow.service.ts` (all business logic — controller is thin), `jwt-issuer.service.ts`, `cookie-options.ts` (`JWT_COOKIE_OPTIONS`), `dtos/switch-tenant.dto.ts` (`{ targetTenantId: uuid }`) | `features/auth/` |
| `booking/` | `bookings.controller.ts`, `bookings.mapper.ts` (`toStaffBookingCard/Detail`, `toCustomerBookingListItem/Detail`, `toGuestBookingRead`), `guest-token.util.ts` (`verifyGuestToken`, `tryDecodeRawJwt`) | `features/booking/` |
| `booking/` (services) | `services.controller.ts`, `services.mapper.ts`, `services.public.controller.ts` (moved under `public/services` in S05) | `features/booking/` |
| `booking/` (schedule) | `schedule.controller.ts`, `schedule-opening.controller.ts`, `schedule-availability{,-summary}.controller.ts` | `features/booking/` |
| `loyalty/` | `loyalty.controller.ts` (customer + admin routes in one controller), `loyalty.mapper.ts` (`computeAmountDeducted`, `formatBRL` via `Intl.NumberFormat`) | `features/loyalty/` |
| `customer/` | `customers.controller.ts` (`searchCustomers`, `GET /customers/:id/loyalty` composite endpoint) | `features/customer/` |
| `staff/` | `staff.controller.ts`, `staff.mapper.ts` (`deriveStaffStatus` — checks `googleOAuthId` **before** `isActive`) | `features/staff/` |
| `platform/` | `tenant-settings.controller.ts` (pure passthrough — mapper built then deleted, see Gotchas), `tenant.controller.ts` | `features/platform/` |
| shared | `backend-headers.ts` (`buildBackendHeaders()` — derives `X-Tenant-ID`/`X-Actor-ID`/`X-Actor-Type`/`X-Actor-Role` from JWT) | `shared/http/backend-headers.ts` |
| shared | `tenant.guard.ts` (now a no-op unless `X-Tenant-Slug` header is present — browser stopped sending it after S17) | `shared/guards/tenant.guard.ts` |

### Frontend (`apps/web/`) — by area

| Area | Artifact | Path |
|---|---|---|
| Transport | `bff-client.ts` (axios, `withCredentials: true`), `bff-server.ts` (`bffServerFetch(token, path)`), `errors.ts` (`AuthError`/`ForbiddenError`/`ApiError`) | `shared/lib/api/` |
| Transport | `QueryProvider` (`staleTime: 30_000`, `retry: 1`), `TenantProvider` (`useTenant()`) | `providers/` |
| Middleware | `middleware.ts` — JWT decode (Edge-safe `atob`), STAFF/MANAGER guard on `/dashboard/**`, MANAGER-only on `/dashboard/{settings,team,hotsite}`, CUSTOMER+slug-match guard on `/{slug}/my-account/**`, CSP headers | `apps/web/middleware.ts` |
| Dashboard shell | `DashboardShell`, `Sidebar`, `Topbar`, `BottomNav`, `ManagerSheet` | `shells/dashboard/components/` |
| Dashboard shell | `DashboardLayoutShell`, `DashboardSectionShell` (shared layout-composition helpers — **not used by every section**, see Gotchas) | `shells/dashboard/components/` |
| Dashboard shell | `topbar-status-context.tsx` (`DashboardTopbarStatusProvider` — route-scoped chrome state: booking/service/staff-role status badge, back-href/back-label/onBack overrides) | `shells/dashboard/components/` |
| Dashboard shell | `mobile-action-bar.ts` (`MOBILE_ACTION_BAR_CLEARANCE_CLASS`) | `shells/dashboard/utils/` |
| Dashboard shell | `dashboard-shell-context.ts` (`buildDashboardShellContext`/`loadDashboardShellContext` — reads `tenantName`/`userName`/`role`/`locale` **directly from JWT**, no extra fetch) | `shells/dashboard/model/` |
| Dashboard shell | Route-matching helpers: `booking-route.ts`, `service-route{,.server}.ts`, `team-route.ts` (all reused by both `Topbar` and `BottomNav` to decide drill-down chrome) | `shells/dashboard/model/` |
| Customer shell | `CustomerShell`, `CustomerTopbar`, `CustomerTabNav`, `CustomerBottomNav` | `features/customer/components/` |
| Customer shell | `customer-nav-items.ts` (`shouldShowCustomerBottomNav`, `isCustomerNavActive`) | `features/customer/` |
| Booking dashboard | `BookingQueuePage`, `BookingCard`, `WeekNav`, `BookingDetailPage`, `BookingDetailMain`, `BookingActionPanel`, `RejectBookingSheet`, `RequestInfoSheet`, `AdminCancelBookingSheet`, `SlotConflictAlert`, `RescheduleBookingPage`, `MarkCompleteBookingPage`, `AfterServicePhotoUpload`, `BookingActionSheetShell`, `BookingCompletionSummary`, `BookingOutcomeActionRail` | `features/booking/components/dashboard/bookings/` |
| Booking dashboard | `use-modal-dialog.ts` (native `<dialog>` focus-trap + `showModal()`, shared by every action sheet) | `features/booking/hooks/` |
| Booking dashboard | `useBookingMutations.ts` (`useInvalidateBookings()` → `['bookings', tenantId]`) | `features/booking/hooks/` |
| Schedule | `SchedulePage`, `ClosureFormSheet`/`OpeningFormSheet` (thin wrappers over shared `ScheduleDateTimeRangeSheet`), `RemoveClosureDialog`/`RemoveOpeningDialog` (over shared `ScheduleRemovalDialog`) | `features/booking/components/dashboard/schedule/` |
| Schedule | `schedule-preferences.ts` (localStorage view-mode/status-filter persistence, `useSyncExternalStore` + cross-tab `storage` event) | `features/booking/schedule/` |
| Services | `ServiceListPage`, `ServiceCard`, `ServiceCreatePage`, `ServiceEditPage`, `ServiceDeactivatePage`, `ServiceFormFields` | `features/booking/components/dashboard/services/` |
| Services | `service-form.ts` (`validateServiceForm`, shared by create+edit) | `features/booking/services/` |
| Loyalty (staff) | `LoyaltySearchPage`, `CustomerLoyaltyPage` | `features/loyalty/components/dashboard/` |
| Loyalty (staff) | `dashboard-api.ts` (client pagination fetchers), `dashboard-api.server.ts` (`getCustomerLoyaltyDetail` — one BFF composite call) | `features/loyalty/` |
| Customer account | `HomeDashboard`, `BookingsList`, `BookingListItem`, `BookingEmptyState`, `booking-sections.ts` (pure: `splitBookingSections`/`selectHomePreview`/`countActiveBookings`/`canCancelBooking`) | `features/customer/components/my-account/` |
| Customer account | `BookingDetailPage`, `BookingDetailMain`, `CancelAction`, `CancelConfirmPage`, `CancelErrorPage`, `InfoSubmitForm`, `CustomerPhotoUpload` | `features/customer/components/my-account/` |
| Customer account | `LoyaltyPage` | `features/customer/components/my-account/` |
| Customer account | `api.ts` (client mutations), `api.server.ts` (SSR reads, `withAuthRedirect`/`CustomerFetchError`) | `features/customer/` |
| Settings | `SettingsForm.tsx` (~1060 lines, 7 `SectionCard`s: Geral/Localização/Agendamento/Fidelidade/Notificações/Horário/Contato) | `features/platform/components/settings/` |
| Settings | `tenant-settings.ts` (`fetchTenantSettings` 300s-cached, `fetchTenantSettingsFresh` no-store, `updateTenantSettings`, `renameTenant`), `settings-form.ts` (`SettingsFormSchema`, `validateSettingsForm`) | `features/platform/` |
| Team | `TeamListPage`, `MemberRow` (`ResendInviteAction`, `ActivateMemberAction`, `splitFullName`), `InviteForm`, `DeactivateConfirmPage`, `StaffDetailPage` | `features/staff/components/team/` |
| Team | `api.ts` (`listStaff`, `inviteStaff`, `updateStaff`, `{de,}activateStaff`), `hooks/useStaff.ts` | `features/staff/` |
| Hotsite | `HotsiteEditor`, `BrandingTab`, `LayoutTab`, `SeoTab`, `HotsitePreview`, `ModuleConfigShell` + 8 module config panels | `features/platform/components/hotsite/` |
| Hotsite | `HotsiteAuthBar`, `HotsiteAuthBarDropdown` | `shells/hotsite/components/` |
| Hotsite | `map-hotsite-image-fields.ts`, `resolve-hotsite-image-url.ts` (+ `resolveHotsiteImageDisplayUrl`/`hotsiteImageBaseUrl`), `resolve-draft-image-urls.ts`, `strip-resolved-image-urls.ts` | `features/platform/hotsite/` |
| Guest booking | `SubmitInfoPage` (`app/bookings/[id]/submit-info/page.tsx`), `SubmitInfoForm`, `InvalidLinkView`, `PhotoUpload` (dual-mode slug/guestToken) | `app/bookings/[id]/submit-info/`, `features/booking/components/public/` |
| Guest booking | `guest-token.ts` (`verifyGuestToken`, `decodeUnverifiedTenantSlug` — signature NOT checked, branding-only use) | `features/booking/model/` |
| Login/logout | `app/dashboard/login/page.tsx`, `app/auth/error/page.tsx`, `app/select-staff-tenant/page.tsx`, `app/[slug]/login/page.tsx`, `app/switch-tenant/page.tsx` | `app/` |
| Proxy routes | `app/api/customers/me/route.ts`, `app/api/customers/tenants/route.ts`, `app/api/auth/{staff-tenants,staff-token,switch-tenant}/route.ts` | `app/api/` |
| Customer info completion | `InformationCompletionPrompt.tsx` (mandatory phone **and** address) | `features/customer/components/` |
| Shared utils | `phone-format.ts` (per-country visual mask + E.164 prefix) | `shared/utils/` |

### `@ikaro/types` additions

| Artifact | File | Notes |
|---|---|---|
| `StaffBookingCard/List/DetailResponse`, `CustomerBookingList/DetailResponse`, `GuestBookingReadResponse` | `booking.dto.ts` | Role-branched booking shapes |
| `StaffServiceResponse/ListResponse`, `Create/UpdateServiceRequest` | `service.dto.ts` | `priceAmount`/`durationMinutes` convention |
| `CustomerLoyaltyBalance/Entry/EntriesResponse`, `CustomerLoyaltyRedemption/RedemptionsResponse`, `EnrichedLoyaltyBalanceResponse` | `loyalty.dto.ts` | `pointsEarned`/`expired`/`pointsUsed`/`amountSaved`/`bookingReference`/`conversionRate` |
| `TenantOption`, `SwitchTenantResponse`, `StaffTenantOption` | `auth.dto.ts` | `IssueTokenResponse` **deleted** in S14 (dead `/auth/token` removed) |
| `CustomerProfileResponse` | `customer.dto.ts` | Reuses shared `Address` (widened `complement` to `string \| null`) |
| Full camelCase `UpdateTenantSettingsRequest`, `RenameTenantRequest/Response` | `tenant.dto.ts` | Backend JSONB itself is camelCase — no mapper needed |

---

## Migrations Added in M13

| Timestamp | File | What |
|---|---|---|
| `1748400000002` | `AddBookingNotes` | `notes` column on bookings (S07) |
| `1748400000003` | `AddLoyaltyRedemptionPointsPerCurrencyUnit` | Snapshot field on `LoyaltyRedemption` (S08/S11) |
| `1748400000004` | `AddBookingDiscountByPoints` | `discount_points_used`, `discount_amount` + CHECK (both-null-or-both-positive) (S11) |

**`1716600000002-CreateStaffStaff` was edited in place (S13), not superseded** — `UNIQUE(google_oauth_id)` → `UNIQUE(tenant_id, google_oauth_id)` partial index. Safe pre-production edit per this repo's migration-cleanup convention; do not treat as two migrations.

---

## Auth & Multi-Tenancy Architecture (current state, post-S17)

**JWT payload** (`jwt-issuer.service.ts`): `{ sub, tenantId, tenantSlug, tenantName, userName, role: 'CUSTOMER'|'STAFF'|'MANAGER', locale }`. Cookie-based (`access_token`, httpOnly) — the client-side transport singleton from S01 (`configureBffClient()` + manual `Authorization`/`X-Tenant-Slug` headers) **was fully replaced in S17**. `TenantGuard` on the BFF is now a no-op unless `X-Tenant-Slug` is present (the browser stopped sending it).

**Actor headers, BFF → backend:** `buildBackendHeaders()` derives `X-Tenant-ID`/`X-Actor-ID`/`X-Actor-Type`/`X-Actor-Role` from `req.user` on every call. Backend guards (`ManagerRoleGuard`/`StaffOrManagerRoleGuard`) read `X-Actor-Role` **directly off the raw header**, not `RequestContext` — guards run before the interceptor that populates `RequestContext`'s `AsyncLocalStorage`. Trusted only because the backend is reachable solely from the BFF over a private network (open risk tracked in `plan/M16-CICD-DEPLOY-HARDENING.md` §M16-S11).

**Staff multi-tenancy (S13 — a model change, not a bugfix):** `UNIQUE(tenant_id, google_oauth_id)` (was global). Staff is now provisioned `isActive=true` from creation (was `false` — that was itself a bypassable-invite security bug). 2+ active tenants for one Google account → `/select-staff-tenant` (now an **authenticated**, `@Roles('STAFF','MANAGER')` post-login screen fed by `GET /staff/me/tenants`, doubling as an ongoing tenant-switch UI via `POST /auth/switch-staff-tenant` — not S13's original pre-login selection-token design).

**Customer tenant switch (UC-023, S14):** `GET /v1/customers/tenants`, `/switch-tenant` page, "Trocar empresa" in `HotsiteAuthBarDropdown`.

**`/select-tenant` (customer, pre-login multi-tenant chooser) was permanently descoped in S14** — confirmed unreachable from any shipped UI. Dead BFF code (`handleMultiTenantLogin`, `POST /auth/token`) deleted. `IssueTokenResponse` removed from `@ikaro/types`.

**Staff invite/activation status is derived, never stored:** `deriveStaffStatus()` — `googleOAuthId === null` → `PENDING`; else `isActive ? ACTIVE : DEACTIVATED`. **Must check `googleOAuthId` first** (checking `isActive` first misclassifies a fresh invite as `ACTIVE` post-S13). `googleOAuthId` never reaches `@ikaro/types`/the browser.

**Guest tokens (S38-S41):** `{ bookingId, tenantId, tenantSlug?, contactEmail }`, HS256, `JWT_SECRET`, 7-day TTL, no DB-side revocation/single-use tracking — expiry is the only lifetime control. The JWT signature *is* the sole authorization boundary; re-verified independently by the BFF on every write. **Re-implemented (not shared) in three places** — `apps/bff/.../guest-token.util.ts`, `apps/web/features/booking/model/guest-token.ts`, and the E2E `mintGuestToken()` helper — a drift risk with no shared package backing it.

---

## Dashboard Shell: Mobile Nav / Chrome Invariants

**`BottomNav`'s hide-list is a drill-down detector, not a route blocklist.** It hides only for routes with a topbar back-arrow: booking detail, service detail/create, loyalty detail, team invite/detail. `/dashboard/settings` and `/dashboard/hotsite` are **top-level sections with no back arrow** and must stay in `BottomNav`'s *visible* set — their own fixed mobile action bar is offset above `BottomNav` via `MOBILE_ACTION_BAR_CLEARANCE_CLASS` (`bottom-[calc(4rem+env(safe-area-inset-bottom,0px))]`) instead of overlapping it at `bottom-0`.

> **Trap for any new top-level `/dashboard/<section>` route:** do not add it to `BottomNav`'s hide-list unless it is a genuine drill-down with its own back arrow. Copying the hide-list pattern without checking this is exactly how the settings/hotsite bug shipped.

**Action-sheet/dialog pattern:** native `<dialog>` via `useModalDialog(open)` → `showModal()` (top-layer centering) + focus-trap + focus restoration. `BookingActionSheetShell` is the shared two-layer wrapper: outer `<dialog>` is `m-0 h-dvh w-dvw bg-transparent`; an inner `<div>` positions/centers; a `<form>` card sits inside that. **If a dialog renders top-left/unstyled, check for a plain `open` attribute instead of `showModal()`** — `open` doesn't get the same UA centering.

**Route-scoped chrome state** (status badge, back-href/label/onBack) lives in `DashboardTopbarStatusProvider`, mounted per-section in each `layout.tsx`, keyed to force remount between records (e.g. `bookingRouteMatch?.bookingId ?? 'dashboard-shell'`). Never mirror this in shell-local state or an effect-based sync.

**Query invalidation contract:** `useInvalidateBookings()` → `queryClient.invalidateQueries({ queryKey: ['bookings', tenantId] })` — one prefix shared by queue/detail/filtered views. Any query-key shape change must update this in the same commit.

**Section-layout composition is inconsistent** (not a bug, but worth knowing before adding a new dashboard section): `services/`, `team/`, `settings/`, `hotsite/` use the shared `DashboardLayoutShell`/`DashboardSectionShell` helpers; `bookings/`, `schedule/`, `loyalty/` still hand-roll the `LocaleProvider`/`FormattingProvider`/`TenantProvider`/`DashboardTopbarStatusProvider`/`DashboardShell` nesting inline (~40-line near-duplicate blocks). Prefer the shared helpers for anything new.

---

## Booking Lifecycle in the Dashboard

Action panel branches purely on `booking.status`: `PENDING`/`INFO_REQUESTED` → triage (approve/reject/request-info); `APPROVED` → lifecycle (complete/reschedule/cancel); terminal states → back-to-agenda only. Approve `409` → `fetchBookingAvailability` + `SlotConflictAlert` (shared with reschedule's conflict path). **Reschedule never changes status** — booking stays `APPROVED`.

**Never compute `cancellableUntil`, `conversionRate`, or `pointsEarned` in the BFF — always the backend, at the source.** All three were tried BFF-side first and either 403'd (backend endpoint they'd need to call is STAFF/MANAGER-only, breaking CUSTOMER callers) or drifted (recomputing from a tenant setting that can change later, silently rewriting history). `docs/ANTI_PATTERNS.md` row 113 codifies this. `/tenants/settings` specifically is STAFF/MANAGER-only — any BFF path reachable by a CUSTOMER-forwarded request must never call it.

**Completion is one transaction, one idempotency check.** `CompleteBookingLoyaltyEffectsUseCase` inlines earn + optional redeem under one `txManager.run()` keyed by `(eventId, CONSUMER_NAME)` — replaced an earlier draft that composed two separate use cases sequentially (a real atomicity hole: crash between redemption write and marking-processed → double-redeem on retry). `RedeemPointsUseCase` remains untouched, serving only the standalone admin `POST /loyalty/redeem` endpoint.

**`amountSaved`/discount amounts are point-in-time snapshots.** `LoyaltyRedemption.pointsPerCurrencyUnit` is captured at redemption time; historical `amountSaved` is computed from that stored value, never today's tenant setting.

**Photo-URL signing lives in the backend**, benefiting both STAFF and CUSTOMER response branches for free — `GetBookingByIdUseCase.toResult()` signs `before/afterServicePhotoUrls` before the BFF ever sees them.

**Ownership-mismatch on `GET /bookings/:id` deliberately returns `404`, not `403`**, for a CUSTOMER who isn't the booking's owner (don't confirm existence) — inconsistent with `cancel-booking-as-customer`/`submit-booking-info` (which `403`), documented as a known, accepted inconsistency.

---

## Schedule & Services

- **`ScheduleClosure`/`ScheduleOpening` are hard-deleted; `Service` is soft-deleted (`isActive` flip).** Two different lifecycle models in one milestone — don't assume uniform soft-delete.
- **`Service.update()` is active-only** — throws `ServiceDeactivatedError` if `isActive=false`; BFF surfaces as `409`. `ServiceEditPage` swaps to a locked "Reativar" view instead of editable fields for inactive services.
- **Service reactivation exists** (`PATCH /v1/services/:id/activate`, `useActivateService`) but is undocumented in `docs/04-USE_CASES.md` UC-013 (no alt-flow) — same gap pattern as staff (see below).
- **Deactivating a service does not touch existing bookings** — no cascade; only blocks *new* bookings against it (`BookingServiceNotActiveError`).
- Time inputs in schedule sheets are constrained to the tenant's `slotGranularityMinutes` via a `<Select>` (`buildTimeOptions`), not free-form `<input type="time">`.
- **Booking-overlap warning for a new closure is computed client-side against the *currently loaded* week's bookings** — a closure dated outside the visible week can under-report `overlapCount` (stale/empty data for that range). Verify before relying on this AC for far-future dates.
- Schedule board's default visible statuses exclude `PENDING` (`SCHEDULE_BOOKING_STATUS_DEFAULT`); PENDING is opt-in via a status-filter FAB.

---

## Loyalty & Staff Status: Parallel "Derived, Not Stored" Patterns

Both loyalty amounts and staff status follow the same principle — a value that could drift is computed from an immutable source, not stored/recomputed loosely:

| Value | Source of truth | Anti-pattern avoided |
|---|---|---|
| Redemption `amountSaved` | `LoyaltyRedemption.pointsPerCurrencyUnit` (snapshot) | Recomputing from today's rate would rewrite history |
| `cancellableUntil` | `Booking.cancellableUntil()` (backend aggregate) | BFF-computed version 403'd for CUSTOMER (needed `/tenants/settings`) |
| `conversionRate` | Backend loyalty controller reads `RequestContext.settings.loyalty.pointsPerCurrencyUnit` directly | Same 403 class of bug, same fix |
| Staff `status` (`ACTIVE`/`PENDING`/`DEACTIVATED`) | `deriveStaffStatus(googleOAuthId, isActive)` in the BFF mapper | Checking `isActive` before `googleOAuthId` misclassified fresh invites post-S13 |

**Staff activation is permanently one-way without M13-S44's fix.** `InviteStaffUseCase` throws `StaffAlreadyExistsError` for *any* email that ever linked Google, active or deactivated — `deactivate()` never clears `googleOAuthId`. Reactivation requires the dedicated `Staff.activate()`/`PATCH /staff/:id/activate` path (one-click "Ativar", no confirmation page, mirrors `ResendInviteAction`). Re-inviting a deactivated member does **not** reactivate them — a real, easy-to-assume-wrong trap.

---

## Hotsite Editor (S35-S37, S42)

- `HotsiteEditor` is tab-based (`branding`/`layout`/`seo`) plus two extra `EditorView` states reached from the tabs view: `'module-config'` (drill into one module) and `'preview'` (lazy-loaded via `next/dynamic(..., {ssr:false})`, reuses M12's public render components). No new route for either.
- `SeoTitle`/`SeoDescription` are backend VOs (60/158 char limits — Google truncation points, not the original 70/160 placeholders), mirroring `HexColor`'s `create()`/`reconstitute()`/`value` pattern. **`updateContent()` must only re-validate `seo` when it actually changes** — validating an unchanged passthrough value against current limits would block *any* future update (branding/layout-only included) for a tenant whose stored SEO predates a limit tightening.
- Publish = `PATCH /tenants/hotsite` (draft) then `POST /tenants/hotsite/publish`. Unpublish = `POST /tenants/hotsite/unpublish` only (does not save pending edits). Both use one shared inline success/error banner rendered on the `'tabs'` view — **any` failure path, including one triggered from Preview, must switch back to `'tabs'` first**, or the banner never renders.
- **Image URL round-trip**: GET resolves every image field (branding logo, module images, gallery/testimonial sub-items) to a full public URL; PATCH requires the raw `tenants/<id>/hotsite/...` path. `stripResolvedImageUrls()`/`resolveDraftImageUrls()`/`resolveHotsiteImageUrl()` (all sharing `mapHotsiteImageFields()`'s field walk) convert each direction. Applied unconditionally to every field, changed or not — safe because a value without a `tenants/<id>/` segment passes through untouched.
- `HotsiteAuthBar`/`HotsiteAuthBarDropdown` (S42) added session-awareness to the public hotsite ahead of the dashboard shells existing — self-contained (own `/{slug}/login` page, own BFF logout route, own `/api/customers/me` proxy). Dark-theme branding bugs recur here: dropdown surface color, initials-avatar text color, and login-page background must always be paired (`--ba-background` with `--ba-text`) — check every new hotsite-adjacent component against a dark-themed tenant (e.g. one with `textColor:#FFFFFF`/`backgroundColor:#0A0A0A`).

---

## E2E Test Infrastructure (established S41, load-bearing for every later spec)

- **Folder shape:** `apps/web/e2e/helpers/<feature>/index.ts` barrel + one file per concern. 12 helper folders today: `auth`, `loyalty`, `customer`, `staff`, `schedule`, `platform`, `localization`, `booking`, `services`, `hotsite`, `booking-form`.
- **Login = dev-login, never real OAuth.** `loginAsCustomer(page, email, tenantSlug)`/`loginAsStaff(...)` POST `BFF /auth/dev-login` (`ENABLE_DEV_AUTH=true` + `X-Internal-Key`), then set the real `access_token` cookie — byte-identical to a genuine session.
- **Seeded accounts:** `admin@lavacar.com.br` (manager, `lavacar-beloauto`), `funcionario@lavacar.com.br` (staff, same tenant), `admin@ikaro.com` (`ikaro`), `admin@autospa.com.br` (`autospa-premium`). Fresh customers minted per-test via `uniqueTestEmail(prefix)`.
- **Cookie-jar gotcha:** `page.request` shares the *page's* cookie jar. Any helper that seeds a fixture via dev-login as a *different* user (e.g. `linkStaffGoogleAccount()`) must use an isolated `playwrightRequest.newContext()` — otherwise dev-login's side-effect cookie silently hijacks the running test's session, causing spurious 403s later in the same test.
- **`data-testid`-only, enforced by `scripts/pre-pr.sh` (E2E-1/E2E-2/E2E-3):** no `getByLabel(`/`getByText(` (E2E-1); no ISO date literal embedded in a `data-testid` value — use a separate `data-date` attribute (E2E-2); no template-literal `data-testid` — encode the variable part in its own `data-*` attribute (E2E-3). This took 4 follow-up commits to stick after S41 and caught real defects as late as M13-S37.
- **`playwright.config.ts` has no `webServer`** — tests run against an already-running stack (local `docker compose up -d && pnpm dev`; CI's `pr-e2e.yml` starts its own). `PLAYWRIGHT_BASE_URL`/`PLAYWRIGHT_BFF_URL` override defaults (`localhost:3000`/`localhost:3002/v1`) — separate from `NEXT_PUBLIC_BFF_URL` since the Playwright process doesn't inherit the web server's env.
- **Convention since S41:** every new `app/**/page.tsx` ships a Playwright spec in the same story.

---

## Environment Variables Added in M13

| Var | Where | Notes |
|---|---|---|
| `JWT_SECRET` | `apps/backend` + `apps/bff` + `apps/web` | Signs/verifies the guest-token JWT (S38-S41) — must match across all three |
| `ENABLE_DEV_AUTH` | `apps/bff` | Gates `/auth/dev-login`, used exclusively by E2E helpers |

---

## Gotchas

1. **`BottomNav`'s hide-list is for drill-downs only** — a new top-level `/dashboard/<section>` must NOT be added to it unless it has its own topbar back arrow, or mobile users get stranded with no way to reach any other section (the exact M13-S37 post-merge bug).
2. **Dialog centering requires `showModal()`, not the plain `open` attribute** — if a new action sheet renders top-left/unstyled, that's the first thing to check.
3. **Never compute `cancellableUntil`/`conversionRate`/`pointsEarned` in the BFF** — always read from the backend aggregate or `RequestContext.settings`. Every attempt to do this in the BFF either 403'd for CUSTOMER callers (hit a STAFF/MANAGER-only endpoint) or silently drifted from history.
4. **`/tenants/settings` (`GET`) is STAFF/MANAGER-guarded** — no BFF code path reachable by a CUSTOMER-forwarded request may call it, even transitively via `Promise.all` enrichment.
5. **Staff `status` must check `googleOAuthId` before `isActive`** — `Staff.invite()` provisions `isActive=true` from creation (a S13 security fix); checking `isActive` first misclassifies every fresh invite as `ACTIVE`.
6. **Deactivating staff never clears `googleOAuthId`** — re-inviting a deactivated member always 409s (`StaffAlreadyExistsError`); the only way back is the dedicated `Staff.activate()`/`PATCH /staff/:id/activate` path (S44).
7. **`Service.update()` throws on an inactive service** — the edit UI must branch to a locked/reactivate view, not just disable a toggle.
8. **`ScheduleClosure`/`ScheduleOpening` are hard-deleted; `Service` is soft-deleted** — don't assume one lifecycle model applies to both.
9. **Guest-token verification is duplicated in three places** (BFF, web, E2E helper) with no shared package — a payload-shape change must be applied to all three or they silently drift.
10. **`decodeUnverifiedTenantSlug()` is a deliberate, narrowly-scoped exception** to "always verify JWTs" — used only to pick branding colors for an invalid-link screen, never for authorization. Still validates against `SLUG_PATTERN` before use (open-redirect guard) — don't remove that check when touching this function.
11. **E2E helpers sharing `page.request`'s cookie jar can silently hijack the running test's session** — any fixture-seeding call that logs in as a *different* user must use an isolated Playwright request context.
12. **`data-testid` must never embed a date literal or use a template literal** — encode variable parts in a separate `data-*` attribute (E2E-2/E2E-3, enforced by `scripts/pre-pr.sh`).
13. **The S01 BFF-client design (singleton + manual headers) is gone** — replaced end-to-end by cookie auth + `TenantProvider` in S17. Any doc or memory describing `configureBffClient()`/`X-Tenant-Slug` interceptor headers as the current transport is stale.
14. **`tenant-settings.mapper.ts` doesn't exist** — the backend's settings JSONB is camelCase natively; the BFF's tenant-settings controller is a pure passthrough. Don't recreate a translation-layer mapper here.
15. **Dark-theme branding pairing bugs recur around the hotsite auth bar/login page** — background and text CSS variables must always be set together (`--ba-background` + `--ba-text`), and any element deriving contrast (initials avatar, dropdown surface) must respect `buttonTextColor` overrides, not hardcode white/black.
16. **Section-layout composition is inconsistent across dashboard routes** — `services/`/`team/`/`settings/`/`hotsite/` use the shared `DashboardLayoutShell`/`DashboardSectionShell`; `bookings/`/`schedule/`/`loyalty/` still hand-roll the provider nesting. Prefer the shared helpers for any new section.
17. **`autoApproveEnabled` is user-editable in Settings but functionally inert** — no booking use case reads it yet. Don't assume the UI toggle implies backend behavior.
18. **Booking-overlap warnings in the schedule closure form only check the currently-loaded week** — a closure for a date outside the visible week can under-report overlaps.
