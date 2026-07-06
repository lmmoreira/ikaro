---
name: docs-audit
description: Audit project documentation for staleness, internal inconsistency, drift from the actually-implemented code, and confusing/missing handoff info - across `docs/`, `plan/M0X-*.md` milestone files, `plan/journey/` (journeys + prototypes), and `CLAUDE.md`/`.copilot/context.md` itself. Run this before drafting any journey file (`plan/journey/`), before starting a new milestone, or any time documentation might have drifted from reality.
metadata:
  short-description: Project documentation audit
---

Audit project documentation for staleness, internal inconsistency, drift from the actually-implemented code, and confusing/missing handoff info — across `docs/`, `plan/M0X-*.md` milestone files, `plan/journey/` (journeys + prototypes), and `CLAUDE.md`/`.copilot/context.md` itself. Run this before drafting any journey file (`plan/journey/`), before starting a new milestone, or any time documentation might have drifted from reality.

> Supersedes the old `/uc-audit` skill — its UC-vs-code logic is preserved verbatim as category (a) below, just no longer the only thing this skill checks.

Optional argument: `$ARGUMENTS`
- A UC number or comma-separated list, e.g. `UC-021` or `UC-002,UC-021,UC-027` — scope to these UCs (full `docs/04-USE_CASES.md` still read for cross-reference context).
- A milestone prefix, e.g. `M13` — read `plan/M13-*.md` (excluding `_IMPLEMENTATION_DETAILS_*` files) and scope to every doc/UC/journey/milestone path it actually cites (see Step 1).
- A journey path, e.g. `staff/agenda` — scope to that actor's `<slug>.md` + `prototypes/<slug>/` folder (including `dev-notes.md`, `index.html`).
- A single doc path, e.g. `docs/14-API_CONTRACTS.md` — scope to that file.
- Blank — audit **everything**: every UC, every doc under `docs/` (all of them — see Step 1's depth split), every milestone (active drafts *and* completed ones), every journey, and `CLAUDE.md` itself. Nothing is excluded from scope; what varies is audit *depth* (see Step 1). This is the expensive, full-sweep mode — use deliberately, not as a default habit.

Fix nothing without permission — audit first, propose fixes, then write only what the user approves (CLAUDE.md §0).

---

## Step 1 — Resolve scope

### If `$ARGUMENTS` is a UC number/list
Scope = those UCs. Read `docs/04-USE_CASES.md` in full regardless, for cross-reference context.

### If `$ARGUMENTS` is a milestone prefix (e.g. `M13`)

Find the plan file: `plan/<milestone>-*.md` — exclude `*_IMPLEMENTATION_DETAILS_IA.md` and `*_IMPLEMENTATION_DETAILS_DEVELOPER.md`. **Exactly one match expected — if zero or more than one file matches, STOP and surface it as a finding instead of guessing:**
> Found <N> files matching `plan/<milestone>-*.md`: <list>. This milestone's planning docs are ambiguous/fragmented — confirm with the user which file is canonical (and check `.copilot/context.md` §10's table for which one it actually references) before auditing. Do not pick one silently.

Grep the **entire file** (not just "Docs to load" lines — story blocks cite paths under inconsistent labels: "Docs to load", "Prototype references:", "Prototype reference:", "Journey prototype:", or as bare filenames inside a list) for:
- `UC-\d+` → UC scope
- `docs/[A-Z0-9_-]+\.md` → doc scope
- `plan/journey/[a-z]+/.*\.(md|html)` → journey scope
- `plan/M\d+.*\.md` → other-milestone scope (e.g. a "Depends on M08" reference)

**Bare-filename rule:** within one citation list/line, a filename with no directory prefix (e.g. `dev-notes.md`, `05-reschedule.html`) inherits the most recent fully-qualified `plan/journey/.../` directory mentioned earlier in the same field.

**Every doc found stays in scope — nothing is dropped.** What varies is audit *depth*, decided by whether a concrete artifact exists to diff the doc against:

**Deep-check docs (verified against a real code/config artifact via Explore agents, Step 2b):** `docs/02-DOMAIN_MODEL.md`, `03-DOMAIN_EVENTS.md`, `04-USE_CASES.md`, `05-BOUNDED_CONTEXTS.md`, `06-TENANT_ISOLATION_STRATEGY.md`, `11-ARCHITECTURE.md`, `13-DATABASE_SCHEMA.md`, `14-API_CONTRACTS.md`, `15-HOTSITE_DYNAMIC_ARCHITECTURE.md`, `16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `17-GITHUB_WORKFLOWS_GUIDELINES.md`, `18-RELEASE_LIFECYCLE_OPERATIONS.md`, `21-TENANTS_SETTINGS_SCHEMA.md`, `24-BFF_ARCHITECTURE.md`, `25-ERROR_CATALOG.md`, `ANTI_PATTERNS.md`, `CI_TRAPS.md`, `CODE_STANDARDS.md`, `ENGINEERING_RULES.md`, `REPOSITORY_STRUCTURE.md`, `VALUE_OBJECTS_REFERENCE.md`. (`17`/`18` verify against `.github/workflows/*.yml`, `docker-compose.yml`, and health-check routes — not domain code, but still a real artifact, so they get the same agent treatment as the rest of this list, not the lighter pass below.)

**Light-check docs (direct-read pass only, Step 3f — no agent spawn, no code artifact to diff against, but still read and checked for staleness/contradictions):** every other file under `docs/` not listed above (e.g. `01-BUSINESS_CONTEXT.md`, `07-ENGINEERING_PRINCIPLES.md`, `08-TESTING_STRATEGY.md`, `09-CI_CD_PIPELINE.md`, `10-OBSERVABILITY_STRATEGY.md`, `12-DEPLOYMENT_STRATEGY.md`, `19-INFRASTRUCTURE_TOOLING_MAP.md`, `20-COST_OPTIMIZATION_STRATEGY.md`, `22-TECH_STACK_DECISIONS.md`, `23-INFRASTRUCTURE_SETUP.md`, `AGENT_PATTERNS.md`, `AI_AGENT_DOCUMENTATION.md`, `QUICK_REFERENCE.md`, `README.md`, `docs/lean/*`).

Also note any prose-only mentions outside story blocks (e.g. an "Architecture & conventions" section, a supersession note naming old milestone files) — include cited docs/journeys from there too (deep- or light-check, per the lists above), but exclude filenames that are clearly historical/dead references (e.g. inside a "(formerly ...)" or "supersedes ..." note) — those are deliberate history, not live citations.

### If `$ARGUMENTS` is a journey path (e.g. `staff/agenda`)
Scope = `plan/journey/<actor>/<slug>.md`, `plan/journey/<actor>/prototypes/<slug>/` (all files), `plan/journey/<actor>/use-cases.md`, `plan/journey/README.md`'s index row for this journey.

### If `$ARGUMENTS` is a single doc path
Scope = that file.

### If `$ARGUMENTS` is blank
Scope = every UC, every doc under `docs/` (deep-check list + light-check list, both), every milestone — active drafts (`plan/M*.md` with no matching `_IMPLEMENTATION_DETAILS_IA.md`) get the full deep self-consistency pass (Step 3c), completed milestones (the 13 with an `_IMPLEMENTATION_DETAILS_IA.md`) get the light pass (Step 3f) — every journey under `plan/journey/`, and `CLAUDE.md`/`.copilot/context.md`.

### Print the resolved scope before proceeding

```
## Docs Audit — scope resolved for <argument>

UCs: <list or "none">
Deep-check docs: <list or "none">
Light-check docs: <list or "none">
Journeys: <list or "none">
Milestone files (deep): <list or "none">
Milestone files (light): <list or "none">
CLAUDE.md/context.md: always included

→ This will spawn <N> agent(s): <list categories>.
```

If scope is blank (full sweep), confirm with the user before proceeding given the cost — for any other scope, just proceed.

---

## Step 2 — Bounded parallel agents (skip any category whose bucket is empty)

Fan-out is **fixed and bounded** — never one agent per doc or per journey.

### (a) UC-vs-code — only if UCs in scope

Spawn 3 Explore agents, in parallel:

- **Agent A — Roles & guards:** for every actor/role term the in-scope UCs use (e.g. "Admin", "Staff", "Manager", "Super admin", "Developer", "Platform operator", "Customer"), grep `apps/bff/src/**/*.controller.ts` for the `@Roles(...)` decorator on the endpoint(s) that UC describes. Report, per UC: the role(s) the doc claims vs. the role(s) the guard actually enforces, and whether they match CLAUDE.md §1's two staff roles (`STAFF`, `MANAGER` — `MANAGER` is a superset) plus `CUSTOMER`. Flag any doc role term with zero corresponding JWT role.

- **Agent B — Endpoints & `.http` coverage:** for every HTTP method+path literal in the in-scope UCs (e.g. `PATCH /customers/me`, `POST /v1/loyalty/redeem`), grep backend (`apps/backend/src/contexts/**/*.controller.ts`) and BFF (`apps/bff/src/**/*.controller.ts`) for a matching route decorator, and grep `apps/backend/http/**/*.http` + `apps/bff/http/**/*.http` for a corresponding request block. Report any UC-stated path with no matching controller route, any method mismatch (UC says PATCH, code has PUT, etc.), and any route missing an `.http` block.

- **Agent C — Entities, enums, settings keys & frontend pages:** for every domain term an in-scope UC asserts as a concrete shape (module types, status enums, `tenants.settings` keys, table/column names), grep the relevant `*.aggregate.ts`, enum, or `docs/21-TENANTS_SETTINGS_SCHEMA.md` and report whether the doc's list matches the code's. Separately, for every in-scope UC that implies a dedicated frontend page/route (a distinct "guest views X" / "customer submits Y" screen, not just an API call), check `apps/web/app/` for a matching page and report MISSING if none exists — this is the IA-gap signal that feeds `plan/journey/`.

### (b) Deep-check docs vs their artifact — only for non-empty buckets, max 4 agents total

- **Schema/data bucket** (`02-DOMAIN_MODEL.md`, `03-DOMAIN_EVENTS.md`, `13-DATABASE_SCHEMA.md`, `21-TENANTS_SETTINGS_SCHEMA.md`, whichever are in scope): grep aggregates, event classes, migrations, and the settings VO for whether the doc's claimed shapes (entity fields, event names/payloads, table/column names, settings keys + defaults) match.

- **Architecture/contracts bucket** (`05-BOUNDED_CONTEXTS.md`, `06-TENANT_ISOLATION_STRATEGY.md`, `11-ARCHITECTURE.md`, `14-API_CONTRACTS.md`, `15-HOTSITE_DYNAMIC_ARCHITECTURE.md`, `16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `24-BFF_ARCHITECTURE.md`, `25-ERROR_CATALOG.md`, whichever are in scope): grep module/controller structure, error mapper classes, and the tenant-isolation interceptor for whether the doc's described boundaries/contracts/error catalog match.

