# M22 — Multi-Vertical Scheduling: Service Extensions & Availability Engine — Implementation Details (Developer)

This document explains every concept, decision, and bug worth understanding from M22 — how a `Service` learned to require specific resources instead of implicitly locking "the whole tenant," why a single shared exclusion constraint had to replace the old per-booking one, how a UI design got redrawn *before* implementation once someone actually compared it against the live screen, and the real review-round bugs that are worth internalizing, not just fixing.

---

## 1. Overview

M21 gave the platform a generic `Resource` (staff member, room, equipment, or the implicit "whole tenant" `LOCATION` fallback) but left it deliberately inert — nothing in `Service` or `Booking` referenced it yet. M22 is where that inertness ends: a `Service` can now declare it needs a specific resource, a bundle of several, or a different resource per stage of a multi-leg treatment, and the platform's core availability/exclusivity machinery has to answer a materially harder question than before — not "is the tenant free," but "is every resource this specific booking needs simultaneously free for its own sub-window."

Six stories, three natural groups:
- **S01/S02** — teach `Service` the vocabulary: `resourceRequirements`, `legs`, `bookingModel`, a versioned booking-intake schema, a full booking-policy field set (approval mode, duration/pricing policy, recurrence/alert eligibility).
- **S03** — replace the old tenant-wide exclusion constraint with a resource-scoped one, because the old one's entire premise (one row per booking is enough to protect) stopped being true the moment a booking could span several resources.
- **S04/S05** — the manager-facing UI to configure S01/S02's new fields (a tabbed service editor), and a new read endpoint (the "day grid") that exposes per-resource occupancy for a given day.
- **S06** — the manager-facing UI that consumes S05's day grid: a bounded, checkbox-driven columns board, arrived at only after a live redesign conversation caught that the original prototype no longer matched reality.

The throughline worth taking away from all six: **complex features that touch existing invariants get *more* review scrutiny than new ones, not less** — S01 and S02 each needed 4 review rounds to close real concurrency bugs; S03's migration had to prove, mechanically, that it wasn't lying about data safety; S06's own design was redrawn twice before a line of implementation code existed, because someone actually looked at the running app instead of trusting a 2-month-old mockup.

---

## 2. Teaching `Service` a New Vocabulary (S01/S02)

### Four shapes, one field pair

A `Service`'s `resourceRequirements`/`legs` fields determine which of four shapes applies to a booking against it — this is the single most important mental model for the rest of the milestone, and it's spelled out precisely in `docs/27-BUSINESS_LOGIC_REFERENCE.md` § Booking — Resource-Scoped Scheduling & Availability, not restated here in full. The short version:

```
Degenerate        — resourceRequirements: [] (the default) → falls back to the
                     tenant's single LOCATION resource, byte-identical to pre-M21
Flat, single       — one requirement, no legs → resolved resource(s) block the
                     whole line's duration
Flat, bundle       — 2+ requirements, no legs → EVERY requirement needs its own
                     free candidate SIMULTANEOUSLY (intersection, not union)
Legged             — legs: [{ legIndex, durationMinutes, resourceRequirements,
                     transitionGapAfterMinutes }] → each leg has its own duration
                     and resource requirement, sequenced independently
```

Every service that existed before M22 shipped got backfilled into the **degenerate** shape — one `{ type: LOCATION, resourcePoolIds: null }` requirement, `requiredQuantity: 1` — specifically so the new availability algorithm never has to special-case "a service with no resource config" as a separate branch. This is worth internalizing as a general migration pattern: when you're about to add optional structure to an existing entity, ask whether backfilling every existing row into the *simplest instance* of the new structure is cheaper than teaching every downstream algorithm to handle "structure absent" as a distinct case. Here it was — `bufferAfterMinutes` got the same treatment, backfilled from `tenant.settings.booking.serviceBufferMinutes` (falling back to 60) so S03's `max(bufferAfterMinutes, turnoverMinutes)` formula never has to special-case a pre-M22 service either.

### `ServiceBookingIntakeSchema` — the first "publish, never edit" aggregate in this codebase

Every other extension to `Service` in this milestone — `resourceRequirements`, `legs`, `classResourceSlots`, the booking-policy fields — is a child collection or scalar field *owned* by `Service` itself: `Service`'s own `save()` wholesale-replaces the child rows, the same "dirty flag on the aggregate" pattern M21-S01 already established for `resourceRequirements`/`legs` (see M21's own wrap-up doc § "A wholesale-replaced child collection").

`ServiceBookingIntakeSchema` deliberately isn't shaped that way. Publishing a new version of a service's booking-intake form (the questions a customer answers when booking) never edits or deletes the previous version — it's append-only, versioned, with its own identity. `Service`'s own domain props hold **no reference to it at all**. It gets its own repository (`IServiceIntakeSchemaRepository`), its own `publish()`/`reconstitute()` factory pair, no `update()` method at all. This is a genuinely new pattern for the codebase, not a variant of the dirty-flag shape — worth recognizing the distinction when you next need to model "this concept accumulates history, it doesn't just get overwritten."

### A Critical bug that survived two rounds of its own decline

This is the single most instructive bug in the whole milestone, precisely because the *first* decline of it sounded completely reasonable.

Round 1 of S02's PR review flagged: `Service.defaultApprovalMode` isn't consuming the tenant's existing `settings.booking.autoApproveEnabled` setting — a service configured to "inherit tenant default" would silently never auto-approve, no matter what the tenant-level toggle said. The first response declined this, reasoning that effective-value resolution (turning "inherit" into an actual approve/require-review decision) belongs to M23's booking-request flow, which doesn't exist yet in this milestone — a scope boundary that sounds exactly like the kind of thing story-discovery legitimately excludes all the time.

Round 2 re-flagged it. Declined again, same reasoning, slightly more confidently stated.

Round 3 re-flagged it a third time, at the same severity — and this time, instead of writing a third paraphrase of "this was scoped out," the actual plan file got grepped for its own "Resolved during story-discovery" text. It said, verbatim, the opposite of what two rounds of replies had been asserting: *"`autoApproveEnabled` is activated as a real, consumed setting by this story."* The scope boundary the declines had been defending had never actually existed — it was a plausible-sounding inference that got repeated with increasing confidence each time it went unchallenged, not a fact anyone had actually checked against the document that was supposedly the source of it.

The fix itself was small — a new `IBookingPlatformPort.getAutoApproveEnabled(tenantId)`, resolved live (not persisted, so a later tenant-settings change takes effect immediately) on every read path that surfaces a service's effective approval mode. The lesson generalized into a standing rule (now in `docs/ENGINEERING_RULES_SHARED.md`): **a finding re-flagged at the *same* severity across multiple rounds deserves the identical scrutiny escalating severity would get, especially when your own decline is a paraphrase of "the story already scoped this out" rather than a quoted line from the story's actual resolved-decision text.** A decline that summarizes what you remember discovery deciding is not the same evidentiary weight as one that pastes the literal sentence — and the gap between those two only shows up once someone is annoyed enough to actually check.

### The concurrency bugs, and why they needed a *second* look each time

S01's PR needed 4 rounds specifically because each fix uncovered a slightly different-shaped version of the same underlying race — a good worked example of why "add a lock" is never a complete answer on its own:

1. **Round 2**: two concurrent requests changing a service's `bookingModel` (or its booking history) could both read the old value before either committed — fixed with `findByIdForUpdate()`, a genuine row lock.
2. **Round 3**: the lock was being acquired, but its *result* was discarded — the code re-compared against a snapshot taken before the lock, not the freshly-locked read. A lock that doesn't feed its own read into what happens next hasn't protected anything.
3. **Round 4**: the activate/deactivate use case's read-then-save was happening entirely *outside* the transaction — meaning it could silently clobber a concurrent resource-requirements/legs update, because `Service`'s `save()` wholesale-replaces those child collections. Relocating the check inside the transaction (not just adding a lock call next to the old check) closed it — the same structural lesson M21-S06 already learned closing its own staff-wrap race: **a lock only protects what happens after it, not what was already decided before it.**

---

## 3. `booking.resource_occupancy`: One Shared Table Instead of Many (S03)

### Why the old constraint had to die, not just get extended

Before M22, "is this tenant free at this time" was one question with one authoritative answer: `EX_booking_bookings_approved_slot`, a Postgres GIST exclusion constraint keyed on `(tenant_id, tstzrange(scheduled_at, scheduled_end_at))`. It worked because there was exactly one thing to protect per tenant — the whole tenant, one row per booking.

The moment a booking can lock a *bundle* of resources, or a different resource per *leg*, that premise collapses: there is no longer one row per booking to key an exclusion constraint on. The natural instinct — "keep the old constraint for the tenant-wide case, add a new one for the resource-scoped case" — turns out to be structurally impossible for a subtler reason than "more code to maintain": **a Postgres exclusion constraint cannot span two tables.** If appointment-family resource locks and (once M24 ships) class-session resource locks lived in separate tables, cross-family exclusivity — the same staff member double-booked as both a hairdresser slot and a Pilates-class slot — could never be enforced at the database level, no matter how well either table were individually built. The fix has to be one shared table that every family that can ever contend for a resource writes into: `booking.resource_occupancy`, one row per resource-assignment, one GIST exclusion constraint, `(tenant_id WITH =, resource_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)`.

This is worth carrying forward as a general principle, not just this table's justification: **splitting a shared invariant "per family, for cleanliness" reintroduces exactly the race the invariant existed to prevent, the instant two families can compete for the same underlying thing.**

### `lock_state`'s three values, and why `REQUESTED` sits outside the exclusion

```sql
lock_state VARCHAR(20)  -- REQUESTED | HOLD | COMMITTED
EXCLUDE USING gist (...) WHERE (lock_state IN ('HOLD','COMMITTED'))
```

`REQUESTED` belongs to a PENDING booking on a degenerate (LOCATION-fallback) service — the pre-M22 car-wash behavior where multiple customers can request the same popular time slot and a manager picks one to approve. Making `REQUESTED` participate in the exclusion constraint would have been a real regression: it would reject the second concurrent PENDING request outright, instead of letting the manager choose between them the way the platform always has. So `REQUESTED` rows exist in the table — for a completely different reason, S05's day-grid needs to know "this resource has *something* pending here" — but structurally sit outside the WHERE clause that actually enforces no-overlap. `HOLD` (a pending manual-approval booking that already committed to a specific resource) and `COMMITTED` (the resource is genuinely locked) are the two states the exclusion constraint actually protects.

### The migration that had to prove it wasn't lying

Introducing a new authoritative constraint on top of an existing production table is exactly the kind of change where "it worked in my local test" isn't good enough — the migration itself needs to mechanically verify the invariant it's about to start enforcing actually holds for every row that already exists. S03's migration splits into three phases:

1. **Expand** (`1748500000012`) — creates both new tables and the GIST constraint, live immediately. Safe because nothing has written into the new table yet, so nothing can violate it.
2. **Backfill** (`1748500000013`) — one idempotent, `NOT EXISTS`-guarded INSERT per pre-existing APPROVED booking. The interesting part: a multi-line booking's lines get *sequential, non-overlapping* sub-windows, reconstructed via `ORDER BY line_id` window functions, with the buffer only appended after the last line — mirroring exactly how the real write path sequences resource assignments. Get this wrong (e.g. give every line of a multi-line booking the same outer window) and the backfill's own INSERT would violate the exclusion constraint it just created, on data that's supposedly already valid.
3. **Contract** (`1748500000014`) — drops the old tenant-wide constraint, but not on faith: a `DO $$` block *raises an error* if any APPROVED booking line still lacks a COMMITTED `resource_occupancy` row, rather than trusting "the backfill should have caught everything." This is the general shape worth remembering for any expand/backfill/contract migration: **the contract phase should mechanically verify the invariant that makes dropping the old guarantee safe, not just assume the earlier phases succeeded.**

### The race is closed twice — once by the lock, once by the database, and the lock is the weaker of the two

`BookingSlotConflictService` acquires `ITenantLockPort.lockResources()` — one advisory lock per resource ID, always in sorted-ascending order (the same batched-lock-ordering discipline M22-S01 and M21 both already established, to avoid two callers deadlocking on the same set of resources acquired in different orders) — before checking candidate availability. This narrows the race window, but it is explicitly **not** the source of truth: the GIST exclusion constraint is. If two requests somehow both pass the lock-protected check (a bug, a lock-port failure, a direct write bypassing the service), the database itself rejects the second INSERT with a constraint violation, which `typeorm-resource-occupancy.persistence-errors.ts` translates into the same `BookingSlotUnavailableError` (409) the pre-check would have raised. The lock is an optimization that avoids doing wasted work and gives a cleaner error path; the constraint is what actually makes the invariant true under all circumstances, including ones the lock doesn't cover.

---

## 4. The Serviços Editor and the Day Grid: Straightforward UI on Top of Real Foundations (S04/S05)

### A tabbed editor, and a caps-driven refactor habit worth adopting early

S04 builds the manager-facing screen for everything S01/S02 taught `Service`: four tabs (Detalhes/Recursos/Políticas/Formulário) on one page, following the tabbed-single-page-editor pattern this codebase established for the Hotsite editor and reused here verbatim — one `role="tablist"` bar, `activeTab` as a single piece of lifted state, each panel kept mounted-but-`hidden` (not unmounted) on tab switch so an unsaved draft in one tab survives a manager clicking over to another.

