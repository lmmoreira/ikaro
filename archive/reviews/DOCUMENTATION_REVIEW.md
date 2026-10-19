# BeloAuto Documentation Review

**Reviewer:** AI agent (Claude Opus 4.7)
**Date:** 2026-05-11
**Scope:** Every `.md` under the repo, including `docs/`, root-level files, and `.copilot/`. Excludes `docs/archive/` (historical).
**Goal:** Assess consistency, correctness, completeness, and AI-agent readiness of the documentation set that will drive future development.

---

## 1. Executive Summary

The corpus is **strong on design** (business context, domain model, bounded contexts, tenant isolation) and **weak on execution scaffolding** (no source code, no IaC, no workflow YAML, no tech-stack decisions). That gap is already acknowledged in `AI_IMPLEMENTATION_READINESS.md` and the prior `DOCUMENTATION_REVIEW.md`, both of which are themselves largely duplicates and should be consolidated.

In addition, this review surfaces a **second class of problem** the prior reviews missed: internal contradictions and stale cross-references within the supposedly-complete design tier. None are catastrophic, but every one of them will silently mislead a future AI agent generating code from the docs. They must be resolved before any code is written.

**Headline numbers:**

| Dimension | Score | Notes |
|---|---|---|
| Business/domain clarity | 9/10 | Excellent personas, journeys, isolation rules |
| Internal consistency | 5/10 | 14 substantive contradictions found (see §3) |
| Use case coverage | 6/10 | 7 missing UCs (see §5), 2 duplicate pairs |
| AI-agent readiness | 4/10 | Agent context files reference nonexistent paths |
| Implementation scaffolds | 2/10 | No code, no IaC, no Docker, no workflow YAML |
| Process docs (CI/CD, release, ops) | 7/10 | Good outline, branching naming inconsistent |

**Recommended order of work:**
1. Fix the inconsistencies in §3 (1–2 hours, mechanical).
2. Resolve the use-case duplicates and add the missing UCs in §5 (4–6 hours, requires user input).
3. Make the tech-stack decisions enumerated in `AI_IMPLEMENTATION_READINESS.md` (user decision).
4. Generate the missing scaffolds (Dockerfiles, workflow YAML, Terraform, `SETUP.md`).
5. Add the missing docs in §6 (ADR log, error catalog, data-retention, etc.).
6. Delete or merge the redundant root files in §7.

---

## 2. Methodology & Severity Legend

Every issue below cites the file and (where useful) line number, plus a one-line recommended fix.

| Severity | Meaning |
|---|---|
| 🔴 **Blocker** | Will cause incorrect code if an AI agent follows the docs literally. Must fix before coding. |
| 🟠 **Major** | Significant ambiguity, contradiction, or missing-but-important content. Should fix soon. |
| 🟡 **Minor** | Stylistic / housekeeping / small drift. Fix when convenient. |
| 🔵 **Nit** | Typo, dead reference, formatting. |

---

## 3. Internal Contradictions & Stale References

### 3.1 🔴 Loyalty aggregate is named two different things

- `docs/02-DOMAIN_MODEL.md:258` calls the root aggregate `LoyaltyTransaction` (a ledger pattern).
- `docs/05-BOUNDED_CONTEXTS.md:101,200,212-213` calls it `LoyaltyRecord`.
- `docs/QUICK_REFERENCE.md:67,109,159` calls it `LoyaltyRecord`.
- `docs/13-DATABASE_SCHEMA.md:93-106` implements the ledger as `loyalty_transactions` (matches `02`).
- `.copilot/context.md:62,76` calls it `LoyaltyRecord`.

**Impact:** An AI agent told to "implement the Loyalty aggregate" will produce two different designs depending on which doc it grabs first. The ledger model in `02` and `13` is the right one (auditability, expiration). All other references should be renamed.

**Fix:** Single rename across `05`, `QUICK_REFERENCE`, `.copilot/context.md`, and any derivative files to `LoyaltyTransaction`. Keep the ledger pattern.

---

