---
name: create-story
description: Append one new, standardized story to an existing TD (td/TDNN-*.md) or an existing milestone (plan/M0X-*.md) — for a small, freshly identified gap or live-bug fix that continues an already-shipping container, with no discovery doc and no new-container ceremony behind it. Drafts to the canonical docs/STORY_SCHEMA.md shape — the same one /story-discovery parses and /run-batch batches. Never writes code.
metadata:
  short-description: Append a new story to an existing TD or milestone
---

Append one new story to an existing `td/TDNN-*.md` or `plan/M0X-*.md` file, in the canonical shape `docs/STORY_SCHEMA.md` defines — so it's exactly as parseable by `/story-discovery` and exactly as batchable by `/run-batch` as any other story, regardless of which of the three producer skills wrote it.

This is the narrow middle case between `/create-td` (new TD, from scratch) and `/discovery-to-milestone` (new milestone, promoted from a `docs/discovery/` doc): a single item identified against a container that already exists — a live bug found in production, a gap spotted after the fact, a follow-up hardening item — with no discovery doc behind it and no new wave-sequencing to do. `M20-S14`/`M20-S15` (a live staging egress bug, then a live CSP soft-navigation bug, both continuing an otherwise-complete M20) are the shape this exists for.

> **HARD RULE — NO CODE CHANGES:** This skill only reads code (to verify claims about "today's behavior") and appends to one `.md` file under `td/` or `plan/`. It never writes or modifies any `.ts`, `.js`, or source/test/config file, and it never runs `/story-discovery` itself — same boundary as `/create-td` and `/discovery-to-milestone`.

Argument: `$ARGUMENTS` — an existing container ID plus a description of the new story, e.g. `M20: fix Turnstile widget stuck on soft navigation` or `TD37: add a story enforcing Y`.

---

## Step 0 — Resolve target file and next story ID

Determine container type from the ID shape:

- **`M<N>` or `M<N>-S<NN>`** → milestone. Locate `plan/<milestone>-*.md` (exclude `_IMPLEMENTATION_DETAILS_*` files). Exactly one match expected — if zero or more than one, stop and ask which file is canonical.
  - Determine the next story number: `N+1` after the highest existing `M<milestone>-S<NN>` heading in the file.
  - **If the milestone is already fully `✅ Done`** (per `CLAUDE.md` §9 Step 12, its own `_IMPLEMENTATION_DETAILS_IA.md`/`_DEVELOPER.md` may already exist): note this explicitly to the user — appending a story here means those wrap-up docs go stale again and will need `mark-done`'s milestone-complete stale-doc sweep once this new story lands. This is informational, not a blocker.

- **`TD<N>`** → TD. Locate `td/TD<N>-*.md`. Read the file in full. Confirm it's a multi-story TD (has `Story N —` headings — check which level this specific file actually uses: existing TDs mix `###` (TD01, TD-18-19-20, TD-21, TD31, TD37) and `####` (TD23, TD30); match the file's own existing level, never force three `#` onto a TD that already uses four). A single-scope TD (one `## Status` block, no story subdivision, e.g. TD27) can't receive an appended story; if the user wants to add scope to one of those, ask whether to convert it to multi-story first (rename the existing single scope as "Story 0", renumber) rather than silently restructuring it.
  - Determine the next story number (`N+1` after the highest existing `Story N —` heading, at whatever level this file uses).

If the ID matches neither shape, or no file is found, stop and ask the user to confirm the target — this skill never creates a new container (that's `/create-td` or `/discovery-to-milestone`'s job).

---

## Step 1 — Verify the premise before drafting anything

A story reasoning from a stale claim about "what the code does today" produces a wrong fix — same principle `/create-td` Step 1 and `/discovery-to-milestone` Step 0 apply. Spawn an Explore agent to verify every factual claim in `$ARGUMENTS` (a specific bug, a specific file/behavior, a specific incident) against the actual current codebase. Report any drift found before continuing.

Also check whether this is already tracked: grep the target file itself, `td/*.md`, and `docs/ANTI_PATTERNS.md` for the same issue under a different name before creating a duplicate. If the described gap looks more like a standalone tech-debt item than a natural continuation of the named container (e.g. a `TD37`-append request that's actually unrelated to CI-architecture-validation), flag that mismatch to the user rather than silently filing it where asked — the container choice is the user's call, but a clearly wrong fit is worth a sanity check before writing.

---

## Step 2 — Draft the story using the canonical schema

**Load `docs/STORY_SCHEMA.md` now and draft the story to its skeleton exactly** — don't restate the field list here.

- **Dependencies** — checked against this container's own existing stories only (e.g. `M20-S15` depending on `M20-S05`/`M20-S09`), not a fresh wave-sequencing exercise across the whole container.
- **Discovered / Root cause** — very likely applicable here, since this skill's typical trigger is a live bug or a freshly spotted gap rather than greenfield scope; still conditional per the schema, not mandatory.
- **Confidence marker** — TD-only convention (per the schema), omit entirely for a milestone target.
- **Bake in pre-decisions, don't leave them as open questions** — same rule `/create-td` Step 5 and `/discovery-to-milestone` Step 4 apply: anything already decided in Steps 0–2 above, or already dictated by `CLAUDE.md`'s architecture rules, gets stated as fact here, not deferred to `/story-discovery` to re-derive.
- Heading level/format matches the container's own existing convention exactly (TD: whatever level Step 0 identified; milestone: `### M<N>-S<NN> — <title>`, matching every sibling story in the file).

---

## Step 3 — Self-dry-run `/story-discovery`'s checklist

Mentally run `/story-discovery`'s Step 4 checklist (4a–4q) against the drafted story before presenting it — same "shift left" principle as `/create-td` Step 6 and `/discovery-to-milestone` Step 5a. Pay particular attention to 4o (no workarounds/improvisation/mounting complexity) and 4q (pattern & test-strategy lock-in — this story needs the same upfront pattern/test-plan decision any other story now gets).

---

## Step 4 — Present and write

```
## Story draft — <ID> for <target file>

<full story block, per docs/STORY_SCHEMA.md>

### Self-dry-run findings
<anything Step 3 caught and fixed, or flagged as an open item for /story-discovery to resolve>
```

Apply the doc/config gate: summarise, ask *"May I now append `<ID>` to `<target file>`?"*, write only after an explicit yes. Insert the new story block immediately before the file's closing section (a milestone's `## Definition of Done (applies to every story above)`, or a TD's final section/end of file), matching the existing `---` separator convention between stories.

---

## Step 5 — Handoff

```
<ID> is drafted and appended to <target file>.

Next: run `/story-discovery <ID>` — same as any other story.
```
