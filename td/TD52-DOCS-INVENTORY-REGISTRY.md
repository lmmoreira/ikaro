# TD52 — The docs inventory behind `/docs-audit` is not a CI-checked registry

## Status
- **Type**: Technical Debt / CI Hardening (documentation governance)
- **Priority**: Low (no drift today; the lists match the files on disk, and the skill's "unclassified doc" finding catches an addition when someone runs the audit)
- **Context**: `packages/architecture-check`; `.claude/commands/docs-audit.md`; `.copilot/context.md`; `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md`
- **Created**: 2026-10-17
- **Discovered**: reviewing `/docs-audit`'s quality in a chat session; the deep/light lists are the one hand-maintained inventory in the documentation tooling with no CI check
- **Decision status**: Drafted 2026-10-17 — approach decided below. One story; it still begins with `/story-discovery TD52`.
- **Related**: TD53 (docs and journeys layout — decides the final paths this registry is seeded with; implement after it), TD41 (canonical-home rule), TD37 (`architecture-check` decisions), `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md` § `architecture-check` detector table, `docs/28-LOCK_CATALOG.md` § 7 (the `lock-catalog-coverage` precedent)

## Problem

`/docs-audit` classifies every `docs/*.md` as **deep-check** (verified against a real code/config artifact) or **light-check** (direct read), using two lists written into its own Step 1 prose (`.claude/commands/docs-audit.md`, the "Deep-check docs" and "Light-check docs" paragraphs). As of 2026-10-17 the lists match the 45 files in `docs/*.md`, so nothing is wrong today. They are still unenforced:

- A new doc, a rename or a delete is only noticed when someone runs the audit, through its "unclassified doc" and "stale list" findings.
- Each deep doc's artifact mapping (which code/config it is checked against) exists only in prose, in four agent-bucket paragraphs.
- The skill's note on `docs/ENGINEERING_RULES.md` is already stale: that file is now a 94-line index of the split `ENGINEERING_RULES_*.md` files, not a possible leftover copy.

Other registries in this repo are CI-checked: `agent-context-policy.json` (`agent-context-file` detector) and the `lock-catalog-coverage` detector (every lock in the code must be named in `docs/28-LOCK_CATALOG.md`). This one is not.

### Why this matters

The audit is only as complete as its inventory. A doc that is on disk but in neither list gets no deep check until a human notices the "unclassified" finding, and the lists are the first thing to rot when docs are added in a hurry (TD41 split one doc into five).

## Chosen approach (decided 2026-10-17 in the session that drafted this TD; `/story-discovery` still runs first)

Candidates considered:

1. **A markdown inventory table.** Rejected: needs a fragile table parser in the detector, and would duplicate `docs/README.md`, the existing human-facing doc index.
2. **Registry JSON that also carries the rules each doc contains.** Rejected: a second source of truth for content that already lives in the docs.
3. **A policy JSON beside the two that exist, plus a coverage detector. Chosen.** `packages/architecture-check/docs-inventory-policy.json`, loaded in `cli.ts` like `agent-context-policy.json`. Each entry: `path`, `class` (`deep` | `light`), `bucket` (deep docs only: `schema-data`, `architecture-contracts`, `standards-structure`, `process-ci-infra`) and `artifacts[]` (required for `deep`). Files and classification only, never rules.

Decisions baked in:
- **Detector `docs-inventory-coverage`** fails CI when a top-level `docs/*.md` is not registered, a registered path no longer exists, a `deep` entry has no artifact, or an artifact path does not exist. Scope is top-level `docs/*.md` only; `docs/discovery/**`, `docs/lean/*`, `plan/` and `td/` keep their own rules in the skill.
- **The skill reads the registry.** `docs-audit.md` Step 1 replaces its inline lists with a pointer; the stale `ENGINEERING_RULES.md` wording is corrected in the same change.
- **`.copilot/context.md` §10/§17 gets one pointer** naming the registry as the canonical inventory. The §10 task-to-docs table stays separate: it maps tasks to docs, not docs to audit class.
- **Docs reference each other as today.** Only the skill and the detector read the registry.

## Stories

### Story 1 — Docs inventory registry and coverage detector ⚪

**Agent:** devops
**Complexity:** M
**Docs to load:** `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md` § `architecture-check`; `docs/ENGINEERING_RULES_TESTING.md` (detector tests); `docs/STORY_SCHEMA.md`; `.claude/commands/docs-audit.md` Step 1
**Dependencies:** TD53 Story 3, or TD53 Story 0's no-go decision on regrouping `docs/` — so the registry is seeded once with the final paths. If regrouping is no-go, add a `category` field to the registry entries and generate or validate `docs/README.md` from it.
**Pattern:** plain composition — no named pattern applies. The detector follows `lock-catalog-coverage.ts` and `agent-context-file.ts`: policy JSON in, `ScanResult` out.

**Description:**
Implement the decisions above. A doc is registered if its path appears exactly once in the registry. The detector reports each of the four failure modes as its own `Finding` with the file and an actionable message. Seed the registry from the skill's current lists, verified against `ls docs/*.md`, then remove the inline lists from the skill and replace them with a pointer to the registry. Register the detector in `cli.ts`, export it from `index.ts`, and add its row to the detector table in `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md`. Add one pointer line in `.copilot/context.md` and check the section budget in `agent-context-policy.json` before and after.

**New migration / i18n keys / env vars / feature flags:** none

**Files to create/modify:**
- `packages/architecture-check/docs-inventory-policy.json` (new)
- `packages/architecture-check/src/detectors/docs-inventory-coverage.ts` (new)
- `packages/architecture-check/src/detectors/docs-inventory-coverage.spec.ts` (new)
- `packages/architecture-check/src/index.ts` (modify — export)
- `packages/architecture-check/src/cli.ts` (modify — load policy, register detector)
- `.claude/commands/docs-audit.md` (modify — Step 1 pointer, stale `ENGINEERING_RULES.md` wording)
- `.copilot/context.md` (modify — §10/§17 pointer; edit this file directly, never through the symlinks)
- `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md` (modify — one detector-table row)

**Acceptance criteria — product:**
- [ ] A new `docs/*.md` without a registry entry fails `pnpm architecture-check` with a message naming the file.
- [ ] `/docs-audit` Step 1 reads the registry and no longer carries its own lists.

**Acceptance criteria — technical:**
- Unit:
  - [ ] `docs-inventory-coverage.spec.ts`: a doc on disk but not registered is reported.
  - [ ] `docs-inventory-coverage.spec.ts`: a registered path that does not exist is reported.
  - [ ] `docs-inventory-coverage.spec.ts`: a `deep` entry with no artifact is reported.
  - [ ] `docs-inventory-coverage.spec.ts`: a `deep` entry whose artifact path does not exist is reported.
  - [ ] `docs-inventory-coverage.spec.ts`: a fully registered set passes with zero findings.
- Integration:
  - [ ] none — covered by the unit tests plus a clean `pnpm architecture-check` run on the real repository.
- Tenant isolation:
  - [ ] none — no tenant data.
- E2E:
  - [ ] none — covered by unit tests.
- [ ] Coverage ≥80% on changed code
- [ ] `tsc --noEmit` clean, lint clean

**Open items for `/story-discovery`:**
- Whether `docs/README.md` is registered as `light`.
- Whether each entry needs an `owner` (left out of this draft).
- How the detector treats `docs/discovery/**` (this draft excludes it).
