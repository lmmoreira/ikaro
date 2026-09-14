# M21 — Multi-Vertical Scheduling: Foundation — Implementation Details (Developer)

This document explains every concept, decision, and pattern introduced in M21 — why the platform needed a generic `Resource` aggregate at all, how a check-then-act race got closed with an advisory lock (twice, in two different milestones, for two different invariants), how a single "what does the calendar show" control had to split into two once real testing exposed what it couldn't do, and the real bugs found along the way that are worth understanding, not just fixing.

---

## 1. Overview

Until M21, this codebase modeled every booking as belonging to "the tenant" — one calendar, one set of business hours, one set of closures/openings, per tenant. That's a fine model for a single-chair barbershop, but it can't represent a car wash with three bays, a salon with five stylists each keeping their own hours, or a gym with a room booked separately from its equipment. M21 introduces the concept that every later Multi-Vertical Scheduling milestone (M22 Service Extensions, M23 Appointment Booking, M24 Classes & Sessions) depends on: a generic bookable unit called `Resource`.

Six stories, four waves:
- **S01** — the `Resource` aggregate itself: CRUD, the `StaffDeactivated` cascade consumer.
- **S02** — every tenant (existing and future) always has exactly one `LOCATION` resource, the "whole tenant" stand-in.
- **S03** — `ScheduleClosure`/`ScheduleOpening` learn to be scoped to a resource instead of only the whole tenant.
- **S04** — the manager-facing "Recursos" dashboard screen (CRUD UI).
- **S05** — the existing "Horários" calendar screen learns to filter/scope by resource.
- **S06** — closes a race condition the team explicitly accepted as a known risk back in S01, once the exact lock primitive needed to close it had been proven elsewhere in the same milestone.

The interesting engineering problems aren't the CRUD — they're: (1) how do you introduce a nullable foreign key to an aggregate that used to always be "the whole tenant" without silently breaking the uniqueness constraint that assumed exactly one row per tenant per date; (2) how do you build a UI control for "which resource(s) does this view show" that survives contact with a manager who wants to see *several* resources at once, not just one; and (3) how do you close a race between two independent write paths (a resource being created/updated/reactivated, and a staff member being deactivated) using a primitive your own codebase had already built and proven for a *different* race, one milestone earlier in the same PR sequence.

---

## 2. The `Resource` Aggregate: One Shape, Four Meanings

`Resource` (`apps/backend/src/contexts/booking/domain/resource.aggregate.ts`) has exactly one shape for four different kinds of bookable thing:

```ts
interface Resource {
  resourceId: string;
  tenantId: string;
  type: 'LOCATION' | 'STAFF' | 'ROOM' | 'EQUIPMENT';
  refId: string | null;        // staffId, only when type === 'STAFF'
  name: string;
  workingHours: BusinessHours | null;  // null = inherits tenant hours
  turnoverMinutes: number;     // default 0
  maxCapacity: number | null;  // physical ceiling for LOCATION/ROOM/some EQUIPMENT; never set for STAFF
  isActive: boolean;
}
```

`LOCATION` is special in a way the other three types aren't: it's the stand-in for "the whole tenant," the thing every tenant used to implicitly be before M21. It can never be created or type-changed through the normal `POST /resources` use case — `Resource.create()` accepts `type: 'LOCATION'` at the domain layer (it has to, because two *other*, legitimate application-layer callers construct one that way — see §3), but `CreateResourceUseCase` itself rejects it with a `422`. Every tenant gets exactly one, always active, enforced by a partial unique index (`UNIQUE (tenant_id) WHERE type='LOCATION' AND is_active`) rather than application logic alone — the strongest primitive available for "exactly one" is a database constraint, not a check-then-act.

The invariant enforced in `Resource.create()` itself — not just at the DB layer — is `(type === 'STAFF') === (refId !== null)`: a staff wrapper must reference a staff member, and nothing else may. This is checked twice, in two different senses: once as a structural shape check in the aggregate, and once as a *business* check (does the referenced staff member actually exist, belong to this tenant, and is active?) via a narrow cross-context adapter, `BookingStaffAdapter`. The Booking context validates Staff's data; Staff never knows Booking exists — this asymmetry is deliberate and matches every other cross-context relationship in the codebase (see `docs/ENGINEERING_RULES.md` § Cross-context data access).

### Working hours default to "inherit the tenant's"

`workingHours: null` means a resource works whenever the tenant is open — the same semantic `resourceId: null` uses for closures/openings (§4). When set, a resource's own hours must be a *subset* of the tenant's business hours — you can't wrap a staff member who's supposedly available Sunday when the whole business is closed that day. This is enforced in `Resource.create()`/`Resource.update()`, not the DB, because "is this JSONB window a subset of that JSONB window" isn't expressible as a Postgres CHECK constraint without a much heavier trigger.

---

## 3. Every Tenant Always Has a `LOCATION` — Backfill Plus a Live Handler (S02)

S01 created the `resources` table and the aggregate; it deliberately didn't populate anything. S02's whole job is closing the gap between "every tenant *should* have one `LOCATION` resource" and "every tenant *actually does*" — for tenants that already existed when M21 shipped, and for every tenant provisioned afterward.

### Two mechanisms, not one

The naive approach — "just write a migration" — only solves half the problem. A migration runs once, at deploy time; it can backfill every tenant that exists *right then*, but it does nothing for a tenant provisioned an hour later. The story's discovery process caught this explicitly and added a second mechanism:

1. **A one-time backfill migration** (`1748500000008-BackfillLocationResources.ts`) inserts one active `LOCATION` resource per tenant that already exists. It's idempotent — safe to re-run — because it skips any tenant that already has an active `LOCATION` row, letting it be re-applied without tripping the partial unique index.
2. **A `TenantProvisionedBookingHandler`**, subscribing to the existing `TenantProvisioned` event, does the identical thing for every tenant provisioned *after* this story ships — mirroring Staff context's own `TenantProvisionedHandler`/`CreateInitialManagerUseCase` almost line for line (same business-key-then-inbox-eventId double idempotency check, same transaction shape).

```ts
// tenant-provisioned.handler.ts — Booking's own subscription, alongside Staff's independent one
export class TenantProvisionedBookingHandler {
  static readonly CONSUMER_NAME = 'booking';   // NOT 'TenantProvisionedHandler' — see the name-collision note below

  async onModuleInit() {
    this.eventBus.subscribe('TenantProvisioned', this.handle.bind(this));
  }

  async handle(event: TenantProvisionedEvent) {
    await this.useCase.execute({ tenantId: event.tenantId, eventId: event.eventId, correlationId: event.correlationId });
  }
}
```

Both Staff and Booking subscribe to the *same* `TenantProvisioned` topic independently — this is the normal Pub/Sub fan-out shape this codebase already uses everywhere, not a new pattern.

### A class-name collision nobody expected

The natural name for the new handler was `TenantProvisionedHandler` — matching Staff's class name exactly, since it's the same shape doing the same job in a different context. That broke CI. `packages/infra-scripts/src/pubsub-catalog.ts`, the script that auto-generates the Pub/Sub topic/subscription catalog from source, collects every `static readonly` class property it finds and keys it by `"${className}.${propName}"` — with no file or module qualifier, because it's a lightweight text-based collector, not a real `ts.Program` with type information. Two classes both named `TenantProvisionedHandler`, each with a different `CONSUMER_NAME` string constant, produced a literal key collision: `pubsub-catalog: conflicting values for "TenantProvisionedHandler.CONSUMER_NAME"`.

The fix already existed as a precedent — Notification context had hit the identical problem earlier and solved it by qualifying the class name itself: `TenantProvisionedNotificationHandler`. Booking's handler follows the same convention: `TenantProvisionedBookingHandler`. The lesson: when a generator collects symbols by name across the whole codebase with no namespacing, two contexts building "the same shaped thing" independently need to bake their own qualifier into the class name from the start, not just the file path.

### `Resource.create()` accepting `type: 'LOCATION'` isn't a backdoor

`CreateResourceUseCase` (the public `POST /resources` endpoint) rejects `type: 'LOCATION'` outright. But `Resource.create()` itself — the aggregate's own domain-layer factory — has to accept it, because two legitimate callers construct a `LOCATION` resource directly: the backfill migration's raw SQL, and `CreateTenantLocationResourceUseCase` (the handler's own use case). This isn't a workaround or a hole in the restriction; it's the normal relationship between a public API's own use case (which can add business-process restrictions like "you may never do this through me") and the aggregate's lower-level constructor (which only enforces structural/domain invariants). The migration's raw SQL sits at that same lower level, one layer further down still.

### Locale-aware default names, verified against real seed data

The default name — `"Localização Principal"` or `"Main Location"` — is chosen from `tenants.settings.localization.language`, not hardcoded to Portuguese. This wasn't a guess at future-proofing; it was verified against the actual local-dev seed data (`apps/backend/src/shared/database/seed.ts`), which genuinely seeds a mix of `pt-BR` and `en` tenants today. A single hardcoded Portuguese string would have been visibly wrong for the one seeded English tenant from day one.

---

## 4. Resource-Scoped Closures/Openings, and the Constraint That Silently Stopped Working (S03)

`ScheduleClosure` and `ScheduleOpening` gained one new field each: `resourceId: string | null`. `null` keeps today's exact meaning — "the whole tenant." A non-null value scopes the closure/opening to one specific resource. This is the same "null means everything, a value means one specific thing" sentinel `Resource.workingHours` already uses for the tenant-hours-inheritance relationship — a repeated, deliberate pattern in this milestone, not two unrelated designs that happen to look similar.

### The constraint trap: `NULL ≠ NULL`

`booking.schedule_openings` had a plain `UNIQUE(tenant_id, date)` — "only one opening override per date, per tenant." The moment `resource_id` becomes a real, populated column, that constraint's actual meaning shifts underneath it without anyone touching the constraint itself: Postgres's uniqueness semantics treat `NULL` as never equal to another `NULL`, so `UNIQUE(tenant_id, resource_id, date)` — the naive "just add the new column to the existing unique" fix — would let an *unlimited* number of tenant-wide openings (`resource_id IS NULL`) coexist for the same date, silently reintroducing the exact bug the original constraint existed to prevent.

The fix is two partial unique indexes instead of one plain one:
```sql
UNIQUE (tenant_id, date) WHERE resource_id IS NULL
UNIQUE (tenant_id, resource_id, date) WHERE resource_id IS NOT NULL
```
This is worth internalizing as a general pattern, not just this table's fix: **any time an existing `UNIQUE` constraint's key set grows to include a column that's newly nullable, check whether the old "everyone gets exactly one" guarantee still holds** — it silently doesn't, unless the constraint is split into partial indexes that treat the null case and the non-null case separately.

### The window-bound rule, corrected twice by bot review

A resource-scoped opening can never extend beyond what the tenant itself has open for that date — this reflects the real domain rule that a resource is a *subset* of the tenant, never a superset. Working out exactly what "what the tenant has open" means for a given date took two rounds of bot-review correction, both catching real drift between the story's own text and the actual UC precondition:

- **Round 1:** the original text said the bound was always `businessHours` — wrong; when the tenant is normally *closed* that day, there's no `businessHours` window to bound against at all.
- **Round 3:** the corrected text then said an explicit tenant-wide opening was needed only "whenever one happened to exist" — which let a resource-scoped opening on an otherwise-closed date go completely unbounded, since nothing forced that prerequisite opening to exist first.

The final, correct rule: if `businessHours[day]` is set, that window bounds the resource-scoped opening directly, no tenant-wide `ScheduleOpening` row required (the day is inherently open already). If `businessHours[day]` is `null`, an explicit tenant-wide opening must already exist for that date — the manager has to open the tenant level first (`BOOKING_TENANT_OPENING_REQUIRED`, `422`). This two-branch shape is the reason `resolveActiveWindow()` on the frontend (§6) always prefers the tenant-wide opening over any resource-scoped one when picking which window determines the visible calendar bounds — every resource-scoped opening's window is *guaranteed* to be a subset of it.

That guarantee also produces a delete-ordering rule: **you can't delete a tenant-wide opening while a resource-scoped opening still depends on it for the same date** (`BOOKING_TENANT_OPENING_HAS_RESOURCE_DEPENDENTS`, `409`) — deleting it first would leave the dependent's own bound pointing at nothing. This bit the milestone's own E2E test suite: a new S05 test's cleanup `finally` block removed the tenant-wide opening before its resource-scoped dependent, hit the real 409 in CI, and was fixed by swapping the removal order.

### Two races, closed the same way, by the same use case, in the same story

Beyond the window-bound *logic*, S03 also closed two genuine concurrency races using the exact same `pg_advisory_xact_lock` primitive (`ITenantLockPort.lockTenantDay`, keyed per `(tenantId, date)`):

1. **Create-vs-create overlap:** two concurrent `POST /schedule/closures` (or openings) for overlapping windows on the same date could both pass the "no overlap yet" check before either commits. Fixed by acquiring `lockTenantDay` before the authoritative overlap re-check, inside the write transaction.
2. **Delete-vs-create dependents:** a concurrent delete of a tenant-wide opening and a create of a resource-scoped opening depending on it could each read a stale view of the other. Fixed the same way — both operations acquire the same lock before their respective check.

A third attempt — locking against a concurrent `businessHours` change — initially used a *second* advisory lock (`lockTenantSettings`) and looked complete, but wasn't: the "fresh" re-read after acquiring that lock still went through `CachingTenantRepository`'s up-to-60-second cache, so the lock guaranteed nothing about what the read actually returned. **A lock only orders callers who both explicitly acquire it — it says nothing about whether a subsequent read is actually fresh, if that read's normal path goes through an independent cache the lock has no relationship to.** The real fix used a different primitive entirely: `findByIdForUpdate()`, a genuine `SELECT ... FOR UPDATE` row lock that bypasses the cache by construction, already established elsewhere in the codebase for the identical class of cross-aggregate invariant. This distinction — check whether a "protected" read is cache-backed before trusting a lock to protect it — is now a standing rule in `docs/ENGINEERING_RULES.md`.

---

## 5. The Recursos Dashboard: A Straight CRUD Screen, With Two Real Gotchas (S04)

S04 builds the manager-facing list/create/edit/deactivate/reactivate screen, following the exact structural precedent the `team/` (Staff) feature already established. Almost nothing here is novel engineering — it's the same shape as every other admin CRUD screen in this codebase — but two things are worth calling out because they're easy to get wrong by analogy.

### The `LOCATION` row is special in the UI too

Every other resource can be deactivated and its working hours customized. `LOCATION` can do neither: `ResourceListPage` never renders a "Desativar" action for it (a tenant must always retain one active default resource, enforced at the DB layer by the partial unique index), and its working-hours editor is *locked* — no "customize" toggle — because it always inherits the tenant's own Settings-configured hours. This wasn't in the original discovery pass; it surfaced during live review once someone asked "what happens if a manager customizes `LOCATION`'s hours to be different from the tenant's Settings hours?" — the answer was "now there are two silently-conflicting sources of truth for when the business is open," which is exactly the kind of drift this codebase's engineering rules explicitly warn against elsewhere. The fix added a dedicated domain error, `BOOKING_RESOURCE_LOCATION_WORKING_HOURS_IMMUTABLE` (`409`), enforced at both the UI and the backend — never trust a UI-only restriction to be the real boundary.

### A missing `GET /resources/:id` — found only once the edit form needed it

S01 shipped Resource Management with `GET /resources` (list) but no `GET /resources/:id` (single-item read) — every *other* admin CRUD surface in this codebase (Staff, Services) has one; S01 simply missed it, because nothing in that story needed it yet. S04's edit form does. Rather than work around the gap client-side (refetch the whole list and find the one row locally — which would have worked, but silently duplicated a full-list fetch just to serve one field-prefill), the story added the missing endpoint properly: `GetResourceByIdUseCase`, mirroring `service.controller.ts`'s/`staff.controller.ts`'s existing `getOne()` shape on both the backend and BFF. This is a small, concrete instance of a bigger habit worth keeping: **when an existing sibling feature already has a shape your new feature needs and doesn't have, add the missing piece properly rather than routing around it** — the workaround (refetch-and-filter) would have worked today and become a maintenance surprise later.

---

## 6. Horários's Resource-Scoping Extension: One Design, Then a Real One (S05)

This is the milestone's largest and most-revised story, and the one most worth reading closely if you're building a UI control on top of live user feedback.

### The original design, locked in at discovery

The story's own discovery process locked in a single-select `ResourcePicker`: one dropdown, driving both "which resource(s) does the calendar show" and "which resource does a newly-created block/opening apply to." This was a reasonable design on paper — simpler state, one control to build and test — and it shipped through most of implementation.

### What live testing found that discovery didn't

Once the feature was actually usable end to end, the user tested it live and found two real gaps a single-select structurally cannot close, no matter how well-built:

1. **A manager needs to see several resources merged into one view at once** — "is Leonardo blocked, or is Wallace blocked, or both?" A single-select dropdown can only ever show one resource's schedule at a time; showing "all of them" would require either a special sentinel value or abandoning the control's own semantics.
2. **Creating a block needs its own resource choice, independent of the view.** Once the view itself needed to support showing more than one resource, there was no longer a single "currently selected resource" for a new block to inherit — the two concerns (what am I looking at vs. what does this new block apply to) had been silently conflated into one control the whole time, and only broke once the first concern needed multiplicity.

### The shipped design: two controls, cleanly separated by concern

```
ResourceFilterMenu   — multi-select checkboxes, VIEW only
                        zero checked = tenant-wide default (today's exact behavior)
                        one-or-more checked = those resources' items merged into the timeline

ResourceSelectField  — single-select <select>, CREATION only
                        embedded directly in ClosureFormSheet / OpeningFormSheet
                        always resets to "Todo o negócio" fresh on open — never inherits
                        the filter menu's current selection
```
`ResourceFilterMenu` mirrors the existing `ScheduleStatusFilterMenu`'s trigger+popover shape exactly — a genuine reuse of an established UI pattern, not a new one invented for this feature. The old `ResourcePicker.tsx` was deleted outright once the new shape was proven; there was no migration path worth keeping, since the two controls' state shapes don't overlap.

This is a useful case study in how a design that was carefully locked in during discovery can still turn out to be wrong once real use reveals a dimension discovery didn't anticipate — and why "build it now, in this same PR" (the user's own call, once shown the choice between fixing it now vs. deferring as a follow-up story) was the right sequencing here: the gap was found mid-implementation, before the feature had shipped to anyone, so there was no live user-facing regression to manage around, just a design correction.

### The exact-match trap: assuming a resource-scoped response includes tenant-wide items

The multi-select view needs, for each checked resource, *that resource's own* items *plus* the tenant-wide items that always apply. It would be easy to assume the backend's `GET /schedule/closures?resourceId=X` response already includes the tenant-wide ones "since they always apply anyway" — and the original implementation did assume exactly that. It's false. The backend repository's actual filter is:

```ts
// typeorm-schedule-closure.repository.ts (and the opening equivalent)
resourceId: resourceId ?? IsNull()
```

This is an **exclusive** filter — either `resourceId` equals the given value, or it's `NULL`. Never both in the same response. A request scoped to one resource returns *only* that resource's own rows; it never rides along with the tenant-wide ones. Getting this wrong silently drops every tenant-wide closure/opening from the merged view the instant a manager checks even one resource — a real Critical bug, caught in round 7 of the PR's bot-review loop, verified against the actual repository code before being accepted as real (per this codebase's standing discipline of checking a bot's claim against actual code before trusting the severity label).

The fix, `resolveScopes()` in `useSchedule.ts`:
```ts
function resolveScopes(selectedResourceIds: readonly string[]): readonly (string | undefined)[] {
  if (selectedResourceIds.length === 0) return [undefined];         // today's exact behavior
  return [undefined, ...selectedResourceIds];                        // ALWAYS include tenant-wide too
}
```
Each scope becomes one `useQueries` entry; results are merged and de-duplicated by item id client-side. The lesson generalizes: **when extending a filter from "one thing or everything" to "several specific things," check whether the underlying query is exclusive or inclusive before assuming a scoped response carries along anything else** — an exclusive filter (this one) needs an explicit extra fetch for whatever "everything" used to mean; an inclusive filter wouldn't.

### STAFF must never see a stale MANAGER-era selection — even from localStorage

The resource filter selection persists in `localStorage`, scoped by `tenantId`. This is fine for MANAGER, who has UI to set and clear it. It's not fine for STAFF, who has **no UI at all** for this preference — `ResourceFilterMenu` never renders for STAFF. The original implementation reasoned "STAFF's selection is always empty, since there's no UI to set it" and passed the persisted value straight through unchanged. That reasoning has a real hole: the *browser* doesn't know or care who's currently logged in. A device that was MANAGER yesterday (checked two resources, closed the tab without unchecking them) and is STAFF today — a role change, a shared device, a different staff member's own login — still has that MANAGER-era selection sitting in `localStorage`, and the original code would have silently applied it, showing STAFF resource-scoped content they have no way to see or turn off.

The fix separates the *persisted* value from the *effective* one used for querying/filtering:
```ts
const effectiveSelectedResourceIds = isManager ? reconciled : EMPTY_RESOURCE_IDS;
```
STAFF's persisted value is left untouched (no destructive write to someone else's saved preference), but the effective value used everywhere downstream — the query fan-out, the filter-set derivation — is force-emptied unconditionally. This was found and fixed as a round-14 Critical; worth noting explicitly that the bot's own guessed *failure mode* (a `403` from the backend) was checked against the real backend guard and found inaccurate — `GET /schedule/closures` isn't MANAGER-gated — but the underlying AC violation (STAFF silently seeing resource-scoped content) was still real and still worth fixing. A bot's specific mechanism can be wrong while its underlying finding is still correct; check both independently, not as a package deal.

### Overlapping blocks now lane-split instead of stacking illegibly

The other live-testing finding, folded into the same PR: when multiple resources are blocked at the same time, the calendar used to render every block fully overlapping — one directly on top of another, with no way to tell how many there were or which resource each belonged to. The fix generalizes the existing overlapping-*bookings* lane-splitting algorithm (`assignBookingLanes`, previously booking-only) into a generic `assignLanes<T extends TimelineEventBase>` that also applies to overlapping closures and overlapping resource-scoped openings — two resources blocked at the same time now render as two half-width blocks side by side, three as three thirds, and so on, mirroring how overlapping bookings already worked. Each block also gained a resource-name badge (`ResourceNameBadge`, `data-testid="timeline-block-resource-name"`) so a manager can tell *which* resource a block belongs to without opening it — previously the calendar only ever showed the closure's *reason* ("Folga da equipe"), with no resource attribution at all once more than one resource could be scoped into the same view.

A resource-scoped opening deliberately never lane-splits against the tenant-wide opening — only against *other* resource-scoped openings. This follows directly from the domain invariant in §4: every resource-scoped opening's window is guaranteed to sit inside the tenant-wide one, so the tenant-wide opening stays a full-width backdrop underneath, and only genuinely competing resource-scoped windows need to share horizontal space.

---

## 7. Closing an Accepted Race, Once the Right Primitive Already Existed (S06)

S01 shipped with a documented, deliberately-accepted risk: `CreateResourceUseCase` and `UpdateResourceUseCase` both validate a `STAFF`-type resource's `refId` (is this staff member active and not already wrapped?) via a plain, non-transactional read **before** the write transaction opens. If a staff member is deactivated in the narrow window between that check and the eventual save, a `Resource` can end up wrapping an inactive staff member as "active," with `CascadeStaffDeactivationUseCase` having already run and found nothing to deactivate — a real, if narrow, business-rule violation. All three original call sites (`CreateResourceUseCase`, `UpdateResourceUseCase`, `CascadeStaffDeactivationUseCase`) carried an identical inline comment accepting this, citing the bot-review round on the S01 PR that first raised it.

This was a deliberate, honest deferral, not an oversight — closing it properly needed an advisory-lock primitive the codebase hadn't proven yet at the time S01 shipped. By the time S03 landed (§4 above), `ITenantLockPort`'s `pg_advisory_xact_lock` pattern had been built, tested, and proven twice in the same milestone. S06 exists purely to go back and apply that now-proven primitive to the gap S01 had explicitly left open — the kind of "we'll come back to this once we have the tool" follow-through that's easy to let quietly disappear once a milestone ships, and didn't here because the user explicitly recalled it and asked.

### Four call sites, one new lock method, discovered mid-discovery to actually be four

The story as originally scoped named three call sites. Story discovery's own live grep for the same accepted-risk comment found a fourth: `ReactivateResourceUseCase` had the identical shape (a `staffPort.findActiveById()` check before the transaction opens) and the identical inline "accepted limitation" comment, introduced in the same original S01 story but somehow not named in this story's initial draft. It was folded in before implementation started, rather than shipped as a known fourth gap.

### Closing the race means relocating the check, not just adding a lock call

The lock method itself is almost trivial — `lockTenantStaff(tenantId, staffId)`, identical in shape to the already-proven `lockTenantDay`, keyed per `(tenantId, staffId)` this time instead of per `(tenantId, date)`. The actual work is structural: **for all four use cases, the authoritative check had to move to *after* the lock is acquired, inside the transaction** — acquiring a lock and then re-running the same stale, already-passed check next to it would have closed nothing at all, since the check itself would still be reading whatever it read before. Each use case keeps its original, non-transactional check as a *fast pre-check* (unchanged UX — still fails fast on the common, non-racing case), then re-runs the identical check *authoritatively* under the lock, right before the eventual `save()`.

### A subtler fourth case, caught by CodeRabbit, not by the original design

`UpdateResourceUseCase`'s restructuring initially only covered the case where `refId` was *changing* to a new staff member — the obviously analogous case to create. CodeRabbit's review on the PR caught a case the design had missed: an edit that leaves an *existing* STAFF wrap's `refId` completely unchanged (say, a `turnoverMinutes`-only field tweak) can still race against a concurrent cascade deactivation for that same staff member, because the use case's own `save()` writes the resource's in-memory state blindly — and that in-memory state was loaded *before* the transaction opened, so it can silently carry a stale `isActive: true` right past a deactivation that committed in between. The fix: whenever the lock is acquired for this use case (which now includes the unchanged-`refId` case, not just the changing one), re-read the resource fresh via `findById()` *after* acquiring the lock, so `save()` always operates on state that reflects whatever's actually committed. This is the exact same "a lock only orders callers who both acquire it — it says nothing about whether a subsequent read is fresh" principle from §4's `businessHours` race, generalized here from a cache-backed staleness to a same-request in-memory staleness — worth recognizing as one general shape, not two unrelated bugs that happen to rhyme.

### Why `lockTenantDay`'s own key format was left alone

While adding `lockTenantStaff`'s namespaced key (`tenantstaff:${tenantId}:${staffId}`, as a defensive measure against ever theoretically colliding with a different lock domain hashing similar-looking strings), the same "why not clean up the existing one too" instinct nearly extended the identical namespacing to `lockTenantDay`'s already-live key. That would have been a real production bug: during a rolling or blue-green Cloud Run deploy, an old instance and a new instance run simultaneously for a window, each hashing a *different* key string for the identical `(tenantId, date)` pair — silently reopening the exact S03 race for the whole deploy window, with no error, no log line, nothing to signal it. `lockTenantStaff` is a brand-new key with nothing live to desynchronize against, so it got the clean namespace from day one; `lockTenantDay`'s key stays byte-for-byte what it's always been. The general rule: **a key/format change to something already live in production needs to survive a rolling deploy where old and new code run side by side** — "this rename is obviously safe" isn't enough; trace what happens when both versions are computing the key at the same time.

---

## 8. What This Milestone Deliberately Didn't Build

Worth stating explicitly, since it shapes what M22 has to add: `Resource` is deliberately inert beyond scheduling in this milestone. Nothing yet references it from a `Service` — `Service.resourceRequirements`/`legs`, the `resource_occupancy` exclusivity engine, class templates/sessions, recurring reservations, and contracts are all out of scope here, deferred to M22/M23/M24. The manager multi-resource *day grid* (UC-057 — a single screen showing every resource's schedule side by side, as opposed to the checkbox-filtered merged timeline S05 ships) is also explicitly out of scope — it depends on the availability engine's resource-scoped query, which doesn't exist until M22. `plan/journey/staff/prototypes/horarios/dev-notes.md`'s own ❓ GAP section tracks this as a known, intentional future gap, not an oversight.
