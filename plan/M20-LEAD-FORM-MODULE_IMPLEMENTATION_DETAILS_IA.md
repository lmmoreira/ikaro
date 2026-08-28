# M20 — Lead Form Module: Implementation Details (IA)

## Artifacts

### Backend — domain

| Artifact | Path |
|---|---|
| `LeadFormConfig` aggregate (question catalog + audience gating, one row/tenant) | `apps/backend/src/contexts/platform/domain/lead-form-config.aggregate.ts` |
| `LeadFormSubmission` aggregate | `apps/backend/src/contexts/platform/domain/lead-form-submission.aggregate.ts` |
| `LeadFormSubmissionReceived` event | `apps/backend/src/contexts/platform/domain/events/lead-form-submission-received.event.ts` |
| Domain errors (`LeadFormNotEnabledError`, `LeadFormCustomerOnlyError`, `LeadFormDailyCapReachedError`, `LeadFormConfigConcurrentModificationError`, etc.) | `apps/backend/src/contexts/platform/domain/errors/lead-form-domain.error.ts` |
| `LeadFormSettingsValidator` (tenant-settings bounds) | `apps/backend/src/contexts/platform/domain/value-objects/validators/lead-form-settings.validator.ts` |
| `PhoneNumber.reconstitute()` (root-cause gap fixed in S02, mirrors `Email.reconstitute()`) | `apps/backend/src/shared/value-objects/phone-number.vo.ts` |

### Backend — application

| Artifact | Path |
|---|---|
| `ILeadFormConfigRepository` port | `apps/backend/src/contexts/platform/application/ports/lead-form-config-repository.port.ts` |
| `ILeadFormSubmissionRepository` port | `apps/backend/src/contexts/platform/application/ports/lead-form-submission-repository.port.ts` |
| `GetLeadFormConfigUseCase` / consolidated save now lives on `UpdateHotsiteContentUseCase` (see Structural Decisions) | `apps/backend/src/contexts/platform/application/use-cases/get-lead-form-config.use-case.ts` |
| `GetLeadFormStatusUseCase` (nav-gating) | `.../get-lead-form-status.use-case.ts` |
| `GetLeadFormPublicConfigUseCase` (public catalog read — 2 real callers: public GET + `CreateLeadFormSubmissionUseCase`) | `.../get-lead-form-public-config.use-case.ts` |
| `CreateLeadFormSubmissionUseCase` (owns the whole submit flow end to end — see Structural Decisions) | `.../create-lead-form-submission.use-case.ts` |
| `ListLeadFormSubmissionsUseCase` (pagination + S12 search/filters/date-range) | `.../list-lead-form-submissions.use-case.ts` |
| `GetLeadFormSubmissionUseCase` (detail, incl. `customerId`) | `.../get-lead-form-submission.use-case.ts` |
| `GetLeadFormFilterOptionsUseCase` (distinct question labels) | `.../get-lead-form-filter-options.use-case.ts` |
| `LeadFormRetentionPurgeJob` (UC-043) | `apps/backend/src/contexts/platform/application/jobs/lead-form-retention-purge.job.ts` |

### Backend — infrastructure

