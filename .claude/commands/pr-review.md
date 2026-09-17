---
name: pr-review
description: Deep multi-perspective PR review - acceptance-criteria verification, correctness, security/tenant-isolation/ops risk, performance/scalability, and architecture/design-pattern/test-quality - plus infrastructure/cloud/DevOps-SRE review (IAM, secrets, blast radius, cost) when Terraform or CI/CD workflow files are touched - cross-checked against docs/ANTI_PATTERNS.md and this codebase's documented rules. Findings ordered Critical/Important/Minor. Every Critical/Important finding is independently re-verified and checked against the PR's own comment/review history before posting, to catch factually incorrect or duplicate findings before they go out. Always posts the report as a PR comment when a PR exists (mandatory, not gated on asking - required for headless runs dispatched by /pre-pr to complete). Standalone: does not invoke /pre-pr or /bad-smell-audit, and has no opinion about who wrote the code it's reviewing.
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

**Resolve the PR number now and fetch its comment/review history — needed by Step 3's dedupe pass, and reused by Step 5's posting step so it's only resolved once:**
```bash
# $ARGUMENTS PR number, or — in local-branch mode — a PR already open for the current branch
gh pr list --head "$(git rev-parse --abbrev-ref HEAD)" --repo lmmoreira/ikaro --json number,url --jq '.[0]'

# If a PR number resolved, fetch its full history now:
gh api repos/lmmoreira/ikaro/issues/<N>/comments --paginate    # top-level comments: prior /pr-review posts, triage replies, human declines
gh api repos/lmmoreira/ikaro/pulls/<N>/comments --paginate     # inline review comments (CodeRabbit/Codex line comments + replies)
gh api repos/lmmoreira/ikaro/pulls/<N>/reviews --paginate      # review-level verdicts
```
No PR resolves (pure local-diff mode, nothing open yet) — note it here once: Step 3's dedupe pass and Step 5's posting step both skip for the same reason, there's no history to check or comment on.

**Resolve the story/TD ID** — check, in order: the PR body's `## Story` section, the branch name (`feat/M0X-SYY-*`, `fix/M0X-SYY-*`, `*TDNN*`), commit messages (`(M0X-SYY)` suffix per this repo's Conventional Commits format). If none of these resolve an ID, ask the user for it before continuing — acceptance-criteria verification cannot run blind.

**Load the story/TD file** (`plan/M0X-*.md` or `td/TDNN-*.md`) and extract:
- The full story/TD section: description, aggregates/fields, dependencies.
- The acceptance-criteria checklist verbatim: `**Acceptance criteria:**` followed by `- [ ]` bullets (stories) or `## Acceptance Criteria (TD-level)` / `## Draft Acceptance Criteria` (TDs).
- Any cited UC number → load that UC's section from `docs/04-USE_CASES.md` (main flow **and every alt flow**).

If the story cites a UC that CLAUDE.md §6 lists as a trap (superseded / future / out-of-MVP / renumbered), flag this immediately as a **Critical** finding before anything else — the story itself may be built against a stale spec, which invalidates the rest of the review's premise until that's resolved.

