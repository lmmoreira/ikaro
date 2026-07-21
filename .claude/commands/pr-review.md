---
name: pr-review
description: Deep multi-perspective PR review - acceptance-criteria verification, correctness, security/tenant-isolation/ops risk, performance/scalability, and architecture/design-pattern/test-quality - cross-checked against docs/ANTI_PATTERNS.md and this codebase's documented rules. Findings ordered Critical/Important/Minor. Always posts the report as a PR comment when a PR exists (mandatory, not gated on asking - required for headless runs dispatched by /pre-pr to complete). Standalone: does not invoke /pre-pr or /bad-smell-audit, and has no opinion about who wrote the code it's reviewing.
metadata:
  short-description: Deep multi-perspective PR review
---

Deep, multi-perspective review of a PR or the local branch's diff against `main`. This is a semantic/reasoning review, complementary to `/pre-pr` (mechanical gate) and `/bad-smell-audit` (structural patterns) — **it never invokes either of those, or any other Claude-Code skill**. Fix nothing — review only.

This skill has no opinion about who wrote the code — it just reviews whatever PR it's pointed at. The decision to ask the *other* tool (Claude vs. Codex) to review a PR belongs to `/pre-pr`, which already knows its own identity trivially the moment it has a PR link — it dispatches this skill to the other tool once the PR is open. This skill can equally well be run standalone, by either tool, against any PR.

Optional argument: `$ARGUMENTS`
- blank — review the local branch: `git diff origin/main...HEAD`
- a PR number — fetch and review that GitHub PR: `gh pr diff <N>`

---

## Step 0 — Resolve scope and story

**Diff + changed files:**
```bash
# local branch (blank argument)
git diff origin/main...HEAD
git diff origin/main...HEAD --name-only

# PR number argument
gh pr view <N> --repo lmmoreira/ikaro --json title,body,headRefName,headRefOid
gh pr diff <N> --repo lmmoreira/ikaro
gh pr diff <N> --repo lmmoreira/ikaro --name-only
```

**Pin the exact commit for accurate reads (PR-number mode only):** the diff shows what changed, but Step 1 also needs each changed file's *full* current content for surrounding context — that's only accurate read from the PR's actual head commit, not whatever happens to be checked out locally (these can easily differ — reviewing PR #N from an unrelated branch, or from `main`, silently reads pre-PR or unrelated content, and produces confidently wrong findings). Fetch the head commit without touching the working directory or current branch, then read files as blobs at that commit instead of via the filesystem:
```bash
git fetch origin <headRefOid> --depth 1
git show <headRefOid>:<path/to/file>
```
In local-branch mode, the working directory already matches the diff being reviewed — no pinning needed, read files normally.

**Resolve the story/TD ID** — check, in order: the PR body's `## Story` section, the branch name (`feat/M0X-SYY-*`, `fix/M0X-SYY-*`, `*TDNN*`), commit messages (`(M0X-SYY)` suffix per this repo's Conventional Commits format). If none of these resolve an ID, ask the user for it before continuing — acceptance-criteria verification cannot run blind.

**Load the story/TD file** (`plan/M0X-*.md` or `td/TDNN-*.md`) and extract:
- The full story/TD section: description, aggregates/fields, dependencies.
- The acceptance-criteria checklist verbatim: `**Acceptance criteria:**` followed by `- [ ]` bullets (stories) or `## Acceptance Criteria (TD-level)` / `## Draft Acceptance Criteria` (TDs).
- Any cited UC number → load that UC's section from `docs/04-USE_CASES.md` (main flow **and every alt flow**).

If the story cites a UC that CLAUDE.md §6 lists as a trap (superseded / future / out-of-MVP / renumbered), flag this immediately as a **Critical** finding before anything else — the story itself may be built against a stale spec, which invalidates the rest of the review's premise until that's resolved.

---

## Step 1 — Four parallel review agents

Spawn four agents in parallel (one message, four `Agent` calls, `subagent_type: general-purpose`). Give each one: the full diff, the changed-file list, the pinned head commit (PR-number mode) or working-directory state (local-branch mode) to read full file content from, plus the story/TD text, the AC checklist, the cited UC flows, and the docs listed under its section below. Instruct each to **read each changed file's current full content** (not just the diff hunk — a hunk alone hides whether a flagged loop/caller pattern already existed before this PR), from the source pinned in Step 0, never from an assumption about what the working directory contains.

**Every agent applies this discipline to every finding, no exceptions:**
1. Read the full surrounding context before reporting — never flag from pattern-matching a single line in isolation.
2. Cross-check against `docs/ANTI_PATTERNS.md`'s full table and any explicit "never / don't / must / forbidden / avoid" rule in `CLAUDE.md` or the docs loaded for this lens. When a finding matches a documented rule or named anti-pattern, **cite it directly** (doc + section/row) instead of general reasoning alone — a grounded finding beats a stylistic opinion.
3. Attach a suggested severity (rubric in Step 2), a one-line rationale, and `file:line`.
4. If genuinely unsure whether something is a real defect vs. an intentional, documented design choice, say so explicitly and suggest Minor rather than guessing Critical.
5. Do not invoke `/pre-pr`, `/bad-smell-audit`, or any other skill.

### Agent A — Requirements & Correctness
- Check off **every** acceptance-criteria bullet individually: Met / Not Met / Partial, each with evidence (`file:line`, or "no corresponding change found").
- Verify the cited UC's main flow **and every alt flow** are implemented — not just the happy path.
- Hunt logic bugs: wrong state transitions (cross-check CLAUDE.md §5 booking state machine if booking-related), off-by-one, wrong error codes, inverted boolean logic, unhandled edges (empty list, zero, null, boundary dates/timezones — default TZ is `America/Sao_Paulo`).
- Backward compatibility: migration expand/contract compliance; event/DTO schema changes checked against existing consumers (grep `@ikaro/types`); whether the PR is safely revertible without a stuck deploy-ordering dependency.
- i18n completeness: any new error code or new visible UI copy has entries in **both** `packages/i18n/locales/pt-BR/` and `.../en/` — this exact gap has broken CI here before (M17-S30).
- Docs: the loaded story/TD, `docs/04-USE_CASES.md` (cited UC), `docs/02-DOMAIN_MODEL.md`, `docs/03-DOMAIN_EVENTS.md` (if event-related), `docs/ANTI_PATTERNS.md`, `CLAUDE.md`.

### Agent B — Security, Tenant Isolation & Operational Risk
Perspectives converging on the same artifact: security engineer, attacker, SRE, DevOps.
- SQL injection / any raw string interpolation into a query.
- Tenant isolation (CLAUDE.md §2): every query filters `tenant_id`; composite FKs use `(tenant_id, id)`; no path to a cross-tenant read/write.
- Token/JWT validation: `sub` used correctly as the backend entity UUID; no trust of client-supplied actor headers where a guard should derive them; BFF tenant-mismatch rejection intact.
- Sensitive data: PII (name, phone, documents — Brazil-market SaaS, LGPD applies) landing in logs, traces, span attributes, or error messages; secrets/tokens hardcoded or logged.
- Idempotency & concurrency: event handlers dedup via `eventId`; optimistic-locking correctness (`manager.save()` on a detached hand-built entity does **not** enforce version safety — needs an explicit version-guarded `UPDATE ... WHERE id AND tenant_id AND version`); cross-row invariants (e.g. booking overlap) enforced inside the write transaction, not left to `@VersionColumn` alone.
- Observability on failure paths: correlation ID passed through (`event.correlationId`, never regenerated), OTel span attributes (`tenant.id`, `user.id`, `correlation.id`) present, and whether an on-call engineer could actually diagnose a prod failure from what's logged.
- Attacker framing for every new/changed endpoint: forged/missing/expired token, tenant-mismatched ID, oversized payload, replayed request.
- Docs: `docs/06-TENANT_ISOLATION_STRATEGY.md`, `docs/10-OBSERVABILITY_STRATEGY.md`, `docs/ENGINEERING_RULES.md`, `docs/ANTI_PATTERNS.md`, CLAUDE.md §2 and §7 critical invariants.

### Agent C — Performance & Scalability
- N+1 query patterns: a DB/repository call invoked inside a loop over a collection that could be one batched query.
- Missing indexes on newly filtered/sorted columns (cross-check `docs/13-DATABASE_SCHEMA.md`).
- Object allocation or expensive computation inside loops that could be hoisted out.
- Unbounded result sets / missing pagination on any new list endpoint or query.
- Synchronous/blocking calls in a hot path (request handler, event handler).
- Large-dataset handling: code that assumes a full in-memory dataset (e.g. loading all of a tenant's bookings) instead of paging/streaming.
- Docs: `docs/13-DATABASE_SCHEMA.md`, `docs/ENGINEERING_RULES.md` (cross-row invariants section), `docs/ANTI_PATTERNS.md`.

### Agent D — Architecture, Design Patterns & Quality
- SOLID violations; single-responsibility breaches.
- No-workarounds rule (CLAUDE.md §7, NON-NEGOTIABLE): suppressed type errors (`as unknown as`), pinned/overridden dependency instead of a real upgrade, a skipped/ignored CI issue, or any short-term hack where a proper root-cause fix was available.
- Ports & adapters: raw SQL / `@InjectRepository` / TypeORM `Repository<T>` outside a repository adapter; a new cross-context Port+Adapter where `infrastructure/cross-context/` already has one for the same context pair.
- Design pattern fit: is the right pattern used (repository, factory for VO creation, builder, strategy for branching policy) — flag **both** directions: over-engineering (abstraction the task didn't need — CLAUDE.md is explicit about no speculative abstraction) and under-engineering (duplicated logic an existing pattern elsewhere in the same bounded context already solves).
- Consistency with sibling code: does this PR solve a problem the same bounded context already solved differently, without reusing it.
- Decoupling / abstraction level: layering respected (`domain/` → `application/` → `infrastructure/`), no framework deps leaking into `domain/`.
- Clean naming; comment discipline (flag comments that just restate *what*; flag missing comments on genuinely non-obvious workarounds or invariants).
- Test meaningfulness: assertions that would actually fail if the underlying logic broke (mentally mutate the implementation — would this test catch it), not just coverage padding; flag tautological or over-mocked tests.
- Error handling: RFC 9457 Problem Details shape, `mapXxxError` pattern followed (never `throw new HttpException` from a use case), messages meaningful enough to debug from, no silently swallowed exceptions.
- Docs: `docs/CODE_STANDARDS.md`, `docs/AGENT_PATTERNS.md`, `docs/ENGINEERING_RULES.md`, `docs/08-TESTING_STRATEGY.md`, `docs/ANTI_PATTERNS.md`, plus `docs/24-BFF_ARCHITECTURE.md` / `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` if BFF/web files are touched.

---

## Step 2 — Synthesis

Collect all four agents' raw findings in the main thread:

1. **Dedupe** — findings from different agents landing on the same `file:line` are merged into one entry combining both rationales; keep the higher severity.
2. **Apply the severity rubric** (agents suggest; the orchestrator enforces consistently):
   - **Critical (must fix):** unmet or partially-met acceptance criterion; any confirmed security vulnerability (SQLi, tenant-isolation bypass, auth/token bypass, secret exposure, PII leak); data loss/corruption risk; silently wrong business logic contradicting the cited UC; a direct violation of a CLAUDE.md NON-NEGOTIABLE rule or a named `docs/ANTI_PATTERNS.md` entry.
   - **Important (should be addressed):** real performance/scalability risk under realistic load; architecture/SOLID/design-pattern violation with genuine maintainability cost; meaningless or tautological tests; missing/unclear error handling for a real failure mode; a documented best-practice violation that isn't NON-NEGOTIABLE.
   - **Minor (nice to have):** naming, small duplication, style, non-blocking readability suggestions, or a finding the agent flagged as uncertain/speculative.
3. Order findings within each severity bucket by agent/category for readability.

---

## Step 3 — Output format

```
## PR Review — <branch or PR#> — <story/TD ID>

**Reviewed by:** <Claude | Codex>, 4-agent review

### Acceptance Criteria
- [x] <AC bullet text> — Met (evidence: file:line)
- [ ] <AC bullet text> — NOT MET (gap: ...)
- [~] <AC bullet text> — Partial (evidence: ...; gap: ...)

### UC Flow Coverage
- [x] Main flow
- [ ] Alt flow A3 — not implemented (...)

---

### 🔴 Critical (must fix)
- [ ] file:line — finding (Agent X: perspective) — doc/anti-pattern ref if applicable
(none found)

### 🟡 Important (should be addressed)
- [ ] file:line — finding (Agent X: perspective)
(none found)

### 🟢 Minor (nice to have)
- [ ] file:line — finding (Agent X: perspective)
(none found)

---
Total: N critical · M important · K minor
```

If a section has no findings, print `(none found)`. Print the AC/UC sections even when everything is met — visibility on what was checked is as important as what failed.

---

## Step 4 — Post as a PR comment (mandatory)

Only skipped when there is no actual GitHub PR to comment on (pure local-diff mode, nothing on GitHub yet). Otherwise, posting is **mandatory, not conditional on asking** — a headless run (`codex exec`, `claude -p`, e.g. dispatched by `/pre-pr`) has no one to answer a confirmation prompt, so an ask-gate here just silently produces nothing; the review must complete end-to-end on its own, same as any other step in this workflow (`/pre-pr` doesn't pause mid-script to ask before each check either).

Resolve the PR to comment on: the `$ARGUMENTS` PR number, or — in local-branch mode — a PR already open for the current branch:
```bash
gh pr list --head "$(git rev-parse --abbrev-ref HEAD)" --repo lmmoreira/ikaro --json number,url --jq '.[0]'
```
If neither applies, skip this step silently — there's nothing to comment on.

Otherwise, post automatically:
1. Write the exact Step 3 report to a temp file, with the 🟢 Minor section wrapped in a collapsible block so a long comment stays scannable:
   ```
   <details>
   <summary>🟢 Minor (nice to have) — N findings</summary>

   ...minor findings...

   </details>
   ```
2. Prefix the comment with a one-line header identifying it as automated and its source, e.g. `> 🤖 Automated review via /pr-review — Codex, 4-agent review.`
3. Post with:
   ```bash
   gh pr comment <N> --repo lmmoreira/ikaro --body-file <path-to-report>
   ```
   `--body-file`, not `--body` — avoids shell-escaping corruption on a large multi-section markdown body.
