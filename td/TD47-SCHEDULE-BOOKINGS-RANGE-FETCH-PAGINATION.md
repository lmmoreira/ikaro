# TD47 — Schedule Bookings Range Fetch Silently Truncates Past 100 Rows

## Status
- **Type**: Technical Debt / Correctness & Scalability
- **Priority**: Low — no observed incident; only a tenant with more than 100 bookings inside one displayed week hits it, and the loss is confined to the last days of that range
- **Context**: `apps/web/features/booking/api/`, `apps/web/features/booking/schedule/useSchedule.ts`, `apps/web/app/dashboard/schedule/page.tsx`
- **Created**: 2026-09-28
- **Discovered**: CodeRabbit round 1 on PR #528 (TD46), Major finding on `page.tsx:43`, verified against the code the same day
- **State**: Open — not yet started; `/story-discovery` not yet run
- **Related**: TD46 (`docs/archive/td/TD46-COLUMNS-BOARD-WEEK-BOUNDARY-BOOKING-FETCH-GAP.md`, PR #528) — widened this same fetch by one day and explicitly accepted the cap as out of its scope; TD48 (`td/TD48-BOOKING-LIST-DATE-RANGE-TENANT-TIMEZONE.md`) — independent defect on the same fetch (UTC-day range instead of tenant timezone)

---

## Problem

The schedule's week bookings fetch requests exactly one page and never asks for another:

- **Server prefetch** — `apps/web/app/dashboard/schedule/page.tsx` calls `listBookings(token, { status, from, to, limit: 100 })` once.
- **Client query** — `useWeekBookings` (`apps/web/features/booking/schedule/useSchedule.ts:145-153`) calls `listBookings({ status, from, to, limit: 100 })` once.
- **The BFF caps `limit` at 100** (`bookings.schemas.ts:143`, `z.coerce.number().int().min(1).max(100)`), so a single request can never return more.
- **The backend orders `scheduledAt ASC` and truncates** (`typeorm-booking.repository.ts`, `findAndCount({ order: { scheduledAt: 'ASC' }, take, skip })`), so when a range holds more than 100 bookings, the rows that are dropped are the **last** days of the range (e.g. Sunday), silently — the response still carries the true `total`, but nothing compares it to `items.length`.

Effect: bookings on the final days of an over-cap week vanish from the Day view, the Week view and the columns board's `bookingById` (where a day-grid block for such a booking then falls to the generic placeholder instead of naming the contact).

This limitation pre-dates TD46. TD46 (PR #528) made the exposure marginally larger by starting the fetch one day early: that extra day sorts first, so on a week already at the cap it pushes up to one day's bookings past it. TD46 recorded that as an accepted, out-of-scope trade-off; this TD is where it gets closed properly.

### Premise verified against the code (2026-09-28)
- The web-facing list response is `{ items, total, page, limit }` (`packages/types/src/booking.dto.ts:93-98`) — it has **no** `hasMore`. The backend computes `pagination.hasMore`, but the BFF mapper (`bookings.mapper.ts:57-77`) reshapes it to `total/page/limit`. A "fetch until done" loop therefore has to test `page * limit >= total`, not a `hasMore` flag.
- The BFF's real paging parameter is **`page`** (1-based; `bookings-list-query.util.ts:14` derives `offset = (page - 1) * limit`). The web `BookingListFilters` (in both `booking.ts` and `booking.server.ts`) declares **`offset`** instead, which the BFF list schema does not define and would strip; nothing in the web app sends it today. So the web layer currently has no way to request a second page at all.

### Related — tracked separately
The same fetch's date range is also built in UTC instead of the tenant's timezone, which drops late-evening bookings from their own week. That is a different defect from the row cap and is tracked, with a proven reproduction, in `td/TD48-BOOKING-LIST-DATE-RANGE-TENANT-TIMEZONE.md`. Fixing pagination here does not change it.

---

## Chosen approach (decided in this session, 2026-09-28 — `/story-discovery` has not run)

Keep it to one pure paging loop plus two thin transport wrappers, no new abstraction beyond that. Rejected: raising the cap (the BFF `max(100)` is a deliberate ceiling), and infinite-query/`useInfiniteQuery` (the schedule needs the whole range at once, not incremental scrolling).

---

### Story 0 — Fetch every page of the schedule's bookings range

**Agent:** frontend-ts
**Complexity:** M
**Docs to load:** `docs/ENGINEERING_RULES_FRONTEND.md`, `docs/08-TESTING_STRATEGY.md`, `docs/24-BFF_ARCHITECTURE.md` § Web → BFF Transport Layer
**Dependencies:** TD46 Story 0 (PR #528) — must be merged first; it changes the same two call sites (`page.tsx` and the `from` passed to `useWeekBookings`)
**Pattern:** plain composition — one pure paging loop that takes a "fetch page N" callback, plus a server wrapper and a client wrapper that supply their own transport; no named pattern applies

**Discovered:** 2026-09-28, CodeRabbit round 1 on PR #528 (Major)
**Root cause:** traced live — single-page `limit: 100` at `page.tsx` and `useSchedule.ts:145-153`; BFF cap `bookings.schemas.ts:143`; backend `ASC` + `take/skip` truncation in `typeorm-booking.repository.ts`; response shape without `hasMore` at `booking.dto.ts:93-98`; web filters exposing dead `offset` instead of `page`.

**Description:**
Make both schedule fetches retrieve the whole requested range instead of the first 100 rows.

1. Add `page?: number` to `BookingListFilters` in both `apps/web/features/booking/api/booking.ts` and `booking.server.ts`, and remove the dead `offset` field (nothing sends it and the BFF ignores it). Update `booking.server.ts`'s query-string builder only if needed to send `page`.
2. Add one pure helper, `listAllPages` (`apps/web/features/booking/api/list-all-pages.ts`): it takes `fetchPage(page: number) => Promise<StaffBookingListResponse>`, requests page 1, then keeps requesting the next page while `page * limit < total`, and returns a single `StaffBookingListResponse` with every `items` entry merged in order. It must (a) de-duplicate by `bookingId`, because offset paging over a live table can repeat or skip a row if a booking is created between two requests, and (b) stop on an empty page even if `total` says more remain, so a stale `total` can never loop forever. Sequential requests — a range almost always needs one or two pages, so parallelising is not worth the extra code.
3. Add a thin `listAllBookings` wrapper in each of `booking.ts` (client, via `bffClient`) and `booking.server.ts` (server, via `bffServerFetch`) that calls `listAllPages` with that transport's own `listBookings` and `limit: 100`.
4. Use `listAllBookings` in `useWeekBookings` (`useSchedule.ts`) and in `page.tsx`'s prefetch, so both paths cover the same range. The merged result keeps the existing `StaffBookingListResponse` shape, so `initialData` and every downstream consumer are unchanged.

Other `listBookings` callers (the bookings queue, `BookingPhotoPicker`) are deliberately untouched — they are not range fetches and do not need every page.

**New migration / i18n keys / env vars / feature flags:** none

**Files to create/modify:**
- `apps/web/features/booking/api/list-all-pages.ts` (create) + `list-all-pages.spec.ts` (create)
- `apps/web/features/booking/api/booking.ts` (modify — `page` filter, drop `offset`, add `listAllBookings`) + `booking.spec.ts` (modify)
- `apps/web/features/booking/api/booking.server.ts` (modify — same) + `booking.server.spec.ts` (modify)
- `apps/web/features/booking/schedule/useSchedule.ts` (modify — `useWeekBookings` uses `listAllBookings`) + `useSchedule.spec.tsx` (modify)
- `apps/web/app/dashboard/schedule/page.tsx` (modify — prefetch uses `listAllBookings`; thin page, covered by the wrappers' unit tests)

**Acceptance criteria — product:**
- [ ] A week (or any displayed range) containing more than 100 bookings shows every one of them in the Day view, the Week view and the columns board — nothing on the range's last days is silently missing.

**Acceptance criteria — technical:**
- Unit:
  - [ ] `list-all-pages.spec.ts`: a single page (`total <= limit`) issues exactly one request
  - [ ] `list-all-pages.spec.ts`: a multi-page range (e.g. `total` 230, `limit` 100) issues three requests and returns all 230 items in order
  - [ ] `list-all-pages.spec.ts`: a booking repeated across two pages (rows shifted mid-loop) appears once
  - [ ] `list-all-pages.spec.ts`: an empty page stops the loop even when `total` says more remain
  - [ ] `booking.spec.ts` / `booking.server.spec.ts`: `listAllBookings` sends `page` (not `offset`) with the caller's other filters unchanged on every request
  - [ ] `useSchedule.spec.tsx`: `useWeekBookings` resolves through `listAllBookings`, and its query key and `initialData` contract are unchanged
- Integration: n/a — no `.integration.spec.ts` tier for `apps/web`
- Tenant isolation: n/a — client-side; server-side isolation is unchanged
- E2E: none — covered by unit tests; reproducing 100+ bookings in one week end-to-end is not practical
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean
