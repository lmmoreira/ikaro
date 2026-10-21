# M23 — Multi-Vertical Scheduling: Appointment Booking & Extensions — Implementation Details (Developer)

This document explains what M23 built, why it was built that way, and which mistakes are worth not repeating. For file paths and tables see the IA twin (`…_IMPLEMENTATION_DETAILS_IA.md`); for the algorithms see `docs/BUSINESS_LOGIC_REFERENCE.md`; for locks see `docs/LOCK_CATALOG.md`.

---

## 1. Overview

M21 gave the platform `Resource`; M22 let a `Service` declare which resources it needs and built the exclusivity engine (`resource_occupancy`). M23 is where a customer — or a staff member on their behalf — can actually **book** against that model, and where the appointment family gets its three standing-commitment extensions.

Four groups of work, roughly in the order they landed:

1. **Booking against resources (S01–S03, S29–S33, S11a/b).** Resource resolution per `selectionMode`, variable-duration reservations, versioned intake and attendees, a reschedule that re-resolves everything, public read APIs for the booking flow, the booking window, and the guest/customer flow UI.
2. **Recurring private reservations (S04, S05, S12, S13, S17–S22, S28, S35, S19).** A customer asks for a weekly pattern over a fixed term; staff approve (or are the approver); the whole term becomes ordinary bookings once.
3. **Availability alerts and future-commitment exceptions (S06–S08, S14, S23, S31, S34, S38, S43–S46, S48).** "Tell me when a slot opens", and "a resource disappeared; a manager decides what happens to each affected booking".
4. **Operations and clarity (S09, S25–S27, S36, S37, S39–S42, S47, S49, S50).** No-show, an audit trail for every status change and every event, correct emails, staff-created bookings, the full booking detail, bounded lock waits.

---

## 2. The decisions that shaped everything

### 2.1 Recurrence is materialized once, not generated on a schedule

The first design (S04) had pause, skip and reschedule on a schedule, and a rolling generator. It was removed in pieces: Pause (S20, nothing could resume it once every occurrence was already a booking), the per-occurrence exception table (S08, then dropped by S24 after S08 was deployed everywhere), and the overlap layer (S05).

What stayed: a **fixed term** (`endsOn` required, capped by the service's `recurringHorizonDays`, default 90). The whole term is checked up front — working hours and closures first, then resource conflicts, atomically — and every occurrence is created as an `APPROVED` booking linked by `recurringScheduleId`. An occurrence **is** its booking, so skipping is that booking's cancel and rescheduling is its reschedule, under the tenant's ordinary windows. Nothing about recurrence needed a new concept at read time.

*Lesson:* when a feature keeps needing safeguards (a generator, a resume, an exception table), look for the structure that needs none. Here, "just create the bookings" removed three mechanisms.

### 2.2 Nothing moves a booking silently

Deactivating a resource (or the staff member behind it) can strand future bookings. The system **records** the impact as a `FutureCommitmentException`; a manager keeps, reassigns, reschedules or cancels it, individually or in bulk. Reassign checks the target is valid for that source resource only, which is why the decision panel draws one "Reatribuir" per entry.

Consequences worth remembering:
- `Raised` has no email consumer on purpose: a deactivation touching 40 bookings would send 40 emails. The manager alert hangs on `ResourceDeactivationImpactRaised` instead.
- An entry must not outlive the reason for it. S45 closes a resource's entries when it is reactivated; S48 closes a booking's stale and sibling entries in the **same transaction** as the cancel, reject, reschedule or end — under the lock order, not a new lock.

### 2.3 The durable record of "which resource" is the assignment table, not occupancy

Cancel and reject delete `resource_occupancy` rows. The detail page (S47) therefore reads the **latest** `booking_line_resource_assignments` row per slot (so a booking reassigned twice shows only its current resource) and takes leg times from occupancy only while those rows exist. A cancelled booking shows its resources and leg order, without times, never times derived from today's leg definitions.

### 2.4 One backend read, two audiences

`GET /bookings/:id` returns everything; the BFF mappers pick the subset. The customer mapper has a dedicated negative test: it never carries `adminNotes`, who created the booking, the consent version, or the cancel/reject actor id. A customer's own cancellation stores no reason, and the customer sees "Você" or "O estabelecimento" only. The detail extras sit behind `includeDetailExtras`, off by default, because the loyalty adapter calls the same use case and must not pay for them.

### 2.5 The booking window has one definition

S33 centralized "how far ahead and how soon" in one helper: a per-service override can never be looser than the tenant's, "today" is the tenant's timezone, and every caller uses it — create, authenticated create, customer reschedule, a recurring schedule's first occurrence (S35), the alert sweep and the public calendar. Staff are exempt. Three negative guarantees are pinned by tests (#568).

---

## 3. Concurrency and failure handling

- **Pick the primitive by the shape of the race:** an exclusion constraint when rows exist and must not overlap, a row lock when a row is read-then-written, an advisory lock when no row exists yet. A lock only orders callers who both take it; pair it with a fresh read.
- **S49 closed a real gap:** the backend had no `lock_timeout`. A stuck lock hung the request; a Postgres deadlock surfaced as an unmapped `40P01`. Every transaction opened by `runInNewTransaction` now sets a 2s transaction-local `lock_timeout`, and lock timeout or deadlock maps to a retryable 503 with `Retry-After: 1`. A spec that stubs an `EntityManager` now needs a `query` stub.
- **Never do network I/O inside `txManager.run()`.** Emails and event publishing happen after commit; the architecture check enforces it.
- **Locking several rows of one kind** takes a single batched query with a deterministic order, not N sequential locks.

---

## 4. Events, audit and notifications

- **15 new domain events** across alerts, no-show, resource reassign, exceptions and recurring schedules. A new event needs a line in its context's audit-log handler; since S36 one shared `LogDomainEventUseCase` serves every context, and CI fails if an event lacks a subscription.
- **Every status change** of a booking is appended to `booking_status_transitions` (S26, no backfill) through `transitionTo()` — the aggregate is authoritative for every booking, including those older than the table, so S47 reads cancellation fields from the aggregate, not from this table.
- **Emails (S25, S28, S37, S38, S21, S23):** one template migration per family. S37 was a correctness pass over everything shipped — blank daily schedules, nameless reminders, a customer link into the staff dashboard, unescaped user text, unformatted dates — plus a guard that renders the real copy.
- **A new Pub/Sub topic needs a Foundation apply**, not just the Terraform in the PR; otherwise the topic exists but nobody can publish to it.

---

## 5. Frontend lessons

- Prototypes drive the UI: each story read the prototype before writing components, and the `--ba-*` palette stays in the hotsite tree only — dashboard and account code uses Tailwind and shadcn.
- Every new component ships its `.spec.tsx` in the same commit, and **every card that can be empty has a test that it renders nothing when empty** (S47): a plain booking looks exactly as it did before.
- Both locales in the same commit; a new error code needs entries in both `errors.json` files or the exhaustiveness test fails CI.
- The floating filter (S50) remembers its corner per tenant and per page; the shared customer chooser (S40) is reused by S19.
- `returnTo` must be validated and used consistently: S47's review found a "back" link in the schedule detail that still pointed at the list while the topbar followed `returnTo`.

---

## 6. Review-process lessons

- **A bot finding is a claim to verify, not an order.** On S47 Codex flagged that the customer itinerary can show a resource name whose requirement the service no longer declares. It was declined with evidence: UC-065 and the create response already reveal every leg's resource to the customer, so hiding it later would only retract what they were shown. A flat resource, by contrast, depended on the requirement's mode, so an unknown mode hides the name. If product wants a different rule, it is a change to UC-065.
- **A partial fix is not a fix:** the back-link bug was first fixed in the topbar only; the second Codex round found the action pane.
- **Split large stories into two PRs** (S47: backend/BFF/types first, web second) and note deviations in the story file.

---

## 7. Known gaps

- A cancelled recurring schedule shows only "Cancelada" — the read carries no reason.
- `hold_expires_at` on a pending `HOLD` was written for a while with nothing enforcing it; TD51 added the enforcement (`docs/BUSINESS_LOGIC_REFERENCE`): a manual-approval request on a resource-scoped service is now cancelled by the system once its hold passes, and staff can no longer approve it after that.
- M24 (classes and sessions) reuses `booking_quote_revisions` and the resource-resolution precedent, and owns its own rolling session generation — M23 deliberately left no generation pattern to reuse.
