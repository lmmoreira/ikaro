# Ikaro — Canonical Story Schema

> **When to load:** drafting a story (`/create-td`, `/discovery-to-milestone`), consuming a story (`/story-discovery`, `/run-batch`), or writing/reviewing any `plan/M0X-*.md` or `td/TDNN-*.md` file.
> This is the single source of truth for "what fields does a story have." Producers (`/create-td`, `/discovery-to-milestone`) draft to this shape; consumers (`/story-discovery`, `/run-batch`) parse this shape. Neither restates the field list itself — both reference this file.

---

## Why this file exists

`/create-td` and `/discovery-to-milestone` both draft stories, in two different document types (`td/TDNN-*.md` vs `plan/M0X-*.md`), and independently used to define the same field set in prose. That produced real drift: the field name itself disagreed (`Agent:` in every real file vs. `Agent target:` in one skill's template), fields grew over time without being backfilled (`Files to create/modify` doesn't exist in early-milestone stories like M12), and pre-standardization TDs (TD37) have no structured fields at all — just prose and acceptance criteria. A new rule discovered mid-story (e.g. the `.http` file convention, or the PR-sequencing playbook) had to be manually copy-pasted into every place that drafts or consumes a story, with no guarantee it actually was.

This file is the fix: one schema, referenced everywhere. A new rule gets added once, here.

---

## Field reference

### Header

```
### <ID> — <Title> [confidence marker, optional] [status]
```

- `<ID>`: `M0X-SYY` (milestone story) or `TDNN` / `Story N` (TD — see `create-td.md` for heading-level conventions per file).
- `[confidence marker]`: optional, TD-only convention (🔴 proven recurring failure / 🟡 documented-but-unenforced rule / ⚪ exploratory, non-blocking) — adopt only if the TD's own scope benefits from it, never mandatory.
- `[status]`: `✅ Done`, or omitted while pending.

### Core fields (every story, no exceptions)

```
**Agent:** backend-ts | bff-ts | frontend-ts | web-ts | devops
**Complexity:** S | M | L
**Docs to load:** <doc path + § section, every one this story actually needs>
**Dependencies:** <story IDs, own file or cross-TD/milestone — "none" if foundational>
**Pattern:** <named architectural/GoF pattern, or "plain composition — no named pattern applies">
```

- Field name is **`Agent:`**, not `Agent target:` — matches every real file (`M20-S15`, `M12-S04`, `M17-S17`); the latter was a drafting-template-only variant, now retired.
- `Pattern` is mandatory, not optional prose buried in the description. It's already required by `/story-discovery`'s Step 4q lock-in and `/create-td`'s own Step 6 self-dry-run — this just gives it a first-class line so it can't be silently skipped.

### Optional — bug-fix-shaped stories only

```
**Discovered:** <date, how found — user report, incident, docs-audit, bot review>
**Root cause:** <traced live in code, not hypothesized — cite file:line>
```

Use when the story originates from an observed defect rather than planned scope (`M20-S15` precedent). Omit for greenfield stories — there's no root cause to trace yet.

### Description (every story)