### 3.2 🔴 Test-coverage threshold is 70% in one doc and 80% in five others

| Doc | Threshold |
|---|---|
| `docs/07-ENGINEERING_PRINCIPLES.md:161,219,272` | **70%+** |
| `docs/08-TESTING_STRATEGY.md:19,79` | **>80%** |
| `docs/09-CI_CD_PIPELINE.md:76` | **>80%** |
| `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md:70` | **below 80%** |
| `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md:61` | **above 80%** |

**Impact:** `07-ENGINEERING_PRINCIPLES.md` is explicitly designated "the north star" by `AI_AGENT_DOCUMENTATION.md` and by the index in `docs/README.md`. So the north star contradicts the CI gate. An agent will pick one and the CI will reject the result.

**Fix:** Decide one number. Recommend **80%** (matches CI gate, frontend doc, and testing strategy). Update `07` lines 161, 219, 272.

---

### 3.3 🔴 `INFO_REQUESTED` is a booking status in the API but not in the domain model

- `docs/14-API_CONTRACTS.md:96` lists API status enum `APPROVED | REJECTED | CANCELLED | INFO_REQUESTED`.
- `docs/02-DOMAIN_MODEL.md:101,425` defines `BookingStatus = PENDING | APPROVED | REJECTED | COMPLETED | CANCELLED` (no `INFO_REQUESTED`).
- `docs/04-USE_CASES.md:152` (UC-005) says "System keeps booking in PENDING state" — i.e. info-requested is **not** a separate state, just a side-effect.

**Impact:** Database constraint will fail when API tries to write `INFO_REQUESTED`. Or the domain logic will silently allow a status it doesn't recognise.

**Fix:** Either remove `INFO_REQUESTED` from the API enum and use a separate flag/note field, or add it to the domain `BookingStatus`. Recommend the former — match the UC-005 intent (still PENDING + `awaitingInfo: true`).

---

### 3.4 🔴 Event payload examples omit `tenantId` despite the mandatory rule

- `docs/03-DOMAIN_EVENTS.md:7` says "All domain events include `tenantId`".
- The example payloads for `BookingApproved` (line 47–58), `BookingRejected` (70–80), `BookingInfoRequested` (90–100), `BookingCompleted` (110–121), `BookingCancelled` (197–210), the three reminder events (130–192), and `EmailSent`/`EmailFailed` (286–317) **omit** `tenantId`.
- Only `BookingRequested` (19–34) shows it.

**Impact:** Agents producing event classes will follow the example structure, not the prose. Cross-tenant data leak risk via events.

**Fix:** Add `tenantId: string` to every event-payload example. Also add `eventId` (UUID for idempotency) and `occurredAt` (canonical timestamp) — both are mentioned by name only in scattered prose.

---

### 3.5 🔴 `BookingCancelled` event section is missing its heading

`docs/03-DOMAIN_EVENTS.md:194-215` — the section that defines `BookingCancelled` opens with `---` and then `- **Trigger:** Customer or admin cancels...` with **no `#### BookingCancelled` heading**. Visually it looks like a continuation of `AdminDailyScheduleReminder`.

**Fix:** Insert `#### BookingCancelled` above line 195.

---

### 3.6 🔴 `carPhotoUrl` is singular in events but plural everywhere else

- `docs/03-DOMAIN_EVENTS.md:32` — `BookingRequested.carPhotoUrl: string | null` (singular).
- `docs/02-DOMAIN_MODEL.md:121` — `carPhotoUrls: String[]`.
- `docs/04-USE_CASES.md:44-46` — "uploads one or more car photos".
- `docs/13-DATABASE_SCHEMA.md:82` — `photos JSONB { "before": [], "after": [] }`.
- `docs/14-API_CONTRACTS.md:90` — `"photoUrls": ["https://..."]`.

**Fix:** Change event to `carPhotoUrls: string[]`. Decide on a single attribute name across model/schema/API (recommend `photoUrls` everywhere for simplicity, with `kind: "before"|"after"`).

---

