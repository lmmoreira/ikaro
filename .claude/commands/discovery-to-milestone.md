---
name: discovery-to-milestone
description: Promote a mature docs/discovery/ doc set into canonical documentation, then draft a dependency-sequenced milestone of stories ready for /story-discovery. Phase A promotes discovery content into docs/04-USE_CASES.md, docs/02-DOMAIN_MODEL.md, docs/03-DOMAIN_EVENTS.md, docs/13-DATABASE_SCHEMA.md, docs/14-API_CONTRACTS.md, and other canonical docs, plus the real plan/journey/ prototype structure (per CLAUDE.md §15). Phase B sequences the promoted use cases into dependency-ordered waves and drafts each story with real file paths, inline context, and pre-decided architectural choices, in the exact format /story-discovery parses. Never writes code.
metadata:
  short-description: Promote discovery docs into a sequenced milestone
---

Promote a mature `docs/discovery/` doc set into canonical documentation, then draft a dependency-sequenced milestone (`plan/M0X-<NAME>.md`) of fully-specified stories ready for `/story-discovery`.

> **HARD RULE — NO CODE CHANGES:** This skill only reads code and writes documentation/plan files (`.md`). It NEVER writes or modifies any `.ts`, `.js`, or source/test/config file. It also never runs `/story-discovery` itself — it produces stories *for* that skill to later validate, one at a time, through the normal workflow.

> **AGENT RULE:** Never invoke this skill autonomously. A discovery doc represents real design work — ask the user: *"Ready to promote `<discovery-doc>` into a milestone? This will touch several canonical docs and (if applicable) plan/journey/ files before any story is drafted."* Wait for explicit yes.

Argument: `$ARGUMENTS` — path to a discovery doc or folder, e.g. `docs/discovery/MULTI_VERTICAL_SCHEDULING.md`.

---

## Step 0 — Read everything, check it isn't already stale

