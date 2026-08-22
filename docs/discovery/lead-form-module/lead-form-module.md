# Discovery — Lead Form Hotsite Module

**Status:** Discovery — not yet promoted. Nothing here is canonical until `/discovery-to-milestone` runs.
**Slug:** `lead-form-module`
**Bounded context:** Platform (extends the same context that already owns `Tenant`/`HotsiteConfig`)
**Started:** 2026-08-22

---

## 1. Summary

A new hotsite module, `LEAD_FORM`, that lets a manager configure up to 20 custom questions (free text / single-choice / multiple-choice) which guests and/or logged-in customers answer on a dedicated page. Unlike every other public-facing hotsite module today, this one **writes** visitor-submitted data — name, email, and phone are mandatory on every submission, making this a genuine lead-capture tool (not an anonymous survey — see §9 for why that framing changed during discovery). Protected by Cloudflare Turnstile + per-IP/per-tenant rate limits. Submissions are reviewed on their own dashboard screen (not inline in the hotsite editor), retained for a tenant-configurable window (default 6 months, max 24), and exportable to CSV one calendar month at a time.

## 2. Why this doesn't duplicate an existing feature

Checked against `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`'s module library and `docs/discovery/` (only `multivertical-booking` exists there today — no overlap). Every existing hotsite module is either admin-authored content (HERO, ABOUT, TESTIMONIALS) or a live read from another context (SERVICE_LIST from Booking). None accept and persist visitor-submitted data through a **hotsite module** — though guest booking (UC-001) already establishes the underlying pattern of an anonymous public write with mandatory contact fields, which is the closest real precedent this design leans on (see §4).

The closest *structural* precedent is `CONTACT`: its module data carries only display preferences, with real values living outside the manifest. `LEAD_FORM` follows the same split, but goes one step further for cost/caching reasons — see §5.

## 3. Cross-cutting infra this introduces

**Cloudflare Turnstile is new to this codebase.** `td/TD08-AUDIT-REMEDIATION-BACKLOG.md` **AUD-040** already tracks an unresolved gap: the public guest-booking endpoint has no CAPTCHA/bot mitigation. This module is the first place Turnstile gets wired in — the same component should be reused to close AUD-040 later rather than building a second integration. Verification happens server-side in the BFF (`siteverify` call before the submission reaches the backend), consistent with where other public-form validation already lives; the widget itself is a plain script + `'use client'` wrapper, no heavy SDK needed.

**Two new tenant-settings caps follow the `CHATBOT` category's deviation pattern** (`docs/21-TENANTS_SETTINGS_SCHEMA.md` §7) — see §6.

**One new cron job**, same shape as `ExpirePointsJob` (`docs/02-DOMAIN_MODEL.md`) — daily retention purge, see §7.

## 4. Domain distillation

**Event:** `LeadFormSubmissionReceived` — standard envelope (`eventId`/`tenantId`/`occurredAt`/`correlationId`/`eventName`/`eventVersion`/`data: { submissionId, customerId? }`). No consumer subscribes yet for MVP (see Non-Goals) — kept anyway because every state-changing action in this codebase publishes its own event for the audit trail and future hooks (a notification/webhook consumer is the obvious fast-follow).

**Aggregates (Platform context):**
- `LeadFormConfig` — one per tenant. Owns `audienceMode` and the question catalog.
- `LeadFormSubmission` — one per visitor submission. Independent aggregate; see the boundary note below for why no cross-transaction consistency with `LeadFormConfig` is ever needed.

**Aggregate-boundary check (DB-expert pass):** `LeadFormConfig` and `LeadFormSubmission` never need to be transactionally consistent with each other, and that's a deliberate design choice, not luck — `LeadFormSubmission.answers` snapshots the full `{questionId, questionLabel, questionType, answerValue}` at submission time, not just `{questionId, value}`. Without that snapshot, a manager editing a question's label or deleting it later would silently corrupt how old submissions render — the exact failure mode `BookingLine.priceAtBooking`/`serviceNameAtBooking` already exists to prevent in this codebase (`docs/02-DOMAIN_MODEL.md`). Same reasoning applies to retention: `expiresAt` is computed **once, at insert time**, from whatever `retentionMonths` the tenant had *then* — never recomputed live — matching `docs/21-TENANTS_SETTINGS_SCHEMA.md`'s own "settings changes apply to future only" rule. A live recompute would let a manager's later retention-window change retroactively purge (or resurrect) submissions nobody expected to be affected.