### 3.7 🟠 UC-014/UC-015 duplicate UC-021/UC-022

`docs/04-USE_CASES.md`:
- UC-014 (line 369) "Customer Logs In (Google OAuth)" — *pre-multi-tenancy version*.
- UC-021 (line 563) "Customer Login (with Tenant Selection)" — *correct version*.
- UC-015 (line 393) "Staff Logs In (Google OAuth)" — *pre-multi-tenancy version*.
- UC-022 (line 596) "Staff Login (No Tenant Selection)" — *correct version*.

The UC summary table at lines 642–666 still lists both. `.copilot/context.md:135` calls UC-14/15 "OUTDATED" but they remain in the canonical file.

**Fix:** Delete UC-014 and UC-015 from `04-USE_CASES.md`, renumber subsequent UCs **or** keep numbering and mark `[SUPERSEDED]` explicitly. Recommend keeping numbering and adding a "Superseded by UC-021" notice in the body — renumbering ripples through every doc.

---

### 3.8 🟠 Branch name is `master` in some docs and `main` in others

- `docs/09-CI_CD_PIPELINE.md:14,17,20,25,30` — uses `master` consistently.
- `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md:11` — "single long-lived branch: `main` (or `master`)" — ambiguous.
- `docs/18-RELEASE_LIFECYCLE_OPERATIONS.md:20,29,30,38,52` — uses `main`.
- The repo's actual default branch: **`master`** (per `git status`).

**Fix:** Standardise on `master` everywhere (matches the repo) or rename the branch to `main` and update `09`. Recommend `master` since renaming a branch with no remote yet is trivial but the docs lock in `master`.

---

### 3.9 🟠 Hexagonal folder structure is described two ways

- `docs/11-ARCHITECTURE.md:91-108` puts `domain/`, `application/`, `infrastructure/` **inside each context** (`src/contexts/booking/infrastructure/`).
- `.copilot/context.md:289-313` puts a single shared `/src/infrastructure/` at the top level alongside `/src/contexts/`.

**Impact:** Two different module layouts. Affects every import path the agent will generate.

**Fix:** Pick one. The per-context layout in `11` is more in line with hexagonal isolation and matches the "extract to microservice without code changes" benefit; recommend keeping it and rewriting the section in `.copilot/context.md`.

---

### 3.10 🟠 Tenant-config values are hardcoded in some UCs and configurable in others

- `docs/04-USE_CASES.md:194` (UC-007) hardcodes "Time to booking ≥ 48 hours".
- `docs/13-DATABASE_SCHEMA.md:34` shows `tenants.settings JSONB` containing `loyalty_expiry_days: 180, cancellation_window_hours: 48`.
- `docs/02-DOMAIN_MODEL.md:442` says expiration is "Configurable per system (not per service)".

**Impact:** UCs imply a constant; schema implies per-tenant config. Generated code will hardcode `48`.

**Fix:** UCs should reference `tenants.settings.cancellation_window_hours`. State that defaults are 48h cancellation, 180-day expiration, but always read from tenant settings.

---

### 3.11 🟠 No `Tenant`/`Platform` bounded context, but tenant lifecycle is needed

- `docs/02`, `05`, `QUICK_REFERENCE` all say "5 bounded contexts".
- `docs/13-DATABASE_SCHEMA.md:28-36` defines a `Tenants` table with `slug`, `settings`, `is_active`.
- `docs/14-API_CONTRACTS.md:28,48` exposes `GET /auth/tenants` and `GET /tenants/slug/:slug`.
- `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md:13-34` consumes a tenant manifest.
- But: no use case for **creating** a tenant, **inviting staff**, **editing tenant settings**, or **managing the hotsite manifest**.

**Fix:** Add a 6th "Platform" or "Tenant Management" bounded context (owner of the `Tenants` aggregate, `HotsiteConfig`, super-admin operations) and corresponding UCs.

---

### 3.12 🟡 `docs/README.md` is missing 07-ENGINEERING_PRINCIPLES from its index

