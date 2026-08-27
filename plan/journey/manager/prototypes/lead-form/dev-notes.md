# Dev Notes — MANAGER: Configure the Lead Form Module

**Journey:** MANAGER — Configure the Lead Form Module
**UCs:** UC-037
**Prototype:** `manager/prototypes/lead-form/`
**Status:** ✅ Shipped M20-S08. Promoted from `docs/discovery/lead-form-module/prototype/` (M20 milestone, `docs/04-USE_CASES.md` UC-037). Full domain/data-model rationale: `docs/discovery/lead-form-module/lead-form-module.md`.

---

---

## Overview

A per-module drill-down config panel for the new `LEAD_FORM` hotsite module (10th module type — same treatment `CHATBOT` got as the 9th, `01e-module-config-chatbot.html`). Reached from `../hotsite/01-hotsite-editor.html`'s Layout tab. Question add/edit/remove/reorder is fully **inline** on this one page via expandable `<details>` cards — no separate screen per question, so a manager building up to 20 questions never leaves the page. Reordering reuses the existing `@dnd-kit` implementation used by the hotsite Layout tab and supports keyboard interaction.

**"Aplicar" remains a temporary draft action:** it commits the panel's complete edit to the existing in-memory `HotsiteEditor` draft and makes no network request. When the manager clicks "Publicar", teaser fields (title/subtitle/ctaLabel/variant/bgStyle) and `audienceMode`/`questions[]` go in a single consolidated `PATCH /v1/tenants/hotsite` request (folded into the existing hotsite-content endpoint at M20-S08 — `audienceMode`/`questions` are two optional extra fields on it, not a separate endpoint), saved in one backend transaction spanning `HotsiteConfig`'s layout entry and `LeadFormConfig` (see `docs/02-DOMAIN_MODEL.md` § `LeadFormConfig` "Cross-aggregate save"). An earlier draft of this screen made two independent, unsynchronized calls — replaced because a partial failure could leave the manager's edit half-applied. The module's `enabled` toggle goes through this same `PATCH /v1/tenants/hotsite` endpoint too, but as a separate, pre-existing action on the Layout tab row itself (`../hotsite/01-hotsite-editor.html`) — not part of this panel's "Aplicar"/"Publicar" flow.

**New sidebar/bottom-nav item:** "Leads" — added to `MAIN_NAV_KEYS` (visible to STAFF and MANAGER alike, same tier as Agenda/Horários/Serviços/Fidelidade), not under "Somente Gerente" (viewing submissions doesn't require MANAGER; editing the module config still does, enforced by the BFF's `@Roles('MANAGER')` on `PATCH /v1/tenants/hotsite`, not by nav visibility). **Gated, not unconditional (added during the post-review redesign):** the item only renders when `GET /v1/tenants/lead-form/status` reports `enabled: true` for this tenant — see `../leads/dev-notes.md` for the full mechanism (`apps/web/app/dashboard/layout.tsx` fetches it server-side).

---

## File map

| File | Status | Role |
|---|---|---|
| `apps/web/app/dashboard/hotsite/page.tsx` + existing editor view | ✅ Existing | In-place manager config flow; no dedicated route |
| `apps/web/features/platform/components/hotsite/modules/LeadFormConfigPanel.tsx` | ✅ Shipped M20-S08 | The panel component — same `ModuleConfigPanelProps` contract every other module panel (Hero, Chatbot, ...) already uses |
| `apps/web/shells/dashboard/components/Sidebar.tsx` | ❌ Gap (S10) | Add "Leads" to the existing mobile "Mais" sheet, conditionally rendered on a `leadFormEnabled` prop |
| `apps/web/app/dashboard/layout.tsx` | ❌ Gap (S10) | Fetches `GET /v1/tenants/lead-form/status` server-side — see `../leads/dev-notes.md` |

---

## Prototype variants — alternate states

| Screen | Scenario | Notes |
|---|---|---|
| `01-config.html` | Happy path — module toggle, audience mode, teaser copy, inline question list | |
| `01b-config-max-questions.html` | 20/20 questions — "+ Adicionar pergunta" disabled with inline explainer (UC-037 A1) | |
| `01c-config-validation-error.html` | Choice-type question with < 2 options, blocked on Aplicar (UC-037 A2) | |
| `01d-remove-question-confirm.html` | Removing a question that already has submissions — confirmation dialog explaining the snapshot behavior (UC-037 A4) | Mirrors `../equipe/03-deactivate-confirm.html`'s pattern; reached from `01-config.html`'s first question ("Qual serviço te interessa?", seeded with 18 submissions) |

Not prototyped as a separate screen (small, same-page state per README's "minor conditional content stays commented-out" rule): empty question label (UC-037 A3).

---

## BFF calls

```
GET   /v1/tenants/lead-form/config             MANAGER only — read-only; questions include `hasSubmissions`
PATCH /v1/tenants/hotsite                      MANAGER only — ONE consolidated call for BOTH the
  Layout tab's `enabled` toggle AND this panel's "Publicar" (folded together at M20-S08 — the
  earlier separate PATCH /v1/tenants/lead-form/config endpoint was removed, not just deprecated):
  body { branding?, layout?, seo?, audienceMode?, questions? } — this screen's "Publicar" sends
  layout: [{ type: 'LEAD_FORM', enabled, data: { title, subtitle?, eyebrow?, ctaLabel, variant?,
  backgroundImageUrl?, backgroundImagePosition?, bgStyle? } }], audienceMode, questions[]
  Saved atomically in one backend transaction (HotsiteConfig's layout entry + LeadFormConfig).
  400 PLATFORM_LEAD_FORM_QUESTION_LIMIT_REACHED   — > 20 questions
  400 PLATFORM_LEAD_FORM_QUESTION_OPTIONS_INVALID — a choice-type question with < 2 or > 10 options
  400 GENERIC_FIELD_REQUIRED                       — a question with an empty label
GET  /v1/tenants/lead-form/status              STAFF|MANAGER — { enabled: boolean }, powers the
  gated "Leads" sidebar item (see ../leads/dev-notes.md), not called from this screen itself
```

Full contract: `docs/14-API_CONTRACTS.md` § Lead Form Admin Config.

## Validation (client-side)

| Field | Rule | Error message |
|---|---|---|
| `title` / `ctaLabel` | min 1 char | "Informe o título." / "Informe o texto do botão." |
| a question's `label` | min 1 char | "Informe o texto da pergunta." |
| a choice-type question's `options` | 2-10 entries | "Adicione entre 2 e 10 opções." |
| adding a 21st question | blocked, button disabled | "Você atingiu o limite de 20 perguntas." |

All panel copy belongs under `dashboard.hotsitePage.layout.panels.leadForm` in both
`packages/i18n/locales/pt-BR/web.json` and `packages/i18n/locales/en/web.json`; no visible string is hardcoded.

## Mobile nav — open item

The existing bottom-nav icons remain unchanged. When the module is enabled, "Leads" is exposed inside the existing "Mais" sheet rather than added as a new bottom-nav icon. When the module is disabled, it is absent from the sheet as well.

## Known limitations (flagged, not silently dropped)

- Question-level drag-and-drop is an implementation addition requested by M20-S08; it should follow the existing hotsite Layout tab's `@dnd-kit` pattern and preserve keyboard accessibility.