- **Standards/structure bucket** (`ANTI_PATTERNS.md`, `CI_TRAPS.md`, `CODE_STANDARDS.md`, `ENGINEERING_RULES.md`, `REPOSITORY_STRUCTURE.md`, `VALUE_OBJECTS_REFERENCE.md`, whichever are in scope): grep for whether named patterns/forbidden-patterns/VO class names/file locations still match the actual codebase.

- **Process/CI bucket** (`17-GITHUB_WORKFLOWS_GUIDELINES.md`, `18-RELEASE_LIFECYCLE_OPERATIONS.md`, whichever are in scope): grep `.github/workflows/*.yml` for whether the documented CI gate list (lint, type-check, tests, Snyk/Gitleaks, SonarCloud) and branch-naming convention actually match; grep `docker-compose.yml` for whether the documented local-dev services (Postgres, Pub/Sub emulator, Prometheus/Grafana) match; check whether a `/health/ready`-style endpoint exists if the doc claims a smoke test against one.

Each bucket's agent runs ONLY if at least one of its docs is in the resolved scope.

---

## Step 3 — Direct-read checks (no subagents — same pattern as today's UC doc-vs-doc pass)

### 3a. UC internal consistency — only if UCs in scope
- Summary table row matches the detail section's `**Actor:**` line and outcome
- Every "see UC-XXX"/"superseded by UC-XXX"/"lives in UC-XXX" reference points to a UC that exists, with a status consistent with how it's being referenced (don't cite an active flow as living inside a UC marked SUPERSEDED)
- `.copilot/context.md` §6 UC index matches the summary table in `docs/04-USE_CASES.md`
- Any booking-status transition named in a UC is valid per CLAUDE.md §5; no UC references `NO_SHOW`, UC-014, or UC-015 as active