**Cross-context reference:** `LeadFormSubmission.customerId` is a UUID-only reference to the Customer context — no cross-schema FK, per `docs/ANTI_PATTERNS.md`'s "Cross-schema DB FK between contexts" row.

## 5. Hotsite module contract

```typescript
// packages/types/src/hotsite.ts — additions

type HotsiteModuleType =
  | 'HERO' | 'SERVICE_LIST' | 'GALLERY' | 'TESTIMONIALS'
  | 'BOOKING_CTA' | 'ABOUT' | 'CONTACT' | 'FOOTER' | 'CHATBOT'
  | 'LEAD_FORM';  // new

interface LeadFormModuleData {
  title: string;                          // e.g. "Fale com a gente"
  subtitle?: string;
  eyebrow?: string;
  ctaLabel: string;                       // e.g. "Preencher formulário"
  variant?: 'centered' | 'left-aligned';  // default 'centered' — mirrors BookingCtaModuleData
  backgroundImageUrl?: string | null;
  backgroundImagePosition?: 'left' | 'center' | 'right';
  bgStyle?: 'primary' | 'background';     // default 'primary'
}
```

**Why the module data stays this small:** the manifest is public and cached 5 minutes (`Cache-Control: public, max-age=300`). Embedding up to 20 questions (each with up to 10 options) would bloat every cached manifest fetch for the vast majority of visitors who never open the form — exactly the reasoning `SERVICE_LIST` already applies (display preferences in the manifest, real data fetched live). The full question catalog is fetched only when a visitor actually reaches `/[slug]/lead-form`.

**Placement:** `LEAD_FORM` is a normal entry in the `layout` array, reordered by the admin like every other module — not a special-cased widget.

## 6. Data model

### `platform.lead_form_configs` (new table, 1 row per tenant)

| Column | Type | Notes |
|---|---|---|
| `tenant_id` | UUID | PK, FK `platform.tenants`, unique |
| `audience_mode` | VARCHAR | `'GUEST_AND_CUSTOMER'` \| `'CUSTOMER_ONLY'`, NOT NULL DEFAULT `'GUEST_AND_CUSTOMER'` |
| `questions` | JSONB | NOT NULL DEFAULT `'[]'` — array, ≤20 entries, see shape below |
| `updated_at` | TIMESTAMPTZ | |

```typescript
interface LeadFormQuestion {
  id: string;              // uuid
  label: string;
  type: 'TEXT' | 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE';
  required: boolean;
  options?: string[];      // only for SINGLE_CHOICE / MULTIPLE_CHOICE, 2–10 entries
  order: number;
}
```

**Why JSONB, not a child table:** the question catalog is always read and written as one atomic unit by exactly one actor (the manager editing the form) — never queried or joined per-question. Same justification `hotsite_configs.layout` already uses for its module array; a child table here would be schema ceremony with no query pattern to justify it.

**Bounds, as the DB-expert flag:** 20 questions × 10 options is a small, fully bounded payload (worst case a few KB) — safe to fetch on every `/[slug]/lead-form` page load with no pagination concerns.

### `platform.lead_form_submissions` (new table)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK (uuidv7) |
| `tenant_id` | UUID | NOT NULL, FK `platform.tenants` |
| `customer_id` | UUID | NULLABLE — UUID-only cross-context reference, no FK. Set whenever the submitter was authenticated, in *either* audience mode |
| `name` | VARCHAR | NOT NULL |
| `email` | VARCHAR | NOT NULL — validated via the existing `Email` VO |
| `phone` | VARCHAR | NOT NULL — validated via the existing `PhoneNumber` VO |
| `answers` | JSONB | NOT NULL — array of `{questionId, questionLabel, questionType, answerValue}` (full snapshot, see §4) |
| `submitted_at` | TIMESTAMPTZ | NOT NULL DEFAULT `now()` |
| `expires_at` | TIMESTAMPTZ | NOT NULL — computed once at insert from the tenant's `retentionMonths` at that moment |
| `ip_address` | VARCHAR | NOT NULL — abuse-investigation trail, also the rate-limit key |