Nothing about the shape is novel. What's worth calling out is a process observation rather than a design one: this story's own line-count caps (`max-lines-per-function` ≤ 40 for `.ts`, file `max-lines` ≤ 250) forced four separate mid-implementation component extractions, each one costing a re-lint-and-re-test cycle that could have been avoided by extracting proactively. `docs/CODE_STANDARDS.md` now states the lesson directly: once a panel/page component nears ~150 lines, extract sub-components into their own files (each with its own `.spec.tsx`) *before* adding more content, not after the linter objects. A cap you're about to hit is cheaper to route around in advance than to satisfy retroactively.

### The day grid: read-only, resource-scoped, and deliberately not the same method as the availability engine's own occupancy query

S05 adds one new read path: `GET /schedule/day-grid?date=`, answering "for each active resource, what's it doing on this specific day." It's tempting to think this should reuse `findOccupancyByTenantAndResource` — the method S03's availability engine already has for "is this resource free" — with an extra flag for "also include REQUESTED." The implementation deliberately keeps them as two separate port methods instead. The reason is that they answer genuinely different questions for genuinely different callers: the availability engine needs to know if a resource is *actually* locked (HOLD/COMMITTED only — a REQUESTED slot isn't a real conflict yet), while the day grid needs to show a manager *everything happening*, including a booking still awaiting approval, and additionally needs to resolve the underlying `bookingId` (via a two-hop join: `resource_occupancy` → `booking_line_resource_assignments` → `booking_lines`) so the frontend can link a block back to a real booking record. Bolting REQUESTED-inclusion and refId-resolution onto the availability engine's own method as an optional flag would have made a method serving two genuinely different concerns pretend to be one — separate methods, even at the cost of a few duplicated lines, kept each one honest about what it actually returns to whom.

---

## 5. Horários's Columns Board: A Design Caught Before It Was Built (S06)

### The prototype was two months stale before a line of code existed

S06's own prototype (`08-visao-geral-manager.html`) had been mocked in late July — an unbounded grid rendering *every* active resource as its own column, one screen, side by side. By the time implementation was about to start in late September, the live `/dashboard/schedule` screen looked nothing like that mockup anymore: a day-scoped strip at the top, a floating multi-select resource filter in the bottom-right corner (M21-S05's `ResourceFilterMenu`), none of which existed when the original mockup was drawn.

The redesign conversation that followed is worth reading as a model for how a stale prototype should actually get handled: instead of building against the two-month-old mockup and discovering the mismatch during PR review, the mismatch was caught and resolved *before* any implementation code existed, by directly comparing the mockup against the running app. Two structural problems with the original "every resource" grid surfaced immediately once someone did that comparison:

1. **It doesn't scale.** A 60-resource tenant (a chain with many instructors, rooms, and equipment) can't render 60 columns on one screen, no matter how UC-057's own type-tab narrowing subdivides them — even a narrowed sub-group is often still too large to show side by side. No layout can show "every resource at a glance" past a small handful.
2. **The multi-select filter already exists and already does the curation.** M21-S05 had already shipped exactly the UI primitive this problem needs — a manager checking a small, deliberate subset of resources — for an unrelated feature (merged-timeline filtering). Building a *second*, unbounded resource-picking mechanism for the columns board would have duplicated a decision the manager already makes elsewhere on the same screen.

The resolved design: reuse the existing `ResourceFilterMenu` as-is, and render one column per **checked** resource, nothing more. This is a genuine instance of the "generate more than one candidate approach, prefer the one needing the least new machinery" principle — the unbounded grid would have needed pagination, or a hard resource-count cap, or virtualization, or some combination, to ever ship safely; the bounded design needs none of that, because the manager's own checkbox selection is the bound.

### Reusing the day grid as a lookup, not a second rendering pipeline

`GET /schedule/day-grid` (S05) already returns, per resource, the list of occupancy blocks with their `refId` resolved to a `bookingId`. The columns board doesn't re-render from that data directly — it uses the day grid purely to answer "which booking IDs occupy this resource today," then feeds those booking IDs into the *existing* `buildTimelineDayData`/`assignLanes` pipeline the single merged timeline already used, one call per checked column. This is a deliberate minimalism: the board is a thin layout wrapper (`ScheduleResourceColumnsBoard.tsx`) around N unmodified `ScheduleTimelineBoard` instances, not a new rendering engine that happens to look similar. Less code, and — more importantly — every existing bug fix and visual convention in the single-timeline renderer (lane-splitting, closure styling, the "Ocupado" placeholder fallback) is inherited automatically instead of needing to be re-implemented and re-tested for a second code path.

### The placeholder-fallback bug: two different reasons a booking can be "missing" from a column, and only one of them means "show a fake block"