Full inline prose: mechanism, context, chosen approach. A reader must not need to open a discovery doc, a TD's own `## Problem` section, or another story to understand this one — inline everything relevant, don't point back (`/discovery-to-milestone` Step 4's existing rule).

### Conditional fields — include only when applicable, state "none" explicitly rather than omitting silently

```
**Backend use case steps:** <numbered list; one labeled sub-list per UC if the story bundles multiple UCs>
**Backend HTTP surface:** <new/extended controller+route, or "reuses <existing endpoint>">
**BFF endpoint spec:** <method, path, auth, request/response shape>
**Prototype references:** <plan/journey/<actor>/prototypes/<slug>/ path — frontend stories only>
**New migration / i18n keys / env vars / feature flags:** <explicit list, or "none">
```

`Backend HTTP surface` is always its own line when a backend story is involved — never left implied by the use-case steps or the BFF spec alone (the gap that hit two consecutive M19 stories, per `discovery-to-milestone.md` Step 4).

### Files to create/modify (every story, no exceptions)

- Real paths only. For a "modify" entry, **verify the path actually exists** (Explore agent) — never state one from memory.
- New files follow the domain-slice conventions in `CLAUDE.md` §11 / `docs/REPOSITORY_STRUCTURE.md` exactly — check a real sibling file in the same directory for the exact naming pattern, don't infer it from the entity name.
- **Every new REST endpoint gets its `.http` request-block file listed too** (`apps/backend/http/<context>/<resource>.http` / `apps/bff/http/<feature>/<resource>.http`, per `docs/CODE_STANDARDS.md`).
- For a multi-PR story (see **PR sequence** below), this list is the *union* across all PRs — the PR sequence field is what partitions it.
- `/run-batch`'s file-overlap safety check reads this field directly — a story with this field missing can't be safety-checked for concurrent execution at all.

### Acceptance criteria — product

```
**Acceptance criteria — product:**
- [ ] <business/user-observable behavior — what changes for an actor>
```

State every DEFERRABLE assumption the story's scope touches as an explicit criterion here (not a hidden default).

### Acceptance criteria — technical

```
**Acceptance criteria — technical:**
- Unit:
  - [ ] <named scenario/file>
- Integration:                              <omit for web-ts stories — no .integration.spec.ts tier there>
  - [ ] <named scenario/file>
- Tenant isolation:                         <omit for pure infra / no-tenant-data stories>
  - [ ] <named cross-tenant scenario>
- E2E:
  - [ ] <named Playwright scenario, or "none — covered by unit/integration">
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean
```

Named per tier, not "at least one test" — this is what `/story-discovery`'s 4q lock-in and `/discovery-to-milestone`'s 5a dry-run actually check for. Per `docs/08-TESTING_STRATEGY.md` rule #1: every UC needs a unit test, an integration test, and a tenant-isolation test (backend/BFF); web stories get unit (Vitest, jsdom/node) + E2E only.

For **devops** stories, replace the Unit/Integration/Tenant-isolation/E2E sub-bullets with:

```
- [ ] Checkov / Tfsec clean
```

and add the Infra-specific fields below.

### Infra-specific fields — devops stories only, include when applicable

```
**IAM / permissions:** <table: principal → role → resource, or "none">
**Live-verification check:** <the concrete live check this story requires before merge review — real command + what "pass" looks like>
**PR sequence:** <N PRs — cite the exact row from infra/terraform/README.md's "New-resource PR-sequencing playbook", never re-derive sequencing from scratch>
- PR1: <scope — files, label if infra-app-mix-ok applies>
- PR2: <scope — files; any ordered manual step (e.g. "populate secret's real value") stated explicitly, not a footnote>
- PR3 (if applicable): <scope — files>
```

- **IAM / permissions table**: required whenever the story grants roles. Note explicitly which bindings target a resource this story's own Terraform can't yet reference (created by a later/dependency story) — Terraform can't grant IAM on something that doesn't exist (`M17-S17`/`S18`/`S19` precedent).
- **Live-verification check**: required for any story touching Terraform, IAM, Pub/Sub, or CI/CD — `CLAUDE.md` §9 Step 5 item 6 is explicit that "tests pass, bots clean" is insufficient for this category (three separate incidents — M19-S02, S07, S08 — each merged clean and broke on real deploy). A failed or un-runnable check is its own stuck condition, not something the merge review is expected to catch by reading source.
- **PR sequence**: required whenever `Files to create/modify` spans `foundation/**` + any other `infra/terraform/**` path (CI-enforced, no escape hatch — TD39), or `infra/terraform/**` + `apps/**`/`packages/**` (CI-enforced, `infra-app-mix-ok` label escape hatch for genuinely coupled cases — TD30). If the story's shape doesn't match an existing playbook row, that's a signal to add a new row to `infra/terraform/README.md` first (via the doc gate), not to freehand a sequence. `PR sequence`'s per-PR ordering is distinct from the story-level `Dependencies` field: `Dependencies` orders stories against each other; `PR sequence` orders PRs *within* this one story (e.g. PR2's Foundation grant can't apply until PR1's `envs/*` change is live).

---

## Full skeleton

```
### <ID> — <Title> [confidence marker] [status]

**Agent:** backend-ts | bff-ts | frontend-ts | web-ts | devops
**Complexity:** S | M | L
**Docs to load:** ...
**Dependencies:** ...
**Pattern:** ...

<Discovered / Root cause — bug-fix stories only>

**Description:**
...

<Backend use case steps / Backend HTTP surface / BFF endpoint spec / Prototype references /
New migration-i18n-env-flags — conditional, state "none" explicitly if not applicable>

**Files to create/modify:**
- ...

**Acceptance criteria — product:**
- [ ] ...

**Acceptance criteria — technical:**
- Unit: ...
- Integration: ...
- Tenant isolation: ...
- E2E: ...
- [ ] Coverage ≥80% on changed code
- [ ] tsc --noEmit clean, lint clean

<IAM / permissions, Live-verification check, PR sequence — devops stories only>
```