**Detect infra scope (for Step 1's conditional Agent E):**
```bash
# local branch (blank argument)
git diff origin/main...HEAD --name-only | grep -E '^(infra/terraform/|infra/docker/|\.github/workflows/|Dockerfile|docker-compose)'

# PR number argument
gh pr diff <N> --repo lmmoreira/ikaro --name-only | grep -E '^(infra/terraform/|infra/docker/|\.github/workflows/|Dockerfile|docker-compose)'
```
Non-empty output → this PR touches infra/pipeline files, spawn Agent E in Step 1. Empty → four agents only, same as today. (`infra/docker/` added 2026-08-12 — the bare `Dockerfile` alternative only matches a root-level file; a nested one like `infra/docker/otel-collector/Dockerfile` needs its own path prefix.)

---

## Step 1 — Four (or five) parallel review agents

Spawn four agents in parallel (one message, four `Agent` calls, `subagent_type: general-purpose`) — five if Step 0's infra-scope check was non-empty, adding Agent E below. Give each one: the full diff, the changed-file list, the pinned head commit (PR-number mode) or working-directory state (local-branch mode) to read full file content from, plus the story/TD text, the AC checklist, the cited UC flows, and the docs listed under its section below. Instruct each to **read each changed file's current full content** (not just the diff hunk — a hunk alone hides whether a flagged loop/caller pattern already existed before this PR), from the source pinned in Step 0, never from an assumption about what the working directory contains.

**Each agent's checklist below is a floor, not the full scope (2026-08-12).** If investigating one item leads into a related file, a sibling CI workflow, a doc section not explicitly listed, or a cross-cutting invariant from CLAUDE.md that isn't spelled out below — follow it. A fixed checklist can only catch what someone already thought to write down; the highest-value findings are often the ones nobody anticipated. Depth within a lens and breadth beyond it are both in scope.

**Every agent applies this discipline to every finding, no exceptions:**
1. Read the full surrounding context before reporting — never flag from pattern-matching a single line in isolation.
2. Cross-check against `docs/ANTI_PATTERNS.md`'s full table and any explicit "never / don't / must / forbidden / avoid" rule in `CLAUDE.md` or the docs loaded for this lens. When a finding matches a documented rule or named anti-pattern, **cite it directly** (doc + section/row) instead of general reasoning alone — a grounded finding beats a stylistic opinion.
3. **Verify against the real primary source before asserting anything about third-party/external behavior, or about this codebase's own current state (2026-08-12; broadened 2026-09-17 — PR #483's history showed the codebase's-own-state case is just as often wrong).** A claim about a library's actual default, a cloud API's actual constraint, a framework's actual runtime behavior — never assert this from memory alone; fetch the real docs (`WebFetch`), pull the real package (`npm pack`/`npm view`, then read its source), or run the real binary (`docker run`, a local repro). The identical discipline applies to a claim about *this* codebase: if the finding asserts a schema/data invariant could be violated ("a tenant could have two X", "this row could be missing Y"), grep the actual migration/constraint before asserting it — a partial unique index or exclusion constraint can make the claimed scenario structurally impossible (PR #483, M22-S03: a Critical claiming duplicate `LOCATION` backfill rows was declined, factually incorrect, against a real DB-level unique index — then an equivalent claim was independently re-raised 9 rounds later). If the finding asserts broken/invalid behavior in code that ships with test coverage, check whether an existing test already exercises that exact scenario before asserting it's broken — a passing test is stronger evidence than re-reading the code by eye (PR #483 round 13: a Critical claiming an `ON CONFLICT` clause used invalid SQL was declined, factually incorrect, against an integration test that had exercised that exact clause successfully across all 13 review rounds). **A Critical alleging existing, tested code is fundamentally broken/non-functional carries the highest cost when wrong — it needs the highest evidence bar: reproduce it for real (run the query, run the test), not just read the code and reason about it.** This is this codebase's own established discipline (`docs/ENGINEERING_RULES.md`'s incident history is built on "checked directly," "confirmed against the real pinned binary," "refuted, not just unconfirmed" — see `docs/ANTI_PATTERNS.md`'s rows on unverified quota/CPU hypotheses for what happens when this step is skipped). An unverified claim, even a plausible-sounding one, is not a finding yet.
4. **Once a bug/anti-pattern is confirmed at one call site, sweep for the same pattern at every structurally similar site in the same file and bounded context before finalizing — report all of them together, not just the one first noticed.** A bug found and fixed at one site while an identical, already-known instance sits untouched elsewhere just means the same defect gets rediscovered piecemeal, round after round (PR #483, M22-S03: a tenant-wide-vs-per-service buffer-override bug was fixed in the resource-scoped path across rounds 7-8, with round 7's own triage note recording that the identical pattern was "verified" to also exist, unchanged, in `GetAvailabilityUseCase.calculateDegenerate()` — that sibling instance wasn't independently confirmed-and-fixed until round 12, four rounds later, despite already being on record).
5. **Before flagging missing precision/coverage as a defect, check the story/TD's own Non-Goals/out-of-scope language first.** A gap that's already a documented, deliberate scope boundary isn't a finding (PR #483, M22-S03: three separate findings across three different rounds were all eventually declined on the identical basis — the milestone's own Non-Goals section explicitly deferring that precision to a later milestone; two of the three were close to a word-for-word repeat of each other one round apart, which Step 3 below also would have caught, but checking Non-Goals up front avoids raising it at all).
6. Attach a suggested severity (rubric in Step 2), a one-line rationale, and `file:line`.
7. If genuinely unsure whether something is a real defect vs. an intentional, documented design choice, say so explicitly and suggest Minor rather than guessing Critical.
8. Do not invoke `/pre-pr`, `/bad-smell-audit`, or any other skill.

### Agent A — Requirements & Correctness
- Check off **every** acceptance-criteria bullet individually: Met / Not Met / Partial, each with evidence (`file:line`, or "no corresponding change found").
- Verify the cited UC's main flow **and every alt flow** are implemented — not just the happy path.
- Hunt logic bugs: wrong state transitions (cross-check CLAUDE.md §5 booking state machine if booking-related), off-by-one, wrong error codes, inverted boolean logic, unhandled edges (empty list, zero, null, boundary dates/timezones — default TZ is `America/Sao_Paulo`).
- Backward compatibility: migration expand/contract compliance (full rules + pre-production exception: `docs/DEFINITION_OF_DONE.md`); event/DTO schema changes checked against existing consumers (grep `@ikaro/types`); whether the PR is safely revertible without a stuck deploy-ordering dependency. New/modified migration → `docs/13-DATABASE_SCHEMA.md`'s matching table must be updated in the same PR (a full `/docs-audit` sweep, 2026-08-04, found 6 tables where this had already drifted).
- Hardcoded business values: any threshold/window/limit that reads like a business rule (a cancellation window, an expiry period, a points value) must read from `tenants.settings` (cross-check `docs/21-TENANTS_SETTINGS_SCHEMA.md`), never a literal constant.
- **Stale-reference sweep — treat this as the actual enforcement point, not `/docs-audit`.** `/docs-audit` is a safety net for what already slipped through; a miss here is the defect, not something the next audit will eventually catch for free. Two directions, both mandatory per `docs/DEFINITION_OF_DONE.md`:
  - *Replaces/removes:* if this PR replaces or removes an existing flow/mechanism (an auth pattern, a data model assumption, a transport layer, a dead endpoint), did it update `docs/*.md`, other milestones' `plan/*_IMPLEMENTATION_DETAILS_*.md`, `.claude/commands/**`, `.claude/skills/**`, and `scripts/**` for stale references to the old version?
  - *Ships a GAP:* if this PR builds a screen/flow that a `plan/journey/<actor>/<slug>.md` currently marks `❓ GAP`, did it flip that status (mermaid node + Prototype table) in the same PR — not just update `dev-notes.md`? The 2026-08-04 sweep found this exact pattern in every actor's journeys (28 findings) specifically because `dev-notes.md` got updated and the journey `.md` consistently didn't — this is the recurring failure mode to watch for, not a hypothetical one.
- i18n completeness: any new error code or new visible UI copy has entries in **both** `packages/i18n/locales/pt-BR/` and `.../en/` — this exact gap has broken CI here before (M17-S30).
- Docs: the loaded story/TD, `docs/04-USE_CASES.md` (cited UC), `docs/02-DOMAIN_MODEL.md`, `docs/03-DOMAIN_EVENTS.md` (if event-related), `docs/21-TENANTS_SETTINGS_SCHEMA.md`, `docs/DEFINITION_OF_DONE.md`, `docs/ANTI_PATTERNS.md`, `CLAUDE.md`.

### Agent B — Security, Tenant Isolation & Operational Risk
Perspectives converging on the same artifact: security engineer, attacker, SRE, DevOps.
- SQL injection / any raw string interpolation into a query.
- Tenant isolation (CLAUDE.md §2): every query filters `tenant_id`; composite FKs use `(tenant_id, id)`; no path to a cross-tenant read/write.
- Token/JWT validation: `sub` used correctly as the backend entity UUID; no trust of client-supplied actor headers where a guard should derive them; BFF tenant-mismatch rejection intact.
- Sensitive data: PII (name, phone, documents — Brazil-market SaaS, LGPD applies) landing in logs, traces, span attributes, or error messages; secrets/tokens hardcoded or logged.
- Idempotency & concurrency: event handlers dedup via `eventId`; optimistic-locking correctness (`manager.save()` on a detached hand-built entity does **not** enforce version safety — needs an explicit version-guarded `UPDATE ... WHERE id AND tenant_id AND version`); cross-row invariants (e.g. booking overlap) enforced inside the write transaction, not left to `@VersionColumn` alone.
- Observability on failure paths: correlation ID passed through (`event.correlationId`, never regenerated), OTel span attributes (`tenant.id`, `user.id`, `correlation.id`) present, and whether an on-call engineer could actually diagnose a prod failure from what's logged.
- **New/changed metrics carry `tenant_id`, or the gap is a documented, reasoned exception (2026-08-12):** CLAUDE.md §2 rule 8 says "logs, metrics, **and** traces include `tenant_id`" — not just spans/logs. If a PR adds a counter/histogram/gauge with no `tenant_id`-equivalent label, that's a real invariant violation unless the PR itself documents why (e.g. a cardinality tradeoff — a per-tenant label on a high-volume metric multiplying series count — mirroring `## Loki Label Strategy` in `docs/10-OBSERVABILITY_STRATEGY.md`, which already makes the identical call for logs). Don't let "it's just an HTTP metric" wave this past — check whether the auto-instrumentation or library in use has any way to carry the label before accepting the gap as unavoidable, and if it doesn't, say so explicitly (found via M17-S55, PR #362: this exact gap existed for two full review passes before being caught).
- Attacker framing for every new/changed endpoint: forged/missing/expired token, tenant-mismatched ID, oversized payload, replayed request.
- Docs: `docs/06-TENANT_ISOLATION_STRATEGY.md`, `docs/10-OBSERVABILITY_STRATEGY.md`, `docs/ENGINEERING_RULES.md` (critical invariants — Interceptor-vs-Middleware, cross-service I/O in transactions, `declare global` typing trap — live here now; CLAUDE.md §7 only holds short pointers to them), `docs/ANTI_PATTERNS.md`, CLAUDE.md §2.

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
- CLAUDE.md §7's 3 NON-NEGOTIABLE principles:
  - **No workarounds:** suppressed type errors (`as unknown as`), pinned/overridden dependency instead of a real upgrade, a skipped/ignored CI issue, or any short-term hack where a proper root-cause fix was available.
  - **No improvisation:** if the story/TD cited a specific reference (a library, an existing pattern, a named example), does the implementation actually use it, or does it quietly substitute a bespoke alternative presented as equivalent.
  - **Mounting complexity:** does the implementation need multiple stacked safeguards/exceptions/special-cases where a structurally simpler approach — an existing port/adapter, an existing pattern from `docs/AGENT_PATTERNS.md` — would need none of it.
- Ports & adapters: raw SQL / `@InjectRepository` / TypeORM `Repository<T>` outside a repository adapter; a new cross-context Port+Adapter where `infrastructure/cross-context/` already has one for the same context pair.
- Repository-slice placement (CLAUDE.md §11): do new/moved files match the domain-slice rules — in particular, an actor-scoped view of another domain's aggregate (e.g. a Customer reading their own Booking/Loyalty data) belongs in the *owning* domain's slice, never the actor's slice (TD31 Story 11 precedent — this exact mistake already happened once).
- Design pattern fit: is the right pattern used (repository, factory for VO creation, builder, strategy for branching policy) — flag **both** directions: over-engineering (abstraction the task didn't need — `docs/CODE_STANDARDS.md` § Comments and abstraction discipline is explicit about no speculative abstraction) and under-engineering (duplicated logic an existing pattern elsewhere in the same bounded context already solves).
- Consistency with sibling code: does this PR solve a problem the same bounded context already solved differently, without reusing it.
- Decoupling / abstraction level: layering respected (`domain/` → `application/` → `infrastructure/`), no framework deps leaking into `domain/`.
- Clean naming; comment discipline per `docs/CODE_STANDARDS.md` § Comments and abstraction discipline (flag comments that just restate *what*; flag missing comments on genuinely non-obvious workarounds or invariants).
- Test meaningfulness: assertions that would actually fail if the underlying logic broke (mentally mutate the implementation — would this test catch it), not just coverage padding; flag tautological or over-mocked tests.
- Error handling: RFC 9457 Problem Details shape, `mapXxxError` pattern followed (never `throw new HttpException` from a use case), messages meaningful enough to debug from, no silently swallowed exceptions.
- Docs: `docs/CODE_STANDARDS.md`, `docs/AGENT_PATTERNS.md`, `docs/ENGINEERING_RULES.md`, `docs/08-TESTING_STRATEGY.md`, `docs/ANTI_PATTERNS.md`, `docs/REPOSITORY_STRUCTURE.md`, plus `docs/24-BFF_ARCHITECTURE.md` / `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` if BFF/web files are touched, `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` if hotsite files are touched (`app/[slug]/`, `shells/hotsite/components/`, `features/platform/hotsite/`).

### Agent E — Infrastructure, Cloud & DevOps/SRE (spawned only when Step 0's infra-scope check is non-empty)
Perspectives converging on the same artifact: security engineer, SRE, cost owner, on-call.
- IAM least-privilege: any new/changed `google_*_iam_*` binding follows `infra/terraform/README.md`'s "IAM binding review discipline" — role scoped to the resource it needs, not `roles/editor`/`roles/owner`; flag a broad predefined role where the workflow only uses a subset of its grants (M17 CI SA permission gaps precedent — tf-planner/tf-deployer roles went untested until S24).
- Secrets & sensitive data: no plaintext secret in a `.tfvars` file, module default, or committed state; `sensitive = true` on any output/variable that should be masked in plan/apply logs; secrets sourced from Secret Manager, never baked into an image or env var literal.
- Blast radius & apply safety: does a prod-affecting resource change go through plan-then-approve, or can it apply unattended; is the `envs/staging` vs `envs/prod` boundary respected, or does a shared module change silently drift the two environments out of parity.
- State & backend: no local backend, no hardcoded state bucket/path duplicated elsewhere ("Public-repository security" / "Remote-state verification" sections of `infra/terraform/README.md`); no manual `terraform import`/`-target` workflow implied that bypasses the pipeline.
- Network/ingress posture: public exposure of a resource that should be internal-only (Cloud Run ingress, firewall/network rule, public GCS bucket/object); default-deny posture not weakened.
- Cost & right-sizing: Cloud Run min/max instances and DB tier changes justified by an actual load reason (not copy-pasted from another module); orphaned/unused resources left behind by a refactor.
- CI/CD pipeline changes (`.github/workflows/**`): required-status-check ordering — never adding a check to branch protection before its workflow is merged and has run on `main` at least once; `zizmor`/`actionlint` concerns (script injection via untrusted `${{ }}` interpolation, missing `permissions:` scoping).
- **Cross-workflow ordering (2026-08-12):** if this PR creates or changes a producer→consumer relationship between two *independently-triggered* workflows (one publishes an image/artifact/digest another workflow resolves and deploys; one workflow's output is assumed ready by another) — check whether the ordering is actually guaranteed (`needs:` within one workflow, a `workflow_run` trigger, or an explicit live-state check against the Actions API) or merely assumed because they usually finish in a convenient order. Two workflows triggered by the same push, filtered to disjoint `paths:`, with no dependency between them, is the shape to watch for — a single commit touching both path sets races (found via M17-S55, PR #362: `deploy-staging.yml` could resolve `otel-collector:latest` before `build-otel-collector.yml`'s `push` job finished publishing it, silently deploying app code paired with a stale sidecar image).
- Module design & reuse: a new resource defined ad hoc when an existing module in `infra/terraform/modules/` already covers the same concern (check the "Module dependency graph" section); Checkov custom checks (`.checkov/custom_checks`) updated if a new resource type needs one.
- Test coverage: new/changed resource or module has `.tftest.hcl` coverage per the "Unit-test convention" section of `infra/terraform/README.md`.
- Docs: `infra/terraform/README.md`, `plan/M17-CLOUD-DEPLOY.md` §0–§2, `docs/12-DEPLOYMENT_STRATEGY.md`, `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md`, `docs/22-TECH_STACK_DECISIONS.md`; vendored `.claude/skills/terraform-style-guide/` for style/convention questions.

---

## Step 2 — Synthesis

Collect all four agents' raw findings in the main thread:

1. **Dedupe** — findings from different agents landing on the same `file:line` are merged into one entry combining both rationales; keep the higher severity.
2. **Apply the severity rubric** (agents suggest; the orchestrator enforces consistently):
   - **Critical (must fix):** unmet or partially-met acceptance criterion; any confirmed security vulnerability (SQLi, tenant-isolation bypass, auth/token bypass, secret exposure, PII leak); data loss/corruption risk; silently wrong business logic contradicting the cited UC; a direct violation of a CLAUDE.md NON-NEGOTIABLE rule or a named `docs/ANTI_PATTERNS.md` entry; an infra change that grants overly broad IAM (`roles/editor`/`roles/owner` where a scoped role suffices), exposes a secret in plaintext (tfvars, state, logs), or lets a prod-affecting resource apply unreviewed.
   - **Important (should be addressed):** real performance/scalability risk under realistic load; architecture/SOLID/design-pattern violation with genuine maintainability cost; meaningless or tautological tests; missing/unclear error handling for a real failure mode; a documented best-practice violation that isn't NON-NEGOTIABLE; infra module duplication where an existing module already covers the resource, missing `.tftest.hcl` coverage for a new/changed module, or an unjustified cost/right-sizing change.
   - **Minor (nice to have):** naming, small duplication, style, non-blocking readability suggestions, or a finding the agent flagged as uncertain/speculative.
3. Order findings within each severity bucket by agent/category for readability.

---

## Step 3 — Validate & dedupe against this PR's own history (mandatory, every Critical/Important finding)

Run this pass over Step 2's synthesized list before anything reaches the report in Step 4. Two independent problems motivate it, both observed across the real 13-round review history of PR #483 (M22-S03) — and both stem from the same root cause: each `/pr-review` dispatch (from `/pre-pr`'s `nohup codex exec ...`, or a fresh `/pr-land` round) runs as a memoryless process with zero visibility into any earlier round, so nothing catches these unless this step explicitly goes and looks.

- **A finding that's confidently wrong resurfaces after already being refuted.** Round 4 flagged a Critical — the backfill migration would insert duplicate `LOCATION` occupancy rows for a tenant with two active locations — declined as factually incorrect against a real DB-level unique index. Round 13, nine rounds later, independently re-derived the same false premise as a fresh Important finding, costing a full round to re-prove an already-settled fact.
- **A finding repeats an already-answered one almost immediately.** Round 10 declined "the write path deterministically picks the first N pool members and can reject a slot the read path advertises as available" as an already-documented M23 scope boundary. Round 11, the very next round, raised close to the same finding again, word-for-word, and it was declined again on identical grounds.

**1. Independently re-verify every Critical/Important finding before it's finalized.** Step 1 item 3 already requires primary-source verification, including for the codebase's own state — treat this as the final check, not a repeat of the agent's own claimed diligence:
   - Re-read the cited `file:line` yourself, in full surrounding context — not the agent's excerpt.
   - If the finding asserts a schema/data invariant, grep the actual migration/constraint yourself before accepting it.
   - If the finding asserts broken/invalid behavior in tested code, check for an existing passing test exercising that exact scenario before accepting it — and for any Critical alleging existing code is fundamentally broken, actually reproduce it (run the query, run the test) rather than reasoning from a read-through.
   - Re-confirm the cited doc/anti-pattern/rule actually says what the finding claims — open the section, don't trust the agent's paraphrase.
   - A finding that doesn't survive this re-check is dropped, not downgraded to Minor "just in case."

**2. Check this PR's existing comment/review history before including anything**, using what Step 0 fetched:
   - Search for the same `file:line` or the same underlying claim — a differently-worded finding about the same fact still counts as the same finding; match on substance, not exact text.
   - **Already fixed** by a later commit → drop it, it's stale.
   - **Already raised and declined/answered with reasoning that still holds against the current diff** → drop it; cite the existing comment instead of re-litigating (`file:line — see <comment URL>, already addressed`). Don't blindly trust an old decline either — if the code touching that fact changed since the reply, re-verify per step 1 above before trusting it.
   - **Already raised, still open, no reply yet** → don't repost a duplicate finding; reference the open thread instead of restating it fresh.
   - **Never raised before** → keep it as a new finding.
   - No PR exists yet (pure local-diff mode) → skip this whole step, there's no history to check.

---

## Step 4 — Output format

```
## PR Review — <branch or PR#> — <story/TD ID>

**Reviewed by:** <Claude | Codex>, <N>-agent review (N = 5 when Agent E ran, else 4)

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

If a section has no findings, print `(none found)`. Print the AC/UC sections even when everything is met — visibility on what was checked is as important as what failed. A finding kept only because Step 3 found it already open and unanswered elsewhere should link the existing comment instead of restating it fully (`file:line — see <comment URL>, already flagged, still unresolved`).

---

## Step 5 — Post as a PR comment (mandatory)

Only skipped when there is no actual GitHub PR to comment on (pure local-diff mode, nothing on GitHub yet). Otherwise, posting is **mandatory, not conditional on asking** — a headless run (`codex exec`, `claude -p`, e.g. dispatched by `/pre-pr`) has no one to answer a confirmation prompt, so an ask-gate here just silently produces nothing; the review must complete end-to-end on its own, same as any other step in this workflow (`/pre-pr` doesn't pause mid-script to ask before each check either).

Reuse the PR number resolved in Step 0 — no need to re-resolve it. If none resolved there, skip this step silently — there's nothing to comment on.

Otherwise, post automatically:
1. Write the exact Step 4 report to a temp file, with the 🟢 Minor section wrapped in a collapsible block so a long comment stays scannable:
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