| Artifact | Path |
|---|---|
| `LeadFormController` (`GET`/`PATCH config`, `GET status`, `GET`/`PATCH submissions[/:id]`, `GET submissions/filter-options` — all admin, `MANAGER`/`STAFF` split by route) | `apps/backend/src/contexts/platform/infrastructure/controllers/lead-form.controller.ts` |
| `LeadFormPublicController` (bare route, no `/public/` prefix — guest-reachable, mirrors `ChatbotController`) | `.../lead-form-public.controller.ts` |
| `CronLeadFormController` (`POST /cron/lead-form-retention`, `InternalApiGuard`) | `.../cron-lead-form.controller.ts` |
| `TypeOrmLeadFormConfigRepository` | `apps/backend/src/contexts/platform/infrastructure/repositories/typeorm-lead-form-config.repository.ts` |
| `TypeOrmLeadFormSubmissionRepository` (writes `lead_form_submissions` + `lead_form_submission_question_refs` + `lead_form_answers`, all one transaction; owns `applySearch()`/`applyFilters()`/`findDistinctQuestionLabels()`) | `.../typeorm-lead-form-submission.repository.ts` |
| Entities | `lead-form-config.entity.ts`, `lead-form-submission.entity.ts`, `lead-form-answer.entity.ts` (all in `infrastructure/entities/`) |
| Migrations (6, in order) | `1748400000014-CreateLeadFormSubmissions.ts`, `1748500000002-CreatePlatformLeadFormConfigs.ts`, `1748500000003-AddExpiresAtIndexToLeadFormSubmissions.ts`, `1748500000004-CreateLeadFormSubmissionQuestionRefs.ts`, `1748500000005-AddVersionToLeadFormConfigs.ts`, `1748500000006-CreateLeadFormAnswers.ts` — all in `apps/backend/src/contexts/platform/infrastructure/migrations/` |

### BFF

| Artifact | Path |
|---|---|
| `LeadFormController` (admin: config/status/submissions/filter-options) | `apps/bff/src/features/platform/lead-form.controller.ts` + `lead-form.schemas.ts` |
| Public routes (`GET .../lead-form/:slug`, `POST .../submissions`) | added to `apps/bff/src/features/platform/platform.public.controller.ts` (no dedicated controller — one `.public.controller.ts` per module family) |
| ~~`TurnstileService` (`siteverify` call, before tenant resolution)~~ — **removed in M20-S14**, see its own Addendum below | moved to `CloudflareTurnstileAdapter`, `apps/backend/src/contexts/platform/infrastructure/turnstile/cloudflare-turnstile.adapter.ts` |
| OAuth `returnTo` extension (customer post-login redirect) | `apps/bff/src/features/auth/oauth-state.ts`, `oauth-state.service.ts`, `guards/google-auth.guard.ts`, `strategies/google.strategy.ts`, `auth-controller-flow.service.ts`, `auth-tenant-login.flow.ts` |

### Web — dashboard (admin)

| Artifact | Path |
|---|---|
| `LeadFormConfigPanel.tsx` (module config panel, hotsite editor) | `apps/web/features/platform/components/hotsite/modules/LeadFormConfigPanel.tsx` |
| `LeadFormSortableQuestion.tsx`, `LeadFormTeaserFields.tsx` | same dir |
| `SettingsLeadFormSection.tsx` (tenant settings, 3 fields) | `apps/web/features/platform/components/settings/SettingsLeadFormSection.tsx` |
| `LeadFormSubmissionsList.tsx` (list + pagination + search panel host + zero-results states) | `apps/web/features/platform/components/leads/LeadFormSubmissionsList.tsx` |
| `LeadFormSubmissionDetail.tsx` | `apps/web/features/platform/components/leads/LeadFormSubmissionDetail.tsx` |
| `LeadFormSearchPanel.tsx` (basic/advanced mode orchestrator, URL-driven) | `apps/web/features/platform/components/leads/LeadFormSearchPanel.tsx` |
| `LeadFormAdvancedFilters.tsx` (repeatable question+value rows) | `apps/web/features/platform/components/leads/LeadFormAdvancedFilters.tsx` |
| `LeadFormDateRangeControl.tsx` (shadcn Calendar range popover) | `apps/web/features/platform/components/leads/LeadFormDateRangeControl.tsx` |
| `lead-form-search.ts` (pure URL/query-shape helpers: `resolveSearchMode`, `buildLeadsSearchQuery`, `parseLeadFormFilters`, `isSearchTermValid`) | `apps/web/features/platform/model/lead-form-search.ts` |
| `apps/web/app/dashboard/leads/page.tsx` / `[id]/page.tsx` / `layout.tsx` | list, detail, gated-nav layout |
| `lead-form-submissions.server.ts` (server fetchers) | `apps/web/features/platform/api/` |

