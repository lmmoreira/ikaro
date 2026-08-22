---
name: discovery-to-milestone
description: Promote a mature docs/discovery/ doc set into canonical documentation, then draft a dependency-sequenced milestone (or, for a large discovery, a sequenced set of milestones) of stories ready for /story-discovery. Scales from a small, single-context discovery to a large, multi-aggregate one: Phase A promotes discovery content into docs/04-USE_CASES.md, docs/02-DOMAIN_MODEL.md, docs/03-DOMAIN_EVENTS.md, docs/13-DATABASE_SCHEMA.md, docs/14-API_CONTRACTS.md, and other canonical docs, plus the real plan/journey/ prototype structure (per CLAUDE.md §15), promoted in logical clusters and independently verified via /docs-audit as each lands. Phase B checks whether the promoted scope is one milestone or several, sequences the promoted use cases into dependency-ordered waves, proactively works out milestone-level design/aggregate/database/performance/test-strategy decisions no single story can see on its own — scaled to how many aggregates are actually in play — and drafts each story with inline context and pre-decided architectural choices in the exact format /story-discovery parses. Never writes code.
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
3. **If the main discovery doc carries its own "resolved questions" / "historical decisions" / "promotion-finalization rules" section** (a large, heavily-iterated discovery doc typically does — a smaller one may not, and that's fine either way) — fold a second check into the same Explore-agent dispatch as item 2: for every item there, verify each companion doc (a use-cases doc, a data-model doc, an onboarding/preset doc) that touches the same topic actually reflects that final resolution, not an earlier draft the main doc has since superseded. This is the single highest-value check on a heavily-revised discovery doc: nothing later in this pipeline re-verifies a companion doc against the main doc's own supersession history — `/docs-audit`'s Step 2d dispatch (below) checks the *promoted canonical docs* against each other and against code, but by then a stale companion-doc fact may already have been copied in. A discovery doc that explicitly flags its own supersession risk (e.g. "keep this note only as history — item N is the implementation source") is telling you this check matters, not being unusually cautious.
4. Check whether a `plan/M0X-*.md` already exists for this discovery effort (partially drafted, abandoned, or superseded). If one exists, stop and ask the user how to proceed — do not silently create a second, competing milestone file for the same discovery doc.
5. Determine the next available milestone number: `ls plan/M*.md | grep -oE 'M[0-9]+' | sort -t'M' -k2 -n -u | tail -1`, then increment. Skip any number CLAUDE.md documents as reserved/special (e.g. `M115`).

---

## Step 1 — Batched open-questions round

Every discovery doc worth promoting has an explicit "Open Questions / Risks" section (or equivalent) — that's the whole point of a discovery-stage doc. Collect every such question, plus anything Step 0's staleness check surfaced, into one list.

**Also proactively add your own — don't limit this step to harvesting what's already written down.** A gap the discovery doc's own analysis didn't surface is still a gap. Step 3b names the specific categories worth actively hunting for once more context is available (design patterns, aggregates, database/schema, performance, test strategy) — some of that hunting belongs here too if it surfaces this early.

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

**Persist the Decisions log to a scratch file as it grows** — the session's scratchpad directory, not just this skill's own conversation state (no doc-gate ask needed; it's not a project file, and it's not part of the final deliverable — Step 6's milestone file is what actually needs approval). A large promotion runs Steps 0–6 as one long session touching many files; losing an early decision to context compaction before Step 6 ever writes the milestone file is a real risk at this scale, not a hypothetical one.

---

## Step 2 — Phase A: Promote into canonical documentation

Everything in this step is a **doc/config-gated write** (CLAUDE.md §0) — summarise the full cross-doc diff once, across every cluster (see 2-pre below), ask "May I now write these N changes across these M files?", write only after an explicit yes. Do not ask per-file, and do not ask per-cluster — the promotion is one coherent change, approved once.

### 2-pre. Group the promotion into clusters

Before writing anything, group the discovery's content into logical clusters — coherent sub-topics that can be promoted and verified as a unit (e.g. "Resource + core aggregate deltas," "Session/capacity model," "Waitlist + recurring enrollment + alerts"). A small, single-context discovery (Chatbot-sized) naturally collapses to **one cluster** — don't invent boundaries that aren't there. A large, multi-aggregate discovery (Multi-Vertical-Scheduling-sized) should split along the same boundaries its own taxonomy/aggregate-delta sections already suggest — don't invent a different grouping than the discovery doc's own structure implies.

These same cluster boundaries are also the natural candidate boundaries for a multi-milestone split (Step 3's shape checkpoint) — keep that in mind while grouping, but don't decide the milestone split here; that's a Phase B decision made once Phase A's actual promoted scope is known.

Execute clusters **sequentially**, not in parallel: write one cluster's changes (2a–2c below, whichever apply to that cluster's content), then run 2d's `/docs-audit` scoped to exactly that cluster before moving to the next. A finding in cluster 1 is cheaper to fix before cluster 2 is written on top of an assumption cluster 1 got wrong. Once every cluster has landed and passed its own scoped audit, run one final `/docs-audit` pass across everything promoted (2d) — this is what catches a cross-cluster contradiction no single cluster's own narrower audit could see.

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

**If a discovery's prototype work was already merged directly into an existing, shipped `plan/journey/` file** (rather than sitting cleanly in the discovery's own prototype folder) — this can happen when UX prototyping work lands ahead of formal promotion — item 5 above's "relocate" instruction does not apply as written: that file is not wholly new, and a blind move/rename would corrupt real, shipped content sitting alongside the new part. Before touching it:
1. Check whether the new content is already marked inline (a `(GAP)` / `GAP (<date>)` comment, or an equivalent marker the discovery doc's own promotion-status note describes) — if so, that marker *is* the seam; treat everything outside it as already-shipped and untouchable, and everything inside it as this cluster's new content to fold in place, not relocate.
2. If no inline marker exists, diff the file against its state before the merge (`git log -- <path>` to find the pre-merge commit) to find the seam yourself before editing.
3. Either way, run `/docs-audit` scoped to that specific journey path (its 3d shared-fragment and `dev-notes.md` consistency checks) after the merge lands, not just at the "confirm a clean baseline before touching any file" gate in step 1 — a merge-in-place is exactly the shape of edit most likely to silently break a cross-reference the pre-existing file relied on.

### 2d. Verify each cluster, then verify the whole — dispatch to `/docs-audit`, don't self-check

Do not self-verify Phase A's output, at either the cluster or the full-scope level. **Per cluster** (2-pre): dispatch `/docs-audit` scoped to exactly what that cluster touched — every canonical doc path from 2a/2b plus every journey path from 2c belonging to this cluster, comma-separated in one invocation (`docs-audit.md`'s scope resolution supports this directly — this is the reason that scope mode exists). **Once every cluster has landed:** dispatch one more `/docs-audit` call scoped to the *union* of every path touched across every cluster — the pass that catches a cross-cluster contradiction no single cluster's own narrower scope could see (e.g. cluster 2's event payload silently drifting from a field name cluster 1 already promoted). For a single-cluster (Chatbot-sized) promotion these collapse to the same one call, exactly as today.