The subtlest real bug caught during review, worth understanding in detail because the fix pattern generalizes: when the columns board resolves a day-grid block's `refId` against the frontend's own booking list, that resolution can fail for **two structurally different reasons**, and the first implementation treated them as the same thing.

- **Reason A — the booking exists in the day-grid response, but the manager's own status filter has hidden it** (say, the default filter hides PENDING bookings, and this is a PENDING one). The day-grid endpoint deliberately includes `REQUESTED` lock-state rows — which correspond to PENDING bookings on a degenerate service — regardless of what the frontend's status filter currently shows. Here, the correct behavior is to render *nothing* for that block: the booking is real, it's just filtered out by the manager's own choice.
- **Reason B — no booking anywhere matches this `refId` at all** — a genuine data gap (an edge case, or a `CLASS_SESSION`-sourced block, inert until M24). Here, the correct behavior is the "Ocupado" placeholder — the resource really is occupied, the frontend just doesn't have the detail to show.

The original implementation resolved every unmatched `refId` against the frontend's *already status-filtered* `visibleBookings` list — meaning a Reason A case (filtered out) was indistinguishable from a Reason B case (genuinely missing), and both rendered the fake "Ocupado" placeholder. A manager who'd deliberately hidden PENDING bookings from their view would still see a mysterious "Ocupado" block for one, defeating the point of the filter. The fix: resolve against the **full, unfiltered** booking list, plus a separate `selectedStatusSet` parameter — a match found but excluded by the status set renders nothing (Reason A); no match found anywhere renders the placeholder (Reason B). The general lesson: **when a "no match found" code path can be reached by two semantically different causes — filtered out vs. genuinely absent — resolve against the unfiltered source of truth and check the filter condition separately, rather than letting an already-filtered collection collapse the two cases into one.**

### The two follow-ups that got tracked forward instead of dropped or silently fixed

Not every finding from a review round belongs in the same PR. Two genuine, real findings from S06's review were deliberately *not* force-fixed into PR #511, and deliberately not dropped either — they became **TD43** and **TD44**, the model this codebase uses for "real, but out of this PR's own scope":

- **TD43**: the columns board derives each rendered block's position from the *matched booking's own* `scheduledAt`/`totalDurationMins`, discarding the day-grid interval's own `startsAt`/`endsAt` (which include buffer/turnover time). Mostly harmless — it's the same simplification the pre-existing single timeline already made — except a booking whose buffer pushes its occupancy window past midnight can silently vanish from a column entirely, because the event-building pipeline filters by the booking's own date, not the day-grid interval that proved the resource was occupied that day. Real, narrow, edge-case-only (needs a service with a buffer large enough to cross a day boundary) — correctly deferred rather than restructuring the whole rendering pipeline under review pressure.
- **TD44**: originally just "no cap on simultaneously-checked resource columns" (Story 0). Story 1 grew out of a separate, live conversation the user raised mid-review: Week view's booking badges don't respect the resource filter the way Day view's new columns do — checking a resource narrows Day view but leaves Week view showing every booking, unfiltered, merged. The first drafted fix for this was badge-only (label which resource a booking belongs to, without actually filtering) — and on the user's own follow-up question ("is that fully covered?"), it became clear a label-only fix would *not* achieve real parity with Day view's actual filtering behavior. The story was rewritten to do real per-day filtering (reusing S06's own day-grid-as-lookup technique, applied across each of Week view's 7 visible days) plus plural `resourceNames` badges for a booking bundled across multiple checked resources. Worth noting as a small case study in resisting the urge to claim "yes, covered" the first time a coverage question is asked — the honest answer required going back and re-deriving what "parity" actually meant, not just asserting it.

---

## 6. What This Milestone Deliberately Didn't Build

`Service.resourceRequirements`/`legs` and `classResourceSlots` are exercised end-to-end for **appointment** bookings only — `CLASS_SESSION`-sourced occupancy rows are structurally supported in `resource_occupancy`'s schema (the `source_type` column, the mutual-exclusion CHECK) but nothing writes them until M24 ships `ClassSession`. Cross-family exclusivity (the same resource locked by both an appointment and a class session) is therefore provable at the schema level today but not testable end-to-end until M24 exists alongside this milestone's own machinery — the same caveat M23's own plan file states explicitly for its own scope. `RequestBookingUseCase`/`RequestAuthenticatedBookingUseCase` (the flat-appointment booking path) explicitly reject any `SESSION`-model service with `BookingServiceSessionNotBookableError` (409), added specifically to stop a `SESSION` service from silently creating a bogus one-off appointment through the wrong endpoint — M24's own `POST /class-session-bookings` is the correct, separate path, and that guard must not be relaxed to "learn" to handle both.