The "Phase 1" listing (`docs/README.md:9-31`) jumps from `06-TENANT_ISOLATION_STRATEGY` straight to "Phase 2 - 08-TESTING_STRATEGY". `07-ENGINEERING_PRINCIPLES.md` exists, is described elsewhere as the north star, and is the only Phase-1 → Phase-2 bridge doc — but it's not in the index.

**Fix:** Insert `07-ENGINEERING_PRINCIPLES.md` between `06` and `08` in the index.

---

### 3.13 🟡 `docs/AI_AGENT_DOCUMENTATION.md` has broken paths and orphaned text

Several broken file references introduced by what looks like an over-eager find/replace:
- `:108` — `docs/07-06-TENANT_ISOLATION_STRATEGY.md` (no such file)
- `:135,394` — `06-TENANT_ISOLATION_STRATEGY.md` referenced inconsistently
- `:399,442,443` — `07-06-TENANT_ISOLATION_STRATEGY.md` and `06-06-TENANT_ISOLATION_STRATEGY.md`
- `:443` — `08-AI_AGENT_DOCUMENTATION.md` (file is unnumbered)
- `:636` — trailing garbage `t.md, etc.)` after the EOF marker

Also: `:187,196-201` instructs to *create* `claude.md` via `ln -s` — but `claude.md` and `gemini.md` already exist as symlinks (per `ls -la`). The doc is stale by ~2 days.

**Fix:** Rewrite this file (proposed as part of this review).

---

### 3.14 🟡 Root-level `COPILOT_CLI.md` shows a wrong project layout

`COPILOT_CLI.md:304-323` lists `06-TENANT_ISOLATION_STRATEGY.md` and `07-...` at the **project root** (no `docs/` prefix). They live in `docs/`.

It also shows `src/` and `tests/` as "Phase 2 - code" / "Phase 2 - tests" — neither directory exists yet, but the section reads as if they do.

**Fix:** Either delete this file (it duplicates `.copilot/context.md`) or rewrite the structure section.

---

### 3.15 🟡 `.copilot/context.md` lists the tenancy doc twice with two descriptions

```
06-TENANT_ISOLATION_STRATEGY.md - Customer multi-tenant, staff single-tenant   (:224)
06-TENANT_ISOLATION_STRATEGY.md - Tenant isolation design                       (:225)
```

Same file, listed under "Specific Topics" twice. Also the "Auth question" and "Tenant question" rows of the "When to Reference Which Doc" table both point to the same file — fine, but the duplicated entry above is a copy-paste artefact.

**Fix:** Rewrite this file (proposed as part of this review).

---

### 3.16 🔵 Trailing references / typos

- `docs/14-API_CONTRACTS.md:158` — "Next: `15-HOTSET_ROUTING_STRATEGY.md`" should be `15-HOTSITE_DYNAMIC_ARCHITECTURE.md`.
- `docs/AI_AGENT_DOCUMENTATION.md:636` — orphaned `t.md, etc.)`.
- `docs/06-TENANT_ISOLATION_STRATEGY.md:92-93` — claims to "Replace" archived files, but the archived files are still present and indexed elsewhere; the wording is fine but the cleanup is incomplete.

---

## 4. Tenant Isolation Sanity Check

Cross-checked the multi-tenant rules across all relevant files:

| Rule | `01-BUSINESS` | `06-TENANT_ISOLATION` | `02-DOMAIN_MODEL` | `13-DB_SCHEMA` | `14-API` | `03-EVENTS` |
|---|---|---|---|---|---|---|
| Every table has `tenant_id` | ✅ | ✅ | ✅ | ✅ | ✅ | n/a |
| Every query filters by `tenant_id` | ✅ | ✅ | ✅ | ✅ | ✅ | n/a |
| Customers multi-tenant (no unique on email) | ✅ | ✅ | ✅ | ✅ | ✅ | n/a |
| Staff single-tenant (UNIQUE(tenantId, oauthId)) | ✅ | ✅ | ✅ | ✅ | ✅ | n/a |
| Every event includes `tenantId` | ✅ | ✅ | ✅ | n/a | n/a | ⚠️ rule stated, examples omit |
| Storage paths prefixed by tenant | n/a | ✅ | n/a | n/a | n/a | n/a |
| Logs/metrics tagged with `tenant_id` | n/a | ✅ (also `10-OBSERVABILITY`) | n/a | n/a | n/a | n/a |
| Email templates branded per tenant | ✅ | ✅ | ✅ | ✅ | n/a | n/a |
| Composite FKs (tenant_id, id) | n/a | ✅ | n/a | ✅ | n/a | n/a |