This is the "is everything properly set" check — an explicit, independently-designed verification, not this skill grading its own work. It matters more here than after an ordinary edit: a freshly-promoted doc has no implemented code yet to deep-check against, so `/docs-audit`'s cross-doc consistency pass (does the new UC's event name match the new event doc entry, does the new aggregate's fields match the new schema entry) is what actually catches a promotion mistake.

- **Clean baseline, at both the per-cluster and final full-scope level** → proceed to Step 3.
- **Findings** → these are defects in this skill's own Phase A output. Resolve them through `/docs-audit`'s own Step 5 flow (it already applies the doc/config gate) — do not patch silently and continue.
- Do not proceed to Phase B until every cluster's own audit, and the final full-scope audit, are both clean.

---

## Step 3 — Phase B: Propose the wave-sequenced dependency graph, milestone-level design & test strategy

### Milestone-shape checkpoint — one milestone, or a sequenced set?

Before grouping stories at all: look at what Phase A actually promoted — how many UC-XXX entries, how many new/modified aggregates, how many clusters (2-pre). A small promotion (Chatbot-sized: a handful of UCs, one bounded context, purely additive) stays one milestone — proceed straight to 3a, no question needed.

A large promotion (many UCs, several new/modified aggregates, or a discovery doc whose own structure already frames parts of it as "ship this, learn, then extend" — e.g. a tie-break rule explicitly deferred to real usage data) is a real candidate for splitting into a **sequenced set of milestones** instead of one flat file. This isn't a size threshold to compute — it's a question to ask the user, using the same cluster boundaries 2-pre already established (they're the natural split points, since the discovery doc's own structure already organizes around them):

