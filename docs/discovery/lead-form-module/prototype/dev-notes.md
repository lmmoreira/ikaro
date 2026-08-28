# Dev Notes — Lead Form Hotsite Module (discovery prototype)

**Status:** Discovery-stage, illustrative — same convention as `multivertical-booking`'s own discovery prototype. Lighter than a `plan/journey/` prototype: full state coverage is applied only to the two genuinely novel/high-risk screens (public submission form, manager question builder); the remaining screens (list/detail/export/settings) cover the happy path plus their single most important alternate state. Purpose is to validate direction and surface IA/data-model questions, not to be implementation-ready as-is.

Full domain model, data model, and CAND-01..08 use cases: `../lead-form-module.md`.

## What's real vs. invented here

- **Real:** `--ba-*` tokens (default values, unmodified), dashboard shell (sidebar/topbar/bottom-nav), card/form/badge/detail-layout conventions — all copied from `plan/journey/shared/`, referenced directly (`../../../../plan/journey/shared/tokens.css`), never duplicated locally, per `plan/journey/README.md`'s own rule.
- **Real, reused directly rather than re-mocked:** the manager screens reuse the actual, already-shipped hotsite-editor pattern from `plan/journey/manager/prototypes/hotsite/01-hotsite-editor.html` (module list with toggle + "Configurar" drill-down) and `01e-module-config-chatbot.html` (per-module config screen shell: topbar back-link, sidebar, `detail-layout`/`detail-aside`, `pill-options`, `settings-elsewhere-note`). `manager-00-hotsite-layout-tab-with-lead-form.html` is an **illustrative-only** copy of just the Layout tab showing the one new module row this feature adds — it does not modify the real file (this skill's HARD RULE forbids writing into `plan/journey/`), and every "Configurar" link on it except the new row points directly at the real files. `manager-01-lead-form-config.html` follows `01e`'s exact shell, with one addition: question add/edit/remove is fully **inline** on the same page via expandable `<details>` cards — corrected from an earlier draft that implied navigating to separate screens per question, which would have forced a manager back-and-forth across up to 20 questions instead of the single-screen editing every other module config panel already offers.
- **Second correction (shell completeness):** `manager-02b`/`manager-03`/`manager-04`/`manager-05` were first drafted with only a bare `dashboard-topbar` + `dashboard-body`, no sidebar — checked against the real drill-down precedent (`plan/journey/manager/prototypes/equipe/04-staff-detail-edit.html`) and corrected: every dashboard screen, including a click-through detail page, keeps the **full sidebar** (desktop nav never disappears on a drill-down); only the **bottom-nav** is dropped on a true drill-down (`manager-03`/`04`/`05`, one level below the list/config screens), while `manager-02b` — same tier as `manager-02`, not a drill-down — keeps it. `manager-05`'s back-link was also pointed at the real `configuracoes/01-settings-form.html` instead of a placeholder `#`.
- **Invented:** tenant "AutoWash Pro" and its sample data (lead names/emails/questions) — chosen as Ikaro's own flagship-vertical example tenant (used throughout `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`'s worked examples), not a real client. Branding tokens deliberately left at their shared-file defaults (blue/Inter/rounded) rather than invented custom hex values, per the "never invent token values" rule — a real per-tenant palette only exists once a tenant is actually provisioned.
- **New nav item, not in today's IA:** "Leads" — top-level sidebar item, visible to both STAFF and MANAGER (CAND-05's actor is `STAFF | MANAGER`), same tier as Agenda/Horários/Serviços/Fidelidade, not under "Somente Gerente" (config editing stays manager-only; viewing the list does not).
- **New route, not in today's IA:** `/[slug]/lead-form` — a full dedicated public page, sibling to `/[slug]/booking`, following the exact same "hotsite teaser → dedicated page" pattern `BOOKING_CTA`/`/[slug]/booking` already established.

## Coverage scope (why some screens are lighter)

Per this discovery's own UX-lens finding: the public submission form and the manager question-builder are the two places where real product/UX risk lives (bot abuse, validation completeness, a non-technical manager configuring up to 20 questions unsupervised). Every meaningful state for those two is prototyped as its own clickable screen. The list/detail/export/settings screens are comparatively low-risk, standard dashboard CRUD patterns already well-established elsewhere in this codebase (`manager-09-matriculas.html`, `manager-13-service-booking-policies.html` in the `multivertical-booking` discovery) — only their single most useful alternate state (empty list) is prototyped; export's two minor alternate states (empty month, purged month) are documented as inline HTML comments in `manager-04-leads-export.html` rather than separate screens, since they're small copy/disabled-state changes on the same layout, not a distinct interaction.

## File map (all GAP — nothing here exists today)

| File | Status | Notes |
|---|---|---|
| `apps/web/shells/hotsite/components/LeadFormModule.tsx` | ❌ Gap | Teaser section, mirrors `BookingCtaModule` |
| `apps/web/app/[slug]/lead-form/page.tsx` | ❌ Gap | Dedicated public form page |
| `apps/web/app/dashboard/settings/hotsite/lead-form/page.tsx` | ❌ Gap | Manager config panel |
| `apps/web/app/dashboard/leads/page.tsx` | ❌ Gap | Leads Submissions list |
| `apps/web/app/dashboard/leads/[id]/page.tsx` | ❌ Gap | Submission detail |
| `apps/web/app/dashboard/leads/export/**` (or a modal off the list page) | ❌ Gap | CSV export |
| `packages/types/src/hotsite.ts` | ❌ Gap | Add `LEAD_FORM` to `HotsiteModuleType`, add `LeadFormModuleData` |
| `apps/backend/src/contexts/platform/domain/lead-form-config.aggregate.ts` | ❌ Gap | New aggregate |
| `apps/backend/src/contexts/platform/domain/lead-form-submission.aggregate.ts` | ❌ Gap | New aggregate |

## BFF calls sketched (illustrative — verify exact shapes during implementation)

```
GET  /public/platform/lead-form/:slug
  Response: { audienceMode, questions: [{id,label,type,required,options?}] }

POST /public/platform/lead-form/:slug/submissions
  Body: { name, email, phone, answers: [{questionId, value}], turnstileToken }
  Turnstile verification via Cloudflare siteverify (originally at the BFF; moved to the backend
  in M20-S14 — the BFF's ALL_TRAFFIC egress has no Cloud NAT, so its own outbound siteverify call
  had no route out).
  429 on rate-limit breach (maxSubmissionsPerDay / maxSubmissionsPerIpPerDay).

GET   /v1/tenants/lead-form/config              (MANAGER)
PATCH /v1/tenants/lead-form/config              (MANAGER) — SUPERSEDED at implementation (M20-S08):
  folded into the existing PATCH /v1/tenants/hotsite as two optional extra fields
  (audienceMode?, questions?) instead of its own endpoint; see docs/14-API_CONTRACTS.md
  § Hotsite Admin Management for the current contract. GET stays its own endpoint as proposed.
GET   /v1/tenants/lead-form/submissions?page=&pageSize=   (STAFF|MANAGER)
GET   /v1/tenants/lead-form/submissions/:id                (STAFF|MANAGER)
GET   /v1/tenants/lead-form/submissions/export?year=&month= (MANAGER)  — CSV stream
PATCH /v1/tenants/settings   — extended with leadForm.retentionMonths (existing UC-026 endpoint)
```

**Not verified during this discovery — flag before implementing, don't silently assume:**
- Exact `NEXT_PUBLIC_TURNSTILE_SITE_KEY` env-var wiring convention against `docs/22-TECH_STACK_DECISIONS.md` / existing `apps/web` env config.
- Whether `lead_form_configs`/`lead_form_submissions` should be separate NestJS modules or live inside the existing `platform` module — check current `contexts/platform/` structure at implementation time.
- Whether CSV export should stream (`res.pipe`) or buffer-and-return for the expected submission volume per tenant per month.

## Validation (public form)

| Field | Rule | Error message |
|---|---|---|
| `name` | min 1 char | "Informe seu nome." |
| `email` | valid email (`Email` VO) | "Informe um e-mail válido." |
| `phone` | valid phone (`PhoneNumber` VO) | "Informe um telefone válido." |
| any `required: true` question | must have a non-empty answer | "Selecione uma opção." / "Este campo é obrigatório." |
| `turnstileToken` | valid per Cloudflare `siteverify` | "Verificação de segurança expirou, tente novamente." |

## States

**Public form:** idle → loading (fetch questions) → filled → submitting → validation-error / captcha-error / rate-limited / success.
**Manager config:** idle → editing → validation-error (per-question) → saving → saved.

## Known limitations (flagged, not silently dropped)

- No manual delete/edit of a single submission — retention cron is the only deletion path (see discovery doc §9 Non-Goals).
- No LGPD erasure-before-expiry path — explicitly out of scope per the discovery's historical-decisions log.
- No per-submission notification (email/webhook) to the manager for MVP — dashboard + CSV only.
