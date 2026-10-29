# MANAGER — Onboarding Preset Wizard (New-Tenant Bootstrap)

**Actor(s):** MANAGER  
**Goal:** Bootstrap a brand-new, empty tenant's first `Resource`/`Service` graph from a business-model preset, in business language rather than the raw domain model  
**UCs covered:** UC-075 (Presets A/B/C/G — appointment-only, `M24-S21`; Presets D/E/F SESSION completion, `M24-S05`)  
**Status:** Draft — not yet shipped. Assigned to M24: `M24-S21` (backend + BFF, Presets A/B/C/G), `M24-S05` (SESSION presets D/E/F), `M24-S22` (wizard frontend); moved from M23-S10/S15.

> Promoted from `docs/discovery/multivertical-booking/multivertical-booking_ONBOARDING_PRESETS.md` and `multivertical-booking_USECASES.md` (CAND-51) via `/discovery-to-milestone`. This wizard is the **only** path allowed to create an empty tenant's first resource/service graph — ordinary resource/service CRUD (UC-045, UC-050 etc.) only makes sense once bootstrap has run. See `docs/DOMAIN_MODEL.md` and `docs/discovery/multivertical-booking/multivertical-booking_ONBOARDING_PRESETS.md` for the full preset taxonomy (7 presets, 13 underlying scheduling models) this wizard translates into plain business questions.

## Flow

```mermaid
flowchart TD
    classDef gap stroke:#f00,stroke-dasharray: 5 5,fill:#fee

    Start(["New tenant, no scheduling configuration"]) --> Choose["❓ GAP: /dashboard/onboarding<br/>Etapa 1 — Escolher preset (01-onboarding-preset)"]
    Choose -->|"Auto/Estética, Salão/Barbearia,<br/>Sala/Coworking (Presets A/B/C/G)"| Questions["Etapa 2 — Perguntas mínimas do preset"]
    Choose -.->|"Estúdio de turmas, Box/Academia,<br/>Estúdio misto (Presets D/E/F)"| SessionNote["Inert until Cluster 4 ships<br/>ClassScheduleTemplate"]
    Questions --> Review["Etapa 3 — Revisão em linguagem de negócio"]
    Review -->|"Confirma"| Bootstrap(("POST /onboarding/bootstrap"))
    Bootstrap -->|"201"| Done["Configuração criada — recursos,<br/>serviços e horários prontos"]
    Bootstrap -->|"422 resposta inválida"| Questions
    Bootstrap -->|"falha em qualquer etapa"| Error["❓ GAP: rollback completo<br/>(01b-onboarding-preset-erro)"]
    Error --> Choose
```

## Pages referenced

| Page / Route | Component | Story | Status |
|---|---|---|---|
| `/dashboard/onboarding` | `OnboardingPresetWizard` | — | ❓ GAP |

## BFF calls in this flow

| Call | When | Roles |
|---|---|---|
| `POST /v1/onboarding/bootstrap` | Wizard confirms preset + answers | MANAGER |

Full request/response shapes: `docs/API_CONTRACTS.md` § Tenant Onboarding Bootstrap.

## Prototype

Folder: `manager/prototypes/onboarding/` — relocated from `docs/discovery/multivertical-booking/prototype/manager-14-onboarding-preset.html` / `manager-14b-onboarding-preset-erro.html`.

| File | Screen | UC | Status |
|---|---|---|---|
| `01-onboarding-preset.html` | Preset choice → minimum questions → review (Estúdio de turmas example shown) | UC-075 | ❓ GAP |
| `01b-onboarding-preset-erro.html` | Bootstrap failure — full rollback | UC-075 A3 | ❓ GAP |

**Not yet prototyped:** the appointment-only presets (A/B/C/G) this cluster actually delivers — the discovery's own worked example walks the SESSION preset (D, Estúdio de turmas) end-to-end; the implementing story needs an equivalent worked example for at least one appointment-only preset (e.g. Preset A, Auto/Estética) before this is implementation-ready.

## Open questions / gaps

- [ ] Billing (planned, optional): a tenant created by self-signup also sees the trial banner and a "Confirmar plano" step in this wizard (UC-129, `docs/USE_CASES.md`); delivered only if `M24-S22` ships. No second onboarding is introduced; see `journeys/manager/billing.md`.
- [ ] Stories exist in `plan/M24-MULTIVERTICAL-CLASSES-SESSIONS.md` (`M24-S21`, `M24-S05`, `M24-S22`) — each needs `/story-discovery` before implementation.
- [ ] This cluster only delivers Presets A/B/C/G (appointment-only) — the prototype's worked example is Preset D (SESSION), which is inert until Cluster 4 ships. The implementing story must either re-target the worked example to an appointment preset or explicitly scope the SESSION branch out.
- [ ] Final preset copy/labels are explicitly deferred to a copy round per `multivertical-booking_ONBOARDING_PRESETS.md` §6 — not a blocker for implementation, but not final either.