**Verdict:** Rules are consistent at the prose level. The only enforcement gap is §3.4 (event payload examples).

---

## 5. Use-Case Audit

### 5.1 Numbering & duplication

| UC | Title | Status | Issue |
|---|---|---|---|
| UC-001 | Guest requests booking | ✅ | — |
| UC-002 | Customer requests booking | ✅ | — |
| UC-003 | Admin approves booking | ✅ | — |
| UC-004 | Admin rejects booking | ✅ | — |
| UC-005 | Admin requests more info | ✅ | See §3.3 — INFO_REQUESTED status leak |
| UC-006 | Customer views bookings | ✅ | — |
| UC-007 | Customer cancels booking | ✅ | See §3.10 — hardcoded 48h |
| UC-008 | Admin cancels or reschedules booking | ⚠️ | "Reschedule" alt flow is one line; no event, no state. Needs its own UC or richer spec. |
| UC-009 | Mark booking complete | ✅ | — |
| UC-010 | Close schedule | ✅ | Need to specify what happens to existing bookings on closed dates (alt flow A1 mentions warning but no resolution UC). |
| UC-011 | View calendar availability | ✅ | — |
| UC-012 | Create service | ✅ | — |
| UC-013 | Edit service | ✅ | Hard-delete vs deactivate distinction unclear. |
| UC-014 | Customer login (OAuth) | ❌ Duplicate | Superseded by UC-021 (see §3.7) |
| UC-015 | Staff login (OAuth) | ❌ Duplicate | Superseded by UC-022 (see §3.7) |
| UC-016 | View loyalty metrics | ✅ | — |
| UC-017 | View analytics | 🟡 Stub | Marked "Future"; fine for MVP |
| UC-018 | Admin daily schedule reminder | ✅ | — |
| UC-019 | Customer reminder (day before) | ✅ | — |
| UC-020 | Customer reminder (day of) | ✅ | — |
| UC-021 | Customer login + tenant selection | ✅ | Canonical |
| UC-022 | Staff login (single tenant) | ✅ | Canonical |
| UC-023 | Customer switches tenant | ✅ | — |

### 5.2 Missing use cases (gaps)

Found 12 user actions implied by the domain/schema/API but with no UC:

| # | Missing UC | Why it matters | Implied by |
|---|---|---|---|
| 1 | **Onboard new tenant** (create company) | First UC of the whole platform; nothing else works without it | `tenants` table, slug routing |
| 2 | **Create / invite staff member** | UC-015 alt-flow A2 says "Superadmin must create staff account first" — that's a UC | Staff aggregate, `is_active` field |
| 3 | **Deactivate staff member** | Staff has `is_active`; no UC to flip it | Staff aggregate |
| 4 | **Edit tenant settings** (loyalty expiry, cancellation window, business hours) | Schema has `settings JSONB`; nothing toggles it | `tenants.settings` JSONB |
| 5 | **Manage hotsite content** (branding, layout modules, gallery items, testimonials) | Entire manifest system in `15-HOTSITE_DYNAMIC_ARCHITECTURE.md` has no UC | `hotsite_configs` table |
| 6 | **Update customer profile** (name, phone) | Profile pre-fill in UC-002 implies an edit screen | Customer aggregate |
| 7 | ~~Redeem loyalty points~~ | **Removed from MVP scope** on 2026-05-11. Loyalty is earn-only; gifts/rewards are an admin business action outside the system. | (resolved) |
| 8 | ~~Manual loyalty adjustment~~ | **Removed from MVP scope** on 2026-05-11. No `ADJUSTMENT` row type. If needed later, add a single UC + new event type. | (resolved) |
| 9 | **Manage email templates** (per-tenant branded notifications) | `notification_templates` aggregate; nothing to edit it | `notification_templates` table |
| 10 | **View / retry failed notifications** | `EmailFailed` event implies a UI for ops | `notifications.status = FAILED` |
| 11 | **Customer data export / delete** (GDPR/LGPD) | Required for any EU/Brazil-facing SaaS — name suggests Brazilian | Compliance |
| 12 | **Audit log viewing** | `BookingAuditLogEntry` exists, no UI/UC | Booking aggregate |