1. Read the main discovery doc in full, plus every companion doc it names (a data-model doc, a candidate-use-cases doc, a prototype folder's `dev-notes.md`/`index.html`).
2. Discovery docs go stale exactly like any other doc — spawn an Explore agent to verify the doc's claims about "today's model" (whatever it says the current codebase does before its proposed change) against the actual current code. Report any drift found before proceeding — a discovery doc reasoning from a stale premise produces a milestone built on a wrong assumption.
3. Check whether a `plan/M0X-*.md` already exists for this discovery effort (partially drafted, abandoned, or superseded). If one exists, stop and ask the user how to proceed — do not silently create a second, competing milestone file for the same discovery doc.
4. Determine the next available milestone number: `ls plan/M*.md | grep -oE 'M[0-9]+' | sort -t'M' -k2 -n -u | tail -1`, then increment. Skip any number CLAUDE.md documents as reserved/special (e.g. `M115`).

---

## Step 1 — Batched open-questions round

Every discovery doc worth promoting has an explicit "Open Questions / Risks" section (or equivalent) — that's the whole point of a discovery-stage doc. Collect every such question, plus anything Step 0's staleness check surfaced, into one list.

Tag each:
- **BLOCKER** — no story in the affected area can be sequenced until this is answered (e.g. a question that changes which aggregates exist, or a state-machine shape).
- **DEFERRABLE** — a story can proceed with an explicit, stated default; the assumption gets written into that story's own acceptance criteria as something to revisit, not silently baked in as if it were settled.

Present all at once, grouped by theme, mirroring `/story-discovery`'s own Step 6 format:

```
## Open questions before promotion — <discovery doc name>

Please answer all at once — I'll wait for one reply before touching any canonical doc.

**Resource backfill**
1. [BLOCKER] Every existing tenant gets an explicit LOCATION Resource row at migration time, or does resourceId=null stay a permanent sentinel? This gates every other wave — answer first.

**Waitlist**
2. [DEFERRABLE] Tie-breaking when two staff are eligible for AUTO_ANY — least-recently-booked, round robin? Default: FIFO by staff creation order, revisit once real usage data exists.
```

Wait for the user's single reply. Record every answer in a **Decisions log** — a running list this skill carries through Steps 2–4. Nothing downstream re-asks a question already answered here; every story that touches a decided point cites the decision instead of re-litigating it.

---

## Step 2 — Phase A: Promote into canonical documentation

Everything in this step is a **doc/config-gated write** (CLAUDE.md §0) — summarise the full cross-doc diff once, ask "May I now write these N changes across these M files?", write only after an explicit yes. Do not ask per-file; the promotion is one coherent change.

### 2a. Candidate use cases → real UC-XXX entries

For each candidate use case (`CAND-XX` or equivalent) the Decisions log didn't cut, draft a real entry in `docs/04-USE_CASES.md`, in the file's existing field format (summary table row + detail section: actor, main flow, alt flows). Assign the next available `UC-XXX` numbers — check CLAUDE.md §6 first for any trap/superseded/reserved numbers to skip. A discovery doc that already claims to mirror the UC field format (many will, since that's good discovery-doc practice) makes this closer to a format-conformance pass than a rewrite — don't invent new structure where the discovery doc already has the right shape.

### 2b. Domain model, events, schema, contracts, settings, errors

Using `/docs-audit`'s own "deep-check docs" bucketing as the checklist (not a fresh list invented here), fold the discovery doc's content into whichever of these actually apply:
- `docs/02-DOMAIN_MODEL.md` — new/modified aggregates
- `docs/03-DOMAIN_EVENTS.md` — new domain events, full payload definitions
- `docs/13-DATABASE_SCHEMA.md` — new tables, modified tables, migration ordering
- `docs/14-API_CONTRACTS.md` — new REST endpoints implied by the promoted UCs
- `docs/05-BOUNDED_CONTEXTS.md` — if a new event gets cross-context consumers (check whether the discovery doc says something mirrors an existing event's consumer list, e.g. "mirrors BookingCompleted's consumers")
- `docs/21-TENANTS_SETTINGS_SCHEMA.md` — any settings key added, moved, or deprecated
- `docs/25-ERROR_CATALOG.md` — new RFC 9457 error codes
- `docs/ENGINEERING_RULES.md` — a genuinely new critical invariant the discovery doc establishes (not every detail — same bar as everything already in that file)

The discovery doc's own deeper rationale (a taxonomy, a worked comparison of alternatives, the "why" behind a modeling choice) does **not** need to migrate word-for-word into these canonical docs — same principle as `docs/ENGINEERING_RULES.md` holding full incident narratives while CLAUDE.md keeps only the rule. Canonical docs get the *what*; the discovery doc stays as the permanent *why*, referenced by path, not deleted or archived once promoted (it's still real project history, not a stale bootstrap doc).

### 2c. Journeys and prototypes — respect CLAUDE.md §15's HARD STOP exactly

For each actor whose flow is new or materially changes:

1. Run `/docs-audit` and confirm a clean baseline **before touching any `plan/journey/` file** — this is non-negotiable per §15, not a suggestion.
2. Write `plan/journey/<actor>/<slug>.md` — the journey spec.
3. Update `plan/journey/<actor>/use-cases.md`.
4. Update `plan/journey/README.md`'s index.
5. **Only then** move the discovery prototype's screens for that actor into `plan/journey/<actor>/prototypes/<slug>/`. This is a **relocation of already-built, already-validated HTML**, not a rebuild — preserve the existing screens, `dev-notes.md` content, and `index.html` structure; adapt paths/naming to the canonical per-actor convention (`plan/journey/README.md` documents the exact folder shape, naming convention for lettered variants, and CSS gotchas — load it before touching any file here).

A single discovery doc's prototype folder commonly covers multiple actors in one flat folder (as this repo's `docs/discovery/*/prototype/` structure does, with `customer-*`/`manager-*`/`staff-*`/`public-*` prefixes) — this step is what splits that into the real per-actor journey structure the rest of the pipeline expects.

### 2d. Verify the promotion — dispatch to `/docs-audit`, don't self-check

Do not self-verify Phase A's output. Dispatch `/docs-audit` scoped to exactly what Phase A touched: every canonical doc path from 2a/2b plus every journey path from 2c, comma-separated in one invocation (`docs-audit.md`'s scope resolution supports this directly — this is the reason that scope mode exists). This is the "is everything properly set" check — an explicit, independently-designed verification, not this skill grading its own work. It matters more here than after an ordinary edit: a freshly-promoted doc has no implemented code yet to deep-check against, so `/docs-audit`'s cross-doc consistency pass (does the new UC's event name match the new event doc entry, does the new aggregate's fields match the new schema entry) is what actually catches a promotion mistake.

