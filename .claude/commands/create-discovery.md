---
name: create-discovery
description: Run a structured, proactive product-discovery interview from an idea — a one-liner, a longer brief, or nothing but a slug — and produce a docs/discovery/<NAME>/ folder shaped exactly like what /discovery-to-milestone expects to promote later. Grounds every question in what Ikaro's real codebase and canonical docs actually do today before asking anything. Interviews across multiple rounds (framing, then event-storming-style domain distillation), proactively suggesting business implications and edge cases the user's idea didn't name, not just collecting answers to a fixed checklist. Drafts CAND-XX use cases in docs/04-USE_CASES.md's exact field format, a proportionally-sized data-model sketch, and a discovery-scoped prototype that reuses plan/journey/shared/'s real design system without ever writing into plan/journey/ itself — that boundary stays /discovery-to-milestone's Step 2c, gated by CLAUDE.md §15. Never writes code, never writes canonical docs, never writes plan/journey/.
metadata:
  short-description: Structured PM-style discovery interview
---

Run a structured, proactive product-discovery interview — from an idea, not from an existing spec — and produce a `docs/discovery/<NAME>/` folder shaped exactly like what `/discovery-to-milestone` expects to promote later.

This is the other half of the pipeline `/discovery-to-milestone` closes: that skill promotes a *mature* discovery into a milestone; this skill is what makes a discovery mature in the first place, starting from as little as one sentence.

> **HARD RULE — WHERE OUTPUT LIVES:** Only `docs/discovery/<NAME>/` — the main doc, proportionally-sized companions, and `docs/discovery/<NAME>/prototype/`. This skill **never** writes into `plan/journey/` (that boundary is `/discovery-to-milestone`'s Step 2c, gated by CLAUDE.md §15's hard stop — a discovery-stage prototype is explicitly pre-milestone, and §15 ties `plan/journey/` writes to "a real or imminent milestone") and **never** writes into any canonical `docs/*.md` file outside `docs/discovery/` (a discovery doc is pre-canonical by definition — promoting it is `/discovery-to-milestone`'s job, not this skill's). It also never writes `.ts`/`.js`/source/test/config files — same boundary `/discovery-to-milestone` and `/create-td` already hold.

> **AGENT RULE:** Never invoke this skill autonomously. Starting a discovery is a real commitment of design effort — confirm with the user first: *"Start a discovery for `<idea>`? I'll ground it in the real codebase, then interview you across a couple of rounds before drafting anything."* Wait for explicit yes.

Argument: `$ARGUMENTS` — a one-line idea, a longer brief (inline or a path to one), or just a slug/name to start the conversation from nothing.

---

## Step 0 — Ground the idea in what Ikaro actually is today, before asking anything

A generic PM-interview question is worse than no question — every question in this skill must be grounded in the real codebase, not asked in the abstract.

1. From the idea, judge which bounded context(s) it most likely touches (Booking/Customer/Staff/Loyalty/Notification/Platform, per CLAUDE.md §3) and whether it's a domain-slice feature, a hotsite module, a dashboard surface, or cross-cutting.
2. Read (or spawn an Explore agent for — proportional to how unfamiliar the territory is; a small idea in a well-known area doesn't need a full agent dispatch, a genuinely new area does) whichever of these actually apply: `docs/02-DOMAIN_MODEL.md`, `docs/05-BOUNDED_CONTEXTS.md`, `docs/04-USE_CASES.md` (for the nearest existing precedent flow), `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` (any hotsite-module idea — read its module-type/`MODULE_MAP` pattern before proposing a new one), `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` (any dashboard-surface idea), `docs/21-TENANTS_SETTINGS_SCHEMA.md` (any tenant-configurable idea).
3. Check `docs/discovery/` for an existing folder covering the same or clearly-overlapping ground — do not silently duplicate; if one exists, stop and ask the user how to proceed (extend it, or confirm this is genuinely separate).
4. Determine the discovery's slug: kebab-case for the argument passed to later commands, matching folder naming (e.g. `lead-form-module`, `multi-vertical-scheduling`). Confirm `docs/discovery/<slug>/` doesn't already exist.

Present a short grounding summary before asking anything — *"Today, hotsite modules work like X (see `docs/15-...` § Y); there's no lead-capture concept yet; the nearest precedent is the existing `CONTACT` module's config-panel pattern."* This is what makes Step 1's questions specific instead of generic — a question like "should this be tenant-configurable?" is much weaker than "should the question list be configurable per-tenant the same way `ServicesModuleData` already is, or fixed platform-wide?"

---

## Step 1 — Framing interview (round 1 of several — not a one-shot batch)

Unlike `/story-discovery` and `/discovery-to-milestone`'s single-round question batches (appropriate there, since those skills converge on a scope that's already mostly bounded), a discovery starting from a one-liner is genuinely exploratory — breadth before depth. Expect **at least two rounds**: this framing round, then Step 2's domain-distillation round, and more if real threads stay open. Say so explicitly to the user up front, so a "just a couple more questions" round 2 isn't a surprise.

Ask a focused set of business-framing questions grounded in Step 0's findings:
- Who is the actor (which of Ikaro's real actor types — Customer, Guest, Staff, Manager, Platform operator)? What business problem does this solve for a Brazilian car-wash/service-vertical tenant specifically — not a generic SaaS justification.
- MVP-now or explicitly-later? Is there a monetization/plan-tier angle, or is this available to every tenant?
- What's the closest existing feature/module to model the pattern after (found in Step 0)?

**Proactively suggest — don't just collect.** Name 2-3 things a real PM would flag that the idea as stated doesn't specify. For a "lead-form module" idea: does a submission become a real `Customer` record or stay anonymous/unlinked? Does it need spam/rate-limit protection (a public, unauthenticated write surface)? Does the manager get notified per-submission or only see a dashboard list? Is there an export path? These aren't rhetorical — they're real open questions the discovery can't proceed past without an answer, framed as genuine suggestions the user can accept, reject, or redirect.

Present all at once, grouped by theme, same numbered/tagged format `/discovery-to-milestone`'s Step 1 uses:

```
## Discovery framing — <idea name>

This is round 1 — expect at least one more round once the domain model takes shape.
Please answer all at once; I'll wait for one reply before drafting anything.

**Scope**
1. Is this MVP-now or explicitly deferred? <grounding-based context>

**Data ownership (a suggestion, not just a question)**
2. A form submission — does it become a real `Customer` row (tenant-scoped, matching CLAUDE.md §2's multi-tenant customer model), or stay a standalone, unlinked record? This affects whether it can ever earn loyalty points or needs its own separate audit trail.

**Abuse protection (a suggestion)**
3. This is a public, unauthenticated write endpoint once live — same shape as guest booking (UC-001). Same rate-limit/spam posture, or does a manual-review queue make more sense here?
```

Wait for the user's single reply before continuing. Record every answer in the same **Decisions log** vocabulary `/discovery-to-milestone` already uses — **BLOCKER** / **DEFERRABLE** / **PRODUCT-DECISION** — so a discovery drafted here needs no translation when it's later promoted. Persist the log to the session scratchpad as it grows, same reasoning as `/discovery-to-milestone`'s Step 1: a multi-round discovery can run long, and losing an early decision to context compaction before anything is written to disk is a real risk.

---

## Step 2 — Domain distillation (event-storming style)

From round 1's answers, draft — for discussion, not yet written to disk — the actual domain shape, in event-storming order:

1. **Events** (past tense, what actually happened — e.g. `LeadFormSubmitted`, `LeadFormQuestionConfigured`). Check each against `docs/03-DOMAIN_EVENTS.md`'s real envelope shape (`eventId`/`tenantId`/`occurredAt`/`correlationId`/`eventName`/`eventVersion`/`data`, per CLAUDE.md §4) from the start.
2. **Commands** that trigger each event (what a customer/manager/system actually does).
3. **Aggregate(s)** that own each command — for each, explicitly check Step 0's domain-model read: does this extend an *existing* aggregate (e.g. a new `HotsiteConfig` module type) or genuinely need a new one? Extending an existing aggregate is the default; justify a new one the same way `/discovery-to-milestone`'s 3b now requires ("name the actual boundary, don't default to a new aggregate because it's simpler to reason about in isolation").
4. **Cross-context policies/reactions** — does another bounded context need to react (e.g. does Notification need to email the manager on submission)? Per CLAUDE.md §7's priority order, prefer a domain event over a direct port call.
5. **Read models** — what does each actor-facing screen actually need to display? Naming this explicitly now is what closes the exact gap `/discovery-to-milestone`'s own 3b/5a checks were added to catch after this session's test found a milestone with no "list my bookings" endpoint anywhere — don't let this discovery repeat that at its own origin.

Surface business-rule ambiguities as questions here, in the same spirit as `/story-discovery`'s 4q ("does this leave a threshold, an edge case, a precedence between two rules unspecified?") — a discovery is exactly the place these should be asked, not left for a much later, much more expensive story-discovery round to catch for the first time.

Present as round 2 (batched, same format as Step 1), tagged BLOCKER/DEFERRABLE/PRODUCT-DECISION. Continue into further rounds if real threads are still open — don't force convergence before the domain shape actually settled.

---

## Step 3 — Candidate use cases, in the exact promotable format

Once the domain model from Step 2 is validated, draft each candidate use case labeled `CAND-XX` (never `UC-XXX` — avoids any collision with the canonical index, exactly like the existing `MULTI_VERTICAL_SCHEDULING_USECASES.md` convention), in `docs/04-USE_CASES.md`'s **exact** field format: Actor / Preconditions / Trigger / Main Flow / Alternative Flows / Postconditions / Events Triggered.

This isn't a nice-to-have — `/discovery-to-milestone`'s own Step 2a explicitly says a discovery doc already in this shape is "closer to a format-conformance pass than a rewrite." Writing it this way from day one is what makes that true later.

---

## Step 4 — Data/schema sketch (proportional — fold in or split, don't default to splitting)

For each new/modified aggregate from Step 2: sketch the schema-level shape (tables/columns, not full DDL) grounded against CLAUDE.md §2's multi-tenancy invariants from the start — `tenant_id` first in every composite index, composite FKs for cross-aggregate references within a context, no cross-context FK (per `docs/13-DATABASE_SCHEMA.md`'s own Global Standards). Getting this right now is cheap; finding a tenant-isolation gap during promotion or, worse, during real implementation is not.

