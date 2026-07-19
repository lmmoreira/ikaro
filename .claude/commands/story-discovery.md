---
name: story-discovery
description: Run a structured pre-implementation discovery session for a story or TD. Checks doc clarity, completeness, consistency, dependency artifacts, and - for frontend stories - alignment with the validated UX prototype, before any code is written. Ends by asking how the user wants to set up the working environment (worktree vs direct branch).
metadata:
  short-description: Pre-implementation story discovery
---

Run a structured pre-implementation discovery session for a story or TD. Checks doc clarity, completeness, consistency, dependency artifacts, and — for frontend stories — alignment with the validated UX prototype, before any code is written. Ends by asking how the user wants to set up the working environment (worktree vs direct branch).

> **HARD RULE — NO CODE CHANGES:** This skill only reads code and updates documentation files (`.md` plan and doc files). It NEVER writes or modifies any `.ts`, `.js`, or any source/test/config file. If a gap requires a code change (e.g. enriching an event payload, adding a method to an aggregate), flag it as a recommendation in the readiness verdict and let the user decide when and how to handle it — do NOT make the change.

Argument: `$ARGUMENTS` — story ID (e.g. `M09-S04`) or TD ID (e.g. `TD13`).

---

## Step 0 — Workspace state check

Run these checks **before** reading any plan or doc files.

**1. Detect existing branch for this story:**
```bash
git branch -a | grep -i "<story-id>"
```
If a branch already exists → **RISK**: "Branch `<branch-name>` already exists for this story — are you resuming interrupted work? Confirm before creating a new branch."

**2. Detect dirty working tree:**
```bash
git status --short
```
If output is non-empty → **RISK**: "Working tree has uncommitted changes — stash or commit them before starting a new story."

**3. Check if story is already done:**
In the plan file (located in Step 1), look for `✅ Done` next to the story ID. If found → **BLOCKER**: "Story `<story-id>` is already marked ✅ Done — should not be re-implemented. Confirm with user before proceeding."

Surface any findings here immediately. If a BLOCKER is found in Step 0, stop and report it — do not proceed to Step 1 without user confirmation.

---

## Step 1 — Locate the story

**Story ID format:**
- `M<N>-S<NN>` (e.g. `M09-S04`) → plan file: `plan/<milestone>-*.md` — exclude `*_IMPLEMENTATION_DETAILS_IA.md` and `*_IMPLEMENTATION_DETAILS_DEVELOPER.md`
- `TD<N>` (e.g. `TD13`) → plan file: `td/TD<N>-*.md`

**Exactly one match expected** — if zero or more than one file matches, STOP:
> Found <N> files matching `<pattern>`: <list>. Ambiguous — confirm with the user which file is canonical before proceeding.

Read the file and find `### <story-id> —` (full `M<milestone>-S<NN>` form, e.g. `M13-S01` — not a bare `S01`). For TDs, find the primary heading or section. If not found, stop:
> Story `<story-id>` not found in `<file>`. Check the ID and try again.

Extract these fields from the story block:
- Title, Agent target, Complexity
- **Docs to load** — every path + optional `§ Section` listed
- Description (all prose)
- Backend use case steps (numbered list)
- BFF endpoint spec (method, path, auth, response)
- Acceptance criteria (all checkboxes)
- Dependencies (story IDs) — note their status (Done / Pending)
- **Prototype references** — every `plan/journey/...` path listed under a "Prototype references:", "Prototype reference:", or milestone-level "Journey prototype:" line
- Any mention of: new DB migration/entity, new i18n keys, new env vars, new Pub/Sub topics, feature flags

