# M20 — Lead Form Module: Implementation Details (Developer)

This document explains every concept, decision, and pattern introduced in M20 — why the search index is a child table instead of a text column, why one Terraform-managed Turnstile widget serves the whole domain, why a URL query string became the single source of truth for a whole search UI (including which *mode* it's in), and the several real bugs found along the way that are worth understanding, not just fixing.

---

## 1. Overview

M20 adds a `LEAD_FORM` hotsite module: a manager configures up to 20 custom questions, guests and/or logged-in customers answer them on a dedicated page, and the manager reviews submissions on their own dashboard screen. It's a genuine lead-capture tool — name/email/phone are mandatory on every submission, the public endpoint is protected by Cloudflare Turnstile and per-tenant/per-IP rate limits, and submissions are retained for a tenant-configurable window (default 6 months, max 24) before an automatic purge.

Thirteen stories, in three waves: backend domain + BFF (S01-S06, S12), then frontend (S07-S11, S13). Two aggregates (`LeadFormConfig`, `LeadFormSubmission`), one new hotsite module type, one new admin dashboard section with its own structured search UI, and the codebase's first Cloudflare Turnstile integration.

The interesting engineering problems aren't the CRUD — they're: (1) how do you let a manager search submissions by a *specific question's* answer without either an unbounded scan or a second flattened-text index that can't attribute a match correctly; and (2) how do you keep a fully client-driven, button-triggered search UI's state (search term, filters, date range, and which *mode* it's in) consistent with the URL as the single source of truth, across every possible navigation source — pagination links, a detail page's "back" button, and the panel's own buttons — without either duplicating that logic per navigation source or introducing races between an optimistic client-side state flip and the server round-trip that's supposed to confirm it.

---

## 2. Two Aggregates, and Why the Config Write Got Merged Into an Existing Endpoint

`LeadFormConfig` (`apps/backend/src/contexts/platform/domain/lead-form-config.aggregate.ts`) is a one-row-per-tenant catalog: `audienceMode` (`GUEST_AND_CUSTOMER` | `CUSTOMER_ONLY`) and up to 20 `questions`, each `{id, label, type, required, options?, order}`. It's stored as a single JSONB column, not a child table — the whole array is always read and written atomically by exactly one actor (the manager editing the form), the same justification `hotsite_configs.layout` already uses for its own module array.

