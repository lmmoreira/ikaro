# Dev Notes — MANAGER: Configure the Lead Form Module

**Journey:** MANAGER — Configure the Lead Form Module
**UCs:** UC-037
**Prototype:** `manager/prototypes/lead-form/`
**Status:** ❌ Gap — nothing built yet. Promoted from `docs/discovery/lead-form-module/prototype/` (M20 milestone, `docs/04-USE_CASES.md` UC-037). Full domain/data-model rationale: `docs/discovery/lead-form-module/lead-form-module.md`.

---

---

## Overview

A per-module drill-down config panel for the new `LEAD_FORM` hotsite module (10th module type — same treatment `CHATBOT` got as the 9th, `01e-module-config-chatbot.html`). Reached from `../hotsite/01-hotsite-editor.html`'s Layout tab. Question add/edit/remove is fully **inline** on this one page via expandable `<details>` cards — no separate screen per question, so a manager building up to 20 questions never leaves the page.

**"Aplicar" is one atomic save, not two (post-review redesign, 2026-08-24):** teaser fields (title/subtitle/ctaLabel/variant/bgStyle) and `audienceMode`/`questions[]` all go in a single `PATCH /v1/tenants/lead-form/config` request, saved in one backend transaction spanning `HotsiteConfig`'s layout entry and `LeadFormConfig` (see `docs/02-DOMAIN_MODEL.md` § `LeadFormConfig` "Cross-aggregate save"). An earlier draft of this screen made two independent, unsynchronized calls — replaced because a partial failure could leave the manager's edit half-applied. The module's `enabled` toggle is not part of this save at all — it's a separate, pre-existing control on the Layout tab row itself (`../hotsite/01-hotsite-editor.html`), still going through the existing `PATCH /v1/tenants/hotsite` on its own.

**New sidebar/bottom-nav item:** "Leads" — added to `MAIN_NAV_KEYS` (visible to STAFF and MANAGER alike, same tier as Agenda/Horários/Serviços/Fidelidade), not under "Somente Gerente" (viewing submissions doesn't require MANAGER; editing the module config still does, enforced by the BFF's `@Roles('MANAGER')` on `PATCH /v1/tenants/lead-form/config`, not by nav visibility). **Gated, not unconditional (added during the post-review redesign):** the item only renders when `GET /v1/tenants/lead-form/status` reports `enabled: true` for this tenant — see `../leads/dev-notes.md` for the full mechanism (`apps/web/app/dashboard/layout.tsx` fetches it server-side).

---

## File map

| File | Status | Role |
|---|---|---|
| `apps/web/app/dashboard/hotsite/lead-form/page.tsx` | ❌ Gap | Manager config panel route |
| `apps/web/features/platform/components/hotsite/modules/LeadFormConfigPanel.tsx` | ❌ Gap | The panel component — same `ModuleConfigPanelProps` contract every other module panel (Hero, Chatbot, ...) already uses |
| `apps/web/shells/dashboard/components/Sidebar.tsx` | ❌ Gap (extend) | Add "Leads" to `MAIN_NAV_KEYS`, conditionally rendered on a `leadFormEnabled` prop |
| `apps/web/app/dashboard/layout.tsx` | ❌ Gap (extend) | Fetches `GET /v1/tenants/lead-form/status` server-side — see `../leads/dev-notes.md` |

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
PATCH /v1/tenants/hotsite                      (existing — module `enabled` toggle ONLY, separate from "Aplicar" below)
GET  /v1/tenants/lead-form/config              STAFF|MANAGER
PATCH /v1/tenants/lead-form/config             MANAGER only — ONE call for "Aplicar":
  body { title, subtitle?, eyebrow?, ctaLabel, variant?, backgroundImageUrl?, backgroundImagePosition?,
         bgStyle?, audienceMode, questions[] }
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

## Mobile nav — open item

Adding "Leads" as a 5th nav item (when the module is enabled — see the gating note in Overview) grows the bottom-nav from 4 icons + "Mais" to 5 + "Mais". This prototype keeps all 5 visible rather than pushing "Leads" into the manager-only bottom sheet (it isn't manager-only). Whether 5 + Mais is the right mobile density, or whether a lower-priority existing item should move into an overflow instead, is a real UX call for the implementing story to make — not resolved here. When the module is disabled, the bottom-nav simply stays at its current 4 + "Mais" — no layout shift to account for, since the item is absent, not merely hidden/disabled.

## Known limitations (flagged, not silently dropped)

- No manual reordering drag-and-drop shown in the prototype (the `⠿` handle exists visually on the hotsite editor's module row, matching every other module — question-level reordering within this panel isn't separately prototyped).