### 3b. Cross-doc consistency — for any in-scope doc pair that cross-references (deep- or light-check)
- e.g. does `CLAUDE.md` §3's Bounded Contexts table match `docs/05-BOUNDED_CONTEXTS.md`? Does §1's project-facts table match `docs/22-TECH_STACK_DECISIONS.md`/`13-DATABASE_SCHEMA.md` where they overlap? Does `20-COST_OPTIMIZATION_STRATEGY.md`'s infra choices (e.g. "Cloud Run/Fargate" as parallel options) still match the project's actual committed decision in CLAUDE.md §1 (GCP-only)?

### 3c. Active-milestone self-consistency (deep) — only if an active draft milestone file is in scope
- Every story header is the full `### M0X-Sxx — <title>` form, never a bare `### Sxx`
- Every `Dependencies:` line references a story ID that exists, either earlier in the same file or in an already-completed prior milestone — flag any forward reference (a story depending on a later-numbered sibling in the same file)
- Exactly one canonical `plan/M0X-*.md` file exists for this prefix (already checked in Step 1; re-confirm here if this step runs standalone via a doc-path argument)
- `.copilot/context.md` §10's table actually points at this milestone's real filename

### 3d. Journey/prototype internal consistency — only if journey(s) in scope
Direct-read pass per in-scope journey. Only promote to a real subagent — bounded to one per **actor folder** (max 4: guest/customer/staff/manager) — if the in-scope journey set is large enough to risk blowing the context budget in one pass; otherwise stay in this direct-read step:
- Sidebar/bottom-nav/bottom-sheet items linking to `#` or self-looping instead of the real cross-journey path (see `plan/journey/README.md` Part 4 pitfall — grep `href="#"` and same-file self-links on `sidebar-nav-item`/`bottom-nav-item`/`bottom-sheet-item` classes)
- The journey `.md`'s mermaid flow matches what the prototype folder actually contains (no node marked `gap` that's actually fully prototyped, and vice versa)
- `dev-notes.md` has the mandatory sections per `plan/journey/README.md`'s template (file map, props, BFF call, validation table, state machine) for every screen that needs them
- `index.html`'s screen list matches the files actually on disk; every lettered variant follows the `01b`/`01c` naming convention with no collisions
- Every "Known limitations" bullet in `dev-notes.md` is either still accurate or stale

### 3e. `CLAUDE.md`/`.copilot/context.md` self-consistency — always runs (cheap, one file, no agent spawn)
- No duplicated subsections (read top to bottom once; flag any heading/content block that repeats)
- §6's UC index matches `docs/04-USE_CASES.md`'s summary table (status + title)
- §3's Bounded Contexts table matches `docs/05-BOUNDED_CONTEXTS.md`
- §10's dynamic-loading table references files that actually exist on disk
- §17's command table lists every file actually present in `.claude/commands/`, and vice versa