**Indexes:**
- `(tenant_id, submitted_at DESC)` — paginated Leads Submissions list, and the month-range CSV export query (`WHERE tenant_id = ? AND submitted_at >= ? AND submitted_at < ?`)
- `(tenant_id, expires_at)` — daily retention purge

### Tenant settings additions (`settings.leadForm`)

| Key | Type | Default | Written at tenant creation? | Description |
|---|---|---|---|---|
| `retentionMonths` | integer | 6 | **Yes** — normal per-tenant pattern | Bounds 1–24. Manager-editable via UC-026 |
| `maxSubmissionsPerDay` | integer | 100 | No — code constant, chatbot-style deviation | Tenant-wide daily submission cap |
| `maxSubmissionsPerIpPerDay` | integer | 3 | No — code constant, chatbot-style deviation | Per-visitor daily cap |

The two caps follow `settings.chatbot`'s deliberate deviation (`docs/21-TENANTS_SETTINGS_SCHEMA.md` §7): they're platform-protecting, meant to stay uniform, and resolved `tenant.settings.leadForm?.X ?? DEFAULT_X` at read time so a platform-wide tuning is a one-line code change, not a migration. `retentionMonths` is the opposite — genuinely per-tenant, so it gets the normal default-at-creation treatment.

### Cloudflare Turnstile

Platform-wide, single Ikaro Cloudflare account (not per-tenant, per the "we already have the keys" framing) — env vars, never a tenant-settings field, same rationale `CHATBOT_GLOBAL_DAILY_SPEND_LIMIT_USD` already established for platform-protecting config that must change fast without a deploy touching tenant data:
- `TURNSTILE_SECRET_KEY` — BFF-only, used in the server-side `siteverify` call
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — public by Cloudflare's own design, baked into the Next.js build

**Open verification item, flagged rather than silently assumed:** confirm the exact `NEXT_PUBLIC_*` env var wiring convention against `docs/22-TECH_STACK_DECISIONS.md`/existing `apps/web` env config before implementation — not verified during this discovery.

## 7. New scheduled job

**Daily retention purge**, same shape as `ExpirePointsJob` (`docs/02-DOMAIN_MODEL.md`): GCP Cloud Scheduler → Pub/Sub trigger → handler deletes `lead_form_submissions` rows where `expires_at < now()`. A `POST /cron/lead-form-retention` endpoint mirrors the existing `POST /cron/loyalty-expiry` for local/manual triggering (M17-S03 precedent).

## 8. Candidate use cases

### CAND-01: Manager Configures the Lead Form Module

- **Actor:** MANAGER
- **Preconditions:** Manager is authenticated and on the hotsite editor (`/dashboard/settings/hotsite`).
- **Trigger:** Manager opens the `LEAD_FORM` module's config panel (adds it to the layout, or edits an existing one).
- **Main Flow:**
  1. Manager toggles the module `enabled` flag and sets teaser copy (title, subtitle, CTA label) — same pattern as every other module's admin form.
  2. Manager sets `audienceMode`: "Visitantes e clientes" (`GUEST_AND_CUSTOMER`) or "Somente clientes logados" (`CUSTOMER_ONLY`).
  3. Manager adds a question: picks a type (free text / single-choice / multiple-choice), types a label, marks required or not, and — for choice types — adds 2–10 options. A small constants-file catalog of starter question templates (e.g. "Qual serviço te interessa?", "Melhor horário para contato") is offered as a starting point but every question stays freely editable.
  4. Manager repeats step 3 up to 20 questions, reordering as needed.
  5. Manager saves. `lead_form_configs` upserted.
- **Alternative Flows:**
  - **A1: 20-question cap reached** → "Adicionar pergunta" disabled with an inline note; existing questions can still be edited/removed.
  - **A2: Choice-type question with < 2 options** → blocked on save: "Adicione pelo menos 2 opções."
  - **A3: Empty question label** → blocked on save.
  - **A4: Manager removes a question that already has submissions** → allowed; a confirmation dialog explains existing submissions keep their own copy of the question (per the snapshot design in §4) and won't be affected.
  - **A5: Manager disables the module entirely** → teaser stops rendering on the hotsite; `/[slug]/lead-form` returns the same "unavailable" treatment `app/[slug]/page.tsx` already uses for a disabled/unpublished module; existing submissions and config are preserved, not deleted.