**Size the output proportionally** — a small discovery folds this straight into the main doc; a discovery introducing several new aggregates splits it into `docs/discovery/<slug>/<slug>_DATA_MODEL.md`, mirroring `MULTI_VERTICAL_SCHEDULING_DATA_MODEL.md`'s precedent. Don't default to splitting for a discovery small enough that one file reads fine — same "don't invent structure you don't need" principle `/discovery-to-milestone` already applies to its own clustering.

---

## Step 5 — Prototype: real design-system consistency, discovery-scoped location only

**Before building anything:** read `plan/journey/shared/tokens.css` and the nearest existing real shared fragment for this idea's shape (`dashboard-shell.html` for a manager-config screen, `hotsite.html` for a public-facing module, `login.html` for an auth-adjacent flow) — reuse real custom properties and class names; do not invent new ones that drift from what's already established. Read `plan/journey/README.md` for the exact folder shape, lettered-variant naming convention (`01b`, `01c`, …), and the CSS gotchas it documents (`.topbar-avatar`, `.week-nav`, `padding-bottom`, floating toast) — follow them even at discovery stage. The goal is that `/discovery-to-milestone`'s later relocation is close to a pure move, not a rebuild — exactly what worked well for the Multi-Vertical Scheduling prototype's relocation in this session's own test, and exactly what a discovery-stage prototype ignoring these conventions would turn into unnecessary rework for.

**Where it lives, no exception:** `docs/discovery/<slug>/prototype/` — a single flat folder, multi-actor prefixed (`customer-*`, `manager-*`, `staff-*`, `public-*`), exactly the shape `/discovery-to-milestone`'s Step 2c already expects to find and split into the real per-actor `plan/journey/<actor>/prototypes/<slug>/` structure during promotion. **Never `plan/journey/` directly** — see the HARD RULE above. If mid-discovery the user wants to see this prototype folded into the real, canonical journey structure ahead of a real promotion, that is explicitly out of scope for this skill — it's a `/discovery-to-milestone`-adjacent decision requiring the CLAUDE.md §15 hard stop's own clean-baseline gate, not something to shortcut here.

`docs/discovery/<slug>/prototype/dev-notes.md` follows `plan/journey/README.md`'s own mandatory template (file map, props, BFF-call sketch, validation table, state machine) from day one, plus `index.html` as the screen index — both real requirements at promotion time, not discovery-time-optional extras.

Build only the screens the validated Step 1-3 scope actually needs — don't prototype a DEFERRABLE or PRODUCT-DECISION branch as if it were settled.

---

## Step 6 — Non-Goals, historical-decisions log, promotion-readiness self-check

Write an explicit **Non-Goals / Out of scope** section — what was proactively suggested in Steps 1-2 and explicitly declined, not just silently dropped.

Build (not bolt on retroactively) a **Historical questions & decisions** section: every round's question plus its answer, dated, in the same style `MULTI_VERTICAL_SCHEDULING.md` §9 uses ("Resolved — ...", "Superseded (date) by item N — ..."). This is not optional polish — it's the exact artifact `/discovery-to-milestone`'s Step 0 item 3 (the companion-doc-supersession check) depends on existing. A discovery drafted without this section is drafted with a known gap in the very next skill's own verification.

**Self-dry-run before presenting anything:** does this discovery doc set actually match what `/discovery-to-milestone` expects to find — a resolved-decisions section present, CAND-format use cases, a prototype folder with a template-compliant `dev-notes.md`, an explicit Non-Goals section? Fix gaps now; the whole point of this step existing is to shift that cost left instead of leaving it for the next skill to discover.

---

## Step 7 — Write, gated

Everything from Steps 1-6 is drafted in conversation first, never written to disk incrementally per-step. Apply the doc/config gate (CLAUDE.md §0): summarise the complete folder contents once — every file, its purpose, its rough size — and ask *"May I now create `docs/discovery/<slug>/` with this content?"* Write only after an explicit yes. Do not ask per-file.

---

## Step 8 — Handoff

```
Discovery `docs/discovery/<slug>/` is drafted — <N> CAND use cases, <M> prototype screens,
<K> aggregates/events sketched.

This is a discovery-stage artifact — nothing here is canonical yet, and nothing downstream
(a real story, a real UC number, a real plan/journey/ file) exists because of it until it's
promoted.

When you're ready: run `/discovery-to-milestone docs/discovery/<slug>/<slug>.md` to promote
it into a real, dependency-sequenced milestone.
```

If real open threads remain (a PRODUCT-DECISION item, a DEFERRABLE default the user might revisit), name them again here explicitly — don't let them be findable only by re-reading the whole doc.
