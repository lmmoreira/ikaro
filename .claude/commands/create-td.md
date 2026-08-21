---
name: create-td
description: Draft a new standalone TD (tech-debt) document, or add a new standardized story to an existing multi-story TD, using the same structured field set /story-discovery and /run-batch already parse for milestone stories (Docs to load, Dependencies, Files to create/modify, Agent target, Complexity) alongside the TD-specific narrative sections (Problem, Chosen approach, etc.) that don't apply to milestone stories. Never writes code.
metadata:
  short-description: Standardize a new TD or TD story
---

Draft a new standalone TD (`td/TDNN-<NAME>.md`), or add a new story to an existing multi-story TD, in a single standardized shape — so a TD-originated story is exactly as parseable by `/story-discovery` and exactly as batchable by `/run-batch` as a `/discovery-to-milestone`-drafted milestone story, while keeping the narrative sections (Problem, Chosen approach, Method, Confidence key) that are specific to tech-debt work and don't apply to milestone stories.

> **HARD RULE — NO CODE CHANGES:** This skill only reads code (to verify claims about "today's behavior") and writes `.md` files under `td/`. It never writes or modifies any `.ts`, `.js`, or source/test/config file, and it never runs `/story-discovery` itself — same boundary as `/discovery-to-milestone`.

Argument: `$ARGUMENTS` — either:
- A problem/evidence description for a **brand-new TD** (e.g. "the OTel batch processor silently drops spans under X condition, found in prod logs")
- An existing TD ID plus a description, to **append a new story to that TD** (e.g. `TD37: add a story enforcing Y`)

---

## Step 0 — Resolve mode and number

**Append mode** — `$ARGUMENTS` names an existing `td/TDNN-*.md`:
- Read the file in full. Confirm it's a multi-story TD (has `### Story N —` headings) — a single-scope TD (one `## Status` block, no story subdivision, e.g. TD27) can't receive an appended story; if the user wants to add scope to one of those, ask whether to convert it to multi-story first (rename the existing single scope as "Story 0", renumber) rather than silently restructuring it.
- Determine the next story number (`N+1` after the highest existing `### Story N —`).

**New-TD mode** — otherwise:
- Determine the next available TD number: `ls td/TD*.md | grep -oE 'TD[0-9]+' | sort -t'D' -k2 -n -u | tail -1`, then increment. Skip any number already claimed by a combined file (e.g. `TD-18-19-20-BAD-SMELL-VIOLAVIONS.md`, `TD-21-...`).
- Derive a descriptive `<NAME>` from the problem statement, matching the existing convention exactly: all-caps, kebab-case, matches the file's own title (e.g. `TD37-CI-ARCHITECTURE-VALIDATION-HARDENING.md`).

---

## Step 1 — Verify the premise before drafting anything

A TD reasoning from a stale claim about "what the code does today" produces a wrong remediation — same principle `/discovery-to-milestone`'s Step 0 applies to a discovery doc. Spawn an Explore agent to verify every factual claim in `$ARGUMENTS` (a specific bug, a specific file/behavior, a specific incident) against the actual current codebase. Report any drift found before continuing.

Also check whether this problem is already tracked: grep `td/*.md` and `docs/ANTI_PATTERNS.md` for the same issue under a different name before creating a duplicate.

---

## Step 2 — Decide single-scope vs. multi-story

Don't default to a multi-story shape for a TD that's really one fix, and don't cram a real dependency sequence into one oversized story. Use the same judgment `/discovery-to-milestone` Step 3 applies when splitting UCs into stories:
- **Single-scope** (TD27 shape): one coherent fix, one PR, no internal sequencing.
- **Multi-story** (TD37 shape): the fix decomposes into a dependency-ordered sequence — foundation work before rules that build on it, or independent-but-related hardening items that can land as separate PRs over time.

If multi-story, sequence the stories and render a mermaid dependency graph, presented for sign-off **before** drafting any story body — identical mechanic to `/discovery-to-milestone` Step 3, applied at TD scope instead of milestone scope:

```
## Proposed TD — TD<N>-<NAME>

### Stories
- Story 0: <title> — foundation, no dependencies
- Story 1: <title> — depends on Story 0
- Story 2: <title> — depends on Story 0 (independent of Story 1)

​```mermaid
graph TD
  S0 --> S1
  S0 --> S2
​```

Proceed, or adjust the sequencing?
```

Wait for confirmation before Step 4.