- **Postconditions:** `lead_form_configs` row reflects the new config; teaser section in `hotsite_configs.layout` updated.
- **Events Triggered:** none (config change, not a domain event per current convention — matches how other module config edits behave).

### CAND-02: Visitor Sees the Lead Form Teaser on the Hotsite

- **Actor:** Guest | Customer
- **Preconditions:** `LEAD_FORM` module `enabled: true` in the tenant's manifest `layout`.
- **Trigger:** Visitor scrolls to the module's position in page order.
- **Main Flow:**
  1. `LeadFormModule` server component renders the teaser (title/subtitle/CTA), branded via `var(--ba-*)`, same shape as `BookingCtaModule`.
  2. Visitor clicks the CTA → navigates to `/[slug]/lead-form`.
- **Alternative Flows:**
  - **A1: Module `enabled: false`** → not rendered in the layout loop, same generic behavior as any disabled module.
- **Postconditions:** none (read-only render).
- **Events Triggered:** none.

### CAND-03: Guest Submits the Lead Form

- **Actor:** Guest
- **Preconditions:** `audienceMode === 'GUEST_AND_CUSTOMER'`. Tenant hasn't exceeded `maxSubmissionsPerDay`. Visitor's IP hasn't exceeded `maxSubmissionsPerIpPerDay`.
- **Trigger:** Guest navigates to `/[slug]/lead-form` (directly or via the teaser CTA).
- **Main Flow:**
  1. Page fetches the live question catalog: `GET /public/platform/lead-form/:slug`.
  2. Guest fills mandatory name, email, phone, and any questions marked `required` (others optional).
  3. Guest completes the Turnstile challenge (widget auto-renders).
  4. Guest clicks "Enviar". Client sends `{ name, email, phone, answers[], turnstileToken }`.
  5. BFF verifies `turnstileToken` via Cloudflare `siteverify`.
  6. BFF checks `maxSubmissionsPerDay`/`maxSubmissionsPerIpPerDay` (IP from request).
  7. Backend validates required fields + `Email`/`PhoneNumber` VOs, creates `LeadFormSubmission` snapshotting each answer's question label/type, computes `expiresAt` from the tenant's current `retentionMonths`.
  8. `LeadFormSubmissionReceived` published.
  9. Guest sees a success confirmation.
- **Alternative Flows:**
  - **A1: Turnstile challenge fails/expires** → inline error, "Verificação de segurança expirou, tente novamente"; form data preserved.
  - **A2: Rate limit exceeded (tenant-wide or per-IP)** → `429`, friendly message: "Muitas solicitações no momento, tente novamente mais tarde."
  - **A3: Required question left blank** → inline validation, full form re-shown with the error highlighted (never just the errored section).
  - **A4: Invalid email/phone format** → VO validation error, same as guest booking's A1.
  - **A5: `audienceMode === 'CUSTOMER_ONLY'`** → this flow doesn't apply; see CAND-04 A1.
  - **A6: Module was disabled between teaser render and page load** → "unavailable" state, no form shown.
- **Postconditions:** `LeadFormSubmission` persisted, scoped to tenant, `customerId: null`.
- **Events Triggered:** `LeadFormSubmissionReceived` (`data.customerId: null`).

### CAND-04: Logged-In Customer Submits the Lead Form

- **Actor:** Customer
- **Preconditions:** Customer authenticated (JWT `role: CUSTOMER`). Same rate-limit preconditions as CAND-03.
- **Trigger:** Customer navigates to `/[slug]/lead-form`.
- **Main Flow:**
  1. Same as CAND-03 steps 1–2, except name/email/phone are **pre-filled from the `Customer` profile** (editable) — same "prefill from profile, allow override" spirit as UC-002's `pickupAddress` default, not UC-002's fully-hidden-field approach, since the user asked for visible autofill.
  2. Turnstile + submit, same as CAND-03 steps 3–8.
  3. Backend sets `customerId` on the submission from the JWT `sub`.
- **Alternative Flows:**
  - **A1: `audienceMode === 'CUSTOMER_ONLY'` and visitor is NOT authenticated** → redirected to a login-required state (reusing the existing `public-15-login-required.html` UX pattern from `multivertical-booking`, not a new invention) with a link to `../../../shared/login.html`-equivalent; after login, returns to `/[slug]/lead-form`.
  - **A2–A5:** same as CAND-03 A1–A4.