### Web — hotsite (public)

| Artifact | Path |
|---|---|
| `LeadFormModule.tsx` (teaser, server component) | `apps/web/shells/hotsite/components/LeadFormModule.tsx` |
| `apps/web/app/[slug]/lead-form/page.tsx` (shared guest+customer page) | thin server component, `<Unavailable/>` when disabled |
| `LeadFormWidget.tsx` (client, the interactive form) | `apps/web/features/platform/components/public/LeadFormWidget.tsx` |
| `LeadFormFields.tsx`, `LeadFormPhoneField.tsx`, `LeadFormQuestionField.tsx`, `LeadFormSkeleton.tsx`, `LeadFormSuccess.tsx`, `LeadFormTerminalCard.tsx`, `LeadFormLoginRequiredGate.tsx` | same dir |
| `TurnstileWidget.tsx` (plain script wrapper, no npm package) | `apps/web/features/platform/components/public/TurnstileWidget.tsx` |
| `apps/web/app/api/platform/lead-form/submissions/route.ts` (Route Handler — only place that can attach `Authorization: Bearer` from the httpOnly cookie) | flat, `?slug=` query param |
| `lead-form.ts` (client fetchers: `fetchLeadFormConfigClient`) | `apps/web/features/platform/hotsite/api/lead-form.ts` |
| `lead-form-module.ts`, `default-layout.ts`'s `LEAD_FORM` entry, `module-schemas.ts`'s `LeadFormModuleDataSchema` | `apps/web/features/platform/hotsite/` |

### Shared types / validation / infra

| Artifact | Path |
|---|---|
| `HotsiteModuleType` incl. `'LEAD_FORM'`, `LeadFormModuleData`, `HotsiteLeadFormConfigResponse` | `packages/types/src/hotsite.ts` |
| `LeadFormAudienceMode`, `LeadFormQuestion`, `LeadFormConfigResponse`, `LeadFormStatusResponse`, `LeadFormSubmissionListItem`, `LeadFormFilterOptionsResponse`, `LeadFormSubmissionDetailResponse`, `TenantLeadFormSettings` | `packages/types/src/tenant.dto.ts` |
| Error codes (11 `PLATFORM_LEAD_FORM_*`/`PLATFORM_SETTINGS_LEAD_FORM_*`, incl. `PLATFORM_LEAD_FORM_TURNSTILE_VERIFICATION_FAILED` — was `BFF_TURNSTILE_VERIFICATION_FAILED` before M20-S14) | `packages/types/src/error-codes.ts` |
| Shared Zod: `LeadFormSubmissionFieldsSchema`, `LeadFormSubmissionFilterEntrySchema`, `ListLeadFormSubmissionsSchema` (backend+BFF, one copy) | `packages/validation/src/lead-form-submission.ts` |
| Backend/BFF `HotsiteModuleSchema` (own separate enum copy incl. `'LEAD_FORM'`) | `packages/validation/src/hotsite.ts` |
| Backend-local module-type mirror (`HotsiteModuleType`, `LeadFormModuleData`, `MODULE_TYPES`) | `apps/backend/src/contexts/platform/domain/hotsite-config.types.ts`, `hotsite-config.aggregate.ts` |
| Cloudflare Turnstile widget (prod-only, real resource — see Structural Decisions) | `infra/terraform/envs/prod/main.tf` (`cloudflare_turnstile_widget.site`) |
| `turnstile-secret-key` secret container | `infra/terraform/modules/secrets` via both env roots |
| Cron: `ikaro-cron-lead-form-retention` (`0 3 * * *`) | `infra/terraform/modules/scheduler/main.tf` `locals.jobs` |

### Test infrastructure

