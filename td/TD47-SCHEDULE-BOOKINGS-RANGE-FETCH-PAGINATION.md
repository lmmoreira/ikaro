# TD47 — Booking Range/Window Fetches Silently Truncate Past Their Page Cap (Schedule + Bookings Queue)

## Status
- **Type**: Technical Debt / Correctness & Scalability
- **Priority**: Low — no observed incident; a tenant needs more than 100 bookings inside one displayed Schedule week, or more than 20 PENDING/INFO_REQUESTED/APPROVED bookings inside the Bookings Queue's configurable window (`welcomeStaffScreenDays`, 1–90 days, default 14), to hit it — the loss is confined to whichever rows sort last within the affected page
- **Context**: `apps/web/features/booking/api/`, `apps/web/features/booking/schedule/useSchedule.ts`, `apps/web/features/booking/hooks/useBookings.ts`, `apps/web/app/dashboard/schedule/page.tsx`
- **Created**: 2026-09-28
- **Discovered**: CodeRabbit round 1 on PR #528 (TD46), Major finding on `page.tsx:43`, verified against the code the same day; scope expanded to the Bookings Queue's own range/window hooks during `/story-discovery` the same day, after finding they share the identical unpaginated-fetch shape with an even tighter default cap (20, not 100)
- **State**: ✅ Done — shipped 2026-09-28 (PR #531)
- **Related**: TD46 (`docs/archive/td/TD46-COLUMNS-BOARD-WEEK-BOUNDARY-BOOKING-FETCH-GAP.md`, PR #528) — widened the Schedule fetch by one day and explicitly accepted the cap as out of its scope; TD48 (`docs/archive/td/TD48-BOOKING-LIST-DATE-RANGE-TENANT-TIMEZONE.md`) — independent defect on the same Schedule fetch (UTC-day range instead of tenant timezone), ✅ Done (PR #529, PR #530)

---

## Problem

The schedule's week bookings fetch requests exactly one page and never asks for another:

- **Server prefetch** — `apps/web/app/dashboard/schedule/page.tsx` calls `listBookings(token, { status, from, to, limit: 100 })` once.
- **Client query** — `useWeekBookings` (`apps/web/features/booking/schedule/useSchedule.ts:145-153`) calls `listBookings({ status, from, to, limit: 100 })` once.
- **The BFF caps `limit` at 100** (`bookings.schemas.ts:143`, `z.coerce.number().int().min(1).max(100)`), so a single request can never return more.
- **The backend orders `scheduledAt ASC` and truncates** (`typeorm-booking.repository.ts`, `findAndCount({ order: { scheduledAt: 'ASC' }, take, skip })`), so when a range holds more than 100 bookings, the rows that are dropped are the **last** days of the range (e.g. Sunday), silently — the response still carries the true `total`, but nothing compares it to `items.length`.

Effect: bookings on the final days of an over-cap week vanish from the Day view, the Week view and the columns board's `bookingById` (where a day-grid block for such a booking then falls to the generic placeholder instead of naming the contact).

This limitation pre-dates TD46. TD46 (PR #528) made the exposure marginally larger by starting the fetch one day early: that extra day sorts first, so on a week already at the cap it pushes up to one day's bookings past it. TD46 recorded that as an accepted, out-of-scope trade-off; this TD is where it gets closed properly.

### Same defect, tighter cap — the Bookings Queue

The Bookings Queue screen (`apps/web/app/dashboard/bookings/page.tsx` → `BookingQueuePage.tsx`) has the identical shape, discovered during this TD's `/story-discovery` session:

- `useActionNeededBookings(from, to)` and `useUpcomingBookings(from, to)` (`apps/web/features/booking/hooks/useBookings.ts:32-52,54-67`) are both `from`/`to` range fetches, routed through `fetchBookingsViaProxy` → `apps/web/app/api/bookings/route.ts` → the BFF.
- `useTodayBookings(date)` (same file, single-day `date` fetch) shares the same `fetchBookingsViaProxy` transport and the same lack of pagination — a busy single day can also exceed the cap.
- None of the three passes an explicit `limit`, so all three default to the BFF's `limit: 20` (`bookings.schemas.ts:143`) — a tighter cap than Schedule's explicit 100.
- The window is `welcomeStaffScreenDays`, a tenant-configurable setting (`tenants.settings.booking.welcomeStaffScreenDays`, 1–90 days, default 14 — `apps/web/features/platform/model/tenant-settings.ts:27`), so the exposure scales with how a tenant configures their own queue window.
- `BookingPhotoPicker.tsx:68` (`listBookings({ status: 'COMPLETED', limit: 50 })`) is the one other `listBookings` caller checked and genuinely ruled out — it has no `from`/`to`, so it isn't a range/window fetch at all.

Same root cause, same fix shape — folded into this TD's scope rather than a separate follow-up, since the paging helper this TD introduces is transport-agnostic by design (see Chosen approach below).

### Premise verified against the code (2026-09-28)
- The web-facing list response is `{ items, total, page, limit }` (`packages/types/src/booking.dto.ts:93-98`) — it has **no** `hasMore`. The backend computes `pagination.hasMore`, but the BFF mapper (`bookings.mapper.ts:57-77`) reshapes it to `total/page/limit`. A "fetch until done" loop therefore has to test `page * limit >= total`, not a `hasMore` flag.
- The BFF's real paging parameter is **`page`** (1-based; `bookings-list-query.util.ts:14` derives `offset = (page - 1) * limit`). The web `BookingListFilters` (in both `booking.ts` and `booking.server.ts`) declares **`offset`** instead, which the BFF list schema does not define and would strip; nothing in the web app sends it today. So the web layer currently has no way to request a second page at all.

### Related — tracked separately
The same fetch's date range is also built in UTC instead of the tenant's timezone, which drops late-evening bookings from their own week. That is a different defect from the row cap and was tracked, with a proven reproduction, in `docs/archive/td/TD48-BOOKING-LIST-DATE-RANGE-TENANT-TIMEZONE.md` (✅ Done). Fixing pagination here does not change it.

---

## Chosen approach (decided in this session, 2026-09-28 — scope expanded to the Bookings Queue during `/story-discovery` the same day)

One pure paging loop (`listAllPages`), reused by three thin transport wrappers — one per transport this TD touches: `bffClient` (web client), `bffServerFetch` (web server), and `fetchBookingsViaProxy` (the `/api/bookings` proxy route the Bookings Queue's hooks use) — no new abstraction beyond that. `listAllPages` takes a plain `fetchPage(page: number) => Promise<StaffBookingListResponse>` callback, so it composes with any of the three without knowing which one it's talking to. Rejected: raising the cap (the BFF `max(100)` is a deliberate ceiling), and infinite-query/`useInfiniteQuery` (both screens need the whole range/window at once, not incremental scrolling).

---

### Story 0 — Fetch every page of range/window-fetched booking queries (Schedule + Bookings Queue) ✅ Done

**Agent:** frontend-ts
**Complexity:** M
**Docs to load:** `docs/ENGINEERING_RULES_FRONTEND.md`, `docs/08-TESTING_STRATEGY.md`, `docs/24-BFF_ARCHITECTURE.md` § Web → BFF Transport Layer
**Dependencies:** TD46 Story 0 (PR #528) — must be merged first; it changes the same two call sites (`page.tsx` and the `from` passed to `useWeekBookings`)
**Pattern:** plain composition — one pure paging loop that takes a "fetch page N" callback, plus three thin wrappers (web client, web server, `/api/bookings` proxy route) that each supply their own transport; no named pattern applies

**Discovered:** 2026-09-28, CodeRabbit round 1 on PR #528 (Major); Bookings Queue scope added same day during `/story-discovery`
**Root cause:** traced live — single-page `limit: 100` at `page.tsx` and `useSchedule.ts:145-153`; single-page, no-explicit-limit (defaults to BFF's 20) at `useBookings.ts:32-67` (`useActionNeededBookings`/`useUpcomingBookings`/`useTodayBookings`); BFF cap `bookings.schemas.ts:143`; backend `ASC` + `take/skip` truncation in `typeorm-booking.repository.ts`; response shape without `hasMore` at `booking.dto.ts:93-98`; web filters exposing dead `offset` instead of `page`.

**Description:**
Make every range/window bookings fetch retrieve the whole requested range instead of just its first page.

1. Add `page?: number` to `BookingListFilters` in both `apps/web/features/booking/api/booking.ts` and `booking.server.ts`, and remove the dead `offset` field (nothing sends it and the BFF ignores it). Update `booking.server.ts`'s query-string builder only if needed to send `page`.
2. Add one pure helper, `listAllPages` (`apps/web/features/booking/api/list-all-pages.ts`): it takes `fetchPage(page: number) => Promise<StaffBookingListResponse>`, requests page 1, then keeps requesting the next page while `page * limit < total`, and returns a single `StaffBookingListResponse` with every `items` entry merged in order. It must (a) de-duplicate by `bookingId`, because offset paging over a live table can repeat or skip a row if a booking is created between two requests, and (b) stop on an empty page even if `total` says more remain, so a stale `total` can never loop forever. Sequential requests — a range almost always needs one or two pages, so parallelising is not worth the extra code.
3. Add a thin `listAllBookings` wrapper in each of `booking.ts` (client, via `bffClient`) and `booking.server.ts` (server, via `bffServerFetch`) that calls `listAllPages` with that transport's own `listBookings` and `limit: 100`.
4. Use `listAllBookings` in `useWeekBookings` (`useSchedule.ts`) and in `page.tsx`'s prefetch, so both paths cover the same range. The merged result keeps the existing `StaffBookingListResponse` shape, so `initialData` and every downstream consumer are unchanged.
5. Add a thin `fetchAllBookingsViaProxy` wrapper in `apps/web/features/booking/hooks/useBookings.ts`, next to the existing `fetchBookingsViaProxy`, that calls `listAllPages` with `(page) => fetchBookingsViaProxy({ ...params, page: String(page), limit: '100' })` — the proxy route already forwards arbitrary query params 1:1 to the BFF, so no change to `apps/web/app/api/bookings/route.ts` is needed.
6. Use `fetchAllBookingsViaProxy` in `useActionNeededBookings`, `useUpcomingBookings`, and `useTodayBookings` in place of `fetchBookingsViaProxy`. Same unchanged-shape guarantee as step 4 — `BookingQueuePage.tsx` and its own tests are untouched.

`BookingPhotoPicker.tsx` (`listBookings({ status: 'COMPLETED', limit: 50 })`) is the one other `listBookings` caller and is deliberately untouched — it has no `from`/`to`, so it is not a range/window fetch and does not need every page.

**New migration / i18n keys / env vars / feature flags:** none

**Files to create/modify:**
- `apps/web/features/booking/api/list-all-pages.ts` (create) + `list-all-pages.spec.ts` (create)
- `apps/web/features/booking/api/booking.ts` (modify — `page` filter, drop `offset`, add `listAllBookings`) + `booking.spec.ts` (modify)
- `apps/web/features/booking/api/booking.server.ts` (modify — same) + `booking.server.spec.ts` (modify)
- `apps/web/features/booking/schedule/useSchedule.ts` (modify — `useWeekBookings` uses `listAllBookings`) + `useSchedule.spec.tsx` (modify)
- `apps/web/app/dashboard/schedule/page.tsx` (modify — prefetch uses `listAllBookings`; thin page, covered by the wrappers' unit tests)
- `apps/web/features/booking/hooks/useBookings.ts` (modify — add `fetchAllBookingsViaProxy`; `useActionNeededBookings`/`useUpcomingBookings`/`useTodayBookings` use it) + `useBookings.spec.tsx` (modify)

**Acceptance criteria — product:**
- [ ] A week (or any displayed range) containing more than 100 bookings shows every one of them in the Day view, the Week view and the columns board — nothing on the range's last days is silently missing.
- [ ] A Bookings Queue window (action-needed, today, or upcoming section) containing more bookings than the BFF's default page cap shows every one of them — nothing is silently missing regardless of how `welcomeStaffScreenDays` is configured.

**Acceptance criteria — technical:**
- Unit:
  - [ ] `list-all-pages.spec.ts`: a single page (`total <= limit`) issues exactly one request
  - [ ] `list-all-pages.spec.ts`: a multi-page range (e.g. `total` 230, `limit` 100) issues three requests and returns all 230 items in order
  - [ ] `list-all-pages.spec.ts`: a booking repeated across two pages (rows shifted mid-loop) appears once
  - [ ] `list-all-pages.spec.ts`: an empty page stops the loop even when `total` says more remain
  - [ ] `booking.spec.ts` / `booking.server.spec.ts`: `listAllBookings` sends `page` (not `offset`) with the caller's other filters unchanged on every request
  - [ ] `useSchedule.spec.tsx`: `useWeekBookings` resolves through `listAllBookings`, and its query key and `initialData` contract are unchanged
  - [ ] `useBookings.spec.tsx`: `fetchAllBookingsViaProxy` sends `page` and `limit: '100'` on every request, with the caller's other params unchanged
  - [ ] `useBookings.spec.tsx`: `useActionNeededBookings`, `useUpcomingBookings`, and `useTodayBookings` each resolve through `fetchAllBookingsViaProxy` and merge more than one page's worth of items when the mocked response spans multiple pages
- Integration: n/a — no `.integration.spec.ts` tier for `apps/web`
- Tenant isolation: n/a — client-side; server-side isolation is unchanged
- E2E: none — covered by unit tests; reproducing 100+ bookings in one week end-to-end is not practical
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean
