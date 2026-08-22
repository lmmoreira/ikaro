---
name: create-discovery
description: Run a structured product-discovery process that produces a docs/discovery/<NAME>/ folder shaped exactly like what /discovery-to-milestone expects to promote later. Two modes, sharing the same downstream steps — Mode A starts from an idea (a one-liner, a longer brief, or nothing but a slug) and interviews across rounds; Mode B ingests an existing, out-of-pattern docs/discovery/ file set (built before this skill existed) and restructures + re-validates it into the canonical shape without re-deriving what's already correct. Throughout both modes, actively adopts three expert lenses at the point each applies — a PM pressure-testing business case/use cases/edge cases, a database expert critiquing the data model's normalization/indexing/aggregate boundaries, a UX expert critiquing prototype state-coverage/consistency/information hierarchy — not passive template-filling. Grounds every question in what Ikaro's real codebase and canonical docs actually do today. Never writes code, never writes canonical docs, never writes plan/journey/ directly.
metadata:
  short-description: PM/DB/UX-led discovery process, two modes
---

Run a structured product-discovery process — either starting from an idea (Mode A) or restructuring an existing, pre-this-skill discovery doc set (Mode B) — and produce a `docs/discovery/<NAME>/` folder shaped exactly like what `/discovery-to-milestone` expects to promote later.

This is the other half of the pipeline `/discovery-to-milestone` closes: that skill promotes a *mature* discovery into a milestone; this skill is what makes a discovery mature in the first place — either from as little as one sentence, or by bringing an already-substantial-but-informally-structured discovery into the same canonical shape.

**Throughout every step where it applies, actively adopt the relevant expert lens — don't passively fill in a template:**
- **As a PM:** pressure-test the business case (does this solve a real problem for a Brazilian car-wash/service-vertical tenant, not a generic SaaS justification), insist on failure-mode and edge-case completeness in every use case (not just the happy path), proactively name what the idea as stated didn't specify.
- **As a database expert:** critique the data model, don't just record it — normalization, redundant/denormalized fields (which need the same explicit justification `Booking.totalPrice`'s own denormalization comment gives), query-pattern-to-index mapping, aggregate-boundary correctness (would two aggregates need cross-transaction consistency — a sign the boundary is wrong), snapshot/point-in-time fields where a later edit shouldn't retroactively change history (mirroring `BookingLine`'s own `priceAtBooking` snapshot pattern), growth/scale red flags.
- **As a UX expert:** insist on full state coverage for every screen (empty, loading, error, validation, success — not just the ones the happy path needs), check consistency against the *nearest real existing pattern*, not just token reuse, and default to a preset/wizard over a raw config form for a non-technical tenant admin (the same principle `MULTI_VERTICAL_SCHEDULING.md` §10 already established for this codebase — treat it as a standing UX principle for any new manager-config surface, not a one-off).

> **HARD RULE — WHERE OUTPUT LIVES:** Only `docs/discovery/<NAME>/` — the main doc, proportionally-sized companions, and `docs/discovery/<NAME>/prototype/`. This skill **never** writes into `plan/journey/` (that boundary is `/discovery-to-milestone`'s Step 2c, gated by CLAUDE.md §15's hard stop — a discovery-stage prototype is explicitly pre-milestone, and §15 ties `plan/journey/` writes to "a real or imminent milestone") and **never** writes into any canonical `docs/*.md` file outside `docs/discovery/` (a discovery doc is pre-canonical by definition — promoting it is `/discovery-to-milestone`'s job, not this skill's). It also never writes `.ts`/`.js`/source/test/config files — same boundary `/discovery-to-milestone` and `/create-td` already hold. Mode B may `git mv` files that already exist under `docs/discovery/` to restructure them, but this rule applies identically to Mode B's output — restructuring never means relocating anything into `plan/journey/`.

> **HARD RULE — MODE B NEVER LOSES CONTENT:** Restructuring is additive and corrective, never destructive. The default operation on existing prose is **append**, not **replace** — a new critique finding (PM/DB/UX pass) or gap-fill becomes a new dated entry in the historical-decisions log, the same way `MULTI_VERTICAL_SCHEDULING.md`'s own §9 already accumulates "Resolved"/"Superseded (date)" entries rather than deleting earlier ones. A **replace** happens only for a fact Step 0's currency check *confirmed* stale against real code — and even then, using the exact old→new pattern `/docs-audit`'s own Step 5 resolution flow already uses, stated explicitly, never a silent rewrite. Every file, every `CAND-XX`, every historical-decision item, every data-model table/field, every prototype screen that exists before this skill touches anything must be accounted for after — relocated, explicitly merged with a stated reason, or explicitly flagged as a proposed drop for the user to confirm. "I reorganized it" is never sufficient justification for something that's simply gone. Step 0's inventory and Step 6's reconciliation manifest (below) exist specifically to make this checkable, not just asserted.

> **AGENT RULE:** Never invoke this skill autonomously. Confirm with the user first — for Mode A: *"Start a discovery for `<idea>`? I'll ground it in the real codebase, then interview you across a couple of rounds before drafting anything."* For Mode B: *"Restructure `<existing files>` into a canonical `docs/discovery/<NAME>/` folder? I'll re-check everything against current Ikaro and re-evaluate the prototype first, then ask about anything genuinely unresolved before restructuring."* Wait for explicit yes either way.

Argument: `$ARGUMENTS` — determines the mode:
- **Mode A:** a one-line idea, a longer brief (inline or a path to one), or just a slug/name to start from nothing.
- **Mode B:** a path to an existing file or folder under `docs/discovery/` that does not already match the canonical `docs/discovery/<NAME>/<NAME>.md` shape this skill produces (e.g. a flat set of `docs/discovery/SOME_NAME*.md` files predating this skill).

---

## Step 0 — Determine mode, then ground in what Ikaro actually is today

A generic PM-interview question is worse than no question — every question in this skill must be grounded in the real codebase, not asked in the abstract. This step differs by mode.

### Mode A — fresh idea

1. From the idea, judge which bounded context(s) it most likely touches (Booking/Customer/Staff/Loyalty/Notification/Platform, per CLAUDE.md §3) and whether it's a domain-slice feature, a hotsite module, a dashboard surface, or cross-cutting.
2. Read (or spawn an Explore agent for — proportional to how unfamiliar the territory is) whichever of these actually apply: `docs/02-DOMAIN_MODEL.md`, `docs/05-BOUNDED_CONTEXTS.md`, `docs/04-USE_CASES.md` (nearest existing precedent flow), `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` (any hotsite-module idea — read its module-type/`MODULE_MAP` pattern before proposing a new one), `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` (any dashboard-surface idea), `docs/21-TENANTS_SETTINGS_SCHEMA.md` (any tenant-configurable idea).
3. Check `docs/discovery/` for an existing folder covering the same or clearly-overlapping ground — do not silently duplicate; if one exists, stop and ask the user how to proceed.
4. Determine the discovery's slug (kebab-case, e.g. `lead-form-module`). Confirm `docs/discovery/<slug>/` doesn't already exist.

Present a short grounding summary before asking anything — *"Today, hotsite modules work like X (see `docs/15-...` § Y); there's no lead-capture concept yet; the nearest precedent is the existing `CONTACT` module's config-panel pattern."* This is what makes Step 1's questions specific instead of generic.

### Mode B — restructure an existing, out-of-pattern discovery

1. **Build a literal, itemized manifest of everything that already exists** for this discovery — not a summary. Every file matching its name(s) under `docs/discovery/` (however scattered), every distinct `CAND-XX` in it, every numbered item in its historical-decisions/resolved-questions section (if one exists), every table/aggregate named in its data model, every screen file in its prototype folder if one exists — and, checked explicitly, whether any of its content already landed ahead of order in `plan/journey/` (search for the discovery's own name/keywords across `plan/journey/**/*.md` and any promotion-status note; `plan/journey/README.md`'s own "Known exception" notes are exactly where this gets flagged when it happens). This manifest is the baseline the HARD RULE above and Step 6's reconciliation check both hold the final output accountable to — build it complete before touching anything, not as an afterthought.
2. **Re-check against current Ikaro** — spawn an Explore agent to verify every "today's model" claim in the existing docs against the actual current code (identical discipline to `/discovery-to-milestone`'s Step 0 item 2 — a discovery reasoning from a premise that's since shipped-and-changed is worse than a fresh one). **If the existing main doc has its own "resolved decisions" / "historical questions" section** (a mature, iterated discovery usually does), also verify every companion doc still reflects those *final* resolutions, not an earlier superseded draft — the same companion-doc-supersession check `/discovery-to-milestone`'s Step 0 item 3 performs, run here instead, before restructuring compounds any staleness found.
3. Confirm the new canonical slug/name with the user (don't assume — the existing name may itself need to change, e.g. a discovery that grew broader than its original working title).

Present the inventory and staleness findings before asking anything else — this grounds Step 1's gap analysis in what's actually true right now, not what the existing docs assumed when they were last touched.

---

## Step 1 — Framing interview (Mode A) / Gap & currency analysis (Mode B)

### Mode A — framing interview, round 1 of several

Unlike `/story-discovery` and `/discovery-to-milestone`'s single-round question batches (appropriate there, since those skills converge on a scope that's already mostly bounded), a discovery starting from a one-liner is genuinely exploratory — breadth before depth. Expect **at least two rounds**: this framing round, then Step 2's domain-distillation round, and more if real threads stay open. Say so explicitly up front.

Ask a focused set of business-framing questions grounded in Step 0's findings — **as a PM**: who is the actor (Customer, Guest, Staff, Manager, Platform operator)? What business problem does this solve for a Brazilian car-wash/service-vertical tenant specifically? MVP-now or explicitly-later? Monetization/plan-tier angle, or available to every tenant? What's the closest existing feature to model the pattern after?

**Proactively suggest — don't just collect.** Name 2-3 things a real PM would flag that the idea as stated doesn't specify. For a "lead-form module" idea: does a submission become a real `Customer` record or stay anonymous/unlinked? Does it need spam/rate-limit protection (a public, unauthenticated write surface)? Does the manager get notified per-submission or only see a dashboard list? Is there an export path?

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

### Mode B — gap & currency analysis

Do not re-interview from zero — that risks a fresh answer contradicting an already-carefully-resolved decision, and wastes real prior work. Instead:

1. **Gap analysis against the canonical template** (what Steps 3-6 below now expect): does the existing content already have a resolved-decisions log, CAND-format use cases, a data-model companion, a prototype with template-compliant `dev-notes.md`, an explicit Non-Goals section? Most of a mature existing discovery usually already has most of this — say so explicitly; don't manufacture work re-deriving what's already correct. **Recognize and preserve non-standard companion types the existing discovery already established** (e.g. an onboarding/presets doc) rather than forcing everything into only the two companion types Step 4/5 name by default.
2. **Only the genuine gaps** found in Step 0's staleness check and this gap analysis become real questions — present them the same batched, tagged format Mode A uses, but scoped to what's actually unresolved, not a full re-framing round.
3. **One question Mode B must always ask explicitly, never resolve silently:** for any content already found sitting in `plan/journey/` ahead of order (Step 0 item 1) — pull it back into the reorganized `docs/discovery/<new-slug>/prototype/` for consistency, or leave it in place as tracked debt? Both are defensible; this is a real product/process call, not something this skill decides on its own.

---

## Step 2 — Domain distillation (event-storming style) — Mode A drafts, Mode B re-validates

**As a database expert**, not just a note-taker: from the settled framing (Mode A) or the existing content (Mode B), work — or re-derive and critique — the domain shape in event-storming order:

1. **Events** (past tense — `LeadFormSubmitted`). Check each against `docs/03-DOMAIN_EVENTS.md`'s real envelope shape (`eventId`/`tenantId`/`occurredAt`/`correlationId`/`eventName`/`eventVersion`/`data`, per CLAUDE.md §4).
2. **Commands** that trigger each event.
3. **Aggregate(s) that own each command** — does this extend an *existing* aggregate (default) or genuinely need a new one (justify the actual boundary, don't default to "new" because it's simpler to reason about in isolation — same discipline `/discovery-to-milestone`'s 3b now requires)? For Mode B, actively stress-test the *existing* aggregate design: does any pair of use cases assume two separate aggregates must stay consistent within one transaction — a sign the boundary itself is wrong, not something to patch around later.
4. **Cross-context policies/reactions** — does another bounded context need to react? Prefer a domain event over a direct port call, per CLAUDE.md §7's priority order.
5. **Read models** — what does each actor-facing screen actually need to display? Naming this now is what closes the exact gap `/discovery-to-milestone`'s 3b/5a checks exist to catch after this session's own test found a milestone with no "list my bookings" endpoint anywhere — don't let a new discovery repeat that at its own origin, and for Mode B, explicitly check the *existing* use cases for the same gap.

Surface business-rule ambiguities as questions, in the same spirit as `/story-discovery`'s 4q. Mode A presents this as round 2 (or more); Mode B folds any real finding into its own gap-analysis question round from Step 1.

---

## Step 3 — Candidate use cases, in the exact promotable format

**As a PM**, insist on completeness beyond the happy path: for every use case, does it name its empty/error/permission-denied/race-condition alternative flows, not just the main flow? A use case silent on "what if this fails" is incomplete, whether drafted fresh (Mode A) or inherited (Mode B — check the existing CAND entries for this specifically, since it's an easy gap to have missed even in an otherwise-mature discovery).

Draft (Mode A) or validate/extend (Mode B) each candidate use case labeled `CAND-XX` (never `UC-XXX` — avoids collision with the canonical index), in `docs/04-USE_CASES.md`'s **exact** field format: Actor / Preconditions / Trigger / Main Flow / Alternative Flows / Postconditions / Events Triggered. `/discovery-to-milestone`'s own Step 2a explicitly says a discovery doc already in this shape is "closer to a format-conformance pass than a rewrite" — writing (or confirming) it this way is what makes that true later.

---

## Step 4 — Data/schema sketch — as a database expert, proportional output

For each new/modified aggregate: sketch the schema-level shape (tables/columns, not full DDL) grounded against CLAUDE.md §2's multi-tenancy invariants from the start — `tenant_id` first in every composite index, composite FKs for cross-aggregate references within a context, no cross-context FK.

**This is a critique pass, not a transcription pass — for Mode A while drafting, for Mode B against what already exists:**
- Every denormalized/redundant field needs an explicit reason, the same way `Booking.totalPrice`'s own comment states it's a cached derived sum, not an independent source of truth. A field with no stated reason for its redundancy is a real finding, not a style nit.
- For each read the use cases imply (Step 3), name the index that actually serves it — don't leave this for a much later story to discover under load.
- Flag any field or relationship that needs to be a **point-in-time snapshot** rather than a live reference — mirroring `BookingLine.priceAtBooking`/`serviceNameAtBooking`'s own pattern — anywhere a later edit to the "live" record shouldn't retroactively change something already committed (a price, a quoted duration, a name shown on a past record).
- Flag any obviously unbounded-growth pattern (an array column that could grow without limit, a table with no archival/retention story) even at this early stage — a cheap flag now, an expensive rediscovery later.

**Size the output proportionally** — fold into the main doc for a small discovery; split into `docs/discovery/<slug>/<slug>_DATA_MODEL.md` for one introducing several aggregates, mirroring `MULTI_VERTICAL_SCHEDULING_DATA_MODEL.md`'s precedent. Don't default to splitting.

---

## Step 5 — Prototype — as a UX expert, discovery-scoped location only

**Before building or re-evaluating anything:** read `plan/journey/shared/tokens.css` and the nearest existing real shared fragment for this idea's shape (`dashboard-shell.html` for a manager-config screen, `hotsite.html` for a public-facing module, `login.html` for an auth-adjacent flow) — reuse real custom properties and class names. Read `plan/journey/README.md` for the exact folder shape, lettered-variant naming convention, and its documented CSS gotchas — follow them even at discovery stage, so `/discovery-to-milestone`'s later relocation is close to a pure move, not a rebuild.

**As a UX expert, not just a screen-builder (Mode A) or format-checker (Mode B):**
- **Full state coverage is mandatory, not scoped down to only what the happy path needs:** empty, loading, error, validation, and success states for every real interaction — the same discipline this repo's own existing prototypes already follow (`0Xb`-style error/empty variants throughout `plan/journey/`). For Mode B, audit the *existing* prototype folder against this list explicitly and name any missing state as a real gap, not a nice-to-have.
- **Default to a preset/wizard over a raw config form for any manager-config surface** — the standing principle `MULTI_VERTICAL_SCHEDULING.md` §10 already established for this codebase ("power stays in the domain model; simplicity stays in the wizard on top of it"). A new discovery proposing a raw multi-field config form for a non-technical tenant admin should be challenged on this before it's prototyped, not after.
- **Consistency means checking against the nearest real existing pattern, not just reusing tokens.** Read the actual closest analogous screen already shipped (or already prototyped elsewhere in `plan/journey/`) and compare information density, layout, and interaction pattern — flag a departure explicitly rather than silently drifting into a new pattern this codebase doesn't otherwise use.

**Where it lives, no exception:** `docs/discovery/<slug>/prototype/` — a single flat folder, multi-actor prefixed (`customer-*`, `manager-*`, `staff-*`, `public-*`). **Never `plan/journey/` directly** — see the HARD RULE above. (Mode B: this is where Step 1's explicit question about any already-ahead-of-order `plan/journey/` content gets applied — if the user chose "pull it back," relocate it here via `git mv`, adapting naming to this flat multi-actor-prefixed shape; if "leave as tracked debt," leave it untouched and say so plainly in Step 6's Non-Goals.)

`dev-notes.md` follows `plan/journey/README.md`'s own mandatory template (file map, props, BFF-call sketch, validation table, state machine) from day one; `index.html` indexes the screens. Build only what the validated scope actually needs — don't prototype a DEFERRABLE or PRODUCT-DECISION branch as if it were settled.

---

## Step 6 — Non-Goals, historical-decisions log, promotion-readiness self-check

Write an explicit **Non-Goals / Out of scope** section — what was proactively suggested and explicitly declined, not just silently dropped. Mode B: also state explicitly what happened to any pre-existing `plan/journey/` content per Step 5's resolution.

Build (Mode A: from scratch; Mode B: continue what already exists, don't restart it) a **Historical questions & decisions** section — every round's question plus its answer, dated, in the style `MULTI_VERTICAL_SCHEDULING.md` §9 already uses. This is the exact artifact `/discovery-to-milestone`'s Step 0 item 3 depends on existing — a discovery drafted without it is drafted with a known gap in the very next skill's own verification.

**Self-dry-run before presenting anything:** does this discovery doc set actually match what `/discovery-to-milestone` expects — resolved-decisions section present, CAND-format use cases with real alt-flow completeness, a data model that survived the database-expert critique pass, a prototype with full state coverage and a template-compliant `dev-notes.md`, an explicit Non-Goals section? Fix gaps now.

**Mode B only — reconciliation manifest, mandatory before Step 7:** walk Step 0's itemized manifest line by line against the restructured output and produce an explicit before/after table — every original file, `CAND-XX`, historical-decision item, data-model table/field, and prototype screen, mapped to exactly where it landed:

```
## Reconciliation manifest — <old name(s)> → docs/discovery/<new-slug>/

| Original | Status | Destination / reason |
|---|---|---|
| MULTI_VERTICAL_SCHEDULING.md §9 items 1-27 | Preserved verbatim | <new-slug>.md § Historical decisions |
| CAND-01 .. CAND-56 | Preserved, +2 new from gap analysis | <new-slug>_USECASES.md |
| MULTI_VERTICAL_SCHEDULING_ONBOARDING_PRESETS.md | Preserved as its own companion | <new-slug>_ONBOARDING_PRESETS.md |
| plan/journey/customer/prototypes/reservar-aula/*.html | Relocated (per your answer to Step 1's question) | docs/discovery/<new-slug>/prototype/customer-reservar-aula-*.html |
| <anything genuinely proposed for removal> | ⚠️ Proposed drop — needs your explicit confirmation | <why> |
```

Every row must resolve to "Preserved," "Merged" (with the merge target named), or "⚠️ Proposed drop" — nothing silently absent from the table. A `⚠️ Proposed drop` row is its own explicit question, answered before Step 7, never bundled into the general write-gate yes.

---

## Step 7 — Write / restructure, gated

Everything from Steps 1-6 is drafted in conversation first, never written to disk incrementally per-step. Apply the doc/config gate (CLAUDE.md §0): summarise the complete folder contents once and ask.

- **Mode A:** *"May I now create `docs/discovery/<slug>/` with this content?"*
- **Mode B:** present the reconciliation manifest alongside the ask: *"May I now restructure `<existing paths>` into `docs/discovery/<new-slug>/` per the reconciliation manifest above — moving `<old paths>` via `git mv`, applying `<N>` content fixes found during re-validation, and `<resolving/leaving>` the `plan/journey/` content per your earlier answer? Every item is accounted for as Preserved/Merged/Drop, above."* Use `git mv` for anything that already exists and is only relocating/renaming, not delete-and-recreate — this preserves file history as a second, independent safety net behind the manifest itself.

Write only after an explicit yes either way. Do not ask per-file.

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
