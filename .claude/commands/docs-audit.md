---
name: docs-audit
description: Audit project documentation for staleness, internal inconsistency, cross-doc content duplication (the same rule/pattern fully restated in more than one canonical doc), drift from the actually-implemented code, and confusing/missing handoff info - across `docs/`, `plan/M0X-*.md` milestone files, `plan/journey/` (journeys + prototypes), and `CLAUDE.md`/`.copilot/context.md` itself. Run this before drafting any journey file (`plan/journey/`), before starting a new milestone, or any time documentation might have drifted from reality.
metadata:
  short-description: Project documentation audit
---

Audit project documentation for staleness, internal inconsistency, cross-doc content duplication (the same rule/pattern fully restated in more than one canonical doc), drift from the actually-implemented code, and confusing/missing handoff info — across `docs/`, `plan/M0X-*.md` milestone files, `plan/journey/` (journeys + prototypes), and `CLAUDE.md`/`.copilot/context.md` itself. Run this before drafting any journey file (`plan/journey/`), before starting a new milestone, or any time documentation might have drifted from reality.

> Supersedes the old `/uc-audit` skill — its UC-vs-code logic is preserved verbatim as category (a) below, just no longer the only thing this skill checks.

Optional argument: `$ARGUMENTS`
- A UC number or comma-separated list, e.g. `UC-021` or `UC-002,UC-021,UC-027` — scope to these UCs (full `docs/04-USE_CASES.md` still read for cross-reference context).
- A milestone prefix, e.g. `M13` — read `plan/M13-*.md` (excluding `_IMPLEMENTATION_DETAILS_*` files) and scope to every doc/UC/journey/milestone path it actually cites (see Step 1).
- A journey path, e.g. `staff/agenda` — scope to that actor's `<slug>.md` + `prototypes/<slug>/` folder (including `dev-notes.md`, `index.html`).
- A folder, e.g. `plan/journey/staff`, `plan/journey`, `docs/discovery/multivertical-booking`, `docs/lean`, `td` — scope to every file under it (recursive), each classified by the normal rules. See "If the argument is a folder" in Step 1.
- A TD id, e.g. `TD50` — scope to `td/TD50-*.md` (exactly one match expected, same ambiguity rule as milestones) and every doc/UC/journey/milestone path it cites (same grep rules as a milestone prefix in Step 1).
- One or more doc paths and/or journey paths, comma-separated, e.g. `docs/14-API_CONTRACTS.md` or `docs/04-USE_CASES.md,docs/02-DOMAIN_MODEL.md,staff/agenda` — scope to exactly those. Step 3b's cross-doc consistency check runs across every pair in the batch, which is the main reason to pass more than one: verifying a just-promoted batch of docs (e.g. by `/discovery-to-milestone`) agrees with itself before anything references it — a freshly-promoted doc has no implemented code yet to deep-check against, so doc-to-doc consistency is what actually catches a mistake at that stage.
- A tag, e.g. `tag:backend` or `tag:web,prototypes` — scope to every doc carrying one of those tags (`docs-for --tag`), each at the depth its tags give it. The tags and what each covers are in `docOrientation.tags` in `packages/architecture-check/architecture-policy.json`; a request like "audit all the backend docs" resolves to `tag:backend`. See "If the argument is a tag" in Step 1.
- Blank — audit **everything**: every UC, every doc under `docs/` (all of them — see Step 1's depth split), every milestone (active drafts *and* completed ones), every journey, and `CLAUDE.md` itself. Nothing is excluded from scope; what varies is audit *depth* (see Step 1). This is the expensive, full-sweep mode — use deliberately, not as a default habit.

- `changed`, `changed:<git-ref>` or `changed:<a>..<b>` (default ref: the last `docs:`/`docs-audit` commit on `main`, else `HEAD~20`; a bare ref means `<ref>..HEAD`; an explicit range, e.g. a single squash commit `<sha>^..<sha>` as `/mark-done` passes, audits exactly that range) — **post-story / incremental mode.** Scope = docs touched in the range **plus** docs whose cited code paths changed in the range (`pnpm --filter @ikaro/architecture-check docs-for --range <range>` maps the changed files to docs through their `Tags` and prints the changed files no tag covers; also grep the changed file names/class names in `docs/` for anything the tags miss). Use this after a story; use the blank full sweep at milestone end. Besides docs, `changed` mode also maps the changed files to:
  - **journeys** — a changed `apps/web/features|shells|app/**` or `apps/bff/src/features/**` file maps to every `plan/journey/**` `dev-notes.md`/`<slug>.md` that names that file, component, route or endpoint (grep the changed file's basename, exported component/controller names and route strings across `plan/journey/`); those journeys get the Step 2c journey-vs-code check;
  - **TDs and milestones** — any `td/*.md` or `plan/M*.md` whose story block cites a changed path, or whose story the branch/PR closed, gets the self-consistency pass (3c);
  - **the story's own spec** — if the ref range contains a `feat(...)(M0X-SYY)`/TD commit, include that story's milestone/TD file.
  The doc mapping is deterministic (tags) but a tag can still miss an indirect dependency, and the journey, TD and milestone mapping is heuristic, so state in the report which docs/journeys were pulled in by which changed file, and which changed files mapped to *nothing* (`docs-for`'s `unmapped` lines), so the user can judge whether that is a real gap.

Fix nothing without permission — audit first, propose fixes, then write only what the user approves (CLAUDE.md §0).

## Guiding principle — context is never sacrificed for size (NON-NEGOTIABLE)

These docs exist to give AI agents accurate, complete context. Token efficiency is a *secondary* benefit and never a goal that justifies losing information.

- **Size is a signal for where to look, never a finding by itself.** A large, dense, non-duplicated doc is healthy. `docs/` is loaded on demand (not always in context), so there is deliberately no size budget on it; only `.copilot/context.md` is budgeted (CI `agent-context-file` detector).
- **Never propose deleting or shortening content to save tokens.** The only reductions this audit may propose are (1) collapsing a *verified duplicate* into a `→ doc § heading` pointer, and (2) removing content that is *demonstrably wrong/stale* per code.
- **Every consolidation proposal must carry a no-loss proof**, stated in the finding: name the canonical location, confirm it actually contains the full information (Read it — don't assume from a heading), and confirm the pointer's target heading exists. If the proof can't be made, the verdict is **keep** — say so under "Confirmed correct".
- **"Why" narrative, incident precedents and rationale are context, not bloat.** Keep them unless an exact duplicate elsewhere preserves them. A PR number or date inside a rule is only a finding where the repo already forbids it (e.g. `context.md`'s CI-enforced literal check), never merely for length.
- **Quality improvements are first-class findings:** ambiguous wording (with a suggested rewrite), missing "when does this apply" trigger, unclear canonical home, dead pointers, a rule whose scope an agent could misread.

---

## Step 1 — Resolve scope

### If the argument is a UC number/list
Scope = those UCs. Read `docs/04-USE_CASES.md` in full regardless, for cross-reference context.

### If the argument is a milestone prefix (e.g. `M13`)

Find the plan file: `plan/<milestone>-*.md` — exclude `*_IMPLEMENTATION_DETAILS_IA.md` and `*_IMPLEMENTATION_DETAILS_DEVELOPER.md`. **Exactly one match expected — if zero or more than one file matches, STOP and surface it as a finding instead of guessing:**
> Found <N> files matching `plan/<milestone>-*.md`: <list>. This milestone's planning docs are ambiguous/fragmented — confirm with the user which file is canonical (and check `.copilot/context.md` §10's table for which one it actually references) before auditing. Do not pick one silently.

Grep the **entire file** (not just "Docs to load" lines — story blocks cite paths under inconsistent labels: "Docs to load", "Prototype references:", "Prototype reference:", "Journey prototype:", or as bare filenames inside a list) for:
- `UC-\d+` → UC scope
- `docs/[A-Z0-9_-]+\.md` → doc scope
- `plan/journey/[a-z]+/.*\.(md|html|css)` → journey scope (the `css` case matters specifically for `plan/journey/shared/tokens.css` — a bare `.md`/`.html` pattern misses it entirely)
- `plan/M\d+.*\.md` → other-milestone scope (e.g. a "Depends on M08" reference)

**Bare-filename rule:** within one citation list/line, a filename with no directory prefix (e.g. `dev-notes.md`, `05-reschedule.html`) inherits the most recent fully-qualified `plan/journey/.../` directory mentioned earlier in the same field.

**Every doc found stays in scope — nothing is dropped.** What varies is audit *depth*, decided by whether a concrete artifact exists to diff the doc against, and that is read from the doc's own header, not from a list in this skill.

**The doc inventory and its classification are derived from the headers.** Every top-level `docs/*.md` opens with `> **When to load:** …` and `> **Tags:** a, b`; the `doc-orientation` detector in `architecture-check` fails CI if either is missing or a tag is unknown, so no doc is ever unclassified. The tag vocabulary, with each tag's description and the code globs it covers, is `docOrientation.tags` in `packages/architecture-check/architecture-policy.json`. Resolve scope with the helper, run from the repository root:
- `pnpm --filter @ikaro/architecture-check docs-for --tag <name…>` — the docs carrying a tag;
- `pnpm --filter @ikaro/architecture-check docs-for --file <path…>` or `--range <a>..<b>` — the docs that describe those files or that git range, plus the files no tag covers (`unmapped`);
- add `--json` for machine-readable output. Every doc line is marked `deep` or `light`.

**Deep-check docs** have at least one tag with code globs (`backend`, `bff`, `web`, `database`, `events`, `tenancy`, `infra`, `testing`, `prototypes`). They are verified against the code those globs cover, via the Explore agents of Step 2b. **Light-check docs** carry only glob-less tags (`product`, `agent-process`): a direct-read pass only (Step 3f), no agent spawn, no code artifact to diff against, but still read and checked for staleness and contradictions. Files under `docs/discovery/**` and `docs/lean/*` have no header contract and are light-checked.

**`docs/BOOTSTRAP_LOG.md` is gitignored (operator-local) — check `git check-ignore -v docs/BOOTSTRAP_LOG.md` before including it.** If the file doesn't exist in this checkout, that's expected in most environments (CI, a fresh clone, another operator's machine) — skip it silently, do not report it as a MISSING/stale finding. If it does exist locally, light-check it normally.

Also note any prose-only mentions outside story blocks (e.g. an "Architecture & conventions" section, a supersession note naming old milestone files) — include cited docs/journeys from there too (deep- or light-check, per their tags), but exclude filenames that are clearly historical/dead references (e.g. inside a "(formerly ...)" or "supersedes ..." note) — those are deliberate history, not live citations.

### If the argument is a folder (an existing directory path)
Verify it exists and is under the repo; if it doesn't exist, or contains no `.md`/journey files, STOP and report that instead of guessing. Otherwise expand recursively and classify each file by the normal rules:
- `plan/journey` → every actor folder (`guest`, `customer`, `staff`, `manager`) as journeys, plus `shared/`, plus `README.md`'s index.
- `plan/journey/<actor>` → every journey of that actor (each `<slug>.md` + `prototypes/<slug>/`), that actor's `use-cases.md`, plus `plan/journey/shared/` and the README index rows for those journeys.
- `docs` → equivalent to the blank scope's docs portion (every top-level doc, depth from its tags).
- `docs/discovery/<name>` and `docs/lean` → light-check each file, plus a structure check: a discovery folder should match the shape `/discovery-to-milestone` expects (see `.claude/commands/create-discovery.md`); report missing or out-of-pattern files.
- `td` → every `td/TD*.md` per the TD rules below.
- `plan` → every `plan/M*.md` (active drafts deep, completed light) and `plan/journey` as above.
- Any other directory → each file by extension: `.md` under `docs/` by its tags (`docs-for`); unknown files are listed as "unclassified, not audited", never silently skipped.
The folder's files form **one pool for Step 3b/3g/3h**, exactly as with several comma-separated paths. A trailing slash or a relative/absolute path is fine; normalize to repo-relative. The resolved file list is printed in the scope block, so the user can see exactly what was picked up. Folders larger than ~50 files require the confirmation step used for a blank full sweep.

### If the argument is a TD id (e.g. `TD50`)
Find `td/<TDNN>-*.md`; zero or multiple matches → STOP and surface it as a finding (same wording as the milestone case). Grep the whole file for `UC-\d+`, `docs/...md`, `plan/journey/...`, `plan/M\d+...md`, `td/TD\d+...md` exactly as for a milestone, and add each to scope at its normal depth.

**`td/` in a blank/full sweep:** every `td/TD*.md` is in scope. A TD with unfinished stories gets the active-milestone self-consistency pass (3c, plus conformance to `docs/STORY_SCHEMA.md`'s field set); a TD whose stories are all done gets the light pass (3f). Also check each TD's cited docs/paths still resolve (3h) and that `.copilot/context.md`/docs don't still describe as "planned" something a done TD shipped.

### If the argument is a tag (e.g. `tag:backend`)
Run `docs-for --tag <names>`; scope = the docs it lists, each at its `deep`/`light` depth, forming one pool for Step 3b/3g/3h. An unknown tag makes the helper exit non-zero: report the known tags it prints and stop. When the tag is `prototypes`, also add the journeys under the globs that tag covers in the policy (`plan/journey/**`, or its new location after the journeys move) with the Step 2c journey-vs-code check.

### If the argument is a journey path (e.g. `staff/agenda`)
Scope = `plan/journey/<actor>/<slug>.md`, `plan/journey/<actor>/prototypes/<slug>/` (all files), `plan/journey/<actor>/use-cases.md`, `plan/journey/README.md`'s index row for this journey, **plus `plan/journey/shared/` in full** (`tokens.css` and the shared HTML fragments — `dashboard-shell.html`, `hotsite.html`, `login.html`, etc.). `shared/` belongs to no single actor, so every journey audit implicitly depends on it and must include it, not just the actor-specific paths. Light-check `shared/` for internal consistency: does every CSS custom property / shared fragment this journey's prototype actually references still exist there.

### If the argument is one or more doc/journey paths (comma-separated)
Scope = exactly those files/journeys, each depth-classified from its tags (a doc path) or per the journey-path rules above (a journey path) — mixing both kinds in one invocation is expected, not a special case. With 2+ items in scope, Step 3b's cross-doc consistency check treats the whole batch as one pool to cross-reference, not independent single-doc passes — this is what a `/discovery-to-milestone` promotion-verification call relies on.

### If the argument is blank
Scope = every UC, every doc under `docs/` (every top-level doc, depth from its tags), every milestone — active drafts (`plan/M*.md` with no matching `_IMPLEMENTATION_DETAILS_IA.md`) get the full deep self-consistency pass (Step 3c), completed milestones (every milestone with an `_IMPLEMENTATION_DETAILS_IA.md` — count them with `ls plan/*_IMPLEMENTATION_DETAILS_IA.md`, never a hardcoded number) get the light pass (Step 3f) — every journey under `plan/journey/` (including `plan/journey/shared/`, which is not itself a journey but is in scope on every full sweep for the same reason it's always included in a single-journey audit), and `CLAUDE.md`/`.copilot/context.md`.

### Print the resolved scope before proceeding

```
## Docs Audit — scope resolved for <argument>

UCs: <list or "none">
Deep-check docs: <list or "none">
Light-check docs: <list or "none">
Journeys: <list or "none">
Milestone files (deep): <list or "none">
Milestone files (light): <list or "none">
TD files (deep / light): <list or "none">
Journey-vs-code check (Step 2c): <journeys or "none">
CLAUDE.md/context.md: always included

→ This will spawn <N> agent(s): <list categories>.
```

If scope is blank (full sweep), confirm with the user before proceeding given the cost — for any other scope, just proceed.

---

## Step 2 — Bounded parallel agents (skip any category whose group is empty)

Fan-out is **fixed and bounded** — never one agent per doc or per journey.

### Agent prompt template and output contract (every agent in this step)

Give each agent: the exact doc path(s) in its group, the artifact paths to check against (the code globs of the group's tags in the policy, plus the checks described below), and this contract. Agents are **read-only** and return findings, never file contents.

> Verify the doc's claims against the code. Return ONLY: (1) findings, each as `[doc § or id] doc claim → what code says (file:line) → wrong | omitted | stale-reference`; (2) a **Verified correct** list, one line each, **with the file:line you checked** — a "correct" without evidence doesn't count; (3) any code that should be in the doc but isn't (omissions), with file:line. Under ~80 lines. Do not modify anything. Quote nothing longer than one line.

If an agent returns prose without file:line evidence, send it back once for evidence rather than accepting the claim.

### Verify before you report (NON-NEGOTIABLE)

An agent's report is model output, not ground truth. **Before any Stale/Conflicting, omitted, or journey-vs-code finding enters the report or becomes a proposed edit, the main agent re-reads the cited file:line itself** and confirms the claim (a quick targeted read or grep — not a re-audit). Drop findings that don't hold; downgrade ones that only partly hold and say why. Mark each reported finding **verified** (re-read) or **agent-reported, unverified** (only if a re-read wasn't possible, with the reason). This is the same discipline `/pr-review` applies to its Critical/Important findings, and it stops one wrong agent claim from becoming a wrong doc edit.

### (a) UC-vs-code — only if UCs in scope

Spawn 3 Explore agents, in parallel:

- **Agent A — Roles & guards:** for every actor/role term the in-scope UCs use (e.g. "Admin", "Staff", "Manager", "Super admin", "Developer", "Platform operator", "Customer"), grep `apps/bff/src/**/*.controller.ts` for the `@Roles(...)` decorator on the endpoint(s) that UC describes. Report, per UC: the role(s) the doc claims vs. the role(s) the guard actually enforces, and whether they match CLAUDE.md §1's two staff roles (`STAFF`, `MANAGER` — `MANAGER` is a superset) plus `CUSTOMER`. Flag any doc role term with zero corresponding JWT role.

- **Agent B — Endpoints & `.http` coverage:** for every HTTP method+path literal in the in-scope UCs (e.g. `PATCH /customers/me`, `POST /v1/loyalty/redeem`), grep backend (`apps/backend/src/contexts/**/*.controller.ts`) and BFF (`apps/bff/src/**/*.controller.ts`) for a matching route decorator, and grep `apps/backend/http/**/*.http` + `apps/bff/http/**/*.http` for a corresponding request block. Report any UC-stated path with no matching controller route, any method mismatch (UC says PATCH, code has PUT, etc.), and any route missing an `.http` block.

- **Agent C — Entities, enums, settings keys & frontend pages:** for every domain term an in-scope UC asserts as a concrete shape (module types, status enums, `tenants.settings` keys, table/column names), grep the relevant `*.aggregate.ts`, enum, or `docs/21-TENANTS_SETTINGS_SCHEMA.md` and report whether the doc's list matches the code's. Separately, for every in-scope UC that implies a dedicated frontend page/route (a distinct "guest views X" / "customer submits Y" screen, not just an API call), check `apps/web/app/` for a matching page and report MISSING if none exists — this is the IA-gap signal that feeds `plan/journey/`.

### (b) Deep-check docs vs their artifact — only for non-empty groups, max 4 agents total

Group the in-scope deep docs by tag; a doc with several tags goes to the agent of the first of its tags (in the order its `Tags` line lists them) that appears in this list: schema/data (`database`, `events`), architecture/contracts (`backend`, `bff`, `web`, `tenancy`, `prototypes`), process/CI/infra (`infra`), standards/structure (`testing`, `agent-process`). Each group's docs are whatever `docs-for` returns for those tags, not a fixed list.

- **Schema/data agent** (docs tagged `database` or `events`, e.g. the domain model, domain events, database schema and data-retention docs, whichever are in scope): grep aggregates, event classes, migrations, and the settings VO for whether the doc's claimed shapes (entity fields, event names/payloads, table/column names, settings keys + defaults) match.

- **Architecture/contracts agent** (docs tagged `backend`, `bff`, `web`, `tenancy` or `prototypes` and not already given to the schema/data agent, e.g. bounded contexts, architecture, API contracts, BFF and dashboard architecture, error and lock catalogs, whichever are in scope): grep module/controller structure, error mapper classes, and the tenant-isolation interceptor for whether the doc's described boundaries/contracts/error catalog match. For `27`, verify each documented algorithm/state machine/formula against the use case or domain service that implements it; for `28`, verify every catalogued lock (key format, primitive, acquisition order) against the real `pg_advisory_xact_lock` / `findByIdForUpdate` / exclusion-constraint call sites, and flag any lock in code that the catalog omits.

- **Standards/structure agent** (docs tagged `testing` or `agent-process` that also carry a code-glob tag, e.g. the pattern, anti-pattern, code-standard, engineering-rule, repository-structure, value-object and testing docs, whichever are in scope): grep for whether named patterns/forbidden-patterns/VO class names/file locations still match the actual codebase. Cross-doc duplication for this group is handled by Step 3g (which runs across *all* groups); the agent here only reports duplicates it stumbles on. Confirmed real case as of 2026-09-20: the `useExisting`/`useClass` DI pattern was independently fully explained in both `ANTI_PATTERNS.md` (row 68) and (pre-split) `ENGINEERING_RULES.md` (lines 756–767) before TD41 collapsed it to one canonical copy — treat any similarly-shaped pair as a finding.

- **Process/CI/infra agent** (docs tagged `infra`, e.g. workflows, release lifecycle, deployment, tooling map, infrastructure setup, observability and runbooks, whichever are in scope; for the observability doc verify against `packages/observability/src/**` and the collector config). For the infra/runbook docs also verify against `infra/terraform/**` (modules referenced by real roots, `pubsub-catalog.json`) and that every workflow/script a runbook tells an operator to run exists under `.github/workflows/` or `scripts/`: grep `.github/workflows/*.yml` for whether the documented CI gate list (lint, type-check, tests, Snyk/Gitleaks, SonarCloud) and branch-naming convention actually match; grep `docker-compose.yml` for whether the documented local-dev services (Postgres, Pub/Sub emulator, Prometheus/Grafana) match; check whether a `/health/ready`-style endpoint exists if the doc claims a smoke test against one.

Each agent runs ONLY if at least one doc of its group is in the resolved scope.

### (c) Journey/prototype vs implemented code — only if journeys in scope (1 Explore agent per actor folder, max 4; skip actors with nothing in scope)

Step 3d only checks journeys against themselves. This step checks them against what was actually built, for each in-scope journey whose feature has shipped (a journey still marked `gap`/unimplemented in its own mermaid flow or `README.md` index is expected to have no code — report it as "not yet implemented", not as drift):

- **Route & page:** the journey's target route/page exists under `apps/web/app/**`; the screens the prototype shows each have a corresponding component under `apps/web/features|shells/**/components/**`. Report prototype screens with no component, and implemented components/states the prototype never shows.
- **`dev-notes.md` "BFF call":** every endpoint (method + path) named exists as a route in `apps/bff/src/features/**/*.controller.ts`; request/response field names and the validation table's rules match the BFF Zod schema (`*.schemas.ts`) and `@ikaro/types`; role/guard matches `@Roles(...)`.
- **`dev-notes.md` "props" and "file map":** each listed component/file path exists; named props exist on the real component's props type.
- **State machine / statuses:** states and transitions in `dev-notes.md` match the real enum/aggregate (e.g. booking statuses vs CLAUDE.md §5).
- **i18n and CSS names:** copy keys the notes cite exist in `packages/i18n/locales/{pt-BR,en}`; class names the story/notes call "exact" still exist in the implemented component or `tokens.css`.
- **"Known limitations" bullets:** for each, say whether the code still has that limitation (grep the relevant behavior) — stale if the code no longer has it.
Report per journey: drift item · prototype/doc claim · what code does · file:line · **fix direction** (`code wins` — journey shipped, so the notes/prototype must describe what the code does; `story wins` — journey not shipped, so align with the milestone/TD story spec; `ask` — spec and notes disagree, or the code diverges from a spec that still looks intended). Each is fixable with approval under Step 5's file-type rules; `ask` items are batched into the Step 5 question round, never guessed.

---

## Step 3 — Direct-read checks (no subagents — same pattern as today's UC doc-vs-doc pass)

### 3.0 Inventory-table check — run this first, on every in-scope doc
Tables and lists that enumerate files, exports, constraints, locks, routes, error codes, event names, env vars, commands or workflows are the most drift-prone content in the repo and the cheapest to verify mechanically. For each such table/list in an in-scope doc: derive the real set from the code (`ls`/`find` for files, grep/`export` for exports, migrations for constraints, controller decorators for routes, `@ikaro/types` for error codes, `.claude/commands/`/`.github/workflows/` for commands and workflows) and diff it against the doc's rows. Report both directions: **in code, missing from the doc** and **in the doc, gone from code**. Examples this has caught or would catch: a `shared/lib/formatting/` inventory missing a newly exported `formatMonthYearRange` (found by `changed` mode on M18-S11); a catalogued constraint name that a later migration dropped. In `changed` mode, run it first against the docs the changed files map to. Tag these findings `[inventory]` under Stale/Conflicting.

### 3a. UC internal consistency — only if UCs in scope
- Summary table row matches the detail section's `**Actor:**` line and outcome
- Every "see UC-XXX"/"superseded by UC-XXX"/"lives in UC-XXX" reference points to a UC that exists, with a status consistent with how it's being referenced (don't cite an active flow as living inside a UC marked SUPERSEDED)
- `.copilot/context.md` §6 UC index matches the summary table in `docs/04-USE_CASES.md`
- Any booking-status transition named in a UC is valid per CLAUDE.md §5; `NO_SHOW` is valid via UC-074 (M23-S09); no UC references UC-014 or UC-015 as active

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
- `plan/journey/shared/` consistency: every `var(--...)` custom property or shared class this journey's prototype references actually exists in `shared/tokens.css`; every shared HTML fragment (`dashboard-shell.html`, `hotsite.html`, `login.html`, etc.) this journey's screens include/reference still exists and hasn't drifted in a way that breaks the reference

### 3e. `CLAUDE.md`/`.copilot/context.md` self-consistency — always runs (cheap, one file, no agent spawn)
- No duplicated subsections (read top to bottom once; flag any heading/content block that repeats)
- No rule/pattern named in `context.md` is restated in full elsewhere when it should only be a pointer — cross-check `context.md`'s own bullets against the Standards/structure agent's duplication findings (Step 2b) when that group is in scope; a `context.md` bullet describing a named pattern should point to its canonical doc (per TD41's canonical-home rule), not duplicate the explanation
- Every criterion-(c) "writing-time trap" bullet in `context.md` (per TD41's keep-in-file test) has a matching scenario in `docs/AGENT_CONTEXT_TRAP_SCENARIOS.md`, and every scenario there still points to a bullet that exists — flag either direction of drift
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

**Context-budget rule for this pass:** a blank-scope run puts well over 1 MB of light-check docs and milestone IA files in play. Do not read them all into the main context. When the in-scope light-check set exceeds ~300 KB total (`wc -c`), delegate to **at most 3 Explore agents**, partitioned by theme (business/strategy docs · infra/CI/ops docs · completed-milestone IA files), each told to return only findings with file + heading + quote — never file contents. Under that size, stay a direct read.

### 3g. Cross-doc duplication — all groups, not just Standards
Run across every in-scope doc (deep and light) plus `CLAUDE.md`/`.copilot/context.md`. Method: extract the distinctive identifiers of each in-scope doc's sections (class/VO/port names, error codes, event names, table names, rule names, `§` headings), find identifiers whose *explanatory prose* appears in 2+ files, then Read both locations before judging. Pairs most likely to overlap: `04-USE_CASES` ↔ `14-API_CONTRACTS` ↔ `27-BUSINESS_LOGIC_REFERENCE`; `02-DOMAIN_MODEL` ↔ `13-DATABASE_SCHEMA` ↔ `03-DOMAIN_EVENTS`; `08-TESTING_STRATEGY` ↔ `ENGINEERING_RULES_TESTING`; `15`/`16`/`24` ↔ `ENGINEERING_RULES_FRONTEND`/`_BACKEND`; `28-LOCK_CATALOG` ↔ `ENGINEERING_RULES_BACKEND` (race-condition primitives); `ANTI_PATTERNS` ↔ `ENGINEERING_RULES_*` ↔ `CODE_STANDARDS`; unsuffixed `ENGINEERING_RULES.md` ↔ its split files.
- A finding = the same rule/pattern/definition explained in full, independently, in more than one place where one isn't clearly just a pointer to the other. Report each location (file + heading/line).
- Confirmed real case as of 2026-09-20: the `useExisting`/`useClass` DI pattern was independently fully explained in both `ANTI_PATTERNS.md` (row 68) and (pre-split) `ENGINEERING_RULES.md` (lines 756–767) before TD41 collapsed it to one canonical copy — treat any similarly-shaped pair as a finding.
- **Not a finding:** a short summary + pointer; a deliberate per-audience restatement (e.g. a UC's acceptance criterion vs. the endpoint contract it exercises) where the two copies answer different questions; the same fact in a table and in prose of the *same* doc.
- Every finding must carry the **no-loss proof** from the Guiding principle (canonical home Read and confirmed complete; pointer target heading exists) before it is proposed for collapse. Where the two copies differ in detail, the finding is "merge the extra detail into the canonical copy first, then point" — never "drop the shorter one".

### 3h. Pointer and anchor integrity — mechanical, no judgment
- Every `→ doc § heading`, `see docs/X.md § Y`, and `docs/*.md`/`plan/**` path cited in `.copilot/context.md`, `.claude/commands/*.md`, and the in-scope docs: the file exists, and the quoted `§ heading` text matches (case-insensitive substring) a real heading in that file. A dead pointer is context loss — report each as **Dead pointer** with file, line, and the nearest real heading if one is a likely rename. <!-- doc-link:example -->
- Every `§N` section reference to `context.md` resolves to a numbered top-level section that exists.

### 3i. Context-quality pass — in-scope docs, direct read
Not about length. For each in-scope doc ask: would an agent that loads *only this section* act correctly?
- Rule stated without its trigger ("when does this apply") or without scope (which app/layer/context).
- Ambiguous wording, or a rule that contradicts another in-scope doc (also report under 3b).
- A section with no clear canonical home (two docs could plausibly hold it and neither points to the other).
- A long doc with no top-of-file orientation (what it covers / when to load it) or with headings too coarse for an agent to read just the relevant part — suggest heading splits or a short intro, **adding** context, never removing any.
- Stale framing: "planned"/"future"/"TODO" for something that shipped, or "current" for something superseded.
Give a concrete suggested rewrite for each; "unclear" alone is not a finding.

### 3j. Weight report — informational only, never a finding
Print `wc -c` (and approximate tokens = chars/4) for: the 10 largest in-scope docs; `.copilot/context.md` against its CI budget (`packages/architecture-check/agent-context-policy.json`, headroom per section); and the load cost of each `.copilot/context.md` §10 row (sum of the docs it lists). In `changed` mode, also show per-doc growth over the range. This is to show where an agent's on-demand loads are heaviest and where a doc might benefit from better headings (3i) — it does **not** drive any deletion proposal. The only size-related action allowed is a pointer to a heavy §10 row so the user can decide whether to split what that row loads.

---

## Step 4 — Findings report

```
## Docs Audit Report — <scope>

### Stale / Conflicting (doc says X, code says Y)
Every finding is tagged **verified** (main agent re-read the cited file:line) or **agent-reported, unverified** (with why). Inventory-table findings carry an `[inventory]` tag.
1. [UC-XXX] <field> — doc: "<old>" / code: "<actual>" (file:line) · verified → proposed fix: <one-line>
2. [inventory][docs/X.md table] row `foo` — in code, missing from the doc (file:line) · verified → add row

### Internal inconsistencies (doc vs. doc)
1. [CLAUDE.md §19] "Folder structure" subsection appears twice, identical content

### Cross-doc duplication (same pattern fully restated in 2+ files)
1. [useExisting/useClass DI pattern] `ANTI_PATTERNS.md` row 68 and (pre-split) `ENGINEERING_RULES.md` lines 756–767 both fully explain this independently → canonical home: `ANTI_PATTERNS.md` row 68; collapse the other to a pointer. **No-loss proof:** canonical copy Read, contains <X, Y>; extra detail Z from the other copy merged first; target heading exists ✓

### Dead pointers (3h)
1. [context.md §7 line N] `→ docs/X.md § Foo bar` — no such heading; nearest: `§ Foo baz`

### Context-quality (3i)
1. [docs/Y.md § Z] rule has no trigger/scope → suggested rewrite: "<text>"

### Header and tag drift (Step 1)
1. [docs/NEW.md] `docs-for` lists no `Tags`, or a tag whose globs no longer cover the code the doc describes → proposed tag change (CI's `doc-orientation` already fails on a missing or unknown tag, so a finding here is a tag that is present but wrong)

### Weight report (informational — no action implied)
Top docs by size · context.md headroom vs CI budget · §10 row load costs

### IA gaps (UC/doc implies something that doesn't exist)
1. [UC-XXX] <flow> — no page under apps/web/app/... — candidate for plan/journey/<actor>/

### Journey / prototype issues
1. [staff/horarios] 3 sidebar links self-loop instead of pointing to real cross-journey paths

### Journey vs implemented code (Step 2c)
1. [staff/agenda dev-notes "BFF call"] doc: `GET /v1/x` / code: `GET /v1/y` (`apps/bff/.../x.controller.ts:42`) · verified · direction: code wins → proposed fix: <old → new>

### TD / milestone issues
1. [TD50] story S03 `Dependencies:` cites S09, which doesn't exist

### Confirmed correct
Each item carries the file:line that was checked — "correct" with no evidence is not reported.
1. [UC-XXX] <thing> (file:line) ✓
```

If a category has no findings, print `(none found)`.

---

## Step 5 — Resolve findings

For each "Stale/Conflicting" and "Internal inconsistency" finding:
- If code (or the more-recently-updated doc) is the unambiguous source of truth and there's one obvious fix, propose the exact edit (old → new text).
- If the fix requires a judgment call (terminology choice, which doc is authoritative, scope decision), collect it and ask via `AskUserQuestion` — batch all such questions into one round.

For each "Dead pointer": propose the exact corrected pointer (or, if the target content was removed, escalate — never silently delete the pointer). For each "Context-quality" finding: propose the exact rewrite/added intro/heading split; these only add or clarify.

For each "Cross-doc duplication" finding (only with its no-loss proof, per the Guiding principle): propose one canonical home per the rule's type — `ANTI_PATTERNS.md` for "what not to do + why + fix", `docs/ENGINEERING_RULES_*.md`/`CODE_STANDARDS.md` for "how to do it correctly", `CI_TRAPS.md` for CI/deploy-specific gotchas; `CLAUDE.md`/`.copilot/context.md` never holds the full explanation for any of these, only a trigger + pointer. Replace every other location's full text with a `→ doc § heading` pointer. This check is deliberately non-blocking and lives only here, not as an `architecture-check` CI gate — cross-doc semantic duplication isn't a deterministic, low-ambiguity check (the same rule is usually worded differently in each copy), which is exactly the class of check `docs/ANTI_PATTERNS.md` row 143 says to keep out of a mandatory blocking gate.

**File-type rules for what gets auto-fixed:**
- ✅ Auto-fixable (with permission): any `.md` doc text — `docs/*.md`, `plan/M0X-*.md` (including the milestone file's own story headers and dependency references), `plan/journey/*/use-cases.md`, `plan/journey/README.md`'s index table, `CLAUDE.md`/`.copilot/context.md`. (Editing a `plan/journey/` `.md` file to correct a drifted index or stale cross-link is not the same thing CLAUDE.md §15's hard stop guards against — that hard stop is about *creating* new journey/prototype work casually, not about this audit fixing an existing inconsistency.)
- ✅ Fixable with permission, direction-gated: `dev-notes.md`. Shipped journey → code is the source of truth; correct endpoints, field names, props, file paths, statuses/enums, i18n keys, class names and stale "Known limitations" bullets to match the code (each finding verified by a main-agent re-read of the cited file:line). Unshipped journey → align with the story spec in the milestone/TD file. Spec and notes disagree, or code diverges from a spec that still looks intended → `ask` via `AskUserQuestion`, never guess the direction.
- ✅ Fixable with permission, mechanical defects only: `.html` prototype files — `href="#"` or self-looping nav links, wrong shared class names, references to missing `tokens.css` properties or shared fragments, screen-list/file-on-disk mismatches in `index.html`.
- ❌ Never auto-fixed, always listed as a recommendation instead: `.html` changes that alter layout, states, screens or visual design (need the full journey workflow per CLAUDE.md §15); missing `.http` request blocks (need real payload/auth knowledge, not just doc text).

"IA gaps" and journey/prototype issues that require new content (not a text correction) are listed only, not auto-fixed — carry IA gaps into `plan/journey/<actor>/use-cases.md` when that actor's journeys are drafted; carry design-level prototype issues into the next prototype touch-up pass.

Before writing anything, apply CLAUDE.md §0: summarise every proposed edit across all affected files in one message, ask "May I now write these N changes?", and write only after an explicit yes.

If the user says no to a change, note it and proceed with the current docs.

---

## Step 6 — Verdict

```
## Audit verdict — <scope>

✅ N stale/conflicting items fixed
✅ N internal inconsistencies fixed
✅ N duplications collapsed to pointers (each with no-loss proof) · N dead pointers fixed · N context-quality rewrites applied
✅ Zero information removed — every reduction was a verified-duplicate pointer or a code-contradicted correction
📋 N IA gaps recorded — carry into plan/journey/ when drafting that actor's journeys
📋 N journey/prototype issues recorded — carry into the next prototype touch-up
✅ N journey-vs-code drifts fixed (`dev-notes.md` / mechanical `.html`) · 📋 N recorded for the §15 workflow or awaiting a direction decision · N TD/milestone issues
✅ Confirmed correct: N items

Docs are now a verified baseline for journey-mapping / milestone planning / implementation.
```