- **Postconditions:** `LeadFormSubmission` persisted with `customerId` set.
- **Events Triggered:** `LeadFormSubmissionReceived` (`data.customerId` set).

### CAND-05: Staff/Manager Views Leads Submissions

- **Actor:** STAFF | MANAGER
- **Preconditions:** Authenticated staff/manager session.
- **Trigger:** Clicks "Leads / Formulários" in the sidebar (new top-level nav item, own screen — not nested inside hotsite editing, per explicit request to mirror how bookings get their own screen).
- **Main Flow:**
  1. `GET /v1/tenants/lead-form/submissions?page=&pageSize=` — paginated, ordered `submitted_at DESC`.
  2. List renders one row per submission: name, email, phone.
  3. Staff/manager clicks a row → detail view: full name/email/phone + every question label + submitted answer, in question order, plus `submittedAt`.
- **Alternative Flows:**
  - **A1: No submissions yet** → empty state with a short explainer and a link back to the module config (if not yet enabled).
  - **A2: A submission's `answers` snapshot references a question no longer in the current config** → renders fine regardless, since the snapshot is self-contained (no live lookup needed) — this is exactly what §4's snapshot design guarantees.
- **Postconditions:** none (read-only).
- **Events Triggered:** none.

### CAND-06: Manager Exports a Month of Leads to CSV

- **Actor:** MANAGER
- **Preconditions:** At least one submission exists in the selected month; the selected month is still within the retention window (not yet purged).
- **Trigger:** Manager picks a year + month on the Leads Submissions screen and clicks "Exportar CSV".
- **Main Flow:**
  1. `GET /v1/tenants/lead-form/submissions/export?year=&month=` (MANAGER only).
  2. Backend queries `submitted_at` within `[year-month-01T00:00:00, next-month-01T00:00:00)` for the tenant, using the `(tenant_id, submitted_at DESC)` index.
  3. Streams a CSV (name, email, phone, one column per question label at the time of each submission — see note below, submittedAt).
  4. Browser downloads the file.
- **Alternative Flows:**
  - **A1: Selected month has zero submissions** → empty CSV (header row only) with an inline message before download, not a silent empty file.
  - **A2: Selected month falls outside the retention window (already purged)** → export blocked with an explanatory message rather than returning an empty/misleading file.
  - **A3: Different tenants' question sets differ month to month (manager edited questions mid-month)** → CSV columns are derived from the **union of question labels actually present in that month's submissions' snapshots**, not the current live config — consistent with §4's snapshot design; a submission missing a since-added question simply has a blank cell.
- **Postconditions:** none (read-only export).
- **Events Triggered:** none.

### CAND-07: Manager Configures the Retention Window

- **Actor:** MANAGER
- **Preconditions:** Manager on the tenant settings page (UC-026 pattern).
- **Trigger:** Manager edits the "Retenção de leads" field.
- **Main Flow:**
  1. Manager sets a value 1–24 months (default shown: 6).
  2. `PATCH /v1/tenants/settings` (existing endpoint, extended with `leadForm.retentionMonths`).
  3. Validated against the 1–24 bound; persisted.
- **Alternative Flows:**
  - **A1: Value outside 1–24** → validation error, same pattern as every other bounded tenant setting.
- **Postconditions:** `settings.leadForm.retentionMonths` updated. Per §4, this affects only **future** submissions' `expiresAt` — already-stored submissions keep the `expiresAt` computed at their own insert time.
- **Events Triggered:** none.

### CAND-08: System Purges Expired Submissions

- **Actor:** System (Cloud Scheduler cron)
- **Preconditions:** none — runs daily regardless of tenant activity.
- **Trigger:** GCP Cloud Scheduler → `ikaro-cron-leadform-retention` Pub/Sub topic (mirrors `ikaro-cron-loyalty-expiry`), daily.
- **Main Flow:**
  1. Handler deletes every `lead_form_submissions` row where `expires_at < now()`, using the `(tenant_id, expires_at)` index.
  2. `POST /cron/lead-form-retention` provides the same trigger locally/manually (M17-S03 precedent).