| Double | Path |
|---|---|
| `InMemoryLeadFormConfigRepository` / `InMemoryLeadFormSubmissionRepository` | `apps/backend/src/test/repositories/platform/` |
| `LeadFormConfigBuilder` / `LeadFormConfigEntityBuilder` / `LeadFormSubmissionBuilder` / `LeadFormSubmissionEntityBuilder` / `LeadFormAnswerEntityBuilder` / `LeadFormSubmissionReceivedEventBuilder` | `apps/backend/src/test/builders/platform/` |
| E2E specs | `guest-lead-form.spec.ts`, `authenticated-lead-form.spec.ts`, `leads-golden-path.spec.ts` (S10's spanning config→submit→list→detail flow), `leads-search.spec.ts` (S13) — all `apps/web/e2e/` |
| E2E helpers | `apps/web/e2e/helpers/platform/lead-form-api.ts` |

---

## DB Schema (`platform` schema)

### `platform.lead_form_configs`
```sql
tenant_id       UUID PRIMARY KEY, FK -> platform.tenants(id)
audience_mode   VARCHAR(20) NOT NULL DEFAULT 'GUEST_AND_CUSTOMER'   -- | 'CUSTOMER_ONLY'
questions       JSONB NOT NULL DEFAULT '[]'    -- <=20, {id,label,type,required,options?,order}
updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
version         INTEGER NOT NULL DEFAULT 1      -- optimistic lock, added 1748500000005 (Codex, PR #429)
```
JSONB, never a child table — one atomic read/write by one actor, same justification as `hotsite_configs.layout`.

### `platform.lead_form_submissions`
```sql
id             UUID PRIMARY KEY (uuidv7)
tenant_id      UUID NOT NULL, FK -> platform.tenants(id)
customer_id    UUID NULL          -- cross-context ref, no FK; set whenever submitter was authenticated
name           VARCHAR NOT NULL
email          VARCHAR NOT NULL   -- Email VO
phone          VARCHAR NOT NULL   -- PhoneNumber VO
answers        JSONB NOT NULL     -- full snapshot [{questionId,questionLabel,questionType,answerValue}]
submitted_at   TIMESTAMPTZ NOT NULL DEFAULT now()
expires_at     TIMESTAMPTZ NOT NULL   -- computed once at insert from tenant's retentionMonths, never recomputed
ip_address     VARCHAR(45) NOT NULL
UNIQUE (tenant_id, id)                                    -- composite FK target for answers/refs (required, same migration)
INDEX (tenant_id, submitted_at DESC)                        -- list pagination, daily cap, S12 date-range filter
INDEX (tenant_id, ip_address, submitted_at)                 -- per-IP daily cap
INDEX (tenant_id, expires_at)                               -- tenant-scoped expiry lookups
INDEX (expires_at)                                          -- STANDALONE, added S04 — cross-tenant purge query
                                                             -- can't seek the tenant_id-led composite above
```

### `platform.lead_form_submission_question_refs`
```sql
tenant_id       UUID NOT NULL
submission_id   UUID NOT NULL      -- FK (tenant_id, submission_id) -> lead_form_submissions, ON DELETE CASCADE
question_id     UUID NOT NULL      -- snapshotted from answers[].questionId
PRIMARY KEY (tenant_id, submission_id, question_id)
INDEX (tenant_id, question_id)     -- UC-037 hasSubmissions lookup, SELECT DISTINCT ... WHERE question_id = ANY(?)
```
Narrow, write-once projection — only powers "does this question have any submissions" for the config panel's remove-question confirmation. Not the search index (that's `lead_form_answers`, below).