- **Clean baseline** → proceed to Step 3.
- **Findings** → these are defects in this skill's own Phase A output. Resolve them through `/docs-audit`'s own Step 5 flow (it already applies the doc/config gate) — do not patch silently and continue.
- Do not proceed to Phase B until `/docs-audit`'s own verdict is clean.

---

## Step 3 — Phase B: Propose the wave-sequenced dependency graph

Group the now-canonical UC-XXX entries into candidate stories — a single UC commonly splits into a backend story, a BFF story, and a frontend story, matching how existing milestones are already structured. Do not default to one story per UC; size each story the way existing `plan/M0X-*.md` stories are sized (a `Complexity` field's worth of work, not a whole vertical slice).

Sequence into waves:
- **Wave 0 is always migration/backfill safety for existing tenants**, if the discovery doc touches any existing table or changes any existing behavior's default. This is non-negotiable given this repo's own Definition of Done migration discipline — sequencing it later risks discovering a backward-compatibility problem mid-milestone instead of before wave 1 starts.
- Backend/BFF-only stories in an early wave before any frontend story that depends on them — CLAUDE.md §10's existing rule, applied at milestone scope instead of restated per-story.
- Respect every dependency the Decisions log's answers implied (e.g. a BLOCKER answer that changes which aggregate owns a field changes which story must land first).

Render the waves as a mermaid dependency graph (this repo's existing convention in `plan/journey/` files) and present it for user sign-off **before** drafting any story body:

```
## Proposed milestone — M<N>-<NAME>

### Wave 0 — Migration safety
- S01: Resource backfill migration (backend)

### Wave 1 — Resource management
- S02: Resource aggregate + repository (backend) — depends on S01
- S03: Resource CRUD BFF endpoints — depends on S02
...

​```mermaid
graph TD
  S01 --> S02 --> S03
  ...
​```
```

Sequencing is a design decision, not something to bury inside 30 story blocks the user has to reverse-engineer the ordering from — wait for explicit confirmation or adjustment before Step 4.

**A wave is a sequencing guarantee, not a concurrency-safety one** — two stories in the same wave can still depend on each other (S02→S03 above, both in Wave 1) or touch the same files; a wave only promises neither is blocked by an *earlier* wave. If the user wants to run stories from this milestone concurrently later, `/run-batch` applies its own stricter independence + non-overlapping-file check at run time — don't imply same-wave membership already makes a pair batch-safe.

---

## Step 4 — Draft each story

For every story in the confirmed wave sequence, write a `### M<N>-S<NN> — <title>` block using the **exact field set `/story-discovery`'s Step 1 already parses** — nothing here should require that skill to special-case a discovery-originated story:

- **Title, Agent target, Complexity**
- **Docs to load** — every canonical doc path (now real, from Step 2) + `§ Section` this story actually needs
- **Description** — full inline context pulled from the now-canonical docs, not a pointer back to the discovery doc. A reader should not need to open the discovery doc to understand this story.
- **Backend use case steps** / **BFF endpoint spec** — as detailed as an existing story's
- **Acceptance criteria** — including, explicitly, any DEFERRABLE assumption from the Decisions log that this story's scope touches (state it as a criterion: "assumes FIFO tie-break per Decisions log #2 — not a hidden default")
- **Dependencies** — story IDs from this same milestone, per the Step 3 wave graph
- **Prototype references** — the real `plan/journey/<actor>/prototypes/<slug>/` path from Step 2c, for any frontend story
- **Files to create/modify** — enumerate real paths. For new files, follow the domain-slice conventions in CLAUDE.md §11 / `docs/REPOSITORY_STRUCTURE.md` exactly (which layer, which naming pattern). For modified files, **verify the path actually exists** by grepping the real codebase (spawn an Explore agent, same technique `/story-discovery`'s own Step 1 dependency-symbol check uses) — never state a modified-file path from memory or inference alone.
- **New migration / i18n keys / env vars / feature flags** — flag explicitly if this story introduces any, per the fields `/story-discovery`'s Step 1 already extracts.

**Bake in pre-decisions, don't leave them as questions:** for anything the Decisions log settled, or that CLAUDE.md's architecture rules already dictate (which aggregate owns a field, whether a write needs `txManager.run()`, which existing VO a field should use, whether the new aggregate joins the outbox-draining pattern), state it as a fact in the story text. A story reaching `/story-discovery` with an open question that this skill already had the information to answer is a defect in this skill's output, not something to defer to that gate.

**Apply the NON-NEGOTIABLE principles while drafting, not after:** before finalizing each story, check it against the same lens as `/story-discovery`'s own 4o — does this story's design need multiple stacked safeguards where a simpler approach (an existing port/adapter, an existing pattern) would need none of it? Does it reuse what already exists rather than reinventing it? A story drafted with a workaround baked in guarantees rework the moment `/pr-review`'s Agent D catches it later — cheaper to not write it that way in the first place.

---

## Step 5 — Self-dry-run `/story-discovery`'s own checklist

For each drafted story, mentally run `/story-discovery`'s Step 4 checklist (4a–4q) against it before presenting anything to the user:
- Doc validity, UC completeness, state-machine consistency, event envelope completeness, multi-tenancy invariants, test-coverage readability, cross-context data access, API contract completeness, configuration/settings, conflicts with project standards, journey/prototype alignment, infrastructure/environment, i18n keys, migration/entity registration, engineering discipline (4o), stale-reference-sweep anticipation (4p), pattern & test-strategy lock-in (4q) — architectural pattern, concrete test/e2e coverage plan, and business-rule ambiguity all need to be resolved here too, not left for `/story-discovery` to catch, since a READY verdict now authorizes the entire autonomous implementation chain with no further per-step checkpoint (CLAUDE.md §9).

Fix anything catchable now. This is the same "shift left" principle applied throughout this repo's other gates — a gap caught here costs nothing; the same gap caught during a real `/story-discovery` run costs a round-trip.

---

## Step 6 — Present the milestone draft

```
## Milestone draft — M<N>-<NAME>

### Phase A promotion summary
- N new UC-XXX entries in docs/04-USE_CASES.md
- Domain model / events / schema / contracts / settings / error-catalog changes: <list of docs touched>
- Journeys created/updated: <list of plan/journey/<actor>/<slug>.md paths>

### Phase B milestone
<full wave-sequenced story list, dependency graph>

### Self-dry-run findings
<anything Step 5 caught and fixed, or flagged as a known open item for that story's own /story-discovery pass>
```

Apply the doc/config gate: summarise, ask *"May I now create `plan/M<N>-<NAME>.md` with this content?"*, write only after an explicit yes.

---

## Step 7 — Handoff

```
Milestone M<N>-<NAME> is drafted — <N> stories across <W> waves.

Next: run `/story-discovery M<N>-S01` for the first story, same as any other story.
Every promoted doc (UC entries, domain model, events, schema, contracts, journeys) is now
real and canonical — nothing downstream needs to know this milestone originated from a
discovery doc.
```

If the discovery doc's own folder (`docs/discovery/<NAME>/`) still holds content not fully promoted (deferred non-goals, the deeper rationale sections), leave it in place — it remains the permanent *why* reference, not something to delete once the milestone exists.