### 3f. Light-check pass — for every in-scope light-check doc and every in-scope completed milestone
No code/config artifact to diff against, so this is a direct read, not a grep-driven check. For each in-scope light-check doc (see Step 1's list) and each in-scope completed milestone's `_IMPLEMENTATION_DETAILS_IA.md`:
- Internally consistent — no self-contradictory statements, no stale numbers/dates left over from an earlier draft
- Still aligned with decisions recorded elsewhere (CLAUDE.md, a deep-check doc, a later milestone) — e.g. naming a vendor/tool/strategy that a later, more authoritative doc has since superseded
- Cross-references (file paths, doc names, other milestones) still resolve to something that exists
- Confusing or ambiguous wording that would slow down a reader — flag with a suggested rewording, don't just say "unclear"
- For a completed milestone's IA doc specifically: still an accurate record of what shipped (no contradiction with the current codebase structure) — this is a much lighter check than 3c's, since the milestone is done and not being actively edited

---

## Step 4 — Findings report

```
## Docs Audit Report — <scope>

### Stale / Conflicting (doc says X, code says Y)
1. [UC-XXX] <field> — doc: "<old>" / code: "<actual>" → proposed fix: <one-line>

### Internal inconsistencies (doc vs. doc)
1. [CLAUDE.md §19] "Folder structure" subsection appears twice, identical content

### IA gaps (UC/doc implies something that doesn't exist)
1. [UC-XXX] <flow> — no page under apps/web/app/... — candidate for plan/journey/<actor>/

### Journey / prototype issues
1. [staff/horarios] 3 sidebar links self-loop instead of pointing to real cross-journey paths

### Confirmed correct
1. [UC-XXX] <thing> ✓
```

If a category has no findings, print `(none found)`.

---

## Step 5 — Resolve findings

For each "Stale/Conflicting" and "Internal inconsistency" finding:
- If code (or the more-recently-updated doc) is the unambiguous source of truth and there's one obvious fix, propose the exact edit (old → new text).
- If the fix requires a judgment call (terminology choice, which doc is authoritative, scope decision), collect it and ask via `AskUserQuestion` — batch all such questions into one round.

**File-type rules for what gets auto-fixed:**
- ✅ Auto-fixable (with permission): any `.md` doc text — `docs/*.md`, `plan/M0X-*.md` (including the milestone file's own story headers and dependency references), `plan/journey/*/use-cases.md`, `plan/journey/README.md`'s index table, `CLAUDE.md`/`.copilot/context.md`. (Editing a `plan/journey/` `.md` file to correct a drifted index or stale cross-link is not the same thing CLAUDE.md §19's hard stop guards against — that hard stop is about *creating* new journey/prototype work casually, not about this audit fixing an existing inconsistency.)
- ❌ Never auto-fixed, always listed as a recommendation instead: `.html` prototype files (need the full journey workflow per CLAUDE.md §19, not a mechanical text edit); `dev-notes.md` specifically — even though it's `.md`, its content is implementation intent the audit agent isn't positioned to author correctly; missing `.http` request blocks (need real payload/auth knowledge, not just doc text).

"IA gaps" and "Journey/prototype issues" that require new content (not a text correction) are listed only, not auto-fixed — carry IA gaps into `plan/journey/<actor>/use-cases.md` when that actor's journeys are drafted; carry journey/prototype issues into the next prototype touch-up pass.

Before writing anything, apply CLAUDE.md §0: summarise every proposed edit across all affected files in one message, ask "May I now write these N changes?", and write only after an explicit yes.

If the user says no to a change, note it and proceed with the current docs.

---

## Step 6 — Verdict

```
## Audit verdict — <scope>

✅ N stale/conflicting items fixed
✅ N internal inconsistencies fixed
📋 N IA gaps recorded — carry into plan/journey/ when drafting that actor's journeys
📋 N journey/prototype issues recorded — carry into the next prototype touch-up
✅ Confirmed correct: N items

Docs are now a verified baseline for journey-mapping / milestone planning / implementation.
```