### 5.3 Use-case quality observations

- Every UC has Actor / Preconditions / Trigger / Main / Alt / Postconditions / Events — excellent structure.
- "Events Triggered" is sometimes a UI/system event labelled "not a domain event" (UC-012, UC-013, UC-014, UC-015, UC-018). Decide whether to introduce `ServiceCreated`, `ServiceUpdated`, `StaffLoggedIn` domain events or keep them out — currently inconsistent ("System event, not domain event" for some, "None" for others).
- No UC specifies validation rules in detail (max photo size, accepted MIME types, email regex, phone pattern). These are alluded to but never enumerated — leads to ad-hoc decisions in code.

---

## 6. Missing Documentation

The following are **referenced or implied** but have no dedicated section anywhere:

### 6.1 Engineering / process
1. **ADR (Architecture Decision Records) log** — `AI_IMPLEMENTATION_READINESS.md` calls for `TECH_STACK.md`; `COPILOT_CLI.md` calls for `TECHNICAL_DECISIONS.md`. Neither exists. Tech stack remains undecided (8 open questions in `AI_IMPLEMENTATION_READINESS.md`).
2. **Error code catalog** — `14-API_CONTRACTS.md` references RFC 9457 Problem Details but lists no error codes / titles / types.
3. **Validation rules** — email, phone, photo size/type, slug pattern, duration min/max, price ranges.
4. **Local setup guide (`SETUP.md`)** — prerequisites, first-time bootstrap, troubleshooting.
5. **Feature flag strategy** — mentioned in TBD section but no implementation guidance.
6. **API versioning policy** — `/v1` is in the base URL, no rule on what triggers `/v2`.