**Also check story status:** Look for `✅ Done` next to the story heading (Step 0 check #3).

**Immediately after extracting story content — spawn one Explore agent for symbol search.**

From the Dependencies list and the story description, derive every artifact symbol the story expects (aggregate methods, use-case class names, event names, port names, component names, fetcher function names, page route paths — using the vocabulary rules in Step 3). Spawn an Explore agent with "very thorough" breadth and instruct it to run, for each symbol:

```bash
grep -r "<symbol>" apps/ --include="*.ts" --include="*.tsx" -l
```

The agent should return `{symbol, found: true/false, matchingFiles: [...]}` for each. Continue to Step 2 immediately without waiting — collect results before Step 4.

---

## Step 2 — Load referenced docs

For each entry in "Docs to load":
1. Verify the file path exists.
2. If a `§ Section` is specified, confirm that heading exists inside the file.
3. Read the relevant content.

Also load unconditionally:
- `docs/CODE_STANDARDS.md`
- `docs/AGENT_PATTERNS.md`
- The matching `plan/<milestone>_IMPLEMENTATION_DETAILS_IA.md` (if it exists — older milestones have one; use it to understand established patterns for this milestone)

For each entry in "Prototype references":
1. Verify the file path exists.
2. Also load that folder's `dev-notes.md` and `index.html` — even if not explicitly cited, they're the canonical implementation-handoff and screen-inventory files for the prototype.
3. Load the parent journey `.md` spec (e.g. `plan/journey/staff/agenda.md` for a prototype under `staff/prototypes/agenda/`).

Flag any path that doesn't resolve as a **BLOCKER**.

---

## Step 3 — Dependency symbol check

Collect the results from the Explore agent spawned at the end of Step 1. If the agent has not yet returned, wait for it now.

The symbol vocabulary (used to brief the agent and to interpret its results):
- **`backend-ts`/`bff-ts` dependencies:** aggregate methods, use-case class names, event names, port interface names, repository method names.
- **`frontend-ts`/`web-ts` dependencies:** component names, page/route file paths, hook names, exported fetcher function names (e.g. `DashboardShell`, `fetchStaffBookings`, `apps/web/app/dashboard/bookings/page.tsx`) — these live under `apps/web/`, not `apps/backend/`/`apps/bff/`.
- **`devops` dependencies (live infra/cloud state):** when a dependency story is tagged `Agent: devops` and its own Acceptance Criteria describe *live* cloud state (an org policy, an IAM binding, an enabled API, a DNS record, a provisioned account) rather than committed code, a `✅ Done` marker is **not sufficient evidence** the AC is still true — plan-file status only proves the story was closed out, not that the described state exists today. Run one live, read-only check per such AC line — a real cloud-API read (`gcloud ... describe`/`list`, or equivalent) or a refresh-backed Terraform check (`terraform plan -refresh-only`) — before treating it as a **Confirmation**. **Never `terraform state show`**: it only reflects what the state *file* records, not the live provider, so it cannot catch the exact class of drift this rule exists to catch. If the check can't be run yet, or fails, it becomes a **BLOCKER** — same treatment as a missing code symbol below, never a softer RISK — with the exact command and its actual output (or the reason it couldn't run) noted, so the gap is visible before any code is written. (M17-S14 precedent, 2026-07-17: S07 was marked ✅ Done but its own "project-level org-policy exceptions" AC line had never actually been executed — caught only mid-implementation via a live check that should have run here instead.)
- **`devops` IAM/binding forward-references (target resource doesn't exist yet):** when a devops story's own IAM/permission table includes a binding whose *target resource* (a specific Cloud Run service, Pub/Sub topic, secret, bucket, etc.) is created by a story that comes *later* in the dependency chain — or isn't a dependency at all — that binding cannot literally be created by this story; Terraform can't reference a resource that doesn't exist yet. For every binding row in the story's own table, check whether the target resource's owning story appears in this story's own Dependencies list (or is this same story). If not, flag as **[ORDERING]** RISK and propose the binding be created by whichever story actually owns the target resource instead (which must then depend on this story for the principal to exist) — never attempt to grant IAM on a resource this story's Terraform has no way to reference. (M17-S15/S17 precedent, 2026-07-18: S15's registry module originally described granting reader access to "runtime SAs" that don't exist until S17; S17's own table listed `run.invoker`/`pubsub.publisher` bindings on Cloud Run services and Pub/Sub topics that don't exist until S18/S19 — both caught only during story-discovery, twice in the same session.)

Also check: do any dependency stories have status **Pending**? If a required upstream story is not done → **BLOCKER**: "Story `<dep-id>` is a dependency and is not yet marked Done."

If a symbol has `found: false` → **BLOCKER — dependency artifact not found in codebase**. The same applies to a failed or unconfirmed live infra-state check above.

---

## Step 4 — Discovery checklist

Run every check silently. Tag each finding as **BLOCKER**, **RISK**, or **CONFIRMATION**.

### 4a. Doc validity
- Every "Docs to load" path exists and resolves (`docs/archive/` refs are always blockers — superseded content)
- Every referenced `§ Section` heading exists in its file

### 4b. Use case completeness
- The UC section in `docs/04-USE_CASES.md` covers all flows the story description mentions
- Acceptance criteria address the UC's main flow + primary alternative flows
- Every failure mode in acceptance criteria has a named HTTP status code
- Config-driven values name the exact `tenants.settings` key (cross-check against `docs/21-TENANTS_SETTINGS_SCHEMA.md`)

### 4c. State machine consistency
- Every state transition the story triggers is valid per CLAUDE.md §5
- No criterion references `NO_SHOW` (not in MVP)
- No reference to UC-014 or UC-015 (superseded by UC-021/UC-022)

### 4d. Event envelope completeness
- Every event the story emits is defined in `docs/03-DOMAIN_EVENTS.md`
- Each event carries: `eventId`, `tenantId`, `occurredAt`, `correlationId`, `eventName`, `eventVersion`, `data`
- Domain-specific payload fields (e.g. `isBusiness`, `cancelledBy`) are documented

### 4e. Multi-tenancy invariants
- Every query implied by the story filters by `tenant_id`
- Cross-aggregate references use composite FKs `(tenant_id, id)`
- No implied `UNIQUE(google_oauth_id)` alone for customers

### 4f. Test coverage readability
- At least one tenant-isolation acceptance criterion (Tenant A data + Tenant B caller → 404/403)
- At least one integration test scenario is specified
- Acceptance criteria are concrete enough to derive test names from

### 4g. Cross-context data access
- Data from another context is accessed via events, BFF orchestration, or a named port — not direct repo injection
- Port interfaces referenced in the story are named explicitly

### 4h. API contract
- BFF endpoint: method, path, auth requirement (role/JWT), and response body fields are all specified
- Shared endpoints (same path, different role) explicitly state how routing/branching works

### 4i. Configuration / settings
- Every configurable threshold names its exact `tenants.settings` path
- No hardcoded business values in use-case steps

### 4j. Conflicts with project standards
- Story doesn't contradict CLAUDE.md §7 engineering rules or §8 anti-patterns
- Story doesn't conflict with patterns locked in prior milestones' `_IMPLEMENTATION_DETAILS_IA.md`

### 4k. Journey / prototype alignment (frontend stories — `Agent: frontend-ts`/`web-ts`, or any story citing a `plan/journey/` path)
- Frontend-facing story with **no** prototype reference at all → **RISK** — UI wasn't UX-validated via a prototype before this story was written
- Component/route names the story introduces match what `dev-notes.md`'s file map / per-screen sections call them — no invented names that drift from the prototype's documented components
- Exact pt-BR copy/error strings in the acceptance criteria match the prototype's validated copy verbatim — don't let a story re-invent wording the prototype already settled
- Every unhappy-path/variant screen present in the prototype folder (loading, fetch-error, validation-error, empty, success states) has a corresponding acceptance criterion — a screen that exists in the prototype but is silently dropped from the story's AC is a UX regression, not a scope simplification
- Every "Known limitations" bullet in the prototype's `dev-notes.md` is either addressed by this story's AC or explicitly carried into the story's own open questions
- `index.html`'s dry-run checklist questions are either answered by the story's AC or explicitly left open

### 4l. Infrastructure / environment
- Does the story introduce a new **Pub/Sub topic**? → RISK: topic must be provisioned in infra config before deployment; flag it
- Does the story require a new **env var**? → RISK: verify naming follows `SNAKE_UPPER_CASE`; flag it for `.env.example` update
- Does the story use a **feature flag**? → RISK: flag must follow `FEATURE_FLAG_XYZ=true` convention (CLAUDE.md §1); verify it's not wired to an external system

### 4m. i18n keys
- Does the story description or acceptance criteria mention UI copy, labels, or error messages? → Check if the story lists the exact `packages/i18n/locales/en/web.json` + `pt-BR/web.json` keys to be added
- If UI copy is implied but no i18n keys are specified → **RISK**: "Story implies new UI copy but doesn't name i18n keys — both locale files must be updated in the same commit"

### 4n. Migration / entity registration
- Does the story add a new TypeORM entity or database migration? → **RISK**: "`integration-global-setup.ts` must be updated in the same commit — missing registration causes silent test failures"
- Check that the migration follows expand/contract (backward-compatible) — no destructive column drops in a single step

---

## Step 5 — Print findings

Start with a **Story scope summary** — a quick mental model for the agent before listing findings:

```
## Story Discovery — <story-id>: <title>

### Scope summary
- **Layers:** <backend | BFF | frontend | full-stack>
- **Core pattern:** <e.g. "new use case + BFF endpoint" / "new React component consuming existing BFF route">
- **Upstream deps:** <N> stories (<list with status>)
- **Migration required:** yes / no
- **i18n keys required:** yes / no
- **Feature flag:** yes (`FEATURE_FLAG_XYZ`) / no
```

Then list findings:

```
### Blockers (resolve before writing any code)
1. [DOC-PATH] `docs/03-DOMAIN_EVENTS.md §BookingRescheduled` — section not found
2. [SYMBOL] `booking.reschedule()` — no match in apps/ — M07-S03 may be incomplete
3. [DEP] Story `M09-S02` is a dependency and is not yet marked Done

### Risks (could cause rework mid-story)
1. [COVERAGE] No tenant-isolation acceptance criterion — CI gate will require one
2. [API] BFF routing for shared PATCH endpoint not described — ambiguous which use case is called
3. [JOURNEY] No prototype reference found for this frontend story — UX wasn't validated before the story was written
4. [I18N] Story implies new UI copy but doesn't name i18n keys
5. [MIGRATION] New entity detected — verify `integration-global-setup.ts` is updated in same commit

### Confirmations (assumed settled — flag if any are wrong)
1. APPROVED → CANCELLED transition is valid per state machine ✓
2. `cancellation_window_hours` key exists in docs/21-TENANTS_SETTINGS_SCHEMA.md ✓
3. PATCH /v1/bookings/:id/cancel endpoint created in M09-S01 — this story reuses it ✓
4. "Tentar novamente" retry-button copy matches `01e-submit-error.html` exactly ✓
```

If zero blockers and zero risks, emit:
```
✅ No issues found. Story is implementation-ready.
```
and skip Steps 6–7, go directly to Step 8.

---

## Step 6 — Questions to the user (one shot)

Collect every question that requires human input (i.e., the answer isn't derivable from the existing docs) and post them all at once in a single numbered list. Group by theme. Distinguish blockers (must resolve before starting) from risks (can proceed with a stated default).

```
## Questions before we start

Please answer all at once — I'll wait for one reply before proposing any doc changes.

**Event payload**
1. [BLOCKER] `BookingRescheduled` isn't in `docs/03-DOMAIN_EVENTS.md`. Should `data` carry `previousScheduledAt` + `newScheduledAt` + `rescheduledBy`? Or a different shape?

**BFF routing**
2. [RISK] The story says one `PATCH /v1/bookings/:id/reschedule` endpoint but doesn't say how the BFF picks the backend use case. JWT role only, or also a body flag? (Default assumption: JWT role — confirm or override.)

**Defaults**
3. [CONFIRMATION] I'm reading "cancellation_window_hours absent → fall back to 48h" as the intent. Correct, or should a missing setting be a hard error?
```

Wait for the user's single reply before continuing.

---

## Step 7 — Propose doc updates

> **DOCS ONLY.** This step updates `.md` files only — plan files and docs in `docs/`. Never touch `.ts`, `.js`, migration files, or any source/test/config file.

For every blocker or risk that a doc gap caused (missing event payload field, ambiguous criterion, wrong reference, missing consumer), propose a concrete doc fix. Show the exact content to add/change.

If resolving the gap would also require a **code change** (e.g. enriching an event class interface or updating an aggregate method), do NOT make the code change. Instead, include it in the readiness verdict under a dedicated section:

```
### Code changes required before implementation
- `booking-cancelled.event.ts` — add `scheduledAt`, `lineSummary`, `totalPrice` fields to interface
- `booking.aggregate.ts` — update `cancel()` to populate the new fields at emit time
These changes are outside the scope of story-discovery. Implement them on the feature branch before writing story code, or address them in a separate preparatory commit on main.
```

For EACH doc change, apply §0 permission protocol:
1. Summarise what you intend to write.
2. Ask: "May I now update `<path>`?"
3. Write only after an explicit yes.

If the user says no to a change, note it and proceed with the current docs.

**Worktree note:** any doc edit written in this step lands in the main checkout, uncommitted. If Step 9 below results in `EnterWorktree` being called, the new worktree branches fresh from `origin/main` — it does **not** carry forward uncommitted changes sitting in the main checkout. A Step-7 doc edit made before entering a worktree is silently orphaned unless reapplied inside the worktree (confirmed in M17-S32, 2026-07-19: `docs/24-BFF_ARCHITECTURE.md` had to be rewritten a second time after `EnterWorktree`). If the user picks worktree in Step 9, redo any Step-7 doc edits inside the worktree before writing story code — or defer them to Step 9 entirely and make them from inside the worktree in the first place.

---

## Step 8 — Readiness verdict

After all questions are answered and doc updates are applied (or declined), emit a final verdict:

```
## Readiness verdict

✅ READY — all blockers resolved.

What was clarified:
- BookingRescheduled payload: previousScheduledAt + newScheduledAt + rescheduledBy
- BFF routing: JWT role determines use case (STAFF|MANAGER → admin; CUSTOMER → customer)
- Missing cancellation_window_hours → default 48h
- Tenant-isolation criterion added to plan file
```

or:

```
## Readiness verdict

❌ NOT READY — N blocker(s) unresolved.

Remaining blockers:
- [SYMBOL] booking.reschedule() not found in codebase — fix dependency before starting

Do not start implementation until all blockers are cleared.
```

If NOT READY, stop here. Do not proceed to Step 9.

---

## Step 9 — Working environment setup

Only reached when Step 8 verdict is ✅ READY.

Ask the user:

```
## Working environment

How do you want to work on this story?

1. **Worktree** — isolated copy of the repo under `.claude/worktrees/`. Safe for parallel work; requires cleanup after PR merge.
2. **Direct branch** — feature branch in the main working directory. Simpler; no cleanup needed.

Reply with `1` / `worktree` or `2` / `direct`.
```

Wait for reply, then:

**If worktree:**
- Use the `EnterWorktree` tool with branch name `feat/<story-id-lowercase>-<short-description>` (e.g. `feat/m09-s04-booking-reschedule`).
- After `EnterWorktree` completes, confirm the worktree path and branch to the user.
- Remind: after the PR is merged, clean up with:
  ```bash
  git worktree remove .claude/worktrees/<name> --force
  git branch -D <branch-name>
  ```
  Then verify with `git worktree list` and `ls .claude/worktrees/`.

**If direct branch:**
- Output the branch creation command for the user to run (per §9 Step 1 of CLAUDE.md):
  ```bash
  git checkout -b feat/M<N>-S<NN>-<short-description>
  ```
- Wait for the user to confirm before any code is written.

Either way, end with:
```
Ready. Next: implement per §9 Step 2 — write all files from the story spec.
Remember: before every `git commit`, list the files and ask "Anything else to add before I commit?" (§0).
```