### `platform.lead_form_answers`
```sql
id              UUID PRIMARY KEY (uuidv7)
tenant_id       UUID NOT NULL, FK -> platform.tenants(id)
submission_id   UUID NOT NULL      -- FK (tenant_id, submission_id) -> lead_form_submissions, ON DELETE CASCADE
question_id     UUID NOT NULL      -- informational only; matching is by question_label
question_label  TEXT NOT NULL      -- snapshotted
answer_value    TEXT NOT NULL      -- one row per MULTIPLE_CHOICE option; one row for TEXT/SINGLE_CHOICE
INDEX (tenant_id, submission_id, question_label)   -- advanced filter's per-question EXISTS
INDEX (tenant_id, question_label)                  -- filter-options' SELECT DISTINCT ... ORDER BY label
INDEX GIN (answer_value gin_trgm_ops)               -- ILIKE %term% on either side of search
INDEX GIN (question_label gin_trgm_ops)             -- basic search's partial match on labels only
```
Denormalized, write-once search projection — not a domain aggregate, no independent lifecycle. `lead_form_submissions.answers` JSONB stays the sole source for the detail view. `ON DELETE CASCADE` (unlike Chatbot's no-cascade precedent) — this table has no retention lifecycle of its own.

---

## Structural Decisions

### `LeadFormConfig`'s write side got folded into the generic hotsite endpoint (S01 → S08)
S01 originally shipped its own `PATCH /v1/tenants/lead-form/config`. S08 found this had near-completely duplicated `UpdateHotsiteContentUseCase`'s own image-promotion/persist logic just to accept `branding`/`layout`/`seo` a second time — deleted, folded `audienceMode`/`questions` into `PATCH /v1/tenants/hotsite` as two additional optional fields instead. One use case, one endpoint, one transaction. `GET /v1/tenants/lead-form/config` is unchanged — genuinely distinct read shape (merges 2 aggregates + `hasSubmissions`). See `docs/ANTI_PATTERNS.md`'s own row on this exact pattern (added from this incident).

### `SubmitLeadFormUseCase` never shipped as a separate class
Original design (S05) split `SubmitLeadFormUseCase` (thin orchestrator) from `CreateLeadFormSubmissionUseCase`. Found during PR review: exactly one caller, no independent reuse — merged into one class (`CreateLeadFormSubmissionUseCase`) that owns the CUSTOMER_ONLY gate, answer enrichment/validation, rate-limit caps, and persistence end to end. `GetLeadFormPublicConfigUseCase` stayed separate — it has 2 genuinely independent callers (this use case + the controller's own `GET config`).

### Cross-aggregate save, one transaction — a scoped exception
`UpdateHotsiteContentUseCase` writes both `HotsiteConfig.layout[]` and `LeadFormConfig` inside one `txManager.run()` — justified because both aggregates live in the same bounded context (Platform) and one manager action needs them atomic. Not a precedent for cross-*context* transactions.

### `lead_form_answers` is a child table, not a flattened text column
A single flattened blob can prove a term appears *somewhere* in a submission but can't attribute a match to a *specific* question — so it can't correctly AND two question-scoped filters ("estado civil = casado" AND "mora = São Paulo") without false positives from unrelated fields. One row per question per submission, `(question_label, answer_value)`, supports this via one `EXISTS` per filter, ANDed. Not a reversal of `LeadFormConfig.questions` staying JSONB — that's about the *config catalog* (one atomic write, no query pattern), a different access pattern entirely.

### Non-empty search, not a 3-character minimum (revised mid-S13)
`pg_trgm`'s GIN index genuinely can't accelerate a pattern under 3 characters (verified against Postgres docs — no extractable trigram, degenerates to a scan). The *original* M20-S12 design rejected short searches outright for this reason. Revised during S13 after a corrected cost analysis: `applySearch()`'s per-question match is a correlated `EXISTS` on `(tenant_id, submission_id)`, covered by the 3-column B-tree index — so the unindexed fallback only costs a short ILIKE over one submission's own ≤20 answer rows. The real bound scales with a tenant's own **submission count** (~730k at the system's absolute ceiling), not `lead_form_answers`' much larger cross-submission **row** total (~14.6M at the same ceiling) — a bot-review round caught the first estimate's imprecision but then cited the wrong, larger bound too. Full reasoning + the two-round correction: `packages/validation/src/lead-form-submission.ts`'s comment above `ListLeadFormSubmissionsSchema`.

### `getLeadFormFilterOptions()` stays an unconditional fetch, not gated on advanced mode
Tried gating this dashboard-list fetch on `mode === 'advanced'` (S13, avoiding a fetch basic-mode pagination never uses) — reverted after it caused a real regression: `toggleMode()` flips the panel's local `mode` state optimistically, before the `router.push()` navigation the gated fetch depends on resolves, so the advanced dropdown briefly rendered with zero options until the remount below caught up. Confirmed live via a Playwright CI failure. Kept unconditional; the underlying query (`SELECT DISTINCT question_label ... WHERE tenant_id = $1`) is a genuine index-only scan on the dedicated `(tenant_id, question_label)` index — ordering satisfied for free by the index's own sort order, `DISTINCT` a cheap adjacent-duplicate pass, no heap access.

### The URL is the single source of truth for search/filter/date-range/**mode**
S13's `LeadFormSearchPanel` keeps zero fetch state — `page.tsx` re-fetches server-side on every navigation. `LeadFormSubmissionsList` keys the panel by the resolved query string (`buildLeadsSearchQuery(searchQuery)`) so *any* navigation that changes the query — a plain `<Link>` (pagination, "Limpar busca"), a router-back, or the panel's own handlers — forces a fresh remount, resetting local `searchTerm`/`filterRows`/`mode` state for free instead of chasing each navigation source by hand.

**Mode needed its own explicit `?mode=advanced` param, not just inference from `filters`.** A non-empty `filters` param always implies advanced mode (covers a direct/bookmarked link), but `filters` alone can't signal advanced mode once it's empty — "Limpar filtros" (clears rows but must stay advanced) and an advanced search using only a date range (no filter rows at all) both need mode to survive independently. `resolveSearchMode({filters, modeParam})` in `lead-form-search.ts` is the single place this resolves, used server-side (`page.tsx`) and consistently written by every one of `LeadFormSearchPanel`'s own navigation handlers.

**The toggle-remount race.** Making `toggleMode()` always write `?mode=advanced` (even bare basic→advanced with zero filters) means *every* mode toggle now changes the URL and therefore always remounts the panel — previously, toggling into advanced with nothing filtered kept the *same* URL/key, no remount at all. A Playwright test that opened a filter-row `Select` immediately after clicking the toggle raced this remount: the dropdown it opened got torn down mid-click ("element was detached from the DOM, retrying"). Fixed in the test by waiting for the URL to settle (`toHaveURL(/mode=advanced/)`) before interacting further — not by avoiding the remount, which is required for correctness.

### `LeadFormDateRangeControl` needs two different Date-parsing functions for the same ISO string
`toLocalDate()` (local midnight — fed to the `Calendar`'s `selected` prop, must match react-day-picker's own local-Date construction so its internal range-extension math (`addToRange`) isn't corrupted across a timezone boundary) vs. `toDisplayDate()` (UTC midnight — fed only to `formatDateLong()`, which pins `timeZone: 'UTC'` internally). Using the wrong one for either purpose reproduces a real, CI-confirmed off-by-one-day bug (GitHub's UTC runners vs. `America/Sao_Paulo`).

### Cloudflare Turnstile: one domain-wide widget, not one per feature
A Turnstile sitekey authorizes a *domain* to render the challenge, not a specific form — provisioning a second widget per feature only fragments Cloudflare's own analytics/management surface with no security benefit. `cloudflare_turnstile_widget.site` (prod only; staging has no Cloudflare provider wired and keeps the always-pass test sitekey) is Terraform-managed and reused by any future feature needing Turnstile. The widget's real *secret* (as opposed to its sitekey) is never piped through a Terraform output, even though the widget generates it as a side effect of creation — this repo's universal secret pattern (operator retrieves the value from the vendor console, runs `gcloud secrets versions add` manually) applies unconditionally; a proposed `output "turnstile_secret"` was implemented, opened as a PR, and reverted unmerged after live review correctly flagged it against `infra/terraform/README.md`'s own "no secret-derived outputs" rule.

### Cloudflare Turnstile's test sitekey never renders an interactive challenge
`1x00000000000000000000AA` (the only sitekey this repo configures for local/E2E) writes a dummy token straight into its own hidden `cf-turnstile-response` input the moment `render()` resolves — it never shows an iframe. An E2E wait on `iframe[src*="challenges.cloudflare.com"]` times out forever regardless of how correct the surrounding code is; wait on the hidden input's value instead. Cost 3 review rounds before being found via live `page.evaluate()` debugging.

### Rate-limit caps are normal tenant settings, not an Ikaro-only deviation (unlike Chatbot's)
The original S02 draft copied Chatbot's Ikaro-only-override pattern for `maxSubmissionsPerDay`/`maxSubmissionsPerIpPerDay` by surface resemblance. Corrected during post-review redesign: Chatbot's caps protect Ikaro's own LLM cost exposure (a real shared financial cost); a Lead Form submission costs Ikaro nothing per-row, so there's no equivalent justification for keeping the caps out of tenant control. All 3 settings (`retentionMonths`, `maxSubmissionsPerDay`, `maxSubmissionsPerIpPerDay`) are normal, tenant-editable `PATCH /v1/tenants/settings` fields (S03/S11), unlike Chatbot's 8 Ikaro-only cap fields.

---

## Error Mapping

| Error code | HTTP status | Trigger |
|---|---|---|
| `PLATFORM_LEAD_FORM_QUESTION_LIMIT_REACHED` | 400 | >20 questions |
| `PLATFORM_LEAD_FORM_QUESTION_OPTIONS_INVALID` | 400 | choice question with <2 or >10 options |
| `PLATFORM_LEAD_FORM_QUESTION_DUPLICATE_ID` | 400 | two questions share a client-assigned id |
| `PLATFORM_LEAD_FORM_DAILY_CAP_REACHED` | 429 | tenant-wide OR per-IP daily cap (one code, both layers) |
| `PLATFORM_LEAD_FORM_NOT_ENABLED` | 404 | public GET/POST when module absent/disabled |
| `PLATFORM_LEAD_FORM_SUBMISSION_NOT_FOUND` | 404 | admin detail read, wrong id or wrong tenant |
| `PLATFORM_LEAD_FORM_CONFIG_CONCURRENT_MODIFICATION` | 409 | version-guarded UPDATE lost the race |
| `AUTH_UNAUTHORIZED` (existing code, not new) | 401 | `CUSTOMER_ONLY` audience + no decoded JWT |
| `PLATFORM_LEAD_FORM_TURNSTILE_VERIFICATION_FAILED` (was `BFF_TURNSTILE_VERIFICATION_FAILED` before M20-S14) | 400 | `siteverify` rejected/expired token |
| `GENERIC_VALUE_TOO_SHORT` | 400 | empty `search`/filter `value` (never a char-count minimum) |
| `GENERIC_VALUE_INVALID` | 400 | `search`+`filters` both present; unknown `questionId` in a submission |
| `GENERIC_VALUE_OUT_OF_RANGE` | 400 | >5 `filters`; `submittedFrom > submittedTo` |
| `PLATFORM_SETTINGS_LEAD_FORM_RETENTION_MONTHS_INVALID` / `_MAX_SUBMISSIONS_PER_DAY_INVALID` / `_MAX_SUBMISSIONS_PER_IP_PER_DAY_INVALID` | 400 | tenant-settings bounds (1-24 / 1-1000 / 1-100) |

---

## Pub/Sub Topics / Scheduler Jobs

| Trigger | Topic | Schedule | Handler |
|---|---|---|---|
| Retention purge (UC-043) | `ikaro-cron-lead-form-retention` | daily `0 3 * * *` | `LeadFormRetentionPurgeTriggerHandler` → `LeadFormRetentionPurgeJob` |

Local/manual trigger: `POST /cron/lead-form-retention` (`InternalApiGuard`). Job itself needs no S12 changes — `lead_form_answers`'/`lead_form_submission_question_refs`' `ON DELETE CASCADE` FKs mean deleting the parent `lead_form_submissions` row is enough.

---

## Env Vars

| Var | Default | Notes |
|---|---|---|
| `TURNSTILE_SECRET_KEY` | — | BFF-only secret, `secret_env_vars`. Test env uses Cloudflare's documented always-pass dummy secret |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | — | Public env var via `getPublicEnv()`/`PUBLIC_ENV_KEYS` (never a raw build-time read) — sourced from `cloudflare_turnstile_widget.site.sitekey` in prod, a plain var (test sitekey) in staging/local |

---

## Key Config (`tenants.settings.leadForm`)

| Field | Default | Bounds | Tenant-writable? |
|---|---|---|---|
| `retentionMonths` | 6 | 1-24 | yes |
| `maxSubmissionsPerDay` | 100 | 1-1000 | yes |
| `maxSubmissionsPerIpPerDay` | 3 | 1-100 | yes |

All 3 are required fields on `TenantSettings.default()` (unlike Chatbot's mostly-optional category) — every tenant gets real values at provisioning, `?? DEFAULT_X` fallbacks in `CreateLeadFormSubmissionUseCase` exist only for tenants provisioned before S03 shipped.

---

## URL Query Params (`/dashboard/leads`, S13)

| Param | Shape | Notes |
|---|---|---|
| `search` | string | Basic mode. Mutually exclusive with `filters` — sending both is `400` |
| `filters` | URL-encoded JSON `{questionLabel,value}[]`, max 5 | Advanced mode. A non-empty value alone implies `mode=advanced` even with no explicit `mode` param |
| `submittedFrom` / `submittedTo` | `YYYY-MM-DD` | Orthogonal — ANDs with either mode or neither |
| `mode` | `'advanced'` (only value ever written) | Omitted for basic (the default) — see Structural Decisions above for why this exists |
| `page` | integer | Omitted at page 1 |

`resolveSearchMode()`/`buildLeadsSearchQuery()` (`lead-form-search.ts`) are the only places that read/write this shape — never construct the query string by hand elsewhere.

---

## Test Infrastructure

See Artifacts table above. All lead-form-specific in-memory repos/builders live in `apps/backend/src/test/{repositories,builders}/platform/`, matching Chatbot's precedent, not the older per-context `src/test/infrastructure/` layout.

---

## Addendum — M20-S14 (added 2026-08-27, after this milestone's own wrap-up docs were first written)

Cloudflare Turnstile verification for the public lead-form submission endpoint moved from the BFF to the backend — the BFF's `ALL_TRAFFIC` egress has no Cloud NAT, so its own outbound call to Cloudflare's `siteverify` endpoint had no route out, causing every staging submission to fail closed. The backend's `PRIVATE_RANGES_ONLY` egress already reaches third parties unconditionally (same as its existing OpenRouter/LLM adapters), so relocating the call needed no new infrastructure. Full investigation and reasoning: `plan/M20-LEAD-FORM-MODULE.md` § M20-S14; general lesson for future stories: `docs/ENGINEERING_RULES.md` § Cloud Run `vpc_egress` mode determines third-party outbound reachability.

New artifacts: `ITurnstileVerifierPort` (`apps/backend/src/contexts/platform/application/ports/turnstile-verifier.port.ts`), `CloudflareTurnstileAdapter` (`apps/backend/src/contexts/platform/infrastructure/turnstile/cloudflare-turnstile.adapter.ts`), `LeadFormTurnstileVerificationFailedError` (`lead-form-domain.error.ts`). Removed: the BFF's `TurnstileService` and `BffErrorCode.TURNSTILE_VERIFICATION_FAILED` (replaced by `PlatformErrorCode.LEAD_FORM_TURNSTILE_VERIFICATION_FAILED`).