```
## One milestone, or several? — <discovery doc name>

Phase A promoted <N> UC-XXX entries and <M> new/modified aggregates across these clusters:
- <cluster 1 name> — <UC count>, <aggregate count>
- <cluster 2 name> — <UC count>, <aggregate count>
...

Proposed split: M<N> (<cluster 1>), M<N+1> (<cluster 2>), ... — each depends on the one before it.
Or: keep as one milestone, M<N>, with all clusters as waves inside it.

Which do you want?
```

If split: reserve the next N sequential milestone numbers now (Step 0's numbering rule, applied N times). Everything from 3a onward then runs once per milestone, each with its own wave sequence, its own 3b strategy findings, its own Step 4 story drafts, and its own gated write in Step 6 — wired `**Depends on:** M<N-1>` in its header, the same convention existing milestone files already use (e.g. `plan/M18-BOOKING-IMPROVEMENTS.md`'s own header). If kept as one milestone, every cluster becomes a wave (or a run of waves) inside the single file, same as today.

### 3a. Group stories and sequence waves

Group the now-canonical UC-XXX entries into candidate stories — a single UC commonly splits into a backend story, a BFF story, and a frontend story, matching how existing milestones are already structured. Do not default to one story per UC; size each story the way existing `plan/M0X-*.md` stories are sized (a `Complexity` field's worth of work, not a whole vertical slice).

Sequence into waves:
- **Wave 0 is always migration/backfill safety for existing tenants**, if the discovery doc touches any existing table or changes any existing behavior's default. This is non-negotiable given this repo's own Definition of Done migration discipline — sequencing it later risks discovering a backward-compatibility problem mid-milestone instead of before wave 1 starts.
- Backend/BFF-only stories in an early wave before any frontend story that depends on them — CLAUDE.md §10's existing rule, applied at milestone scope instead of restated per-story.
- Respect every dependency the Decisions log's answers implied (e.g. a BLOCKER answer that changes which aggregate owns a field changes which story must land first).

**A wave is a sequencing guarantee, not a concurrency-safety one** — two stories in the same wave can still depend on each other (e.g. S02→S03 both in Wave 1) or touch the same files; a wave only promises neither is blocked by an *earlier* wave. If the user wants to run stories from this milestone concurrently later, `/run-batch` applies its own stricter independence + non-overlapping-file check at run time — don't imply same-wave membership already makes a pair batch-safe.

### 3b. Milestone-level design, performance, aggregate & database strategy (proactive)

Scoped to what no single story can decide on its own, because it cuts across all of them — and proactive, not just reactive to what the discovery doc already flagged. `/story-discovery`'s 4q (and this skill's own Step 5 dry-run of it) already forces each *individual* story to name its own pattern and test plan; this is the milestone-wide equivalent, catching what per-story review structurally can't see:

- **Shared architectural pattern(s):** if multiple stories in this milestone will repeat the same kind of decision (e.g., every new resource type follows the same Strategy/Factory shape), decide it once here and record it as a Decisions log entry every relevant story cites — don't leave N stories to each independently reinvent or diverge on the same pattern.
- **Aggregate design consistency — a named pass per aggregate, not one generic bullet:** for every new/modified aggregate this milestone introduces, name its boundary and its invariants explicitly, then check it against every use case that touches it: is every cross-aggregate invariant assigned to the right aggregate — not split across two, forcing an unsafe two-phase update? Does any pair of stories in this milestone assume two separate aggregates must stay consistent within one transaction — a sign the aggregate boundary itself is wrong, not an implementation detail to patch around later? This scales with how many aggregates are actually in play — one aggregate is a quick pass; a dozen is the highest-leverage work in this whole step, since a wrong boundary here is wrong in every story that ever touches it, silently, and nothing downstream re-derives the boundary from scratch to catch it.
- **Database/schema consistency:** do new tables/columns follow CLAUDE.md §2's multi-tenancy invariants (`tenant_id` first in every composite index, composite FKs)? Is the migration ordering across the wave sequence actually safe (expand/contract, no story assuming a column exists before its owning migration's wave lands)? Are indexes actually planned for the query patterns the promoted UCs imply — not left for a later story to discover under load?
- **Backward-compatibility, when this milestone modifies existing behavior (not just adds new):** if Phase A's diff changed an existing aggregate/table/port's behavior rather than purely adding to it (check 2b's diff for this), state the non-regression contract explicitly and assign it to a named story with its own acceptance criteria — e.g. "every existing capacity-1/no-resource tenant's booking flow produces identical results before and after." Never leave this as an implicit assumption riding on the migration being backward-compatible. A purely additive discovery (Chatbot-sized) never triggers this bullet — skip it silently when nothing existing changed.
- **Performance/scalability from the aggregate load, not just one query:** does this milestone's overall shape — several stories reading/writing the same table, a new cross-context read pattern repeated across stories — create a load nobody sees from any single story's own test-coverage check? Name the concrete risk (N+1, missing index, unbounded result set at aggregate scale) and its mitigation now.
- **Milestone-level integration/E2E test plan:** name the "golden path" scenario(s) that span multiple stories in this milestone (e.g., "customer books a class → gets waitlisted → promoted → sees it in minha-conta"), and which story is responsible for actually implementing that spanning test. Every individual story's test plan can be airtight and the seams between them can still go untested — this decides where that coverage lives.
- **Proactively hunt for what the discovery doc itself didn't raise** — a missing edge case, an unconsidered performance implication, an aggregate boundary question, an integration seam. Don't limit this to harvesting Step 1's already-stated Open Questions; now that everything is promoted into canonical docs, actively look for something new the discovery doc's own analysis didn't surface.

Not everything here will have a clean answer, especially for a genuinely large discovery — tag exactly like Step 1 does: **BLOCKER** (must resolve before any story in the affected area is drafted) or **DEFERRABLE** (state an explicit default, carry it into the relevant stories' acceptance criteria as something to revisit, never silently baked in). Every resolved item here — whether decided immediately or via that BLOCKER/DEFERRABLE tagging — joins the same running Decisions log Step 1 started, so Step 4's "bake in pre-decisions" rule picks it up exactly like any other decision.

Render 3a and 3b together as one combined proposal — a mermaid dependency graph (this repo's existing convention in `plan/journey/` files) plus the milestone-level strategy findings — presented for sign-off **before** drafting any story body:

```
## Proposed milestone — M<N>-<NAME>

### Wave sequence
#### Wave 0 — Migration safety
- S01: Resource backfill migration (backend)

#### Wave 1 — Resource management
- S02: Resource aggregate + repository (backend) — depends on S01
- S03: Resource CRUD BFF endpoints — depends on S02
...

​```mermaid
graph TD
  S01 --> S02 --> S03
  ...
​```

### Milestone-level design & test strategy
- [BLOCKER] ...
- [DEFERRABLE] ...
- Shared pattern: <e.g. "all resource subtypes use Strategy, per Decisions log #4">
- Spanning E2E test: <scenario> — owned by <story ID>
```

Sequencing and cross-cutting strategy are both design decisions, not something to bury inside 30 story blocks the user has to reverse-engineer — wait for explicit confirmation or adjustment before Step 4.

---

## Step 4 — Draft each story

For every story in the confirmed wave sequence, write a `### M<N>-S<NN> — <title>` block using the **exact field set `/story-discovery`'s Step 1 already parses** — nothing here should require that skill to special-case a discovery-originated story:

- **Title, Agent target, Complexity**
- **Docs to load** — every canonical doc path (now real, from Step 2) + `§ Section` this story actually needs
- **Description** — full inline context pulled from the now-canonical docs, not a pointer back to the discovery doc. A reader should not need to open the discovery doc to understand this story.
- **Backend use case steps** / **Backend HTTP surface** / **BFF endpoint spec** — as detailed as an existing story's. **Backend HTTP surface is its own explicit line, not implied by the other two:** state whether this story needs a new backend-reachable HTTP endpoint (new or extended controller — exact shape deferred to `/story-discovery`, which will grep for the nearest existing precedent, e.g. `ServiceController`/`TenantSettingsController`) or reuses one that already exists, and name which. A BFF endpoint spec with no corresponding backend-surface line is exactly the gap that hit two consecutive M19 stories (S05, S06) — "the backend HTTP controller was entirely unspecified" — caught only later, at story-discovery, both times.
- **Acceptance criteria** — including, explicitly, any DEFERRABLE assumption from the Decisions log that this story's scope touches (state it as a criterion: "assumes FIFO tie-break per Decisions log #2 — not a hidden default")
- **Dependencies** — story IDs from this same milestone, per the Step 3 wave graph
- **Prototype references** — the real `plan/journey/<actor>/prototypes/<slug>/` path from Step 2c, for any frontend story
- **Files to create/modify** — enumerate real paths, for every story, without exception. `/run-batch`'s file-overlap safety check reads this field directly from the plan file to decide whether two stories are safe to implement concurrently — a story with this field silently missing isn't just an incomplete draft, it's a story `/run-batch` can't safety-check at all. For new files, follow the domain-slice conventions in CLAUDE.md §11 / `docs/REPOSITORY_STRUCTURE.md` exactly (which layer, which naming pattern). For modified files, **verify the path actually exists** by grepping the real codebase (spawn an Explore agent, same technique `/story-discovery`'s own Step 1 dependency-symbol check uses) — never state a modified-file path from memory or inference alone. For a story several waves out, treat this list as a best-effort snapshot, not a guarantee — `/story-discovery`'s own Step 1 re-verifies it against the live repo at implementation time and corrects it there if earlier waves have since changed the codebase; that re-check is the safety net, not a reason to skip stating it now.
- **New migration / i18n keys / env vars / feature flags** — flag explicitly if this story introduces any, per the fields `/story-discovery`'s Step 1 already extracts.

**Bake in pre-decisions, don't leave them as questions:** for anything the Decisions log settled, or that CLAUDE.md's architecture rules already dictate (which aggregate owns a field, whether a write needs `txManager.run()`, which existing VO a field should use, whether the new aggregate joins the outbox-draining pattern), state it as a fact in the story text. A story reaching `/story-discovery` with an open question that this skill already had the information to answer is a defect in this skill's output, not something to defer to that gate.

**Apply the NON-NEGOTIABLE principles while drafting, not after:** before finalizing each story, check it against the same lens as `/story-discovery`'s own 4o — does this story's design need multiple stacked safeguards where a simpler approach (an existing port/adapter, an existing pattern) would need none of it? Does it reuse what already exists rather than reinventing it? A story drafted with a workaround baked in guarantees rework the moment `/pr-review`'s Agent D catches it later — cheaper to not write it that way in the first place.

---

## Step 5 — Self-dry-run, then one independent structural pass

### 5a. Mentally run `/story-discovery`'s own checklist

For each drafted story, mentally run `/story-discovery`'s Step 4 checklist (4a–4q) against it before presenting anything to the user:
- Doc validity, UC completeness, state-machine consistency, event envelope completeness, multi-tenancy invariants, test-coverage readability, cross-context data access, API contract completeness, configuration/settings, conflicts with project standards, journey/prototype alignment, infrastructure/environment, i18n keys, migration/entity registration, engineering discipline (4o), stale-reference-sweep anticipation (4p), pattern & test-strategy lock-in (4q) — architectural pattern, concrete test/e2e coverage plan, and business-rule ambiguity all need to be resolved here too, not left for `/story-discovery` to catch, since a READY verdict now authorizes the entire autonomous implementation chain with no further per-step checkpoint (CLAUDE.md §9).
- **Mechanical field-completeness check, every story, no exceptions:** does it have a non-empty `Files to create/modify` and a `Backend HTTP surface` line (Step 4)? A story missing either isn't a judgment call to resolve here — it's a gap to go back and fill before this step is done.

Fix anything catchable now. This is the same "shift left" principle applied throughout this repo's other gates — a gap caught here costs nothing; the same gap caught during a real `/story-discovery` run costs a round-trip.

### 5b. Dispatch `/docs-audit` for the milestone file itself

Once every story in this milestone-shape unit is drafted and 5a's self-dry-run is clean, dispatch `/docs-audit M<N>` — its 3c active-milestone self-consistency check (forward-referencing dependencies, duplicate story headers, canonical-file uniqueness) is a genuinely independent pass over exactly this file, the same "don't self-grade" discipline Phase A's Step 2d already applies. Mentally self-checking 4a–4q (5a above) is appropriate for per-story qualitative judgment, but it's still the same session that just wrote the stories — this dispatch is what catches what that session's own blind spots can't. For a split (multi-milestone) shape, run this once per milestone file once its own stories are drafted, not only at the end of the whole sequence.

### 5c. Surface likely-independent stories (preview only, not authoritative)

Now that every story has real `Dependencies` and `Files to create/modify` (Step 4), compute — within each wave — which pairs/groups have zero dependency edge and zero file overlap, and list them as a courtesy preview: "likely `/run-batch` candidates." This directly anticipates `/run-batch`'s own check using this draft's own data, but it is explicitly **not** authoritative — `/run-batch` re-derives it live, against the real plan file and real repo state, at the moment the user actually wants to run a batch. A pairing that looks independent here can stop being so once an earlier wave's real implementation touches a file this draft didn't anticipate — the same staleness Step 4's own "best-effort snapshot" note already warns about for far-out waves. Label it clearly as a preview wherever it's shown (Step 6), never as a green light to skip `/run-batch`'s own check.

---

## Step 6 — Present the milestone draft

The milestone file's own header must follow the exact shape every existing `plan/M0X-*.md` file uses — mirror `plan/M18-BOOKING-IMPROVEMENTS.md` or `plan/M19-HOTSITE-CHATBOT.md` literally, not just "in spirit": `**Phase:**`, `**Goal:**`, `**Depends on:**`, `**Blocks:**`, `**Design rationale:**` (pointing at the discovery doc, kept as the permanent *why* per Step 2b), a `**Non-Goals**` section (what the discovery doc explicitly deferred/dropped — pull straight from its own Non-Goals/Out-of-scope section), then a `## Build order` table + mermaid graph, before the first story block. This isn't optional polish — it's the same structure every downstream reader (a future `/docs-audit M0X` pass, a future `/story-discovery` session loading "the matching `plan/<milestone>_IMPLEMENTATION_DETAILS_IA.md`") expects to find.

```
## Milestone draft — M<N>-<NAME>

### Phase A promotion summary
- N new UC-XXX entries in docs/04-USE_CASES.md
- Domain model / events / schema / contracts / settings / error-catalog changes: <list of docs touched>
- Journeys created/updated: <list of plan/journey/<actor>/<slug>.md paths>

### Phase B milestone
<full wave-sequenced story list, dependency graph>

### Likely-independent stories (preview — not authoritative)
<per-wave groupings with zero dependency edge / zero file overlap, from Step 5c — "likely /run-batch candidates"; always subject to /run-batch's own live check at run time>

### Milestone-level design & test strategy
<shared patterns decided, aggregate/database consistency findings, performance risks + mitigations, spanning E2E test ownership — from Step 3b>

### Self-dry-run findings
<anything Step 5 caught and fixed, or flagged as a known open item for that story's own /story-discovery pass>
```

If the Step 3 shape checkpoint produced a **sequenced set of milestones**, present each with its own full block in this format, in the same message — the user is approving the whole sequence, not one file at a time — and write only after one explicit yes covering all of them: *"May I now create `plan/M<N>-<NAME>.md` through `plan/M<N+k>-<NAME>.md` with this content?"* Otherwise, apply the doc/config gate as today: summarise, ask *"May I now create `plan/M<N>-<NAME>.md` with this content?"*, write only after an explicit yes.

---

## Step 7 — Handoff

```
Milestone M<N>-<NAME> is drafted — <N> stories across <W> waves.

Next: run `/story-discovery M<N>-S01` for the first story, same as any other story.
Every promoted doc (UC entries, domain model, events, schema, contracts, journeys) is now
real and canonical — nothing downstream needs to know this milestone originated from a
discovery doc.
```

If the shape checkpoint produced a sequenced set of milestones, only the first one's `S01` is the actual next step — later milestones' `**Depends on:** M<N-1>` header line is what stops anyone from starting them early; say so explicitly rather than listing every milestone's `S01` as if they're all ready now.

If the discovery doc's own folder (`docs/discovery/<NAME>/`) still holds content not fully promoted (deferred non-goals, the deeper rationale sections), leave it in place — it remains the permanent *why* reference, not something to delete once the milestone exists.