`LeadFormSubmission` (`domain/lead-form-submission.aggregate.ts`) is one row per visitor submission: contact fields (validated through the existing `Email`/`PhoneNumber` VOs — the latter gained a `reconstitute()` method in this milestone, a real pre-existing gap versus the codebase's own `create()`-validates/`reconstitute()`-skips-validation convention, fixed as a small root-cause side quest rather than worked around), and a full `answers` **snapshot** — `{questionId, questionLabel, questionType, answerValue}` per question, not a live reference back to the config catalog. This matters: if a manager edits or deletes a question after a submission exists, the submission's detail view still shows exactly what the visitor answered, under the label that existed at the time. `expiresAt` is computed once at insert time from the tenant's *current* `retentionMonths` setting — never recomputed later, so changing the retention window doesn't retroactively change already-submitted rows' expiry.

### The write side that got deleted

S01 shipped `LeadFormConfig` with its own consolidated save endpoint, `PATCH /v1/tenants/lead-form/config`, accepting both the teaser fields (title/subtitle/CTA — the same shape every hotsite module's teaser uses) and `audienceMode`/`questions` in one request, saved atomically via a new `UpdateLeadFormModuleUseCase`. This worked, but S08 (the actual config-panel story) found the real cost: `UpdateLeadFormModuleUseCase` had to duplicate `UpdateHotsiteContentUseCase`'s entire image-promotion/persist machinery just to accept `branding`/`layout`/`seo` a second time, and the frontend had to special-case which endpoint to call depending on whether the manager was editing `LEAD_FORM` versus any other module.

The fix: delete `UpdateLeadFormModuleUseCase` entirely, and fold `audienceMode?`/`questions?` into the *existing* `PATCH /v1/tenants/hotsite` as two additional optional fields. One endpoint, one use case, one transaction — `UpdateHotsiteContentUseCase` now writes both `HotsiteConfig.layout[]` and `LeadFormConfig` inside the same `txManager.run()` block when those fields are present. `GET /v1/tenants/lead-form/config` stayed its own endpoint, because it's a genuinely different read shape (merging two aggregates plus a computed `hasSubmissions` flag per question), but the write side collapsed to zero new surface. This is now `docs/ANTI_PATTERNS.md`'s own documented row: *"A new module type needs admin-only config fields that must never reach the public-cached `layout[].data`, and a generic content-update endpoint for the same aggregate already exists → add the fields as optional top-level fields on the existing generic endpoint, not a parallel module-specific endpoint."*

```ts
// UpdateHotsiteContentUseCase — a scoped, deliberate exception to "one aggregate per transaction"
await this.txManager.run(async () => {
  await this.hotsiteConfigRepo.save(hotsiteConfig);      // layout[] teaser fields
  if (dto.audienceMode !== undefined || dto.questions !== undefined) {
    await this.leadFormConfigRepo.save(leadFormConfig);   // audienceMode/questions
  }
});
```
Justified because both aggregates live in the same bounded context (Platform) and one real manager action needs them atomic — not a precedent for spanning a transaction across *contexts*.

### Optimistic locking, added after the fact

Neither `HotsiteConfig` nor (at first) `LeadFormConfig` had any concurrency guard — two managers editing the hotsite in different tabs could silently clobber each other. `hotsite_configs` already had a `version` column and a version-guarded `UPDATE`; `lead_form_configs` didn't, and since S08 made them write in the *same transaction*, that gap became a real, live bug the moment the merge landed. A Codex review on S08's PR caught it: fixed by adding an identical `version INTEGER NOT NULL DEFAULT 1` column (migration `1748500000005-AddVersionToLeadFormConfigs.ts`) and a matching `PLATFORM_LEAD_FORM_CONFIG_CONCURRENT_MODIFICATION` (409) error code, mirroring `HOTSITE_CONCURRENT_MODIFICATION` exactly.

---

## 3. The Search Problem: Why a Child Table, Not a Flattened Column

UC-041 needs two search modes: a basic free-text box, and an "advanced" mode where a manager picks a specific question ("Estado civil") and types a value ("casado"), optionally ANDing several such filters together.

The naive design — flatten every submission's answers into one big searchable text blob per row — fails the advanced case specifically. If a submission has `{estado civil: casado, mora em: São Paulo}` flattened into one string, a filter for `estado civil = solteiro AND mora em = São Paulo` would still match it, because "São Paulo" is present *somewhere* in the blob, with no way to prove it isn't attached to the wrong question. You can't correctly AND two question-scoped conditions without knowing which text belongs to which question.

The fix is `platform.lead_form_answers`: one row per **question** per submission (not one row per submission — a `MULTIPLE_CHOICE` question with 2 selected options becomes 2 rows), maintained by `TypeOrmLeadFormSubmissionRepository.save()` in the same transaction as the submission itself. It's explicitly *not* a second aggregate — no independent identity, no lifecycle apart from its parent submission, purely a repository-maintained denormalization for search. The real detail view still reads `lead_form_submissions.answers` (the JSONB snapshot) directly; this table is write-once and read-only-for-search, never rendered.

```sql
-- Advanced search: 2 ANDed filters, each its own correlated EXISTS
SELECT * FROM lead_form_submissions s
WHERE EXISTS (SELECT 1 FROM lead_form_answers a
              WHERE a.tenant_id = s.tenant_id AND a.submission_id = s.id
                AND a.question_label = 'Estado civil' AND a.answer_value ILIKE '%casado%')
  AND EXISTS (SELECT 1 FROM lead_form_answers a
              WHERE a.tenant_id = s.tenant_id AND a.submission_id = s.id
                AND a.question_label = 'Onde você mora?' AND a.answer_value ILIKE '%São Paulo%')
```

`question_label` matches by **exact equality** — it's dropdown-sourced (populated from a `GET .../submissions/filter-options` endpoint that returns every distinct label a tenant has ever used), never free-typed, so an exact-match B-tree index is the right and faster tool there. `answer_value` matches by `ILIKE '%term%'`, backed by a `pg_trgm` GIN index (`CREATE EXTENSION IF NOT EXISTS pg_trgm`) — the only index type in Postgres that can accelerate a substring match with no fixed left-anchor.

### The 3-character minimum, and why it got removed

`pg_trgm` genuinely can't accelerate a pattern under 3 characters — a search term needs at least one extractable trigram, and Postgres's own documentation says a pattern with none "will degenerate to a full scan." The original S12 design took this literally and rejected any search under 3 characters outright, with `GENERIC_VALUE_TOO_SHORT`.

During S13, this turned out to be a real usability problem: an age ("25"), a 2-letter abbreviation, anything genuinely short and real became unsearchable. The question wasn't whether the index limitation was real (it is) — it was whether *rejecting the request* was the right response to it. That required actually working out what "degenerate to a full scan" costs here, not just avoiding it reflexively:

- **First estimate ("tens of thousands of rows")** — wrong; conflated the feature's realistic typical monthly volume with its actual configured ceiling.
- **A bot-review round correctly caught that imprecision, but overcorrected** — citing `lead_form_answers`' full cross-submission row total at the system's absolute ceiling (~14.6M rows: up to 1,000 submissions/day × 24 months retention × up to 20 answers/submission).
- **The actual bound, found by reading the query, not guessing at it:** `applySearch()`'s per-question match is a correlated `EXISTS` on `(tenant_id, submission_id)` — already covered by the same `(tenant_id, submission_id, question_label)` index the exact-match filter uses. So the *unindexed* part isn't a scan of the whole 14.6M-row table; it's a short `ILIKE` over each *candidate submission's own* ≤20 answer rows. The real bound scales with a tenant's own **submission count** (~730k at the ceiling), not the answer-row total — roughly 20x smaller, and at that a submission-count-bounded correlated subquery, not a raw table scan.

At that corrected bound (tens of millions of short string comparisons, estimated at low single-digit seconds — for a tenant that would have to deliberately sustain the maximum caps for the full 24-month window to hit it), rejecting a real short search was judged the worse trade-off. Both layers (shared Zod schema in `packages/validation/src/lead-form-submission.ts`, and the frontend's own `isSearchTermValid()`) now require only **non-empty**.

The lesson generalizes past this one story: when a bot review (or your own first pass) flags a scale concern, the fix isn't to trust either the original guess or the rebuttal at face value — it's to go read the actual query and the actual index it runs against, and derive the real bound from that.

---

## 4. Rate Limiting: A Tenant Setting, Not a Platform Constant — Unlike Chatbot's

M19's Chatbot feature has ~8 rate-limit fields that are deliberately **Ikaro-only** — a tenant can't raise them, because they protect Ikaro's own real LLM API cost exposure. The original M20 draft copied that shape for `maxSubmissionsPerDay`/`maxSubmissionsPerIpPerDay` by surface resemblance (both are "a cap that mirrors Chatbot's cap pattern"). A post-review pass caught that the *reasoning* didn't transfer: a Lead Form submission costs Ikaro nothing per row — no LLM call, no per-unit vendor cost. There's no equivalent financial justification for keeping the cap out of tenant hands.

So all three Lead Form settings (`retentionMonths` 1-24, `maxSubmissionsPerDay` 1-1000, `maxSubmissionsPerIpPerDay` 1-100) are ordinary, tenant-editable fields through the existing `PATCH /v1/tenants/settings`, with their own dedicated validator (`LeadFormSettingsValidator`, mirroring `BookingSettingsValidator`'s shape) and three field-specific error codes. A tenant getting false-positive blocks from shared-IP mobile traffic just raises `maxSubmissionsPerIpPerDay` themselves — no support ticket to Ikaro needed. This is the kind of "same surface shape, different underlying reason" distinction worth checking explicitly whenever a new feature's design leans on an existing feature as its template — the shape being similar doesn't mean the constraint that produced it still applies.

The enforcement mechanism itself *is* a direct mechanical copy of Chatbot's pattern — two count queries against dedicated indexes (`(tenant_id, submitted_at DESC)` for the daily cap, `(tenant_id, ip_address, submitted_at)` for the per-IP cap), both checked in `CreateLeadFormSubmissionUseCase` before the row is ever created, both throwing the same `LeadFormDailyCapReachedError`/`429` regardless of which layer tripped — from the submitter's perspective, "come back tomorrow" is the same outcome either way, so one error code covers both.

---

## 5. Cloudflare Turnstile: The Codebase's First CAPTCHA Integration

`POST /public/platform/lead-form/:slug/submissions` is a public, unauthenticated, form-submitting endpoint — exactly the surface a bot-driven abuse tool targets. Cloudflare Turnstile verification happens **before** anything else in the BFF handler: before tenant resolution, before the backend is ever called.

```ts
// platform.public.controller.ts — order matters
const verified = await this.turnstileService.verify(body.turnstileToken);
if (!verified) throw new BadRequestException({ code: BffErrorCode.TURNSTILE_VERIFICATION_FAILED });
// only past this point: tenant resolution, JWT decode, backend call
```

`TurnstileWidget.tsx` is a plain script wrapper (`<script src="https://challenges.cloudflare.com/turnstile/v0/api.js">` + `window.turnstile.render()`), not an npm package — deliberately, per the discovery doc's own guidance, since none is installed and none should be added for a single-widget integration.

### The test sitekey doesn't render a real challenge

Cloudflare publishes permanently-valid dummy keys for automated testing: `1x00000000000000000000AA` (sitekey) always renders a *passing* challenge, its matching secret always returns `success: true` from `siteverify` — no live network dependency needed in CI. The trap: this sitekey doesn't render an interactive iframe at all. It writes a token directly into its own hidden `cf-turnstile-response` input the instant `render()` resolves. An E2E test that waits on `iframe[src*="challenges.cloudflare.com"]` will time out forever, regardless of how correct the surrounding code is — it needs to wait on the hidden input's value instead. This cost three review rounds of otherwise-correct fixes before being diagnosed via live `page.evaluate()` debugging against a real running instance.

### One widget for the whole domain

A Turnstile sitekey authorizes a *domain* to render the challenge — it isn't scoped to one form. The Terraform resource is named `cloudflare_turnstile_widget.site` (not `.lead_form`) after exactly this question was raised during review: provisioning a second widget for a hypothetical future feature would only fragment Cloudflare's own per-widget analytics with zero security or functional benefit. It exists only in `envs/prod` — staging has no Cloudflare provider/credentials wired at all and keeps the always-pass test sitekey, since it never serves real traffic.

### The secret half stays manual, on principle

The widget resource generates both a sitekey (safe to read as a Terraform output) and a secret (never safe to). A design that piped the secret through `terraform output` — specifically to spare an operator from ever hand-typing it — was implemented, opened as a PR, and reverted *unmerged* once a live review caught it against `infra/terraform/README.md`'s own explicit rule: *"Outputs are operational metadata, not secrets... marking an output `sensitive` only masks terminal display, [it] does not remove the value from Terraform state."* The correct pattern, matching every other secret in this codebase (`db-password`, `jwt-secret`, etc.), is unglamorous and deliberate: the operator retrieves the value from the vendor's own dashboard and runs `gcloud secrets versions add` by hand. A resource generating a secret as a side effect of creating something else doesn't get an exception to this rule just because automating it would be more convenient.

---

## 6. The OAuth `returnTo` Extension

Before M20, every "log in" link in this app hit the same hardcoded post-login destination — the tenant's hotsite home. UC-040's login-required gate (for a `CUSTOMER_ONLY` lead form) needs the customer to land back on `/[slug]/lead-form` specifically after authenticating, not the home page.

Rather than build a new redirect mechanism, the existing signed OAuth-state JWT gained one more optional field:

```ts
// oauth-state.ts
interface OAuthStatePayload { tenantSlug: string; type?: 'staff'; returnTo?: string; /* ... */ }

function isValidReturnTo(returnTo: string, tenantSlug: string): boolean {
  return returnTo.startsWith(`/${tenantSlug}/`);   // open-redirect guard
}
```

`returnTo` is validated when *encoding* the state (an invalid or cross-tenant value is silently dropped, degrading to the existing home-page fallback — never a failed login), then threaded unchanged through `GoogleAuthGuard` → `GoogleStrategy` → `GoogleProfile` → `AuthControllerFlowService.handleTenantLogin`, which redirects to it when present. Six files touched, each carrying one field one hop further — the kind of change that's individually trivial per file but easy to break silently if any one hop drops the field.

**Why the return-and-redirect flow itself is tested at the unit level, not E2E.** Playwright's dev-login bypass (used everywhere in this suite to avoid a real Google OAuth round-trip in CI) skips `/auth/google` → `/auth/google/callback` entirely — it structurally *cannot* observe a real redirect through that path. Every hop (`isValidReturnTo`'s open-redirect rejection, `encodeOAuthState`/`decodeOAuthState` round-tripping, the guard reading the query param, the strategy carrying it through, the flow service's redirect) is instead verified independently at the unit level. This was actually litigated twice during PR review (Codex flagged it Critical in two separate rounds) before landing on: building real OAuth-callback test infrastructure (a NestJS component test overriding `GoogleStrategy` with a test double) would be a first-of-its-kind pattern this codebase has never needed elsewhere, and the existing `auth.controller.component.spec.ts` already explicitly scopes itself away from OAuth routes for the same reason. Out of scope for one story to introduce.

---

## 7. The Frontend Search UI: URL as the Only Source of Truth

S13 is a fully server-rendered, button-driven (never live/debounced) search experience: `apps/web/app/dashboard/leads/page.tsx` is a Server Component that reads `search`/`filters`/`submittedFrom`/`submittedTo`/`mode`/`page` straight from `searchParams`, fetches the list server-side, and renders. The client component (`LeadFormSearchPanel`) holds zero authoritative state of its own — every "Aplicar"/"Limpar"/mode-toggle click just calls `router.push()` with a new query string; the server re-fetches and re-renders in response.

### The remount-on-navigation trick

`router.push()` in the App Router is a **soft** navigation — it does not unmount and remount a client component just because the URL changed underneath it. That's a problem here: a plain `<Link href="/dashboard/leads">` (the zero-results card's "Limpar busca", or a pagination link) changes the URL without going through any of `LeadFormSearchPanel`'s own handlers, so nothing resets its local `searchTerm`/`filterRows` state — the search box would keep showing a stale term even after the list had already moved on to an unfiltered result set.

The fix, once found, is a single line that replaces every navigation-source-specific workaround:

```tsx
// LeadFormSubmissionsList.tsx
<LeadFormSearchPanel
  key={buildLeadsSearchQuery(searchQuery)}   // resolved from the CURRENT URL, server-side
  initialMode={searchQuery.mode ?? 'basic'}
  initialSearch={searchQuery.search}
  // ...
/>
```

Changing a component's `key` forces React to unmount the old instance and mount a fresh one — and a fresh mount means `useState(initialSearch)` re-initializes from whatever the server just resolved. Since `key` is derived from the *server-computed* query, this resets local state correctly regardless of *how* the navigation happened — a plain Link, a router-back, or the panel's own button. One mechanism, not four hand-chased special cases (this fix itself went through two rounds: the mode-toggle case was fixed by hand first, missing the "Limpar busca" sibling case, before the general `key`-based fix replaced both).

### Mode needed to become real URL state, not an inference

Advanced mode was originally *inferred*, not stored: `mode = filters && filters.length > 0 ? 'advanced' : 'basic'`. This works for a direct/bookmarked link (`?filters=...` obviously means advanced), but breaks the moment `filters` is legitimately empty *while still in advanced mode* — clicking "Limpar filtros" (which is supposed to clear the rows but *stay* advanced), or applying an advanced search using only the date range (no filter rows involved at all). Both cases hit the same remount-driven reset above, and since the resulting URL carried no `filters`, the freshly-remounted panel inferred `basic` — silently switching modes as a side effect of an action that was never supposed to touch mode at all.

The fix: an explicit `?mode=advanced` query param, resolved by one function used everywhere:

```ts
// lead-form-search.ts
export function resolveSearchMode(params: { filters?: FilterEntry[]; modeParam?: string }): 'basic' | 'advanced' {
  if (params.filters && params.filters.length > 0) return 'advanced';   // a bookmarked ?filters= link still works
  return params.modeParam === 'advanced' ? 'advanced' : 'basic';         // the only other signal
}
```
`buildLeadsSearchQuery()` only ever *writes* `mode=advanced` (never `mode=basic` — basic is the default, so a plain unfiltered link stays clean), and every one of the panel's own handlers (`toggleMode`, `handleApplyAdvanced`, `handleClearAdvanced`) passes the correct mode through explicitly instead of relying on `filters`' presence to imply it.

### The remount that fixed mode-persistence then raced a UI interaction

Making `toggleMode()` always write `mode=advanced` fixed the bug above — but it also meant toggling from a bare, unfiltered basic view into advanced mode now *always* changes the URL (previously it didn't, since going from `/dashboard/leads` to `/dashboard/leads` with the same empty query never used to change the `key`). Every toggle now remounts the panel where it previously sometimes wouldn't.

That surfaced as a real Playwright failure: a test clicked the mode toggle, then immediately opened a filter row's `Select` dropdown. The dropdown it opened belonged to the *pre-remount* panel instance; by the time Playwright tried to click an option inside it, the remount (triggered by the toggle's own navigation resolving) had already torn that instance down and replaced it — "element was detached from the DOM, retrying," an infinite retry against an option that could never reappear until the (now-closed) dropdown was reopened.

This wasn't a flaky test to paper over — it's a genuine race between an instant, optimistic client-side state flip (`setMode('advanced')`, synchronous) and the server round-trip the *correctness* of that flip actually depends on (the remount, which is what makes the freshly-resolved `initialMode` authoritative again). The fix belonged in the test, not the app: wait for the URL to actually reflect `mode=advanced` before interacting further, the same pattern the sibling mode-toggle test already used. A real user's fingers can't out-race a network round-trip the way a scripted `click()` immediately followed by another `click()` can — but the underlying lesson is general: any test that interacts with a component immediately after triggering a navigation that might remount it needs to wait for that navigation to settle first, not assume synchronous DOM stability.

### A related, instructive dead end: gating a fetch on the same optimistic state

A separate optimization attempt tried to skip `getLeadFormFilterOptions()` (the advanced-filter dropdown's data) entirely in basic mode, on the theory that basic-mode pageviews never render that dropdown so fetching it is wasted work. This reintroduced the *identical* race, one layer down: the same optimistic `setMode('advanced')` flip rendered the advanced UI immediately, but with the *stale* (empty) `filterOptionLabels` prop from before the toggle — the freshly-fetched, non-empty labels only existed after the same remount the previous section's fix already depends on. The dropdown opened correctly this time, but had zero options in it until the remount landed.

Reverted back to an unconditional fetch. The efficiency concern behind the attempt was real but overstated — the underlying query (`SELECT DISTINCT question_label FROM lead_form_answers WHERE tenant_id = $1 ORDER BY question_label`) maps directly onto a dedicated `(tenant_id, question_label)` covering index: an index-only scan, ordering satisfied for free by the index's own sort order, `DISTINCT` resolved as a cheap pass over adjacent duplicates in an already-sorted stream. Once that was verified by reading the actual index definition (not assumed), there was no real cost problem left to solve by gating the fetch — only a race to reintroduce by trying to.

### Two Date-parsing functions for the same string, on purpose

`LeadFormDateRangeControl` needs the *exact same* ISO date string (`"2026-08-10"`) parsed two different ways, for two different reasons:

```ts
// Fed to react-day-picker's `selected` prop — MUST match its own local-midnight Date construction,
// or its internal range-extension logic (addToRange) miscompares across a timezone boundary.
function toLocalDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00`);
}

// Fed only to formatDateLong(), which pins timeZone: 'UTC' internally — a local-midnight Date
// here would display the wrong calendar day whenever the runtime's offset is positive.
function toDisplayDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}
```
Using the wrong one for either purpose is a real, silent correctness bug, not a cosmetic one — confirmed via an actual CI failure (GitHub's UTC runners disagreeing with `America/Sao_Paulo`) where a second click meant to *extend* an existing range instead shifted `from` by a day, because `toLocalISODate()`'s local-getter output was being compared against a UTC-origin Date internally. An earlier attempt fixed the *display* bug by switching both call sites to UTC parsing, which silently broke the *selection* behavior instead — the fix had to split into two functions with two different, individually-commented justifications, not one "corrected" version of the original.

---

## 8. Testing Strategy

Backend: unit tests per aggregate/use-case/validator, integration tests for real DB round-trips (indexes, cascades, tenant isolation — a fixture proves Tenant A's daily cap count never includes Tenant B's submissions, and that the `ON DELETE CASCADE` FK cleans up `lead_form_answers`/`lead_form_submission_question_refs` when a submission expires). `InMemoryLeadFormConfigRepository`/`InMemoryLeadFormSubmissionRepository` + matching builders in `apps/backend/src/test/{repositories,builders}/platform/`, mirroring Chatbot's own precedent rather than the older per-context layout.

Frontend, per `docs/08-TESTING_STRATEGY.md`'s page-vs-component split: `page.tsx`/`layout.tsx` files are Playwright-only; every `features/**/components/**` file gets a co-located Vitest + RTL spec. S13's model layer (`lead-form-search.ts` — pure, no React) gets its own plain Vitest spec, no `jsdom` needed.

Four E2E specs cover the milestone: `guest-lead-form.spec.ts` and `authenticated-lead-form.spec.ts` (S09's two submission paths), `leads-golden-path.spec.ts` (S10's spanning flow — config → guest submits → manager sees it in the list → manager opens the detail — the only place in the milestone that exercises the full loop as one test rather than four isolated ones), and `leads-search.spec.ts` (S13, 8+ scenarios: basic search, a 1-2 character term, zero-match state, mode switching, ANDed advanced filters, date-range narrowing, back-navigation preserving list state, and the search/filters-both-present edge case).

E2E test isolation gotcha worth knowing: CI runs Playwright with `workers: 1` (strictly sequential across spec files), so state that persists across files — a tenant's daily rate-limit counters, leftover submissions from a prior run that were never cleaned up — accumulates deterministically but easily-missed. `leads-search.spec.ts`'s `beforeAll` temporarily raises `maxSubmissionsPerIpPerDay` (restored in `afterAll`) specifically because four spec files submitting guest leads to the same tenant from the same CI runner IP exhausts the default cap of 3 well before this file's own turn.

---

## 9. Infra: Secrets, a Terraform-Managed Widget, and a Stale-Branch Scare

Two secrets (`TURNSTILE_SECRET_KEY`) and one non-secret public var (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`) followed this repo's existing "safe" 3-PR sequencing playbook — container, then IAM accessor grant (+ the real value populated manually, an explicit ordered step, not a footnote), then the actual `secret_env_vars` wiring. One `env.validation.ts` correction was needed along the way: the playbook's usual "don't add the schema entry until PR3" guidance doesn't hold when the key needs to be readable in local `.env`-driven component tests before PR2 exists — `@nestjs/config`'s `ConfigModule` only promotes *schema-declared* keys from a loaded `.env` file into `process.env`, verified directly against its source rather than assumed; an undeclared key sitting only in a dotenv file never reaches `process.env` at all, regardless of how the real deployed environment (where `secret_env_vars` sets a genuine OS-level var) would behave.

The Cloud Scheduler cron job followed a different playbook row entirely — "a new Pub/Sub topic + its app code" — since the retention-purge trigger needed its own topic. That row is 2 PRs, not 3: the topic has to exist live before Foundation can grant IAM on it, so app-code-plus-topic-registration merges first, then Foundation's scheduler-publisher grant follows once it's confirmed applied.

One near-miss worth remembering for its own sake: near the very end of the milestone, a bot review flagged the frontend's own final PR as "deleting" two pieces of canonical guidance from the agent-context file and a CI-traps doc. Both pieces of guidance were real and still applicable — the PR just hadn't merged the latest `main` yet, and a sibling session had added them to `main` *after* this branch had forked from it. Because the local git clone was shallow, an initial `git merge-base --is-ancestor` check reported a wildly wrong "209 commits behind" instead of the true "1 commit behind" — `git fetch --unshallow` corrected it immediately, and the fix was a plain `git merge origin/main` (never a rebase), not re-typing content that had never actually been deleted. The general shape — "a bot says this PR deletes X; check whether the branch is just stale before assuming a real regression, and check for a shallow clone before trusting `merge-base`'s answer" — is exactly the kind of thing that looks like a code bug at first glance and turns out to be a git-history-visibility problem instead.