---

## Step 3 — Standard `## Status` block

One canonical field set — resolves the drift between TD37's and TD27's slightly different `## Status` shapes so future TDs don't have to guess which fields apply:

```
## Status
- **Type**: Technical Debt / <category — e.g. "CI Hardening", "Security", "Infrastructure">
- **Priority**: <High|Medium|Low> (<one-line reason — active exploit vs. auditability gap vs. nice-to-have>)
- **Context**: <bounded contexts / apps / packages this touches>
- **Created**: <date>
- **Discovered**: <how/where this was found, if not authored fresh — a security review, an incident, a docs-audit>
- **State** (single-scope) or **Decision status** (multi-story): current status; for multi-story, state readiness for discovery per story (e.g. "Ready for discovery and implementation in the dependency order below; individual stories still begin with /story-discovery")
- **Related**: <other TD/doc cross-references>
```

---

## Step 4 — `## Problem` (mandatory)

Prose describing the gap and its evidence — concrete incidents, PR numbers, or file:line, not a hypothetical. Include a "Why this matters" subsection if the risk isn't self-evident from the problem statement alone (TD27's shape) — skip it if the problem statement already makes the stakes clear (TD37's shape folds this into Problem directly).

If a chosen remediation approach is already decided (not left for `/story-discovery` to resolve), add `## Chosen approach (decided via story-discovery, <date>)` or, if decided in this session instead, state that explicitly — don't imply story-discovery already ran when it didn't.

---

## Step 5 — Draft each story using `/story-discovery`'s own parseable field set

This is the actual standardization: every story below carries the same structured fields a `/discovery-to-milestone`-drafted milestone story gets (`story-discovery.md`'s Step 1 already extracts these), not prose-and-acceptance-criteria-only the way existing TD stories do today:

```
### Story <N> — <title> [optional confidence marker — see below] [status once known]

**Agent target**: <backend-ts | bff-ts | frontend-ts | web-ts | devops>
**Complexity**: <S | M | L>
**Docs to load**: <every doc path + § section this story actually needs>
**Dependencies**: <other story IDs within this TD, or a cross-TD/cross-milestone story ID if genuinely applicable — none if foundational>
**Files to create/modify**: <real paths — verify modified-file paths actually exist via Explore agent, same discipline `/discovery-to-milestone` Step 4 requires; never state one from memory>

<description — the prose explaining the mechanism, same depth as an existing TD story>

**Acceptance criteria**:
- [ ] ...
```

**Confidence marker** (optional, adopt only if this TD's own scope benefits from it — TD37's own convention, not mandatory for every TD): 🔴 proven recurring failure / 🟡 documented-but-unenforced rule / ⚪ exploratory, ships non-blocking first.

**Bake in pre-decisions, don't leave them as open questions** — same rule `/discovery-to-milestone` Step 4 applies: anything already decided in Steps 1–4 above, or already dictated by CLAUDE.md's architecture rules, gets stated as fact here, not deferred to `/story-discovery` to re-derive.

---

## Step 6 — Self-dry-run `/story-discovery`'s checklist

For each drafted story, mentally run `/story-discovery`'s Step 4 checklist (4a–4q) against it before presenting to the user — same "shift left" principle as `/discovery-to-milestone` Step 5. Pay particular attention to 4o (no workarounds/improvisation/mounting complexity — a TD fixing a root-cause problem must not itself bake in a workaround) and 4q (pattern & test-strategy lock-in — a TD story needs the same upfront pattern/test-plan decision a milestone story now gets, per the 2026-08-21 process redesign).

---

## Step 7 — Present and write

```
## TD draft — TD<N>-<NAME>

### Status block
<full block>

### Problem
<full prose>

### Stories (or single Acceptance Criteria block, if single-scope)
<full draft>

### Self-dry-run findings
<anything Step 6 caught and fixed, or flagged as an open item for /story-discovery to resolve>
```

Apply the doc/config gate: summarise, ask *"May I now create `td/TD<N>-<NAME>.md`?"* (or *"...append Story `<N>` to `td/TD<N>-<NAME>.md`?"* in append mode), write only after an explicit yes.

---

## Step 8 — Handoff

```
TD<N>-<NAME> is drafted — <1 story | N stories across the sequence above>.

Next: run `/story-discovery TD<N>` (single-scope) or `/story-discovery TD<N>` for Story 0
first (multi-story), same as any other TD.
```