### 6.2 Security / compliance
7. **Secrets management policy** — `18-RELEASE_LIFECYCLE_OPERATIONS.md` mentions Secret Manager but no rotation cadence, no naming convention, no break-glass procedure.
8. **GDPR / LGPD compliance** — multi-tenant SaaS with EU/Brazil-style customer data: needs explicit doc for right-to-be-forgotten, data export, consent capture, sub-processor list.
9. **Photo retention policy** — photos can be marketing assets (galleries) AND personal data (a customer's car). Conflicting requirements; no doc resolves it.
10. **Email deliverability** — SPF/DKIM/DMARC/bounce-handling — `01-BUSINESS` emphasises emails but no deliverability strategy.
11. **Rate limiting / abuse prevention** — public booking endpoint is a spam target; no doc.
12. **Audit log spec** — `10-OBSERVABILITY` says "Immutable, Searchable" but no schema, no retention.

### 6.3 Operations / reliability
13. **Backup & restore runbook** — `12-DEPLOYMENT` says "automated backups" via managed DB; no recovery RPO/RTO, no restore test schedule.
14. **Disaster recovery plan** — RPO/RTO targets, cross-region story, runbook owner.
15. **Performance budgets / SLOs / SLIs** — `10-OBSERVABILITY` says "P99 < 2s" as an alert threshold; no published SLO per endpoint.
16. **On-call / incident response** — no runbook, no escalation, no severity tiers.
17. **Capacity planning** — what triggers vertical/horizontal scaling beyond "Cloud Run scales-to-zero".

### 6.4 Product / business
18. **Tenant onboarding flow** — what the sales/manual process looks like before software UCs kick in.
19. **Billing & monetisation model** — `19-INFRASTRUCTURE_TOOLING_MAP.md` mentions "future billing" once; no doc on pricing tiers, payment integration, suspension policy.
20. **Internationalisation / locale** — `BeloAuto` is a Portuguese-flavoured name; copy is English; currency defaults to USD (`02-DOMAIN_MODEL.md:415`). Target market is unstated.
21. **Accessibility commitments** — `16-DASHBOARD_FRONTEND` mentions `eslint-plugin-jsx-a11y` and "must be accessible" but no WCAG level.

### 6.5 Documentation hygiene
22. **Glossary / ubiquitous-language reference** — `01-BUSINESS` has a 9-row glossary; nothing covers `slug`, `manifest`, `aggregate`, `BFF`, `idempotent`, `tenant context`, `ports`, `adapters`, `composite FK`, etc. for a junior reader.
23. **Doc changelog** — nothing tracks "this rule changed on X date"; matters because AI agents may have cached older copies.

---

## 7. Redundant / Overlapping Files (Recommend Consolidation or Deletion)

| File | Status | Recommendation |
|---|---|---|
| `AI_IMPLEMENTATION_READINESS.md` (root) | 80% overlap with `DOCUMENTATION_REVIEW.md` | Delete; this report supersedes both |
| `DOCUMENTATION_REVIEW.md` (root) | Prior version | Overwritten by this report |
| `COPILOT_CLI.md` (root) | Duplicates `.copilot/context.md` with tool-specific framing | Either delete (rely on `.copilot/context.md`) or repurpose as a `HOW_TO_USE_AI_AGENTS.md` |
| `claude.md` / `gemini.md` (root) | Symlinks to `.copilot/context.md` | Keep — they fulfil the multi-CLI requirement |
| `docs/AI_AGENT_DOCUMENTATION.md` | Strategy doc with broken refs (§3.13) | Rewrite as `docs/21-AI_AGENT_GUIDE.md` (numbered, in sequence) |
| `docs/archive/06-USER_TENANT_MODEL.md`, `docs/archive/07-MULTI_TENANCY_ARCHITECTURE.md` | Superseded by `06-TENANT_ISOLATION_STRATEGY.md` | Keep in archive, ensure no live doc links to them (currently safe) |
| `docs/archive/ai-agent-strategy/`, `docs/archive/AI_AGENT_STRATEGY/` | Two folders, same name modulo case (Linux distinguishes; macOS may not) | Pick one canonical name; merge contents into the other or delete |

---

## 8. AI-Agent Readiness Findings

A future AI agent will rely on:
1. The canonical context file (`.copilot/context.md` ← `claude.md` ← `gemini.md`).
2. The doc-index in `docs/README.md`.
3. The "load-by-task" decision tree in `docs/AI_AGENT_DOCUMENTATION.md`.

**Current state:**
- (1) is partially incorrect (§3.15, §3.9, references `LoyaltyRecord`, etc.).
- (2) is missing the north-star doc (§3.12).
- (3) has broken paths and stale instructions (§3.13).

**Side-effect:** Any agent following the docs verbatim will produce code that fails CI (wrong coverage), uses the wrong aggregate name, omits `tenantId` from event classes, and references files that don't exist. Fixing the contradictions in §3 is therefore a prerequisite for the "AI agents will build this" strategy to work.

This review ships with a **rewritten canonical context** at `.copilot/context.md` (proposed). It is AI-CLI-agnostic, deterministic, and includes:
- Authoritative-fact table (one source of truth per fact).
- Anti-pattern list with citations.
- Load-by-task decision tree with token estimates.
- A "known contradictions" section that overrides individual docs until §3 is resolved.

---

## 9. Recommended Fix Order (Prioritised)

### Wave 1 — Blocker fixes (1–2 hours, mechanical)
1. Rename `LoyaltyRecord` → `LoyaltyTransaction` in `05`, `QUICK_REFERENCE`, `.copilot/context.md` (§3.1). *(Done. Subsequently simplified further on 2026-05-11 to a single `LoyaltyEntry` append-only table — see `02-DOMAIN_MODEL.md` Loyalty Context and `13-DATABASE_SCHEMA.md` table #6.)*
2. Standardise coverage threshold to **80%** in `07-ENGINEERING_PRINCIPLES.md` (§3.2).
3. Resolve `INFO_REQUESTED` — remove from API enum OR add to domain enum (§3.3).
4. Add `tenantId`, `eventId`, `occurredAt` to every example payload in `03-DOMAIN_EVENTS.md` (§3.4).
5. Insert missing `#### BookingCancelled` header (§3.5).
6. Make `carPhotoUrls` plural / consistent across model/event/schema/API (§3.6).
7. Pick `master` everywhere (§3.8).
8. Add `07-ENGINEERING_PRINCIPLES.md` to `docs/README.md` index (§3.12).
9. Fix typo `15-HOTSET_ROUTING_STRATEGY.md` → `15-HOTSITE_DYNAMIC_ARCHITECTURE.md` (§3.16).
10. Adopt the rewritten `.copilot/context.md` produced alongside this review.

### Wave 2 — Major fixes (4–6 hours, requires user input)
11. Mark UC-014 / UC-015 as superseded inside `04-USE_CASES.md` (§3.7).
12. Pick **one** folder layout (per-context infra vs shared infra) and update both docs (§3.9).
13. Replace hardcoded 48h with reference to `tenants.settings.cancellation_window_hours` (§3.10).
14. Add a 6th `Platform / Tenant` bounded context (§3.11) — covers tenant onboarding, hotsite config, super-admin.
15. Add the 12 missing UCs identified in §5.2 — at minimum the first 5 (tenant onboarding, staff CRUD, tenant settings, hotsite manage, customer profile update).
16. Rewrite `docs/AI_AGENT_DOCUMENTATION.md` as `docs/21-AI_AGENT_GUIDE.md` (§3.13).
17. Delete `COPILOT_CLI.md` and `AI_IMPLEMENTATION_READINESS.md`; this review supersedes them (§7).

### Wave 3 — Tech-stack decisions (user only)
18. Answer the 8 open questions from `AI_IMPLEMENTATION_READINESS.md`: ORM, NestJS major, frontend build, React major, migration tool, event-bus prod, deployment target, secrets manager. Record in a new `docs/22-TECH_STACK_ADR.md`.

### Wave 4 — Missing docs (after Wave 3)
19. Add the 23 missing documents from §6 (ADR log, error catalog, SETUP.md, GDPR, retention, runbooks, SLOs, glossary, doc-changelog, etc.).

### Wave 5 — Scaffolding (after Wave 3)
20. Generate from the now-consistent docs: Dockerfiles, `docker-compose.yml`, `.github/workflows/*.yml`, Terraform skeleton, `package.json`, NestJS module scaffold, React app scaffold, OpenAPI spec, example migrations.

---

## 10. What "Good" Looks Like After This Review

When the waves above are done, an AI agent given only the prompt:

> "Implement UC-009 (Mark Booking Complete) end-to-end: domain, repository, controller, event handler in Loyalty, and tests."

…should be able to:
1. Read `.copilot/context.md` for invariants.
2. Read UC-009, `Booking` aggregate (model), `BookingCompleted` event (with tenantId/eventId), and `ServicePointsEarned` event.
3. Produce a NestJS module under `src/contexts/booking/` matching the agreed folder layout, with TypeORM/Prisma based on Wave 3.
4. Emit events with the agreed payload shape.
5. Pass `npm run lint && npm run test && npm run type-check` with 80%+ coverage, including a tenant-isolation test.
6. Produce a PR title matching Conventional Commits and a description linking UC-009.

…**without** the user needing to clarify any ambiguity. That is the bar.

---

**End of report.**

**Suggested next step:** Approve the rewritten `.copilot/context.md` (already written) and Wave 1 changes; defer Waves 2–5 to scoped follow-ups.