- **Alternative Flows:**
  - **A1: No expired rows** → no-op, idempotent.
- **Postconditions:** expired submissions permanently removed.
- **Events Triggered:** none (matches `ExpirePointsJob`'s own "no event on expiry" precedent).

## 9. Non-Goals / Out of scope (explicit — proactively suggested and declined, not silently dropped)

- **Per-submission email/webhook notification to the manager.** MVP is the dashboard list + CSV export only. Flagged as an obvious fast-follow, not built now.
- **Plan-tier gating.** Available to every tenant, like every other hotsite module — confirmed explicitly.
- **Day-level CSV export granularity.** Export is month-only (year + month picker), per explicit request.
- **Manual edit or delete of an individual submission by the manager.** View + export only; the only deletion path is the retention cron.
- **LGPD erasure-before-expiry.** Raised during discovery (a customer asking to have their submission erased before the retention window naturally expires has no path today) — **explicitly deferred at the user's direction, not an oversight.** Worth a deliberate look before this ships broadly.
- **CRM integration / lead scoring / any downstream marketing automation.** Out of scope entirely for this discovery.

## 10. Historical questions & decisions

**2026-08-22 — Framing round 1:**
- Q: Is this "lead capture" or an anonymous "pulse" survey — the original brief said identity wasn't important, which conflicts with "lead form." → **A: It's a real lead-capture tool. Name, email, and phone are mandatory on every submission.**
- Q: MVP scope, plan-tier gating? → **A: Configurable like every other module, available to every tenant.**
- Q: Manager-authored questions vs. a fixed catalog? → **A: Manager freely authors questions (checkbox / radio button / free text), with a light, non-deep preconfigured-question catalog (constants file) as a starting point. Max 20 questions per form, none mandatory to use, each individually required-or-not.**
- Q: Where do submissions surface? → **A: New top-level sidebar item "Leads Submissions" for logged staff — simple paginated list (name/email/phone), most-recent-first, click-through to full detail. Later corrected to be its own dedicated screen (not inline in the hotsite editor), mirroring how Bookings gets its own screen.**
- Q: Retention? → **A: Default 6 months, manager-configurable via tenant settings, capped at 2 years (24 months).**
- Q: CSV export? → **A: Yes, required. Later refined: manager exports a single calendar month at a time (year + month picker), not an arbitrary day range.**
- Q: Rate limiting beyond captcha? → **A: Yes.**
- Q: Captcha provider? → **A: Cloudflare Turnstile, recommended by the discovery given the tenant already has a Cloudflare account/keys — also positions this as the first real integration that could later close `TD08` AUD-040 for guest booking.**

**2026-08-22 — Framing round 2 / correction:**
- Correction: "No existing module accepts public visitor input" was inaccurate — **guest booking (UC-001) already accepts anonymous public writes with mandatory contact fields.** This became the closest real precedent for the mandatory-contact-fields design, not `CONTACT`'s config-only split.
- Q: Should a logged-in customer's fields autofill from their profile? → **A: Yes, autofill.**
- Q: Does the audience need to be configurable (guest-allowed vs. customer-only)? → **A: Yes — manager chooses per form: guests + logged customers, or logged customers only.**
- Q: CSV export scope (filtered range vs. everything)? → **A: Resolved by the month-picker answer above — one calendar month per export, capped 1–12 within a selectable year.**

**2026-08-22 — LGPD scope call:**
- **A: Explicitly out of scope for this discovery** — see Non-Goals.

## 11. Promotion-readiness self-check

- ✅ Resolved-decisions log present (§10)
- ✅ CAND-format use cases (8) with real alternative-flow coverage, not just happy path
- ✅ Data model passed a DB-expert critique pass (aggregate-boundary check, snapshot justification, index-to-query mapping, JSONB-vs-table justification)
- ✅ Prototype folder with full-state coverage on the two novel/high-risk screens (public submission form, question-builder config), proportional coverage elsewhere
- ✅ Explicit Non-Goals section, including one deliberately user-declined item (LGPD)
- ✅ Cross-cutting infra (Turnstile, new cron, new tenant-settings category) named explicitly, not buried

---

**Next step:** `/discovery-to-milestone docs/discovery/lead-form-module/lead-form-module.md` when ready to promote into a real, dependency-sequenced milestone.
